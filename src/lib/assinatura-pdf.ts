import { createHash, verify as verificarAssinatura, X509Certificate, constants as cryptoConstants } from "node:crypto"

import { raizConfiada } from "@/lib/icp-brasil/raizes"

/**
 * VALIDAÇÃO DE ASSINATURA EM PDF (onda 5, A4) — PAdES / CMS, só com o
 * `node:crypto`. Para cada assinatura do PDF (dicionário /Sig com /ByteRange
 * e /Contents):
 *   1. integridade: o resumo dos bytes cobertos pelo ByteRange precisa ser o
 *      `messageDigest` dos atributos assinados;
 *   2. assinatura: a assinatura sobre os atributos assinados confere com a
 *      chave pública do certificado do signatário;
 *   3. cadeia: cada certificado é emitido (e assinado) pelo seguinte, até uma
 *      raiz autoassinada — que se chama ICP-Brasil e, se a lista
 *      `lib/icp-brasil/raizes.ts` estiver preenchida, confere com ela;
 *   4. validade: a data da assinatura dentro do prazo do certificado;
 *   5. CPF: o do certificado (otherName 2.16.76.1.3.1 da ICP-Brasil ou o
 *      "NOME:CPF" do CN) contra o esperado.
 * Não consulta LCR/OCSP (revogação) nem carimbo de tempo: isso fica para o
 * laudo do ITI, opcional. Puro: testável em Node sem servidor.
 */

export type AssinaturaVerificada = {
  subFilter: string | null
  nome: string | null
  cpf: string | null
  emissor: string | null
  raiz: string | null
  raizSha256: string | null
  /** Cadeia fecha numa raiz autoassinada. */
  cadeiaFecha: boolean
  /** A raiz tem nome de ICP-Brasil. */
  icpBrasilPeloNome: boolean
  /** A raiz confere com a lista de raízes confiadas. */
  raizConfiada: boolean
  assinadoEm: string | null
  integra: boolean
  assinaturaOk: boolean
  dentroDaValidade: boolean | null
  /** A assinatura cobre o arquivo inteiro (é a última) ou só uma versão anterior. */
  cobreArquivoTodo: boolean
  algoritmo: string | null
  erro: string | null
}

export type ValidacaoAssinatura = {
  situacao: "valida" | "ressalva" | "invalida" | "sem_assinatura" | "erro"
  resumo: string
  assinaturas: AssinaturaVerificada[]
  cpfEsperado: string | null
  /** null = sem CPF esperado para comparar. */
  cpfConfere: boolean | null
  verificadoEm: string
  versao: 1
}

// ── DER ──────────────────────────────────────────────────────────────────────

type Tlv = { tag: number; constructed: boolean; start: number; valueStart: number; end: number }

function lerTlv(b: Uint8Array, off: number): Tlv {
  if (off >= b.length) throw new Error("DER truncado")
  const tagByte = b[off]
  let p = off + 1
  let tag = tagByte & 0x1f
  if (tag === 0x1f) {
    tag = 0
    while (p < b.length && b[p] & 0x80) {
      tag = (tag << 7) | (b[p] & 0x7f)
      p++
    }
    tag = (tag << 7) | (b[p] & 0x7f)
    p++
  }
  let len = b[p++]
  if (len & 0x80) {
    const n = len & 0x7f
    len = 0
    for (let i = 0; i < n; i++) len = (len << 8) | b[p++]
  }
  // `tag` guarda o byte inteiro (classe + construído + número): as comparações abaixo usam 0x30, 0x31, 0xA0…
  return { tag: (tagByte & 0x1f) === 0x1f ? tag : tagByte, constructed: (tagByte & 0x20) !== 0, start: off, valueStart: p, end: p + len }
}

function filhos(b: Uint8Array, t: Tlv): Tlv[] {
  const saida: Tlv[] = []
  let p = t.valueStart
  while (p < t.end) {
    const f = lerTlv(b, p)
    saida.push(f)
    p = f.end
  }
  return saida
}

function oidDe(b: Uint8Array, t: Tlv): string {
  const v = b.subarray(t.valueStart, t.end)
  if (v.length === 0) return ""
  const partes: number[] = [Math.floor(v[0] / 40), v[0] % 40]
  let acc = 0
  for (let i = 1; i < v.length; i++) {
    acc = acc * 128 + (v[i] & 0x7f)
    if (!(v[i] & 0x80)) {
      partes.push(acc)
      acc = 0
    }
  }
  if (partes[0] > 2) {
    // primeiro arco 2.x com segundo ≥ 40
    partes[1] += (partes[0] - 2) * 40
    partes[0] = 2
  }
  return partes.join(".")
}

