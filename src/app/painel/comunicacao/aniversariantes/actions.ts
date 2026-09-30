"use server"

import { revalidatePath } from "next/cache"

import { aplicarVariaveis, EMAIL_VALIDO } from "@/lib/comunicacao-mensagens-constantes"
import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { hojeSP } from "@/lib/db/comum"
import {
  enviarLote,
  marcarWhatsapp,
  prepararAniversario,
  reenviarFalhas,
  salvarConfigAniversario,
  textoParaHtml,
} from "@/lib/db/comunicacao-mensagens"
import { nomeEntidade } from "@/lib/db/organizacao"
import { enviarEmail } from "@/lib/email"

const AQUI = "/painel/comunicacao/aniversariantes"

async function exigir() {
  return requirePermissao("comunicacao_mensagens")
}

export async function salvarConfigAction(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const sessao = await exigir()
  const { erro } = await salvarConfigAniversario(
    {
      ativo: fd.get("ativo") === "on",
      assunto: String(fd.get("assunto") ?? ""),
      mensagem: String(fd.get("mensagem") ?? ""),
      textoWhatsapp: String(fd.get("texto_whatsapp") ?? ""),
    },
    sessao.usuario.id as string
  )
  if (erro) return { erro }
  // O parabéns de hoje ainda não enviado passa a usar o texto novo.
  await prepararAniversario(hojeSP()).catch(() => null)
  revalidatePath(AQUI)
  return { ok: "Mensagem de parabéns salva." }
}

/** Manda o parabéns do form para o e-mail de quem está testando. */
export async function enviarTesteAction(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const sessao = await exigir()
  const email = String(sessao.usuario.email ?? sessao.user.email ?? "").trim()
  if (!EMAIL_VALIDO.test(email)) return { erro: "Seu usuário não tem e-mail cadastrado para receber o teste." }
  const nome = String(sessao.usuario.nome_completo ?? sessao.usuario.nome_guerra ?? "Filiado")
  const entidade = await nomeEntidade()
  const assunto = String(fd.get("assunto") ?? "").trim()
  const mensagem = String(fd.get("mensagem") ?? "").trim()
  if (!assunto || !mensagem) return { erro: "Escreva o assunto e a mensagem antes do teste." }
  const ok = await enviarEmail({
    email,
    nome,
    assunto: `[Teste] ${aplicarVariaveis(assunto, { nome, entidade })}`,
    html: textoParaHtml(aplicarVariaveis(mensagem, { nome, entidade })),
  })
  return ok ? { ok: `Teste enviado para ${email}.` } : { erro: "O provedor de e-mail não aceitou o envio. Tente de novo em instantes." }
}

/**
 * Um lote do parabéns de hoje: prepara o dia (se ainda não estiver) e manda os
 * próximos e-mails. A tela chama de novo enquanto houver restantes.
 */
export async function enviarLoteHojeAction(): Promise<{ erro?: string; enviados?: number; falhas?: number; restantes?: number }> {
  await exigir()
  const prep = await prepararAniversario(hojeSP())
  if (!prep.mensagemId) return { erro: prep.erro ?? "Não foi possível preparar o parabéns de hoje." }
  const r = await enviarLote(prep.mensagemId)
  if (r.restantes === 0) revalidatePath(AQUI)
  return r
}

export async function reenviarFalhasAction(fd: FormData): Promise<void> {
  await exigir()
  const id = String(fd.get("mensagem_id") ?? "")
  if (id) await reenviarFalhas(id)
  revalidatePath(AQUI)
}

export async function marcarWhatsappAction(envioId: string): Promise<{ erro?: string }> {
  const sessao = await exigir()
  const r = await marcarWhatsapp(envioId, sessao.usuario.id as string)
  revalidatePath(AQUI)
  return r
}
