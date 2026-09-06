import * as XLSX from "xlsx"

import { limparCpf, validarCpf } from "@/lib/cpf"
import { semAcento } from "@/lib/texto"

/**
 * Planilha de convidados — o FORMATO do arquivo, sem banco nenhum.
 *
 * Fica separado de `db/eventos-convidados.ts` (que é server-only) porque é
 * lógica pura: dá para exercitar o modelo e o leitor com um arquivo de
 * verdade, sem subir o Next nem tocar no Supabase. É o mesmo motivo dos
 * `*-constantes.ts` espalhados pelo projeto.
 *
 * A planilha é o caminho que mais frustra, porque o erro só aparece depois de
 * a pessoa ter digitado 200 linhas. Por isso a leitura confere TUDO e devolve
 * o problema com o número da linha como ela aparece no Excel.
 */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Cabeçalho do modelo, na ordem em que sai no arquivo. */
export const COLUNAS_MODELO = [
  "Nome completo",
  "CPF",
  "E-mail",
  "Telefone",
  "A convite de",
] as const

/** CPF da linha de exemplo do modelo — descartada na importação. */
const CPF_EXEMPLO = "52998224725"
const NOME_EXEMPLO = "maria aparecida de souza"

/**
 * Apelidos aceitos por coluna. A planilha volta editada por muita gente: quem
 * renomeia "E-mail" para "Email" não deveria ver o arquivo inteiro recusado.
 */
const SINONIMOS: Record<string, string[]> = {
  nome: ["nome completo", "nome", "convidado", "participante"],
  cpf: ["cpf", "c.p.f.", "documento"],
  email: ["e-mail", "email", "e mail", "correio eletronico"],
  telefone: ["telefone", "celular", "fone", "whatsapp"],
  convidadoPor: [
    "a convite de",
    "convite de",
    "anfitriao",
    "convidado por",
    "indicado por",
  ],
}

function normalizar(v: unknown): string {
  return semAcento(String(v ?? ""))
}

/**
 * CPF da célula, devolvendo o zero à esquerda que o Excel comeu.
 *
 * Numa coluna sem formatação de texto, 012.345.678-90 vira o NÚMERO
 * 1234567890 e chega aqui com 10 dígitos. Recompor só vale se os dígitos
 * verificadores fecharem depois do zero — não é chute, é conferência.
 */
function cpfDaCelula(bruto: string): string {
  const d = limparCpf(bruto)
  if (d.length >= 11 || d.length === 0) return d
  const completo = d.padStart(11, "0")
  return validarCpf(completo) ? completo : d
}

export type LinhaConvidado = {
  /** Linha no arquivo como a pessoa vê no Excel (cabeçalho = 1). */
  linha: number
  nome: string
  cpf: string
  email: string
  telefone: string
  convidadoPor: string
}

export type ProblemaLinha = { linha: number; nome: string; motivo: string }

export type Conferencia = {
  erroGeral?: string
  validas: LinhaConvidado[]
  problemas: ProblemaLinha[]
  /** Total de linhas com algum conteúdo, fora o cabeçalho. */
  lidas: number
}

// ── Modelo ───────────────────────────────────────────────────────────────────

/**
 * Modelo .xlsx para baixar. Vai com uma linha de exemplo (que a importação
 * descarta) e uma aba de instruções: o modelo precisa ensinar sozinho, porque
 * quem preenche costuma não ser quem importa.
 */
export function gerarModeloConvidados(tituloEvento: string | null): Buffer {
  const wb = XLSX.utils.book_new()

  const convidados = XLSX.utils.aoa_to_sheet([
    [...COLUNAS_MODELO],
    [
      "Maria Aparecida de Souza",
      "529.982.247-25",
      "maria@exemplo.com.br",
      "(21) 98888-7777",
      "Diretoria",
    ],
  ])
  convidados["!cols"] = [
    { wch: 34 },
    { wch: 16 },
    { wch: 28 },
    { wch: 18 },
    { wch: 24 },
  ]
  XLSX.utils.book_append_sheet(wb, convidados, "Convidados")

  const instrucoes = XLSX.utils.aoa_to_sheet([
    ["Lista de convidados" + (tituloEvento ? ` — ${tituloEvento}` : "")],
    [],
    ["Como preencher"],
    ["1.", "Use a aba Convidados. Não mude os títulos das colunas."],
    ["2.", "Uma pessoa por linha."],
    [
      "3.",
      "A linha de exemplo (Maria Aparecida) é descartada sozinha — pode deixar.",
    ],
    [],
    ["Coluna", "Obrigatória?", "Observação"],
    ["Nome completo", "Sim", "Nome e sobrenome, como no documento."],
    [
      "CPF",
      "Sim",
      "Com ou sem pontos. É o que evita convidar a mesma pessoa duas vezes.",
    ],
    ["E-mail", "Não", "Só é preciso se você quiser que a pessoa receba avisos."],
    ["Telefone", "Não", "Com DDD."],
    [
      "A convite de",
      "Não",
      "Quem está convidando (diretor, departamento). Aparece na porta.",
    ],
    [],
    ["Se algo estiver errado"],
    [
      "",
      "A importação confere o arquivo inteiro antes de gravar e mostra a linha",
    ],
    ["", "de cada problema. Nada entra pela metade sem você mandar."],
  ])
  instrucoes["!cols"] = [{ wch: 18 }, { wch: 14 }, { wch: 62 }]
  XLSX.utils.book_append_sheet(wb, instrucoes, "Instruções")

  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer
}

