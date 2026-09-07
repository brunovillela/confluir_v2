import "server-only"

import { type CampoExtra, type ModoFoto } from "@/lib/eventos-constantes"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Configuração do módulo por tenant, campos extras por evento e o livro de
 * pedidos de LGPD.
 *
 * SQL: supabase/eventos.sql
 */

// ── Configuração do tenant ───────────────────────────────────────────────────

export { MODOS_FOTO, TIPOS_CAMPO } from "@/lib/eventos-constantes"
export type { CampoExtra } from "@/lib/eventos-constantes"

export async function salvarConfigEventos(dados: {
  modoFoto: ModoFoto
  retencaoFotoDias: number
  controleAcessoNome: string | null
  controleAcessoExclusaoManual: boolean
  usuarioId: string
}): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()

  const { error } = await admin.from("eventos_config").upsert(
    {
      emp_proprietaria_id: emp,
      modo_foto: dados.modoFoto,
      retencao_foto_dias: dados.retencaoFotoDias,
      controle_acesso_nome: dados.controleAcessoNome,
      controle_acesso_exclusao_manual: dados.controleAcessoExclusaoManual,
      atualizada_por: dados.usuarioId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "emp_proprietaria_id" }
  )
  if (error) return { erro: error.message }
  return {}
}

/**
 * Quantas fotos já existem no tenant. Baixar o modo (biométrica → visual, ou
 * qualquer coisa → nenhuma) com fotos guardadas muda o regime legal do que já
 * foi coletado, e quem decide precisa ver o número antes de salvar.
 */
export async function fotosGuardadas(): Promise<number> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { count } = await admin
    .from("eventos_inscricoes")
    .select("id", { count: "exact", head: true })
    .eq("emp_proprietaria_id", emp)
    .not("foto_url", "is", null)
  return count ?? 0
}

// ── Campos extras do evento ──────────────────────────────────────────────────

export async function listarCampos(eventoId: string): Promise<CampoExtra[]> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data } = await admin
    .from("eventos_campos")
    .select("id, rotulo, tipo, opcoes, ajuda, obrigatorio, ordem, ativo")
    .eq("emp_proprietaria_id", emp)
    .eq("evento_id", eventoId)
    .order("ordem")

  const campos = data ?? []
  if (campos.length === 0) return []

  // Quantas respostas cada campo já tem: é o que decide se ele pode ser
  // apagado ou apenas desativado.
  const { data: respostas } = await admin
    .from("eventos_inscricao_respostas")
    .select("campo_id")
    .in(
      "campo_id",
      campos.map((c) => c.id as string)
    )
  const contagem = new Map<string, number>()
  for (const r of respostas ?? []) {
    const id = r.campo_id as string
    contagem.set(id, (contagem.get(id) ?? 0) + 1)
  }

  return campos.map((c) => ({
    id: c.id as string,
    rotulo: (c.rotulo as string) ?? "",
    tipo: (c.tipo as string) ?? "texto",
    opcoes: (c.opcoes as string[] | null) ?? [],
    ajuda: (c.ajuda as string | null) ?? null,
    obrigatorio: c.obrigatorio === true,
    ordem: Number(c.ordem ?? 0),
    ativo: c.ativo !== false,
    respostas: contagem.get(c.id as string) ?? 0,
  }))
}

export async function salvarCampo(
  eventoId: string,
  campo: {
    id?: string
    rotulo: string
    tipo: string
    opcoes: string[]
    ajuda: string | null
    obrigatorio: boolean
  }
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()

  if (campo.id) {
    const { error } = await admin
      .from("eventos_campos")
      .update({
        rotulo: campo.rotulo,
        tipo: campo.tipo,
        opcoes: campo.tipo === "selecao" ? campo.opcoes : null,
        ajuda: campo.ajuda,
        obrigatorio: campo.obrigatorio,
      })
      .eq("emp_proprietaria_id", emp)
      .eq("id", campo.id)
    return error ? { erro: error.message } : {}
  }

  const { data: ultimo } = await admin
    .from("eventos_campos")
    .select("ordem")
    .eq("emp_proprietaria_id", emp)
    .eq("evento_id", eventoId)
    .order("ordem", { ascending: false })
    .limit(1)
    .maybeSingle()

  const { error } = await admin.from("eventos_campos").insert({
    emp_proprietaria_id: emp,
    evento_id: eventoId,
    rotulo: campo.rotulo,
    tipo: campo.tipo,
    opcoes: campo.tipo === "selecao" ? campo.opcoes : null,
    ajuda: campo.ajuda,
    obrigatorio: campo.obrigatorio,
    ordem: Number(ultimo?.ordem ?? 0) + 1,
  })
  return error ? { erro: error.message } : {}
}

/**
 * Campo sem resposta é apagado; campo com resposta é só DESATIVADO — apagá-lo
 * levaria junto o que as pessoas já responderam, e some da ficha de quem já se
 * inscreveu.
 */
