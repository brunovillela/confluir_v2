import "server-only"

import { ehArquivo } from "@/lib/db/filiacao-documentos"
import { normalizarMatricula } from "@/lib/db/filiacao-matricula"
import { lerEmLotes as lerLotes } from "@/lib/db/comum"
import { listarFontesPagadoras } from "@/lib/db/fontes"
import { cpfConfiavel, validarCpf } from "@/lib/cpf"
import { camposFaltandoNoVinculo, ROTULO_FALTA_VINCULO } from "@/lib/filiacao"
import { configSaudeCadastros } from "@/lib/db/organizacao"
import {
  type ChaveCampoSaude,
  chaveCategoriaDaFonte,
  niveisPadrao,
  ROTULO_CAMPO_SAUDE,
} from "@/lib/saude-cadastros"
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
 * CONFIGURÁVEL (09/10/2026): o peso de cada falta — pendência, apontamento ou
 * normal — vem da configuração da saúde dos cadastros, pela categoria da fonte
 * do vínculo corrente (lib/saude-cadastros.ts). Só PENDÊNCIA derruba a saúde;
 * apontamento aparece na lista como aviso. O padrão é a regra acima.
 *
 * DEFINIÇÃO DE ATIVO: a condição do cadastro (`filiacao_condicao = 'Ativo'`).
 * A varredura passa por todos os ativos e todos os vínculos; o resultado fica
 * em cache por 10 minutos, por tenant.
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
  /** Chave da categoria da fonte do vínculo corrente — define a configuração aplicada. */
  categoria: string
  /** Só as faltas configuradas como PENDÊNCIA. */
  tipos: TipoPendencia[]
  /** Campos que faltam no vínculo corrente (quando tipo inclui "vinculo"). */
  faltamNoVinculo: string[]
  /** Faltas configuradas como APONTAMENTO (rótulos): avisam, não derrubam a saúde. */
  apontamentos: string[]
}

export type CadastrosPendentes = {
  ativos: number
  /** Cadastros com pendência OU apontamento; `tipos` vazio = só apontamento. */
  linhas: CadastroPendente[]
  /** Cadastros com ao menos uma pendência (os que derrubam a saúde). */
  pendentes: number
  /** Cadastros com ao menos um apontamento. */
  comApontamento: number
  totais: Record<TipoPendencia, number>
  geradoEm: string
}

const cache = new Map<string, { dados: CadastrosPendentes; expira: number }>()

export function invalidarCacheCadastrosPendentes() {
  cache.clear()
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
 * CPFs com conta na área do associado: a identidade da conta no tenant
 * (`auth_identidades`, tipo filiado — ver lib/auth-identidade.ts). Antes isto
 * varria todas as contas do Supabase Auth lendo `user_metadata.cpf`.
 */
async function cpfsComContaNoPortal(): Promise<Set<string>> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const cpfs = new Set<string>()
  for (let de = 0; ; de += 1000) {
    const { data, error } = await admin
      .from("auth_identidades")
      .select("cpf")
      .eq("emp_proprietaria_id", emp)
      .eq("tipo", "filiado")
      .range(de, de + 999)
    if (error) throw new Error(`Falha ao ler as contas do portal: ${error.message}`)
    for (const linha of data ?? []) cpfs.add(String(linha.cpf))
    if ((data ?? []).length < 1000) break
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
  const emp = await tenantAtual()
  const emCache = cache.get(emp)
  if (emCache && emCache.expira > Date.now()) return emCache.dados

  const admin = await createAdminClient()
  const [cadastros, vinculos, termos, fontes, comConta, identidades, { config, categorias }] = await Promise.all([
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
    configSaudeCadastros(),
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

  // Categoria de cada fonte: decide qual configuração vale para o filiado.
  const fontePorId = new Map(fontes.map((f) => [f.id, f]))

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
  let pendentes = 0
  let comApontamento = 0
  for (const c of cadastros) {
    const v = correntePorFiliado.get(c.id) ?? null
    // Sem vínculo em aberto ou sem fonte vale a categoria padrão (empregador).
    const categoria = chaveCategoriaDaFonte(
      v?.fonte_pagadora_id ? fontePorId.get(v.fonte_pagadora_id) : null,
      categorias
    )
    const niveis = config[categoria] ?? niveisPadrao("empregador")

    // Faltas apuradas; o nível configurado decide o que cada uma vira.
    const faltas: ChaveCampoSaude[] = []
    const cpf = (c.cpf ?? "").replace(/\D/g, "")
    if (!cpf || !validarCpf(cpf)) faltas.push("cpf")
    else if ((usosDoCpf.get(cpf) ?? 0) > 1) faltas.push("cpf_duplicado")
    const matricula = normalizarMatricula(c.matricula_sindical)
    if (!matricula || (usosDaMatricula.get(matricula) ?? 0) > 1) faltas.push("matricula")
    const nome = (c.nome_completo ?? "").trim()
    if (!nome || !nome.includes(" ")) faltas.push("nome")
    if (termos.lgpd && c.tl_lgpd_id !== termos.lgpd && comConta.has(cpf)) faltas.push("lgpd")
    if (termos.desconto && c.tl_desconto_id !== termos.desconto) faltas.push("desconto")
    if (!v) faltas.push("historico")
    else faltas.push(...camposFaltandoNoVinculo({ ...v, temFicha: ehArquivo(v.ficha_filiacao) }))

    const tipos: TipoPendencia[] = []
    const faltamNoVinculo: string[] = []
    const apontamentos: string[] = []
    for (const falta of faltas) {
      const nivel = niveis[falta]
      if (nivel === "normal") continue
      const doVinculo = falta.startsWith("v_")
      if (nivel === "apontamento") {
        apontamentos.push(
          doVinculo
            ? `vínculo: ${ROTULO_FALTA_VINCULO[falta as keyof typeof ROTULO_FALTA_VINCULO]}`
            : ROTULO_CAMPO_SAUDE[falta]
        )
      } else if (doVinculo) {
        faltamNoVinculo.push(ROTULO_FALTA_VINCULO[falta as keyof typeof ROTULO_FALTA_VINCULO])
      } else {
        tipos.push(falta as TipoPendencia)
      }
    }
    if (faltamNoVinculo.length > 0) tipos.push("vinculo")

    if (tipos.length === 0 && apontamentos.length === 0) continue
    for (const t of tipos) totais[t]++
    if (tipos.length > 0) pendentes++
    if (apontamentos.length > 0) comApontamento++
    linhas.push({
      filiadoId: c.id,
      nome: c.nome_completo,
      cpf: c.cpf,
      matricula: c.matricula_sindical,
      vinculoId: v?.id ?? null,
      categoria,
      tipos,
      faltamNoVinculo,
      apontamentos,
    })
  }
  linhas.sort((a, b) => (a.nome ?? "").localeCompare(b.nome ?? "", "pt-BR"))

  const dados: CadastrosPendentes = {
    ativos: cadastros.length,
    linhas,
    pendentes,
    comApontamento,
    totais,
    geradoEm: new Date().toISOString(),
  }
  cache.set(emp, { dados, expira: Date.now() + VALIDADE_CACHE_MS })
  return dados
}