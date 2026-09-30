import "server-only"

import { lerEmLotes } from "@/lib/db/comum"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"
import { codificarColuna } from "@/lib/saude-painel-formato"
import { semAcento } from "@/lib/texto"

/**
 * Base do Painel analítico da Saúde (estilo Power BI): as CATs do tenant
 * NORMALIZADAS e agregáveis no navegador, com filtro cruzado entre os
 * visuais. Vai para o cliente só o que é estatística — nada de nome, CPF,
 * data de nascimento ou texto livre (LGPD: dado de saúde é sensível).
 *
 * Formato colunar e compacto (~13 mil CATs cabem em poucos KB): cada
 * dimensão é um dicionário de rótulos + uma STRING com um caractere por CAT
 * (ALFABETO[i + 1] = categoria i; ALFABETO[0] = não informado). Ver
 * `decodificarColuna` em lib/saude-painel-formato.ts.
 */

export const DIMENSOES = [
  "empresa",
  "tipo",
  "sexo",
  "faixa",
  "ocupacao",
  "parte",
  "natureza",
  "agente",
  "situacao",
  "cid",
  "municipio",
] as const
export type Dimensao = (typeof DIMENSOES)[number]

export type BaseSaude = {
  total: number
  /** Primeiro ano da série; a coluna `ano` guarda ano - anoBase (-1 = sem data). */
  anoBase: number
  /** Colunas codificadas (ver `codificarColuna`). */
  colunas: Record<Dimensao | "ano" | "mes" | "dia" | "afastamento" | "internacao" | "obito", string>
  /** Dias de tratamento (-1 = não informado). */
  dias: number[]
  rotulos: Record<Dimensao, string[]>
  atualizadoEm: string
}

/** Quantas categorias cada dimensão mostra; o resto vira "Outros". */
const LIMITE: Record<Dimensao, number> = {
  empresa: 60,
  tipo: 10,
  sexo: 3,
  faixa: 10,
  ocupacao: 30,
  parte: 30,
  natureza: 30,
  agente: 30,
  situacao: 30,
  cid: 25,
  municipio: 30,
}

const OUTROS = "Outros"

// ── Normalização ────────────────────────────────────────────────────────────

const chave = (s: string) =>
  semAcento(s)
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()

function tipoAcidente(v: string | null): string | null {
  const k = chave(v ?? "")
  if (!k) return null
  if (k.includes("tipic")) return "Típico"
  if (k.includes("trajeto")) return "Trajeto"
  if (k.includes("doenca")) return "Doença ocupacional"
  return "Outros"
}

function sexo(v: string | null): string | null {
  const k = chave((v ?? "").replace(/^[mf]\s*-\s*/i, ""))
  if (!k) return null
  if (k.startsWith("f")) return "Feminino"
  if (k.startsWith("m")) return "Masculino"
  return null
}

function faixaEtaria(nascimento: string | null, acidente: string | null): string | null {
  if (!nascimento || !acidente) return null
  const idade = Number(acidente.slice(0, 4)) - Number(nascimento.slice(0, 4))
  if (!(idade >= 14 && idade <= 90)) return null
  if (idade < 25) return "Até 24"
  if (idade < 35) return "25 a 34"
  if (idade < 45) return "35 a 44"
  if (idade < 55) return "45 a 54"
  if (idade < 65) return "55 a 64"
  return "65 ou mais"
}
const ORDEM_FAIXA = ["Até 24", "25 a 34", "35 a 44", "45 a 54", "55 a 64", "65 ou mais"]

/** "81131operador de exploração de petroleo" → "Operador de exploração de petróleo" (chave sem acento). */
function ocupacao(v: string | null): { chave: string; rotulo: string } | null {
  const limpo = (v ?? "").replace(/^\s*\d+\s*[-–]?\s*/, "").replace(/\s*\(.*?\)\s*$/, "").trim()
  const k = chave(limpo)
  if (!k) return null
  return { chave: k, rotulo: limpo.charAt(0).toUpperCase() + limpo.slice(1).toLowerCase() }
}

/**
 * Descrições da tabela de CAT: parte antes de " - " ou "," ("Dedo - não
 * especificado" → Dedo) e chave pelo começo do texto — as CATs antigas vêm
 * truncadas ("Impacto de pessoa contra objeto pa").
 */
function descricao(
  v: string | null,
  cortarVirgula: boolean,
  corteChave = 30
): { chave: string; rotulo: string } | null {
  const base = (v ?? "").split(cortarVirgula ? /\s[-–]\s|,/ : /\s[-–]\s/)[0].trim()
  const k = chave(base)
  if (!k) return null
  return { chave: k.slice(0, corteChave), rotulo: base }
}

