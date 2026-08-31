import "server-only"
import { hojeSP, nomesDosUsuarios } from "@/lib/db/comum"
import { tenantAtual } from "@/lib/tenant"

import { somarMeses } from "@/lib/db/treinamentos"
import {
  LIMIAR_ROTINA_PADRAO,
  PESO_PRESENCA,
  minutosMensaisJornada,
  minutosSemanaisJornada,
  nivelRisco,
  type JornadaDia,
  type NivelRisco,
} from "@/lib/pessoal-sst-constantes"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Pessoal › Atribuições / SST — camada de leitura.
 *
 * Catálogo de TAREFAS (`pessoal_atividades`) com ferramentas, PERIGOS
 * (inerentes à atividade) e medidas (treinamento/EPI). Cada tarefa tem
 * EXECUTORES (`pessoal_atividades_executores`: funcionário + tempo médio/mês +
 * recorrência própria) e o RISCO (bruto + residual) é avaliado POR EXECUTOR
 * (`pessoal_atividades_riscos.executor_id`) — a probabilidade depende da
 * exposição de cada pessoa. FUNÇÕES (`pessoal_funcoes`) agrupam o plano de
 * cargos (`pessoal_atribuicoes_cargo`) e os funcionários
 * (`pessoal_funcionario_funcao`); o desvio de função é analisado por executor
 * contra o plano. Jornada contratada em `pessoal_funcionario_jornada`; GHE em
 * `pessoal_ghe`/`pessoal_ghe_membros`.
 *
 * Escrita fica nas actions das rotas. Ver [[confluir-fase-3a]] e o SQL
 * supabase/pessoal-atribuicoes-sst.sql.
 */

// ── Configuração ─────────────────────────────────────────────────────────────

/** Limiar de recorrência do tenant (empresa.sst_rotina_frequencia). */
export async function obterLimiarRotina(): Promise<string> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("empresa")
    .select("sst_rotina_frequencia")
    .eq("id", await tenantAtual())
    .maybeSingle()
  const v = data?.sst_rotina_frequencia
  return typeof v === "string" && v.trim() !== "" ? v : LIMIAR_ROTINA_PADRAO
}

// ── Funções ──────────────────────────────────────────────────────────────────

export type Funcao = {
  id: string
  nome: string | null
  descricao: string | null
  ativo: boolean
  funcionarios: number
  tarefas: number
}

export async function listarFuncoes(): Promise<Funcao[]> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const [funcoes, vinculos, plano] = await Promise.all([
    admin
      .from("pessoal_funcoes")
      .select("id, nome, descricao, ativo")
      .eq("emp_proprietaria_id", emp)
      .order("nome", { ascending: true, nullsFirst: false }),
    admin
      .from("pessoal_funcionario_funcao")
      .select("funcao_id")
      .eq("emp_proprietaria_id", emp),
    admin
      .from("pessoal_atribuicoes_cargo")
      .select("funcao_id, atividade_id")
      .eq("emp_proprietaria_id", emp),
  ])
  if (funcoes.error) {
    throw new Error(`Falha ao listar funções: ${funcoes.error.message}`)
  }
  const porFuncionarios = new Map<string, number>()
  for (const v of vinculos.data ?? []) {
    if (v.funcao_id) {
      porFuncionarios.set(v.funcao_id, (porFuncionarios.get(v.funcao_id) ?? 0) + 1)
    }
  }
  // tarefas da função = tarefas distintas vinculadas ao plano de cargos
  const porTarefas = new Map<string, Set<string>>()
  for (const p of plano.data ?? []) {
    if (p.funcao_id && p.atividade_id) {
      const s = porTarefas.get(p.funcao_id) ?? new Set<string>()
      s.add(p.atividade_id as string)
      porTarefas.set(p.funcao_id, s)
    }
  }
  return (funcoes.data ?? []).map((f) => ({
    id: f.id as string,
    nome: f.nome as string | null,
    descricao: f.descricao as string | null,
    ativo: f.ativo !== false,
    funcionarios: porFuncionarios.get(f.id) ?? 0,
    tarefas: porTarefas.get(f.id)?.size ?? 0,
  }))
}

export async function buscarFuncao(id: string): Promise<Funcao | null> {
  const funcoes = await listarFuncoes()
  return funcoes.find((f) => f.id === id) ?? null
}

export type AtribuicaoCargo = {
  id: string
  descricao: string
  atividade_id: string | null
  atividadeNome: string | null
}

export async function atribuicoesDaFuncao(
  funcaoId: string
): Promise<AtribuicaoCargo[]> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("pessoal_atribuicoes_cargo")
    .select("id, descricao, atividade_id")
    .eq("funcao_id", funcaoId)
    .order("created_at", { ascending: true })
  if (error) return []
  const nomes = await nomesDeAtividades(
    (data ?? []).map((a) => a.atividade_id).filter((v): v is string => !!v)
  )
  return (data ?? []).map((a) => ({
    id: a.id as string,
    descricao: a.descricao as string,
    atividade_id: a.atividade_id as string | null,
    atividadeNome: a.atividade_id ? (nomes.get(a.atividade_id) ?? null) : null,
  }))
}

export type FuncionarioDaFuncao = {
  id: string
  funcionarioId: string
  nome: string | null
}

export async function funcionariosDaFuncao(
  funcaoId: string
): Promise<FuncionarioDaFuncao[]> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("pessoal_funcionario_funcao")
    .select("id, funcionario_id")
    .eq("funcao_id", funcaoId)
  if (error) return []
  const ids = (data ?? [])
    .map((v) => v.funcionario_id)
    .filter((v): v is string => !!v)
  const nomes = await nomesDosUsuarios(ids)
  return (data ?? [])
    .map((v) => ({
      id: v.id as string,
      funcionarioId: v.funcionario_id as string,
      nome: v.funcionario_id ? (nomes.get(v.funcionario_id) ?? null) : null,
    }))
    .sort((a, b) => (a.nome ?? "￿").localeCompare(b.nome ?? "￿", "pt-BR"))
}

/** Função atual de cada funcionário (usuarioId → {funcaoId, nome}). */
export async function funcoesDosFuncionarios(): Promise<
  Map<string, { funcaoId: string; nome: string | null }>
> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const [vinc, funcoes] = await Promise.all([
    admin
      .from("pessoal_funcionario_funcao")
      .select("funcionario_id, funcao_id")
      .eq("emp_proprietaria_id", emp),
    admin
      .from("pessoal_funcoes")
      .select("id, nome")
      .eq("emp_proprietaria_id", emp),
  ])
  const nomeFuncao = new Map(
    (funcoes.data ?? []).map((f) => [f.id as string, f.nome as string | null])
  )
  const mapa = new Map<string, { funcaoId: string; nome: string | null }>()
  for (const v of vinc.data ?? []) {
    if (v.funcionario_id && v.funcao_id) {
      mapa.set(v.funcionario_id, {
        funcaoId: v.funcao_id,
        nome: nomeFuncao.get(v.funcao_id) ?? null,
      })
    }
  }
  return mapa
}

