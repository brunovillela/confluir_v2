import "server-only"

import { cache } from "react"
import type { SupabaseClient } from "@supabase/supabase-js"

import type { SessaoPainel } from "@/lib/auth"
import { alcadaDoUsuario } from "@/lib/db/compras"
import { SITUACAO_EM_AUTORIZACAO } from "@/lib/db/ordens-ciclo"
import { situacaoDosPlanos } from "@/lib/db/veiculos-manutencoes"
import { ATENDIMENTO_AGUARDANDO_EQUIPE } from "@/lib/atendimento-constantes"
import { podeAcessar, type Permissoes } from "@/lib/permissoes"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/** Mesmo valor de permissoes-resolver.ts: alçada sem teto. */
const ALCADA_SEM_TETO = Number.MAX_SAFE_INTEGER

/** Tipo das demandas criadas pelo menu de ajuda (lib/db/feedback.ts). */
const TIPO_DEMANDA_FEEDBACK = "Feedback do sistema"

/** A partir de quantos dias uma pendência conta como "parada". */
export const DIAS_PARADA = 7

/**
 * CAIXA DE ENTRADA DE PENDÊNCIAS (onda 2, U1): tudo que espera a pessoa
 * agir, reunido na home. Cada fonte é um head-count barato, gateado pela
 * permissão de quem vê, e tolerante a tabela/coluna ausente (a fonte some
 * em vez de derrubar a home). Nada aqui grava.
 *
 * `pendenciasPara` recebe o ambiente explícito (cliente, tenant, permissões)
 * para servir também ao lembrete diário (cron, sem requisição —
 * lib/db/pendencias-lembrete.ts); `pendenciasDoUsuario` é a versão da
 * requisição, cacheada.
 */

export type Pendencia = {
  chave: string
  titulo: string
  descricao: string
  quantidade: number
  href: string
  /** Quantas estão paradas há mais de DIAS_PARADA dias (só quando pedido). */
  antigas?: number
}

type Consulta = ReturnType<SupabaseClient["from"]>
/**
 * Consulta já com select(head) e filtros: aguardável (devolve a contagem) e
 * ainda filtrável. Interface mínima para não arrastar os genéricos do
 * PostgrestFilterBuilder (que estouram a inferência do TypeScript).
 */
type Filtro = PromiseLike<{ count: number | null; error: unknown }> & {
  lt: (coluna: string, valor: string) => Filtro
}
type Montar = (q: Consulta) => Filtro
type Fonte = {
  chave: string
  titulo: string
  descricao: string
  href: string
  tabela: string
  montar: Montar
  /** Contagem que não é um head-count (ex.: preventivas, calculadas a partir dos planos). */
  contarCom?: () => Promise<number | null>
}

export type AmbientePendencias = {
  client: SupabaseClient
  emp: string
  permissoes: Permissoes
  /** E-mail da pessoa: identifica as assinaturas pendentes dela. */
  email: string | null
  /** Quem vê: identifica a equipe que a pessoa coordena (pedidos a decidir). */
  usuarioId?: string | null
  /** Conta também as paradas há mais de DIAS_PARADA dias (uma consulta a mais por fonte). */
  comAntigas?: boolean
}

async function contar(client: SupabaseClient, tabela: string, montar: Montar): Promise<number | null> {
  try {
    const { count, error } = await montar(client.from(tabela))
    if (error) return null
    return count ?? 0
  } catch {
    return null
  }
}

function dataLimiteParada(): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - DIAS_PARADA)
  return d.toISOString()
}

