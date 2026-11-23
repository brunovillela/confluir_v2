import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { avisar, type Destinatario } from "@/lib/db/avisos"
import { esquemaAusente, hojeSP, nomesDosUsuarios, texto } from "@/lib/db/comum"
import { recusaDaSituacaoDaDemanda } from "@/lib/db/portal-atendimentos"
import { somarDias } from "@/lib/deliberacoes-constantes"
import type { ContextoEmail } from "@/lib/email"
import { ehAcao, ehGatilho, fraseDaRegra, type AcaoRegra, type GatilhoRegra } from "@/lib/ferramentas-regras"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * REGRAS "QUANDO… ENTÃO…" (Onda 3, 22/11/2026). Disparadas por criar e
 * concluir tarefa (na requisição) e pelo atraso (tick diário). Cada regra age
 * uma vez por tarefa e ocasião (a chave em demandas_regras_execucoes) e uma
 * regra não dispara outra: as ações gravam direto, sem passar pelos gatilhos.
 */

type Linha = Record<string, unknown>
type Ambiente = { client?: SupabaseClient; tenantId?: string; contexto?: ContextoEmail }

export type RegraLinha = {
  id: string
  gatilho: GatilhoRegra
  acao: AcaoRegra
  demandaId: string | null
  demandaNome: string | null
  pessoaId: string | null
  pessoaNome: string | null
  etiquetaId: string | null
  etiquetaNome: string | null
  ativa: boolean
  frase: string
  execucoes: number
  ultimaEm: string | null
}

export async function listarRegras(): Promise<RegraLinha[]> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data, error } = await admin
    .from("demandas_regras")
    .select("id, gatilho, acao, demanda_id, pessoa_id, etiqueta_id, ativa, demanda:demanda_id (nome), etiqueta:etiqueta_id (nome)")
    .eq("emp_proprietaria_id", emp)
    .order("created_at")
  if (error) {
    if (esquemaAusente(error)) return []
    throw new Error(`Falha ao ler as regras: ${error.message}`)
  }
  const linhas = ((data ?? []) as Linha[]).filter((r) => ehGatilho(r.gatilho) && ehAcao(r.acao))
  const nomes = await nomesDosUsuarios(linhas.map((r) => String(r.pessoa_id ?? "")).filter(Boolean), "guerra")
  const { data: ex } = await admin
    .from("demandas_regras_execucoes")
    .select("regra_id, created_at")
    .eq("emp_proprietaria_id", emp)
    .order("created_at", { ascending: false })
    .limit(2000)
  const contagem = new Map<string, { n: number; ultima: string }>()
  for (const e of ex ?? []) {
    const c = contagem.get(String(e.regra_id))
    if (c) c.n++
    else contagem.set(String(e.regra_id), { n: 1, ultima: String(e.created_at) })
  }
  const um = (v: unknown) => (Array.isArray(v) ? v[0] : v) as Linha | null
  return linhas.map((r) => {
    const base = {
      id: String(r.id),
      gatilho: r.gatilho as GatilhoRegra,
      acao: r.acao as AcaoRegra,
      demandaId: texto(r.demanda_id),
      demandaNome: texto(um(r.demanda)?.nome),
      pessoaId: texto(r.pessoa_id),
      pessoaNome: r.pessoa_id ? (nomes.get(String(r.pessoa_id)) ?? null) : null,
      etiquetaId: texto(r.etiqueta_id),
      etiquetaNome: texto(um(r.etiqueta)?.nome),
      ativa: r.ativa === true,
    }
    const c = contagem.get(base.id)
    return { ...base, frase: fraseDaRegra(base), execucoes: c?.n ?? 0, ultimaEm: c?.ultima ?? null }
  })
}

export async function criarRegra(
  dados: { gatilho: GatilhoRegra; acao: AcaoRegra; demandaId: string | null; pessoaId: string | null; etiquetaId: string | null },
  criadaPor: string
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin.from("demandas_regras").insert({
    emp_proprietaria_id: await tenantAtual(),
    gatilho: dados.gatilho,
    acao: dados.acao,
    demanda_id: dados.demandaId,
    pessoa_id: dados.pessoaId,
    etiqueta_id: dados.etiquetaId,
    criada_por: criadaPor,
  })
  if (error) return { erro: `Falha ao criar a regra: ${error.message}` }
  return {}
}

