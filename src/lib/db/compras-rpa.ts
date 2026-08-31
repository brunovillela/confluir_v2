import "server-only"

import { esquemaAusente, nomesDosUsuarios, texto } from "@/lib/db/comum"
import {
  normalizarConfigRpa,
  type ConfigRpa,
} from "@/lib/rpa-calculo"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Compras › Contratos › RPA (Recibo de Pagamento a Autônomo) — leitura.
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

/** ativo=false → rodar o SQL. */
export async function listarRpas(): Promise<{ ativo: boolean; linhas: RpaLinha[] }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data, error } = await admin
    .from("compras_rpa")
    .select(
      "id, numero, fornecedor_id, data_servico, base, valor_bruto, inss, irrf, iss, valor_liquido, criado_por, created_at"
    )
    .eq("emp_proprietaria_id", emp)
    .order("numero", { ascending: false })
  if (error) {
    if (esquemaAusente(error)) return { ativo: false, linhas: [] }
    throw new Error(`Falha ao listar RPAs: ${error.message}`)
  }
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

  const nomes = await nomesDosUsuarios(
    [r.criado_por].filter((v): v is string => !!v)
  )
  return {
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
