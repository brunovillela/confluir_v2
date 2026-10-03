import "server-only"

import { cache } from "react"

import type { SessaoPainel } from "@/lib/auth"
import { alcadaDoUsuario } from "@/lib/db/compras"
import { contarSolicitacoesPendentes } from "@/lib/db/filiacao-publica"
import { SITUACAO_EM_AUTORIZACAO } from "@/lib/db/ordens-ciclo"
import { podeAcessar } from "@/lib/permissoes"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/** Mesmo valor de permissoes-resolver.ts: alçada sem teto. */
const ALCADA_SEM_TETO = Number.MAX_SAFE_INTEGER

/**
 * CAIXA DE ENTRADA DE PENDÊNCIAS (onda 2, U1): tudo que espera a pessoa
 * agir, reunido na home. Cada fonte é um head-count barato, gateado pela
 * permissão de quem vê, e tolerante a tabela/coluna ausente (a fonte some
 * em vez de derrubar a home). Nada aqui grava.
 */

export type Pendencia = {
  chave: string
  titulo: string
  descricao: string
  quantidade: number
  href: string
}

type Contagem = Promise<number | null>

async function contar(montar: (q: ReturnType<Awaited<ReturnType<typeof createAdminClient>>["from"]>) => PromiseLike<{ count: number | null; error: unknown }>, tabela: string): Contagem {
  try {
    const admin = await createAdminClient()
    const { count, error } = await montar(admin.from(tabela))
    if (error) return null
    return count ?? 0
  } catch {
    return null
  }
}

