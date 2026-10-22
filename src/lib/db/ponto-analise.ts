import "server-only"

import { esquemaAusente, lerEmLotesPorIds, nomesDosUsuarios, texto } from "@/lib/db/comum"
import { avaliarJornada, type MarcacoesEspelho, type OcorrenciasJornada } from "@/lib/db/ponto-marcacoes"
import { faixasHoraExtra } from "@/lib/db/ponto-config"
import type { FaixasHE } from "@/lib/faixas-he"
import { hhmm } from "@/lib/horas"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * INDICADORES DO CONTROLE DE PONTO (16/10/2026) — por remessa (mês), por ano
 * e por departamento no ano. Base: as horas lançadas em cada registro
 * (realizadas nas duas faixas de hora extra — colunas _70 e _100, com o
 * percentual da entidade em pessoal_folha_config —, pagas e saldo do banco,
 * em horas DECIMAIS), as
 * marcações diárias lidas do espelho quando houver (lib/db/ponto-marcacoes)
 * e as ausências do mesmo período (atestados, faltas justificadas e
 * injustificadas). Os alertas por funcionário são regras fixas, conferíveis;
 * a resenha da IA parte deles.
 *
 * Departamento: o do cadastro de departamentos (integrante ou coordenador);
 * sem ele, o do espelho; sem ele, a lotação do vínculo. É o departamento de
 * HOJE — para anos passados, quem mudou de área aparece na área atual.
 */

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
]

/** Acima disso no mês, a média passa de 2 h extras por dia útil (art. 59). */
export const LIMITE_HE_MES = 44
/** Banco de horas a partir do qual vale olhar a compensação. */
export const LIMITE_SALDO = 40

export type TipoOcorrencia =
  | "jornadaAcima10"
  | "intervaloCurto"
  | "interjornadaCurta"
  | "domingoFeriado"
  | "seteDiasSeguidos"
  | "incompletas"

export const OCORRENCIAS: { id: TipoOcorrencia; rotulo: string; fundamento: string }[] = [
  { id: "jornadaAcima10", rotulo: "Jornada acima de 10 h", fundamento: "art. 59 da CLT (até 2 h extras por dia)" },
  { id: "intervaloCurto", rotulo: "Intervalo menor que 1 h", fundamento: "art. 71 da CLT" },
  { id: "interjornadaCurta", rotulo: "Menos de 11 h entre jornadas", fundamento: "art. 66 da CLT" },
  { id: "domingoFeriado", rotulo: "Domingo ou feriado trabalhado", fundamento: "arts. 67 e 70 da CLT; Lei 605/49" },
  { id: "seteDiasSeguidos", rotulo: "7 dias seguidos sem folga", fundamento: "OJ 410 da SDI-1 do TST" },
  { id: "incompletas", rotulo: "Marcação incompleta", fundamento: "art. 74 da CLT" },
]

export type RegistroAnalise = {
  id: string
  remessaId: string
  competencia: string
  funcionarioId: string
  nome: string
  departamento: { chave: string; nome: string }
  he70: number
  he100: number
  he: number
  pagas: number
  saldo: number
  saldo70: number
  saldo100: number
  temEspelho: boolean
  lido: boolean
  espelhoErro: string | null
  jornada: OcorrenciasJornada | null
}

export type FuncionarioAnalise = {
  id: string
  nome: string
  departamento: string
  he: number
  he100: number
  mesesComHE: number
  meses: number
  maiorHEMes: number
  saldo: number
  atestados: number
  diasAtestado: number
  faltasJustificadas: number
  faltasInjustificadas: number
  ocorrencias: Record<TipoOcorrencia, number>
  britanico: boolean
  alertas: string[]
  pontuacao: number
}

export type DepartamentoAnalise = {
  chave: string
  nome: string
  funcionarios: number
  he: number
  heMedia: number
  he100: number
  saldo: number
  ocorrencias: number
  emAtencao: number
}

