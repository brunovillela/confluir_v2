import "server-only"

import { codigoCarteirinha, conferirCodigoCarteirinha } from "@/lib/carteirinha"
import { cobrancasDoFiliado } from "@/lib/db/cobrancas"
import { hojeSP, texto } from "@/lib/db/comum"
import { lerRegrasInadimplencia } from "@/lib/db/filiacao-direitos"
import { inadimplenciaDoCpf, type Inadimplente } from "@/lib/db/filiacao-inadimplencia"
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

/** Competência AAAAMM de uma data ISO (AAAA-MM-DD…). */
function ordemDaData(data: string): number {
  return Number(data.slice(0, 4)) * 100 + Number(data.slice(5, 7))
}

/** MM/AAAA de uma competência AAAAMM. */
function rotuloOrdem(ordem: number): string {
  return `${String(ordem % 100).padStart(2, "0")}/${Math.floor(ordem / 100)}`
}

type FonteAberta = {
  id: string
  nome: string | null
  /**
   * Competência em que o vínculo com a fonte começou (a mais antiga, se há
   * mais de um em aberto); null = sem data no vínculo.
   */
  desdeOrdem: number | null
}

/** Fontes pagadoras em que a pessoa tem vínculo aberto. */
async function fontesAbertas(idsDaPessoa: string[]): Promise<FonteAberta[]> {
  if (idsDaPessoa.length === 0) return []
  const admin = await createAdminClient()
  const { data } = await admin
    .from("filiacao_vinculos")
    .select("fonte_pagadora_id, data_filiacao, filiacao_data_adesao")
    .in("filiado_id", idsDaPessoa)
    .is("data_desfiliacao", null)
    .is("filiacao_data_saida", null)
  const desde = new Map<string, number | null>()
  for (const v of data ?? []) {
    const id = texto(v.fonte_pagadora_id)
    if (!id) continue
    const inicio = texto(v.data_filiacao) ?? texto(v.filiacao_data_adesao)
    const ordem = inicio ? ordemDaData(inicio) : null
    // Um vínculo sem data apaga o corte: na dúvida, a fonte vale desde sempre.
    if (!desde.has(id)) desde.set(id, ordem)
    else {
      const atual = desde.get(id) ?? null
      desde.set(id, atual === null || ordem === null ? null : Math.min(atual, ordem))
    }
  }
  const ids = [...desde.keys()]
  if (!ids.length) return []
  const { data: emp } = await admin.from("empresa").select("id, nome_fantasia, nome_razao").in("id", ids)
  const nomes = new Map((emp ?? []).map((e) => [String(e.id), texto(e.nome_fantasia) ?? texto(e.nome_razao)]))
  return ids.map((id) => ({ id, nome: nomes.get(id) ?? null, desdeOrdem: desde.get(id) ?? null }))
}

