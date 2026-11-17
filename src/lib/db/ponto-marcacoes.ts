import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"
import { extractText, getDocumentProxy } from "unpdf"

import { esquemaAusente, nomesDosUsuarios, texto } from "@/lib/db/comum"
import { gerarJsonIADePdf, type EsquemaJsonIA } from "@/lib/ia"
import { mesclarLeitura, type AjusteMarcacao, type MarcacoesEspelho } from "@/lib/ponto-marcacoes-ajuste"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * MARCAÇÕES DO ESPELHO DE PONTO (16/10/2026).
 *
 * A IA lê o espelho (cartão ponto do Secullum, um PDF por funcionário) e
 * devolve as marcações de cada dia; o código — não a IA — confere as regras
 * da CLT sobre elas (jornada, intervalos, descanso). Só espelhos com TEXTO são
 * lidos: os escaneados que vieram do Bubble ficam de fora (decisão do usuário,
 * pelo custo), e a análise deles usa só os números de horas extras.
 */

// Tipos na parte pura (o ajuste à mão também os usa — lib/ponto-marcacoes-ajuste).
export type { DiaMarcado, MarcacoesEspelho } from "@/lib/ponto-marcacoes-ajuste"

export type OcorrenciasJornada = {
  diasTrabalhados: number
  /** Jornada acima de 10 h no dia (art. 59 CLT: no máximo 2 h extras/dia). */
  jornadaAcima10: string[]
  /** Mais de 6 h trabalhadas sem 1 h de intervalo (art. 71). */
  intervaloCurto: string[]
  /** Menos de 11 h entre o fim de uma jornada e o início da seguinte (art. 66). */
  interjornadaCurta: string[]
  /** Trabalho em domingo ou feriado (art. 67 e 70; Lei 605/49). */
  domingoFeriado: string[]
  /** Sequências de 7 ou mais dias seguidos trabalhados, sem folga (OJ 410 TST). */
  seteDiasSeguidos: string[]
  /** Dia com número ímpar de batidas (registro incompleto). */
  incompletas: string[]
  /** Horários de entrada e saída idênticos em quase todos os dias (Súmula 338 TST). */
  britanico: boolean
  /** Maior jornada do mês, em minutos. */
  maiorJornadaMin: number
}

const ESQUEMA: EsquemaJsonIA = {
  nome: "espelho_ponto",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["departamento", "carga_diaria", "jornada", "dias"],
    properties: {
      departamento: { type: ["string", "null"] },
      carga_diaria: { type: ["string", "null"] },
      jornada: {
        type: "object",
        additionalProperties: false,
        required: ["dom", "seg", "ter", "qua", "qui", "sex", "sab"],
        properties: Object.fromEntries(
          ["dom", "seg", "ter", "qua", "qui", "sex", "sab"].map((k) => [k, { type: "array", items: { type: "string" } }])
        ),
      },
      dias: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["data", "ocorrencia", "marcacoes"],
          properties: {
            data: { type: "string" },
            ocorrencia: { type: ["string", "null"] },
            marcacoes: { type: "array", items: { type: "string" } },
          },
        },
      },
    },
  },
}

const SISTEMA = `Você lê espelhos de ponto (cartão ponto) brasileiros e devolve as marcações de cada dia, sem interpretar.
Regras:
- "dias": um item por linha de data do cartão, em ordem. "data" no formato AAAA-MM-DD.
- "marcacoes": os horários batidos (ENTRADA 1, SAÍDA 1, ENTRADA 2, SAÍDA 2, ENTRADA 3, SAÍDA 3) na ordem, formato HH:MM. Não inclua as colunas de totais (NORMAIS, BTOTAL, FALTAS, EXTRAS, BSALDO, NOT.), nem saldos como "+05:01". Horário seguido de asterisco ou marcado como incluído manualmente conta como batida.
- "ocorrencia": quando o dia traz uma palavra em vez de horários (Feriado, Férias, Falta, Atestado, Folga, Compensado, Recesso, DSR, Abonado…), coloque essa palavra; senão null. Se houver horários E a palavra Feriado, mantenha os dois.
- "departamento": o campo DEPARTAMENTO do cabeçalho; "carga_diaria": a carga de segunda-feira no quadro HORÁRIO DE TRABALHO (HH:MM). null se não houver.
- "jornada": o quadro HORÁRIO DE TRABALHO, um item por dia da semana (dom, seg, ter, qua, qui, sex, sab) com os horários previstos em ordem (ENTRADA 1, SAÍDA 1, ENTRADA 2, SAÍDA 2…), HH:MM. Se o quadro trouxer só a carga do dia (um valor), devolva só ele. Dia sem horário ou com 00:00: [].
Não invente horários: dia sem batida tem "marcacoes": [].`

