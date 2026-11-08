import "server-only"

import { texto } from "@/lib/db/comum"
import { registrarEvento } from "@/lib/db/oposicao"
import { marcaDaPessoa } from "@/lib/db/oposicao-ciencia"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * VÍDEO DE SENSIBILIZAÇÃO CONFERIDO NO SERVIDOR (08/11/2026).
 *
 * Até aqui só a tela segurava o botão "Prosseguir" pelo tempo mínimo, e o
 * relógio andava com a página aberta, mesmo com o vídeo parado. Agora:
 *  - a tela conta só o tempo com o vídeo TOCANDO (API do player do YouTube);
 *  - no primeiro play, o servidor grava `video_iniciado` na trilha (com a
 *    marca anônima da pessoa, como a ciência das instruções);
 *  - na confirmação, com a decisão "exigir o tempo mínimo", o servidor recusa
 *    se não passou o mínimo desde esse primeiro play — editar a página não
 *    pula a espera;
 *  - registrada a oposição, `video_assistido` vai para a trilha dela: os
 *    segundos que o navegador contou com o vídeo tocando e o tempo medido
 *    pelo servidor desde o primeiro play.
 * O primeiro play vale para sempre na campanha: recarregar a página não faz
 * a pessoa esperar de novo.
 */

export async function registrarInicioDoVideo(
  campanhaId: string,
  cpf: string,
  perfil: string,
  ip: string | null,
  userAgent: string | null
): Promise<void> {
  if (await inicioDoVideo(campanhaId, cpf)) return
  await registrarEvento(null, "video_iniciado", `pessoa:${marcaDaPessoa(campanhaId, cpf)} perfil:${perfil}`, ip, userAgent, {
    campanhaId,
  })
}

/** Quando a pessoa deu o primeiro play no vídeo desta campanha (ISO), ou null. */
export async function inicioDoVideo(campanhaId: string, cpf: string): Promise<string | null> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("oposicao_eventos")
    .select("created_at")
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("campanha_id", campanhaId)
    .eq("evento", "video_iniciado")
    .like("detalhe", `pessoa:${marcaDaPessoa(campanhaId, cpf)} %`)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()
  return texto(data?.created_at)
}

/** Segundos desde o primeiro play, ou null sem play registrado. */
export async function segundosDesdeOInicioDoVideo(campanhaId: string, cpf: string): Promise<number | null> {
  const inicio = await inicioDoVideo(campanhaId, cpf)
  if (!inicio) return null
  return Math.max(0, Math.floor((Date.now() - new Date(inicio).getTime()) / 1000))
}
