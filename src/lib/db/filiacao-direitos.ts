import "server-only"

import {
  BENEFICIOS,
  conferirCarencia,
  type Beneficio,
  type CarenciaConfig,
  type Direito,
  type EscopoSuspensao,
  type RegraInadimplencia,
} from "@/lib/filiacao-direitos-constantes"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Carência de direitos e inadimplência.
 *
 * CARÊNCIA conta da filiação MAIS RECENTE — é o que dá sentido à regra, que
 * existe para conter filiação em massa às vésperas de uma eleição. Quem trocou
 * de empregador sem sair do sindicato pode receber efeito suspensivo, e aí
 * vale a primeira filiação.
 *
 * INADIMPLÊNCIA é medida contra as REMESSAS: para cada tipo (Associativa,
 * Assistencial…), quantas o filiado deixou de pagar dentro de uma janela, e se
 * precisam ser seguidas.
 *
 * As duas apenas RESPONDEM — nada aqui muda a condição de ninguém sozinho.
 * Uma remessa que o empregador atrasou tiraria direitos de gente em dia; quem
 * decide é uma pessoa, com o relatório na frente.
 *
 * SQL: supabase/filiacao-carencia-inadimplencia.sql
 */

// ── Configuração ─────────────────────────────────────────────────────────────

export async function lerCarencias(): Promise<CarenciaConfig[]> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("filiacao_carencias")
    .select("beneficio, dias, ativo, observacao")
    .eq("emp_proprietaria_id", await tenantAtual())

  const porBeneficio = new Map(
    (data ?? []).map((c) => [c.beneficio as string, c])
  )
  // Benefício sem linha = sem carência. O sistema não inventa restrição.
  return BENEFICIOS.map((b) => {
    const linha = porBeneficio.get(b.chave)
    return {
      beneficio: b.chave,
      dias: Number(linha?.dias ?? 0),
      ativo: linha?.ativo === true,
      observacao: (linha?.observacao as string | null) ?? null,
    }
  })
}

export async function salvarCarencia(
  beneficio: Beneficio,
  dados: { dias: number; ativo: boolean; observacao: string | null },
  usuarioId: string
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin.from("filiacao_carencias").upsert(
    {
      emp_proprietaria_id: await tenantAtual(),
      beneficio,
      dias: dados.dias,
      ativo: dados.ativo,
      observacao: dados.observacao,
      atualizada_por: usuarioId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "emp_proprietaria_id,beneficio" }
  )
  return error ? { erro: error.message } : {}
}

/** Tipos de remessa que a entidade realmente usa — não uma lista fixa. */
export async function tiposDeRemessa(): Promise<string[]> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("filiacao_recebe_remessa")
    .select("tipo")
    .eq("emp_proprietaria_id", await tenantAtual())
    .not("tipo", "is", null)
  return [...new Set((data ?? []).map((r) => r.tipo as string))].sort()
}

export async function lerRegrasInadimplencia(): Promise<RegraInadimplencia[]> {
  const admin = await createAdminClient()
  const [{ data }, tipos] = await Promise.all([
    admin
      .from("filiacao_inadimplencia_regras")
      .select("tipo, quantidade, exigir_consecutivas, janela_remessas, ativo")
      .eq("emp_proprietaria_id", await tenantAtual()),
    tiposDeRemessa(),
  ])

  const porTipo = new Map((data ?? []).map((r) => [r.tipo as string, r]))
  return tipos.map((tipo) => {
    const linha = porTipo.get(tipo)
    return {
      tipo,
      quantidade: Number(linha?.quantidade ?? 3),
      exigirConsecutivas: linha?.exigir_consecutivas !== false,
      janelaRemessas: Number(linha?.janela_remessas ?? 12),
      ativo: linha?.ativo === true,
    }
  })
}

export async function salvarRegraInadimplencia(
  tipo: string,
  dados: {
    quantidade: number
    exigirConsecutivas: boolean
    janelaRemessas: number
    ativo: boolean
  },
  usuarioId: string
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin
    .from("filiacao_inadimplencia_regras")
    .upsert(
      {
        emp_proprietaria_id: await tenantAtual(),
        tipo,
        quantidade: dados.quantidade,
        exigir_consecutivas: dados.exigirConsecutivas,
        janela_remessas: dados.janelaRemessas,
        ativo: dados.ativo,
        atualizada_por: usuarioId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "emp_proprietaria_id,tipo" }
    )
  return error ? { erro: error.message } : {}
}

// ── Efeito suspensivo ────────────────────────────────────────────────────────

export type Suspensao = {
  id: string
  cpf: string
  nome: string | null
  escopo: EscopoSuspensao
  alvo: string | null
  motivo: string | null
  vigenciaAte: string | null
  concedidaPorNome: string | null
  criadaEm: string
}

/**
 * Suspensões em vigor de uma pessoa. Identifica por CPF porque a pessoa tem um
 * registro de filiação por vínculo, e a suspensão vale para ELA.
 */
export async function suspensoesDoCpf(
  cpf: string,
  escopo?: EscopoSuspensao
): Promise<{ escopo: string; alvo: string | null; vigenciaAte: string | null }[]> {
  if (!cpf) return []
  const admin = await createAdminClient()
  let q = admin
    .from("filiacao_suspensoes")
    .select("escopo, alvo, vigencia_ate")
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("cpf", cpf)
    .is("revogada_em", null)
  if (escopo) q = q.eq("escopo", escopo)

  const { data } = await q
  const hoje = new Date().toISOString().slice(0, 10)
  return (data ?? [])
    .filter((s) => !s.vigencia_ate || (s.vigencia_ate as string) >= hoje)
    .map((s) => ({
      escopo: s.escopo as string,
      alvo: (s.alvo as string | null) ?? null,
      vigenciaAte: (s.vigencia_ate as string | null) ?? null,
    }))
}

