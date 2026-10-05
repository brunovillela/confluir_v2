/**
 * BR Code Pix ESTÁTICO (onda 5, A3): o "copia e cola" e o QR da cobrança,
 * montado só com a chave da entidade — sem API nem credencial. Padrão EMV
 * MPM do Banco Central: campos TLV, CRC16-CCITT no fim. O `txid` (até 25
 * caracteres alfanuméricos) é como o pagamento volta identificado no extrato
 * e é por ele que a conciliação dá baixa. Sem imports de servidor.
 */

function tlv(id: string, valor: string): string {
  return `${id}${String(valor.length).padStart(2, "0")}${valor}`
}

function semAcento(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9 .\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

/** CRC16-CCITT (poly 0x1021, init 0xFFFF), como o BR Code exige. */
export function crc16(payload: string): string {
  let crc = 0xffff
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0")
}

/** Deixa o txid no formato aceito: só [A-Za-z0-9], até 25. */
export function txidValido(bruto: string): string {
  const t = bruto.replace(/[^A-Za-z0-9]/g, "").slice(0, 25)
  return t || "***"
}

export function gerarBrCodePix(p: {
  chave: string
  /** Nome do recebedor (até 25 caracteres, sem acento). */
  nome: string
  /** Cidade do recebedor (até 15). */
  cidade: string
  valor: number
  txid: string
  /** Texto curto que aparece no app do pagador (até 72). */
  descricao?: string | null
}): string {
  const chave = p.chave.trim()
  const conta = tlv("00", "br.gov.bcb.pix") + tlv("01", chave) + (p.descricao ? tlv("02", semAcento(p.descricao).slice(0, 72)) : "")
  const adicional = tlv("05", txidValido(p.txid))
  const corpo =
    tlv("00", "01") +
    tlv("01", "11") + // 11 = QR estático (pode ser lido mais de uma vez); quem identifica cada pagamento é o txid na conciliação
    tlv("26", conta) +
    tlv("52", "0000") +
    tlv("53", "986") +
    tlv("54", p.valor.toFixed(2)) +
    tlv("58", "BR") +
    tlv("59", semAcento(p.nome).slice(0, 25) || "RECEBEDOR") +
    tlv("60", semAcento(p.cidade).slice(0, 15).toUpperCase() || "BRASIL") +
    tlv("62", adicional) +
    "6304"
  return corpo + crc16(corpo)
}

/** Confere o CRC de um BR Code (para testes e para o texto colado pelo usuário). */
export function brCodeValido(codigo: string): boolean {
  if (codigo.length < 8 || !codigo.includes("6304")) return false
  const corpo = codigo.slice(0, -4)
  return crc16(corpo) === codigo.slice(-4).toUpperCase()
}