const CAPITULOS_CID: [RegExp, string][] = [
  [/^[AB]/, "Infecciosas e parasitárias (A–B)"],
  [/^[CD][0-4]/, "Neoplasias (C–D48)"],
  [/^F/, "Transtornos mentais (F)"],
  [/^G/, "Sistema nervoso (G)"],
  [/^H[0-5]/, "Olho (H00–H59)"],
  [/^H[6-9]/, "Ouvido (H60–H95)"],
  [/^I/, "Circulatório (I)"],
  [/^J/, "Respiratório (J)"],
  [/^K/, "Digestivo (K)"],
  [/^L/, "Pele (L)"],
  [/^M/, "Osteomuscular (M)"],
  [/^R/, "Sintomas e sinais (R)"],
  [/^S/, "Lesões — traumatismos (S)"],
  [/^T/, "Lesões — envenenamentos e outros (T)"],
  [/^[VWXY]/, "Causas externas (V–Y)"],
  [/^Z/, "Fatores de saúde (Z)"],
]

function capituloCid(v: string | null): string | null {
  const c = (v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "")
  if (!/^[A-Z]\d/.test(c)) return null
  return CAPITULOS_CID.find(([re]) => re.test(c))?.[1] ?? "Outros capítulos"
}

/** Empresa: raiz do CNPJ junta filiais e grafias ("Petroleo Brasileiro S A Petrobras" × "Petroleo Brasileiro"). */
function empresa(razao: string | null, inscricao: string | null): { chave: string; rotulo: string } | null {
  const nome = (razao ?? "").trim()
  const dig = (inscricao ?? "").replace(/\D/g, "")
  if (dig.length === 14) return { chave: `cnpj:${dig.slice(0, 8)}`, rotulo: nome || `CNPJ ${dig.slice(0, 8)}` }
  const k = chave(nome)
  if (!k) return null
  // Sem CNPJ: as duas primeiras palavras relevantes agrupam as grafias.
  const palavras = k.split(" ").filter((p) => p.length > 2 && !["s", "a", "ltda", "sa", "me", "eireli"].includes(p))
  return { chave: `nome:${palavras.slice(0, 2).join(" ")}`, rotulo: nome }
}

function municipio(nome: string | null, uf: string | null): { chave: string; rotulo: string } | null {
  const k = chave(nome ?? "")
  if (!k) return null
  const u = (uf ?? "").trim().toUpperCase()
  return { chave: `${k}|${u}`, rotulo: `${(nome ?? "").trim()}${u ? `/${u}` : ""}` }
}

// ── Montagem ────────────────────────────────────────────────────────────────

type Valor = { chave: string; rotulo: string } | null

/** Agrupa, escolhe o rótulo mais frequente de cada chave e corta no top-N + Outros. */
function codificar(valores: Valor[], limite: number, ordemFixa?: string[]): { rotulos: string[]; indices: number[] } {
  const contagem = new Map<string, { n: number; rotulos: Map<string, number> }>()
  for (const v of valores) {
    if (!v) continue
    const c = contagem.get(v.chave) ?? { n: 0, rotulos: new Map() }
    c.n++
    c.rotulos.set(v.rotulo, (c.rotulos.get(v.rotulo) ?? 0) + 1)
    contagem.set(v.chave, c)
  }
  let chaves = [...contagem.entries()].sort((a, b) => b[1].n - a[1].n).map(([k]) => k)
  if (ordemFixa) chaves = ordemFixa.filter((k) => contagem.has(k))
  const mantidas = chaves.slice(0, limite)
  const temOutros = chaves.length > limite
  const posicao = new Map(mantidas.map((k, i) => [k, i]))
  // Rótulo: a grafia mais completa entre as que somam ao menos 10% do grupo
  // (as CATs antigas truncam: "…contra objeto pa" × "…contra objeto parado").
  const rotulos = mantidas.map((k) => {
    const { n, rotulos: r } = contagem.get(k)!
    const candidatas = [...r.entries()].filter(([, q]) => q >= n * 0.1)
    return candidatas.sort((a, b) => b[0].length - a[0].length || b[1] - a[1])[0][0]
  })
  if (temOutros) rotulos.push(OUTROS)
  const indices = valores.map((v) => (v ? (posicao.get(v.chave) ?? (temOutros ? rotulos.length - 1 : -1)) : -1))
  return { rotulos, indices }
}

const simples = (v: string | null): Valor => (v ? { chave: v, rotulo: v } : null)

