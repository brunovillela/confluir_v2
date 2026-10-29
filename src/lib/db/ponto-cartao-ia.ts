import "server-only"

import { gerarJsonIADePdf, type EsquemaJsonIA } from "@/lib/ia"
import type { LeituraCartao } from "@/lib/ponto-apuracao"

/**
 * Leitura de um cartão de ponto (PDF de um funcionário) pela IA: cabeçalho,
 * jornada prevista por dia da semana, batidas de cada dia e o total impresso.
 * A IA só transcreve; a conta é de lib/ponto-apuracao.
 */

const texto = (v: unknown) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null)

const HORARIOS = { type: "array", items: { type: "string" } }
const ESQUEMA: EsquemaJsonIA = {
  nome: "cartao_ponto",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["nome", "cpf", "periodo_inicio", "periodo_fim", "departamento", "jornada", "dias", "total_relatorio"],
    properties: {
      nome: { type: ["string", "null"] },
      cpf: { type: ["string", "null"] },
      periodo_inicio: { type: ["string", "null"] },
      periodo_fim: { type: ["string", "null"] },
      departamento: { type: ["string", "null"] },
      jornada: {
        type: "object",
        additionalProperties: false,
        required: ["dom", "seg", "ter", "qua", "qui", "sex", "sab"],
        properties: { dom: HORARIOS, seg: HORARIOS, ter: HORARIOS, qua: HORARIOS, qui: HORARIOS, sex: HORARIOS, sab: HORARIOS },
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
            marcacoes: HORARIOS,
          },
        },
      },
      total_relatorio: { type: ["string", "null"] },
    },
  },
}

const SISTEMA = `Você lê cartões de ponto (espelho de ponto) brasileiros e devolve o que está impresso, sem calcular nada.
Regras:
- "nome", "cpf" (só dígitos), "departamento": do cabeçalho. "periodo_inicio"/"periodo_fim": o período do cartão, AAAA-MM-DD.
- "jornada": o quadro HORÁRIO DE TRABALHO, um item por dia da semana (dom, seg, ter, qua, qui, sex, sab) com os horários previstos em ordem (ENTRADA 1, SAÍDA 1, ENTRADA 2, SAÍDA 2…), HH:MM. Se o quadro trouxer só a carga do dia (um único valor, ex.: 05:14), devolva só ele: ["05:14"]. Dia sem horário ou com 00:00: [].
- "dias": um item por linha de data, em ordem. "data" AAAA-MM-DD. "marcacoes": só as batidas (ENTRADA/SAÍDA) na ordem, HH:MM; horário com asterisco ou lançado manualmente conta como batida. NÃO inclua as colunas de totais (NORMAIS, BTOTAL, FALTAS, EXTRAS, BSALDO, NOT.) nem saldos com sinal como "+05:01".
- "ocorrencia": quando o dia traz uma palavra no lugar dos horários (Feriado, Férias, Falta, Atestado, Folga, Compensado, Recesso, DSR, Abonado, Licença…), essa palavra; senão null. Dia marcado como feriado (ex.: "Fer") com batidas: "Feriado" e as batidas.
- "total_relatorio": na linha TOTAIS, o valor da coluna BTOTAL (saldo do mês), com o sinal, ex.: "+15:08" ou "-04:51". null se não houver.
Não invente horários: dia sem batida tem "marcacoes": [].`

const HORA = /^([01]?\d|2[0-3]):[0-5]\d$/
const DIAS_SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"] as const
const limpar = (xs: unknown) =>
  (Array.isArray(xs) ? xs : [])
    .map((h) => String(h).trim())
    .filter((h) => HORA.test(h))
    .map((h) => h.padStart(5, "0"))

function normalizar(d: Record<string, unknown>): LeituraCartao {
  const jornada = (d.jornada ?? {}) as Record<string, unknown>
  const data = (v: unknown) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v ?? "")) ? String(v) : null)
  return {
    nome: texto(d.nome),
    cpf: texto(d.cpf)?.replace(/\D/g, "") || null,
    periodoInicio: data(d.periodo_inicio),
    periodoFim: data(d.periodo_fim),
    departamento: texto(d.departamento),
    jornada: DIAS_SEMANA.map((k) => limpar(jornada[k])),
    dias: (Array.isArray(d.dias) ? (d.dias as Record<string, unknown>[]) : [])
      .filter((x) => data(x.data))
      .map((x) => ({ data: String(x.data), ocorrencia: texto(x.ocorrencia), marcacoes: limpar(x.marcacoes) }))
      .sort((a, b) => a.data.localeCompare(b.data)),
    totalRelatorio: texto(d.total_relatorio),
  }
}

/** A IA lê um cartão de ponto (PDF de um funcionário). */
export async function lerCartaoPdf(bytes: Uint8Array): Promise<{ leitura?: LeituraCartao; erro?: string }> {
  const { dados, erro } = await gerarJsonIADePdf({
    system: SISTEMA,
    prompt: "Leia este cartão de ponto e devolva o cabeçalho, a jornada prevista, as batidas de cada dia e o total do mês.",
    pdfBase64: Buffer.from(bytes).toString("base64"),
    esquema: ESQUEMA,
  })
  if (erro || !dados) return { erro: erro ?? "A IA não devolveu a leitura." }
  return { leitura: normalizar(dados as Record<string, unknown>) }
}
