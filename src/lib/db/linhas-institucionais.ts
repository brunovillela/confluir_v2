import "server-only"
import { lerEmLotes, lerEmLotesPorIds, texto } from "@/lib/db/comum"
import { pessoasParaDepartamento } from "@/lib/db/departamentos"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Linhas institucionais — os celulares da entidade: número, operadora, chip
 * (ICCID) e com quem a linha está. Irmão dos e-mails institucionais, no
 * Institucional. Tabela `linhas_institucionais` (supabase/linhas-institucionais.sql);
 * as 51 linhas do Bubble vieram por scripts/migrar-linhas-bubble.mjs, sem
 * responsável (lá não havia esse campo).
 */

export type LinhaInstitucional = {
  id: string
  numero: string
  operadora: string | null
  chip: string | null
  usuarioId: string | null
  responsavelNome: string | null
  observacao: string | null
}

export type ResponsavelLinha = { id: string; nome: string; origem: string }

const digitos = (v: string) => v.replace(/\D/g, "")

function nomeUsuario(u: Record<string, unknown> | undefined): string | null {
  if (!u) return null
  return (
    [u.nome_completo, u.nome_guerra].find(
      (v): v is string => typeof v === "string" && v.trim() !== ""
    ) ?? null
  )
}

export async function listarLinhasInstitucionais(busca?: string): Promise<LinhaInstitucional[]> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("linhas_institucionais")
    .select("id, numero, operadora, chip, usuario_id, observacao")
    .eq("emp_proprietaria_id", await tenantAtual())
    .order("numero", { ascending: true })
    .limit(1000)
  if (error) throw new Error(`Falha ao listar as linhas institucionais: ${error.message}`)

  const linhas = (data ?? []) as Record<string, unknown>[]
  const usuarioIds = [...new Set(linhas.map((l) => texto(l.usuario_id)).filter(Boolean))] as string[]
  const nomes = new Map<string, string>()
  if (usuarioIds.length) {
    const { data: us } = await admin
      .from("usuarios")
      .select("id, nome_completo, nome_guerra")
      .in("id", usuarioIds)
    for (const u of (us ?? []) as Record<string, unknown>[]) {
      const nome = nomeUsuario(u)
      if (nome) nomes.set(String(u.id), nome)
    }
  }

  const termo = (busca ?? "").trim().toLocaleLowerCase("pt-BR")
  const termoDigitos = digitos(termo)
  return linhas
    .map((l) => {
      const usuarioId = texto(l.usuario_id)
      return {
        id: String(l.id),
        numero: String(l.numero ?? ""),
        operadora: texto(l.operadora),
        chip: texto(l.chip),
        usuarioId,
        responsavelNome: usuarioId ? (nomes.get(usuarioId) ?? null) : null,
        observacao: texto(l.observacao),
      }
    })
    .filter(
      (l) =>
        !termo ||
        (termoDigitos.length >= 3 &&
          (l.numero.includes(termoDigitos) || (l.chip ?? "").includes(termoDigitos))) ||
        (l.operadora ?? "").toLocaleLowerCase("pt-BR").includes(termo) ||
        (l.responsavelNome ?? "").toLocaleLowerCase("pt-BR").includes(termo)
    )
}

/** Ordem dos grupos no seletor de responsável. */
const ORDEM_ORIGEM = [
  "Diretoria",
  "Funcionários",
  "Prestadores",
  "Outros com acesso ao painel",
  "Fora do quadro atual",
]

/** Classificação do Quadro da entidade → grupo do seletor. */
function origemDaClassificacao(c: string | null): string | null {
  if (c === "Diretor(a)") return "Diretoria"
  if (c === "Prestador(a) de serviço") return "Prestadores"
  if (c === "Funcionário(a)" || c === "Jovem aprendiz" || c === "Estagiário(a)") return "Funcionários"
  return null
}

/**
 * Quem pode ficar com uma linha, um e-mail ou um ramal: funcionários ativos e
 * diretores do mandato vigente, os classificados no Quadro da entidade
 * (prestadores inclusive) e quem tem acesso ao painel. Quem já é responsável
 * e saiu de tudo isso continua na lista — senão, salvar o registro o tiraria
 * sem ninguém ver.
 */
