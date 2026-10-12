"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requireSessaoPortal } from "@/lib/auth"
import { siglaDaUf } from "@/lib/cep"
import { type EstadoForm } from "@/lib/contas"
import {
  excluirContatoEmergencia,
  lerContatoEmergencia,
  salvarContatoEmergencia,
} from "@/lib/db/filiacao-contatos-emergencia"
import { atualizarRegistrosDoCpf, cadastroDoFiliado } from "@/lib/db/filiado-portal"
import { getVisualizacaoPortal } from "@/lib/visualizacao-filiado"

import {
  CAMPOS_TEXTO,
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
  const { filiado, user } = await requireSessaoPortal()

  const valor = (campo: string) => String(formData.get(campo) ?? "").trim()
  const dados: Record<string, unknown> = {}
  for (const campo of CAMPOS_TEXTO) {
    const v = valor(campo)
    if (v.length > LIMITE_CAMPO[campo]) {
      return { erro: "Este campo ficou longo demais — confira o que foi digitado.", campo }
    }
    dados[campo] = v === "" ? null : v
  }

  // ── E-mails (A25) ──────────────────────────────────────────────────────
  for (const [campo, rotulo] of [
    ["email_pessoal", "O e-mail pessoal"],
    ["email_corporativo", "O e-mail corporativo"],
  ] as const) {
    const erro = erroEmail(rotulo, valor(campo))
    if (erro) return { erro, campo }
  }
  if (!dados.email_pessoal && !dados.email_corporativo) {
    return { erro: ERRO_SEM_EMAIL, campo: "email_pessoal" }
  }
  // O e-mail de acesso não muda por aqui: o login procura a conta por ele e o
  // CPF está ligado à conta do e-mail atual — trocar só o cadastro trancaria a
  // pessoa do lado de fora. Voltar ao e-mail da própria conta é permitido.
  // O registro como está agora: em qual campo mora o e-mail de acesso e qual
  // é a UF antiga. Falha na leitura não derruba o salvamento.
  const antes = await cadastroDoFiliado(filiado.cpf).catch(() => null)
  // Igual ao formulário: sem e-mail no cadastro, vale o da conta.
  const acessoHoje = normalizarEmail(filiado.email) ?? normalizarEmail(user.email)
  const troca = trocaDoEmailDeAcesso({
    atual: filiado.email,
    emailConta: user.email,
    pessoal: valor("email_pessoal"),
    corporativo: valor("email_corporativo"),
    atualNoPessoal: !!acessoHoje && normalizarEmail(antes?.email_pessoal) === acessoHoje,
  })
  if (troca) return { erro: mensagemTrocaDeAcesso(troca), campo: troca.campo }

  // ── Telefones e CEP (A70): chegam mascarados — confere e guarda os dígitos.
  for (const [campo, rotulo] of [
    ["telefone_1", "Telefone 1"],
    ["telefone_2", "Telefone 2"],
  ] as const) {
    const erro = erroTelefone(rotulo, valor(campo))
    if (erro) return { erro, campo }
    const d = soDigitos(valor(campo))
    dados[campo] = d === "" ? null : d
  }
  const erroDoCep = erroCep(valor("endereco_cep"))
  if (erroDoCep) return { erro: erroDoCep, campo: "endereco_cep" }
  const cep = soDigitos(valor("endereco_cep"))
  dados.endereco_cep = cep === "" ? null : cep

  dados.telefone_1_whatsapp = formData.get("telefone_1_whatsapp") === "on"
  dados.telefone_2_whatsapp = formData.get("telefone_2_whatsapp") === "on"

  // ── UF (A130): uma das 27. O valor antigo fora da lista (texto livre do
  //    cadastro migrado) só passa se ficou igual — a pessoa não é obrigada a
  //    corrigi-lo para salvar o resto, mas não grava texto novo fora da lista.
  const ufBruta = valor("endereco_estado")
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
  return { ok: "Contato salvo." }
}

export async function excluirMeuContatoEmergencia(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  if ((await getVisualizacaoPortal())?.preview) return { erro: ERRO_VISUALIZACAO }
  const { filiado } = await requireSessaoPortal()
  const id = String(formData.get("contato_id") ?? "")
  if (!UUID.test(id)) return { erro: "Contato inválido." }
  const { erro } = await excluirContatoEmergencia(
    { cpf: filiado.cpf, filiadoId: filiado.filiacaoId },
    id
  )
  if (erro) return { erro }
  revalidatePath("/portal/cadastro")
  return { ok: "Contato excluído." }
}
