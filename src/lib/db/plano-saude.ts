import "server-only"

import { esquemaAusente, lerEmLotes, lerEmLotesPorIds, texto } from "@/lib/db/comum"
import { funcionariosDaArea } from "@/lib/db/pessoal-area"
import {
  calcularMes,
  deslocarCompetencia,
  mudancasEntreMeses,
  type Beneficiario,
  type CondicaoTitular,
  type FaixaMuda,
  type GrupoTitular,
  type Mudanca,
  type RegraCusteio,
  type RegraDependente,
  type Tabela,
  type TipoBeneficiario,
  type Titular,
} from "@/lib/plano-saude"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * PLANO DE SAÚDE DOS FUNCIONÁRIOS (24/11/2026) — leitura e gravação. A conta
 * fica em src/lib/plano-saude.ts. Tabelas pessoal_saude_* (migração
 * 20261125000507). Tudo filtrado pelo tenant: o createAdminClient é escopado.
 */

// ── Tipos ───────────────────────────────────────────────────────────────────

export type ContratoSaude = {
  id: string
  nome: string
  operadora: string
  registroAnsOperadora: string | null
  contratoId: string | null
  tipoContratacao: "coletivo_empresarial" | "coletivo_adesao" | "individual"
  mesAniversario: number | null
  faixaMuda: FaixaMuda
  coparticipacao: boolean
  inicio: string | null
  fim: string | null
  observacoes: string | null
  ativo: boolean
}

export type ProdutoSaude = {
  id: string
  contratoId: string
  nome: string
  registroAns: string | null
  acomodacao: "enfermaria" | "apartamento" | null
  abrangencia: string | null
  ativo: boolean
}

export type TabelaSaude = Tabela & {
  id: string
  motivo: string
  percentual: number | null
  observacao: string | null
}

export type RegraDependenteSaude = RegraDependente & { id: string; observacao: string | null }

export type RegraCusteioSaude = RegraCusteio & { clausula: string | null }

export type BeneficiarioSaude = Beneficiario & {
  dependenteId: string | null
  carteirinha: string | null
  cpf: string | null
  motivoExclusao: string | null
  observacao: string | null
  titularNome: string
}

export type DependenteCadastro = {
  id: string
  funcionarioId: string
  nome: string
  grau: string | null
  nascimento: string | null
  ativo: boolean
}

export const ROTULO_TIPO_CONTRATACAO: Record<ContratoSaude["tipoContratacao"], string> = {
  coletivo_empresarial: "Coletivo empresarial",
  coletivo_adesao: "Coletivo por adesão",
  individual: "Individual ou familiar",
}

export const ROTULO_MOTIVO_TABELA: Record<string, string> = {
  inicial: "Tabela inicial",
  reajuste_anual: "Reajuste anual",
  reajuste_ans: "Reajuste autorizado pela ANS",
  renegociacao: "Renegociação",
  correcao: "Correção",
}

// ── Conversão ───────────────────────────────────────────────────────────────

type Linha = Record<string, unknown>
const num = (v: unknown): number | null => (v === null || v === undefined || v === "" ? null : Number(v))
const lista = (v: unknown): string[] | null => (Array.isArray(v) && v.length ? v.map(String) : null)

function contratoDaLinha(l: Linha): ContratoSaude {
  return {
    id: String(l.id),
    nome: String(l.nome ?? ""),
    operadora: String(l.operadora ?? ""),
    registroAnsOperadora: texto(l.registro_ans_operadora),
    contratoId: texto(l.contrato_id),
    tipoContratacao: (texto(l.tipo_contratacao) ?? "coletivo_empresarial") as ContratoSaude["tipoContratacao"],
    mesAniversario: num(l.mes_aniversario),
    faixaMuda: (texto(l.faixa_muda) ?? "mes_seguinte") as FaixaMuda,
    coparticipacao: l.coparticipacao === true,
    inicio: texto(l.inicio),
    fim: texto(l.fim),
    observacoes: texto(l.observacoes),
    ativo: l.ativo !== false,
  }
}

