import "server-only"

import { esquemaAusente, nomesDosUsuarios, texto } from "@/lib/db/comum"
import { OCORRENCIAS, rotuloCompetenciaPonto, type Indicadores } from "@/lib/db/ponto-analise"
import { gerarJsonIA, MODELO_IA, type EsquemaJsonIA } from "@/lib/ia"
import { createAdminClient } from "@/lib/supabase/admin"
import { usoForaPorMeses, type MesUsoFora } from "@/lib/db/uso-fora-expediente"
import { horasDecimais, LIMITE_AVISO_MES_MIN, TOLERANCIA_DIARIA_MIN } from "@/lib/uso-fora-expediente"
import { tenantAtual } from "@/lib/tenant"

/**
 * RESENHA DO CONTROLE DE PONTO POR IA (16/10/2026). A IA recebe os
 * indicadores já calculados (lib/db/ponto-analise) — nunca os espelhos nem
 * dados de saúde além da contagem de atestados — e redige riscos
 * trabalhistas, quem acompanhar e o que fazer. Fica guardada em
 * pessoal_ponto_resenhas até alguém pedir outra. Desde 22/11/2026 recebe
 * também o resumo do uso do sistema fora do expediente (horas e dias por
 * pessoa, nunca os horários nem o texto do motivo).
 */

export type EscopoResenha = "remessa" | "ano" | "departamento"

export type Resenha = {
  panorama: string
  riscos: { titulo: string; gravidade: "alta" | "media" | "baixa"; descricao: string; fundamento: string }[]
  acompanhar_funcionarios: { nome: string; motivo: string; sugestao: string }[]
  acompanhar_departamentos: { nome: string; motivo: string; sugestao: string }[]
  recomendacoes: string[]
  limitacoes: string
}

export type ResenhaGuardada = {
  conteudo: Resenha
  geradaEm: string
  geradaPor: string | null
  modelo: string | null
}

const ESQUEMA: EsquemaJsonIA = {
  nome: "resenha_ponto",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["panorama", "riscos", "acompanhar_funcionarios", "acompanhar_departamentos", "recomendacoes", "limitacoes"],
    properties: {
      panorama: { type: "string" },
      riscos: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["titulo", "gravidade", "descricao", "fundamento"],
          properties: {
            titulo: { type: "string" },
            gravidade: { type: "string", enum: ["alta", "media", "baixa"] },
            descricao: { type: "string" },
            fundamento: { type: "string" },
          },
        },
      },
      acompanhar_funcionarios: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["nome", "motivo", "sugestao"],
          properties: { nome: { type: "string" }, motivo: { type: "string" }, sugestao: { type: "string" } },
        },
      },
      acompanhar_departamentos: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["nome", "motivo", "sugestao"],
          properties: { nome: { type: "string" }, motivo: { type: "string" }, sugestao: { type: "string" } },
        },
      },
      recomendacoes: { type: "array", items: { type: "string" } },
      limitacoes: { type: "string" },
    },
  },
}

const SISTEMA = `Você é especialista em direito do trabalho brasileiro (CLT, súmulas e orientações do TST) e em gestão de pessoas, e assessora o departamento de pessoal de uma entidade sindical que é EMPREGADORA dos próprios funcionários.
Escreva uma resenha do controle de ponto a partir SOMENTE dos indicadores recebidos, em português do Brasil, objetiva e acionável.
- "panorama": 1 a 2 parágrafos curtos com a leitura geral do período (volume e concentração de horas extras, banco de horas, tendência, cobertura dos dados).
- "riscos": os riscos trabalhistas concretos (passivo de horas extras, habitualidade, banco de horas sem compensação, jornada acima do limite, intervalos, descanso semanal e entre jornadas, domingos/feriados, ponto britânico, sobrecarga e adoecimento, falhas de registro). Ordene do mais grave ao menos grave; "fundamento" cita o dispositivo (ex.: "art. 59 da CLT", "Súmula 338 do TST"). Não liste riscos sem base nos números.
- "acompanhar_funcionarios": quem deve ser acompanhado de perto, com o motivo baseado nos números e uma sugestão prática. No máximo 10, os mais críticos primeiro.
- "acompanhar_departamentos": idem para departamentos (vazio se o escopo for um departamento só ou se nenhum se destacar).
- "recomendacoes": 3 a 6 ações para a gestão (ex.: redistribuir demanda, compensar banco, ajustar escala, revisar registro).
- "limitacoes": o que os dados não permitem afirmar (meses sem remessa, espelhos não lidos, departamento atual aplicado a anos anteriores).
- "uso_do_sistema_fora_do_expediente" (quando vier): tempo com o sistema da entidade aberto e em uso fora da jornada contratada. Não é marcação de ponto nem prova de trabalho, mas indica trabalho ou disponibilidade fora do horário (art. 6º, parágrafo único, da CLT; Súmula 428 do TST) e, em férias ou afastamento, risco de férias não gozadas (arts. 129 e 137 da CLT). Use-o em riscos, quem acompanhar e recomendações quando for relevante, comparando com as horas extras registradas no ponto (muito uso fora com pouca hora extra lançada merece verificação). O motivo informado pelo funcionário não afasta o risco.
Regras: não invente números nem pessoas; use os nomes exatamente como vieram; não especule sobre doenças nem cite diagnósticos; trate horas em formato decimal (7,5 h = 7 h 30 min); seja prudente — "indica", "merece verificação" — quando o dado não for conclusivo.`

