"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { hojeSP } from "@/lib/db/comum"
import { analisarSST, sugerirPlanoCargos } from "@/lib/db/pessoal-sst-ia"
import { buscarAtividade } from "@/lib/db/pessoal-sst"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"
import { semAcento } from "@/lib/texto"

async function exigir() {
  await requirePermissao("pessoal_gestao")
}

function txt(fd: FormData, campo: string): string | null {
  const v = String(fd.get(campo) ?? "").trim()
  return v === "" ? null : v
}
function int(fd: FormData, campo: string): number | null {
  const v = txt(fd, campo)
  if (v === null) return null
  const n = Number(v.replace(",", "."))
  return Number.isFinite(n) ? Math.round(n) : null
}
function int1a5(fd: FormData, campo: string): number | null {
  const n = int(fd, campo)
  return n !== null && n >= 1 && n <= 5 ? n : null
}

// ── Configuração do limiar de recorrência ────────────────────────────────────

export async function salvarLimiarRotina(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  await exigir()
  const freq = txt(fd, "sst_rotina_frequencia")
  if (!freq) return { erro: "Escolha uma frequência." }
  const admin = await createAdminClient()
  const { error } = await admin
    .from("empresa")
    .update({ sst_rotina_frequencia: freq })
    .eq("id", await tenantAtual())
  if (error) return { erro: `Não foi possível salvar: ${error.message}` }
  revalidatePath("/painel/pessoal/atribuicoes")
  return { ok: "Limiar de recorrência atualizado." }
}

// ── Funções ──────────────────────────────────────────────────────────────────

export async function criarFuncao(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  await exigir()
  const nome = txt(fd, "nome")
  if (!nome) return { erro: "Informe o nome da função." }
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("pessoal_funcoes")
    .insert({
      nome,
      descricao: txt(fd, "descricao"),
      emp_proprietaria_id: await tenantAtual(),
    })
    .select("id")
    .single()
  if (error || !data) return { erro: `Não foi possível criar: ${error?.message}` }
  revalidatePath("/painel/pessoal/atribuicoes/funcoes")
  redirect(`/painel/pessoal/atribuicoes/funcoes/${data.id}?salvo=1`)
}

export async function atualizarFuncao(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  await exigir()
  const id = txt(fd, "id")
  const nome = txt(fd, "nome")
  if (!id) return { erro: "Função inválida." }
  if (!nome) return { erro: "Informe o nome da função." }
  const admin = await createAdminClient()
  const { error, count } = await admin
    .from("pessoal_funcoes")
    .update(
      {
        nome,
        descricao: txt(fd, "descricao"),
        ativo: fd.get("ativo") === "on",
        updated_at: new Date().toISOString(),
      },
      { count: "exact" }
    )
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: `Não foi possível salvar: ${error.message}` }
  if (count === 0) return { erro: "Função não encontrada." }
  revalidatePath(`/painel/pessoal/atribuicoes/funcoes/${id}`)
  revalidatePath("/painel/pessoal/atribuicoes/funcoes")
  return { ok: "Função salva." }
}

export async function excluirFuncao(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  await exigir()
  const id = txt(fd, "id")
  if (!id) return { erro: "Função inválida." }
  const admin = await createAdminClient()
  // remove plano de cargos e vínculos de funcionários por cascade
  const { error } = await admin
    .from("pessoal_funcoes")
    .delete()
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: `Não foi possível excluir: ${error.message}` }
  revalidatePath("/painel/pessoal/atribuicoes/funcoes")
  redirect("/painel/pessoal/atribuicoes/funcoes?excluido=1")
}

/**
 * Reaproveita os cargos que os funcionários JÁ têm (texto livre em
 * vinculos_trabalhistas): cria uma Função por cargo distinto (grafias
 * normalizadas por acento/caixa, nome de exibição = grafia mais frequente) e
 * auto-vincula cada funcionário à sua — sem sobrescrever vínculo manual já
 * feito. Não-destrutivo e idempotente.
 */
