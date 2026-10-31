/**
 * Comprovante por foto ou PDF no bot do Telegram (31/10/2026): a pessoa manda
 * o arquivo, a IA lê e deduz o que é, o bot completa o que falta (tipo do
 * reembolso, veículo, km, de quem é o atestado) e mostra o lançamento com
 * Confirmar / Corrigir / Cancelar. Puro (sem banco nem Telegram) para dar para
 * testar: recebe o passo atual e a resposta, devolve o próximo passo. Quem lê,
 * grava e manda as mensagens é lib/telegram-arquivo.ts — pelas MESMAS funções
 * do painel (criarReembolso, criarAbastecimento, criarAtestado).
 *
 * Três tipos nesta fase: recibo/nota → reembolso do ACT; cupom de
 * abastecimento; atestado (gera a ausência). Nota de compra a receber
 * (marketplace) continua pelo painel.
 *
 * Atestado é dado de saúde: o resumo no chat diz só de quem é, o início, os
 * dias e se é de acompanhamento — CID, médico e diagnóstico ficam no painel.
 */

import { formatarMoeda } from "@/lib/formato"
import { ultimoDiaDoPeriodo } from "@/lib/periodo-dias"
import { parseValorBR } from "@/lib/valores"
import { chavePlaca, parseHodometro } from "@/lib/veiculos-constantes"

export type TipoArquivo = "reembolso" | "abastecimento" | "atestado"

export const ROTULO_TIPO_ARQUIVO: Record<TipoArquivo, string> = {
  reembolso: "Reembolso do ACT",
  abastecimento: "Abastecimento",
  atestado: "Atestado",
}

const CODIGO_TIPO: Record<TipoArquivo, string> = { reembolso: "r", abastecimento: "a", atestado: "t" }

export const PREFIXO_CALLBACK_ARQUIVO = "ar:"

/** O mesmo teto dos uploads do painel (comprovante, atestado, arquivo de veículo). */
export const LIMITE_BYTES_ARQUIVO = 5 * 1024 * 1024

/** Tipo de arquivo aceito → extensão. Foto do Telegram chega como JPEG. */
export const MIMES_ARQUIVO: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
}

export function escaparHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

// ── Arquivo recebido ───────────────────────────────────────────────────────

export type ArquivoTelegram = { fileId: string; nome: string; mime: string; tamanho: number | null }

type FotoTelegram = { file_id?: string; file_size?: number; width?: number; height?: number }
type DocumentoTelegram = { file_id?: string; file_name?: string; mime_type?: string; file_size?: number }

/**
 * Da mensagem do Telegram, o arquivo a ler: na foto, o maior tamanho que cabe
 * no limite (o Telegram manda várias resoluções); no documento, o próprio.
 */
export function arquivoDaMensagem(msg: Record<string, unknown> | undefined): ArquivoTelegram | null {
  if (!msg) return null
  const fotos = Array.isArray(msg.photo) ? (msg.photo as FotoTelegram[]) : []
  if (fotos.length) {
    const validas = fotos.filter((f) => typeof f.file_id === "string")
    const cabem = validas.filter((f) => (f.file_size ?? 0) <= LIMITE_BYTES_ARQUIVO)
    const area = (f: FotoTelegram) => (f.width ?? 0) * (f.height ?? 0)
    const escolhida = [...(cabem.length ? cabem : validas)].sort((a, b) => area(b) - area(a))[0]
    if (!escolhida) return null
    return { fileId: String(escolhida.file_id), nome: "foto.jpg", mime: "image/jpeg", tamanho: escolhida.file_size ?? null }
  }
  const doc = msg.document as DocumentoTelegram | undefined
  if (doc && typeof doc.file_id === "string") {
    const nome = (doc.file_name ?? "arquivo").slice(0, 120)
    return { fileId: doc.file_id, nome, mime: mimeDoDocumento(doc.mime_type, nome), tamanho: doc.file_size ?? null }
  }
  return null
}

function mimeDoDocumento(mime: string | undefined, nome: string): string {
  const m = (mime ?? "").toLowerCase()
  if (MIMES_ARQUIVO[m]) return m
  const ext = nome.toLowerCase().split(".").pop() ?? ""
  if (ext === "pdf") return "application/pdf"
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg"
  if (ext === "png") return "image/png"
  if (ext === "webp") return "image/webp"
  return m || "application/octet-stream"
}

/** Por que este arquivo não dá para ler (ou null, se dá). */
export function problemaDoArquivo(a: ArquivoTelegram): string | null {
  if (!MIMES_ARQUIVO[a.mime]) {
    return "Mande uma foto ou um PDF (JPG, PNG, WebP ou PDF). Para foto, use o envio normal do Telegram."
  }
  if (a.tamanho !== null && a.tamanho > LIMITE_BYTES_ARQUIVO) {
    return "O arquivo passa de 5 MB. Mande uma foto do documento ou um PDF menor."
  }
  return null
}

// ── Leitura pela IA ────────────────────────────────────────────────────────