function produtoDaLinha(l: Linha): ProdutoSaude {
  return {
    id: String(l.id),
    contratoId: String(l.contrato_id),
    nome: String(l.nome ?? ""),
    registroAns: texto(l.registro_ans),
    acomodacao: (texto(l.acomodacao) as ProdutoSaude["acomodacao"]) ?? null,
    abrangencia: texto(l.abrangencia),
    ativo: l.ativo !== false,
  }
}

function tabelaDaLinha(l: Linha): TabelaSaude {
  return {
    id: String(l.id),
    produtoId: String(l.produto_id),
    inicio: String(l.vigencia_inicio),
    fim: texto(l.vigencia_fim),
    precos: ((l.precos as unknown[]) ?? []).map(Number),
    motivo: String(l.motivo ?? "inicial"),
    percentual: num(l.percentual),
    observacao: texto(l.observacao),
  }
}

function regraDaLinha(l: Linha): RegraCusteioSaude {
  return {
    id: String(l.id),
    nome: String(l.nome ?? ""),
    prioridade: Number(l.prioridade ?? 100),
    inicio: texto(l.vigencia_inicio),
    fim: texto(l.vigencia_fim),
    beneficiarios: lista(l.beneficiarios),
    condicoes: lista(l.condicoes) as CondicaoTitular[] | null,
    produtos: lista(l.produtos),
    cargos: lista(l.cargos),
    departamentos: lista(l.departamentos),
    funcionarios: lista(l.funcionarios),
    idadeMin: num(l.idade_min),
    idadeMax: num(l.idade_max),
    modo: l.modo === "valor_fixo" ? "valor_fixo" : "percentual",
    entidadePercentual: num(l.entidade_percentual),
    entidadeValor: num(l.entidade_valor),
    entidadeTeto: num(l.entidade_teto),
    copartFuncionarioPercentual: num(l.copart_funcionario_percentual),
    copartLimiteMensal: num(l.copart_limite_mensal),
    ativo: l.ativo !== false,
    clausula: texto(l.clausula),
  }
}

function regraDependenteDaLinha(l: Linha): RegraDependenteSaude {
  return {
    id: String(l.id),
    grau: String(l.grau),
    permitido: l.permitido !== false,
    idadeLimite: num(l.idade_limite),
    idadeLimiteEstudante: num(l.idade_limite_estudante),
    observacao: texto(l.observacao),
  }
}

// ── Leitura ─────────────────────────────────────────────────────────────────

async function ctx() {
  return { admin: await createAdminClient(), emp: await tenantAtual() }
}

export async function listarContratosSaude(): Promise<{
  disponivel: boolean
  contratos: (ContratoSaude & { produtos: number; beneficiarios: number })[]
}> {
  const { admin, emp } = await ctx()
  const { data, error } = await admin
    .from("pessoal_saude_contratos")
    .select("*")
    .eq("emp_proprietaria_id", emp)
    .order("ativo", { ascending: false })
    .order("nome")
  if (error) {
    if (esquemaAusente(error)) return { disponivel: false, contratos: [] }
    throw new Error(error.message)
  }
  const contratos = (data ?? []).map(contratoDaLinha)
  const [produtos, ativos] = await Promise.all([
    lerEmLotes<{ id: string; contrato_id: string }>((de, ate) =>
      admin.from("pessoal_saude_produtos").select("id, contrato_id").eq("emp_proprietaria_id", emp).order("id").range(de, ate)
    ),
    lerEmLotes<{ id: string; produto_id: string }>((de, ate) =>
      admin
        .from("pessoal_saude_beneficiarios")
        .select("id, produto_id")
        .eq("emp_proprietaria_id", emp)
        .is("exclusao", null)
        .order("id")
        .range(de, ate)
    ),
  ])
  const contratoDoProduto = new Map(produtos.map((p) => [p.id, p.contrato_id]))
  return {
    disponivel: true,
    contratos: contratos.map((c) => ({
      ...c,
      produtos: produtos.filter((p) => p.contrato_id === c.id).length,
      beneficiarios: ativos.filter((b) => contratoDoProduto.get(b.produto_id) === c.id).length,
    })),
  }
}

