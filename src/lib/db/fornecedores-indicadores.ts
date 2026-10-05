import "server-only"

import { validarCnpj, validarCpf } from "@/lib/cpf"
import { hojeSP, lerEmLotes } from "@/lib/db/comum"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Indicadores e PROBLEMAS DE CADASTRO dos fornecedores (linhas de `empresa`,
 * incluindo as entidades apoiadas). Problema de CPF/CNPJ é o que mais pesa:
 * com a regra de auditoria "CPF/CNPJ do favorecido" em Bloquear, o fornecedor
 * não recebe ordem nova até o cadastro ser corrigido.
 */

export type CodigoProblema =
  | "sem_documento"
  | "documento_invalido"
  | "tipo_divergente"
  | "documento_duplicado"
  | "sem_pagamento"
  | "sem_endereco"

export type ProblemaCadastro = {
  codigo: CodigoProblema
  rotulo: string
  detalhe: string
  /** alta = pode travar pagamento; media = dado inconsistente; baixa = só incompleto (pendência). */
  gravidade: "alta" | "media" | "baixa"
}

/** Problema de verdade — pendência de preenchimento (baixa) não conta. */
export const ehProblema = (p: ProblemaCadastro) => p.gravidade !== "baixa"

export const ROTULO_PROBLEMA: Record<CodigoProblema, string> = {
  sem_documento: "Sem CPF/CNPJ",
  documento_invalido: "CPF/CNPJ inválido",
  tipo_divergente: "PF/PJ não bate com o documento",
  documento_duplicado: "CPF/CNPJ repetido",
  sem_pagamento: "Sem conta nem Pix",
  sem_endereco: "Sem endereço",
}

const digitos = (v: string | null) => (v ?? "").replace(/\D/g, "")

export function problemasDoCadastro(
  f: { cnpj_cpf: string | null; pessoa_juridica: boolean },
  ctx: { temPagamento: boolean; temEndereco: boolean | null; duplicadoCom?: number }
): ProblemaCadastro[] {
  const p: ProblemaCadastro[] = []
  const d = digitos(f.cnpj_cpf)
  if (!d) {
    p.push({ codigo: "sem_documento", rotulo: ROTULO_PROBLEMA.sem_documento, detalhe: "O cadastro não tem CPF nem CNPJ.", gravidade: "alta" })
  } else if (!(d.length === 11 ? validarCpf(d) : d.length === 14 ? validarCnpj(d) : false)) {
    p.push({
      codigo: "documento_invalido",
      rotulo: ROTULO_PROBLEMA.documento_invalido,
      detalhe:
        d.length === 11 || d.length === 14
          ? `${f.cnpj_cpf} não fecha nos dígitos verificadores.`
          : `${f.cnpj_cpf} tem ${d.length} dígitos — CPF tem 11 e CNPJ tem 14.`,
      gravidade: "alta",
    })
  }
  // Vale mesmo com dígito errado: 14 dígitos marcado como PF é erro à parte.
  if ((d.length === 11 || d.length === 14) && (d.length === 14) !== f.pessoa_juridica) {
    p.push({
      codigo: "tipo_divergente",
      rotulo: ROTULO_PROBLEMA.tipo_divergente,
      detalhe: `Marcado como pessoa ${f.pessoa_juridica ? "jurídica" : "física"}, mas o documento é um ${d.length === 14 ? "CNPJ" : "CPF"}.`,
      gravidade: "media",
    })
  }
  if (ctx.duplicadoCom && ctx.duplicadoCom > 0) {
    p.push({
      codigo: "documento_duplicado",
      rotulo: ROTULO_PROBLEMA.documento_duplicado,
      detalhe: `O mesmo CPF/CNPJ está em mais ${ctx.duplicadoCom} cadastro(s) ativo(s).`,
      gravidade: "media",
    })
  }
  if (!ctx.temPagamento) {
    p.push({ codigo: "sem_pagamento", rotulo: ROTULO_PROBLEMA.sem_pagamento, detalhe: "Nenhuma conta bancária nem chave Pix cadastrada.", gravidade: "baixa" })
  }
  if (ctx.temEndereco === false) {
    p.push({ codigo: "sem_endereco", rotulo: ROTULO_PROBLEMA.sem_endereco, detalhe: "Nenhum endereço cadastrado.", gravidade: "baixa" })
  }
  return p
}

const SITUACOES_ABERTAS = ["Em autorização", "A pagar", "Processando", "Aguardando informações"]

type Movimento = {
  pago12m: number
  pagoTotal: number
  ordens: number
  emAberto: number
  ultimaOrdem: string | null
  ultimoPagamento: string | null
}

