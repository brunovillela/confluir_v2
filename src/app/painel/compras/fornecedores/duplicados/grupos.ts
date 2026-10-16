import type { LinhaFornecedor } from "@/lib/db/fornecedores-indicadores"
import { validarCnpj, validarCpf } from "@/lib/cpf"
import { formatarData, formatarMoeda } from "@/lib/formato"
import { formatarCnpjCpf } from "@/lib/mascaras"

import type { CadastroDuplicado } from "./mescla-form"

/**
 * Agrupamento e apresentação dos cadastros duplicados de fornecedor —
 * comuns à página de duplicados e à mescla manual (ficha do fornecedor).
 */

export const digitos = (v: string | null) => (v ?? "").replace(/\D/g, "")

export const docValido = (d: string) => (d.length === 11 ? validarCpf(d) : d.length === 14 ? validarCnpj(d) : false)

/** Palavras que não distinguem uma empresa de outra (natureza jurídica). */
const GENERICAS = new Set(["ltda", "me", "epp", "eireli", "sa", "s", "a", "cia", "mei", "ss"])

/** Nome comparável: sem acento, pontuação e natureza jurídica (LTDA, ME…). */
function chaveDoNome(nome: string | null): string | null {
  const palavras = (nome ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((w) => w && !GENERICAS.has(w))
  const chave = palavras.join(" ")
  return chave.length >= 4 ? chave : null
}

/**
 * Possíveis duplicados SEM o mesmo documento (legado): cadastros ativos com o
 * mesmo nome (fantasia ou razão) em que algum está sem CPF/CNPJ ou com um
 * inválido, e há no máximo um documento válido no grupo — dois válidos e
 * diferentes são empresas diferentes (filiais, homônimas).
 */
export function gruposPorNome(linhas: LinhaFornecedor[]): LinhaFornecedor[][] {
  const ativos = linhas.filter((l) => !l.inativa)
  const pai = new Map<string, string>()
  const achar = (x: string): string => {
    const p = pai.get(x) ?? x
    if (p === x) return x
    const r = achar(p)
    pai.set(x, r)
    return r
  }
  const porChave = new Map<string, string>()
  for (const l of ativos) {
    for (const n of [l.nome, l.nome_razao]) {
      const k = chaveDoNome(n)
      if (!k) continue
      const outro = porChave.get(k)
      if (outro) pai.set(achar(l.id), achar(outro))
      else porChave.set(k, l.id)
    }
  }
  const grupos = new Map<string, LinhaFornecedor[]>()
  for (const l of ativos) {
    const r = achar(l.id)
    grupos.set(r, [...(grupos.get(r) ?? []), l])
  }
  return [...grupos.values()].filter((g) => {
    if (g.length < 2) return false
    const docs = g.map((l) => digitos(l.cnpj_cpf))
    const validos = new Set(docs.filter(docValido))
    return docs.some((d) => !docValido(d)) && validos.size <= 1
  })
}

/**
 * Sugestão do cadastro que fica: o que tem mais ordens, depois o mais
 * completo (conta/Pix e endereço) e, no empate, o mais antigo.
 */
export function sugerir(grupo: LinhaFornecedor[]): string {
  const peso = (l: LinhaFornecedor) =>
    (docValido(digitos(l.cnpj_cpf)) ? 100000 : 0) +
    l.ordens * 100 +
    (l.problemas.some((p) => p.codigo === "sem_pagamento") ? 0 : 10) +
    (l.problemas.some((p) => p.codigo === "sem_endereco") ? 0 : 5) +
    (l.bloqueado ? -1 : 0)
  return [...grupo].sort(
    (a, b) => peso(b) - peso(a) || (a.created_at ?? "").localeCompare(b.created_at ?? "")
  )[0].id
}

/** O cadastro como aparece no formulário da mescla. */
export const paraFormDe = (verFinanceiro: boolean) => (l: LinhaFornecedor): CadastroDuplicado => ({
  id: l.id,
  nome: l.nome,
  razao: l.nome_razao,
  detalhes: [
    digitos(l.cnpj_cpf)
      ? `${digitos(l.cnpj_cpf).length === 11 ? "CPF" : "CNPJ"} ${formatarCnpjCpf(digitos(l.cnpj_cpf))}${docValido(digitos(l.cnpj_cpf)) ? "" : " (inválido)"}`
      : "sem CPF/CNPJ",
    l.apoiada ? "Entidade apoiada" : l.pessoa_juridica ? "Pessoa jurídica" : "Pessoa física",
    l.created_at ? `cadastrado em ${formatarData(l.created_at.slice(0, 10))}` : null,
    l.legado ? "migrado do Bubble" : "criado no Confluir",
    verFinanceiro ? `${l.ordens.toLocaleString("pt-BR")} ordem(ns)` : null,
    verFinanceiro && l.pagoTotal ? `${formatarMoeda(l.pagoTotal)} pagos` : null,
  ].filter((v): v is string => Boolean(v)),
  alertas: [
    l.bloqueado ? "Bloqueado" : null,
    ...l.problemas.filter((p) => p.codigo !== "documento_duplicado").map((p) => p.rotulo),
  ].filter((v): v is string => Boolean(v)),
})

