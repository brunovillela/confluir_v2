import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"

/**
 * TRAVA DO DESTINO BANCÁRIO (26/10/2026): ordem por Pix ou TED só existe com a
 * conta do favorecido registrada — senão o Financeiro não tem para onde pagar
 * e a remessa a recusa ("favorecido sem chave Pix nem conta bancária").
 * Vale para toda origem (a criação passa por inserirOrdensVerificadas) e para
 * a correção da ordem. Não é regra configurável da auditoria: não há o que
 * aceitar.
 *
 * Registrada é: o dado bancário escolhido na ordem (dados_bancarios_id), a
 * chave Pix gravada na própria ordem (folha, reembolso, hotel) ou, na falta
 * deles, um dado bancário do favorecido no cadastro — o mesmo que a remessa
 * usa. Pix (QR Code), boleto, cartão e dinheiro não entram aqui.
 */

type LinhaDestino = Record<string, unknown>

export type DestinoBancario = "pix" | "ted"

/** "Pix" ou "TED" (com as grafias antigas); o resto (QR Code, boleto…) é null. */
export function destinoDaForma(forma: unknown): DestinoBancario | null {
  const f = String(forma ?? "").trim().toLowerCase()
  if (!f || f.includes("qr")) return null
  if (f === "pix") return "pix"
  if (f.includes("ted") || f.includes("doc") || f.includes("depósito") || f.includes("deposito") || f.includes("transfer")) {
    return "ted"
  }
  return null
}

function t(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null
}

type Dado = { pix: string | null; conta: string | null; agencia: string | null; banco: string | null; banco_codigo: string | null }

const COLUNAS = "pix, conta, agencia, banco, banco_codigo"

function serve(d: Dado, destino: DestinoBancario): boolean {
  if (destino === "pix") return Boolean(t(d.pix))
  return Boolean(t(d.conta) && t(d.agencia) && (t(d.banco) || t(d.banco_codigo)))
}

function rotulo(destino: DestinoBancario): string {
  return destino === "pix" ? "a chave Pix" : "a conta bancária (banco, agência e conta)"
}

/**
 * Por que estas ordens não podem existir como estão (null = podem): a primeira
 * ordem Pix/TED sem o destino registrado. As consultas são agrupadas — um lote
 * de folha não vira uma consulta por funcionário.
 */
export async function faltaDestinoBancario(linhas: LinhaDestino[]): Promise<string | null> {
  const alvo = linhas
    .map((l) => ({ l, destino: destinoDaForma(l.forma_pagamento) }))
    .filter((x): x is { l: LinhaDestino; destino: DestinoBancario } => x.destino !== null)
  if (alvo.length === 0) return null

  const admin = await createAdminClient()
  const escolhidos = [...new Set(alvo.map((x) => t(x.l.dados_bancarios_id)).filter((v): v is string => Boolean(v)))]
  const fornecedores = [
    ...new Set(alvo.map((x) => t(x.l.beneficiario_fornecedor_id) ?? t(x.l.fornecedor_id)).filter((v): v is string => Boolean(v))),
  ]
  const usuarios = [...new Set(alvo.map((x) => t(x.l.beneficiario_usuario_id)).filter((v): v is string => Boolean(v)))]
  const [porId, porFornecedor, porUsuario] = await Promise.all([
    escolhidos.length
      ? admin.from("dados_bancarios").select(`id, ${COLUNAS}`).in("id", escolhidos)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    fornecedores.length
      ? admin.from("dados_bancarios").select(`fornecedor_id, ${COLUNAS}`).in("fornecedor_id", fornecedores)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    usuarios.length
      ? admin.from("dados_bancarios").select(`usuario_id, ${COLUNAS}`).in("usuario_id", usuarios)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ])
  const dadoPorId = new Map(((porId.data ?? []) as Record<string, unknown>[]).map((d) => [String(d.id), d as unknown as Dado]))
  const agrupar = (lista: Record<string, unknown>[] | null, chave: string) => {
    const m = new Map<string, Dado[]>()
    for (const d of lista ?? []) {
      const k = String(d[chave])
      m.set(k, [...(m.get(k) ?? []), d as unknown as Dado])
    }
    return m
  }
  const doFornecedor = agrupar(porFornecedor.data as Record<string, unknown>[] | null, "fornecedor_id")
  const doUsuario = agrupar(porUsuario.data as Record<string, unknown>[] | null, "usuario_id")

  for (const { l, destino } of alvo) {
    const escolhido = t(l.dados_bancarios_id)
    if (escolhido) {
      const d = dadoPorId.get(escolhido)
      if (d && serve(d, destino)) continue
      return `Pagamento por ${destino === "pix" ? "Pix" : "TED"}: o dado bancário escolhido não tem ${rotulo(destino)}. Escolha outro ou mude a forma de pagamento.`
    }
    if (destino === "pix" && t(l.pix_codigo)) continue
    const fornecedor = t(l.beneficiario_fornecedor_id) ?? t(l.fornecedor_id)
    const usuario = t(l.beneficiario_usuario_id)
    const cadastro = [...(fornecedor ? (doFornecedor.get(fornecedor) ?? []) : []), ...(usuario ? (doUsuario.get(usuario) ?? []) : [])]
    if (cadastro.some((d) => serve(d, destino))) continue
    const avulso = t(l.beneficiario_nome_avulso)
    const deQuem = avulso ? `de ${avulso}` : fornecedor || usuario ? "do favorecido" : null
    return deQuem
      ? `Pagamento por ${destino === "pix" ? "Pix" : "TED"} sem ${rotulo(destino)} ${deQuem} registrada. Cadastre os dados bancários do favorecido ou escolha outra forma (boleto, Pix por QR Code…).`
      : `Pagamento por ${destino === "pix" ? "Pix" : "TED"} sem favorecido nem ${rotulo(destino)} registrada.`
  }
  return null
}
