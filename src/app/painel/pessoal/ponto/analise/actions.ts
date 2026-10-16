"use server"

import { revalidatePath } from "next/cache"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { carregarBasePonto, indicadoresDe } from "@/lib/db/ponto-analise"
import { lerEspelhosDaRemessa } from "@/lib/db/ponto-marcacoes"
import { gerarResenha } from "@/lib/db/ponto-resenha"

/** Gera (ou refaz) a resenha da IA de uma remessa, de um ano ou de um departamento no ano. */
export async function gerarResenhaPontoAction(_prev: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const sessao = await requirePermissao("pessoal_gestao")
  const escopo = String(formData.get("escopo") ?? "")
  const remessaId = String(formData.get("remessa_id") ?? "")
  const ano = String(formData.get("ano") ?? "")
  const departamento = String(formData.get("departamento") ?? "")
  const base = await carregarBasePonto()

  let r: { erro?: string }
  if (escopo === "remessa" && remessaId) {
    r = await gerarResenha("remessa", remessaId, indicadoresDe(base, { escopo, remessaId }), sessao.usuario.id as string)
    revalidatePath(`/painel/pessoal/ponto/${remessaId}`)
  } else if (escopo === "ano" && /^\d{4}$/.test(ano)) {
    r = await gerarResenha("ano", ano, indicadoresDe(base, { escopo, ano }), sessao.usuario.id as string)
  } else if (escopo === "departamento" && /^\d{4}$/.test(ano) && departamento) {
    r = await gerarResenha(
      "departamento",
      `${ano}:${departamento}`,
      indicadoresDe(base, { escopo, ano, departamento }),
      sessao.usuario.id as string
    )
  } else {
    return { erro: "Recorte inválido." }
  }
  if (r.erro) return { erro: r.erro }
  revalidatePath("/painel/pessoal/ponto/analise")
  return { ok: "Resenha gerada." }
}

/** Lê um lote de espelhos da remessa; a tela repete até não faltar nenhum. */
export async function lerEspelhosPontoAction(
  remessaId: string
): Promise<{ erro?: string; lidos?: number; pulados?: number; erros?: number; faltam?: number }> {
  await requirePermissao("pessoal_gestao")
  if (!remessaId) return { erro: "Remessa inválida." }
  const r = await lerEspelhosDaRemessa(remessaId)
  if (r.indisponivel) return { erro: "Rode supabase/ponto-analise.sql no SQL Editor para ler os espelhos." }
  revalidatePath(`/painel/pessoal/ponto/${remessaId}`)
  return r
}
