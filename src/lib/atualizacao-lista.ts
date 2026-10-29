import { chaveMatricula } from "@/lib/casamento"
import { limparCpf, validarCpf } from "@/lib/cpf"
import { CONDICOES_NA_FONTE, REGIMES_TRABALHO } from "@/lib/filiacao"

/**
 * Atualização de cadastros por lista de trabalhadores (29/10/2026): o que a
 * IA lê de cada linha, a padronização (feita aqui, pelo código — a IA só
 * transcreve) e os campos que a lista pode mudar. Seguro para o client
 * (rótulos da prévia). A gravação mora em lib/db/filiacao-atualizacao-lista.ts.
 */

/** Uma linha como a IA devolve (tudo texto; "" quando não há). */
export type LinhaBruta = Record<(typeof CHAVES_LINHA)[number], string>

export const CHAVES_LINHA = [
  "nome",
  "cpf",
  "matricula",
  "nascimento",
  "sexo",
  "email",
  "email_corporativo",
  "telefone_1",
  "telefone_2",
  "cep",
  "logradouro",
  "numero",
  "complemento",
  "bairro",
  "cidade",
  "uf",
  "cargo",
  "lotacao",
  "admissao",
  "demissao",
  "regime",
  "condicao",
] as const

/** Linha padronizada: só o que veio e passou na validação. */
export type LinhaLista = {
  linha: number
  nome: string | null
  cpf: string | null
  /** Matrícula na fonte pagadora, como veio (sem espaços). */
  matricula: string | null
  cadastro: Partial<Record<CampoCadastro, string>>
  vinculo: Partial<Record<CampoVinculo, string>>
  /** Campos que vieram mas não passaram na validação (para o aviso). */
  invalidos: string[]
}

export type CampoCadastro =
  | "nome_completo"
  | "nascimento_data"
  | "sexo"
  | "email_pessoal"
  | "email_corporativo"
  | "telefone_1"
  | "telefone_2"
  | "endereco_cep"
  | "endereco_logradouro"
  | "endereco_numero"
  | "endereco_complemento"
  | "endereco_bairro"
  | "endereco_cidade"
  | "endereco_estado"

export type CampoVinculo =
  | "matricula"
  | "cargo"
  | "lotacao"
  | "data_entrada_admissao"
  | "data_saida_demissao"
  | "regime_trabalho"
  | "condicao_na_fonte"

export const ROTULOS_CAMPO: Record<string, string> = {
  nome_completo: "Nome",
  nascimento_data: "Nascimento",
  sexo: "Sexo",
  email_pessoal: "E-mail pessoal",
  email_corporativo: "E-mail corporativo",
  telefone_1: "Telefone 1",
  telefone_2: "Telefone 2",
  endereco_cep: "CEP",
  endereco_logradouro: "Logradouro",
  endereco_numero: "Número",
  endereco_complemento: "Complemento",
  endereco_bairro: "Bairro",
  endereco_cidade: "Cidade",
  endereco_estado: "UF",
  matricula: "Matrícula na fonte",
  cargo: "Cargo",
  lotacao: "Lotação",
  data_entrada_admissao: "Admissão na fonte",
  data_saida_demissao: "Saída na fonte",
  regime_trabalho: "Regime de trabalho",
  condicao_na_fonte: "Condição na fonte",
}

/** Espelho "como informado pela fonte" de cada campo do vínculo. */
export const ESPELHO_FONTE: Partial<Record<CampoVinculo, string>> = {
  matricula: "fonte_pg_matricula",
  cargo: "fonte_pg_cargo",
  lotacao: "fonte_pg_lotacao",
  data_entrada_admissao: "fonte_pg_admissao",
  data_saida_demissao: "fonte_pg_demissao",
  regime_trabalho: "fonte_pg_regime",
}

export const CAMPOS_DATA = new Set(["nascimento_data", "data_entrada_admissao", "data_saida_demissao"])

const UFS = new Set(
  "AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO".split(" ")
)

const espacos = (v: string) => v.replace(/\s+/g, " ").trim()

/** Sem acento, minúsculo, espaços colapsados — para comparar sem ruído de grafia. */
export function chaveComparacao(v: string | null | undefined): string {
  return espacos(String(v ?? ""))
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
}

