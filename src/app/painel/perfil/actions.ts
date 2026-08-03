"use server"

import { revalidatePath } from "next/cache"

import { requireSessaoPainel } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import {
  adicionarEndereco,
  adicionarTelefone,
  atualizarFoto,
  atualizarPerfil,
  removerEndereco,
  removerTelefone,
} from "@/lib/db/perfil"

function texto(formData: FormData, campo: string): string {
  return String(formData.get(campo) ?? "").trim()
}

function dataISO(valor: string): string | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(valor) ? valor : null
}

const ROTA = "/painel/perfil"

export async function salvarPerfilAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const { usuario } = await requireSessaoPainel()

  const { erro } = await atualizarPerfil(usuario.id, {
    nome_guerra: texto(formData, "nome_guerra") || null,
    email: texto(formData, "email") || null,
    whatsapp: texto(formData, "whatsapp") || null,
    data_nascimento: dataISO(texto(formData, "data_nascimento")),
    sexo: texto(formData, "sexo") || null,
    estado_civil: texto(formData, "estado_civil") || null,
    escolaridade: texto(formData, "escolaridade") || null,
  })
  if (erro) return { erro }

  // Foto opcional.
  const foto = formData.get("foto")
  if (foto instanceof File && foto.size > 0) {
    const r = await atualizarFoto(usuario.id, foto)
    if (r.erro) return { erro: r.erro }
  }

  revalidatePath(ROTA)
  return { ok: "Perfil salvo." }
}

export async function adicionarTelefoneAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const { usuario } = await requireSessaoPainel()
  const numero = texto(formData, "numero")
  if (!numero) return { erro: "Informe o número." }
  const { erro } = await adicionarTelefone(usuario.id, {
    numero,
    tipo: texto(formData, "tipo") || null,
    whatsapp: texto(formData, "whatsapp") === "1",
  })
  if (erro) return { erro }
  revalidatePath(ROTA)
  return { ok: "Telefone adicionado." }
}

export async function removerTelefoneAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const { usuario } = await requireSessaoPainel()
  const id = texto(formData, "telefone_id")
  if (!id) return { erro: "Telefone inválido." }
  const { erro } = await removerTelefone(id, usuario.id)
  if (erro) return { erro }
  revalidatePath(ROTA)
  return { ok: "Telefone removido." }
}

export async function adicionarEnderecoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const { usuario } = await requireSessaoPainel()
  const { erro } = await adicionarEndereco(usuario.id, {
    tipo_endereco: texto(formData, "tipo_endereco") || null,
    cep: texto(formData, "cep").replace(/\D/g, "") || null,
    logradouro: texto(formData, "logradouro") || null,
    numero: texto(formData, "numero") || null,
    complemento: texto(formData, "complemento") || null,
    bairro: texto(formData, "bairro") || null,
    cidade: texto(formData, "cidade") || null,
    estado: texto(formData, "estado").toUpperCase().slice(0, 2) || null,
  })
  if (erro) return { erro }
  revalidatePath(ROTA)
  return { ok: "Endereço adicionado." }
}

export async function removerEnderecoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const { usuario } = await requireSessaoPainel()
  const id = texto(formData, "endereco_id")
  if (!id) return { erro: "Endereço inválido." }
  const { erro } = await removerEndereco(id, usuario.id)
  if (erro) return { erro }
  revalidatePath(ROTA)
  return { ok: "Endereço removido." }
}