export const SISTEMA_LEITURA_ARQUIVO = `Você lê UM documento mandado por um funcionário de um sindicato brasileiro (foto ou PDF) e diz o que ele é.
Tipos:
- "reembolso": recibo, nota fiscal ou comprovante de uma despesa pessoal que o funcionário quer reembolsar (creche, escola, ótica, farmácia, curso…).
- "abastecimento": cupom ou nota de posto de combustível (gasolina, etanol, diesel, GNV).
- "atestado": atestado médico ou odontológico, declaração de comparecimento/acompanhamento.
- "outro": nada disso, ou ilegível.
Devolva um objeto JSON:
{ "tipo": "", "valor": null, "data": "", "emitente": "", "descricao": "", "posto": "", "cidade": "", "combustivel": "", "litros": null, "hora": "", "placa": "", "hodometro": null, "inicio": "", "dias": null, "acompanhamento": false, "nome_acompanhado": "", "paciente": "", "cid": "" }
Regras:
- "valor": valor TOTAL pago em reais, número com ponto decimal (no cupom de combustível, o total — não o preço por litro).
- "data": data do documento em AAAA-MM-DD (datas brasileiras vêm DD/MM/AAAA). "hora": HH:MM se houver.
- "emitente": quem emitiu (loja, escola, clínica, posto). "descricao": em até 12 palavras, o que foi pago (ex.: "Mensalidade da creche de outubro").
- Combustível: "posto", "cidade", "combustivel" (como aparece), "litros" (número), "placa" e "hodometro" (km, inteiro) se estiverem no cupom.
- Atestado: "inicio" (AAAA-MM-DD; se não houver, a data do atestado), "dias" (inteiro; "por 2 dias", "48 horas" = 2), "acompanhamento" (true se for para acompanhar outra pessoa), "nome_acompanhado", "paciente" (o nome de quem o atestado cobre ou do funcionário que acompanha), "cid" (código CID-10 se houver).
- Campo que não está no documento fica "" (ou null nos números). Não invente.
- Responda APENAS com o objeto JSON.`

export type LeituraArquivo = {
  tipo: TipoArquivo | null
  valor: number | null
  data: string | null
  emitente: string | null
  descricao: string | null
  posto: string | null
  cidade: string | null
  combustivel: string | null
  litros: number | null
  hora: string | null
  placa: string | null
  hodometro: number | null
  inicio: string | null
  dias: number | null
  acompanhamento: boolean
  nomeAcompanhado: string | null
  paciente: string | null
  cid: string | null
}

function textoCampo(v: unknown, max = 120): string | null {
  if (typeof v !== "string" && typeof v !== "number") return null
  const s = String(v).replace(/\s+/g, " ").trim()
  return s ? s.slice(0, max) : null
}

/** Número da IA: com vírgula é formato brasileiro; sem, ponto é decimal. */
function numeroCampo(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null
  if (typeof v !== "string" || !v.trim()) return null
  if (v.includes(",")) return parseValorBR(v.replace(/[^\d.,-]/g, ""))
  const n = Number(v.replace(/[^\d.-]/g, ""))
  return Number.isFinite(n) && v.replace(/[^\d]/g, "") !== "" ? n : null
}

function dataCampo(v: unknown): string | null {
  const s = textoCampo(v, 20)
  if (!s) return null
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  const br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s)
  const [a, m, d] = iso ? [iso[1], iso[2], iso[3]] : br ? [br[3], br[2], br[1]] : []
  return a ? dataValida(Number(a), Number(m), Number(d)) : null
}

const TIPOS_IA: Record<string, TipoArquivo> = {
  reembolso: "reembolso",
  abastecimento: "abastecimento",
  atestado: "atestado",
}

/** O JSON da IA higienizado (nada de confiança cega: tudo conferido aqui). */
export function normalizarLeitura(bruto: Record<string, unknown> | null | undefined): LeituraArquivo {
  const b = bruto ?? {}
  const valor = numeroCampo(b.valor)
  const litros = numeroCampo(b.litros)
  const dias = numeroCampo(b.dias)
  const hodometro =
    typeof b.hodometro === "number" ? Math.round(b.hodometro) : typeof b.hodometro === "string" ? parseHodometro(b.hodometro) : null
  const hora = textoCampo(b.hora, 8)
  const placa = textoCampo(b.placa, 12)?.toUpperCase().replace(/[^A-Z0-9]/g, "") || null
  const cid = textoCampo(b.cid, 12)?.toUpperCase().replace(/[^A-Z0-9.]/g, "") || null
  return {
    tipo: TIPOS_IA[String(b.tipo ?? "").toLowerCase()] ?? null,
    valor: valor !== null && valor > 0 ? Math.round(valor * 100) / 100 : null,
    data: dataCampo(b.data),
    emitente: textoCampo(b.emitente),
    descricao: textoCampo(b.descricao, 200),
    posto: textoCampo(b.posto)?.toUpperCase() ?? null,
    cidade: textoCampo(b.cidade, 80)?.toUpperCase() ?? null,
    combustivel: textoCampo(b.combustivel, 60)?.toUpperCase() ?? null,
    litros: litros !== null && litros > 0 ? Math.round(litros * 1000) / 1000 : null,
    hora: hora && /^\d{1,2}:\d{2}/.test(hora) ? hora.slice(0, 5).padStart(5, "0") : null,
    placa,
    hodometro: hodometro !== null && hodometro > 0 ? hodometro : null,
    inicio: dataCampo(b.inicio),
    dias: dias !== null && Number.isInteger(dias) && dias >= 1 && dias <= 365 ? dias : null,
    acompanhamento: b.acompanhamento === true,
    nomeAcompanhado: textoCampo(b.nome_acompanhado),
    paciente: textoCampo(b.paciente),
    cid,
  }
}

