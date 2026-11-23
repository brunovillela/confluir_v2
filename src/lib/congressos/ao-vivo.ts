/**
 * Congressos — plenária ao vivo (Fase 7): regras puras.
 *
 * Quem pode votar na votação eletrônica (direito, credenciamento, local da
 * decisão e prova de presença), apuração simples e priorização, fila de fala
 * (ordem, prioridade das questões, limite de oradores) e o cronômetro.
 *
 * Sem "server-only": testado em tests/unidade/congressos.spec.ts.
 */

// ── Votação eletrônica ──────────────────────────────────────────────────────

export const OPCOES_SIMPLES = [
  { chave: "favor", rotulo: "A favor" },
  { chave: "contra", rotulo: "Contra" },
  { chave: "abstencao", rotulo: "Abstenção" },
] as const
export type OpcaoSimples = (typeof OPCOES_SIMPLES)[number]["chave"]

export type Canal = "link" | "estacao"
export type Prova = "A" | "B" | "C" | "D" | "E"
export type RegraLocal = "so_local" | "local_ou_distancia" | "distancia_autorizados" | "so_distancia"

const ACEITOS: Record<Prova, Prova[]> = { A: ["A", "B", "C", "D", "E"], B: ["B", "C", "D", "E"], C: ["C", "D", "E"], D: ["D", "E"], E: ["E"] }

export type PedidoVoto = {
  aberta: boolean
  votoPlenaria: boolean
  categoria: string | null
  votoSoSubstituindo: boolean
  emExercicio: boolean
  credenciado: boolean
  modalidade: "presencial" | "distancia"
  canal: Canal
  regraLocal: RegraLocal
  provaExigida: Prova
  presenteNaSessao: boolean
  codigoValido: boolean
}

export type RespostaVoto = { pode: boolean; motivo?: string; nivel: Prova | null; precisaCodigo?: boolean }

/** Pode votar agora? Diz o motivo quando não pode e o nível de prova do voto. */
export function podeVotar(p: PedidoVoto): RespostaVoto {
  const nao = (motivo: string, extra: Partial<RespostaVoto> = {}): RespostaVoto => ({ pode: false, motivo, nivel: null, ...extra })
  if (!p.aberta) return nao("Não há votação aberta agora.")
  if (!p.votoPlenaria && !p.votoSoSubstituindo) return nao("O seu papel no congresso não vota na plenária.")
  if (p.votoSoSubstituindo && !p.emExercicio) return nao("Suplente vota só depois de assumir a vaga de um titular.")
  if (!p.emExercicio) return nao("O seu lugar foi assumido por um suplente.")
  if (!p.credenciado) return nao("O voto vale depois do credenciamento. Procure a mesa.")
  if (p.modalidade === "distancia") {
    if (p.regraLocal === "so_local") return nao("Esta votação só aceita quem está no local.")
    return { pode: true, nivel: null }
  }
  const nivel: Prova = p.canal === "estacao" ? "D" : p.codigoValido ? "C" : p.presenteNaSessao ? "B" : "A"
  if (p.regraLocal === "so_distancia" || p.regraLocal === "local_ou_distancia") return { pode: true, nivel }
  if (ACEITOS[p.provaExigida].includes(nivel)) return { pode: true, nivel }
  if (p.provaExigida === "C") return nao("Para votar, leia o código exibido no telão.", { precisaCodigo: true })
  if (p.provaExigida === "B") return nao("Registre a sua presença na sessão antes de votar.")
  return nao("Esta votação é feita na estação da mesa, com o seu crachá.")
}

/** Contagem da votação simples. */
export function apurarSimples(votos: { opcao: string }[]): { aFavor: number; contra: number; abstencao: number } {
  const r = { aFavor: 0, contra: 0, abstencao: 0 }
  for (const v of votos) {
    if (v.opcao === "favor") r.aFavor++
    else if (v.opcao === "contra") r.contra++
    else if (v.opcao === "abstencao") r.abstencao++
  }
  return r
}

export type ItemPriorizacao = { chave: string; rotulo: string }
export type Classificado = ItemPriorizacao & { votos: number; posicao: number }

