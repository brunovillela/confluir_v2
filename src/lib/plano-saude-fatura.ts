/**
 * PLANO DE SAÚDE — FATURA DA OPERADORA (Fase 3, 25/11/2026). Conta pura, sem
 * banco: casa cada linha da fatura (lida por IA) com um beneficiário e compara
 * o cobrado com o calculado na conferência do mês (lib/plano-saude.ts).
 *
 * Casamento, nesta ordem: carteirinha, CPF, nome igual (sem acento, caixa e
 * espaços) e, por fim, primeiro + último nome quando só um beneficiário bate.
 * Linha que não casa fica para o usuário escolher.
 */

import type { GrupoTitular } from "@/lib/plano-saude"

export type ComoCasou = "carteirinha" | "cpf" | "nome" | "nome_parcial" | "manual"

/** Linha da fatura como gravada (sem CPF): valores do beneficiário no mês. */
export type LinhaFatura = {
  nome: string
  carteirinha: string | null
  /** Mensalidade cobrada (com pró-rata, se a operadora o somar à mensalidade). */
  mensalidade: number
  coparticipacao: number
  /** Outros valores da linha (taxas, pró-rata em separado, ajustes, descontos negativos). */
  outros: number
  outrosDescricao: string | null
  beneficiarioId: string | null
  casou: ComoCasou | null
}

/** Linha lida pela IA, antes de casar (o CPF serve só para casar e não é gravado). */
export type LinhaLida = Omit<LinhaFatura, "beneficiarioId" | "casou"> & { cpf: string | null }

/** Quem pode casar: os beneficiários do contrato (ativos ou não no mês). */
export type Candidato = { id: string; nome: string; carteirinha: string | null; cpf: string | null }

export const semAcento = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()

const soAlfanum = (s: string | null) => (s ?? "").replace(/[^0-9A-Za-z]/g, "").toUpperCase().replace(/^0+/, "")
const soDigitos = (s: string | null) => (s ?? "").replace(/\D/g, "")
const pontas = (nome: string) => {
  const p = semAcento(nome).split(" ").filter(Boolean)
  return p.length ? `${p[0]} ${p[p.length - 1]}` : ""
}

/** Casa cada linha lida com um beneficiário; um beneficiário casa uma linha só. */
export function casarLinhas(lidas: LinhaLida[], candidatos: Candidato[]): LinhaFatura[] {
  const usados = new Set<string>()
  const livres = () => candidatos.filter((c) => !usados.has(c.id))
  const unico = (lista: Candidato[]) => (lista.length === 1 ? lista[0] : null)
  const tentativas: [ComoCasou, (l: LinhaLida) => Candidato | null][] = [
    ["carteirinha", (l) => (soAlfanum(l.carteirinha) ? unico(livres().filter((c) => soAlfanum(c.carteirinha) === soAlfanum(l.carteirinha))) : null)],
    ["cpf", (l) => (soDigitos(l.cpf).length === 11 ? unico(livres().filter((c) => soDigitos(c.cpf) === soDigitos(l.cpf))) : null)],
    ["nome", (l) => unico(livres().filter((c) => semAcento(c.nome) === semAcento(l.nome)))],
    ["nome_parcial", (l) => (pontas(l.nome) ? unico(livres().filter((c) => pontas(c.nome) === pontas(l.nome))) : null)],
  ]
  const saida: LinhaFatura[] = lidas.map((l) => {
    const { cpf: _cpf, ...resto } = l
    void _cpf
    return { ...resto, beneficiarioId: null, casou: null }
  })
  // Cada critério passa por todas as linhas antes do seguinte: a carteirinha de
  // uma linha não perde para o nome parecido de outra.
  for (const [como, achar] of tentativas) {
    lidas.forEach((l, i) => {
      if (saida[i].beneficiarioId) return
      const c = achar(l)
      if (c) {
        usados.add(c.id)
        saida[i].beneficiarioId = c.id
        saida[i].casou = como
      }
    })
  }
  return saida
}

/** `entidade`: valor da fatura que não é de beneficiário (taxa administrativa, por exemplo). */
export type SituacaoItem = "confere" | "diferente" | "so_na_fatura" | "so_no_sistema" | "entidade"

export type ItemComparacao = {
  chave: string
  beneficiarioId: string | null
  titularId: string | null
  nome: string
  /** Mensalidade calculada pelo sistema (null: não está no plano no mês). */
  esperado: number | null
  /** Mensalidade cobrada (null: não aparece na fatura). */
  cobrado: number | null
  diferenca: number
  coparticipacao: number
  outros: number
  outrosDescricao: string | null
  casou: ComoCasou | null
  situacao: SituacaoItem
}

export type Comparacao = {
  itens: ItemComparacao[]
  totais: {
    esperado: number
    cobradoMensalidades: number
    coparticipacao: number
    outros: number
    /** Soma das linhas da fatura (mensalidades + coparticipação + outros). */
    somaLinhas: number
    /** Total informado na fatura (null se a leitura não achou). */
    totalFatura: number | null
  }
  /** Coparticipação da fatura por titular (para lançar no mês). */
  copartPorTitular: Map<string, number>
  contagem: Record<SituacaoItem, number>
}

const centavos = (v: number) => Math.round(v * 100) / 100