// ── Comparativo tarefas × plano de cargos (item 5) ───────────────────────────

export type ComparativoLinha = {
  funcionarioId: string
  nome: string | null
  totalTarefas: number
  aderentes: { id: string; nome: string | null }[]
  foraDaFuncao: { id: string; nome: string | null; funcaoNome: string | null }[]
  planoTotal: number
  planoCobertos: number
  planoPendentes: string[]
  planoLivres: number
}

/**
 * Comparativo POR EXECUTOR: para cada funcionário da função, compara as
 * tarefas que ele de fato executa com o plano de cargos da função:
 * - aderentes: tarefas executadas previstas no plano DESTA função;
 * - foraDaFuncao: tarefas executadas que o plano não prevê (possível desvio
 *   de função → passivo); quando outra função prevê a tarefa no seu plano,
 *   ela é apontada;
 * - cobertura do plano: itens do plano ligados a uma tarefa que ele executa.
 * Itens do plano sem tarefa vinculada entram como "livres" (não rastreáveis).
 */
export async function comparativoFuncao(
  funcaoId: string
): Promise<ComparativoLinha[]> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()

  const [vinculados, plano] = await Promise.all([
    funcionariosDaFuncao(funcaoId),
    atribuicoesDaFuncao(funcaoId),
  ])
  if (vinculados.length === 0) return []

  const ids = vinculados.map((v) => v.funcionarioId)
  const [exec, atividades, funcoes, planosTodos] = await Promise.all([
    admin
      .from("pessoal_atividades_executores")
      .select("funcionario_id, atividade_id")
      .eq("emp_proprietaria_id", emp)
      .in("funcionario_id", ids),
    admin
      .from("pessoal_atividades")
      .select("id, nome")
      .eq("emp_proprietaria_id", emp),
    admin.from("pessoal_funcoes").select("id, nome").eq("emp_proprietaria_id", emp),
    admin
      .from("pessoal_atribuicoes_cargo")
      .select("funcao_id, atividade_id")
      .eq("emp_proprietaria_id", emp),
  ])

  const ativById = new Map(
    (atividades.data ?? []).map((a) => [
      a.id as string,
      { nome: a.nome as string | null },
    ])
  )
  const nomeFuncao = new Map(
    (funcoes.data ?? []).map((f) => [f.id as string, f.nome as string | null])
  )
  // atividade → funções cujo plano a prevê (para apontar de quem seria a tarefa)
  const funcoesDaAtividade = new Map<string, Set<string>>()
  for (const p of planosTodos.data ?? []) {
    if (!p.funcao_id || !p.atividade_id) continue
    const s = funcoesDaAtividade.get(p.atividade_id) ?? new Set<string>()
    s.add(p.funcao_id as string)
    funcoesDaAtividade.set(p.atividade_id, s)
  }
  const execPorFuncionario = new Map<string, string[]>()
  for (const e of exec.data ?? []) {
    if (!e.funcionario_id || !e.atividade_id) continue
    const arr = execPorFuncionario.get(e.funcionario_id) ?? []
    arr.push(e.atividade_id)
    execPorFuncionario.set(e.funcionario_id, arr)
  }

  const planoComAtiv = plano.filter((p) => p.atividade_id)
  const planoLivres = plano.length - planoComAtiv.length
  const planoSet = new Set(planoComAtiv.map((p) => p.atividade_id!))

  return vinculados.map((v) => {
    const execIds = execPorFuncionario.get(v.funcionarioId) ?? []
    const execSet = new Set(execIds)
    const aderentes: { id: string; nome: string | null }[] = []
    const foraDaFuncao: {
      id: string
      nome: string | null
      funcaoNome: string | null
    }[] = []
    for (const aid of execIds) {
      const a = ativById.get(aid)
      if (planoSet.has(aid)) {
        aderentes.push({ id: aid, nome: a?.nome ?? null })
      } else {
        const outras = [...(funcoesDaAtividade.get(aid) ?? [])].filter(
          (f) => f !== funcaoId
        )
        foraDaFuncao.push({
          id: aid,
          nome: a?.nome ?? null,
          funcaoNome: outras.length
            ? (nomeFuncao.get(outras[0]) ?? null)
            : null,
        })
      }
    }
    const cobertos = planoComAtiv.filter((p) => execSet.has(p.atividade_id!))
    return {
      funcionarioId: v.funcionarioId,
      nome: v.nome,
      totalTarefas: execIds.length,
      aderentes,
      foraDaFuncao,
      planoTotal: planoComAtiv.length,
      planoCobertos: cobertos.length,
      planoPendentes: planoComAtiv
        .filter((p) => !execSet.has(p.atividade_id!))
        .map((p) => p.descricao),
      planoLivres,
    }
  })
}

// ── Atividades (tarefas) ─────────────────────────────────────────────────────

export type Atividade = {
  id: string
  nome: string | null
  descricao: string | null
  presenca: string | null
  avaliada_em: string | null
  observacoes: string | null
  executores: number
  perigos: number
  riscos: number
}

async function nomesDeAtividades(ids: string[]): Promise<Map<string, string>> {
  const unicos = [...new Set(ids.filter(Boolean))]
  const mapa = new Map<string, string>()
  if (unicos.length === 0) return mapa
  const admin = await createAdminClient()
  const { data } = await admin
    .from("pessoal_atividades")
    .select("id, nome")
    .in("id", unicos)
  for (const a of data ?? []) {
    if (typeof a.nome === "string") mapa.set(a.id as string, a.nome)
  }
  return mapa
}

export async function listarAtividades(): Promise<Atividade[]> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const [atividades, executores, perigos, riscos] = await Promise.all([
    admin
      .from("pessoal_atividades")
      .select("id, nome, descricao, presenca, avaliada_em, observacoes")
      .eq("emp_proprietaria_id", emp)
      .order("nome", { ascending: true, nullsFirst: false }),
    admin
      .from("pessoal_atividades_executores")
      .select("atividade_id")
      .eq("emp_proprietaria_id", emp),
    admin
      .from("pessoal_atividades_perigos")
      .select("atividade_id")
      .eq("emp_proprietaria_id", emp),
    admin
      .from("pessoal_atividades_riscos")
      .select("atividade_id")
      .eq("emp_proprietaria_id", emp),
  ])
  if (atividades.error) {
    throw new Error(`Falha ao listar tarefas: ${atividades.error.message}`)
  }
  const contar = (linhas: { atividade_id: string | null }[] | null) => {
    const m = new Map<string, number>()
    for (const l of linhas ?? []) {
      if (l.atividade_id) m.set(l.atividade_id, (m.get(l.atividade_id) ?? 0) + 1)
    }
    return m
  }
  const cExec = contar(executores.data)
  const cPer = contar(perigos.data)
  const cRis = contar(riscos.data)
  return (atividades.data ?? []).map((a) => ({
    id: a.id as string,
    nome: a.nome as string | null,
    descricao: a.descricao as string | null,
    presenca: a.presenca as string | null,
    avaliada_em: a.avaliada_em as string | null,
    observacoes: a.observacoes as string | null,
    executores: cExec.get(a.id) ?? 0,
    perigos: cPer.get(a.id) ?? 0,
    riscos: cRis.get(a.id) ?? 0,
  }))
}