function hex(v: Uint8Array): string {
  return Array.from(v, (x) => x.toString(16).padStart(2, "0")).join("").toUpperCase()
}

function textoDe(b: Uint8Array, t: Tlv): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(b.subarray(t.valueStart, t.end))
}

function dataAsn1(b: Uint8Array, t: Tlv): string | null {
  const s = new TextDecoder("latin1").decode(b.subarray(t.valueStart, t.end))
  // UTCTime YYMMDDhhmmssZ · GeneralizedTime YYYYMMDDhhmmssZ
  const m = t.tag === 0x17 ? /^(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?Z?$/.exec(s) : /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?/.exec(s)
  if (!m) return null
  const ano = t.tag === 0x17 ? (Number(m[1]) >= 50 ? 1900 : 2000) + Number(m[1]) : Number(m[1])
  return new Date(Date.UTC(ano, Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] ?? 0))).toISOString()
}

const OID = {
  signedData: "1.2.840.113549.1.7.2",
  messageDigest: "1.2.840.113549.1.9.4",
  signingTime: "1.2.840.113549.1.9.5",
  sha1: "1.3.14.3.2.26",
  sha256: "2.16.840.1.101.3.4.2.1",
  sha384: "2.16.840.1.101.3.4.2.2",
  sha512: "2.16.840.1.101.3.4.2.3",
  rsa: "1.2.840.113549.1.1.1",
  sha1Rsa: "1.2.840.113549.1.1.5",
  sha256Rsa: "1.2.840.113549.1.1.11",
  sha384Rsa: "1.2.840.113549.1.1.12",
  sha512Rsa: "1.2.840.113549.1.1.13",
  rsaPss: "1.2.840.113549.1.1.10",
  ecdsaSha256: "1.2.840.10045.4.3.2",
  ecdsaSha384: "1.2.840.10045.4.3.3",
  ecdsaSha512: "1.2.840.10045.4.3.4",
  san: "2.5.29.17",
  cpfIcp: "2.16.76.1.3.1",
}

function hashDe(oid: string): string | null {
  return ({ [OID.sha1]: "sha1", [OID.sha256]: "sha256", [OID.sha384]: "sha384", [OID.sha512]: "sha512" } as Record<string, string>)[oid] ?? null
}

// ── Certificado: CPF da ICP-Brasil ───────────────────────────────────────────

function cpfDoCertificado(cert: X509Certificate): string | null {
  // 1) otherName 2.16.76.1.3.1 na SAN: AAAAMMDD + CPF(11) + NIS(11) + RG(15) + …
  try {
    const raw = new Uint8Array(cert.raw)
    const top = lerTlv(raw, 0)
    const tbs = filhos(raw, top)[0]
    const campos = filhos(raw, tbs)
    const ext = campos.find((c) => c.tag === 0xa3)
    if (ext) {
      const seqExt = filhos(raw, ext)[0]
      for (const e of filhos(raw, seqExt)) {
        const partes = filhos(raw, e)
        if (oidDe(raw, partes[0]) !== OID.san) continue
        const octet = partes[partes.length - 1]
        const san = lerTlv(raw, octet.valueStart)
        for (const nome of filhos(raw, san)) {
          if (nome.tag !== 0xa0) continue // otherName
          const [oidT, valT] = filhos(raw, nome)
          if (oidDe(raw, oidT) !== OID.cpfIcp) continue
          const interno = valT.constructed ? filhos(raw, valT)[0] : valT
          const digitos = textoDe(raw, interno).replace(/\D/g, "")
          if (digitos.length >= 19) return digitos.slice(8, 19)
        }
      }
    }
  } catch {
    // SAN ilegível: tenta o CN
  }
  // 2) CN "NOME:CPF"
  const m = /CN=([^,\n]+)/.exec(cert.subject)
  const cn = m?.[1] ?? ""
  const d = /:(\d{11})\s*$/.exec(cn)
  return d ? d[1] : null
}

function nomeDoCertificado(cert: X509Certificate): string | null {
  const m = /CN=([^,\n]+)/.exec(cert.subject)
  return m ? m[1].replace(/:\d{11}\s*$/, "").trim() : null
}

