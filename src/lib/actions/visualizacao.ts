"use server"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import { getSessaoPainel } from "@/lib/auth"
import { podeAcessar } from "@/lib/permissoes"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"
import {
  alvoDaVisualizacao,
  COOKIE_VISUALIZACAO,
  gerarTokenVisualizacao,
  MAX_IDADE_VISUALIZACAO,
} from "@/lib/visualizacao-filiado"

/**
 * Inicia a visualização da área de um filiado (somente leitura). Gate:
 * filiacao_filiados. Grava o cookie assinado e leva ao portal.
 */
export async function iniciarVisualizacaoFiliado(formData: FormData): Promise<void> {
  const painel = await getSessaoPainel()
  if (
    !painel ||
    !podeAcessar(painel.permissoes, "filiacao_filiados", [
      "filiacao_gestao",
      "filiacao_receitas",
    ])
  ) {
    redirect("/painel/sem-acesso")
  }

  const filiacaoId = String(formData.get("filiacaoId") ?? "")
  if (!filiacaoId) redirect("/painel/filiados/lista")

  // Confere que a filiação existe no tenant antes de abrir a visualização.
  const admin = await createAdminClient()
  const { data } = await admin
    .from("filiacoes")
    .select("id")
    .eq("id", filiacaoId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (!data) redirect("/painel/filiados/lista")

  const jar = await cookies()
  jar.set(COOKIE_VISUALIZACAO, gerarTokenVisualizacao(filiacaoId, painel.usuario.id), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_IDADE_VISUALIZACAO,
  })

  redirect("/portal/inicio")
}

/** Encerra a visualização e volta ao cadastro do filiado. */
export async function encerrarVisualizacaoFiliado(): Promise<void> {
  const alvo = await alvoDaVisualizacao()
  const jar = await cookies()
  jar.delete(COOKIE_VISUALIZACAO)
  redirect(alvo ? `/painel/filiados/${alvo}` : "/painel/filiados/lista")
}