export type Ferramenta = {
  id: string
  nome: string
  tipo: string | null
}
export type Perigo = {
  id: string
  descricao: string
  fonte: string | null
  severidade: number | null
  norma: string | null
}
export type Risco = {
  id: string
  executor_id: string | null
  perigo_id: string | null
  categoria: string | null
  probabilidade: number | null
  severidade: number | null
  probabilidade_residual: number | null
  severidade_residual: number | null
  observacao: string | null
  nivel: NivelRisco | null
  nivelResidual: NivelRisco | null
}
export type Medida = {
  id: string
  tipo: string
  descricao: string
  treinamento_id: string | null
  recorrencia_meses: number | null
  epi_ca: string | null
  risco_id: string | null
}
export type Executor = {
  id: string
  /** Funcionário (usuarios) OU prestador (fornecedor/empresa) — um dos dois. */
  funcionarioId: string | null
  fornecedorId: string | null
  prestador: boolean
  nome: string | null
  tempo_min_mes: number | null
  recorrencia: string | null
  frequencia: string | null
  avaliado_em: string | null
  /** Minutos/mês da jornada contratada (0 = sem jornada; prestador não tem). */
  jornadaMinMes: number
}

/** Nome de exibição de fornecedores/prestadores (tabela empresa). */
async function nomesDosFornecedores(
  ids: string[]
): Promise<Map<string, string>> {
  const mapa = new Map<string, string>()
  const unicos = [...new Set(ids.filter(Boolean))]
  if (unicos.length === 0) return mapa
  const admin = await createAdminClient()
  const { data } = await admin
    .from("empresa")
    .select("id, nome_fantasia, nome_razao")
    .in("id", unicos)
  for (const e of data ?? []) {
    const nome = [e.nome_fantasia, e.nome_razao].find(
      (v): v is string => typeof v === "string" && v.trim() !== ""
    )
    if (nome) mapa.set(e.id as string, nome)
  }
  return mapa
}

export type AtividadeDetalhe = Atividade & {
  ferramentas: Ferramenta[]
  perigosLista: Perigo[]
  riscosLista: Risco[]
  medidas: Medida[]
  executoresLista: Executor[]
}

export async function buscarAtividade(
  id: string
): Promise<AtividadeDetalhe | null> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data: a, error } = await admin
    .from("pessoal_atividades")
    .select("id, nome, descricao, presenca, avaliada_em, observacoes")
    .eq("id", id)
    .eq("emp_proprietaria_id", emp)
    .maybeSingle()
  if (error || !a) return null

  const [ferr, per, ris, med, exec] = await Promise.all([
    admin
      .from("pessoal_atividades_ferramentas")
      .select("id, nome, tipo")
      .eq("atividade_id", id)
      .order("created_at", { ascending: true }),
    admin
      .from("pessoal_atividades_perigos")
      .select("id, descricao, fonte, severidade, norma")
      .eq("atividade_id", id)
      .order("created_at", { ascending: true }),
    admin
      .from("pessoal_atividades_riscos")
      .select(
        "id, executor_id, perigo_id, categoria, probabilidade, severidade, probabilidade_residual, severidade_residual, observacao"
      )
      .eq("atividade_id", id)
      .order("created_at", { ascending: true }),
    admin
      .from("pessoal_atividade_medidas_seguranca")
      .select("id, tipo, descricao, treinamento_id, recorrencia_meses, epi_ca, risco_id")
      .eq("atividade_id", id)
      .order("created_at", { ascending: true }),
    admin
      .from("pessoal_atividades_executores")
      .select(
        "id, funcionario_id, fornecedor_id, tempo_min_mes, recorrencia, frequencia, avaliado_em"
      )
      .eq("atividade_id", id),
  ])

  const idsExec = (exec.data ?? [])
    .map((e) => e.funcionario_id)
    .filter((v): v is string => !!v)
  const idsForn = (exec.data ?? [])
    .map((e) => e.fornecedor_id)
    .filter((v): v is string => !!v)
  const [nomes, jornadas, nomesForn] = await Promise.all([
    nomesDosUsuarios(idsExec),
    jornadasDosFuncionarios(idsExec),
    nomesDosFornecedores(idsForn),
  ])

  return {
    id: a.id as string,
    nome: a.nome as string | null,
    descricao: a.descricao as string | null,
    presenca: a.presenca as string | null,
    avaliada_em: a.avaliada_em as string | null,
    observacoes: a.observacoes as string | null,
    executores: (exec.data ?? []).length,
    perigos: (per.data ?? []).length,
    riscos: (ris.data ?? []).length,
    ferramentas: (ferr.data ?? []).map((f) => ({
      id: f.id as string,
      nome: f.nome as string,
      tipo: f.tipo as string | null,
    })),
    perigosLista: (per.data ?? []).map((p) => ({
      id: p.id as string,
      descricao: p.descricao as string,
      fonte: p.fonte as string | null,
      severidade: p.severidade as number | null,
      norma: p.norma as string | null,
    })),
    riscosLista: (ris.data ?? []).map((r) => ({
      id: r.id as string,
      executor_id: r.executor_id as string | null,
      perigo_id: r.perigo_id as string | null,
      categoria: r.categoria as string | null,
      probabilidade: r.probabilidade as number | null,
      severidade: r.severidade as number | null,
      probabilidade_residual: r.probabilidade_residual as number | null,
      severidade_residual: r.severidade_residual as number | null,
      observacao: r.observacao as string | null,
      nivel: nivelRisco(
        r.probabilidade as number | null,
        r.severidade as number | null
      ),
      nivelResidual: nivelRisco(
        r.probabilidade_residual as number | null,
        r.severidade_residual as number | null
      ),
    })),
    medidas: (med.data ?? []).map((m) => ({
      id: m.id as string,
      tipo: m.tipo as string,
      descricao: m.descricao as string,
      treinamento_id: m.treinamento_id as string | null,
      recorrencia_meses: m.recorrencia_meses as number | null,
      epi_ca: m.epi_ca as string | null,
      risco_id: m.risco_id as string | null,
    })),
    executoresLista: (exec.data ?? [])
      .map((e) => {
        const prestador = !e.funcionario_id && Boolean(e.fornecedor_id)
        return {
          id: e.id as string,
          funcionarioId: (e.funcionario_id as string | null) ?? null,
          fornecedorId: (e.fornecedor_id as string | null) ?? null,
          prestador,
          nome: prestador
            ? (nomesForn.get(e.fornecedor_id as string) ?? null)
            : e.funcionario_id
              ? (nomes.get(e.funcionario_id) ?? null)
              : null,
          tempo_min_mes: e.tempo_min_mes as number | null,
          recorrencia: e.recorrencia as string | null,
          frequencia: e.frequencia as string | null,
          avaliado_em: e.avaliado_em as string | null,
          jornadaMinMes: e.funcionario_id
            ? minutosMensaisJornada(jornadas.get(e.funcionario_id) ?? [])
            : 0,
        }
      })
      .sort(
        (a, b) =>
          Number(a.prestador) - Number(b.prestador) ||
          (a.nome ?? "￿").localeCompare(b.nome ?? "￿", "pt-BR")
      ),
  }
}

