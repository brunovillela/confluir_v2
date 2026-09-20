/**
 * Tipos e rótulos da classificação de CAT (nova, já lançada, atualização,
 * possível duplicidade) — sem acesso ao banco, para as telas de cliente. A
 * regra está em src/lib/db/cat-duplicidades.ts.
 */

export type ClasseCat = "nova" | "duplicada" | "atualizacao" | "possivel_duplicada"

export const ROTULO_CLASSE: Record<ClasseCat, string> = {
  nova: "CAT nova",
  duplicada: "CAT já lançada",
  atualizacao: "Atualização de uma CAT da base",
  possivel_duplicada: "Possível duplicidade",
}

export type CatResumo = {
  id: string
  numero: string | null
  tipo: string | null
  recibo: string | null
  nome: string | null
  cpf: string | null
  dataAcidente: string | null
  houveMorte: boolean | null
  dataObito: string | null
  cid: string | null
  empregador: string | null
  criadoEm: string | null
  origemId: string | null
}

export type ClassificacaoCat = {
  classe: ClasseCat
  motivo: string
  /** CATs da base envolvidas (a de origem primeiro, numa atualização). */
  relacionadas: CatResumo[]
  /** Sugestão de CAT de origem para gravar em cat_origem_id. */
  origemId: string | null
  /** O que muda em relação à CAT da base (ex.: evolução para óbito). */
  mudancas: string[]
  /** Alertas: acidentado diferente, reabertura sem origem na base… */
  avisos: string[]
}

export type TipoGrupoCat = "numero" | "atualizacao" | "acidente"

export const ROTULO_GRUPO_CAT: Record<TipoGrupoCat, string> = {
  numero: "Mesmo número",
  atualizacao: "Atualização sem vínculo",
  acidente: "Mesmo acidentado e data",
}
