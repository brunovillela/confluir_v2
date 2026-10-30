import "server-only"

import type { LeituraContracheque } from "@/lib/contracheque-leitura"
import { gerarJsonIADePdf, type EsquemaJsonIA } from "@/lib/ia"

/**
 * Leitura de um contracheque (recibo de pagamento de um funcionário, em PDF)
 * pela IA: identificação, competência e os três totais. A IA só transcreve;
 * a conferência (proventos − descontos = líquido) é do código.
 */

const texto = (v: unknown) => (typeof v === "string" && v.trim() !== "" ? v.trim() : null)
const VALOR = { type: ["number", "null"] }

const ESQUEMA: EsquemaJsonIA = {
  nome: "contracheque",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["nome", "cpf", "competencia", "total_proventos", "total_descontos", "valor_liquido"],
    properties: {
      nome: { type: ["string", "null"] },
      cpf: { type: ["string", "null"] },
      competencia: { type: ["string", "null"] },
      total_proventos: VALOR,
      total_descontos: VALOR,
      valor_liquido: VALOR,
    },
  },
}

const SISTEMA = `Você lê contracheques (recibos de pagamento de salário) brasileiros e devolve o que está impresso, sem calcular nada.
Regras:
- "nome" e "cpf" (só dígitos) do empregado, não do empregador. Sem CPF impresso: null.
- "competencia": o mês de referência do pagamento, AAAA-MM (ex.: "Outubro/2026" → "2026-10"). Décimo terceiro, férias ou adiantamento: o mês impresso no recibo.
- "total_proventos": o total de vencimentos/proventos; "total_descontos": o total de descontos; "valor_liquido": o líquido a receber. Números em reais com ponto decimal (ex.: 4321.07), sem "R$" nem separador de milhar.
- O recibo pode vir em duas vias na mesma página (empregador e empregado): leia uma vez só.
- Valor que não aparece: null. Não invente valores.`

function numero(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(/\./g, "").replace(",", "."))
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null
}

/** A IA lê um contracheque (PDF de um funcionário). */
export async function lerContrachequePdf(bytes: Uint8Array): Promise<{ leitura?: LeituraContracheque; erro?: string }> {
  const { dados, erro } = await gerarJsonIADePdf({
    system: SISTEMA,
    prompt: "Leia este contracheque e devolva o empregado, a competência e os totais de proventos, descontos e líquido.",
    pdfBase64: Buffer.from(bytes).toString("base64"),
    esquema: ESQUEMA,
  })
  if (erro || !dados) return { erro: erro ?? "A IA não devolveu a leitura." }
  const d = dados as Record<string, unknown>
  const competencia = texto(d.competencia)
  return {
    leitura: {
      nome: texto(d.nome),
      cpf: texto(d.cpf)?.replace(/\D/g, "") || null,
      competencia: competencia && /^\d{4}-\d{2}$/.test(competencia) ? competencia : null,
      totalProventos: numero(d.total_proventos),
      totalDescontos: numero(d.total_descontos),
      valorLiquido: numero(d.valor_liquido),
    },
  }
}