/** Classificação da priorização: mais votados primeiro; empate divide a posição. */
export function classificarPriorizacao(itens: ItemPriorizacao[], votos: { opcao: string }[]): Classificado[] {
  const conta = new Map(itens.map((i) => [i.chave, 0]))
  for (const v of votos) if (conta.has(v.opcao)) conta.set(v.opcao, conta.get(v.opcao)! + 1)
  const ordem = itens.map((i, k) => ({ ...i, votos: conta.get(i.chave)!, k })).sort((a, b) => b.votos - a.votos || a.k - b.k)
  let posicao = 0
  let anterior = -1
  return ordem.map((i, k) => {
    if (i.votos !== anterior) {
      posicao = k + 1
      anterior = i.votos
    }
    return { chave: i.chave, rotulo: i.rotulo, votos: i.votos, posicao }
  })
}

// ── Fila de fala ────────────────────────────────────────────────────────────

export type TipoFala = "fala" | "a_favor" | "contra" | "questao_ordem" | "esclarecimento" | "encaminhamento" | "declaracao_voto"

export const ROTULO_FALA: Record<TipoFala, string> = {
  fala: "Fala",
  a_favor: "A favor",
  contra: "Contra",
  questao_ordem: "Questão de ordem",
  esclarecimento: "Esclarecimento",
  encaminhamento: "Encaminhamento",
  declaracao_voto: "Declaração de voto",
}

const QUESTOES: TipoFala[] = ["questao_ordem", "esclarecimento", "encaminhamento"]
const ORADORES: TipoFala[] = ["fala", "a_favor", "contra"]

/** Duração da fala pelo tipo: questões e declaração têm o tempo curto. */
export function segundosDaFala(tipo: TipoFala, tempoFalaMin: number, tempoQuestaoMin: number): number {
  return Math.round((ORADORES.includes(tipo) ? tempoFalaMin : tempoQuestaoMin) * 60)
}

type FalaNaFila = { id: string; tipo: TipoFala; ordem: number; situacao: string }

/** Ordem de chamada: questão de ordem, esclarecimento e encaminhamento passam à frente; depois, pela inscrição. */
export function ordenarFila<T extends FalaNaFila>(falas: T[]): T[] {
  const peso = (t: TipoFala) => (t === "questao_ordem" ? 0 : t === "esclarecimento" ? 1 : t === "encaminhamento" ? 2 : 3)
  return falas.filter((f) => f.situacao === "inscrita").sort((a, b) => peso(a.tipo) - peso(b.tipo) || a.ordem - b.ordem)
}

/**
 * Pode se inscrever? Oradores (fala, a favor, contra) param quando a mesa
 * encerra as inscrições ou quando chega ao número de oradores do regimento;
 * questões entram a qualquer momento; declaração de voto tem limite próprio.
 * Ninguém fica duas vezes na fila com o mesmo tipo.
 */
export function podeInscrever(d: {
  tipo: TipoFala
  inscricoesAbertas: boolean
  oradoresNaRodada: number
  maxOradores: number
  declaracoesNaRodada: number
  maxDeclaracoes: number
  jaNaFila: boolean
}): { pode: boolean; motivo?: string } {
  if (d.jaNaFila) return { pode: false, motivo: "Você já está na fila com este tipo de fala." }
  if (QUESTOES.includes(d.tipo)) return { pode: true }
  if (d.tipo === "declaracao_voto") {
    if (d.maxDeclaracoes <= 0) return { pode: false, motivo: "O regimento não prevê declaração de voto." }
    if (d.declaracoesNaRodada >= d.maxDeclaracoes) return { pode: false, motivo: `Já há ${d.maxDeclaracoes} declaração(ões) de voto inscrita(s).` }
    return { pode: true }
  }
  if (!d.inscricoesAbertas) return { pode: false, motivo: "As inscrições para falar estão encerradas." }
  if (d.maxOradores > 0 && d.oradoresNaRodada >= d.maxOradores) return { pode: false, motivo: `As inscrições encerraram no ${d.maxOradores}º orador.` }
  return { pode: true }
}

/** Segundos que faltam (negativo = estourou). Pausado, o relógio para. */
export function tempoRestante(f: { segundos: number; inicioEm: string | null; pausadaEm: string | null; pausadoMs: number }, agora = Date.now()): number {
  if (!f.inicioEm) return f.segundos
  const ate = f.pausadaEm ? Date.parse(f.pausadaEm) : agora
  const corrido = Math.max(0, ate - Date.parse(f.inicioEm) - f.pausadoMs)
  return Math.ceil(f.segundos - corrido / 1000)
}

/** "2:05", "0:09", "-0:12". */
export function relogio(segundos: number): string {
  const s = Math.abs(segundos)
  return `${segundos < 0 ? "-" : ""}${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}
