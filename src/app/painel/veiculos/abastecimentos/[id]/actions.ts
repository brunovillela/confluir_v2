"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { atualizarAbastecimento, excluirAbastecimento } from "@/lib/db/veiculos"
import { parseValorBR } from "@/lib/valores"
import { parseHodometro } from "@/lib/veiculos-constantes"

const BASE = "/painel/veiculos/abastecimentos"

function texto(formData: FormData, campo: string): string {
  return String(formData.get(campo) ?? "").trim()
}

function revalidar(id: string) {
  revalidatePath(BASE)
  revalidatePath(`${BASE}/${id}`)
  revalidatePath("/painel/veiculos")
}

export async function atualizarAbastecimentoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("veiculos_gestao")
  const id = texto(formData, "id")
  if (!id) return { erro: "Lançamento inválido." }

  const posto = texto(formData, "posto")
  const combustivel = texto(formData, "combustivel")
  const volume = parseValorBR(texto(formData, "volume"))
  const valor = parseValorBR(texto(formData, "valor"))
  const hodometroTexto = texto(formData, "hodometro")
  const hodometro = hodometroTexto ? parseHodometro(hodometroTexto) : null
  const dataHora = texto(formData, "data_hora")

  if (!posto) return { erro: "Informe o posto." }
  if (!combustivel) return { erro: "Informe o combustível." }
  if (volume === null || volume <= 0) return { erro: "Informe os litros." }
  if (valor === null || valor <= 0) return { erro: "Informe o valor." }
  if (hodometroTexto && (hodometro === null || hodometro < 0)) return { erro: "Hodômetro inválido." }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(dataHora)) {
    return { erro: "Informe a data e hora do abastecimento." }
  }

  const { erro, outrosVeiculo, outrosCondutor } = await atualizarAbastecimento(
    id,
    {
      veiculo_id: texto(formData, "veiculo_id") || null,
      condutor_usuario_id: texto(formData, "condutor_usuario_id") || null,
      posto,
      cidade: texto(formData, "cidade") || null,
      combustivel,
      volume,
      valor,
      hodometro,
      // O campo traz a hora de São Paulo — gravar com o fuso, senão ela anda
      // 3 h a cada salvamento.
      data_hora: `${dataHora}:00-03:00`,
    },
    {
      aplicarPlaca: formData.get("aplicar_placa") === "on",
      aplicarCondutor: formData.get("aplicar_condutor") === "on",
    }
  )
  if (erro) return { erro }
  revalidar(id)
  const q = new URLSearchParams({ salvo: "1" })
  if (outrosVeiculo) q.set("outrosVeiculo", String(outrosVeiculo))
  if (outrosCondutor) q.set("outrosCondutor", String(outrosCondutor))
  redirect(`${BASE}/${id}?${q}`)
}

export async function excluirAbastecimentoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("veiculos_gestao")
  const id = texto(formData, "id")
  if (!id) return { erro: "Lançamento inválido." }
  const { erro } = await excluirAbastecimento(id)
  if (erro) return { erro }
  revalidar(id)
  redirect(`${BASE}?excluido=1`)
}
