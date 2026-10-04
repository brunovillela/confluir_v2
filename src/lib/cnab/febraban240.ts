import { bancoPorCodigo } from "@/lib/cnab/bancos"

/**
 * CNAB 240 — PAGAMENTOS (onda 5, A2), layout padrão Febraban. Puro: entra a
 * conta da entidade e os itens, sai o texto do arquivo (240 colunas, CRLF).
 *
 * Estrutura: header de arquivo (0) › para cada forma de lançamento um lote
 * com header (1), registros de detalhe (3) e trailer (5) › trailer de
 * arquivo (9). Detalhe de crédito em conta/TED/Pix = segmentos A e B; de
 * boleto = segmentos J e J-52.
 *
 * Formas de lançamento usadas:
 *   01 crédito em conta corrente no mesmo banco
 *   03 DOC/TED para outro banco (o banco decide DOC ou TED)
 *   05 crédito em poupança no mesmo banco
 *   30 pagamento de título do mesmo banco · 31 de outros bancos
 *   45 Pix transferência (chave no segmento B)
 *
 * "Seu número" leva o CÓDIGO DA ORDEM — é por ele que o retorno encontra o
 * item. Nenhuma validação de dígito verificador é feita aqui: quem rejeita
 * conta errada é o banco, no retorno, e a tela mostra o motivo.
 */

export type ContaRemessa = {
  bancoCodigo: string
  agencia: string
  agenciaDv: string | null
  conta: string
  contaDv: string | null
  tipoConta: "corrente" | "poupanca" | string
  convenio: string | null
  titularNome: string
  titularDocumento: string
  versaoArquivo?: string | null
  versaoLote?: string | null
}

export type ItemRemessa = {
  /** Código da ordem: vai em "Seu número" e volta no retorno. */
  seuNumero: string
  favorecidoNome: string
  favorecidoDocumento: string
  valor: number
  dataPagamento: string
  /** Texto curto que aparece no extrato do favorecido (Pix/TED). */
  descricao?: string | null
} & (
  | { tipo: "conta"; bancoCodigo: string; agencia: string; agenciaDv: string | null; conta: string; contaDv: string | null; tipoConta: string }
  | { tipo: "pix"; chave: string }
  | { tipo: "boleto"; codigoBarras: string; vencimento: string | null; beneficiarioNome?: string | null }
)

export type ResultadoRemessa = { conteudo: string; lotes: number; registros: number; totalValor: number }

// ── Utilitários de campo ─────────────────────────────────────────────────────

function semAcento(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\x20-\x7E]/g, " ")
    .toUpperCase()
}

/** Alfanumérico: alinha à esquerda, completa com espaços, corta. */
export function alfa(v: string | null | undefined, tamanho: number): string {
  return semAcento(v ?? "").slice(0, tamanho).padEnd(tamanho, " ")
}

/** Numérico: só dígitos, alinha à direita com zeros, corta pela esquerda. */
export function num(v: string | number | null | undefined, tamanho: number): string {
  const d = String(v ?? "").replace(/\D/g, "")
  return d.slice(-tamanho).padStart(tamanho, "0")
}

/** Valor em centavos (2 decimais implícitos). */
export function valor(v: number, tamanho: number): string {
  return num(Math.round(Math.abs(v) * 100), tamanho)
}

/** "2026-10-04" → "04102026". */
export function dataDdmmaaaa(iso: string | null | undefined): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return "00000000"
  return `${iso.slice(8, 10)}${iso.slice(5, 7)}${iso.slice(0, 4)}`
}

function tipoInscricao(doc: string): "1" | "2" {
  return doc.replace(/\D/g, "").length > 11 ? "2" : "1"
}

function tipoChavePix(chave: string): "1" | "2" | "3" | "4" {
  const c = chave.trim()
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(c)) return "4" // aleatória (EVP)
  if (/@/.test(c)) return "2" // e-mail
  const d = c.replace(/\D/g, "")
  if (/^\+?55?\d{10,11}$/.test(c.replace(/[\s()-]/g, "")) && !/^\d{11}$/.test(d)) return "1" // telefone
  if (d.length === 11 || d.length === 14) return "3" // CPF/CNPJ
  return "1"
}

