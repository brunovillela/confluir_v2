/**
 * Depósitos das fontes pagadoras achados no extrato bancário (15/11/2026):
 * regras puras do casamento entre um crédito do extrato (banco_lancamentos)
 * e uma relação lançada sem depósito (empresa × competência). Pontua pelo
 * CNPJ ou pelo nome da empresa no histórico do crédito e pelo valor da
 * relação. Quem confirma é a pessoa; aqui só se sugere.
 */

export type CreditoExtrato = {
  id: string
  data: string
  valor: number
  descricao: string | null
  documento: string | null
}

export type RelacaoSemDeposito = {
  /** empresaId|competencia|tipo */
  chave: string
  empresaId: string
  nome: string
  /** CNPJs das empresas cujos lançamentos contam (no grupo, todas). */
  cnpjs: string[]
  /** Nomes alternativos (razão social, membros do grupo). */
  nomes: string[]
  competencia: number
  valorRelacao: number
  /** Janela em que o depósito pode ter caído (AAAA-MM-DD). */
  inicio: string
  fim: string
  /** Prazo do depósito (AAAA-MM-DD): desempata créditos de mesmo valor em meses diferentes. */
  prazo?: string
}

export type Confianca = "alta" | "media" | "baixa"

export type Candidato = {
  credito: CreditoExtrato
  pontos: number
  confianca: Confianca
  motivos: string[]
}

const digitos = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "")

