"use server"

import { revalidatePath } from "next/cache"

import { requirePermissao, requireSessaoPainel } from "@/lib/auth"
import { podeAcessar } from "@/lib/permissoes"
import { type EstadoForm } from "@/lib/contas"
import {
  ehColunaTarefa,
  ehPrioridadeTarefa,
  ehRecorrenciaTarefa,
  type PrioridadeTarefa,
  type RecorrenciaTarefa,
} from "@/lib/nucleo-constantes"
import { avisar, depoisDaResposta, usuariosComPermissao } from "@/lib/db/avisos"
import { removerAnexosDaTarefa } from "@/lib/db/tarefa-conversa"
import { definirEtiquetasDaTarefa } from "@/lib/db/tarefa-extras"
import { aplicarRegras } from "@/lib/db/regras"
import { opcoesDeProcedimento } from "@/lib/db/documentos"
import {
  atualizarTarefa,
  criarTarefa,
  definirAndamentoTarefa,
  definirConclusaoTarefa,
  definirDependencias,
  tarefasLiberadasPor,
  demandaDoProjeto,
  desvincularTarefa,
  editarTarefa,
  excluirTarefa,
  garantirDemandaDoProjeto,
  gerarProximaRecorrencia,
  obterDemanda,
  paisDaTarefa,
  responsavelDaTarefa,
  vincularTarefa,
  type DadosTarefa,
} from "@/lib/db/nucleo"

function texto(formData: FormData, campo: string): string {
  return String(formData.get(campo) ?? "").trim()
}

function dataISO(valor: string): string | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(valor) ? valor : null
}

/** Revalida a lista global e o detalhe do pai (se houver) informado no form. */
function revalidarTarefa(formData: FormData, extra: { demandaId?: string | null } = {}): void {
  revalidatePath("/painel/ferramentas/tarefas")
  revalidatePath("/painel/perfil/tarefas")
  const demandaId = texto(formData, "demanda_id") || extra.demandaId
  const projetoId = texto(formData, "projeto_id")
  const anomaliaId = texto(formData, "anomalia_id")
  if (demandaId) revalidatePath(`/painel/ferramentas/demandas/${demandaId}`)
  if (anomaliaId) revalidatePath(`/painel/ferramentas/anomalias/${anomaliaId}`)
  if (projetoId) revalidatePath(`/painel/ferramentas/projetos/${projetoId}`)
  if (demandaId || projetoId) revalidatePath("/painel/ferramentas/demandas")
}

/**
 * Tarefas e Demandas mexem em qualquer tarefa. Quem só tem Anomalias mexe nas
 * tarefas DAS ANOMALIAS — conferido no banco para a tarefa existente, não pelo
 * que veio no formulário. Quem edita Projetos mexe nas tarefas do projeto.
 */
async function exigirPermissaoDaTarefa(
  tarefaId: string | null,
  anomaliaDoForm: string,
  projetoDoForm = ""
): Promise<{ erro: string } | { usuarioId: string }> {
  const sessao = await requirePermissao("ferramentas_tarefas", [
    "ferramentas_demandas",
    "ferramentas_anomalias",
    "ferramentas_projetos_edicao",
  ])
  const usuarioId = String(sessao.usuario.id)
  if (podeAcessar(sessao.permissoes, "ferramentas_tarefas", ["ferramentas_demandas"])) return { usuarioId }
  // Tarefa existente: o vínculo vem do banco, não do formulário.
  const pais = tarefaId ? await paisDaTarefa(tarefaId) : null
  if (tarefaId && !pais) return { erro: "Tarefa não encontrada." }
  const projeto = tarefaId ? pais?.projetoId : projetoDoForm
  if (projeto && podeAcessar(sessao.permissoes, "ferramentas_projetos_edicao")) return { usuarioId }
  if (!podeAcessar(sessao.permissoes, "ferramentas_anomalias")) return { erro: "Sem permissão para esta tarefa." }
  const anomalia = tarefaId ? (pais?.anomaliaId ?? null) : anomaliaDoForm || null
  return anomalia ? { usuarioId } : { erro: "Sem permissão para esta tarefa." }
}

