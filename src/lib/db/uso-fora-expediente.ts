import "server-only"

import { esquemaAusente, lerEmLotes, lerEmLotesPorIds } from "@/lib/db/comum"
import { jornadasVinculadas, type JornadaVinculada } from "@/lib/db/pessoal-sst"
import { feriadosNacionais } from "@/lib/feriados"
import type { MarcacoesEspelho } from "@/lib/ponto-marcacoes-ajuste"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"
import {
  JANELA_MOTIVO_DIAS,
  MOTIVOS_USO,
  TOLERANCIA_DIARIA_MIN,
  podeInformarMotivo,
  apurarUso,
  avisoDoMes,
  temAvisoUso,
  type AvisoUsoMes,
  diasDoPeriodo,
  resumirUso,
  rotuloMotivoUso,
  textoUsoSemMarcacao,
  usoSemMarcacao,
  type BlocoUso,
  type DiaUso,
  type JustificativaUso,
  type MotivoUso,
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

export type LinhaUsoFora = {
  usuarioId: string
  nome: string
  jornada: string
  resumo: ResumoUso
  /** Dias com uso fora em que o funcionário informou o motivo. */
  diasComMotivo: number
  /** Acima do limite do mês ou uso em férias e afastamentos. */
  aviso: AvisoUsoMes
}

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
  const [jornadas, afast, nomesMap, desde, motivos] = await Promise.all([
    jornadasVinculadas(ids),
    afastamentosDoPeriodo(ids, p),
    nomes(ids),
    registrandoDesde(),
    justificativasDoPeriodo(ids, p),
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
      const m = motivos.get(id)
      return {
        usuarioId: id,
        nome: nomesMap.get(id) ?? "(sem nome)",
        jornada: j.nome,
        resumo: resumirUso(dias),
        diasComMotivo: dias.filter((d) => d.foraTotal > 0 && m?.has(d.data)).length,
        aviso: avisoDoMes(dias),
      }
    })
    .sort((a, b) => b.resumo.considerado - a.resumo.considerado || b.resumo.foraTotal - a.resumo.foraTotal || a.nome.localeCompare(b.nome, "pt-BR"))
  return { disponivel: true, competencia, linhas, desde }
}

export type AvisosDeUso = { total: number; acimaDoLimite: number; emAfastamento: number }

/**
 * Para a caixa de entrada: quantos funcionários, no mês corrente, passaram do
 * limite de uso fora do expediente ou usaram o sistema em férias ou
 * afastamento. null = não deu para contar (sem a tabela).
 */
export async function avisosDeUsoDoMes(): Promise<AvisosDeUso | null> {
  const dados = await usoForaDoExpediente(hojeEmSaoPaulo().slice(0, 7))
  if (!dados.disponivel) return null
  const comAviso = dados.linhas.filter((l) => temAvisoUso(l.aviso))
  return {
    total: comAviso.length,
    acimaDoLimite: comAviso.filter((l) => l.aviso.acimaDoLimite).length,
    emAfastamento: comAviso.filter((l) => l.aviso.diasEmAfastamento > 0).length,
  }
}

export type UsoForaDoFuncionario = {
  disponivel: boolean
  nome: string
  jornada: JornadaVinculada | null
  dias: DiaUso[]
  resumo: ResumoUso
  /** Motivo informado pelo funcionário: data → "Combinado com a chefia: …". */
  motivos: Map<string, string>
  /** Motivo como foi gravado (para o formulário de troca no Meu perfil). */
  justificativas: Map<string, JustificativaUso>
}

/** O mês de uma pessoa, dia a dia, com os trechos de uso. */
export async function usoForaDoFuncionario(usuarioId: string, competencia: string): Promise<UsoForaDoFuncionario> {
  const p = periodoDoMes(competencia)
  const [blocos, jornadas, afast, nomesMap, motivos] = await Promise.all([
    blocosDoPeriodo([usuarioId], p),
    jornadasVinculadas([usuarioId]),
    afastamentosDoPeriodo([usuarioId], p),
    nomes([usuarioId]),
    justificativasDoPeriodo([usuarioId], p),
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
    motivos: new Map([...(motivos.get(usuarioId) ?? new Map<string, JustificativaUso>())].map(([d, j]) => [d, rotuloMotivoUso(j)])),
    justificativas: motivos.get(usuarioId) ?? new Map<string, JustificativaUso>(),
  }
}

// ── Motivo informado pelo funcionário ────────────────────────────────────────

/** Motivos do período: usuarioId → (data → motivo). Vazio sem a tabela. */
async function justificativasDoPeriodo(ids: string[], p: Periodo): Promise<Map<string, Map<string, JustificativaUso>>> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const mapa = new Map<string, Map<string, JustificativaUso>>()
  const linhas = await lerEmLotesPorIds<{ usuario_id: string; data: string; motivo: MotivoUso; detalhe: string | null }>(
    ids,
    (fatia, de, ate) =>
      admin
        .from("pessoal_uso_justificativas")
        .select("id, usuario_id, data, motivo, detalhe")
        .eq("emp_proprietaria_id", emp)
        .in("usuario_id", fatia)
        .gte("data", p.de)
        .lte("data", p.ate)
        .order("data")
        .order("id")
        .range(de, ate)
  ).catch(() => [])
  for (const l of linhas) {
    const m = mapa.get(l.usuario_id) ?? new Map<string, JustificativaUso>()
    m.set(String(l.data).slice(0, 10), { motivo: l.motivo, detalhe: l.detalhe })
    mapa.set(l.usuario_id, m)
  }
  return mapa
}

