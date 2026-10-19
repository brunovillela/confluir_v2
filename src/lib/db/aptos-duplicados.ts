import "server-only"

import { cpfConfiavel } from "@/lib/cpf"
import { lerEmLotes } from "@/lib/db/comum"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"
import { semAcento } from "@/lib/texto"

/**
 * APTOS DUPLICADOS NA RODADA (fase 2 do plano de 16/10/2026).
 *
 * Na assembleia da SLB, 11 pessoas estavam duas vezes na lista (mesmo nome e
 * e-mail, sem CPF). O voto de uma marcava as duas linhas, e a participação
 * mostrava 703 votantes para 692 votos. Aqui se acha quem está repetido e se
 * mantém uma linha só de cada pessoa.
 *
 * Mesma pessoa = mesmo CPF; ou mesmo e-mail sem CPFs diferentes (dois CPFs
 * distintos no mesmo e-mail são duas pessoas — só se juntam as linhas sem CPF
 * com o mesmo nome). Só se juntam linhas da mesma assembleia (ou ambas da
 * rodada inteira).
 */

type Linha = {
  id: string
  nome_completo: string | null
  cpf: string | null
  matricula: string | null
  email_corporativo: string | null
  telefone?: string | null
  email_contato?: string | null
  assembleia_id: string | null
  hora_voto: string | null
  presenca_em?: string | null
  comprovante_codigo?: string | null
  aviso_email_em?: string | null
  aviso_email_erro?: string | null
  created_at: string | null
}

export type AptoDuplicado = {
  id: string
  nome: string | null
  cpf: string | null
  matricula: string | null
  email: string | null
  votou: boolean
  comprovante: boolean
}

export type GrupoDuplicado = {
  /** A linha que fica (votou com comprovante > votou > tem CPF > avisada > mais antiga). */
  manter: AptoDuplicado
  /** As repetidas que saem. */
  remover: AptoDuplicado[]
  /** Repetidas que ficam (comprovante próprio — o código precisa continuar valendo). */
  ficam: AptoDuplicado[]
}

const nomeNorm = (n: string | null) => semAcento(n ?? "").toUpperCase().replace(/\s+/g, " ").trim()

async function lerAptos(rodadaId: string): Promise<Linha[]> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const ler = (colunas: string) =>
    lerEmLotes<Linha>((de, ate) =>
      admin
        .from("voto_assembleias_aptos")
        .select(colunas)
        .eq("emp_proprietaria_id", emp)
        .eq("rod_assembleia_id", rodadaId)
        .order("id")
        .range(de, ate)
    )
  try {
    return await ler(
      "id, nome_completo, cpf, matricula, email_corporativo, telefone, email_contato, assembleia_id, hora_voto, presenca_em, comprovante_codigo, aviso_email_em, aviso_email_erro, created_at"
    )
  } catch {
    // Antes dos SQLs de mesários/comprovante/aviso, só o essencial.
    return ler("id, nome_completo, cpf, matricula, email_corporativo, assembleia_id, hora_voto, created_at")
  }
}

function prioridade(l: Linha): number[] {
  return [
    l.hora_voto && l.comprovante_codigo ? 1 : 0,
    l.hora_voto ? 1 : 0,
    l.presenca_em ? 1 : 0,
    cpfConfiavel(l.cpf) ? 1 : 0,
    l.aviso_email_em && !l.aviso_email_erro ? 1 : 0,
  ]
}

function comparar(a: Linha, b: Linha): number {
  const pa = prioridade(a)
  const pb = prioridade(b)
  for (let i = 0; i < pa.length; i++) if (pa[i] !== pb[i]) return pb[i] - pa[i]
  return (a.created_at ?? "").localeCompare(b.created_at ?? "")
}

function resumo(l: Linha): AptoDuplicado {
  return {
    id: l.id,
    nome: l.nome_completo,
    cpf: l.cpf,
    matricula: l.matricula,
    email: l.email_corporativo,
    votou: Boolean(l.hora_voto),
    comprovante: Boolean(l.comprovante_codigo),
  }
}

