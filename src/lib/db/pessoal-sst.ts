import "server-only"
import { hojeSP, nomesDosUsuarios } from "@/lib/db/comum"
import { tenantAtual } from "@/lib/tenant"

import { somarMeses } from "@/lib/db/treinamentos"
import {
  LIMIAR_ROTINA_PADRAO,
  PESO_PRESENCA,
  nivelRisco,
  type NivelRisco,
} from "@/lib/pessoal-sst-constantes"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Pessoal › Atribuições / SST — camada de leitura.
 *
 * Catálogo de TAREFAS (`pessoal_atividades`) com a árvore SST: ferramentas,
 * perigos, riscos (bruto + residual) e medidas (treinamento/EPI). Cada tarefa
 * tem EXECUTORES (`pessoal_atividades_executores`: funcionário + tempo médio/mês).
 * FUNÇÕES (`pessoal_funcoes`) agrupam o plano de cargos
 * (`pessoal_atribuicoes_cargo`) e os funcionários (`pessoal_funcionario_funcao`).
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
  const [funcoes, vinculos, atividades] = await Promise.all([
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
      .from("pessoal_atividades")
      .select("funcao_id")
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
  const porTarefas = new Map<string, number>()
  for (const a of atividades.data ?? []) {
    if (a.funcao_id) {
      porTarefas.set(a.funcao_id, (porTarefas.get(a.funcao_id) ?? 0) + 1)
    }
  }
  return (funcoes.data ?? []).map((f) => ({
    id: f.id as string,
    nome: f.nome as string | null,
    descricao: f.descricao as string | null,
    ativo: f.ativo !== false,
    funcionarios: porFuncionarios.get(f.id) ?? 0,
    tarefas: porTarefas.get(f.id) ?? 0,
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
 * Compara, para cada funcionário da função, as tarefas que ele executa com o
 * plano de cargos da função:
 * - aderentes: tarefas executadas cuja função é ESTA (atende ao contrato);
 * - foraDaFuncao: tarefas executadas de OUTRA função ou sem função (possível
 *   desvio de função → passivo);
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
  const [exec, atividades, funcoes] = await Promise.all([
    admin
      .from("pessoal_atividades_executores")
      .select("funcionario_id, atividade_id")
      .eq("emp_proprietaria_id", emp)
      .in("funcionario_id", ids),
    admin
      .from("pessoal_atividades")
      .select("id, nome, funcao_id")
      .eq("emp_proprietaria_id", emp),
    admin.from("pessoal_funcoes").select("id, nome").eq("emp_proprietaria_id", emp),
  ])

  const ativById = new Map(
    (atividades.data ?? []).map((a) => [
      a.id as string,
      { nome: a.nome as string | null, funcao_id: a.funcao_id as string | null },
    ])
  )
  const nomeFuncao = new Map(
    (funcoes.data ?? []).map((f) => [f.id as string, f.nome as string | null])
  )
  const execPorFuncionario = new Map<string, string[]>()
  for (const e of exec.data ?? []) {
    if (!e.funcionario_id || !e.atividade_id) continue
    const arr = execPorFuncionario.get(e.funcionario_id) ?? []
    arr.push(e.atividade_id)
    execPorFuncionario.set(e.funcionario_id, arr)
  }

  const planoComAtiv = plano.filter((p) => p.atividade_id)
  const planoLivres = plano.length - planoComAtiv.length

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
      if (a?.funcao_id === funcaoId) {
        aderentes.push({ id: aid, nome: a?.nome ?? null })
      } else {
        foraDaFuncao.push({
          id: aid,
          nome: a?.nome ?? null,
          funcaoNome: a?.funcao_id ? (nomeFuncao.get(a.funcao_id) ?? null) : null,
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
  funcao_id: string | null
  funcaoNome: string | null
  nome: string | null
  descricao: string | null
  recorrencia: string | null
  frequencia: string | null
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
  const [atividades, funcoes, executores, perigos, riscos] = await Promise.all([
    admin
      .from("pessoal_atividades")
      .select(
        "id, funcao_id, nome, descricao, recorrencia, frequencia, presenca, avaliada_em, observacoes"
      )
      .eq("emp_proprietaria_id", emp)
      .order("nome", { ascending: true, nullsFirst: false }),
    admin.from("pessoal_funcoes").select("id, nome").eq("emp_proprietaria_id", emp),
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
  const nomeFuncao = new Map(
    (funcoes.data ?? []).map((f) => [f.id as string, f.nome as string | null])
  )
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
    funcao_id: a.funcao_id as string | null,
    funcaoNome: a.funcao_id ? (nomeFuncao.get(a.funcao_id) ?? null) : null,
    nome: a.nome as string | null,
    descricao: a.descricao as string | null,
    recorrencia: a.recorrencia as string | null,
    frequencia: a.frequencia as string | null,
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
  funcionarioId: string
  nome: string | null
  tempo_min_mes: number | null
  avaliado_em: string | null
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
    .select(
      "id, funcao_id, nome, descricao, recorrencia, frequencia, presenca, avaliada_em, observacoes"
    )
    .eq("id", id)
    .eq("emp_proprietaria_id", emp)
    .maybeSingle()
  if (error || !a) return null

  const [funcao, ferr, per, ris, med, exec] = await Promise.all([
    a.funcao_id
      ? admin.from("pessoal_funcoes").select("nome").eq("id", a.funcao_id).maybeSingle()
      : Promise.resolve({ data: null }),
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
        "id, perigo_id, categoria, probabilidade, severidade, probabilidade_residual, severidade_residual, observacao"
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
      .select("id, funcionario_id, tempo_min_mes, avaliado_em")
      .eq("atividade_id", id),
  ])

  const nomes = await nomesDosUsuarios(
    (exec.data ?? [])
      .map((e) => e.funcionario_id)
      .filter((v): v is string => !!v)
  )

  const nomeFuncao =
    (funcao.data as { nome?: string | null } | null)?.nome ?? null

  return {
    id: a.id as string,
    funcao_id: a.funcao_id as string | null,
    funcaoNome: nomeFuncao,
    nome: a.nome as string | null,
    descricao: a.descricao as string | null,
    recorrencia: a.recorrencia as string | null,
    frequencia: a.frequencia as string | null,
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
      .map((e) => ({
        id: e.id as string,
        funcionarioId: e.funcionario_id as string,
        nome: e.funcionario_id ? (nomes.get(e.funcionario_id) ?? null) : null,
        tempo_min_mes: e.tempo_min_mes as number | null,
        avaliado_em: e.avaliado_em as string | null,
      }))
      .sort((a, b) => (a.nome ?? "￿").localeCompare(b.nome ?? "￿", "pt-BR")),
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
  presencaFisicaPct: number | null
  tarefas: TarefaDoRelatorio[]
  perigos: number
  riscos: RiscoAgregado[]
}

/**
 * Relatório para um conjunto de funcionários: por pessoa traz tempo total,
 * % de presença física (ponderada pelo tempo), tarefas, e perigos/riscos
 * agregados a partir das tarefas que a pessoa executa.
 */
export async function relatorioDeFuncionarios(
  usuarioIds: string[]
): Promise<RelatorioPessoa[]> {
  const ids = [...new Set(usuarioIds.filter(Boolean))]
  if (ids.length === 0) return []
  const admin = await createAdminClient()
  const emp = await tenantAtual()

  const [exec, atividades, perigos, riscos, nomes, funcoesMap] =
    await Promise.all([
      admin
        .from("pessoal_atividades_executores")
        .select("atividade_id, funcionario_id, tempo_min_mes")
        .eq("emp_proprietaria_id", emp)
        .in("funcionario_id", ids),
      admin
        .from("pessoal_atividades")
        .select("id, nome, recorrencia, presenca")
        .eq("emp_proprietaria_id", emp),
      admin
        .from("pessoal_atividades_perigos")
        .select("atividade_id")
        .eq("emp_proprietaria_id", emp),
      admin
        .from("pessoal_atividades_riscos")
        .select(
          "atividade_id, categoria, probabilidade, severidade, probabilidade_residual, severidade_residual"
        )
        .eq("emp_proprietaria_id", emp),
      nomesDosUsuarios(ids),
      funcoesDosFuncionarios(),
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
  const riscosPorAtiv = new Map<string, typeof riscos.data>()
  for (const r of riscos.data ?? []) {
    if (!r.atividade_id) continue
    const arr = riscosPorAtiv.get(r.atividade_id) ?? []
    arr!.push(r)
    riscosPorAtiv.set(r.atividade_id, arr)
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
        recorrencia: (a?.recorrencia as string | null) ?? null,
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
        for (const r of riscosPorAtiv.get(e.atividade_id) ?? []) {
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

    return {
      funcionarioId,
      nome: nomes.get(funcionarioId) ?? null,
      funcaoNome: funcoesMap.get(funcionarioId)?.nome ?? null,
      tempoTotalMin: tempoTotal,
      presencaFisicaPct,
      tarefas: tarefas.sort((a, b) =>
        (b.tempoMinMes ?? 0) - (a.tempoMinMes ?? 0)
      ),
      perigos: perigosTotal,
      riscos: riscos.sort((a, b) => (b.pior?.valor ?? 0) - (a.pior?.valor ?? 0)),
    }
  })
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
      }
    }
  }

  const [funcoes, exec, matriz] = await Promise.all([
    admin
      .from("pessoal_funcoes")
      .select("id", { count: "exact", head: true })
      .eq("emp_proprietaria_id", emp),
    admin
      .from("pessoal_atividades_executores")
      .select("avaliado_em")
      .eq("emp_proprietaria_id", emp),
    matrizTreinamento(),
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
  }
}
