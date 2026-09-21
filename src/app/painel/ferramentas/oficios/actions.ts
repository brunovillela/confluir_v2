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
import {
  FORA_DO_ESCOPO,
  escopoOficios,
  departamentoAtualDoOficio,
  podeVerFiliadoDoOficio,
  podeVerOficio,
  validarDepartamentoDoOficio,
} from "@/lib/db/oficios-acesso"
import {
  anexarAssinadoAMao,
  cancelarEnvio,
  enviarParaAssinatura,
  reenviarConvite,
  type CanalAssinatura,
} from "@/lib/db/oficios-assinatura"
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
    departamento_id: texto(formData, "departamento_id") || null,
  }
}

/** Ofício fora dos departamentos de quem está na sessão → mensagem de erro. */
async function foraDoEscopo(oficioId: string): Promise<string | null> {
  return (await podeVerOficio(oficioId)) ? null : FORA_DO_ESCOPO
}

export async function criarOficioAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await requirePermissao("ferramentas_oficios")
  const dados = lerDados(formData)
  if (!dados.assunto) return { erro: "Informe o assunto." }
  if (!dados.destinatario_empresa_id && !dados.destinatario_texto)
    return { erro: "Informe o destinatário." }
  const erroDepto = validarDepartamentoDoOficio(await escopoOficios(), dados.departamento_id)
  if (erroDepto) return { erro: erroDepto }

  const { id, erro } = await criarOficio(dados, String(sessao.usuario.id))
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
  const escopo = await escopoOficios()
  if (!(await podeVerOficio(id, escopo))) return { erro: FORA_DO_ESCOPO }
  const erroDepto = validarDepartamentoDoOficio(escopo, dados.departamento_id, await departamentoAtualDoOficio(id))
  if (erroDepto) return { erro: erroDepto }

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
  const fora = await foraDoEscopo(id)
  if (fora) return { erro: fora }
  // O número NÃO vem do formulário: é o último do ano + 1, decidido aqui.
  const { erro, numero: n, ano } = await emitirOficio(id, null)
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
  const fora = await foraDoEscopo(id)
  if (fora) return { erro: fora }
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
  const fora = await foraDoEscopo(oficioId)
  if (fora) return { erro: fora }

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
  const fora = await foraDoEscopo(oficioId)
  if (fora) return { erro: fora }
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
  if (!(await podeVerFiliadoDoOficio(id))) return { erro: FORA_DO_ESCOPO }
  const { erro } = await removerFiliado(id)
  if (erro) return { erro }
  if (oficioId) revalidatePath(`/painel/ferramentas/oficios/${oficioId}`)
  return { ok: "Removido." }
}

// ── Assinatura eletrônica ───────────────────────────────────────────────────

export async function enviarParaAssinaturaAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await requirePermissao("ferramentas_oficios")
  const id = texto(formData, "oficio_id")
  if (!id) return { erro: "Ofício inválido." }
  const fora = await foraDoEscopo(id)
  if (fora) return { erro: fora }
  const canal: CanalAssinatura = texto(formData, "canal") === "telegram" ? "telegram" : "email"
  const r = await enviarParaAssinatura({
    oficioId: id,
    email: texto(formData, "email"),
    canal,
    // Número não se escolhe: último do ano + 1 (ou o já reservado).
    numeroManual: null,
    usuarioId: sessao.usuario.id as string,
  })
  if (r.erro) return { erro: r.erro }
  revalidatePath("/painel/ferramentas/oficios")
  revalidatePath(`/painel/ferramentas/oficios/${id}`)
  return {
    ok: r.entregue
      ? `Ofício ${r.numero}/${r.ano} enviado para assinatura — convite em ${r.destino}.`
      : `Ofício ${r.numero}/${r.ano} aguardando assinatura, mas o convite não saiu — use "Reenviar convite".`,
  }
}

export async function reenviarConviteAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("ferramentas_oficios")
  const id = texto(formData, "oficio_id")
  const fora = await foraDoEscopo(id)
  if (fora) return { erro: fora }
  const r = await reenviarConvite(id)
  if (r.erro) return { erro: r.erro }
  revalidatePath(`/painel/ferramentas/oficios/${id}`)
  return r.entregue
    ? { ok: `Convite reenviado para ${r.destino}.` }
    : { erro: "O convite não saiu. Tente de novo em instantes." }
}

export async function cancelarEnvioAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("ferramentas_oficios")
  const id = texto(formData, "oficio_id")
  const fora = await foraDoEscopo(id)
  if (fora) return { erro: fora }
  const r = await cancelarEnvio(id, texto(formData, "motivo") || null)
  if (r.erro) return { erro: r.erro }
  revalidatePath("/painel/ferramentas/oficios")
  revalidatePath(`/painel/ferramentas/oficios/${id}`)
  return { ok: "Envio cancelado. O ofício voltou ao rascunho, com o número reservado." }
}

export async function anexarAssinadoAMaoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("ferramentas_oficios")
  const id = texto(formData, "oficio_id")
  if (!id) return { erro: "Ofício inválido." }
  const fora = await foraDoEscopo(id)
  if (fora) return { erro: fora }
  const arquivo = formData.get("arquivo")
  if (!(arquivo instanceof File) || arquivo.size === 0) return { erro: "Selecione o PDF assinado." }

  const { erro } = await anexarAssinadoAMao(id, arquivo)
  if (erro) return { erro }
  revalidatePath(`/painel/ferramentas/oficios/${id}`)
  return { ok: "Documento assinado anexado ao ofício." }
}