/** Linha digitável (47) ou código de barras (44) → código de barras (44). */
export function codigoDeBarrasDe(entrada: string): string | null {
  const d = entrada.replace(/\D/g, "")
  if (d.length === 44) return d
  if (d.length === 47) {
    // Campos: 1 (0-9) banco+moeda+5 livres+dv · 2 (10-20) 10 livres+dv · 3 (21-31) 10 livres+dv · 4 (32) dv geral · 5 (33-46) fator+valor
    const c1 = d.slice(0, 9)
    const c2 = d.slice(10, 20)
    const c3 = d.slice(21, 31)
    const dv = d.slice(32, 33)
    const c5 = d.slice(33, 47)
    return `${c1.slice(0, 4)}${dv}${c5}${c1.slice(4)}${c2}${c3}`
  }
  if (d.length === 48) return null // arrecadação (convênio): fora deste dia
  return null
}

function formaDoItem(item: ItemRemessa, contaBanco: string): string {
  if (item.tipo === "pix") return "45"
  if (item.tipo === "boleto") return item.codigoBarras.slice(0, 3) === contaBanco ? "30" : "31"
  if (item.bancoCodigo === contaBanco) return item.tipoConta === "poupanca" ? "05" : "01"
  return "03"
}

// ── Registros ────────────────────────────────────────────────────────────────

function headerArquivo(c: ContaRemessa, numeroRemessa: number, agora: Date): string {
  const banco = bancoPorCodigo(c.bancoCodigo)
  const versao = c.versaoArquivo ?? banco?.versaoArquivo ?? "103"
  const dd = String(agora.getDate()).padStart(2, "0")
  const mm = String(agora.getMonth() + 1).padStart(2, "0")
  const hh = String(agora.getHours()).padStart(2, "0")
  const mi = String(agora.getMinutes()).padStart(2, "0")
  const ss = String(agora.getSeconds()).padStart(2, "0")
  return (
    num(c.bancoCodigo, 3) + // 1-3 banco
    "0000" + // 4-7 lote
    "0" + // 8 registro
    alfa("", 9) + // 9-17 CNAB
    tipoInscricao(c.titularDocumento) + // 18
    num(c.titularDocumento, 14) + // 19-32
    alfa(c.convenio, 20) + // 33-52 convênio
    num(c.agencia, 5) + // 53-57
    alfa(c.agenciaDv, 1) + // 58
    num(c.conta, 12) + // 59-70
    alfa(c.contaDv, 1) + // 71
    alfa("", 1) + // 72 dv ag/conta
    alfa(c.titularNome, 30) + // 73-102
    alfa(banco?.nome ?? "", 30) + // 103-132
    alfa("", 10) + // 133-142
    "1" + // 143 remessa
    `${dd}${mm}${agora.getFullYear()}` + // 144-151
    `${hh}${mi}${ss}` + // 152-157
    num(numeroRemessa, 6) + // 158-163 NSA
    num(versao, 3) + // 164-166
    num(240, 5) + // 167-171 densidade
    alfa("", 20) + // 172-191 banco
    alfa("CONFLUIR", 20) + // 192-211 empresa
    alfa("", 29) // 212-240
  )
}

function headerLote(c: ContaRemessa, lote: number, forma: string): string {
  const banco = bancoPorCodigo(c.bancoCodigo)
  const versao = c.versaoLote ?? banco?.versaoLote ?? "046"
  const tipoServico = forma === "30" || forma === "31" ? "98" : "20" // 98 pagamentos diversos (títulos) · 20 fornecedores
  return (
    num(c.bancoCodigo, 3) +
    num(lote, 4) +
    "1" +
    "C" + // 9 operação crédito
    num(tipoServico, 2) + // 10-11
    num(forma, 2) + // 12-13 forma de lançamento
    num(versao, 3) + // 14-16
    alfa("", 1) + // 17
    tipoInscricao(c.titularDocumento) + // 18
    num(c.titularDocumento, 14) + // 19-32
    alfa(c.convenio, 20) + // 33-52
    num(c.agencia, 5) +
    alfa(c.agenciaDv, 1) +
    num(c.conta, 12) +
    alfa(c.contaDv, 1) +
    alfa("", 1) +
    alfa(c.titularNome, 30) + // 73-102
    alfa("", 40) + // 103-142 mensagem
    alfa("", 30) + // 143-172 logradouro
    num(0, 5) + // 173-177 número
    alfa("", 15) + // 178-192 complemento
    alfa("", 20) + // 193-212 cidade
    num(0, 8) + // 213-220 CEP
    alfa("", 2) + // 221-222 UF
    alfa("", 8) + // 223-230 forma de pagamento (uso do banco)
    alfa("", 10) // 231-240 ocorrências
  )
}