export async function listarSuspensoes(filtro?: {
  escopo?: EscopoSuspensao
}): Promise<Suspensao[]> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  let q = admin
    .from("filiacao_suspensoes")
    .select(
      "id, cpf, escopo, alvo, motivo, vigencia_ate, concedida_por, created_at"
    )
    .eq("emp_proprietaria_id", emp)
    .is("revogada_em", null)
  if (filtro?.escopo) q = q.eq("escopo", filtro.escopo)

  const { data } = await q.order("created_at", { ascending: false }).limit(500)
  const linhas = data ?? []
  if (linhas.length === 0) return []

  const [{ data: pessoas }, { data: usuarios }] = await Promise.all([
    admin
      .from("filiacoes")
      .select("cpf, nome_completo")
      .eq("emp_proprietaria_id", emp)
      .in("cpf", [...new Set(linhas.map((s) => s.cpf as string))]),
    admin
      .from("usuarios")
      .select("id, nome_completo, nome_guerra")
      .in(
        "id",
        [
          ...new Set(
            linhas
              .map((s) => s.concedida_por as string | null)
              .filter((v): v is string => Boolean(v))
          ),
        ]
      ),
  ])

  const nomePorCpf = new Map<string, string>()
  for (const p of pessoas ?? []) {
    if (p.cpf && p.nome_completo && !nomePorCpf.has(p.cpf as string)) {
      nomePorCpf.set(p.cpf as string, p.nome_completo as string)
    }
  }
  const nomeUsuario = new Map(
    (usuarios ?? []).map((u) => [
      u.id as string,
      (u.nome_guerra as string) ?? (u.nome_completo as string) ?? "",
    ])
  )

  return linhas.map((s) => ({
    id: s.id as string,
    cpf: s.cpf as string,
    nome: nomePorCpf.get(s.cpf as string) ?? null,
    escopo: s.escopo as EscopoSuspensao,
    alvo: (s.alvo as string | null) ?? null,
    motivo: (s.motivo as string | null) ?? null,
    vigenciaAte: (s.vigencia_ate as string | null) ?? null,
    concedidaPorNome: s.concedida_por
      ? (nomeUsuario.get(s.concedida_por as string) ?? null)
      : null,
    criadaEm: s.created_at as string,
  }))
}

export async function concederSuspensao(dados: {
  cpf: string
  escopo: EscopoSuspensao
  alvo: string | null
  motivo: string
  vigenciaAte: string | null
  usuarioId: string
}): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin.from("filiacao_suspensoes").insert({
    emp_proprietaria_id: await tenantAtual(),
    cpf: dados.cpf,
    escopo: dados.escopo,
    alvo: dados.alvo,
    motivo: dados.motivo,
    vigencia_ate: dados.vigenciaAte,
    concedida_por: dados.usuarioId,
  })
  return error ? { erro: error.message } : {}
}

export async function revogarSuspensao(
  id: string,
  usuarioId: string
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin
    .from("filiacao_suspensoes")
    .update({
      revogada_em: new Date().toISOString(),
      revogada_por: usuarioId,
    })
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("id", id)
  return error ? { erro: error.message } : {}
}

// ── A pergunta que as telas fazem ────────────────────────────────────────────

/**
 * As duas datas de filiação da pessoa: a mais recente (que a carência usa) e a
 * primeira (que vale quando há efeito suspensivo por troca de empregador).
 *
 * Por CPF, porque a pessoa tem um registro de filiação por vínculo.
 */
export async function datasDeFiliacao(
  cpf: string
): Promise<{ maisRecente: string | null; primeira: string | null }> {
  if (!cpf) return { maisRecente: null, primeira: null }
  const admin = await createAdminClient()
  const emp = await tenantAtual()

  const { data: registros } = await admin
    .from("filiacoes")
    .select("id")
    .eq("emp_proprietaria_id", emp)
    .eq("cpf", cpf)
  const ids = (registros ?? []).map((r) => r.id as string)
  if (ids.length === 0) return { maisRecente: null, primeira: null }

  const { data: vinculos } = await admin
    .from("filiacao_vinculos")
    .select("data_filiacao, filiacao_data_adesao")
    .eq("emp_proprietaria_id", emp)
    .in("filiado_id", ids)

  const datas = (vinculos ?? [])
    .map(
      (v) =>
        (v.data_filiacao as string | null) ??
        (v.filiacao_data_adesao as string | null)
    )
    .filter((d): d is string => Boolean(d))
    .sort()

  if (datas.length === 0) return { maisRecente: null, primeira: null }
  return { primeira: datas[0], maisRecente: datas[datas.length - 1] }
}

/**
 * O filiado pode usar este direito agora?
 *
 * Reúne as três coisas que a resposta exige — a configuração, as datas da
 * pessoa e o efeito suspensivo — para que a tela faça uma pergunta só.
 */
export async function direitoDoFiliado(
  cpf: string,
  beneficio: Beneficio
): Promise<Direito> {
  const [carencias, datas, suspensoes] = await Promise.all([
    lerCarencias(),
    datasDeFiliacao(cpf),
    suspensoesDoCpf(cpf, "carencia"),
  ])
  const carencia = carencias.find((c) => c.beneficio === beneficio)
  if (!carencia) return { liberado: true }

  // Suspensão sem alvo vale para tudo; com alvo, só para aquele benefício.
  const suspenso = suspensoes.some((s) => !s.alvo || s.alvo === beneficio)
  return conferirCarencia(carencia, datas, suspenso)
}