export async function baseSaude(): Promise<BaseSaude | null> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  let linhas: Record<string, unknown>[]
  try {
    linhas = await lerEmLotes<Record<string, unknown>>((de, ate) =>
      admin
        .from("saude_cat")
        .select(
          "data_acidente,tipo_acidente,empregador_razao_social,empregador_inscricao,trabalhador_sexo,trabalhador_nascimento,trabalhador_cbo,local_uf,local_municipio,parte_atingida,agente_causador,situacao_geradora,natureza_lesao,cid10,afastamento_durante_tratamento,houve_afastamento,houve_internacao,houve_morte,duracao_tratamento_dias"
        )
        .eq("emp_proprietaria_id", emp)
        .is("duplicada_de_id", null)
        .order("id")
        .range(de, ate)
    )
  } catch {
    return null
  }

  const s = (v: unknown) => (typeof v === "string" && v.trim() ? v : null)
  const dim = (f: (l: Record<string, unknown>) => Valor, d: Dimensao, ordem?: string[]) =>
    codificar(linhas.map(f), LIMITE[d], ordem)

  const cod = {
    empresa: dim((l) => empresa(s(l.empregador_razao_social), s(l.empregador_inscricao)), "empresa"),
    tipo: dim((l) => simples(tipoAcidente(s(l.tipo_acidente))), "tipo"),
    sexo: dim((l) => simples(sexo(s(l.trabalhador_sexo))), "sexo"),
    faixa: dim((l) => simples(faixaEtaria(s(l.trabalhador_nascimento), s(l.data_acidente))), "faixa", ORDEM_FAIXA),
    ocupacao: dim((l) => ocupacao(s(l.trabalhador_cbo)), "ocupacao"),
    parte: dim((l) => descricao(s(l.parte_atingida), true), "parte"),
    natureza: dim((l) => descricao(s(l.natureza_lesao), true), "natureza"),
    agente: dim((l) => descricao(s(l.agente_causador), false), "agente"),
    situacao: dim((l) => descricao(s(l.situacao_geradora), false), "situacao"),
    cid: dim((l) => simples(capituloCid(s(l.cid10))), "cid"),
    municipio: dim((l) => municipio(s(l.local_municipio), s(l.local_uf)), "municipio"),
  } satisfies Record<Dimensao, { rotulos: string[]; indices: number[] }>

  const datas = linhas.map((l) => {
    const d = s(l.data_acidente)
    return d && /^\d{4}-\d{2}-\d{2}/.test(d) ? d.slice(0, 10) : null
  })
  const anos = datas.filter((d): d is string => !!d).map((d) => Number(d.slice(0, 4)))
  // Datas absurdas (digitação) ficam de fora da série.
  const anoAtual = new Date().getFullYear()
  const validos = anos.filter((a) => a >= 1990 && a <= anoAtual)
  const anoBase = validos.length ? Math.min(...validos) : anoAtual
  const ano = datas.map((d) => {
    const a = d ? Number(d.slice(0, 4)) : NaN
    return a >= anoBase && a <= anoAtual ? a - anoBase : -1
  })
  const mes = datas.map((d, i) => (ano[i] >= 0 && d ? Number(d.slice(5, 7)) - 1 : -1))
  const dia = datas.map((d, i) => (ano[i] >= 0 && d ? new Date(`${d}T12:00:00Z`).getUTCDay() : -1))
  // Flags: categoria 0 = "sim" (o filtro do painel seleciona a 0); não = sem categoria.
  const flag = (f: (l: Record<string, unknown>) => boolean) => linhas.map((l) => (f(l) ? 0 : -1))

  return {
    total: linhas.length,
    anoBase,
    colunas: {
      ...(Object.fromEntries(DIMENSOES.map((d) => [d, codificarColuna(cod[d].indices)])) as Record<Dimensao, string>),
      ano: codificarColuna(ano),
      mes: codificarColuna(mes),
      dia: codificarColuna(dia),
      afastamento: codificarColuna(flag((l) => l.afastamento_durante_tratamento === true || l.houve_afastamento === true)),
      internacao: codificarColuna(flag((l) => l.houve_internacao === true)),
      obito: codificarColuna(flag((l) => l.houve_morte === true)),
    },
    dias: linhas.map((l) => {
      const n = Number(l.duracao_tratamento_dias)
      return l.duracao_tratamento_dias === null || l.duracao_tratamento_dias === undefined || !Number.isFinite(n) || n < 0 ? -1 : Math.min(n, 999)
    }),
    rotulos: Object.fromEntries(DIMENSOES.map((d) => [d, cod[d].rotulos])) as Record<Dimensao, string[]>,
    atualizadoEm: new Date().toISOString(),
  }
}
