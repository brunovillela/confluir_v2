// Testa src/lib/assinatura-pdf.ts com um PDF assinado na hora via openssl
// (certificado de teste com CPF no otherName da ICP-Brasil). Sem servidor.
//
//   node scripts/testar-assinatura-pdf.mjs
//
// Precisa de `openssl` no PATH (vem com o Git for Windows) e Node 24 (lê .ts
// direto). Gera tudo numa pasta temporária e apaga no fim.
import { execSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

const raiz = path.resolve(import.meta.dirname, "..")
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "pades-"))
const cpf = "55566677720"

// Cópia da lib com o alias "@/" trocado por caminho relativo.
fs.mkdirSync(path.join(tmp, "lib/icp-brasil"), { recursive: true })
fs.copyFileSync(path.join(raiz, "src/lib/icp-brasil/raizes.ts"), path.join(tmp, "lib/icp-brasil/raizes.ts"))
fs.writeFileSync(path.join(tmp, "assinatura-pdf.ts"), fs.readFileSync(path.join(raiz, "src/lib/assinatura-pdf.ts"), "utf8").replace('from "@/lib/icp-brasil/raizes"', 'from "./lib/icp-brasil/raizes.ts"'))

// Certificado de teste no padrão ICP-Brasil (CN "NOME:CPF" + otherName 2.16.76.1.3.1).
fs.writeFileSync(
  path.join(tmp, "san.cnf"),
  `[req]\ndistinguished_name = dn\nx509_extensions = ext\nprompt = no\n[dn]\nCN = FULANO DE TESTE:${cpf}\nO = ICP-Brasil\nOU = AC TESTE\nC = BR\n[ext]\nsubjectAltName = @san\nbasicConstraints = CA:FALSE\nkeyUsage = digitalSignature,nonRepudiation\n[san]\notherName.0 = 2.16.76.1.3.1;UTF8:01011980${cpf}000000000000000000000000000\n`
)
execSync(`openssl req -x509 -newkey rsa:2048 -nodes -keyout chave.pem -out cert.pem -days 2 -config san.cnf -sha256`, { cwd: tmp, stdio: "ignore" })

// PDF mínimo com um /Sig e espaço reservado no /Contents.
const RESERVA = 12000
const br = (a, b, c, d) => `/ByteRange [${[a, b, c, d].map((n) => String(n).padStart(10, "0")).join(" ")}]`
const montar = (hexC, byteRange) =>
  `%PDF-1.7\n1 0 obj << /Type /Catalog /Pages 2 0 R /AcroForm << /Fields [4 0 R] /SigFlags 3 >> >> endobj\n2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Annots [4 0 R] >> endobj\n4 0 obj << /Type /Annot /Subtype /Widget /FT /Sig /T (Assinatura1) /Rect [0 0 0 0] /F 4 /P 3 0 R /V 5 0 R >> endobj\n5 0 obj << /Type /Sig /Filter /Adobe.PPKLite /SubFilter /ETSI.CAdES.detached ${byteRange} /Contents <${hexC}> >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n`
let pdf = montar("0".repeat(RESERVA), br(0, 0, 0, 0))
const b = pdf.indexOf("/Contents <") + "/Contents ".length
const c = b + RESERVA + 2
const d = Buffer.byteLength(pdf, "latin1") - c
pdf = montar("0".repeat(RESERVA), br(0, b, c, d))
const bytes = Buffer.from(pdf, "latin1")
fs.writeFileSync(path.join(tmp, "cobertos.bin"), Buffer.concat([bytes.subarray(0, b), bytes.subarray(c, c + d)]))
execSync(`openssl cms -sign -binary -in cobertos.bin -signer cert.pem -inkey chave.pem -outform DER -md sha256 -out sig.der`, { cwd: tmp, stdio: "ignore" })
const sigHex = fs.readFileSync(path.join(tmp, "sig.der")).toString("hex")
const assinado = Buffer.concat([bytes.subarray(0, b + 1), Buffer.from(sigHex.padEnd(RESERVA, "0"), "latin1"), bytes.subarray(b + 1 + RESERVA)])
const adulterado = Buffer.from(assinado)
adulterado[20] ^= 0x01
const semAssinatura = Buffer.from("%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n")

const { validarAssinaturasPdf } = await import(path.join(tmp, "assinatura-pdf.ts").replace(/\\/g, "/").replace(/^([A-Za-z]):/, "file:///$1:"))
const casos = [
  ["assinado + CPF certo", validarAssinaturasPdf(new Uint8Array(assinado), cpf), (r) => r.situacao === "ressalva" && r.cpfConfere === true && r.assinaturas[0].integra && r.assinaturas[0].assinaturaOk],
  ["assinado + CPF errado", validarAssinaturasPdf(new Uint8Array(assinado), "11111111111"), (r) => r.situacao === "invalida" && r.cpfConfere === false],
  ["adulterado", validarAssinaturasPdf(new Uint8Array(adulterado), cpf), (r) => r.situacao === "invalida" && !r.assinaturas[0].integra],
  ["sem assinatura", validarAssinaturasPdf(new Uint8Array(semAssinatura), null), (r) => r.situacao === "sem_assinatura"],
]
let falhas = 0
for (const [rotulo, r, esperado] of casos) {
  const ok = esperado(r)
  if (!ok) falhas++
  console.log(`${ok ? "ok " : "FALHOU"} ${rotulo} → ${r.situacao}: ${r.resumo}`)
}
fs.rmSync(tmp, { recursive: true, force: true })
process.exit(falhas ? 1 : 0)