function segmentoA(c: ContaRemessa, lote: number, seq: number, item: ItemRemessa, forma: string): string {
  const contaDoItem = item.tipo === "conta" ? item : null
  const camaraTed = forma === "03" ? "018" : "000" // 018 TED · 700 DOC
  return (
    num(c.bancoCodigo, 3) +
    num(lote, 4) +
    "3" +
    num(seq, 5) + // 9-13
    "A" + // 14
    "000" + // 15-17 tipo de movimento: 0 inclusão, 00 crédito
    camaraTed + // 18-20 câmara
    num(contaDoItem ? contaDoItem.bancoCodigo : c.bancoCodigo, 3) + // 21-23 banco favorecido (Pix: o da própria conta, ignorado)
    num(contaDoItem?.agencia ?? 0, 5) + // 24-28
    alfa(contaDoItem?.agenciaDv ?? "", 1) + // 29
    num(contaDoItem?.conta ?? 0, 12) + // 30-41
    alfa(contaDoItem?.contaDv ?? "", 1) + // 42
    alfa("", 1) + // 43
    alfa(item.favorecidoNome, 30) + // 44-73
    alfa(item.seuNumero, 20) + // 74-93 seu número
    dataDdmmaaaa(item.dataPagamento) + // 94-101
    "BRL" + // 102-104
    num(0, 15) + // 105-119 quantidade moeda
    valor(item.valor, 15) + // 120-134
    alfa("", 20) + // 135-154 nosso número (banco)
    "00000000" + // 155-162 data real
    num(0, 15) + // 163-177 valor real
    alfa(item.descricao ?? "", 40) + // 178-217 informação 2
    alfa(forma === "45" ? "" : "", 2) + // 218-219 finalidade DOC
    alfa(forma === "03" ? "00010" : "", 5) + // 220-224 finalidade TED (00010 crédito em conta)
    alfa("", 2) + // 225-226 complemento
    alfa("", 3) + // 227-229 CNAB
    "0" + // 230 aviso
    alfa("", 10) // 231-240 ocorrências
  )
}

function segmentoB(c: ContaRemessa, lote: number, seq: number, item: ItemRemessa): string {
  const pix = item.tipo === "pix" ? item.chave.trim() : null
  return (
    num(c.bancoCodigo, 3) +
    num(lote, 4) +
    "3" +
    num(seq, 5) +
    "B" +
    (pix ? "0" + tipoChavePix(pix) + " " : alfa("", 3)) + // 15-17 forma de iniciação (Pix: tipo da chave)
    tipoInscricao(item.favorecidoDocumento) + // 18
    num(item.favorecidoDocumento, 14) + // 19-32
    alfa("", 30) + // 33-62 logradouro
    num(0, 5) + // 63-67
    alfa("", 15) + // 68-82
    alfa("", 15) + // 83-97 bairro
    alfa("", 20) + // 98-117 cidade
    num(0, 8) + // 118-125 CEP
    alfa("", 2) + // 126-127 UF
    (pix ? alfa(pix, 99) + alfa("", 1) : dataDdmmaaaa(item.dataPagamento) + valor(item.valor, 15) + num(0, 15) + num(0, 15) + num(0, 15) + num(0, 15) + alfa("", 15) + alfa("", 2)) + // 128-227: Pix = chave (99) · demais = vencimento/valores
    num(0, 6) + // 228-233 código ISPB / aviso
    alfa("", 7) // 234-240
  )
}

