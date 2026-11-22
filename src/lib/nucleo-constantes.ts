import { somarDias } from "./deliberacoes-constantes"

/**
 * Constantes do núcleo de ferramentas (Demandas · Tarefas · Anomalias) seguras
 * para o client — sem `server-only`. Ver [[confluir-ferramentas-administrativas]].
 */

/** Situação de uma Demanda (kanban herdado do Bubble). */
export const SITUACOES_DEMANDA = ["A fazer", "Fazendo", "Feito"] as const
export type SituacaoDemanda = (typeof SITUACOES_DEMANDA)[number]

/** Situação derivada de uma Tarefa (não é coluna — vem de `concluido` + prazo). */
export type SituacaoTarefa = "concluida" | "atrasada" | "pendente"

export const ROTULOS_SITUACAO_TAREFA: Record<SituacaoTarefa, string> = {
  concluida: "Concluída",
  atrasada: "Atrasada",
  pendente: "Pendente",
}

export function derivarSituacaoTarefa(
  concluido: boolean | null,
  prazo: string | null,
  hojeISO: string
): SituacaoTarefa {
  if (concluido === true) return "concluida"
  if (prazo && prazo < hojeISO) return "atrasada"
  return "pendente"
}

/** Tipo do pai de uma Tarefa (polimórfico e opcional). */
export const TIPOS_PAI_TAREFA = ["demanda", "projeto", "anomalia"] as const
export type TipoPaiTarefa = (typeof TIPOS_PAI_TAREFA)[number]

export const ROTULOS_PAI_TAREFA: Record<TipoPaiTarefa, string> = {
  demanda: "Demanda",
  projeto: "Projeto",
  anomalia: "Anomalia",
}

/** Etapas do tratamento de uma Anomalia (RCA), derivadas dos flags. */
export type EstagioAnomalia =
  | "registrada"
  | "investigada"
  | "tratada"
  | "verificada"

export const ROTULOS_ESTAGIO_ANOMALIA: Record<EstagioAnomalia, string> = {
  registrada: "Registrada",
  investigada: "Investigada",
  tratada: "Tratada",
  verificada: "Eficácia verificada",
}

export function derivarEstagioAnomalia(a: {
  anomalia_investigada?: boolean | null
  anomalia_tratada?: boolean | null
  eficacia_verificada?: boolean | null
}): EstagioAnomalia {
  if (a.eficacia_verificada) return "verificada"
  if (a.anomalia_tratada) return "tratada"
  if (a.anomalia_investigada) return "investigada"
  return "registrada"
}

/** Texto do aviso antes de finalizar: as tarefas abertas serão concluídas junto. */
export function avisoTarefasAoFinalizar(pendentes: number, de: "demanda" | "projeto"): { titulo: string; descricao: string; confirmar: string } {
  return {
    titulo: de === "projeto" ? "Finalizar o projeto?" : "Finalizar a demanda?",
    descricao: `${pendentes === 1 ? "A tarefa ainda aberta" : `As ${pendentes} tarefas ainda abertas`} ${de === "projeto" ? "deste projeto" : "desta demanda"} ${pendentes === 1 ? "será finalizada" : "serão finalizadas"} junto, com a data de hoje. Reabrir depois não as reabre.`,
    confirmar: "Finalizar",
  }
}

/** Prioridade da tarefa (coluna `prioridade`; padrão "media"). */
export const PRIORIDADES_TAREFA = ["alta", "media", "baixa"] as const
export type PrioridadeTarefa = (typeof PRIORIDADES_TAREFA)[number]

export const ROTULOS_PRIORIDADE_TAREFA: Record<PrioridadeTarefa, string> = {
  alta: "Alta",
  media: "Média",
  baixa: "Baixa",
}

export function ehPrioridadeTarefa(v: unknown): v is PrioridadeTarefa {
  return typeof v === "string" && (PRIORIDADES_TAREFA as readonly string[]).includes(v)
}

/** Ordem das listas de tarefas. */
export const ORDENS_TAREFAS = ["prazo", "prioridade"] as const
export type OrdemTarefas = (typeof ORDENS_TAREFAS)[number]

/**
 * Ordena sem mexer na lista recebida. Prazo: o mais próximo primeiro, sem
 * prazo no fim. Prioridade: alta, média, baixa e, dentro do nível, o prazo.
 * Em qualquer ordem, as concluídas vão para o fim.
 */