/** Cacheada por requisição: o layout (contador) e a home (cartão) dividem a conta. */
export const pendenciasDoUsuario = cache(async (sessao: SessaoPainel): Promise<Pendencia[]> => {
  const p = sessao.permissoes as Record<string, unknown>
  const emp = await tenantAtual()
  const pode = (chave: string, alternativas: string[] = []) => podeAcessar(sessao.permissoes, chave, alternativas)
  const fontes: { chave: string; titulo: string; descricao: string; href: string; contagem: Contagem }[] = []

  // Ordens de pagamento dentro da minha alçada
  const alcada = alcadaDoUsuario(p)
  if (alcada > 0 && pode("aquisicoes_avaliacoes", ["financeiro_pagamento"])) {
    fontes.push({
      chave: "ordens",
      titulo: "Ordens aguardando sua autorização",
      descricao: alcada >= ALCADA_SEM_TETO ? "Todas as ordens em autorização" : "Dentro da sua alçada",
      href: "/painel/compras/avaliacoes",
      contagem: contar((q) => {
        let c = q.select("id", { count: "exact", head: true }).eq("emp_proprietaria_id", emp).eq("situacao", SITUACAO_EM_AUTORIZACAO)
        if (alcada < ALCADA_SEM_TETO) c = c.lte("valor_inicial_cobranca", alcada)
        return c
      }, "ordens_pagamento"),
    })
  }

  // Pessoal
  if (pode("pessoal_gestao")) {
    fontes.push({
      chave: "ferias",
      titulo: "Férias a autorizar",
      descricao: "Gozos pedidos pelos funcionários",
      href: "/painel/pessoal/ferias",
      contagem: contar((q) => q.select("id", { count: "exact", head: true }).eq("emp_proprietaria_id", emp).eq("autorizado", false), "pessoal_ferias_gozo"),
    })
    fontes.push({
      chave: "diarias",
      titulo: "Diárias a avaliar",
      descricao: "Solicitações aguardando decisão",
      href: "/painel/pessoal/diarias",
      contagem: contar((q) => q.select("id", { count: "exact", head: true }).eq("emp_proprietaria_id", emp).eq("situacao", "aguardando"), "pessoal_diarias_solicitacoes"),
    })
    fontes.push({
      chave: "reembolsos_pessoal",
      titulo: "Reembolsos do ACT a avaliar",
      descricao: "Pedidos dos funcionários",
      href: "/painel/pessoal/reembolsos",
      contagem: contar((q) => q.select("id", { count: "exact", head: true }).eq("emp_proprietaria_id", emp).eq("situacao", "aguardando"), "pessoal_reembolsos_act"),
    })
  }
  if (pode("pessoal_gestao", ["pessoal_faltas_justificadas"])) {
    fontes.push({
      chave: "faltas",
      titulo: "Faltas justificadas a autorizar",
      descricao: "Pedidos sem decisão",
      href: "/painel/pessoal/faltas",
      contagem: contar((q) => q.select("id", { count: "exact", head: true }).eq("emp_proprietaria_id", emp).is("autorizado", null).is("recusado", null), "pessoal_faltas_justificadas"),
    })
  }

  // Filiação
  if (pode("filiacao_gestao")) {
    fontes.push({
      chave: "filiacao_solicitacoes",
      titulo: "Solicitações de filiação",
      descricao: "Fichas públicas aguardando avaliação",
      href: "/painel/filiados/solicitacoes",
      contagem: contarSolicitacoesPendentes().catch(() => null),
    })
  }
  if (pode("filiacao_reembolsos", ["filiacao_gestao"])) {
    fontes.push({
      chave: "reembolsos_juridico",
      titulo: "Reembolsos de filiados a avaliar",
      descricao: "Pedidos aguardando",
      href: "/painel/filiados/reembolsos",
      contagem: contar((q) => q.select("id", { count: "exact", head: true }).eq("emp_proprietaria_id", emp).eq("situacao", "aguardando"), "juridico_reembolsos"),
    })
  }

  // Espaços
  if (pode("espacos", ["espacos_gestao", "espacos_autorizacao"])) {
    fontes.push({
      chave: "espacos",
      titulo: "Pedidos de espaço em análise",
      descricao: "Solicitados ou em análise",
      href: "/painel/espacos/pedidos",
      contagem: contar((q) => q.select("id", { count: "exact", head: true }).eq("emp_proprietaria_id", emp).in("situacao", ["solicitada", "em_analise"]), "cessao_solicitacoes"),
    })
  }

  // Viagens
  if (pode("viagens_gestao")) {
    fontes.push({
      chave: "viagens",
      titulo: "Viagens a atender",
      descricao: "Pedidos de passagem e hospedagem",
      href: "/painel/institucional/viagens",
      contagem: contar((q) => q.select("id", { count: "exact", head: true }).eq("emp_proprietaria_id", emp).eq("situacao", "solicitada"), "viagens_solicitacoes"),
    })
  }

  // Aquisição: fornecimentos a receber
  if (pode("aquisicoes_recebimentos", ["aquisicoes_compras_edicao"])) {
    fontes.push({
      chave: "recebimentos",
      titulo: "Fornecimentos a receber",
      descricao: "Compras entregues ou a entregar sem recebimento",
      href: "/painel/compras/recebimentos",
      contagem: contar((q) => q.select("id", { count: "exact", head: true }).eq("emp_proprietaria_id", emp).eq("recebido", false), "compras_fornecimentos"),
    })
  }

  // Minhas assinaturas pendentes (ofícios, termos, minutas) — o signatário é
  // identificado pelo e-mail do convite.
  const email = String(sessao.usuario.email ?? sessao.user.email ?? "").trim().toLowerCase()
  if (email) {
    fontes.push({
      chave: "assinaturas",
      titulo: "Documentos aguardando sua assinatura",
      descricao: "Ofícios, termos e minutas enviados para você",
      href: "/painel/ferramentas/oficios",
      contagem: contar(
        (q) => q.select("id", { count: "exact", head: true }).eq("emp_proprietaria_id", emp).eq("situacao", "pendente").ilike("email", email),
        "documento_assinaturas"
      ),
    })
  }

  const contagens = await Promise.all(fontes.map((f) => f.contagem))
  return fontes
    .map((f, i) => ({ chave: f.chave, titulo: f.titulo, descricao: f.descricao, href: f.href, quantidade: contagens[i] ?? 0 }))
    .filter((f, i) => contagens[i] !== null && f.quantidade > 0)
})

export function totalPendencias(lista: Pendencia[]): number {
  return lista.reduce((s, p) => s + p.quantidade, 0)
}
