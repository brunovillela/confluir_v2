import "server-only"

import { chaveDaConta, chaveDoPix } from "@/lib/bancos"
import { cpfConfiavel, lerDocumentoTitular, limparCpf, mesmoTitular } from "@/lib/cpf"
import { texto } from "@/lib/db/comum"
import { donosDaPessoa, type TipoDono } from "@/lib/db/dados-bancarios-pessoa"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * SAÚDE DAS CONTAS BANCÁRIAS (27/10/2026) — Financeiro › Contas bancárias.
 * O que era o script de revisão (scripts/revisar-contas-bancarias.mjs) virou
 * tela com ação: contas repetidas da mesma pessoa (com "Juntar"), a mesma
 * conta em cadastros de CPFs diferentes, documento do titular de outra pessoa
 * e contas sem documento (com o campo para corrigir). CPF sai mascarado.
 */

export type DonoConta = { tipo: TipoDono; id: string; nome: string; documento: string | null }

export type ContaRevisao = {
  id: string
  dono: DonoConta
  banco: string | null
  agencia: string | null
  conta: string | null
  pix: string | null
  pixTipo: string | null
  favorecido: string | null
  titularDocumento: string | null
  favorito: boolean
  ordens: number
}

export type GrupoRepetido = { fica: ContaRevisao; copias: ContaRevisao[] }
export type OutroTitular = { conta: ContaRevisao; motivo: "cadastro_incompleto" | "digitacao" | "outro" }
export type SemDocumento = { conta: ContaRevisao; dica: string | null }

export type SaudeContas = {
  total: number
  repetidas: GrupoRepetido[]
  cruzadas: ContaRevisao[][]
  outroTitular: OutroTitular[]
  semDocumento: SemDocumento[]
}

export function mascararDocumento(d: string | null): string {
  if (!d) return "sem documento"
  if (d.length === 11) return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5")
  return d
}

/** Texto livre (ex.: o titular digitado) com CPF mascarado; CNPJ fica. */
export function mascararTexto(v: string): string {
  return v.replace(/\d[\d./\s-]{7,}\d/g, (m) => {
    const d = m.replace(/\D/g, "")
    if (d.length === 14) return mascararDocumento(d)
    return d.length >= 9 ? `***${d.slice(3, -2)}**` : m
  })
}

const distancia = (a: string, b: string) => (a.length !== b.length ? 99 : [...a].filter((c, i) => c !== b[i]).length)

const VAZIAS = new Set(["ltda", "me", "epp", "eireli", "sa", "s", "a", "de", "da", "do", "das", "dos", "e", "cia", "mei", "slu"])
const palavras = (n: string) =>
  n
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((p) => p.length > 1 && !VAZIAS.has(p) && !/^\d+$/.test(p))
function nomeBate(titular: string, nome: string): boolean {
  const dele = palavras(titular)
  const fav = palavras(nome)
  if (!dele.length || !fav.length) return true
  return dele.filter((p) => fav.includes(p)).length / Math.min(dele.length, fav.length) >= 0.6
}

async function todas(tabela: string, colunas: string, filtro: (q: any) => any = (q) => q): Promise<Record<string, unknown>[]> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const admin = await createAdminClient()
  const saida: Record<string, unknown>[] = []
  for (let i = 0; ; i += 1000) {
    const { data, error } = await filtro(admin.from(tabela).select(colunas)).order("id").range(i, i + 999)
    if (error) throw new Error(`Falha ao ler ${tabela}: ${error.message}`)
    saida.push(...((data ?? []) as Record<string, unknown>[]))
    if ((data ?? []).length < 1000) break
  }
  return saida
}

/** Ordena para escolher a que fica: favorita, mais usada, com documento, mais antiga. */
const melhor = (a: ContaRevisao & { criada: string }, b: ContaRevisao & { criada: string }) =>
  Number(b.favorito) - Number(a.favorito) ||
  b.ordens - a.ordens ||
  Number(Boolean(b.titularDocumento)) - Number(Boolean(a.titularDocumento)) ||
  a.criada.localeCompare(b.criada)