export async function pendenciasPara(amb: AmbientePendencias): Promise<Pendencia[]> {
  const { client, emp, permissoes } = amb
  const p = permissoes as Record<string, unknown>
  const pode = (chave: string, alternativas: string[] = []) => podeAcessar(permissoes, chave, alternativas)
  const fontes: Fonte[] = []
  const head = (q: Consulta) => q.select("id", { count: "exact", head: true }).eq("emp_proprietaria_id", emp)
  // Remessas de diárias esperando decisão: novas, não aprovadas, abertas ou reenviadas, com valor.
  const remessasAAvaliar = (q: Consulta) =>
    head(q).is("bubble_id", null).not("enviado", "is", true).in("situacao", ["aberta", "reenviada"]).gt("valor_total", 0)

  // Cada fonte usa O MESMO critério e a MESMA permissão da tela para onde
  // leva — senão a caixa mostra um número e a tela, outro (06/10/2026).

  // Ordens de pagamento dentro da minha alçada (= fila de avaliação: não
  // excluídas e com valor — sem valor não há como conferir a alçada).
  const alcada = alcadaDoUsuario(p)
  if (alcada > 0 && pode("aquisicoes_avaliacoes", ["financeiro_pagamento"])) {
    fontes.push({
      chave: "ordens",
      titulo: "Ordens aguardando sua autorização",
      descricao: alcada >= ALCADA_SEM_TETO ? "Todas as ordens em autorização" : "Dentro da sua alçada",
      // A tela de avaliações exige a chave de avaliação; "Aprovar" serve aos dois.
      href: pode("aquisicoes_avaliacoes") ? "/painel/compras/avaliacoes" : "/painel/aprovar",
      tabela: "ordens_pagamento",
      montar: (q) => {
        let c = head(q)
          .eq("situacao", SITUACAO_EM_AUTORIZACAO)
          .not("excluido", "is", true)
          .not("valor_inicial_cobranca", "is", null)
        if (alcada < ALCADA_SEM_TETO) c = c.lte("valor_inicial_cobranca", alcada)
        return c
      },
    })
  }

  // Pessoal
  if (pode("pessoal_gestao")) {
    fontes.push({
      chave: "ferias",
      titulo: "Férias a autorizar",
      descricao: "Gozos pedidos pelos funcionários",
      href: "/painel/pessoal/ferias",
      tabela: "pessoal_ferias_gozo",
      // = gozoAguardandoAutorizacao (tela de Férias): sem decisão e com início.
      montar: (q) =>
        head(q).not("autorizado", "is", true).is("data_autorizacao", null).not("inicio", "is", null),
    })
    fontes.push({
      chave: "reembolsos_pessoal",
      titulo: "Reembolsos do ACT a avaliar",
      descricao: "Pedidos dos funcionários",
      href: "/painel/pessoal/reembolsos",
      tabela: "pessoal_reembolsos_act",
      montar: (q) => head(q).eq("situacao", "aguardando"),
    })
  }
  // Diárias: cada porta conta só o seu quadro, com a permissão dela.
  if (pode("pessoal_gestao", ["pessoal_diarias"])) {
    fontes.push({
      chave: "diarias",
      titulo: "Remessas de diárias a avaliar",
      descricao: "Remessas de funcionários aguardando aprovação",
      href: "/painel/pessoal/diarias/remessas",
      tabela: "pessoal_diarias_remessas",
      // 08/10: a avaliação é da remessa (abertas e reenviadas, com valor).
      montar: (q) => remessasAAvaliar(q).eq("beneficiario_tipo", "funcionario"),
    })
  }
  if (pode("diretoria_diarias", ["configuracoes"])) {
    fontes.push({
      chave: "diarias_diretoria",
      titulo: "Remessas de diárias da diretoria",
      descricao: "Remessas de diretores aguardando aprovação",
      href: "/painel/institucional/diretoria/diarias/remessas",
      tabela: "pessoal_diarias_remessas",
      montar: (q) => remessasAAvaliar(q).eq("beneficiario_tipo", "diretor"),
    })
  }
  if (pode("pessoal_gestao", ["pessoal_faltas_justificadas"])) {
    fontes.push({
      chave: "faltas",
      titulo: "Faltas justificadas a autorizar",
      descricao: "Pedidos sem decisão",
      href: "/painel/pessoal/faltas",
      tabela: "pessoal_faltas_justificadas",
      // Aguardando = nem autorizada nem recusada (falso conta como sem decisão).
      montar: (q) => head(q).not("autorizado", "is", true).not("recusado", "is", true),
    })
  }

  // Filiação
  if (pode("filiacao_gestao")) {
    fontes.push({
      chave: "filiacao_solicitacoes",
      titulo: "Solicitações de filiação",
      descricao: "Fichas públicas aguardando avaliação",
      href: "/painel/filiados/solicitacoes",
      tabela: "filiacao_solicitacoes",
      montar: (q) => head(q).eq("situacao", "nao_avaliada"),
    })
  }

  // Jurídico: reembolsos ao escritório (o reembolso a filiado não passa por
  // avaliação — nasce com a ordem).
  if (pode("juridico_gestao", ["juridico_geral"])) {
    fontes.push({
      chave: "reembolsos_juridico",
      titulo: "Reembolsos jurídicos a avaliar",
      descricao: "Despesas do escritório aguardando aprovação",
      href: "/painel/juridico/reembolsos",
      tabela: "juridico_reembolsos",
      montar: (q) => head(q).or("situacao.is.null,situacao.not.in.(aprovado,reprovado)"),
    })
  }

  // Espaços
  if (pode("espacos", ["espacos_gestao"])) {
    fontes.push({
      chave: "espacos",
      titulo: "Pedidos de espaço em análise",
      descricao: "Solicitados ou em análise",
      href: "/painel/espacos/pedidos",
      tabela: "cessao_solicitacoes",
      montar: (q) => head(q).in("situacao", ["solicitada", "em_analise"]),
    })
  }

  // Viagens
  if (pode("viagens_gestao")) {
    fontes.push({
      chave: "viagens",
      titulo: "Viagens a atender",
      descricao: "Pedidos solicitados ou em atendimento",
      href: "/painel/institucional/viagens",
      tabela: "viagens_solicitacoes",
      montar: (q) => head(q).in("situacao", ["solicitada", "em_atendimento"]),
    })
  }

  // Aquisição: fornecimentos a receber
  if (pode("aquisicoes_recebimentos", ["aquisicoes_compras_edicao"])) {
    fontes.push({
      chave: "recebimentos",
      titulo: "Fornecimentos a receber",
      descricao: "Compras entregues ou a entregar sem recebimento",
      href: "/painel/compras/recebimentos",
      tabela: "compras_fornecimentos",
      montar: (q) => head(q).eq("recebido", false),
    })
  }

  // Minhas assinaturas pendentes (ofícios, termos, minutas) — o signatário é
  // identificado pelo e-mail do convite. "Aprovar" lista todas elas.
  const email = (amb.email ?? "").trim().toLowerCase()
  if (email) {
    fontes.push({
      chave: "assinaturas",
      titulo: "Documentos aguardando sua assinatura",
      descricao: "Ofícios, termos e minutas enviados para você",
      href: "/painel/aprovar",
      tabela: "documento_assinaturas",
      montar: (q) => head(q).eq("situacao", "pendente").ilike("email", email),
    })
  }

  // Atendimentos do portal esperando a equipe (novos ou com resposta nova).
  if (pode("ferramentas_demandas", ["ferramentas_tarefas", "filiacao_filiados"])) {
    fontes.push({
      chave: "atendimentos",
      titulo: "Atendimentos do portal",
      descricao: "Solicitações de filiados esperando a equipe",
      href: "/painel/filiados/atendimentos?situacao=aguardando",
      tabela: "portal_atendimentos",
      montar: (q) => head(q).in("situacao", ATENDIMENTO_AGUARDANDO_EQUIPE),
    })
  }

  // Relatos de problema ou sugestão sobre o sistema (viram demandas).
  if (pode("ferramentas_demandas", ["ferramentas_tarefas"])) {
    fontes.push({
      chave: "relatos_sistema",
      titulo: "Relatos do sistema a tratar",
      descricao: "Problemas e sugestões enviados pelo menu de ajuda",
      href: `/painel/ferramentas/demandas?tipo=${encodeURIComponent(TIPO_DEMANDA_FEEDBACK)}&situacao=abertas`,
      tabela: "demandas",
      montar: (q) => head(q).eq("tipo", TIPO_DEMANDA_FEEDBACK).neq("situacao", "Feito"),
    })
  }

  // Revisões preventivas da frota próximas ou vencidas (mesmo critério do aviso diário).
  if (pode("veiculos_gestao")) {
    fontes.push({
      chave: "preventivas",
      titulo: "Revisões preventivas da frota",
      descricao: "Próximas ou vencidas",
      href: "/painel/veiculos/manutencoes",
      tabela: "veiculos_manutencao_planos",
      montar: (q) => head(q),
      contarCom: async () => {
        try {
          const { ativo, linhas } = await situacaoDosPlanos(undefined, { admin: client, emp })
          return ativo ? linhas.filter((l) => l.vencido || l.proximo).length : null
        } catch {
          return null
        }
      },
    })
  }

  // Coordenação: os pedidos dos funcionários dos departamentos que a pessoa
  // coordena (mesmo critério de lib/db/coordenador.ts). Só entra o que a
  // permissão de Pessoal ainda não traz — senão o mesmo pedido contaria duas vezes.
  const equipe = amb.usuarioId ? await equipeCoordenada(client, emp, amb.usuarioId) : []
  if (equipe.length > 0) {
    if (!pode("pessoal_gestao")) {
      fontes.push({
        chave: "coord_ferias",
        titulo: "Férias da equipe a autorizar",
        descricao: "Pedidos dos funcionários que você coordena",
        href: "/painel?aba=coordenacao#pedidos",
        tabela: "pessoal_ferias_gozo",
        montar: (q) =>
          head(q)
            .in("funcionario_id", equipe)
            .not("autorizado", "is", true)
            .is("data_autorizacao", null)
            .not("inicio", "is", null),
      })
    }
    if (!pode("pessoal_gestao", ["pessoal_faltas_justificadas"])) {
      fontes.push({
        chave: "coord_faltas",
        titulo: "Faltas justificadas da equipe",
        descricao: "Pedidos dos funcionários que você coordena",
        href: "/painel?aba=coordenacao#pedidos",
        tabela: "pessoal_faltas_justificadas",
        montar: (q) => head(q).in("funcionario_id", equipe).not("autorizado", "is", true).not("recusado", "is", true),
      })
    }
    if (!pode("pessoal_gestao", ["pessoal_diarias"])) {
      fontes.push({
        chave: "coord_diarias",
        titulo: "Remessas de diárias da equipe",
        descricao: "Dos funcionários que você coordena",
        href: "/painel?aba=coordenacao#pedidos",
        tabela: "pessoal_diarias_remessas",
        montar: (q) => remessasAAvaliar(q).eq("beneficiario_tipo", "funcionario").in("beneficiario_id", equipe),
      })
    }
  }

  // Caixa: despesa lançada por outra pessoa numa conta de que a pessoa é
  // responsável (reconhecer) e despesa que ela lançou e não foi reconhecida
  // (transferir para a conta certa) — lib/db/caixa-reconhecimento.ts.
  if (amb.usuarioId) {
    const uid = amb.usuarioId
    const contas = await contasDoResponsavel(client, emp, uid)
    if (contas.length > 0) {
      fontes.push({
        chave: "caixa_reconhecer",
        titulo: "Despesas no seu caixa para reconhecer",
        descricao: "Lançadas por outras pessoas na sua conta",
        href: "/painel/perfil/caixa#reconhecer",
        tabela: "caixa_movimentacoes",
        montar: (q) => head(q).in("conta_id", contas).eq("situacao", "confirmada").eq("reconhecimento", "pendente"),
      })
    }
    fontes.push({
      chave: "caixa_nao_reconhecidas",
      titulo: "Despesas de caixa não reconhecidas",
      descricao: "Transfira para a conta de caixa certa",
      href: "/painel/perfil/despesas-caixa",
      tabela: "caixa_movimentacoes",
      montar: (q) => head(q).eq("criada_por_usuario_id", uid).eq("situacao", "confirmada").eq("reconhecimento", "nao_reconhecida"),
    })
  }

  const limite = dataLimiteParada()
  const contagens = await Promise.all(
    fontes.map(async (f) => {
      if (f.contarCom) return { quantidade: await f.contarCom(), antigas: undefined }
      const quantidade = await contar(client, f.tabela, f.montar)
      if (!amb.comAntigas || !quantidade) return { quantidade, antigas: undefined }
      // Tabela sem created_at → a consulta falha → sem a informação (não derruba).
      const antigas = await contar(client, f.tabela, (q) => f.montar(q).lt("created_at", limite))
      return { quantidade, antigas: antigas ?? undefined }
    })
  )
  return fontes
    .map((f, i) => ({
      chave: f.chave,
      titulo: f.titulo,
      descricao: f.descricao,
      href: f.href,
      quantidade: contagens[i].quantidade ?? 0,
      ...(contagens[i].antigas !== undefined ? { antigas: contagens[i].antigas } : {}),
    }))
    .filter((f, i) => contagens[i].quantidade !== null && f.quantidade > 0)
}