export async function removerCampo(
  campoId: string
): Promise<{ erro?: string; apagado?: boolean; desativado?: boolean }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()

  const { count } = await admin
    .from("eventos_inscricao_respostas")
    .select("id", { count: "exact", head: true })
    .eq("campo_id", campoId)

  if ((count ?? 0) > 0) {
    const { error } = await admin
      .from("eventos_campos")
      .update({ ativo: false })
      .eq("emp_proprietaria_id", emp)
      .eq("id", campoId)
    return error ? { erro: error.message } : { desativado: true }
  }

  const { error } = await admin
    .from("eventos_campos")
    .delete()
    .eq("emp_proprietaria_id", emp)
    .eq("id", campoId)
  return error ? { erro: error.message } : { apagado: true }
}

export async function reativarCampo(campoId: string): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { error } = await admin
    .from("eventos_campos")
    .update({ ativo: true })
    .eq("emp_proprietaria_id", emp)
    .eq("id", campoId)
  return error ? { erro: error.message } : {}
}

// ── Livro de pedidos de LGPD ─────────────────────────────────────────────────

export type PedidoLgpd = {
  id: string
  tipo: string
  emailTitular: string | null
  solicitadoEm: string
  concluidoEm: string | null
  registrosAnonimizados: string | null
  baseLegalRetencao: string | null
  observacao: string | null
  acessoRemocaoPendente: boolean
  acessoRemovidoEm: string | null
  acessoRemovidoPorNome: string | null
}

/**
 * Pedidos vindos do canal do titular (`/meus-dados`).
 *
 * O `email_titular` fica legível de propósito, contra a regra geral desta
 * tabela: sem ele, ninguém consegue executar a remoção no sistema de controle
 * de acesso — não se apaga um rosto de uma catraca a partir de um hash. É
 * retenção com finalidade declarada (art. 16, I), e o texto da tela diz isso a
 * quem opera.
 */
export async function listarPedidosLgpd(filtro?: {
  somentePendentes?: boolean
}): Promise<PedidoLgpd[]> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  let q = admin
    .from("lgpd_solicitacoes")
    .select(
      "id, tipo, email_titular, solicitado_em, concluido_em, registros_anonimizados, base_legal_retencao, observacao, acesso_remocao_pendente, acesso_removido_em, acesso_removido_por"
    )
    .eq("emp_proprietaria_id", emp)
    // Pedidos do canal do titular: enquanto têm identificação, pelo e-mail;
    // depois que ela é apagada, pela inscrição que ficou como âncora.
    .or("email_titular.not.is.null,inscricao_id.not.is.null")
  if (filtro?.somentePendentes) q = q.eq("acesso_remocao_pendente", true)

  const { data, error } = await q
    .order("solicitado_em", { ascending: false })
    .limit(500)
  if (error) return []

  const linhas = data ?? []
  const ids = [
    ...new Set(
      linhas
        .map((l) => l.acesso_removido_por as string | null)
        .filter((v): v is string => Boolean(v))
    ),
  ]
  const nomes = new Map<string, string>()
  if (ids.length > 0) {
    const { data: usuarios } = await admin
      .from("usuarios")
      .select("id, nome")
      .in("id", ids)
    for (const u of usuarios ?? []) {
      nomes.set(u.id as string, (u.nome as string) ?? "")
    }
  }

  return linhas.map((l) => ({
    id: l.id as string,
    tipo: (l.tipo as string) ?? "",
    emailTitular: (l.email_titular as string | null) ?? null,
    solicitadoEm: l.solicitado_em as string,
    concluidoEm: (l.concluido_em as string | null) ?? null,
    registrosAnonimizados: (l.registros_anonimizados as string | null) ?? null,
    baseLegalRetencao: (l.base_legal_retencao as string | null) ?? null,
    observacao: (l.observacao as string | null) ?? null,
    acessoRemocaoPendente: l.acesso_remocao_pendente === true,
    acessoRemovidoEm: (l.acesso_removido_em as string | null) ?? null,
    acessoRemovidoPorNome: l.acesso_removido_por
      ? (nomes.get(l.acesso_removido_por as string) ?? null)
      : null,
  }))
}

/**
 * Baixa a pendência: alguém foi lá, no outro sistema, e removeu o rosto.
 *
 * E APAGA a identificação do pedido. O e-mail só estava guardado porque não se
 * localiza alguém numa catraca a partir de um hash; cumprida a remoção, ele
 * perdeu a finalidade — e manter o endereço de quem pediu para ser esquecido
 * seria guardar justamente o que a pessoa mandou apagar.
 *
 * A PROVA sobrevive inteira: tipo do pedido, datas, quantos registros foram
 * anonimizados, a base legal da retenção e quem executou a remoção. É o que a
 * autoridade pede — nada disso identifica a pessoa.
 */
export async function marcarRemocaoDeAcesso(
  pedidoId: string,
  usuarioId: string
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { error } = await admin
    .from("lgpd_solicitacoes")
    .update({
      acesso_remocao_pendente: false,
      acesso_removido_em: new Date().toISOString(),
      acesso_removido_por: usuarioId,
      email_titular: null,
      cpf_titular: null,
    })
    .eq("emp_proprietaria_id", emp)
    .eq("id", pedidoId)
    .eq("acesso_remocao_pendente", true)
  return error ? { erro: error.message } : {}
}