export async function saudeDasContas(): Promise<SaudeContas> {
  const emp = await tenantAtual()
  const [contas, empresas, usuarios, filiacoes, usos] = await Promise.all([
    todas("dados_bancarios", "id, favorecido, banco, agencia, conta, pix, pix_tipo, fornecedor_id, usuario_id, filiado_id, favorito, titular_documento, created_at"),
    todas("empresa", "id, empresa, nome_fantasia, nome_razao, cnpj_cpf", (q) => q.eq("emp_proprietaria_id", emp)),
    todas("usuarios", "id, nome_completo, nome_guerra, cpf", (q) => q.eq("emp_proprietaria_id", emp)),
    todas("filiacoes", "id, nome_completo, cpf", (q) => q.eq("emp_proprietaria_id", emp)),
    todas("ordens_pagamento", "id, dados_bancarios_id", (q) => q.eq("emp_proprietaria_id", emp).not("dados_bancarios_id", "is", null)),
  ])
  const ordensPorConta = new Map<string, number>()
  for (const o of usos) ordensPorConta.set(String(o.dados_bancarios_id), (ordensPorConta.get(String(o.dados_bancarios_id)) ?? 0) + 1)
  const doc = (v: unknown) => limparCpf(texto(v) ?? "") || null
  const donos = new Map<string, DonoConta>()
  for (const e of empresas) donos.set(`f:${e.id}`, { tipo: "fornecedor", id: String(e.id), nome: texto(e.nome_fantasia) ?? texto(e.empresa) ?? texto(e.nome_razao) ?? "Fornecedor", documento: doc(e.cnpj_cpf) })
  for (const u of usuarios) donos.set(`u:${u.id}`, { tipo: "usuario", id: String(u.id), nome: texto(u.nome_completo) ?? texto(u.nome_guerra) ?? "Usuário", documento: doc(u.cpf) })
  for (const f of filiacoes) donos.set(`p:${f.id}`, { tipo: "filiado", id: String(f.id), nome: texto(f.nome_completo) ?? "Filiado", documento: doc(f.cpf) })

  const linhas: (ContaRevisao & { criada: string; pessoa: string; chave: string | null })[] = []
  for (const c of contas) {
    const k = c.fornecedor_id ? `f:${c.fornecedor_id}` : c.usuario_id ? `u:${c.usuario_id}` : c.filiado_id ? `p:${c.filiado_id}` : null
    const dono = k ? donos.get(k) : undefined
    if (!dono) continue
    const cpf = cpfConfiavel(dono.documento)
    const chaveConta = chaveDaConta(texto(c.agencia), texto(c.conta))
    linhas.push({
      id: String(c.id),
      dono,
      banco: texto(c.banco),
      agencia: texto(c.agencia),
      conta: texto(c.conta),
      pix: texto(c.pix),
      pixTipo: texto(c.pix_tipo),
      favorecido: texto(c.favorecido),
      titularDocumento: texto(c.titular_documento),
      favorito: c.favorito === true,
      ordens: ordensPorConta.get(String(c.id)) ?? 0,
      criada: String(c.created_at ?? ""),
      // a mesma pessoa: o CPF (todos os papéis) ou o próprio cadastro
      pessoa: cpf ? `cpf:${cpf}` : `dono:${k}`,
      chave: chaveConta ?? (texto(c.pix) ? `pix|${chaveDoPix(texto(c.pix))}` : null),
    })
  }
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- descarta os campos internos
  const limpa = ({ criada: _c, pessoa: _p, chave: _k, ...l }: (typeof linhas)[number]): ContaRevisao => l

  // Repetidas: a mesma conta (ou só-Pix) na mesma pessoa.
  const grupos = new Map<string, typeof linhas>()
  for (const l of linhas) if (l.chave) grupos.set(`${l.pessoa}#${l.chave}`, [...(grupos.get(`${l.pessoa}#${l.chave}`) ?? []), l])
  const repetidas = [...grupos.values()]
    .filter((g) => g.length > 1)
    .map((g) => {
      const [fica, ...copias] = [...g].sort(melhor)
      return { fica: limpa(fica), copias: copias.map(limpa) }
    })
    .sort((a, b) => b.copias.length - a.copias.length || a.fica.dono.nome.localeCompare(b.fica.dono.nome))

  // A mesma agência+conta em pessoas diferentes.
  const porConta = new Map<string, typeof linhas>()
  for (const l of linhas) if (l.chave && !l.chave.startsWith("pix|")) porConta.set(l.chave, [...(porConta.get(l.chave) ?? []), l])
  const cruzadas = [...porConta.values()].filter((g) => new Set(g.map((l) => l.pessoa)).size > 1).map((g) => g.map(limpa))

  const outroTitular: OutroTitular[] = []
  const semDocumento: SemDocumento[] = []
  for (const l of linhas) {
    if (!texto(l.conta)) continue
    const dono = l.dono.documento
    if (l.titularDocumento) {
      if (dono && !mesmoTitular(l.titularDocumento, dono)) {
        const incompleto = dono.length < l.titularDocumento.length && (l.titularDocumento.startsWith(dono) || l.titularDocumento.endsWith(dono))
        outroTitular.push({ conta: limpa(l), motivo: incompleto ? "cadastro_incompleto" : distancia(l.titularDocumento, dono) <= 2 ? "digitacao" : "outro" })
      }
    } else if (l.favorecido && (limparCpf(l.favorecido).length >= 9 || !nomeBate(l.favorecido, l.dono.nome))) {
      const d = limparCpf(l.favorecido)
      const dica = !dono || d.length < 9 ? null : d === dono ? "mesmos dígitos do cadastro, mas não passa na validação" : distancia(d, dono) <= 2 ? "parece digitação do documento do cadastro" : null
      semDocumento.push({ conta: limpa(l), dica })
    }
  }
  const porNome = (a: { conta: ContaRevisao }, b: { conta: ContaRevisao }) => a.conta.dono.nome.localeCompare(b.conta.dono.nome)
  return { total: linhas.length, repetidas, cruzadas, outroTitular: outroTitular.sort(porNome), semDocumento: semDocumento.sort(porNome) }
}