// ── Estado da conversa ─────────────────────────────────────────────────────

export type PassoArquivo =
  | "tipo"
  | "tipo_reembolso"
  | "veiculo"
  | "funcionario"
  | "acompanhamento"
  | "editar"
  | "confirmar"
  | "corrigir"

/** Campos digitados (os de botão têm passo próprio). */
export type CampoDigitado =
  | "valor"
  | "descricao"
  | "hodometro"
  | "litros"
  | "data"
  | "posto"
  | "combustivel"
  | "inicio"
  | "dias"
  | "nome_acompanhado"
  | "nome_funcionario"

export type Pessoa = { id: string; nome: string }

export type DadosArquivoBot = {
  arquivo: ArquivoTelegram
  /** Tipos que esta pessoa pode lançar (permissão conferida no servidor). */
  permitidos: TipoArquivo[]
  /** Pode lançar atestado de outro funcionário (gestão de pessoal). */
  atestadoDeOutros: boolean
  lido: LeituraArquivo
  tipo?: TipoArquivo
  /** Passo "editar": o campo sendo digitado. */
  campo?: CampoDigitado
  // Reembolso do ACT
  tipoReembolsoId?: string
  valor?: number
  descricao?: string
  // Abastecimento (o condutor é quem mandou)
  veiculoId?: string
  hodometro?: number
  litros?: number
  /** "aaaa-mm-ddTHH:MM", hora de São Paulo. */
  dataHora?: string
  posto?: string
  cidade?: string | null
  combustivel?: string
  /** Avisos do servidor antes de confirmar (km abaixo do último, já lançado…). */
  alertas?: string[]
  /** Já lançado (mesmo veículo, dia, valor e litros): não deixa confirmar. */
  duplicado?: boolean
  // Atestado
  funcionarioId?: string
  funcionarioNome?: string
  /** Casado pelo nome lido (só para quem lança de outros). */
  sugestaoFuncionario?: Pessoa | null
  /** Resultado da busca digitada. */
  opcoesFuncionario?: Pessoa[]
  inicio?: string
  dias?: number
  acompanhamento?: boolean
  nomeAcompanhado?: string | null
}

export type EstadoArquivoBot = { passo: PassoArquivo; dados: DadosArquivoBot }

export type ContextoArquivo = {
  /** "aaaa-mm-dd" de hoje em São Paulo. */
  hoje: string
  usuario: Pessoa
  tiposReembolso: { id: string; nome: string }[]
  veiculos: { id: string; placa: string; rotulo: string }[]
}

export type BotaoArquivo = { texto: string; dado: string }
export type PerguntaArquivo = { texto: string; botoes?: BotaoArquivo[][] }

/** Resposta da pessoa: texto digitado ou o `dado` de um botão (sem o "ar:"). */
export type EntradaArquivo = { texto: string } | { botao: string }

function b(texto: string, dado: string): BotaoArquivo {
  return { texto: texto.slice(0, 60), dado: `${PREFIXO_CALLBACK_ARQUIVO}${dado}` }
}

const CANCELAR = [b("Cancelar", "x")]

// ── Datas ──────────────────────────────────────────────────────────────────

function dataValida(a: number, m: number, d: number): string | null {
  const dt = new Date(Date.UTC(a, m - 1, d))
  if (dt.getUTCFullYear() !== a || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null
  return dt.toISOString().slice(0, 10)
}

function somarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

export function dataCurta(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split("-")
  return `${d}/${m}/${a}`
}

/**
 * "12/10", "12/10/2026", "12-10-26", "hoje", "ontem" → "aaaa-mm-dd" de um
 * documento já emitido: sem o ano, vale o deste ano — ou o do anterior, se a
 * data deste ano ainda não chegou (com `folgaDias` de tolerância).
 */
export function lerDataDoDocumento(bruto: string, hoje: string, folgaDias = 0): string | null {
  const s = bruto.trim().toLowerCase()
  if (s === "hoje") return hoje
  if (s === "ontem") return somarDias(hoje, -1)
  // Ano de 4 dígitos antes do de 2 ("05/11/2026" não pode virar 2020).
  const m = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{4}|\d{2}))?(?!\d)/.exec(s)
  if (!m) return null
  const dia = Number(m[1])
  const mes = Number(m[2])
  if (m[3]) return dataValida(m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]), mes, dia)
  const anoHoje = Number(hoje.slice(0, 4))
  const desteAno = dataValida(anoHoje, mes, dia)
  if (!desteAno) return null
  return desteAno > somarDias(hoje, folgaDias) ? dataValida(anoHoje - 1, mes, dia) : desteAno
}