export function ordenarTarefas<T extends { prazo: string | null; prioridade: PrioridadeTarefa; concluido: boolean; titulo: string | null }>(
  tarefas: readonly T[],
  ordem: OrdemTarefas
): T[] {
  const prazo = (a: T, b: T) => (a.prazo ?? "9999-99-99").localeCompare(b.prazo ?? "9999-99-99")
  const nivel = (t: T) => PRIORIDADES_TAREFA.indexOf(t.prioridade)
  return [...tarefas].sort(
    (a, b) =>
      Number(a.concluido) - Number(b.concluido) ||
      (ordem === "prioridade" ? nivel(a) - nivel(b) : 0) ||
      prazo(a, b) ||
      (a.titulo ?? "").localeCompare(b.titulo ?? "", "pt-BR")
  )
}

/**
 * Atraso que ainda gera aviso: tarefa vencida há mais tempo que isso fica só
 * na caixa de entrada e no lembrete diário. Evita uma enxurrada de avisos das
 * tarefas antigas no primeiro dia e de quem já sabe que está atrasado.
 */
export const DIAS_AVISO_ATRASO_TAREFA = 7

/**
 * Que aviso de prazo a tarefa pede hoje: "vespera" quando vence amanhã,
 * "atraso" quando venceu nos últimos DIAS_AVISO_ATRASO_TAREFA dias; senão
 * nenhum (sem prazo, concluída, longe ou atrasada há muito).
 */
export function lembreteDePrazo(
  t: { prazo: string | null; concluido: boolean },
  hojeISO: string
): "vespera" | "atraso" | null {
  if (t.concluido || !t.prazo) return null
  if (t.prazo === somarDias(hojeISO, 1)) return "vespera"
  if (t.prazo < hojeISO && t.prazo >= somarDias(hojeISO, -DIAS_AVISO_ATRASO_TAREFA)) return "atraso"
  return null
}

/** De quanto em quanto tempo a tarefa se repete (nulo = não repete). */
export const RECORRENCIAS_TAREFA = ["semanal", "mensal", "trimestral", "semestral", "anual"] as const
export type RecorrenciaTarefa = (typeof RECORRENCIAS_TAREFA)[number]

export const ROTULOS_RECORRENCIA_TAREFA: Record<RecorrenciaTarefa, string> = {
  semanal: "Toda semana",
  mensal: "Todo mês",
  trimestral: "A cada 3 meses",
  semestral: "A cada 6 meses",
  anual: "Todo ano",
}

export function ehRecorrenciaTarefa(v: unknown): v is RecorrenciaTarefa {
  return typeof v === "string" && (RECORRENCIAS_TAREFA as readonly string[]).includes(v)
}

const MESES_RECORRENCIA: Record<Exclude<RecorrenciaTarefa, "semanal">, number> = {
  mensal: 1,
  trimestral: 3,
  semestral: 6,
  anual: 12,
}

/**
 * O prazo da próxima tarefa de uma recorrente: o prazo atual avançado de um
 * período. Nos meses, mantém o dia; se o mês de destino não o tem (31 em
 * fevereiro), vai ao último dia — e prazo no último dia do mês continua no
 * último dia (30/04 → 31/05), para "todo fim de mês" não escorregar.
 */
