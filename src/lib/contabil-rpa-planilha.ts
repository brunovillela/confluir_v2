import { formatarNitPis } from "@/lib/cpf"
import { totalizarRpas, type LinhaRpaContabil } from "@/lib/db/contabil-rpa"
import { formatarCnpjCpf } from "@/lib/formato"
import { type ColunaXlsx, dataXlsx } from "@/lib/xlsx"

/**
 * A aba "RPAs" da planilha da contabilidade: na Exportação contábil e no
 * relatório enviado por e-mail no fechamento do mês (onda 6 do plano do RPA).
 */
export const COLUNAS_RPA_CONTABIL: ColunaXlsx<LinhaRpaContabil>[] = [
  {
    titulo: "Pagamento",
    valor: (r) => (r.rpaId ? dataXlsx(r.dataPagamento) : null),
    largura: 12,
  },
  { titulo: "Competência", valor: (r) => r.competencia, largura: 12 },
  { titulo: "RPA nº", valor: (r) => r.numero, largura: 8 },
  { titulo: "Prestador", valor: (r) => r.prestador, largura: 36 },
  {
    titulo: "CPF",
    valor: (r) => (r.cpf ? formatarCnpjCpf(r.cpf) : null),
    largura: 16,
  },
  {
    titulo: "NIT/PIS",
    valor: (r) => (r.nitPis ? formatarNitPis(r.nitPis) : r.rpaId ? "não informado" : null),
    largura: 16,
  },
  { titulo: "Serviço", valor: (r) => r.servico, largura: 50 },
  { titulo: "Origem", valor: (r) => r.origem, largura: 26 },
  { titulo: "Ordem", valor: (r) => r.ordemCodigo, largura: 20 },
  { titulo: "Classificador", valor: (r) => r.classificador, largura: 14 },
  { titulo: "Centro de custo", valor: (r) => r.centroCusto, largura: 30 },
  { titulo: "Departamento", valor: (r) => r.departamento, largura: 22 },
  { titulo: "Bruto", valor: (r) => r.bruto, largura: 13 },
  { titulo: "INSS retido", valor: (r) => r.inss, largura: 12 },
  { titulo: "IRRF retido", valor: (r) => r.irrf, largura: 12 },
  { titulo: "ISS retido", valor: (r) => r.iss, largura: 12 },
  { titulo: "Líquido", valor: (r) => r.liquido, largura: 13 },
  { titulo: "Valor pago", valor: (r) => r.valorPago, largura: 13 },
  { titulo: "INSS patronal", valor: (r) => r.inssPatronal, largura: 13 },
  {
    titulo: "Custo total (bruto + patronal)",
    valor: (r) => r.custoTotal,
    largura: 16,
  },
  {
    titulo: "Recibo assinado",
    valor: (r) => (r.rpaId ? (r.assinado ? "Sim" : "Não") : null),
    largura: 10,
  },
]
/** As linhas da aba, com a de totais no fim (sem rpaId: data e "assinado" ficam vazios). Sem RPA, vazia. */
export function linhasRpaComTotal(rpas: LinhaRpaContabil[]): LinhaRpaContabil[] {
  if (!rpas.length) return []
  const t = totalizarRpas(rpas)
  const total: LinhaRpaContabil = {
    rpaId: "",
    numero: null,
    dataPagamento: "",
    competencia: "",
    prestador: `TOTAL (${t.quantidade} RPA${t.quantidade === 1 ? "" : "s"})`,
    cpf: null,
    nitPis: null,
    servico: null,
    origem: "",
    ordemCodigo: null,
    centroCusto: null,
    classificador: null,
    departamento: null,
    bruto: t.bruto,
    inss: t.inss,
    irrf: t.irrf,
    iss: t.iss,
    liquido: t.liquido,
    valorPago: Math.round(rpas.reduce((s, r) => s + r.valorPago, 0) * 100) / 100,
    inssPatronal: t.inssPatronal,
    custoTotal: t.custoTotal,
    assinado: false,
  }
  return [...rpas, total]
}
