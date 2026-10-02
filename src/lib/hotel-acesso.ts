import "server-only"

import { redirect } from "next/navigation"

import { requireSessaoHotel, type SessaoHotel } from "@/lib/auth"
import {
  areaHotel,
  podeEditarArea,
  podeVerArea,
  type ChaveAreaHotel,
  type PermissoesHotel,
} from "@/lib/hotel-permissoes"
import { requireVisualizacaoHotel, type VisualizacaoHotel } from "@/lib/visualizacao-hotel"

/**
 * Aplica as permissões do usuário do hotel (lib/hotel-permissoes.ts) nas
 * páginas e nas gravações da interface do hotel. A gestão no "Ver como o
 * hotel" enxerga todas as áreas, mas nunca grava (não tem sessão de hotel).
 */

export function permissoesDaVisualizacao(v: VisualizacaoHotel): PermissoesHotel {
  // Visualização da gestão: vê tudo (a escrita já é barrada à parte).
  if (v.preview) return null
  return v.usuarioHotel?.permissoes ?? null
}

/** Página de uma área: sem acesso, volta ao Início com o aviso. */
export async function requireAreaHotel(
  chave: ChaveAreaHotel
): Promise<VisualizacaoHotel & { podeEditar: boolean; somenteConsulta: boolean }> {
  const v = await requireVisualizacaoHotel()
  const permissoes = permissoesDaVisualizacao(v)
  if (!podeVerArea(permissoes, chave)) redirect(`/hotel/inicio?semAcesso=${chave}`)
  const podeEditar = !v.preview && podeEditarArea(permissoes, chave)
  // Aviso de "só consulta" só faz sentido em área que tem edição.
  return { ...v, podeEditar, somenteConsulta: !v.preview && areaHotel(chave).temEdicao && !podeEditar }
}

/** Gravação numa área: a sessão do hotel, ou o erro para a tela. */
export async function sessaoHotelParaEditar(chave: ChaveAreaHotel): Promise<SessaoHotel | { erro: string }> {
  const sessao = await requireSessaoHotel()
  if (!podeEditarArea(sessao.usuarioHotel.permissoes ?? null, chave)) {
    return {
      erro: `Seu acesso a "${areaHotel(chave).titulo}" não permite esta ação. Peça ao sindicato para ajustar suas permissões.`,
    }
  }
  return sessao
}
