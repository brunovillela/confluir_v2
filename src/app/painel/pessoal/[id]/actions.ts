"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { lerDadosBancariosForm } from "@/lib/dados-bancarios"
import { salvarDadosBancariosFuncionario } from "@/lib/db/contracheques-ordens"
import { funcionariosParaSelecao } from "@/lib/db/pessoal"
import {
  atualizarDadosCadastrais,
  atualizarVinculoFuncionario,
  excluirFuncionario,
  excluirVinculoFuncionario,
} from "@/lib/db/pessoal-cadastro"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Dados bancários do funcionário (onde cai o pagamento das ordens da folha).
 * Só a gestão do Pessoal edita — o próprio funcionário não troca a conta
 * em que recebe o salário.
 */
export async function salvarDadosBancariosAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("pessoal_gestao")
  const usuarioId = String(formData.get("usuario_id") ?? "")
  if (!UUID.test(usuarioId)) return { erro: "Funcionário inválido." }
  // Só funcionário do sindicato (não qualquer usuário do tenant).
  const funcionarios = await funcionariosParaSelecao()
  if (!funcionarios.some((f) => f.usuarioId === usuarioId)) {
    return { erro: "Funcionário não encontrado entre os ativos." }
  }

  const lido = lerDadosBancariosForm(formData)
  if ("erro" in lido) return { erro: lido.erro }

  const { erro } = await salvarDadosBancariosFuncionario(usuarioId, lido.dados)
  if (erro) return { erro }
  revalidatePath(`/painel/pessoal/${usuarioId}`)
  revalidatePath("/painel/pessoal/contracheques/configuracao")
  return { ok: "Dados bancários salvos." }
}

// ── Cadastro e vínculos do funcionário (18/09) ──────────────────────────────

const txtForm = (formData: FormData, campo: string) =>
  String(formData.get(campo) ?? "").replace(/\s+/g, " ").trim() || null

/** Dados cadastrais do funcionário (nome, apelido, CPF, nascimento, WhatsApp). */
export async function salvarDadosCadastraisAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("pessoal_gestao")
  const usuarioId = String(formData.get("usuario_id") ?? "")
  if (!UUID.test(usuarioId)) return { erro: "Funcionário inválido." }
  const r = await atualizarDadosCadastrais(usuarioId, {
    nomeCompleto: txtForm(formData, "nome_completo") ?? "",
    nomeGuerra: txtForm(formData, "nome_guerra"),
    cpf: txtForm(formData, "cpf"),
    dataNascimento: txtForm(formData, "data_nascimento"),
    whatsapp: txtForm(formData, "whatsapp"),
  })
  if (r.erro) return { erro: r.erro }
  revalidatePath(`/painel/pessoal/${usuarioId}`)
  revalidatePath("/painel/pessoal", "layout")
  return { ok: r.ok }
}

/** Vínculo com a entidade: cargo, lotação, regime, matrícula, admissão e desligamento. */
export async function salvarVinculoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("pessoal_gestao")
  const usuarioId = String(formData.get("usuario_id") ?? "")
  const vinculoId = String(formData.get("vinculo_id") ?? "")
  if (!UUID.test(vinculoId)) return { erro: "Vínculo inválido." }
  const r = await atualizarVinculoFuncionario(vinculoId, {
    cargo: txtForm(formData, "cargo"),
    lotacao: txtForm(formData, "lotacao"),
    regime: txtForm(formData, "regime_trabalho"),
    matricula: txtForm(formData, "matricula"),
    admissao: txtForm(formData, "contrato_admissao"),
    demissao: txtForm(formData, "contrato_demissao"),
  })
  if (r.erro) return { erro: r.erro }
  if (UUID.test(usuarioId)) revalidatePath(`/painel/pessoal/${usuarioId}`)
  revalidatePath("/painel/pessoal", "layout")
  return { ok: r.ok }
}

/** Exclui o vínculo de quem nunca fez parte da entidade. */
export async function excluirVinculoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("pessoal_gestao")
  const usuarioId = String(formData.get("usuario_id") ?? "")
  const vinculoId = String(formData.get("vinculo_id") ?? "")
  if (!UUID.test(vinculoId)) return { erro: "Vínculo inválido." }
  const r = await excluirVinculoFuncionario(vinculoId)
  if (r.erro) return { erro: r.erro }
  revalidatePath("/painel/pessoal", "layout")
  revalidatePath("/painel/institucional/usuarios/quadro")
  // Sem vínculo restante a ficha deixa de existir: volta à lista.
  if (r.restantes === 0) redirect("/painel/pessoal/funcionarios?vinculo_excluido=1")
  if (UUID.test(usuarioId)) revalidatePath(`/painel/pessoal/${usuarioId}`)
  return { ok: r.ok }
}

/** Exclui o funcionário do Pessoal — só sem lançamento nenhum (19/10). */
export async function excluirFuncionarioAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("pessoal_gestao")
  const usuarioId = String(formData.get("usuario_id") ?? "")
  if (!UUID.test(usuarioId)) return { erro: "Funcionário inválido." }
  const r = await excluirFuncionario(usuarioId)
  if (r.erro) return { erro: r.erro }
  revalidatePath("/painel/pessoal", "layout")
  revalidatePath("/painel/institucional/usuarios/quadro")
  redirect("/painel/pessoal/funcionarios?funcionario_excluido=1")
}
