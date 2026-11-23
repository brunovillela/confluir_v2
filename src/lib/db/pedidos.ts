import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { avisar, type Destinatario } from "@/lib/db/avisos"
import { esquemaAusente, hojeSP, nomesDosUsuarios, texto } from "@/lib/db/comum"
import { aplicarModeloNaDemanda } from "@/lib/db/modelos"
import { criarDemanda } from "@/lib/db/nucleo"
import { somarDias } from "@/lib/deliberacoes-constantes"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * FORMULÁRIOS DE PEDIDO (Onda 3, 22/11/2026): "Pedido à Comunicação",
 * "Pedido ao Jurídico"… Quem pede preenche em Pedidos (aberto a todo o
 * painel); o pedido vira uma demanda do responsável do formulário, com as
 * tarefas do modelo, se houver. Quem pediu acompanha em Meus pedidos e é
 * avisado quando a demanda vai para Feito.
 */

type Linha = Record<string, unknown>

export type Formulario = {
  id: string
  nome: string
  descricao: string | null
  responsavelId: string | null
  responsavelNome: string | null
  modeloId: string | null
  modeloNome: string | null
  ativo: boolean
}

export async function listarFormularios(soAtivos = false): Promise<Formulario[]> {
  const admin = await createAdminClient()
  let q = admin
    .from("demandas_formularios")
    .select("id, nome, descricao, responsavel_id, modelo_id, ativo, modelo:modelo_id (nome)")
    .eq("emp_proprietaria_id", await tenantAtual())
    .order("nome")
  if (soAtivos) q = q.eq("ativo", true)
  const { data, error } = await q
  if (error) {
    if (esquemaAusente(error)) return []
    throw new Error(`Falha ao ler os formulários: ${error.message}`)
  }
  const linhas = (data ?? []) as Linha[]
  const nomes = await nomesDosUsuarios(linhas.map((f) => String(f.responsavel_id ?? "")).filter(Boolean), "guerra")
  return linhas.map((f) => {
    const m = (Array.isArray(f.modelo) ? f.modelo[0] : f.modelo) as Linha | null
    return {
      id: String(f.id),
      nome: String(f.nome),
      descricao: texto(f.descricao),
      responsavelId: texto(f.responsavel_id),
      responsavelNome: f.responsavel_id ? (nomes.get(String(f.responsavel_id)) ?? null) : null,
      modeloId: texto(f.modelo_id),
      modeloNome: texto(m?.nome),
      ativo: f.ativo === true,
    }
  })
}

export async function salvarFormulario(
  id: string | null,
  dados: { nome: string; descricao: string | null; responsavelId: string | null; modeloId: string | null; ativo: boolean }
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const linha = { nome: dados.nome, descricao: dados.descricao, responsavel_id: dados.responsavelId, modelo_id: dados.modeloId, ativo: dados.ativo }
  const { error } = id
    ? await admin.from("demandas_formularios").update(linha).eq("id", id).eq("emp_proprietaria_id", emp)
    : await admin.from("demandas_formularios").insert({ ...linha, emp_proprietaria_id: emp })
  if (error) return { erro: `Falha ao salvar o formulário: ${error.message}` }
  return {}
}

export async function excluirFormulario(id: string): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin.from("demandas_formularios").delete().eq("id", id).eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: `Falha ao excluir o formulário: ${error.message}` }
  return {}
}

async function destinatario(client: SupabaseClient, id: string | null): Promise<Destinatario | null> {
  if (!id) return null
  const { data: u } = await client
    .from("usuarios")
    .select("id, nome_completo, nome_guerra, email")
    .eq("id", id)
    .not("inativo", "is", true)
    .not("deletado", "is", true)
    .maybeSingle()
  return u ? { id: String(u.id), nome: texto(u.nome_completo) ?? texto(u.nome_guerra), email: texto(u.email), permissoes: {} } : null
}