export async function importarFuncoesDosCargos(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  void formData
  await exigir()
  const admin = await createAdminClient()
  const emp = await tenantAtual()

  const { data: vinculos, error } = await admin
    .from("vinculos_trabalhistas")
    .select("trabalhador_id, cargo, contrato_admissao, contrato_demissao")
    .eq("empregador_id", emp)
  if (error) return { erro: `Falha ao ler vínculos: ${error.message}` }

  // um cargo por pessoa (vínculo ativo mais recente com cargo preenchido)
  type V = { trabalhador_id: string; cargo: string; adm: string }
  const porPessoa = new Map<string, V>()
  for (const v of vinculos ?? []) {
    const cargo = String(v.cargo ?? "").trim()
    const tid = v.trabalhador_id as string | null
    if (!tid || !cargo) continue
    const atual = porPessoa.get(tid)
    const adm = String(v.contrato_admissao ?? "")
    const ativo = !v.contrato_demissao
    const melhor =
      !atual ||
      (ativo && adm >= atual.adm) ||
      (!ativo && adm > atual.adm && !porPessoa.get(tid))
    if (melhor) porPessoa.set(tid, { trabalhador_id: tid, cargo, adm })
  }

  // agrupa por cargo normalizado; nome de exibição = grafia mais frequente
  const grupos = new Map<
    string,
    { grafias: Map<string, number>; pessoas: string[] }
  >()
  for (const { trabalhador_id, cargo } of porPessoa.values()) {
    const chave = semAcento(cargo)
    const g = grupos.get(chave) ?? {
      grafias: new Map<string, number>(),
      pessoas: [] as string[],
    }
    g.grafias.set(cargo, (g.grafias.get(cargo) ?? 0) + 1)
    g.pessoas.push(trabalhador_id)
    grupos.set(chave, g)
  }
  if (grupos.size === 0) {
    return { erro: "Nenhum funcionário com cargo preenchido nos vínculos." }
  }

  // funções e vínculos existentes
  const [{ data: funcoesExist }, { data: vincExist }] = await Promise.all([
    admin.from("pessoal_funcoes").select("id, nome").eq("emp_proprietaria_id", emp),
    admin
      .from("pessoal_funcionario_funcao")
      .select("funcionario_id")
      .eq("emp_proprietaria_id", emp),
  ])
  const funcaoPorChave = new Map<string, string>()
  for (const f of funcoesExist ?? []) {
    if (f.nome) funcaoPorChave.set(semAcento(String(f.nome)), f.id as string)
  }
  const jaComFuncao = new Set(
    (vincExist ?? []).map((v) => v.funcionario_id as string)
  )

  let criadas = 0
  let reutilizadas = 0
  let vinculados = 0
  let mantidos = 0

  for (const [chave, g] of grupos) {
    let funcaoId = funcaoPorChave.get(chave)
    if (funcaoId) {
      reutilizadas++
    } else {
      const nome = [...g.grafias.entries()].sort((a, b) => b[1] - a[1])[0][0]
      const { data, error: e } = await admin
        .from("pessoal_funcoes")
        .insert({ nome, emp_proprietaria_id: emp })
        .select("id")
        .single()
      if (e || !data) continue
      funcaoId = data.id as string
      funcaoPorChave.set(chave, funcaoId)
      criadas++
    }
    // auto-vincula quem ainda não tem função
    const novos = g.pessoas.filter((p) => !jaComFuncao.has(p))
    mantidos += g.pessoas.length - novos.length
    if (novos.length) {
      const { error: e2 } = await admin
        .from("pessoal_funcionario_funcao")
        .upsert(
          novos.map((funcionario_id) => ({
            emp_proprietaria_id: emp,
            funcionario_id,
            funcao_id: funcaoId,
          })),
          { onConflict: "emp_proprietaria_id,funcionario_id" }
        )
      if (!e2) {
        vinculados += novos.length
        novos.forEach((p) => jaComFuncao.add(p))
      }
    }
  }

  revalidatePath("/painel/pessoal/atribuicoes/funcoes")
  return {
    ok: `${criadas} função(ões) criada(s), ${reutilizadas} reaproveitada(s); ${vinculados} funcionário(s) vinculado(s)${mantidos ? `, ${mantidos} mantido(s) com a função atual` : ""}.`,
  }
}

// Plano de cargos (atribuições esperadas da função) ---------------------------

