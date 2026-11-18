"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { darMenorMatricula, ficarComMenorMatricula } from "@/lib/db/filiacao-identidade"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PAGINA = "/painel/filiados/saude-cadastros/numeracao"

function voltar(params: Record<string, string>): never {
  revalidatePath(PAGINA)
  redirect(`${PAGINA}?${new URLSearchParams(params)}`)
}

/** Cadastro sem matrícula: recebe a menor livre. */
export async function darMatriculaAction(formData: FormData) {
  const sessao = await requirePermissao("filiacao_gestao")
  const id = String(formData.get("id") ?? "")
  if (!UUID.test(id)) voltar({ erro: "Cadastro inválido." })
  const r = await darMenorMatricula(id, sessao.usuario.id as string)
  if (r.erro) voltar({ erro: r.erro })
  voltar({ feito: `Matrícula ${r.matricula} atribuída.` })
}

/** Cadastro unido com o número maior: fica com o menor do grupo. */
export async function ficarComMenorAction(formData: FormData) {
  const sessao = await requirePermissao("filiacao_gestao")
  const id = String(formData.get("id") ?? "")
  const menor = Number(formData.get("menor"))
  if (!UUID.test(id)) voltar({ erro: "Cadastro inválido." })
  const r = await ficarComMenorMatricula(id, menor, sessao.usuario.id as string)
  if (r.erro) voltar({ erro: r.erro })
  voltar({ feito: `O cadastro passou a usar a matrícula ${menor}; o número maior ficou livre.` })
}