function resumoParaIA(ind: Indicadores, uso: UsoParaIA | null): string {
  const ocorr = OCORRENCIAS.map(
    (o) => `${o.rotulo} (${o.fundamento}): ${ind.ocorrencias[o.id].total} ocorrência(s) em ${ind.ocorrencias[o.id].funcionarios} funcionário(s)`
  )
  const pessoas = ind.pessoas.slice(0, 30).map((p) => ({
    nome: p.nome,
    departamento: p.departamento,
    horas_extras: p.he,
    horas_faixa_2: p.he100,
    meses_com_he: `${p.mesesComHE}/${p.meses}`,
    maior_he_mes: p.maiorHEMes,
    banco_de_horas: p.saldo,
    atestados: p.atestados,
    dias_atestado: p.diasAtestado,
    faltas_injustificadas: p.faltasInjustificadas,
    alertas: p.alertas,
  }))
  return JSON.stringify(
    {
      escopo: ind.escopo,
      periodo: ind.rotulo,
      competencias: ind.competencias.map(rotuloCompetenciaPonto),
      meses_sem_remessa: ind.mesesSemRemessa.map(rotuloCompetenciaPonto),
      funcionarios: ind.funcionarios,
      funcionarios_com_horas_extras: ind.comHE,
      horas_extras_total: ind.he,
      percentual_das_faixas_de_hora_extra: { faixa_1: ind.faixas["70"], faixa_2: ind.faixas["100"] },
      horas_extras_faixa_1: ind.he70,
      horas_extras_faixa_2: ind.he100,
      horas_pagas: ind.pagas,
      media_horas_extras_por_funcionario: ind.heMediaPorFuncionario,
      banco_de_horas_total: ind.saldo,
      espelhos_com_marcacoes_lidas: `${ind.espelhosLidos} de ${ind.espelhos}`,
      espelhos_escaneados_nao_lidos: ind.espelhosEscaneados,
      atestados: ind.atestados,
      dias_de_atestado: ind.diasAtestado,
      faltas_injustificadas: ind.faltasInjustificadas,
      ocorrencias_nas_marcacoes: ocorr,
      ponto_britanico_funcionarios: ind.britanicos,
      evolucao_mensal: ind.serie.map((s) => ({
        mes: rotuloCompetenciaPonto(s.competencia),
        he_faixa_1: s.he70,
        he_faixa_2: s.he100,
        funcionarios_com_he: `${s.comHE}/${s.funcionarios}`,
        banco_de_horas: s.saldo,
      })),
      departamentos: ind.departamentos.map((d) => ({
        nome: d.nome,
        funcionarios: d.funcionarios,
        horas_extras: d.he,
        media_por_funcionario: d.heMedia,
        horas_faixa_2: d.he100,
        banco_de_horas: d.saldo,
        ocorrencias_nas_marcacoes: d.ocorrencias,
        funcionarios_com_alerta: d.emAtencao,
      })),
      funcionarios_ordenados_por_criticidade: pessoas,
      ...(uso ? { uso_do_sistema_fora_do_expediente: uso } : {}),
      observacao: `Referências: média acima de 2 h extras por dia útil = mais de 44 h no mês. ${ind.pessoas.length > 30 ? `Lista limitada aos 30 mais críticos de ${ind.pessoas.length}.` : ""}`,
    },
    null,
    1
  )
}

type UsoParaIA = {
  observacao: string
  meses_com_registro_de_uso: string[]
  horas_a_considerar_total: number
  funcionarios: {
    nome: string
    horas_a_considerar: number
    horas_antes_ou_depois_do_horario: number
    horas_no_intervalo: number
    horas_em_dia_sem_expediente_ou_feriado: number
    horas_em_ferias_ou_afastamento: number
    dias_acima_da_tolerancia: number
    dias_em_ferias_ou_afastamento_com_uso: number
    meses_acima_do_limite: number
    dias_com_motivo_informado: number
  }[]
}