export async function adicionarAtribuicao(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  await exigir()
  const funcaoId = txt(fd, "funcao_id")
  const descricao = txt(fd, "descricao")
  if (!funcaoId) return { erro: "Função inválida." }
  if (!descricao) return { erro: "Descreva a atribuição." }
  const admin = await createAdminClient()
  const { error } = await admin.from("pessoal_atribuicoes_cargo").insert({
    funcao_id: funcaoId,
    descricao,
    atividade_id: txt(fd, "atividade_id"),
    emp_proprietaria_id: await tenantAtual(),
  })
  if (error) return { erro: `Não foi possível adicionar: ${error.message}` }
  revalidatePath(`/painel/pessoal/atribuicoes/funcoes/${funcaoId}`)
  return { ok: "Atribuição adicionada." }
}

export async function excluirAtribuicao(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  await exigir()
  const id = txt(fd, "id")
  const funcaoId = txt(fd, "funcao_id")
  if (!id) return { erro: "Registro inválido." }
  const admin = await createAdminClient()
  const { error } = await admin
    .from("pessoal_atribuicoes_cargo")
    .delete()
    .eq("id", id)
  if (error) return { erro: `Não foi possível excluir: ${error.message}` }
  if (funcaoId) revalidatePath(`/painel/pessoal/atribuicoes/funcoes/${funcaoId}`)
  return { ok: "Atribuição removida." }
}

export async function sugerirPlanoComIA(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  await exigir()
  const funcaoId = txt(fd, "funcao_id")
  const nome = txt(fd, "nome")
  if (!funcaoId || !nome) return { erro: "Função inválida." }

  const { atribuicoes, erro } = await sugerirPlanoCargos({
    funcao: nome,
    descricao: txt(fd, "descricao"),
  })
  if (erro) return { erro }
  if (!atribuicoes || atribuicoes.length === 0) {
    return { erro: "A IA não retornou atribuições." }
  }
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { error } = await admin.from("pessoal_atribuicoes_cargo").insert(
    atribuicoes.map((descricao) => ({
      funcao_id: funcaoId,
      descricao,
      emp_proprietaria_id: emp,
    }))
  )
  if (error) return { erro: `Não foi possível gravar as sugestões: ${error.message}` }
  revalidatePath(`/painel/pessoal/atribuicoes/funcoes/${funcaoId}`)
  return {
    ok: `${atribuicoes.length} atribuições sugeridas pela IA — revise e ajuste (edite ou remova o que não se aplicar).`,
  }
}

// Funcionários da função ------------------------------------------------------

export async function vincularFuncionario(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  await exigir()
  const funcaoId = txt(fd, "funcao_id")
  const funcionarioId = txt(fd, "funcionario_id")
  if (!funcaoId) return { erro: "Função inválida." }
  if (!funcionarioId) return { erro: "Escolha o funcionário." }
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  // uma função por funcionário: upsert pela chave (emp, funcionario)
  const { error } = await admin
    .from("pessoal_funcionario_funcao")
    .upsert(
      { emp_proprietaria_id: emp, funcionario_id: funcionarioId, funcao_id: funcaoId },
      { onConflict: "emp_proprietaria_id,funcionario_id" }
    )
  if (error) return { erro: `Não foi possível vincular: ${error.message}` }
  revalidatePath(`/painel/pessoal/atribuicoes/funcoes/${funcaoId}`)
  return { ok: "Funcionário vinculado à função." }
}

export async function desvincularFuncionario(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  await exigir()
  const id = txt(fd, "id")
  const funcaoId = txt(fd, "funcao_id")
  if (!id) return { erro: "Registro inválido." }
  const admin = await createAdminClient()
  const { error } = await admin
    .from("pessoal_funcionario_funcao")
    .delete()
    .eq("id", id)
  if (error) return { erro: `Não foi possível desvincular: ${error.message}` }
  if (funcaoId) revalidatePath(`/painel/pessoal/atribuicoes/funcoes/${funcaoId}`)
  return { ok: "Funcionário desvinculado." }
}

// ── Tarefas (atividades) ─────────────────────────────────────────────────────

function lerTarefa(fd: FormData) {
  const nome = txt(fd, "nome")
  if (!nome) return { erro: "Informe o nome da tarefa." as string }
  // função e recorrência NÃO são da tarefa: vivem no executor (cada
  // funcionário pode ter cadência diferente) e no vínculo funcionário↔função
  return {
    nome,
    descricao: txt(fd, "descricao"),
    presenca: txt(fd, "presenca"),
    observacoes: txt(fd, "observacoes"),
  }
}