export async function alternarRegra(id: string, ativa: boolean): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin.from("demandas_regras").update({ ativa }).eq("id", id).eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: `Falha ao salvar a regra: ${error.message}` }
  return {}
}

export async function excluirRegra(id: string): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin.from("demandas_regras").delete().eq("id", id).eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: `Falha ao excluir a regra: ${error.message}` }
  return {}
}

// ── Execução ─────────────────────────────────────────────────────────────────

async function ambiente(a: Ambiente) {
  return { client: a.client ?? (await createAdminClient()), tenantId: a.tenantId ?? (await tenantAtual()), contexto: a.contexto }
}

async function destinatario(client: SupabaseClient, id: string): Promise<Destinatario | null> {
  const { data: u } = await client
    .from("usuarios")
    .select("id, nome_completo, nome_guerra, email")
    .eq("id", id)
    .not("inativo", "is", true)
    .not("deletado", "is", true)
    .maybeSingle()
  return u ? { id: String(u.id), nome: texto(u.nome_completo) ?? texto(u.nome_guerra), email: texto(u.email), permissoes: {} } : null
}

/**
 * Aplica as regras ativas do gatilho à tarefa. `naRequisicao` libera a ação
 * que depende da requisição (demanda a Feito, que confere o portal).
 */
export async function aplicarRegras(
  gatilho: GatilhoRegra,
  tarefaId: string,
  amb: Ambiente = {},
  naRequisicao = true
): Promise<number> {
  const { client, tenantId, contexto } = await ambiente(amb)
  const { data: t } = await client
    .from("demandas_check_tarefas")
    .select("id, titulo, demanda_id, demandado_id, prioridade, concluido, data_prazo_entrega")
    .eq("id", tarefaId)
    .eq("emp_proprietaria_id", tenantId)
    .maybeSingle()
  if (!t) return 0
  const demandaId = texto(t.demanda_id)
  let q = client.from("demandas_regras").select("id, gatilho, acao, demanda_id, pessoa_id, etiqueta_id").eq("emp_proprietaria_id", tenantId).eq("gatilho", gatilho).eq("ativa", true)
  q = demandaId ? q.or(`demanda_id.is.null,demanda_id.eq.${demandaId}`) : q.is("demanda_id", null)
  const { data: regras, error } = await q
  if (error || !regras?.length) return 0

  const titulo = (texto(t.titulo) ?? "(sem título)").slice(0, 120)
  const ocasiao = gatilho === "tarefa_atrasou" ? `${gatilho}:${tarefaId}:${texto(t.data_prazo_entrega)}` : `${gatilho}:${tarefaId}`
  let agiram = 0
  for (const r of regras as Linha[]) {
    if (!ehAcao(r.acao)) continue
    // Reserva a vez (única por regra e ocasião): rodar de novo não repete.
    const { data: reserva, error: erroReserva } = await client
      .from("demandas_regras_execucoes")
      .insert({ emp_proprietaria_id: tenantId, regra_id: r.id, tarefa_id: tarefaId, chave: ocasiao })
      .select("id")
      .single()
    if (erroReserva || !reserva) continue
    let detalhe: string | null = null
    try {
      detalhe = await executarAcao(r, { client, tenantId, contexto, t: t as Linha, titulo, demandaId, naRequisicao })
    } catch (e) {
      detalhe = `Falhou: ${e instanceof Error ? e.message : String(e)}`.slice(0, 200)
    }
    if (detalhe === null) {
      // Nada a fazer (ex.: a tarefa já tinha responsável): libera a vez.
      await client.from("demandas_regras_execucoes").delete().eq("id", reserva.id)
      continue
    }
    await client.from("demandas_regras_execucoes").update({ detalhe }).eq("id", reserva.id)
    agiram++
  }
  return agiram
}