function segmentoJ(c: ContaRemessa, lote: number, seq: number, item: ItemRemessa & { tipo: "boleto" }): string {
  const cb = item.codigoBarras
  return (
    num(c.bancoCodigo, 3) +
    num(lote, 4) +
    "3" +
    num(seq, 5) +
    "J" +
    "000" + // 15-17
    num(cb, 44) + // 18-61 código de barras
    alfa(item.beneficiarioNome ?? item.favorecidoNome, 30) + // 62-91 nome do beneficiário (cedente)
    dataDdmmaaaa(item.vencimento ?? item.dataPagamento) + // 92-99
    valor(item.valor, 15) + // 100-114 valor do título
    num(0, 15) + // 115-129 desconto
    num(0, 15) + // 130-144 acréscimo
    dataDdmmaaaa(item.dataPagamento) + // 145-152
    valor(item.valor, 15) + // 153-167 valor do pagamento
    num(0, 15) + // 168-182 quantidade moeda
    alfa(item.seuNumero, 20) + // 183-202 seu número
    alfa("", 20) + // 203-222 nosso número
    "09" + // 223-224 código da moeda (09 real)
    alfa("", 6) + // 225-230
    alfa("", 10) // 231-240 ocorrências
  )
}

function segmentoJ52(c: ContaRemessa, lote: number, seq: number, item: ItemRemessa & { tipo: "boleto" }): string {
  return (
    num(c.bancoCodigo, 3) +
    num(lote, 4) +
    "3" +
    num(seq, 5) +
    "J" +
    alfa("", 1) + // 15
    "00" + // 16-17 movimento
    "52" + // 18-19 identificação do registro opcional
    tipoInscricao(c.titularDocumento) + // 20 pagador
    num(c.titularDocumento, 15) + // 21-35
    alfa(c.titularNome, 40) + // 36-75
    tipoInscricao(item.favorecidoDocumento) + // 76 beneficiário
    num(item.favorecidoDocumento, 15) + // 77-91
    alfa(item.beneficiarioNome ?? item.favorecidoNome, 40) + // 92-131
    "0" + // 132 sacador
    num(0, 15) + // 133-147
    alfa("", 40) + // 148-187
    alfa("", 53) // 188-240
  )
}

function trailerLote(c: ContaRemessa, lote: number, registros: number, total: number): string {
  return num(c.bancoCodigo, 3) + num(lote, 4) + "5" + alfa("", 9) + num(registros, 6) + valor(total, 18) + num(0, 18) + num(0, 6) + alfa("", 165) + alfa("", 10)
}

function trailerArquivo(c: ContaRemessa, lotes: number, registros: number): string {
  return num(c.bancoCodigo, 3) + "9999" + "9" + alfa("", 9) + num(lotes, 6) + num(registros, 6) + num(0, 6) + alfa("", 205)
}

// ── Montagem ─────────────────────────────────────────────────────────────────

export function gerarRemessa240(p: { conta: ContaRemessa; numeroRemessa: number; itens: ItemRemessa[]; agora?: Date }): ResultadoRemessa {
  const agora = p.agora ?? new Date()
  const linhas: string[] = [headerArquivo(p.conta, p.numeroRemessa, agora)]
  // Um lote por forma de lançamento, na ordem em que aparecem.
  const porForma = new Map<string, ItemRemessa[]>()
  for (const item of p.itens) {
    const forma = formaDoItem(item, p.conta.bancoCodigo)
    porForma.set(forma, [...(porForma.get(forma) ?? []), item])
  }
  let lote = 0
  let registrosArquivo = 1
  let totalValor = 0
  for (const [forma, itens] of porForma) {
    lote++
    const doLote: string[] = [headerLote(p.conta, lote, forma)]
    let seq = 0
    let totalLote = 0
    for (const item of itens) {
      if (item.tipo === "boleto") {
        doLote.push(segmentoJ(p.conta, lote, ++seq, item))
        doLote.push(segmentoJ52(p.conta, lote, ++seq, item))
      } else {
        doLote.push(segmentoA(p.conta, lote, ++seq, item, forma))
        doLote.push(segmentoB(p.conta, lote, ++seq, item))
      }
      totalLote += item.valor
    }
    doLote.push(trailerLote(p.conta, lote, doLote.length + 1, totalLote))
    totalValor += totalLote
    registrosArquivo += doLote.length
    linhas.push(...doLote)
  }
  registrosArquivo += 1
  linhas.push(trailerArquivo(p.conta, lote, registrosArquivo))
  for (const [i, l] of linhas.entries()) {
    if (l.length !== 240) throw new Error(`Registro ${i + 1} com ${l.length} colunas (esperado 240).`)
  }
  return { conteudo: linhas.join("\r\n") + "\r\n", lotes: lote, registros: registrosArquivo, totalValor }
}

