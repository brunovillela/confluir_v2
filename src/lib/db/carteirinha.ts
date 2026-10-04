import "server-only"

import { codigoCarteirinha, conferirCodigoCarteirinha } from "@/lib/carteirinha"
import { hojeSP, texto } from "@/lib/db/comum"
import { lerRegrasInadimplencia } from "@/lib/db/filiacao-direitos"
import { relatorioInadimplencia } from "@/lib/db/filiacao-inadimplencia"
import { cadastroDoFiliado, registrosDoCpf } from "@/lib/db/filiado-portal"
import { listarContribuicoesFiliado } from "@/lib/db/filiados"
import { nomeEntidade } from "@/lib/db/organizacao"
import { cpfConfiavel } from "@/lib/cpf"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"
import { origemAtual } from "@/lib/tenant-url"

/**
 * CARTEIRINHA DIGITAL, DECLARAÇÃO e MINHA CONTRIBUIÇÃO (onda 4, F1/F6) — os
 * dados que o portal mostra ao filiado e que a página pública de verificação
 * confirma. Tudo lido do cadastro vivo: condição, matrícula, desde quando é
 * filiado (ativo_em ou a primeira filiação dos vínculos) e as fontes
 * pagadoras com vínculo aberto.
 */

export type DadosCarteirinha = {
  filiacaoId: string
  nome: string
  cpf: string | null
  matricula: string | null
  condicao: string | null
  ativo: boolean
  /** Data em que a filiação começou (ISO) ou null se desconhecida. */
  desde: string | null
  fontes: string[]
  entidade: string
  /** URL pública de verificação (QR). */
  urlVerificacao: string | null
}

async function desdeQuando(filiacaoId: string, ativoEm: string | null, idsDaPessoa: string[]): Promise<string | null> {
  if (ativoEm) return ativoEm.slice(0, 10)
  const admin = await createAdminClient()
  const { data } = await admin
    .from("filiacao_vinculos")
    .select("data_filiacao, filiacao_data_adesao")
    .in("filiado_id", idsDaPessoa.length ? idsDaPessoa : [filiacaoId])
  const datas = (data ?? []).map((v) => texto(v.data_filiacao) ?? texto(v.filiacao_data_adesao)).filter((v): v is string => !!v).sort()
  return datas[0]?.slice(0, 10) ?? null
}

async function fontesAbertas(idsDaPessoa: string[]): Promise<string[]> {
  if (idsDaPessoa.length === 0) return []
  const admin = await createAdminClient()
  const { data } = await admin
    .from("filiacao_vinculos")
    .select("fonte_pagadora_id")
    .in("filiado_id", idsDaPessoa)
    .is("data_desfiliacao", null)
    .is("filiacao_data_saida", null)
  const ids = [...new Set((data ?? []).map((v) => texto(v.fonte_pagadora_id)).filter((v): v is string => !!v))]
  if (!ids.length) return []
  const { data: emp } = await admin.from("empresa").select("id, nome_fantasia, nome_razao").in("id", ids)
  return (emp ?? []).map((e) => texto(e.nome_fantasia) ?? texto(e.nome_razao) ?? "").filter(Boolean)
}

export async function dadosCarteirinha(cpf: string): Promise<DadosCarteirinha | null> {
  const cadastro = await cadastroDoFiliado(cpf)
  if (!cadastro) return null
  const ids = await registrosDoCpf(cpf)
  const [desde, fontes, entidade, codigo, origem] = await Promise.all([
    desdeQuando(cadastro.id, cadastro.ativo_em, ids),
    fontesAbertas(ids),
    nomeEntidade(),
    codigoCarteirinha(cadastro.id),
    origemAtual(),
  ])
  return {
    filiacaoId: cadastro.id,
    nome: cadastro.nome_completo ?? "(sem nome)",
    cpf: cpfConfiavel(cadastro.cpf),
    matricula: cadastro.matricula_sindical,
    condicao: cadastro.filiacao_condicao,
    ativo: cadastro.filiacao_condicao === "Ativo",
    desde,
    fontes,
    entidade,
    urlVerificacao: codigo ? `${origem}/carteirinha/${codigo}` : null,
  }
}

// ── Verificação pública ──────────────────────────────────────────────────────