/** Lê o espelho de um registro e guarda as marcações. */
export async function lerEspelhoDoRegistro(registroId: string): Promise<{ erro?: string; pulado?: string }> {
  const admin = await createAdminClient()
  const { data: reg } = await admin.from("pessoal_registro_ponto").select("id, arquivo, marcacoes").eq("id", registroId).maybeSingle()
  const caminho = texto(reg?.arquivo)
  if (!reg || !caminho) return { pulado: "Registro sem espelho." }
  const gravar = (campos: Record<string, unknown>) =>
    admin.from("pessoal_registro_ponto").update(campos).eq("id", registroId)

  const { data: blob, error } = await admin.storage.from("pessoal").download(caminho)
  if (error || !blob) {
    await gravar({ marcacoes_erro: "Espelho não encontrado no armazenamento.", marcacoes_lidas_em: new Date().toISOString() })
    return { erro: "Espelho não encontrado." }
  }
  const bytes = new Uint8Array(await blob.arrayBuffer())
  // O pdf.js esvazia o buffer que recebe: a cópia vai para ele, o original para a IA.
  let textoPdf = ""
  try {
    const pdf = await getDocumentProxy(bytes.slice())
    textoPdf = (await extractText(pdf, { mergePages: true })).text.trim()
  } catch {
    // PDF inválido ou só imagem.
  }
  if (textoPdf.length < 200) {
    const motivo = "Espelho escaneado (sem texto) — não lido; a análise usa só as horas lançadas."
    await gravar({ marcacoes: null, marcacoes_erro: motivo, marcacoes_lidas_em: new Date().toISOString() })
    return { pulado: motivo }
  }

  const { dados, erro } = await gerarJsonIADePdf({
    system: SISTEMA,
    prompt: "Leia este espelho de ponto e devolva as marcações de cada dia.",
    pdfBase64: Buffer.from(bytes).toString("base64"),
    esquema: ESQUEMA,
  })
  if (erro || !dados) {
    await gravar({ marcacoes_erro: erro ?? "A IA não devolveu as marcações.", marcacoes_lidas_em: new Date().toISOString() })
    return { erro: erro ?? "A IA não devolveu as marcações." }
  }
  // Os dias ajustados à mão continuam valendo sobre a nova leitura.
  const lidas = mesclarLeitura(normalizar(dados as unknown as MarcacoesEspelho), (reg.marcacoes ?? null) as MarcacoesEspelho | null)
  await gravar({ marcacoes: lidas, marcacoes_erro: null, marcacoes_lidas_em: new Date().toISOString() })
  return {}
}

function normalizar(m: MarcacoesEspelho): MarcacoesEspelho {
  const hora = /^([01]?\d|2[0-3]):[0-5]\d$/
  const quadro = ((m as unknown as { jornada?: Record<string, unknown> }).jornada ?? {}) as Record<string, unknown>
  const jornada = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"].map((k) =>
    (Array.isArray(quadro[k]) ? (quadro[k] as unknown[]) : [])
      .map((h) => String(h).trim())
      .filter((h) => hora.test(h))
      .map((h) => h.padStart(5, "0"))
  )
  return {
    departamento: texto(m.departamento),
    carga_diaria: texto(m.carga_diaria),
    jornada,
    dias: (Array.isArray(m.dias) ? m.dias : [])
      .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d.data ?? "")))
      .map((d) => ({
        data: String(d.data),
        ocorrencia: texto(d.ocorrencia),
        marcacoes: (Array.isArray(d.marcacoes) ? d.marcacoes : [])
          .map((h) => String(h).trim())
          .filter((h) => hora.test(h))
          .map((h) => h.padStart(5, "0")),
      }))
      .sort((a, b) => a.data.localeCompare(b.data)),
  }
}

/**
 * Lê os espelhos ainda não lidos da remessa, alguns por vez, dentro de um
 * orçamento de tempo (a chamada do servidor tem limite). Devolve quantos
 * faltam — a tela chama de novo até zerar.
 */