/**
 * Junta as cópias na conta que fica: ela herda o que só as cópias tinham, as
 * ordens das cópias passam para ela e as cópias saem. Confere que todas são da
 * mesma pessoa e a mesma conta/chave — a tela não decide sozinha.
 */
export async function juntarContas(ficaId: string, copiaIds: string[]): Promise<{ erro?: string; ordens?: number }> {
  if (copiaIds.length === 0 || copiaIds.includes(ficaId)) return { erro: "Nada para juntar." }
  const admin = await createAdminClient()
  const { data } = await admin
    .from("dados_bancarios")
    .select("id, banco, banco_codigo, agencia, conta, tipo_conta, pix, pix_tipo, titular_documento, favorito, fornecedor_id, usuario_id, filiado_id")
    .in("id", [ficaId, ...copiaIds])
  const linhas = (data ?? []) as Record<string, unknown>[]
  const fica = linhas.find((l) => String(l.id) === ficaId)
  const copias = linhas.filter((l) => copiaIds.includes(String(l.id)))
  if (!fica || copias.length !== copiaIds.length) return { erro: "Alguma conta não foi encontrada (já foi juntada?). Recarregue a página." }
  const chave = (l: Record<string, unknown>) => chaveDaConta(texto(l.agencia), texto(l.conta)) ?? `pix|${chaveDoPix(texto(l.pix))}`
  if (copias.some((c) => chave(c) !== chave(fica))) return { erro: "As contas não são a mesma conta/chave." }
  const tipo: TipoDono = fica.fornecedor_id ? "fornecedor" : fica.usuario_id ? "usuario" : "filiado"
  const pessoa = await donosDaPessoa(tipo, String(fica.fornecedor_id ?? fica.usuario_id ?? fica.filiado_id))
  const daPessoa = (c: Record<string, unknown>) =>
    (c.fornecedor_id && pessoa.fornecedor_id.includes(String(c.fornecedor_id))) ||
    (c.usuario_id && pessoa.usuario_id.includes(String(c.usuario_id))) ||
    (c.filiado_id && pessoa.filiado_id.includes(String(c.filiado_id)))
  if (!copias.every(daPessoa)) return { erro: "As contas são de pessoas diferentes; não dá para juntar." }

  const { data: movidas, error: e1 } = await admin.from("ordens_pagamento").update({ dados_bancarios_id: ficaId }).in("dados_bancarios_id", copiaIds).select("id")
  if (e1) return { erro: `Não foi possível repassar as ordens: ${e1.message}` }
  const { error: e2 } = await admin.from("dados_bancarios").delete().in("id", copiaIds)
  if (e2) return { erro: `Não foi possível remover as cópias: ${e2.message}` }
  const patch: Record<string, unknown> = {}
  for (const campo of ["banco", "banco_codigo", "tipo_conta", "pix", "pix_tipo", "titular_documento"]) {
    if (!texto(fica[campo])) {
      const de = copias.find((c) => texto(c[campo]))
      if (de) patch[campo] = de[campo]
    }
  }
  if (!fica.favorito && copias.some((c) => c.favorito)) patch.favorito = true
  if (Object.keys(patch).length) await admin.from("dados_bancarios").update(patch).eq("id", ficaId)
  return { ordens: (movidas ?? []).length }
}

/** Grava o CPF/CNPJ do titular de uma conta (validado). */
export async function corrigirTitular(contaId: string, documento: string): Promise<{ erro?: string }> {
  const lido = lerDocumentoTitular(documento)
  if (lido.erro || !lido.documento) return { erro: lido.erro ?? "Informe o CPF/CNPJ do titular." }
  const admin = await createAdminClient()
  const { data, error } = await admin.from("dados_bancarios").update({ titular_documento: lido.documento }).eq("id", contaId).select("id")
  if (error) return { erro: `Não foi possível gravar: ${error.message}` }
  if (!data?.length) return { erro: "Conta não encontrada." }
  return {}
}