export type LinhaFornecedor = {
  id: string
  nome: string
  nome_razao: string | null
  cnpj_cpf: string | null
  pessoa_juridica: boolean
  bloqueado: boolean
  inativa: boolean
  apoiada: boolean
  created_at: string | null
  /** Veio da migração do Bubble. */
  legado: boolean
  problemas: ProblemaCadastro[]
} & Movimento

function umAnoAtras(): string {
  const d = new Date(`${hojeSP()}T12:00:00`)
  d.setFullYear(d.getFullYear() - 1)
  return d.toISOString().slice(0, 10)
}

function acumular(m: Movimento, o: Record<string, unknown>, desde: string) {
  const situacao = String(o.situacao ?? "")
  m.ordens++
  // created_at das ordens migradas é a data da migração (o vencimento é
  // anterior); nas novas, o vencimento é futuro. Vale a mais antiga das duas.
  const datas = [(o.created_at as string | null)?.slice(0, 10), o.vencimento as string | null, o.data_pagamento as string | null]
    .filter((v): v is string => !!v)
    .sort()
  const criada = datas[0] ?? null
  if (criada && (!m.ultimaOrdem || criada > m.ultimaOrdem)) m.ultimaOrdem = criada
  if (situacao === "Paga") {
    const v = Number(o.valor_pago ?? o.valor_inicial_cobranca ?? 0) || 0
    m.pagoTotal += v
    const dp = (o.data_pagamento as string | null) ?? null
    if (dp && dp >= desde) m.pago12m += v
    if (dp && (!m.ultimoPagamento || dp > m.ultimoPagamento)) m.ultimoPagamento = dp
  } else if (SITUACOES_ABERTAS.includes(situacao)) {
    m.emAberto += Number(o.valor_inicial_cobranca ?? 0) || 0
  }
}

const vazio = (): Movimento => ({ pago12m: 0, pagoTotal: 0, ordens: 0, emAberto: 0, ultimaOrdem: null, ultimoPagamento: null })

/** Todos os fornecedores do tenant com movimento e problemas de cadastro. */
export async function panoramaFornecedores(): Promise<LinhaFornecedor[]> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const [empresas, contas, enderecos, ordens] = await Promise.all([
    lerEmLotes<Record<string, unknown>>((de, ate) =>
      admin
        .from("empresa")
        .select("id, nome_fantasia, nome_razao, cnpj_cpf, pessoa_juridica, fornecedor_bloqueado, bloqueado, inativa, entidade_apoiada, created_at, bubble_id")
        .eq("emp_proprietaria_id", emp)
        .order("id")
        .range(de, ate)
    ),
    lerEmLotes<Record<string, unknown>>((de, ate) =>
      admin.from("dados_bancarios").select("fornecedor_id, pix, conta").not("fornecedor_id", "is", null).order("id").range(de, ate)
    ).catch(() => []),
    lerEmLotes<Record<string, unknown>>((de, ate) =>
      admin.from("enderecos").select("empresa_id").not("empresa_id", "is", null).order("id").range(de, ate)
    ).catch(() => null),
    lerEmLotes<Record<string, unknown>>((de, ate) =>
      admin
        .from("ordens_pagamento")
        .select("fornecedor_id, beneficiario_fornecedor_id, situacao, valor_pago, valor_inicial_cobranca, data_pagamento, vencimento, created_at")
        .eq("emp_proprietaria_id", emp)
        .not("excluido", "is", true)
        .order("id")
        .range(de, ate)
    ),
  ])

  const comPagamento = new Set(
    contas.filter((c) => (c.pix as string | null)?.trim() || (c.conta as string | null)?.trim()).map((c) => String(c.fornecedor_id))
  )
  const comEndereco = enderecos ? new Set(enderecos.map((e) => String(e.empresa_id))) : null

  const desde = umAnoAtras()
  const mov = new Map<string, Movimento>()
  for (const o of ordens) {
    const id = (o.beneficiario_fornecedor_id ?? o.fornecedor_id) as string | null
    if (!id) continue
    if (!mov.has(id)) mov.set(id, vazio())
    acumular(mov.get(id)!, o, desde)
  }

  const porDocumento = new Map<string, number>()
  for (const e of empresas) {
    const d = digitos(e.cnpj_cpf as string | null)
    if (d && e.inativa !== true) porDocumento.set(d, (porDocumento.get(d) ?? 0) + 1)
  }

  return empresas.map((e) => {
    const id = String(e.id)
    const d = digitos(e.cnpj_cpf as string | null)
    const inativa = e.inativa === true
    const pessoaJuridica = e.pessoa_juridica === true
    return {
      id,
      nome: [e.nome_fantasia, e.nome_razao].find((v): v is string => typeof v === "string" && v.trim() !== "") ?? "(sem nome)",
      nome_razao: (e.nome_razao as string | null) ?? null,
      cnpj_cpf: (e.cnpj_cpf as string | null) ?? null,
      pessoa_juridica: pessoaJuridica,
      bloqueado: e.fornecedor_bloqueado === true || e.bloqueado === true,
      inativa,
      apoiada: e.entidade_apoiada === true,
      created_at: (e.created_at as string | null) ?? null,
      legado: Boolean(e.bubble_id),
      problemas: problemasDoCadastro(
        { cnpj_cpf: (e.cnpj_cpf as string | null) ?? null, pessoa_juridica: pessoaJuridica },
        {
          temPagamento: comPagamento.has(id),
          temEndereco: comEndereco ? comEndereco.has(id) : null,
          duplicadoCom: d && !inativa ? (porDocumento.get(d) ?? 1) - 1 : 0,
        }
      ),
      ...(mov.get(id) ?? vazio()),
    }
  })
}

