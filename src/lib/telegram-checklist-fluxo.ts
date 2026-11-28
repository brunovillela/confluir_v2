/**
 * Roteiro do /checklist no bot do Telegram (27/11/2026): o condutor do carro de
 * locação de uso DEDICADO — que não passa pela recepção — faz o checklist do
 * carro pela conversa, com o km. Puro (sem banco nem Telegram) para dar para
 * testar; quem grava e manda as mensagens é lib/telegram-checklist.ts, pela
 * MESMA gravarChecklist da tela de Veículos › Checklist.
 *
 * Passos:
 * 1. km — o hodômetro de agora (não pode ser menor que o último conhecido; um
 *    salto grande pede confirmação);
 * 2. apontamento — cada apontamento em aberto do carro: continua ou foi
 *    resolvido (só o checklist encerra um apontamento);
 * 3. itens — o catálogo de itens numa mensagem só, um botão por item que
 *    alterna ✅ em ordem → ⚠️ com problema → ➖ não se aplica;
 * 4. descricao — para cada item com problema, o que foi visto;
 * 5. confirmar — o resumo, com Salvar ou Cancelar.
 */

export type PassoChecklist = "km" | "km_alto" | "apontamento" | "itens" | "descricao" | "confirmar"

export type SituacaoBot = "conforme" | "nao_conforme" | "nao_aplica"

export type DadosChecklistBot = {
  km?: number
  /** Resposta a cada apontamento em aberto, pelo id. */
  apontamentos?: Record<string, "permanece" | "sanado">
  /** Situação marcada em cada item (sem entrada = em ordem). */
  itens?: Record<string, SituacaoBot>
  /** Descrição do problema, por item. */
  descricoes?: Record<string, string>
}

export type EstadoChecklistBot = { passo: PassoChecklist; dados: DadosChecklistBot }

export type ApontamentoBot = { id: string; itemId: string | null; categoria: string; descricao: string | null; desde: string }

export type ItemBot = { id: string; categoria: string; verificar: string | null }

export type ContextoChecklist = {
  /** "ABC1D23 · Fiat Cronos". */
  veiculo: string
  /** Último km conhecido do carro (null = nunca registrado). */
  kmAnterior: number | null
  apontamentos: ApontamentoBot[]
  itens: ItemBot[]
}

export type BotaoChecklist = { texto: string; dado: string }

export type PerguntaChecklist = { texto: string; botoes?: BotaoChecklist[][] }

/** Resposta da pessoa: texto digitado ou o `dado` de um botão (sem o "ck:"). */
export type EntradaChecklist = { texto: string } | { botao: string }

export type ResultadoChecklist =
  | { estado: EstadoChecklistBot; editar?: boolean }
  | { erro: string }
  | { cancelar: true }
  | { salvar: true }

export const PREFIXO_CALLBACK_CHECKLIST = "ck:"

/** Mais que isso desde o último km pede confirmação (engano de digitação). */
export const SALTO_KM_SUSPEITO = 5000

const MINIMO_DESCRICAO = 5
const LIMITE_DESCRICAO = 300

const MARCA: Record<SituacaoBot, string> = { conforme: "✅", nao_conforme: "⚠️", nao_aplica: "➖" }
const PROXIMA: Record<SituacaoBot, SituacaoBot> = {
  conforme: "nao_conforme",
  nao_conforme: "nao_aplica",
  nao_aplica: "conforme",
}

