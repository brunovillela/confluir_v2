"use server"

import { requireSessaoPainel } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { avisar, depoisDaResposta, usuariosComPermissao } from "@/lib/db/avisos"
import { listarConversa, registrarMensagem, tarefaDaConversa, type MensagemTarefa } from "@/lib/db/tarefa-conversa"

/**
 * Conversa da tarefa. Fora do módulo Ferramentas (as ações não passam pelo
 * portão de rota): o responsável sem a permissão de Tarefas conversa pelo
 * Meu perfil → Minhas tarefas. O acesso é conferido no banco a cada chamada.
 */

async function pessoa() {
  const sessao = await requireSessaoPainel()
  return { id: String(sessao.usuario.id), permissoes: sessao.permissoes }
}

export async function carregarConversaAction(
  tarefaId: string
): Promise<{ erro?: string; titulo?: string | null; mensagens?: MensagemTarefa[]; eu?: string }> {
  const quem = await pessoa()
  const tarefa = await tarefaDaConversa(tarefaId, quem)
  if (!tarefa) return { erro: "Você não tem acesso a esta tarefa." }
  return { titulo: tarefa.titulo, mensagens: await listarConversa(tarefaId), eu: quem.id }
}

export async function enviarMensagemTarefaAction(_prev: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const quem = await pessoa()
  const tarefaId = String(formData.get("tarefa_id") ?? "")
  const tarefa = tarefaId ? await tarefaDaConversa(tarefaId, quem) : null
  if (!tarefa) return { erro: "Você não tem acesso a esta tarefa." }
  const arquivo = formData.get("anexo")
  const { erro } = await registrarMensagem(tarefaId, quem.id, {
    texto: String(formData.get("texto") ?? "").trim().slice(0, 4000),
    arquivo: arquivo instanceof File ? arquivo : null,
  })
  if (erro) return { erro }

  // Avisa o responsável e quem pediu (menos quem escreveu), sem o texto da
  // mensagem: só quem escreveu e o título da tarefa, com o link da conversa.
  const destinos = [tarefa.responsavelId, tarefa.demandanteId].filter((v): v is string => !!v && v !== quem.id)
  if (destinos.length) {
    depoisDaResposta(async () => {
      const todos = await usuariosComPermissao(null)
      const pessoas = todos.filter((p) => destinos.includes(p.id))
      const autor = todos.find((p) => p.id === quem.id)?.nome
      const titulo = (tarefa.titulo ?? "(sem título)").slice(0, 120)
      await avisar(
        pessoas,
        {
          texto: `${autor ?? "Alguém"} escreveu na tarefa "${titulo}".`,
          link: `/painel/perfil/tarefas?conversa=${tarefa.id}`,
          evento: "tarefa_comentario",
          assunto: "Mensagem nova numa tarefa",
          exceto: quem.id,
        }
      )
    })
  }
  return { ok: "Mensagem enviada." }
}
