/**
 * Hospedagem por DEMANDA GARANTIDA — regras PURAS.
 *
 * Nada aqui toca o banco: recebe a ocupação já lida e devolve a decisão. É o
 * que permite testar a alocação isoladamente (cenário por cenário) e usar o
 * mesmo texto das regras no portal e no painel.
 *
 * Datas: "noite" e check-in/check-out são AAAA-MM-DD. Horários valem no fuso
 * de São Paulo (UTC−3, sem horário de verão desde 2019).
 *
 * Banco: src/lib/db/hospedagem-garantida.ts
 * SQL:   supabase/hospedagem-demanda-garantida.sql
 */

export type Sexo = "Masculino" | "Feminino"

export function sexoValido(sexo: string | null | undefined): sexo is Sexo {
  return sexo === "Masculino" || sexo === "Feminino"
}

export type ModalidadeConvenio = "uso" | "garantida"

export const MODALIDADES_CONVENIO: {
  chave: ModalidadeConvenio
  rotulo: string
  descricao: string
}[] = [
  {
    chave: "uso",
    rotulo: "Pagamento por uso",
    descricao:
      "O cupom é uma autorização. O hotel monta a reserva juntando os cupons.",
  },
  {
    chave: "garantida",
    rotulo: "Demanda garantida",
    descricao:
      "O hotel dedica quartos ao sindicato. O pedido já é a reserva, com o quarto escolhido pelo Confluir.",
  },
]

export type RegraDistribuicao = "lotacao" | "distribuicao"

export const REGRAS_DISTRIBUICAO: {
  chave: RegraDistribuicao
  rotulo: string
  descricao: string
}[] = [
  {
    chave: "lotacao",
    rotulo: "Lotação por quarto",
    descricao: "Completa um quarto antes de abrir o próximo.",
  },
  {
    chave: "distribuicao",
    rotulo: "Distribuição pelos quartos",
    descricao:
      "Uma pessoa por quarto enquanto houver quarto vazio. Depois começa a dividir.",
  },
]

export const DIAS_SEMANA = [
  "Domingo",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
] as const

export type ConfigGarantida = {
  /** Quartos dedicados quando o dia da semana não tem valor próprio. */
  quartosPadrao: number
  /** 7 posições, domingo primeiro; null na posição = usa o padrão. */
  quartosPorDiaSemana: (number | null)[] | null
  vagasPorQuarto: number
  regra: RegraDistribuicao
  travaUltimoQuarto: boolean
  travaDiasAntes: number
  /** "HH:MM" */
  travaHora: string
  maxNoites: number
  /** "HH:MM" */
  horarioCheckin: string
  cancelamentoHoras: number
  esperaPrazoHoras: number
}

// ── Datas ────────────────────────────────────────────────────────────────────

function paraUTC(data: string): Date {
  const [a, m, d] = data.split("-").map(Number)
  return new Date(Date.UTC(a, m - 1, d))
}

