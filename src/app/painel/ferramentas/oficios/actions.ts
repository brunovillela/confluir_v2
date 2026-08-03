"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import {
  adicionarFiliados,
  atualizarOficio,
  cancelarOficio,
  candidatosDaEmpresa,
  criarOficio,
  emitirOficio,
  removerFiliado,
  type DadosOficio,
} from "@/lib/db/oficios"
import { TIPOS_OFICIO, type TipoOficio } from "@/lib/oficios-constantes"

function texto(formData: FormData, campo: string): string {
  return String(formData.get(campo) ?? "").trim()
}

function dataISO(valor: string): string | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(valor) ? valor : null
}

function tipo(valor: string): TipoOficio {
  return (TIPOS_OFICIO as readonly string[]).includes(valor)
    ? (valor as TipoOficio)
    : "manual"
}

function lerDados(formData: FormData): DadosOficio {
  return {
    tipo: tipo(texto(formData, "tipo")),
    data: dataISO(texto(formData, "data")),
    sede_id: texto(formData, "sede_id") || null,
    destinatario_empresa_id: texto(formData, "destinatario_empresa_id") || null,
    destinatario_texto: texto(formData, "destinatario_texto") || null,
    aos_cuidados: texto(formData, "aos_cuidados") || null,
    assunto: texto(formData, "assunto") || null,
    corpo: texto(formData, "corpo") || null,
    assinante_integrante_id: texto(formData, "assinante_integrante_id") || null,
  }
}

export async function criarOficioAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("ferramentas_oficios")
  const dados = lerDados(formData)
  if (!dados.assunto) return { erro: "Informe o assunto." }
  if (!dados.destinatario_empresa_id && !dados.destinatario_texto)
    return { erro: "Informe o destinatário." }

  const { id, erro } = await criarOficio(dados)
  if (erro) return { erro }
  revalidatePath("/painel/ferramentas/oficios")
  redirect(`/painel/ferramentas/oficios/${id}`)
}

export async function atualizarOficioAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("ferramentas_oficios")
  const id = texto(formData, "oficio_id")
  if (!id) return { erro: "Ofício inválido." }
  const dados = lerDados(formData)
  if (!dados.assunto) return { erro: "Informe o assunto." }

  const { erro } = await atualizarOficio(id, dados)
  if (erro) return { erro }
  revalidatePath(`/painel/ferramentas/oficios/${id}`)
  return { ok: "Ofício salvo." }
}

export async function emitirOficioAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("ferramentas_oficios")
  const id = texto(formData, "oficio_id")
  if (!id) return { erro: "Ofício inválido." }
  const numeroTxt = texto(formData, "numero")
  const numero = numeroTxt ? Number.parseInt(numeroTxt, 10) : null

  const { erro, numero: n, ano } = await emitirOficio(
    id,
    Number.isFinite(numero) ? numero : null
  )
  if (erro) return { erro }
  revalidatePath("/painel/ferramentas/oficios")
  revalidatePath(`/painel/ferramentas/oficios/${id}`)
  return { ok: `Ofício ${n}/${ano} emitido.` }
}

export async function cancelarOficioAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("ferramentas_oficios")
  const id = texto(formData, "oficio_id")
  if (!id) return { erro: "Ofício inválido." }
  const { erro } = await cancelarOficio(id)
  if (erro) return { erro }
  revalidatePath("/painel/ferramentas/oficios")
  revalidatePath(`/painel/ferramentas/oficios/${id}`)
  return { ok: "Ofício cancelado." }
}

export async function adicionarManualAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("ferramentas_oficios")
  const oficioId = texto(formData, "oficio_id")
  const nome = texto(formData, "nome")
  if (!oficioId) return { erro: "Ofício inválido." }
  if (!nome) return { erro: "Informe o nome." }

  const { erro } = await adicionarFiliados(oficioId, [
    { nome, matricula: texto(formData, "matricula") || null },
  ])
  if (erro) return { erro }
  revalidatePath(`/painel/ferramentas/oficios/${oficioId}`)
  return { ok: "Adicionado." }
}

/** Adiciona os candidatos (vínculos) marcados; ids vêm como CSV no campo `selecionados`. */
export async function adicionarCandidatosAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("ferramentas_oficios")
  const oficioId = texto(formData, "oficio_id")
  const empresaId = texto(formData, "empresa_id")
  const tipoOf = tipo(texto(formData, "tipo"))
  const selecionados = formData
    .getAll("sel")
    .map((v) => String(v).trim())
    .filter(Boolean)
  if (!oficioId || !empresaId) return { erro: "Dados inválidos." }
  if (selecionados.length === 0) return { erro: "Selecione ao menos um nome." }
  if (tipoOf === "manual") return { erro: "Ofício manual não tem lista automática." }

  // Recarrega os candidatos e filtra os escolhidos (snapshot no momento da adição).
  const candidatos = await candidatosDaEmpresa(empresaId, tipoOf, {})
  const escolhidos = candidatos.filter((c) => selecionados.includes(c.vinculoId))
  const { erro, adicionados } = await adicionarFiliados(
    oficioId,
    escolhidos.map((c) => ({
      vinculoId: c.vinculoId,
      filiacaoId: c.filiacaoId,
      nome: c.nome ?? "(sem nome)",
      matricula: c.matricula,
    }))
  )
  if (erro) return { erro }
  revalidatePath(`/painel/ferramentas/oficios/${oficioId}`)
  return { ok: `${adicionados} adicionado(s).` }
}

export async function removerFiliadoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("ferramentas_oficios")
  const id = texto(formData, "filiado_id")
  const oficioId = texto(formData, "oficio_id")
  if (!id) return { erro: "Item inválido." }
  const { erro } = await removerFiliado(id)
  if (erro) return { erro }
  if (oficioId) revalidatePath(`/painel/ferramentas/oficios/${oficioId}`)
  return { ok: "Removido." }
}