function cnDe(dn: string): string | null {
  const m = /CN=([^,\n]+)/.exec(dn)
  return m ? m[1].trim() : null
}

function serialNormal(s: string): string {
  return s.replace(/^0+/, "").toUpperCase()
}

// ── CMS ──────────────────────────────────────────────────────────────────────

function verificarCms(cms: Uint8Array, dadosCobertos: Uint8Array): Omit<AssinaturaVerificada, "subFilter" | "cobreArquivoTodo"> {
  const base: Omit<AssinaturaVerificada, "subFilter" | "cobreArquivoTodo"> = {
    nome: null,
    cpf: null,
    emissor: null,
    raiz: null,
    raizSha256: null,
    cadeiaFecha: false,
    icpBrasilPeloNome: false,
    raizConfiada: false,
    assinadoEm: null,
    integra: false,
    assinaturaOk: false,
    dentroDaValidade: null,
    algoritmo: null,
    erro: null,
  }
  try {
    const contentInfo = lerTlv(cms, 0)
    const [tipoT, conteudoT] = filhos(cms, contentInfo)
    if (oidDe(cms, tipoT) !== OID.signedData) return { ...base, erro: "A assinatura não é CMS SignedData." }
    const signedData = filhos(cms, conteudoT)[0]
    const sd = filhos(cms, signedData)
    // version, digestAlgorithms, encapContentInfo, [0] certs, [1] crls, signerInfos
    let certsT: Tlv | null = null
    let signerInfosT: Tlv | null = null
    for (const t of sd.slice(3)) {
      if (t.tag === 0xa0) certsT = t
      else if (t.tag === 0x31) signerInfosT = t
    }
    if (!signerInfosT) return { ...base, erro: "Sem SignerInfo." }
    const certs: X509Certificate[] = []
    if (certsT) {
      for (const c of filhos(cms, certsT)) {
        if (c.tag !== 0x30) continue
        try {
          certs.push(new X509Certificate(Buffer.from(cms.subarray(c.start, c.end))))
        } catch {
          // certificado ilegível: ignora
        }
      }
    }
    const signerInfo = filhos(cms, signerInfosT)[0]
    const si = filhos(cms, signerInfo)
    // version, sid, digestAlg, [0] signedAttrs?, sigAlg, signature, [1] unsigned?
    const sid = si[1]
    const digestAlgOid = oidDe(cms, filhos(cms, si[2])[0])
    let idx = 3
    let signedAttrs: Tlv | null = null
    if (si[idx].tag === 0xa0) {
      signedAttrs = si[idx]
      idx++
    }
    const sigAlg = si[idx]
    const sigAlgOid = oidDe(cms, filhos(cms, sigAlg)[0])
    const assinatura = cms.subarray(si[idx + 1].valueStart, si[idx + 1].end)

    // Signatário pelo serial.
    let signer: X509Certificate | null = null
    if (sid.tag === 0x30) {
      const [, serialT] = filhos(cms, sid)
      const serial = serialNormal(hex(cms.subarray(serialT.valueStart, serialT.end)))
      signer = certs.find((c) => serialNormal(c.serialNumber) === serial) ?? null
    }
    if (!signer) signer = certs[0] ?? null
    if (!signer) return { ...base, erro: "Certificado do signatário não veio na assinatura." }

    base.nome = nomeDoCertificado(signer)
    base.cpf = cpfDoCertificado(signer)
    base.emissor = cnDe(signer.issuer)

    // Integridade: messageDigest × hash dos bytes cobertos.
    const hashAlg = hashDe(digestAlgOid)
    if (!hashAlg) return { ...base, erro: `Algoritmo de resumo não suportado (${digestAlgOid}).` }
    base.algoritmo = `${hashAlg.toUpperCase()} · ${({ [OID.rsa]: "RSA", [OID.sha1Rsa]: "RSA", [OID.sha256Rsa]: "RSA", [OID.sha384Rsa]: "RSA", [OID.sha512Rsa]: "RSA", [OID.rsaPss]: "RSA-PSS", [OID.ecdsaSha256]: "ECDSA", [OID.ecdsaSha384]: "ECDSA", [OID.ecdsaSha512]: "ECDSA" } as Record<string, string>)[sigAlgOid] ?? sigAlgOid}`
    if (!signedAttrs) return { ...base, erro: "Assinatura sem atributos assinados (não é CAdES/PAdES)." }
    let messageDigest: Uint8Array | null = null
    for (const attr of filhos(cms, signedAttrs)) {
      const [oidT, setT] = filhos(cms, attr)
      const oid = oidDe(cms, oidT)
      const valor = filhos(cms, setT)[0]
      if (oid === OID.messageDigest) messageDigest = cms.subarray(valor.valueStart, valor.end)
      if (oid === OID.signingTime) base.assinadoEm = dataAsn1(cms, valor)
    }
    if (!messageDigest) return { ...base, erro: "Sem messageDigest nos atributos assinados." }
    const resumo = createHash(hashAlg).update(dadosCobertos).digest()
    base.integra = hex(messageDigest) === hex(new Uint8Array(resumo))

    // Assinatura sobre os atributos assinados (re-etiquetados como SET).
    const attrsDer = Buffer.from(cms.subarray(signedAttrs.start, signedAttrs.end))
    attrsDer[0] = 0x31
    const ehPss = sigAlgOid === OID.rsaPss
    try {
      base.assinaturaOk = verificarAssinatura(
        hashAlg,
        attrsDer,
        ehPss ? { key: signer.publicKey, padding: cryptoConstants.RSA_PKCS1_PSS_PADDING, saltLength: cryptoConstants.RSA_PSS_SALTLEN_AUTO } : signer.publicKey,
        Buffer.from(assinatura)
      )
    } catch (e) {
      base.erro = `Falha ao verificar a assinatura: ${(e as Error).message}`
    }

    // Validade na data da assinatura.
    const quando = base.assinadoEm ? new Date(base.assinadoEm) : null
    if (quando) base.dentroDaValidade = quando >= new Date(signer.validFrom) && quando <= new Date(signer.validTo)

    // Cadeia.
    const cadeia: X509Certificate[] = [signer]
    const vistos = new Set<string>([signer.fingerprint256])
    let atual = signer
    for (let i = 0; i < 10; i++) {
      if (atual.checkIssued(atual) && atual.verify(atual.publicKey)) {
        base.cadeiaFecha = true
        break
      }
      const emissor = certs.find((c) => !vistos.has(c.fingerprint256) && atual.checkIssued(c) && atual.verify(c.publicKey))
      if (!emissor) break
      cadeia.push(emissor)
      vistos.add(emissor.fingerprint256)
      atual = emissor
    }
    const topo = cadeia[cadeia.length - 1]
    base.raiz = cnDe(base.cadeiaFecha ? topo.subject : topo.issuer)
    base.raizSha256 = base.cadeiaFecha ? topo.fingerprint256.replace(/:/g, "") : null
    base.icpBrasilPeloNome = cadeia.some((c) => /ICP-Brasil|Autoridade Certificadora Raiz Brasileira/i.test(c.issuer) || /ICP-Brasil|Autoridade Certificadora Raiz Brasileira/i.test(c.subject))
    base.raizConfiada = Boolean(base.raizSha256 && raizConfiada(base.raizSha256))
    return base
  } catch (e) {
    return { ...base, erro: `Assinatura ilegível: ${(e as Error).message}` }
  }
}

