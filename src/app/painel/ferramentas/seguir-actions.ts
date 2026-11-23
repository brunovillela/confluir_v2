"use server"

import { revalidatePath } from "next/cache"

import { requireSessaoPainel } from "@/lib/auth"
import { obterDemanda } from "@/lib/db/nucleo"
import { deixarDeSeguir, estadoDeSeguir, seguir } from "@/lib/db/seguidores"
import { tarefaDaConversa } from "@/lib/db/tarefa-conversa"
import { podeAcessar } from "@/lib/permissoes"

/**
 * Seguir ou deixar de seguir (Onda 4). Segue quem vê: a tarefa, quem pode
 * abrir a conversa dela; a demanda, quem tem Demandas ou Tarefas. Fora do
 * portão do módulo (o responsável sem a permissão segue pelo Meu perfil).
 */
export async function alternarSeguirAction(
  tipo: "tarefa" | "demanda",
  id: string,
  querSeguir: boolean
): Promise<{ erro?: string; seguindo?: boolean; total?: number }> {
  const sessao = await requireSessaoPainel()
  const eu = String(sessao.usuario.id)
  if (!id) return { erro: "Item inválido." }
  if (tipo === "tarefa") {
    if (!(await tarefaDaConversa(id, { id: eu, permissoes: sessao.permissoes }))) return { erro: "Você não tem acesso a esta tarefa." }
  } else {
    if (!podeAcessar(sessao.permissoes, "ferramentas_demandas", ["ferramentas_tarefas"])) return { erro: "Sem acesso às demandas." }
    if (!(await obterDemanda(id))) return { erro: "Demanda não encontrada." }
  }
  const alvo = tipo === "tarefa" ? { tarefaId: id } : { demandaId: id }
  const r = querSeguir ? await seguir(eu, alvo) : await deixarDeSeguir(eu, alvo)
  if (r.erro) return { erro: r.erro }
  revalidatePath("/painel/perfil/tarefas")
  if (tipo === "demanda") revalidatePath(`/painel/ferramentas/demandas/${id}`)
  return estadoDeSeguir(eu, alvo)
}
