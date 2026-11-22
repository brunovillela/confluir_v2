/**
 * Congressos — encerramento (Fase 6): regras puras.
 *
 * Divisão das vagas entre chapas, quem foi eleito, conferência da chapa,
 * frequência e direito a certificado, situação das resoluções e a busca do
 * que já foi decidido antes ("memória"), sem IA.
 *
 * Sem "server-only": testado em tests/unidade/congressos.spec.ts.
 */

// ── Resoluções ──────────────────────────────────────────────────────────────

export type DestinoResolucao = "registro" | "pauta_act" | "plano_lutas" | "oficio" | "direcao" | "etapa_seguinte"
export type SituacaoResolucao = "a_encaminhar" | "em_andamento" | "cumprida" | "parcial" | "nao_cumprida" | "prejudicada"

export const ROTULO_DESTINO: Record<DestinoResolucao, string> = {
  registro: "Só registro",
  pauta_act: "Pauta do acordo coletivo",
  plano_lutas: "Plano de lutas",
  oficio: "Ofício ao destinatário",
  direcao: "Encaminhar à direção",
  etapa_seguinte: "Levar à etapa seguinte",
}

export const ROTULO_SITUACAO_RESOLUCAO: Record<SituacaoResolucao, string> = {
  a_encaminhar: "A encaminhar",
  em_andamento: "Em andamento",
  cumprida: "Cumprida",
  parcial: "Cumprida em parte",
  nao_cumprida: "Não cumprida",
  prejudicada: "Prejudicada",
}

const FECHADAS: SituacaoResolucao[] = ["cumprida", "nao_cumprida", "prejudicada"]

/** Resolução com prazo vencido e ainda aberta. */
export function resolucaoAtrasada(r: { prazo: string | null; situacao: SituacaoResolucao }, hoje: string): boolean {
  return !!r.prazo && r.prazo < hoje && !FECHADAS.includes(r.situacao)
}

/** Resumo do acompanhamento: quantas em cada situação e quantas atrasadas. */
export function resumoResolucoes(rs: { prazo: string | null; situacao: SituacaoResolucao }[], hoje: string) {
  const porSituacao = Object.fromEntries(Object.keys(ROTULO_SITUACAO_RESOLUCAO).map((k) => [k, 0])) as Record<SituacaoResolucao, number>
  let atrasadas = 0
  for (const r of rs) {
    porSituacao[r.situacao]++
    if (resolucaoAtrasada(r, hoje)) atrasadas++
  }
  const fechadas = rs.filter((r) => FECHADAS.includes(r.situacao) || r.situacao === "parcial").length
  return { total: rs.length, porSituacao, atrasadas, percentualConcluido: rs.length ? Math.round((fechadas / rs.length) * 100) : 0 }
}

// ── Eleição da delegação ────────────────────────────────────────────────────

export type ChapaVotada = { id: string; votos: number; inscritaEm: string }
export type Divisao = { vagas: Map<string, number>; empate: boolean; aviso?: string }

/**
 * Divide as vagas entre as chapas. Maioria: a mais votada leva todas (empate
 * no primeiro lugar é apontado, não resolvido). Proporcional: quociente
 * eleitoral (votos válidos ÷ vagas) e as que sobram pelos maiores restos;
 * resto igual desempata por mais votos e depois pela inscrição mais antiga.
 */
export function dividirVagas(chapas: ChapaVotada[], vagas: number, criterio: "maioria" | "proporcional"): Divisao {
  const resultado = new Map(chapas.map((c) => [c.id, 0]))
  const validas = chapas.filter((c) => c.votos > 0)
  if (!validas.length || vagas <= 0) return { vagas: resultado, empate: false, aviso: "Nenhuma chapa com votos." }
  const ordenadas = [...validas].sort((a, b) => b.votos - a.votos || a.inscritaEm.localeCompare(b.inscritaEm))
  if (criterio === "maioria") {
    const empate = ordenadas.length > 1 && ordenadas[0].votos === ordenadas[1].votos
    if (empate) return { vagas: resultado, empate: true, aviso: "Empate no primeiro lugar: o regimento decide (nova votação ou outro critério)." }
    resultado.set(ordenadas[0].id, vagas)
    return { vagas: resultado, empate: false }
  }
  const total = validas.reduce((s, c) => s + c.votos, 0)
  const quociente = total / vagas
  let distribuidas = 0
  const restos: { id: string; resto: number; votos: number; inscritaEm: string }[] = []
  for (const c of ordenadas) {
    const exato = c.votos / quociente
    const inteiro = Math.floor(exato)
    resultado.set(c.id, inteiro)
    distribuidas += inteiro
    restos.push({ id: c.id, resto: exato - inteiro, votos: c.votos, inscritaEm: c.inscritaEm })
  }
  restos.sort((a, b) => b.resto - a.resto || b.votos - a.votos || a.inscritaEm.localeCompare(b.inscritaEm))
  let empate = false
  for (let i = 0; distribuidas < vagas && i < restos.length; i++) {
    const r = restos[i]
    const proximo = restos[i + 1]
    if (distribuidas + 1 === vagas && proximo && Math.abs(proximo.resto - r.resto) < 1e-9 && proximo.votos === r.votos) empate = true
    resultado.set(r.id, (resultado.get(r.id) ?? 0) + 1)
    distribuidas++
  }
  return { vagas: resultado, empate, aviso: empate ? "A última vaga ficou empatada em resto e votos: desempatou pela inscrição mais antiga; confira o regimento." : undefined }
}

export type Membro = { participanteId: string; condicao: "titular" | "suplente"; ordem: number }