export async function criarTarefa(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  await exigir()
  const dados = lerTarefa(fd)
  if ("erro" in dados) return dados
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("pessoal_atividades")
    .insert({ ...dados, emp_proprietaria_id: await tenantAtual() })
    .select("id")
    .single()
  if (error || !data) return { erro: `Não foi possível criar: ${error?.message}` }
  revalidatePath("/painel/pessoal/atribuicoes/tarefas")
  redirect(`/painel/pessoal/atribuicoes/tarefas/${data.id}?salvo=1`)
}

export async function atualizarTarefa(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  await exigir()
  const id = txt(fd, "id")
  if (!id) return { erro: "Tarefa inválida." }
  const dados = lerTarefa(fd)
  if ("erro" in dados) return dados
  const admin = await createAdminClient()
  const { error, count } = await admin
    .from("pessoal_atividades")
    .update({ ...dados, updated_at: new Date().toISOString() }, { count: "exact" })
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: `Não foi possível salvar: ${error.message}` }
  if (count === 0) return { erro: "Tarefa não encontrada." }
  revalidatePath(`/painel/pessoal/atribuicoes/tarefas/${id}`)
  revalidatePath("/painel/pessoal/atribuicoes/tarefas")
  return { ok: "Tarefa salva." }
}

export async function excluirTarefa(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  await exigir()
  const id = txt(fd, "id")
  if (!id) return { erro: "Tarefa inválida." }
  const admin = await createAdminClient()
  const { error } = await admin.from("pessoal_atividades").delete().eq("id", id)
  if (error) return { erro: `Não foi possível excluir: ${error.message}` }
  revalidatePath("/painel/pessoal/atribuicoes/tarefas")
  redirect("/painel/pessoal/atribuicoes/tarefas?excluido=1")
}