/** Compara a fatura com os grupos da conferência do mês. */
export function compararFatura(linhas: LinhaFatura[], grupos: GrupoTitular[], totalFatura: number | null): Comparacao {
  const doMes = new Map(grupos.flatMap((g) => g.linhas.map((l) => [l.beneficiario.id, l] as const)))
  const titularDe = new Map(grupos.flatMap((g) => g.linhas.map((l) => [l.beneficiario.id, g.titular.id] as const)))
  const itens: ItemComparacao[] = []
  const vistos = new Set<string>()
  const copartPorTitular = new Map<string, number>()
  // Duas linhas do mesmo beneficiário (mensalidade e coparticipação em linhas
  // separadas, por exemplo) somam.
  const porBeneficiario = new Map<string, LinhaFatura[]>()
  const soltas: LinhaFatura[] = []
  for (const l of linhas) {
    if (l.beneficiarioId) porBeneficiario.set(l.beneficiarioId, [...(porBeneficiario.get(l.beneficiarioId) ?? []), l])
    else soltas.push(l)
  }
  for (const [id, ls] of porBeneficiario) {
    vistos.add(id)
    const m = doMes.get(id)
    const cobrado = centavos(ls.reduce((s, l) => s + l.mensalidade, 0))
    const copart = centavos(ls.reduce((s, l) => s + l.coparticipacao, 0))
    const outros = centavos(ls.reduce((s, l) => s + l.outros, 0))
    const titularId = titularDe.get(id) ?? null
    if (titularId && copart) copartPorTitular.set(titularId, centavos((copartPorTitular.get(titularId) ?? 0) + copart))
    const esperado = m ? (m.mensalidade ?? null) : null
    const diferenca = centavos(cobrado - (esperado ?? 0))
    itens.push({
      chave: id,
      beneficiarioId: id,
      titularId,
      nome: m?.beneficiario.nome ?? ls[0].nome,
      esperado,
      cobrado,
      diferenca,
      coparticipacao: copart,
      outros,
      outrosDescricao: ls.map((l) => l.outrosDescricao).filter(Boolean).join("; ") || null,
      casou: ls[0].casou,
      situacao: !m ? "so_na_fatura" : Math.abs(diferenca) < 0.005 ? "confere" : "diferente",
    })
  }
  soltas.forEach((l, i) => {
    itens.push({
      chave: `solta:${i}`,
      beneficiarioId: null,
      titularId: null,
      nome: l.nome,
      esperado: null,
      cobrado: l.mensalidade,
      diferenca: semAcento(l.nome) === "entidade" ? 0 : l.mensalidade,
      coparticipacao: l.coparticipacao,
      outros: l.outros,
      outrosDescricao: l.outrosDescricao,
      casou: null,
      situacao: semAcento(l.nome) === "entidade" && !l.mensalidade ? "entidade" : "so_na_fatura",
    })
  })
  for (const [id, m] of doMes) {
    if (vistos.has(id)) continue
    itens.push({
      chave: id,
      beneficiarioId: id,
      titularId: titularDe.get(id) ?? null,
      nome: m.beneficiario.nome,
      esperado: m.mensalidade,
      cobrado: null,
      diferenca: centavos(-(m.mensalidade ?? 0)),
      coparticipacao: 0,
      outros: 0,
      outrosDescricao: null,
      casou: null,
      situacao: "so_no_sistema",
    })
  }
  const ordem: Record<SituacaoItem, number> = { so_na_fatura: 0, so_no_sistema: 1, diferente: 2, confere: 3, entidade: 4 }
  itens.sort((a, b) => ordem[a.situacao] - ordem[b.situacao] || a.nome.localeCompare(b.nome, "pt-BR"))
  const soma = (f: (l: LinhaFatura) => number) => centavos(linhas.reduce((s, l) => s + f(l), 0))
  const cobradoMensalidades = soma((l) => l.mensalidade)
  const coparticipacao = soma((l) => l.coparticipacao)
  const outros = soma((l) => l.outros)
  const contagem: Record<SituacaoItem, number> = { confere: 0, diferente: 0, so_na_fatura: 0, so_no_sistema: 0, entidade: 0 }
  for (const it of itens) contagem[it.situacao]++
  return {
    itens,
    totais: {
      esperado: centavos([...doMes.values()].reduce((s, l) => s + (l.mensalidade ?? 0), 0)),
      cobradoMensalidades,
      coparticipacao,
      outros,
      somaLinhas: centavos(cobradoMensalidades + coparticipacao + outros),
      totalFatura,
    },
    copartPorTitular,
    contagem,
  }
}

/** Número vindo da IA: aceita número ou texto "1.234,56"/"1234.56"; o resto vira 0. */
export function valorDaIA(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return centavos(v)
  if (typeof v !== "string") return 0
  const t = v.replace(/[R$\s]/g, "")
  if (!t) return 0
  const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t)
  return Number.isFinite(n) ? centavos(n) : 0
}

/** Quem pode ser incluído no plano a partir de uma linha da fatura (funcionário ou dependente do cadastro). */
export type PessoaParaIncluir = { chave: string; nome: string; rotulo: string }

/**
 * A pessoa do cadastro com o mesmo nome da linha (sem acento e caixa) ou, sem
 * ela, com o mesmo primeiro e último nome — só quando há uma única.
 */
export function sugerirPessoa(nome: string, pessoas: PessoaParaIncluir[]): string | null {
  const exato = pessoas.filter((p) => semAcento(p.nome) === semAcento(nome))
  if (exato.length === 1) return exato[0].chave
  if (exato.length > 1) return null
  const parcial = pessoas.filter((p) => pontas(p.nome) === pontas(nome))
  return parcial.length === 1 ? parcial[0].chave : null
}

/** Linha que é da entidade (taxa), não de um beneficiário. */
export const linhaDaEntidade = (l: { nome: string; mensalidade: number }) => semAcento(l.nome) === "entidade" && !l.mensalidade
