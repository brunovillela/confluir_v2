import "server-only"

import { esquemaAusente, lerEmLotes, lerEmLotesPorIds } from "@/lib/db/comum"
import { jornadasVinculadas, type JornadaVinculada } from "@/lib/db/pessoal-sst"
import { feriadosNacionais } from "@/lib/feriados"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"
import {
  apurarUso,
  diasDoPeriodo,
  resumirUso,
  type BlocoUso,
  type DiaUso,
  type ResumoUso,
} from "@/lib/uso-fora-expediente"

/** Um sinal a mais de 3 minutos do último abre um bloco novo. */
const PAUSA_MS = 3 * 60 * 1000
const MINUTO_MS = 60 * 1000

/**
 * Registra um minuto de uso: estende o bloco aberto da pessoa ou abre outro.
 * "parar" = a tabela não existe (migração não aplicada) — o painel para de mandar.
 */
export async function registrarUsoPainel(usuarioId: string): Promise<"ok" | "parar" | "erro"> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const agora = Date.now()
  const { data: aberto, error } = await admin
    .from("pessoal_uso_painel")
    .select("id")
    .eq("emp_proprietaria_id", emp)
    .eq("usuario_id", usuarioId)
    .gte("fim", new Date(agora - PAUSA_MS).toISOString())
    .order("fim", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) return esquemaAusente(error) ? "parar" : "erro"
  const r = aberto
    ? await admin.from("pessoal_uso_painel").update({ fim: new Date(agora).toISOString() }).eq("id", aberto.id)
    : await admin.from("pessoal_uso_painel").insert({
        emp_proprietaria_id: emp,
        usuario_id: usuarioId,
        inicio: new Date(agora - MINUTO_MS).toISOString(),
        fim: new Date(agora).toISOString(),
      })
  return r.error ? "erro" : "ok"
}

type Periodo = { de: string; ate: string; deIso: string; ateIso: string }

/** "AAAA-MM" → primeiro e último dia, e os limites em UTC (fuso de São Paulo). */
function periodoDoMes(competencia: string): Periodo {
  const [a, m] = competencia.split("-").map(Number)
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate()
  const de = `${competencia}-01`
  const ate = `${competencia}-${String(ultimo).padStart(2, "0")}`
  return { de, ate, deIso: `${de}T00:00:00-03:00`, ateIso: `${ate}T23:59:59.999-03:00` }
}

export function competenciaValida(c: string | undefined | null): string | null {
  return c && /^\d{4}-(0[1-9]|1[0-2])$/.test(c) ? c : null
}

async function blocosDoPeriodo(ids: string[], p: Periodo): Promise<Map<string, BlocoUso[]> | null> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  try {
    const linhas = await lerEmLotesPorIds<{ usuario_id: string; inicio: string; fim: string }>(ids, (fatia, de, ate) =>
      admin
        .from("pessoal_uso_painel")
        .select("usuario_id, inicio, fim")
        .eq("emp_proprietaria_id", emp)
        .in("usuario_id", fatia)
        .gte("fim", p.deIso)
        .lte("inicio", p.ateIso)
        .order("inicio")
        .order("id")
        .range(de, ate)
    )
    const mapa = new Map<string, BlocoUso[]>()
    for (const l of linhas) mapa.set(l.usuario_id, [...(mapa.get(l.usuario_id) ?? []), { inicio: l.inicio, fim: l.fim }])
    return mapa
  } catch (e) {
    if (esquemaAusente(e as { code?: string })) return null
    throw e
  }
}

/** Dias de férias e ausências de cada pessoa no período: usuarioId → (data → motivo). */
async function afastamentosDoPeriodo(ids: string[], p: Periodo): Promise<Map<string, Map<string, string>>> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const mapa = new Map<string, Map<string, string>>()
  const marcar = (f: string, inicio: string | null, termino: string | null, motivo: string) => {
    if (!inicio) return
    const dias = mapa.get(f) ?? new Map<string, string>()
    for (const d of diasDoPeriodo(inicio, termino, p.de, p.ate)) if (!dias.has(d)) dias.set(d, motivo)
    mapa.set(f, dias)
  }
  type Linha = { funcionario_id: string; inicio: string | null; termino: string | null }
  const [ausencias, ferias] = await Promise.all([
    lerEmLotesPorIds<Linha & { motivo: string | null }>(ids, (fatia, de, ate) =>
      admin
        .from("pessoal_ausencias")
        .select("id, funcionario_id, inicio, termino, motivo")
        .eq("emp_proprietaria_id", emp)
        .in("funcionario_id", fatia)
        .lte("inicio", p.ate)
        .or(`termino.gte.${p.de},termino.is.null`)
        .order("inicio")
        .order("id")
        .range(de, ate)
    ).catch(() => []),
    lerEmLotesPorIds<Linha & { autorizado: boolean | null }>(ids, (fatia, de, ate) =>
      admin
        .from("pessoal_ferias_gozo")
        .select("id, funcionario_id, inicio, termino, autorizado")
        .eq("emp_proprietaria_id", emp)
        .in("funcionario_id", fatia)
        .lte("inicio", p.ate)
        .gte("termino", p.de)
        .order("inicio")
        .order("id")
        .range(de, ate)
    ).catch(() => []),
  ])
  for (const f of ferias) if (f.autorizado !== false) marcar(f.funcionario_id, f.inicio, f.termino, "Férias")
  for (const a of ausencias) marcar(a.funcionario_id, a.inicio, a.termino, a.motivo?.trim() || "Ausência")
  return mapa
}