/** Revalidação anual da avaliação SST da tarefa (carimba a data de hoje). */
export async function marcarTarefaAvaliada(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  await exigir()
  const id = txt(fd, "id")
  if (!id) return { erro: "Tarefa inválida." }
  const admin = await createAdminClient()
  const { error } = await admin
    .from("pessoal_atividades")
    .update({ avaliada_em: hojeSP(), updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: `Não foi possível registrar: ${error.message}` }
  revalidatePath(`/painel/pessoal/atribuicoes/tarefas/${id}`)
  return { ok: "Avaliação da tarefa registrada nesta data." }
}

// Executores (tempo por funcionário) ------------------------------------------

export async function salvarExecutor(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  await exigir()
  const atividadeId = txt(fd, "atividade_id")
  const funcionarioId = txt(fd, "funcionario_id")
  if (!atividadeId) return { erro: "Tarefa inválida." }
  if (!funcionarioId) return { erro: "Escolha o funcionário." }
  // tempo em horas/mês (decimal) → minutos
  const horas = txt(fd, "tempo_horas_mes")
  let tempoMin: number | null = null
  if (horas) {
    const h = Number(horas.replace(",", "."))
    if (!Number.isFinite(h) || h < 0) return { erro: "Tempo inválido (ex.: 8)." }
    tempoMin = Math.round(h * 60)
  }
  const admin = await createAdminClient()
  const { error } = await admin.from("pessoal_atividades_executores").upsert(
    {
      atividade_id: atividadeId,
      funcionario_id: funcionarioId,
      tempo_min_mes: tempoMin,
      recorrencia: txt(fd, "recorrencia"),
      frequencia: txt(fd, "frequencia"),
      avaliado_em: hojeSP(),
      emp_proprietaria_id: await tenantAtual(),
    },
    { onConflict: "atividade_id,funcionario_id" }
  )
  if (error) return { erro: `Não foi possível salvar: ${error.message}` }
  revalidatePath(`/painel/pessoal/atribuicoes/tarefas/${atividadeId}`)
  return { ok: "Executor salvo." }
}

export async function excluirExecutor(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  await exigir()
  const id = txt(fd, "id")
  const atividadeId = txt(fd, "atividade_id")
  if (!id) return { erro: "Registro inválido." }
  const admin = await createAdminClient()
  const { error } = await admin
    .from("pessoal_atividades_executores")
    .delete()
    .eq("id", id)
  if (error) return { erro: `Não foi possível excluir: ${error.message}` }
  if (atividadeId) revalidatePath(`/painel/pessoal/atribuicoes/tarefas/${atividadeId}`)
  return { ok: "Executor removido." }
}

/** Revalidação anual da atribuição para este funcionário. */
export async function revalidarExecutor(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  await exigir()
  const id = txt(fd, "id")
  const atividadeId = txt(fd, "atividade_id")
  if (!id) return { erro: "Registro inválido." }
  const admin = await createAdminClient()
  const { error } = await admin
    .from("pessoal_atividades_executores")
    .update({ avaliado_em: hojeSP(), updated_at: new Date().toISOString() })
    .eq("id", id)
  if (error) return { erro: `Não foi possível registrar: ${error.message}` }
  if (atividadeId) revalidatePath(`/painel/pessoal/atribuicoes/tarefas/${atividadeId}`)
  return { ok: "Atribuição revalidada nesta data." }
}

// Ferramentas -----------------------------------------------------------------

export async function adicionarFerramenta(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  await exigir()
  const atividadeId = txt(fd, "atividade_id")
  const nome = txt(fd, "nome")
  if (!atividadeId) return { erro: "Tarefa inválida." }
  if (!nome) return { erro: "Informe a ferramenta/equipamento." }
  const admin = await createAdminClient()
  const { error } = await admin.from("pessoal_atividades_ferramentas").insert({
    atividade_id: atividadeId,
    nome,
    tipo: txt(fd, "tipo"),
    emp_proprietaria_id: await tenantAtual(),
  })
  if (error) return { erro: `Não foi possível adicionar: ${error.message}` }
  revalidatePath(`/painel/pessoal/atribuicoes/tarefas/${atividadeId}`)
  return { ok: "Ferramenta adicionada." }
}

export async function excluirFerramenta(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  await exigir()
  const id = txt(fd, "id")
  const atividadeId = txt(fd, "atividade_id")
  if (!id) return { erro: "Registro inválido." }
  const admin = await createAdminClient()
  const { error } = await admin
    .from("pessoal_atividades_ferramentas")
    .delete()
    .eq("id", id)
  if (error) return { erro: `Não foi possível excluir: ${error.message}` }
  if (atividadeId) revalidatePath(`/painel/pessoal/atribuicoes/tarefas/${atividadeId}`)
  return { ok: "Ferramenta removida." }
}

// Perigos ---------------------------------------------------------------------

export async function adicionarPerigo(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  await exigir()
  const atividadeId = txt(fd, "atividade_id")
  const descricao = txt(fd, "descricao")
  if (!atividadeId) return { erro: "Tarefa inválida." }
  if (!descricao) return { erro: "Descreva o perigo." }
  const admin = await createAdminClient()
  const { error } = await admin.from("pessoal_atividades_perigos").insert({
    atividade_id: atividadeId,
    descricao,
    fonte: txt(fd, "fonte"),
    severidade: int1a5(fd, "severidade"),
    norma: txt(fd, "norma"),
    emp_proprietaria_id: await tenantAtual(),
  })
  if (error) return { erro: `Não foi possível adicionar: ${error.message}` }
  revalidatePath(`/painel/pessoal/atribuicoes/tarefas/${atividadeId}`)
  return { ok: "Perigo adicionado." }
}

export async function excluirPerigo(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  await exigir()
  const id = txt(fd, "id")
  const atividadeId = txt(fd, "atividade_id")
  if (!id) return { erro: "Registro inválido." }
  const admin = await createAdminClient()
  const { error } = await admin
    .from("pessoal_atividades_perigos")
    .delete()
    .eq("id", id)
  if (error) return { erro: `Não foi possível excluir: ${error.message}` }
  if (atividadeId) revalidatePath(`/painel/pessoal/atribuicoes/tarefas/${atividadeId}`)
  return { ok: "Perigo removido." }
}

// Riscos ----------------------------------------------------------------------

export async function adicionarRisco(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  await exigir()
  const atividadeId = txt(fd, "atividade_id")
  const executorId = txt(fd, "executor_id")
  const categoria = txt(fd, "categoria")
  if (!atividadeId) return { erro: "Tarefa inválida." }
  if (!executorId) return { erro: "Escolha o executor — o risco é avaliado por pessoa." }
  if (!categoria) return { erro: "Escolha a categoria do risco." }
  const admin = await createAdminClient()
  const { error } = await admin.from("pessoal_atividades_riscos").insert({
    atividade_id: atividadeId,
    executor_id: executorId,
    categoria,
    perigo_id: txt(fd, "perigo_id"),
    probabilidade: int1a5(fd, "probabilidade"),
    severidade: int1a5(fd, "severidade"),
    probabilidade_residual: int1a5(fd, "probabilidade_residual"),
    severidade_residual: int1a5(fd, "severidade_residual"),
    observacao: txt(fd, "observacao"),
    emp_proprietaria_id: await tenantAtual(),
  })
  if (error) return { erro: `Não foi possível adicionar: ${error.message}` }
  revalidatePath(`/painel/pessoal/atribuicoes/tarefas/${atividadeId}`)
  return { ok: "Risco adicionado." }
}

export async function excluirRisco(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  await exigir()
  const id = txt(fd, "id")
  const atividadeId = txt(fd, "atividade_id")
  if (!id) return { erro: "Registro inválido." }
  const admin = await createAdminClient()
  const { error } = await admin
    .from("pessoal_atividades_riscos")
    .delete()
    .eq("id", id)
  if (error) return { erro: `Não foi possível excluir: ${error.message}` }
  if (atividadeId) revalidatePath(`/painel/pessoal/atribuicoes/tarefas/${atividadeId}`)
  return { ok: "Risco removido." }
}

// Medidas (treinamento/EPI) ---------------------------------------------------

export async function adicionarMedida(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  await exigir()
  const atividadeId = txt(fd, "atividade_id")
  const tipo = txt(fd, "tipo")
  const descricao = txt(fd, "descricao")
  if (!atividadeId) return { erro: "Tarefa inválida." }
  if (tipo !== "treinamento" && tipo !== "epi") {
    return { erro: "Tipo de medida inválido." }
  }
  if (!descricao) return { erro: "Descreva a medida." }
  const admin = await createAdminClient()
  const { error } = await admin.from("pessoal_atividade_medidas_seguranca").insert({
    atividade_id: atividadeId,
    tipo,
    descricao,
    treinamento_id: tipo === "treinamento" ? txt(fd, "treinamento_id") : null,
    recorrencia_meses: tipo === "treinamento" ? int(fd, "recorrencia_meses") : null,
    epi_ca: tipo === "epi" ? txt(fd, "epi_ca") : null,
    risco_id: txt(fd, "risco_id"),
    emp_proprietaria_id: await tenantAtual(),
  })
  if (error) return { erro: `Não foi possível adicionar: ${error.message}` }
  revalidatePath(`/painel/pessoal/atribuicoes/tarefas/${atividadeId}`)
  return { ok: "Medida adicionada." }
}

export async function excluirMedida(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  await exigir()
  const id = txt(fd, "id")
  const atividadeId = txt(fd, "atividade_id")
  if (!id) return { erro: "Registro inválido." }
  const admin = await createAdminClient()
  const { error } = await admin
    .from("pessoal_atividade_medidas_seguranca")
    .delete()
    .eq("id", id)
  if (error) return { erro: `Não foi possível excluir: ${error.message}` }
  if (atividadeId) revalidatePath(`/painel/pessoal/atribuicoes/tarefas/${atividadeId}`)
  return { ok: "Medida removida." }
}

// ── Jornada de trabalho contratada ───────────────────────────────────────────

/**
 * Salva a jornada semanal de um funcionário: um campo hora_inicio/hora_fim por
 * dia (nomes `inicio_0`..`inicio_6`, `fim_0`..`fim_6`). Dia sem os dois
 * horários = sem expediente (linha removida).
 */
export async function salvarJornada(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  await exigir()
  const funcionarioId = txt(fd, "funcionario_id")
  if (!funcionarioId) return { erro: "Escolha o funcionário." }
  const admin = await createAdminClient()
  const emp = await tenantAtual()

  const hora = (v: string | null): string | null => {
    if (!v) return null
    return /^\d{1,2}:\d{2}$/.test(v) ? v : null
  }

  for (let dia = 0; dia <= 6; dia++) {
    const inicio = hora(txt(fd, `inicio_${dia}`))
    const fim = hora(txt(fd, `fim_${dia}`))
    if (inicio && fim) {
      if (fim <= inicio) {
        return { erro: `Dia ${dia}: o fim deve ser depois do início.` }
      }
      const { error } = await admin.from("pessoal_funcionario_jornada").upsert(
        {
          emp_proprietaria_id: emp,
          funcionario_id: funcionarioId,
          dia_semana: dia,
          hora_inicio: inicio,
          hora_fim: fim,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "emp_proprietaria_id,funcionario_id,dia_semana" }
      )
      if (error) return { erro: `Não foi possível salvar: ${error.message}` }
    } else {
      const { error } = await admin
        .from("pessoal_funcionario_jornada")
        .delete()
        .eq("funcionario_id", funcionarioId)
        .eq("dia_semana", dia)
      if (error) return { erro: `Não foi possível salvar: ${error.message}` }
    }
  }
  revalidatePath("/painel/pessoal/atribuicoes/jornadas")
  return { ok: "Jornada salva." }
}

// ── GHE (Grupo Homogêneo de Exposição) ───────────────────────────────────────

export async function criarGhe(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  await exigir()
  const nome = txt(fd, "nome")
  if (!nome) return { erro: "Informe o nome do GHE." }
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data, error } = await admin
    .from("pessoal_ghe")
    .insert({ nome, descricao: txt(fd, "descricao"), emp_proprietaria_id: emp })
    .select("id")
    .single()
  if (error || !data) return { erro: `Não foi possível criar: ${error?.message}` }
  // membros iniciais opcionais (ids separados por vírgula — usado pela sugestão)
  const membros = (txt(fd, "membros") ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean)
  if (membros.length) {
    await admin.from("pessoal_ghe_membros").insert(
      membros.map((funcionario_id) => ({
        ghe_id: data.id,
        funcionario_id,
        emp_proprietaria_id: emp,
      }))
    )
  }
  revalidatePath("/painel/pessoal/atribuicoes/ghe")
  redirect(`/painel/pessoal/atribuicoes/ghe/${data.id}?salvo=1`)
}

