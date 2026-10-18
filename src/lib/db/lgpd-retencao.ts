import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"
import { prazoEfetivo, regrasDoTenant, rodarRetencao, type ResultadoRegra } from "@/lib/lgpd/retencao-motor"
import { REGRAS_RETENCAO, VALIDADE_SIMULACAO_DIAS, definicaoRegra, type DefinicaoRegra } from "@/lib/lgpd/retencao-regras"

/**
 * Tela Institucional › LGPD: regras do motor de retenção, o resultado da
 * última simulação e os bloqueios por litígio (lib/lgpd/retencao-motor.ts).
 */

export type Execucao = {
  id: string
  modo: "simulacao" | "real"
  origem: "cron" | "painel"
  prazoDias: number
  corte: string
  linhas: number
  arquivos: number
  bloqueadas: number
  detalhe: Record<string, unknown>
  erro: string | null
  iniciadaEm: string
  concluidaEm: string | null
}

export type RegraNaTela = {
  id: string
  definicao: DefinicaoRegra
  prazoDias: number | null
  prazoEfetivoDias: number
  prazoMinimoDias: number
  prazoPadraoDias: number
  ativa: boolean
  ativadaEm: string | null
  ultimaSimulacao: Execucao | null
  ultimaReal: Execucao | null
  /** A simulação é recente o bastante para ligar a execução real. */
  simulacaoValida: boolean
}

export type Bloqueio = {
  id: string
  cpf: string | null
  email: string | null
  tabela: string | null
  registroId: string | null
  motivo: string
  processo: string | null
  criadoEm: string
  encerradoEm: string | null
}

function execucaoDaLinha(l: Record<string, unknown>): Execucao {
  return {
    id: String(l.id),
    modo: l.modo === "real" ? "real" : "simulacao",
    origem: l.origem === "painel" ? "painel" : "cron",
    prazoDias: Number(l.prazo_dias),
    corte: String(l.corte),
    linhas: Number(l.linhas_afetadas ?? 0),
    arquivos: Number(l.arquivos_removidos ?? 0),
    bloqueadas: Number(l.bloqueadas ?? 0),
    detalhe: (l.detalhe as Record<string, unknown>) ?? {},
    erro: (l.erro as string | null) ?? null,
    iniciadaEm: String(l.iniciada_em),
    concluidaEm: (l.concluida_em as string | null) ?? null,
  }
}

export async function carregarRetencao(): Promise<
  { disponivel: false; erro: string } | { disponivel: true; regras: RegraNaTela[]; historico: (Execucao & { codigo: string })[]; bloqueios: Bloqueio[] }