/** Valor do banco e da lista no mesmo formato, por campo, para dizer se mudou. */
export function mesmoValor(campo: string, a: string | null | undefined, b: string | null | undefined): boolean {
  if (CAMPOS_DATA.has(campo)) return String(a ?? "").slice(0, 10) === String(b ?? "").slice(0, 10)
  if (["telefone_1", "telefone_2", "endereco_cep"].includes(campo)) {
    return String(a ?? "").replace(/\D/g, "") === String(b ?? "").replace(/\D/g, "")
  }
  if (campo === "matricula" || campo === "fonte_pg_matricula") return chaveMatricula(a) === chaveMatricula(b)
  return chaveComparacao(a) === chaveComparacao(b)
}

const MINUSCULAS = new Set(["da", "das", "de", "do", "dos", "e"])

/** "MARIA DAS DORES" → "Maria das Dores"; nome já em caixa mista fica como está. */
export function nomeProprio(v: string): string {
  const limpo = espacos(v)
  if (limpo !== limpo.toUpperCase()) return limpo
  return limpo
    .toLowerCase()
    .split(" ")
    .map((p, i) => (i > 0 && MINUSCULAS.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(" ")
}

/** AAAA-MM-DD, DD/MM/AAAA ou DD/MM/AA → AAAA-MM-DD (entre 1900 e o ano que vem). */
export function normalizarData(v: string): string | null {
  const t = v.trim()
  if (!t) return null
  let a: number, m: number, d: number
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t)
  const br = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(t)
  if (iso) [a, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])]
  else if (br) {
    d = Number(br[1])
    m = Number(br[2])
    a = Number(br[3])
    if (br[3].length === 2) a += a > (new Date().getFullYear() % 100) ? 1900 : 2000
  } else return null
  const data = new Date(Date.UTC(a, m - 1, d))
  if (data.getUTCFullYear() !== a || data.getUTCMonth() !== m - 1 || data.getUTCDate() !== d) return null
  if (a < 1900 || a > new Date().getFullYear() + 1) return null
  return `${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`
}

/** Só dígitos, sem o 55 do país; 10 ou 11 dígitos (com DDD). */
export function normalizarTelefone(v: string): string | null {
  let d = v.replace(/\D/g, "")
  if (!d) return null
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) d = d.slice(2)
  // "0 21 …": o zero do DDD de longa distância (fixo com 11, celular com 12 dígitos).
  if ((d.length === 11 || d.length === 12) && d.startsWith("0")) d = d.slice(1)
  return d.length === 10 || d.length === 11 ? d : null
}

function normalizarRegime(v: string): string | null {
  const c = chaveComparacao(v)
  if (!c) return null
  const exato = REGIMES_TRABALHO.find((r) => chaveComparacao(r) === c)
  if (exato) return exato
  if (/offshore|embarcad/.test(c)) return "Ininterrupto de revezamento offshore"
  if (/revez|turno|irt/.test(c)) return "Ininterrupto de revezamento"
  if (/administ|^adm\b|horario comercial/.test(c)) return "Administrativo"
  if (/misto/.test(c)) return "Misto"
  return null
}

function normalizarCondicao(v: string): string | null {
  const c = chaveComparacao(v)
  if (!c) return null
  const exato = CONDICOES_NA_FONTE.find((r) => chaveComparacao(r) === c)
  if (exato) return exato
  if (/pension/.test(c)) return "Beneficiário(a) pensionista"
  if (/aposent|assistid|inativ/.test(c)) return "Beneficiário(a) aposentado(a)"
  if (/ativ|empregad|trabalhador/.test(c)) return "Trabalhador(a) da ativa"
  return null
}

/**
 * Linha da IA → linha padronizada. `null` quando não há como achar a pessoa
 * (sem CPF válido, sem matrícula e sem nome).
 */