export async function atualizarGhe(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  await exigir()
  const id = txt(fd, "id")
  const nome = txt(fd, "nome")
  if (!id) return { erro: "GHE inválido." }
  if (!nome) return { erro: "Informe o nome do GHE." }
  const admin = await createAdminClient()
  const { error, count } = await admin
    .from("pessoal_ghe")
    .update(
      {
        nome,
        descricao: txt(fd, "descricao"),
        updated_at: new Date().toISOString(),
      },
      { count: "exact" }
    )
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: `Não foi possível salvar: ${error.message}` }
  if (count === 0) return { erro: "GHE não encontrado." }
  revalidatePath(`/painel/pessoal/atribuicoes/ghe/${id}`)
  revalidatePath("/painel/pessoal/atribuicoes/ghe")
  return { ok: "GHE salvo." }
}

export async function excluirGhe(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  await exigir()
  const id = txt(fd, "id")
  if (!id) return { erro: "GHE inválido." }
  const admin = await createAdminClient()
  const { error } = await admin
    .from("pessoal_ghe")
    .delete()
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: `Não foi possível excluir: ${error.message}` }
  revalidatePath("/painel/pessoal/atribuicoes/ghe")
  redirect("/painel/pessoal/atribuicoes/ghe?excluido=1")
}

export async function adicionarMembroGhe(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  await exigir()
  const gheId = txt(fd, "ghe_id")
  const funcionarioId = txt(fd, "funcionario_id")
  if (!gheId) return { erro: "GHE inválido." }
  if (!funcionarioId) return { erro: "Escolha o funcionário." }
  const admin = await createAdminClient()
  const { error } = await admin.from("pessoal_ghe_membros").upsert(
    {
      ghe_id: gheId,
      funcionario_id: funcionarioId,
      emp_proprietaria_id: await tenantAtual(),
    },
    { onConflict: "ghe_id,funcionario_id" }
  )
  if (error) return { erro: `Não foi possível adicionar: ${error.message}` }
  revalidatePath(`/painel/pessoal/atribuicoes/ghe/${gheId}`)
  return { ok: "Funcionário adicionado ao GHE." }
}

