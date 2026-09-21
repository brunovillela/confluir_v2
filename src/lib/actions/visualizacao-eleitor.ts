"use server"

import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import { getSessaoPainel } from "@/lib/auth"
import { podeAcessar } from "@/lib/permissoes"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"
import {
  alvoDaVisualizacaoEleitor,
  COOKIE_VISUALIZACAO_ELEITOR,
  gerarTokenVisualizacaoEleitor,
  MAX_IDADE_VISUALIZACAO_ELEITOR,
} from "@/lib/visualizacao-eleitor"

/**
 * Abre a área de votação de um apto em modo somente leitura. Gate:
 * assembleias. Leva à cédula da assembleia online em que o apto vota.
 */
export async function iniciarVisualizacaoEleitor(formData: FormData): Promise<void> {
  const painel = await getSessaoPainel()
  if (!painel || !podeAcessar(painel.permissoes, "assembleias")) redirect("/painel/sem-acesso")

  const aptoId = String(formData.get("aptoId") ?? "")
  const rodadaId = String(formData.get("rodadaId") ?? "")
  const voltar = rodadaId
    ? `/painel/representacao/assembleias/rodadas/${rodadaId}`
    : "/painel/representacao/assembleias"
  if (!aptoId) redirect(voltar)

  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data: apto } = await admin
    .from("voto_assembleias_aptos")
    .select("id, assembleia_id, rod_assembleia_id")
    .eq("id", aptoId)
    .eq("emp_proprietaria_id", emp)
    .maybeSingle()
  if (!apto) redirect(voltar)

  // A área do eleitor é a cédula de uma assembleia: a do apto ou, quando ele
  // está só na rodada, a assembleia online dela (senão a primeira).
  let assembleiaId = (apto.assembleia_id as string | null) ?? null
  if (!assembleiaId && apto.rod_assembleia_id) {
    const { data: doRodada } = await admin
      .from("voto_assembleias")
      .select("id, online")
      .eq("emp_proprietaria_id", emp)
      .eq("rod_assembleia_id", apto.rod_assembleia_id)
      .order("online", { ascending: false })
      .limit(1)
    assembleiaId = (doRodada?.[0]?.id as string | undefined) ?? null
  }
  if (!assembleiaId) redirect(`${voltar}?sem_assembleia=1`)

  const jar = await cookies()
  jar.set(COOKIE_VISUALIZACAO_ELEITOR, gerarTokenVisualizacaoEleitor(aptoId, painel.usuario.id), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_IDADE_VISUALIZACAO_ELEITOR,
  })
  redirect(`/votar/${assembleiaId}`)
}

/** Encerra a visualização e volta à lista de aptos da rodada. */
export async function encerrarVisualizacaoEleitor(): Promise<void> {
  const rodadaId = await alvoDaVisualizacaoEleitor()
  const jar = await cookies()
  jar.delete(COOKIE_VISUALIZACAO_ELEITOR)
  redirect(
    rodadaId
      ? `/painel/representacao/assembleias/rodadas/${rodadaId}`
      : "/painel/representacao/assembleias"
  )
}