// ── Retorno ──────────────────────────────────────────────────────────────────

export type OcorrenciaRetorno = {
  seuNumero: string
  segmento: "A" | "J"
  codigos: string[]
  /** true quando o banco confirmou o pagamento (00 ou BD). */
  pago: boolean
  descricao: string
  dataReal: string | null
  valorReal: number | null
}

/** Ocorrências Febraban mais comuns no retorno de pagamentos. */
export const OCORRENCIAS: Record<string, string> = {
  "00": "Crédito ou débito efetuado",
  BD: "Inclusão de pagamento liquidado",
  AA: "Controle inválido",
  AB: "Tipo de operação inválido",
  AC: "Tipo de serviço inválido",
  AD: "Forma de lançamento inválida",
  AE: "Tipo/número de inscrição inválido",
  AF: "Código de convênio inválido",
  AG: "Agência/conta corrente/DV inválido",
  AH: "Número sequencial do registro no lote inválido",
  AI: "Código de segmento de detalhe inválido",
  AJ: "Tipo de movimento inválido",
  AK: "Código da câmara de compensação do banco favorecido/depositário inválido",
  AL: "Código do banco favorecido ou depositário inválido",
  AM: "Agência mantenedora da conta corrente do favorecido inválida",
  AN: "Conta corrente/DV do favorecido inválido",
  AO: "Nome do favorecido não informado",
  AP: "Data de lançamento inválida",
  AQ: "Tipo/quantidade da moeda inválido",
  AR: "Valor do lançamento inválido",
  AS: "Aviso ao favorecido — identificação inválida",
  AT: "Tipo/número de inscrição do favorecido inválido",
  AU: "Logradouro do favorecido não informado",
  AV: "Número do local do favorecido não informado",
  AW: "Cidade do favorecido não informada",
  AX: "CEP/complemento do favorecido inválido",
  AY: "Sigla do estado do favorecido inválida",
  AZ: "Código/nome do banco depositário inválido",
  BA: "Código/nome da agência depositária não informado",
  BB: "Seu número inválido",
  BC: "Nosso número inválido",
  BE: "Inclusão efetuada com sucesso",
  BF: "Alteração efetuada com sucesso",
  BG: "Exclusão efetuada com sucesso",
  BH: "Agência/conta impedida legalmente",
  BI: "Empresa não pagou salário",
  BJ: "Falecimento do mutuário",
  BK: "Empresa não enviou remessa do mutuário",
  BL: "Empresa não enviou remessa no vencimento",
  BM: "Valor da parcela inválido",
  BN: "Identificação do contrato inválida",
  BO: "Operação de consignação incluída com sucesso",
  BP: "Operação de consignação alterada com sucesso",
  BQ: "Operação de consignação excluída com sucesso",
  BR: "Operação de consignação liquidada com sucesso",
  CA: "Código de barras — código do banco inválido",
  CB: "Código de barras — código da moeda inválido",
  CC: "Código de barras — dígito verificador geral inválido",
  CD: "Código de barras — valor do título inválido",
  CE: "Código de barras — campo livre inválido",
  CF: "Valor do documento inválido",
  CG: "Valor do abatimento inválido",
  CH: "Valor do desconto inválido",
  CI: "Valor de mora inválido",
  CJ: "Valor da multa inválido",
  CK: "Valor do IR inválido",
  CL: "Valor do ISS inválido",
  CM: "Valor do IOF inválido",
  CN: "Valor de outras deduções inválido",
  CO: "Valor de outros acréscimos inválido",
  HA: "Lote não aceito",
  HB: "Inscrição da empresa inválida para o contrato",
  HC: "Convênio com a empresa inexistente/inválido para o contrato",
  HD: "Agência/conta corrente da empresa inexistente/inválida para o contrato",
  HE: "Tipo de serviço inválido para o contrato",
  HF: "Conta corrente da empresa com saldo insuficiente",
  HG: "Lote de serviço fora de sequência",
  HH: "Lote de serviço inválido",
  HI: "Arquivo não aceito",
  HJ: "Tipo de registro inválido",
  HK: "Código remessa/retorno inválido",
  HL: "Versão de layout inválida",
  HM: "Mutuário não identificado",
  HN: "Tipo do benefício não permite empréstimo",
  HO: "Benefício cessado/suspenso",
  HP: "Benefício possui representante legal",
  HQ: "Benefício é do tipo PA (pensão alimentícia)",
  HR: "Quantidade de contratos permitida excedida",
  HS: "Benefício não pertence ao banco informado",
  HT: "Início do desconto informado já ultrapassado",
  HU: "Número da parcela inválida",
  HV: "Quantidade de parcela inválida",
  HW: "Margem consignável excedida para o mutuário dentro do prazo do contrato",
  HX: "Empréstimo já cadastrado",
  HY: "Empréstimo inexistente",
  HZ: "Empréstimo já encerrado",
  TA: "Lote não aceito — totais do lote com diferença",
  YA: "Título não encontrado",
  YB: "Identificador registro opcional inválido",
  YC: "Código padrão inválido",
  YD: "Código de ocorrência inválido",
  YE: "Complemento de ocorrência inválido",
  YF: "Alegação já informada",
  ZA: "Agência/conta do favorecido substituída",
  ZB: "Divergência entre o primeiro e o último nome do beneficiário versus nome na Receita Federal",
  ZC: "Confirmação de antecipação de valor",
  ZD: "Antecipação parcial de valor",
  ZE: "Título bloqueado na base",
  ZF: "Sistema em contingência — título valor maior que referência",
  ZG: "Sistema em contingência — título vencido",
  ZH: "Sistema em contingência — título indexado",
  ZI: "Beneficiário divergente",
  ZJ: "Limite de pagamentos excedido",
  ZK: "Boleto já liquidado",
  "5A": "Agendado sob lista de débito",
  "5B": "Pagamento não autorizado",
  "5C": "Pagamento programado",
}

