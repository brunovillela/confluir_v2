/**
 * "Adicionar ao calendário" (A84): o arquivo .ics e o link do Google Agenda
 * de um evento ou de um compromisso da agenda. Puro, sem banco — serve à
 * página e às duas rotas de download (`[id]/calendario` e
 * `agenda/[id]/calendario`).
 *
 * Os horários saem em UTC (sufixo Z): o instante é exato e o aplicativo de
 * calendário converte para o fuso do aparelho, sem depender de VTIMEZONE. O
 * fuso de São Paulo entra no compromisso de dia todo, porque a DATA dele é a
 * de lá, e no X-WR-TIMEZONE do arquivo, que diz aos aplicativos que o leem
 * em que fuso o calendário foi feito (não desloca os horários em UTC).
 */

export type ItemCalendario = {
  /** Identificador estável: importar de novo atualiza, não duplica. */
  uid: string
  titulo: string
  /** ISO do início. */
  inicio: string
  /** ISO do término; sem ele (ou se vier antes do início), duas horas depois. */
  termino: string | null
  diaTodo?: boolean
  local?: string | null
  descricao?: string | null
  /** Endereço no portal, para voltar ao item. */
  url?: string | null
}

const DUAS_HORAS = 2 * 60 * 60 * 1000
const FUSO = "America/Sao_Paulo"

/** ISO → "20261020T220000Z". */
function instanteUtc(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, "Z").replace(/[-:]/g, "")
}

/** Data de calendário em São Paulo → "20261020". */
function dataSP(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: FUSO }).format(d).replace(/-/g, "")
}

/** "20261020" → "20261021" (o DTEND de dia todo é exclusivo). */
function diaSeguinte(aaaammdd: string): string {
  const d = new Date(
    Date.UTC(Number(aaaammdd.slice(0, 4)), Number(aaaammdd.slice(4, 6)) - 1, Number(aaaammdd.slice(6, 8)) + 1)
  )
  return d.toISOString().slice(0, 10).replace(/-/g, "")
}

function datas(item: ItemCalendario): { inicio: Date; fim: Date } | null {
  const inicio = new Date(item.inicio)
  if (Number.isNaN(inicio.getTime())) return null
  const termino = item.termino ? new Date(item.termino) : null
  const fim =
    termino && !Number.isNaN(termino.getTime()) && termino > inicio
      ? termino
      : new Date(inicio.getTime() + DUAS_HORAS)
  return { inicio, fim }
}

/** Dia todo: do primeiro dia ao dia seguinte ao último, em São Paulo. */
function diasInteiros(inicio: Date, fim: Date, temTermino: boolean): { de: string; ate: string } {
  const de = dataSP(inicio)
  const ultimo = temTermino ? dataSP(fim) : de
  return { de, ate: diaSeguinte(ultimo < de ? de : ultimo) }
}