/** Prioridade do formulário; fora da lista (ou ausente) vira "media". */
function prioridade(formData: FormData): PrioridadeTarefa {
  const v = texto(formData, "prioridade")
  return ehPrioridadeTarefa(v) ? v : "media"
}

/** Repetição do formulário; vazia ou fora da lista = não repete. */
function recorrencia(formData: FormData): RecorrenciaTarefa | null {
  const v = texto(formData, "recorrencia")
  return ehRecorrenciaTarefa(v) ? v : null
}

const ERRO_RECORRENCIA_SEM_PRAZO = "Para repetir a tarefa, informe o prazo: a próxima nasce com ele avançado."

function lerDados(formData: FormData): DadosTarefa {
  return {
    titulo: texto(formData, "titulo"),
    tipo: texto(formData, "tipo") || null,
    data_prazo_entrega: dataISO(texto(formData, "data_prazo_entrega")),
    demandante_id: texto(formData, "demandante_id") || null,
    demandado_id: texto(formData, "demandado_id") || null,
    prioridade: prioridade(formData),
    recorrencia: recorrencia(formData),
    procedimento_id: texto(formData, "procedimento_id") || null,
    demanda_id: texto(formData, "demanda_id") || null,
    projeto_id: texto(formData, "projeto_id") || null,
    anomalia_id: texto(formData, "anomalia_id") || null,
  }
}

/**
 * Concluir libera as tarefas que dependiam desta (todas as anteriores
 * concluídas): o responsável de cada uma é avisado de que pode começar.
 */
function avisarLiberadas(tarefaId: string, quem: string): void {
  depoisDaResposta(async () => {
    const liberadas = await tarefasLiberadasPor(tarefaId)
    if (!liberadas.length) return
    const pessoas = await usuariosComPermissao(null)
    for (const t of liberadas) {
      const destino = pessoas.filter((p) => p.id === t.responsavelId)
      if (!destino.length) continue
      const titulo = (t.titulo ?? "(sem título)").slice(0, 120)
      await avisar(destino, {
        texto: `A tarefa "${titulo}" pode começar: as tarefas de que ela dependia foram concluídas.`,
        link: "/painel/perfil/tarefas",
        evento: "tarefa_liberada",
        assunto: "Tarefa liberada para começar",
        exceto: quem,
      })
    }
  })
}

/**
 * Avisa o responsável (demandado) de que a tarefa é dele: sino e, conforme a
 * preferência, e-mail, Telegram e celular. Quem atribui a si mesmo não é
 * avisado. Depois da resposta, melhor esforço.
 */
function avisarResponsavel(
  dados: Pick<DadosTarefa, "titulo" | "demandado_id" | "data_prazo_entrega">,
  quemCriou: string
): void {
  const responsavel = dados.demandado_id
  if (!responsavel || responsavel === quemCriou) return
  depoisDaResposta(async () => {
    const pessoas = await usuariosComPermissao(null)
    const quem = pessoas.filter((p) => p.id === responsavel)
    if (quem.length === 0) return
    const [a, m, d] = (dados.data_prazo_entrega ?? "").split("-")
    const titulo = dados.titulo.length > 120 ? `${dados.titulo.slice(0, 117)}…` : dados.titulo
    await avisar(quem, {
      texto: dados.data_prazo_entrega
        ? `Tarefa atribuída a você: "${titulo}", com prazo até ${d}/${m}/${a}.`
        : `Tarefa atribuída a você: "${titulo}".`,
      link: "/painel/perfil/tarefas",
      evento: "tarefa_responsavel",
      assunto: "Tarefa atribuída a você",
      exceto: quemCriou,
    })
  })
}