// ── Matriz de treinamento ────────────────────────────────────────────────────

export type StatusTreino = "valido" | "vencido" | "falta" | "sem_vinculo"

export type ItemMatriz = {
  chave: string
  descricao: string
  treinamento_id: string | null
  atividades: string[]
  status: StatusTreino
  validoAte: string | null
}

export type LinhaMatriz = {
  funcionarioId: string
  nome: string | null
  funcaoNome: string | null
  itens: ItemMatriz[]
  pendentes: number
}

/**
 * Matriz de treinamento: para cada funcionário que executa tarefas, os
 * treinamentos EXIGIDOS (medidas tipo=treinamento das suas tarefas) cruzados
 * com o que ele já fez (`pessoal_treinamentos_alunos`). Validade = término +
 * recorrência (da medida, ou a validade do catálogo).
 */
export async function matrizTreinamento(): Promise<LinhaMatriz[]> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const hoje = hojeSP()

  const [exec, atividades, medidas, treinCatalogo, alunos, funcoesMap] =
    await Promise.all([
      admin
        .from("pessoal_atividades_executores")
        .select("atividade_id, funcionario_id")
        .eq("emp_proprietaria_id", emp),
      admin
        .from("pessoal_atividades")
        .select("id, nome")
        .eq("emp_proprietaria_id", emp),
      admin
        .from("pessoal_atividade_medidas_seguranca")
        .select("atividade_id, tipo, descricao, treinamento_id, recorrencia_meses")
        .eq("emp_proprietaria_id", emp)
        .eq("tipo", "treinamento"),
      admin.from("pessoal_treinamentos").select("id, treinamento, vencimento_meses"),
      admin
        .from("pessoal_treinamentos_alunos")
        .select("aluno_id, treinamento_id, data_termino"),
      funcoesDosFuncionarios(),
    ])

  const nomeAtividade = new Map(
    (atividades.data ?? []).map((a) => [a.id as string, a.nome as string | null])
  )
  const validadeCatalogo = new Map(
    (treinCatalogo.data ?? []).map((t) => [
      t.id as string,
      t.vencimento_meses as number | null,
    ])
  )

  // medidas de treinamento por atividade
  const medidasPorAtividade = new Map<
    string,
    { descricao: string; treinamento_id: string | null; recorrencia_meses: number | null }[]
  >()
  for (const m of medidas.data ?? []) {
    if (!m.atividade_id) continue
    const arr = medidasPorAtividade.get(m.atividade_id) ?? []
    arr.push({
      descricao: m.descricao as string,
      treinamento_id: m.treinamento_id as string | null,
      recorrencia_meses: m.recorrencia_meses as number | null,
    })
    medidasPorAtividade.set(m.atividade_id, arr)
  }

  // treinamentos concluídos por funcionário: treinamento_id → melhor validade
  const feitosPorFuncionario = new Map<string, Map<string, string | null>>()
  for (const a of alunos.data ?? []) {
    if (!a.aluno_id || !a.treinamento_id) continue
    const meses = validadeCatalogo.get(a.treinamento_id) ?? null
    const validoAte =
      a.data_termino && meses ? somarMeses(a.data_termino as string, meses) : null
    const mapa = feitosPorFuncionario.get(a.aluno_id) ?? new Map()
    // guarda a MAIOR validade (ou "não expira" = null vence tudo)
    const atual = mapa.get(a.treinamento_id)
    if (!mapa.has(a.treinamento_id) || (atual && validoAte === null) ||
        (atual && validoAte && validoAte > atual)) {
      mapa.set(a.treinamento_id, validoAte)
    }
    feitosPorFuncionario.set(a.aluno_id, mapa)
  }

  // exigências por funcionário (união das medidas das suas tarefas)
  const exigPorFuncionario = new Map<
    string,
    Map<string, ItemMatriz>
  >()
  for (const e of exec.data ?? []) {
    if (!e.funcionario_id || !e.atividade_id) continue
    const medidasAtiv = medidasPorAtividade.get(e.atividade_id) ?? []
    if (medidasAtiv.length === 0) continue
    const atividadeNome = nomeAtividade.get(e.atividade_id) ?? "(tarefa)"
    const mapa = exigPorFuncionario.get(e.funcionario_id) ?? new Map()
    for (const m of medidasAtiv) {
      const chave = m.treinamento_id ?? `desc:${m.descricao.toLowerCase().trim()}`
      const existente = mapa.get(chave)
      if (existente) {
        if (!existente.atividades.includes(atividadeNome)) {
          existente.atividades.push(atividadeNome)
        }
        continue
      }
      // status
      let status: StatusTreino = "sem_vinculo"
      let validoAte: string | null = null
      if (m.treinamento_id) {
        const feitos = feitosPorFuncionario.get(e.funcionario_id)
        if (!feitos || !feitos.has(m.treinamento_id)) {
          status = "falta"
        } else {
          validoAte = feitos.get(m.treinamento_id) ?? null
          status = validoAte && validoAte < hoje ? "vencido" : "valido"
        }
      }
      mapa.set(chave, {
        chave,
        descricao: m.descricao,
        treinamento_id: m.treinamento_id,
        atividades: [atividadeNome],
        status,
        validoAte,
      })
    }
    exigPorFuncionario.set(e.funcionario_id, mapa)
  }

  const nomes = await nomesDosUsuarios([...exigPorFuncionario.keys()])
  const linhas: LinhaMatriz[] = []
  for (const [funcionarioId, itensMap] of exigPorFuncionario) {
    const itens = [...itensMap.values()].sort((a, b) =>
      a.descricao.localeCompare(b.descricao, "pt-BR")
    )
    linhas.push({
      funcionarioId,
      nome: nomes.get(funcionarioId) ?? null,
      funcaoNome: funcoesMap.get(funcionarioId)?.nome ?? null,
      itens,
      pendentes: itens.filter(
        (i) => i.status === "falta" || i.status === "vencido"
      ).length,
    })
  }
  return linhas.sort((a, b) =>
    (a.nome ?? "￿").localeCompare(b.nome ?? "￿", "pt-BR")
  )
}

// ── Relatórios ───────────────────────────────────────────────────────────────

