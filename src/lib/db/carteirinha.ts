import "server-only"

import { codigoCarteirinha, conferirCodigoCarteirinha } from "@/lib/carteirinha"
import { cobrancasDoFiliado, obterConfigCobranca, type Cobranca, type ConfigCobranca } from "@/lib/db/cobrancas"
import { hojeSP, texto } from "@/lib/db/comum"
import { lerRegrasInadimplencia, suspensoesDoCpf } from "@/lib/db/filiacao-direitos"
import { inadimplenciaDoCpf, type Inadimplente } from "@/lib/db/filiacao-inadimplencia"
import { cadastroDoFiliado, registrosDoCpf } from "@/lib/db/filiado-portal"
import { listarContribuicoesFiliado } from "@/lib/db/filiados"
import { nomeEntidade } from "@/lib/db/organizacao"
import { cpfConfiavel } from "@/lib/cpf"
import { formaRecebimento, type FormaRecebimento } from "@/lib/filiacao"
import type { RegraInadimplencia } from "@/lib/filiacao-direitos-constantes"
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

export type LinhaContribuicao = {
  competencia: string
  ordem: number | null
  tipo: string | null
  fonte: string | null
  valor: number
  /**
   * Pago direto ao sindicato, sem fonte pagadora — a baixa da cobrança Pix
   * (cobrancas.ts) e a relação "sem fonte" gravam assim (A74). null = veio
   * pela fonte, ou a forma não foi registrada.
   */
  direta: "pix" | "boleto" | null
}
/** Competência vencida cuja remessa a fonte da pessoa ainda não mandou (`fontes`: os nomes conhecidos). */
export type RemessaPendente = { competencia: string; fontes: string[] }

/** Como a pessoa contribui (A60) — só o que o cadastro e a configuração sabem; nada de valor inventado. */
export type ComoContribui = {
  /** "pix" também para quem recebe cobrança Pix; null = não informada no cadastro. */
  forma: FormaRecebimento | null
  /** Fontes pagadoras com vínculo aberto; sem nenhuma, a da última contribuição. */
  fontes: string[]
  /**
   * Valor previsto por mês: o próprio da pessoa (`contribuicao_valor`) ou,
   * no Pix, o padrão da cobrança — o mesmo que gerarCobrancas usa. Na folha
   * o valor é o que a empresa desconta pela regra da entidade (pode ser um
   * percentual): sem valor próprio, null — o padrão do Pix não vale ali.
   */
  valorPrevisto: number | null
  /** Pix: dia do vencimento das cobranças. */
  diaVencimento: number | null
  /** Pix: a cobrança sai sozinha no dia 1º (o tick só gera com a geração automática ligada e valor padrão). */
  geracaoNoDia1: boolean
}

/**
 * O marco de filiação do cadastro (A126): o texto de quem ainda não tem
 * contribuição nenhuma. NÃO é, sozinho, o corte das faltas — ativo_em é
 * recarimbado a cada volta para "Ativo"; o corte é `corteDoInicio`.
 */
export type InicioDaFiliacao = {
  /** AAAA-MM-DD no fuso de São Paulo. */
  informadaEm: string | null
  ativadaEm: string | null
  /** Primeiro mês de referência (MM/AAAA) em que o desconto pode aparecer: o seguinte ao início. */
  primeiroMes: string
  /** O início foi nos últimos 90 dias. */
  recente: boolean
}

/** O atraso pronto para a tela (A6), tirado do MESMO item da apuração que deu o veredito. */
export type DetalheAtraso = {
  tipo: string
  /** Meses em falta (MM/AAAA, do mais recente para trás). */
  meses: string[]
  /** Último pagamento reconhecido desse tipo (MM/AAAA); null = nenhum registrado. */
  ultimoPagamento: string | null
  regra: RegraInadimplencia
}