export function padronizarLinha(bruta: Partial<LinhaBruta>, linha: number): LinhaLista | null {
  const val = (k: (typeof CHAVES_LINHA)[number]) => espacos(String(bruta[k] ?? ""))
  const invalidos: string[] = []
  const cadastro: LinhaLista["cadastro"] = {}
  const vinculo: LinhaLista["vinculo"] = {}

  const cpfBruto = limparCpf(val("cpf"))
  const cpf = cpfBruto.length >= 9 ? cpfBruto.padStart(11, "0") : ""
  const cpfOk = cpf.length === 11 && validarCpf(cpf)
  if (val("cpf") && !cpfOk) invalidos.push("CPF")

  const nome = val("nome") ? nomeProprio(val("nome")) : null
  if (nome && nome.length >= 3) cadastro.nome_completo = nome

  const matricula = val("matricula").replace(/\s+/g, "") || null
  if (matricula) vinculo.matricula = matricula

  const data = (k: (typeof CHAVES_LINHA)[number], campo: CampoCadastro | CampoVinculo, alvo: Record<string, string>) => {
    if (!val(k)) return
    const d = normalizarData(val(k))
    if (d) alvo[campo] = d
    else invalidos.push(ROTULOS_CAMPO[campo])
  }
  data("nascimento", "nascimento_data", cadastro)
  data("admissao", "data_entrada_admissao", vinculo)
  data("demissao", "data_saida_demissao", vinculo)

  const sexo = chaveComparacao(val("sexo"))
  if (sexo) {
    if (/^(m|masc)/.test(sexo)) cadastro.sexo = "Masculino"
    else if (/^(f|fem)/.test(sexo)) cadastro.sexo = "Feminino"
    else invalidos.push("Sexo")
  }

  const email = (k: (typeof CHAVES_LINHA)[number], campo: CampoCadastro) => {
    const e = val(k).toLowerCase()
    if (!e) return
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) cadastro[campo] = e
    else invalidos.push(ROTULOS_CAMPO[campo])
  }
  email("email", "email_pessoal")
  email("email_corporativo", "email_corporativo")

  for (const [k, campo] of [
    ["telefone_1", "telefone_1"],
    ["telefone_2", "telefone_2"],
  ] as const) {
    if (!val(k)) continue
    const t = normalizarTelefone(val(k))
    if (t) cadastro[campo] = t
    else invalidos.push("Telefone")
  }
  if (cadastro.telefone_1 && cadastro.telefone_1 === cadastro.telefone_2) delete cadastro.telefone_2

  if (val("cep")) {
    const cep = val("cep").replace(/\D/g, "")
    if (cep.length === 8) cadastro.endereco_cep = cep
    else invalidos.push("CEP")
  }
  if (val("uf")) {
    const uf = val("uf").toUpperCase()
    if (UFS.has(uf)) cadastro.endereco_estado = uf
    else invalidos.push("UF")
  }
  // Texto em caixa alta vira "Maria das Dores"; número, complemento e
  // lotação (costuma ser sigla) ficam como vieram.
  for (const [k, campo, proprio] of [
    ["logradouro", "endereco_logradouro", true],
    ["numero", "endereco_numero", false],
    ["complemento", "endereco_complemento", false],
    ["bairro", "endereco_bairro", true],
    ["cidade", "endereco_cidade", true],
  ] as const) {
    if (val(k)) cadastro[campo] = (proprio ? nomeProprio(val(k)) : val(k)).slice(0, 200)
  }

  if (val("cargo")) vinculo.cargo = nomeProprio(val("cargo")).slice(0, 200)
  if (val("lotacao")) vinculo.lotacao = val("lotacao").slice(0, 200)
  if (val("regime")) {
    const r = normalizarRegime(val("regime"))
    if (r) vinculo.regime_trabalho = r
    else invalidos.push("Regime de trabalho")
  }
  if (val("condicao")) {
    const c = normalizarCondicao(val("condicao"))
    if (c) vinculo.condicao_na_fonte = c
    else invalidos.push("Condição na fonte")
  }

  if (!cpfOk && !matricula && !cadastro.nome_completo) return null
  return {
    linha,
    nome: cadastro.nome_completo ?? null,
    cpf: cpfOk ? cpf : null,
    matricula,
    cadastro,
    vinculo,
    invalidos,
  }
}

/** Formato de exibição de um valor gravado (datas BR, telefone e CEP com máscara). */
export function exibirValor(campo: string, v: string | null): string {
  if (!v) return "—"
  if (CAMPOS_DATA.has(campo) || campo.startsWith("fonte_pg_admissao") || campo === "fonte_pg_demissao") {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v)
    return m ? `${m[3]}/${m[2]}/${m[1]}` : v
  }
  if (campo.startsWith("telefone")) {
    const d = v.replace(/\D/g, "")
    if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
    if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  }
  if (campo === "endereco_cep" && /^\d{8}$/.test(v)) return `${v.slice(0, 5)}-${v.slice(5)}`
  return v
}