export type ContratoCompleto = {
  contrato: ContratoSaude
  produtos: ProdutoSaude[]
  tabelas: TabelaSaude[]
  regras: RegraCusteioSaude[]
  regrasDependentes: RegraDependenteSaude[]
  beneficiarios: BeneficiarioSaude[]
}

/** O contrato com tudo o que pertence a ele. null = não existe nesta entidade. */
export async function obterContratoSaude(id: string): Promise<ContratoCompleto | null> {
  const { admin, emp } = await ctx()
  const { data: c, error } = await admin
    .from("pessoal_saude_contratos")
    .select("*")
    .eq("emp_proprietaria_id", emp)
    .eq("id", id)
    .maybeSingle()
  if (error) {
    if (esquemaAusente(error)) return null
    throw new Error(error.message)
  }
  if (!c) return null
  const { data: ps } = await admin
    .from("pessoal_saude_produtos")
    .select("*")
    .eq("emp_proprietaria_id", emp)
    .eq("contrato_id", id)
    .order("nome")
  const produtos = (ps ?? []).map(produtoDaLinha)
  const pids = produtos.map((p) => p.id)
  const [tabelas, regras, regrasDep, bens] = await Promise.all([
    pids.length
      ? admin.from("pessoal_saude_tabelas").select("*").eq("emp_proprietaria_id", emp).in("produto_id", pids).order("vigencia_inicio", { ascending: false })
      : Promise.resolve({ data: [] as Linha[] }),
    admin.from("pessoal_saude_regras_custeio").select("*").eq("emp_proprietaria_id", emp).eq("contrato_id", id).order("prioridade").order("nome"),
    admin.from("pessoal_saude_regras_dependentes").select("*").eq("emp_proprietaria_id", emp).eq("contrato_id", id).order("grau"),
    pids.length ? beneficiariosDosProdutos(pids) : Promise.resolve([] as BeneficiarioSaude[]),
  ])
  return {
    contrato: contratoDaLinha(c),
    produtos,
    tabelas: ((tabelas.data ?? []) as Linha[]).map(tabelaDaLinha),
    regras: ((regras.data ?? []) as Linha[]).map(regraDaLinha),
    regrasDependentes: ((regrasDep.data ?? []) as Linha[]).map(regraDependenteDaLinha),
    beneficiarios: bens,
  }
}

