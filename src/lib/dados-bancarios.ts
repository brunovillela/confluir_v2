import { lerDocumentoTitular } from "@/lib/cpf"
import { TIPOS_CHAVE_PIX, TIPOS_CONTA } from "@/lib/contracheques-constantes"

/**
 * Leitura e validação do formulário de dados bancários (conta e/ou Pix) —
 * o mesmo de Pessoal (funcionário) e da ficha do filiado. Os nomes dos campos
 * são os de `CamposDadosBancarios` (components/dados-bancarios-campos.tsx).
 */

export type EntradaDadosBancarios = {
  banco: string | null
  bancoCodigo: string | null
  agencia: string | null
  conta: string | null
  tipoConta: string | null
  pix: string | null
  pixTipo: string | null
  favorecido: string | null
  /** CPF/CNPJ do titular da conta (só dígitos). */
  titularDocumento: string | null
  preferePix: boolean
}

export function lerDadosBancariosForm(
  formData: FormData
): { dados: EntradaDadosBancarios } | { erro: string } {
  const txt = (campo: string) => String(formData.get(campo) ?? "").replace(/\s+/g, " ").trim() || null
  const tipoConta = txt("tipo_conta")
  const pixTipo = txt("pix_tipo")
  const titular = lerDocumentoTitular(txt("titular_documento"))
  const dados: EntradaDadosBancarios = {
    banco: txt("banco"),
    bancoCodigo: txt("banco_codigo")?.replace(/\D/g, "") || null,
    agencia: txt("agencia"),
    conta: txt("conta"),
    tipoConta: TIPOS_CONTA.some((t) => t.valor === tipoConta) ? tipoConta : null,
    pix: txt("pix"),
    pixTipo: (TIPOS_CHAVE_PIX as readonly string[]).includes(pixTipo ?? "") ? pixTipo : null,
    favorecido: txt("favorecido"),
    titularDocumento: titular.documento,
    preferePix: formData.get("prefere_pix") === "on",
  }
  if (titular.erro) return { erro: "CPF/CNPJ do titular da conta inválido." }
  if (dados.conta && !dados.agencia) return { erro: "Informe a agência da conta." }
  if (dados.agencia && !dados.conta) return { erro: "Informe o número da conta." }
  if (dados.conta && !dados.banco && !dados.bancoCodigo) return { erro: "Informe o banco da conta." }
  if (dados.pix && !dados.pixTipo) return { erro: "Informe o tipo da chave Pix." }
  if (dados.preferePix && !dados.pix) return { erro: "Para pagar por Pix, informe a chave." }
  if (!dados.conta && !dados.pix) return { erro: "Informe a conta ou a chave Pix." }
  return { dados }
}
