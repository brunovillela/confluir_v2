import "server-only"

import { linkConfirmacaoEmail, textoValidade } from "@/lib/auth-email-constantes"
import { enviarEmail } from "@/lib/email"
import { caixaAviso, caixaCodigo, paragrafo, textoSuave, tituloEmail } from "@/lib/email-layout"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { origemAtual } from "@/lib/tenant-url"

/**
 * CÓDIGO DE ACESSO PELO CANAL DO APP.
 *
 * Por que (22/09/2026): o código de 6 dígitos saía pelo SMTP configurado no
 * Supabase. Esse canal reteve 15 de 15 códigos das caixas da Microsoft durante
 * uma votação e, no fim do dia, parou de enviar de vez ("Error sending magic
 * link email"), derrubando junto convite, redefinição de senha e link do
 * portal. O e-mail do próprio app, que vai pela API do provedor, continuou
 * entregando.
 *
 * Então o código passa a ser GERADO no Supabase (admin.generateLink, que não
 * envia nada) e ENVIADO por nós, na moldura do Confluir. É o mesmo código de
 * sempre: quem confere continua sendo o `verifyOtp`. Se o nosso envio falhar,
 * cai no caminho antigo (o Supabase manda) — assim nenhum canal é ponto único.
 */

export type ResultadoCodigo = { ok?: true; erro?: string }

/**
 * Manda o código de acesso para `email`, criando a conta se ela não existir.
 * `metadata` vai para o user_metadata na criação (ex.: tipo e CPF do eleitor).
 */
export async function enviarCodigoAcesso(destino: {
  email: string
  metadata?: Record<string, unknown>
  /** Para onde o botão do e-mail leva depois de confirmar. */
  next?: string
  /** Frase que explica o que está sendo liberado. */
  contexto?: string
}): Promise<ResultadoCodigo> {
  const email = destino.email.trim().toLowerCase()
  const admin = await createAdminClient()

  // 1. A conta precisa existir para gerar o código (o link mágico é de conta
  //    existente). Criada já confirmada e sem e-mail nenhum do Supabase.
  const { data: lista } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  const existente = (lista?.users ?? []).find((u) => (u.email ?? "").toLowerCase() === email)
  if (!existente) {
    const { error } = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: destino.metadata ?? {},
    })
    if (error) return { erro: "Não foi possível preparar o seu acesso. Tente de novo." }
  } else if (destino.metadata && Object.keys(destino.metadata).length > 0) {
    await admin.auth.admin.updateUserById(existente.id, {
      user_metadata: { ...existente.user_metadata, ...destino.metadata },
    })
  }

  // 2. Gera o código SEM enviar (generateLink não dispara e-mail).
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email })
  const codigo = data?.properties?.email_otp
  if (error || !codigo) return await pelaSupabase(email, destino.metadata)

  // 3. Manda pelo canal do app.
  const origem = await origemAtual()
  const link = linkConfirmacaoEmail(origem, data?.properties, destino.next ?? "/portal")
  const corpo = [
    tituloEmail("Seu código de acesso"),
    paragrafo(
      destino.contexto ??
        "Use o código abaixo para entrar. Ele foi pedido agora, na tela do Confluir."
    ),
    caixaCodigo(codigo),
    link
      ? paragrafo(
          `Se preferir, <a href="${link}" style="font-weight:600;">clique aqui para entrar direto</a>.`
        )
      : "",
    caixaAviso(
      `O código vale por <strong>${textoValidade()}</strong> e serve uma vez só. <strong>Ninguém do sindicato vai pedir este código</strong> — não o repasse a quem quer que seja.`
    ),
    textoSuave("Não foi você quem pediu? Ignore este e-mail; nada acontece sem o código."),
  ].join("\n")

  const enviado = await enviarEmail({
    email,
    assunto: "Confluir | Seu código de acesso",
    html: corpo,
  })
  if (enviado) return { ok: true }

  // 4. Nosso canal falhou: tenta o do Supabase, para não ficar sem saída.
  return await pelaSupabase(email, destino.metadata)
}