/** Contas de caixa (ativas) de que a pessoa é responsável. */
async function contasDoResponsavel(client: SupabaseClient, emp: string, usuarioId: string): Promise<string[]> {
  try {
    const { data } = await client
      .from("caixa_contas")
      .select("id")
      .eq("emp_proprietaria_id", emp)
      .eq("responsavel_usuario_id", usuarioId)
      .eq("ativa", true)
    return (data ?? []).map((c) => String(c.id))
  } catch {
    return []
  }
}

/**
 * Integrantes dos departamentos (não legados) que a pessoa coordena, sem ela
 * mesma — ninguém decide o próprio pedido. Duas consultas leves, só para quem
 * coordena algo.
 */
async function equipeCoordenada(client: SupabaseClient, emp: string, usuarioId: string): Promise<string[]> {
  try {
    const { data: deptos } = await client
      .from("empresa_departamentos")
      .select("id, legado")
      .eq("emp_proprietaria_id", emp)
      .eq("coordenador_id", usuarioId)
    const ids = (deptos ?? []).filter((d) => d.legado !== true).map((d) => String(d.id))
    if (!ids.length) return []
    const { data: integrantes } = await client
      .from("empresa_departamentos_integrantes")
      .select("usuario_id")
      .in("departamento_id", ids)
    return [...new Set((integrantes ?? []).map((i) => String(i.usuario_id)))].filter((id) => id !== usuarioId)
  } catch {
    return []
  }
}

/** Cacheada por requisição: o layout (contador) e a home (cartão) dividem a conta. */
export const pendenciasDoUsuario = cache(async (sessao: SessaoPainel): Promise<Pendencia[]> => {
  return pendenciasPara({
    client: await createAdminClient(),
    emp: await tenantAtual(),
    permissoes: sessao.permissoes,
    email: String(sessao.usuario.email ?? sessao.user.email ?? ""),
    usuarioId: String(sessao.usuario.id),
  })
})

export function totalPendencias(lista: Pendencia[]): number {
  return lista.reduce((s, p) => s + p.quantidade, 0)
}
