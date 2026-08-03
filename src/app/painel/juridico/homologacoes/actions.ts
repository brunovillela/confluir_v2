"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { limparCpf, validarCpf } from "@/lib/cpf"
import {
  atualizarHomologacao,
  criarHomologacao,
  gravarParecer,
  type DadosHomologacao,
} from "@/lib/db/juridico"
import { motivoValido } from "@/lib/juridico-constantes"

const CHAVES: [string, string[]] = [
  "juridico_homologacoes",
  ["juridico_geral", "juridico_gestao"],
]

function texto(formData: FormData, campo: string): string {
  return String(formData.get(campo) ?? "").trim()
}

function dataISO(valor: string): string | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(valor) ? valor : null
}

function revalidar(id?: string) {
  revalidatePath("/painel/juridico")
  revalidatePath("/painel/juridico/homologacoes")
  if (id) revalidatePath(`/painel/juridico/homologacoes/${id}`)
}

/** Lê e valida os campos comuns de criação/edição. */
function lerDados(
  formData: FormData
): { dados?: DadosHomologacao; erro?: string } {
  const data = dataISO(texto(formData, "data"))
  if (!data) return { erro: "Informe a data da homologação." }

  const motivoBruto = texto(formData, "motivo")
  const motivo = motivoBruto === "" ? null : motivoBruto
  if (motivo && !motivoValido(motivo)) return { erro: "Motivo inválido." }

  const filiadoId = texto(formData, "filiado_id") || null

  let trabalhadorNome: string | null = null
  let trabalhadorCpf: string | null = null
  if (!filiadoId) {
    trabalhadorNome = texto(formData, "trabalhador_nome") || null
    if (!trabalhadorNome) {
      return {
        erro: "Escolha um filiado ou informe o nome do trabalhador não-filiado.",
      }
    }
    const cpfBruto = texto(formData, "trabalhador_cpf")
    if (cpfBruto) {
      if (!validarCpf(cpfBruto)) return { erro: "CPF do trabalhador inválido." }
      trabalhadorCpf = limparCpf(cpfBruto)
    }
  }

  return {
    dados: {
      data,
      data_demissao: dataISO(texto(formData, "data_demissao")),
      motivo,
      fonte_pg_id: texto(formData, "fonte_pg_id") || null,
      filiado_id: filiadoId,
      trabalhador_nome: trabalhadorNome,
      trabalhador_cpf: trabalhadorCpf,
      observacoes: texto(formData, "observacoes") || null,
    },
  }
}

/** Sobe o parecer, se veio um PDF no formulário. */
async function subirParecer(
  formData: FormData,
  id: string
): Promise<{ erro?: string }> {
  const arquivo = formData.get("parecer")
  if (arquivo instanceof File && arquivo.size > 0) {
    return gravarParecer(id, arquivo)
  }
  return {}
}

export async function criarHomologacaoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await requirePermissao(...CHAVES)

  const { dados, erro } = lerDados(formData)
  if (erro) return { erro }

  const criada = await criarHomologacao(dados!, sessao.usuario.id)
  if (criada.erro) return { erro: criada.erro }

  const up = await subirParecer(formData, criada.id!)
  if (up.erro) return { erro: up.erro }

  revalidar(criada.id)
  redirect(`/painel/juridico/homologacoes/${criada.id}?salvo=1`)
}

export async function atualizarHomologacaoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao(...CHAVES)

  const id = texto(formData, "id")
  if (!id) return { erro: "Homologação inválida." }

  const { dados, erro } = lerDados(formData)
  if (erro) return { erro }

  const atualizada = await atualizarHomologacao(id, dados!)
  if (atualizada.erro) return { erro: atualizada.erro }

  const up = await subirParecer(formData, id)
  if (up.erro) return { erro: up.erro }

  revalidar(id)
  redirect(`/painel/juridico/homologacoes/${id}?salvo=1`)
}
