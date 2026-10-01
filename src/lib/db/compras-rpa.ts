import "server-only"

import { esquemaAusente, nomesDosUsuarios, texto } from "@/lib/db/comum"
import {
  normalizarConfigRpa,
  type ConfigRpa,
} from "@/lib/rpa-calculo"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Aquisição › Contratos › RPA (Recibo de Pagamento a Autônomo) — leitura.
 * Escrita nas actions da rota. SQL: supabase/compras-rpa.sql.
 */

export type RpaLinha = {
  id: string
  numero: number | null
  fornecedorNome: string | null
  data_servico: string | null
  base: string | null
  valor_bruto: number | null
  inss: number | null
  irrf: number | null
  iss: number | null
  valor_liquido: number | null
  criadoPorNome: string | null
  created_at: string
  /** Contrato a que pertence (nulo só nos RPAs anteriores a 29/09/2026). */
  contratoId: string | null
  contratoCodigo: string | null
  contratoObjeto: string | null
  /** Ordem de pagamento gerada na emissão. */
  ordemId: string | null
  ordemCodigo: string | null
  ordemSituacao: string | null
}

export type RpaDetalhe = RpaLinha & {
  fornecedor_id: string | null
  fornecedorCnpjCpf: string | null
  fornecedorEndereco: string | null
  descricao_servico: string | null
  iss_aliquota: number | null
  dependentes: number
  valor_informado: number | null
  observacoes: string | null
}

export const AVISO_SQL_RPA_CONTRATO =
  "Rode supabase/contratos-rpa.sql no Supabase: o RPA passa a pertencer a um contrato e a gerar a ordem de pagamento."

type Vinculos = {
  contratos: Map<string, { codigo: string | null; objeto: string | null }>
  ordens: Map<string, { codigo: string | null; situacao: string | null }>
}