function lerData(d: string): string | null {
  if (!/^\d{8}$/.test(d) || d === "00000000") return null
  return `${d.slice(4, 8)}-${d.slice(2, 4)}-${d.slice(0, 2)}`
}

/** Lê um retorno CNAB 240 de pagamentos e devolve uma ocorrência por item (segmento A ou J). */
export function lerRetorno240(texto: string): { ocorrencias: OcorrenciaRetorno[]; bancoCodigo: string | null; lotesRejeitados: string[] } {
  const linhas = texto.split(/\r?\n/).filter((l) => l.length >= 240)
  const ocorrencias: OcorrenciaRetorno[] = []
  const lotesRejeitados: string[] = []
  let bancoCodigo: string | null = null
  for (const l of linhas) {
    const registro = l[7]
    if (registro === "0") bancoCodigo = l.slice(0, 3)
    if (registro === "1") {
      const oc = l.slice(230, 240).trim()
      if (oc && !/^(00|BE|BF)/.test(oc)) lotesRejeitados.push(`${l.slice(3, 7)}: ${oc.match(/.{2}/g)?.map((c) => OCORRENCIAS[c] ?? c).join("; ") ?? oc}`)
    }
    if (registro !== "3") continue
    const segmento = l[13]
    if (segmento !== "A" && segmento !== "J") continue
    if (segmento === "J" && l.slice(17, 19) === "52") continue // J-52 não traz ocorrência própria
    const seuNumero = (segmento === "A" ? l.slice(73, 93) : l.slice(182, 202)).trim()
    const brutos = l.slice(230, 240).trim()
    const codigos = brutos ? (brutos.match(/.{2}/g) ?? []).filter((c) => c.trim() !== "") : []
    const pago = codigos.length > 0 && codigos.every((c) => c === "00" || c === "BD" || c === "BE")
    const dataReal = segmento === "A" ? lerData(l.slice(154, 162)) : lerData(l.slice(144, 152))
    const valorRealBruto = segmento === "A" ? l.slice(162, 177) : l.slice(152, 167)
    const valorReal = /^\d{15}$/.test(valorRealBruto) && Number(valorRealBruto) > 0 ? Number(valorRealBruto) / 100 : null
    ocorrencias.push({
      seuNumero,
      segmento,
      codigos,
      pago,
      descricao: codigos.length ? codigos.map((c) => OCORRENCIAS[c] ?? `Código ${c}`).join("; ") : "Sem ocorrência informada",
      dataReal,
      valorReal,
    })
  }
  return { ocorrencias, bancoCodigo, lotesRejeitados }
}
