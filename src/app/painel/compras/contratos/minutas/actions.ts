"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import {
  PAPEIS_ENTIDADE,
  rotuloTipoMinuta,
  tipoMinuta,
  type ParametrosMinuta,
} from "@/lib/contratos-minutas-constantes"
import {
  atualizarDadosMinuta,
  criarMinuta,
  excluirMinuta,
  novaVersaoMinuta,
  obterMinuta,
  qualificacoesDaMinuta,
} from "@/lib/db/contratos-minutas"
import { ajustarMinutaIA, redigirMinutaIA } from "@/lib/db/contratos-minutas-ia"

export type EstadoMinuta = { erro?: string; ok?: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const BASE = "/painel/compras/contratos/minutas"
const txt = (fd: FormData, nome: string) => String(fd.get(nome) ?? "").trim()
const opcional = (fd: FormData, nome: string) => txt(fd, nome) || null
const idOuNull = (fd: FormData, nome: string) => (UUID.test(txt(fd, nome)) ? txt(fd, nome) : null)

/** Quem cria e edita minuta é quem edita contratos. */
async function sessaoEdicao() {
  const sessao = await requirePermissao("aquisicoes_contratos_edicao")
  return { sessao, usuarioId: String(sessao.usuario.id) }
}

function lerParametros(fd: FormData): ParametrosMinuta | { erro: string } {
  const tipo = tipoMinuta(txt(fd, "tipo"))
  if (!tipo) return { erro: "Escolha o tipo de contrato." }
  const papel = PAPEIS_ENTIDADE.find((p) => p.chave === txt(fd, "papel_entidade"))?.chave ?? "contratante"
  const objeto = txt(fd, "objeto")
  if (objeto.length < 10) return { erro: "Descreva o objeto do contrato (o que está sendo contratado)." }
  const outraParteId = idOuNull(fd, "outra_parte_id")
  const outraParteNome = opcional(fd, "outra_parte_nome")
  if (!outraParteId && !outraParteNome) {
    return { erro: "Informe a outra parte: escolha no cadastro ou escreva o nome." }
  }
  return {
    tipo,
    papelEntidade: papel,
    outraParteId,
    outraParteNome,
    outraParteQualificacao: opcional(fd, "outra_parte_qualificacao"),
    outraParteRepresentante: opcional(fd, "outra_parte_representante"),
    assinanteId: idOuNull(fd, "assinante_id"),
    sedeId: idOuNull(fd, "sede_id"),
    objeto,
    valor: opcional(fd, "valor"),
    pagamento: opcional(fd, "pagamento"),
    vigencia: opcional(fd, "vigencia"),
    reajuste: opcional(fd, "reajuste"),
    obrigacoes: opcional(fd, "obrigacoes"),
    penalidades: opcional(fd, "penalidades"),
    foro: opcional(fd, "foro"),
    instrucoes: opcional(fd, "instrucoes"),
  }
}

/** Cria a minuta: a IA redige a primeira versão a partir do formulário. */
export async function criarMinutaAction(
  _prev: EstadoMinuta,
  fd: FormData
): Promise<EstadoMinuta> {
  const { usuarioId } = await sessaoEdicao()
  const parametros = lerParametros(fd)
  if ("erro" in parametros) return { erro: parametros.erro }

  const qualificacoes = await qualificacoesDaMinuta(parametros)
  const { texto, erro, truncado } = await redigirMinutaIA(parametros, qualificacoes)
  if (erro || !texto) return { erro: erro ?? "A IA não devolveu a minuta." }

  const titulo =
    opcional(fd, "titulo") ??
    [rotuloTipoMinuta(parametros.tipo), qualificacoes.outraParteNome].filter(Boolean).join(" — ")
  const { id, erro: erroGravar } = await criarMinuta({
    titulo,
    parametros: { ...parametros, outraParteNome: parametros.outraParteNome ?? qualificacoes.outraParteNome },
    contratoId: idOuNull(fd, "contrato_id"),
    texto,
    usuarioId,
  })
  if (erroGravar || !id) return { erro: erroGravar ?? "Não foi possível criar a minuta." }

  revalidatePath(BASE)
  redirect(`${BASE}/${id}?criada=1${truncado ? "&truncado=1" : ""}`)
}

/** Salva a edição manual do texto como nova versão. */
export async function salvarTextoMinutaAction(
  _prev: EstadoMinuta,
  fd: FormData
): Promise<EstadoMinuta> {
  const { usuarioId } = await sessaoEdicao()
  const id = txt(fd, "id")
  const texto = String(fd.get("texto") ?? "").trim()
  if (!UUID.test(id)) return { erro: "Minuta inválida." }
  if (texto.length < 50) return { erro: "O texto da minuta está vazio ou curto demais." }
  const { erro, versao } = await novaVersaoMinuta({ id, texto, origem: "edicao", usuarioId })
  if (erro) return { erro }
  revalidatePath(`${BASE}/${id}`)
  return { ok: `Salvo (versão ${versao}).` }
}

/** Pede um ajuste à IA sobre o texto atual; o resultado vira nova versão. */
export async function ajustarMinutaAction(
  _prev: EstadoMinuta,
  fd: FormData
): Promise<EstadoMinuta> {
  const { usuarioId } = await sessaoEdicao()
  const id = txt(fd, "id")
  const pedido = txt(fd, "pedido")
  if (!UUID.test(id)) return { erro: "Minuta inválida." }
  if (pedido.length < 5) return { erro: "Diga o que a IA deve mudar." }

  const minuta = await obterMinuta(id)
  if (!minuta?.texto) return { erro: "Minuta não encontrada." }
  // O texto na tela pode ter edição ainda não salva: ela vale como base.
  const base = String(fd.get("texto") ?? "").trim() || minuta.texto
  if (base !== minuta.texto) {
    const salvo = await novaVersaoMinuta({ id, texto: base, origem: "edicao", usuarioId })
    if (salvo.erro) return { erro: salvo.erro }
  }

  const qualificacoes = await qualificacoesDaMinuta(minuta.parametros)
  const { texto, erro, truncado } = await ajustarMinutaIA(base, pedido, minuta.parametros, qualificacoes)
  if (erro || !texto) return { erro: erro ?? "A IA não devolveu a minuta." }
  if (truncado) {
    return {
      erro: "A resposta da IA veio cortada (texto longo demais) e não foi salva. Peça o ajuste em partes menores.",
    }
  }
  const { erro: erroVersao, versao } = await novaVersaoMinuta({
    id,
    texto,
    origem: "ajuste",
    pedido,
    usuarioId,
  })
  if (erroVersao) return { erro: erroVersao }
  revalidatePath(`${BASE}/${id}`)
  redirect(`${BASE}/${id}?ajustada=${versao}`)
}

export async function restaurarVersaoAction(fd: FormData): Promise<void> {
  const { usuarioId } = await sessaoEdicao()
  const id = txt(fd, "id")
  const versaoId = txt(fd, "versao_id")
  const minuta = UUID.test(id) ? await obterMinuta(id) : null
  const versao = minuta?.versoes.find((v) => v.id === versaoId)
  if (!minuta || !versao) return
  await novaVersaoMinuta({
    id,
    texto: versao.texto,
    origem: "restauracao",
    pedido: `Restaurada a versão ${versao.versao}`,
    usuarioId,
  })
  revalidatePath(`${BASE}/${id}`)
  redirect(`${BASE}/${id}?restaurada=${versao.versao}`)
}

/** Título, contrato vinculado e "finalizada". */
export async function atualizarDadosMinutaAction(
  _prev: EstadoMinuta,
  fd: FormData
): Promise<EstadoMinuta> {
  const { usuarioId } = await sessaoEdicao()
  const id = txt(fd, "id")
  if (!UUID.test(id)) return { erro: "Minuta inválida." }
  const titulo = txt(fd, "titulo")
  if (!titulo) return { erro: "Informe o título." }
  const { erro } = await atualizarDadosMinuta(
    id,
    {
      titulo,
      contratoId: idOuNull(fd, "contrato_id"),
      finalizada: fd.get("finalizada") === "on",
    },
    usuarioId
  )
  if (erro) return { erro }
  revalidatePath(`${BASE}/${id}`)
  revalidatePath(BASE)
  return { ok: "Dados salvos." }
}

export async function excluirMinutaAction(fd: FormData): Promise<void> {
  const { usuarioId } = await sessaoEdicao()
  const id = txt(fd, "id")
  if (!UUID.test(id)) return
  await excluirMinuta(id, usuarioId)
  revalidatePath(BASE)
  redirect(`${BASE}?excluida=1`)
}