// ── PDF ──────────────────────────────────────────────────────────────────────

function limparCpf(v: string | null | undefined): string | null {
  const d = (v ?? "").replace(/\D/g, "")
  return d.length === 11 ? d : null
}

export function validarAssinaturasPdf(bytes: Uint8Array, cpfEsperado?: string | null): ValidacaoAssinatura {
  const verificadoEm = new Date().toISOString()
  const esperado = limparCpf(cpfEsperado)
  const texto = new TextDecoder("latin1").decode(bytes)
  const assinaturas: AssinaturaVerificada[] = []
  const re = /\/ByteRange\s*\[\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*\]/g
  const vistos = new Set<string>()
  let m: RegExpExecArray | null
  while ((m = re.exec(texto))) {
    const [a, b, c, d] = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])]
    const chave = `${a}-${b}-${c}-${d}`
    if (vistos.has(chave)) continue
    vistos.add(chave)
    if (a !== 0 || c < b || c + d > bytes.length) continue
    const janela = texto.slice(Math.max(0, m.index - 4000), Math.min(texto.length, m.index + 200_000))
    const sub = /\/SubFilter\s*\/([A-Za-z0-9.]+)/.exec(janela)
    // /Contents: o hex fica entre o fim do primeiro trecho e o começo do segundo.
    const trechoContents = texto.slice(b, c)
    const hexMatch = /<([0-9A-Fa-f\s]+)>/.exec(trechoContents)
    if (!hexMatch) {
      assinaturas.push({ subFilter: sub?.[1] ?? null, nome: null, cpf: null, emissor: null, raiz: null, raizSha256: null, cadeiaFecha: false, icpBrasilPeloNome: false, raizConfiada: false, assinadoEm: null, integra: false, assinaturaOk: false, dentroDaValidade: null, cobreArquivoTodo: c + d === bytes.length, algoritmo: null, erro: "Não achei o /Contents da assinatura." })
      continue
    }
    const hexLimpo = hexMatch[1].replace(/\s/g, "").replace(/0+$/, (z) => (z.length % 2 ? z.slice(1) : z))
    const cms = new Uint8Array(Buffer.from(hexLimpo, "hex"))
    const cobertos = Buffer.concat([bytes.subarray(a, a + b), bytes.subarray(c, c + d)])
    const r = verificarCms(cms, cobertos)
    assinaturas.push({ subFilter: sub?.[1] ?? null, ...r, cobreArquivoTodo: c + d === bytes.length })
  }

  if (assinaturas.length === 0) {
    return { situacao: "sem_assinatura", resumo: "O PDF não tem assinatura digital embutida.", assinaturas, cpfEsperado: esperado, cpfConfere: null, verificadoEm, versao: 1 }
  }
  const ultima = assinaturas.find((s) => s.cobreArquivoTodo) ?? null
  const boas = assinaturas.filter((s) => s.integra && s.assinaturaOk && !s.erro)
  const cpfConfere = esperado ? assinaturas.some((s) => s.cpf === esperado) : null
  const problemas: string[] = []
  if (!ultima) problemas.push("nenhuma assinatura cobre o arquivo inteiro — o PDF foi alterado depois de assinado")
  if (boas.length === 0) problemas.push(assinaturas[0].erro ?? (!assinaturas[0].integra ? "o conteúdo não bate com o resumo assinado" : "a assinatura não confere com o certificado"))
  if (esperado && cpfConfere === false) problemas.push(`o CPF do certificado${assinaturas.map((s) => s.cpf).filter(Boolean).length ? ` (${assinaturas.map((s) => s.cpf).filter(Boolean).join(", ")})` : " não foi encontrado e"} não é o do cadastro`)
  if (boas.some((s) => s.dentroDaValidade === false)) problemas.push("certificado fora da validade na data da assinatura")
  if (problemas.length) {
    return { situacao: "invalida", resumo: `Assinatura inválida: ${problemas.join("; ")}.`, assinaturas, cpfEsperado: esperado, cpfConfere, verificadoEm, versao: 1 }
  }
  const ressalvas: string[] = []
  const principal = boas.find((s) => s.cobreArquivoTodo) ?? boas[0]
  if (!principal.cadeiaFecha) ressalvas.push("a cadeia de certificados não veio completa na assinatura")
  else if (!principal.raizConfiada) ressalvas.push(principal.icpBrasilPeloNome ? `cadeia fecha em "${principal.raiz}" (ICP-Brasil pelo nome), raiz não conferida contra a lista de raízes confiadas` : `cadeia fecha em "${principal.raiz}", que não é ICP-Brasil`)
  if (!principal.cpf) ressalvas.push("o certificado não traz CPF")
  const quem = `${principal.nome ?? "signatário"}${principal.cpf ? ` (CPF ${principal.cpf})` : ""}${principal.assinadoEm ? ` em ${principal.assinadoEm.slice(0, 10).split("-").reverse().join("/")}` : ""}`
  if (ressalvas.length || (principal.icpBrasilPeloNome === false && !principal.raizConfiada)) {
    return { situacao: "ressalva", resumo: `Assinatura íntegra de ${quem}; ${ressalvas.join("; ")}.`, assinaturas, cpfEsperado: esperado, cpfConfere, verificadoEm, versao: 1 }
  }
  return { situacao: "valida", resumo: `Assinatura válida de ${quem}, cadeia ICP-Brasil conferida.`, assinaturas, cpfEsperado: esperado, cpfConfere, verificadoEm, versao: 1 }
}