export async function lerEspelhosDaRemessa(
  remessaId: string,
  { orcamentoMs = 200_000, paralelos = 4 }: { orcamentoMs?: number; paralelos?: number } = {}
): Promise<{ lidos: number; pulados: number; erros: number; faltam: number; indisponivel?: boolean }> {
  const inicio = Date.now()
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("pessoal_registro_ponto")
    .select("id")
    .eq("remessa_id", remessaId)
    .not("arquivo", "is", null)
    .is("marcacoes_lidas_em", null)
  if (error) {
    if (esquemaAusente(error)) return { lidos: 0, pulados: 0, erros: 0, faltam: 0, indisponivel: true }
    throw new Error(error.message)
  }
  const fila = (data ?? []).map((r) => String(r.id))
  let lidos = 0
  let pulados = 0
  let erros = 0
  let feitos = 0
  const trabalhador = async () => {
    while (fila.length > 0 && Date.now() - inicio < orcamentoMs) {
      const id = fila.shift()!
      const r = await lerEspelhoDoRegistro(id).catch((e) => ({ erro: String(e) }))
      feitos++
      if ("erro" in r && r.erro) erros++
      else if ("pulado" in r && r.pulado) pulados++
      else lidos++
    }
  }
  await Promise.all(Array.from({ length: paralelos }, trabalhador))
  return { lidos, pulados, erros, faltam: (data ?? []).length - feitos }
}

/** Espelhos da remessa ainda não processados (null = SQL não rodado). */
export async function espelhosPendentes(remessaId: string): Promise<number | null> {
  const admin = await createAdminClient()
  const { count, error } = await admin
    .from("pessoal_registro_ponto")
    .select("id", { count: "exact", head: true })
    .eq("remessa_id", remessaId)
    .not("arquivo", "is", null)
    .is("marcacoes_lidas_em", null)
  if (error) return null
  return count ?? 0
}

// ── Regras da jornada ────────────────────────────────────────────────────────

