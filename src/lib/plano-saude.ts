/**
 * PLANO DE SAÚDE DOS FUNCIONÁRIOS (24/11/2026) — a conta, pura e testável.
 *
 * Para cada beneficiário no mês: idade → faixa etária da ANS → preço da tabela
 * vigente do produto → regra de custeio (a primeira que casa, pela prioridade)
 * → parte da entidade e parte do funcionário. Somado por titular, é a
 * conferência do mês. Os dados vêm de src/lib/db/plano-saude.ts.
 */

// ── Faixas etárias da ANS (RN 63/2003) ──────────────────────────────────────

export const FAIXAS_ANS: { de: number; ate: number | null; rotulo: string }[] = [
  { de: 0, ate: 18, rotulo: "0 a 18" },
  { de: 19, ate: 23, rotulo: "19 a 23" },
  { de: 24, ate: 28, rotulo: "24 a 28" },
  { de: 29, ate: 33, rotulo: "29 a 33" },
  { de: 34, ate: 38, rotulo: "34 a 38" },
  { de: 39, ate: 43, rotulo: "39 a 43" },
  { de: 44, ate: 48, rotulo: "44 a 48" },
  { de: 49, ate: 53, rotulo: "49 a 53" },
  { de: 54, ate: 58, rotulo: "54 a 58" },
  { de: 59, ate: null, rotulo: "59 ou mais" },
]

export function faixaDaIdade(idade: number): number {
  for (let i = FAIXAS_ANS.length - 1; i >= 0; i--) if (idade >= FAIXAS_ANS[i].de) return i
  return 0
}

/** Conferência da tabela com a RN 63: devolve os avisos (vazio = ok). */
export function avisosTabelaANS(precos: number[]): string[] {
  const avisos: string[] = []
  if (precos.length !== 10 || precos.some((p) => !Number.isFinite(p) || p < 0)) return ["Informe os 10 preços."]
  if (precos[0] > 0 && precos[9] > precos[0] * 6) {
    avisos.push("A última faixa passa de 6 vezes a primeira (RN 63/2003, art. 3º, I).")
  }
  if (precos[0] > 0 && precos[6] > 0) {
    const v1a7 = precos[6] / precos[0] - 1
    const v7a10 = precos[9] / precos[6] - 1
    if (v7a10 > v1a7 + 1e-9) {
      avisos.push("A variação da 7ª para a 10ª faixa passa da variação da 1ª para a 7ª (RN 63/2003, art. 3º, II).")
    }
  }
  for (let i = 1; i < 10; i++) {
    if (precos[i] < precos[i - 1]) {
      avisos.push(`A faixa ${FAIXAS_ANS[i].rotulo} custa menos que a anterior.`)
      break
    }
  }
  return avisos
}

// ── Datas ───────────────────────────────────────────────────────────────────

/** Idade completa em uma data (AAAA-MM-DD). */
export function idadeEm(nascimento: string, data: string): number {
  const [an, mn, dn] = nascimento.slice(0, 10).split("-").map(Number)
  const [a, m, d] = data.slice(0, 10).split("-").map(Number)
  return a - an - (m < mn || (m === mn && d < dn) ? 1 : 0)
}

export function primeiroDia(competencia: string): string {
  return `${competencia}-01`
}

export function ultimoDia(competencia: string): string {
  const [a, m] = competencia.split("-").map(Number)
  return `${competencia}-${String(new Date(Date.UTC(a, m, 0)).getUTCDate()).padStart(2, "0")}`
}

export function deslocarCompetencia(c: string, meses: number): string {
  const [a, m] = c.split("-").map(Number)
  const d = new Date(Date.UTC(a, m - 1 + meses, 1))
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
}

/**
 * Idade que vale para a faixa do mês. "mes_seguinte": quem faz aniversário no
 * mês só muda de faixa no mês seguinte (idade no 1º dia). "mes_aniversario":
 * já no mês do aniversário (idade no último dia).
 */
export function idadeDaFaixa(nascimento: string, competencia: string, regra: FaixaMuda): number {
  return idadeEm(nascimento, regra === "mes_aniversario" ? ultimoDia(competencia) : primeiroDia(competencia))
}

// ── Tipos ───────────────────────────────────────────────────────────────────

export type FaixaMuda = "mes_seguinte" | "mes_aniversario"
export type CondicaoTitular = "ativo" | "demitido" | "aposentado"
export type TipoBeneficiario = "titular" | "dependente" | "agregado"

export const CONDICOES_TITULAR: { chave: CondicaoTitular; rotulo: string }[] = [
  { chave: "ativo", rotulo: "Funcionário ativo" },
  { chave: "demitido", rotulo: "Demitido que manteve o plano (art. 30 da Lei 9.656)" },
  { chave: "aposentado", rotulo: "Aposentado que manteve o plano (art. 31 da Lei 9.656)" },
]

