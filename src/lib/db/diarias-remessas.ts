import "server-only"

import { esquemaAusente, nomesDosUsuarios, texto } from "@/lib/db/comum"
import { contaDoGasto, listarContasDiaria, type QuadroDiaria } from "@/lib/db/diarias-config"
import { solicitacoesDaRemessa, type SolicitacaoDiaria } from "@/lib/db/diarias"
import { criarNotificacao } from "@/lib/db/notificacoes"
import { registrarEvento } from "@/lib/db/ordens-ciclo"
import { inserirOrdemVerificada } from "@/lib/db/ordens-verificacao"
import { formatarData, formatarMoeda } from "@/lib/formato"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * REMESSAS DE DIÁRIAS (05/10/2026). Cada diária lançada entra na remessa
 * ABERTA do beneficiário — uma por pessoa e quadro —, que vai acumulando
 * diárias e despesas. Quem gere as diárias ENVIA a remessa para pagamento:
 * nasce UMA ordem com a soma das diárias APROVADAS (líquidas das infrações) e
 * das despesas, com rateio por conta. Diária ainda aguardando avaliação passa
 * para a próxima remessa; reprovada e cancelada ficam registradas, fora da soma.
 *
 * Mesma tabela das remessas migradas do sistema anterior
 * (pessoal_diarias_remessas); as novas não têm bubble_id e têm
 * beneficiario_tipo (supabase/diarias-remessas-autorizacao-custeio.sql).
 */

export type RemessaNova = {
  id: string
  codigo: string | null
  beneficiarioId: string | null
  beneficiarioNome: string | null
  quadro: QuadroDiaria
  departamentoId: string | null
  departamentoNome: string | null
  inicio: string | null
  termino: string | null
  valorTotal: number
  enviada: boolean
  enviadaEm: string | null
  enviadaPor: string | null
  ordemId: string | null
  ordemCodigo: string | null
  ordemSituacao: string | null
  createdAt: string | null
  /** Contagem das diárias por situação. */
  contagem: { aguardando: number; aprovada: number; reprovada: number; cancelada: number }
}

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
]

/** Código no padrão das ordens (AAAA.MMDD.HHMM.SSNN, horário de SP). */
function gerarCodigo(): string {
  const partes = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date())
  const p = (tipo: string) => partes.find((x) => x.type === tipo)?.value ?? "00"
  const aleatorio = String(Math.floor(Math.random() * 100)).padStart(2, "0")
  return `${p("year")}.${p("month")}${p("day")}.${p("hour")}${p("minute")}.${p("second")}${aleatorio}`
}

/** Valor que a diária leva para a remessa: líquida das infrações, mais as despesas. */
export function valorNaRemessa(s: SolicitacaoDiaria): number {
  const liquida = (s.valor_total ?? 0) - (s.valorDescontos ?? 0)
  return Math.round((liquida + s.valorDespesas) * 100) / 100
}

/**
 * A remessa aberta do beneficiário naquele quadro — cria uma se não houver.
 * null quando o SQL das remessas ainda não rodou (o chamador degrada).
 */
export async function garantirRemessaAberta(
  beneficiarioId: string,
  quadro: QuadroDiaria,
  departamentoId: string | null
): Promise<string | null> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data, error } = await admin
    .from("pessoal_diarias_remessas")
    .select("id")
    .eq("emp_proprietaria_id", emp)
    .eq("beneficiario_id", beneficiarioId)
    .eq("beneficiario_tipo", quadro)
    .is("bubble_id", null)
    .not("enviado", "is", true)
    .order("created_at", { ascending: true })
    .limit(1)
  if (error) {
    if (!esquemaAusente(error) && error.code !== "42703") console.error("garantirRemessaAberta:", error.message)
    return null
  }
  if (data?.[0]) return String(data[0].id)

  const agora = new Date()
  const { data: criada, error: erroIns } = await admin
    .from("pessoal_diarias_remessas")
    .insert({
      codigo: gerarCodigo(),
      beneficiario_id: beneficiarioId,
      beneficiario_tipo: quadro,
      departamento_id: departamentoId,
      ano: agora.getFullYear(),
      mes: MESES[agora.getMonth()],
      valor_total: 0,
      enviado: false,
      emp_proprietaria_id: emp,
    })
    .select("id")
    .single()
  if (erroIns) {
    console.error("garantirRemessaAberta (criar):", erroIns.message)
    return null
  }
  return String(criada.id)
}