export type MinhaContribuicao = {
  linhas: LinhaContribuicao[]
  /**
   * Soma da MENSALIDADE nos últimos 12 meses (A177): o `tipoMensalidade` e as
   * linhas sem tipo. Os outros tipos (assistencial…) vêm à parte em
   * `outros12m` — somados juntos, um ano com assistencial parecia aumento da
   * mensalidade.
   */
  total12m: number
  /** O tipo de remessa tratado como mensalidade (Associativa, ou o da regra). */
  tipoMensalidade: string
  /** Os outros tipos nos últimos 12 meses, do maior valor para o menor. */
  outros12m: { tipo: string; valor: number }[]
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
  /**
   * Pela regra da entidade. null = não foi possível apurar agora — a tela não
   * pode dizer "Em dia". Item com efeito suspensivo em vigor não conta (o
   * relatório da gestão o mostra "fora da conta"): vai em `excecao`.
   */
  inadimplente: boolean | null
  /** O item da apuração (o da regra Associativa, se houver) quando em atraso. */
  atraso: Inadimplente | null
  /** O mesmo atraso em termos da tela: meses, último pagamento e a regra. */
  detalheAtraso: DetalheAtraso | null
  /** A regra que vale para a pessoa: a do atraso, ou a da mensalidade. null = nenhuma ligada (ou não deu para ler). */
  regra: RegraInadimplencia | null
  /**
   * A regra apontaria atraso, mas a entidade registrou uma exceção (efeito
   * suspensivo) para a pessoa. `ate` = fim da vigência; null = sem prazo.
   */
  excecao: { tipo: string; ate: string | null } | null
  inicio: InicioDaFiliacao | null
  comoContribui: ComoContribui
  /** Cobranças Pix da pessoa (as 36 mais recentes, da competência mais nova para trás). */
  cobrancas: Cobranca[]
  /** Configuração das cobranças Pix da entidade; null = não deu para ler. */
  configPix: ConfigCobranca | null
}

/** AAAA-MM-DD no fuso de São Paulo, de uma data pura ou de um instante (o `slice` de um timestamptz pega o dia em UTC). */
function dataSP(valor: unknown): string | null {
  const v = texto(valor)
  if (!v) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return null
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d)
}

/** A competência seguinte (AAAAMM). */
function ordemSeguinte(ordem: number): number {
  return ordem % 100 === 12 ? (Math.floor(ordem / 100) + 1) * 100 + 1 : ordem + 1
}

/** A competência anterior (AAAAMM). */
function ordemAnterior(ordem: number): number {
  return ordem % 100 === 1 ? (Math.floor(ordem / 100) - 1) * 100 + 12 : ordem - 1
}

/**
 * Até que competência (inclusive) nada é falta: o mês do marco de filiação e
 * os de antes — mas só quando o marco é COMEÇO. ativo_em é carimbado a cada
 * volta para "Ativo" (a marcação em lote das receitas, por exemplo): em
 * 11/10/2026, os 46 ativos do tenant real com marco já pagavam meses antes
 * dele, e cortar ali escondia o atraso de quem deve. Com mensalidade nos 12
 * meses antes do marco, o corte recua para o mês anterior à primeira delas
 * (fora da janela da regra, na prática); sem nenhuma, é filiação nova ou
 * volta depois de um ano fora, e vale o marco.
 */
function corteDoInicio(inicioOrdem: number | null, linhas: LinhaContribuicao[], tipoMensalidade: string): number | null {
  if (inicioOrdem === null) return null
  const recentes = linhas
    .filter((l) => l.ordem !== null && l.ordem >= inicioOrdem - 100 && linhaDoTipo(l, tipoMensalidade, tipoMensalidade))
    .map((l) => l.ordem as number)
  if (recentes.length === 0) return inicioOrdem
  return Math.min(inicioOrdem, ordemAnterior(Math.min(...recentes)))
}

/**
 * As competências (AAAAMM, da mais recente para trás, sem repetir) das
 * remessas que a regra do tipo olha — a janela de remessasQueContam
 * (filiacao-inadimplencia.ts): só vencidas, mesma ordem, mesmo desempate.
 * null = não deu para ler.
 */
