import "server-only"

import type { SessaoPainel } from "@/lib/auth"
import { hojeSP, lerEmLotes } from "@/lib/db/comum"
import { alcadaDoUsuario, derivarSituacao, normalizarOrdens, type OrdemDoProcesso } from "@/lib/db/compras"
import { listarContratos, type ContratoLista } from "@/lib/db/contratos"
import { listarDepartamentosCompletos, pessoasParaDepartamento } from "@/lib/db/departamentos"
import { listarSolicitacoesDiaria, type SolicitacaoDiaria } from "@/lib/db/diarias"
import { listarFaltas, type FaltaJustificada } from "@/lib/db/faltas"
import { listarPeriodosFerias, somarDias } from "@/lib/db/ferias"
import { orcadoRealizado, type OrcadoRealizado } from "@/lib/db/financeiro-gerencial"
import { gozoAguardandoAutorizacao } from "@/lib/ferias-painel"
import { podeAcessar } from "@/lib/permissoes"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * ÁREA DO COORDENADOR (06/10/2026) — a vista de quem coordena um departamento
 * (`empresa_departamentos.coordenador_id`): os pedidos da equipe para decidir
 * (férias, faltas justificadas, diárias), as compras e ordens do
 * departamento, o orçado × realizado dos centros de custo dele (só
 * acompanhamento — quem orça é o Financeiro), os contratos vigentes e a
 * equipe. A equipe são os integrantes do departamento; o coordenador decide
 * os pedidos dos FUNCIONÁRIOS dela, nunca os próprios.
 */

export type DepartamentoCoordenado = { id: string; nome: string }

