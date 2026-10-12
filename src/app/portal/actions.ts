"use server"

import { redirect } from "next/navigation"
import { after } from "next/server"

import {
  buscarFiliadoPorCpf,
  type EstadoForm,
  type Filiado,
} from "@/lib/contas"
import { diagnosticarCodigoRecusado } from "@/lib/auth-diagnostico"
import { textoValidade } from "@/lib/auth-email-constantes"
import {
  consumirVinculoPendente,
  registrarVinculoPendente,
  vincularIdentidade,
} from "@/lib/auth-identidade"
import { limparCpf, validarCpf } from "@/lib/cpf"
import { destinoDoPortal } from "@/lib/portal-destino"
import { createClient } from "@/lib/supabase/server"
import { bloqueioAtivo, chaveDeLogin, limparFalhasLogin, registrarFalhaLogin } from "@/lib/login-bloqueio"
import { exigirHumano, tokenHumano } from "@/lib/turnstile"

import { emFiliacaoColetiva, igualarTempo, mensagemFiliacaoNaoAtiva } from "./situacao-entrada"

/**
 * Tempo mínimo das respostas que recusam a entrada (A68): o caminho de um CPF
 * do cadastro confere senha/código no Supabase; o de um CPF desconhecido,
 * quase nada. Sem o piso, a demora contava quem é filiado. Valores por cima
 * do tempo típico do caminho mais lento de cada action. O pedido de código
 * não precisa de piso: tudo o que depende do CPF roda depois da resposta.
 */
const PISO_SENHA_MS = 1000
const PISO_CODIGO_MS = 900

/**
 * Resposta ÚNICA do pedido de código (A68): a mesma para CPF de filiado,
 * desconhecido, sem e-mail ou inativo — e o passo de digitar o código aparece
 * em todos os casos; para quem não recebeu nada, o código só não confere.
 */
const RESPOSTA_PEDIDO =
  "Se o CPF estiver no cadastro com e-mail, enviamos um código para esse e-mail. Confira também a caixa de spam. Sem e-mail no cadastro? Procure o sindicato."

/**
 * Resposta ÚNICA a qualquer código recusado (A68). diagnosticarCodigoRecusado
 * separa "incorreto", "vencido", "já usado" e "limite", mas só um CPF do
 * cadastro chega a ter código vencido ou usado: chamando a action direto com
 * CPFs chutados, "este código já foi usado" contra "código incorreto"
 * separava quem é filiado de quem não é. O motivo real fica no log
 * ("[auth/codigo]"); a tela cobre os casos numa frase só.
 */
const CODIGO_NAO_CONFERE = `Código incorreto, vencido ou já usado. Use o do e-mail mais recente — cada novo pedido anula o anterior, e o código vale por ${textoValidade()} e serve uma vez só. Se não der certo, peça um novo código.`

/**
 * E-mail para onde o código vai, ou null quando nada deve ser enviado. Recebe
 * quem tem filiação ativa e também quem está na filiação coletiva em
 * andamento: esse não entra no portal, mas, depois de provar a identidade,
 * fica sabendo como desistir (A4).
 */
async function emailQueRecebeCodigo(filiado: Filiado | null, cpf: string): Promise<string | null> {
  // Mesma forma que a conta tem no Auth (enviarCodigoAcesso grava assim).
  const email = filiado?.email?.trim().toLowerCase()
  if (!filiado || !email) return null
  if (filiado.ativo || (await emFiliacaoColetiva(cpf))) return email
  return null
}