export async function criarTarefaAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const acesso = await exigirPermissaoDaTarefa(null, texto(formData, "anomalia_id"), texto(formData, "projeto_id"))
  if ("erro" in acesso) return { erro: acesso.erro }
  const dados = lerDados(formData)
  if (!dados.titulo) return { erro: "Descreva a tarefa." }
  if (dados.recorrencia && !dados.data_prazo_entrega) return { erro: ERRO_RECORRENCIA_SEM_PRAZO }
  // Quem pediu é quem cria (o formulário não pergunta): recebe o aviso de atraso.
  dados.demandante_id ??= acesso.usuarioId

  // Tarefa de projeto entra também na demanda do projeto (criada na primeira vez).
  if (dados.projeto_id && !dados.demanda_id) {
    const demanda = await garantirDemandaDoProjeto(dados.projeto_id, acesso.usuarioId)
    if (demanda.erro || !demanda.id) return { erro: demanda.erro ?? "Falha ao criar a demanda do projeto." }
    dados.demanda_id = demanda.id
  }

  const { erro, id: novaId } = await criarTarefa(dados)
  if (erro) return { erro }
  // Automações "quando uma tarefa for criada" (antes do aviso: a regra pode atribuir).
  if (novaId) await aplicarRegras("tarefa_criada", novaId).catch((e) => console.error("regras:", e))
  avisarResponsavel(dados, acesso.usuarioId)
  revalidarTarefa(formData, { demandaId: dados.demanda_id })
  return { ok: "Tarefa criada." }
}

export async function atualizarTarefaAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const id = texto(formData, "tarefa_id")
  if (!id) return { erro: "Tarefa inválida." }
  const acesso = await exigirPermissaoDaTarefa(id, "", texto(formData, "projeto_id"))
  if ("erro" in acesso) return { erro: acesso.erro }
  const dados = lerDados(formData)
  if (!dados.titulo) return { erro: "Descreva a tarefa." }

  const { erro } = await atualizarTarefa(id, dados)
  if (erro) return { erro }
  revalidarTarefa(formData)
  return { ok: "Tarefa salva." }
}

export async function alternarConclusaoTarefaAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const id = texto(formData, "tarefa_id")
  const concluir = texto(formData, "concluir") === "1"
  if (!id) return { erro: "Tarefa inválida." }
  // O responsável conclui (ou reabre) a própria tarefa mesmo sem a permissão
  // de Tarefas: é o que o aviso de prazo pede dele (Meu perfil → Minhas tarefas).
  const sessao = await requireSessaoPainel()
  const proprio = (await responsavelDaTarefa(id)) === String(sessao.usuario.id)
  if (!proprio) {
    const acesso = await exigirPermissaoDaTarefa(id, "", texto(formData, "projeto_id"))
    if ("erro" in acesso) return { erro: acesso.erro }
  }

  const { erro } = await definirConclusaoTarefa(id, concluir)
  if (erro) return { erro }
  // Recorrente: concluir cria a próxima (uma vez só por tarefa).
  const proxima = concluir ? await gerarProximaRecorrencia(id) : {}
  if (concluir) {
    avisarLiberadas(id, String(sessao.usuario.id))
    await aplicarRegras("tarefa_concluida", id).catch((e) => console.error("regras:", e))
  }
  revalidarTarefa(formData)
  if (proxima.erro) return { erro: proxima.erro }
  if (proxima.prazo) {
    const [a, m, d] = proxima.prazo.split("-")
    return { ok: `Tarefa concluída. A próxima, com prazo em ${d}/${m}/${a}, já está na lista.` }
  }
  return { ok: "Tarefa atualizada." }
}

/**
 * Traz uma tarefa avulsa para a demanda (formulário com `demanda_id`) ou para
 * o projeto (`projeto_id`; entra na demanda do projeto, criada se preciso).
 */