/** Minúsculas, sem acento e sem pontuação, com espaços simples. */
export function normalizar(v: string | null | undefined): string {
  return (v ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

/** Palavras que não identificam uma empresa (aparecem em muitos nomes). */
const GENERICAS = new Set([
  "ltda", "eireli", "s", "sa", "me", "epp", "cia", "companhia", "comercio", "comercial", "industria", "industrial",
  "servicos", "servico", "petroleo", "brasil", "brasileira", "do", "da", "de", "dos", "das", "e", "the", "inc",
  "international", "internacional", "participacoes", "holding", "grupo", "empresa", "engenharia", "tecnologia",
  "solucoes", "offshore", "oil", "gas", "energia", "sistemas", "transportes", "logistica",
])

/** Palavras do nome que distinguem a empresa (4+ letras e não genéricas). */
export function palavrasDistintivas(nome: string): string[] {
  return normalizar(nome)
    .split(" ")
    .filter((p) => p.length >= 4 && !GENERICAS.has(p))
}

/** O texto do crédito traz o CNPJ (completo ou a raiz de 8 dígitos)? */
export function temCnpj(texto: string, cnpjs: string[]): boolean {
  const d = digitos(texto)
  if (d.length < 8) return false
  return cnpjs.some((c) => {
    const n = digitos(c)
    return n.length === 14 && (d.includes(n) || d.includes(n.slice(0, 8)))
  })
}

/** O texto do crédito traz uma palavra distintiva do nome? */
export function temNome(texto: string, nomes: string[]): boolean {
  const t = ` ${normalizar(texto)} `
  return nomes.some((n) => palavrasDistintivas(n).some((p) => t.includes(` ${p} `)))
}

/** Pontua um crédito para uma relação; null = não serve. */
export function pontuar(c: CreditoExtrato, r: RelacaoSemDeposito): Candidato | null {
  if (c.valor <= 0 || c.data < r.inicio || c.data > r.fim) return null
  const texto = `${c.descricao ?? ""} ${c.documento ?? ""}`
  const exato = Math.abs(c.valor - r.valorRelacao) <= 0.01
  const perto = !exato && r.valorRelacao > 0 && Math.abs(c.valor - r.valorRelacao) / r.valorRelacao <= 0.02
  const cnpj = temCnpj(texto, r.cnpjs)
  const nome = !cnpj && temNome(texto, [r.nome, ...r.nomes])
  if (!exato && !cnpj && !nome) return null
  const motivos: string[] = []
  let pontos = 0
  const somar = (n: number, motivo: string) => {
    pontos += n
    motivos.push(motivo)
  }
  if (cnpj) somar(3, "CNPJ da empresa no histórico")
  if (nome) somar(2, "nome da empresa no histórico")
  if (exato) somar(3, "mesmo valor da relação")
  if (perto) somar(1, "valor próximo ao da relação")
  const identifica = cnpj || nome
  const confianca: Confianca = exato && identifica ? "alta" : (exato || (identifica && perto)) ? "media" : "baixa"
  return { credito: c, pontos, confianca, motivos }
}

export type Sugestao = {
  relacao: RelacaoSemDeposito
  candidatos: Candidato[]
  /** O melhor candidato pode ser confirmado em lote (alta confiança e sem disputa). */
  seguro: boolean
}

/**
 * Para cada relação sem depósito, os créditos que servem (até 3, os de mais
 * pontos primeiro). "Seguro" = um único candidato de alta confiança, que
 * também não é o de alta confiança de outra relação.
 */
export function sugerirDepositos(creditos: CreditoExtrato[], relacoes: RelacaoSemDeposito[]): Sugestao[] {
  const sugestoes: Sugestao[] = []
  for (const r of relacoes) {
    const candidatos = creditos
      .map((c) => pontuar(c, r))
      .filter((x): x is Candidato => x !== null)
      .sort((a, b) => b.pontos - a.pontos || Math.abs(a.credito.valor - r.valorRelacao) - Math.abs(b.credito.valor - r.valorRelacao) || a.credito.data.localeCompare(b.credito.data))
      .slice(0, 3)
    if (candidatos.length) sugestoes.push({ relacao: r, candidatos, seguro: false })
  }
  // Mesmo valor em meses diferentes (mensalidade igual todo mês): o crédito fica
  // com a relação cujo prazo do depósito está mais perto da data dele, se a
  // vantagem for clara (15 dias ou mais); as outras perdem esse candidato.
  const dias = (a: string, b: string) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000
  const disputas = new Map<string, Sugestao[]>()
  for (const s of sugestoes) for (const c of s.candidatos) if (c.confianca === "alta") disputas.set(c.credito.id, [...(disputas.get(c.credito.id) ?? []), s])
  for (const [creditoId, lista] of disputas) {
    if (lista.length < 2 || lista.some((s) => !s.relacao.prazo)) continue
    const data = lista[0].candidatos.find((c) => c.credito.id === creditoId)!.credito.data
    const ordenadas = [...lista].sort((a, b) => dias(data, a.relacao.prazo!) - dias(data, b.relacao.prazo!))
    if (dias(data, ordenadas[1].relacao.prazo!) - dias(data, ordenadas[0].relacao.prazo!) < 15) continue
    for (const s of ordenadas.slice(1)) s.candidatos = s.candidatos.filter((c) => c.credito.id !== creditoId)
  }
  // Crédito disputado (alta confiança em mais de uma relação) não é seguro.
  const usosAltos = new Map<string, number>()
  for (const s of sugestoes) for (const c of s.candidatos) if (c.confianca === "alta") usosAltos.set(c.credito.id, (usosAltos.get(c.credito.id) ?? 0) + 1)
  // Um palpite fraco não aparece numa relação se o mesmo crédito é muito provável em outra.
  for (const s of sugestoes) s.candidatos = s.candidatos.filter((c) => c.confianca !== "baixa" || !usosAltos.has(c.credito.id))
  for (let i = sugestoes.length - 1; i >= 0; i--) if (sugestoes[i].candidatos.length === 0) sugestoes.splice(i, 1)
  for (const s of sugestoes) {
    const altos = s.candidatos.filter((c) => c.confianca === "alta")
    s.seguro = altos.length === 1 && s.candidatos[0] === altos[0] && usosAltos.get(altos[0].credito.id) === 1
  }
  return sugestoes.sort((a, b) => Number(b.seguro) - Number(a.seguro) || b.relacao.competencia - a.relacao.competencia || a.relacao.nome.localeCompare(b.relacao.nome, "pt-BR"))
}