/** "12/10 14:30", "12/10/2026 9h" → "aaaa-mm-ddTHH:MM" (sem hora, 12:00). */
export function lerDataHora(bruto: string, hoje: string): string | null {
  const data = lerDataDoDocumento(bruto, hoje)
  if (!data) return null
  const h = /(\d{1,2})\s*(?::|h)\s*(\d{2})?\s*h?\s*$/.exec(bruto.trim().replace(/^\S+/, ""))
  if (!h) return `${data}T12:00`
  const hh = Number(h[1])
  const mm = h[2] ? Number(h[2]) : 0
  if (hh > 23 || mm > 59) return null
  return `${data}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`
}

// ── Começo: o tipo ─────────────────────────────────────────────────────────

/** Estado inicial depois da leitura: tipo deduzido (se permitido) ou a pergunta. */
export function iniciarArquivoBot(
  arquivo: ArquivoTelegram,
  lido: LeituraArquivo,
  permitidos: TipoArquivo[],
  atestadoDeOutros: boolean,
  ctx: ContextoArquivo,
  extras: { veiculoSugeridoId?: string | null; sugestaoFuncionario?: Pessoa | null } = {}
): EstadoArquivoBot {
  const dados: DadosArquivoBot = {
    arquivo,
    lido,
    permitidos,
    atestadoDeOutros,
    sugestaoFuncionario: extras.sugestaoFuncionario ?? null,
    veiculoId: extras.veiculoSugeridoId ?? undefined,
  }
  if (lido.tipo && permitidos.includes(lido.tipo)) return seguir(aplicarTipo(dados, lido.tipo, ctx))
  if (permitidos.length === 1) return seguir(aplicarTipo(dados, permitidos[0], ctx))
  return { passo: "tipo", dados }
}

/** Preenche os campos do tipo com o que a IA leu. */
function aplicarTipo(d0: DadosArquivoBot, tipo: TipoArquivo, ctx: ContextoArquivo): DadosArquivoBot {
  const l = d0.lido
  const d: DadosArquivoBot = { ...d0, tipo, alertas: undefined, duplicado: undefined }
  if (tipo === "reembolso") {
    d.valor = l.valor ?? undefined
    const desc = [l.descricao, l.emitente ? `(${l.emitente})` : null].filter(Boolean).join(" ")
    d.descricao = desc ? desc.slice(0, 300) : undefined
    if (ctx.tiposReembolso.length === 1) d.tipoReembolsoId = ctx.tiposReembolso[0].id
  } else if (tipo === "abastecimento") {
    d.valor = l.valor ?? undefined
    d.litros = l.litros ?? undefined
    d.posto = l.posto ?? undefined
    d.cidade = l.cidade
    d.combustivel = l.combustivel ?? undefined
    d.hodometro = l.hodometro ?? undefined
    const data = l.data && l.data <= ctx.hoje ? l.data : null
    d.dataHora = data ? `${data}T${l.hora ?? "12:00"}` : undefined
  } else {
    d.inicio = l.inicio ?? l.data ?? undefined
    d.dias = l.dias ?? undefined
    d.acompanhamento = l.acompanhamento
    d.nomeAcompanhado = l.acompanhamento ? l.nomeAcompanhado : null
    if (!d.atestadoDeOutros) {
      d.funcionarioId = ctx.usuario.id
      d.funcionarioNome = ctx.usuario.nome
    }
  }
  return d
}

/** O primeiro campo que falta, ou a confirmação. */
function seguir(d: DadosArquivoBot): EstadoArquivoBot {
  const ir = (passo: PassoArquivo, campo?: CampoDigitado): EstadoArquivoBot => ({
    passo,
    dados: { ...d, campo },
  })
  switch (d.tipo) {
    case undefined:
      return ir("tipo")
    case "reembolso":
      if (!d.tipoReembolsoId) return ir("tipo_reembolso")
      if (!d.valor) return ir("editar", "valor")
      if (!d.descricao) return ir("editar", "descricao")
      return ir("confirmar")
    case "abastecimento":
      if (!d.veiculoId) return ir("veiculo")
      if (!d.hodometro) return ir("editar", "hodometro")
      if (!d.valor) return ir("editar", "valor")
      if (!d.litros) return ir("editar", "litros")
      if (!d.dataHora) return ir("editar", "data")
      if (!d.posto) return ir("editar", "posto")
      if (!d.combustivel) return ir("editar", "combustivel")
      return ir("confirmar")
    case "atestado":
      if (!d.funcionarioId) return ir("funcionario")
      if (!d.inicio) return ir("editar", "inicio")
      if (!d.dias) return ir("editar", "dias")
      return ir("confirmar")
  }
}

// ── Perguntas ──────────────────────────────────────────────────────────────