/** Agrupa as linhas da mesma pessoa (union-find). */
function agrupar(linhas: Linha[]): Linha[][] {
  const pai = new Map<string, string>()
  const achar = (x: string): string => {
    let r = x
    while (pai.get(r) !== r) r = pai.get(r) as string
    pai.set(x, r)
    return r
  }
  const unir = (a: string, b: string) => {
    const ra = achar(a)
    const rb = achar(b)
    if (ra !== rb) pai.set(ra, rb)
  }
  for (const l of linhas) pai.set(l.id, l.id)

  const juntarPor = (chave: (l: Linha) => string | null) => {
    const porChave = new Map<string, Linha[]>()
    for (const l of linhas) {
      const k = chave(l)
      if (k) porChave.set(k, [...(porChave.get(k) ?? []), l])
    }
    return porChave
  }
  const escopo = (l: Linha) => l.assembleia_id ?? "rodada"

  for (const grupo of juntarPor((l) => {
    const c = cpfConfiavel(l.cpf)
    return c ? `${escopo(l)}|${c}` : null
  }).values()) {
    for (const l of grupo.slice(1)) unir(grupo[0].id, l.id)
  }

  for (const grupo of juntarPor((l) => {
    const e = l.email_corporativo?.trim().toLowerCase()
    return e ? `${escopo(l)}|${e}` : null
  }).values()) {
    if (grupo.length < 2) continue
    const cpfs = new Set(grupo.map((l) => cpfConfiavel(l.cpf)).filter(Boolean))
    if (cpfs.size <= 1) {
      for (const l of grupo.slice(1)) unir(grupo[0].id, l.id)
    } else {
      // CPFs diferentes no mesmo e-mail: só as linhas sem CPF com o mesmo nome.
      const semCpf = new Map<string, Linha[]>()
      for (const l of grupo) {
        if (cpfConfiavel(l.cpf)) continue
        const n = nomeNorm(l.nome_completo)
        if (n) semCpf.set(n, [...(semCpf.get(n) ?? []), l])
      }
      for (const g of semCpf.values()) for (const l of g.slice(1)) unir(g[0].id, l.id)
    }
  }

  const grupos = new Map<string, Linha[]>()
  for (const l of linhas) {
    const r = achar(l.id)
    grupos.set(r, [...(grupos.get(r) ?? []), l])
  }
  return [...grupos.values()].filter((g) => g.length > 1)
}

function montarGrupos(linhas: Linha[]): { grupo: GrupoDuplicado; linhas: Linha[] }[] {
  return agrupar(linhas).map((g) => {
    const ordem = [...g].sort(comparar)
    const [manter, ...resto] = ordem
    return {
      linhas: ordem,
      grupo: {
        manter: resumo(manter),
        remover: resto.filter((l) => !l.comprovante_codigo).map(resumo),
        ficam: resto.filter((l) => l.comprovante_codigo).map(resumo),
      },
    }
  })
}

/** Grupos de aptos repetidos na rodada. */
export async function aptosDuplicados(rodadaId: string): Promise<GrupoDuplicado[]> {
  try {
    return montarGrupos(await lerAptos(rodadaId)).map((x) => x.grupo)
  } catch {
    return []
  }
}

/**
 * Mantém uma linha de cada pessoa: completa a que fica com o que faltava nela
 * (CPF, matrícula, e-mail, telefone) e apaga as repetidas — menos as que têm
 * comprovante próprio. Quem votou continua constando como votante (a linha que
 * fica é a que votou).
 */
export async function unificarDuplicados(
  rodadaId: string
): Promise<{ unificados: number; mantidos: number; erro?: string }> {
  let grupos: { grupo: GrupoDuplicado; linhas: Linha[] }[]
  try {
    grupos = montarGrupos(await lerAptos(rodadaId))
  } catch (e) {
    return { unificados: 0, mantidos: 0, erro: `Falha ao ler os aptos: ${e instanceof Error ? e.message : "?"}` }
  }
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  let unificados = 0
  let mantidos = 0
  for (const { grupo, linhas } of grupos) {
    const manter = linhas[0]
    const saem = linhas.filter((l) => grupo.remover.some((r) => r.id === l.id))
    mantidos += grupo.ficam.length

    // Completa a linha que fica com o que só as repetidas tinham.
    const completar: Record<string, unknown> = {}
    for (const campo of ["cpf", "matricula", "email_corporativo", "telefone", "email_contato"] as const) {
      if (manter[campo]) continue
      const valor = saem.find((l) => l[campo])?.[campo]
      if (valor) completar[campo] = valor
    }
    // Uma repetida que votou (sem comprovante) e a que fica não: leva a participação.
    const votou = saem.find((l) => l.hora_voto)
    const levaParticipacao = !manter.hora_voto && votou ? votou : null
    if (levaParticipacao) completar.hora_voto = levaParticipacao.hora_voto
    if (Object.keys(completar).length) {
      // A participação MUDA de linha: a repetida solta antes, senão o índice
      // único por (rodada, CPF) com voto (dossiê C-4) recusa a que fica.
      if (levaParticipacao) {
        await admin
          .from("voto_assembleias_aptos")
          .update({ hora_voto: null })
          .eq("id", levaParticipacao.id)
          .eq("emp_proprietaria_id", emp)
      }
      const { error } = await admin
        .from("voto_assembleias_aptos")
        .update(completar)
        .eq("id", manter.id)
        .eq("emp_proprietaria_id", emp)
      if (error) {
        if (levaParticipacao) {
          await admin
            .from("voto_assembleias_aptos")
            .update({ hora_voto: levaParticipacao.hora_voto })
            .eq("id", levaParticipacao.id)
            .eq("emp_proprietaria_id", emp)
        }
        mantidos += saem.length
        continue
      }
    }

    for (const l of saem) {
      const { error } = await admin
        .from("voto_assembleias_aptos")
        .delete()
        .eq("id", l.id)
        .eq("emp_proprietaria_id", emp)
        .eq("rod_assembleia_id", rodadaId)
      // Referenciada em outra tabela (terminal, presença): fica.
      if (error) mantidos++
      else unificados++
    }
  }
  return { unificados, mantidos }
}
