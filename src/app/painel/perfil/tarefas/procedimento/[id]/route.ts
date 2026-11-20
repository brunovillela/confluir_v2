import { redirect } from "next/navigation"

import { requireSessaoPainel } from "@/lib/auth"
import { urlVersaoMaisRecente } from "@/lib/db/documentos"
import { tarefaDaConversa } from "@/lib/db/tarefa-conversa"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Abre o procedimento da tarefa (a versão mais recente do documento). Fica no
 * Meu perfil, fora do módulo Ferramentas: quem executa a tarefa lê o roteiro
 * mesmo sem a permissão de Documentos — basta poder ver a tarefa (as mesmas
 * regras da conversa).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const sessao = await requireSessaoPainel()
  const { id } = await params
  const tarefa = await tarefaDaConversa(id, { id: String(sessao.usuario.id), permissoes: sessao.permissoes })
  if (!tarefa) return new Response("Você não tem acesso a esta tarefa.", { status: 403 })
  const admin = await createAdminClient()
  const { data } = await admin
    .from("demandas_check_tarefas")
    .select("procedimento_id")
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  const url = data?.procedimento_id ? await urlVersaoMaisRecente(String(data.procedimento_id)) : null
  if (!url) return new Response("O procedimento desta tarefa não tem arquivo.", { status: 404 })
  redirect(url)
}
