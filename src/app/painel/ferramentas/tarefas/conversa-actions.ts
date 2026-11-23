"use server"

import { requireSessaoPainel } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { avisar, depoisDaResposta, usuariosComPermissao } from "@/lib/db/avisos"
import { listarPessoasAtribuiveis } from "@/lib/db/nucleo"
import { avisarSeguidores, estadoDeSeguir, seguir, vinculoDaTarefa } from "@/lib/db/seguidores"
import { listarConversa, registrarMensagem, tarefaDaConversa, type MensagemTarefa } from "@/lib/db/tarefa-conversa"
import { mencoesNoTexto, type PessoaMencionavel } from "@/lib/ferramentas-acompanhamento"

/**
 * Conversa da tarefa. Fora do módulo Ferramentas (as ações não passam pelo
 * portão de rota): o responsável sem a permissão de Tarefas conversa pelo
 * Meu perfil → Minhas tarefas. O acesso é conferido no banco a cada chamada.
 *
 * Onda 4: "@Fulano" avisa a pessoa (tarefa_mencao) e a inscreve na tarefa;
 * quem segue a tarefa ou a demanda dela é avisado da mensagem (item_seguido).
 */

async function pessoa() {
  const sessao = await requireSessaoPainel()
  return { id: String(sessao.usuario.id), permissoes: sessao.permissoes }
}

export async function carregarConversaAction(tarefaId: string): Promise<{
  erro?: string
  titulo?: string | null
  mensagens?: MensagemTarefa[]
  eu?: string
  pessoas?: PessoaMencionavel[]
  seguindo?: boolean
  seguidores?: number
}> {
  const quem = await pessoa()
  const tarefa = await tarefaDaConversa(tarefaId, quem)
  if (!tarefa) return { erro: "Você não tem acesso a esta tarefa." }
  const [mensagens, pessoas, seguir] = await Promise.all([
    listarConversa(tarefaId),
    listarPessoasAtribuiveis(),
    estadoDeSeguir(quem.id, { tarefaId }),
  ])
  return {
    titulo: tarefa.titulo,
    mensagens,
    eu: quem.id,
    pessoas,
    seguindo: seguir.seguindo,
    seguidores: seguir.total,
  }
}

export async function enviarMensagemTarefaAction(_prev: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const quem = await pessoa()
  const tarefaId = String(formData.get("tarefa_id") ?? "")
  const tarefa = tarefaId ? await tarefaDaConversa(tarefaId, quem) : null
  if (!tarefa) return { erro: "Você não tem acesso a esta tarefa." }
  const arquivo = formData.get("anexo")
  const texto = String(formData.get("texto") ?? "").trim().slice(0, 4000)
  const { erro } = await registrarMensagem(tarefaId, quem.id, {
    texto,
    arquivo: arquivo instanceof File ? arquivo : null,
  })
  if (erro) return { erro }

  // Menções: a pessoa passa a seguir a tarefa (e ganha a conversa dela).
  const mencionados = texto ? mencoesNoTexto(texto, await listarPessoasAtribuiveis()).filter((id) => id !== quem.id) : []
  for (const id of mencionados) await seguir(id, { tarefaId }, "mencao")

  // Os avisos não levam o texto da mensagem: só quem escreveu e o título da
  // tarefa, com o link da conversa. Cada pessoa recebe um aviso só: menção,
  // depois "tarefa sua", depois "você segue".
  const destinos = [tarefa.responsavelId, tarefa.demandanteId].filter(
    (v): v is string => !!v && v !== quem.id && !mencionados.includes(v)
  )
  depoisDaResposta(async () => {
    const todos = await usuariosComPermissao(null)
    const autor = todos.find((p) => p.id === quem.id)?.nome ?? "Alguém"
    const titulo = (tarefa.titulo ?? "(sem título)").slice(0, 120)
    const link = `/painel/perfil/tarefas?conversa=${tarefa.id}`
    if (mencionados.length) {
      await avisar(
        todos.filter((p) => mencionados.includes(p.id)),
        {
          texto: `${autor} mencionou você na tarefa "${titulo}".`,
          link,
          evento: "tarefa_mencao",
          assunto: "Você foi mencionado numa tarefa",
          exceto: quem.id,
        }
      )
    }
    if (destinos.length) {
      await avisar(
        todos.filter((p) => destinos.includes(p.id)),
        {
          texto: `${autor} escreveu na tarefa "${titulo}".`,
          link,
          evento: "tarefa_comentario",
          assunto: "Mensagem nova numa tarefa",
          exceto: quem.id,
        }
      )
    }
    const vinculo = await vinculoDaTarefa(tarefa.id)
    await avisarSeguidores(
      { tarefaId: tarefa.id, demandaId: vinculo?.demandaId },
      { texto: `${autor} escreveu na tarefa "${titulo}", que você segue.`, link, assunto: "Mensagem nova numa tarefa que você segue" },
      [quem.id, tarefa.responsavelId, tarefa.demandanteId, ...mencionados]
    )
  })
  return { ok: mencionados.length ? `Mensagem enviada. ${mencionados.length === 1 ? "A pessoa mencionada foi avisada" : "As pessoas mencionadas foram avisadas"}.` : "Mensagem enviada." }
}
