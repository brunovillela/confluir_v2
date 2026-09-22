import "server-only"

import { cache } from "react"

import {
  janelaAssembleia,
  momentoLocal,
  situacaoJanela,
  type Janela,
  type SituacaoJanela,
} from "@/lib/assembleias-constantes"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Horário de início e término da assembleia (supabase/voto-horarios-comprovante.sql).
 * Enquanto o SQL não roda, as colunas não existem: as consultas pedem as
 * colunas por `colunasHorario()` (vazio = não pede) e a janela cai no
 * comportamento antigo, o do dia inteiro.
 */
export const colunasHorario = cache(async (): Promise<string> => {
  const admin = await createAdminClient()
  const { error } = await admin.from("voto_assembleias").select("hora_inicio").limit(1)
  return error ? "" : ", hora_inicio, hora_termino"
})

export type FonteAssembleia = {
  data_inicio?: unknown
  hora_inicio?: unknown
  data_termino?: unknown
  hora_termino?: unknown
}

function texto(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null
}

/**
 * A janela de votação da assembleia. Sem término próprio, vale o da rodada
 * (dia inteiro). Sem hora, o dia inteiro da data.
 */
export function janelaDaAssembleia(
  a: FonteAssembleia,
  terminoDaRodada?: string | null
): Janela {
  const j = janelaAssembleia({
    data_inicio: texto(a.data_inicio),
    hora_inicio: texto(a.hora_inicio),
    data_termino: texto(a.data_termino),
    hora_termino: texto(a.hora_termino),
  })
  return {
    inicio: j.inicio,
    termino: j.termino ?? momentoLocal(terminoDaRodada ?? null, null, true),
  }
}

export function situacaoDaAssembleia(
  a: FonteAssembleia,
  terminoDaRodada?: string | null,
  agora = Date.now()
): SituacaoJanela {
  return situacaoJanela(janelaDaAssembleia(a, terminoDaRodada), agora)
}

/** Momento (ISO) do fim da janela — base da contagem regressiva. */
export function fimDaJanelaISO(
  a: FonteAssembleia,
  terminoDaRodada?: string | null
): string | null {
  const t = janelaDaAssembleia(a, terminoDaRodada).termino
  return t === null ? null : new Date(t).toISOString()
}

/** Momento (ISO) de abertura, quando ela ainda não chegou. */
export function abreEmISO(a: FonteAssembleia, agora = Date.now()): string | null {
  const i = janelaDaAssembleia(a).inicio
  return i !== null && i > agora ? new Date(i).toISOString() : null
}