async function mesesDaJanela(tipo: string, janelaRemessas: number, ordemHoje: number): Promise<number[] | null> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("filiacao_recebe_remessa")
    .select("id, ordem")
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("tipo", tipo)
    .not("ordem", "is", null)
    .lt("ordem", ordemHoje)
    .order("ordem", { ascending: false })
    .order("id", { ascending: true })
    .limit(janelaRemessas)
  if (error) return null
  return [...new Set((data ?? []).map((r) => Number(r.ordem)))]
}

/** "Associativa 05/2026" (rótulo da apuração) → competência e MM/AAAA. */
function mesDoRotulo(rotulo: string): { ordem: number; mes: string } | null {
  const m = /(\d{2})\/(\d{4})$/.exec(rotulo.trim())
  return m ? { ordem: Number(m[2]) * 100 + Number(m[1]), mes: `${m[1]}/${m[2]}` } : null
}

/** Ano de uma linha do histórico: o da competência; sem ela, o da remessa ("2019"). */
export function anoDaLinha(l: Pick<LinhaContribuicao, "ordem" | "competencia">): number | null {
  if (l.ordem) return Math.floor(l.ordem / 100)
  return /^\d{4}$/.test(l.competencia) ? Number(l.competencia) : null
}

/** A linha é do tipo? Linha sem tipo conta como mensalidade — a mesma régua das faltas. */
function linhaDoTipo(l: LinhaContribuicao, tipo: string, tipoMensalidade: string): boolean {
  return l.tipo === tipo || (!l.tipo && tipo === tipoMensalidade)
}

/**
 * O histórico da pessoa (todos os registros do CPF), com a marca do que foi
 * pago direto ao sindicato. A forma só é procurada nas linhas sem fonte —
 * poucas — e, se a coluna faltar, a linha só fica sem a marca.
 */
async function linhasDaPessoa(filiacaoId: string): Promise<LinhaContribuicao[]> {
  const r = await listarContribuicoesFiliado(filiacaoId)
  const contribuicoes = r?.contribuicoes ?? []
  const semFonte = contribuicoes.filter((c) => !c.fonte).map((c) => c.id)
  const direta = new Map<string, "pix" | "boleto">()
  if (semFonte.length) {
    const admin = await createAdminClient()
    const emp = await tenantAtual()
    for (let de = 0; de < semFonte.length; de += 100) {
      const { data, error } = await admin
        .from("filiacao_recebe")
        .select("id, forma_recebimento")
        .eq("emp_proprietaria_id", emp)
        .in("id", semFonte.slice(de, de + 100))
        .in("forma_recebimento", ["pix", "boleto"])
      if (error) break
      for (const x of data ?? []) direta.set(String(x.id), x.forma_recebimento === "pix" ? "pix" : "boleto")
    }
  }
  return contribuicoes.map((c) => ({
    competencia: c.competencia ?? "—",
    ordem: c.ordem,
    tipo: c.tipo,
    fonte: c.fonte,
    valor: c.valor ?? 0,
    direta: direta.get(c.id) ?? null,
  }))
}

/** Valor próprio da pessoa (`contribuicao_valor`, de supabase/filiacao-cobrancas.sql). Leitura à parte: sem a coluna, só ele falta. */
async function valorProprio(filiacaoId: string): Promise<number | null> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("filiacoes")
    .select("contribuicao_valor")
    .eq("id", filiacaoId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (error || data?.contribuicao_valor === null || data?.contribuicao_valor === undefined) return null
  const v = Number(data.contribuicao_valor)
  return Number.isFinite(v) && v > 0 ? v : null
}

type RegistroDaPessoa = { forma: FormaRecebimento | null; condicao: string | null; mesclado: boolean }

