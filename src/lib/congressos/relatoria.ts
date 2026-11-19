/**
 * Congressos — regras puras da relatoria e da plenária (Fase 3).
 *
 * Apreciação no grupo, destino de uma proposta pelos grupos, resultado de uma
 * votação da plenária pela maioria configurada, cotas de saída e trava do
 * relatório do grupo. Sem acesso a banco: testadas em tests/unidade.
 */

export type ResultadoApreciacao = "aprovada_direto" | "plenaria" | "plenaria_com_vencida" | "rejeitada"

export const ROTULO_APRECIACAO: Record<ResultadoApreciacao, string> = {
  aprovada_direto: "Aprovada no grupo",
  plenaria: "Vai à plenária",
  plenaria_com_vencida: "Vai à plenária com a posição vencida",
  rejeitada: "Rejeitada no grupo",
}

export type Contagem = { aFavor: number; contra: number; abstencao: number }

function pct(parte: number, total: number) {
  return total > 0 ? (parte / total) * 100 : 0
}

/**
 * Classifica a votação de uma proposta num grupo. Os percentuais são sobre
 * quem votou, contando abstenções (presentes votantes).
 *  - Maioria a favor: aprovada direto se atingir `aprovaDireto` (0 = nunca);
 *    senão vai à plenária — com a posição vencida junto se os contrários
 *    passarem de `vencidaSobe` (0 = nunca).
 *  - Sem maioria a favor (inclui empate): rejeitada, salvo se os favoráveis
 *    passarem de `vencidaSobe` — aí a posição vencida sobe à plenária.
 */
export function classificarApreciacao(
  c: Contagem,
  regras: { aprovaDireto: number; vencidaSobe: number }
): { resultado: ResultadoApreciacao; explicacao: string } {
  const total = c.aFavor + c.contra + c.abstencao
  if (total === 0) return { resultado: "rejeitada", explicacao: "Nenhum voto registrado." }
  const favor = pct(c.aFavor, total)
  const contra = pct(c.contra, total)
  const f = (n: number) => `${Math.round(n * 10) / 10}%`
  if (c.aFavor > c.contra) {
    if (regras.aprovaDireto > 0 && favor >= regras.aprovaDireto) {
      return { resultado: "aprovada_direto", explicacao: `${f(favor)} a favor, atingiu os ${regras.aprovaDireto}% para aprovação no grupo.` }
    }
    if (regras.vencidaSobe > 0 && contra > regras.vencidaSobe) {
      return { resultado: "plenaria_com_vencida", explicacao: `Maioria a favor; os ${f(contra)} contrários passam de ${regras.vencidaSobe}% e sobem junto.` }
    }
    return { resultado: "plenaria", explicacao: `Maioria a favor (${f(favor)}).` }
  }
  if (regras.vencidaSobe > 0 && favor > regras.vencidaSobe) {
    return { resultado: "plenaria_com_vencida", explicacao: `Sem maioria, mas os ${f(favor)} a favor passam de ${regras.vencidaSobe}% e a proposta sobe como posição vencida.` }
  }
  return { resultado: "rejeitada", explicacao: c.aFavor === c.contra ? "Empate: sem maioria a favor." : `Maioria contrária (${f(contra)}).` }
}

export type MinimoGrupos = "um" | "mais_de_um" | "metade"

/**
 * Destino de uma proposta apreciada em vários grupos (caderno de teses).
 * Aprovada direto só se todos os grupos que a apreciaram aprovaram direto;
 * à plenária se o número de grupos favoráveis atingir o mínimo; senão,
 * rejeitada.
 */
export function destinoPelosGrupos(
  resultados: ResultadoApreciacao[],
  minimo: MinimoGrupos
): { destino: "aprovada" | "plenaria" | "rejeitada" | "pendente"; explicacao: string } {
  const n = resultados.length
  if (n === 0) return { destino: "pendente", explicacao: "Nenhum grupo apreciou ainda." }
  if (resultados.every((r) => r === "aprovada_direto")) {
    return { destino: "aprovada", explicacao: n === 1 ? "Aprovada no grupo." : `Aprovada nos ${n} grupos.` }
  }
  const favoraveis = resultados.filter((r) => r !== "rejeitada").length
  const precisa = minimo === "um" ? 1 : minimo === "mais_de_um" ? Math.min(2, n) : Math.ceil(n / 2)
  if (favoraveis >= precisa) {
    return { destino: "plenaria", explicacao: `Favorável em ${favoraveis} de ${n} grupo(s); precisa de ${precisa}.` }
  }
  return { destino: "rejeitada", explicacao: `Favorável em ${favoraveis} de ${n} grupo(s); precisava de ${precisa}.` }
}

export type Maioria = "simples" | "absoluta" | "dois_tercos"
export type FormaVotacao = "sem_oposicao" | "visual" | "contagem" | "urna"
export type ResultadoPlenaria = "aprovada" | "rejeitada" | "empate"

export const ROTULO_MAIORIA: Record<Maioria, string> = {
  simples: "maioria simples dos votantes",
  absoluta: "maioria absoluta dos credenciados com voto",
  dois_tercos: "2/3 dos votantes",
}

/**
 * Resultado de uma votação da plenária.
 *  - sem_oposicao: aprovada (ninguém se opôs).
 *  - visual: crachá erguido com contraste claro — a mesa declara o resultado.
 *  - contagem/urna: pela maioria configurada. Simples: a favor > contra
 *    (abstenção não conta). Absoluta: a favor > metade dos credenciados com
 *    voto. 2/3: a favor ≥ 2/3 dos votantes (com abstenções).
 */