// ── Leitura ──────────────────────────────────────────────────────────────────

/** Descobre em que coluna está cada campo, pelo cabeçalho. */
function mapearColunas(cabecalho: unknown[]): Record<string, number> {
  const mapa: Record<string, number> = {}
  cabecalho.forEach((celula, i) => {
    const titulo = normalizar(celula)
    if (!titulo) return
    for (const [campo, apelidos] of Object.entries(SINONIMOS)) {
      if (mapa[campo] === undefined && apelidos.includes(titulo)) {
        mapa[campo] = i
      }
    }
  })
  return mapa
}

/**
 * Lê o arquivo e confere linha a linha, sem tocar no banco. A checagem contra
 * quem já está inscrito é feita depois, em `conferirNoEvento`.
 */
export function lerPlanilha(bytes: Uint8Array): Conferencia {
  const vazia = { validas: [], problemas: [], lidas: 0 }

  let wb: XLSX.WorkBook
  try {
    wb = XLSX.read(bytes, { type: "array" })
  } catch {
    return {
      ...vazia,
      erroGeral: "Não consegui abrir o arquivo. Ele é mesmo uma planilha .xlsx?",
    }
  }

  // A aba pode ter sido renomeada; a de instruções nunca é a dos dados.
  const nome =
    wb.SheetNames.find((n) => normalizar(n).startsWith("convidados")) ??
    wb.SheetNames.find((n) => !normalizar(n).startsWith("instru")) ??
    wb.SheetNames[0]
  const aba = nome ? wb.Sheets[nome] : undefined
  if (!aba) return { ...vazia, erroGeral: "A planilha está vazia." }

  const grade = XLSX.utils.sheet_to_json<unknown[]>(aba, {
    header: 1,
    blankrows: false,
    defval: "",
  })
  // O cabeçalho vem ANTES da contagem de linhas de propósito: um arquivo que
  // nem é planilha (um .txt, um PDF renomeado) atravessa o XLSX.read sem
  // estourar e chegaria aqui parecendo uma planilha vazia. Dizer "só tem o
  // cabeçalho" nesse caso manda a pessoa procurar erro onde não há.
  const colunas = mapearColunas(grade[0] ?? [])
  if (colunas.nome === undefined || colunas.cpf === undefined) {
    return {
      ...vazia,
      erroGeral:
        "Não encontrei as colunas Nome completo e CPF no cabeçalho. Confira se o arquivo é mesmo a planilha do modelo, na aba Convidados e sem renomear os títulos.",
    }
  }

  if (grade.length < 2) {
    return {
      ...vazia,
      erroGeral: "A planilha só tem o cabeçalho — nenhum convidado para importar.",
    }
  }

  const validas: LinhaConvidado[] = []
  const problemas: ProblemaLinha[] = []
  const cpfsVistos = new Map<string, number>()
  let lidas = 0

  for (let i = 1; i < grade.length; i++) {
    const bruta = grade[i] ?? []
    const campo = (k: string) =>
      colunas[k] === undefined ? "" : String(bruta[colunas[k]] ?? "").trim()

    const nomeCel = campo("nome")
    const cpfCel = campo("cpf")
    const emailCel = campo("email").toLowerCase()
    const telefoneCel = campo("telefone")
    const convidadoPorCel = campo("convidadoPor")

    // Linha em branco no meio da planilha não é erro, é sobra de edição.
    if (!nomeCel && !cpfCel && !emailCel && !telefoneCel) continue

    // A linha de exemplo do modelo sai sozinha — e não conta como lida, senão
    // "1 de 1 linha com problema" apareceria numa planilha ainda em branco.
    const cpf = cpfDaCelula(cpfCel)
    if (normalizar(nomeCel) === NOME_EXEMPLO && cpf === CPF_EXEMPLO) continue

    lidas++
    const numero = i + 1

    if (nomeCel.length < 5 || !nomeCel.includes(" ")) {
      problemas.push({
        linha: numero,
        nome: nomeCel || "(sem nome)",
        motivo: "nome incompleto — informe nome e sobrenome",
      })
      continue
    }
    if (!cpf) {
      problemas.push({ linha: numero, nome: nomeCel, motivo: "CPF em branco" })
      continue
    }
    if (!validarCpf(cpf)) {
      problemas.push({
        linha: numero,
        nome: nomeCel,
        motivo: `CPF inválido (${cpfCel})`,
      })
      continue
    }
    if (emailCel && !EMAIL.test(emailCel)) {
      problemas.push({
        linha: numero,
        nome: nomeCel,
        motivo: `e-mail inválido (${emailCel})`,
      })
      continue
    }
    const repetida = cpfsVistos.get(cpf)
    if (repetida) {
      problemas.push({
        linha: numero,
        nome: nomeCel,
        motivo: `CPF repetido na própria planilha (já apareceu na linha ${repetida})`,
      })
      continue
    }

    cpfsVistos.set(cpf, numero)
    validas.push({
      linha: numero,
      nome: nomeCel.replace(/\s+/g, " "),
      cpf,
      email: emailCel,
      telefone: telefoneCel.replace(/\D/g, ""),
      convidadoPor: convidadoPorCel,
    })
  }

  return { validas, problemas, lidas }
}
