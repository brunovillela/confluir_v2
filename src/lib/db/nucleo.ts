import "server-only"
import { esquemaAusente, lerEmLotes, nomesDosUsuarios as nomesDosUsuariosBase, texto } from "@/lib/db/comum"
import { fotosDosUsuarios } from "@/lib/db/fotos-usuarios"
import { contarMensagens } from "@/lib/db/tarefa-conversa"
import { tenantAtual } from "@/lib/tenant"

import {
  derivarSituacaoTarefa,
  ehPrioridadeTarefa,
  ehRecorrenciaTarefa,
  proximoPrazoRecorrente,
  type PrioridadeTarefa,
  type RecorrenciaTarefa,
  type SituacaoDemanda,
  type SituacaoTarefa,
} from "@/lib/nucleo-constantes"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Núcleo de ferramentas — Demandas · Tarefas · Anomalias. Os três ficam num
 * arquivo só porque compartilham a espinha: a Tarefa aponta (opcionalmente)
 * para uma Demanda, um Projeto ou uma Anomalia. Ver a reforma em
 * `supabase/nucleo-ferramentas.sql`.
 *
 * A Tarefa depende de colunas novas (`demanda_id`, `titulo`); enquanto o SQL
 * não roda, as funções de Tarefa degradam com `disponivel: false`.
 */

const AVISO_SQL =
  "Núcleo ainda não configurado — rode supabase/nucleo-ferramentas.sql no Supabase."

function numero(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null
}

function hojeISO(): string {
  return new Date().toISOString().slice(0, 10)
}

// ── Pessoas ─────────────────────────────────────────────────────────────────

/** Nomes de usuários preferindo nome de guerra (padrão do Núcleo). */
const nomesDosUsuarios = (ids: string[]) => nomesDosUsuariosBase(ids, "guerra")

/** Título dos documentos (procedimentos das tarefas). Sem a coluna/tabela, nenhum. */
async function nomesDosDocumentos(ids: string[]): Promise<Map<string, string>> {
  const mapa = new Map<string, string>()
  const unicos = [...new Set(ids)]
  if (!unicos.length) return mapa
  const admin = await createAdminClient()
  const { data } = await admin.from("fa_documentos").select("id, documento").in("id", unicos)
  for (const d of data ?? []) mapa.set(String(d.id), texto(d.documento) ?? "(documento sem título)")
  return mapa
}

export type OpcaoPessoa = { id: string; nome: string }

/**
 * Pessoas atribuíveis (responsável, demandante, demandado): operadores do
 * sistema (`permissoes`) + coordenadores de departamento. Conjunto pequeno de
 * lideranças reais — cresce conforme os funcionários forem integrados ao painel.
 * `incluir` garante que ids já referenciados apareçam mesmo fora do conjunto.
 */
export async function listarPessoasAtribuiveis(
  incluir: string[] = []
): Promise<OpcaoPessoa[]> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const [{ data: perms }, { data: deptos }] = await Promise.all([
    admin.from("permissoes").select("usuario_id").eq("emp_proprietaria_id", emp),
    admin.from("empresa_departamentos").select("coordenador_id").eq("emp_proprietaria_id", emp),
  ])
  const candidatos = new Set<string>()
  for (const p of perms ?? []) if (p.usuario_id) candidatos.add(p.usuario_id as string)
  for (const d of deptos ?? [])
    if (d.coordenador_id) candidatos.add(d.coordenador_id as string)

  // Só cadastros vivos da entidade; quem já está atribuído (incluir) fica
  // sempre, para salvar não apagar o responsável atual.
  const ids = new Set<string>(incluir.filter(Boolean))
  const lista = [...candidatos]
  for (let de = 0; de < lista.length; de += 200) {
    const { data: vivos } = await admin
      .from("usuarios")
      .select("id")
      .eq("emp_proprietaria_id", emp)
      .not("deletado", "is", true)
      .not("inativo", "is", true)
      .in("id", lista.slice(de, de + 200))
    for (const u of vivos ?? []) ids.add(String(u.id))
  }

  const nomes = await nomesDosUsuarios([...ids])
  return [...nomes.entries()]
    .map(([id, nome]) => ({ id, nome }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
}

// ════════════════════════════════════════════════════════════════════════════
// DEMANDAS
// ════════════════════════════════════════════════════════════════════════════

export type DemandaLinha = {
  id: string
  nome: string | null
  situacao: string | null
  prazo: string | null
  orcamento: number | null
  responsavelNome: string | null
  responsavelFotoUrl: string | null
  tarefasTotal: number
  tarefasConcluidas: number
}

export async function listarDemandas(filtro: {
  busca?: string
  /** Uma situação, ou "abertas" (tudo que não está Feito). */
  situacao?: string
  /** Tipo da demanda (ex.: "Feedback do sistema"). */
  tipo?: string
} = {}): Promise<DemandaLinha[]> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const busca = (filtro.busca ?? "").trim()

  // Em lotes: o PostgREST corta em 1.000 linhas.
  let linhas: (Record<string, unknown> & { id: string })[]
  try {
    linhas = await lerEmLotes<Record<string, unknown> & { id: string }>((de, ate) => {
      let query = admin
        .from("demandas")
        .select("id, nome, situacao, prazo, orcamento, membro_responsavel_id")
        .eq("emp_proprietaria_id", emp)
      if (busca) query = query.ilike("nome", `%${busca}%`)
      if (filtro.situacao === "abertas") query = query.neq("situacao", "Feito")
      else if (filtro.situacao) query = query.eq("situacao", filtro.situacao)
      if (filtro.tipo) query = query.eq("tipo", filtro.tipo)
      return query
        .order("prazo", { ascending: true, nullsFirst: false })
        .order("nome", { ascending: true })
        .order("id")
        .range(de, ate)
    })
  } catch (error) {
    throw new Error(`Falha ao listar demandas: ${(error as Error).message}`)
  }

  const idsResponsaveis = linhas.map((d) => d.membro_responsavel_id as string).filter(Boolean)
  const [responsaveis, fotos] = await Promise.all([
    nomesDosUsuarios(idsResponsaveis),
    fotosDosUsuarios(idsResponsaveis),
  ])
  const contagem = await contarTarefasPorPai(
    "demanda_id",
    linhas.map((d) => d.id)
  )

  return linhas.map((d) => {
    const c = contagem.get(d.id) ?? { total: 0, concluidas: 0 }
    return {
      id: d.id as string,
      nome: texto(d.nome),
      situacao: texto(d.situacao),
      prazo: texto(d.prazo),
      orcamento: numero(d.orcamento),
      responsavelNome: d.membro_responsavel_id
        ? (responsaveis.get(d.membro_responsavel_id as string) ?? null)
        : null,
      responsavelFotoUrl: d.membro_responsavel_id
        ? (fotos.get(d.membro_responsavel_id as string) ?? null)
        : null,
      tarefasTotal: c.total,
      tarefasConcluidas: c.concluidas,
    }
  })
}

