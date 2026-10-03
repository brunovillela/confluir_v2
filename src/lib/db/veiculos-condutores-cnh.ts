import "server-only"

import { esquemaAusente, hojeSP, nomesDosUsuarios, texto } from "@/lib/db/comum"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Histórico de CNH e unificação de condutores repetidos (a mesma pessoa com
 * dois usuários — e-mail institucional e pessoal, herança do Bubble).
 * Ver supabase/veiculos-condutores-cnh.sql.
 */

export const AVISO_SQL_CNH =
  "Histórico de CNH e unificação usam tabelas novas — rode supabase/veiculos-condutores-cnh.sql no Supabase."

type DadosCnh = {
  cnh_numero: string | null
  cnh_categoria: string | null
  cnh_validade: string | null
  cnh_arquivo_url: string | null
}

/**
 * Chamado ao salvar o cadastro: se número, categoria ou validade mudaram, a
 * CNH anterior vai para o histórico. Sem o SQL, não registra (e não falha).
 */
export async function guardarCnhAnterior(
  condutorId: string,
  anterior: DadosCnh,
  nova: Omit<DadosCnh, "cnh_arquivo_url">,
  autorId: string | null
): Promise<void> {
  const tinha = anterior.cnh_numero || anterior.cnh_validade
  const mudou =
    (anterior.cnh_numero ?? "") !== (nova.cnh_numero ?? "") ||
    (anterior.cnh_categoria ?? "") !== (nova.cnh_categoria ?? "") ||
    (anterior.cnh_validade ?? "") !== (nova.cnh_validade ?? "")
  if (!tinha || !mudou) return
  const admin = await createAdminClient()
  const { error } = await admin.from("veiculos_condutores_cnh").insert({
    emp_proprietaria_id: await tenantAtual(),
    condutor_id: condutorId,
    ...anterior,
    origem: "renovacao",
    registrado_por_id: autorId,
  })
  if (error && !esquemaAusente(error)) console.error("Falha ao guardar a CNH anterior:", error.message)
}

// ── Histórico ────────────────────────────────────────────────────────────────

export type CnhAnterior = {
  id: string
  numero: string | null
  categoria: string | null
  validade: string | null
  vencida: boolean
  arquivoUrl: string | null
  origem: "renovacao" | "unificacao"
  /** Unificação: e-mail do usuário de onde a CNH veio. */
  origemEmail: string | null
  registradoPor: string | null
  registradoEm: string
}

