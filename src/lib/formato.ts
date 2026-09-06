/** '2024-03-05' ou ISO → '05/03/2024'. Datas puras não sofrem deslocamento de fuso. */
export function formatarData(valor: string | null | undefined): string {
  if (!valor) return "—"
  const soData = /^(\d{4})-(\d{2})-(\d{2})/.exec(valor)
  if (soData) return `${soData[3]}/${soData[2]}/${soData[1]}`
  const d = new Date(valor)
  if (Number.isNaN(d.getTime())) return "—"
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
  }).format(d)
}

/** ISO → '05/03/2024 14:32' no fuso de São Paulo. */
export function formatarDataHora(valor: string | null | undefined): string {
  if (!valor) return "—"
  const d = new Date(valor)
  if (Number.isNaN(d.getTime())) return "—"
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d)
}

/** NUMERIC(15,2) → 'R$ 1.234,56'. */
export function formatarMoeda(valor: number | string | null | undefined): string {
  if (valor === null || valor === undefined || valor === "") return "—"
  const n = typeof valor === "string" ? Number(valor) : valor
  if (Number.isNaN(n)) return "—"
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

/** Telefone com máscara simples quando possível. */
export function formatarTelefone(valor: string | null | undefined): string {
  if (!valor) return "—"
  const d = valor.replace(/\D/g, "")
  if (d.length === 11) return d.replace(/(\d{2})(\d{5})(\d{4})/, "($1) $2-$3")
  if (d.length === 10) return d.replace(/(\d{2})(\d{4})(\d{4})/, "($1) $2-$3")
  return valor
}

/** CNPJ ou CPF conforme o tamanho: 14 → 00.000.000/0000-00, 11 → 000.000.000-00. */
export function formatarCnpjCpf(valor: string | null | undefined): string {
  if (!valor) return "—"
  const d = valor.replace(/\D/g, "")
  if (d.length === 14) {
    return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5")
  }
  if (d.length === 11) {
    return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4")
  }
  return valor
}

/** CEP → 'XX.XXX-XXX' quando tem 8 dígitos. */
export function formatarCep(valor: string | null | undefined): string {
  if (!valor) return "—"
  const d = valor.replace(/\D/g, "")
  if (d.length === 8) return d.replace(/(\d{2})(\d{3})(\d{3})/, "$1.$2-$3")
  return valor
}

/**
 * <input type="datetime-local"> ↔ ISO, sempre no fuso de São Paulo.
 *
 * O input devolve "2026-09-12T20:00" SEM fuso, e `new Date(...)` interpreta
 * isso no fuso de quem executa. No navegador do usuário isso é BRT; no
 * servidor da Vercel é UTC. Resultado: salvar um evento das 20h gravava 20h
 * UTC — 17h em Macaé —, e cada novo "Salvar" andava mais 3 horas para trás.
 *
 * Estas duas funções fixam o fuso nas duas pontas, então o valor sobrevive ao
 * ida e volta independentemente de onde o código roda.
 */
const FUSO = "America/Sao_Paulo"

/** Quanto o relógio de São Paulo difere do UTC naquele instante, em ms. */
function deslocamentoSaoPaulo(instante: Date): number {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: FUSO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(instante)
  const p = Object.fromEntries(partes.map((x) => [x.type, x.value]))
  const comoUtc = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour) % 24,
    Number(p.minute),
    Number(p.second)
  )
  return comoUtc - instante.getTime()
}

/** ISO → "AAAA-MM-DDTHH:mm" para preencher o input, no horário de Macaé. */
export function paraCampoDataHora(iso: string | null | undefined): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d)
  const p = Object.fromEntries(partes.map((x) => [x.type, x.value]))
  return `${p.year}-${p.month}-${p.day}T${String(Number(p.hour) % 24).padStart(2, "0")}:${p.minute}`
}

/** "AAAA-MM-DDTHH:mm" do input → ISO, lendo o valor como horário de Macaé. */
export function deCampoDataHora(valor: string | null | undefined): string | null {
  if (!valor) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(valor.trim())
  if (!m) {
    const d = new Date(valor)
    return Number.isNaN(d.getTime()) ? null : d.toISOString()
  }
  const [, ano, mes, dia, hora, minuto] = m.map(Number)
  // Primeiro trata o valor como se fosse UTC; depois desconta o deslocamento
  // real de São Paulo naquele instante.
  const provisorio = Date.UTC(ano, mes - 1, dia, hora, minuto)
  const offset = deslocamentoSaoPaulo(new Date(provisorio))
  return new Date(provisorio - offset).toISOString()
}