export async function resumoDemandas(): Promise<{
  total: number
  aFazer: number
  fazendo: number
  feito: number
}> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  // Contagem no banco: ler as linhas e contar em JS parava nas 1.000 que o
  // PostgREST devolve.
  const contar = async (situacao?: string) => {
    let q = admin.from("demandas").select("id", { count: "exact", head: true }).eq("emp_proprietaria_id", emp)
    if (situacao) q = q.eq("situacao", situacao)
    const { count } = await q
    return count ?? 0
  }
  const [total, aFazer, fazendo, feito] = await Promise.all([
    contar(),
    contar("A fazer"),
    contar("Fazendo"),
    contar("Feito"),
  ])
  return { total, aFazer, fazendo, feito }
}

export type DetalheDemanda = {
  id: string
  nome: string | null
  descricao: string | null
  situacao: string | null
  prazo: string | null
  orcamento: number | null
  responsavelId: string | null
  responsavelNome: string | null
  /** Quem abriu a demanda. Nulo nas linhas antigas (nao havia a coluna). */
  criadoPorId: string | null
  criadoPorNome: string | null
  /** Projeto dono da demanda (a "demanda do projeto"); nulo nas comuns. */
  projetoId: string | null
  projetoNome: string | null
  tarefas: TarefaLinha[]
}

const COLS_DEMANDA =
  "id, nome, descricao, situacao, prazo, orcamento, membro_responsavel_id, projeto_id"

export async function obterDemanda(id: string): Promise<DetalheDemanda | null> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()

  // `criado_por` é coluna nova (supabase/demandas-criador.sql). Antes de o SQL
  // rodar ela não existe, e pedi-la derrubaria a consulta inteira — a página da
  // demanda deixaria de abrir. Por isso a leitura tenta com a coluna e volta
  // sem ela; o único efeito é a exclusão não aparecer até o SQL ser aplicado.
  let d: Record<string, unknown> | null = null
  const comCriador = await admin
    .from("demandas")
    .select(`${COLS_DEMANDA}, criado_por`)
    .eq("id", id)
    .eq("emp_proprietaria_id", emp)
    .maybeSingle()
  if (comCriador.error) {
    const semCriador = await admin
      .from("demandas")
      .select(COLS_DEMANDA)
      .eq("id", id)
      .eq("emp_proprietaria_id", emp)
      .maybeSingle()
    d = semCriador.data as Record<string, unknown> | null
  } else {
    d = comCriador.data as Record<string, unknown> | null
  }
  if (!d) return null

  const responsavelId = texto(d.membro_responsavel_id)
  const criadoPorId = texto(d.criado_por)
  const projetoId = texto(d.projeto_id)
  const [nomes, tarefas, projeto] = await Promise.all([
    nomesDosUsuarios(
      [responsavelId, criadoPorId].filter((v): v is string => Boolean(v))
    ),
    listarTarefas({ paiTipo: "demanda", paiId: id }),
    projetoId
      ? admin.from("projeto").select("descricao_sumaria").eq("id", projetoId).eq("emp_proprietaria_id", emp).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  return {
    id: d.id as string,
    nome: texto(d.nome),
    descricao: texto(d.descricao),
    situacao: texto(d.situacao),
    prazo: texto(d.prazo),
    orcamento: numero(d.orcamento),
    responsavelId,
    responsavelNome: responsavelId ? (nomes.get(responsavelId) ?? null) : null,
    criadoPorId,
    criadoPorNome: criadoPorId ? (nomes.get(criadoPorId) ?? null) : null,
    projetoId,
    projetoNome: projetoId ? (texto(projeto.data?.descricao_sumaria) ?? "(projeto sem título)") : null,
    tarefas: tarefas.tarefas,
  }
}

// ── Demanda do projeto ──────────────────────────────────────────────────────

/**
 * A demanda que é DO projeto (`demandas.projeto_id`): o projeto a cria
 * sozinho quando recebe a primeira tarefa, e as tarefas dele seguem a rotina
 * de qualquer demanda. No máximo uma por projeto (índice único) — com duas
 * abas criando ao mesmo tempo, a segunda lê a da primeira.
 */
export async function demandaDoProjeto(projetoId: string): Promise<{ id: string; situacao: string | null } | null> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("demandas")
    .select("id, situacao")
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("projeto_id", projetoId)
    .maybeSingle()
  return data ? { id: String(data.id), situacao: texto(data.situacao) } : null
}