const PERGUNTA_CAMPO: Record<CampoDigitado, string> = {
  valor: "Qual o valor total pago? <i>Ex.: 185,90</i>",
  descricao: "Descreva a despesa em poucas palavras. <i>Ex.: mensalidade da creche de outubro</i>",
  hodometro: "Qual o km do hodômetro na hora do abastecimento? <i>Ex.: 48.350</i>",
  litros: "Quantos litros? <i>Ex.: 38,52</i>",
  data: "Data e hora do abastecimento? <i>Ex.: 30/10 14:20</i>",
  posto: "Nome do posto?",
  combustivel: "Qual combustível? <i>Ex.: gasolina comum, etanol, diesel S10</i>",
  inicio: "Data de início do atestado? <i>Ex.: 30/10</i>",
  dias: "Quantos dias de afastamento? <i>Ex.: 2</i>",
  nome_acompanhado: "Nome da pessoa acompanhada?",
  nome_funcionario: "Digite o nome do funcionário (pelo menos 3 letras).",
}

function botoesTipo(permitidos: TipoArquivo[]): BotaoArquivo[][] {
  const icone: Record<TipoArquivo, string> = { reembolso: "🧾", abastecimento: "⛽", atestado: "🩺" }
  return permitidos.map((t) => [b(`${icone[t]} ${ROTULO_TIPO_ARQUIVO[t]}`, `t:${CODIGO_TIPO[t]}`)])
}

export function perguntaDoPassoArquivo(e: EstadoArquivoBot, ctx: ContextoArquivo): PerguntaArquivo {
  const d = e.dados
  switch (e.passo) {
    case "tipo":
      return {
        texto: !d.lido.tipo
          ? "Não reconheci este arquivo. O que ele é?"
          : d.permitidos.includes(d.lido.tipo)
            ? "O que é este arquivo?"
            : `Parece ${d.lido.tipo === "atestado" ? "um atestado" : d.lido.tipo === "abastecimento" ? "um cupom de abastecimento" : "um recibo de reembolso"}, que você não lança por aqui. Se for outra coisa, escolha:`,
        botoes: [...botoesTipo(d.permitidos), CANCELAR],
      }
    case "tipo_reembolso": {
      const linhas = ctx.tiposReembolso.map((t) => [b(t.nome, `tr:${t.id}`)])
      return { texto: "Qual o tipo de reembolso do ACT?", botoes: [...linhas, CANCELAR] }
    }
    case "veiculo": {
      const linhas: BotaoArquivo[][] = []
      const vs = ctx.veiculos.slice(0, 40)
      for (let i = 0; i < vs.length; i += 2) linhas.push(vs.slice(i, i + 2).map((v) => b(v.rotulo, `v:${v.id}`)))
      const lida = d.lido.placa ? ` (li a placa ${escaparHtml(d.lido.placa)}, que não está na frota)` : ""
      return {
        texto: `Em qual veículo foi o abastecimento?${lida} Toque no carro ou digite a placa.`,
        botoes: [...linhas, CANCELAR],
      }
    }
    case "funcionario": {
      const linhas: BotaoArquivo[][] = []
      const vistos = new Set<string>()
      const opcoes = [
        ...(d.opcoesFuncionario ?? []),
        ...(d.sugestaoFuncionario ? [d.sugestaoFuncionario] : []),
      ]
      for (const p of opcoes) {
        if (vistos.has(p.id) || p.id === ctx.usuario.id) continue
        vistos.add(p.id)
        linhas.push([b(`👤 ${p.nome}`, `f:${p.id}`)])
      }
      linhas.push([b("É meu", "f:eu"), b("Outro: digitar o nome", "fo")])
      return {
        texto: d.opcoesFuncionario
          ? d.opcoesFuncionario.length
            ? "De quem é o atestado? Toque no nome."
            : "Não achei funcionário com vínculo em vigor com esse nome. Tente outro nome ou toque em É meu."
          : "De quem é o atestado?",
        botoes: [...linhas, CANCELAR],
      }
    }
    case "acompanhamento":
      return {
        texto: "É atestado de acompanhamento (para acompanhar outra pessoa)?",
        botoes: [[b("Sim", "ac:s"), b("Não", "ac:n")], CANCELAR],
      }
    case "editar":
      return { texto: PERGUNTA_CAMPO[d.campo ?? "valor"], botoes: [CANCELAR] }
    case "corrigir":
      return { texto: "O que você quer corrigir?", botoes: [...botoesCorrigir(d), [b("↩️ Voltar", "vo")], CANCELAR] }
    case "confirmar": {
      const linhas: BotaoArquivo[][] = d.duplicado
        ? [[b("✏️ Corrigir", "c")], CANCELAR]
        : [[b("✅ Confirmar", "ok"), b("✏️ Corrigir", "c")], CANCELAR]
      return {
        texto: [resumoArquivoBot(d, ctx), "", d.duplicado ? "Este abastecimento já está lançado." : "Confere?"].join("\n"),
        botoes: linhas,
      }
    }
  }
}