/** Código/objeto dos contratos e código/situação das ordens dos RPAs. */
async function vinculosDosRpas(
  linhas: { contrato_id?: unknown; ordem_pagamento_id?: unknown }[]
): Promise<Vinculos> {
  const admin = await createAdminClient()
  const ids = (k: "contrato_id" | "ordem_pagamento_id") => [
    ...new Set(linhas.map((l) => texto(l[k])).filter((v): v is string => !!v)),
  ]
  const contratoIds = ids("contrato_id")
  const ordemIds = ids("ordem_pagamento_id")
  const [{ data: cs }, { data: os }] = await Promise.all([
    contratoIds.length
      ? admin.from("contratos").select("id, codigo, objeto").in("id", contratoIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    ordemIds.length
      ? admin.from("ordens_pagamento").select("id, codigo, situacao").in("id", ordemIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ])
  return {
    contratos: new Map(
      (cs ?? []).map((c) => [String(c.id), { codigo: texto(c.codigo), objeto: texto(c.objeto) }])
    ),
    ordens: new Map(
      (os ?? []).map((o) => [String(o.id), { codigo: texto(o.codigo), situacao: texto(o.situacao) }])
    ),
  }
}

function camposDeVinculo(r: Record<string, unknown>, v: Vinculos) {
  const contratoId = texto(r.contrato_id)
  const ordemId = texto(r.ordem_pagamento_id)
  const contrato = contratoId ? v.contratos.get(contratoId) : undefined
  const ordem = ordemId ? v.ordens.get(ordemId) : undefined
  return {
    contratoId,
    contratoCodigo: contrato?.codigo ?? null,
    contratoObjeto: contrato?.objeto ?? null,
    ordemId: ordem ? ordemId : null,
    ordemCodigo: ordem?.codigo ?? null,
    ordemSituacao: ordem?.situacao ?? null,
  }
}

/**
 * ativo=false → rodar o SQL (compras-rpa.sql ou contratos-rpa.sql).
 * Com `contratoId`, só os RPAs daquele contrato.
 */
export async function listarRpas(
  filtro: { contratoId?: string } = {}
): Promise<{ ativo: boolean; linhas: RpaLinha[] }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  let consulta = admin
    .from("compras_rpa")
    .select(
      "id, numero, fornecedor_id, data_servico, base, valor_bruto, inss, irrf, iss, valor_liquido, criado_por, created_at, contrato_id, ordem_pagamento_id"
    )
    .eq("emp_proprietaria_id", emp)
  if (filtro.contratoId) consulta = consulta.eq("contrato_id", filtro.contratoId)
  const { data, error } = await consulta.order("numero", { ascending: false })
  if (error) {
    if (esquemaAusente(error)) return { ativo: false, linhas: [] }
    throw new Error(`Falha ao listar RPAs: ${error.message}`)
  }
  const vinculos = await vinculosDosRpas(data ?? [])
  const fornecedorIds = [
    ...new Set(
      (data ?? []).map((r) => r.fornecedor_id).filter((v): v is string => !!v)
    ),
  ]
  const nomesForn = new Map<string, string>()
  if (fornecedorIds.length) {
    const { data: emps } = await admin
      .from("empresa")
      .select("id, nome_fantasia, nome_razao")
      .in("id", fornecedorIds)
    for (const e of emps ?? []) {
      const n = [e.nome_fantasia, e.nome_razao].find(
        (v): v is string => typeof v === "string" && v.trim() !== ""
      )
      if (n) nomesForn.set(e.id as string, n)
    }
  }
  const nomes = await nomesDosUsuarios(
    (data ?? []).map((r) => r.criado_por).filter((v): v is string => !!v)
  )
  return {
    ativo: true,
    linhas: (data ?? []).map((r) => ({
      id: r.id as string,
      numero: r.numero as number | null,
      fornecedorNome: r.fornecedor_id
        ? (nomesForn.get(r.fornecedor_id) ?? null)
        : null,
      data_servico: r.data_servico as string | null,
      base: r.base as string | null,
      valor_bruto: r.valor_bruto as number | null,
      inss: r.inss as number | null,
      irrf: r.irrf as number | null,
      iss: r.iss as number | null,
      valor_liquido: r.valor_liquido as number | null,
      criadoPorNome: r.criado_por ? (nomes.get(r.criado_por) ?? null) : null,
      created_at: r.created_at as string,
      ...camposDeVinculo(r, vinculos),
    })),
  }
}

export async function buscarRpa(id: string): Promise<RpaDetalhe | null> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data: r, error } = await admin
    .from("compras_rpa")
    .select("*")
    .eq("id", id)
    .eq("emp_proprietaria_id", emp)
    .maybeSingle()
  if (error || !r) return null

  let fornecedorNome: string | null = null
  let fornecedorCnpjCpf: string | null = null
  let fornecedorEndereco: string | null = null
  if (r.fornecedor_id) {
    const [{ data: f }, { data: ends }] = await Promise.all([
      admin
        .from("empresa")
        .select("nome_fantasia, nome_razao, cnpj_cpf")
        .eq("id", r.fornecedor_id)
        .maybeSingle(),
      admin
        .from("enderecos")
        .select("logradouro, numero, complemento, bairro, cidade, estado, cep")
        .eq("empresa_id", r.fornecedor_id)
        .limit(1),
    ])
    fornecedorNome =
      [f?.nome_fantasia, f?.nome_razao].find(
        (v): v is string => typeof v === "string" && v.trim() !== ""
      ) ?? null
    fornecedorCnpjCpf = texto(f?.cnpj_cpf)
    const e = ends?.[0]
    if (e) {
      fornecedorEndereco =
        [
          [e.logradouro, e.numero].filter(Boolean).join(", "),
          e.bairro,
          [e.cidade, e.estado].filter(Boolean).join("/"),
          e.cep ? `CEP ${e.cep}` : null,
        ]
          .filter(Boolean)
          .join(" — ") || null
    }
  }

  const [nomes, vinculos] = await Promise.all([
    nomesDosUsuarios([r.criado_por].filter((v): v is string => !!v)),
    vinculosDosRpas([r]),
  ])
  return {
    ...camposDeVinculo(r, vinculos),
    id: r.id as string,
    numero: r.numero as number | null,
    fornecedor_id: r.fornecedor_id as string | null,
    fornecedorNome,
    fornecedorCnpjCpf,
    fornecedorEndereco,
    descricao_servico: r.descricao_servico as string | null,
    data_servico: r.data_servico as string | null,
    base: r.base as string | null,
    valor_informado: r.valor_informado as number | null,
    valor_bruto: r.valor_bruto as number | null,
    inss: r.inss as number | null,
    irrf: r.irrf as number | null,
    iss: r.iss as number | null,
    iss_aliquota: r.iss_aliquota as number | null,
    dependentes: (r.dependentes as number | null) ?? 0,
    valor_liquido: r.valor_liquido as number | null,
    observacoes: r.observacoes as string | null,
    criadoPorNome: r.criado_por ? (nomes.get(r.criado_por) ?? null) : null,
    created_at: r.created_at as string,
  }
}