function escapar(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

function km(n: number): string {
  return `${n.toLocaleString("pt-BR")} km`
}

function dataBR(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso
}

/** "45.320", "45320 km", "45,320" → 45320; inválido → null. */
export function lerKm(texto: string): number | null {
  const limpo = texto.toLowerCase().replace(/km/g, "").replace(/[.\s,]/g, "").trim()
  if (!/^\d{1,7}$/.test(limpo)) return null
  return Number(limpo)
}

export function iniciarChecklistBot(): EstadoChecklistBot {
  return { passo: "km", dados: {} }
}

/** Apontamentos que ainda esperam a resposta (na ordem do contexto). */
function proximoApontamento(d: DadosChecklistBot, ctx: ContextoChecklist): ApontamentoBot | null {
  return ctx.apontamentos.find((a) => !d.apontamentos?.[a.id]) ?? null
}

/**
 * Itens que vão para a lista de marcar: os do catálogo, menos os que têm
 * apontamento que continua (esses já ficam com problema).
 */
export function itensParaMarcar(d: DadosChecklistBot, ctx: ContextoChecklist): ItemBot[] {
  const permanecem = new Set(
    ctx.apontamentos.filter((a) => d.apontamentos?.[a.id] === "permanece").map((a) => a.itemId)
  )
  return ctx.itens.filter((i) => !permanecem.has(i.id))
}

function situacaoDe(d: DadosChecklistBot, itemId: string): SituacaoBot {
  return d.itens?.[itemId] ?? "conforme"
}

function comProblema(d: DadosChecklistBot, ctx: ContextoChecklist): ItemBot[] {
  return itensParaMarcar(d, ctx).filter((i) => situacaoDe(d, i.id) === "nao_conforme")
}

function proximaDescricao(d: DadosChecklistBot, ctx: ContextoChecklist): ItemBot | null {
  return comProblema(d, ctx).find((i) => !d.descricoes?.[i.id]) ?? null
}

/** O passo depois do km (ou de um apontamento respondido). */
function depoisDoKm(d: DadosChecklistBot, ctx: ContextoChecklist): PassoChecklist {
  if (proximoApontamento(d, ctx)) return "apontamento"
  return itensParaMarcar(d, ctx).length > 0 ? "itens" : "confirmar"
}

function depoisDosItens(d: DadosChecklistBot, ctx: ContextoChecklist): PassoChecklist {
  return proximaDescricao(d, ctx) ? "descricao" : "confirmar"
}

export function perguntaDoPassoChecklist(c: EstadoChecklistBot, ctx: ContextoChecklist): PerguntaChecklist {
  const d = c.dados
  const cancelar: BotaoChecklist[] = [{ texto: "Cancelar", dado: "cancelar" }]
  switch (c.passo) {
    case "km":
      return {
        texto:
          `🚗 Checklist do <b>${escapar(ctx.veiculo)}</b>\n\nQual o <b>km</b> no painel do carro agora?` +
          (ctx.kmAnterior !== null ? `\n<i>Último registrado: ${km(ctx.kmAnterior)}.</i>` : ""),
        botoes: [cancelar],
      }
    case "km_alto":
      return {
        texto: `O km informado (<b>${km(d.km ?? 0)}</b>) está ${km((d.km ?? 0) - (ctx.kmAnterior ?? 0))} acima do último registrado (${km(ctx.kmAnterior ?? 0)}). Está certo?`,
        botoes: [[{ texto: "Sim, está certo", dado: "km:s" }, { texto: "Corrigir", dado: "km:n" }]],
      }
    case "apontamento": {
      const a = proximoApontamento(d, ctx)
      if (!a) return { texto: "" }
      return {
        texto:
          `⚠️ Há um problema apontado em checklist anterior, desde ${dataBR(a.desde)}:\n<b>${escapar(a.categoria)}</b>` +
          (a.descricao ? ` — ${escapar(a.descricao)}` : "") +
          "\n\nO problema continua?",
        botoes: [[{ texto: "Continua", dado: "ap:p" }, { texto: "Foi resolvido", dado: "ap:s" }], cancelar],
      }
    }
    case "itens": {
      const lista = itensParaMarcar(d, ctx)
      const problemas = lista.filter((i) => situacaoDe(d, i.id) === "nao_conforme").length
      const linhas = lista.map(
        (i) => `${MARCA[situacaoDe(d, i.id)]} <b>${escapar(i.categoria)}</b>${i.verificar ? ` — <i>${escapar(i.verificar)}</i>` : ""}`
      )
      const botoes: BotaoChecklist[][] = []
      for (let n = 0; n < lista.length; n += 2) {
        botoes.push(
          lista.slice(n, n + 2).map((i, k) => ({
            texto: `${MARCA[situacaoDe(d, i.id)]} ${i.categoria}`.slice(0, 40),
            dado: `t:${n + k}`,
          }))
        )
      }
      botoes.push([
        {
          texto: problemas === 0 ? "✅ Tudo em ordem — concluir" : `Concluir (${problemas} com problema)`,
          dado: "ok",
        },
      ])
      botoes.push(cancelar)
      return {
        texto: [
          "Confira cada item. Toque no item para marcar: ✅ em ordem → ⚠️ com problema → ➖ não se aplica.",
          "",
          ...linhas,
        ].join("\n"),
        botoes,
      }
    }
    case "descricao": {
      const i = proximaDescricao(d, ctx)
      return {
        texto: `⚠️ <b>${escapar(i?.categoria ?? "")}</b>: descreva o problema que você viu (é o que vai para a oficina).`,
        botoes: [cancelar],
      }
    }
    case "confirmar":
      return { texto: resumoChecklistBot(c.dados, ctx), botoes: [[{ texto: "Salvar", dado: "salvar" }, { texto: "Cancelar", dado: "cancelar" }]] }
  }
}

export function resumoChecklistBot(d: DadosChecklistBot, ctx: ContextoChecklist): string {
  const permanecem = ctx.apontamentos.filter((a) => d.apontamentos?.[a.id] === "permanece")
  const resolvidos = ctx.apontamentos.filter((a) => d.apontamentos?.[a.id] === "sanado")
  const problemas = comProblema(d, ctx)
  const naoAplica = itensParaMarcar(d, ctx).filter((i) => situacaoDe(d, i.id) === "nao_aplica")
  const linhas = [`<b>Checklist do ${escapar(ctx.veiculo)}</b>`, `Km: ${d.km !== undefined ? km(d.km) : "—"}`]
  if (resolvidos.length) linhas.push(`Resolvidos: ${resolvidos.map((a) => escapar(a.categoria)).join(", ")}`)
  if (permanecem.length) linhas.push(`Continuam com problema: ${permanecem.map((a) => escapar(a.categoria)).join(", ")}`)
  for (const i of problemas) linhas.push(`⚠️ ${escapar(i.categoria)}: ${escapar(d.descricoes?.[i.id] ?? "")}`)
  if (naoAplica.length) linhas.push(`Não se aplica: ${naoAplica.map((i) => escapar(i.categoria)).join(", ")}`)
  if (!permanecem.length && !problemas.length) linhas.push("✅ Tudo em ordem.")
  return [...linhas, "", "Salvo?"].join("\n")
}

/** Aplica a resposta ao passo atual e devolve o próximo estado (ou erro). */
export function responderChecklistBot(
  c: EstadoChecklistBot,
  entrada: EntradaChecklist,
  ctx: ContextoChecklist
): ResultadoChecklist {
  const botao = "botao" in entrada ? entrada.botao : null
  const texto = "texto" in entrada ? entrada.texto.trim() : ""
  if (botao === "cancelar" || texto === "/cancelar") return { cancelar: true }
  const d: DadosChecklistBot = { ...c.dados }

  switch (c.passo) {
    case "km": {
      if (botao) return { erro: "Digite o km que aparece no painel do carro." }
      const valor = lerKm(texto)
      if (valor === null) return { erro: "Não entendi o km. Digite só o número, por exemplo 45320." }
      if (ctx.kmAnterior !== null && valor < ctx.kmAnterior) {
        return { erro: `O km não pode ser menor que o último registrado (${km(ctx.kmAnterior)}). Confira o painel do carro.` }
      }
      d.km = valor
      if (ctx.kmAnterior !== null && valor - ctx.kmAnterior > SALTO_KM_SUSPEITO) {
        return { estado: { passo: "km_alto", dados: d } }
      }
      return { estado: { passo: depoisDoKm(d, ctx), dados: d } }
    }
    case "km_alto": {
      if (botao === "km:s") return { estado: { passo: depoisDoKm(d, ctx), dados: d } }
      if (botao === "km:n") {
        delete d.km
        return { estado: { passo: "km", dados: d } }
      }
      return { erro: "Toque em um dos botões." }
    }
    case "apontamento": {
      const a = proximoApontamento(d, ctx)
      if (!a) return { estado: { passo: depoisDoKm(d, ctx), dados: d } }
      if (botao !== "ap:p" && botao !== "ap:s") return { erro: "Toque em Continua ou Foi resolvido." }
      d.apontamentos = { ...d.apontamentos, [a.id]: botao === "ap:p" ? "permanece" : "sanado" }
      return { estado: { passo: depoisDoKm(d, ctx), dados: d } }
    }
    case "itens": {
      if (botao?.startsWith("t:")) {
        const lista = itensParaMarcar(d, ctx)
        const item = lista[Number(botao.slice(2))]
        if (!item) return { erro: "Item não encontrado — toque de novo." }
        d.itens = { ...d.itens, [item.id]: PROXIMA[situacaoDe(d, item.id)] }
        return { estado: { passo: "itens", dados: d }, editar: true }
      }
      if (botao === "ok") return { estado: { passo: depoisDosItens(d, ctx), dados: d } }
      return { erro: "Toque nos itens para marcar e depois em Concluir." }
    }
    case "descricao": {
      const i = proximaDescricao(d, ctx)
      if (!i) return { estado: { passo: "confirmar", dados: d } }
      if (botao) return { erro: "Escreva o problema em texto." }
      if (texto.length < MINIMO_DESCRICAO) return { erro: "Descreva um pouco mais — é o que a oficina vai ler." }
      d.descricoes = { ...d.descricoes, [i.id]: texto.slice(0, LIMITE_DESCRICAO) }
      return { estado: { passo: depoisDosItens(d, ctx), dados: d } }
    }
    case "confirmar": {
      if (botao === "salvar") return { salvar: true }
      return { erro: "Toque em Salvar ou Cancelar." }
    }
  }
}

/**
 * As respostas no formato de gravarChecklist: item sem marca = em ordem; o
 * item de um apontamento que continua fica com problema pela própria regra.
 */
export function respostasParaGravar(
  d: DadosChecklistBot,
  ctx: ContextoChecklist
): {
  itens: Record<string, { situacao: string; observacao: string }>
  apontamentos: Record<string, { resposta: string; observacao: string }>
} {
  const itens: Record<string, { situacao: string; observacao: string }> = {}
  for (const i of itensParaMarcar(d, ctx)) {
    const s = situacaoDe(d, i.id)
    itens[i.id] = { situacao: s, observacao: s === "nao_conforme" ? (d.descricoes?.[i.id] ?? "") : "" }
  }
  const apontamentos: Record<string, { resposta: string; observacao: string }> = {}
  for (const a of ctx.apontamentos) apontamentos[a.id] = { resposta: d.apontamentos?.[a.id] ?? "", observacao: "" }
  return { itens, apontamentos }
}