/** Departamentos (não legados) que a pessoa coordena. */
export async function departamentosCoordenados(usuarioId: string): Promise<DepartamentoCoordenado[]> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("empresa_departamentos")
    .select("id, departamento, legado")
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("coordenador_id", usuarioId)
  if (error) return []
  return (data ?? [])
    .filter((d) => d.legado !== true)
    .map((d) => ({ id: String(d.id), nome: String(d.departamento ?? "(sem nome)") }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
}

export type MembroEquipe = {
  usuarioId: string
  nome: string
  origem: "funcionario" | "diretor" | "outro"
  cargo: string | null
  coordenador: boolean
  /** Em férias hoje (gozo autorizado cobrindo a data). */
  emFeriasAte: string | null
}

export type GozoPendente = {
  gozoId: string
  periodoId: string
  funcionarioId: string
  nome: string
  inicio: string | null
  termino: string | null
  dias: number | null
  abono: boolean
  pedidoEm: string | null
}

export type FeriasProxima = { nome: string; inicio: string; termino: string | null; dias: number | null }

export type CompraDepartamento = {
  id: string
  codigo: string | null
  produto: string | null
  situacao: string
  criadaEm: string | null
}

export type OrdensDepartamento = {
  abertas: (OrdemDoProcesso & { tipo: string | null; podeAvaliar: boolean })[]
  pagasNoAno: { quantidade: number; valor: number }
  ultimasPagas: OrdemDoProcesso[]
}

export type AreaCoordenador = {
  departamento: DepartamentoCoordenado
  outros: DepartamentoCoordenado[]
  equipe: MembroEquipe[]
  pedidos: {
    ferias: GozoPendente[]
    faltas: FaltaJustificada[]
    diarias: SolicitacaoDiaria[]
  }
  feriasProximas: FeriasProxima[]
  compras: CompraDepartamento[]
  ordens: OrdensDepartamento
  orcamento: {
    ano: number
    disponivel: boolean
    linhas: OrcadoRealizado[]
    totalOrcado: number
    totalRealizado: number
    totalEsperado: number
    /** Centros do departamento com gasto no ano e sem orçamento lançado. */
    centrosSemOrcamento: number
  }
  contratos: ContratoLista[]
}

const SITUACOES_ORDEM_ABERTAS = [
  "Aguardando documento fiscal",
  "Em autorização",
  "Aguardando informações",
  "A pagar",
  "Processando",
]

/** Integrantes do departamento (ids de usuário), com o coordenador. */
async function membrosDoDepartamento(deptoId: string): Promise<{ ids: Set<string>; coordenadorId: string | null; nomes: Map<string, string> }> {
  const deptos = await listarDepartamentosCompletos()
  const d = deptos.find((x) => x.id === deptoId)
  const nomes = new Map<string, string>()
  const ids = new Set<string>()
  for (const i of d?.integrantes ?? []) {
    ids.add(i.usuarioId)
    nomes.set(i.usuarioId, i.nome)
  }
  if (d?.coordenadorId) {
    ids.add(d.coordenadorId)
    if (d.coordenadorNome) nomes.set(d.coordenadorId, d.coordenadorNome)
  }
  return { ids, coordenadorId: d?.coordenadorId ?? null, nomes }
}

/**
 * A pessoa coordena o departamento de `funcionarioId` (e não é ela mesma)?
 * Base das ações de decidir — o coordenador só decide pedidos da equipe.
 */
export async function coordenaFuncionario(usuarioId: string, funcionarioId: string | null): Promise<boolean> {
  if (!funcionarioId || funcionarioId === usuarioId) return false
  const deptos = await departamentosCoordenados(usuarioId)
  for (const d of deptos) {
    const { ids } = await membrosDoDepartamento(d.id)
    if (ids.has(funcionarioId)) return true
  }
  return false
}

export async function areaDoCoordenador(sessao: SessaoPainel, deptoId?: string): Promise<AreaCoordenador | null> {
  const uid = String(sessao.usuario.id)
  const deptos = await departamentosCoordenados(uid)
  const departamento = deptos.find((d) => d.id === deptoId) ?? deptos[0]
  if (!departamento) return null

  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const hoje = hojeSP()
  const ano = Number(hoje.slice(0, 4))
  const { ids: membros, coordenadorId, nomes } = await membrosDoDepartamento(departamento.id)

  const [pessoas, periodos, faltas, diarias, comprasRes, ordensRes, pagasRes, orc, centrosRes, contratos] = await Promise.all([
    pessoasParaDepartamento().catch(() => []),
    listarPeriodosFerias().catch(() => []),
    listarFaltas().catch(() => ({ disponivel: false, faltas: [] as FaltaJustificada[] })),
    listarSolicitacoesDiaria().catch(() => ({ disponivel: false, solicitacoes: [] as SolicitacaoDiaria[] })),
    admin
      .from("compras_solicitacoes")
      .select("id, codigo, solicitacao_produto, cancelado, recebido, comprado, em_cotacao, cotacao_termino, created_at")
      .eq("emp_proprietaria_id", emp)
      .eq("solicitacao_departamento_id", departamento.id)
      .eq("cancelado", false)
      .eq("recebido", false)
      .order("created_at", { ascending: false })
      .limit(30),
    admin
      .from("ordens_pagamento")
      .select("*")
      .eq("emp_proprietaria_id", emp)
      .eq("departamento_id", departamento.id)
      .not("excluido", "is", true)
      .in("situacao", SITUACOES_ORDEM_ABERTAS)
      .order("vencimento", { ascending: true, nullsFirst: false })
      .limit(100),
    lerEmLotes<Record<string, unknown>>((de, ate) =>
      admin
        .from("ordens_pagamento")
        .select("*")
        .eq("emp_proprietaria_id", emp)
        .eq("departamento_id", departamento.id)
        .not("excluido", "is", true)
        .eq("situacao", "Paga")
        .gte("data_pagamento", `${ano}-01-01`)
        .order("data_pagamento", { ascending: false })
        .order("id")
        .range(de, ate)
    ).catch(() => [] as Record<string, unknown>[]),
    orcadoRealizado(ano).catch(() => null),
    admin.from("centros_de_custo").select("id").eq("emp_proprietaria_id", emp).eq("departamento_id", departamento.id),
    listarContratos({ situacao: "todos", verSigilosos: false, apoioInstitucional: false, departamentoId: departamento.id }).catch(
      () => [] as ContratoLista[]
    ),
  ])

  // ── Equipe ──────────────────────────────────────────────────────────────
  const porUsuario = new Map(pessoas.filter((p) => p.usuarioId).map((p) => [p.usuarioId as string, p]))
  const emFerias = new Map<string, string>()
  const feriasProximas: FeriasProxima[] = []
  const pendentesFerias: GozoPendente[] = []
  const limite = somarDias(hoje, 60)
  for (const p of periodos) {
    const fid = p.trabalhador_id
    if (!fid || !membros.has(fid)) continue
    for (const g of p.gozos) {
      if (gozoAguardandoAutorizacao(g) && fid !== uid) {
        pendentesFerias.push({
          gozoId: g.id,
          periodoId: p.id,
          funcionarioId: fid,
          nome: p.funcionarioNome ?? nomes.get(fid) ?? "(sem nome)",
          inicio: g.inicio,
          termino: g.termino,
          dias: g.dias,
          abono: g.abono_solicitado === true,
          pedidoEm: g.created_at,
        })
      }
      if (g.autorizado !== true || !g.inicio) continue
      const termino = g.termino ?? g.inicio
      if (g.inicio <= hoje && termino >= hoje) emFerias.set(fid, termino)
      else if (g.inicio > hoje && g.inicio <= limite) {
        feriasProximas.push({ nome: p.funcionarioNome ?? nomes.get(fid) ?? "(sem nome)", inicio: g.inicio, termino: g.termino, dias: g.dias })
      }
    }
  }
  pendentesFerias.sort((a, b) => (a.inicio ?? "").localeCompare(b.inicio ?? ""))
  feriasProximas.sort((a, b) => a.inicio.localeCompare(b.inicio))

  const equipe: MembroEquipe[] = [...membros]
    .map((id) => {
      const p = porUsuario.get(id)
      return {
        usuarioId: id,
        nome: nomes.get(id) ?? p?.nome ?? "(sem nome)",
        origem: p?.origem ?? ("outro" as const),
        cargo: p?.cargo ?? null,
        coordenador: id === coordenadorId,
        emFeriasAte: emFerias.get(id) ?? null,
      }
    })
    .sort((a, b) => Number(b.coordenador) - Number(a.coordenador) || a.nome.localeCompare(b.nome, "pt-BR"))
  const funcionarios = new Set(equipe.filter((m) => m.origem !== "diretor").map((m) => m.usuarioId))

  // ── Pedidos da equipe (funcionários; nunca os do próprio coordenador) ───
  const faltasPendentes = faltas.faltas.filter(
    (f) => f.situacao === "aguardando" && f.funcionarioId && f.funcionarioId !== uid && funcionarios.has(f.funcionarioId)
  )
  const diariasPendentes = diarias.solicitacoes.filter(
    (d) =>
      d.situacao === "aguardando" &&
      d.beneficiarioTipo !== "diretor" &&
      d.funcionario_id !== uid &&
      Boolean(d.funcionario_id && funcionarios.has(d.funcionario_id))
  )

  // ── Compras e ordens ────────────────────────────────────────────────────
  const compras: CompraDepartamento[] = ((comprasRes.data ?? []) as Record<string, unknown>[]).map((c) => ({
    id: String(c.id),
    codigo: (c.codigo as string | null) ?? null,
    produto: (c.solicitacao_produto as string | null) ?? null,
    situacao: derivarSituacao(c),
    criadaEm: (c.created_at as string | null) ?? null,
  }))
  const brutasAbertas = (ordensRes.data ?? []) as Record<string, unknown>[]
  const alcada = alcadaDoUsuario(sessao.permissoes as Record<string, unknown>)
  const avalia = alcada > 0 && podeAcessar(sessao.permissoes, "aquisicoes_avaliacoes")
  const abertas = (await normalizarOrdens(brutasAbertas)).map((o, i) => ({
    ...o,
    tipo: (brutasAbertas[i].tipo as string | null) ?? null,
    podeAvaliar:
      avalia &&
      o.situacao === "Em autorização" &&
      o.valor_inicial_cobranca !== null &&
      o.valor_inicial_cobranca <= alcada,
  }))
  const pagasNoAno = {
    quantidade: pagasRes.length,
    valor: pagasRes.reduce((s, o) => s + Number(o.valor_pago ?? o.valor_inicial_cobranca ?? 0), 0),
  }
  const ultimasPagas = await normalizarOrdens(pagasRes.slice(0, 8))

  // ── Orçado × realizado dos centros do departamento ──────────────────────
  const centrosDepto = new Set(((centrosRes.data ?? []) as { id: string }[]).map((c) => String(c.id)))
  const linhas = (orc?.linhas ?? []).filter((l) => centrosDepto.has(l.centroId))

  // ── Contratos vigentes ──────────────────────────────────────────────────
  const vigentes = contratos.filter((c) => c.vigencia !== "vencido")

  return {
    departamento,
    outros: deptos.filter((d) => d.id !== departamento.id),
    equipe,
    pedidos: { ferias: pendentesFerias, faltas: faltasPendentes, diarias: diariasPendentes },
    feriasProximas,
    compras,
    ordens: { abertas, pagasNoAno, ultimasPagas },
    orcamento: {
      ano,
      disponivel: Boolean(orc?.disponivel && orc.orcamentosDisponiveis),
      linhas,
      totalOrcado: linhas.reduce((s, l) => s + l.orcado, 0),
      totalRealizado: linhas.reduce((s, l) => s + l.realizado, 0),
      totalEsperado: linhas.reduce((s, l) => s + l.esperadoAteAgora, 0),
      centrosSemOrcamento: linhas.filter((l) => l.orcado === 0 && l.realizado > 0).length,
    },
    contratos: vigentes,
  }
}