export type TarefaDoRelatorio = {
  atividadeId: string
  nome: string | null
  recorrencia: string | null
  presenca: string | null
  tempoMinMes: number | null
}
export type RiscoAgregado = {
  categoria: string
  pior: NivelRisco | null
  piorResidual: NivelRisco | null
  quantidade: number
}
export type RelatorioPessoa = {
  funcionarioId: string
  nome: string | null
  funcaoNome: string | null
  tempoTotalMin: number
  /** Minutos/mês da jornada contratada (0 = sem jornada cadastrada). */
  jornadaMinMes: number
  /** % da disponibilidade mensal consumida pelas tarefas (null sem jornada). */
  ocupacaoPct: number | null
  presencaFisicaPct: number | null
  tarefas: TarefaDoRelatorio[]
  perigos: number
  riscos: RiscoAgregado[]
}

/**
 * Relatório para um conjunto de funcionários: por pessoa traz tempo total,
 * jornada contratada e % de ocupação, % de presença física (ponderada pelo
 * tempo), tarefas (com a recorrência DO EXECUTOR), perigos das tarefas que
 * executa e os riscos avaliados PARA ELA (por executor).
 */
export async function relatorioDeFuncionarios(
  usuarioIds: string[]
): Promise<RelatorioPessoa[]> {
  const ids = [...new Set(usuarioIds.filter(Boolean))]
  if (ids.length === 0) return []
  const admin = await createAdminClient()
  const emp = await tenantAtual()

  const [exec, atividades, perigos, riscos, nomes, funcoesMap, jornadas] =
    await Promise.all([
      admin
        .from("pessoal_atividades_executores")
        .select("id, atividade_id, funcionario_id, tempo_min_mes, recorrencia")
        .eq("emp_proprietaria_id", emp)
        .in("funcionario_id", ids),
      admin
        .from("pessoal_atividades")
        .select("id, nome, presenca")
        .eq("emp_proprietaria_id", emp),
      admin
        .from("pessoal_atividades_perigos")
        .select("atividade_id")
        .eq("emp_proprietaria_id", emp),
      admin
        .from("pessoal_atividades_riscos")
        .select(
          "executor_id, categoria, probabilidade, severidade, probabilidade_residual, severidade_residual"
        )
        .eq("emp_proprietaria_id", emp)
        .not("executor_id", "is", null),
      nomesDosUsuarios(ids),
      funcoesDosFuncionarios(),
      jornadasDosFuncionarios(ids),
    ])

  const ativById = new Map(
    (atividades.data ?? []).map((a) => [a.id as string, a])
  )
  const perigosPorAtiv = new Map<string, number>()
  for (const p of perigos.data ?? []) {
    if (p.atividade_id) {
      perigosPorAtiv.set(
        p.atividade_id,
        (perigosPorAtiv.get(p.atividade_id) ?? 0) + 1
      )
    }
  }
  const riscosPorExecutor = new Map<string, typeof riscos.data>()
  for (const r of riscos.data ?? []) {
    if (!r.executor_id) continue
    const arr = riscosPorExecutor.get(r.executor_id) ?? []
    arr!.push(r)
    riscosPorExecutor.set(r.executor_id, arr)
  }

  const porFuncionario = new Map<string, typeof exec.data>()
  for (const e of exec.data ?? []) {
    if (!e.funcionario_id) continue
    const arr = porFuncionario.get(e.funcionario_id) ?? []
    arr!.push(e)
    porFuncionario.set(e.funcionario_id, arr)
  }

  return ids.map((funcionarioId) => {
    const linhas = porFuncionario.get(funcionarioId) ?? []
    const tarefas: TarefaDoRelatorio[] = []
    let tempoTotal = 0
    let somaPeso = 0
    let somaTempoComPresenca = 0
    let perigosTotal = 0
    const riscoAgg = new Map<
      string,
      { pior: number; piorResidual: number; qtd: number; nivel: NivelRisco | null; nivelResidual: NivelRisco | null }
    >()

    for (const e of linhas) {
      const a = e.atividade_id ? ativById.get(e.atividade_id) : null
      const tempo = (e.tempo_min_mes as number | null) ?? 0
      tempoTotal += tempo
      tarefas.push({
        atividadeId: e.atividade_id as string,
        nome: (a?.nome as string | null) ?? null,
        recorrencia: (e.recorrencia as string | null) ?? null,
        presenca: (a?.presenca as string | null) ?? null,
        tempoMinMes: e.tempo_min_mes as number | null,
      })
      const presenca = a?.presenca as string | null
      if (presenca && tempo > 0) {
        somaPeso += (PESO_PRESENCA[presenca] ?? 0) * tempo
        somaTempoComPresenca += tempo
      }
      if (e.atividade_id) {
        perigosTotal += perigosPorAtiv.get(e.atividade_id) ?? 0
      }
      for (const r of riscosPorExecutor.get(e.id as string) ?? []) {
        const cat = (r.categoria as string | null) ?? "outro"
        const nv = nivelRisco(
          r.probabilidade as number | null,
          r.severidade as number | null
        )
        const nvR = nivelRisco(
          r.probabilidade_residual as number | null,
          r.severidade_residual as number | null
        )
        const cur = riscoAgg.get(cat) ?? {
          pior: 0,
          piorResidual: 0,
          qtd: 0,
          nivel: null,
          nivelResidual: null,
        }
        cur.qtd += 1
        if (nv && nv.valor > cur.pior) {
          cur.pior = nv.valor
          cur.nivel = nv
        }
        if (nvR && nvR.valor > cur.piorResidual) {
          cur.piorResidual = nvR.valor
          cur.nivelResidual = nvR
        }
        riscoAgg.set(cat, cur)
      }
    }

    const presencaFisicaPct =
      somaTempoComPresenca > 0
        ? Math.round((somaPeso / somaTempoComPresenca) * 100)
        : null

    const riscos: RiscoAgregado[] = [...riscoAgg.entries()].map(
      ([categoria, v]) => ({
        categoria,
        pior: v.nivel,
        piorResidual: v.nivelResidual,
        quantidade: v.qtd,
      })
    )

    const jornadaMinMes = minutosMensaisJornada(
      jornadas.get(funcionarioId) ?? []
    )

    return {
      funcionarioId,
      nome: nomes.get(funcionarioId) ?? null,
      funcaoNome: funcoesMap.get(funcionarioId)?.nome ?? null,
      tempoTotalMin: tempoTotal,
      jornadaMinMes,
      ocupacaoPct:
        jornadaMinMes > 0
          ? Math.round((tempoTotal / jornadaMinMes) * 100)
          : null,
      presencaFisicaPct,
      tarefas: tarefas.sort((a, b) =>
        (b.tempoMinMes ?? 0) - (a.tempoMinMes ?? 0)
      ),
      perigos: perigosTotal,
      riscos: riscos.sort((a, b) => (b.pior?.valor ?? 0) - (a.pior?.valor ?? 0)),
    }
  })
}

// ── Jornada de trabalho contratada ───────────────────────────────────────────

