"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { diferenca, type Trecho } from "@/lib/acordos-comparar"
import { requirePermissao } from "@/lib/auth"
import {
  analisarPar,
  criarComparacao,
  definirAvaliacao,
  desfazerPar,
  excluirComparacao,
  obterComparacao,
  parearManual,
  type Avaliacao,
} from "@/lib/db/acordos-comparacoes"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const BASE = "/painel/representacao/acordos/comparacoes"
const txt = (fd: FormData, n: string) => String(fd.get(n) ?? "").trim()

async function requireAcordos() {
  return requirePermissao("acordos_coletivos")
}

export type EstadoComparacao = { erro?: string }

export async function criarComparacaoAction(
  _prev: EstadoComparacao,
  fd: FormData
): Promise<EstadoComparacao> {
  const sessao = await requireAcordos()
  const a = txt(fd, "acordo_a")
  const b = txt(fd, "acordo_b")
  if (!UUID.test(a) || !UUID.test(b)) return { erro: "Escolha os dois acordos." }
  const { id, erro } = await criarComparacao(a, b, String(sessao.usuario.id))
  if (erro || !id) return { erro: erro ?? "Não foi possível comparar." }
  revalidatePath(BASE)
  redirect(`${BASE}/${id}`)
}

/** Diferença palavra a palavra de um par (carregada só quando a pessoa abre). */
export async function diferencaDoParAction(
  comparacaoId: string,
  parId: string
): Promise<{ trechos?: Trecho[]; erro?: string }> {
  await requireAcordos()
  if (!UUID.test(comparacaoId) || !UUID.test(parId)) return { erro: "Par inválido." }
  const c = await obterComparacao(comparacaoId)
  const p = c?.pares.find((x) => x.id === parId)
  if (!p) return { erro: "Par não encontrado." }
  return { trechos: diferenca(p.a?.texto ?? "", p.b?.texto ?? "") }
}

function voltar(comparacaoId: string, ancora?: string): never {
  revalidatePath(`${BASE}/${comparacaoId}`)
  redirect(`${BASE}/${comparacaoId}${ancora ? `#${ancora}` : ""}`)
}

export async function desfazerParAction(fd: FormData): Promise<void> {
  await requireAcordos()
  const c = txt(fd, "comparacao_id")
  const par = txt(fd, "par_id")
  if (!UUID.test(par) || !UUID.test(c)) return
  await desfazerPar(par)
  voltar(c)
}

export async function parearManualAction(
  _prev: EstadoComparacao,
  fd: FormData
): Promise<EstadoComparacao> {
  await requireAcordos()
  const c = txt(fd, "comparacao_id")
  const suprimida = txt(fd, "par_id")
  const nova = txt(fd, "par_nova_id")
  if (!UUID.test(suprimida) || !UUID.test(nova) || !UUID.test(c)) return { erro: "Escolha a cláusula para parear." }
  const { erro } = await parearManual(suprimida, nova)
  if (erro) return { erro }
  voltar(c, `par-${suprimida}`)
}

export async function analisarParAction(
  _prev: EstadoComparacao,
  fd: FormData
): Promise<EstadoComparacao> {
  await requireAcordos()
  const c = txt(fd, "comparacao_id")
  const par = txt(fd, "par_id")
  if (!UUID.test(par) || !UUID.test(c)) return { erro: "Par inválido." }
  const { erro } = await analisarPar(par)
  if (erro) return { erro }
  voltar(c, `par-${par}`)
}

export async function definirAvaliacaoAction(fd: FormData): Promise<void> {
  await requireAcordos()
  const c = txt(fd, "comparacao_id")
  const par = txt(fd, "par_id")
  const avaliacao = txt(fd, "avaliacao") as Avaliacao
  if (!UUID.test(par) || !UUID.test(c) || !["favoravel", "desfavoravel", "neutra"].includes(avaliacao)) return
  await definirAvaliacao(par, avaliacao)
  voltar(c, `par-${par}`)
}

export async function excluirComparacaoAction(fd: FormData): Promise<void> {
  await requireAcordos()
  const c = txt(fd, "comparacao_id")
  if (!UUID.test(c)) return
  await excluirComparacao(c)
  revalidatePath(BASE)
  redirect(`${BASE}?excluida=1`)
}
