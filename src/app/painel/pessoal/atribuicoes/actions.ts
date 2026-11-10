"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { hojeSP, lerEmLotes } from "@/lib/db/comum"
import { analisarSST, sugerirPlanoCargos } from "@/lib/db/pessoal-sst-ia"
import { buscarAtividade } from "@/lib/db/pessoal-sst"
import { DIAS_SEMANA } from "@/lib/pessoal-sst-constantes"
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

  // Listas completas (paginado): o PostgREST corta em 1.000 linhas, e quem
  // ficasse de fora não ganharia função nem entraria nos totais.
  let vinculos: {
    trabalhador_id: string | null
    cargo: string | null
    contrato_admissao: string | null
    contrato_demissao: string | null
  }[]
  try {
    vinculos = await lerEmLotes((de, ate) =>
      admin
        .from("vinculos_trabalhistas")
        .select("id, trabalhador_id, cargo, contrato_admissao, contrato_demissao")
        .eq("empregador_id", emp)
        .order("id")
        .range(de, ate)
    )
  } catch (e) {
    return { erro: `Falha ao ler vínculos: ${e instanceof Error ? e.message : "?"}` }
  }

  // um cargo por pessoa (vínculo ativo mais recente com cargo preenchido)
  type V = { trabalhador_id: string; cargo: string; adm: string }
  const porPessoa = new Map<string, V>()
  for (const v of vinculos) {
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
  const [funcoesExist, vincExist] = await Promise.all([
    lerEmLotes<{ id: string; nome: string | null }>((de, ate) =>
      admin.from("pessoal_funcoes").select("id, nome").eq("emp_proprietaria_id", emp).order("id").range(de, ate)
    ).catch(() => []),
    lerEmLotes<{ funcionario_id: string }>((de, ate) =>
      admin
        .from("pessoal_funcionario_funcao")
        .select("id, funcionario_id")
        .eq("emp_proprietaria_id", emp)
        .order("id")
        .range(de, ate)
    ).catch(() => []),
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

// ── Atividades (atividades) ─────────────────────────────────────────────────────

function lerAtividade(fd: FormData) {
  const nome = txt(fd, "nome")
  if (!nome) return { erro: "Informe o nome da atividade." as string }
  // função e recorrência NÃO são da atividade: vivem no executor (cada
  // funcionário pode ter cadência diferente) e no vínculo funcionário↔função
  return {
    nome,
    descricao: txt(fd, "descricao"),
    presenca: txt(fd, "presenca"),
    observacoes: txt(fd, "observacoes"),
  }
}

export async function criarAtividade(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  await exigir()
  const dados = lerAtividade(fd)
  if ("erro" in dados) return dados
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("pessoal_atividades")
    .insert({ ...dados, emp_proprietaria_id: await tenantAtual() })
    .select("id")
    .single()
  if (error || !data) return { erro: `Não foi possível criar: ${error?.message}` }
  revalidatePath("/painel/pessoal/atribuicoes/atividades")
  redirect(`/painel/pessoal/atribuicoes/atividades/${data.id}?salvo=1`)
}

export async function atualizarAtividade(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  await exigir()
  const id = txt(fd, "id")
  if (!id) return { erro: "Atividade inválida." }
  const dados = lerAtividade(fd)
  if ("erro" in dados) return dados
  const admin = await createAdminClient()
  const { error, count } = await admin
    .from("pessoal_atividades")
    .update({ ...dados, updated_at: new Date().toISOString() }, { count: "exact" })
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: `Não foi possível salvar: ${error.message}` }
  if (count === 0) return { erro: "Atividade não encontrada." }
  revalidatePath(`/painel/pessoal/atribuicoes/atividades/${id}`)
  revalidatePath("/painel/pessoal/atribuicoes/atividades")
  return { ok: "Atividade salva." }
}

export async function excluirAtividade(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  await exigir()
  const id = txt(fd, "id")
  if (!id) return { erro: "Atividade inválida." }
  const admin = await createAdminClient()
  const { error } = await admin.from("pessoal_atividades").delete().eq("id", id)
  if (error) return { erro: `Não foi possível excluir: ${error.message}` }
  revalidatePath("/painel/pessoal/atribuicoes/atividades")
  redirect("/painel/pessoal/atribuicoes/atividades?excluido=1")
}

/** Revalidação anual da avaliação SST da atividade (carimba a data de hoje). */
export async function marcarAtividadeAvaliada(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  await exigir()
  const id = txt(fd, "id")
  if (!id) return { erro: "Atividade inválida." }
  const admin = await createAdminClient()
  const { error } = await admin
    .from("pessoal_atividades")
    .update({ avaliada_em: hojeSP(), updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: `Não foi possível registrar: ${error.message}` }
  revalidatePath(`/painel/pessoal/atribuicoes/atividades/${id}`)
  return { ok: "Avaliação da atividade registrada nesta data." }
}

// Executores (tempo por funcionário) ------------------------------------------

export async function salvarExecutor(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  await exigir()
  const atividadeId = txt(fd, "atividade_id")
  // o select único usa prefixo: "f:<usuarioId>" (funcionário) | "p:<empresaId>"
  const executor = txt(fd, "executor")
  let funcionarioId = txt(fd, "funcionario_id")
  let fornecedorId = txt(fd, "fornecedor_id")
  if (executor?.startsWith("f:")) funcionarioId = executor.slice(2)
  if (executor?.startsWith("p:")) fornecedorId = executor.slice(2)
  if (!atividadeId) return { erro: "Atividade inválida." }
  if (!funcionarioId && !fornecedorId) {
    return { erro: "Escolha o funcionário ou o prestador." }
  }
  // tempo em horas/mês (decimal) → minutos
  const horas = txt(fd, "tempo_horas_mes")
  let tempoMin: number | null = null
  if (horas) {
    const h = Number(horas.replace(",", "."))
    if (!Number.isFinite(h) || h < 0) return { erro: "Tempo inválido (ex.: 8)." }
    tempoMin = Math.round(h * 60)
  }
  const admin = await createAdminClient()
  const base = {
    atividade_id: atividadeId,
    tempo_min_mes: tempoMin,
    recorrencia: txt(fd, "recorrencia"),
    frequencia: txt(fd, "frequencia"),
    avaliado_em: hojeSP(),
    emp_proprietaria_id: await tenantAtual(),
  }
  // funcionário OU prestador (fornecedor) — upserts com chaves distintas
  const { error } = funcionarioId
    ? await admin
        .from("pessoal_atividades_executores")
        .upsert(
          { ...base, funcionario_id: funcionarioId },
          { onConflict: "atividade_id,funcionario_id" }
        )
    : await admin
        .from("pessoal_atividades_executores")
        .upsert(
          { ...base, fornecedor_id: fornecedorId },
          { onConflict: "atividade_id,fornecedor_id" }
        )
  if (error) return { erro: `Não foi possível salvar: ${error.message}` }
  revalidatePath(`/painel/pessoal/atribuicoes/atividades/${atividadeId}`)
  return { ok: funcionarioId ? "Executor salvo." : "Prestador salvo." }
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
  if (atividadeId) revalidatePath(`/painel/pessoal/atribuicoes/atividades/${atividadeId}`)
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
  if (atividadeId) revalidatePath(`/painel/pessoal/atribuicoes/atividades/${atividadeId}`)
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
  if (!atividadeId) return { erro: "Atividade inválida." }
  if (!nome) return { erro: "Informe a ferramenta/equipamento." }
  const admin = await createAdminClient()
  const { error } = await admin.from("pessoal_atividades_ferramentas").insert({
    atividade_id: atividadeId,
    nome,
    tipo: txt(fd, "tipo"),
    emp_proprietaria_id: await tenantAtual(),
  })
  if (error) return { erro: `Não foi possível adicionar: ${error.message}` }
  revalidatePath(`/painel/pessoal/atribuicoes/atividades/${atividadeId}`)
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
  if (atividadeId) revalidatePath(`/painel/pessoal/atribuicoes/atividades/${atividadeId}`)
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
  if (!atividadeId) return { erro: "Atividade inválida." }
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
  revalidatePath(`/painel/pessoal/atribuicoes/atividades/${atividadeId}`)
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
  if (atividadeId) revalidatePath(`/painel/pessoal/atribuicoes/atividades/${atividadeId}`)
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
  if (!atividadeId) return { erro: "Atividade inválida." }
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
  revalidatePath(`/painel/pessoal/atribuicoes/atividades/${atividadeId}`)
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
  if (atividadeId) revalidatePath(`/painel/pessoal/atribuicoes/atividades/${atividadeId}`)
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
  if (!atividadeId) return { erro: "Atividade inválida." }
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
  revalidatePath(`/painel/pessoal/atribuicoes/atividades/${atividadeId}`)
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
  if (atividadeId) revalidatePath(`/painel/pessoal/atribuicoes/atividades/${atividadeId}`)
  return { ok: "Medida removida." }
}

// ── Jornadas de trabalho ─────────────────────────────────────────────────────

const HORA_RE = /^\d{1,2}:\d{2}$/
const hhmm = (v: string | null | undefined) => (v ? v.slice(0, 5) : null)

/**
 * Cria ou altera uma jornada da entidade: nome, observação e, por dia, o
 * primeiro turno (`inicio_<dia>`, `fim_<dia>`) e o segundo, opcional
 * (`inicio2_<dia>`, `fim2_<dia>`), separados pelo intervalo intrajornada.
 * Dia sem horários = sem expediente. Só grava os dias que mudaram, para o
 * movimento da folha não acusar alteração onde não houve. Ao salvar, volta à
 * página da jornada com o formulário fechado.
 */
export async function salvarJornadaModelo(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  await exigir()
  const id = txt(fd, "id")
  const nome = txt(fd, "nome")
  const observacao = txt(fd, "observacao")
  if (!nome) return { erro: "Dê um nome à jornada (ex.: Administrativo 8h às 17h)." }

  const dias: { dia: number; inicio: string; fim: string; inicio2: string | null; fim2: string | null }[] = []
  const h = (v: string | null) => (v ? v.padStart(5, "0") : null)
  for (const d of DIAS_SEMANA) {
    const inicio = h(txt(fd, `inicio_${d.valor}`))
    const fim = h(txt(fd, `fim_${d.valor}`))
    const inicio2 = h(txt(fd, `inicio2_${d.valor}`))
    const fim2 = h(txt(fd, `fim2_${d.valor}`))
    if (!inicio && !fim && !inicio2 && !fim2) continue
    if (!inicio || !fim || !HORA_RE.test(inicio) || !HORA_RE.test(fim)) {
      return { erro: `${d.rotulo}: preencha a entrada e a saída do 1º turno, ou deixe o dia em branco.` }
    }
    if (fim <= inicio) return { erro: `${d.rotulo}: a saída do 1º turno deve ser depois da entrada.` }
    if (inicio2 || fim2) {
      if (!inicio2 || !fim2 || !HORA_RE.test(inicio2) || !HORA_RE.test(fim2)) {
        return { erro: `${d.rotulo}: preencha a entrada e a saída do 2º turno, ou deixe as duas em branco.` }
      }
      if (inicio2 <= fim) return { erro: `${d.rotulo}: o 2º turno começa depois do fim do 1º (o intervalo fica entre eles).` }
      if (fim2 <= inicio2) return { erro: `${d.rotulo}: a saída do 2º turno deve ser depois da entrada.` }
    }
    dias.push({ dia: d.valor, inicio, fim, inicio2, fim2 })
  }
  if (dias.length === 0) return { erro: "Informe o horário de pelo menos um dia." }

  const admin = await createAdminClient()
  const emp = await tenantAtual()

  const { data: mesmoNome } = await admin
    .from("pessoal_jornadas")
    .select("id, nome")
    .eq("emp_proprietaria_id", emp)
    .ilike("nome", nome)
  if ((mesmoNome ?? []).some((j) => j.id !== id)) {
    return { erro: `Já existe uma jornada chamada "${nome}".` }
  }

  let jornadaId = id
  if (jornadaId) {
    const { error } = await admin
      .from("pessoal_jornadas")
      .update({ nome, observacao, updated_at: new Date().toISOString() })
      .eq("id", jornadaId)
      .eq("emp_proprietaria_id", emp)
    if (error) return { erro: `Não foi possível salvar: ${error.message}` }
  } else {
    const { data, error } = await admin
      .from("pessoal_jornadas")
      .insert({ emp_proprietaria_id: emp, nome, observacao })
      .select("id")
      .single()
    if (error || !data) return { erro: `Não foi possível criar: ${error?.message ?? "erro desconhecido"}` }
    jornadaId = data.id as string
  }

  const { data: atuais } = await admin
    .from("pessoal_jornada_dias")
    .select("dia_semana, hora_inicio, hora_fim, hora_inicio_2, hora_fim_2")
    .eq("jornada_id", jornadaId)
  const antes = new Map(
    (atuais ?? []).map((a) => [a.dia_semana as number, a])
  )
  for (const d of dias) {
    const a = antes.get(d.dia)
    if (
      a &&
      hhmm(a.hora_inicio as string) === d.inicio &&
      hhmm(a.hora_fim as string) === d.fim &&
      hhmm(a.hora_inicio_2 as string | null) === d.inicio2 &&
      hhmm(a.hora_fim_2 as string | null) === d.fim2
    )
      continue
    const { error } = await admin.from("pessoal_jornada_dias").upsert(
      {
        emp_proprietaria_id: emp,
        jornada_id: jornadaId,
        dia_semana: d.dia,
        hora_inicio: d.inicio,
        hora_fim: d.fim,
        hora_inicio_2: d.inicio2,
        hora_fim_2: d.fim2,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "jornada_id,dia_semana" }
    )
    if (error) return { erro: `Não foi possível salvar: ${error.message}` }
  }
  const sairam = [...antes.keys()].filter((dia) => !dias.some((d) => d.dia === dia))
  if (sairam.length) {
    const { error } = await admin
      .from("pessoal_jornada_dias")
      .delete()
      .eq("jornada_id", jornadaId)
      .in("dia_semana", sairam)
    if (error) return { erro: `Não foi possível salvar: ${error.message}` }
  }

  revalidatePath("/painel/pessoal/atribuicoes/jornadas", "layout")
  // Salvo: a página da jornada abre com o formulário fechado.
  redirect(`/painel/pessoal/atribuicoes/jornadas/${jornadaId}?${id ? "salva" : "criada"}=1`)
}

/** Exclui uma jornada sem funcionários vinculados. */
export async function excluirJornadaModelo(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  await exigir()
  const id = txt(fd, "id")
  if (!id) return { erro: "Jornada não informada." }
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { count } = await admin
    .from("pessoal_jornada_funcionarios")
    .select("id", { count: "exact", head: true })
    .eq("jornada_id", id)
  if (count && count > 0) {
    return { erro: "Há funcionários nesta jornada: vincule-os a outra antes de excluir." }
  }
  const { error } = await admin.from("pessoal_jornadas").delete().eq("id", id).eq("emp_proprietaria_id", emp)
  if (error) return { erro: `Não foi possível excluir: ${error.message}` }
  revalidatePath("/painel/pessoal/atribuicoes/jornadas", "layout")
  redirect("/painel/pessoal/atribuicoes/jornadas?excluida=1")
}

/**
 * Vincula os funcionários marcados a uma jornada (`jornada_id` vazio = tira a
 * jornada deles). Quem já está na jornada escolhida fica como está.
 */
export async function vincularJornada(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  await exigir()
  const ids = [...new Set(fd.getAll("funcionario_id").map(String).filter(Boolean))]
  const jornadaId = txt(fd, "jornada_id")
  if (ids.length === 0) return { erro: "Marque pelo menos um funcionário." }
  const admin = await createAdminClient()
  const emp = await tenantAtual()

  const { data: atuais } = await admin
    .from("pessoal_jornada_funcionarios")
    .select("funcionario_id, jornada_id")
    .eq("emp_proprietaria_id", emp)
    .in("funcionario_id", ids)
  const atual = new Map((atuais ?? []).map((a) => [a.funcionario_id as string, a.jornada_id as string]))

  if (!jornadaId) {
    const comJornada = ids.filter((f) => atual.has(f))
    if (comJornada.length) {
      const { error } = await admin
        .from("pessoal_jornada_funcionarios")
        .delete()
        .eq("emp_proprietaria_id", emp)
        .in("funcionario_id", comJornada)
      if (error) return { erro: `Não foi possível salvar: ${error.message}` }
    }
    revalidatePath("/painel/pessoal/atribuicoes/jornadas", "layout")
    return { ok: comJornada.length === 1 ? "Jornada retirada de 1 funcionário." : `Jornada retirada de ${comJornada.length} funcionários.` }
  }

  const { data: jornada } = await admin
    .from("pessoal_jornadas")
    .select("id, nome")
    .eq("id", jornadaId)
    .eq("emp_proprietaria_id", emp)
    .maybeSingle()
  if (!jornada) return { erro: "Jornada não encontrada." }

  const mudar = ids.filter((f) => atual.get(f) !== jornadaId)
  if (mudar.length) {
    const { error } = await admin.from("pessoal_jornada_funcionarios").upsert(
      mudar.map((f) => ({
        emp_proprietaria_id: emp,
        funcionario_id: f,
        jornada_id: jornadaId,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: "emp_proprietaria_id,funcionario_id" }
    )
    if (error) return { erro: `Não foi possível salvar: ${error.message}` }
  }
  revalidatePath("/painel/pessoal/atribuicoes/jornadas", "layout")
  return {
    ok: `${mudar.length === 1 ? "1 funcionário vinculado" : `${mudar.length} funcionários vinculados`} à jornada ${jornada.nome}.`,
  }
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

// ── IA: análise SST da atividade (itens 6-10) ───────────────────────────────────

export async function analisarAtividadeComIA(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  await exigir()
  const atividadeId = txt(fd, "atividade_id")
  if (!atividadeId) return { erro: "Atividade inválida." }

  const atividade = await buscarAtividade(atividadeId)
  if (!atividade) return { erro: "Atividade não encontrada." }

  const { sugestao, erro } = await analisarSST({
    atividade: atividade.nome ?? "",
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
  // pessoa que executa a atividade (o gestor ajusta a probabilidade individual)
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

  revalidatePath(`/painel/pessoal/atribuicoes/atividades/${atividadeId}`)
  const riscosMsg = executores.length
    ? `${sugestao.riscos.length} risco(s) aplicado(s) a ${executores.length} executor(es)`
    : `riscos NÃO gravados (a atividade ainda não tem executores — o risco é avaliado por pessoa)`
  return {
    ok: `IA sugeriu ${sugestao.perigos.length} perigo(s), ${riscosMsg}, ${novasFerramentas.length} ferramenta(s) e ${sugestao.medidas.length} medida(s). Revise, ajuste os níveis por pessoa e remova o que não se aplicar.`,
  }
}
