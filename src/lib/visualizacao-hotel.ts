import "server-only"

import { createHmac } from "node:crypto"

import { cache } from "react"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import { getSessaoHotel, getSessaoPainel } from "@/lib/auth"
import { buscarHotel, type Hotel, type UsuarioHotel } from "@/lib/db/hospedagem"
import { podeAcessar } from "@/lib/permissoes"

/**
 * "Ver como o hotel" — a gestão da hospedagem abre a área do hotel parceiro em
 * modo SOMENTE LEITURA, para conseguir dizer ao telefone "clique no botão
 * laranja, no fim da página".
 *
 * A segurança é ESTRUTURAL, igual ao "Ver como filiado": as actions de /hotel
 * continuam chamando `requireSessaoHotel()`, que resolve o hotel pelo vínculo
 * em `hospedagem_hotel_usuarios` da conta logada. A gestão não tem esse
 * vínculo, então nenhuma escrita pega — nem burlando o `disabled` do botão.
 * Este módulo cobre só a EXIBIÇÃO.
 *
 * O cookie guarda apenas UUIDs (hotelId + gestorId), assinado (HMAC) e com
 * validade curta; a permissão da gestão é RE-CHECADA no servidor a cada
 * request.
 */

export const COOKIE_VISUALIZACAO_HOTEL = "confluir_ver_hotel"
const TTL_SEGUNDOS = 60 * 30 // 30 min

/** Quem pode ver a área de um hotel parceiro. */
const PERMISSAO_VER = "filiacao_hospedagens"
const PERMISSAO_VER_ALT = ["filiacao_hospedagens_gestao", "filiacao_hospedagens_edicao"]

function assinar(corpo: string): string {
  return createHmac("sha256", process.env.SUPABASE_JWT_SECRET!).update(corpo).digest("base64url")
}

/** Gera o token assinado do cookie (hotelId + gestorId + expiração). */
export function gerarTokenVisualizacaoHotel(hotelId: string, gestorId: string): string {
  const corpo = Buffer.from(
    JSON.stringify({
      h: hotelId,
      g: gestorId,
      exp: Math.floor(Date.now() / 1000) + TTL_SEGUNDOS,
    })
  ).toString("base64url")
  return `${corpo}.${assinar(corpo)}`
}

export const MAX_IDADE_VISUALIZACAO_HOTEL = TTL_SEGUNDOS

type Payload = { h: string; g: string; exp: number }

function lerToken(token: string | undefined): Payload | null {
  if (!token) return null
  const [corpo, sig] = token.split(".")
  if (!corpo || !sig || assinar(corpo) !== sig) return null
  try {
    const o = JSON.parse(Buffer.from(corpo, "base64url").toString()) as Payload
    if (typeof o.h !== "string" || typeof o.g !== "string") return null
    if (typeof o.exp !== "number" || o.exp < Math.floor(Date.now() / 1000)) return null
    return o
  } catch {
    return null
  }
}

export type VisualizacaoHotel = {
  hotel: Hotel
  /** Nulo na visualização: a gestão não é usuária do hotel. */
  usuarioHotel: UsuarioHotel | null
  /** true quando é a gestão olhando (somente leitura). */
  preview: boolean
  /** Nome de quem está visualizando (para a tarja). */
  gestorNome?: string | null
}

/**
 * Sessão de EXIBIÇÃO da área do hotel: o pessoal do hotel logado normalmente,
 * OU — com cookie de visualização válido e gestão com permissão — o hotel-alvo
 * com `preview: true`. Null quando nem uma coisa nem outra (o require manda
 * para /hotel).
 */
export const getVisualizacaoHotel = cache(async (): Promise<VisualizacaoHotel | null> => {
  const jar = await cookies()
  const dados = lerToken(jar.get(COOKIE_VISUALIZACAO_HOTEL)?.value)

  if (dados) {
    // Re-checa que quem está logado é a MESMA gestão do cookie e ainda tem
    // permissão — a cada request, sem confiar só no cookie.
    const painel = await getSessaoPainel()
    const autorizado =
      painel &&
      painel.usuario.id === dados.g &&
      podeAcessar(painel.permissoes, PERMISSAO_VER, PERMISSAO_VER_ALT)

    if (autorizado) {
      const hotel = await buscarHotel(dados.h)
      if (hotel) {
        return {
          hotel,
          usuarioHotel: null,
          preview: true,
          gestorNome: painel.usuario.nome_guerra ?? painel.usuario.nome_completo,
        }
      }
    }
    // Cookie presente mas inválido/sem permissão: ignora e segue o fluxo normal.
  }

  const sessao = await getSessaoHotel()
  if (!sessao) return null
  return { hotel: sessao.hotel, usuarioHotel: sessao.usuarioHotel, preview: false }
})

export async function requireVisualizacaoHotel(): Promise<VisualizacaoHotel> {
  const v = await getVisualizacaoHotel()
  if (!v) redirect("/hotel")
  return v
}

/** Id do hotel em visualização (para voltar ao cadastro ao encerrar). */
export async function alvoDaVisualizacaoHotel(): Promise<string | null> {
  const jar = await cookies()
  return lerToken(jar.get(COOKIE_VISUALIZACAO_HOTEL)?.value)?.h ?? null
}