export type Indicadores = {
  /** Percentual de cada faixa de hora extra na entidade. */
  faixas: FaixasHE
  escopo: "remessa" | "ano" | "departamento"
  rotulo: string
  competencias: string[]
  mesesSemRemessa: string[]
  funcionarios: number
  comHE: number
  he: number
  he70: number
  he100: number
  pagas: number
  heMediaPorFuncionario: number
  saldo: number
  espelhos: number
  espelhosLidos: number
  espelhosEscaneados: number
  atestados: number
  diasAtestado: number
  faltasInjustificadas: number
  ocorrencias: Record<TipoOcorrencia, { total: number; funcionarios: number }>
  britanicos: number
  serie: { competencia: string; he70: number; he100: number; comHE: number; funcionarios: number; saldo: number }[]
  departamentos: DepartamentoAnalise[]
  pessoas: FuncionarioAnalise[]
}

const n = (v: unknown) => {
  const x = Number(v ?? 0)
  return Number.isFinite(x) ? x : 0
}
// Duas casas: mostradas em HH:MM, uma casa só daria saltos de 6 minutos.
const r2 = (v: number) => Math.round(v * 100) / 100

export function rotuloCompetenciaPonto(c: string): string {
  const [a, m] = c.split("-")
  return `${MESES[Number(m) - 1]}/${a}`
}

function competenciaDaRemessa(r: Record<string, unknown>): string | null {
  const ano = texto(r.ano_referencia_os)
  const mes = MESES.indexOf(String(r.mes_referencia_os ?? ""))
  if (ano && /^\d{4}$/.test(ano) && mes >= 0) return `${ano}-${String(mes + 1).padStart(2, "0")}`
  const m = /(janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\D*(\d{4})/i.exec(
    String(r.nome_remessa ?? "")
  )
  if (!m) return null
  const i = MESES.findIndex((x) => x.toLowerCase() === m[1].toLowerCase())
  return `${m[2]}-${String(i + 1).padStart(2, "0")}`
}

// ── Saldos da remessa anterior ───────────────────────────────────────────────

export type SaldoAnteriorPonto = { saldo70: number | null; saldo100: number | null; remessa: string }

/**
 * Para lançar uma remessa: o saldo remanescente de cada funcionário na remessa
 * ANTERIOR em que ele aparece (pela competência — mês e ano de referência —,
 * não pela ordem de criação: remessas antigas são lançadas fora de ordem).
 */
export async function saldosAnterioresPonto(remessaId: string): Promise<Record<string, SaldoAnteriorPonto>> {
  const admin = await createAdminClient()
  const { data: rems } = await admin
    .from("pessoal_registro_ponto_remessas")
    .select("id, nome_remessa, mes_referencia_os, ano_referencia_os")
    .eq("emp_proprietaria_id", await tenantAtual())
  const remessas = ((rems ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    competencia: competenciaDaRemessa(r),
    nome: texto(r.nome_remessa) ?? "(sem nome)",
  }))
  const atual = remessas.find((r) => r.id === remessaId)?.competencia
  if (!atual) return {}
  const anteriores = remessas.filter((r) => r.competencia && r.competencia < atual)
  if (anteriores.length === 0) return {}
  const info = new Map(anteriores.map((r) => [r.id, r]))
  const regs = await lerEmLotesPorIds<Record<string, unknown>>([...info.keys()], (fatia, de, ate) =>
    admin
      .from("pessoal_registro_ponto")
      .select("id, remessa_id, funcionario_id, saldo_remanescente_70, saldo_remanescente_100")
      .in("remessa_id", fatia)
      .order("id")
      .range(de, ate)
  )
  const melhor = new Map<string, { competencia: string; reg: Record<string, unknown> }>()
  for (const r of regs) {
    const f = texto(r.funcionario_id)
    const comp = info.get(String(r.remessa_id))?.competencia
    if (!f || !comp) continue
    const atualF = melhor.get(f)
    if (!atualF || comp > atualF.competencia) melhor.set(f, { competencia: comp, reg: r })
  }
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v))
  return Object.fromEntries(
    [...melhor].map(([f, { reg }]) => [
      f,
      {
        saldo70: num(reg.saldo_remanescente_70),
        saldo100: num(reg.saldo_remanescente_100),
        remessa: info.get(String(reg.remessa_id))?.nome ?? "",
      },
    ])
  )
}