/** Graus de dependente (os do eSocial, com os que já existem no cadastro) e o agregado. */
export const GRAUS_DEPENDENTE = [
  "Cônjuge",
  "Companheiro(a) com união estável",
  "Filho ou enteado",
  "Menor sob guarda ou tutela",
  "Irmão, neto ou bisneto sob guarda",
  "Pais, avós ou bisavós",
  "Pessoa incapaz sob curatela",
  "Ex-cônjuge com pensão alimentícia",
] as const
export const GRAU_AGREGADO = "Agregado"

export type Tabela = { produtoId: string; inicio: string; fim: string | null; precos: number[] }

export type RegraCusteio = {
  id: string
  nome: string
  prioridade: number
  inicio: string | null
  fim: string | null
  /** "titular" e/ou graus. null = todos. */
  beneficiarios: string[] | null
  condicoes: CondicaoTitular[] | null
  produtos: string[] | null
  cargos: string[] | null
  departamentos: string[] | null
  funcionarios: string[] | null
  idadeMin: number | null
  idadeMax: number | null
  modo: "percentual" | "valor_fixo"
  entidadePercentual: number | null
  entidadeValor: number | null
  entidadeTeto: number | null
  copartFuncionarioPercentual: number | null
  copartLimiteMensal: number | null
  ativo: boolean
}

export type RegraDependente = { grau: string; permitido: boolean; idadeLimite: number | null; idadeLimiteEstudante: number | null }

export type Beneficiario = {
  id: string
  produtoId: string
  titularId: string
  tipo: TipoBeneficiario
  /** "titular", o grau do dependente ou o do agregado. */
  grau: string
  nome: string
  nascimento: string | null
  condicao: CondicaoTitular
  inclusao: string
  exclusao: string | null
  estudanteAte: string | null
}

export type Titular = { id: string; nome: string; cargo: string | null; departamento: string | null }

// ── Regras ──────────────────────────────────────────────────────────────────

const naLista = <T,>(lista: T[] | null, v: T | null | undefined) => !lista || lista.length === 0 || (v != null && lista.includes(v))
const vigente = (inicio: string | null, fim: string | null, data: string) => (!inicio || inicio <= data) && (!fim || fim >= data)

export type Contexto = {
  beneficiario: Beneficiario
  titular: Titular
  idade: number | null
  data: string
}

export function regraQueCasa(regras: RegraCusteio[], ctx: Contexto): RegraCusteio | null {
  const b = ctx.beneficiario
  const chave = b.tipo === "titular" ? "titular" : b.grau
  return (
    [...regras]
      .filter((r) => r.ativo && vigente(r.inicio, r.fim, ctx.data))
      .sort((x, y) => x.prioridade - y.prioridade)
      .find(
        (r) =>
          naLista(r.beneficiarios, chave) &&
          naLista(r.condicoes, b.condicao) &&
          naLista(r.produtos, b.produtoId) &&
          naLista(r.cargos, ctx.titular.cargo) &&
          naLista(r.departamentos, ctx.titular.departamento) &&
          naLista(r.funcionarios, ctx.titular.id) &&
          (r.idadeMin === null || (ctx.idade !== null && ctx.idade >= r.idadeMin)) &&
          (r.idadeMax === null || (ctx.idade !== null && ctx.idade <= r.idadeMax))
      ) ?? null
  )
}

const centavos = (v: number) => Math.round(v * 100) / 100

/** Parte da entidade numa mensalidade, pela regra (limitada à mensalidade e ao teto). */
export function parteDaEntidade(regra: RegraCusteio, mensalidade: number): number {
  let v = regra.modo === "percentual" ? (mensalidade * (regra.entidadePercentual ?? 0)) / 100 : (regra.entidadeValor ?? 0)
  if (regra.entidadeTeto !== null) v = Math.min(v, regra.entidadeTeto)
  return centavos(Math.max(0, Math.min(v, mensalidade)))
}

/** Desconto do funcionário na coparticipação do mês, pela regra do titular. */
export function descontoCoparticipacao(regra: RegraCusteio | null, valor: number): number {
  if (!valor) return 0
  let v = (valor * (regra?.copartFuncionarioPercentual ?? 100)) / 100
  if (regra?.copartLimiteMensal != null) v = Math.min(v, regra.copartLimiteMensal)
  return centavos(Math.max(0, v))
}

