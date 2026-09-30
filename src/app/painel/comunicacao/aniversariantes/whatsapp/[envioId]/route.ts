import { redirect } from "next/navigation"

import { aplicarVariaveis, linkWhatsapp } from "@/lib/comunicacao-mensagens-constantes"
import { requirePermissao } from "@/lib/auth"
import { marcarWhatsapp } from "@/lib/db/comunicacao-mensagens"
import { texto } from "@/lib/db/comum"
import { nomeEntidade } from "@/lib/db/organizacao"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Link do WhatsApp do aviso à equipe: registra quem abriu (como o botão da
 * tela) e leva ao wa.me com o texto da pessoa. Exige login e a permissão.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ envioId: string }> }) {
  const sessao = await requirePermissao("comunicacao_mensagens")
  const { envioId } = await params
  const db = await createAdminClient()
  const { data } = await db
    .from("comunicacao_envios")
    .select("id, nome, telefone, texto_whatsapp, comunicacao_mensagens(texto_whatsapp)")
    .eq("id", envioId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (!data?.telefone) redirect("/painel/comunicacao/aniversariantes")
  const msg = data.comunicacao_mensagens as unknown as { texto_whatsapp?: string | null } | null
  const modelo = texto(data.texto_whatsapp) ?? texto(msg?.texto_whatsapp) ?? ""
  const href = linkWhatsapp(String(data.telefone), aplicarVariaveis(modelo, { nome: String(data.nome ?? ""), entidade: await nomeEntidade() }))
  if (!href) redirect("/painel/comunicacao/aniversariantes")
  await marcarWhatsapp(envioId, sessao.usuario.id as string)
  redirect(href)
}