function deUTC(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export function somarDias(data: string, dias: number): string {
  const d = paraUTC(data)
  d.setUTCDate(d.getUTCDate() + dias)
  return deUTC(d)
}

export function somarMeses(data: string, meses: number): string {
  const d = paraUTC(data)
  d.setUTCMonth(d.getUTCMonth() + meses)
  return deUTC(d)
}

/** Noites da estadia: do check-in (inclusive) ao check-out (exclusive). */
export function noitesDaEstadia(checkIn: string, checkOut: string): string[] {
  const noites: string[] = []
  for (let n = checkIn; n < checkOut && noites.length < 400; n = somarDias(n, 1)) {
    noites.push(n)
  }
  return noites
}

/** 0 = domingo. */
export function diaDaSemana(data: string): number {
  return paraUTC(data).getUTCDay()
}

/** Instante de um dia e hora ("HH:MM") no fuso de São Paulo. */
export function instanteSP(data: string, hora: string): Date {
  const hhmm = /^\d{2}:\d{2}/.exec(hora)?.[0] ?? "00:00"
  return new Date(`${data}T${hhmm}:00-03:00`)
}

/** Data de hoje (AAAA-MM-DD) em São Paulo. */
export function hojeEmSP(agora = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(
    agora
  )
}

export function dataBR(data: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(data)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : data
}

export function dataHoraBR(instante: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(instante)
}

// ── Quartos e trava ──────────────────────────────────────────────────────────

export function quartosNaNoite(cfg: ConfigGarantida, noite: string): number {
  const doDia = cfg.quartosPorDiaSemana?.[diaDaSemana(noite)]
  const n = doDia ?? cfg.quartosPadrao
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}

/** Até quando o último quarto de uma noite fica guardado para o outro sexo. */
export function prazoDaTrava(cfg: ConfigGarantida, noite: string): Date {
  return instanteSP(somarDias(noite, -cfg.travaDiasAntes), cfg.travaHora)
}

/** Até quando o próprio filiado pode cancelar. */
export function prazoCancelamento(cfg: ConfigGarantida, checkIn: string): Date {
  return new Date(
    instanteSP(checkIn, cfg.horarioCheckin).getTime() -
      cfg.cancelamentoHoras * 3_600_000
  )
}

// ── Alocação ─────────────────────────────────────────────────────────────────

/** Uma pessoa ocupando um quarto numa noite. */
export type OcupanteNoite = { quarto: number; sexo: Sexo }

/** Ocupação do hotel: noite → ocupantes daquela noite. */
export type Ocupacao = Map<string, OcupanteNoite[]>

type EstadoQuarto = { ocupantes: number; sexo: Sexo | null }

function estadoDaNoite(ocupantes: OcupanteNoite[], quartos: number): EstadoQuarto[] {
  const estados: EstadoQuarto[] = Array.from({ length: quartos }, () => ({
    ocupantes: 0,
    sexo: null,
  }))
  for (const o of ocupantes) {
    const e = estados[o.quarto - 1]
    if (!e) continue // quarto além do dedicado nesta noite (configuração mudou)
    e.ocupantes++
    e.sexo = o.sexo
  }
  return estados
}

export type ResultadoAlocacao =
  | { ok: true; quarto: number }
  | { ok: false; motivo: "sem_vaga" }
  | { ok: false; motivo: "trava"; liberaEm: Date }

/**
 * Escolhe o quarto de uma estadia: o MESMO quarto em todas as noites, com vaga
 * e sem pessoa do outro sexo. Entre os possíveis, a regra de distribuição
 * decide. A trava do último quarto impede que um sexo ocupe o último quarto
 * vazio da noite, quando todos os outros já são desse sexo, antes do prazo.
 *
 * `quartoFixo` e `ignorarTrava` servem ao remanejamento feito pela equipe.
 */
export function alocarEstadia(
  cfg: ConfigGarantida,
  ocupacao: Ocupacao,
  pedido: { sexo: Sexo; noites: string[] },
  agora: Date,
  opcoes: { quartoFixo?: number; ignorarTrava?: boolean } = {}
): ResultadoAlocacao {
  if (pedido.noites.length === 0 || cfg.vagasPorQuarto < 1) {
    return { ok: false, motivo: "sem_vaga" }
  }
  const quartosComuns = Math.min(...pedido.noites.map((n) => quartosNaNoite(cfg, n)))
  if (quartosComuns < 1) return { ok: false, motivo: "sem_vaga" }

  const estados = new Map(
    pedido.noites.map((n) => [
      n,
      estadoDaNoite(ocupacao.get(n) ?? [], quartosNaNoite(cfg, n)),
    ])
  )

  type Candidato = {
    quarto: number
    noitesVazias: number
    noitesMesmoSexo: number
    ocupantes: number
  }
  const validos: Candidato[] = []
  let menorLiberacao: Date | null = null

  const quartos = opcoes.quartoFixo
    ? [opcoes.quartoFixo].filter((q) => q >= 1 && q <= quartosComuns)
    : Array.from({ length: quartosComuns }, (_, i) => i + 1)

  for (const quarto of quartos) {
    let possivel = true
    let travadoAte: Date | null = null
    const c: Candidato = { quarto, noitesVazias: 0, noitesMesmoSexo: 0, ocupantes: 0 }

    for (const noite of pedido.noites) {
      const daNoite = estados.get(noite)!
      const e = daNoite[quarto - 1]
      if (e.ocupantes >= cfg.vagasPorQuarto || (e.sexo && e.sexo !== pedido.sexo)) {
        possivel = false
        break
      }
      if (e.ocupantes === 0) {
        c.noitesVazias++
        if (cfg.travaUltimoQuarto && !opcoes.ignorarTrava) {
          const vazios = daNoite.filter((q) => q.ocupantes === 0).length
          const ocupados = daNoite.filter((q) => q.ocupantes > 0)
          const todosDoMesmoSexo =
            ocupados.length > 0 && ocupados.every((q) => q.sexo === pedido.sexo)
          if (vazios === 1 && todosDoMesmoSexo) {
            const prazo = prazoDaTrava(cfg, noite)
            if (agora < prazo && (!travadoAte || prazo > travadoAte)) {
              travadoAte = prazo
            }
          }
        }
      } else {
        c.noitesMesmoSexo++
        c.ocupantes += e.ocupantes
      }
    }

    if (!possivel) continue
    if (travadoAte) {
      if (!menorLiberacao || travadoAte < menorLiberacao) menorLiberacao = travadoAte
      continue
    }
    validos.push(c)
  }

  if (validos.length > 0) {
    validos.sort((a, b) =>
      cfg.regra === "lotacao"
        ? b.noitesMesmoSexo - a.noitesMesmoSexo ||
          b.ocupantes - a.ocupantes ||
          a.quarto - b.quarto
        : b.noitesVazias - a.noitesVazias ||
          a.ocupantes - b.ocupantes ||
          a.quarto - b.quarto
    )
    return { ok: true, quarto: validos[0].quarto }
  }
  if (menorLiberacao) return { ok: false, motivo: "trava", liberaEm: menorLiberacao }
  return { ok: false, motivo: "sem_vaga" }
}

/** Frases das regras de um hotel de demanda garantida, para o associado. */
export function descreverRegrasGarantida(cfg: ConfigGarantida): string[] {
  const frases = [
    "O pedido já é a reserva: o quarto é definido na hora e o hotel é obrigado a hospedar quem tem reserva.",
    `Estadia de até ${cfg.maxNoites} noite${cfg.maxNoites === 1 ? "" : "s"}, sempre no mesmo quarto.`,
    "Os quartos são compartilhados apenas por pessoas do mesmo sexo, conforme o seu cadastro.",
    "Na chegada, apresente o QR Code da reserva e um documento oficial com foto.",
  ]
  if (cfg.cancelamentoHoras > 0) {
    frases.push(
      `Você pode cancelar pelo portal até ${cfg.cancelamentoHoras} hora${cfg.cancelamentoHoras === 1 ? "" : "s"} antes do check-in (${cfg.horarioCheckin.slice(0, 5)}). Depois disso, só o sindicato cancela.`
    )
  }
  frases.push(
    `Sem vaga, você pode entrar na lista de espera. Quando surgir vaga, ela fica guardada por ${cfg.esperaPrazoHoras} hora${cfg.esperaPrazoHoras === 1 ? "" : "s"} para você confirmar.`
  )
  return frases
}

// ── Não comparecimento ───────────────────────────────────────────────────────

export type PenalidadeNaoComparecimento = "consumir_periodo" | "suspender" | "desabilitar"

export const PENALIDADES_NAO_COMPARECIMENTO: {
  chave: PenalidadeNaoComparecimento
  rotulo: string
  descricao: string
}[] = [
  {
    chave: "consumir_periodo",
    rotulo: "Consumir a hospedagem do período",
    descricao:
      "A falta conta como hospedagem usada: não pode reservar outra estadia com check-in no mesmo mês (ou ano) da falta.",
  },
  {
    chave: "suspender",
    rotulo: "Suspender por um tempo",
    descricao: "Fica sem reservar por alguns dias, contados da data da falta.",
  },
  {
    chave: "desabilitar",
    rotulo: "Desabilitar o direito",
    descricao: "Perde o direito à hospedagem até a equipe do sindicato liberar.",
  },
]

export type RegraNaoComparecimento = {
  ativa: boolean
  /** Faltas que disparam a penalidade (1 = já na primeira). */
  quantidade: number
  janelaMeses: number
  penalidade: PenalidadeNaoComparecimento
  periodo: "mes" | "ano"
  suspensaoDias: number
}

export const REGRA_NAO_COMPARECIMENTO_PADRAO: RegraNaoComparecimento = {
  ativa: false,
  quantidade: 1,
  janelaMeses: 12,
  penalidade: "suspender",
  periodo: "mes",
  suspensaoDias: 30,
}

/** A reserva vira não comparecimento no fim do dia do check-in (São Paulo). */
export function momentoNaoComparecimento(checkIn: string): Date {
  return instanteSP(somarDias(checkIn, 1), "00:00")
}

export type ReservaDoHistorico = {
  checkIn: string
  presenca: boolean
  cancelada: boolean
  abonada: boolean
}

/** Check-ins das faltas (reserva não cancelada, sem entrada e sem abono). */
export function faltasDoHistorico(
  historico: ReservaDoHistorico[],
  agora: Date,
  liberadoEm: Date | null = null
): string[] {
  return historico
    .filter(
      (r) =>
        !r.cancelada &&
        !r.presenca &&
        !r.abonada &&
        agora >= momentoNaoComparecimento(r.checkIn) &&
        (!liberadoEm || momentoNaoComparecimento(r.checkIn) > liberadoEm)
    )
    .map((r) => r.checkIn)
    .sort()
}

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
]