const minutos = (h: string) => {
  const [a, b] = h.split(":").map(Number)
  return a * 60 + b
}
const ehDomingo = (data: string) => new Date(`${data}T12:00:00Z`).getUTCDay() === 0
const diaSeguinte = (data: string) => {
  const d = new Date(`${data}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

/** Pares entrada/saída em minutos (saída antes da entrada = virou a meia-noite). */
function pares(marcacoes: string[]): { ini: number; fim: number }[] {
  const out: { ini: number; fim: number }[] = []
  for (let i = 0; i + 1 < marcacoes.length; i += 2) {
    const ini = minutos(marcacoes[i])
    let fim = minutos(marcacoes[i + 1])
    if (fim < ini) fim += 24 * 60
    out.push({ ini, fim })
  }
  return out
}

export function avaliarJornada(m: MarcacoesEspelho | null): OcorrenciasJornada | null {
  if (!m || !Array.isArray(m.dias) || m.dias.length === 0) return null
  const o: OcorrenciasJornada = {
    diasTrabalhados: 0,
    jornadaAcima10: [],
    intervaloCurto: [],
    interjornadaCurta: [],
    domingoFeriado: [],
    seteDiasSeguidos: [],
    incompletas: [],
    britanico: false,
    maiorJornadaMin: 0,
  }
  const trabalhados = new Map<string, { ini: number; fim: number }>()
  const entradas: string[] = []
  const saidas: string[] = []
  for (const d of m.dias) {
    if (d.marcacoes.length % 2 === 1) o.incompletas.push(d.data)
    const ps = pares(d.marcacoes)
    if (ps.length === 0) continue
    o.diasTrabalhados++
    const total = ps.reduce((s, p) => s + (p.fim - p.ini), 0)
    o.maiorJornadaMin = Math.max(o.maiorJornadaMin, total)
    if (total > 600) o.jornadaAcima10.push(d.data)
    if (total > 360) {
      const intervalo = ps.length > 1 ? ps[1].ini - ps[0].fim : 0
      if (intervalo < 60) o.intervaloCurto.push(d.data)
    }
    if (ehDomingo(d.data) || /feriad/i.test(d.ocorrencia ?? "")) o.domingoFeriado.push(d.data)
    trabalhados.set(d.data, { ini: ps[0].ini, fim: ps[ps.length - 1].fim })
    entradas.push(d.marcacoes[0])
    saidas.push(d.marcacoes[d.marcacoes.length - 1 - (d.marcacoes.length % 2)])
  }
  // Interjornada e dias seguidos.
  const datas = [...trabalhados.keys()].sort()
  let seguidos = 1
  let inicioSeq = datas[0]
  for (let i = 1; i < datas.length; i++) {
    const ant = datas[i - 1]
    const atual = datas[i]
    if (diaSeguinte(ant) === atual) {
      const descanso = trabalhados.get(atual)!.ini + 24 * 60 - trabalhados.get(ant)!.fim
      if (descanso < 11 * 60) o.interjornadaCurta.push(atual)
      seguidos++
    } else {
      if (seguidos >= 7) o.seteDiasSeguidos.push(`${inicioSeq} a ${ant}`)
      seguidos = 1
      inicioSeq = atual
    }
  }
  if (datas.length && seguidos >= 7) o.seteDiasSeguidos.push(`${inicioSeq} a ${datas[datas.length - 1]}`)
  // Ponto "britânico": entrada e saída idênticas em 80%+ dos dias (com 10+ dias).
  if (entradas.length >= 10) {
    const moda = (xs: string[]) => Math.max(...Object.values(xs.reduce<Record<string, number>>((c, x) => ((c[x] = (c[x] ?? 0) + 1), c), {})))
    o.britanico = moda(entradas) / entradas.length >= 0.8 && moda(saidas) / saidas.length >= 0.8
  }
  return o
}

export type DiaDetalhado = {
  data: string
  diaSemana: string
  ocorrencia: string | null
  marcacoes: string[]
  trabalhadoMin: number
  intervaloMin: number | null
  alertas: string[]
  /** Corrigido ou incluído à mão pela gestão de pessoal. */
  ajustado: boolean
  /** Conferido como está (o alerta é real). */
  conferido: boolean
}

const DIAS_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"]

/** O mês dia a dia, com o total trabalhado, o intervalo e os alertas de cada dia. */
export function detalharDias(m: MarcacoesEspelho | null): DiaDetalhado[] {
  if (!m || !Array.isArray(m.dias)) return []
  const o = avaliarJornada(m)
  const em = (lista: string[] | undefined, d: string) => Boolean(lista?.includes(d))
  const seguidos = (o?.seteDiasSeguidos ?? []).map((s) => s.split(" a "))
  return m.dias.map((d) => {
    const ps = pares(d.marcacoes)
    const alertas: string[] = []
    if (em(o?.jornadaAcima10, d.data)) alertas.push("Jornada acima de 10 h")
    if (em(o?.intervaloCurto, d.data)) alertas.push("Intervalo menor que 1 h")
    if (em(o?.interjornadaCurta, d.data)) alertas.push("Menos de 11 h desde a jornada anterior")
    if (em(o?.domingoFeriado, d.data)) alertas.push("Domingo ou feriado trabalhado")
    if (em(o?.incompletas, d.data)) alertas.push("Marcação incompleta")
    if (ps.length && seguidos.some(([a, b]) => d.data >= a && d.data <= b)) alertas.push("Sequência de 7+ dias sem folga")
    return {
      data: d.data,
      diaSemana: DIAS_SEMANA[new Date(`${d.data}T12:00:00Z`).getUTCDay()],
      ocorrencia: d.ocorrencia,
      marcacoes: d.marcacoes,
      trabalhadoMin: ps.reduce((s, p) => s + (p.fim - p.ini), 0),
      intervaloMin: ps.length > 1 ? ps[1].ini - ps[0].fim : null,
      alertas,
      ajustado: d.ajustado === true,
      conferido: d.conferido === true,
    }
  })
}

// ── Fila de conferência (16/11/2026) ─────────────────────────────────────────

export type ConferenciaFuncionario = {
  registroId: string
  funcionarioId: string
  nome: string
  dias: DiaDetalhado[]
}

/**
 * Dias com alerta nas marcações da remessa que ninguém olhou ainda — nem
 * ajustou, nem conferiu como está. Muitos são erro de leitura do espelho
 * (marcação incompleta, intervalo curto por um horário lido errado); os que
 * forem reais, a gestão confere e eles saem da fila.
 */
export async function diasParaConferir(remessaId: string): Promise<ConferenciaFuncionario[]> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("pessoal_registro_ponto")
    .select("id, funcionario_id, marcacoes")
    .eq("remessa_id", remessaId)
    .not("marcacoes", "is", null)
    .range(0, 4999)
  if (error) {
    if (esquemaAusente(error)) return []
    throw new Error(`Falha ao ler as marcações: ${error.message}`)
  }
  const linhas = ((data ?? []) as { id: string; funcionario_id: string | null; marcacoes: MarcacoesEspelho | null }[])
    .filter((r) => r.funcionario_id)
    .map((r) => ({
      registroId: String(r.id),
      funcionarioId: String(r.funcionario_id),
      dias: detalharDias(r.marcacoes).filter((d) => d.alertas.length > 0 && !d.ajustado && !d.conferido),
    }))
    .filter((l) => l.dias.length > 0)
  const nomes = await nomesDosUsuarios(linhas.map((l) => l.funcionarioId))
  return linhas
    .map((l) => ({ ...l, nome: nomes.get(l.funcionarioId) ?? "(sem nome)" }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
}

/**
 * Para a caixa de entrada do painel: quantos dias esperam conferência nas
 * remessas ABERTAS da entidade (as finalizadas ficam de fora). Recebe o
 * cliente porque o lembrete diário roda sem requisição.
 */
export async function contagemDiasParaConferir(
  client: SupabaseClient,
  emp: string
): Promise<{ total: number; remessas: { id: string; nome: string; dias: number }[] } | null> {
  const { data: rems, error } = await client
    .from("pessoal_registro_ponto_remessas")
    .select("id, nome_remessa")
    .eq("emp_proprietaria_id", emp)
    .not("finalizada", "is", true)
  if (error) return null
  const nomes = new Map(((rems ?? []) as { id: string; nome_remessa: string | null }[]).map((r) => [String(r.id), r.nome_remessa ?? "Remessa"]))
  if (nomes.size === 0) return { total: 0, remessas: [] }
  const { data: regs, error: e2 } = await client
    .from("pessoal_registro_ponto")
    .select("remessa_id, marcacoes")
    .in("remessa_id", [...nomes.keys()])
    .not("marcacoes", "is", null)
    .range(0, 4999)
  if (e2) return null
  const porRemessa = new Map<string, number>()
  for (const r of (regs ?? []) as { remessa_id: string; marcacoes: MarcacoesEspelho | null }[]) {
    const n = detalharDias(r.marcacoes).filter((d) => d.alertas.length > 0 && !d.ajustado && !d.conferido).length
    if (n) porRemessa.set(String(r.remessa_id), (porRemessa.get(String(r.remessa_id)) ?? 0) + n)
  }
  const remessas = [...porRemessa].map(([id, dias]) => ({ id, nome: nomes.get(id)!, dias })).sort((a, b) => b.dias - a.dias)
  return { total: remessas.reduce((s, r) => s + r.dias, 0), remessas }
}

export type AjustesDoMes = {
  registroId: string
  remessa: string
  competencia: string | null
  ajustes: AjusteMarcacao[]
}

/**
 * Meu perfil → Ponto: os ajustes que a gestão fez nas marcações do próprio
 * funcionário, só nos registros JÁ LIBERADOS a ele. A marcação original
 * fica preservada e à vista dele (o antes e o depois de cada dia). A
 * conferência sem mudança não entra: nada foi alterado.
 */
export async function meusAjustesDePonto(usuarioId: string): Promise<AjustesDoMes[]> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("pessoal_registro_ponto")
    .select("id, remessa_id, marcacoes")
    .eq("funcionario_id", usuarioId)
    .eq("liberado", true)
    .not("marcacoes", "is", null)
    .range(0, 999)
  if (error) return []
  const comAjuste = ((data ?? []) as { id: string; remessa_id: string; marcacoes: MarcacoesEspelho | null }[])
    .map((r) => ({ ...r, ajustes: (r.marcacoes?.ajustes ?? []).filter((a) => a.tipo !== "conferido") }))
    .filter((r) => r.ajustes.length > 0)
  if (comAjuste.length === 0) return []
  const { data: rems } = await admin
    .from("pessoal_registro_ponto_remessas")
    .select("id, nome_remessa, mes_referencia_os, ano_referencia_os")
    .in("id", [...new Set(comAjuste.map((r) => String(r.remessa_id)))])
  const info = new Map(((rems ?? []) as Record<string, unknown>[]).map((r) => [String(r.id), r]))
  const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"]
  return comAjuste
    .map((r) => {
      const rem = info.get(String(r.remessa_id))
      const mes = MESES.indexOf(String(rem?.mes_referencia_os ?? ""))
      const ano = String(rem?.ano_referencia_os ?? "")
      return {
        registroId: String(r.id),
        remessa: texto(rem?.nome_remessa) ?? "Remessa",
        competencia: mes >= 0 && /^\d{4}$/.test(ano) ? `${ano}-${String(mes + 1).padStart(2, "0")}` : null,
        ajustes: [...r.ajustes].reverse(),
      }
    })
    .sort((a, b) => (b.competencia ?? "").localeCompare(a.competencia ?? ""))
}
