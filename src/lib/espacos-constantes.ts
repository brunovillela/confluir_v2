/**
 * Constantes e regras puras da Cessão de espaços, compartilhadas entre client e
 * server. Fica FORA de `server-only`: forms e badges importam daqui, nunca da
 * camada de dados.
 */

// ── Regras do espaço ─────────────────────────────────────────────────────────

export const VISITAS_TECNICAS = [
  { chave: "obrigatoria", rotulo: "Obrigatória" },
  { chave: "facultativa", rotulo: "Facultativa" },
  { chave: "dispensada", rotulo: "Dispensada" },
] as const
export type VisitaTecnica = (typeof VISITAS_TECNICAS)[number]["chave"]

export const PUBLICOS_ALVO = [
  { chave: "qualquer", rotulo: "Qualquer pessoa" },
  { chave: "interno", rotulo: "Público interno (funcionários e diretores)" },
  { chave: "filiados", rotulo: "Somente filiados" },
] as const
export type PublicoAlvo = (typeof PUBLICOS_ALVO)[number]["chave"]

export const MODOS_JANELA = [
  { chave: "livre", rotulo: "Horário livre" },
  { chave: "slots", rotulo: "Blocos de horário fixos" },
] as const
export type ModoJanela = (typeof MODOS_JANELA)[number]["chave"]

export const MOTIVOS_BLOQUEIO = [
  { chave: "manutencao", rotulo: "Manutenção" },
  { chave: "agenda_prioritaria", rotulo: "Agenda prioritária" },
  { chave: "outro", rotulo: "Outro" },
] as const
export type MotivoBloqueio = (typeof MOTIVOS_BLOQUEIO)[number]["chave"]

/** Domingo a sábado, na convenção de `Date.getDay()`. */
export const DIAS_SEMANA = [
  { dia: 0, curto: "Dom", rotulo: "Domingo" },
  { dia: 1, curto: "Seg", rotulo: "Segunda-feira" },
  { dia: 2, curto: "Ter", rotulo: "Terça-feira" },
  { dia: 3, curto: "Qua", rotulo: "Quarta-feira" },
  { dia: 4, curto: "Qui", rotulo: "Quinta-feira" },
  { dia: 5, curto: "Sex", rotulo: "Sexta-feira" },
  { dia: 6, curto: "Sáb", rotulo: "Sábado" },
] as const

const rotuloDe = <T extends { chave: string; rotulo: string }>(
  lista: readonly T[],
  chave: string | null | undefined
): string => lista.find((x) => x.chave === chave)?.rotulo ?? "—"

export const rotuloVisita = (v: string | null | undefined) =>
  rotuloDe(VISITAS_TECNICAS, v)
export const rotuloPublico = (p: string | null | undefined) =>
  rotuloDe(PUBLICOS_ALVO, p)
export const rotuloModo = (m: string | null | undefined) =>
  rotuloDe(MODOS_JANELA, m)
export const rotuloMotivo = (m: string | null | undefined) =>
  rotuloDe(MOTIVOS_BLOQUEIO, m)
export const rotuloDia = (d: number | null | undefined) =>
  DIAS_SEMANA.find((x) => x.dia === d)?.rotulo ?? "—"

export const visitaValida = (v: string): v is VisitaTecnica =>
  VISITAS_TECNICAS.some((x) => x.chave === v)
export const publicoValido = (p: string): p is PublicoAlvo =>
  PUBLICOS_ALVO.some((x) => x.chave === p)
export const modoValido = (m: string): m is ModoJanela =>
  MODOS_JANELA.some((x) => x.chave === m)
export const motivoValido = (m: string): m is MotivoBloqueio =>
  MOTIVOS_BLOQUEIO.some((x) => x.chave === m)

// ── Elegibilidade do ambiente ────────────────────────────────────────────────

/** O mínimo que um `patrimonio_recinto` precisa ter para entrar num espaço. */
export type RecintoParaElegibilidade = {
  nome: string | null
  sede: string | null
  descricao: string | null
}

/**
 * O que falta no cadastro do ambiente para ele poder compor um espaço cedível.
 * Vazio = elegível.
 *
 * A metragem NÃO entra: a lotação é do espaço, não do ambiente — teatro + hall
 * não comporta a soma das partes, e a mesma sala muda de lotação conforme o
 * arranjo. A descrição entra porque é o único texto que diz o que é o lugar, e
 * ele vai para o termo de cessão.
 *
 * A MESMA função roda no formulário (para apagar a opção e dizer o porquê) e na
 * action (para recusar), como nas travas das perguntas de assembleia: a tela
 * nunca promete o que o servidor recusa.
 */
export function faltaNoRecinto(r: RecintoParaElegibilidade): string[] {
  const falta: string[] = []
  if (!r.nome?.trim()) falta.push("nome")
  if (!r.sede?.trim()) falta.push("sede")
  if (!r.descricao?.trim()) falta.push("descrição")
  return falta
}

export const recintoElegivel = (r: RecintoParaElegibilidade) =>
  faltaNoRecinto(r).length === 0