export async function historicoDeCnh(condutorId: string): Promise<CnhAnterior[]> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("veiculos_condutores_cnh")
    .select("*")
    .eq("condutor_id", condutorId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .order("cnh_validade", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
  if (error) return []
  const linhas = data ?? []
  const [nomes, emails] = await Promise.all([
    nomesDosUsuarios(linhas.map((l) => String(l.registrado_por_id ?? "")).filter(Boolean)),
    emailsDe(linhas.map((l) => String(l.usuario_origem_id ?? "")).filter(Boolean)),
  ])
  const hoje = hojeSP()
  return linhas.map((l) => ({
    id: String(l.id),
    numero: texto(l.cnh_numero),
    categoria: texto(l.cnh_categoria),
    validade: texto(l.cnh_validade),
    vencida: Boolean(l.cnh_validade && String(l.cnh_validade) < hoje),
    arquivoUrl: texto(l.cnh_arquivo_url),
    origem: l.origem === "unificacao" ? "unificacao" : "renovacao",
    origemEmail: l.usuario_origem_id ? (emails.get(String(l.usuario_origem_id)) ?? null) : null,
    registradoPor: l.registrado_por_id ? (nomes.get(String(l.registrado_por_id)) ?? null) : null,
    registradoEm: String(l.created_at),
  }))
}

async function emailsDe(ids: string[]): Promise<Map<string, string>> {
  const m = new Map<string, string>()
  if (!ids.length) return m
  const admin = await createAdminClient()
  const { data } = await admin.from("usuarios").select("id, email").in("id", [...new Set(ids)])
  for (const u of data ?? []) if (u.email) m.set(String(u.id), String(u.email))
  return m
}

// ── Cadastros repetidos ──────────────────────────────────────────────────────

export type MembroRepetido = {
  usuarioId: string
  nome: string
  email: string | null
  cpf: string | null
  /** Usuário inativo ou excluído no cadastro de pessoas. */
  inativo: boolean
  cnhNumero: string | null
  cnhValidade: string | null
  autorizado: boolean
  movimentacoes: number
  ultimoUso: string | null
  abastecimentos: number
  infracoes: number
  reservas: number
}

export type GrupoRepetido = {
  /** Por que foram agrupados. */
  motivo: "cpf" | "nome"
  membros: MembroRepetido[]
  /** Sugestão de quem fica: ativo, com a CNH mais nova, com mais uso. */
  principalSugerido: string
}

function normalizarNome(s: string | null): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * Condutores cadastrados que parecem a mesma pessoa: mesmo CPF, ou — quando
 * um dos dois não tem CPF — o mesmo nome completo.
 */
export async function condutoresRepetidos(): Promise<GrupoRepetido[]> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data: condutores } = await admin
    .from("veiculos_condutores")
    .select("usuario_id, cnh_numero, cnh_validade, autorizado")
    .eq("emp_proprietaria_id", emp)
  if (!condutores?.length) return []
  const { data: usuarios } = await admin
    .from("usuarios")
    .select("id, nome_completo, nome_guerra, email, cpf, inativo, deletado")
    .in("id", condutores.map((c) => c.usuario_id))
  const porUsuario = new Map((usuarios ?? []).map((u) => [String(u.id), u]))

  // União por CPF e por nome (componentes conexos simples).
  const pai = new Map<string, string>()
  const achar = (x: string): string => (pai.get(x) === x ? x : achar(pai.get(x)!))
  const unir = (a: string, b: string) => pai.set(achar(a), achar(b))
  for (const c of condutores) pai.set(String(c.usuario_id), String(c.usuario_id))
  const motivo = new Map<string, "cpf" | "nome">()
  const cpfDe = (id: string): string | null => {
    const cpf = String(porUsuario.get(id)?.cpf ?? "").replace(/\D/g, "")
    return cpf.length === 11 && !/^(\d)\1+$/.test(cpf) ? cpf : null
  }
  const indexar = (chave: (id: string) => string | null, tipo: "cpf" | "nome") => {
    const vistos = new Map<string, string[]>()
    for (const c of condutores) {
      const id = String(c.usuario_id)
      const k = chave(id)
      if (!k) continue
      for (const outro of vistos.get(k) ?? []) {
        // Mesmo nome com CPFs DIFERENTES são homônimos, não a mesma pessoa.
        const a = cpfDe(id)
        const b = cpfDe(outro)
        if (tipo === "nome" && a && b && a !== b) continue
        unir(id, outro)
        if (!motivo.has(outro)) motivo.set(outro, tipo)
      }
      vistos.set(k, [...(vistos.get(k) ?? []), id])
    }
  }
  indexar(cpfDe, "cpf")
  indexar((id) => normalizarNome(texto(porUsuario.get(id)?.nome_completo)) || null, "nome")

  const grupos = new Map<string, string[]>()
  for (const id of pai.keys()) {
    const raiz = achar(id)
    grupos.set(raiz, [...(grupos.get(raiz) ?? []), id])
  }
  const repetidos = [...grupos.values()].filter((g) => g.length > 1)
  if (!repetidos.length) return []

  const conta = async (tabela: string, coluna: string, id: string) => {
    const { count } = await admin.from(tabela).select("id", { count: "exact", head: true }).eq(coluna, id)
    return count ?? 0
  }
  const saida: GrupoRepetido[] = []
  for (const ids of repetidos) {
    const membros: MembroRepetido[] = await Promise.all(
      ids.map(async (id) => {
        const u = porUsuario.get(id)
        const c = condutores.find((x) => String(x.usuario_id) === id)!
        const [movimentacoes, abastecimentos, infracoes, reservas, ultimo] = await Promise.all([
          conta("veiculos_disponibilidade", "condutor_id", id),
          conta("veiculos_abastecimentos", "usuario_id", id),
          conta("veiculos_infracoes", "condutor_infrator_id", id),
          conta("veiculos_agendamentos", "condutor_id", id),
          admin
            .from("veiculos_disponibilidade")
            .select("data_retirada")
            .eq("condutor_id", id)
            .order("data_retirada", { ascending: false, nullsFirst: false })
            .limit(1),
        ])
        return {
          usuarioId: id,
          nome: texto(u?.nome_completo) ?? texto(u?.nome_guerra) ?? "(sem nome)",
          email: texto(u?.email),
          cpf: texto(u?.cpf),
          inativo: u?.inativo === true || u?.deletado === true,
          cnhNumero: texto(c.cnh_numero),
          cnhValidade: texto(c.cnh_validade),
          autorizado: c.autorizado === true,
          movimentacoes,
          ultimoUso: texto(ultimo.data?.[0]?.data_retirada),
          abastecimentos,
          infracoes,
          reservas,
        }
      })
    )
    const ordenados = [...membros].sort(
      (a, b) =>
        Number(a.inativo) - Number(b.inativo) ||
        (b.cnhValidade ?? "").localeCompare(a.cnhValidade ?? "") ||
        b.movimentacoes - a.movimentacoes
    )
    saida.push({
      motivo: ids.some((id) => motivo.get(id) === "cpf") ? "cpf" : "nome",
      membros: ordenados,
      principalSugerido: ordenados[0].usuarioId,
    })
  }
  return saida.sort((a, b) => a.membros[0].nome.localeCompare(b.membros[0].nome, "pt-BR"))
}

// ── Unificação ───────────────────────────────────────────────────────────────

export type ResultadoUnificacao = { movidos: Record<string, number> }

export async function unificarCondutores(
  principalId: string,
  secundarioId: string,
  autorId: string
): Promise<{ resultado?: ResultadoUnificacao; erro?: string }> {
  // A função só aceita o servidor (o tenant vai como parâmetro e é conferido
  // lá dentro); o createAdminClient roteia .rpc pelo service role.
  const { data, error } = await (await createAdminClient()).rpc("unificar_condutores", {
    p_emp: await tenantAtual(),
    p_principal: principalId,
    p_secundario: secundarioId,
    p_autor: autorId,
  })
  if (error) {
    if (error.code === "PGRST202" || esquemaAusente(error)) return { erro: AVISO_SQL_CNH }
    return { erro: error.message }
  }
  return { resultado: { movidos: ((data as { movidos?: Record<string, number> })?.movidos ?? {}) } }
}