/** Forma e condição de cada registro do CPF; null = não deu para ler. */
async function registrosComForma(ids: string[]): Promise<RegistroDaPessoa[] | null> {
  if (ids.length === 0) return []
  const admin = await createAdminClient()
  const { data, error } = await admin.from("filiacoes").select("forma_recebimento, filiacao_condicao, mesclado_em").in("id", ids)
  if (error) return null
  return (data ?? []).map((f) => ({
    forma: formaRecebimento(f.forma_recebimento),
    condicao: texto(f.filiacao_condicao),
    mesclado: !!f.mesclado_em,
  }))
}

/**
 * Faltas recentes da pessoa, sem falso alarme. Só competências já vencidas
 * (a do mês chega depois da folha; a baixa de um Pix cria a remessa
 * adiantada) e posteriores ao início da filiação. Uma competência em que a
 * pessoa não aparece só é FALTA se a remessa já trouxe linhas de uma fonte em
 * que ela tem vínculo aberto (e iniciado até ali); se a fonte dela ainda não
 * mandou, é PENDENTE da fonte. Quem paga por Pix não depende de fonte: falta
 * é cobrança vencida sem pagamento.
 */
async function faltasRecentes(p: {
  ordemHoje: number
  minhasOrdens: Set<number>
  remessas: { id: string; ordem: number }[]
  porPix: boolean
  cobrancas: Cobranca[]
  fontes: FonteAberta[]
  /** Competência do início da filiação (`corteDoInicio`): ela e as anteriores não são falta de ninguém. */
  corte: number | null
}): Promise<{ emFalta: string[]; pendentesDaFonte: RemessaPendente[] }> {
  const vazio = { emFalta: [], pendentesDaFonte: [] }
  if (p.porPix) {
    const ordens = new Set(p.cobrancas.filter((c) => c.vencida && c.ordem < p.ordemHoje && !p.minhasOrdens.has(c.ordem)).map((c) => c.ordem))
    return { emFalta: [...ordens].sort((a, b) => b - a).map(rotuloOrdem), pendentesDaFonte: [] }
  }
  if (p.fontes.length === 0) return vazio

  // Últimas 6 competências associativas da entidade, com as remessas de cada uma.
  const porOrdem = new Map<number, string[]>()
  for (const r of p.remessas) porOrdem.set(r.ordem, [...(porOrdem.get(r.ordem) ?? []), r.id])
  const recentes = [...porOrdem.keys()].sort((a, b) => b - a).slice(0, 6)
  // O mês do início e os de antes: o recém-filiado não estava nas relações deles.
  const ausentes = recentes.filter((o) => !p.minhasOrdens.has(o) && (p.corte === null || o > p.corte))
  if (ausentes.length === 0) return vazio

  // Fonte que não mandou NADA nessas competências não é por onde a
  // contribuição desta pessoa chega hoje (vínculo que ficou aberto, folha que
  // não desconta): não gera falta nem "ainda não chegou" mês após mês.
  const admin = await createAdminClient()
  const daJanela = recentes.flatMap((o) => porOrdem.get(o) ?? [])
  const ativas = await Promise.all(
    p.fontes.map(async (f) => {
      const { data, error } = await admin.from("filiacao_recebe").select("id").in("remessa_id", daJanela).eq("fonte_pg_id", f.id).limit(1)
      return error ? true : (data?.length ?? 0) > 0
    })
  )
  const fontes = p.fontes.filter((_, i) => ativas[i])
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
  return { emFalta, pendentesDaFonte }
}

type Veredito = Pick<MinhaContribuicao, "inadimplente" | "atraso" | "detalheAtraso" | "excecao">

/** Fim da exceção (efeito suspensivo de inadimplência) que vale para o tipo; null = sem prazo ou não achada. */
async function fimDaExcecao(cpf: string, tipo: string): Promise<string | null> {
  const lista = await suspensoesDoCpf(cpf, "inadimplencia").catch(() => [])
  const valem = lista.filter((s) => !s.alvo || s.alvo === tipo)
  if (valem.length === 0 || valem.some((s) => !s.vigenciaAte)) return null
  return valem.map((s) => s.vigenciaAte as string).sort().pop() ?? null
}

