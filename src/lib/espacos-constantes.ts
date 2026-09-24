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
