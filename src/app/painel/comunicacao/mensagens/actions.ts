"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { aplicarVariaveis, EMAIL_VALIDO, normalizarFiltros } from "@/lib/comunicacao-mensagens-constantes"
import { requirePermissao } from "@/lib/auth"
import {
  criarMalaDireta,
  desfazerAgendamento,
  enviarLote,
  excluirRascunho,
  faltasParaEnviar,
  htmlDoEnvio,
  interromperEnvio,
  liberarMalaDireta,
  obterMalaDireta,
  reenviarFalhas,
  resumoDoRecorte,
  salvarMalaDireta,
  type ResumoRecorte,
} from "@/lib/db/comunicacao-mensagens"
import { nomeEntidade } from "@/lib/db/organizacao"
import { enviarEmail } from "@/lib/email"

const LISTA = "/painel/comunicacao/mensagens"

async function exigir() {
  return requirePermissao("comunicacao_mensagens")
}

export async function novaMalaDiretaAction(): Promise<void> {
  const sessao = await exigir()
  const r = await criarMalaDireta(sessao.usuario.id as string)
  if (!r.id) throw new Error(r.erro ?? "Não foi possível criar a mensagem.")
  redirect(`${LISTA}/${r.id}`)
}

export type EstadoMalaDireta = {
  erro?: string
  ok?: string
  resumo?: ResumoRecorte
  /** Liberada para envio agora: a tela começa os lotes. */
  enviar?: boolean
}

function lerFormulario(fd: FormData) {
  return {
    titulo: String(fd.get("titulo") ?? ""),
    assunto: String(fd.get("assunto") ?? ""),
    corpo: String(fd.get("corpo") ?? ""),
    textoWhatsapp: String(fd.get("texto_whatsapp") ?? ""),
    filtros: normalizarFiltros({
      condicoes: fd.getAll("cond"),
      fonte: fd.get("fonte"),
      condicaoFonte: fd.get("condicaoFonte"),
      uf: fd.get("uf"),
      cidade: fd.get("cidade"),
      lotacao: fd.get("lotacao"),
      formaRecebimento: fd.get("formaRecebimento"),
      inadimplente: fd.get("inadimplente"),
      idadeMin: fd.get("idadeMin"),
      idadeMax: fd.get("idadeMax"),
    }),
  }
}

/**
 * O formulário da mala direta: grava o rascunho e, conforme o botão, confere o
 * recorte, manda o teste, agenda ou libera o envio.
 */
export async function malaDiretaAction(_prev: EstadoMalaDireta, fd: FormData): Promise<EstadoMalaDireta> {
  const sessao = await exigir()
  const usuarioId = sessao.usuario.id as string
  const id = String(fd.get("id") ?? "")
  const acao = String(fd.get("acao") ?? "salvar")
  const dados = lerFormulario(fd)

  const salvo = await salvarMalaDireta(id, dados, usuarioId)
  if (salvo.erro) return { erro: salvo.erro }
  revalidatePath(LISTA)

  if (acao === "conferir") {
    try {
      return { resumo: await resumoDoRecorte(dados.filtros) }
    } catch (e) {
      return { erro: e instanceof Error ? e.message : "Não foi possível conferir o recorte." }
    }
  }

  if (acao === "teste") {
    const falta = faltasParaEnviar(dados)
    if (falta) return { erro: falta }
    const email = String(sessao.usuario.email ?? sessao.user.email ?? "").trim()
    if (!EMAIL_VALIDO.test(email)) return { erro: "Seu usuário não tem e-mail cadastrado para receber o teste." }
    const nome = String(sessao.usuario.nome_completo ?? sessao.usuario.nome_guerra ?? "Filiado")
    const entidade = await nomeEntidade()
    const ok = await enviarEmail({
      email,
      nome,
      assunto: `[Teste] ${aplicarVariaveis(dados.assunto, { nome, entidade })}`,
      // O link de descadastro do teste é só ilustrativo: não aponta para ninguém.
      html: htmlDoEnvio({ tipo: "mala_direta", corpo: dados.corpo }, nome, entidade, "#"),
    })
    return ok ? { ok: `Teste enviado para ${email}.` } : { erro: "O provedor de e-mail não aceitou o envio. Tente de novo em instantes." }
  }

  if (acao === "agendar" || acao === "enviar") {
    const data = acao === "agendar" ? String(fd.get("agendar_para") ?? "") : null
    if (acao === "agendar" && !/^\d{4}-\d{2}-\d{2}$/.test(data ?? "")) return { erro: "Escolha a data do envio." }
    const r = await liberarMalaDireta(id, usuarioId, data)
    if (r.erro) return { erro: r.erro }
    revalidatePath(`${LISTA}/${id}`)
    revalidatePath(LISTA)
    return acao === "enviar" ? { enviar: true } : { ok: "Mensagem agendada." }
  }

  return { ok: "Rascunho salvo." }
}

/** Um lote da mala direta. A tela repete enquanto houver restantes. */
export async function enviarLoteMalaDiretaAction(
  id: string
): Promise<{ erro?: string; enviados?: number; falhas?: number; restantes?: number }> {
  await exigir()
  const m = await obterMalaDireta(id)
  if (!m) return { erro: "Mensagem não encontrada." }
  if (m.situacao !== "enviando") return { erro: "A mensagem não está liberada para envio.", restantes: 0 }
  const r = await enviarLote(id)
  if (r.restantes === 0) {
    revalidatePath(`${LISTA}/${id}`)
    revalidatePath(LISTA)
  }
  return r
}

export async function desfazerAgendamentoAction(fd: FormData): Promise<void> {
  const sessao = await exigir()
  const id = String(fd.get("id") ?? "")
  await desfazerAgendamento(id, sessao.usuario.id as string)
  revalidatePath(`${LISTA}/${id}`)
  revalidatePath(LISTA)
}

export async function interromperEnvioAction(fd: FormData): Promise<void> {
  const sessao = await exigir()
  const id = String(fd.get("id") ?? "")
  await interromperEnvio(id, sessao.usuario.id as string)
  revalidatePath(`${LISTA}/${id}`)
  revalidatePath(LISTA)
}

export async function reenviarFalhasMalaDiretaAction(fd: FormData): Promise<void> {
  await exigir()
  const id = String(fd.get("id") ?? "")
  const m = await obterMalaDireta(id)
  if (m && m.situacao !== "cancelada") await reenviarFalhas(id)
  revalidatePath(`${LISTA}/${id}`)
}

export async function excluirRascunhoAction(fd: FormData): Promise<void> {
  await exigir()
  const r = await excluirRascunho(String(fd.get("id") ?? ""))
  if (r.erro) throw new Error(r.erro)
  revalidatePath(LISTA)
  redirect(LISTA)
}