function botoesCorrigir(d: DadosArquivoBot): BotaoArquivo[][] {
  const campos: [string, string][] = []
  if (d.permitidos.length > 1) campos.push(["Não é isso (mudar o tipo)", "c:tipo"])
  if (d.tipo === "reembolso") {
    campos.push(["Tipo do reembolso", "c:tr"], ["Valor", "c:valor"], ["Descrição", "c:descricao"])
  } else if (d.tipo === "abastecimento") {
    campos.push(
      ["Veículo", "c:v"],
      ["Km", "c:hodometro"],
      ["Valor", "c:valor"],
      ["Litros", "c:litros"],
      ["Data e hora", "c:data"],
      ["Posto", "c:posto"],
      ["Combustível", "c:combustivel"]
    )
  } else if (d.tipo === "atestado") {
    if (d.atestadoDeOutros) campos.push(["Funcionário", "c:f"])
    campos.push(["Início", "c:inicio"], ["Dias", "c:dias"], ["Acompanhamento", "c:ac"])
    if (d.acompanhamento) campos.push(["Nome do acompanhado", "c:nome_acompanhado"])
  }
  const linhas: BotaoArquivo[][] = []
  for (let i = 0; i < campos.length; i += 2) linhas.push(campos.slice(i, i + 2).map(([t, dado]) => b(t, dado)))
  return linhas
}

/** O lançamento como a pessoa vai conferir. Atestado: só o mínimo. */
export function resumoArquivoBot(d: DadosArquivoBot, ctx: ContextoArquivo): string {
  const linhas: string[] = []
  if (d.tipo === "reembolso") {
    const tipo = ctx.tiposReembolso.find((t) => t.id === d.tipoReembolsoId)
    linhas.push("<b>Reembolso do ACT</b>")
    linhas.push(`• Tipo: ${tipo ? escaparHtml(tipo.nome) : "—"}`)
    linhas.push(`• Valor da despesa: ${d.valor ? formatarMoeda(d.valor) : "—"}`)
    linhas.push(`• Descrição: ${d.descricao ? escaparHtml(d.descricao) : "—"}`)
    if (d.lido.data) linhas.push(`• Data do comprovante: ${dataCurta(d.lido.data)}`)
    linhas.push("", "<i>Vai para a avaliação da gestão de pessoal, com o arquivo como comprovante.</i>")
  } else if (d.tipo === "abastecimento") {
    const v = ctx.veiculos.find((x) => x.id === d.veiculoId)
    linhas.push("<b>Abastecimento</b>")
    linhas.push(`• Veículo: ${v ? escaparHtml(v.rotulo) : "—"}`)
    linhas.push(`• Condutor: ${escaparHtml(ctx.usuario.nome)}`)
    if (d.dataHora) linhas.push(`• Quando: ${dataCurta(d.dataHora)} ${d.dataHora.slice(11, 16)}`)
    linhas.push(`• Posto: ${d.posto ? escaparHtml(d.posto) : "—"}${d.cidade ? ` — ${escaparHtml(d.cidade)}` : ""}`)
    linhas.push(`• Combustível: ${d.combustivel ? escaparHtml(d.combustivel) : "—"}`)
    const porLitro = d.valor && d.litros ? ` (${formatarMoeda(Math.round((d.valor / d.litros) * 1000) / 1000)}/L)` : ""
    linhas.push(`• ${d.litros ? `${d.litros.toLocaleString("pt-BR")} L` : "— L"} · ${d.valor ? formatarMoeda(d.valor) : "—"}${porLitro}`)
    linhas.push(`• Km: ${d.hodometro ? d.hodometro.toLocaleString("pt-BR") : "—"}`)
    for (const a of d.alertas ?? []) linhas.push(`⚠️ ${escaparHtml(a)}`)
  } else if (d.tipo === "atestado") {
    linhas.push("<b>Atestado</b>")
    linhas.push(`• De: ${d.funcionarioNome ? escaparHtml(d.funcionarioNome) : "—"}`)
    if (d.inicio && d.dias) {
      linhas.push(`• ${d.dias} dia(s), de ${dataCurta(d.inicio)} a ${dataCurta(ultimoDiaDoPeriodo(d.inicio, d.dias))}`)
    }
    linhas.push(`• Acompanhamento: ${d.acompanhamento ? `sim${d.nomeAcompanhado ? ` (${escaparHtml(d.nomeAcompanhado)})` : ""}` : "não"}`)
    linhas.push("", "<i>Gera a ausência no período. Os demais dados do atestado ficam só no painel.</i>")
  }
  return linhas.join("\n")
}

// ── Respostas ──────────────────────────────────────────────────────────────

export type ResultadoArquivo =
  | { estado: EstadoArquivoBot }
  | { erro: string }
  | { cancelar: true }
  | { confirmar: true }
  /** Passo "funcionario": o servidor procura o nome e devolve as opções. */
  | { buscarFuncionario: string; estado: EstadoArquivoBot }

function lerValor(t: string): number | null {
  const n = parseValorBR(t.replace(/r\$\s*/i, "").replace(/\s/g, ""))
  return n !== null && n > 0 && n < 1_000_000 ? Math.round(n * 100) / 100 : null
}

