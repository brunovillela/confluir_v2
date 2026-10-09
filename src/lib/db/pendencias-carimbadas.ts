import "server-only"

import type { SessaoPainel } from "@/lib/auth"
import { pendenciasDoUsuario, type Pendencia } from "@/lib/db/pendencias"

/**
 * Lista de pendências com o instante (relógio do SERVIDOR, em ms) em que o
 * cálculo começou. É o carimbo que decide quem é mais nova quando duas fontes
 * disputam no navegador: o layout, a página do painel e a consulta periódica
 * (ver ContadoresProvider). Lista vazia vem com `em: 0` — perde para qualquer
 * outra.
 */
export type PendenciasCarimbadas = { lista: Pendencia[]; em: number }

export async function pendenciasCarimbadas(sessao: SessaoPainel): Promise<PendenciasCarimbadas> {
  const em = Date.now()
  return { lista: await pendenciasDoUsuario(sessao), em }
}

export const SEM_PENDENCIAS: PendenciasCarimbadas = { lista: [], em: 0 }