export async function dadosCarteirinha(cpf: string): Promise<DadosCarteirinha | null> {
  const cadastro = await cadastroDoFiliado(cpf)
  if (!cadastro) return null
  const ids = await registrosDoCpf(cpf)
  const [desde, fontes, entidade, codigo, origem] = await Promise.all([
    desdeQuando(cadastro.id, cadastro.ativo_em, ids),
    fontesAbertas(ids).then((lista) => lista.map((f) => f.nome).filter((n): n is string => !!n)),
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
/** Competência vencida cuja remessa a fonte da pessoa ainda não mandou (`fontes`: os nomes conhecidos). */
export type RemessaPendente = { competencia: string; fontes: string[] }
export type MinhaContribuicao = {
  linhas: LinhaContribuicao[]
  total12m: number
  ultima: LinhaContribuicao | null
  /**
   * Competências recentes (MM/AAAA, da mais recente para trás) em que a
   * contribuição deveria estar e não está: a fonte pagadora da pessoa já
   * mandou a remessa e ela não consta — ou, para quem paga por Pix, a
   * cobrança venceu sem pagamento. É o que pede ação.
   */
  emFalta: string[]
  /** Remessas que a fonte da pessoa ainda não mandou (informativo; não é falta). */
  pendentesDaFonte: RemessaPendente[]
  /** Paga por Pix: as faltas vêm das cobranças, não das remessas das fontes. */
  porPix: boolean
  /** Quantas faltas a regra tolera antes de contar como inadimplência (null = regra não configurada). */
  toleradas: number | null
  /** Pela regra da entidade. null = não foi possível apurar agora — a tela não pode dizer "Em dia". */
  inadimplente: boolean | null
  /** O item da apuração (o da regra Associativa, se houver) quando em atraso. */
  atraso: Inadimplente | null
}

/**
 * Faltas recentes da pessoa, sem falso alarme. Só competências já vencidas
 * (a do mês chega depois da folha; a baixa de um Pix cria a remessa
 * adiantada). Uma competência em que a pessoa não aparece só é FALTA se a
 * remessa já trouxe linhas de uma fonte em que ela tem vínculo aberto (e
 * iniciado até ali); se a fonte dela ainda não mandou, é PENDENTE da fonte.
 * Quem paga por Pix não depende de fonte: falta é cobrança vencida sem
 * pagamento.
 */
async function faltasRecentes(p: {
  ids: string[]
  ordemHoje: number
  minhasOrdens: Set<number>
  remessas: { id: string; ordem: number }[]
}): Promise<{ emFalta: string[]; pendentesDaFonte: RemessaPendente[]; porPix: boolean }> {
  const admin = await createAdminClient()
  const vazio = { emFalta: [], pendentesDaFonte: [] }
  if (p.ids.length === 0) return { ...vazio, porPix: false }

  // Quem recebe cobrança por Pix (cobrancas.ts gera para cadastro Ativo com forma pix, fora dos mesclados).
  const { data: formas, error: eForma } = await admin.from("filiacoes").select("forma_recebimento, filiacao_condicao, mesclado_em").in("id", p.ids)
  const porPix = !eForma && (formas ?? []).some((f) => f.forma_recebimento === "pix" && f.filiacao_condicao === "Ativo" && !f.mesclado_em)
  if (porPix) {
    const { cobrancas } = await cobrancasDoFiliado(p.ids)
    const ordens = new Set(cobrancas.filter((c) => c.vencida && c.ordem < p.ordemHoje && !p.minhasOrdens.has(c.ordem)).map((c) => c.ordem))
    return { emFalta: [...ordens].sort((a, b) => b - a).map(rotuloOrdem), pendentesDaFonte: [], porPix }
  }

  // Últimas 6 competências associativas da entidade, com as remessas de cada uma.
  const porOrdem = new Map<number, string[]>()
  for (const r of p.remessas) porOrdem.set(r.ordem, [...(porOrdem.get(r.ordem) ?? []), r.id])
  const recentes = [...porOrdem.keys()].sort((a, b) => b - a).slice(0, 6)
  const ausentes = recentes.filter((o) => !p.minhasOrdens.has(o))
  if (ausentes.length === 0) return { ...vazio, porPix }

  // Fonte que não mandou NADA nessas competências não é por onde a
  // contribuição desta pessoa chega hoje (vínculo que ficou aberto, folha que
  // não desconta): não gera falta nem "ainda não chegou" mês após mês.
  const daJanela = recentes.flatMap((o) => porOrdem.get(o) ?? [])
  const abertas = await fontesAbertas(p.ids)
  const ativas = await Promise.all(
    abertas.map(async (f) => {
      const { data, error } = await admin.from("filiacao_recebe").select("id").in("remessa_id", daJanela).eq("fonte_pg_id", f.id).limit(1)
      return error ? true : (data?.length ?? 0) > 0
    })
  )
  const fontes = abertas.filter((_, i) => ativas[i])
  const consultas = ausentes.flatMap((ordem) =>
    fontes
      // A remessa do mês da filiação ou de antes dela não é falta de ninguém.
      .filter((f) => f.desdeOrdem === null || ordem > f.desdeOrdem)
      .map(async (f) => {
        const { data, error } = await admin
          .from("filiacao_recebe")
          .select("id")
          .in("remessa_id", porOrdem.get(ordem) ?? [])
          .eq("fonte_pg_id", f.id)
          .limit(1)
        return { ordem, fonte: f, chegou: error ? null : (data?.length ?? 0) > 0 }
      })
  )
  const respostas = await Promise.all(consultas)
  const emFalta: string[] = []
  const pendentesDaFonte: RemessaPendente[] = []
  for (const ordem of ausentes) {
    const daOrdem = respostas.filter((x) => x.ordem === ordem)
    // Sem fonte com vínculo aberto naquela competência: nada a afirmar.
    if (daOrdem.length === 0) continue
    if (daOrdem.some((x) => x.chegou === true)) emFalta.push(rotuloOrdem(ordem))
    // Só é pendente se TODAS as leituras responderam; leitura com erro não afirma nada.
    else if (daOrdem.every((x) => x.chegou === false)) {
      // Nomes sem repetir: duas fontes com o mesmo nome dariam "X e X" na frase.
      const nomes = new Set(daOrdem.map((x) => x.fonte.nome).filter((n): n is string => !!n))
      pendentesDaFonte.push({ competencia: rotuloOrdem(ordem), fontes: [...nomes] })
    }
  }
  return { emFalta, pendentesDaFonte, porPix }
}

export async function minhaContribuicao(cpf: string, filiacaoId: string): Promise<MinhaContribuicao> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const hoje = hojeSP()
  const ordemHoje = Number(hoje.slice(0, 4)) * 100 + Number(hoje.slice(5, 7))
  const [r, regras, ids, remessasRes] = await Promise.all([
    listarContribuicoesFiliado(filiacaoId),
    // null = não deu para ler a regra: a situação fica desconhecida, não "em dia".
    lerRegrasInadimplencia().catch(() => null),
    registrosDoCpf(cpf),
    admin
      .from("filiacao_recebe_remessa")
      .select("id, ordem")
      .eq("emp_proprietaria_id", emp)
      .eq("tipo", "Associativa")
      .not("ordem", "is", null)
      .lt("ordem", ordemHoje)
      .order("ordem", { ascending: false })
      .order("id", { ascending: true })
      .limit(40),
  ])
  const linhas: LinhaContribuicao[] = (r?.contribuicoes ?? []).map((c) => ({
    competencia: c.competencia ?? "—",
    ordem: c.ordem,
    tipo: c.tipo,
    fonte: c.fonte,
    valor: c.valor ?? 0,
  }))
  const limite12 = ordemHoje - 100
  const total12m = linhas.filter((l) => (l.ordem ?? 0) > limite12).reduce((s, l) => s + l.valor, 0)
  const minhasOrdens = new Set(linhas.filter((l) => l.tipo === "Associativa" || !l.tipo).map((l) => l.ordem).filter((o): o is number => o !== null))
  const regra = regras?.find((x) => x.ativo && x.tipo === "Associativa") ?? regras?.find((x) => x.ativo) ?? null

  // Só a pessoa — nada de apurar a entidade inteira a cada abertura do portal.
  const apuracao: Promise<{ inadimplente: boolean | null; atraso: Inadimplente | null }> =
    regras === null
      ? Promise.resolve({ inadimplente: null, atraso: null })
      : !regra
        ? Promise.resolve({ inadimplente: false, atraso: null })
        : inadimplenciaDoCpf(cpf, { regras }).then(
            (a) => ({
              inadimplente: a.itens.length > 0,
              atraso: a.itens.find((i) => i.tipo === regra.tipo) ?? a.itens[0] ?? null,
            }),
            (e: unknown) => {
              console.error("inadimplência do CPF:", e instanceof Error ? e.message : e)
              return { inadimplente: null, atraso: null }
            }
          )
  const [situacao, faltas] = await Promise.all([
    apuracao,
    faltasRecentes({
      ids,
      ordemHoje,
      minhasOrdens,
      remessas: (remessasRes.data ?? []).map((x) => ({ id: String(x.id), ordem: Number(x.ordem) })),
    }),
  ])
  return {
    linhas,
    total12m,
    ultima: linhas[0] ?? null,
    ...faltas,
    toleradas: regra ? regra.quantidade : null,
    ...situacao,
  }
}