function lerCampo(
  campo: CampoDigitado,
  t: string,
  ctx: ContextoArquivo
): { aplicar: (d: DadosArquivoBot) => void } | { erro: string } {
  switch (campo) {
    case "valor": {
      const v = lerValor(t)
      return v ? { aplicar: (d) => void (d.valor = v) } : { erro: "Não entendi o valor. Escreva como 185,90." }
    }
    case "litros": {
      const v = lerValor(t.replace(/l(itros?)?$/i, ""))
      return v && v < 1000 ? { aplicar: (d) => void (d.litros = v) } : { erro: "Não entendi os litros. Escreva como 38,52." }
    }
    case "hodometro": {
      const km = parseHodometro(t.replace(/km/i, ""))
      return km && km > 0 ? { aplicar: (d) => void (d.hodometro = km) } : { erro: "Não entendi o km. Escreva só o número, como 48350." }
    }
    case "dias": {
      const n = Number(t.replace(/dias?/i, "").trim())
      return Number.isInteger(n) && n >= 1 && n <= 365
        ? { aplicar: (d) => void (d.dias = n) }
        : { erro: "Escreva a quantidade de dias como número inteiro (1 a 365)." }
    }
    case "inicio": {
      const data = lerDataDoDocumento(t, ctx.hoje, 30)
      if (!data) return { erro: "Não entendi a data. Escreva como 30/10 ou 30/10/2026." }
      if (data > somarDias(ctx.hoje, 30)) return { erro: "Essa data está longe demais no futuro." }
      return { aplicar: (d) => void (d.inicio = data) }
    }
    case "data": {
      const dh = lerDataHora(t, ctx.hoje)
      if (!dh) return { erro: "Não entendi. Escreva como 30/10 14:20." }
      if (dh.slice(0, 10) > ctx.hoje) return { erro: "Essa data ainda não chegou." }
      return { aplicar: (d) => void (d.dataHora = dh) }
    }
    case "descricao":
    case "posto":
    case "combustivel":
    case "nome_acompanhado": {
      const max = campo === "descricao" ? 300 : 120
      const v = t.replace(/\s+/g, " ").trim().slice(0, max)
      if (v.length < 2) return { erro: "Escreva um pouco mais." }
      return {
        aplicar: (d) => {
          if (campo === "descricao") d.descricao = v
          else if (campo === "posto") d.posto = v.toUpperCase()
          else if (campo === "combustivel") d.combustivel = v.toUpperCase()
          else d.nomeAcompanhado = v
        },
      }
    }
    case "nome_funcionario":
      return { erro: "" }
  }
}

/** Uma resposta da pessoa no passo atual → o próximo passo (ou o erro). */
export function responderArquivoBot(
  e: EstadoArquivoBot,
  entrada: EntradaArquivo,
  ctx: ContextoArquivo
): ResultadoArquivo {
  const botao = "botao" in entrada ? entrada.botao : null
  const texto = "texto" in entrada ? entrada.texto.trim() : null
  if (botao === "x" || texto === "/cancelar") return { cancelar: true }
  const d: DadosArquivoBot = { ...e.dados, alertas: undefined, duplicado: undefined }

  if (texto?.startsWith("/")) return { erro: "Responda a pergunta acima (ou /cancelar)." }

  switch (e.passo) {
    case "tipo": {
      const tipo = (Object.keys(CODIGO_TIPO) as TipoArquivo[]).find((t) => botao === `t:${CODIGO_TIPO[t]}`)
      if (!tipo || !d.permitidos.includes(tipo)) return { erro: "Toque numa das opções acima." }
      return { estado: seguir(aplicarTipo(d, tipo, ctx)) }
    }
    case "tipo_reembolso": {
      const id = botao?.startsWith("tr:") ? botao.slice(3) : null
      if (!id || !ctx.tiposReembolso.some((t) => t.id === id)) return { erro: "Toque num dos tipos acima." }
      return { estado: seguir({ ...d, tipoReembolsoId: id }) }
    }
    case "veiculo": {
      let id = botao?.startsWith("v:") ? botao.slice(2) : null
      if (!id && texto) {
        const alvo = chavePlaca(texto)
        id = ctx.veiculos.find((v) => chavePlaca(v.placa) === alvo)?.id ?? null
        if (!id) return { erro: "Não achei essa placa na frota. Toque no carro ou confira a placa." }
      }
      if (!id || !ctx.veiculos.some((v) => v.id === id)) return { erro: "Toque num dos veículos acima." }
      return { estado: seguir({ ...d, veiculoId: id }) }
    }
    case "funcionario": {
      if (botao === "f:eu") {
        return { estado: seguir({ ...d, funcionarioId: ctx.usuario.id, funcionarioNome: ctx.usuario.nome, opcoesFuncionario: undefined }) }
      }
      if (botao === "fo") return { estado: { passo: "editar", dados: { ...d, campo: "nome_funcionario" } } }
      const id = botao?.startsWith("f:") ? botao.slice(2) : null
      const opcoes = [...(d.opcoesFuncionario ?? []), ...(d.sugestaoFuncionario ? [d.sugestaoFuncionario] : [])]
      const p = id ? opcoes.find((x) => x.id === id) : null
      if (p) return { estado: seguir({ ...d, funcionarioId: p.id, funcionarioNome: p.nome, opcoesFuncionario: undefined }) }
      if (texto) return nomeParaBuscar(texto, d)
      return { erro: "Toque num nome acima ou em É meu." }
    }
    case "acompanhamento": {
      if (botao !== "ac:s" && botao !== "ac:n") return { erro: "Toque em Sim ou Não." }
      const sim = botao === "ac:s"
      const novo = { ...d, acompanhamento: sim, nomeAcompanhado: sim ? d.nomeAcompanhado : null }
      if (sim && !novo.nomeAcompanhado) return { estado: { passo: "editar", dados: { ...novo, campo: "nome_acompanhado" } } }
      return { estado: seguir(novo) }
    }
    case "editar": {
      if (!texto) return { erro: "Escreva a resposta (ou toque em Cancelar)." }
      const campo = d.campo ?? "valor"
      if (campo === "nome_funcionario") return nomeParaBuscar(texto, d)
      const r = lerCampo(campo, texto, ctx)
      if ("erro" in r) return r
      const novo = { ...d, campo: undefined }
      r.aplicar(novo)
      return { estado: seguir(novo) }
    }
    case "corrigir": {
      if (botao === "vo") return { estado: seguir(d) }
      if (botao === "c:tipo" && d.permitidos.length > 1) return { estado: { passo: "tipo", dados: { ...d, tipo: undefined } } }
      if (botao === "c:tr") return { estado: { passo: "tipo_reembolso", dados: d } }
      if (botao === "c:v") return { estado: { passo: "veiculo", dados: d } }
      if (botao === "c:f" && d.atestadoDeOutros) return { estado: { passo: "funcionario", dados: { ...d, opcoesFuncionario: undefined } } }
      if (botao === "c:ac") return { estado: { passo: "acompanhamento", dados: d } }
      const campo = botao?.startsWith("c:") ? (botao.slice(2) as CampoDigitado) : null
      if (campo && campo in PERGUNTA_CAMPO && campo !== "nome_funcionario") {
        return { estado: { passo: "editar", dados: { ...d, campo } } }
      }
      return { erro: "Toque no que quer corrigir." }
    }
    case "confirmar": {
      if (botao === "ok" && !e.dados.duplicado) return { confirmar: true }
      if (botao === "c") return { estado: { passo: "corrigir", dados: d } }
      return { erro: "Toque em Confirmar, Corrigir ou Cancelar." }
    }
  }
}