/**
 * O veredito da apuração por CPF aplicado à tela da pessoa (A6). Os meses
 * vêm do MESMO item que deu o veredito, com dois cortes para não acusar quem
 * não deve:
 *  - mês igual ou anterior ao início da filiação (`corteDoInicio`) não é
 *    falta (o recém-filiado não estava nas relações de antes de se filiar);
 *  - mês em que a pessoa TEM contribuição do tipo não é falta (duas remessas
 *    na mesma competência — a do Pix e a da fonte — faziam a que não a traz
 *    contar como falta).
 * Sobrando menos meses do que a regra pede, não está em atraso. Na regra de
 * faltas SEGUIDAS a conta é outra: os meses da janela, do mais recente para
 * trás, até o primeiro pago — o item lista TODAS as faltas da janela, e um
 * mês cortado no meio da sequência a quebra (sem isso, 09 em falta, 08 pago
 * e 05/04 em falta davam "3 seguidas"). Item com efeito suspensivo em vigor
 * sai da conta e vira `excecao`.
 */
async function vereditoDoPortal(p: {
  cpf: string
  itens: Inadimplente[]
  regras: RegraInadimplencia[]
  tipoPrincipal: string
  tipoMensalidade: string
  linhas: LinhaContribuicao[]
  /** Competência até a qual (inclusive) nada é falta — `corteDoInicio`. */
  corte: number | null
  ordemHoje: number
}): Promise<Veredito> {
  const avaliacoes = await Promise.all(
    p.itens.map(async (item) => {
      const regra = p.regras.find((r) => r.tipo === item.tipo)
      if (!regra) return null
      const pagos = new Set(p.linhas.filter((l) => l.ordem !== null && linhaDoTipo(l, item.tipo, p.tipoMensalidade)).map((l) => l.ordem as number))
      const faltou = new Set<number>()
      const meses: string[] = []
      for (const rotulo of item.remessasEmFalta) {
        const m = mesDoRotulo(rotulo)
        if (!m || faltou.has(m.ordem)) continue
        faltou.add(m.ordem)
        if (p.corte !== null && m.ordem <= p.corte) continue
        if (pagos.has(m.ordem)) continue
        meses.push(m.mes)
      }
      let atinge = meses.length >= regra.quantidade
      if (atinge && regra.exigirConsecutivas) {
        const janela = await mesesDaJanela(regra.tipo, regra.janelaRemessas, p.ordemHoje)
        // Sem a janela, fica a contagem simples — a mesma de antes, nunca mais severa que a apuração.
        if (janela) {
          let seguidas = 0
          for (const ordem of janela) {
            if ((p.corte !== null && ordem <= p.corte) || pagos.has(ordem) || !faltou.has(ordem)) break
            seguidas++
          }
          atinge = seguidas >= regra.quantidade
        }
      }
      return atinge ? { item, regra, meses } : null
    })
  )
  const avaliados = avaliacoes.filter((x): x is NonNullable<typeof x> => x !== null)
  const doPrincipal = <T extends { item: Inadimplente }>(lista: T[]) => lista.find((x) => x.item.tipo === p.tipoPrincipal) ?? lista[0]

  const valendo = doPrincipal(avaliados.filter((x) => !x.item.suspenso))
  if (valendo) {
    // O último pagamento é o do histórico que a pessoa vê na tabela (o mais
    // recente do tipo); sem nenhum lá, o que a apuração achou na janela.
    const doHistorico = p.linhas.find((l) => l.ordem !== null && linhaDoTipo(l, valendo.item.tipo, p.tipoMensalidade))
    const daApuracao = valendo.item.ultimoPagamento ? (mesDoRotulo(valendo.item.ultimoPagamento)?.mes ?? null) : null
    return {
      inadimplente: true,
      atraso: valendo.item,
      detalheAtraso: {
        tipo: valendo.item.tipo,
        meses: valendo.meses,
        ultimoPagamento: doHistorico?.competencia ?? daApuracao,
        regra: valendo.regra,
      },
      excecao: null,
    }
  }
  const dispensado = doPrincipal(avaliados.filter((x) => x.item.suspenso))
  if (!dispensado) return { inadimplente: false, atraso: null, detalheAtraso: null, excecao: null }
  return {
    inadimplente: false,
    atraso: null,
    detalheAtraso: null,
    excecao: { tipo: dispensado.item.tipo, ate: await fimDaExcecao(p.cpf, dispensado.item.tipo) },
  }
}