async function executarAcao(
  r: Linha,
  x: { client: SupabaseClient; tenantId: string; contexto?: ContextoEmail; t: Linha; titulo: string; demandaId: string | null; naRequisicao: boolean }
): Promise<string | null> {
  const { client, tenantId, t } = x
  const acao = r.acao as AcaoRegra
  if (acao === "prioridade_alta") {
    if (t.prioridade === "alta" || t.concluido === true) return null
    await client.from("demandas_check_tarefas").update({ prioridade: "alta" }).eq("id", t.id).eq("emp_proprietaria_id", tenantId)
    return "Prioridade mudou para Alta."
  }
  if (acao === "etiquetar") {
    const { error } = await client
      .from("demandas_tarefa_etiquetas")
      .insert({ emp_proprietaria_id: tenantId, tarefa_id: t.id, etiqueta_id: r.etiqueta_id })
    return error ? null : "Etiqueta adicionada."
  }
  if (acao === "atribuir") {
    if (t.demandado_id || !r.pessoa_id) return null
    await client.from("demandas_check_tarefas").update({ demandado_id: r.pessoa_id }).eq("id", t.id).eq("emp_proprietaria_id", tenantId)
    const d = await destinatario(client, String(r.pessoa_id))
    if (d) {
      await avisar(
        [d],
        { texto: `Tarefa atribuída a você: "${x.titulo}".`, link: "/painel/perfil/tarefas", evento: "tarefa_responsavel", assunto: "Tarefa atribuída a você" },
        { client, tenantId, contexto: x.contexto }
      )
    }
    return "Responsável atribuído."
  }
  if (acao === "avisar") {
    const d = r.pessoa_id ? await destinatario(client, String(r.pessoa_id)) : null
    if (!d) return null
    const quando = { tarefa_criada: "foi criada", tarefa_concluida: "foi concluída", tarefa_atrasou: "passou do prazo" }[r.gatilho as GatilhoRegra]
    await avisar(
      [d],
      { texto: `Automação: a tarefa "${x.titulo}" ${quando}.`, link: "/painel/ferramentas/tarefas", evento: "regra_aviso", assunto: "Aviso de automação" },
      { client, tenantId, contexto: x.contexto }
    )
    return "Pessoa avisada."
  }
  if (acao === "demanda_feito") {
    if (!x.demandaId || !x.naRequisicao) return null
    const { data: abertas } = await client
      .from("demandas_check_tarefas")
      .select("id")
      .eq("demanda_id", x.demandaId)
      .not("concluido", "is", true)
      .limit(1)
    if (abertas?.length) return null
    const { data: dem } = await client.from("demandas").select("situacao").eq("id", x.demandaId).maybeSingle()
    if (!dem || dem.situacao === "Feito") return null
    if (await recusaDaSituacaoDaDemanda(x.demandaId, "Feito")) return null
    await client.from("demandas").update({ situacao: "Feito", updated_at: new Date().toISOString() }).eq("id", x.demandaId).eq("emp_proprietaria_id", tenantId)
    const { avisarPedidoConcluido } = await import("@/lib/db/pedidos")
    await avisarPedidoConcluido(x.demandaId).catch(() => {})
    return "Demanda passou para Feito."
  }
  return null
}

/** Tick diário: aplica as regras de atraso às tarefas que venceram nos últimos 7 dias. */
export async function aplicarRegrasDeAtraso(
  client: SupabaseClient,
  tenantId: string,
  contexto: ContextoEmail
): Promise<{ tarefas: number; agiram: number; erros: string[] }> {
  const erros: string[] = []
  const { count, error: e1 } = await client
    .from("demandas_regras")
    .select("id", { count: "exact", head: true })
    .eq("emp_proprietaria_id", tenantId)
    .eq("gatilho", "tarefa_atrasou")
    .eq("ativa", true)
  if (e1) {
    if (!esquemaAusente(e1)) erros.push(e1.message)
    return { tarefas: 0, agiram: 0, erros }
  }
  if (!count) return { tarefas: 0, agiram: 0, erros }
  const hoje = hojeSP()
  const { data, error } = await client
    .from("demandas_check_tarefas")
    .select("id")
    .eq("emp_proprietaria_id", tenantId)
    .not("concluido", "is", true)
    .lt("data_prazo_entrega", hoje)
    .gte("data_prazo_entrega", somarDias(hoje, -7))
    .limit(1000)
  if (error) {
    erros.push(error.message)
    return { tarefas: 0, agiram: 0, erros }
  }
  let agiram = 0
  for (const t of data ?? []) {
    try {
      agiram += await aplicarRegras("tarefa_atrasou", String(t.id), { client, tenantId, contexto }, false)
    } catch (e) {
      erros.push(`${t.id}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  return { tarefas: (data ?? []).length, agiram, erros }
}
