import "server-only"

import { TIPOS_REUNIAO, type TipoReuniao } from "@/lib/atas-constantes"
import type { FiltrosDeliberacoes } from "@/lib/db/deliberacoes"
import {
  DIAS_AVISO_PRAZO,
  ehSigiloDeliberacao,
  ehSituacaoDeliberacao,
  somarDias,
  type SigiloDeliberacao,
} from "@/lib/deliberacoes-constantes"

const DATA = /^\d{4}-\d{2}-\d{2}$/

export type ParametrosDeliberacoes = {
  de?: string | null
  ate?: string | null
  assunto?: string | null
  situacao?: string | null
  sigilo?: string | null
  tipo?: string | null
  prazo?: string | null
  responsavel?: string | null
}

/**
 * Filtros da tela Deliberações a partir da URL — os mesmos na tela e na
 * planilha. O sigilo pedido só vale dentro do nível (`sigilos`).
 */
export function lerFiltrosDeliberacoes(
  sp: ParametrosDeliberacoes,
  sigilos: SigiloDeliberacao[],
  usuarioId: string,
  hoje: string
): FiltrosDeliberacoes {
  return {
    de: sp.de && DATA.test(sp.de) ? sp.de : undefined,
    ate: sp.ate && DATA.test(sp.ate) ? sp.ate : undefined,
    assunto: (sp.assunto ?? "").trim() || undefined,
    situacao: ehSituacaoDeliberacao(sp.situacao) ? sp.situacao : undefined,
    sigilo: ehSigiloDeliberacao(sp.sigilo) && sigilos.includes(sp.sigilo) ? sp.sigilo : undefined,
    tipo: TIPOS_REUNIAO.some((t) => t.chave === sp.tipo) ? (sp.tipo as TipoReuniao) : undefined,
    vencidasAntesDe: sp.prazo === "vencido" ? hoje : undefined,
    vencemEntre: sp.prazo === "proximo" ? { de: hoje, ate: somarDias(hoje, DIAS_AVISO_PRAZO) } : undefined,
    responsavelId: sp.responsavel === "eu" ? usuarioId : undefined,
  }
}