export async function removerMembroGhe(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  await exigir()
  const id = txt(fd, "id")
  const gheId = txt(fd, "ghe_id")
  if (!id) return { erro: "Registro inválido." }
  const admin = await createAdminClient()
  const { error } = await admin.from("pessoal_ghe_membros").delete().eq("id", id)
  if (error) return { erro: `Não foi possível remover: ${error.message}` }
  if (gheId) revalidatePath(`/painel/pessoal/atribuicoes/ghe/${gheId}`)
  return { ok: "Funcionário removido do GHE." }
}

// ── IA: análise SST da tarefa (itens 6-10) ───────────────────────────────────

export async function analisarTarefaComIA(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  await exigir()
  const atividadeId = txt(fd, "atividade_id")
  if (!atividadeId) return { erro: "Tarefa inválida." }

  const atividade = await buscarAtividade(atividadeId)
  if (!atividade) return { erro: "Tarefa não encontrada." }

  const { sugestao, erro } = await analisarSST({
    tarefa: atividade.nome ?? "",
    descricao: atividade.descricao,
    presenca: atividade.presenca,
    ferramentas: atividade.ferramentas.map((f) => f.nome),
  })
  if (erro) return { erro }
  if (!sugestao) return { erro: "A IA não retornou uma análise." }

  const admin = await createAdminClient()
  const emp = await tenantAtual()

  // ferramentas que ainda não constam (evita duplicar por nome)
  const existentes = new Set(
    atividade.ferramentas.map((f) => f.nome.toLowerCase().trim())
  )
  const novasFerramentas = sugestao.ferramentas.filter(
    (f) => !existentes.has(f.nome.toLowerCase().trim())
  )

  const ops: Promise<{ error: unknown }>[] = []
  if (novasFerramentas.length) {
    ops.push(
      admin.from("pessoal_atividades_ferramentas").insert(
        novasFerramentas.map((f) => ({
          atividade_id: atividadeId,
          nome: f.nome,
          tipo: f.tipo,
          emp_proprietaria_id: emp,
        }))
      ) as unknown as Promise<{ error: unknown }>
    )
  }
  if (sugestao.perigos.length) {
    ops.push(
      admin.from("pessoal_atividades_perigos").insert(
        sugestao.perigos.map((p) => ({
          atividade_id: atividadeId,
          descricao: p.descricao,
          fonte: p.fonte,
          severidade: p.severidade,
          norma: p.norma,
          emp_proprietaria_id: emp,
        }))
      ) as unknown as Promise<{ error: unknown }>
    )
  }
  // riscos são POR EXECUTOR: a sugestão vale como avaliação inicial para cada
  // pessoa que executa a tarefa (o gestor ajusta a probabilidade individual)
  const executores = atividade.executoresLista
  if (sugestao.riscos.length && executores.length) {
    ops.push(
      admin.from("pessoal_atividades_riscos").insert(
        executores.flatMap((e) =>
          sugestao.riscos.map((r) => ({
            atividade_id: atividadeId,
            executor_id: e.id,
            categoria: r.categoria,
            probabilidade: r.probabilidade,
            severidade: r.severidade,
            probabilidade_residual: r.probabilidade_residual,
            severidade_residual: r.severidade_residual,
            observacao: r.observacao,
            emp_proprietaria_id: emp,
          }))
        )
      ) as unknown as Promise<{ error: unknown }>
    )
  }
  if (sugestao.medidas.length) {
    ops.push(
      admin.from("pessoal_atividade_medidas_seguranca").insert(
        sugestao.medidas.map((m) => ({
          atividade_id: atividadeId,
          tipo: m.tipo,
          descricao: m.descricao,
          recorrencia_meses: m.recorrencia_meses,
          epi_ca: m.epi_ca,
          emp_proprietaria_id: emp,
        }))
      ) as unknown as Promise<{ error: unknown }>
    )
  }

  await Promise.all(ops)

  revalidatePath(`/painel/pessoal/atribuicoes/tarefas/${atividadeId}`)
  const riscosMsg = executores.length
    ? `${sugestao.riscos.length} risco(s) aplicado(s) a ${executores.length} executor(es)`
    : `riscos NÃO gravados (a tarefa ainda não tem executores — o risco é avaliado por pessoa)`
  return {
    ok: `IA sugeriu ${sugestao.perigos.length} perigo(s), ${riscosMsg}, ${novasFerramentas.length} ferramenta(s) e ${sugestao.medidas.length} medida(s). Revise, ajuste os níveis por pessoa e remova o que não se aplicar.`,
  }
}
