import "server-only"

import { PDFDocument } from "pdf-lib"
import { extractText, getDocumentProxy } from "unpdf"

import { validarCpf } from "@/lib/cpf"
import { funcionariosDaArea } from "@/lib/db/pessoal-area"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * PDF COM VÁRIOS FUNCIONÁRIOS → UMA PARTE POR FUNCIONÁRIO (30/10/2026).
 *
 * Usado pelas importações do Pessoal (relatório de ponto, folha de
 * contracheques): o PDF global, parcial ou individual é dividido pelo TEXTO de
 * cada página — o CPF, ou o nome do cadastro que aparece nela —, sem IA.
 * Páginas seguidas da mesma pessoa viram uma parte só. PDF escaneado (sem
 * texto) não dá para dividir.
 */

export type ParteFuncionario = {
  /** Páginas (1…n) desta pessoa no PDF original. */
  paginas: number[]
  cpf: string | null
  funcionarioId: string | null
  /** Nome do cadastro de quem foi achado. */
  nome: string | null
}

// CPF formatado; pode vir colado a outro número (a CTPS, no Secullum): vale o primeiro com dígitos válidos.
const CPF = /(\d{3})\.(\d{3})\.(\d{3})-(\d{2})(?!\d)/g
export const semAcento = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim()

/** Texto de cada página; erro quando o PDF não abre ou não tem texto. */
export async function textoDasPaginas(bytes: Uint8Array): Promise<{ paginas: string[] } | { erro: string }> {
  let paginas: string[]
  try {
    // O pdf.js esvazia o buffer: vai uma cópia.
    const pdf = await getDocumentProxy(bytes.slice())
    paginas = (await extractText(pdf, { mergePages: false })).text as string[]
  } catch {
    return { erro: "Não foi possível abrir o PDF." }
  }
  if (paginas.join("").trim().length < 200) {
    return { erro: "O PDF não tem texto (escaneado): não dá para separar os funcionários. Gere o arquivo direto do sistema de origem." }
  }
  return { paginas }
}

/** Quem é cada página (CPF, senão o nome do cadastro), agrupando as seguidas da mesma pessoa. */
export async function separarPorFuncionario(paginasTexto: string[]): Promise<ParteFuncionario[]> {
  const admin = await createAdminClient()
  // Cadastro: CPF e nome de cada funcionário (ativos e desligados).
  const funcionarios = await funcionariosDaArea()
  const { data: us } = await admin.from("usuarios").select("id, cpf").in("id", funcionarios.map((f) => f.usuarioId))
  const porCpf = new Map<string, string>()
  for (const u of us ?? []) {
    const c = String(u.cpf ?? "").replace(/\D/g, "")
    if (c.length === 11) porCpf.set(c, u.id)
  }
  const porNome = funcionarios
    .map((f) => ({ id: f.usuarioId, nome: semAcento(f.nome) }))
    .filter((f) => f.nome.split(" ").length >= 2)
    .sort((a, b) => b.nome.length - a.nome.length)

  const paginas = paginasTexto.map((t, i) => {
    const cpf = [...t.matchAll(CPF)].map((m) => m.slice(1, 5).join("")).find(validarCpf) ?? null
    const textoSem = semAcento(t)
    const porNomeAchado = porNome.find((f) => textoSem.includes(f.nome))
    const funcionarioId = (cpf && porCpf.get(cpf)) || porNomeAchado?.id || null
    const nome = funcionarioId ? (funcionarios.find((f) => f.usuarioId === funcionarioId)?.nome ?? null) : null
    return { n: i + 1, cpf, funcionarioId, nome }
  })

  // Páginas seguidas da mesma pessoa viram uma parte (cartão ou recibo em 2 páginas).
  const partes: ParteFuncionario[] = []
  for (const p of paginas) {
    const ult = partes[partes.length - 1]
    const mesma = ult && ((p.cpf && p.cpf === ult.cpf) || (p.funcionarioId && p.funcionarioId === ult.funcionarioId))
    if (mesma) ult.paginas.push(p.n)
    else partes.push({ paginas: [p.n], cpf: p.cpf, funcionarioId: p.funcionarioId, nome: p.nome })
  }
  return partes
}

/**
 * Guarda o PDF original em `<pasta>/<id>.pdf` e cada parte em
 * `<pasta>/<id>-001.pdf`… (bucket pessoal). Devolve os caminhos das partes,
 * na ordem.
 */
export async function guardarPartes(
  bytes: Uint8Array,
  partes: ParteFuncionario[],
  pasta: string,
  id: string
): Promise<{ original: string; caminhos: string[] } | { erro: string }> {
  const admin = await createAdminClient()
  const original = `${pasta}/${id}.pdf`
  const up = await admin.storage.from("pessoal").upload(original, bytes, { contentType: "application/pdf" })
  if (up.error) return { erro: `Falha ao guardar o PDF: ${up.error.message}` }

  const fonte = await PDFDocument.load(bytes, { ignoreEncryption: true })
  const caminhos: string[] = []
  for (const [i, parte] of partes.entries()) {
    const doc = await PDFDocument.create()
    const copiadas = await doc.copyPages(fonte, parte.paginas.map((n) => n - 1))
    copiadas.forEach((pg) => doc.addPage(pg))
    const caminho = `${pasta}/${id}-${String(i + 1).padStart(3, "0")}.pdf`
    const r = await admin.storage.from("pessoal").upload(caminho, await doc.save(), { contentType: "application/pdf" })
    if (r.error) return { erro: `Falha ao guardar a página ${parte.paginas[0]}: ${r.error.message}` }
    caminhos.push(caminho)
  }
  return { original, caminhos }
}
