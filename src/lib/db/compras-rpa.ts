import "server-only"

import { esquemaAusente, nomesDosUsuarios, texto } from "@/lib/db/comum"
import {
  normalizarConfigRpa,
  type ConfigRpa,
  type MemoriaMes,
  type RpaAnteriorDoMes,
} from "@/lib/rpa-calculo"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Aquisição › Contratos › RPA (Recibo de Pagamento a Autônomo) — leitura.
 * Escrita nas actions da rota. SQL: supabase/compras-rpa.sql,
 * contratos-rpa.sql (RPA de contrato), rpa-avulso.sql (recibo assinado) e
 * rpa-compra-servico.sql (RPA de compra de serviço).
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
  /** Contrato a que pertence (nulo = de compra, ou anterior a 29/09/2026). */
  contratoId: string | null
  contratoCodigo: string | null
  contratoObjeto: string | null
  /** Compra de serviço que o originou (supabase/rpa-compra-servico.sql). */
  compraId: string | null
  compraCodigo: string | null
  fornecimentoId: string | null
  /** Ordem de pagamento gerada na emissão. */
  ordemId: string | null
  ordemCodigo: string | null
  ordemSituacao: string | null
  /** Recibo assinado anexado (bucket compras) — com ele, não se exclui. */
  arquivoAssinado: string | null
  assinadoEm: string | null
  /** eletronica = pelo link do e-mail; anexo = à mão ou gov.br (supabase/rpa-assinatura-eletronica.sql). */
  assinaturaOrigem: "eletronica" | "anexo" | null
  /** Validação PAdES do PDF anexado (assinado pelo gov.br). */
  assinaturaValidacao: unknown
}

export type RpaDetalhe = RpaLinha & {
  fornecedor_id: string | null
  /** E-mail de contato do cadastro do fornecedor (sugestão para o envio da assinatura). */
  fornecedorEmail: string | null
  fornecedorCnpjCpf: string | null
  /**
   * NIT/PIS do prestador — só nos RPAs emitidos a partir de 28/10/2026, 21h06
   * (RPA_COM_NIT_DESDE): nos anteriores fica nulo, para o recibo e a
   * impressão da assinatura eletrônica continuarem como foram emitidos.
   */
  fornecedorNitPis: string | null
  fornecedorEndereco: string | null
  descricao_servico: string | null
  iss_aliquota: number | null
  dependentes: number
  valor_informado: number | null
  observacoes: string | null
  /** Memória do IRRF apurado com os outros RPAs do mês do pagamento (migração 20261031180527). */
  irrfMemoria: MemoriaMes | null
}

export const AVISO_SQL_RPA_ASSINATURA =
  "Rode supabase/rpa-avulso.sql no Supabase para anexar o recibo assinado."

export const AVISO_SQL_RPA_CONTRATO =
  "Rode supabase/contratos-rpa.sql no Supabase: o RPA passa a pertencer a um contrato e a gerar a ordem de pagamento."

type Vinculos = {
  contratos: Map<string, { codigo: string | null; objeto: string | null }>
  ordens: Map<string, { codigo: string | null; situacao: string | null }>
  compras: Map<string, { codigo: string | null }>
}