export async function garantirDemandaDoProjeto(
  projetoId: string,
  usuarioId: string
): Promise<{ id?: string; erro?: string }> {
  const existente = await demandaDoProjeto(projetoId)
  if (existente) return { id: existente.id }

  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data: p } = await admin
    .from("projeto")
    .select("descricao_sumaria, termino_previsao, finalizado")
    .eq("id", projetoId)
    .eq("emp_proprietaria_id", emp)
    .maybeSingle()
  if (!p) return { erro: "Projeto não encontrado." }

  const { data, error } = await admin
    .from("demandas")
    .insert({
      nome: `Projeto: ${texto(p.descricao_sumaria) ?? "(sem título)"}`,
      descricao: "Demanda criada pelo projeto para reunir as tarefas dele.",
      situacao: p.finalizado === true ? "Feito" : "Fazendo",
      prazo: texto(p.termino_previsao),
      membro_responsavel_id: usuarioId,
      criado_por: usuarioId,
      projeto_id: projetoId,
      emp_proprietaria_id: emp,
    })
    .select("id")
    .single()
  if (!error) return { id: String(data.id) }
  // Outra aba criou no mesmo instante (índice único): usa a dela.
  const criada = await demandaDoProjeto(projetoId)
  if (criada) return { id: criada.id }
  return { erro: `Falha ao criar a demanda do projeto: ${error.message}` }
}

export type DadosDemanda = {
  nome: string
  descricao: string | null
  situacao: SituacaoDemanda
  prazo: string | null
  orcamento: number | null
  membro_responsavel_id: string | null
  /** Origem da demanda (ex.: "Feedback do sistema"); o formulário não preenche. */
  tipo?: string | null
}

export async function criarDemanda(
  dados: DadosDemanda,
  criadoPor: string
): Promise<{ id?: string; erro?: string }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data, error } = await admin
    .from("demandas")
    .insert({ ...dados, criado_por: criadoPor, emp_proprietaria_id: emp })
    .select("id")
    .single()
  if (!error) return { id: data.id as string }

  // Antes de supabase/demandas-criador.sql rodar, a coluna nao existe: cria sem
  // ela em vez de impedir o cadastro. (Essa demanda ficara sem criador.)
  const semCriador = await admin
    .from("demandas")
    .insert({ ...dados, emp_proprietaria_id: emp })
    .select("id")
    .single()
  if (semCriador.error) {
    return { erro: `Falha ao criar demanda: ${semCriador.error.message}` }
  }
  return { id: semCriador.data.id as string }
}

/**
 * O que a exclusão de uma demanda leva junto — contado ANTES de apagar, para a
 * tela poder avisar. As tarefas entram em `tarefas` mas NÃO são apagadas: elas
 * pertencem à área Tarefas (mesma tabela usada por projetos e anomalias) e
 * podem ser de outra pessoa, então são apenas desligadas da demanda. É o que a
 * própria chave estrangeira já dizia — `demanda_id` é `on delete set null`,
 * enquanto checklists e comentários são `no action`.
 */
export type ResumoExclusaoDemanda = {
  tarefas: number
  checklists: number
  comentarios: number
}

export async function resumoExclusaoDemanda(
  id: string
): Promise<ResumoExclusaoDemanda> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const contar = async (
    tabela: "demandas_check_tarefas" | "demandas_check" | "demandas_comentarios"
  ): Promise<number> => {
    const { count } = await admin
      .from(tabela)
      .select("id", { count: "exact", head: true })
      .eq("emp_proprietaria_id", emp)
      .eq("demanda_id", id)
    return count ?? 0
  }
  const [tarefas, checklists, comentarios] = await Promise.all([
    contar("demandas_check_tarefas"),
    contar("demandas_check"),
    contar("demandas_comentarios"),
  ])
  return { tarefas, checklists, comentarios }
}

/**
 * Apaga a demanda e o que só existe dentro dela. As chaves estrangeiras são
 * `no action`, então a limpeza é EXPLÍCITA e na ordem certa — um delete direto
 * falharia com erro de integridade.
 */
export async function excluirDemanda(id: string): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()

  // 1. As tarefas SOBREVIVEM: perdem o vínculo com a demanda e com o checklist.
  const { data: checklists } = await admin
    .from("demandas_check")
    .select("id")
    .eq("emp_proprietaria_id", emp)
    .eq("demanda_id", id)
  const idsChecklists = (checklists ?? []).map((c) => c.id as string)

  const { error: erroTarefas } = await admin
    .from("demandas_check_tarefas")
    .update({ demanda_id: null, checklist_id: null })
    .eq("emp_proprietaria_id", emp)
    .eq("demanda_id", id)
  if (erroTarefas) {
    return { erro: `Falha ao desvincular as tarefas: ${erroTarefas.message}` }
  }

  // Tarefas ligadas ao checklist mas sem `demanda_id` preenchido também travam.
  if (idsChecklists.length > 0) {
    await admin
      .from("demandas_check_tarefas")
      .update({ checklist_id: null })
      .eq("emp_proprietaria_id", emp)
      .in("checklist_id", idsChecklists)
  }

  // 2. Checklists e comentários só existem dentro da demanda.
  const { error: erroCheck } = await admin
    .from("demandas_check")
    .delete()
    .eq("emp_proprietaria_id", emp)
    .eq("demanda_id", id)
  if (erroCheck) {
    return { erro: `Falha ao apagar os checklists: ${erroCheck.message}` }
  }

  await admin
    .from("demandas_comentarios")
    .delete()
    .eq("emp_proprietaria_id", emp)
    .eq("demanda_id", id)

  // 3. A demanda.
  const { error } = await admin
    .from("demandas")
    .delete()
    .eq("emp_proprietaria_id", emp)
    .eq("id", id)
  if (error) return { erro: `Falha ao excluir a demanda: ${error.message}` }
  return {}
}