/** "falta descrição" / "faltam sede e descrição" — para a tela explicar. */
export function motivoInelegivel(falta: string[]): string {
  if (falta.length === 0) return ""
  if (falta.length === 1) return `falta ${falta[0]}`
  const ultimo = falta[falta.length - 1]
  return `faltam ${falta.slice(0, -1).join(", ")} e ${ultimo}`
}

// ── Horários ─────────────────────────────────────────────────────────────────

/** 'HH:MM:SS' → '14:30'; vazio vira null. */
export function horaCurta(hora: string | null | undefined): string | null {
  const h = (hora ?? "").trim()
  return /^\d{2}:\d{2}/.test(h) ? h.slice(0, 5) : null
}

/** '14:30' → '14:30:00', para o banco. Inválido vira null. */
export function horaCompleta(hora: string | null | undefined): string | null {
  const h = (hora ?? "").trim()
  if (/^\d{2}:\d{2}$/.test(h)) return `${h}:00`
  if (/^\d{2}:\d{2}:\d{2}$/.test(h)) return h
  return null
}

const minutos = (hora: string) => {
  const [h, m] = hora.split(":").map(Number)
  return h * 60 + m
}

export type Janela = {
  dia_semana: number
  hora_inicio: string
  hora_termino: string
  modo: ModoJanela
  slot_minutos: number | null
  rotulo: string | null
}

export type Bloco = { inicio: string; termino: string }

/**
 * Os horários que uma janela oferece. No modo 'slots', os blocos fixos; no
 * 'livre', a faixa inteira como um bloco só (o formulário da fase 2 deixa a
 * pessoa escolher dentro dela). O resto de faixa menor que um slot é
 * descartado — meia hora sobrando não é um bloco de duas.
 */
export function blocosDaJanela(j: Janela): Bloco[] {
  const inicio = horaCurta(j.hora_inicio)
  const termino = horaCurta(j.hora_termino)
  if (!inicio || !termino || minutos(termino) <= minutos(inicio)) return []
  if (j.modo === "livre" || !j.slot_minutos || j.slot_minutos <= 0) {
    return [{ inicio, termino }]
  }
  const blocos: Bloco[] = []
  const fim = minutos(termino)
  for (let m = minutos(inicio); m + j.slot_minutos <= fim; m += j.slot_minutos) {
    blocos.push({ inicio: doisPontos(m), termino: doisPontos(m + j.slot_minutos) })
  }
  return blocos
}

function doisPontos(total: number): string {
  const h = Math.floor(total / 60)
  const m = total % 60
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}

/** Duas janelas do mesmo dia que se sobrepõem — o cadastro recusa. */
export function janelasSobrepostas(a: Janela, b: Janela): boolean {
  if (a.dia_semana !== b.dia_semana) return false
  const ai = horaCurta(a.hora_inicio)
  const at = horaCurta(a.hora_termino)
  const bi = horaCurta(b.hora_inicio)
  const bt = horaCurta(b.hora_termino)
  if (!ai || !at || !bi || !bt) return false
  return minutos(ai) < minutos(bt) && minutos(bi) < minutos(at)
}

/** Bloqueio sem término vale para sempre — é o "prazo indefinido". */
export function bloqueioVigente(
  b: { inicio: string | null; termino: string | null; encerrado_em: string | null },
  agora = Date.now()
): boolean {
  if (b.encerrado_em) return false
  const i = b.inicio ? new Date(b.inicio).getTime() : null
  const t = b.termino ? new Date(b.termino).getTime() : null
  if (i !== null && agora < i) return false
  if (t !== null && agora > t) return false
  return true
}

// ── Exigências de segurança ──────────────────────────────────────────────────

export const GATILHOS = [
  {
    chave: "publico",
    rotulo: "Quantidade de pessoas",
    pergunta: null,
  },
  {
    chave: "infantil",
    rotulo: "Público infantil",
    pergunta: "Haverá presença relevante de crianças?",
  },
  {
    chave: "idoso",
    rotulo: "Público idoso",
    pergunta: "Haverá presença relevante de pessoas idosas?",
  },
  {
    chave: "mobilidade",
    rotulo: "Mobilidade reduzida",
    pergunta: "Haverá presença relevante de pessoas com mobilidade reduzida?",
  },
  {
    chave: "bebida",
    rotulo: "Bebida alcoólica",
    pergunta: "Haverá consumo de bebida alcoólica?",
  },
  {
    chave: "estresse",
    rotulo: "Possível estresse emocional",
    pergunta:
      "É um evento de possível estresse emocional (assembleia, debate, negociação)?",
  },
] as const
export type Gatilho = (typeof GATILHOS)[number]["chave"]

export const rotuloGatilho = (g: string | null | undefined) =>
  GATILHOS.find((x) => x.chave === g)?.rotulo ?? "—"
export const gatilhoValido = (g: string): g is Gatilho =>
  GATILHOS.some((x) => x.chave === g)