/** Código/objeto dos contratos e código/situação das ordens dos RPAs. */
async function vinculosDosRpas(
  linhas: { contrato_id?: unknown; ordem_pagamento_id?: unknown; processo_compra_id?: unknown }[]
): Promise<Vinculos> {
  const admin = await createAdminClient()
  const ids = (k: "contrato_id" | "ordem_pagamento_id" | "processo_compra_id") => [
    ...new Set(linhas.map((l) => texto(l[k])).filter((v): v is string => !!v)),
  ]
  const contratoIds = ids("contrato_id")
  const ordemIds = ids("ordem_pagamento_id")
  const compraIds = ids("processo_compra_id")
  const [{ data: cs }, { data: os }, { data: ps }] = await Promise.all([
    contratoIds.length
      ? admin.from("contratos").select("id, codigo, objeto").in("id", contratoIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    ordemIds.length
      ? admin.from("ordens_pagamento").select("id, codigo, situacao").in("id", ordemIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    compraIds.length
      ? admin.from("compras_solicitacoes").select("id, codigo").in("id", compraIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ])
  return {
    contratos: new Map(
      (cs ?? []).map((c) => [String(c.id), { codigo: texto(c.codigo), objeto: texto(c.objeto) }])
    ),
    ordens: new Map(
      (os ?? []).map((o) => [String(o.id), { codigo: texto(o.codigo), situacao: texto(o.situacao) }])
    ),
    compras: new Map((ps ?? []).map((p) => [String(p.id), { codigo: texto(p.codigo) }])),
  }
}

function camposDeVinculo(r: Record<string, unknown>, v: Vinculos) {
  const contratoId = texto(r.contrato_id)
  const ordemId = texto(r.ordem_pagamento_id)
  const contrato = contratoId ? v.contratos.get(contratoId) : undefined
  const compraId = texto(r.processo_compra_id)
  const ordem = ordemId ? v.ordens.get(ordemId) : undefined
  return {
    contratoId,
    contratoCodigo: contrato?.codigo ?? null,
    contratoObjeto: contrato?.objeto ?? null,
    // Colunas de supabase/rpa-compra-servico.sql — sem ele, vêm vazias.
    compraId,
    compraCodigo: compraId ? (v.compras.get(compraId)?.codigo ?? null) : null,
    fornecimentoId: texto(r.fornecimento_id),
    ordemId: ordem ? ordemId : null,
    ordemCodigo: ordem?.codigo ?? null,
    ordemSituacao: ordem?.situacao ?? null,
    // Colunas de supabase/rpa-avulso.sql — sem ele, vêm vazias.
    arquivoAssinado: texto(r.arquivo_assinado),
    assinadoEm: texto(r.assinado_em),
    assinaturaOrigem:
      r.assinatura_origem === "eletronica" || r.assinatura_origem === "anexo"
        ? (r.assinatura_origem as "eletronica" | "anexo")
        : null,
    assinaturaValidacao: r.assinatura_validacao ?? null,
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
  // "*": as colunas do recibo assinado (supabase/rpa-avulso.sql) vêm quando
  // existem, sem quebrar a lista antes do SQL.
  let consulta = admin
    .from("compras_rpa")
    .select("*")
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

/**
 * Emitido a partir deste instante, o RPA leva o NIT/PIS do prestador no PDF e
 * na impressão da assinatura (28/10/2026, 21h06 em Brasília). Os anteriores
 * ficam como foram emitidos — links de assinatura já enviados seguem válidos.
 */
export const RPA_COM_NIT_DESDE = "2026-10-29T00:06:00Z"

/** O RPA foi emitido já com o NIT/PIS no recibo? */
export function rpaComNit(createdAt: string | null | undefined): boolean {
  if (!createdAt) return false
  return new Date(createdAt).getTime() >= new Date(RPA_COM_NIT_DESDE).getTime()
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
  let fornecedorNitPis: string | null = null
  let fornecedorEndereco: string | null = null
  let fornecedorEmail: string | null = null
  if (r.fornecedor_id) {
    const [{ data: f }, { data: ends }] = await Promise.all([
      admin
        .from("empresa")
        .select("nome_fantasia, nome_razao, cnpj_cpf, email_contato, nit_pis")
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
    fornecedorNitPis = rpaComNit(r.created_at as string) ? texto(f?.nit_pis) : null
    fornecedorEmail = texto(f?.email_contato)
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
    fornecedorNitPis,
    fornecedorEndereco,
    fornecedorEmail,
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
    irrfMemoria: (r.irrf_memoria as MemoriaMes | null) ?? null,
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

// ── A compra de serviço do RPA ───────────────────────────────────────────────

export const AVISO_SQL_RPA_COMPRA =
  "Rode supabase/rpa-compra-servico.sql no Supabase para emitir RPA de compra de serviço."

const temCpf = (doc: string | null) => (doc ?? "").replace(/\D/g, "").length === 11

/**
 * O fornecimento de uma compra de serviço, com o que o RPA aproveita: o
 * prestador, o serviço, a classificação da despesa e o valor (que vira o
 * líquido do recibo). `impedimento` diz por que não dá para emitir.
 */
export type CompraDoRpa = {
  fornecimentoId: string
  processoId: string
  processoCodigo: string | null
  servico: string | null
  observacao: string | null
  departamentoId: string | null
  centroCustoId: string | null
  solicitanteId: string | null
  valor: number | null
  fornecedorId: string | null
  fornecedorNome: string | null
  fornecedorDocumento: string | null
  impedimento: string | null
  /**
   * A compra já gerou a ordem (forma, "Pagar em" e "para onde" definidos na
   * compra) e ela aguarda o documento fiscal — o RPA assinado. O recibo se
   * liga a ESSA ordem, sem pedir o pagamento de novo.
   */
  ordemPendente: { id: string; forma: string | null; vencimento: string | null } | null
}

const AGUARDANDO_DOCUMENTO = "Aguardando documento fiscal"

async function lerComprasDoRpa(filtro: { fornecimentoId?: string }): Promise<CompraDoRpa[]> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  let consulta = admin
    .from("compras_fornecimentos")
    .select("id, processo_id, fornecedor_id, valor, ordem_pagamento_id")
    .eq("emp_proprietaria_id", emp)
  if (filtro.fornecimentoId) {
    consulta = consulta.eq("id", filtro.fornecimentoId)
  } else {
    // Sem ordem, ou com a ordem da compra esperando o recibo assinado.
    const { data: pendentes } = await admin
      .from("ordens_pagamento")
      .select("id")
      .eq("emp_proprietaria_id", emp)
      .eq("situacao", AGUARDANDO_DOCUMENTO)
      .not("processo_compra_id", "is", null)
      .not("excluido", "is", true)
      .limit(500)
    const ids = (pendentes ?? []).map((o) => String(o.id))
    consulta = ids.length
      ? consulta.or(`ordem_pagamento_id.is.null,ordem_pagamento_id.in.(${ids.join(",")})`)
      : consulta.is("ordem_pagamento_id", null)
  }
  const { data: fs, error } = await consulta
  if (error) throw new Error(`Falha ao ler fornecimentos: ${error.message}`)
  // A ordem que já existe só aceita RPA se ainda espera o documento e
  // nenhum recibo foi emitido para ela.
  const ordemIds = [...new Set((fs ?? []).map((f) => texto(f.ordem_pagamento_id)).filter((v): v is string => !!v))]
  const ordensPorId = new Map<string, Record<string, unknown>>()
  const comRpa = new Set<string>()
  if (ordemIds.length) {
    const [{ data: os }, { data: rs }] = await Promise.all([
      admin.from("ordens_pagamento").select("id, situacao, forma_pagamento, vencimento").in("id", ordemIds),
      admin.from("compras_rpa").select("ordem_pagamento_id").in("ordem_pagamento_id", ordemIds),
    ])
    for (const o of os ?? []) ordensPorId.set(String(o.id), o)
    for (const r of rs ?? []) comRpa.add(String(r.ordem_pagamento_id))
  }
  const processoIds = [...new Set((fs ?? []).map((f) => texto(f.processo_id)).filter((v): v is string => !!v))]
  if (!processoIds.length) return []
  const procs: Record<string, unknown>[] = []
  for (let i = 0; i < processoIds.length; i += 200) {
    const { data } = await admin
      .from("compras_solicitacoes")
      .select(
        "id, codigo, bubble_id, cancelado, solicitacao_e_produto, solicitacao_produto, solicitacao_observacao, solicitacao_departamento_id, solicitacao_centro_custo_id, solicitante_id"
      )
      .in("id", processoIds.slice(i, i + 200))
      .eq("emp_proprietaria_id", emp)
    procs.push(...(data ?? []))
  }
  const porProcesso = new Map(procs.map((p) => [String(p.id), p]))
  const fornecedorIds = [...new Set((fs ?? []).map((f) => texto(f.fornecedor_id)).filter((v): v is string => !!v))]
  const empresas = new Map<string, Record<string, unknown>>()
  for (let i = 0; i < fornecedorIds.length; i += 200) {
    const { data } = await admin
      .from("empresa")
      .select("id, nome_fantasia, nome_razao, cnpj_cpf, fornecedor_bloqueado, bloqueado")
      .in("id", fornecedorIds.slice(i, i + 200))
    for (const e of data ?? []) empresas.set(String(e.id), e)
  }

  const saida: CompraDoRpa[] = []
  for (const f of fs ?? []) {
    const p = porProcesso.get(String(f.processo_id))
    if (!p) continue
    const fornecedorId = texto(f.fornecedor_id)
    const e = fornecedorId ? empresas.get(fornecedorId) : undefined
    const documento = texto(e?.cnpj_cpf)
    const nome = nomeDaEmpresa(e)
    const impedimento =
      p.solicitacao_e_produto !== false
        ? "O RPA só vale para compra de prestação de serviço — esta compra é de bem/produto."
        : p.cancelado === true
          ? "A compra está cancelada."
          : p.bubble_id
            ? "Compra migrada do Bubble: o pagamento dela seguiu por lá."
            : f.ordem_pagamento_id &&
                (ordensPorId.get(String(f.ordem_pagamento_id))?.situacao !== AGUARDANDO_DOCUMENTO ||
                  comRpa.has(String(f.ordem_pagamento_id)))
              ? comRpa.has(String(f.ordem_pagamento_id))
                ? "Esta compra já tem RPA emitido."
                : "Este fornecimento já tem ordem de pagamento."
              : !fornecedorId
                ? "O fornecimento não tem fornecedor."
                : !temCpf(documento)
                  ? `${nome ?? "O fornecedor"} não tem CPF no cadastro — RPA é só para autônomo (pessoa física).`
                  : e?.fornecedor_bloqueado === true || e?.bloqueado === true
                    ? `${nome ?? "O fornecedor"} está bloqueado como fornecedor.`
                    : null
    saida.push({
      fornecimentoId: String(f.id),
      processoId: String(p.id),
      processoCodigo: texto(p.codigo),
      servico: texto(p.solicitacao_produto),
      observacao: texto(p.solicitacao_observacao),
      departamentoId: texto(p.solicitacao_departamento_id),
      centroCustoId: texto(p.solicitacao_centro_custo_id),
      solicitanteId: texto(p.solicitante_id),
      valor: f.valor == null ? null : Number(f.valor),
      fornecedorId,
      fornecedorNome: nome,
      fornecedorDocumento: documento,
      impedimento,
      ordemPendente:
        f.ordem_pagamento_id && ordensPorId.get(String(f.ordem_pagamento_id))?.situacao === AGUARDANDO_DOCUMENTO
          ? {
              id: String(f.ordem_pagamento_id),
              forma: texto(ordensPorId.get(String(f.ordem_pagamento_id))?.forma_pagamento),
              vencimento: texto(ordensPorId.get(String(f.ordem_pagamento_id))?.vencimento),
            }
          : null,
    })
  }
  return saida
}

export async function compraDoRpa(fornecimentoId: string): Promise<CompraDoRpa | null> {
  if (!/^[0-9a-f-]{36}$/i.test(fornecimentoId)) return null
  return (await lerComprasDoRpa({ fornecimentoId }))[0] ?? null
}

/** Compras de serviço com prestador pessoa física aguardando o RPA. */
export async function comprasParaRpa(): Promise<CompraDoRpa[]> {
  return (await lerComprasDoRpa({}))
    .filter((c) => !c.impedimento)
    .sort((a, b) => (b.processoCodigo ?? "").localeCompare(a.processoCodigo ?? "", "pt-BR"))
}

/**
 * O fornecedor pode receber por RPA? (pessoa física pelo CPF e não
 * bloqueado). Devolve o motivo quando não pode.
 */
export async function impedimentoDoPrestador(fornecedorId: string): Promise<string | null> {
  if (!/^[0-9a-f-]{36}$/i.test(fornecedorId)) return "Escolha o fornecedor."
  const admin = await createAdminClient()
  const { data: e } = await admin
    .from("empresa")
    .select("nome_fantasia, nome_razao, cnpj_cpf, fornecedor_bloqueado, bloqueado")
    .eq("id", fornecedorId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (!e) return "Fornecedor não encontrado."
  const nome = nomeDaEmpresa(e) ?? "O fornecedor"
  if (!temCpf(texto(e.cnpj_cpf))) {
    return `${nome} não tem CPF no cadastro — RPA é só para autônomo (pessoa física). Corrija o documento em Fornecedores ou desligue "Pagar por RPA".`
  }
  if (e.fornecedor_bloqueado === true || e.bloqueado === true) return `${nome} está bloqueado como fornecedor.`
  return null
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

/** RPAs que pagam estes fornecimentos (fornecimento → RPA). Antes do SQL, vazio. */
export async function rpasDosFornecimentos(
  fornecimentoIds: string[]
): Promise<Map<string, { id: string; numero: number | null; assinado: boolean }>> {
  const mapa = new Map<string, { id: string; numero: number | null; assinado: boolean }>()
  if (!fornecimentoIds.length) return mapa
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("compras_rpa")
    .select("id, numero, fornecimento_id, arquivo_assinado")
    .eq("emp_proprietaria_id", await tenantAtual())
    .in("fornecimento_id", fornecimentoIds)
  if (error) return mapa
  for (const r of data ?? []) {
    mapa.set(String(r.fornecimento_id), {
      id: String(r.id),
      numero: (r.numero as number | null) ?? null,
      assinado: Boolean(r.arquivo_assinado),
    })
  }
  return mapa
}

// ── Limite de RPAs por prestador por mês ─────────────────────────────────────

/**
 * Quantos RPAs o mesmo prestador pode receber no mesmo mês de emissão.
 * null = sem limite (o gestor apagou o campo, ou antes da migração
 * 20261030150054). Padrão 1: vários recibos pequenos no mês ficariam, cada um,
 * abaixo da isenção da tabela mensal do IRRF.
 */
export async function limiteRpasMes(): Promise<number | null> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("compras_rpa_config")
    .select("limite_rpas_mes")
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (error) return null
  if (!data) return 1
  const n = Number(data.limite_rpas_mes)
  return data.limite_rpas_mes == null || !Number.isFinite(n) || n < 1 ? null : Math.round(n)
}

/** Primeiro instante do mês (AAAA-MM) em São Paulo, em ISO. */
function inicioDoMesSP(anoMes: string): string {
  return new Date(`${anoMes}-01T00:00:00-03:00`).toISOString()
}

/**
 * O prestador já atingiu o limite de RPAs do mês corrente (emissão, fuso de
 * São Paulo)? Devolve o aviso, com os RPAs do mês; null quando está dentro.
 * Só aviso desde a onda 5: o IRRF é apurado pelo total do mês do pagamento.
 */
export async function limiteMensalDoPrestador(fornecedorId: string): Promise<string | null> {
  const limite = await limiteRpasMes()
  if (limite === null) return null
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date())
  const [ano, mes] = hoje.slice(0, 7).split("-").map(Number)
  const proximo = `${mes === 12 ? ano + 1 : ano}-${String(mes === 12 ? 1 : mes + 1).padStart(2, "0")}`
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("compras_rpa")
    .select("numero")
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("fornecedor_id", fornecedorId)
    .gte("created_at", inicioDoMesSP(hoje.slice(0, 7)))
    .lt("created_at", inicioDoMesSP(proximo))
    .order("numero", { ascending: true })
  if (error) return null
  const doMes = (data ?? []) as { numero: number | null }[]
  if (doMes.length < limite) return null
  const numeros = doMes.map((r) => `nº ${r.numero ?? "—"}`).join(", ")
  const mesAno = `${String(mes).padStart(2, "0")}/${ano}`
  return (
    `Este prestador já tem ${doMes.length === 1 ? "um RPA" : `${doMes.length} RPAs`} emitido${doMes.length === 1 ? "" : "s"} em ${mesAno} (${numeros}) ` +
    `— o aviso é a partir de ${limite === 1 ? "um RPA" : `${limite} RPAs`} por prestador por mês. Se der, junte os serviços num só recibo.`
  )
}

// ── O mesmo limite, pelo mês do PAGAMENTO ────────────────────────────────────
// O IRRF é apurado pelo mês em que o prestador recebe: RPAs emitidos em meses
// diferentes e pagos no mesmo mês também somariam. Conta a ordem de cada RPA
// do prestador: paga no mês (data_pagamento) ou, se ainda não paga, prevista
// para ele ("Pagar em", o vencimento). Cancelada/estornada não conta.

const ORDEM_FORA_DA_CONTA = ["Cancelada", "Estornado"]

async function rpasNoMesDePagamento(
  fornecedorId: string,
  anoMes: string,
  opcoes: { excetoOrdemId?: string | null; previstos: boolean }
): Promise<{ numero: number | null; paga: boolean; bruto: number; inss: number; irrf: number }[]> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data: rpas, error } = await admin
    .from("compras_rpa")
    .select("numero, ordem_pagamento_id, valor_bruto, inss, irrf")
    .eq("emp_proprietaria_id", emp)
    .eq("fornecedor_id", fornecedorId)
    .not("ordem_pagamento_id", "is", null)
  if (error || !rpas?.length) return []
  type Rpa = { numero: number | null; ordem_pagamento_id: string; valor_bruto: number | null; inss: number | null; irrf: number | null }
  const porOrdem = new Map(
    (rpas as Rpa[])
      .filter((r) => r.ordem_pagamento_id !== opcoes.excetoOrdemId)
      .map((r) => [String(r.ordem_pagamento_id), r] as const)
  )
  if (!porOrdem.size) return []
  const { data: ordens } = await admin
    .from("ordens_pagamento")
    .select("id, situacao, data_pagamento, vencimento, excluido")
    .eq("emp_proprietaria_id", emp)
    .in("id", [...porOrdem.keys()])
  const lista: { numero: number | null; paga: boolean; bruto: number; inss: number; irrf: number }[] = []
  for (const o of (ordens ?? []) as Record<string, unknown>[]) {
    if (o.excluido === true || ORDEM_FORA_DA_CONTA.includes(String(o.situacao))) continue
    const paga = o.situacao === "Paga" && typeof o.data_pagamento === "string"
    const mes = paga ? String(o.data_pagamento).slice(0, 7) : opcoes.previstos ? texto(o.vencimento)?.slice(0, 7) : null
    const r = porOrdem.get(String(o.id))
    if (mes === anoMes && r) {
      lista.push({ numero: r.numero, paga, bruto: Number(r.valor_bruto) || 0, inss: Number(r.inss) || 0, irrf: Number(r.irrf) || 0 })
    }
  }
  return lista.sort((a, b) => (a.numero ?? 0) - (b.numero ?? 0))
}

function mensagemLimitePagamento(lista: { numero: number | null; paga: boolean }[], anoMes: string, limite: number, acao: string): string {
  const [ano, mes] = anoMes.split("-")
  const itens = lista.map((r) => `nº ${r.numero ?? "—"} ${r.paga ? "pago" : "previsto"}`).join(", ")
  return (
    `Este prestador já tem ${lista.length === 1 ? "um RPA" : `${lista.length} RPAs`} com pagamento em ${mes}/${ano} — ${itens} — ` +
    `e o aviso é a partir de ${limite === 1 ? "um RPA" : `${limite} RPAs`} por prestador por mês. ${acao}`
  )
}

/**
 * Os outros RPAs do prestador pagos ou previstos no mês de `dataPagamento`,
 * com as retenções — para o IRRF e o teto do INSS do mês (onda 5). null sem
 * data (RPA avulso): o recibo é calculado sozinho.
 */
export async function rpasDoMesDoPagamento(
  fornecedorId: string,
  dataPagamento: string | null,
  excetoOrdemId?: string | null
): Promise<{ mes: string; anteriores: RpaAnteriorDoMes[] } | null> {
  if (!dataPagamento || !/^\d{4}-\d{2}/.test(dataPagamento)) return null
  const mes = dataPagamento.slice(0, 7)
  const lista = await rpasNoMesDePagamento(fornecedorId, mes, { excetoOrdemId, previstos: true })
  return { mes, anteriores: lista.map((r) => ({ numero: r.numero, bruto: r.bruto, inss: r.inss, irrf: r.irrf, pago: r.paga })) }
}

/**
 * Na emissão: o RPA cuja ordem será paga em `dataPagamento` ("Pagar em")
 * cabe no limite do mês de pagamento? Conta os pagos e os previstos.
 */
export async function limiteMensalPorPagamento(
  fornecedorId: string,
  dataPagamento: string | null,
  excetoOrdemId?: string | null
): Promise<string | null> {
  if (!dataPagamento || !/^\d{4}-\d{2}/.test(dataPagamento)) return null
  const limite = await limiteRpasMes()
  if (limite === null) return null
  const anoMes = dataPagamento.slice(0, 7)
  const lista = await rpasNoMesDePagamento(fornecedorId, anoMes, { excetoOrdemId, previstos: true })
  if (lista.length < limite) return null
  return mensagemLimitePagamento(lista, anoMes, limite, "O IRRF deste recibo é calculado sobre o total do mês e retém a diferença.")
}

/**
 * No registro do pagamento: se a ordem é de um RPA, o prestador já recebeu
 * o limite de RPAs no mês desta data? Conta só os já pagos (fora esta ordem).
 * Também avisa quando o mês do pagamento não é o da apuração do IRRF do
 * recibo. Só aviso: não impede o registro.
 */
export async function limiteMensalNoPagamentoDaOrdem(ordemId: string, dataPagamento: string): Promise<string | null> {
  const admin = await createAdminClient()
  const { data: rpa } = await admin
    .from("compras_rpa")
    .select("fornecedor_id, numero, irrf_mes")
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("ordem_pagamento_id", ordemId)
    .limit(1)
    .maybeSingle()
  const fornecedorId = texto(rpa?.fornecedor_id)
  if (!fornecedorId) return null
  const anoMes = dataPagamento.slice(0, 7)
  const foraDoMes = mesDiferenteDaApuracao(rpa as { numero?: number | null; irrf_mes?: string | null }, anoMes)
  const limite = await limiteRpasMes()
  const lista = limite === null ? [] : await rpasNoMesDePagamento(fornecedorId, anoMes, { excetoOrdemId: ordemId, previstos: false })
  const acima =
    limite !== null && lista.length >= limite
      ? mensagemLimitePagamento(lista, anoMes, limite, "Confira com a contabilidade o IRRF do mês.")
      : null
  return [foraDoMes, acima].filter(Boolean).join(" ") || null
}

/** O IRRF do recibo foi apurado para outro mês que não o do pagamento? */
function mesDiferenteDaApuracao(rpa: { numero?: number | null; irrf_mes?: string | null } | null, anoMes: string): string | null {
  const apurado = texto(rpa?.irrf_mes)?.slice(0, 7)
  if (!apurado || apurado === anoMes) return null
  const mmaa = (m: string) => `${m.slice(5, 7)}/${m.slice(0, 4)}`
  return `O IRRF do RPA nº ${rpa?.numero ?? "—"} foi apurado para ${mmaa(apurado)}, com os RPAs daquele mês; pago em ${mmaa(anoMes)}, confira o imposto com a contabilidade.`
}

/**
 * Na remessa bancária: avisos da ordem de um RPA com pagamento em
 * `dataPagamento` — o limite do mês (pagos + previstos, fora esta ordem) e o
 * mês diferente do da apuração do IRRF. Texto curto, para os avisos da
 * ordem; não impede a remessa.
 */
export async function limiteRpaNaRemessa(
  ordemIds: { ordemId: string; dataPagamento: string }[]
): Promise<Map<string, string>> {
  const mapa = new Map<string, string>()
  if (!ordemIds.length) return mapa
  const limite = await limiteRpasMes()
  const admin = await createAdminClient()
  const { data } = await admin
    .from("compras_rpa")
    .select("ordem_pagamento_id, fornecedor_id, numero, irrf_mes")
    .eq("emp_proprietaria_id", await tenantAtual())
    .in(
      "ordem_pagamento_id",
      ordemIds.map((o) => o.ordemId)
    )
  type Linha = { ordem_pagamento_id: string; fornecedor_id: string | null; numero: number | null; irrf_mes: string | null }
  for (const r of (data ?? []) as Linha[]) {
    const alvo = ordemIds.find((o) => o.ordemId === r.ordem_pagamento_id)
    if (!alvo || !r.fornecedor_id) continue
    const anoMes = alvo.dataPagamento.slice(0, 7)
    const [ano, mes] = anoMes.split("-")
    const avisos: string[] = []
    const apurado = texto(r.irrf_mes)?.slice(0, 7)
    if (apurado && apurado !== anoMes) {
      avisos.push(`IRRF do RPA apurado para ${apurado.slice(5, 7)}/${apurado.slice(0, 4)}, pagamento em ${mes}/${ano}`)
    }
    if (limite !== null) {
      const lista = await rpasNoMesDePagamento(r.fornecedor_id, anoMes, { excetoOrdemId: alvo.ordemId, previstos: true })
      if (lista.length >= limite) {
        avisos.push(
          `outros RPAs do prestador em ${mes}/${ano} (${lista.map((x) => `nº ${x.numero ?? "—"} ${x.paga ? "pago" : "previsto"}`).join(", ")})`
        )
      }
    }
    if (avisos.length) mapa.set(alvo.ordemId, avisos.join(" · "))
  }
  return mapa
}
