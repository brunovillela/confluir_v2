"use server"

import { redirect } from "next/navigation"

import { definirComunicados, lerTokenDescadastro } from "@/lib/db/comunicacao-descadastro"

/** Confirmação na página do link: descadastra ou volta a receber. */
export async function alterarComunicadosAction(fd: FormData): Promise<void> {
  const token = String(fd.get("token") ?? "")
  const titular = lerTokenDescadastro(token)
  if (!titular) redirect(`/comunicados/sair/${encodeURIComponent(token)}`)
  const receber = fd.get("receber") === "1"
  const r = await definirComunicados(titular, receber, "link")
  if (r.erro) throw new Error(r.erro)
  redirect(`/comunicados/sair/${encodeURIComponent(token)}?feito=${receber ? "voltar" : "sair"}`)
}
