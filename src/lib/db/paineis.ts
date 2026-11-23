import "server-only"

import { hojeSP, lerEmLotes, nomesDosUsuarios, texto } from "@/lib/db/comum"
import { listarDepartamentosCompletos } from "@/lib/db/departamentos"
import { listarProjetos } from "@/lib/db/projetos"
import { somarDias } from "@/lib/deliberacoes-constantes"
import { semanasAte, tempoMedioDias, vazaoPorSemana } from "@/lib/ferramentas-acompanhamento"
import { segundaDaSemana } from "@/lib/nucleo-constantes"
import { type NivelProjeto } from "@/lib/projetos-constantes"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * PAINÉIS POR DEPARTAMENTO (Onda 4, 23/11/2026). O trabalho de um
 * departamento é o das pessoas dele: tarefas e demandas cujo responsável é
 * integrante do departamento (quem está em dois conta nos dois). Projetos
 * entram quando têm tarefa aberta ou recente (ou a demanda do projeto) com
 * alguém do departamento. Sem tabela própria: tudo vem do que já existe.
 */

export const SEMANAS_PAINEL = 8
/** O tempo médio olha as concluídas nas últimas tantas semanas. */
const SEMANAS_TEMPO_MEDIO = 4

export type DepartamentoFiltro = { id: string; nome: string; integrantes: string[] }

/** Departamentos ativos com os ids das pessoas (filtros e painéis). */
export async function departamentosComIntegrantes(): Promise<DepartamentoFiltro[]> {
  const deptos = await listarDepartamentosCompletos()
  return deptos
    .filter((d) => !d.legado)
    .map((d) => ({ id: d.id, nome: d.nome, integrantes: d.integrantes.map((i) => i.usuarioId) }))
}

type TarefaPainel = {
  id: string
  responsavelId: string | null
  concluido: boolean
  criadaEm: string | null
  concluidaEm: string | null
  prazo: string | null
  projetoId: string | null
}

function minData(a: string | null, b: string): string | null {
  return a && a.slice(0, 10) > b ? b : a
}

type DemandaPainel = { id: string; responsavelId: string | null; situacao: string | null; prazo: string | null; projetoId: string | null }

const DIA_SP = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" })

/** O dia em São Paulo de um carimbo de data e hora (created_at vem em UTC). */
function diaSP(carimbo: string | null): string | null {
  if (!carimbo) return null
  const d = new Date(carimbo)
  return Number.isNaN(d.getTime()) ? carimbo.slice(0, 10) : DIA_SP.format(d)
}

/** Abertas e as que mexeram nas últimas semanas (criadas ou concluídas). */
async function tarefasDoPainel(desde: string, hoje: string): Promise<TarefaPainel[]> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const linhas = await lerEmLotes<Record<string, unknown>>((de, ate) =>
    admin
      .from("demandas_check_tarefas")
      .select("id, demandado_id, concluido, created_at, data_entrega, data_prazo_entrega, projeto_id")
      .eq("emp_proprietaria_id", emp)
      .or(`concluido.is.null,concluido.eq.false,created_at.gte.${desde},data_entrega.gte.${desde}`)
      .order("id")
      .range(de, ate)
  )
  return linhas.map((t) => ({
    id: String(t.id),
    responsavelId: texto(t.demandado_id),
    concluido: t.concluido === true,
    criadaEm: diaSP(texto(t.created_at)),
    // A conclusão grava o dia em UTC: à noite cai no dia seguinte; não passa de hoje.
    concluidaEm: t.concluido === true ? minData(texto(t.data_entrega), hoje) : null,
    prazo: texto(t.data_prazo_entrega),
    projetoId: texto(t.projeto_id),
  }))
}

async function demandasAbertas(): Promise<DemandaPainel[]> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const linhas = await lerEmLotes<Record<string, unknown>>((de, ate) =>
    admin
      .from("demandas")
      .select("id, membro_responsavel_id, situacao, prazo, projeto_id")
      .eq("emp_proprietaria_id", emp)
      .neq("situacao", "Feito")
      .order("id")
      .range(de, ate)
  )
  return linhas.map((d) => ({
    id: String(d.id),
    responsavelId: texto(d.membro_responsavel_id),
    situacao: texto(d.situacao),
    prazo: texto(d.prazo),
    projetoId: texto(d.projeto_id),
  }))
}

export type PessoaPainel = { id: string | null; nome: string; abertas: number; atrasadas: number }

export type ProjetoPainel = { id: string; titulo: string; nivel: NivelProjeto; motivos: string[] }

export type ResumoDepartamento = {
  id: string
  nome: string
  pessoas: number
  abertas: number
  atrasadas: number
  concluidas4: number
  tempoMedio: number | null
}

export type Painel = {
  departamentos: { id: string; nome: string }[]
  atual: { id: string; nome: string; pessoas: number } | null
  abertas: number
  atrasadas: number
  concluidasSemana: number
  concluidasSemanaAnterior: number
  tempoMedio: number | null
  tempoMedioAnterior: number | null
  semanas: string[]
  criadas: number[]
  concluidas: number[]
  porPessoa: PessoaPainel[]
  demandas: { aFazer: number; fazendo: number; atrasadas: number }
  projetos: ProjetoPainel[]
  /** Só na visão da entidade inteira: uma linha por departamento. */
  comparativo: ResumoDepartamento[]
}

