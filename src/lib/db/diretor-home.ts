import "server-only"

import type { SessaoPainel } from "@/lib/auth"
import { hojeSP, texto } from "@/lib/db/comum"
import { alcadaDoUsuario, listarOrdensParaAvaliacao, type OrdemParaAvaliacao } from "@/lib/db/compras"
import { listarSolicitacoesDiaria, type SolicitacaoDiaria } from "@/lib/db/diarias"
import { departamentosCoordenados, type DepartamentoCoordenado } from "@/lib/db/coordenador"
import { listarNegociacoes, type NegociacaoLinha } from "@/lib/db/negociacoes"
import { diretoriaDoUsuario, type DiretoriaDoUsuario } from "@/lib/db/perfil-diretor"
import { obterPerfil } from "@/lib/db/perfil"
import { podeAcessar } from "@/lib/permissoes"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * ABA GESTÃO DO PAINEL (06/10/2026; era a home do diretor, onda 4, D1) e
 * APROVAR PELO CELULAR (D2): o que espera a decisão da pessoa — ordens na
 * alçada, documentos para assinar, diárias — e, para quem é do mandato
 * vigente, a semana da entidade (agenda, votações, negociações). Os números
 * vêm da parte de indicadores da mesma aba; os pedidos pessoais, de Meu dia.
 * Cada bloco só entra para quem tem a permissão ou o papel; o que não se
 * aplica vem vazio, nunca derruba a tela.
 */

export type AssinaturaPendente = {
  id: string
  token: string
  nome: string | null
  papel: string | null
  documentoTipo: string | null
  enviadoEm: string | null
}

export type CompromissoSemana = {
  id: string
  atividade: string | null
  inicio: string | null
  termino: string | null
  diaTodo: boolean
  local: string | null
}

export type VotacaoProxima = {
  id: string
  nome: string | null
  inicio: string | null
  termino: string | null
  campanha: string | null
}

export type ParaAprovar = {
  alcada: number
  ordens: OrdemParaAvaliacao[]
  /** Acima da alçada: só o número, para a pessoa saber que existem. */
  ordensAcima: number
  assinaturas: AssinaturaPendente[]
  diarias: SolicitacaoDiaria[]
  /** Quais diárias a pessoa pode avaliar: da diretoria, do quadro, ambas ou nenhuma. */
  podeDiariasDiretoria: boolean
  podeDiariasQuadro: boolean
}

export type GestaoDoUsuario = ParaAprovar & {
  /** Integrante do mandato vigente (null = não é diretor). */
  diretoria: DiretoriaDoUsuario | null
  /** A semana da entidade — só para quem é do mandato. */
  agenda: CompromissoSemana[]
  votacoes: VotacaoProxima[]
  negociacoes: NegociacaoLinha[]
  /** Departamentos que a pessoa coordena — atalho para a aba Coordenação. */
  coordenados: DepartamentoCoordenado[]
}

function somarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

async function assinaturasPendentes(email: string | null): Promise<AssinaturaPendente[]> {
  const e = (email ?? "").trim().toLowerCase()
  if (!e) return []
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("documento_assinaturas")
    .select("id, token, nome, papel, documento_tipo, enviado_em, created_at")
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("situacao", "pendente")
    .ilike("email", e)
    .order("created_at", { ascending: false })
    .limit(20)
  if (error) return []
  return (data ?? []).map((a) => ({
    id: String(a.id),
    token: String(a.token),
    nome: texto(a.nome),
    papel: texto(a.papel),
    documentoTipo: texto(a.documento_tipo),
    enviadoEm: texto(a.enviado_em) ?? texto(a.created_at),
  }))
}