/** Hoje (AAAA-MM-DD) no horário de São Paulo. */
export function hojeEmSaoPaulo(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date())
}

/** O motivo que a pessoa já informou hoje, ou null. "indisponivel" = sem a tabela. */
export async function motivoDeHoje(usuarioId: string): Promise<JustificativaUso | null | "indisponivel"> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data, error } = await admin
    .from("pessoal_uso_justificativas")
    .select("motivo, detalhe")
    .eq("emp_proprietaria_id", emp)
    .eq("usuario_id", usuarioId)
    .eq("data", hojeEmSaoPaulo())
    .maybeSingle()
  if (error) return esquemaAusente(error) ? "indisponivel" : null
  return data ? { motivo: data.motivo as MotivoUso, detalhe: data.detalhe ?? null } : null
}

/** Grava (ou troca) o motivo de hoje da pessoa. */
export async function salvarMotivoDeHoje(usuarioId: string, motivo: string, detalhe: string): Promise<string | null> {
  return salvarMotivoDoDia(usuarioId, hojeEmSaoPaulo(), motivo, detalhe)
}

/** Grava (ou troca) o motivo de um dia, dentro da janela (JANELA_MOTIVO_DIAS). */
export async function salvarMotivoDoDia(usuarioId: string, data: string, motivo: string, detalhe: string): Promise<string | null> {
  if (!MOTIVOS_USO.some((m) => m.chave === motivo)) return "Escolha o motivo."
  if (!podeInformarMotivo(data, hojeEmSaoPaulo())) return `O motivo só pode ser informado para hoje ou para os últimos ${JANELA_MOTIVO_DIAS} dias.`
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { error } = await admin.from("pessoal_uso_justificativas").upsert(
    {
      emp_proprietaria_id: emp,
      usuario_id: usuarioId,
      data,
      motivo,
      detalhe: detalhe.trim().slice(0, 300) || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "usuario_id,data" }
  )
  return error ? "Não foi possível salvar: " + error.message : null
}

// ── Cruzamento com o espelho de ponto ────────────────────────────────────────

export type AlertaUso = { texto: string; motivo: string | null }

/** Mês mais frequente nas datas do espelho (a competência do registro). */
function competenciaDasMarcacoes(m: MarcacoesEspelho | null): string | null {
  const conta = new Map<string, number>()
  for (const d of m?.dias ?? []) if (/^\d{4}-\d{2}/.test(d.data)) conta.set(d.data.slice(0, 7), (conta.get(d.data.slice(0, 7)) ?? 0) + 1)
  return [...conta].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
}

/**
 * Para cada registro de ponto (na mesma ordem), os dias do mês em que o
 * funcionário usou o sistema fora do horário sem marcação que cubra o uso
 * (data → alerta). Dia já conferido pela gestão não entra. Sem a tabela de
 * uso, ou sem jornada vinculada, o mapa vem vazio.
 */
export async function alertasDeUsoNasMarcacoes(
  regs: { funcionarioId: string | null; marcacoes: MarcacoesEspelho | null }[]
): Promise<Map<string, AlertaUso>[]> {
  const saida = regs.map(() => new Map<string, AlertaUso>())
  const porComp = new Map<string, number[]>()
  regs.forEach((r, i) => {
    const c = r.funcionarioId ? competenciaDasMarcacoes(r.marcacoes) : null
    if (c) porComp.set(c, [...(porComp.get(c) ?? []), i])
  })
  for (const [comp, idx] of porComp) {
    const p = periodoDoMes(comp)
    const ids = [...new Set(idx.map((i) => regs[i].funcionarioId!))]
    const blocos = await blocosDoPeriodo(ids, p)
    if (!blocos || blocos.size === 0) continue
    const comUso = ids.filter((id) => blocos.has(id))
    const [jornadas, afast, motivos] = await Promise.all([
      jornadasVinculadas(comUso),
      afastamentosDoPeriodo(comUso, p),
      justificativasDoPeriodo(comUso, p),
    ])
    const feriados = feriadosDoPeriodo(p)
    for (const i of idx) {
      const { funcionarioId, marcacoes } = regs[i]
      const j = jornadas.get(funcionarioId!)
      if (!j || !blocos.has(funcionarioId!)) continue
      const dias = apurarUso(blocos.get(funcionarioId!)!, j.dias, {
        feriados,
        afastamentos: afast.get(funcionarioId!) ?? new Map(),
      })
      for (const d of dias) {
        if (d.foraTotal === 0 || d.data < p.de || d.data > p.ate) continue
        const doEspelho = marcacoes?.dias.find((x) => x.data === d.data)
        if (doEspelho?.conferido || marcacoes?.usoConferido?.includes(d.data)) continue
        const r = usoSemMarcacao(d, doEspelho?.marcacoes ?? [])
        if (r.minutos <= TOLERANCIA_DIARIA_MIN) continue
        const m = motivos.get(funcionarioId!)?.get(d.data)
        saida[i].set(d.data, { texto: textoUsoSemMarcacao(r), motivo: m ? rotuloMotivoUso(m) : null })
      }
    }
  }
  return saida
}