export async function atualizarDemanda(
  id: string,
  dados: DadosDemanda
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin
    .from("demandas")
    .update({ ...dados, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: `Falha ao salvar demanda: ${error.message}` }
  return {}
}

export async function definirSituacaoDemanda(
  id: string,
  situacao: SituacaoDemanda
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin
    .from("demandas")
    .update({ situacao, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: `Falha ao atualizar situação: ${error.message}` }
  return {}
}

// ════════════════════════════════════════════════════════════════════════════
// TAREFAS (a espinha)
// ════════════════════════════════════════════════════════════════════════════

const COLS_TAREFA =
  "id, titulo, concluido, tipo, prioridade, recorrencia, procedimento_id, data_prazo_entrega, data_entrega, demandante_id, demandado_id, demanda_id, projeto_id, anomalia_id"

async function contarTarefasPorPai(
  coluna: "demanda_id" | "projeto_id" | "anomalia_id",
  ids: string[]
): Promise<Map<string, { total: number; concluidas: number }>> {
  const mapa = new Map<string, { total: number; concluidas: number }>()
  const unicos = [...new Set(ids.filter(Boolean))]
  if (unicos.length === 0) return mapa
  const admin = await createAdminClient()
  // Fatias de 200 ids, cada uma em lotes: o PostgREST corta em 1.000 linhas e
  // a contagem das demandas além disso saía zerada.
  const data: LinhaTarefaBruta[] = []
  try {
    for (let i = 0; i < unicos.length; i += 200) {
      const fatia = unicos.slice(i, i + 200)
      data.push(
        ...(await lerEmLotes<LinhaTarefaBruta>((de, ate) =>
          admin
            .from("demandas_check_tarefas")
            .select(`id, ${coluna}, concluido`)
            .in(coluna, fatia)
            .order("id")
            .range(de, ate)
        ))
      )
    }
  } catch {
    return mapa // coluna ausente antes do SQL → sem contagem
  }
  for (const linha of data) {
    const pid = linha[coluna] as string | null
    if (!pid) continue
    const atual = mapa.get(pid) ?? { total: 0, concluidas: 0 }
    atual.total += 1
    if (linha.concluido === true) atual.concluidas += 1
    mapa.set(pid, atual)
  }
  return mapa
}

export type TarefaLinha = {
  id: string
  titulo: string | null
  situacao: SituacaoTarefa
  concluido: boolean
  prazo: string | null
  prioridade: PrioridadeTarefa
  /** De quanto em quanto tempo se repete (nulo = não repete). */
  recorrencia: RecorrenciaTarefa | null
  /** Quantas mensagens a conversa da tarefa tem. */
  mensagens: number
  /** Documento com o procedimento que a tarefa segue. */
  procedimentoId: string | null
  procedimentoNome: string | null
  demandanteNome: string | null
  /** Responsável: o id serve à edição da tarefa. */
  demandadoId: string | null
  demandadoNome: string | null
  demandadoFotoUrl: string | null
  paiTipo: "demanda" | "projeto" | "anomalia" | null
  paiId: string | null
  paiNome: string | null
}

export type FiltroTarefas = {
  busca?: string
  status?: "pendentes" | "concluidas" | "atrasadas" | "todas"
  demandadoId?: string
  /** Restringe a um pai específico (usado nos detalhes de Demanda/Anomalia). */
  paiTipo?: "demanda" | "projeto" | "anomalia"
  paiId?: string
}

export async function listarTarefas(
  filtro: FiltroTarefas = {}
): Promise<{ disponivel: boolean; aviso?: string; tarefas: TarefaLinha[] }> {
  const admin = await createAdminClient()
  let query = admin
    .from("demandas_check_tarefas")
    .select(COLS_TAREFA)
    .eq("emp_proprietaria_id", await tenantAtual())

  const busca = (filtro.busca ?? "").trim()
  if (busca) query = query.ilike("titulo", `%${busca}%`)
  if (filtro.demandadoId) query = query.eq("demandado_id", filtro.demandadoId)
  if (filtro.paiTipo === "projeto" && filtro.paiId) {
    // As do projeto e as que entraram direto na demanda do projeto.
    const demanda = await demandaDoProjeto(filtro.paiId)
    query = demanda
      ? query.or(`projeto_id.eq.${filtro.paiId},demanda_id.eq.${demanda.id}`)
      : query.eq("projeto_id", filtro.paiId)
  } else if (filtro.paiTipo && filtro.paiId) {
    query = query.eq(`${filtro.paiTipo}_id`, filtro.paiId)
  }

  const hoje = hojeISO()
  if (filtro.status === "concluidas") query = query.eq("concluido", true)
  else if (filtro.status === "pendentes") query = query.not("concluido", "is", true)
  else if (filtro.status === "atrasadas")
    query = query.not("concluido", "is", true).lt("data_prazo_entrega", hoje)

  const { data, error } = await query
    .order("data_prazo_entrega", { ascending: true, nullsFirst: false })
    .limit(500)
  if (error) {
    if (esquemaAusente(error)) return { disponivel: false, aviso: AVISO_SQL, tarefas: [] }
    throw new Error(`Falha ao listar tarefas: ${error.message}`)
  }

  const linhas = data ?? []
  const [nomes, fotos] = await Promise.all([
    nomesDosUsuarios(
      linhas.flatMap((t) => [t.demandante_id, t.demandado_id]).filter(Boolean) as string[]
    ),
    fotosDosUsuarios(linhas.map((t) => t.demandado_id as string | null)),
  ])
  const [paiNomes, mensagens, procedimentos] = await Promise.all([
    resolverNomesDosPais(linhas),
    contarMensagens(linhas.map((t) => String(t.id))),
    nomesDosDocumentos(linhas.map((t) => texto(t.procedimento_id)).filter((v): v is string => !!v)),
  ])

  return {
    disponivel: true,
    tarefas: linhas.map((t) => {
      const { tipo, id, nome } = paiDaTarefa(t, paiNomes)
      return {
        id: t.id as string,
        titulo: texto(t.titulo),
        situacao: derivarSituacaoTarefa(
          t.concluido as boolean | null,
          texto(t.data_prazo_entrega),
          hoje
        ),
        concluido: t.concluido === true,
        prazo: texto(t.data_prazo_entrega),
        prioridade: ehPrioridadeTarefa(t.prioridade) ? t.prioridade : "media",
        recorrencia: ehRecorrenciaTarefa(t.recorrencia) ? t.recorrencia : null,
        mensagens: mensagens.get(String(t.id)) ?? 0,
        procedimentoId: texto(t.procedimento_id),
        procedimentoNome: t.procedimento_id ? (procedimentos.get(String(t.procedimento_id)) ?? null) : null,
        demandanteNome: t.demandante_id
          ? (nomes.get(t.demandante_id as string) ?? null)
          : null,
        demandadoId: texto(t.demandado_id),
        demandadoNome: t.demandado_id
          ? (nomes.get(t.demandado_id as string) ?? null)
          : null,
        demandadoFotoUrl: t.demandado_id
          ? (fotos.get(t.demandado_id as string) ?? null)
          : null,
        paiTipo: tipo,
        paiId: id,
        paiNome: nome,
      }
    }),
  }
}

type LinhaTarefaBruta = Record<string, unknown>

function paiDaTarefa(
  t: LinhaTarefaBruta,
  nomes: { demandas: Map<string, string>; projetos: Map<string, string>; anomalias: Map<string, string> }
): { tipo: "demanda" | "projeto" | "anomalia" | null; id: string | null; nome: string | null } {
  // Tarefa de projeto também está na demanda do projeto: mostra o projeto.
  if (t.projeto_id)
    return { tipo: "projeto", id: t.projeto_id as string, nome: nomes.projetos.get(t.projeto_id as string) ?? null }
  if (t.demanda_id)
    return { tipo: "demanda", id: t.demanda_id as string, nome: nomes.demandas.get(t.demanda_id as string) ?? null }
  if (t.anomalia_id)
    return { tipo: "anomalia", id: t.anomalia_id as string, nome: nomes.anomalias.get(t.anomalia_id as string) ?? null }
  return { tipo: null, id: null, nome: null }
}

async function resolverNomesDosPais(linhas: LinhaTarefaBruta[]) {
  const admin = await createAdminClient()
  const demandaIds = [...new Set(linhas.map((t) => t.demanda_id).filter(Boolean))] as string[]
  const projetoIds = [...new Set(linhas.map((t) => t.projeto_id).filter(Boolean))] as string[]
  const anomaliaIds = [...new Set(linhas.map((t) => t.anomalia_id).filter(Boolean))] as string[]

  const [demandas, projetos, anomalias] = await Promise.all([
    demandaIds.length
      ? admin.from("demandas").select("id, nome").in("id", demandaIds)
      : Promise.resolve({ data: [] }),
    projetoIds.length
      ? admin.from("projeto").select("id, descricao_sumaria").in("id", projetoIds)
      : Promise.resolve({ data: [] }),
    anomaliaIds.length
      ? admin.from("ferramentas_anomalias").select("id, fato").in("id", anomaliaIds)
      : Promise.resolve({ data: [] }),
  ])
  return {
    demandas: new Map((demandas.data ?? []).map((d) => [d.id as string, texto(d.nome) ?? ""])),
    projetos: new Map((projetos.data ?? []).map((p) => [p.id as string, texto(p.descricao_sumaria) ?? ""])),
    anomalias: new Map((anomalias.data ?? []).map((a) => [a.id as string, texto(a.fato) ?? ""])),
  }
}

export type DadosTarefa = {
  titulo: string
  tipo: string | null
  data_prazo_entrega: string | null
  demandante_id: string | null
  demandado_id: string | null
  prioridade?: PrioridadeTarefa
  recorrencia?: RecorrenciaTarefa | null
  procedimento_id?: string | null
  /** Pai opcional — no máximo um preenchido. */
  demanda_id?: string | null
  projeto_id?: string | null
  anomalia_id?: string | null
}

export async function criarTarefa(
  dados: DadosTarefa
): Promise<{ id?: string; erro?: string }> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("demandas_check_tarefas")
    .insert({
      titulo: dados.titulo,
      tipo: dados.tipo,
      data_prazo_entrega: dados.data_prazo_entrega,
      demandante_id: dados.demandante_id,
      demandado_id: dados.demandado_id,
      prioridade: dados.prioridade ?? "media",
      recorrencia: dados.recorrencia ?? null,
      procedimento_id: dados.procedimento_id ?? null,
      demanda_id: dados.demanda_id ?? null,
      projeto_id: dados.projeto_id ?? null,
      anomalia_id: dados.anomalia_id ?? null,
      concluido: false,
      emp_proprietaria_id: await tenantAtual(),
    })
    .select("id")
    .single()
  if (error) {
    if (esquemaAusente(error)) return { erro: AVISO_SQL }
    return { erro: `Falha ao criar tarefa: ${error.message}` }
  }
  return { id: data.id as string }
}

export async function atualizarTarefa(
  id: string,
  dados: DadosTarefa
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin
    .from("demandas_check_tarefas")
    .update({
      titulo: dados.titulo,
      tipo: dados.tipo,
      data_prazo_entrega: dados.data_prazo_entrega,
      demandante_id: dados.demandante_id,
      demandado_id: dados.demandado_id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: `Falha ao salvar tarefa: ${error.message}` }
  return {}
}

// ── Vincular, desvincular e finalizar junto ────────────────────────────────

export type TarefaAvulsa = { id: string; titulo: string | null; prazo: string | null; demandadoNome: string | null }

/** Tarefas pendentes sem vínculo nenhum — as que dá para trazer para uma demanda ou projeto. */
export async function listarTarefasAvulsas(): Promise<TarefaAvulsa[]> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("demandas_check_tarefas")
    .select("id, titulo, data_prazo_entrega, demandado_id")
    .eq("emp_proprietaria_id", await tenantAtual())
    .is("demanda_id", null)
    .is("projeto_id", null)
    .is("anomalia_id", null)
    .not("concluido", "is", true)
    .order("data_prazo_entrega", { ascending: true, nullsFirst: false })
    .limit(300)
  if (error) return []
  const nomes = await nomesDosUsuarios((data ?? []).map((t) => t.demandado_id as string).filter(Boolean))
  return (data ?? []).map((t) => ({
    id: String(t.id),
    titulo: texto(t.titulo),
    prazo: texto(t.data_prazo_entrega),
    demandadoNome: t.demandado_id ? (nomes.get(String(t.demandado_id)) ?? null) : null,
  }))
}

/**
 * Traz uma tarefa AVULSA para a demanda (e, se a demanda é de um projeto,
 * para o projeto também). Tarefa que já tem vínculo não muda: primeiro se
 * desvincula de onde está.
 */
export async function vincularTarefa(
  tarefaId: string,
  pai: { demandaId: string; projetoId: string | null }
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("demandas_check_tarefas")
    .update({ demanda_id: pai.demandaId, projeto_id: pai.projetoId, updated_at: new Date().toISOString() })
    .eq("id", tarefaId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .is("demanda_id", null)
    .is("projeto_id", null)
    .is("anomalia_id", null)
    .select("id")
  if (error) return { erro: `Falha ao vincular a tarefa: ${error.message}` }
  if (!data?.length) return { erro: "Esta tarefa já tem vínculo. Desvincule-a de onde está antes." }
  return {}
}

/** Filtro "tarefas da demanda e/ou do projeto" no formato do PostgREST. */
function filtroDoPai(de: { demandaId?: string | null; projetoId?: string | null }): string | null {
  const partes = [
    de.demandaId ? `demanda_id.eq.${de.demandaId}` : null,
    de.projetoId ? `projeto_id.eq.${de.projetoId}` : null,
  ].filter(Boolean)
  return partes.length ? partes.join(",") : null
}

/**
 * Tira a tarefa da demanda e do projeto: ela continua existindo, avulsa, com
 * o mesmo responsável. Só mexe se ela é mesmo da demanda ou do projeto da
 * tela (o formulário não escolhe tarefa de outro lugar).
 */
export async function desvincularTarefa(
  tarefaId: string,
  de: { demandaId: string | null; projetoId: string | null }
): Promise<{ erro?: string }> {
  const filtro = filtroDoPai(de)
  if (!filtro) return { erro: "Vínculo inválido." }
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("demandas_check_tarefas")
    .update({ demanda_id: null, projeto_id: null, checklist_id: null, updated_at: new Date().toISOString() })
    .eq("id", tarefaId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .or(filtro)
    .select("id")
  if (error) return { erro: `Falha ao desvincular a tarefa: ${error.message}` }
  if (!data?.length) return { erro: "A tarefa não pertence a esta demanda ou projeto." }
  return {}
}

/** Quantas tarefas ainda abertas a demanda e/ou o projeto têm (para o aviso antes de finalizar). */
export async function contarTarefasPendentes(de: { demandaId?: string | null; projetoId?: string | null }): Promise<number> {
  const filtro = filtroDoPai(de)
  if (!filtro) return 0
  const admin = await createAdminClient()
  const { count } = await admin
    .from("demandas_check_tarefas")
    .select("id", { count: "exact", head: true })
    .eq("emp_proprietaria_id", await tenantAtual())
    .not("concluido", "is", true)
    .or(filtro)
  return count ?? 0
}

/**
 * Finalizar a demanda ou o projeto conclui as tarefas que ainda estavam
 * abertas, com a data de hoje. Reabrir depois não as reabre.
 */
export async function concluirTarefasPendentes(
  de: { demandaId?: string | null; projetoId?: string | null }
): Promise<{ concluidas: number; erro?: string }> {
  const filtro = filtroDoPai(de)
  if (!filtro) return { concluidas: 0 }
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("demandas_check_tarefas")
    .update({ concluido: true, data_entrega: hojeISO(), updated_at: new Date().toISOString() })
    .eq("emp_proprietaria_id", await tenantAtual())
    .not("concluido", "is", true)
    .or(filtro)
    .select("id")
  if (error) return { concluidas: 0, erro: `Falha ao concluir as tarefas: ${error.message}` }
  return { concluidas: data?.length ?? 0 }
}

/**
 * Edição pela tela (título, responsável, prazo e prioridade): só esses mudam — o
 * tipo e o demandante, que o formulário não mostra, ficam como estão.
 * Devolve o responsável de antes, para avisar só quando ele muda.
 */
export async function editarTarefa(
  id: string,
  dados: {
    titulo: string
    demandado_id: string | null
    data_prazo_entrega: string | null
    prioridade: PrioridadeTarefa
    recorrencia: RecorrenciaTarefa | null
    procedimento_id: string | null
  }
): Promise<{ erro?: string; responsavelAnterior?: string | null }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data: antes } = await admin
    .from("demandas_check_tarefas")
    .select("demandado_id")
    .eq("id", id)
    .eq("emp_proprietaria_id", emp)
    .maybeSingle()
  if (!antes) return { erro: "Tarefa não encontrada." }
  const { error } = await admin
    .from("demandas_check_tarefas")
    .update({ ...dados, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("emp_proprietaria_id", emp)
  if (error) return { erro: `Falha ao salvar a tarefa: ${error.message}` }
  return { responsavelAnterior: texto(antes.demandado_id) }
}

/** Apaga a tarefa (os departamentos ligados a ela vão junto, pela chave em cascata). */
export async function excluirTarefa(id: string): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("demandas_check_tarefas")
    .delete()
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
    .select("id")
  if (error) return { erro: `Falha ao excluir a tarefa: ${error.message}` }
  if (!data?.length) return { erro: "Tarefa não encontrada." }
  return {}
}

/** De onde a tarefa é (para revalidar a página certa depois de editar ou excluir). */
export async function paisDaTarefa(id: string): Promise<{ demandaId: string | null; projetoId: string | null; anomaliaId: string | null } | null> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("demandas_check_tarefas")
    .select("demanda_id, projeto_id, anomalia_id")
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (!data) return null
  return { demandaId: texto(data.demanda_id), projetoId: texto(data.projeto_id), anomaliaId: texto(data.anomalia_id) }
}

/** Tarefas abertas de que a pessoa é a responsável, e quantas estão atrasadas (Meu perfil). */
export async function resumoMinhasTarefas(usuarioId: string): Promise<{ abertas: number; atrasadas: number }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const base = () =>
    admin
      .from("demandas_check_tarefas")
      .select("id", { count: "exact", head: true })
      .eq("emp_proprietaria_id", emp)
      .eq("demandado_id", usuarioId)
      .not("concluido", "is", true)
  const [abertas, atrasadas] = await Promise.all([base(), base().lt("data_prazo_entrega", hojeISO())])
  return { abertas: abertas.count ?? 0, atrasadas: atrasadas.count ?? 0 }
}