function feriadosDoPeriodo(p: Periodo): Set<string> {
  return new Set([...feriadosNacionais(Number(p.de.slice(0, 4)))].filter((d) => d >= p.de && d <= p.ate))
}

async function nomes(ids: string[]): Promise<Map<string, string>> {
  const admin = await createAdminClient()
  const linhas = await lerEmLotesPorIds<{ id: string; nome_completo: string | null; nome_guerra: string | null }>(
    ids,
    (fatia, de, ate) => admin.from("usuarios").select("id, nome_completo, nome_guerra").in("id", fatia).order("id").range(de, ate)
  )
  return new Map(linhas.map((u) => [u.id, u.nome_completo ?? u.nome_guerra ?? "(sem nome)"]))
}

/** Primeiro registro de uso da entidade (o relatório só vale daí em diante). */
async function registrandoDesde(): Promise<string | null> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data } = await admin
    .from("pessoal_uso_painel")
    .select("inicio")
    .eq("emp_proprietaria_id", emp)
    .order("inicio", { ascending: true })
    .limit(1)
    .maybeSingle()
  return data?.inicio ? String(data.inicio) : null
}

export type LinhaUsoFora = { usuarioId: string; nome: string; jornada: string; resumo: ResumoUso }

export type UsoForaDoMes = {
  disponivel: boolean
  competencia: string
  linhas: LinhaUsoFora[]
  desde: string | null
}

/** Quem tem jornada vinculada, com o uso do mês dentro e fora do expediente. */
export async function usoForaDoExpediente(competencia: string): Promise<UsoForaDoMes> {
  const p = periodoDoMes(competencia)
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const vinculos = await lerEmLotes<{ funcionario_id: string }>((de, ate) =>
    admin.from("pessoal_jornada_funcionarios").select("id, funcionario_id").eq("emp_proprietaria_id", emp).order("id").range(de, ate)
  ).catch(() => [])
  const ids = [...new Set(vinculos.map((v) => v.funcionario_id).filter(Boolean))]
  const blocos = await blocosDoPeriodo(ids, p)
  if (!blocos) return { disponivel: false, competencia, linhas: [], desde: null }
  const [jornadas, afast, nomesMap, desde] = await Promise.all([
    jornadasVinculadas(ids),
    afastamentosDoPeriodo(ids, p),
    nomes(ids),
    registrandoDesde(),
  ])
  const feriados = feriadosDoPeriodo(p)
  const linhas = ids
    .filter((id) => jornadas.has(id))
    .map((id) => {
      const j = jornadas.get(id)!
      const dias = apurarUso(blocos.get(id) ?? [], j.dias, {
        feriados,
        afastamentos: afast.get(id) ?? new Map(),
      }).filter((d) => d.data >= p.de && d.data <= p.ate)
      return { usuarioId: id, nome: nomesMap.get(id) ?? "(sem nome)", jornada: j.nome, resumo: resumirUso(dias) }
    })
    .sort((a, b) => b.resumo.considerado - a.resumo.considerado || b.resumo.foraTotal - a.resumo.foraTotal || a.nome.localeCompare(b.nome, "pt-BR"))
  return { disponivel: true, competencia, linhas, desde }
}

export type UsoForaDoFuncionario = {
  disponivel: boolean
  nome: string
  jornada: JornadaVinculada | null
  dias: DiaUso[]
  resumo: ResumoUso
}

/** O mês de uma pessoa, dia a dia, com os trechos de uso. */
export async function usoForaDoFuncionario(usuarioId: string, competencia: string): Promise<UsoForaDoFuncionario> {
  const p = periodoDoMes(competencia)
  const [blocos, jornadas, afast, nomesMap] = await Promise.all([
    blocosDoPeriodo([usuarioId], p),
    jornadasVinculadas([usuarioId]),
    afastamentosDoPeriodo([usuarioId], p),
    nomes([usuarioId]),
  ])
  const jornada = jornadas.get(usuarioId) ?? null
  const dias = jornada
    ? apurarUso(blocos?.get(usuarioId) ?? [], jornada.dias, {
        feriados: feriadosDoPeriodo(p),
        afastamentos: afast.get(usuarioId) ?? new Map(),
      }).filter((d) => d.data >= p.de && d.data <= p.ate)
    : []
  return {
    disponivel: blocos !== null,
    nome: nomesMap.get(usuarioId) ?? "(sem nome)",
    jornada,
    dias,
    resumo: resumirUso(dias),
  }
}