/** Porta 2 — filiados: CPF + senha. */
export async function loginFiliadoSenha(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const inicio = Date.now()
  const cpf = limparCpf(String(formData.get("cpf") ?? ""))
  const senha = String(formData.get("senha") ?? "")

  if (!validarCpf(cpf)) return { erro: "CPF inválido." }
  if (!senha) return { erro: "Informe sua senha." }
  const erroHumano = await exigirHumano(formData)
  if (erroHumano) return { erro: erroHumano }
  // O bloqueio vem ANTES da busca e conta também CPF desconhecido: se só os
  // CPFs do cadastro chegassem a "Muitas tentativas", o próprio bloqueio
  // confirmava quem existe.
  const chave = chaveDeLogin("senha", cpf)
  const bloqueio = await bloqueioAtivo(chave)
  if (bloqueio) return { erro: bloqueio }

  // Cadastro sem e-mail recebe a MESMA resposta (e no mesmo tempo) de CPF
  // inexistente: a mensagem específica confirmava a quem chutasse CPFs que
  // aquele existe. A orientação "sem e-mail no cadastro? procure o sindicato"
  // fica fixa na tela, para todo mundo.
  const recusar = async (): Promise<EstadoForm> => {
    await registrarFalhaLogin(chave)
    await igualarTempo(inicio, PISO_SENHA_MS)
    return { erro: "CPF ou senha incorretos." }
  }

  const filiado = await buscarFiliadoPorCpf(cpf)
  if (!filiado || !filiado.email) return recusar()

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithPassword({
    email: filiado.email,
    password: senha,
    options: { captchaToken: tokenHumano(formData) },
  })
  if (error || !data.user) return recusar()
  await limparFalhasLogin(chave)

  // Só informa o status da filiação a quem provou a senha (anti-enumeração).
  if (!filiado.ativo) {
    await supabase.auth.signOut()
    return { erro: mensagemFiliacaoNaoAtiva(await emFiliacaoColetiva(cpf)) }
  }

  // Provou a senha da conta cujo e-mail é o do cadastro deste CPF: vincula a
  // identidade (ou confirma a existente). Conta já de OUTRO CPF (e-mail
  // compartilhado, dado legado) é recusada — ver lib/auth-identidade.ts.
  const vinculo = await vincularIdentidade({
    userId: data.user.id,
    emailVerificado: data.user.email,
    tipo: "filiado",
    cpf,
    por: "senha",
  })
  if (!vinculo.ok) {
    await supabase.auth.signOut()
    return { erro: vinculo.erro }
  }

  // Volta ao item que trouxe a pessoa (A30). O campo oculto vem do cliente:
  // valida de novo aqui — só caminhos do portal, nunca outro endereço.
  redirect(destinoDoPortal(formData.get("next")) ?? "/portal/inicio")
}

/** `pedido`: a tela passa para o passo de digitar o código (sempre, A68). */
export type EstadoPedidoCodigo = EstadoForm & { pedido?: boolean }

/**
 * Porta 2 — filiados: código por e-mail (A1). Passo 1: manda ao e-mail do
 * cadastro um código e, no mesmo e-mail, o botão "Entrar no portal" (o link
 * passa pelo /auth/confirm). O e-mail é sempre o do cadastro do CPF, nunca um
 * digitado.
 */
export async function pedirCodigoFiliado(
  _prev: EstadoPedidoCodigo,
  formData: FormData
): Promise<EstadoPedidoCodigo> {
  const cpf = limparCpf(String(formData.get("cpf") ?? ""))
  if (!validarCpf(cpf)) return { erro: "CPF inválido." }
  const erroHumano = await exigirHumano(formData)
  if (erroHumano) return { erro: erroHumano }
  // O botão do e-mail passa pelo /auth/confirm e cai no item que trouxe a
  // pessoa (A30); o `next` do formulário é validado de novo aqui.
  const next = destinoDoPortal(formData.get("next")) ?? "/portal/inicio"

  // A busca do CPF, o vínculo pendente e o envio rodam DEPOIS da resposta
  // (`after`, como os avisos de lib/db/avisos.ts): a tela responde no mesmo
  // tempo para qualquer CPF. Com o envio dentro da action, a demora do
  // provedor de e-mail (que varia) contava quem é filiado — um piso fixo não
  // cobria os envios lentos. Nas Server Functions o `after` ainda lê os
  // cabeçalhos da requisição (tenant e origem; ver a doc do `after`).
  after(() => prepararCodigoFiliado(cpf, next))
  return { pedido: true, ok: RESPOSTA_PEDIDO }
}

/**
 * Manda o código ao e-mail do cadastro do CPF, quando há a quem mandar. Roda
 * depois da resposta: nenhuma falha daqui vai para a tela — "acabamos de
 * enviar, aguarde um minuto" ou "não foi possível enviar" só acontecem com
 * CPF do cadastro e diriam quem é filiado. Vão para o log, sem e-mail, sem CPF
 * e sem código. Não exportada: num arquivo "use server", exportar a tornaria
 * chamável pelo navegador.
 */
