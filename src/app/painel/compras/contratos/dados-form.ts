import type { DadosContrato } from "@/lib/db/contratos"
import { parseValorBR } from "@/lib/valores"

/**
 * Leitura dos campos comuns do formulário de contrato/ajuda (sem `arquivo` e
 * sem `apoio_institucional` — o primeiro é upload à parte, o segundo é definido
 * pela ORIGEM: false em Contratos, true em Ajudas institucionais).
 *
 * Módulo puro (sem "use server") para ser importado pelas actions dos dois
 * módulos — arquivos "use server" só podem exportar funções assíncronas.
 */
export function lerDadosContrato(
  formData: FormData
): Omit<DadosContrato, "arquivo_contrato" | "apoio_institucional"> {
  const t = (campo: string) => String(formData.get(campo) ?? "").trim()
  const ouNull = (v: string) => v || null
  const marcado = (campo: string) => t(campo) === "on"
  const valorBruto = t("valor")
  return {
    objeto: ouNull(t("objeto")),
    valor: valorBruto ? parseValorBR(valorBruto) : null,
    vigencia_inicio: ouNull(t("vigencia_inicio")),
    vigencia_termino: ouNull(t("vigencia_termino")),
    fornecedor_id: ouNull(t("fornecedor_id")),
    departamento_id: ouNull(t("departamento_id")),
    centro_custo_id: ouNull(t("centro_custo_id")),
    responsavel_id: ouNull(t("responsavel_id")),
    categoria_id: ouNull(t("categoria_id")),
    aditivo: marcado("aditivo"),
    sob_demanda: marcado("sob_demanda"),
    contrato_principal_id: ouNull(t("contrato_principal_id")),
  }
}
