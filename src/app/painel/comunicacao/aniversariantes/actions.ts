"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { aplicarVariaveis, EMAIL_VALIDO, normalizarCriterios, somarDias } from "@/lib/comunicacao-mensagens-constantes"
import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { hojeSP } from "@/lib/db/comum"
import {
  enviarLote,
  excluirModelo,
  marcarWhatsapp,
  moverModelo,
  prepararAniversario,
  reenviarFalhas,
  salvarEnvioAutomatico,
  salvarMensagemPadrao,
  salvarModelo,
  textoParaHtml,
} from "@/lib/db/comunicacao-mensagens"
import { nomeEntidade } from "@/lib/db/organizacao"
import { enviarEmail } from "@/lib/email"

const AQUI = "/painel/comunicacao/aniversariantes"
const MENSAGENS = `${AQUI}/mensagens`

async function exigir() {
  return requirePermissao("comunicacao_mensagens")
}

const lerTexto = (fd: FormData) => ({
  assunto: String(fd.get("assunto") ?? ""),
  mensagem: String(fd.get("mensagem") ?? ""),
  textoWhatsapp: String(fd.get("texto_whatsapp") ?? ""),
})

/** O parabéns de hoje ainda não enviado passa a usar o texto novo. */
async function atualizarHoje() {
  await prepararAniversario(hojeSP()).catch(() => null)
  revalidatePath(AQUI, "layout")
}

export async function salvarEnvioAction(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const sessao = await exigir()
  const { erro } = await salvarEnvioAutomatico(
    {
      ativo: fd.get("ativo") === "on",
      horaEnvio: Number(fd.get("hora_envio")),
      avisoEquipeEmails: String(fd.get("aviso_equipe_emails") ?? ""),
      parabensAntecedencia: fd.get("parabens_antecedencia") === "1" ? 1 : 0,
      avisoAntecedencia: fd.get("aviso_antecedencia") === "1" ? 1 : 0,
    },
    sessao.usuario.id as string
  )
  if (erro) return { erro }
  revalidatePath(AQUI, "layout")
  return { ok: "Recorrência salva." }
}

export async function salvarPadraoAction(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const sessao = await exigir()
  const { erro } = await salvarMensagemPadrao(lerTexto(fd), sessao.usuario.id as string)
  if (erro) return { erro }
  await atualizarHoje()
  return { ok: "Mensagem padrão salva." }
}

export async function salvarModeloAction(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const sessao = await exigir()
  const id = String(fd.get("id") ?? "") || null
  const r = await salvarModelo(
    id,
    {
      ...lerTexto(fd),
      nome: String(fd.get("nome") ?? ""),
      ativo: fd.get("ativo") === "on",
      criterios: normalizarCriterios({
        idadeDe: fd.get("idadeDe"),
        idadeAte: fd.get("idadeAte"),
        idadeRedonda: fd.get("idadeRedonda"),
        filiadoHaDe: fd.get("filiadoHaDe"),
        filiadoHaAte: fd.get("filiadoHaAte"),
        fontes: fd.getAll("fontes"),
        condicoesFonte: fd.getAll("condicoesFonte"),
        uf: fd.get("uf"),
        cidade: fd.get("cidade"),
      }),
    },
    sessao.usuario.id as string
  )
  if (r.erro) return { erro: r.erro }
  await atualizarHoje()
  if (!id && r.id) redirect(`${MENSAGENS}/${r.id}?salvo=1`)
  return { ok: "Mensagem salva." }
}

export async function excluirModeloAction(fd: FormData): Promise<void> {
  await exigir()
  const r = await excluirModelo(String(fd.get("id") ?? ""))
  if (r.erro) throw new Error(r.erro)
  await atualizarHoje()
  redirect(MENSAGENS)
}

export async function moverModeloAction(fd: FormData): Promise<void> {
  await exigir()
  await moverModelo(String(fd.get("id") ?? ""), fd.get("direcao") === "subir" ? "subir" : "descer")
  await atualizarHoje()
}

/** Manda o parabéns do formulário para o e-mail de quem está testando. */
export async function enviarTesteAction(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const sessao = await exigir()
  const email = String(sessao.usuario.email ?? sessao.user.email ?? "").trim()
  if (!EMAIL_VALIDO.test(email)) return { erro: "Seu usuário não tem e-mail cadastrado para receber o teste." }
  const nome = String(sessao.usuario.nome_completo ?? sessao.usuario.nome_guerra ?? "Filiado")
  const entidade = await nomeEntidade()
  const { assunto, mensagem } = lerTexto(fd)
  if (!assunto.trim() || !mensagem.trim()) return { erro: "Escreva o assunto e a mensagem antes do teste." }
  const ok = await enviarEmail({
    email,
    nome,
    assunto: `[Teste] ${aplicarVariaveis(assunto.trim(), { nome, entidade })}`,
    html: textoParaHtml(aplicarVariaveis(mensagem.trim(), { nome, entidade })),
  })
  return ok ? { ok: `Teste enviado para ${email}.` } : { erro: "O provedor de e-mail não aceitou o envio. Tente de novo em instantes." }
}

/**
 * Um lote do parabéns de um dia (hoje ou, com envio na véspera, amanhã):
 * prepara o dia (se ainda não estiver) e manda os próximos e-mails. A tela
 * chama de novo enquanto houver restantes.
 */
export async function enviarLoteDiaAction(
  dia: string
): Promise<{ erro?: string; enviados?: number; falhas?: number; restantes?: number }> {
  await exigir()
  const hoje = hojeSP()
  if (dia !== hoje && dia !== somarDias(hoje, 1)) return { erro: "Só dá para enviar o parabéns de hoje ou de amanhã." }
  const prep = await prepararAniversario(dia)
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
  // O mesmo botão serve à lista da mala direta.
  revalidatePath("/painel/comunicacao/mensagens", "layout")
  return r
}