export type Verificacao = {
  valida: boolean
  nome: string | null
  matricula: string | null
  condicao: string | null
  desde: string | null
  entidade: string
  verificadoEm: string
}

/** Página pública: só o que uma portaria ou um convênio precisa saber. */
export async function verificarCarteirinha(codigo: string): Promise<Verificacao | null> {
  const filiacaoId = await conferirCodigoCarteirinha(codigo)
  if (!filiacaoId) return null
  const admin = await createAdminClient()
  const { data } = await admin
    .from("filiacoes")
    .select("id, nome_completo, cpf, matricula_sindical, filiacao_condicao, filiacao_excluida, ativo_em")
    .eq("id", filiacaoId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  const entidade = await nomeEntidade()
  if (!data || data.filiacao_excluida === true) {
    return { valida: false, nome: null, matricula: null, condicao: null, desde: null, entidade, verificadoEm: new Date().toISOString() }
  }
  const cpf = cpfConfiavel(texto(data.cpf))
  const ids = cpf ? await registrosDoCpf(cpf) : [String(data.id)]
  return {
    valida: data.filiacao_condicao === "Ativo",
    nome: texto(data.nome_completo),
    matricula: texto(data.matricula_sindical),
    condicao: texto(data.filiacao_condicao),
    desde: await desdeQuando(String(data.id), texto(data.ativo_em), ids),
    entidade,
    verificadoEm: new Date().toISOString(),
  }
}

// ── Minha contribuição ───────────────────────────────────────────────────────

export type LinhaContribuicao = { competencia: string; ordem: number | null; tipo: string | null; fonte: string | null; valor: number }
export type MinhaContribuicao = {
  linhas: LinhaContribuicao[]
  total12m: number
  ultima: LinhaContribuicao | null
  /** Remessas associativas recentes da entidade em que a pessoa NÃO aparece (competências). */
  emFalta: string[]
  /** Quantas faltas a regra tolera antes de contar como inadimplência (null = regra não configurada). */
  toleradas: number | null
  inadimplente: boolean
}

export async function minhaContribuicao(cpf: string, filiacaoId: string): Promise<MinhaContribuicao> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const [r, regras, remessasRes] = await Promise.all([
    listarContribuicoesFiliado(filiacaoId),
    lerRegrasInadimplencia().catch(() => []),
    admin
      .from("filiacao_recebe_remessa")
      .select("ordem, tipo, ano, mes")
      .eq("emp_proprietaria_id", emp)
      .eq("tipo", "Associativa")
      .not("ordem", "is", null)
      .order("ordem", { ascending: false })
      .limit(40),
  ])
  const linhas: LinhaContribuicao[] = (r?.contribuicoes ?? []).map((c) => ({
    competencia: c.competencia ?? "—",
    ordem: c.ordem,
    tipo: c.tipo,
    fonte: c.fonte,
    valor: c.valor ?? 0,
  }))
  const hoje = hojeSP()
  const ordemHoje = Number(hoje.slice(0, 4)) * 100 + Number(hoje.slice(5, 7))
  const limite12 = ordemHoje - 100
  const total12m = linhas.filter((l) => (l.ordem ?? 0) > limite12).reduce((s, l) => s + l.valor, 0)
  const minhasOrdens = new Set(linhas.filter((l) => l.tipo === "Associativa" || !l.tipo).map((l) => l.ordem).filter((o): o is number => o !== null))
  // Últimas 6 competências associativas da entidade (sem repetir ordem).
  const ordensEntidade = [...new Set((remessasRes.data ?? []).map((x) => Number(x.ordem)))].sort((a, b) => b - a).slice(0, 6)
  const emFalta = ordensEntidade.filter((o) => !minhasOrdens.has(o)).map((o) => `${String(o % 100).padStart(2, "0")}/${Math.floor(o / 100)}`)
  const regra = regras.find((x) => x.ativo && x.tipo === "Associativa") ?? regras.find((x) => x.ativo) ?? null
  let inadimplente = false
  if (regra) {
    try {
      const rel = await relatorioInadimplencia()
      inadimplente = rel.lista.some((i) => i.cpf === cpf)
    } catch {
      inadimplente = false
    }
  }
  return { linhas, total12m, ultima: linhas[0] ?? null, emFalta, toleradas: regra ? regra.quantidade : null, inadimplente }
}
