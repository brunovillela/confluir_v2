import "server-only"

import { esquemaAusente, nomesDosUsuarios, texto } from "@/lib/db/comum"
import { OCORRENCIAS, rotuloCompetenciaPonto, type Indicadores } from "@/lib/db/ponto-analise"
import { gerarJsonIA, MODELO_IA, type EsquemaJsonIA } from "@/lib/ia"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * RESENHA DO CONTROLE DE PONTO POR IA (16/10/2026). A IA recebe os
 * indicadores já calculados (lib/db/ponto-analise) — nunca os espelhos nem
 * dados de saúde além da contagem de atestados — e redige riscos
 * trabalhistas, quem acompanhar e o que fazer. Fica guardada em
 * pessoal_ponto_resenhas até alguém pedir outra.
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
Regras: não invente números nem pessoas; use os nomes exatamente como vieram; não especule sobre doenças nem cite diagnósticos; trate horas em formato decimal (7,5 h = 7 h 30 min); seja prudente — "indica", "merece verificação" — quando o dado não for conclusivo.`

function resumoParaIA(ind: Indicadores): string {
  const ocorr = OCORRENCIAS.map(
    (o) => `${o.rotulo} (${o.fundamento}): ${ind.ocorrencias[o.id].total} ocorrência(s) em ${ind.ocorrencias[o.id].funcionarios} funcionário(s)`
  )
  const pessoas = ind.pessoas.slice(0, 30).map((p) => ({
    nome: p.nome,
    departamento: p.departamento,
    horas_extras: p.he,
    horas_100: p.he100,
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
      horas_extras_70: ind.he70,
      horas_extras_100: ind.he100,
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
        he_70: s.he70,
        he_100: s.he100,
        funcionarios_com_he: `${s.comHE}/${s.funcionarios}`,
        banco_de_horas: s.saldo,
      })),
      departamentos: ind.departamentos.map((d) => ({
        nome: d.nome,
        funcionarios: d.funcionarios,
        horas_extras: d.he,
        media_por_funcionario: d.heMedia,
        horas_100: d.he100,
        banco_de_horas: d.saldo,
        ocorrencias_nas_marcacoes: d.ocorrencias,
        funcionarios_com_alerta: d.emAtencao,
      })),
      funcionarios_ordenados_por_criticidade: pessoas,
      observacao: `Referências: média acima de 2 h extras por dia útil = mais de 44 h no mês. ${ind.pessoas.length > 30 ? `Lista limitada aos 30 mais críticos de ${ind.pessoas.length}.` : ""}`,
    },
    null,
    1
  )
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
  const { dados, erro } = await gerarJsonIA({
    system: SISTEMA,
    prompt: `Indicadores do controle de ponto:\n\n${resumoParaIA(ind)}`,
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
      indicadores: { ...ind, pessoas: ind.pessoas.slice(0, 30) },
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