/** O pedido vira demanda do responsável do formulário, com as tarefas do modelo. */
export async function enviarPedido(
  formularioId: string,
  pedido: { titulo: string; descricao: string; prazo: string | null },
  solicitante: { id: string; nome: string | null }
): Promise<{ erro?: string; demandaId?: string }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data: f } = await admin
    .from("demandas_formularios")
    .select("id, nome, responsavel_id, modelo_id, ativo")
    .eq("id", formularioId)
    .eq("emp_proprietaria_id", emp)
    .maybeSingle()
  if (!f || f.ativo !== true) return { erro: "Este formulário não está recebendo pedidos." }
  const { id: demandaId, erro } = await criarDemanda(
    {
      nome: `${f.nome}: ${pedido.titulo}`.slice(0, 200),
      descricao: [`Pedido de ${solicitante.nome ?? "alguém do painel"} pelo formulário "${f.nome}".`, pedido.descricao].filter(Boolean).join("\n\n"),
      situacao: "A fazer",
      prazo: pedido.prazo,
      orcamento: null,
      membro_responsavel_id: texto(f.responsavel_id),
      tipo: `Pedido: ${f.nome}`.slice(0, 60),
    },
    solicitante.id
  )
  if (erro || !demandaId) return { erro: erro ?? "Falha ao registrar o pedido." }
  await admin.from("demandas").update({ formulario_id: f.id }).eq("id", demandaId).eq("emp_proprietaria_id", emp)
  if (f.modelo_id) {
    const referencia = pedido.prazo ?? somarDias(hojeSP(), 7)
    const r = await aplicarModeloNaDemanda(String(f.modelo_id), demandaId, referencia, texto(f.responsavel_id), solicitante.id)
    if (r.erro) console.error("pedido: modelo", r.erro)
  }
  const d = await destinatario(admin, texto(f.responsavel_id))
  if (d && d.id !== solicitante.id) {
    await avisar([d], {
      texto: `Pedido novo em "${f.nome}": ${pedido.titulo.slice(0, 120)}.`,
      link: `/painel/ferramentas/demandas/${demandaId}`,
      evento: "pedido_recebido",
      assunto: `Pedido novo: ${f.nome}`,
    }).catch((e) => console.error("pedido: aviso", e))
  }
  return { demandaId }
}

export type MeuPedido = { id: string; nome: string; situacao: string; prazo: string | null; criadoEm: string; formulario: string | null }

export async function meusPedidos(usuarioId: string): Promise<MeuPedido[]> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("demandas")
    .select("id, nome, situacao, prazo, created_at, formulario:formulario_id (nome)")
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("criado_por", usuarioId)
    .not("formulario_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(100)
  if (error) return []
  return ((data ?? []) as Linha[]).map((d) => {
    const f = (Array.isArray(d.formulario) ? d.formulario[0] : d.formulario) as Linha | null
    return {
      id: String(d.id),
      nome: String(d.nome ?? ""),
      situacao: String(d.situacao ?? "A fazer"),
      prazo: texto(d.prazo),
      criadoEm: String(d.created_at),
      formulario: texto(f?.nome),
    }
  })
}

/** A demanda de um pedido foi para Feito: quem pediu é avisado. */
export async function avisarPedidoConcluido(demandaId: string): Promise<void> {
  const admin = await createAdminClient()
  const { data: d } = await admin
    .from("demandas")
    .select("nome, criado_por, formulario_id")
    .eq("id", demandaId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (!d?.formulario_id || !d.criado_por) return
  const quem = await destinatario(admin, String(d.criado_por))
  if (!quem) return
  await avisar([quem], {
    texto: `Seu pedido "${String(d.nome ?? "").slice(0, 120)}" foi concluído.`,
    link: "/painel/pedidos",
    evento: "pedido_concluido",
    assunto: "Pedido concluído",
    chaveEntrega: `pedido:${demandaId}:feito`,
  })
}
