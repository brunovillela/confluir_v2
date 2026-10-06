import "server-only"

import type { SessaoPainel } from "@/lib/auth"
import { hojeSP, texto } from "@/lib/db/comum"
import { alcadaDoUsuario, listarOrdensParaAvaliacao, type OrdemParaAvaliacao } from "@/lib/db/compras"
import { listarSolicitacoesDiaria, minhasSolicitacoesDiaria, type SolicitacaoDiaria } from "@/lib/db/diarias"
import { departamentosCoordenados, type DepartamentoCoordenado } from "@/lib/db/coordenador"
import { painelExecutivo, type PainelExecutivo } from "@/lib/db/indicadores"
import { listarNegociacoes, type NegociacaoLinha } from "@/lib/db/negociacoes"
import { diretoriaDoUsuario, type DiretoriaDoUsuario } from "@/lib/db/perfil-diretor"
import { obterPerfil } from "@/lib/db/perfil"
import { minhasViagens, type Viagem } from "@/lib/db/viagens"
import { podeAcessar } from "@/lib/permissoes"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * HOME DO DIRETOR (onda 4, D1) e APROVAR PELO CELULAR (D2): o que espera a
 * decisão da pessoa — ordens na alçada, documentos para assinar, diárias da
 * diretoria — e o contexto da semana: agenda, votações, negociações, KPIs e
 * os pedidos dela de viagem e diária. Cada bloco só entra para quem tem a
 * permissão; o que não se aplica vem vazio, nunca derruba a tela.
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

export type HomeDiretor = ParaAprovar & {
  diretoria: DiretoriaDoUsuario | null
  agenda: CompromissoSemana[]
  votacoes: VotacaoProxima[]
  negociacoes: NegociacaoLinha[]
  kpis: PainelExecutivo | null
  /** Departamentos que a pessoa coordena — atalho para a área do coordenador. */
  coordenados: DepartamentoCoordenado[]
  minhasViagens: Viagem[]
  minhasDiarias: SolicitacaoDiaria[]
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

export async function homeDiretor(sessao: SessaoPainel): Promise<HomeDiretor> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const hoje = hojeSP()
  const uid = sessao.usuario.id as string
  const veKpis = podeAcessar(sessao.permissoes, "configuracoes", [
    "financeiro_leitura",
    "financeiro_pagamento",
    "filiacao_gestao",
    "filiacao_receitas",
    "diretoria_mandatos",
  ])

  const [aprovar, perfil, agendaRes, votacoesRes, negociacoes, kpis, viagens, diarias] = await Promise.all([
    paraAprovar(sessao),
    obterPerfil(uid).catch(() => null),
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
    veKpis ? painelExecutivo(sessao).catch(() => null) : Promise.resolve(null),
    minhasViagens(uid).catch(() => ({ disponivel: false, viagens: [] as Viagem[] })),
    minhasSolicitacoesDiaria(uid).catch(() => ({ disponivel: false, solicitacoes: [] as SolicitacaoDiaria[] })),
  ])
  const [diretoria, coordenados] = await Promise.all([
    diretoriaDoUsuario(uid, perfil?.cpf ?? null).catch(() => null),
    departamentosCoordenados(uid).catch(() => [] as DepartamentoCoordenado[]),
  ])
  // Indicadores financeiros gerais (de todos os departamentos: arrecadação,
  // caixa, ordens vencidas) só com permissão do Financeiro — a mesma da
  // tela gerencial. Filiados ativos seguem a permissão de filiação.
  const veFinanceiroGeral = podeAcessar(sessao.permissoes, "financeiro_leitura", ["financeiro_pagamento", "configuracoes"])
  const kpisVisiveis = kpis && !veFinanceiroGeral ? { ...kpis, financeiro: null, arrecadacao: null } : kpis

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
    kpis: kpisVisiveis,
    coordenados,
    minhasViagens: viagens.viagens.filter((v) => v.situacao === "solicitada" || v.situacao === "em_atendimento").slice(0, 5),
    minhasDiarias: diarias.solicitacoes.filter((d) => d.situacao === "aguardando").slice(0, 5),
  }
}

/** A pessoa tem o que ver na home do diretor? (cartão na home do painel) */
export async function ehDiretorOuAprovador(sessao: SessaoPainel): Promise<boolean> {
  const alcada = alcadaDoUsuario(sessao.permissoes as Record<string, unknown>)
  if (alcada > 0 || podeAcessar(sessao.permissoes, "diretoria_diarias", ["diretoria_mandatos"])) return true
  const perfil = await obterPerfil(sessao.usuario.id as string).catch(() => null)
  const d = await diretoriaDoUsuario(sessao.usuario.id as string, perfil?.cpf ?? null).catch(() => null)
  return Boolean(d)
}