/** Config das retenções do tenant (padrões quando não gravada/SQL ausente). */
export async function obterConfigRpa(): Promise<ConfigRpa> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("compras_rpa_config")
    .select(
      "inss_aliquota, inss_teto, irrf_faixas, irrf_deducao_dependente, iss_aliquota_padrao"
    )
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  return normalizarConfigRpa(data ?? {})
}

// ── O contrato do RPA ────────────────────────────────────────────────────────

export type ContratoDoRpa = {
  id: string
  codigo: string | null
  objeto: string | null
  valor: number | null
  vigenciaTermino: string | null
  fornecedorId: string | null
  fornecedorNome: string | null
  /** O RPA é de autônomo: só fornecedor pessoa física. */
  fornecedorPessoaJuridica: boolean
  departamentoId: string | null
  centroCustoId: string | null
}

function nomeDaEmpresa(e: Record<string, unknown> | undefined): string | null {
  return texto(e?.nome_fantasia) ?? texto(e?.nome_razao)
}

/**
 * Pessoa física ou jurídica: o número decide (11 dígitos = CPF, 14 = CNPJ) —
 * a marcação pessoa_juridica do legado não é confiável. Sem documento, vale ela.
 */
function pessoaDoFornecedor(e: Record<string, unknown> | undefined): {
  fornecedorPessoaJuridica: boolean
} {
  const digitos = (texto(e?.cnpj_cpf) ?? "").replace(/\D/g, "").length
  if (digitos === 14) return { fornecedorPessoaJuridica: true }
  if (digitos === 11) return { fornecedorPessoaJuridica: false }
  return { fornecedorPessoaJuridica: e?.pessoa_juridica === true }
}

/**
 * Contratos que podem receber RPA: ativos (não excluídos), fora das ajudas
 * institucionais. `fornecedorPessoaJuridica` decide se o RPA é possível.
 */
async function lerContratos(filtroId?: string): Promise<ContratoDoRpa[]> {
  const admin = await createAdminClient()
  let consulta = admin
    .from("contratos")
    .select(
      "id, codigo, objeto, valor, vigencia_termino, fornecedor_id, departamento_id, centro_custo_id, deletado, apoio_institucional"
    )
    .eq("emp_proprietaria_id", await tenantAtual())
  if (filtroId) consulta = consulta.eq("id", filtroId)
  const { data, error } = await consulta
  if (error) throw new Error(`Falha ao ler contratos: ${error.message}`)
  const linhas = (data ?? []).filter(
    (c) => c.deletado !== true && c.apoio_institucional !== true
  )
  const fornecedorIds = [
    ...new Set(linhas.map((c) => texto(c.fornecedor_id)).filter((v): v is string => !!v)),
  ]
  const { data: emps } = fornecedorIds.length
    ? await admin
        .from("empresa")
        .select("id, nome_fantasia, nome_razao, cnpj_cpf, pessoa_juridica")
        .in("id", fornecedorIds)
    : { data: [] as Record<string, unknown>[] }
  const empresas = new Map((emps ?? []).map((e) => [String(e.id), e as Record<string, unknown>]))
  return linhas.map((c) => {
    const fornecedorId = texto(c.fornecedor_id)
    const e = fornecedorId ? empresas.get(fornecedorId) : undefined
    return {
      ...pessoaDoFornecedor(e),
      id: String(c.id),
      codigo: texto(c.codigo),
      objeto: texto(c.objeto),
      valor: typeof c.valor === "number" ? c.valor : c.valor == null ? null : Number(c.valor),
      vigenciaTermino: texto(c.vigencia_termino),
      fornecedorId,
      fornecedorNome: nomeDaEmpresa(e),
      departamentoId: texto(c.departamento_id),
      centroCustoId: texto(c.centro_custo_id),
    }
  })
}

export async function contratoDoRpa(id: string): Promise<ContratoDoRpa | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null
  return (await lerContratos(id))[0] ?? null
}

/** Contratos com prestador pessoa física — os que aceitam RPA. */
export async function contratosParaRpa(): Promise<ContratoDoRpa[]> {
  return (await lerContratos())
    .filter((c) => c.fornecedorId && !c.fornecedorPessoaJuridica)
    .sort((a, b) =>
      `${a.codigo ?? ""} ${a.objeto ?? ""}`.localeCompare(`${b.codigo ?? ""} ${b.objeto ?? ""}`, "pt-BR")
    )
}

/** Próximo número sequencial de RPA do tenant. */
export async function proximoNumeroRpa(): Promise<number> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("compras_rpa")
    .select("numero")
    .eq("emp_proprietaria_id", await tenantAtual())
    .order("numero", { ascending: false })
    .limit(1)
  return ((data?.[0]?.numero as number | null) ?? 0) + 1
}