async function prepararCodigoFiliado(cpf: string, next: string): Promise<void> {
  try {
    const email = await emailQueRecebeCodigo(await buscarFiliadoPorCpf(cpf), cpf)
    if (!email) return
    // O CPF fica como vínculo PENDENTE (e-mail do cadastro ↔ CPF) e vira
    // identidade da conta depois de o código (ou o link) ser aceito — ver
    // lib/auth-identidade.ts.
    await registrarVinculoPendente({ email, tipo: "filiado", cpf })
    const { enviarCodigoAcesso } = await import("@/lib/codigo-acesso")
    const { erro } = await enviarCodigoAcesso({
      email,
      metadata: { tipo: "filiado" },
      next,
      contexto: "Digite este código na tela de entrada do Portal do Associado.",
      botao: "Entrar no portal",
    })
    if (erro) console.warn("[portal/codigo] código não enviado:", erro)
  } catch (e) {
    console.error("[portal/codigo] falha ao preparar o código:", e instanceof Error ? e.message : e)
  }
}

/**
 * Passo 2: confere o código. O e-mail é resolvido DE NOVO pelo CPF, aqui no
 * servidor — o formulário só traz o CPF e o código. Depois do verifyOtp vem o
 * mesmo que o /auth/confirm faz com o link: consumir o vínculo pendente.
 * Falhas contam no bloqueio progressivo por CPF (5 → 15 min, 10 → 1 h), como
 * o segundo fator de /login/verificacao.
 */
export async function confirmarCodigoFiliado(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const inicio = Date.now()
  const cpf = limparCpf(String(formData.get("cpf") ?? ""))
  // Colado com espaço, hífen ou "Código: …": só os números contam.
  const token = String(formData.get("codigo") ?? "").replace(/\D/g, "")
  if (!validarCpf(cpf)) return { erro: "CPF inválido. Toque em “Usar outro CPF” e digite de novo." }
  if (!/^\d{6,10}$/.test(token)) return { erro: "Digite o código que chegou no e-mail (só os números)." }

  const chave = `codigo:${cpf}`
  const bloqueio = await bloqueioAtivo(chave)
  if (bloqueio) return { erro: bloqueio }

  const filiado = await buscarFiliadoPorCpf(cpf)
  const email = await emailQueRecebeCodigo(filiado, cpf)
  if (!email) {
    // Nada foi enviado a este CPF: o código nunca confere. A falha conta no
    // mesmo bloqueio e a resposta sai no mesmo tempo de um CPF do cadastro.
    await registrarFalhaLogin(chave)
    await igualarTempo(inicio, PISO_CODIGO_MS)
    return { erro: CODIGO_NAO_CONFERE }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.verifyOtp({ email, token, type: "email" })
  if (error || !data.user) {
    await registrarFalhaLogin(chave)
    // O diagnóstico vai só para o log: a tela recebe a resposta única.
    await diagnosticarCodigoRecusado({ erro: error, email, token, fluxo: "portal_filiado" })
    await igualarTempo(inicio, PISO_CODIGO_MS)
    return { erro: CODIGO_NAO_CONFERE }
  }
  await limparFalhasLogin(chave)

  // Código aceito: o vínculo pendente (registrado no pedido) vira a
  // identidade da conta — o mesmo que /auth/confirm faz com o link.
  const vinculo = await consumirVinculoPendente({
    userId: data.user.id,
    emailVerificado: data.user.email,
  })
  if (vinculo.erro) {
    await supabase.auth.signOut()
    return { erro: vinculo.erro }
  }
  const identidade = vinculo.identidade
  if (!identidade || identidade.tipo !== "filiado") {
    await supabase.auth.signOut()
    return { erro: "Não foi possível concluir o seu acesso. Peça um novo código e tente de novo." }
  }

  // Só agora, com a identidade provada, o status da filiação aparece.
  const quem = identidade.cpf === cpf ? filiado : await buscarFiliadoPorCpf(identidade.cpf)
  if (!quem?.ativo) {
    await supabase.auth.signOut()
    return { erro: mensagemFiliacaoNaoAtiva(await emFiliacaoColetiva(identidade.cpf)) }
  }

  // "Esqueci minha senha / criar senha" (A66): entrou pelo código, segue para
  // a tela de senha que já existe (/definir-senha, que exige a sessão aberta).
  // destino explícito: a conta pode ter nascido em outro fluxo (votação,
  // oposição) e o tipo dela levaria o "Continuar" ao painel.
  if (formData.get("criar_senha") === "1") redirect("/definir-senha?destino=/portal/inicio")

  // Volta ao item que trouxe a pessoa (A30), validado de novo aqui.
  redirect(destinoDoPortal(formData.get("next")) ?? "/portal/inicio")
}
