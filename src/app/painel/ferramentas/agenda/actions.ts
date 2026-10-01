"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { TIPOS_AGENDA_AVULSA, TITULO_MAX_AGENDA } from "@/lib/agenda-constantes"
import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { excluirCompromisso, salvarCompromisso } from "@/lib/db/agenda"
import { deCampoDataHora } from "@/lib/formato"

function texto(fd: FormData, campo: string): string {
  return String(fd.get(campo) ?? "").trim()
}

function revalidar(id?: string) {
  revalidatePath("/painel/ferramentas/agenda")
  if (id) revalidatePath(`/painel/ferramentas/agenda/${id}`)
  // A coluna do dia no painel inicial e a agenda do portal leem a mesma tabela.
  revalidatePath("/painel")
  revalidatePath("/portal")
}

/** Cria ou edita um compromisso avulso da Agenda. */
export async function salvarCompromissoAction(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  const sessao = await requirePermissao("ferramentas_agendas_edicao")
  const id = texto(fd, "id") || null

  const atividade = texto(fd, "atividade")
  if (!atividade) return { erro: "Informe o título do compromisso." }
  if (atividade.length > TITULO_MAX_AGENDA) {
    return { erro: `O título passa de ${TITULO_MAX_AGENDA} caracteres.` }
  }
  const tipo = texto(fd, "tipo")
  if (!(TIPOS_AGENDA_AVULSA as readonly string[]).includes(tipo)) {
    return { erro: "Escolha o tipo do compromisso." }
  }

  const diaTodo = fd.get("dia_todo") === "on"
  let inicio: string | null
  let termino: string | null
  if (diaTodo) {
    // Dia todo: datas puras viram meio-dia de Brasília (como Votações faz),
    // para não escorregarem de dia por causa do fuso.
    const di = texto(fd, "data_inicio")
    const dt = texto(fd, "data_termino")
    if (!/^\d{4}-\d{2}-\d{2}$/.test(di)) return { erro: "Informe a data do compromisso." }
    if (dt && !/^\d{4}-\d{2}-\d{2}$/.test(dt)) return { erro: "Data de término inválida." }
    if (dt && dt < di) return { erro: "O término não pode ser antes do início." }
    inicio = `${di}T12:00:00-03:00`
    termino = dt && dt !== di ? `${dt}T12:00:00-03:00` : null
  } else {
    // datetime-local vem sem fuso: deCampoDataHora fixa America/Sao_Paulo
    // (sem isso a hora anda 3h a cada save — o servidor roda em UTC).
    inicio = deCampoDataHora(texto(fd, "inicio"))
    termino = deCampoDataHora(texto(fd, "termino"))
    if (!inicio) return { erro: "Informe a data e a hora de início." }
    if (termino && termino <= inicio) return { erro: "O término deve ser depois do início." }
  }

  const { erro, id: salvoId } = await salvarCompromisso(
    id,
    {
      atividade,
      tipo,
      inicio,
      termino,
      diaTodo,
      local: texto(fd, "local") || null,
      sedeId: texto(fd, "sede_id") || null,
      departamentoId: texto(fd, "departamento_id") || null,
      informacoesGerais: texto(fd, "informacoes_gerais") || null,
      eventoInterno: fd.get("evento_interno") === "on",
      aplicativo: fd.get("aplicativo") === "on",
    },
    sessao.usuario.id
  )
  if (erro || !salvoId) return { erro: erro ?? "Falha ao salvar." }

  revalidar(salvoId)
  redirect(`/painel/ferramentas/agenda/${salvoId}?salvo=1`)
}

export async function excluirCompromissoAction(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  await requirePermissao("ferramentas_agendas_edicao")
  const id = texto(fd, "id")
  if (!id) return { erro: "Compromisso inválido." }
  const { erro } = await excluirCompromisso(id)
  if (erro) return { erro }
  revalidar()
  redirect("/painel/ferramentas/agenda?excluido=1")
}