/** O que espera a decisão da pessoa (a tela /painel/aprovar). */
export async function paraAprovar(sessao: SessaoPainel): Promise<ParaAprovar> {
  const p = sessao.permissoes as Record<string, unknown>
  const alcada = alcadaDoUsuario(p)
  const podeOrdens = alcada > 0 && podeAcessar(sessao.permissoes, "aquisicoes_avaliacoes", ["financeiro_pagamento"])
  const podeDiariasDiretoria = podeAcessar(sessao.permissoes, "diretoria_diarias", ["configuracoes"])
  const podeDiariasQuadro = podeAcessar(sessao.permissoes, "pessoal_gestao", ["pessoal_diarias"])

  const [ordens, assinaturas, diarias] = await Promise.all([
    podeOrdens ? listarOrdensParaAvaliacao(alcada).catch(() => ({ dentroDaAlcada: [], acimaDaAlcada: [] })) : Promise.resolve({ dentroDaAlcada: [], acimaDaAlcada: [] }),
    assinaturasPendentes(String(sessao.usuario.email ?? sessao.user.email ?? "")),
    podeDiariasDiretoria || podeDiariasQuadro
      ? listarSolicitacoesDiaria().then((r) => r.solicitacoes).catch(() => [] as SolicitacaoDiaria[])
      : Promise.resolve([] as SolicitacaoDiaria[]),
  ])
  const diariasAguardando = diarias.filter((d) => {
    if (d.situacao !== "aguardando") return false
    return d.beneficiarioTipo === "diretor" ? podeDiariasDiretoria : podeDiariasQuadro
  })
  return {
    alcada,
    ordens: ordens.dentroDaAlcada,
    ordensAcima: ordens.acimaDaAlcada.length,
    assinaturas,
    diarias: diariasAguardando,
    podeDiariasDiretoria,
    podeDiariasQuadro,
  }
}

export async function gestaoDoUsuario(sessao: SessaoPainel): Promise<GestaoDoUsuario> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const hoje = hojeSP()
  const uid = sessao.usuario.id as string

  const [aprovar, perfil, coordenados] = await Promise.all([
    paraAprovar(sessao),
    obterPerfil(uid).catch(() => null),
    departamentosCoordenados(uid).catch(() => [] as DepartamentoCoordenado[]),
  ])
  const diretoria = await diretoriaDoUsuario(uid, perfil?.cpf ?? null).catch(() => null)
  if (!diretoria) return { ...aprovar, diretoria: null, agenda: [], votacoes: [], negociacoes: [], coordenados }

  const [agendaRes, votacoesRes, negociacoes] = await Promise.all([
    admin
      .from("agenda")
      .select("id, atividade, inicio, termino, dia_todo, local")
      .eq("emp_proprietaria_id", emp)
      .gte("inicio", `${hoje}T00:00:00`)
      .lt("inicio", `${somarDias(hoje, 7)}T00:00:00`)
      .order("inicio", { ascending: true })
      .limit(12),
    admin
      .from("voto_rod_assembleias")
      .select("id, nome_assembleia, inicio, termino, campanha:campanha_id (tema)")
      .eq("emp_proprietaria_id", emp)
      .gte("termino", hoje)
      .order("inicio", { ascending: true })
      .limit(5),
    listarNegociacoes().catch(() => ({ disponivel: false, lista: [] as NegociacaoLinha[] })),
  ])

  return {
    ...aprovar,
    diretoria,
    agenda: (agendaRes.data ?? []).map((a) => ({
      id: String(a.id),
      atividade: texto(a.atividade),
      inicio: texto(a.inicio),
      termino: texto(a.termino),
      diaTodo: a.dia_todo === true,
      local: texto(a.local),
    })),
    votacoes: (votacoesRes.data ?? []).map((r) => {
      const campanha = r.campanha as { tema?: string | null } | { tema?: string | null }[] | null
      const tema = Array.isArray(campanha) ? campanha[0]?.tema : campanha?.tema
      return { id: String(r.id), nome: texto(r.nome_assembleia), inicio: texto(r.inicio), termino: texto(r.termino), campanha: texto(tema) }
    }),
    negociacoes: negociacoes.lista.filter((n) => n.situacao === "preparacao" || n.situacao === "em_curso").slice(0, 5),
    coordenados,
  }
}

/**
 * Quem decide algo pelo painel: alçada de aprovação ou avaliação de diárias.
 * (Diretor de verdade é `diretoriaDoUsuario` — integrante do mandato.)
 */
export function temDecisoes(sessao: SessaoPainel): boolean {
  return (
    alcadaDoUsuario(sessao.permissoes as Record<string, unknown>) > 0 ||
    podeAcessar(sessao.permissoes, "diretoria_diarias", ["configuracoes", "pessoal_gestao", "pessoal_diarias"])
  )
}

/** A pessoa é integrante do mandato vigente? */
export async function ehDiretor(sessao: SessaoPainel): Promise<boolean> {
  const perfil = await obterPerfil(sessao.usuario.id as string).catch(() => null)
  return Boolean(await diretoriaDoUsuario(sessao.usuario.id as string, perfil?.cpf ?? null).catch(() => null))
}