export function proximoPrazoRecorrente(prazoISO: string, recorrencia: RecorrenciaTarefa): string {
  if (recorrencia === "semanal") return somarDias(prazoISO, 7)
  const [a, m, d] = prazoISO.split("-").map(Number)
  const ultimoDia = (ano: number, mes: number) => new Date(Date.UTC(ano, mes, 0)).getUTCDate()
  const fimDoMes = d === ultimoDia(a, m)
  const total = a * 12 + (m - 1) + MESES_RECORRENCIA[recorrencia]
  const ano = Math.floor(total / 12)
  const mes = (total % 12) + 1
  const dia = fimDoMes ? ultimoDia(ano, mes) : Math.min(d, ultimoDia(ano, mes))
  return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`
}

// ── Quadro, carga e calendário (Onda 1, 19/11/2026) ─────────────────────────

/** Colunas do quadro de tarefas (A fazer · Em andamento · Feito). */
export const COLUNAS_QUADRO_TAREFA = ["a_fazer", "em_andamento", "feito"] as const
export type ColunaQuadroTarefa = (typeof COLUNAS_QUADRO_TAREFA)[number]
export const ROTULOS_COLUNA_TAREFA: Record<ColunaQuadroTarefa, string> = {
  a_fazer: "A fazer",
  em_andamento: "Em andamento",
  feito: "Feito",
}
export function ehColunaTarefa(v: unknown): v is ColunaQuadroTarefa {
  return typeof v === "string" && (COLUNAS_QUADRO_TAREFA as readonly string[]).includes(v)
}
export function colunaDaTarefa(t: { concluido: boolean; emAndamento: boolean }): ColunaQuadroTarefa {
  return t.concluido ? "feito" : t.emAndamento ? "em_andamento" : "a_fazer"
}
/** Concluídas há até tantos dias aparecem na coluna Feito do quadro. */
export const DIAS_FEITO_NO_QUADRO = 14

/** Segunda-feira da semana de uma data (AAAA-MM-DD). */
export function segundaDaSemana(dataISO: string): string {
  const d = new Date(`${dataISO}T12:00:00Z`)
  const dia = d.getUTCDay() // 0 = domingo
  return somarDias(dataISO, dia === 0 ? -6 : 1 - dia)
}

export type CargaPessoa = {
  id: string | null
  nome: string
  abertas: number
  atrasadas: number
  estaSemana: number
  proximaSemana: number
  semPrazo: number
}

/**
 * Carga de trabalho por pessoa: as tarefas ABERTAS de cada responsável, por
 * prazo — atrasadas, vencendo nesta semana (até domingo), na próxima e sem
 * prazo. Ordena de quem tem mais atrasadas para quem tem menos.
 */
export function cargaPorPessoa(
  tarefas: { demandadoId: string | null; demandadoNome: string | null; concluido: boolean; prazo: string | null }[],
  hojeISO: string
): CargaPessoa[] {
  const fimSemana = somarDias(segundaDaSemana(hojeISO), 6)
  const fimProxima = somarDias(fimSemana, 7)
  const mapa = new Map<string, CargaPessoa>()
  for (const t of tarefas) {
    if (t.concluido) continue
    const chave = t.demandadoId ?? ""
    const c = mapa.get(chave) ?? {
      id: t.demandadoId,
      nome: t.demandadoNome ?? "Sem responsável",
      abertas: 0,
      atrasadas: 0,
      estaSemana: 0,
      proximaSemana: 0,
      semPrazo: 0,
    }
    c.abertas++
    if (!t.prazo) c.semPrazo++
    else if (t.prazo < hojeISO) c.atrasadas++
    else if (t.prazo <= fimSemana) c.estaSemana++
    else if (t.prazo <= fimProxima) c.proximaSemana++
    mapa.set(chave, c)
  }
  return [...mapa.values()].sort(
    (a, b) => b.atrasadas - a.atrasadas || b.abertas - a.abertas || a.nome.localeCompare(b.nome, "pt-BR")
  )
}

/** As semanas (segunda a domingo) que cobrem o mês "AAAA-MM", para a grade do calendário. */
export function semanasDoMes(mes: string): string[][] {
  const primeiro = `${mes}-01`
  const [a, m] = mes.split("-").map(Number)
  const ultimo = `${mes}-${String(new Date(Date.UTC(a, m, 0)).getUTCDate()).padStart(2, "0")}`
  const semanas: string[][] = []
  for (let ini = segundaDaSemana(primeiro); ini <= ultimo; ini = somarDias(ini, 7)) {
    semanas.push(Array.from({ length: 7 }, (_, i) => somarDias(ini, i)))
  }
  return semanas
}

/** Mês anterior ou seguinte de "AAAA-MM". */
export function deslocarMes(mes: string, delta: number): string {
  const [a, m] = mes.split("-").map(Number)
  const total = a * 12 + (m - 1) + delta
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`
}

// ── Etiquetas e checklist (Onda 2, 22/11/2026) ──────────────────────────────

/** Paleta fixa das etiquetas (o banco guarda o nome da cor). */
export const CORES_ETIQUETA = ["cinza", "vermelho", "laranja", "amarelo", "verde", "azul", "roxo", "rosa"] as const
export type CorEtiqueta = (typeof CORES_ETIQUETA)[number]
export const ROTULOS_COR_ETIQUETA: Record<CorEtiqueta, string> = {
  cinza: "Cinza",
  vermelho: "Vermelho",
  laranja: "Laranja",
  amarelo: "Amarelo",
  verde: "Verde",
  azul: "Azul",
  roxo: "Roxo",
  rosa: "Rosa",
}
/** Classes do chip de cada cor (fundo claro, texto escuro; no escuro, o inverso). */
export const CLASSES_COR_ETIQUETA: Record<CorEtiqueta, string> = {
  cinza: "bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-100",
  vermelho: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  laranja: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200",
  amarelo: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  verde: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  azul: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  roxo: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200",
  rosa: "bg-pink-100 text-pink-800 dark:bg-pink-950 dark:text-pink-200",
}
export function ehCorEtiqueta(v: unknown): v is CorEtiqueta {
  return typeof v === "string" && (CORES_ETIQUETA as readonly string[]).includes(v)
}
/** Tamanho máximo do nome da etiqueta e do item do checklist. */
export const MAX_NOME_ETIQUETA = 30
export const MAX_ITEM_CHECKLIST = 200

/** Nome da etiqueta limpo: espaços colapsados e no máximo MAX_NOME_ETIQUETA caracteres. */
export function nomeDeEtiqueta(bruto: string): string {
  return bruto.replace(/\s+/g, " ").trim().slice(0, MAX_NOME_ETIQUETA)
}