export async function vincularTarefaAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const tarefaId = texto(formData, "tarefa_id")
  if (!tarefaId) return { erro: "Escolha a tarefa." }
  const projetoId = texto(formData, "projeto_id") || null
  const acesso = await exigirPermissaoDaTarefa(null, "", projetoId ?? "")
  if ("erro" in acesso) return { erro: acesso.erro }

  let demandaId = texto(formData, "demanda_id") || null
  let projetoDaTarefa = projetoId
  if (projetoId) {
    const demanda = await garantirDemandaDoProjeto(projetoId, acesso.usuarioId)
    if (demanda.erro || !demanda.id) return { erro: demanda.erro ?? "Falha ao criar a demanda do projeto." }
    demandaId = demanda.id
  } else if (demandaId) {
    // Demanda que é de um projeto: a tarefa passa a ser do projeto também.
    const demanda = await obterDemanda(demandaId)
    if (!demanda) return { erro: "Demanda não encontrada." }
    projetoDaTarefa = demanda.projetoId
  }
  if (!demandaId) return { erro: "Vínculo inválido." }

  const { erro } = await vincularTarefa(tarefaId, { demandaId, projetoId: projetoDaTarefa })
  if (erro) return { erro }
  revalidarTarefa(formData, { demandaId })
  if (projetoDaTarefa) revalidatePath(`/painel/ferramentas/projetos/${projetoDaTarefa}`)
  return { ok: "Tarefa vinculada." }
}

/** Tira a tarefa da demanda/projeto da tela; ela segue existindo, avulsa. */
export async function desvincularTarefaAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const tarefaId = texto(formData, "tarefa_id")
  if (!tarefaId) return { erro: "Tarefa inválida." }
  const projetoId = texto(formData, "projeto_id") || null
  const acesso = await exigirPermissaoDaTarefa(tarefaId, "", projetoId ?? "")
  if ("erro" in acesso) return { erro: acesso.erro }

  let demandaId = texto(formData, "demanda_id") || null
  if (projetoId && !demandaId) {
    demandaId = (await demandaDoProjeto(projetoId))?.id ?? null
  }
  const { erro } = await desvincularTarefa(tarefaId, { demandaId, projetoId })
  if (erro) return { erro }
  revalidarTarefa(formData, { demandaId })
  return { ok: "Tarefa desvinculada." }
}

/** Revalida a lista e as páginas de onde a tarefa é (lidas do banco). */
function revalidarPais(pais: { demandaId: string | null; projetoId: string | null; anomaliaId: string | null } | null): void {
  revalidatePath("/painel/ferramentas/tarefas")
  if (pais?.demandaId) revalidatePath(`/painel/ferramentas/demandas/${pais.demandaId}`)
  if (pais?.projetoId) revalidatePath(`/painel/ferramentas/projetos/${pais.projetoId}`)
  if (pais?.anomaliaId) revalidatePath(`/painel/ferramentas/anomalias/${pais.anomaliaId}`)
  if (pais?.demandaId || pais?.projetoId) revalidatePath("/painel/ferramentas/demandas")
}

/**
 * Edita título, responsável e prazo. Responsável novo (outra pessoa) é
 * avisado, como na criação.
 */
export async function editarTarefaAction(_prev: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const id = texto(formData, "tarefa_id")
  if (!id) return { erro: "Tarefa inválida." }
  const acesso = await exigirPermissaoDaTarefa(id, "")
  if ("erro" in acesso) return { erro: acesso.erro }
  const dados = {
    titulo: texto(formData, "titulo"),
    demandado_id: texto(formData, "demandado_id") || null,
    data_prazo_entrega: dataISO(texto(formData, "data_prazo_entrega")),
    prioridade: prioridade(formData),
    recorrencia: recorrencia(formData),
    procedimento_id: texto(formData, "procedimento_id") || null,
    data_inicio: dataISO(texto(formData, "data_inicio")),
  }
  if (!dados.titulo) return { erro: "Descreva a tarefa." }
  if (dados.data_inicio && dados.data_prazo_entrega && dados.data_inicio > dados.data_prazo_entrega) {
    return { erro: "O início não pode ser depois do prazo." }
  }
  if (formData.has("etiquetas_presente")) {
    const r = await definirEtiquetasDaTarefa(id, formData.getAll("etiqueta").map(String))
    if (r.erro) return { erro: r.erro }
  }
  // Só mexe nas dependências quando o formulário as traz (o seletor existe).
  if (formData.has("depende_de_presente")) {
    const deps = formData.getAll("depende_de").map(String).filter(Boolean)
    const r = await definirDependencias(id, deps)
    if (r.erro) return { erro: r.erro }
  }
  if (dados.recorrencia && !dados.data_prazo_entrega) return { erro: ERRO_RECORRENCIA_SEM_PRAZO }

  const { erro, responsavelAnterior } = await editarTarefa(id, dados)
  if (erro) return { erro }
  if (dados.demandado_id && dados.demandado_id !== responsavelAnterior) avisarResponsavel(dados, acesso.usuarioId)
  revalidarPais(await paisDaTarefa(id))
  return { ok: "Tarefa salva." }
}