export function tabelaVigente(tabelas: Tabela[], produtoId: string, data: string): Tabela | null {
  return (
    tabelas
      .filter((t) => t.produtoId === produtoId && vigente(t.inicio, t.fim, data))
      .sort((a, b) => b.inicio.localeCompare(a.inicio))[0] ?? null
  )
}

/** O dependente ainda tem direito na data? null = sem regra para o grau. */
export function direitoDoDependente(
  b: Beneficiario,
  regras: RegraDependente[],
  data: string
): { ok: boolean; motivo: string | null; limite: number | null } | null {
  if (b.tipo === "titular") return { ok: true, motivo: null, limite: null }
  const r = regras.find((x) => x.grau === b.grau)
  if (!r) return null
  if (!r.permitido) return { ok: false, motivo: `${b.grau} não é aceito neste contrato`, limite: null }
  if (!b.nascimento) return { ok: true, motivo: null, limite: null }
  const estudante = Boolean(b.estudanteAte && b.estudanteAte >= data)
  const limite = estudante && r.idadeLimiteEstudante !== null ? r.idadeLimiteEstudante : r.idadeLimite
  if (limite === null) return { ok: true, motivo: null, limite: null }
  const idade = idadeEm(b.nascimento, data)
  return idade >= limite
    ? { ok: false, motivo: `completou ${limite} anos${estudante ? " (limite de estudante)" : ""}`, limite }
    : { ok: true, motivo: null, limite }
}

// ── O mês ───────────────────────────────────────────────────────────────────

export type LinhaBeneficiario = {
  beneficiario: Beneficiario
  idade: number | null
  faixa: number | null
  mensalidade: number | null
  entidade: number | null
  funcionario: number | null
  regra: string | null
  alertas: string[]
}

export type GrupoTitular = {
  titular: Titular
  linhas: LinhaBeneficiario[]
  mensalidade: number
  entidade: number
  funcionario: number
  coparticipacao: number
  descontoCopart: number
  /** Parte da coparticipação do mês que fica com a entidade (já somada em `entidade`). */
  entidadeCopart: number
  /** Desconto total do funcionário no mês (mensalidade + coparticipação). */
  desconto: number
  alertas: string[]
}

export type DadosMes = {
  competencia: string
  faixaMuda: FaixaMuda
  beneficiarios: Beneficiario[]
  titulares: Map<string, Titular>
  tabelas: Tabela[]
  regras: RegraCusteio[]
  regrasDependentes: RegraDependente[]
  /** titularId → valor da coparticipação do mês. */
  coparticipacoes: Map<string, number>
}

/** Quem está no plano em algum dia do mês. */
export function ativoNoMes(b: Beneficiario, competencia: string): boolean {
  return b.inclusao <= ultimoDia(competencia) && (!b.exclusao || b.exclusao >= primeiroDia(competencia))
}