export function resultadoPlenaria(d: {
  forma: FormaVotacao
  maioria: Maioria
  aFavor?: number | null
  contra?: number | null
  abstencao?: number | null
  credenciadosComVoto?: number
  declarado?: ResultadoPlenaria | null
}): { resultado?: ResultadoPlenaria; explicacao?: string; erro?: string } {
  if (d.forma === "sem_oposicao") return { resultado: "aprovada", explicacao: "Aprovada sem oposição." }
  if (d.forma === "visual") {
    if (!d.declarado || d.declarado === "empate") return { erro: "No crachá erguido sem contagem, a mesa declara aprovada ou rejeitada. Na dúvida, conte." }
    return { resultado: d.declarado, explicacao: `${d.declarado === "aprovada" ? "Aprovada" : "Rejeitada"} por contraste visual.` }
  }
  const a = d.aFavor ?? null
  const c = d.contra ?? null
  const ab = d.abstencao ?? 0
  if (a === null || c === null || a < 0 || c < 0 || ab < 0) return { erro: "Informe os votos a favor e contra." }
  if (a + c + ab === 0) return { erro: "Nenhum voto informado." }
  const placar = `${a} a favor, ${c} contra, ${ab} abstenção(ões)`
  if (d.maioria === "absoluta") {
    const base = d.credenciadosComVoto ?? 0
    if (base <= 0) return { erro: "Sem credenciados com voto para calcular a maioria absoluta." }
    const precisa = Math.floor(base / 2) + 1
    if (a >= precisa) return { resultado: "aprovada", explicacao: `${placar}: atingiu ${precisa} de ${base} credenciados com voto.` }
    return { resultado: "rejeitada", explicacao: `${placar}: precisava de ${precisa} (maioria absoluta de ${base}).` }
  }
  if (d.maioria === "dois_tercos") {
    const total = a + c + ab
    const precisa = Math.ceil((2 * total) / 3)
    if (a >= precisa) return { resultado: "aprovada", explicacao: `${placar}: atingiu 2/3 (${precisa} de ${total}).` }
    return { resultado: "rejeitada", explicacao: `${placar}: precisava de ${precisa} para 2/3 de ${total}.` }
  }
  if (a > c) return { resultado: "aprovada", explicacao: `${placar}: maioria simples.` }
  if (a < c) return { resultado: "rejeitada", explicacao: `${placar}: maioria contrária.` }
  return { resultado: "empate", explicacao: `${placar}: empate. Repita a votação.` }
}

/** Pode registrar mais uma proposta nova neste grupo? */
export function podeNovaNoGrupo(regra: string, maximo: number, jaRegistradas: number): { pode: boolean; motivo?: string } {
  if (regra === "proibidas") return { pode: false, motivo: "O regimento não admite propostas novas nos grupos: registre como apontamento numa proposta existente." }
  if (regra === "limitadas" && jaRegistradas >= maximo) {
    return { pode: false, motivo: `O grupo já registrou ${jaRegistradas} proposta(s) nova(s), o máximo do regimento.` }
  }
  return { pode: true }
}

/** O grupo ainda pode alterar propostas e apontamentos? */
export function grupoTravado(d: { trava: string | null; entregueEm: string | null; agora?: number }): { travado: boolean; motivo?: string } {
  if (d.entregueEm) return { travado: true, motivo: "O relatório do grupo já foi entregue." }
  if (d.trava) {
    const t = Date.parse(d.trava)
    if (Number.isFinite(t) && (d.agora ?? Date.now()) >= t) return { travado: true, motivo: "Passou o horário de trava do relatório dos grupos." }
  }
  return { travado: false }
}

/**
 * Cotas de saída: quantas propostas cada grupo entrega no total e por eixo.
 * Só alerta — quem decide o que corta é a relatoria.
 */
export function conferirCotas(
  propostas: { grupo: string; eixo: string | null }[],
  limites: { porGrupo: number; porEixo: number }
): string[] {
  const alertas: string[] = []
  const porGrupo = new Map<string, number>()
  const porGrupoEixo = new Map<string, number>()
  for (const p of propostas) {
    porGrupo.set(p.grupo, (porGrupo.get(p.grupo) ?? 0) + 1)
    if (p.eixo) porGrupoEixo.set(`${p.grupo}\u0000${p.eixo}`, (porGrupoEixo.get(`${p.grupo}\u0000${p.eixo}`) ?? 0) + 1)
  }
  if (limites.porGrupo > 0) {
    for (const [g, n] of porGrupo) if (n > limites.porGrupo) alertas.push(`${g}: ${n} propostas, acima do máximo de ${limites.porGrupo}.`)
  }
  if (limites.porEixo > 0) {
    for (const [k, n] of porGrupoEixo) {
      if (n > limites.porEixo) {
        const [g, e] = k.split("\u0000")
        alertas.push(`${g}, eixo ${e}: ${n} propostas, acima do máximo de ${limites.porEixo} por eixo.`)
      }
    }
  }
  return alertas
}

/** Lista de abrangências do texto da configuração ("Local, Estadual, Nacional"). */
export function abrangencias(texto: string | null | undefined): string[] {
  return [...new Set((texto ?? "").split(/[,;\n]/).map((s) => s.trim()).filter(Boolean))]
}

/**
 * Separa um texto colado (caderno de teses) em propostas: uma por parágrafo
 * (linha em branco separa). Numeração no início ("1.", "12)", "a)") sai.
 */
export function separarPropostas(texto: string): string[] {
  return texto
    .replace(/\r/g, "")
    .split(/\n\s*\n/)
    .map((b) => b.replace(/\s*\n\s*/g, " ").trim())
    .map((b) => b.replace(/^(\d{1,3}|[a-z])[.)\-–]\s+/i, "").trim())
    .filter((b) => b.length >= 5)
}