/** Os gatilhos que são pergunta de sim ou não no formulário. */
export const GATILHOS_CONDICAO = GATILHOS.filter((g) => g.pergunta !== null)

export type RegraExigencia = {
  gatilho: Gatilho
  /** Faixa de público — só no gatilho 'publico'. `ate` nulo = sem teto. */
  de: number | null
  ate: number | null
  bombeiros: number
  segurancas: number
  observacao: string | null
}

export type RespostasEvento = {
  publicoEstimado: number | null
  infantil: boolean
  idoso: boolean
  mobilidade: boolean
  bebida: boolean
  estresse: boolean
}

export type ExigenciaCalculada = {
  gatilho: Gatilho
  motivo: string
  bombeiros: number
  segurancas: number
  observacao: string | null
}

const RESPOSTA_DO_GATILHO: Record<
  Exclude<Gatilho, "publico">,
  keyof Omit<RespostasEvento, "publicoEstimado">
> = {
  infantil: "infantil",
  idoso: "idoso",
  mobilidade: "mobilidade",
  bebida: "bebida",
  estresse: "estresse",
}

/**
 * As exigências que aquele pedido dispara, com a conta à vista.
 *
 * A faixa de público e as condições do evento SOMAM: 200 pessoas pedem dois
 * bombeiros, e bebida alcoólica pede mais um — são três, não dois. O
 * solicitante vê cada linha e de onde ela veio, porque exigência sem
 * explicação vira discussão no dia do evento.
 *
 * Do gatilho 'publico' vale UMA faixa só, a que contém o número estimado.
 */
export function calcularExigencias(
  regras: RegraExigencia[],
  respostas: RespostasEvento
): ExigenciaCalculada[] {
  const saida: ExigenciaCalculada[] = []

  const publico = respostas.publicoEstimado
  if (publico !== null && publico > 0) {
    const faixa = regras
      .filter((r) => r.gatilho === "publico")
      .find(
        (r) => publico >= (r.de ?? 0) && (r.ate === null || publico <= r.ate)
      )
    if (faixa) {
      saida.push({
        gatilho: "publico",
        motivo:
          faixa.ate === null
            ? `Público a partir de ${faixa.de} pessoas`
            : `Público de ${faixa.de} a ${faixa.ate} pessoas`,
        bombeiros: faixa.bombeiros,
        segurancas: faixa.segurancas,
        observacao: faixa.observacao,
      })
    }
  }

  for (const g of GATILHOS_CONDICAO) {
    const chave = g.chave as Exclude<Gatilho, "publico">
    if (!respostas[RESPOSTA_DO_GATILHO[chave]]) continue
    const regra = regras.find((r) => r.gatilho === chave)
    if (!regra) continue
    if (regra.bombeiros === 0 && regra.segurancas === 0 && !regra.observacao) {
      continue
    }
    saida.push({
      gatilho: chave,
      motivo: g.rotulo,
      bombeiros: regra.bombeiros,
      segurancas: regra.segurancas,
      observacao: regra.observacao,
    })
  }

  return saida
}

export function totalExigencias(lista: ExigenciaCalculada[]): {
  bombeiros: number
  segurancas: number
} {
  return {
    bombeiros: lista.reduce((s, e) => s + e.bombeiros, 0),
    segurancas: lista.reduce((s, e) => s + e.segurancas, 0),
  }
}

// ── Disponibilidade ──────────────────────────────────────────────────────────

export type Periodo = { inicio: number; termino: number }

/** Dois períodos que se tocam. Fim exato = início do outro NÃO é choque. */
export function periodosChocam(a: Periodo, b: Periodo): boolean {
  return a.inicio < b.termino && b.inicio < a.termino
}

/**
 * Um dia é oferecido quando há janela naquele dia da semana. Devolve os blocos
 * do dia já descontados os bloqueios e as cessões que ocupam o espaço.
 *
 * O fuso é fixo em -03:00, como no resto do sistema: a conta não pode mudar
 * conforme o relógio de quem abre a tela.
 */
export function blocosDoDia(
  diaISO: string,
  janelas: Janela[],
  ocupados: Periodo[]
): { inicio: string; termino: string; livre: boolean }[] {
  // Meio-dia em São Paulo cai no MESMO dia em UTC (15:00), então getUTCDay()
  // dá o dia da semana certo sem depender do fuso de quem roda o código.
  const d = new Date(`${diaISO}T12:00:00-03:00`)
  if (Number.isNaN(d.getTime())) return []
  const doDia = janelas.filter((j) => j.dia_semana === d.getUTCDay())
  const blocos = doDia.flatMap((j) => blocosDaJanela(j))
  return blocos.map((b) => {
    const periodo = {
      inicio: new Date(`${diaISO}T${b.inicio}:00-03:00`).getTime(),
      termino: new Date(`${diaISO}T${b.termino}:00-03:00`).getTime(),
    }
    return {
      ...b,
      livre: !ocupados.some((o) => periodosChocam(periodo, o)),
    }
  })
}

/** Endereço público do espaço: "Área Gourmet" → "area-gourmet". */
export function slugDoNome(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
}