> {
  const client = await createAdminClient()
  const tenantId = await tenantAtual()
  let gravadas
  try {
    gravadas = await regrasDoTenant({ client, tenantId })
  } catch (e) {
    return { disponivel: false, erro: (e as Error).message }
  }
  const [execRes, ativRes, bloqRes] = await Promise.all([
    client
      .from("lgpd_retencao_execucoes")
      .select("id, codigo, modo, origem, prazo_dias, corte, linhas_afetadas, arquivos_removidos, bloqueadas, detalhe, erro, iniciada_em, concluida_em")
      .eq("emp_proprietaria_id", tenantId)
      .order("iniciada_em", { ascending: false })
      .limit(200),
    client.from("lgpd_regras_retencao").select("id, ativada_em").eq("emp_proprietaria_id", tenantId),
    client
      .from("lgpd_bloqueios_litigio")
      .select("id, cpf, email, tabela, registro_id, motivo, processo, created_at, encerrado_em")
      .eq("emp_proprietaria_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(500),
  ])
  const execucoes = (execRes.data ?? []).map((l) => ({ ...execucaoDaLinha(l), codigo: String(l.codigo) }))
  const ativadaEm = new Map((ativRes.data ?? []).map((l) => [String(l.id), (l.ativada_em as string | null) ?? null]))
  const validade = Date.now() - VALIDADE_SIMULACAO_DIAS * 86_400_000

  const regras: RegraNaTela[] = []
  for (const g of gravadas) {
    const definicao = definicaoRegra(g.codigo)
    if (!definicao) continue
    const daRegra = execucoes.filter((e) => e.codigo === g.codigo)
    const ultimaSimulacao = daRegra.find((e) => e.modo === "simulacao") ?? null
    regras.push({
      id: g.id,
      definicao,
      prazoDias: g.prazoDias,
      prazoEfetivoDias: prazoEfetivo(g),
      prazoMinimoDias: g.prazoMinimoDias,
      prazoPadraoDias: g.prazoPadraoDias,
      ativa: g.ativa,
      ativadaEm: ativadaEm.get(g.id) ?? null,
      ultimaSimulacao,
      ultimaReal: daRegra.find((e) => e.modo === "real") ?? null,
      simulacaoValida: Boolean(
        ultimaSimulacao && !ultimaSimulacao.erro && new Date(ultimaSimulacao.iniciadaEm).getTime() >= validade
      ),
    })
  }
  regras.sort((a, b) => REGRAS_RETENCAO.indexOf(a.definicao) - REGRAS_RETENCAO.indexOf(b.definicao))

  return {
    disponivel: true,
    regras,
    historico: execucoes.slice(0, 30),
    bloqueios: (bloqRes.data ?? []).map((l) => ({
      id: String(l.id),
      cpf: (l.cpf as string | null) ?? null,
      email: (l.email as string | null) ?? null,
      tabela: (l.tabela as string | null) ?? null,
      registroId: (l.registro_id as string | null) ?? null,
      motivo: String(l.motivo ?? ""),
      processo: (l.processo as string | null) ?? null,
      criadoEm: String(l.created_at),
      encerradoEm: (l.encerrado_em as string | null) ?? null,
    })),
  }
}

/** Simulação pedida na tela: nunca apaga, mesmo com a regra ligada. */
export async function simularRetencao(usuarioId: string, codigo?: string): Promise<ResultadoRegra[]> {
  return rodarRetencao({
    client: await createAdminClient(),
    tenantId: await tenantAtual(),
    origem: "painel",
    usuarioId,
    permitirReal: false,
    codigos: codigo ? [codigo] : undefined,
  })
}

export async function salvarRegra(
  regraId: string,
  dados: { prazoDias: number | null; ativa: boolean },
  usuarioId: string
): Promise<{ erro?: string }> {
  const client = await createAdminClient()
  const tenantId = await tenantAtual()
  const { data: atual } = await client
    .from("lgpd_regras_retencao")
    .select("codigo, prazo_minimo_dias, ativa")
    .eq("emp_proprietaria_id", tenantId)
    .eq("id", regraId)
    .maybeSingle()
  if (!atual) return { erro: "Regra não encontrada." }
  const definicao = definicaoRegra(String(atual.codigo))
  if (!definicao) return { erro: "Regra fora do catálogo." }
  const minimo = Number(atual.prazo_minimo_dias ?? 0)
  if (dados.prazoDias != null && (!Number.isInteger(dados.prazoDias) || dados.prazoDias < minimo)) {
    return { erro: `O prazo mínimo desta regra é de ${minimo} dias.` }
  }

  if (dados.ativa && !atual.ativa) {
    // Ligar exige ter visto o que sai: simulação sem erro e recente.
    const { data: sim } = await client
      .from("lgpd_retencao_execucoes")
      .select("iniciada_em, erro")
      .eq("emp_proprietaria_id", tenantId)
      .eq("codigo", atual.codigo)
      .eq("modo", "simulacao")
      .order("iniciada_em", { ascending: false })
      .limit(1)
      .maybeSingle()
    const recente = sim && !sim.erro && new Date(String(sim.iniciada_em)).getTime() >= Date.now() - VALIDADE_SIMULACAO_DIAS * 86_400_000
    if (!recente) return { erro: `Simule a regra antes de ligar a execução real (a simulação vale ${VALIDADE_SIMULACAO_DIAS} dias).` }
  }

  const agora = new Date().toISOString()
  const { error } = await client
    .from("lgpd_regras_retencao")
    .update({
      // A RT30 tem o prazo na configuração de Eventos.
      ...(definicao.prazoNoModulo ? {} : { prazo_dias: dados.prazoDias }),
      ativa: dados.ativa,
      ...(dados.ativa && !atual.ativa ? { ativada_em: agora, ativada_por: usuarioId } : {}),
      updated_at: agora,
    })
    .eq("emp_proprietaria_id", tenantId)
    .eq("id", regraId)
  return error ? { erro: error.message } : {}
}

export async function criarBloqueio(
  dados: { cpf: string | null; email: string | null; motivo: string; processo: string | null },
  usuarioId: string
): Promise<{ erro?: string; campo?: string }> {
  const cpf = dados.cpf?.replace(/\D/g, "") || null
  const email = dados.email?.trim().toLowerCase() || null
  if (!cpf && !email) return { erro: "Informe o CPF ou o e-mail da pessoa.", campo: "cpf" }
  if (cpf && cpf.length !== 11) return { erro: "CPF com 11 dígitos.", campo: "cpf" }
  if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { erro: "E-mail inválido.", campo: "email" }
  if (!dados.motivo.trim()) return { erro: "Diga o motivo do bloqueio.", campo: "motivo" }
  const client = await createAdminClient()
  const { error } = await client.from("lgpd_bloqueios_litigio").insert({
    emp_proprietaria_id: await tenantAtual(),
    cpf,
    email,
    motivo: dados.motivo.trim(),
    processo: dados.processo?.trim() || null,
    criado_por: usuarioId,
  })
  return error ? { erro: error.message } : {}
}

export async function encerrarBloqueio(id: string, usuarioId: string): Promise<{ erro?: string }> {
  const client = await createAdminClient()
  const { error } = await client
    .from("lgpd_bloqueios_litigio")
    .update({ encerrado_em: new Date().toISOString(), encerrado_por: usuarioId })
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("id", id)
    .is("encerrado_em", null)
  return error ? { erro: error.message } : {}
}