// ── Base ─────────────────────────────────────────────────────────────────────

export type BasePonto = {
  remessas: { id: string; competencia: string; nome: string }[]
  registros: RegistroAnalise[]
  ausencias: Map<string, { atestados: number; diasAtestado: number; justificadas: number; injustificadas: number }>
  departamentos: { chave: string; nome: string }[]
  marcacoesDisponiveis: boolean
  faixas: FaixasHE
}

/** Tudo de uma vez (são poucas centenas de registros por ano). */
export async function carregarBasePonto(): Promise<BasePonto> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data: rems } = await admin
    .from("pessoal_registro_ponto_remessas")
    .select("id, nome_remessa, mes_referencia_os, ano_referencia_os")
    .eq("emp_proprietaria_id", emp)
  const remessas = ((rems ?? []) as Record<string, unknown>[])
    .map((r) => ({ id: String(r.id), competencia: competenciaDaRemessa(r), nome: texto(r.nome_remessa) ?? "(sem nome)" }))
    .filter((r): r is { id: string; competencia: string; nome: string } => Boolean(r.competencia))
    .sort((a, b) => a.competencia.localeCompare(b.competencia))
  const compDe = new Map(remessas.map((r) => [r.id, r.competencia]))

  const colunas =
    "id, remessa_id, funcionario_id, arquivo, horas_realizadas_70, horas_pagas_70, saldo_remanescente_70, horas_realizadas_100, horas_pagas_100, saldo_remanescente_100"
  let marcacoesDisponiveis = true
  let brutos: Record<string, unknown>[]
  try {
    brutos = await lerEmLotesPorIds([...compDe.keys()], (fatia, de, ate) =>
      admin
        .from("pessoal_registro_ponto")
        .select(`${colunas}, marcacoes, marcacoes_erro`)
        .in("remessa_id", fatia)
        .order("id")
        .range(de, ate)
    )
  } catch (e) {
    if (!esquemaAusente(e as { code?: string })) throw e
    marcacoesDisponiveis = false
    brutos = await lerEmLotesPorIds([...compDe.keys()], (fatia, de, ate) =>
      admin.from("pessoal_registro_ponto").select(colunas).in("remessa_id", fatia).order("id").range(de, ate)
    )
  }
  brutos = brutos.filter((b) => texto(b.funcionario_id))
  const ids = [...new Set(brutos.map((b) => String(b.funcionario_id)))]

  // Departamentos: cadastro → espelho → lotação.
  const [{ data: deps }, { data: integ }, { data: vincs }, nomes] = await Promise.all([
    admin.from("empresa_departamentos").select("id, departamento, coordenador_id, legado").eq("emp_proprietaria_id", emp),
    ids.length
      ? admin.from("empresa_departamentos_integrantes").select("departamento_id, usuario_id").in("usuario_id", ids)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    ids.length
      ? admin.from("vinculos_trabalhistas").select("trabalhador_id, lotacao, contrato_demissao").eq("empregador_id", emp).in("trabalhador_id", ids)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    nomesDosUsuarios(ids),
  ])
  const ativos = ((deps ?? []) as Record<string, unknown>[]).filter((d) => d.legado !== true)
  const nomeDep = new Map(ativos.map((d) => [String(d.id), texto(d.departamento) ?? "(sem nome)"]))
  const depDe = new Map<string, string>()
  for (const i of (integ ?? []) as Record<string, unknown>[]) {
    const u = String(i.usuario_id)
    if (!depDe.has(u) && nomeDep.has(String(i.departamento_id))) depDe.set(u, String(i.departamento_id))
  }
  for (const d of ativos) {
    const c = texto(d.coordenador_id)
    if (c && ids.includes(c) && !depDe.has(c)) depDe.set(c, String(d.id))
  }
  const lotacao = new Map<string, string>()
  for (const v of (vincs ?? []) as Record<string, unknown>[]) {
    const l = texto(v.lotacao)
    if (l && (!lotacao.has(String(v.trabalhador_id)) || !v.contrato_demissao)) lotacao.set(String(v.trabalhador_id), l)
  }
  const espelhoDep = new Map<string, string>()
  for (const b of brutos) {
    const d = texto((b.marcacoes as MarcacoesEspelho | null)?.departamento)
    if (d) espelhoDep.set(String(b.funcionario_id), d)
  }
  const departamentoDe = (f: string) => {
    const id = depDe.get(f)
    if (id) return { chave: id, nome: nomeDep.get(id)! }
    const nome = espelhoDep.get(f) ?? lotacao.get(f)
    if (!nome) return { chave: "sem", nome: "Sem departamento" }
    // Casa com um departamento cadastrado de mesmo nome, se houver.
    const igual = [...nomeDep].find(([, x]) => x.localeCompare(nome, "pt-BR", { sensitivity: "base" }) === 0)
    return igual ? { chave: igual[0], nome: igual[1] } : { chave: `nome:${nome.toLowerCase()}`, nome }
  }

  const registros: RegistroAnalise[] = brutos.map((b) => {
    const f = String(b.funcionario_id)
    const he70 = n(b.horas_realizadas_70)
    const he100 = n(b.horas_realizadas_100)
    const marc = (b.marcacoes ?? null) as MarcacoesEspelho | null
    return {
      id: String(b.id),
      remessaId: String(b.remessa_id),
      competencia: compDe.get(String(b.remessa_id))!,
      funcionarioId: f,
      nome: nomes.get(f) ?? "(sem nome)",
      departamento: departamentoDe(f),
      he70,
      he100,
      he: he70 + he100,
      pagas: n(b.horas_pagas_70) + n(b.horas_pagas_100),
      saldo: n(b.saldo_remanescente_70) + n(b.saldo_remanescente_100),
      saldo70: n(b.saldo_remanescente_70),
      saldo100: n(b.saldo_remanescente_100),
      temEspelho: Boolean(texto(b.arquivo)),
      lido: Boolean(marc?.dias?.length),
      espelhoErro: texto(b.marcacoes_erro),
      jornada: avaliarJornada(marc),
    }
  })

  // Ausências por funcionário e mês (chave "funcionario|AAAA-MM").
  const anos = [...new Set(remessas.map((r) => r.competencia.slice(0, 4)))].sort()
  const ausencias = new Map<string, { atestados: number; diasAtestado: number; justificadas: number; injustificadas: number }>()
  if (ids.length && anos.length) {
    const de = `${anos[0]}-01-01`
    const ate = `${anos[anos.length - 1]}-12-31`
    const [ats, fjs, aus] = await Promise.all([
      lerEmLotesPorIds(ids, (fatia, a, b) =>
        admin.from("pes_atestados_medicos").select("id, funcionario_id, inicio, quantidade_dias").in("funcionario_id", fatia)
          .gte("inicio", de).lte("inicio", ate).order("id").range(a, b)
      ),
      lerEmLotesPorIds(ids, (fatia, a, b) =>
        admin.from("pessoal_faltas_justificadas").select("id, funcionario_id, data_falta").in("funcionario_id", fatia)
          .eq("autorizado", true).gte("data_falta", de).lte("data_falta", ate).order("id").range(a, b)
      ).catch(() => []),
      lerEmLotesPorIds(ids, (fatia, a, b) =>
        admin.from("pessoal_ausencias").select("id, funcionario_id, inicio").in("funcionario_id", fatia)
          .eq("motivo", "Falta injustificada").gte("inicio", de).lte("inicio", ate).order("id").range(a, b)
      ),
    ])
    const somar = (f: unknown, d: unknown, campo: "atestados" | "justificadas" | "injustificadas", dias = 0) => {
      const data = texto(d)
      if (!texto(f) || !data) return
      const k = `${f}|${data.slice(0, 7)}`
      const atual = ausencias.get(k) ?? { atestados: 0, diasAtestado: 0, justificadas: 0, injustificadas: 0 }
      atual[campo]++
      if (campo === "atestados") atual.diasAtestado += dias
      ausencias.set(k, atual)
    }
    for (const a of ats as Record<string, unknown>[]) somar(a.funcionario_id, a.inicio, "atestados", n(a.quantidade_dias) || 1)
    for (const f of fjs as Record<string, unknown>[]) somar(f.funcionario_id, f.data_falta, "justificadas")
    for (const a of aus as Record<string, unknown>[]) somar(a.funcionario_id, a.inicio, "injustificadas")
  }

  const departamentos = [
    ...new Map(registros.map((r) => [r.departamento.chave, r.departamento])).values(),
  ].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))

  return { remessas, registros, ausencias, departamentos, marcacoesDisponiveis, faixas: await faixasHoraExtra() }
}