/** O responsável (demandado) da tarefa: ele pode concluir a própria tarefa sem a permissão de Tarefas. */
export async function responsavelDaTarefa(id: string): Promise<string | null> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("demandas_check_tarefas")
    .select("demandado_id")
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  return data ? texto(data.demandado_id) : null
}

/** A anomalia a que a tarefa pertence (ou null) — decide quem pode mexer nela. */
export async function anomaliaDaTarefa(id: string): Promise<string | null> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("demandas_check_tarefas")
    .select("anomalia_id")
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  return (data?.anomalia_id as string | null) ?? null
}

export async function definirConclusaoTarefa(
  id: string,
  concluido: boolean
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin
    .from("demandas_check_tarefas")
    .update({
      concluido,
      data_entrega: concluido ? hojeISO() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: `Falha ao atualizar tarefa: ${error.message}` }
  return {}
}

/**
 * Tarefa RECORRENTE concluída: cria a próxima, igual (título, responsável,
 * quem pediu, prioridade, vínculo e repetição), com o prazo avançado de um
 * período, e guarda o elo em `recorrencia_proxima_id` — reabrir e concluir de
 * novo não cria outra. Sem repetição ou sem prazo, nada acontece.
 */
export async function gerarProximaRecorrencia(id: string): Promise<{ erro?: string; prazo?: string }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data: t, error } = await admin
    .from("demandas_check_tarefas")
    .select("titulo, tipo, prioridade, recorrencia, recorrencia_proxima_id, procedimento_id, data_prazo_entrega, demandante_id, demandado_id, demanda_id, projeto_id, anomalia_id, concluido")
    .eq("id", id)
    .eq("emp_proprietaria_id", emp)
    .maybeSingle()
  if (error) return { erro: `Falha ao ler a tarefa: ${error.message}` }
  const prazo = texto(t?.data_prazo_entrega)
  if (!t || t.concluido !== true || !ehRecorrenciaTarefa(t.recorrencia) || !prazo || t.recorrencia_proxima_id) return {}
  const proximo = proximoPrazoRecorrente(prazo, t.recorrencia)
  const { data: nova, error: erroNova } = await admin
    .from("demandas_check_tarefas")
    .insert({
      titulo: t.titulo,
      tipo: t.tipo,
      prioridade: ehPrioridadeTarefa(t.prioridade) ? t.prioridade : "media",
      recorrencia: t.recorrencia,
      procedimento_id: t.procedimento_id,
      data_prazo_entrega: proximo,
      demandante_id: t.demandante_id,
      demandado_id: t.demandado_id,
      demanda_id: t.demanda_id,
      projeto_id: t.projeto_id,
      anomalia_id: t.anomalia_id,
      concluido: false,
      emp_proprietaria_id: emp,
    })
    .select("id")
    .single()
  if (erroNova) return { erro: `A tarefa foi concluída, mas a próxima não foi criada: ${erroNova.message}` }
  await admin
    .from("demandas_check_tarefas")
    .update({ recorrencia_proxima_id: nova.id })
    .eq("id", id)
    .eq("emp_proprietaria_id", emp)
  return { prazo: proximo }
}