export async function opcoesResponsaveisLinha(
  atuais: Pick<LinhaInstitucional, "usuarioId" | "responsavelNome">[]
): Promise<ResponsavelLinha[]> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const [pessoas, classificados, comAcesso] = await Promise.all([
    pessoasParaDepartamento(),
    lerEmLotes<Record<string, unknown>>((de, ate) =>
      admin
        .from("usuarios")
        .select("id, nome_completo, nome_guerra, vinculo_instituicao")
        .eq("emp_proprietaria_id", emp)
        .not("vinculo_instituicao", "is", null)
        .not("deletado", "is", true)
        .not("inativo", "is", true)
        .order("id")
        .range(de, ate)
    ).catch(() => []),
    lerEmLotes<Record<string, unknown>>((de, ate) =>
      admin
        .from("permissoes")
        .select("usuario_id")
        .eq("emp_proprietaria_id", emp)
        .not("usuario_id", "is", null)
        .order("id")
        .range(de, ate)
    ).catch(() => []),
  ])

  const opcoes = new Map<string, ResponsavelLinha>()
  for (const p of pessoas) {
    if (!p.usuarioId) continue
    opcoes.set(p.usuarioId, {
      id: p.usuarioId,
      nome: p.nome,
      origem: p.origem === "diretor" ? "Diretoria" : "Funcionários",
    })
  }
  for (const u of classificados) {
    const id = String(u.id)
    const origem = origemDaClassificacao(texto(u.vinculo_instituicao))
    if (!origem || opcoes.has(id)) continue
    opcoes.set(id, { id, nome: nomeUsuario(u) ?? "(sem nome)", origem })
  }

  // Acesso ao painel sem estar no quadro: nome lido à parte.
  const semGrupo = [
    ...new Set(comAcesso.map((p) => texto(p.usuario_id)).filter((v): v is string => !!v)),
  ].filter((id) => !opcoes.has(id))
  const extras = await lerEmLotesPorIds<Record<string, unknown>>(semGrupo, (fatia, de, ate) =>
    admin
      .from("usuarios")
      .select("id, nome_completo, nome_guerra, inativo, deletado")
      .in("id", fatia)
      .order("id")
      .range(de, ate)
  ).catch(() => [])
  for (const u of extras) {
    if (u.inativo === true || u.deletado === true) continue
    const id = String(u.id)
    opcoes.set(id, { id, nome: nomeUsuario(u) ?? "(sem nome)", origem: "Outros com acesso ao painel" })
  }

  for (const l of atuais) {
    if (l.usuarioId && !opcoes.has(l.usuarioId)) {
      opcoes.set(l.usuarioId, {
        id: l.usuarioId,
        nome: l.responsavelNome ?? "(sem nome)",
        origem: "Fora do quadro atual",
      })
    }
  }
  return [...opcoes.values()].sort(
    (a, b) =>
      ORDEM_ORIGEM.indexOf(a.origem) - ORDEM_ORIGEM.indexOf(b.origem) ||
      a.nome.localeCompare(b.nome, "pt-BR")
  )
}

export type DadosLinha = {
  numero: string
  operadora: string | null
  chip: string | null
  usuarioId: string | null
  observacao: string | null
}

type Admin = Awaited<ReturnType<typeof createAdminClient>>

/** Normaliza e valida; devolve o registro pronto ou o erro. */
async function preparar(
  admin: Admin,
  empId: string,
  dados: DadosLinha,
  ignorarId?: string
): Promise<{ erro: string } | { registro: Record<string, string | null> }> {
  const numero = digitos(dados.numero)
  if (numero.length < 10 || numero.length > 11) {
    return { erro: "Informe o número com DDD (10 ou 11 dígitos)." }
  }
  const chip = dados.chip ? digitos(dados.chip) || null : null
  let q = admin
    .from("linhas_institucionais")
    .select("id")
    .eq("emp_proprietaria_id", empId)
    .eq("numero", numero)
  if (ignorarId) q = q.neq("id", ignorarId)
  const { data } = await q.limit(1)
  if ((data ?? []).length > 0) return { erro: "Essa linha já está cadastrada." }
  return {
    registro: {
      numero,
      operadora: dados.operadora?.trim() || null,
      chip,
      usuario_id: dados.usuarioId,
      observacao: dados.observacao?.trim() || null,
    },
  }
}

export async function criarLinhaInstitucional(dados: DadosLinha): Promise<{ erro?: string }> {
  const empId = await tenantAtual()
  const admin = await createAdminClient()
  const r = await preparar(admin, empId, dados)
  if ("erro" in r) return r
  const { error } = await admin
    .from("linhas_institucionais")
    .insert({ ...r.registro, emp_proprietaria_id: empId })
  if (error) return { erro: `Falha ao cadastrar a linha: ${error.message}` }
  return {}
}

export async function atualizarLinhaInstitucional(
  id: string,
  dados: DadosLinha
): Promise<{ erro?: string }> {
  const empId = await tenantAtual()
  const admin = await createAdminClient()
  const r = await preparar(admin, empId, dados, id)
  if ("erro" in r) return r
  const { error } = await admin
    .from("linhas_institucionais")
    .update({ ...r.registro, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("emp_proprietaria_id", empId)
  if (error) return { erro: `Falha ao salvar a linha: ${error.message}` }
  return {}
}

export async function excluirLinhaInstitucional(id: string): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin
    .from("linhas_institucionais")
    .delete()
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: `Falha ao excluir a linha: ${error.message}` }
  return {}
}