export function calcularMes(d: DadosMes): GrupoTitular[] {
  const data = primeiroDia(d.competencia)
  const grupos = new Map<string, GrupoTitular>()
  for (const b of d.beneficiarios.filter((x) => ativoNoMes(x, d.competencia))) {
    const titular = d.titulares.get(b.titularId) ?? { id: b.titularId, nome: "(sem nome)", cargo: null, departamento: null }
    const alertas: string[] = []
    const idade = b.nascimento ? idadeDaFaixa(b.nascimento, d.competencia, d.faixaMuda) : null
    if (idade === null) alertas.push("Sem data de nascimento: não há como saber a faixa.")
    const faixa = idade === null ? null : faixaDaIdade(idade)
    const tabela = tabelaVigente(d.tabelas, b.produtoId, data)
    if (!tabela) alertas.push("Sem tabela de preço vigente para o produto neste mês.")
    const mensalidade = tabela && faixa !== null ? centavos(tabela.precos[faixa]) : null
    const regra = regraQueCasa(d.regras, { beneficiario: b, titular, idade, data })
    if (!regra) alertas.push("Nenhuma regra de custeio casa com este beneficiário.")
    const entidade = mensalidade !== null && regra ? parteDaEntidade(regra, mensalidade) : null
    const funcionario = mensalidade !== null && entidade !== null ? centavos(mensalidade - entidade) : null
    const direito = direitoDoDependente(b, d.regrasDependentes, ultimoDia(d.competencia))
    if (direito === null && b.tipo !== "titular") alertas.push(`Sem regra para o grau "${b.grau}" no contrato.`)
    else if (direito && !direito.ok) alertas.push(`Perdeu o direito: ${direito.motivo}.`)
    if (b.estudanteAte && b.estudanteAte < data) alertas.push("Comprovante de estudante vencido.")
    const linha: LinhaBeneficiario = { beneficiario: b, idade, faixa, mensalidade, entidade, funcionario, regra: regra?.nome ?? null, alertas }
    const g = grupos.get(b.titularId) ?? {
      titular,
      linhas: [],
      mensalidade: 0,
      entidade: 0,
      funcionario: 0,
      coparticipacao: 0,
      descontoCopart: 0,
      entidadeCopart: 0,
      desconto: 0,
      alertas: [],
    }
    g.linhas.push(linha)
    grupos.set(b.titularId, g)
  }
  for (const g of grupos.values()) {
    g.linhas.sort((a, b) => ordemTipo(a.beneficiario) - ordemTipo(b.beneficiario) || a.beneficiario.nome.localeCompare(b.beneficiario.nome, "pt-BR"))
    g.mensalidade = centavos(g.linhas.reduce((s, l) => s + (l.mensalidade ?? 0), 0))
    g.entidade = centavos(g.linhas.reduce((s, l) => s + (l.entidade ?? 0), 0))
    g.funcionario = centavos(g.linhas.reduce((s, l) => s + (l.funcionario ?? 0), 0))
    g.coparticipacao = centavos(d.coparticipacoes.get(g.titular.id) ?? 0)
    const doTitular = g.linhas.find((l) => l.beneficiario.tipo === "titular")?.beneficiario
    const regraTitular = doTitular
      ? regraQueCasa(d.regras, { beneficiario: doTitular, titular: g.titular, idade: null, data })
      : null
    g.descontoCopart = descontoCoparticipacao(regraTitular, g.coparticipacao)
    g.entidadeCopart = centavos(g.coparticipacao - g.descontoCopart)
    g.entidade = centavos(g.entidade + g.entidadeCopart)
    g.desconto = centavos(g.funcionario + g.descontoCopart)
    g.alertas = [...new Set(g.linhas.flatMap((l) => l.alertas))]
    if (!doTitular) g.alertas.push("Dependentes no plano sem o titular.")
  }
  return [...grupos.values()].sort((a, b) => a.titular.nome.localeCompare(b.titular.nome, "pt-BR"))
}

function ordemTipo(b: Beneficiario): number {
  return b.tipo === "titular" ? 0 : b.tipo === "dependente" ? 1 : 2
}

// ── Mudanças em relação ao mês anterior ─────────────────────────────────────

export type Mudanca = { beneficiarioId: string; nome: string; texto: string }

/** O que mudou de um mês para o outro, por beneficiário (faixa, preço, entrada, saída). */
export function mudancasEntreMeses(anterior: GrupoTitular[], atual: GrupoTitular[]): Map<string, Mudanca[]> {
  const antes = new Map(anterior.flatMap((g) => g.linhas.map((l) => [l.beneficiario.id, l] as const)))
  const agora = new Map(atual.flatMap((g) => g.linhas.map((l) => [l.beneficiario.id, l] as const)))
  const porTitular = new Map<string, Mudanca[]>()
  const add = (titularId: string, m: Mudanca) => porTitular.set(titularId, [...(porTitular.get(titularId) ?? []), m])
  for (const [id, l] of agora) {
    const a = antes.get(id)
    const nome = l.beneficiario.nome
    if (!a) {
      add(l.beneficiario.titularId, { beneficiarioId: id, nome, texto: "entrou no plano" })
      continue
    }
    if (a.faixa !== null && l.faixa !== null && a.faixa !== l.faixa) {
      add(l.beneficiario.titularId, {
        beneficiarioId: id,
        nome,
        texto: `mudou de faixa (${FAIXAS_ANS[a.faixa].rotulo} → ${FAIXAS_ANS[l.faixa].rotulo})`,
      })
    } else if (a.mensalidade !== null && l.mensalidade !== null && a.mensalidade !== l.mensalidade) {
      add(l.beneficiario.titularId, { beneficiarioId: id, nome, texto: "mensalidade mudou (tabela nova)" })
    }
    if (a.funcionario !== null && l.funcionario !== null && a.funcionario !== l.funcionario) {
      add(l.beneficiario.titularId, {
        beneficiarioId: id,
        nome,
        texto: `desconto ${moeda(a.funcionario)} → ${moeda(l.funcionario)}`,
      })
    }
  }
  for (const [id, a] of antes) {
    if (!agora.has(id)) add(a.beneficiario.titularId, { beneficiarioId: id, nome: a.beneficiario.nome, texto: "saiu do plano" })
  }
  return porTitular
}

export function moeda(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—"
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

/** "123,45" ou "123.45" → número; vazio → null. */
export function lerValor(s: string | null | undefined): number | null {
  const t = (s ?? "").trim().replace(/[R$\s]/g, "")
  if (!t) return null
  const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t)
  return Number.isFinite(n) ? n : null
}