// ════════════════════════════════════════════════════════════════════════════
// ANOMALIAS (RCA)
// ════════════════════════════════════════════════════════════════════════════

export type AnomaliaLinha = {
  id: string
  fato: string | null
  dataOcorrencia: string | null
  responsavelNome: string | null
  responsavelFotoUrl: string | null
  investigada: boolean
  tratada: boolean
  eficaciaVerificada: boolean
  providencias: number
}

export async function listarAnomalias(filtro: {
  busca?: string
  estagio?: "abertas" | "verificadas" | "todas"
} = {}): Promise<AnomaliaLinha[]> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const busca = (filtro.busca ?? "").trim()

  // Em lotes: o PostgREST corta em 1.000 linhas.
  let linhas: (Record<string, unknown> & { id: string })[]
  try {
    linhas = await lerEmLotes<Record<string, unknown> & { id: string }>((de, ate) => {
      let query = admin
        .from("ferramentas_anomalias")
        .select(
          "id, fato, data_ocorrencia, responsavel_id, anomalia_investigada, anomalia_tratada, eficacia_verificada"
        )
        .eq("emp_proprietaria_id", emp)
      if (busca) query = query.ilike("fato", `%${busca}%`)
      if (filtro.estagio === "verificadas") query = query.eq("eficacia_verificada", true)
      else if (filtro.estagio === "abertas")
        query = query.not("eficacia_verificada", "is", true)
      return query
        .order("data_ocorrencia", { ascending: false, nullsFirst: false })
        .order("id")
        .range(de, ate)
    })
  } catch (error) {
    throw new Error(`Falha ao listar anomalias: ${(error as Error).message}`)
  }

  const idsResponsaveis = linhas.map((a) => a.responsavel_id as string).filter(Boolean)
  const [responsaveis, fotos] = await Promise.all([
    nomesDosUsuarios(idsResponsaveis),
    fotosDosUsuarios(idsResponsaveis),
  ])
  const contagem = await contarTarefasPorPai(
    "anomalia_id",
    linhas.map((a) => a.id)
  )

  return linhas.map((a) => ({
    id: a.id as string,
    fato: texto(a.fato),
    dataOcorrencia: texto(a.data_ocorrencia),
    responsavelNome: a.responsavel_id
      ? (responsaveis.get(a.responsavel_id as string) ?? null)
      : null,
    responsavelFotoUrl: a.responsavel_id
      ? (fotos.get(a.responsavel_id as string) ?? null)
      : null,
    investigada: a.anomalia_investigada === true,
    tratada: a.anomalia_tratada === true,
    eficaciaVerificada: a.eficacia_verificada === true,
    providencias: contagem.get(a.id)?.total ?? 0,
  }))
}

