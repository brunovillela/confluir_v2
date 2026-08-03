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