/** Exclui a tarefa de vez (a tela confirma antes). */
export async function excluirTarefaAction(_prev: EstadoForm, formData: FormData): Promise<EstadoForm> {
  const id = texto(formData, "tarefa_id")
  if (!id) return { erro: "Tarefa inválida." }
  const acesso = await exigirPermissaoDaTarefa(id, "")
  if ("erro" in acesso) return { erro: acesso.erro }
  const pais = await paisDaTarefa(id)
  await removerAnexosDaTarefa(id)
  const { erro } = await excluirTarefa(id)
  if (erro) return { erro }
  revalidarPais(pais)
  return { ok: "Tarefa excluída." }
}

/** Documentos que podem ser o procedimento da tarefa (o seletor carrega ao abrir). */
export async function opcoesDeProcedimentoAction(): Promise<{ id: string; nome: string }[]> {
  await requirePermissao("ferramentas_tarefas", [
    "ferramentas_demandas",
    "ferramentas_anomalias",
    "ferramentas_projetos_edicao",
  ])
  return opcoesDeProcedimento()
}

/**
 * Quadro: move a tarefa de coluna. Feito conclui (e, se a tarefa se repete,
 * cria a próxima); sair de Feito reabre; Em andamento marca o início. Pode
 * mover quem pode concluir: o responsável ou quem cuida da tarefa.
 */
export async function moverTarefaAction(tarefaId: string, coluna: string): Promise<EstadoForm> {
  if (!tarefaId || !ehColunaTarefa(coluna)) return { erro: "Movimento inválido." }
  const sessao = await requireSessaoPainel()
  const proprio = (await responsavelDaTarefa(tarefaId)) === String(sessao.usuario.id)
  if (!proprio) {
    const acesso = await exigirPermissaoDaTarefa(tarefaId, "")
    if ("erro" in acesso) return { erro: acesso.erro }
  }
  const pais = await paisDaTarefa(tarefaId)
  if (coluna === "feito") {
    const { erro } = await definirConclusaoTarefa(tarefaId, true)
    if (erro) return { erro }
    const proxima = await gerarProximaRecorrencia(tarefaId)
    avisarLiberadas(tarefaId, String(sessao.usuario.id))
    await aplicarRegras("tarefa_concluida", tarefaId).catch((e) => console.error("regras:", e))
    revalidarPais(pais)
    revalidatePath("/painel/perfil/tarefas")
    if (proxima.erro) return { erro: proxima.erro }
    if (proxima.prazo) {
      const [a, m, d] = proxima.prazo.split("-")
      return { ok: `Tarefa concluída. A próxima, com prazo em ${d}/${m}/${a}, já está no quadro.` }
    }
    return { ok: "Tarefa concluída." }
  }
  const reabrir = await definirConclusaoTarefa(tarefaId, false)
  if (reabrir.erro) return { erro: reabrir.erro }
  const { erro } = await definirAndamentoTarefa(tarefaId, coluna === "em_andamento")
  if (erro) return { erro }
  revalidarPais(pais)
  revalidatePath("/painel/perfil/tarefas")
  return { ok: "Tarefa movida." }
}
