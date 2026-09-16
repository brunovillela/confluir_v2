import "server-only"

import { ehArquivo } from "@/lib/db/filiacao-documentos"
import { normalizarMatricula } from "@/lib/db/filiacao-matricula"
import { listarFontesPagadoras } from "@/lib/db/fontes"
import { cpfConfiavel, validarCpf } from "@/lib/cpf"
import { pendenciasDoVinculo } from "@/lib/filiacao"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Cadastros PENDENTES: filiados ativos com alguma inconsistência — dado
 * fundamental faltando (CPF, nome completo, termos legais), histórico de
 * vínculos ausente ou vínculo corrente incompleto (ver `pendenciasDoVinculo`).
 * Vínculo em fundo de pensão sem cargo e lotação NÃO é pendência (12/09/2026).
 * CPF em outro cadastro e matrícula sindical ausente ou repetida entraram em
 * 16/09/2026, depois da varredura de duplicidades (ver filiacao-identidade.ts).
 * Termo LGPD não aceito só é pendência de quem tem conta na área do associado —
 * é lá que o filiado aceita o termo (decisão do Bruno, 15/09/2026).
 *
 * Substitui a tela "Fichas pendentes" (decisão do Bruno, 10/09/2026): a ficha
 * continua sendo uma das pendências, mas deixa de ser a única.
 *
 * DEFINIÇÃO DE ATIVO: a condição do cadastro (`filiacao_condicao = 'Ativo'`).
 * A varredura passa por todos os ativos e todos os vínculos; o resultado fica
 * em cache por 10 minutos.
 */

const VALIDADE_CACHE_MS = 10 * 60 * 1000

export const TIPOS_PENDENCIA = [
  "cpf",
  "cpf_duplicado",
  "matricula",
  "nome",
  "lgpd",
  "desconto",
  "historico",
  "vinculo",
] as const
export type TipoPendencia = (typeof TIPOS_PENDENCIA)[number]

export const ROTULO_PENDENCIA: Record<TipoPendencia, string> = {
  cpf: "CPF ausente ou inválido",
  cpf_duplicado: "CPF em outro cadastro",
  matricula: "Matrícula sindical ausente ou repetida",
  nome: "Nome incompleto",
  lgpd: "Termo LGPD não aceito",
  desconto: "Termo de desconto não aceito",
  historico: "Sem vínculo em aberto",
  vinculo: "Vínculo incompleto",
}

export type CadastroPendente = {
  filiadoId: string
  nome: string | null
  cpf: string | null
  matricula: string | null
  /** Vínculo corrente (em aberto), quando existe. */
  vinculoId: string | null
  tipos: TipoPendencia[]
  /** Campos que faltam no vínculo corrente (quando tipo inclui "vinculo"). */
  faltamNoVinculo: string[]
}

export type CadastrosPendentes = {
  ativos: number
  linhas: CadastroPendente[]
  totais: Record<TipoPendencia, number>
  geradoEm: string
}

let cache: { dados: CadastrosPendentes; expira: number } | null = null

export function invalidarCacheCadastrosPendentes() {
  cache = null
}