export async function resumoAnomalias(): Promise<{
  total: number
  abertas: number
  verificadas: number
}> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  // Contagem no banco: ler as linhas e contar em JS parava nas 1.000 que o
  // PostgREST devolve.
  const [{ count: total }, { count: verificadas }] = await Promise.all([
    admin.from("ferramentas_anomalias").select("id", { count: "exact", head: true }).eq("emp_proprietaria_id", emp),
    admin
      .from("ferramentas_anomalias")
      .select("id", { count: "exact", head: true })
      .eq("emp_proprietaria_id", emp)
      .eq("eficacia_verificada", true),
  ])
  return { total: total ?? 0, abertas: (total ?? 0) - (verificadas ?? 0), verificadas: verificadas ?? 0 }
}

export type DetalheAnomalia = {
  id: string
  fato: string | null
  conformidade: string | null
  descricaoDetalhada: string | null
  dataOcorrencia: string | null
  responsavelId: string | null
  responsavelNome: string | null
  investigada: boolean
  tratada: boolean
  eficaciaVerificada: boolean
  causaRaiz: string | null
  porques: (string | null)[]
  providencias: TarefaLinha[]
}

export async function obterAnomalia(id: string): Promise<DetalheAnomalia | null> {
  const admin = await createAdminClient()
  const { data: a } = await admin
    .from("ferramentas_anomalias")
    .select("*")
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (!a) return null

  const responsavelId = texto(a.responsavel_id)
  const [responsaveis, tarefas] = await Promise.all([
    responsavelId ? nomesDosUsuarios([responsavelId]) : Promise.resolve(new Map()),
    listarTarefas({ paiTipo: "anomalia", paiId: id }),
  ])

  return {
    id: a.id as string,
    fato: texto(a.fato),
    conformidade: texto(a.conformidade),
    descricaoDetalhada: texto(a.descricao_detalhada),
    dataOcorrencia: texto(a.data_ocorrencia),
    responsavelId,
    responsavelNome: responsavelId ? (responsaveis.get(responsavelId) ?? null) : null,
    investigada: a.anomalia_investigada === true,
    tratada: a.anomalia_tratada === true,
    eficaciaVerificada: a.eficacia_verificada === true,
    causaRaiz: texto(a.causa_raiz),
    porques: [
      texto(a.investigacao_pq1),
      texto(a.investigacao_pq2),
      texto(a.investigacao_pq3),
      texto(a.investigacao_pq4),
      texto(a.investigacao_pq5),
    ],
    providencias: tarefas.tarefas,
  }
}

export type DadosAnomalia = {
  fato: string
  conformidade: string | null
  descricao_detalhada: string | null
  data_ocorrencia: string | null
  responsavel_id: string | null
  causa_raiz: string | null
  investigacao_pq1: string | null
  investigacao_pq2: string | null
  investigacao_pq3: string | null
  investigacao_pq4: string | null
  investigacao_pq5: string | null
  anomalia_investigada: boolean
  anomalia_tratada: boolean
  eficacia_verificada: boolean
}

export async function criarAnomalia(
  dados: DadosAnomalia
): Promise<{ id?: string; erro?: string }> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("ferramentas_anomalias")
    .insert({ ...dados, emp_proprietaria_id: await tenantAtual() })
    .select("id")
    .single()
  if (error) return { erro: `Falha ao criar anomalia: ${error.message}` }
  return { id: data.id as string }
}

export async function atualizarAnomalia(
  id: string,
  dados: DadosAnomalia
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin
    .from("ferramentas_anomalias")
    .update({ ...dados, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: `Falha ao salvar anomalia: ${error.message}` }
  return {}
}
