"use server"

import { revalidatePath } from "next/cache"

import { requirePermissao } from "@/lib/auth"
import { podeAcessar } from "@/lib/permissoes"
import { type EstadoForm } from "@/lib/contas"
import { avisar, depoisDaResposta, usuariosComPermissao } from "@/lib/db/avisos"
import {
  anomaliaDaTarefa,
  atualizarTarefa,
  criarTarefa,
  definirConclusaoTarefa,
  demandaDoProjeto,
  desvincularTarefa,
  garantirDemandaDoProjeto,
  obterDemanda,
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
  if (projetoDoForm && podeAcessar(sessao.permissoes, "ferramentas_projetos_edicao")) return { usuarioId }
  if (!podeAcessar(sessao.permissoes, "ferramentas_anomalias")) return { erro: "Sem permissão para esta tarefa." }
  const anomalia = tarefaId ? await anomaliaDaTarefa(tarefaId) : anomaliaDoForm || null
  return anomalia ? { usuarioId } : { erro: "Sem permissão para esta tarefa." }
}

function lerDados(formData: FormData): DadosTarefa {
  return {
    titulo: texto(formData, "titulo"),
    tipo: texto(formData, "tipo") || null,
    data_prazo_entrega: dataISO(texto(formData, "data_prazo_entrega")),
    demandante_id: texto(formData, "demandante_id") || null,
    demandado_id: texto(formData, "demandado_id") || null,
    demanda_id: texto(formData, "demanda_id") || null,
    projeto_id: texto(formData, "projeto_id") || null,
    anomalia_id: texto(formData, "anomalia_id") || null,
  }
}

/**
 * Avisa o responsável (demandado) de que a tarefa é dele: sino e, conforme a
 * preferência, e-mail, Telegram e celular. Quem atribui a si mesmo não é
 * avisado. Depois da resposta, melhor esforço.
 */
function avisarResponsavel(dados: DadosTarefa, quemCriou: string): void {
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
      link: "/painel/ferramentas/tarefas?minhas=1",
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

  // Tarefa de projeto entra também na demanda do projeto (criada na primeira vez).
  if (dados.projeto_id && !dados.demanda_id) {
    const demanda = await garantirDemandaDoProjeto(dados.projeto_id, acesso.usuarioId)
    if (demanda.erro || !demanda.id) return { erro: demanda.erro ?? "Falha ao criar a demanda do projeto." }
    dados.demanda_id = demanda.id
  }

  const { erro } = await criarTarefa(dados)
  if (erro) return { erro }
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
  const acesso = await exigirPermissaoDaTarefa(id, "", texto(formData, "projeto_id"))
  if ("erro" in acesso) return { erro: acesso.erro }

  const { erro } = await definirConclusaoTarefa(id, concluir)
  if (erro) return { erro }
  revalidarTarefa(formData)
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
