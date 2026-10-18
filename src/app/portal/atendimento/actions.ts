"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import {
  ehPedidoDeDesfiliacao,
  MOTIVO_DESFILIACAO,
  TITULO_DESFILIACAO,
} from "@/app/portal/primeiro-acesso/regras"
import { type EstadoFormAtendimento } from "@/lib/atendimento-constantes"
import { requireSessaoPortal } from "@/lib/auth"
import {
  abrirAtendimento,
  atendimentoDoFiliado,
  encerrarComoFiliado,
  reabrirComoFiliado,
  responderComoFiliado,
} from "@/lib/db/portal-atendimentos"
import { bloqueioDaParte } from "@/lib/db/portal-partes"

function campo(fd: FormData, nome: string): string {
  return String(fd.get(nome) ?? "").trim()
}

function arquivo(fd: FormData, nome: string): File | null {
  const v = fd.get(nome)
  return v instanceof File && v.size > 0 ? v : null
}

/** Os textos como a pessoa os escreveu (sem o trim), para voltarem ao formulário quando o servidor recusa. */
function escrito(fd: FormData, nome: string): string {
  return String(fd.get(nome) ?? "")
}

/**
 * Atendimento suspenso ou desabilitado, ou o portal em modo de consulta
 * (Filiados › Área do associado): a recusa, antes de gravar qualquer coisa.
 * A página já tira os formulários; isto vale para a aba aberta antes da
 * mudança. Na dúvida (leitura que falhou), grava.
 *
 * `ignorarPrimeiroAcesso`: só para o pedido de desfiliação (a marca
 * MOTIVO_DESFILIACAO) — direito do associado, não espera o primeiro acesso.
 */
function bloqueio(ignorarPrimeiroAcesso = false): Promise<string | null> {
  return bloqueioDaParte("atendimento", undefined, { ignorarPrimeiroAcesso }).catch(() => null)
}

/**
 * A marca da desfiliação numa solicitação já aberta (responder, encerrar,
 * reabrir): o campo oculto vem do cliente, então só vale se a solicitação,
 * lida aqui, for mesmo o pedido de desfiliação da própria pessoa.
 */
async function marcaDaDesfiliacao(fd: FormData, id: string, cpf: string): Promise<boolean> {
  if (campo(fd, "motivo") !== MOTIVO_DESFILIACAO || !id) return false
  const dados = await atendimentoDoFiliado(id, cpf).catch(() => null)
  return Boolean(dados && ehPedidoDeDesfiliacao(dados.atendimento.titulo))
}

export async function abrirAtendimentoAction(_prev: EstadoFormAtendimento, fd: FormData): Promise<EstadoFormAtendimento> {
  // Só o próprio filiado (a visualização pela gestão é somente leitura).
  const { filiado } = await requireSessaoPortal()
  // Pedido de desfiliação (campo oculto do link de Minha filiação): a marca
  // dispensa só o primeiro acesso pendente — Atendimento e portal valem. O
  // resumo, o servidor fixa: a marca não abre o Atendimento para outro assunto.
  const desfiliacao = campo(fd, "motivo") === MOTIVO_DESFILIACAO
  const titulo = desfiliacao ? TITULO_DESFILIACAO : campo(fd, "titulo")
  const tituloEscrito = desfiliacao ? TITULO_DESFILIACAO : escrito(fd, "titulo")
  const recusa = await bloqueio(desfiliacao)
  if (recusa) {
    return {
      erro: recusa,
      valores: { assunto: campo(fd, "assunto"), titulo: tituloEscrito, texto: escrito(fd, "texto") },
    }
  }
  const r = await abrirAtendimento({
    cpf: filiado.cpf,
    filiacaoId: filiado.filiacaoId,
    nome: filiado.nome_completo,
    email: filiado.email,
    assunto: campo(fd, "assunto"),
    titulo,
    texto: campo(fd, "texto"),
    anexo: arquivo(fd, "anexo"),
  })
  if (r.erro || !r.id) {
    return {
      erro: r.erro ?? "Não foi possível abrir.",
      campo: r.campo,
      valores: { assunto: campo(fd, "assunto"), titulo: tituloEscrito, texto: escrito(fd, "texto") },
    }
  }
  revalidatePath("/portal/atendimento")
  // Com a marca, a solicitação abre mesmo com o primeiro acesso pendente (o
  // portão a deixa passar), e a pessoa vê a confirmação do envio.
  redirect(`/portal/atendimento/${r.id}?aberta=1${desfiliacao ? `&motivo=${MOTIVO_DESFILIACAO}` : ""}`)
}

export async function responderAtendimentoPortalAction(_prev: EstadoFormAtendimento, fd: FormData): Promise<EstadoFormAtendimento> {
  const { filiado } = await requireSessaoPortal()
  const id = campo(fd, "atendimento_id")
  const recusa = await bloqueio(await marcaDaDesfiliacao(fd, id, filiado.cpf))
  if (recusa) return { erro: recusa, valores: { texto: escrito(fd, "texto") } }
  const r = await responderComoFiliado({
    id,
    cpf: filiado.cpf,
    nome: filiado.nome_completo,
    texto: campo(fd, "texto"),
    anexo: arquivo(fd, "anexo"),
  })
  if (r.erro) return { erro: r.erro, campo: r.campo, valores: { texto: escrito(fd, "texto") } }
  revalidatePath(`/portal/atendimento/${id}`)
  return { ok: "Mensagem enviada." }
}

/** "Resolvido, pode encerrar" — o associado conclui a própria solicitação (A97). */
export async function encerrarAtendimentoPortalAction(_prev: EstadoFormAtendimento, fd: FormData): Promise<EstadoFormAtendimento> {
  const { filiado } = await requireSessaoPortal()
  const id = campo(fd, "atendimento_id")
  const desfiliacao = await marcaDaDesfiliacao(fd, id, filiado.cpf)
  const recusa = await bloqueio(desfiliacao)
  if (recusa) return { erro: recusa }
  const r = await encerrarComoFiliado({ id, cpf: filiado.cpf, nome: filiado.nome_completo })
  if (r.erro) return { erro: r.erro }
  revalidatePath("/portal/atendimento")
  redirect(`/portal/atendimento/${id}?encerrada=1${desfiliacao ? `&motivo=${MOTIVO_DESFILIACAO}` : ""}`)
}

/** "Não resolveu — reabrir" dentro do prazo (A97). */
export async function reabrirAtendimentoPortalAction(_prev: EstadoFormAtendimento, fd: FormData): Promise<EstadoFormAtendimento> {
  const { filiado } = await requireSessaoPortal()
  const id = campo(fd, "atendimento_id")
  const desfiliacao = await marcaDaDesfiliacao(fd, id, filiado.cpf)
  const recusa = await bloqueio(desfiliacao)
  if (recusa) return { erro: recusa }
  const r = await reabrirComoFiliado({ id, cpf: filiado.cpf, nome: filiado.nome_completo })
  if (r.erro) return { erro: r.erro }
  revalidatePath("/portal/atendimento")
  redirect(`/portal/atendimento/${id}?reaberta=1${desfiliacao ? `&motivo=${MOTIVO_DESFILIACAO}` : ""}`)
}