/** Recalcula total e período da remessa a partir das diárias dela. */
export async function recalcularRemessa(remessaId: string): Promise<void> {
  const solicitacoes = await solicitacoesDaRemessa(remessaId)
  const validas = solicitacoes.filter((s) => s.situacao === "aguardando" || s.situacao === "aprovada")
  const aprovadas = solicitacoes.filter((s) => s.situacao === "aprovada")
  const datas = validas
    .flatMap((s) => [s.data_inicio, s.data_termino])
    .filter((d): d is string => Boolean(d))
    .map((d) => d.slice(0, 10))
    .sort()
  const admin = await createAdminClient()
  await admin
    .from("pessoal_diarias_remessas")
    .update({
      valor_total: Math.round(aprovadas.reduce((a, s) => a + valorNaRemessa(s), 0) * 100) / 100,
      inicio: datas[0] ?? null,
      termino: datas[datas.length - 1] ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", remessaId)
    .not("enviado", "is", true)
}

async function normalizar(brutas: Record<string, unknown>[]): Promise<RemessaNova[]> {
  if (brutas.length === 0) return []
  const admin = await createAdminClient()
  const ids = (campo: string) => [
    ...new Set(brutas.map((r) => texto(r[campo])).filter((v): v is string => Boolean(v))),
  ]
  const deptoIds = ids("departamento_id")
  const ordemIds = ids("ordem_pagamento_id")
  const [nomes, deptos, ordens, contagens] = await Promise.all([
    nomesDosUsuarios([...ids("beneficiario_id"), ...ids("enviado_por")]),
    deptoIds.length
      ? admin.from("empresa_departamentos").select("id, departamento").in("id", deptoIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    ordemIds.length
      ? admin.from("ordens_pagamento").select("id, codigo, situacao").in("id", ordemIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    admin
      .from("pessoal_diarias_solicitacoes")
      .select("remessa_id, situacao")
      .in("remessa_id", brutas.map((r) => String(r.id))),
  ])
  const nomeDepto = new Map(
    ((deptos.data ?? []) as Record<string, unknown>[]).map((d) => [String(d.id), texto(d.departamento)])
  )
  const ordem = new Map(
    ((ordens.data ?? []) as Record<string, unknown>[]).map((o) => [
      String(o.id),
      { codigo: texto(o.codigo), situacao: texto(o.situacao) },
    ])
  )
  const contagem = new Map<string, RemessaNova["contagem"]>()
  for (const s of (contagens.data ?? []) as Record<string, unknown>[]) {
    const id = String(s.remessa_id)
    const c = contagem.get(id) ?? { aguardando: 0, aprovada: 0, reprovada: 0, cancelada: 0 }
    const sit = String(s.situacao) as keyof RemessaNova["contagem"]
    if (sit in c) c[sit]++
    contagem.set(id, c)
  }
  return brutas.map((r) => {
    const id = String(r.id)
    const ordemId = texto(r.ordem_pagamento_id)
    return {
      id,
      codigo: texto(r.codigo),
      beneficiarioId: texto(r.beneficiario_id),
      beneficiarioNome: texto(r.beneficiario_id) ? (nomes.get(String(r.beneficiario_id)) ?? null) : null,
      quadro: r.beneficiario_tipo === "diretor" ? "diretor" : "funcionario",
      departamentoId: texto(r.departamento_id),
      departamentoNome: texto(r.departamento_id) ? (nomeDepto.get(String(r.departamento_id)) ?? null) : null,
      inicio: texto(r.inicio),
      termino: texto(r.termino),
      valorTotal: Number(r.valor_total ?? 0) || 0,
      enviada: r.enviado === true,
      enviadaEm: texto(r.enviado_em),
      enviadaPor: texto(r.enviado_por) ? (nomes.get(String(r.enviado_por)) ?? null) : null,
      ordemId,
      ordemCodigo: ordemId ? (ordem.get(ordemId)?.codigo ?? null) : null,
      ordemSituacao: ordemId ? (ordem.get(ordemId)?.situacao ?? null) : null,
      createdAt: texto(r.created_at),
      contagem: contagem.get(id) ?? { aguardando: 0, aprovada: 0, reprovada: 0, cancelada: 0 },
    }
  })
}

/** Remessas novas de um quadro (abertas primeiro), ou de uma pessoa. */
export async function listarRemessasNovas(filtro: {
  quadro?: QuadroDiaria
  beneficiarioId?: string
}): Promise<{ disponivel: boolean; remessas: RemessaNova[] }> {
  const admin = await createAdminClient()
  let q = admin
    .from("pessoal_diarias_remessas")
    .select("*")
    .eq("emp_proprietaria_id", await tenantAtual())
    .is("bubble_id", null)
  if (filtro.quadro) q = q.eq("beneficiario_tipo", filtro.quadro)
  if (filtro.beneficiarioId) q = q.eq("beneficiario_id", filtro.beneficiarioId)
  const { data, error } = await q
    .order("enviado", { ascending: true })
    .order("created_at", { ascending: false })
    .range(0, 999)
  if (error) {
    if (esquemaAusente(error) || error.code === "42703") return { disponivel: false, remessas: [] }
    throw new Error(`Falha ao listar as remessas de diárias: ${error.message}`)
  }
  return { disponivel: true, remessas: await normalizar((data ?? []) as Record<string, unknown>[]) }
}

export async function obterRemessaNova(
  id: string
): Promise<{ remessa: RemessaNova; solicitacoes: SolicitacaoDiaria[] } | null> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("pessoal_diarias_remessas")
    .select("*")
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
    .is("bubble_id", null)
    .maybeSingle()
  if (error || !data) return null
  const [[remessa], solicitacoes] = await Promise.all([
    normalizar([data as Record<string, unknown>]),
    solicitacoesDaRemessa(id),
  ])
  return { remessa, solicitacoes }
}

/**
 * ENVIA a remessa para pagamento: uma ordem com a soma das diárias aprovadas
 * e das despesas, rateada por conta (quadro × departamento × tipo de gasto).
 * Diárias ainda aguardando passam para uma remessa nova do beneficiário.
 */
export async function enviarRemessaDiarias(
  remessaId: string,
  usuarioId: string
): Promise<{ erro?: string; ordemId?: string; ordemCodigo?: string; movidas?: number }> {
  const dados = await obterRemessaNova(remessaId)
  if (!dados) return { erro: "Remessa não encontrada." }
  const { remessa, solicitacoes } = dados
  if (remessa.enviada) return { erro: "Esta remessa já foi enviada para pagamento." }
  if (!remessa.beneficiarioId) return { erro: "Remessa sem beneficiário." }
  const aprovadas = solicitacoes.filter((s) => s.situacao === "aprovada" && !s.ordem_pagamento_id)
  const aguardando = solicitacoes.filter((s) => s.situacao === "aguardando")
  if (aprovadas.length === 0) {
    return {
      erro: aguardando.length
        ? "Nenhuma diária aprovada nesta remessa ainda — avalie as diárias antes de enviar."
        : "Nenhuma diária aprovada nesta remessa.",
    }
  }

  const admin = await createAdminClient()
  const emp = await tenantAtual()
  // Trava a remessa antes de gerar a ordem: duas pessoas não enviam a mesma.
  const { data: travada, error: erroTrava } = await admin
    .from("pessoal_diarias_remessas")
    .update({ enviado: true, enviado_em: new Date().toISOString(), enviado_por: usuarioId })
    .eq("id", remessaId)
    .not("enviado", "is", true)
    .select("id")
  if (erroTrava) return { erro: `Não foi possível enviar: ${erroTrava.message}` }
  if ((travada ?? []).length === 0) return { erro: "Esta remessa já foi enviada por outra pessoa." }
  const destravar = () =>
    admin
      .from("pessoal_diarias_remessas")
      .update({ enviado: false, enviado_em: null, enviado_por: null })
      .eq("id", remessaId)

  const { contas } = await listarContasDiaria()
  const linhasRateio: { centro: string | null; depto: string | null; descricao: string; valor: number }[] = []
  for (const s of aprovadas) {
    const periodo = s.data_inicio
      ? `${formatarData(s.data_inicio)}${s.data_termino && s.data_termino !== s.data_inicio ? ` a ${formatarData(s.data_termino)}` : ""}`
      : null
    linhasRateio.push({
      centro: contaDoGasto(contas, remessa.quadro, s.departamentoId, null),
      depto: s.departamentoId,
      descricao: [
        `Diária — ${s.tipoNome ?? "(sem tipo)"} × ${s.quantidade ?? 1}`,
        periodo,
        s.valorDescontos ? `líquida de ${formatarMoeda(s.valorDescontos)} em infrações` : null,
      ]
        .filter(Boolean)
        .join(" · "),
      valor: Math.round(((s.valor_total ?? 0) - (s.valorDescontos ?? 0)) * 100) / 100,
    })
    for (const d of s.despesas) {
      linhasRateio.push({
        centro: contaDoGasto(contas, remessa.quadro, s.departamentoId, d.tipoId),
        depto: s.departamentoId,
        descricao: [d.tipoNome ?? "Despesa", d.descricao].filter(Boolean).join(" — "),
        valor: d.valor,
      })
    }
  }
  const total = Math.round(aprovadas.reduce((a, s) => a + valorNaRemessa(s), 0) * 100) / 100
  const totalDiarias = aprovadas.reduce((a, s) => a + ((s.valor_total ?? 0) - (s.valorDescontos ?? 0)), 0)
  const totalDespesas = aprovadas.reduce((a, s) => a + s.valorDespesas, 0)
  const datas = aprovadas
    .flatMap((s) => [s.data_inicio, s.data_termino])
    .filter((d): d is string => Boolean(d))
    .map((d) => d.slice(0, 10))
    .sort()
  const periodo = datas.length ? `${formatarData(datas[0])} a ${formatarData(datas[datas.length - 1])}` : null
  const codigo = gerarCodigo()
  const descricao = [
    `Remessa de diárias ${remessa.codigo ?? ""} — ${aprovadas.length} diária(s) de ${remessa.beneficiarioNome ?? "beneficiário"}`,
    remessa.quadro === "diretor" ? "(diretoria)" : null,
    periodo ? `período ${periodo}.` : ".",
    `Diárias ${formatarMoeda(totalDiarias)}${totalDespesas ? ` + despesas ${formatarMoeda(totalDespesas)}` : ""}.`,
  ]
    .filter(Boolean)
    .join(" ")
    .replace(" .", ".")

  const { data: ordem, error: erroOrdem } = await inserirOrdemVerificada(
    {
      codigo,
      tipo: "Diária",
      descricao,
      situacao: "Em autorização",
      valor_inicial_cobranca: total,
      beneficiario_usuario_id: remessa.beneficiarioId,
      centro_custo_despesa_id: linhasRateio[0]?.centro ?? null,
      departamento_id: remessa.departamentoId ?? aprovadas[0].departamentoId,
      emp_proprietaria_id: emp,
    },
    { dataInicio: datas[0] ?? null }
  )
  if (erroOrdem || !ordem) {
    await destravar()
    return { erro: `Não foi possível gerar a ordem de pagamento: ${erroOrdem?.message}` }
  }

  if (linhasRateio.length > 1) {
    const { error: erroRateio } = await admin.from("ordens_pagamento_rateio").insert(
      linhasRateio.map((l, i) => ({
        ordem_id: ordem.id,
        centro_custo_despesa_id: l.centro,
        departamento_id: l.depto,
        descricao: l.descricao,
        valor: l.valor,
        ordem: i,
        emp_proprietaria_id: emp,
      }))
    )
    if (erroRateio && !esquemaAusente(erroRateio)) {
      console.error("Rateio da remessa de diárias:", erroRateio.message)
    }
  }

  const { error: erroLiga } = await admin
    .from("pessoal_diarias_solicitacoes")
    .update({ ordem_pagamento_id: ordem.id, updated_at: new Date().toISOString() })
    .in("id", aprovadas.map((s) => s.id))
  await admin
    .from("pessoal_diarias_remessas")
    .update({ ordem_pagamento_id: ordem.id, valor_total: total, inicio: datas[0] ?? null, termino: datas[datas.length - 1] ?? null })
    .eq("id", remessaId)
  if (erroLiga) {
    // Sem o vínculo das diárias a ordem perde o detalhamento: desfaz tudo.
    await admin.from("ordens_pagamento").delete().eq("id", ordem.id)
    await destravar()
    return { erro: `Não foi possível vincular as diárias à ordem: ${erroLiga.message}` }
  }

  // Diárias ainda sem avaliação seguem para a próxima remessa do beneficiário.
  let movidas = 0
  if (aguardando.length) {
    const nova = await garantirRemessaAberta(remessa.beneficiarioId, remessa.quadro, remessa.departamentoId)
    if (nova) {
      const { data: mv } = await admin
        .from("pessoal_diarias_solicitacoes")
        .update({ remessa_id: nova })
        .in("id", aguardando.map((s) => s.id))
        .select("id")
      movidas = (mv ?? []).length
      await recalcularRemessa(nova)
    }
  }

  await registrarEvento(
    ordem.id,
    "criada",
    usuarioId,
    `Gerada pelo envio da remessa de diárias ${remessa.codigo ?? ""} (${aprovadas.length} diária(s)).`,
    { remessa_id: remessaId, diarias: aprovadas.map((s) => s.id) }
  )
  try {
    await criarNotificacao({
      usuarioId: remessa.beneficiarioId,
      texto: `Sua remessa de diárias ${remessa.codigo ?? ""} foi enviada para pagamento: ${aprovadas.length} diária(s), ${formatarMoeda(total)}. Ordem ${codigo}.`,
    })
  } catch (e) {
    console.error("Aviso do envio da remessa:", e)
  }
  return { ordemId: ordem.id, ordemCodigo: codigo, movidas }
}