/** Quem da chapa foi eleito: os primeiros titulares e suplentes, pela ordem da chapa. */
export function eleitosDaChapa<T extends Membro>(membros: T[], titulares: number, suplentes: number): Set<string> {
  const ordem = (c: "titular" | "suplente") => membros.filter((m) => m.condicao === c).sort((a, b) => a.ordem - b.ordem)
  return new Set([...ordem("titular").slice(0, titulares), ...ordem("suplente").slice(0, suplentes)].map((m) => m.participanteId))
}

export type ConferenciaChapa = { ok: boolean; problemas: string[] }

/**
 * Confere a chapa antes da inscrição: tamanho, quem pode compor e se alguém
 * já está em outra chapa.
 */
export function conferirChapa(d: {
  membros: { participanteId: string; nome: string; condicao: "titular" | "suplente"; podeCompor: boolean; outraChapa: string | null }[]
  vagas: number
  suplentes: number
  completa: boolean
}): ConferenciaChapa {
  const problemas: string[] = []
  const titulares = d.membros.filter((m) => m.condicao === "titular").length
  const sups = d.membros.filter((m) => m.condicao === "suplente").length
  if (!titulares) problemas.push("A chapa não tem titulares.")
  if (titulares > d.vagas) problemas.push(`São ${titulares} titulares para ${d.vagas} vaga(s).`)
  if (d.completa && titulares < d.vagas) problemas.push(`Faltam ${d.vagas - titulares} titular(es): o regimento pede a chapa completa, com ${d.vagas}.`)
  if (sups > d.suplentes) problemas.push(`São ${sups} suplentes para ${d.suplentes} vaga(s) de suplente.`)
  const vistos = new Set<string>()
  for (const m of d.membros) {
    if (vistos.has(m.participanteId)) problemas.push(`${m.nome} aparece duas vezes.`)
    vistos.add(m.participanteId)
    if (!m.podeCompor) problemas.push(`${m.nome} não pode compor chapa pela regra do congresso.`)
    if (m.outraChapa) problemas.push(`${m.nome} já está na chapa ${m.outraChapa}.`)
  }
  return { ok: problemas.length === 0, problemas }
}

/** A janela de inscrição de chapas está aberta? Sem datas, fica a critério da mesa. */
export function janelaDeChapas(inicio: string | null, fim: string | null, agora = Date.now()): { aberta: boolean; motivo?: string } {
  if (inicio && agora < Date.parse(inicio)) return { aberta: false, motivo: "A inscrição de chapas ainda não abriu." }
  if (fim && agora > Date.parse(fim)) return { aberta: false, motivo: "A inscrição de chapas já fechou." }
  return { aberta: true }
}

// ── Certificados ────────────────────────────────────────────────────────────

/** Frequência em %: sessões com presença ÷ sessões realizadas que contam. */
export function frequencia(presentes: number, sessoes: number): number | null {
  if (sessoes <= 0) return null
  return Math.round((Math.min(presentes, sessoes) / sessoes) * 10000) / 100
}

/**
 * Tem direito ao certificado? Credenciado, e com a frequência mínima quando
 * houve presença por sessão. Sem sessões registradas, basta o credenciamento.
 */
export function direitoAoCertificado(d: { credenciado: boolean; frequencia: number | null; minimo: number; regra: string }): { tem: boolean; motivo?: string } {
  if (d.regra === "nao") return { tem: false, motivo: "Este congresso não emite certificado." }
  if (!d.credenciado) return { tem: false, motivo: "Só quem foi credenciado recebe certificado." }
  if (d.frequencia !== null && d.frequencia < d.minimo) return { tem: false, motivo: `Frequência de ${d.frequencia}% abaixo do mínimo de ${d.minimo}%.` }
  return { tem: true }
}

const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

/** Código do certificado: "C" + 7 caracteres sem ambiguidade (0/O, 1/I). */
export function codigoCertificado(aleatorio: Uint8Array): string {
  let s = "C"
  for (let i = 0; i < 7; i++) s += ALFABETO[aleatorio[i % aleatorio.length] % ALFABETO.length]
  return s
}

// ── Memória: já decidido antes? ─────────────────────────────────────────────

const VAZIAS = new Set(
  "a o as os um uma uns umas de da do das dos e em no na nos nas por para pela pelo pelas pelos com sem que se ao aos à às como mais ou sua seu suas seus sobre entre todos todas toda todo ser ter".split(" ")
)

/** Palavras que importam: minúsculas, sem acento, sem as vazias e com 3+ letras. */
export function palavrasChave(texto: string): Set<string> {
  return new Set(
    texto
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .split(/[^a-z0-9%]+/)
      .filter((w) => w.length >= 3 && !VAZIAS.has(w))
      .map((w) => (w.length > 5 && w.endsWith("s") ? w.slice(0, -1) : w))
  )
}

/** Quanto do texto procurado está contido no candidato (0 a 1). */
export function semelhanca(procurado: Set<string>, candidato: Set<string>): number {
  if (!procurado.size || !candidato.size) return 0
  let comum = 0
  for (const w of procurado) if (candidato.has(w)) comum++
  const cobertura = comum / procurado.size
  const jaccard = comum / (procurado.size + candidato.size - comum)
  return Math.round((cobertura * 0.7 + jaccard * 0.3) * 100) / 100
}

export type Lembranca<T> = { item: T; nota: number }

/** Os candidatos mais parecidos acima do mínimo. Não conclui: só mostra a fonte. */
export function lembrar<T>(texto: string, candidatos: { item: T; texto: string }[], minimo = 0.45, limite = 3): Lembranca<T>[] {
  const p = palavrasChave(texto)
  if (p.size < 3) return []
  return candidatos
    .map((c) => ({ item: c.item, nota: semelhanca(p, palavrasChave(c.texto)) }))
    .filter((x) => x.nota >= minimo)
    .sort((a, b) => b.nota - a.nota)
    .slice(0, limite)
}