/** Texto curto: sem tags, espaços colapsados, cortado na palavra. */
export function resumoCurto(texto: string | null | undefined, max = 300): string {
  const limpo = (texto ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
  if (limpo.length <= max) return limpo
  const corte = limpo.slice(0, max)
  const espaco = corte.lastIndexOf(" ")
  return `${(espaco > max * 0.6 ? corte.slice(0, espaco) : corte).replace(/[\s.,;:—-]+$/, "")}…`
}

/** Escape de TEXT do RFC 5545. */
function escapar(texto: string): string {
  return texto
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n")
}

/** Dobra a linha em 75 octetos (RFC 5545 §3.1) sem partir caractere acentuado. */
function dobrar(linha: string): string {
  const codificador = new TextEncoder()
  const partes: string[] = []
  let atual = ""
  let octetos = 0
  for (const ch of linha) {
    const tamanho = codificador.encode(ch).length
    // A continuação começa com um espaço, que também conta.
    const limite = partes.length === 0 ? 75 : 74
    if (octetos + tamanho > limite) {
      partes.push(atual)
      atual = ""
      octetos = 0
    }
    atual += ch
    octetos += tamanho
  }
  partes.push(atual)
  return partes.join("\r\n ")
}

function descricaoCompleta(item: ItemCalendario): string {
  return [resumoCurto(item.descricao), item.url ? `No portal: ${item.url}` : ""]
    .filter(Boolean)
    .join("\n\n")
}

/** Conteúdo do .ics (text/calendar), com quebras CRLF. */
export function arquivoIcs(item: ItemCalendario, agora = new Date()): string | null {
  const d = datas(item)
  if (!d) return null
  const linhas = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Confluir//Portal do Associado//PT-BR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-TIMEZONE:${FUSO}`,
    "BEGIN:VEVENT",
    `UID:${item.uid}`,
    `DTSTAMP:${instanteUtc(agora)}`,
  ]
  if (item.diaTodo) {
    const { de, ate } = diasInteiros(d.inicio, d.fim, Boolean(item.termino))
    linhas.push(`DTSTART;VALUE=DATE:${de}`, `DTEND;VALUE=DATE:${ate}`)
  } else {
    linhas.push(`DTSTART:${instanteUtc(d.inicio)}`, `DTEND:${instanteUtc(d.fim)}`)
  }
  linhas.push(`SUMMARY:${escapar(item.titulo)}`)
  if (item.local) linhas.push(`LOCATION:${escapar(item.local)}`)
  const descricao = descricaoCompleta(item)
  if (descricao) linhas.push(`DESCRIPTION:${escapar(descricao)}`)
  if (item.url) linhas.push(`URL:${item.url}`)
  linhas.push("END:VEVENT", "END:VCALENDAR")
  return linhas.map(dobrar).join("\r\n") + "\r\n"
}

/** Link "Adicionar ao Google Agenda" (abre o formulário do Google já preenchido). */
export function linkGoogleAgenda(item: ItemCalendario): string | null {
  const d = datas(item)
  if (!d) return null
  const periodo = item.diaTodo
    ? (() => {
        const { de, ate } = diasInteiros(d.inicio, d.fim, Boolean(item.termino))
        return `${de}/${ate}`
      })()
    : `${instanteUtc(d.inicio)}/${instanteUtc(d.fim)}`
  const q = new URLSearchParams({ action: "TEMPLATE", text: item.titulo, dates: periodo })
  const descricao = descricaoCompleta(item)
  if (descricao) q.set("details", descricao)
  if (item.local) q.set("location", item.local)
  return `https://calendar.google.com/calendar/render?${q.toString()}`
}

/**
 * Evento → item do calendário. `periodo` é o que vale (a nova data, se
 * adiado — `periodoDoEvento`). O UID é o mesmo na página e no .ics.
 */
export function itemDoEvento(
  e: {
    id: string
    titulo: string | null
    local: string | null
    endereco: string | null
    descricao: string | null
  },
  periodo: { inicio: string; termino: string | null },
  url: string | null
): ItemCalendario {
  return {
    uid: `evento-${e.id}@confluir`,
    titulo: e.titulo ?? "Evento",
    inicio: periodo.inicio,
    termino: periodo.termino,
    local: [e.local, e.endereco].filter(Boolean).join(" — ") || null,
    descricao: e.descricao,
    url,
  }
}

/** Compromisso da agenda → item do calendário. */
export function itemDaAgenda(
  a: {
    id: string
    atividade: string | null
    local: string | null
    inicio: string
    termino: string | null
    diaTodo: boolean
    tipo: string | null
    informacoes: string | null
  },
  url: string | null
): ItemCalendario {
  return {
    uid: `agenda-${a.id}@confluir`,
    titulo: a.atividade ?? "Atividade",
    inicio: a.inicio,
    termino: a.termino,
    diaTodo: a.diaTodo,
    local: a.local,
    descricao: [a.tipo, a.informacoes].filter(Boolean).join(" — ") || null,
    url,
  }
}

/** "Encontro de Formação" → "encontro-de-formacao.ics". */
export function nomeArquivoIcs(titulo: string | null | undefined): string {
  const base = (titulo ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
  return `${base || "evento"}.ics`
}
