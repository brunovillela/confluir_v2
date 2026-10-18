"use server"

import { revalidatePath } from "next/cache"
import { redirect, RedirectType } from "next/navigation"

import { voltarAoPrimeiroAcesso } from "@/app/portal/primeiro-acesso/regras"
import { requireSessaoPortal } from "@/lib/auth"
import { siglaDaUf } from "@/lib/cep"
import { type EstadoForm } from "@/lib/contas"
import {
  excluirContatoEmergencia,
  lerContatoEmergencia,
  salvarContatoEmergencia,
} from "@/lib/db/filiacao-contatos-emergencia"
import { atualizarRegistrosDoCpf, cadastroDoFiliado } from "@/lib/db/filiado-portal"
import { bloqueioDaParte, opcoesDaParte } from "@/lib/db/portal-partes"
import { getVisualizacaoPortal } from "@/lib/visualizacao-filiado"

import {
  CAMPOS_TEXTO,
  camposEditaveis,
  ERRO_SEM_EMAIL,
  erroCep,
  erroEmail,
  erroTelefone,
  LIMITE_CAMPO,
  mensagemTrocaDeAcesso,
  normalizarEmail,
  soDigitos,
  trocaDoEmailDeAcesso,
} from "./validacao"

/** Mesma recusa das preferências de avisos (avisos/preferencias/actions.ts). */
const ERRO_VISUALIZACAO = "Na visualização pela gestão, só o próprio associado salva."

/** A entidade travou todos os grupos (Área do associado › Meu cadastro). */
const ERRO_NADA_EDITAVEL =
  "Os seus dados de contato e endereço são alterados pela secretaria. Para mudar algum, fale com a secretaria."

/** Contatos de emergência desligados na Área do associado. */
const ERRO_SEM_EMERGENCIA = "Os contatos de emergência não são cadastrados pelo portal. Fale com a secretaria."

/**
 * O primeiro acesso (Filiados › Área do associado) pode depender do que se
 * grava aqui (e-mail, telefone, endereço, contato de emergência) e o portão
 * dele mora na casca, que não re-renderiza sozinha: revalida o layout para o
 * portão sumir — ou voltar — na hora. Do primeiro acesso, os formulários
 * mandam o campo `voltar` (validado em voltarAoPrimeiroAcesso) e a action
 * volta para lá em vez de ficar em Meu cadastro.
 */
function revalidarPrimeiroAcesso() {
  revalidatePath("/portal", "layout")
}

/**
 * A trava comum dos contatos de emergência: Meu cadastro suspenso (ou o
 * portal em modo de consulta) ou o cartão desligado pela entidade.
 */
async function bloqueioDaEmergencia(): Promise<string | null> {
  const bloqueio = await bloqueioDaParte("cadastro")
  if (bloqueio) return bloqueio
  return (await opcoesDaParte("cadastro")).contatos_emergencia ? null : ERRO_SEM_EMERGENCIA
}

/**
 * Auto-atualização do filiado — SOMENTE contato e endereço (telefones,
 * emails, endereço). Nome, CPF, matrícula e condição só mudam pela filiação.
 * Atualiza todos os registros do CPF para manter o cadastro coeso.
 *
 * Erro de um campo volta com `campo` (o `name` do input): o formulário mostra
 * a mensagem junto dele e leva a pessoa até lá (A70/A139). O formulário não
 * é limpo na recusa — ver cadastro-form.tsx.
 */