function rotuloPeriodo(data: string, periodo: "mes" | "ano"): string {
  const [ano, mes] = data.split("-")
  return periodo === "ano" ? ano : `${MESES[Number(mes) - 1]} de ${ano}`
}

/** A pessoa pode reservar com este check-in, diante das faltas? */
export function avaliarNaoComparecimento(
  regra: RegraNaoComparecimento,
  historico: ReservaDoHistorico[],
  liberadoEm: Date | null,
  checkInPedido: string,
  agora: Date
): { ok: true } | { ok: false; motivo: string } {
  if (!regra.ativa) return { ok: true }

  const inicioJanela = somarMeses(hojeEmSP(agora), -regra.janelaMeses)
  const faltas = faltasDoHistorico(historico, agora, liberadoEm).filter(
    (f) => f >= inicioJanela
  )
  if (faltas.length < regra.quantidade) return { ok: true }

  const resumo =
    regra.quantidade === 1
      ? "por não comparecer a uma reserva"
      : `por ${faltas.length} reservas sem comparecimento nos últimos ${regra.janelaMeses} meses`

  if (regra.penalidade === "desabilitar") {
    return {
      ok: false,
      motivo: `O seu direito à hospedagem foi desabilitado ${resumo}. Para voltar a reservar, fale com o sindicato.`,
    }
  }

  if (regra.penalidade === "suspender") {
    const ultima = faltas[faltas.length - 1]
    const ate = somarDias(ultima, regra.suspensaoDias)
    if (hojeEmSP(agora) < ate) {
      return {
        ok: false,
        motivo: `Reservas suspensas até ${dataBR(ate)} ${resumo}.`,
      }
    }
    return { ok: true }
  }

  // consumir_periodo: a partir da falta que atingiu o limite, cada falta
  // consome o período (mês ou ano) em que caiu.
  const periodoDe = (d: string) => (regra.periodo === "ano" ? d.slice(0, 4) : d.slice(0, 7))
  const consumidos = faltas.slice(regra.quantidade - 1).map(periodoDe)
  if (consumidos.includes(periodoDe(checkInPedido))) {
    return {
      ok: false,
      motivo: `A hospedagem de ${rotuloPeriodo(checkInPedido, regra.periodo)} já foi consumida ${resumo}. Escolha um check-in em outro ${regra.periodo === "ano" ? "ano" : "mês"}.`,
    }
  }
  return { ok: true }
}

/** A regra de não comparecimento, em frase para o associado. */
export function descreverRegraNaoComparecimento(regra: RegraNaoComparecimento): string | null {
  if (!regra.ativa) return null
  const gatilho =
    regra.quantidade === 1
      ? "Não comparecer a uma reserva, sem cancelar,"
      : `${regra.quantidade} reservas sem comparecimento, sem cancelar, em ${regra.janelaMeses} meses`
  const efeito =
    regra.penalidade === "desabilitar"
      ? "desabilita o direito à hospedagem até o sindicato liberar"
      : regra.penalidade === "suspender"
        ? `suspende novas reservas por ${regra.suspensaoDias} dias`
        : `consome a hospedagem do ${regra.periodo === "ano" ? "ano" : "mês"} da falta`
  return `${gatilho} ${efeito}.`
}
