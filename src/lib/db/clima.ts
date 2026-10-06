import "server-only"

import { listarSedes } from "@/lib/db/organizacao"

/**
 * Previsão do tempo das cidades das sedes (Meu dia, 06/10/2026). Fonte:
 * Open-Meteo (aberta, sem chave). Tudo do lado do servidor, com cache do
 * Next: a coordenada da cidade por 30 dias, o tempo por 30 minutos. Melhor
 * esforço — sem resposta em 4 s, a cidade simplesmente não aparece.
 */

export type ClimaCidade = {
  cidade: string
  uf: string | null
  temperatura: number
  codigo: number
  dia: boolean
  maxima: number | null
  minima: number | null
  chuva: number | null
}

const UF_NOME: Record<string, string> = {
  AC: "Acre", AL: "Alagoas", AP: "Amapá", AM: "Amazonas", BA: "Bahia", CE: "Ceará", DF: "Distrito Federal",
  ES: "Espírito Santo", GO: "Goiás", MA: "Maranhão", MT: "Mato Grosso", MS: "Mato Grosso do Sul",
  MG: "Minas Gerais", PA: "Pará", PB: "Paraíba", PR: "Paraná", PE: "Pernambuco", PI: "Piauí",
  RJ: "Rio de Janeiro", RN: "Rio Grande do Norte", RS: "Rio Grande do Sul", RO: "Rondônia", RR: "Roraima",
  SC: "Santa Catarina", SP: "São Paulo", SE: "Sergipe", TO: "Tocantins",
}

const sem = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()

async function json<T>(url: string, revalidate: number): Promise<T | null> {
  try {
    const r = await fetch(url, { next: { revalidate }, signal: AbortSignal.timeout(4000) })
    if (!r.ok) return null
    return (await r.json()) as T
  } catch {
    return null
  }
}

async function coordenadas(cidade: string, uf: string | null): Promise<{ lat: number; lon: number } | null> {
  const g = await json<{ results?: { name: string; admin1?: string; latitude: number; longitude: number }[] }>(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cidade)}&count=10&language=pt&countryCode=BR`,
    60 * 60 * 24 * 30
  )
  const lista = g?.results ?? []
  const estado = uf ? UF_NOME[uf.toUpperCase()] : null
  const achado =
    lista.find((r) => sem(r.name) === sem(cidade) && (!estado || sem(r.admin1 ?? "") === sem(estado))) ??
    lista.find((r) => !estado || sem(r.admin1 ?? "") === sem(estado)) ??
    lista[0]
  return achado ? { lat: achado.latitude, lon: achado.longitude } : null
}

export async function climaDasSedes(): Promise<ClimaCidade[]> {
  const { sedes } = await listarSedes().catch(() => ({ sedes: [] as { cidade: string | null; estado: string | null }[] }))
  const vistas = new Set<string>()
  const cidades = sedes
    .filter((s) => s.cidade)
    .map((s) => ({ cidade: String(s.cidade).trim(), uf: s.estado ? String(s.estado).trim().toUpperCase() : null }))
    .filter((c) => {
      const k = `${sem(c.cidade)}|${c.uf ?? ""}`
      if (vistas.has(k)) return false
      vistas.add(k)
      return true
    })
    .slice(0, 6)

  const resultados = await Promise.all(
    cidades.map(async (c): Promise<ClimaCidade | null> => {
      const pos = await coordenadas(c.cidade, c.uf)
      if (!pos) return null
      const f = await json<{
        current?: { temperature_2m: number; weather_code: number; is_day: number }
        daily?: { temperature_2m_max?: number[]; temperature_2m_min?: number[]; precipitation_probability_max?: (number | null)[] }
      }>(
        `https://api.open-meteo.com/v1/forecast?latitude=${pos.lat}&longitude=${pos.lon}` +
          "&current=temperature_2m,weather_code,is_day" +
          "&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max" +
          "&timezone=America%2FSao_Paulo&forecast_days=1",
        60 * 30
      )
      if (!f?.current) return null
      return {
        cidade: c.cidade,
        uf: c.uf,
        temperatura: f.current.temperature_2m,
        codigo: f.current.weather_code,
        dia: f.current.is_day === 1,
        maxima: f.daily?.temperature_2m_max?.[0] ?? null,
        minima: f.daily?.temperature_2m_min?.[0] ?? null,
        chuva: f.daily?.precipitation_probability_max?.[0] ?? null,
      }
    })
  )
  return resultados.filter((r): r is ClimaCidade => r !== null)
}