/** Beneficiários (ativos e excluídos) dos produtos, com nome e nascimento resolvidos. */
async function beneficiariosDosProdutos(produtoIds: string[]): Promise<BeneficiarioSaude[]> {
  const { admin, emp } = await ctx()
  const linhas = await lerEmLotesPorIds<Linha>(produtoIds, (fatia, de, ate) =>
    admin
      .from("pessoal_saude_beneficiarios")
      .select("*")
      .eq("emp_proprietaria_id", emp)
      .in("produto_id", fatia)
      .order("id")
      .range(de, ate)
  )
  const titularIds = [...new Set(linhas.map((l) => String(l.titular_id)))]
  const depIds = [...new Set(linhas.map((l) => texto(l.dependente_id)).filter((x): x is string => Boolean(x)))]
  const [us, deps] = await Promise.all([
    lerEmLotesPorIds<Linha>(titularIds, (fatia, de, ate) =>
      admin.from("usuarios").select("id, nome_completo, nome_guerra, data_nascimento, nascimento_data").in("id", fatia).order("id").range(de, ate)
    ),
    lerEmLotesPorIds<Linha>(depIds, (fatia, de, ate) =>
      admin.from("pessoal_dependentes").select("id, nome_completo, grau_parentesco, nascimento").in("id", fatia).order("id").range(de, ate)
    ),
  ])
  const usuario = new Map(us.map((u) => [String(u.id), u]))
  const dependente = new Map(deps.map((d) => [String(d.id), d]))
  return linhas.map((l) => {
    const tipo = String(l.tipo) as TipoBeneficiario
    const u = usuario.get(String(l.titular_id))
    const titularNome = texto(u?.nome_completo) ?? texto(u?.nome_guerra) ?? "(sem nome)"
    const d = dependente.get(String(l.dependente_id ?? ""))
    const nome =
      tipo === "titular" ? titularNome : tipo === "dependente" ? (texto(d?.nome_completo) ?? "(dependente excluído)") : (texto(l.nome) ?? "")
    const nascimento =
      tipo === "titular"
        ? (texto(u?.data_nascimento) ?? texto(u?.nascimento_data))
        : tipo === "dependente"
          ? texto(d?.nascimento)
          : texto(l.nascimento)
    const grau = tipo === "titular" ? "titular" : tipo === "dependente" ? (texto(d?.grau_parentesco) ?? "(sem grau)") : (texto(l.grau) ?? "Agregado")
    return {
      id: String(l.id),
      produtoId: String(l.produto_id),
      titularId: String(l.titular_id),
      tipo,
      grau,
      nome,
      nascimento: nascimento ? nascimento.slice(0, 10) : null,
      condicao: (texto(l.condicao) ?? "ativo") as CondicaoTitular,
      inclusao: String(l.inclusao),
      exclusao: texto(l.exclusao),
      estudanteAte: texto(l.estudante_ate),
      dependenteId: texto(l.dependente_id),
      carteirinha: texto(l.carteirinha),
      cpf: texto(l.cpf),
      motivoExclusao: texto(l.motivo_exclusao),
      observacao: texto(l.observacao),
      titularNome,
    }
  })
}

