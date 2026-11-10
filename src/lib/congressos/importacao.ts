import * as XLSX from "xlsx"

import { limparCpf, validarCpf } from "@/lib/cpf"
import { semAcento } from "@/lib/texto"

/**
 * Congressos — importação de participantes por planilha (ou pelo que a IA
 * leu de uma ata). Lógica pura: lê a grade, reconhece as colunas pelo
 * cabeçalho, casa base e papel com os cadastrados e confere cada linha antes
 * de gravar. Testes: tests/unidade/congressos.spec.ts
 */

export type LinhaImportada = {
  linha: number
  nome: string
  cpf: string | null
  email: string | null
  telefone: string | null
  genero: string | null
  base: string | null
  papel: string | null
}

export type LinhaConferida = LinhaImportada & {
  unidadeId: string | null
  papelId: string | null
  situacao: "nova" | "ja_esta" | "problema"
  motivo: string | null
}

type Campo = keyof Omit<LinhaImportada, "linha">

const SINONIMOS: Record<Campo, string[]> = {
  nome: ["nome", "nome completo", "delegado", "delegada", "participante", "nome do delegado"],
  cpf: ["cpf", "c.p.f.", "documento"],
  email: ["e-mail", "email", "e mail"],
  telefone: ["telefone", "celular", "whatsapp", "fone"],
  genero: ["genero", "sexo"],
  base: ["base", "local de trabalho", "lotacao", "unidade", "entidade", "sindicato", "segmento", "plataforma", "delegacao", "ramo"],
  papel: ["papel", "condicao", "categoria", "tipo", "titular/suplente", "funcao"],
}

const norm = (v: unknown) => semAcento(String(v ?? "")).trim()

/** CPF da célula, devolvendo o zero à esquerda que o Excel comeu. */
export function cpfDaCelula(bruto: string): string | null {
  const d = limparCpf(bruto)
  if (!d) return null
  if (d.length < 11) {
    const completo = d.padStart(11, "0")
    return validarCpf(completo) ? completo : d
  }
  return d
}

/** Grade (linhas × colunas) da primeira aba com dados de um .xlsx/.ods/.csv. */
export function gradeDoArquivo(bytes: Uint8Array): unknown[][] | null {
  try {
    const wb = XLSX.read(bytes, { type: "array" })
    for (const nome of wb.SheetNames) {
      if (norm(nome).startsWith("instru")) continue
      const grade = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[nome], { header: 1, raw: false, defval: "" })
      if (grade.some((l) => l.some((c) => String(c).trim()))) return grade
    }
    return []
  } catch {
    return null
  }
}

/**
 * Reconhece o cabeçalho (nas 5 primeiras linhas) e lê as pessoas. Sem coluna
 * de nome reconhecível, devolve null: o arquivo vai para a leitura por IA.
 */
export function lerGrade(grade: unknown[][]): LinhaImportada[] | null {
  for (let h = 0; h < Math.min(5, grade.length); h++) {
    const mapa: Partial<Record<Campo, number>> = {}
    grade[h].forEach((celula, i) => {
      const t = norm(celula)
      for (const [campo, apelidos] of Object.entries(SINONIMOS) as [Campo, string[]][]) {
        if (mapa[campo] === undefined && apelidos.includes(t)) mapa[campo] = i
      }
    })
    if (mapa.nome === undefined) continue
    const ler = (l: unknown[], campo: Campo) => {
      const i = mapa[campo]
      if (i === undefined) return null
      const v = String(l[i] ?? "").trim()
      return v || null
    }
    const linhas: LinhaImportada[] = []
    for (let r = h + 1; r < grade.length; r++) {
      const l = grade[r]
      if (!l.some((c) => String(c ?? "").trim())) continue
      const cpfBruto = ler(l, "cpf")
      linhas.push({
        linha: r + 1,
        nome: ler(l, "nome") ?? "",
        cpf: cpfBruto ? cpfDaCelula(cpfBruto) : null,
        email: ler(l, "email"),
        telefone: ler(l, "telefone"),
        genero: ler(l, "genero"),
        base: ler(l, "base"),
        papel: ler(l, "papel"),
      })
    }
    return linhas
  }
  return null
}

/** Casa um texto livre com um item cadastrado: igual, depois contido, sem acento. */
export function casar<T extends { id: string; nome: string }>(texto: string | null, itens: T[]): T | null {
  if (!texto) return null
  const t = norm(texto)
  if (!t) return null
  return (
    itens.find((i) => norm(i.nome) === t) ??
    itens.find((i) => norm(i.nome).includes(t) || t.includes(norm(i.nome))) ??
    null
  )
}

/** Papel pelo texto da planilha: nome do papel ou palavras como "titular" e "suplente". */
export function casarPapel(
  texto: string | null,
  papeis: { id: string; nome: string; categoria: string }[],
  padrao: string | null
): string | null {
  const t = norm(texto ?? "")
  const porCategoria = (cat: string) => papeis.find((p) => p.categoria === cat)?.id ?? null
  // Palavras-chave primeiro: "suplente" não pode cair em "Delegado" por estar contido.
  if (/suplente/.test(t)) return porCategoria("suplente") ?? padrao
  if (/\bnat[oa]s?\b|membro nato/.test(t)) return porCategoria("nato") ?? padrao
  if (/observ/.test(t)) return porCategoria("observador") ?? padrao
  if (/convidad/.test(t)) return porCategoria("convidado") ?? padrao
  const direto = casar(texto, papeis)
  if (direto) return direto.id
  if (/titular|delegad|efetiv/.test(t)) return porCategoria("delegado") ?? padrao
  return padrao
}

/** Confere as linhas contra o que já existe no congresso, sem gravar nada. */
export function conferirLinhas(
  linhas: LinhaImportada[],
  d: {
    unidades: { id: string; nome: string }[]
    papeis: { id: string; nome: string; categoria: string }[]
    papelPadrao: string | null
    unidadePadrao: string | null
    cpfsExistentes: Set<string>
    nomesExistentes: Set<string>
  }
): LinhaConferida[] {
  const vistosCpf = new Set<string>()
  const vistosNome = new Set<string>()
  return linhas.map((l) => {
    const base = casar(l.base, d.unidades)
    const r: LinhaConferida = {
      ...l,
      unidadeId: base?.id ?? (l.base ? null : d.unidadePadrao),
      papelId: casarPapel(l.papel, d.papeis, d.papelPadrao),
      situacao: "nova",
      motivo: null,
    }
    const nomeN = norm(l.nome)
    if (nomeN.length < 3) return { ...r, situacao: "problema", motivo: "Sem nome." }
    if (l.cpf && !validarCpf(l.cpf)) return { ...r, situacao: "problema", motivo: "CPF inválido." }
    if (l.base && !base) return { ...r, situacao: "problema", motivo: `Base "${l.base}" não cadastrada.` }
    if ((l.cpf && d.cpfsExistentes.has(l.cpf)) || (!l.cpf && d.nomesExistentes.has(nomeN))) {
      return { ...r, situacao: "ja_esta", motivo: "Já está no congresso." }
    }
    if ((l.cpf && vistosCpf.has(l.cpf)) || (!l.cpf && vistosNome.has(nomeN))) {
      return { ...r, situacao: "problema", motivo: "Repetido no arquivo." }
    }
    if (l.cpf) vistosCpf.add(l.cpf)
    vistosNome.add(nomeN)
    return r
  })
}