/** Jornada (linhas por dia) de um conjunto de funcionários: usuarioId → dias. */
export async function jornadasDosFuncionarios(
  usuarioIds: string[]
): Promise<Map<string, JornadaDia[]>> {
  const mapa = new Map<string, JornadaDia[]>()
  const ids = [...new Set(usuarioIds.filter(Boolean))]
  if (ids.length === 0) return mapa
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("pessoal_funcionario_jornada")
    .select("funcionario_id, dia_semana, hora_inicio, hora_fim")
    .in("funcionario_id", ids)
  if (error) return mapa // schema ausente → sem jornadas
  for (const j of data ?? []) {
    if (!j.funcionario_id || typeof j.dia_semana !== "number") continue
    const arr = mapa.get(j.funcionario_id) ?? []
    arr.push({
      dia_semana: j.dia_semana,
      hora_inicio: j.hora_inicio as string | null,
      hora_fim: j.hora_fim as string | null,
    })
    mapa.set(j.funcionario_id, arr)
  }
  return mapa
}

/** Jornada de UM usuário (para o alerta fora de horário). [] = sem jornada. */
export async function jornadaDoUsuario(usuarioId: string): Promise<JornadaDia[]> {
  const mapa = await jornadasDosFuncionarios([usuarioId])
  return mapa.get(usuarioId) ?? []
}

export type LinhaJornada = {
  funcionarioId: string
  nome: string | null
  funcaoNome: string | null
  dias: JornadaDia[]
  minSemana: number
  minMes: number
}

/** Jornadas dos funcionários informados, com carga semanal/mensal calculada. */
export async function listarJornadas(
  funcionarios: { usuarioId: string; nome: string | null }[]
): Promise<LinhaJornada[]> {
  const ids = funcionarios.map((f) => f.usuarioId)
  const [jornadas, funcoesMap] = await Promise.all([
    jornadasDosFuncionarios(ids),
    funcoesDosFuncionarios(),
  ])
  return funcionarios
    .map((f) => {
      const dias = (jornadas.get(f.usuarioId) ?? []).sort(
        (a, b) =>
          ((a.dia_semana + 6) % 7) - ((b.dia_semana + 6) % 7) // seg…dom
      )
      return {
        funcionarioId: f.usuarioId,
        nome: f.nome,
        funcaoNome: funcoesMap.get(f.usuarioId)?.nome ?? null,
        dias,
        minSemana: minutosSemanaisJornada(dias),
        minMes: minutosMensaisJornada(dias),
      }
    })
    .sort((a, b) => (a.nome ?? "￿").localeCompare(b.nome ?? "￿", "pt-BR"))
}

// ── Grupo Homogêneo de Exposição (GHE) ───────────────────────────────────────

export type Ghe = {
  id: string
  nome: string | null
  descricao: string | null
  membros: number
}

export async function listarGhes(): Promise<Ghe[]> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const [ghes, membros] = await Promise.all([
    admin
      .from("pessoal_ghe")
      .select("id, nome, descricao")
      .eq("emp_proprietaria_id", emp)
      .order("nome", { ascending: true, nullsFirst: false }),
    admin
      .from("pessoal_ghe_membros")
      .select("ghe_id")
      .eq("emp_proprietaria_id", emp),
  ])
  if (ghes.error) return [] // schema ausente
  const cont = new Map<string, number>()
  for (const m of membros.data ?? []) {
    if (m.ghe_id) cont.set(m.ghe_id, (cont.get(m.ghe_id) ?? 0) + 1)
  }
  return (ghes.data ?? []).map((g) => ({
    id: g.id as string,
    nome: g.nome as string | null,
    descricao: g.descricao as string | null,
    membros: cont.get(g.id) ?? 0,
  }))
}

export type GheDetalhe = Ghe & {
  membrosLista: { id: string; funcionarioId: string; nome: string | null }[]
  /** Perfil de exposição do grupo (relatório das pessoas-membro). */
  perfil: RelatorioPessoa[]
}

export async function buscarGhe(id: string): Promise<GheDetalhe | null> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data: g, error } = await admin
    .from("pessoal_ghe")
    .select("id, nome, descricao")
    .eq("id", id)
    .eq("emp_proprietaria_id", emp)
    .maybeSingle()
  if (error || !g) return null
  const { data: membros } = await admin
    .from("pessoal_ghe_membros")
    .select("id, funcionario_id")
    .eq("ghe_id", id)
  const ids = (membros ?? [])
    .map((m) => m.funcionario_id)
    .filter((v): v is string => !!v)
  const [nomes, perfil] = await Promise.all([
    nomesDosUsuarios(ids),
    relatorioDeFuncionarios(ids),
  ])
  return {
    id: g.id as string,
    nome: g.nome as string | null,
    descricao: g.descricao as string | null,
    membros: ids.length,
    membrosLista: (membros ?? [])
      .map((m) => ({
        id: m.id as string,
        funcionarioId: m.funcionario_id as string,
        nome: m.funcionario_id ? (nomes.get(m.funcionario_id) ?? null) : null,
      }))
      .sort((a, b) => (a.nome ?? "￿").localeCompare(b.nome ?? "￿", "pt-BR")),
    perfil,
  }
}

export type SugestaoGhe = {
  /** Tarefas compartilhadas (nomes). */
  tarefas: string[]
  funcionarios: { funcionarioId: string; nome: string | null }[]
}

/**
 * Sugere GHEs: funcionários com o MESMO conjunto de tarefas executadas formam
 * um grupo (exposição homogênea). Só sugere grupos com 2+ pessoas que ainda
 * não estejam juntas em um GHE existente.
 */
export async function sugerirGhes(): Promise<SugestaoGhe[]> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const [exec, atividades, membros] = await Promise.all([
    admin
      .from("pessoal_atividades_executores")
      .select("funcionario_id, atividade_id")
      .eq("emp_proprietaria_id", emp),
    admin
      .from("pessoal_atividades")
      .select("id, nome")
      .eq("emp_proprietaria_id", emp),
    admin
      .from("pessoal_ghe_membros")
      .select("ghe_id, funcionario_id")
      .eq("emp_proprietaria_id", emp),
  ])
  const nomeAtiv = new Map(
    (atividades.data ?? []).map((a) => [a.id as string, a.nome as string | null])
  )
  const tarefasPorPessoa = new Map<string, Set<string>>()
  for (const e of exec.data ?? []) {
    if (!e.funcionario_id || !e.atividade_id) continue
    const s = tarefasPorPessoa.get(e.funcionario_id) ?? new Set<string>()
    s.add(e.atividade_id)
    tarefasPorPessoa.set(e.funcionario_id, s)
  }
  // pessoas já agrupadas em algum GHE (por GHE)
  const ghePorPessoa = new Map<string, Set<string>>()
  for (const m of membros.data ?? []) {
    if (!m.funcionario_id || !m.ghe_id) continue
    const s = ghePorPessoa.get(m.funcionario_id) ?? new Set<string>()
    s.add(m.ghe_id)
    ghePorPessoa.set(m.funcionario_id, s)
  }
  // agrupa por assinatura (conjunto ordenado de tarefas)
  const grupos = new Map<string, string[]>()
  for (const [pessoa, tarefas] of tarefasPorPessoa) {
    if (tarefas.size === 0) continue
    const chave = [...tarefas].sort().join("|")
    const arr = grupos.get(chave) ?? []
    arr.push(pessoa)
    grupos.set(chave, arr)
  }
  const sugestoes: SugestaoGhe[] = []
  for (const [chave, pessoas] of grupos) {
    if (pessoas.length < 2) continue
    // descarta se todos já dividem um mesmo GHE
    const comuns = pessoas
      .map((p) => ghePorPessoa.get(p) ?? new Set<string>())
      .reduce((acc, s) => new Set([...acc].filter((x) => s.has(x))))
    if (comuns.size > 0) continue
    const nomes = await nomesDosUsuarios(pessoas)
    sugestoes.push({
      tarefas: chave
        .split("|")
        .map((id) => nomeAtiv.get(id) ?? "(tarefa)")
        .filter((v): v is string => !!v),
      funcionarios: pessoas.map((p) => ({
        funcionarioId: p,
        nome: nomes.get(p) ?? null,
      })),
    })
  }
  return sugestoes.sort((a, b) => b.funcionarios.length - a.funcionarios.length)
}

