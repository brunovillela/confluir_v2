"use server"

import { revalidatePath } from "next/cache"

import { requireSessaoPainel } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { avaliarDespesaCaixa, transferirDespesaCaixa } from "@/lib/db/caixa-reconhecimento"
import { podeAcessar } from "@/lib/permissoes"

function revalidar() {
  revalidatePath("/painel/perfil/despesas-caixa")
  revalidatePath("/painel/perfil/caixa")
  revalidatePath("/painel/financeiro/caixas")
  revalidatePath("/painel")
}

/** O responsável da conta reconhece (ou não) a despesa lançada por outra pessoa. */
export async function avaliarDespesaCaixaAction(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const sessao = await requireSessaoPainel()
  const id = String(fd.get("id") ?? "")
  const reconhece = String(fd.get("decisao") ?? "") === "reconhecer"
  const motivo = String(fd.get("motivo") ?? "").trim() || null
  if (!id) return { erro: "Despesa inválida." }
  const { erro } = await avaliarDespesaCaixa(id, String(sessao.usuario.id), reconhece, motivo)
  if (erro) return { erro }
  revalidar()
  return { ok: reconhece ? "Despesa reconhecida." : "Despesa não reconhecida — o valor voltou ao seu saldo e quem lançou foi avisado para transferir." }
}

/** Quem lançou (ou a administração do caixa) transfere a despesa para a conta certa. */
export async function transferirDespesaCaixaAction(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const sessao = await requireSessaoPainel()
  const id = String(fd.get("id") ?? "")
  const conta = String(fd.get("conta_id") ?? "")
  if (!id) return { erro: "Despesa inválida." }
  if (!conta) return { erro: "Escolha a conta de caixa certa." }
  const { erro } = await transferirDespesaCaixa(id, String(sessao.usuario.id), conta, podeAcessar(sessao.permissoes, "financeiro_caixa_admin"))
  if (erro) return { erro }
  revalidar()
  return { ok: "Despesa transferida." }
}