async function lerLotes<T>(
  consulta: (
    de: number,
    ate: number
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const LOTE = 1000
  const linhas: T[] = []
  for (let de = 0; ; de += LOTE) {
    const { data, error } = await consulta(de, de + LOTE - 1)
    if (error) throw new Error(`Falha na varredura: ${error.message}`)
    linhas.push(...(data ?? []))
    if (!data || data.length < LOTE) break
  }
  return linhas
}

type Cadastro = {
  id: string
  nome_completo: string | null
  cpf: string | null
  matricula_sindical: string | null
  tl_lgpd_id: string | null
  tl_desconto_id: string | null
}

type LinhaVinculo = {
  id: string
  filiado_id: string | null
  fonte_pagadora_id: string | null
  matricula: string | null
  cargo: string | null
  lotacao: string | null
  data_entrada_admissao: string | null
  data_filiacao: string | null
  filiacao_data_adesao: string | null
  data_desfiliacao: string | null
  filiacao_data_saida: string | null
  ficha_filiacao: string | null
  condicao_na_fonte: string | null
  regime_trabalho: string | null
}

/**
 * CPFs com conta na área do associado. A conta vive no Supabase Auth (global,
 * sem tenant) com o CPF em `user_metadata.cpf`; o cruzamento com `filiacoes`
 * do tenant é que a torna do filiado daqui.
 */
async function cpfsComContaNoPortal(): Promise<Set<string>> {
  const admin = await createAdminClient()
  const cpfs = new Set<string>()
  for (let pagina = 1; ; pagina++) {
    const { data, error } = await admin.auth.admin.listUsers({ page: pagina, perPage: 1000 })
    if (error) throw new Error(`Falha ao ler as contas do portal: ${error.message}`)
    for (const u of data.users) {
      const cpf = u.user_metadata?.cpf
      if (typeof cpf === "string" && cpf.length === 11) cpfs.add(cpf)
    }
    if (data.users.length < 1000) break
  }
  return cpfs
}

/** Ids dos termos em vigor (LGPD e desconto); null = tabela sem versão em vigor. */
async function termosEmVigor(): Promise<{ lgpd: string | null; desconto: string | null }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const ler = async (tabela: string) => {
    const { data } = await admin
      .from(tabela)
      .select("id")
      .eq("emp_proprietaria_id", emp)
      .eq("em_vigor", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    return data ? String(data.id) : null
  }
  const [lgpd, desconto] = await Promise.all([
    ler("filiacao_tl_lgpd"),
    ler("filiacao_tl_desconto"),
  ])
  return { lgpd, desconto }
}

const dataDeFiliacao = (v: LinhaVinculo) => v.data_filiacao ?? v.filiacao_data_adesao ?? ""
const aberto = (v: LinhaVinculo) => !v.data_desfiliacao && !v.filiacao_data_saida

export async function cadastrosPendentes(): Promise<CadastrosPendentes> {
  if (cache && cache.expira > Date.now()) return cache.dados

  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const [cadastros, vinculos, termos, fontes, comConta, identidades] = await Promise.all([
    lerLotes<Cadastro>((de, ate) =>
      admin
        .from("filiacoes")
        .select("id, nome_completo, cpf, matricula_sindical, tl_lgpd_id, tl_desconto_id")
        .eq("emp_proprietaria_id", emp)
        .eq("filiacao_condicao", "Ativo")
        .not("filiacao_excluida", "is", true)
        .order("id", { ascending: true })
        .range(de, ate)
    ),
    lerLotes<LinhaVinculo>((de, ate) =>
      admin
        .from("filiacao_vinculos")
        .select(
          "id, filiado_id, fonte_pagadora_id, matricula, cargo, lotacao, data_entrada_admissao, data_filiacao, filiacao_data_adesao, data_desfiliacao, filiacao_data_saida, ficha_filiacao, condicao_na_fonte, regime_trabalho"
        )
        .eq("emp_proprietaria_id", emp)
        .not("filiado_id", "is", null)
        .order("id", { ascending: true })
        .range(de, ate)
    ),
    termosEmVigor(),
    listarFontesPagadoras(),
    cpfsComContaNoPortal(),
    // Todos os cadastros não excluídos (não só ativos): a repetição de CPF ou
    // matrícula pode estar num cadastro antigo da mesma pessoa.
    lerLotes<{ id: string; cpf: string | null; matricula_sindical: string | null }>((de, ate) =>
      admin
        .from("filiacoes")
        .select("id, cpf, matricula_sindical")
        .eq("emp_proprietaria_id", emp)
        .not("filiacao_excluida", "is", true)
        .order("id", { ascending: true })
        .range(de, ate)
    ),
  ])

  const contagem = (chave: (x: { cpf: string | null; matricula_sindical: string | null }) => string | null) => {
    const m = new Map<string, number>()
    for (const x of identidades) {
      const k = chave(x)
      if (k) m.set(k, (m.get(k) ?? 0) + 1)
    }
    return m
  }
  const usosDoCpf = contagem((x) => cpfConfiavel(x.cpf))
  const usosDaMatricula = contagem((x) => normalizarMatricula(x.matricula_sindical))

  // Fontes que são fundo de pensão: cargo e lotação não se aplicam ao vínculo.
  const fundosPensao = new Set(
    fontes.filter((f) => f.fundo_pensao === true).map((f) => f.id)
  )

  // Vínculo corrente = o ABERTO mais recente; sem aberto, é pendência de histórico.
  const correntePorFiliado = new Map<string, LinhaVinculo>()
  for (const v of vinculos) {
    if (!aberto(v)) continue
    const id = v.filiado_id as string
    const atual = correntePorFiliado.get(id)
    if (!atual || dataDeFiliacao(v) > dataDeFiliacao(atual)) correntePorFiliado.set(id, v)
  }

  const totais: Record<TipoPendencia, number> = {
    cpf: 0,
    cpf_duplicado: 0,
    matricula: 0,
    nome: 0,
    lgpd: 0,
    desconto: 0,
    historico: 0,
    vinculo: 0,
  }
  const linhas: CadastroPendente[] = []
  for (const c of cadastros) {
    const tipos: TipoPendencia[] = []
    const cpf = (c.cpf ?? "").replace(/\D/g, "")
    if (!cpf || !validarCpf(cpf)) tipos.push("cpf")
    else if ((usosDoCpf.get(cpf) ?? 0) > 1) tipos.push("cpf_duplicado")
    const matricula = normalizarMatricula(c.matricula_sindical)
    if (!matricula || (usosDaMatricula.get(matricula) ?? 0) > 1) tipos.push("matricula")
    const nome = (c.nome_completo ?? "").trim()
    if (!nome || !nome.includes(" ")) tipos.push("nome")
    if (termos.lgpd && c.tl_lgpd_id !== termos.lgpd && comConta.has(cpf)) tipos.push("lgpd")
    if (termos.desconto && c.tl_desconto_id !== termos.desconto) tipos.push("desconto")

    const v = correntePorFiliado.get(c.id) ?? null
    let faltamNoVinculo: string[] = []
    if (!v) {
      tipos.push("historico")
    } else {
      faltamNoVinculo = pendenciasDoVinculo({
        ...v,
        temFicha: ehArquivo(v.ficha_filiacao),
        fundoPensao: v.fonte_pagadora_id
          ? fundosPensao.has(v.fonte_pagadora_id)
          : false,
      })
      if (faltamNoVinculo.length > 0) tipos.push("vinculo")
    }
    if (tipos.length === 0) continue
    for (const t of tipos) totais[t]++
    linhas.push({
      filiadoId: c.id,
      nome: c.nome_completo,
      cpf: c.cpf,
      matricula: c.matricula_sindical,
      vinculoId: v?.id ?? null,
      tipos,
      faltamNoVinculo,
    })
  }
  linhas.sort((a, b) => (a.nome ?? "").localeCompare(b.nome ?? "", "pt-BR"))

  const dados: CadastrosPendentes = {
    ativos: cadastros.length,
    linhas,
    totais,
    geradoEm: new Date().toISOString(),
  }
  cache = { dados, expira: Date.now() + VALIDADE_CACHE_MS }
  return dados
}