function nomeParaBuscar(texto: string, d: DadosArquivoBot): ResultadoArquivo {
  const termo = texto.replace(/\s+/g, " ").trim().slice(0, 80)
  if (termo.length < 3) return { erro: "Digite pelo menos 3 letras do nome." }
  return { buscarFuncionario: termo, estado: { passo: "funcionario", dados: { ...d, campo: undefined } } }
}


// ── Gravação ───────────────────────────────────────────────────────────────

/** O lançamento pronto para as funções do painel (ou o que falta). */
export type LancamentoArquivo =
  | { tipo: "reembolso"; tipoReembolsoId: string; valor: number; descricao: string }
  | {
      tipo: "abastecimento"
      veiculoId: string
      posto: string
      cidade: string | null
      combustivel: string
      litros: number
      valor: number
      hodometro: number
      /** Com fuso de São Paulo, como o formulário grava. */
      dataHora: string
    }
  | {
      tipo: "atestado"
      funcionarioId: string
      inicio: string
      termino: string
      dias: number
      acompanhamento: boolean
      nomeAcompanhado: string | null
      cid: string | null
    }

export function lancamentoDoArquivo(d: DadosArquivoBot): LancamentoArquivo | null {
  if (d.tipo === "reembolso" && d.tipoReembolsoId && d.valor && d.descricao) {
    return { tipo: "reembolso", tipoReembolsoId: d.tipoReembolsoId, valor: d.valor, descricao: d.descricao }
  }
  if (
    d.tipo === "abastecimento" &&
    d.veiculoId &&
    d.posto &&
    d.combustivel &&
    d.litros &&
    d.valor &&
    d.hodometro &&
    d.dataHora
  ) {
    return {
      tipo: "abastecimento",
      veiculoId: d.veiculoId,
      posto: d.posto,
      cidade: d.cidade ?? null,
      combustivel: d.combustivel,
      litros: d.litros,
      valor: d.valor,
      hodometro: d.hodometro,
      dataHora: `${d.dataHora}:00-03:00`,
    }
  }
  if (d.tipo === "atestado" && d.funcionarioId && d.inicio && d.dias) {
    return {
      tipo: "atestado",
      funcionarioId: d.funcionarioId,
      inicio: d.inicio,
      termino: ultimoDiaDoPeriodo(d.inicio, d.dias),
      dias: d.dias,
      acompanhamento: Boolean(d.acompanhamento),
      nomeAcompanhado: d.acompanhamento ? (d.nomeAcompanhado ?? null) : null,
      // O CID lido vai para o atestado só se a pessoa não mexeu no tipo do
      // documento — é o mesmo campo que a gestão preenche no painel.
      cid: d.lido.tipo === "atestado" ? d.lido.cid : null,
    }
  }
  return null
}

/** callback_data cabe nos 64 bytes do Telegram? (uuid + prefixos curtos). */
export function dadoCabe(dado: string): boolean {
  return new TextEncoder().encode(dado).length <= 64
}