// ── Indicadores ──────────────────────────────────────────────────────────────

const zeroOcorr = (): Record<TipoOcorrencia, number> => ({
  jornadaAcima10: 0,
  intervaloCurto: 0,
  interjornadaCurta: 0,
  domingoFeriado: 0,
  seteDiasSeguidos: 0,
  incompletas: 0,
})

export function indicadoresDe(
  base: BasePonto,
  filtro: { escopo: "remessa"; remessaId: string } | { escopo: "ano"; ano: string } | { escopo: "departamento"; ano: string; departamento: string }
): Indicadores {
  const regs = base.registros.filter((r) =>
    filtro.escopo === "remessa"
      ? r.remessaId === filtro.remessaId
      : r.competencia.startsWith(filtro.ano) && (filtro.escopo === "ano" || r.departamento.chave === filtro.departamento)
  )
  const competencias = [...new Set(regs.map((r) => r.competencia))].sort()
  const remessa = filtro.escopo === "remessa" ? base.remessas.find((r) => r.id === filtro.remessaId) : null
  if (remessa && !competencias.includes(remessa.competencia)) competencias.push(remessa.competencia)

  // Meses do ano sem remessa (até o mês atual, no ano corrente).
  const mesesSemRemessa: string[] = []
  if (filtro.escopo !== "remessa") {
    const hoje = new Date().toISOString().slice(0, 7)
    const doAno = new Set(base.remessas.filter((r) => r.competencia.startsWith(filtro.ano)).map((r) => r.competencia))
    for (let m = 1; m <= 12; m++) {
      const c = `${filtro.ano}-${String(m).padStart(2, "0")}`
      if (c < hoje && !doAno.has(c)) mesesSemRemessa.push(c)
    }
  }

  // Histórico de cada funcionário (para tendência do banco na remessa).
  const historico = new Map<string, RegistroAnalise[]>()
  for (const r of base.registros) {
    const l = historico.get(r.funcionarioId) ?? []
    l.push(r)
    historico.set(r.funcionarioId, l)
  }
  for (const l of historico.values()) l.sort((a, b) => a.competencia.localeCompare(b.competencia))

  const porFunc = new Map<string, RegistroAnalise[]>()
  for (const r of regs) {
    const l = porFunc.get(r.funcionarioId) ?? []
    l.push(r)
    porFunc.set(r.funcionarioId, l)
  }

  const pessoas: FuncionarioAnalise[] = []
  for (const [f, lista] of porFunc) {
    lista.sort((a, b) => a.competencia.localeCompare(b.competencia))
    const ultimo = lista[lista.length - 1]
    const ocorrencias = zeroOcorr()
    let britanico = false
    for (const r of lista) {
      if (!r.jornada) continue
      for (const o of OCORRENCIAS) ocorrencias[o.id] += r.jornada[o.id].length
      britanico ||= r.jornada.britanico
    }
    const aus = { atestados: 0, diasAtestado: 0, justificadas: 0, injustificadas: 0 }
    for (const c of competencias) {
      const a = base.ausencias.get(`${f}|${c}`)
      if (!a) continue
      aus.atestados += a.atestados
      aus.diasAtestado += a.diasAtestado
      aus.justificadas += a.justificadas
      aus.injustificadas += a.injustificadas
    }
    const he = lista.reduce((s, r) => s + r.he, 0)
    const he100 = lista.reduce((s, r) => s + r.he100, 0)
    const mesesComHE = lista.filter((r) => r.he > 0).length
    const maiorHEMes = Math.max(...lista.map((r) => r.he), 0)
    const alertas: string[] = []
    let pontuacao = 0
    const mesesAcima = lista.filter((r) => r.he > LIMITE_HE_MES).length
    if (mesesAcima > 0) {
      alertas.push(
        filtro.escopo === "remessa"
          ? `${hhmm(maiorHEMes)} de horas extras no mês — média acima de 2 h por dia útil (art. 59)`
          : `${mesesAcima} mês(es) com média acima de 2 h extras por dia útil (art. 59)`
      )
      pontuacao += 3 * mesesAcima
    }
    // Habitualidade: olha o histórico até a competência (na remessa, os 6 meses anteriores).
    const hist = (historico.get(f) ?? []).filter((r) => r.competencia <= ultimo.competencia)
    const janela = filtro.escopo === "remessa" ? hist.slice(-6) : lista
    const comHEJanela = janela.filter((r) => r.he > 0).length
    if (janela.length >= 3 && comHEJanela / janela.length >= 0.5 && comHEJanela >= 3) {
      alertas.push(`Horas extras habituais: ${comHEJanela} de ${janela.length} meses (integram a remuneração; Súmula 291 do TST se forem suprimidas)`)
      pontuacao += 2
    }
    if (ultimo.saldo >= LIMITE_SALDO) {
      alertas.push(`Banco de horas com ${hhmm(ultimo.saldo)} — conferir o prazo de compensação (art. 59, §§ 2º e 5º)`)
      pontuacao += 2
    }
    const ult3 = hist.slice(-3)
    if (ult3.length === 3 && ult3[0].saldo < ult3[1].saldo && ult3[1].saldo < ult3[2].saldo && ult3[2].saldo > 0) {
      alertas.push("Banco de horas crescendo há 3 remessas seguidas")
      pontuacao += 1
    }
    // Faixa 2 = domingo, feriado ou folga trabalhada; alerta a partir de um dia (8 h) no mês.
    const mesesCom100 = lista.filter((r) => r.he100 >= 8).length
    if (mesesCom100 > 0) {
      alertas.push(
        filtro.escopo === "remessa"
          ? `${hhmm(he100)} a ${base.faixas["100"]} no mês (domingos, feriados ou folgas trabalhadas)`
          : `${hhmm(he100)} a ${base.faixas["100"]} no período, ${mesesCom100} mês(es) com 8 h ou mais (domingos, feriados ou folgas)`
      )
      pontuacao += mesesCom100
    }
    for (const o of OCORRENCIAS) {
      if (ocorrencias[o.id] > 0) {
        alertas.push(`${o.rotulo}: ${ocorrencias[o.id]} vez(es) — ${o.fundamento}`)
        pontuacao += o.id === "incompletas" ? 1 : 2
      }
    }
    if (britanico) {
      alertas.push("Horários de entrada e saída praticamente invariáveis (ponto \"britânico\" — Súmula 338 do TST)")
      pontuacao += 2
    }
    if (aus.atestados >= 3 || aus.diasAtestado >= 10) {
      const sobrecarga = maiorHEMes > LIMITE_HE_MES || he / Math.max(1, lista.length) >= LIMITE_HE_MES / 2
      alertas.push(
        `${aus.atestados} atestado(s), ${aus.diasAtestado} dia(s)${sobrecarga ? " junto com muitas horas extras — possível sobrecarga" : ""}`
      )
      pontuacao += sobrecarga ? 3 : 1
    }
    if (aus.injustificadas > 0) {
      alertas.push(`${aus.injustificadas} falta(s) injustificada(s)`)
      pontuacao += 1
    }
    pessoas.push({
      id: f,
      nome: ultimo.nome,
      departamento: ultimo.departamento.nome,
      he: r2(he),
      he100: r2(he100),
      mesesComHE,
      meses: lista.length,
      maiorHEMes: r2(maiorHEMes),
      saldo: r2(ultimo.saldo),
      atestados: aus.atestados,
      diasAtestado: aus.diasAtestado,
      faltasJustificadas: aus.justificadas,
      faltasInjustificadas: aus.injustificadas,
      ocorrencias,
      britanico,
      alertas,
      pontuacao,
    })
  }
  pessoas.sort((a, b) => b.pontuacao - a.pontuacao || b.he - a.he || a.nome.localeCompare(b.nome, "pt-BR"))

  const ocorrencias = Object.fromEntries(
    OCORRENCIAS.map((o) => [
      o.id,
      { total: pessoas.reduce((s, p) => s + p.ocorrencias[o.id], 0), funcionarios: pessoas.filter((p) => p.ocorrencias[o.id] > 0).length },
    ])
  ) as Indicadores["ocorrencias"]

  const departamentos = new Map<string, DepartamentoAnalise>()
  for (const p of pessoas) {
    const reg = porFunc.get(p.id)![0]
    const d = departamentos.get(reg.departamento.chave) ?? {
      chave: reg.departamento.chave,
      nome: reg.departamento.nome,
      funcionarios: 0,
      he: 0,
      heMedia: 0,
      he100: 0,
      saldo: 0,
      ocorrencias: 0,
      emAtencao: 0,
    }
    d.funcionarios++
    d.he += p.he
    d.he100 += p.he100
    d.saldo += p.saldo
    d.ocorrencias += Object.values(p.ocorrencias).reduce((s, x) => s + x, 0)
    if (p.alertas.length) d.emAtencao++
    departamentos.set(d.chave, d)
  }
  for (const d of departamentos.values()) {
    d.he = r2(d.he)
    d.he100 = r2(d.he100)
    d.saldo = r2(d.saldo)
    d.heMedia = r2(d.he / Math.max(1, d.funcionarios))
  }

  const serie = competencias.map((c) => {
    const doMes = regs.filter((r) => r.competencia === c)
    return {
      competencia: c,
      he70: r2(doMes.reduce((s, r) => s + r.he70, 0)),
      he100: r2(doMes.reduce((s, r) => s + r.he100, 0)),
      comHE: doMes.filter((r) => r.he > 0).length,
      funcionarios: doMes.length,
      saldo: r2(doMes.reduce((s, r) => s + r.saldo, 0)),
    }
  })

  const he = regs.reduce((s, r) => s + r.he, 0)
  const rotulo =
    filtro.escopo === "remessa"
      ? (remessa?.nome ?? "Remessa")
      : filtro.escopo === "ano"
        ? `Ano de ${filtro.ano}`
        : `${base.departamentos.find((d) => d.chave === filtro.departamento)?.nome ?? "Departamento"} — ${filtro.ano}`

  return {
    faixas: base.faixas,
    escopo: filtro.escopo,
    rotulo,
    competencias,
    mesesSemRemessa,
    funcionarios: pessoas.length,
    comHE: pessoas.filter((p) => p.he > 0).length,
    he: r2(he),
    he70: r2(regs.reduce((s, r) => s + r.he70, 0)),
    he100: r2(regs.reduce((s, r) => s + r.he100, 0)),
    pagas: r2(regs.reduce((s, r) => s + r.pagas, 0)),
    heMediaPorFuncionario: r2(he / Math.max(1, pessoas.length)),
    saldo: r2(pessoas.reduce((s, p) => s + p.saldo, 0)),
    espelhos: regs.filter((r) => r.temEspelho).length,
    espelhosLidos: regs.filter((r) => r.lido).length,
    espelhosEscaneados: regs.filter((r) => !r.lido && /escaneado/i.test(r.espelhoErro ?? "")).length,
    atestados: pessoas.reduce((s, p) => s + p.atestados, 0),
    diasAtestado: pessoas.reduce((s, p) => s + p.diasAtestado, 0),
    faltasInjustificadas: pessoas.reduce((s, p) => s + p.faltasInjustificadas, 0),
    ocorrencias,
    britanicos: pessoas.filter((p) => p.britanico).length,
    serie,
    departamentos: [...departamentos.values()].sort((a, b) => b.he - a.he),
    pessoas,
  }
}

/** Anos com remessa, do mais recente ao mais antigo. */
export function anosDaBase(base: BasePonto): string[] {
  return [...new Set(base.remessas.map((r) => r.competencia.slice(0, 4)))].sort().reverse()
}