// ── Documentos: Ordem de Serviço (NR-01) e Comunicado de SST ─────────────────

export type TarefaDoDocumento = {
  nome: string | null
  descricao: string | null
  presenca: string | null
  recorrencia: string | null
  frequencia: string | null
  tempoMinMes: number | null
  ferramentas: string[]
  perigos: Perigo[]
  /** Riscos avaliados para ESTE executor (com níveis calculados). */
  riscos: Risco[]
  treinamentos: { descricao: string; recorrencia_meses: number | null }[]
  epis: { descricao: string; epi_ca: string | null }[]
}

export type DocumentoSst = {
  /** "os" (funcionário) ou "comunicado" (prestador). */
  tipo: "os" | "comunicado"
  pessoa: {
    nome: string | null
    documento: string | null
    complemento: string | null // função (funcionário) ou "Prestador de serviço"
  }
  tarefas: TarefaDoDocumento[]
}

async function montarDocumentoSst(
  execRows: {
    id: string
    atividade_id: string | null
    tempo_min_mes: number | null
    recorrencia: string | null
    frequencia: string | null
  }[]
): Promise<TarefaDoDocumento[]> {
  const admin = await createAdminClient()
  const atividadeIds = [
    ...new Set(
      execRows.map((e) => e.atividade_id).filter((v): v is string => !!v)
    ),
  ]
  if (atividadeIds.length === 0) return []
  const execIds = execRows.map((e) => e.id)

  const [atividades, ferr, per, ris, med] = await Promise.all([
    admin
      .from("pessoal_atividades")
      .select("id, nome, descricao, presenca")
      .in("id", atividadeIds),
    admin
      .from("pessoal_atividades_ferramentas")
      .select("atividade_id, nome")
      .in("atividade_id", atividadeIds),
    admin
      .from("pessoal_atividades_perigos")
      .select("id, atividade_id, descricao, fonte, severidade, norma")
      .in("atividade_id", atividadeIds),
    admin
      .from("pessoal_atividades_riscos")
      .select(
        "id, atividade_id, executor_id, perigo_id, categoria, probabilidade, severidade, probabilidade_residual, severidade_residual, observacao"
      )
      .in("executor_id", execIds),
    admin
      .from("pessoal_atividade_medidas_seguranca")
      .select("atividade_id, tipo, descricao, recorrencia_meses, epi_ca")
      .in("atividade_id", atividadeIds),
  ])

  const ativById = new Map((atividades.data ?? []).map((a) => [a.id as string, a]))
  const agrupar = <T extends { atividade_id: string | null }>(linhas: T[]) => {
    const m = new Map<string, T[]>()
    for (const l of linhas) {
      if (!l.atividade_id) continue
      const arr = m.get(l.atividade_id) ?? []
      arr.push(l)
      m.set(l.atividade_id, arr)
    }
    return m
  }
  const ferrPor = agrupar(ferr.data ?? [])
  const perPor = agrupar(per.data ?? [])
  const medPor = agrupar(med.data ?? [])
  const risPorExec = new Map<string, NonNullable<typeof ris.data>>()
  for (const r of ris.data ?? []) {
    if (!r.executor_id) continue
    const arr = risPorExec.get(r.executor_id) ?? []
    arr.push(r)
    risPorExec.set(r.executor_id, arr)
  }

  return execRows
    .filter((e) => e.atividade_id && ativById.has(e.atividade_id))
    .map((e) => {
      const a = ativById.get(e.atividade_id!)!
      const medidas = medPor.get(e.atividade_id!) ?? []
      return {
        nome: a.nome as string | null,
        descricao: a.descricao as string | null,
        presenca: a.presenca as string | null,
        recorrencia: e.recorrencia,
        frequencia: e.frequencia,
        tempoMinMes: e.tempo_min_mes,
        ferramentas: (ferrPor.get(e.atividade_id!) ?? [])
          .map((f) => f.nome as string | null)
          .filter((v): v is string => !!v),
        perigos: (perPor.get(e.atividade_id!) ?? []).map((p) => ({
          id: p.id as string,
          descricao: p.descricao as string,
          fonte: p.fonte as string | null,
          severidade: p.severidade as number | null,
          norma: p.norma as string | null,
        })),
        riscos: (risPorExec.get(e.id) ?? []).map((r) => ({
          id: r.id as string,
          executor_id: r.executor_id as string | null,
          perigo_id: r.perigo_id as string | null,
          categoria: r.categoria as string | null,
          probabilidade: r.probabilidade as number | null,
          severidade: r.severidade as number | null,
          probabilidade_residual: r.probabilidade_residual as number | null,
          severidade_residual: r.severidade_residual as number | null,
          observacao: r.observacao as string | null,
          nivel: nivelRisco(
            r.probabilidade as number | null,
            r.severidade as number | null
          ),
          nivelResidual: nivelRisco(
            r.probabilidade_residual as number | null,
            r.severidade_residual as number | null
          ),
        })),
        treinamentos: medidas
          .filter((m) => m.tipo === "treinamento")
          .map((m) => ({
            descricao: m.descricao as string,
            recorrencia_meses: m.recorrencia_meses as number | null,
          })),
        epis: medidas
          .filter((m) => m.tipo === "epi")
          .map((m) => ({
            descricao: m.descricao as string,
            epi_ca: m.epi_ca as string | null,
          })),
      }
    })
    .sort((a, b) => (a.nome ?? "￿").localeCompare(b.nome ?? "￿", "pt-BR"))
}