export async function atualizarMeuCadastro(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  // Sessão REAL do filiado: no "Ver como filiado" a gestão não escreve por ele
  // — e, se quem visualiza também é filiado, gravaria no cadastro DELE os
  // dados da tela de outra pessoa.
  if ((await getVisualizacaoPortal())?.preview) return { erro: ERRO_VISUALIZACAO }
  // Meu cadastro suspenso (ou o portal em modo de consulta): nada grava.
  const bloqueio = await bloqueioDaParte("cadastro")
  if (bloqueio) return { erro: bloqueio }
  const { filiado, user } = await requireSessaoPortal()

  // O que a entidade deixa o associado alterar (Área do associado). O resto
  // é ignorado — nem conferido nem gravado: o cadastro mantém o que tem.
  const editavel = camposEditaveis((await opcoesDaParte("cadastro")).campos_editaveis)
  if (editavel.size === 0) return { erro: ERRO_NADA_EDITAVEL }

  const valor = (campo: string) => String(formData.get(campo) ?? "").trim()
  const dados: Record<string, unknown> = {}
  for (const campo of CAMPOS_TEXTO) {
    if (!editavel.has(campo)) continue
    const v = valor(campo)
    if (v.length > LIMITE_CAMPO[campo]) {
      return { erro: "Este campo ficou longo demais — confira o que foi digitado.", campo }
    }
    dados[campo] = v === "" ? null : v
  }

  // O registro como está agora: em qual campo mora o e-mail de acesso, o
  // e-mail travado e a UF antiga. Falha na leitura não derruba o salvamento —
  // salvo quando um e-mail está travado e o outro não: aí não há como conferir
  // se a pessoa fica com algum e-mail (abaixo).
  const antes = await cadastroDoFiliado(filiado.cpf).catch(() => null)

  // ── E-mails (A25) ──────────────────────────────────────────────────────
  const emailsLivres = (["email_pessoal", "email_corporativo"] as const).filter((c) => editavel.has(c))
  if (emailsLivres.length > 0) {
    if (emailsLivres.length === 1 && !antes) {
      return { erro: "Não foi possível conferir o seu cadastro agora. Tente de novo daqui a pouco." }
    }
    for (const [campo, rotulo] of [
      ["email_pessoal", "O e-mail pessoal"],
      ["email_corporativo", "O e-mail corporativo"],
    ] as const) {
      if (!editavel.has(campo)) continue
      const erro = erroEmail(rotulo, valor(campo))
      if (erro) return { erro, campo }
    }
    // E-mail travado: vale o gravado, que esta action não muda.
    const final = (campo: "email_pessoal" | "email_corporativo") =>
      editavel.has(campo) ? valor(campo) : (antes?.[campo] ?? "").trim()
    if (!final("email_pessoal") && !final("email_corporativo")) {
      return { erro: ERRO_SEM_EMAIL, campo: emailsLivres[0] }
    }
    // O e-mail de acesso não muda por aqui: o login procura a conta por ele e o
    // CPF está ligado à conta do e-mail atual — trocar só o cadastro trancaria a
    // pessoa do lado de fora. Voltar ao e-mail da própria conta é permitido.
    // Igual ao formulário: sem e-mail no cadastro, vale o da conta.
    const acessoHoje = normalizarEmail(filiado.email) ?? normalizarEmail(user.email)
    const troca = trocaDoEmailDeAcesso({
      atual: filiado.email,
      emailConta: user.email,
      pessoal: final("email_pessoal"),
      corporativo: final("email_corporativo"),
      atualNoPessoal: !!acessoHoje && normalizarEmail(antes?.email_pessoal) === acessoHoje,
    })
    if (troca) {
      return { erro: mensagemTrocaDeAcesso(troca), campo: editavel.has(troca.campo) ? troca.campo : emailsLivres[0] }
    }
  }

  // ── Telefones e CEP (A70): chegam mascarados — confere e guarda os dígitos.
  if (editavel.has("telefone_1")) {
    for (const [campo, rotulo] of [
      ["telefone_1", "Telefone 1"],
      ["telefone_2", "Telefone 2"],
    ] as const) {
      const erro = erroTelefone(rotulo, valor(campo))
      if (erro) return { erro, campo }
      const d = soDigitos(valor(campo))
      dados[campo] = d === "" ? null : d
    }
    dados.telefone_1_whatsapp = formData.get("telefone_1_whatsapp") === "on"
    dados.telefone_2_whatsapp = formData.get("telefone_2_whatsapp") === "on"
  }
  if (editavel.has("endereco_cep")) {
    const erroDoCep = erroCep(valor("endereco_cep"))
    if (erroDoCep) return { erro: erroDoCep, campo: "endereco_cep" }
    const cep = soDigitos(valor("endereco_cep"))
    dados.endereco_cep = cep === "" ? null : cep
  }

  // ── UF (A130): uma das 27. O valor antigo fora da lista (texto livre do
  //    cadastro migrado) só passa se ficou igual — a pessoa não é obrigada a
  //    corrigi-lo para salvar o resto, mas não grava texto novo fora da lista.
  const ufBruta = editavel.has("endereco_estado") ? valor("endereco_estado") : ""
  if (ufBruta) {
    const sigla = siglaDaUf(ufBruta)
    const legadoIgual = !sigla && ufBruta === (antes?.endereco_estado ?? "").trim()
    if (!sigla && !legadoIgual) {
      return { erro: "Escolha a UF na lista.", campo: "endereco_estado" }
    }
    dados.endereco_estado = sigla ?? ufBruta
  }

  const erro = await atualizarRegistrosDoCpf(filiado.cpf, dados)
  if (erro) return { erro }

  revalidatePath("/portal/cadastro")
  revalidarPrimeiroAcesso()
  // Do primeiro acesso, volta para lá (que segue ao próximo passo ou ao destino).
  const voltar = voltarAoPrimeiroAcesso(formData.get("voltar"))
  if (voltar) redirect(voltar, RedirectType.replace)
  redirect("/portal/cadastro?salvo=1")
}

// ── Contatos de emergência (o próprio filiado) ──────────────────────────────

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function salvarMeuContatoEmergencia(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  // Sessão REAL do filiado: no "Ver como filiado" a gestão não escreve por ele.
  if ((await getVisualizacaoPortal())?.preview) return { erro: ERRO_VISUALIZACAO }
  const bloqueio = await bloqueioDaEmergencia()
  if (bloqueio) return { erro: bloqueio }
  const { filiado } = await requireSessaoPortal()
  const lido = lerContatoEmergencia(formData)
  if ("erro" in lido) return { erro: lido.erro }
  const id = String(formData.get("contato_id") ?? "")
  const { erro } = await salvarContatoEmergencia({
    pessoa: { cpf: filiado.cpf, filiadoId: filiado.filiacaoId },
    id: UUID.test(id) ? id : null,
    dados: lido.dados,
    origem: "portal",
  })
  if (erro) return { erro }
  revalidatePath("/portal/cadastro")
  revalidarPrimeiroAcesso()
  const voltar = voltarAoPrimeiroAcesso(formData.get("voltar"))
  if (voltar) redirect(voltar, RedirectType.replace)
  return { ok: "Contato salvo." }
}

export async function excluirMeuContatoEmergencia(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  if ((await getVisualizacaoPortal())?.preview) return { erro: ERRO_VISUALIZACAO }
  const bloqueio = await bloqueioDaEmergencia()
  if (bloqueio) return { erro: bloqueio }
  const { filiado } = await requireSessaoPortal()
  const id = String(formData.get("contato_id") ?? "")
  if (!UUID.test(id)) return { erro: "Contato inválido." }
  const { erro } = await excluirContatoEmergencia(
    { cpf: filiado.cpf, filiadoId: filiado.filiacaoId },
    id
  )
  if (erro) return { erro }
  revalidatePath("/portal/cadastro")
  // Excluir o último contato pode reabrir o primeiro acesso (contato obrigatório).
  revalidarPrimeiroAcesso()
  return { ok: "Contato excluído." }
}