/** Dependentes cadastrados (Pessoal) dos funcionários, para escolher na adesão. */
export async function dependentesDoCadastro(funcionarioIds: string[]): Promise<DependenteCadastro[]> {
  if (funcionarioIds.length === 0) return []
  const { admin, emp } = await ctx()
  const linhas = await lerEmLotesPorIds<Linha>(funcionarioIds, (fatia, de, ate) =>
    admin
      .from("pessoal_dependentes")
      .select("id, funcionario_id, nome_completo, grau_parentesco, nascimento, ativo")
      .eq("emp_proprietaria_id", emp)
      .in("funcionario_id", fatia)
      .order("id")
      .range(de, ate)
  )
  return linhas
    .map((l) => ({
      id: String(l.id),
      funcionarioId: String(l.funcionario_id),
      nome: texto(l.nome_completo) ?? "(sem nome)",
      grau: texto(l.grau_parentesco),
      nascimento: texto(l.nascimento),
      ativo: l.ativo !== false,
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
}

// ── O mês ───────────────────────────────────────────────────────────────────

export type MesContrato = {
  contrato: ContratoSaude
  grupos: GrupoTitular[]
  mudancas: Map<string, Mudanca[]>
  totais: { mensalidade: number; entidade: number; funcionario: number; coparticipacao: number; desconto: number }
}

/** A conferência do mês de cada contrato ativo (com as mudanças sobre o mês anterior). */
export async function conferenciaDoMes(competencia: string): Promise<{ disponivel: boolean; contratos: MesContrato[] }> {
  const { disponivel, contratos } = await listarContratosSaude()
  if (!disponivel) return { disponivel, contratos: [] }
  const { admin, emp } = await ctx()
  const area = await funcionariosDaArea()
  const titulares = new Map<string, Titular>(
    area.map((f) => [f.usuarioId, { id: f.usuarioId, nome: f.nome, cargo: f.cargo, departamento: f.departamento }])
  )
  const saida: MesContrato[] = []
  for (const c of contratos.filter((x) => x.ativo)) {
    const completo = await obterContratoSaude(c.id)
    if (!completo) continue
    for (const b of completo.beneficiarios) {
      if (!titulares.has(b.titularId)) titulares.set(b.titularId, { id: b.titularId, nome: b.titularNome, cargo: null, departamento: null })
    }
    const anterior = deslocarCompetencia(competencia, -1)
    const { data: cops } = await admin
      .from("pessoal_saude_coparticipacoes")
      .select("titular_id, competencia, valor")
      .eq("emp_proprietaria_id", emp)
      .eq("contrato_id", c.id)
      .in("competencia", [competencia, anterior])
    const copsDe = (comp: string) =>
      new Map(((cops ?? []) as Linha[]).filter((x) => x.competencia === comp).map((x) => [String(x.titular_id), Number(x.valor)]))
    const base = {
      faixaMuda: completo.contrato.faixaMuda,
      beneficiarios: completo.beneficiarios,
      titulares,
      tabelas: completo.tabelas,
      regras: completo.regras,
      regrasDependentes: completo.regrasDependentes,
    }
    const grupos = calcularMes({ ...base, competencia, coparticipacoes: copsDe(competencia) })
    const antes = calcularMes({ ...base, competencia: anterior, coparticipacoes: copsDe(anterior) })
    const soma = (f: (g: GrupoTitular) => number) => Math.round(grupos.reduce((s, g) => s + f(g), 0) * 100) / 100
    saida.push({
      contrato: completo.contrato,
      grupos,
      mudancas: mudancasEntreMeses(antes, grupos),
      totais: {
        mensalidade: soma((g) => g.mensalidade),
        entidade: soma((g) => g.entidade),
        funcionario: soma((g) => g.funcionario),
        coparticipacao: soma((g) => g.coparticipacao),
        desconto: soma((g) => g.desconto),
      },
    })
  }
  return { disponivel: true, contratos: saida }
}

// ── Gravação ────────────────────────────────────────────────────────────────

type Resultado = { erro?: string; id?: string }

async function gravar(tabela: string, id: string | null, dados: Linha): Promise<Resultado> {
  const { admin, emp } = await ctx()
  if (id) {
    const { error } = await admin
      .from(tabela)
      .update({ ...dados, updated_at: new Date().toISOString() })
      .eq("emp_proprietaria_id", emp)
      .eq("id", id)
    return error ? { erro: mensagem(error) } : { id }
  }
  const { data, error } = await admin
    .from(tabela)
    .insert({ ...dados, emp_proprietaria_id: emp })
    .select("id")
    .single()
  return error ? { erro: mensagem(error) } : { id: String(data.id) }
}

function mensagem(e: { code?: string; message: string }): string {
  if (esquemaAusente(e)) return "O plano de saúde ainda não está ligado nesta entidade (falta aplicar a atualização do banco de dados)."
  if (e.code === "23505") return "Já existe um registro igual (mesma vigência ou mesmo grau)."
  if (e.code === "23503") return "Este registro está em uso e não pode ser apagado."
  return e.message
}

export async function salvarContratoSaude(id: string | null, dados: Linha, usuarioId: string): Promise<Resultado> {
  return gravar("pessoal_saude_contratos", id, id ? dados : { ...dados, criado_por: usuarioId })
}

/** Confere que o registro filho pertence a um contrato desta entidade. */
export async function contratoDoProduto(produtoId: string): Promise<string | null> {
  const { admin, emp } = await ctx()
  const { data } = await admin
    .from("pessoal_saude_produtos")
    .select("contrato_id")
    .eq("emp_proprietaria_id", emp)
    .eq("id", produtoId)
    .maybeSingle()
  return texto(data?.contrato_id)
}

export async function salvarProdutoSaude(id: string | null, dados: Linha): Promise<Resultado> {
  return gravar("pessoal_saude_produtos", id, dados)
}

export async function salvarTabelaSaude(id: string | null, dados: Linha, usuarioId: string): Promise<Resultado> {
  return gravar("pessoal_saude_tabelas", id, id ? dados : { ...dados, criado_por: usuarioId })
}

export async function salvarRegraCusteio(id: string | null, dados: Linha): Promise<Resultado> {
  return gravar("pessoal_saude_regras_custeio", id, dados)
}

export async function salvarRegraDependente(id: string | null, dados: Linha): Promise<Resultado> {
  return gravar("pessoal_saude_regras_dependentes", id, dados)
}

export async function salvarBeneficiario(id: string | null, dados: Linha, usuarioId: string): Promise<Resultado> {
  return gravar("pessoal_saude_beneficiarios", id, id ? dados : { ...dados, criado_por: usuarioId })
}

/** Cadastra um dependente em Pessoal (pessoal_dependentes), para incluí-lo no plano. */
export async function cadastrarDependente(funcionarioId: string, dados: { nome: string; grau: string; nascimento: string; cpf: string | null }): Promise<Resultado> {
  return gravar("pessoal_dependentes", null, {
    funcionario_id: funcionarioId,
    nome_completo: dados.nome,
    grau_parentesco: dados.grau,
    nascimento: dados.nascimento,
    cpf: dados.cpf,
    ativo: true,
  })
}

const TABELAS_APAGAVEIS = {
  produto: "pessoal_saude_produtos",
  tabela: "pessoal_saude_tabelas",
  regra: "pessoal_saude_regras_custeio",
  regra_dependente: "pessoal_saude_regras_dependentes",
  beneficiario: "pessoal_saude_beneficiarios",
  contrato: "pessoal_saude_contratos",
} as const

export async function apagarRegistroSaude(tipo: keyof typeof TABELAS_APAGAVEIS, id: string): Promise<Resultado> {
  const { admin, emp } = await ctx()
  const { error } = await admin.from(TABELAS_APAGAVEIS[tipo]).delete().eq("emp_proprietaria_id", emp).eq("id", id)
  return error ? { erro: mensagem(error) } : { id }
}

export async function salvarCoparticipacao(
  contratoId: string,
  titularId: string,
  competencia: string,
  valor: number | null,
  usuarioId: string
): Promise<Resultado> {
  const { admin, emp } = await ctx()
  if (valor === null) {
    const { error } = await admin
      .from("pessoal_saude_coparticipacoes")
      .delete()
      .eq("emp_proprietaria_id", emp)
      .eq("contrato_id", contratoId)
      .eq("titular_id", titularId)
      .eq("competencia", competencia)
    return error ? { erro: mensagem(error) } : {}
  }
  const { error } = await admin.from("pessoal_saude_coparticipacoes").upsert(
    {
      emp_proprietaria_id: emp,
      contrato_id: contratoId,
      titular_id: titularId,
      competencia,
      valor,
      criado_por: usuarioId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "contrato_id,titular_id,competencia" }
  )
  return error ? { erro: mensagem(error) } : {}
}

/** Contratos ativos do módulo Contratos, para vincular (fornecedor + objeto). */
export async function contratosParaVincular(): Promise<{ id: string; rotulo: string }[]> {
  const { admin, emp } = await ctx()
  const { data } = await admin
    .from("contratos")
    .select("id, codigo, objeto, fornecedor:empresa!contratos_fornecedor_id_fkey(nome_fantasia, nome_razao)")
    .eq("emp_proprietaria_id", emp)
    .eq("ativo", true)
    .eq("deletado", false)
    .order("objeto")
    .limit(500)
  return ((data ?? []) as Linha[]).map((c) => {
    const f = c.fornecedor as Linha | null
    const nome = texto(f?.nome_fantasia) ?? texto(f?.nome_razao)
    return { id: String(c.id), rotulo: [texto(c.codigo), nome, texto(c.objeto)].filter(Boolean).join(" — ") }
  })
}
