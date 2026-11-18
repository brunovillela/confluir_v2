/**
 * Roteiro do /diaria no bot do Telegram (17/11/2026): o pedido de diária em
 * perguntas curtas, uma por vez — tipo, início, término, quantidade e motivo.
 * Puro (sem banco nem Telegram) para dar para testar: recebe o passo atual e a
 * resposta, devolve o próximo passo. Quem grava e manda as mensagens é
 * lib/telegram-diaria.ts, pela MESMA criarSolicitacaoDiaria do painel (Meu
 * perfil → Diárias): a diária entra na remessa em preparação da pessoa e, se
 * ela quiser, a remessa segue para avaliação.
 *
 * Diferente da viagem, a diária costuma ser pedida depois da atividade: as
 * datas podem estar no passado.
 *
 * Fica de fora (continua pelo painel): despesas extras com comprovante e
 * diária lançada para outra pessoa.
 */

export type PassoDiaria = "tipo" | "inicio" | "termino" | "quantidade" | "motivo" | "confirmar"

export type DadosDiariaBot = {
  tipoId?: string
  inicio?: string | null
  termino?: string | null
  quantidade?: number
  motivo?: string
}

export type EstadoDiariaBot = { passo: PassoDiaria; dados: DadosDiariaBot }

export type BotaoDiaria = { texto: string; dado: string }

export type PerguntaDiaria = { texto: string; botoes?: BotaoDiaria[][] }

export type TipoDiariaBot = { id: string; nome: string; valor: number }

export type ContextoDiaria = {
  /** "aaaa-mm-dd" de hoje em São Paulo. */
  hoje: string
  /** Tipos ativos, com valor e liberados para a pessoa (como no formulário). */
  tipos: TipoDiariaBot[]
  /** A remessa em preparação da pessoa, se houver: o que já está nela. */
  remessaAberta?: { codigo: string | null; valorTotal: number; devolvida?: boolean } | null
}

/** Resposta da pessoa: texto digitado ou o `dado` de um botão (sem o "dg:"). */
export type EntradaDiaria = { texto: string } | { botao: string }

export const PREFIXO_CALLBACK_DIARIA = "dg:"

const LIMITE_MOTIVO = 300
/** Teto de sanidade: mais que isso numa diária só é engano de digitação. */
const MAXIMO_DIARIAS = 60

const REAL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })

function escapar(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

// ── Datas e quantidade digitadas ───────────────────────────────────────────

function somarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

function dataValida(a: number, m: number, d: number): string | null {
  const dt = new Date(Date.UTC(a, m - 1, d))
  if (dt.getUTCFullYear() !== a || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null
  return dt.toISOString().slice(0, 10)
}

function diasEntre(de: string, ate: string): number {
  return Math.round((Date.parse(`${ate}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 86_400_000)
}

/**
 * "12/11", "12/11/2026", "12-11-26", "hoje", "ontem", "amanhã" →
 * "aaaa-mm-dd". Sem o ano, vale o ano que deixa a data mais perto de hoje —
 * em janeiro, "28/12" é o dezembro que passou; em dezembro, "05/01" é o
 * janeiro que vem.
 */
export function lerDataDiaria(bruto: string, hoje: string): string | null {
  const s = bruto.trim().toLowerCase()
  if (s === "hoje") return hoje
  if (s === "ontem") return somarDias(hoje, -1)
  if (s === "amanha" || s === "amanhã") return somarDias(hoje, 1)
  const m = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2}|\d{4}))?$/.exec(s)
  if (!m) return null
  const dia = Number(m[1])
  const mes = Number(m[2])
  if (m[3]) {
    const ano = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])
    return dataValida(ano, mes, dia)
  }
  const anoHoje = Number(hoje.slice(0, 4))
  const candidatas = [anoHoje - 1, anoHoje, anoHoje + 1]
    .map((a) => dataValida(a, mes, dia))
    .filter((x): x is string => x !== null)
  if (candidatas.length === 0) return null
  return candidatas.reduce((melhor, x) =>
    Math.abs(diasEntre(hoje, x)) < Math.abs(diasEntre(hoje, melhor)) ? x : melhor
  )
}

/** "2", "1,5", "1.5", "2 diárias" → número; null se não for quantidade. */
export function lerQuantidade(bruto: string): number | null {
  const m = /^(\d+(?:[.,]\d+)?)\s*(?:di[aá]rias?)?$/i.exec(bruto.trim())
  if (!m) return null
  const n = Number(m[1].replace(",", "."))
  return Number.isFinite(n) && n > 0 ? n : null
}

export function dataCurta(iso: string): string {
  const [a, m, d] = iso.split("-")
  return `${d}/${m}/${a}`
}

function quantidadeCurta(n: number): string {
  return String(n).replace(".", ",")
}

/** Sugestão de quantidade pelas datas: um dia de atividade, uma diária. */
export function quantidadeSugerida(d: DadosDiariaBot): number | null {
  if (!d.inicio) return null
  const dias = diasEntre(d.inicio, d.termino ?? d.inicio) + 1
  return dias >= 1 && dias <= MAXIMO_DIARIAS ? dias : null
}

// ── Perguntas ──────────────────────────────────────────────────────────────

function b(texto: string, dado: string): BotaoDiaria {
  return { texto, dado: `${PREFIXO_CALLBACK_DIARIA}${dado}` }
}

const CANCELAR = [b("Cancelar pedido", "x")]

export function perguntaDoPassoDiaria(estado: EstadoDiariaBot, ctx: ContextoDiaria): PerguntaDiaria {
  const d = estado.dados
  switch (estado.passo) {
    case "tipo":
      return {
        texto: "<b>Pedido de diária</b>\nQual o tipo de diária?",
        botoes: [
          ...ctx.tipos.map((t) => [b(`${t.nome} — ${REAL.format(t.valor)}`.slice(0, 60), `t:${t.id}`)]),
          CANCELAR,
        ],
      }
    case "inicio":
      return {
        texto: "Quando começou (ou começa) a atividade? <i>Ex.: 12/11, ontem, hoje</i>",
        botoes: [[b("Hoje", "i:h"), b("Ontem", "i:o")], [b("Sem data", "i:-")]],
      }
    case "termino":
      return {
        texto: `E quando terminou (ou termina)? <i>Início: ${dataCurta(d.inicio ?? ctx.hoje)}</i>`,
        botoes: [[b("No mesmo dia", "f:=")]],
      }
    case "quantidade": {
      const sugerida = quantidadeSugerida(d)
      return {
        texto: "Quantas diárias? <i>Ex.: 2 ou 1,5</i>",
        botoes: sugerida
          ? [[b(`${quantidadeCurta(sugerida)} diária${sugerida === 1 ? "" : "s"}`, `q:${sugerida}`)]]
          : undefined,
      }
    }
    case "motivo":
      return { texto: "Qual o motivo? <i>Ex.: viagem ao Rio de Janeiro com pernoite</i>" }
    case "confirmar":
      return {
        texto: [resumoDiariaBot(d, ctx), "", "Confere?"].join("\n"),
        // Remessa devolvida volta pelo Reenviar do painel, com o que foi corrigido.
        botoes: ctx.remessaAberta?.devolvida
          ? [[b("✅ Salvar na remessa", "ok")], CANCELAR]
          : [[b("✅ Salvar na remessa", "ok")], [b("📤 Salvar e enviar a remessa", "ok:e")], CANCELAR],
      }
  }
}

/** O pedido como a pessoa vai conferir antes de confirmar. */
export function resumoDiariaBot(d: DadosDiariaBot, ctx: ContextoDiaria): string {
  const tipo = ctx.tipos.find((t) => t.id === d.tipoId)
  const linhas = ["<b>Sua diária</b>"]
  if (tipo) linhas.push(`Tipo: ${escapar(tipo.nome)} (${REAL.format(tipo.valor)} cada)`)
  if (d.inicio) {
    linhas.push(
      d.termino && d.termino !== d.inicio
        ? `Período: ${dataCurta(d.inicio)} a ${dataCurta(d.termino)}`
        : `Data: ${dataCurta(d.inicio)}`
    )
  } else {
    linhas.push("Período: sem data")
  }
  if (d.quantidade) {
    const total = tipo ? ` = <b>${REAL.format(Math.round(tipo.valor * d.quantidade * 100) / 100)}</b>` : ""
    linhas.push(`Quantidade: ${quantidadeCurta(d.quantidade)}${total}`)
  }
  if (d.motivo) linhas.push(`Motivo: ${escapar(d.motivo)}`)
  const r = ctx.remessaAberta
  const codigo = r?.codigo ? ` ${escapar(r.codigo)}` : ""
  linhas.push(
    "",
    !r
      ? "Ela abre uma remessa nova. “Enviar a remessa” já manda para avaliação; “Salvar” deixa para enviar depois, junto com outras."
      : r.devolvida
        ? `Ela entra na sua remessa devolvida${codigo} (hoje com ${REAL.format(r.valorTotal)}). Depois de corrigir, reenvie a remessa pelo painel.`
        : `Ela entra na sua remessa em preparação${codigo} (hoje com ${REAL.format(r.valorTotal)}). “Enviar a remessa” manda todas as diárias dela para avaliação.`
  )
  return linhas.join("\n")
}

// ── Respostas ──────────────────────────────────────────────────────────────

export type ResultadoDiaria =
  | { estado: EstadoDiariaBot }
  | { erro: string }
  | { cancelar: true }
  | { confirmar: true; enviarRemessa: boolean }

function ir(passo: PassoDiaria, dados: DadosDiariaBot): { estado: EstadoDiariaBot } {
  return { estado: { passo, dados } }
}

export function iniciarDiariaBot(): EstadoDiariaBot {
  return { passo: "tipo", dados: {} }
}

/** Uma resposta da pessoa no passo atual → o próximo passo (ou o erro). */
export function responderDiariaBot(
  estado: EstadoDiariaBot,
  entrada: EntradaDiaria,
  ctx: ContextoDiaria
): ResultadoDiaria {
  const d = { ...estado.dados }
  const botao = "botao" in entrada ? entrada.botao : null
  const texto = "texto" in entrada ? entrada.texto.trim() : null
  if (botao === "x" || texto === "/cancelar") return { cancelar: true }

  switch (estado.passo) {
    case "tipo": {
      const id = botao?.startsWith("t:") ? botao.slice(2) : null
      if (!id || !ctx.tipos.some((t) => t.id === id)) return { erro: "Toque num dos tipos acima." }
      d.tipoId = id
      return ir("inicio", d)
    }
    case "inicio": {
      if (botao === "i:-") {
        d.inicio = null
        d.termino = null
        return ir("quantidade", d)
      }
      const data =
        botao === "i:h" ? ctx.hoje
        : botao === "i:o" ? somarDias(ctx.hoje, -1)
        : texto && !texto.startsWith("/") ? lerDataDiaria(texto, ctx.hoje)
        : null
      if (!data) return { erro: "Não entendi a data. Escreva como 12/11 ou 12/11/2026." }
      d.inicio = data
      return ir("termino", d)
    }
    case "termino": {
      const inicio = d.inicio ?? ctx.hoje
      const data =
        botao === "f:=" ? inicio
        : texto && !texto.startsWith("/") ? lerDataDiaria(texto, ctx.hoje)
        : null
      if (!data) return { erro: "Não entendi a data. Escreva como 12/11 ou 12/11/2026." }
      if (data < inicio) return { erro: `O término não pode ser antes do início (${dataCurta(inicio)}).` }
      d.termino = data
      return ir("quantidade", d)
    }
    case "quantidade": {
      const n =
        botao?.startsWith("q:") ? Number(botao.slice(2))
        : texto ? lerQuantidade(texto)
        : null
      if (!n || !Number.isFinite(n) || n <= 0) return { erro: "Informe a quantidade de diárias (ex.: 2)." }
      if (n > MAXIMO_DIARIAS) return { erro: `${quantidadeCurta(n)} diárias de uma vez? Confira o número.` }
      d.quantidade = n
      return ir("motivo", d)
    }
    case "motivo": {
      if (!texto || texto.startsWith("/")) return { erro: "Escreva o motivo (ou /cancelar)." }
      d.motivo = texto.slice(0, LIMITE_MOTIVO)
      return ir("confirmar", d)
    }
    case "confirmar": {
      if (botao === "ok") return { confirmar: true, enviarRemessa: false }
      if (botao === "ok:e" && !ctx.remessaAberta?.devolvida) return { confirmar: true, enviarRemessa: true }
      return { erro: "Toque em Salvar ou Cancelar pedido." }
    }
  }
}