function contas(tarefas: TarefaPainel[], hoje: string) {
  const abertas = tarefas.filter((t) => !t.concluido)
  const atrasadas = abertas.filter((t) => t.prazo && t.prazo < hoje)
  const inicio4 = somarDias(segundaDaSemana(hoje), -7 * (SEMANAS_TEMPO_MEDIO - 1))
  const concluidas4 = tarefas.filter((t) => t.concluidaEm && t.concluidaEm.slice(0, 10) >= inicio4).length
  return { abertas, atrasadas, concluidas4, tempoMedio: tempoMedioDias(tarefas, inicio4), inicio4 }
}

export async function painelDoDepartamento(departamentoId: string | null): Promise<Painel> {
  const hoje = hojeSP()
  const semanas = semanasAte(hoje, SEMANAS_PAINEL)
  const desde = semanas[0]
  const [deptos, todasTarefas, todasDemandas, projetos] = await Promise.all([
    departamentosComIntegrantes(),
    tarefasDoPainel(desde, hoje),
    demandasAbertas(),
    listarProjetos({ situacao: "andamento" }),
  ])
  const depto = departamentoId ? (deptos.find((d) => d.id === departamentoId) ?? null) : null
  const doDepto = depto ? new Set(depto.integrantes) : null
  const pertence = (id: string | null) => (doDepto ? !!id && doDepto.has(id) : true)

  const tarefas = todasTarefas.filter((t) => pertence(t.responsavelId))
  const demandas = todasDemandas.filter((d) => pertence(d.responsavelId))
  const { abertas, atrasadas, tempoMedio, inicio4 } = contas(tarefas, hoje)
  const tempoMedioAnterior = (() => {
    const de = somarDias(inicio4, -7 * SEMANAS_TEMPO_MEDIO)
    return tempoMedioDias(
      tarefas.filter((t) => t.concluidaEm && t.concluidaEm.slice(0, 10) < inicio4),
      de
    )
  })()
  const { criadas, concluidas } = vazaoPorSemana(tarefas, semanas)

  // Abertas e atrasadas por pessoa (as do departamento, ou todas).
  const porId = new Map<string, PessoaPainel>()
  for (const t of abertas) {
    const chave = t.responsavelId ?? ""
    const p = porId.get(chave) ?? { id: t.responsavelId, nome: "", abertas: 0, atrasadas: 0 }
    p.abertas += 1
    if (t.prazo && t.prazo < hoje) p.atrasadas += 1
    porId.set(chave, p)
  }
  const nomes = await nomesDosUsuarios([...porId.keys()].filter(Boolean))
  const porPessoa = [...porId.values()]
    .map((p) => ({ ...p, nome: p.id ? (nomes.get(p.id) ?? "Alguém que saiu") : "Sem responsável" }))
    .sort((a, b) => b.atrasadas - a.atrasadas || b.abertas - a.abertas || a.nome.localeCompare(b.nome, "pt-BR"))

  // Projetos do departamento: com tarefa (aberta ou recente) ou demanda do projeto de alguém dele.
  const projetosDoDepto = new Set<string>([
    ...tarefas.map((t) => t.projetoId).filter((v): v is string => !!v),
    ...demandas.map((d) => d.projetoId).filter((v): v is string => !!v),
  ])
  const projetosPainel = projetos
    .filter((p) => !doDepto || projetosDoDepto.has(p.id))
    .map((p) => ({ id: p.id, titulo: p.titulo ?? "(sem título)", nivel: p.situacao.nivel, motivos: p.situacao.motivos }))

  const seg = segundaDaSemana(hoje)
  const segAnterior = somarDias(seg, -7)
  const comparativo: ResumoDepartamento[] = depto
    ? []
    : deptos
        .map((d) => {
          const ids = new Set(d.integrantes)
          const ts = todasTarefas.filter((t) => t.responsavelId && ids.has(t.responsavelId))
          const c = contas(ts, hoje)
          return {
            id: d.id,
            nome: d.nome,
            pessoas: d.integrantes.length,
            abertas: c.abertas.length,
            atrasadas: c.atrasadas.length,
            concluidas4: c.concluidas4,
            tempoMedio: c.tempoMedio,
          }
        })
        .filter((d) => d.pessoas > 0)
        .sort((a, b) => b.atrasadas - a.atrasadas || b.abertas - a.abertas || a.nome.localeCompare(b.nome, "pt-BR"))

  return {
    departamentos: deptos.map((d) => ({ id: d.id, nome: d.nome })),
    atual: depto ? { id: depto.id, nome: depto.nome, pessoas: depto.integrantes.length } : null,
    abertas: abertas.length,
    atrasadas: atrasadas.length,
    concluidasSemana: tarefas.filter((t) => t.concluidaEm && t.concluidaEm.slice(0, 10) >= seg).length,
    concluidasSemanaAnterior: tarefas.filter(
      (t) => t.concluidaEm && t.concluidaEm.slice(0, 10) >= segAnterior && t.concluidaEm.slice(0, 10) < seg
    ).length,
    tempoMedio,
    tempoMedioAnterior,
    semanas,
    criadas,
    concluidas,
    porPessoa,
    demandas: {
      aFazer: demandas.filter((d) => d.situacao === "A fazer").length,
      fazendo: demandas.filter((d) => d.situacao === "Fazendo").length,
      atrasadas: demandas.filter((d) => d.prazo && d.prazo < hoje).length,
    },
    projetos: projetosPainel,
    comparativo,
  }
}