export type IndicadoresGerais = {
  ativos: number
  pessoasJuridicas: number
  pessoasFisicas: number
  apoiadas: number
  bloqueados: number
  inativos: number
  novos30d: number
  comProblema: number
  porProblema: Record<CodigoProblema, number>
  /** Usados em ordens nos últimos 12 meses com CPF/CNPJ ausente ou inválido. */
  travamPagamento: LinhaFornecedor[]
  pago12m: number
  fornecedoresPagos12m: number
  emAberto: number
  maiores12m: LinhaFornecedor[]
}

export function indicadoresGerais(linhas: LinhaFornecedor[]): IndicadoresGerais {
  const ativos = linhas.filter((l) => !l.inativa)
  const hoje = hojeSP()
  const d30 = new Date(`${hoje}T12:00:00`)
  d30.setDate(d30.getDate() - 30)
  const limite30 = d30.toISOString().slice(0, 10)
  const porProblema = Object.fromEntries(
    (Object.keys(ROTULO_PROBLEMA) as CodigoProblema[]).map((c) => [c, 0])
  ) as Record<CodigoProblema, number>
  for (const l of ativos) for (const p of l.problemas) porProblema[p.codigo]++
  const travam = ativos
    .filter((l) => (l.pago12m > 0 || l.emAberto > 0 || (l.ultimaOrdem ?? "") >= umAnoAtras()) && l.problemas.some((p) => p.codigo === "sem_documento" || p.codigo === "documento_invalido"))
    .sort((a, b) => b.pago12m + b.emAberto - (a.pago12m + a.emAberto))
  return {
    ativos: ativos.length,
    pessoasJuridicas: ativos.filter((l) => l.pessoa_juridica).length,
    pessoasFisicas: ativos.filter((l) => !l.pessoa_juridica).length,
    apoiadas: ativos.filter((l) => l.apoiada).length,
    bloqueados: ativos.filter((l) => l.bloqueado).length,
    inativos: linhas.length - ativos.length,
    novos30d: ativos.filter((l) => (l.created_at ?? "").slice(0, 10) >= limite30).length,
    comProblema: ativos.filter((l) => l.problemas.some(ehProblema)).length,
    porProblema,
    travamPagamento: travam,
    pago12m: ativos.reduce((a, l) => a + l.pago12m, 0),
    fornecedoresPagos12m: ativos.filter((l) => l.pago12m > 0).length,
    emAberto: ativos.reduce((a, l) => a + l.emAberto, 0),
    maiores12m: [...ativos].filter((l) => l.pago12m > 0).sort((a, b) => b.pago12m - a.pago12m).slice(0, 10),
  }
}

/** Indicadores de UM fornecedor, a partir das ordens dele. */
export function indicadoresDoFornecedor(
  ordens: { situacao: string | null; valor_pago: number | null; valor_inicial_cobranca: number | null; data_pagamento: string | null; vencimento: string | null }[]
): Movimento & { ticketMedio: number | null; pagas: number; pagoEsteAno: number } {
  const m = vazio()
  const desde = umAnoAtras()
  const ano = hojeSP().slice(0, 4)
  let pagas = 0
  let pagoEsteAno = 0
  for (const o of ordens) {
    acumular(m, o as unknown as Record<string, unknown>, desde)
    if (o.situacao === "Paga") {
      pagas++
      if ((o.data_pagamento ?? "").startsWith(ano)) pagoEsteAno += Number(o.valor_pago ?? o.valor_inicial_cobranca ?? 0) || 0
    }
  }
  return { ...m, pagas, pagoEsteAno, ticketMedio: pagas ? m.pagoTotal / pagas : null }
}