/** Resumo do uso fora do expediente para a IA: horas e dias por pessoa, sem horários nem motivos. */
async function usoParaIA(ind: Indicadores): Promise<UsoParaIA | null> {
  const nomes = new Map(ind.pessoas.map((p) => [p.id, p.nome]))
  // No ano (e no departamento), o ano todo, com o mês corrente e os meses sem
  // remessa: o uso é registrado independentemente da remessa.
  const ano = (ind.competencias[0] ?? ind.mesesSemRemessa[0] ?? "").slice(0, 4)
  const meses =
    ind.escopo === "remessa" || !/^\d{4}$/.test(ano)
      ? ind.competencias
      : Array.from({ length: 12 }, (_, i) => `${ano}-${String(i + 1).padStart(2, "0")}`)
  const mapa = await usoForaPorMeses([...nomes.keys()], meses).catch(() => null)
  if (!mapa || mapa.size === 0) return null
  const soma = (ms: MesUsoFora[], f: (m: MesUsoFora) => number) => ms.reduce((s, m) => s + f(m), 0)
  const funcionarios = [...mapa]
    .map(([id, ms]) => ({
      nome: nomes.get(id) ?? "(sem nome)",
      minutos: soma(ms, (m) => m.resumo.considerado),
      horas_a_considerar: horasDecimais(soma(ms, (m) => m.resumo.considerado)),
      horas_antes_ou_depois_do_horario: horasDecimais(soma(ms, (m) => m.resumo.fora.antes + m.resumo.fora.depois)),
      horas_no_intervalo: horasDecimais(soma(ms, (m) => m.resumo.fora.intervalo)),
      horas_em_dia_sem_expediente_ou_feriado: horasDecimais(soma(ms, (m) => m.resumo.fora.sem_expediente + m.resumo.fora.feriado)),
      horas_em_ferias_ou_afastamento: horasDecimais(soma(ms, (m) => m.resumo.fora.afastado)),
      dias_acima_da_tolerancia: soma(ms, (m) => m.resumo.diasAcimaTolerancia),
      dias_em_ferias_ou_afastamento_com_uso: soma(ms, (m) => m.aviso.diasEmAfastamento),
      meses_acima_do_limite: ms.filter((m) => m.aviso.acimaDoLimite).length,
      dias_com_motivo_informado: soma(ms, (m) => m.diasComMotivo),
    }))
    .filter((f) => f.minutos > 0)
    .sort((a, b) => b.minutos - a.minutos)
  if (funcionarios.length === 0) return null
  const mesesComUso = [...new Set([...mapa.values()].flatMap((ms) => ms.map((m) => m.competencia)))].sort()
  return {
    observacao: `Horas em decimal. "A considerar" tira os dias de trabalho com até ${TOLERANCIA_DIARIA_MIN} min fora; em dia livre, feriado, férias e afastamento conta qualquer minuto. Limite de aviso da entidade: ${LIMITE_AVISO_MES_MIN / 60} h a considerar no mês. Só há registro de uso nos meses listados; a lista vai até 30 pessoas, as com mais horas primeiro.`,
    meses_com_registro_de_uso: mesesComUso.map(rotuloCompetenciaPonto),
    horas_a_considerar_total: horasDecimais(funcionarios.reduce((s, f) => s + f.minutos, 0)),
    funcionarios: funcionarios.slice(0, 30).map((f) => {
      const { minutos, ...resto } = f
      void minutos
      return resto
    }),
  }
}

export async function obterResenha(escopo: EscopoResenha, chave: string): Promise<{ disponivel: boolean; resenha: ResenhaGuardada | null }> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("pessoal_ponto_resenhas")
    .select("conteudo, gerada_em, gerada_por, modelo")
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("escopo", escopo)
    .eq("chave", chave)
    .maybeSingle()
  if (error) {
    if (esquemaAusente(error)) return { disponivel: false, resenha: null }
    throw new Error(error.message)
  }
  if (!data) return { disponivel: true, resenha: null }
  const por = texto(data.gerada_por)
  const nomes = por ? await nomesDosUsuarios([por]) : new Map<string, string>()
  return {
    disponivel: true,
    resenha: {
      conteudo: data.conteudo as Resenha,
      geradaEm: String(data.gerada_em),
      geradaPor: por ? (nomes.get(por) ?? null) : null,
      modelo: texto(data.modelo),
    },
  }
}

export async function gerarResenha(
  escopo: EscopoResenha,
  chave: string,
  ind: Indicadores,
  usuarioId: string
): Promise<{ erro?: string }> {
  if (ind.funcionarios === 0) return { erro: "Não há registros de ponto neste recorte." }
  const uso = await usoParaIA(ind)
  const { dados, erro } = await gerarJsonIA({ processo: "pessoal.ponto_resenha",
    system: SISTEMA,
    prompt: `Indicadores do controle de ponto:\n\n${resumoParaIA(ind, uso)}`,
    esquema: ESQUEMA,
  })
  if (erro || !dados) return { erro: erro ?? "A IA não devolveu a resenha." }
  const admin = await createAdminClient()
  const { error } = await admin.from("pessoal_ponto_resenhas").upsert(
    {
      emp_proprietaria_id: await tenantAtual(),
      escopo,
      chave,
      conteudo: dados,
      indicadores: { ...ind, pessoas: ind.pessoas.slice(0, 30), ...(uso ? { usoFora: uso } : {}) },
      modelo: MODELO_IA,
      gerada_em: new Date().toISOString(),
      gerada_por: usuarioId,
    },
    { onConflict: "emp_proprietaria_id,escopo,chave" }
  )
  if (error) {
    if (esquemaAusente(error)) return { erro: "Rode supabase/ponto-analise.sql no SQL Editor para guardar as resenhas." }
    return { erro: `Não foi possível guardar a resenha: ${error.message}` }
  }
  return {}
}