export async function minhaContribuicao(cpf: string, filiacaoId: string): Promise<MinhaContribuicao> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const hoje = hojeSP()
  const ordemHoje = ordemDaData(hoje)
  const [linhas, regras, ids, remessasRes, cadastroRes, valorDaPessoa, configPix] = await Promise.all([
    linhasDaPessoa(filiacaoId),
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
    admin
      .from("filiacoes")
      .select("ativo_em, filiacao_informada_fonte_em, forma_recebimento")
      .eq("id", filiacaoId)
      .eq("emp_proprietaria_id", emp)
      .maybeSingle(),
    valorProprio(filiacaoId),
    obterConfigCobranca().catch(() => null),
  ])
  const [registros, { cobrancas }, fontes] = await Promise.all([
    registrosComForma(ids),
    cobrancasDoFiliado(ids).catch(() => ({ disponivel: false, cobrancas: [] as Cobranca[] })),
    fontesAbertas(ids),
  ])
  // Quem recebe cobrança por Pix (cobrancas.ts gera para cadastro Ativo com forma pix, fora dos mesclados).
  const porPix = (registros ?? []).some((f) => f.forma === "pix" && f.condicao === "Ativo" && !f.mesclado)

  // Início da filiação: o marco mais recente entre "informada à fonte" e
  // "ativada" (ativo_em só existe para quem entrou pelo fluxo novo).
  const cadastro = cadastroRes.data
  const informadaEm = dataSP(cadastro?.filiacao_informada_fonte_em)
  const ativadaEm = dataSP(cadastro?.ativo_em)
  const marco = [informadaEm, ativadaEm].filter((d): d is string => !!d).sort().pop() ?? null
  const inicioOrdem = marco ? ordemDaData(marco) : null
  const inicio: InicioDaFiliacao | null =
    marco && inicioOrdem
      ? {
          informadaEm,
          ativadaEm,
          primeiroMes: rotuloOrdem(ordemSeguinte(inicioOrdem)),
          recente: (Date.parse(hoje) - Date.parse(marco)) / 86_400_000 <= 90,
        }
      : null

  const regraPrincipal = regras?.find((x) => x.ativo && x.tipo === "Associativa") ?? regras?.find((x) => x.ativo) ?? null
  // Mensalidade é a Associativa; só a entidade que não usa esse tipo e tem regra ligada em outro passa a ser o dela.
  const tipoMensalidade = regraPrincipal && regras && !regras.some((x) => x.tipo === "Associativa") ? regraPrincipal.tipo : "Associativa"

  const limite12 = ordemHoje - 100
  const doAno = linhas.filter((l) => (l.ordem ?? 0) > limite12)
  const total12m = doAno.filter((l) => linhaDoTipo(l, tipoMensalidade, tipoMensalidade)).reduce((s, l) => s + l.valor, 0)
  const outros = new Map<string, number>()
  for (const l of doAno) if (l.tipo && !linhaDoTipo(l, tipoMensalidade, tipoMensalidade)) outros.set(l.tipo, (outros.get(l.tipo) ?? 0) + l.valor)
  const outros12m = [...outros].map(([tipo, valor]) => ({ tipo, valor })).sort((a, b) => b.valor - a.valor)
  const minhasOrdens = new Set(linhas.filter((l) => l.tipo === "Associativa" || !l.tipo).map((l) => l.ordem).filter((o): o is number => o !== null))
  const corte = corteDoInicio(inicioOrdem, linhas, tipoMensalidade)

  // Só a pessoa — nada de apurar a entidade inteira a cada abertura do portal.
  const indefinido: Veredito = { inadimplente: null, atraso: null, detalheAtraso: null, excecao: null }
  const apuracao: Promise<Veredito> =
    regras === null
      ? Promise.resolve(indefinido)
      : !regraPrincipal
        ? Promise.resolve({ inadimplente: false, atraso: null, detalheAtraso: null, excecao: null })
        : inadimplenciaDoCpf(cpf, { regras })
            .then((a) =>
              vereditoDoPortal({ cpf, itens: a.itens, regras, tipoPrincipal: regraPrincipal.tipo, tipoMensalidade, linhas, corte, ordemHoje })
            )
            .catch((e: unknown) => {
              console.error("inadimplência do CPF:", e instanceof Error ? e.message : e)
              return indefinido
            })
  const [veredito, faltas] = await Promise.all([
    apuracao,
    faltasRecentes({
      ordemHoje,
      minhasOrdens,
      remessas: (remessasRes.data ?? []).map((x) => ({ id: String(x.id), ordem: Number(x.ordem) })),
      porPix,
      cobrancas,
      fontes,
      corte,
    }),
  ])

  // Como contribui (A60): a forma do cadastro (a de outro registro do CPF, se
  // este não tiver); Pix quando há cobrança por Pix.
  const forma: FormaRecebimento | null = porPix
    ? "pix"
    : (formaRecebimento(cadastro?.forma_recebimento) ?? (registros ?? []).find((r) => !r.mesclado && r.forma)?.forma ?? null)
  const nomesFontes = [...new Set(fontes.map((f) => f.nome).filter((n): n is string => !!n))]
  const fonteRecente = linhas.find((l) => l.fonte)?.fonte ?? null
  const pix = forma === "pix" && configPix?.disponivel ? configPix : null

  return {
    linhas,
    total12m,
    tipoMensalidade,
    outros12m,
    ultima: linhas[0] ?? null,
    ...faltas,
    porPix,
    toleradas: regraPrincipal ? regraPrincipal.quantidade : null,
    ...veredito,
    regra: veredito.detalheAtraso?.regra ?? regraPrincipal,
    inicio,
    comoContribui: {
      forma,
      fontes: nomesFontes.length ? nomesFontes : fonteRecente ? [fonteRecente] : [],
      valorPrevisto: valorDaPessoa ?? pix?.valorMensal ?? null,
      diaVencimento: pix?.diaVencimento ?? null,
      geracaoNoDia1: !!pix && pix.gerarAutomatico && !!pix.valorMensal,
    },
    cobrancas,
    configPix,
  }
}

// ── Extrato anual ────────────────────────────────────────────────────────────

export type ExtratoAnual = {
  ano: number
  /** As contribuições do ano, de janeiro a dezembro. */
  linhas: LinhaContribuicao[]
  /** Total por tipo (null = sem tipo), do maior para o menor. */
  porTipo: { tipo: string | null; valor: number }[]
  total: number
}

/**
 * As contribuições de UM ano, para o extrato em PDF (A61). Só lê: quem chama
 * garante que `filiacaoId` é o cadastro do filiado da sessão.
 */
export async function extratoAnual(filiacaoId: string, ano: number): Promise<ExtratoAnual> {
  const linhas = (await linhasDaPessoa(filiacaoId))
    .filter((l) => anoDaLinha(l) === ano)
    .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0))
  const porTipo = new Map<string | null, number>()
  for (const l of linhas) porTipo.set(l.tipo, (porTipo.get(l.tipo) ?? 0) + l.valor)
  return {
    ano,
    linhas,
    porTipo: [...porTipo].map(([tipo, valor]) => ({ tipo, valor })).sort((a, b) => b.valor - a.valor),
    total: linhas.reduce((s, l) => s + l.valor, 0),
  }
}