/** Caminho antigo: o próprio Supabase manda o código pelo SMTP dele. */
async function pelaSupabase(
  email: string,
  metadata?: Record<string, unknown>
): Promise<ResultadoCodigo> {
  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true, data: metadata },
  })
  return error ? { erro: "Não foi possível enviar o código. Tente de novo." } : { ok: true }
}

/**
 * Link de redefinição de senha pelo canal do app (mesmo motivo do código
 * acima). O link é gerado por admin.generateLink, que não envia nada, e sai
 * na moldura do Confluir. Erro nenhum vaza para a tela: quem chama devolve
 * sempre a mesma resposta, para não entregar quem tem conta.
 */
export async function enviarLinkRedefinicao(
  email: string,
  origem: string
): Promise<{ enviado: boolean; motivo?: string }> {
  const admin = await createAdminClient()
  const { data, error } = await admin.auth.admin.generateLink({
    type: "recovery",
    email: email.trim().toLowerCase(),
  })
  if (error || !data?.properties) {
    return { enviado: false, motivo: error?.message ?? "conta não encontrada" }
  }
  const link = linkConfirmacaoEmail(origem, data.properties, "/definir-senha")
  if (!link) return { enviado: false, motivo: "link não gerado" }

  const corpo = [
    tituloEmail("Redefinir a sua senha"),
    paragrafo("Recebemos um pedido para trocar a senha do seu acesso ao Confluir."),
    paragrafo(`<a href="${link}" style="font-weight:600;">Clique aqui para criar uma nova senha</a>.`),
    caixaAviso(
      `Este link vale por <strong>${textoValidade()}</strong> e funciona uma vez só. Abra-o no mesmo aparelho em que pediu.`
    ),
    textoSuave("Não foi você quem pediu? Ignore este e-mail: a senha atual continua valendo."),
  ].join("\n")

  const enviado = await enviarEmail({
    email,
    assunto: "Confluir | Redefinição de senha",
    html: corpo,
  })
  return { enviado, motivo: enviado ? undefined : "provedor recusou o envio" }
}

/**
 * Convite de primeiro acesso pelo canal do app. Cria a conta (sem e-mail do
 * Supabase) e manda o link de definição de senha na moldura do Confluir.
 * Devolve o id da conta, que o chamador guarda no cadastro.
 */
export async function enviarConvitePrimeiroAcesso(dados: {
  email: string
  nome?: string | null
  metadata?: Record<string, unknown>
  origem: string
}): Promise<{ usuarioId?: string; erro?: string }> {
  const email = dados.email.trim().toLowerCase()
  const admin = await createAdminClient()

  // generateLink "invite" cria a conta e devolve o link — sem enviar nada.
  const { data, error } = await admin.auth.admin.generateLink({
    type: "invite",
    email,
    options: { data: dados.metadata ?? {} },
  })
  if (error || !data?.user) {
    return { erro: "Não foi possível criar o acesso. Tente novamente." }
  }
  const link = linkConfirmacaoEmail(dados.origem, data.properties, "/definir-senha")
  if (!link) return { erro: "Não foi possível montar o link do convite." }

  const corpo = [
    tituloEmail("Seu acesso ao Confluir"),
    paragrafo(
      dados.nome
        ? `Olá, ${dados.nome.trim().split(/\s+/)[0]}. Criamos o seu acesso ao Confluir.`
        : "Criamos o seu acesso ao Confluir."
    ),
    paragrafo(`<a href="${link}" style="font-weight:600;">Clique aqui para criar a sua senha</a> e entrar.`),
    caixaAviso(
      `Este link vale por <strong>${textoValidade()}</strong> e funciona uma vez só. Se vencer, use "Esqueci minha senha" na tela de entrada, com este mesmo e-mail.`
    ),
    textoSuave("Não esperava este convite? Fale com a secretaria antes de criar a senha."),
  ].join("\n")

  const enviado = await enviarEmail({ email, nome: dados.nome, assunto: "Confluir | Seu acesso", html: corpo })
  return enviado
    ? { usuarioId: data.user.id }
    : { usuarioId: data.user.id, erro: "A conta foi criada, mas o e-mail do convite não saiu." }
}
