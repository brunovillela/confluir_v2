"use server"

import { revalidatePath } from "next/cache"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { TIPOS_CHAVE_PIX, TIPOS_CONTA } from "@/lib/contracheques-constantes"
import { salvarDadosBancariosFuncionario } from "@/lib/db/contracheques-ordens"
import { funcionariosParaSelecao } from "@/lib/db/pessoal"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Dados bancários do funcionário (onde cai o pagamento das ordens da folha).
 * Só a gestão do Pessoal edita — o próprio funcionário não troca a conta
 * em que recebe o salário.
 */
export async function salvarDadosBancariosAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("pessoal_gestao")
  const usuarioId = String(formData.get("usuario_id") ?? "")
  if (!UUID.test(usuarioId)) return { erro: "Funcionário inválido." }
  // Só funcionário do sindicato (não qualquer usuário do tenant).
  const funcionarios = await funcionariosParaSelecao()
  if (!funcionarios.some((f) => f.usuarioId === usuarioId)) {
    return { erro: "Funcionário não encontrado entre os ativos." }
  }

  const txt = (campo: string) => String(formData.get(campo) ?? "").replace(/\s+/g, " ").trim() || null
  const tipoConta = txt("tipo_conta")
  const pixTipo = txt("pix_tipo")
  const dados = {
    banco: txt("banco"),
    bancoCodigo: txt("banco_codigo")?.replace(/\D/g, "") || null,
    agencia: txt("agencia"),
    conta: txt("conta"),
    tipoConta: TIPOS_CONTA.some((t) => t.valor === tipoConta) ? tipoConta : null,
    pix: txt("pix"),
    pixTipo: (TIPOS_CHAVE_PIX as readonly string[]).includes(pixTipo ?? "") ? pixTipo : null,
    favorecido: txt("favorecido"),
    preferePix: formData.get("prefere_pix") === "on",
  }
  if (dados.conta && !dados.agencia) return { erro: "Informe a agência da conta." }
  if (dados.agencia && !dados.conta) return { erro: "Informe o número da conta." }
  if (dados.conta && !dados.banco && !dados.bancoCodigo) return { erro: "Informe o banco da conta." }
  if (dados.pix && !dados.pixTipo) return { erro: "Informe o tipo da chave Pix." }
  if (dados.preferePix && !dados.pix) return { erro: "Para pagar por Pix, informe a chave." }
  if (!dados.conta && !dados.pix) return { erro: "Informe a conta ou a chave Pix." }

  const { erro } = await salvarDadosBancariosFuncionario(usuarioId, dados)
  if (erro) return { erro }
  revalidatePath(`/painel/pessoal/${usuarioId}`)
  revalidatePath("/painel/pessoal/contracheques/configuracao")
  return { ok: "Dados bancários salvos." }
}
