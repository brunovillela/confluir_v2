/**
 * Saúde — normalização de CAT no lado da aplicação.
 *
 * Espelha as funções `public.cat_*` criadas em supabase/saude-cat-carga.sql,
 * que trataram a carga inicial de 13.086 registros. Registro novo (pelo
 * formulário ou pela importação) precisa entrar com as MESMAS regras, senão
 * a base passa a ter dois padrões e os agrupamentos do painel se perdem.
 *
 * Se uma regra mudar aqui, mudar também no SQL — e vice-versa.
 */

/** Trim + espaços colapsados; string vazia vira null. */
export function nz(v: string | null | undefined): string | null {
  const t = (v ?? "").replace(/\s+/g, " ").trim()
  return t === "" ? null : t
}

const PARTICULAS = new Set(["da", "de", "do", "das", "dos", "e"])

/**
 * Título em português. Duas ressalvas ao initcap ingênuo, ambas medidas
 * contra o dado real: partículas ficam minúsculas fora da primeira palavra
 * ("Baker Hughes do Brasil"), e iniciais/siglas com barra ou ponto ficam
 * intactas — sem isso "S A PETROBRAS" vira "S a" e "S/A" vira "S/a".
 *
 * A ordem dos ramos importa: 'e' tem 1 caractere e seria capturado pela
 * regra de sigla se ela viesse antes.
 */
export function titulo(v: string | null | undefined): string | null {
  const t = nz(v)
  if (!t) return null
  return t
    .split(" ")
    .map((p, i) => {
      if (i > 0 && PARTICULAS.has(p.toLowerCase())) return p.toLowerCase()
      if (p.length <= 2 || p.includes("/") || p.includes(".")) return p.toUpperCase()
      return p[0].toUpperCase() + p.slice(1).toLowerCase()
    })
    .join(" ")
}

/** Só a primeira letra maiúscula. */
export function sentenca(v: string | null | undefined): string | null {
  const t = nz(v)
  if (!t) return null
  return t[0].toUpperCase() + t.slice(1).toLowerCase()
}

const MESES: Record<string, number> = {
  jan: 1, fev: 2, feb: 2, mar: 3, abr: 4, apr: 4, mai: 5, may: 5,
  jun: 6, jul: 7, ago: 8, aug: 8, set: 9, sep: 9, out: 10, oct: 10,
  nov: 11, dez: 12, dec: 12,
}

/**
 * Data → 'YYYY-MM-DD', ou null se não reconhecer (nunca chuta).
 *
 * Aceita o que o Excel pt-BR produz (DD/MM/AAAA), o ISO, e os dois
 * formatos que o export do Bubble trazia misturados na mesma coluna:
 * "May 8, 1982 12:00 am" e "jan. 4, 2019 00:00".
 */
export function data(v: string | null | undefined): string | null {
  const t = nz(v)
  if (!t) return null

  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(t)
  if (iso) return valida(+iso[1], +iso[2], +iso[3])

  const br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(t)
  if (br) return valida(+br[3], +br[2], +br[1])

  const texto = /^([A-Za-zçÇ]+)\.?\s+(\d{1,2}),\s*(\d{4})/.exec(t)
  if (texto) {
    const mes = MESES[texto[1].slice(0, 3).toLowerCase()]
    if (mes) return valida(+texto[3], mes, +texto[2])
  }
  return null
}

function valida(ano: number, mes: number, dia: number): string | null {
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null
  const d = new Date(Date.UTC(ano, mes - 1, dia))
  // Rejeita 31/02 e afins, que o Date "corrigiria" em silêncio.
  if (d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) return null
  return d.toISOString().slice(0, 10)
}

/** Sim/Não → boolean. Fora do vocabulário conhecido, null. */
export function booleano(v: string | null | undefined): boolean | null {
  const t = nz(v)?.toLowerCase()
  if (!t) return null
  if (["sim", "s", "true", "verdadeiro", "1"].includes(t)) return true
  if (["não", "nao", "n", "false", "falso", "0"].includes(t)) return false
  return null
}

/** Só dígitos, ou null. */
export function inteiro(v: string | null | undefined): number | null {
  const t = nz(v)?.replace(/\D/g, "")
  return t ? Number(t) : null
}

/** CPF com 11 dígitos (o check da tabela exige) — senão null. */
export function cpf(v: string | null | undefined): string | null {
  const d = (v ?? "").replace(/\D/g, "")
  return /^\d{11}$/.test(d) ? d : null
}

/**
 * Separa "<código de 9 dígitos> – <DESCRIÇÃO>" dos campos 31, 32, 34 e 45.
 * O separador na origem é travessão (–), mas hífen e meia-risca também
 * aparecem. Corta no PRIMEIRO separador: a descrição do campo 32 costuma
 * conter outro no meio ("PISO DE VEICULO – SUPERFICIE...").
 */
export function separarCodigo(v: string | null | undefined): {
  codigo: string | null
  descricao: string | null
} {
  const t = nz(v)
  if (!t) return { codigo: null, descricao: null }
  // [\s\S] em vez de . com a flag /s: o target do projeto é anterior a
  // es2018. A descrição pode conter quebra de linha vinda da planilha.
  const m = /^(\d{9})\s*[–—-]\s*([\s\S]+)$/.exec(t)
  if (m) return { codigo: m[1], descricao: sentenca(m[2]) }
  return { codigo: null, descricao: sentenca(t) }
}

/** CBO: separa só quando vem "<6 dígitos> - <descrição>". */
export function separarCbo(v: string | null | undefined): {
  codigo: string | null
  descricao: string | null
} {
  const t = nz(v)
  if (!t) return { codigo: null, descricao: null }
  const m = /^(\d{6})\s*-\s*(.+)$/.exec(t)
  if (m) return { codigo: m[1], descricao: sentenca(m[2]) }
  // Códigos colados e mutilados ("71133Torrista", 5 dígitos onde o CBO tem
  // 6) não são separados no chute — entram como descrição.
  return { codigo: null, descricao: sentenca(t) }
}

/**
 * CID-10: corrige só o que é mecânico. O formato é letra + 2 dígitos +
 * subcategoria opcional de 1 dígito, o que torna as correções inequívocas.
 *   "S01 4" / "S62-5" → S01.4 / S62.5   (separador errado)
 *   "S015"            → S01.5           (ponto omitido)
 *   "S51-"            → S51             (separador sobrando)
 * Fora desses padrões devolve em caixa alta, sem inventar.
 */
export function cid(v: string | null | undefined): string | null {
  const t = nz(v)?.toUpperCase()
  if (!t) return null
  if (/^[A-Z]\d{2}(\.\d)?$/.test(t)) return t
  if (/^[A-Z]\d{2}[\s.\-]+\d$/.test(t)) {
    return t.replace(/^([A-Z]\d{2})[\s.\-]+(\d)$/, "$1.$2")
  }
  if (/^[A-Z]\d{3}$/.test(t)) return t.replace(/^([A-Z]\d{2})(\d)$/, "$1.$2")
  if (/^[A-Z]\d{2}[\s.\-]+$/.test(t)) {
    return t.replace(/^([A-Z]\d{2})[\s.\-]+$/, "$1")
  }
  return t
}

/** True quando a descrição veio sem o código oficial (fila de revisão). */
export function semCodigo(bruto: string | null, codigo: string | null): boolean {
  return nz(bruto) !== null && codigo === null
}