/** Ordem de Serviço (NR-01) de um FUNCIONÁRIO: suas tarefas e a árvore SST. */
export async function dadosOrdemServico(
  funcionarioId: string
): Promise<DocumentoSst | null> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const [{ data: exec }, nomes, funcoesMap] = await Promise.all([
    admin
      .from("pessoal_atividades_executores")
      .select("id, atividade_id, tempo_min_mes, recorrencia, frequencia")
      .eq("emp_proprietaria_id", emp)
      .eq("funcionario_id", funcionarioId),
    nomesDosUsuarios([funcionarioId]),
    funcoesDosFuncionarios(),
  ])
  if (!exec || exec.length === 0) return null
  let cpf: string | null = null
  const { data: u } = await admin
    .from("usuarios")
    .select("cpf")
    .eq("id", funcionarioId)
    .maybeSingle()
  if (u && typeof u.cpf === "string" && u.cpf.trim() !== "") cpf = u.cpf
  return {
    tipo: "os",
    pessoa: {
      nome: nomes.get(funcionarioId) ?? null,
      documento: cpf,
      complemento: funcoesMap.get(funcionarioId)?.nome ?? null,
    },
    tarefas: await montarDocumentoSst(exec),
  }
}

/** Comunicado de SST de um PRESTADOR (fornecedor): tarefas contratadas. */
export async function dadosComunicadoSst(
  fornecedorId: string
): Promise<DocumentoSst | null> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const [{ data: exec }, { data: f }] = await Promise.all([
    admin
      .from("pessoal_atividades_executores")
      .select("id, atividade_id, tempo_min_mes, recorrencia, frequencia")
      .eq("emp_proprietaria_id", emp)
      .eq("fornecedor_id", fornecedorId),
    admin
      .from("empresa")
      .select("nome_fantasia, nome_razao, cnpj_cpf")
      .eq("id", fornecedorId)
      .maybeSingle(),
  ])
  if (!exec || exec.length === 0) return null
  return {
    tipo: "comunicado",
    pessoa: {
      nome:
        [f?.nome_fantasia, f?.nome_razao].find(
          (v): v is string => typeof v === "string" && v.trim() !== ""
        ) ?? null,
      documento: (f?.cnpj_cpf as string | null) ?? null,
      complemento: "Prestador de serviço",
    },
    tarefas: await montarDocumentoSst(exec),
  }
}

/** Executores agrupados p/ a página de documentos (OS × Comunicado). */
export type PessoaComTarefas = {
  id: string
  nome: string | null
  tarefas: number
}

export async function executoresParaDocumentos(): Promise<{
  funcionarios: PessoaComTarefas[]
  prestadores: PessoaComTarefas[]
}> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data } = await admin
    .from("pessoal_atividades_executores")
    .select("funcionario_id, fornecedor_id")
    .eq("emp_proprietaria_id", emp)
  const contar = (chave: "funcionario_id" | "fornecedor_id") => {
    const m = new Map<string, number>()
    for (const e of data ?? []) {
      const v = e[chave] as string | null
      if (v) m.set(v, (m.get(v) ?? 0) + 1)
    }
    return m
  }
  const porFunc = contar("funcionario_id")
  const porForn = contar("fornecedor_id")
  const [nomesF, nomesP] = await Promise.all([
    nomesDosUsuarios([...porFunc.keys()]),
    nomesDosFornecedores([...porForn.keys()]),
  ])
  const ordenar = (m: Map<string, number>, nomes: Map<string, string>) =>
    [...m.entries()]
      .map(([id, tarefas]) => ({ id, nome: nomes.get(id) ?? null, tarefas }))
      .sort((a, b) => (a.nome ?? "￿").localeCompare(b.nome ?? "￿", "pt-BR"))
  return {
    funcionarios: ordenar(porFunc, nomesF),
    prestadores: ordenar(porForn, nomesP),
  }
}

// ── Resumo para alertas do painel ────────────────────────────────────────────

export type ResumoSST = {
  /** Existe o schema (tabelas criadas)? null = rodar SQL. */
  ativo: boolean
  funcoes: number
  tarefas: number
  /** Treinamentos exigidos faltando ou vencidos (soma na matriz). */
  treinamentosPendentes: number
  funcionariosComPendencia: number
  /** Tarefas nunca avaliadas (avaliada_em null) ou com avaliação vencida (>12m). */
  tarefasSemAvaliacao: number
  /** Atribuições (funcionário×tarefa) com revalidação anual vencida/nunca feita. */
  revalidacoesPendentes: number
  /** GHEs cadastrados. */
  ghes: number
  /** Funcionários com jornada contratada cadastrada. */
  jornadas: number
}

export async function resumoSST(): Promise<ResumoSST> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const hoje = hojeSP()
  const um_ano_atras = somarMeses(hoje, -12)

  const { data: atividades, error } = await admin
    .from("pessoal_atividades")
    .select("id, avaliada_em")
    .eq("emp_proprietaria_id", emp)

  if (error) {
    // schema ainda não criado
    if (["PGRST205", "42P01"].includes(error.code ?? "")) {
      return {
        ativo: false,
        funcoes: 0,
        tarefas: 0,
        treinamentosPendentes: 0,
        funcionariosComPendencia: 0,
        tarefasSemAvaliacao: 0,
        revalidacoesPendentes: 0,
        ghes: 0,
        jornadas: 0,
      }
    }
  }

  const [funcoes, exec, matriz, ghes, jornadas] = await Promise.all([
    admin
      .from("pessoal_funcoes")
      .select("id", { count: "exact", head: true })
      .eq("emp_proprietaria_id", emp),
    admin
      .from("pessoal_atividades_executores")
      .select("avaliado_em")
      .eq("emp_proprietaria_id", emp),
    matrizTreinamento(),
    admin
      .from("pessoal_ghe")
      .select("id", { count: "exact", head: true })
      .eq("emp_proprietaria_id", emp),
    admin
      .from("pessoal_funcionario_jornada")
      .select("funcionario_id")
      .eq("emp_proprietaria_id", emp),
  ])

  const tarefasSemAvaliacao = (atividades ?? []).filter(
    (a) => !a.avaliada_em || (a.avaliada_em as string) < um_ano_atras
  ).length

  const revalidacoesPendentes = (exec.data ?? []).filter(
    (e) => !e.avaliado_em || (e.avaliado_em as string) < um_ano_atras
  ).length

  let treinamentosPendentes = 0
  let funcionariosComPendencia = 0
  for (const l of matriz) {
    if (l.pendentes > 0) {
      funcionariosComPendencia += 1
      treinamentosPendentes += l.pendentes
    }
  }

  return {
    ativo: true,
    funcoes: funcoes.count ?? 0,
    tarefas: (atividades ?? []).length,
    treinamentosPendentes,
    funcionariosComPendencia,
    tarefasSemAvaliacao,
    revalidacoesPendentes,
    ghes: ghes.count ?? 0,
    jornadas: new Set(
      (jornadas.data ?? [])
        .map((j) => j.funcionario_id as string | null)
        .filter(Boolean)
    ).size,
  }
}
