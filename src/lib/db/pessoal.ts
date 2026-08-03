import "server-only"
import { tenantAtual } from "@/lib/tenant"

import { criarNotificacao } from "@/lib/db/notificacoes"
import { enviarPushTelegram } from "@/lib/db/telegram"
import { enviarEmail } from "@/lib/email"
import { SITE_URL } from "@/lib/env"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Módulo Pessoal — funcionários do sindicato.
 *
 * Modelo medido no banco (2026-07-14): funcionário do sindicato é quem tem
 * vínculo em `vinculos_trabalhistas` com `empregador_id` = sindicato
 * (48 vínculos, 46 sem demissão). Cargo, lotação, matrícula e datas de
 * contrato vivem no vínculo; a pessoa é `trabalhador_id` → `usuarios`.
 *
 * As tabelas `pessoal_*` referenciam a pessoa por `funcionario_id` →
 * `usuarios` (férias usam `trabalhador_id`). Contracheques e ponto agrupam
 * por remessas nomeadas (`pessoal_contracheques_remessas`,
 * `pessoal_registro_ponto_remessas`); férias têm períodos
 * (`pessoal_ferias`) e gozos (`pessoal_ferias_gozo`). Campos `arquivo` são
 * URLs migradas do Bubble.
 */

export type FuncionarioLinha = {
  /** id do vínculo (linha em vinculos_trabalhistas). */
  id: string
  /** id da pessoa em `usuarios` — chave do perfil. */
  usuarioId: string
  nome: string | null
  cargo: string | null
  lotacao: string | null
  matricula: string | null
  regime_trabalho: string | null
  contrato_admissao: string | null
  contrato_demissao: string | null
}

export type FiltrosFuncionarios = {
  busca?: string
  situacao?: "ativos" | "desligados" | "todos"
  ordem?: "nome" | "admissao" | "matricula"
  dir?: "asc" | "desc"
}

export type ListaFuncionarios = {
  linhas: FuncionarioLinha[]
  total: number
  ativos: number
}

type VinculoBruto = {
  id: string
  trabalhador_id: string | null
  cargo: string | null
  lotacao: string | null
  matricula: string | null
  regime_trabalho: string | null
  contrato_admissao: string | null
  contrato_demissao: string | null
}

async function vinculosDoSindicato(): Promise<VinculoBruto[]> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("vinculos_trabalhistas")
    .select(
      "id, trabalhador_id, cargo, lotacao, matricula, regime_trabalho, contrato_admissao, contrato_demissao"
    )
    .eq("empregador_id", await tenantAtual())
  if (error) throw new Error(`Falha ao listar funcionários: ${error.message}`)
  return data ?? []
}

async function nomesDosUsuarios(ids: string[]): Promise<Map<string, string>> {
  const nomes = new Map<string, string>()
  if (ids.length === 0) return nomes
  const admin = await createAdminClient()
  const { data } = await admin
    .from("usuarios")
    .select("id, nome_completo, nome_guerra")
    .in("id", ids)
  for (const u of data ?? []) {
    const nome = [u.nome_completo, u.nome_guerra].find(
      (v): v is string => typeof v === "string" && v.trim() !== ""
    )
    if (nome) nomes.set(u.id, nome)
  }
  return nomes
}

/**
 * ~50 vínculos no total: busca, filtro e ordenação acontecem em memória
 * depois de resolver os nomes (a ordenação por nome depende do join).
 *
 * Uma linha por PESSOA: há vínculos duplicados no dado migrado (mesma
 * pessoa com o mesmo contrato repetido). Representa cada pessoa pelo
 * vínculo ativo mais recente (ou o último encerrado); o histórico completo
 * fica no perfil.
 */
export async function listarFuncionarios(
  filtros: FiltrosFuncionarios
): Promise<ListaFuncionarios> {
  const {
    busca = "",
    situacao = "ativos",
    ordem = "nome",
    dir = "asc",
  } = filtros

  const vinculos = await vinculosDoSindicato()
  const nomes = await nomesDosUsuarios([
    ...new Set(
      vinculos
        .map((v) => v.trabalhador_id)
        .filter((v): v is string => Boolean(v))
    ),
  ])

  const porPessoa = new Map<string, VinculoBruto & { trabalhador_id: string }>()
  for (const v of vinculos) {
    if (!v.trabalhador_id) continue
    const atual = porPessoa.get(v.trabalhador_id)
    const melhor =
      !atual ||
      // vínculo ativo ganha de encerrado; empate decide pela admissão mais recente
      (!v.contrato_demissao && Boolean(atual.contrato_demissao)) ||
      (Boolean(v.contrato_demissao) === Boolean(atual.contrato_demissao) &&
        (v.contrato_admissao ?? "") > (atual.contrato_admissao ?? ""))
    if (melhor) porPessoa.set(v.trabalhador_id, v as VinculoBruto & { trabalhador_id: string })
  }

  const todas: FuncionarioLinha[] = [...porPessoa.values()].map((v) => ({
    id: v.id,
    usuarioId: v.trabalhador_id,
    nome: nomes.get(v.trabalhador_id) ?? null,
    cargo: v.cargo,
    lotacao: v.lotacao,
    matricula: v.matricula,
    regime_trabalho: v.regime_trabalho,
    contrato_admissao: v.contrato_admissao,
    contrato_demissao: v.contrato_demissao,
  }))

  const ativos = todas.filter((f) => !f.contrato_demissao).length

  let linhas = todas
  if (situacao === "ativos") linhas = linhas.filter((f) => !f.contrato_demissao)
  if (situacao === "desligados")
    linhas = linhas.filter((f) => Boolean(f.contrato_demissao))

  const termo = busca.trim().toLocaleLowerCase("pt-BR")
  if (termo) {
    linhas = linhas.filter((f) =>
      [f.nome, f.cargo, f.lotacao, f.matricula].some((campo) =>
        campo?.toLocaleLowerCase("pt-BR").includes(termo)
      )
    )
  }

  const fator = dir === "desc" ? -1 : 1
  linhas = [...linhas].sort((a, b) => {
    if (ordem === "admissao")
      return (
        fator *
        (a.contrato_admissao ?? "").localeCompare(b.contrato_admissao ?? "")
      )
    if (ordem === "matricula")
      return (
        fator *
        (Number(a.matricula) || Number.MAX_SAFE_INTEGER) -
        fator * (Number(b.matricula) || Number.MAX_SAFE_INTEGER)
      )
    return fator * (a.nome ?? "￿").localeCompare(b.nome ?? "￿", "pt-BR")
  })

  return { linhas, total: todas.length, ativos }
}

export type ContrachequeLinha = {
  id: string
  arquivo: string | null
  liberado: boolean | null
  created_at: string | null
  /** Nome da remessa (ex.: "Setembro 2025") + natureza (13º, férias…). */
  remessa: string | null
  remessaTipo: string | null
}

export type PontoLinha = {
  id: string
  arquivo: string | null
  horas_realizadas_70: number | null
  horas_pagas_70: number | null
  saldo_remanescente_70: number | null
  horas_realizadas_100: number | null
  horas_pagas_100: number | null
  saldo_remanescente_100: number | null
  remessa: string | null
}

export type FeriasPeriodo = {
  id: string
  aquisitivo_inicio: string | null
  aquisitivo_termino: string | null
  concessivo_inicio: string | null
  concessivo_termino: string | null
  dias_disponiveis: number | null
  abono_pecuniario: boolean | null
  finalizado: boolean | null
}

export type FeriasGozo = {
  id: string
  inicio: string | null
  termino: string | null
  dias: number | null
  autorizado: boolean | null
  data_autorizacao: string | null
  aviso_ferias_url: string | null
}

export type AusenciaLinha = {
  id: string
  inicio: string | null
  termino: string | null
  motivo: string | null
}

export type FaltaLinha = {
  id: string
  data_falta: string | null
  justificativa_tipo: string | null
  autorizado: boolean | null
  data_autorizacao: string | null
}

export type AtestadoLinha = {
  id: string
  inicio: string | null
  termino: string | null
  quantidade_dias: number | null
  cid10: string | null
  atestado_acompanhamento: boolean | null
  atestado: string | null
}

export type AsoLinha = {
  id: string
  data: string | null
  tipo: string | null
  vencimento: string | null
  realizado: boolean | null
  arquivo: string | null
}

export type DependenteLinha = {
  id: string
  nome_completo: string | null
  grau_parentesco: string | null
  nascimento: string | null
  ativo: boolean | null
}

export type PerfilFuncionario = {
  usuario: {
    id: string
    nome_completo: string | null
    nome_guerra: string | null
    email: string | null
  }
  /** Vínculos com o sindicato (histórico completo do empregador-sindicato). */
  vinculos: FuncionarioLinha[]
  contracheques: { ultimas: ContrachequeLinha[]; total: number }
  ponto: { ultimas: PontoLinha[]; total: number }
  feriasPeriodos: FeriasPeriodo[]
  feriasGozos: FeriasGozo[]
  ausencias: { ultimas: AusenciaLinha[]; total: number }
  faltas: { ultimas: FaltaLinha[]; total: number }
  atestados: { ultimas: AtestadoLinha[]; total: number }
  asos: AsoLinha[]
  dependentes: DependenteLinha[]
}

/**
 * Embed many-to-one do PostgREST chega como objeto em runtime, mas sem os
 * tipos gerados do banco o supabase-js infere array — normaliza os dois.
 */
function umaLinha<T>(valor: unknown): T | null {
  if (Array.isArray(valor)) return (valor[0] as T) ?? null
  return (valor as T) ?? null
}

function tipoRemessa(r: {
  decimo_terceiro: boolean | null
  ferias: boolean | null
  adiantamento: boolean | null
  complementar_mensal: boolean | null
}): string | null {
  if (r.decimo_terceiro) return "13º salário"
  if (r.ferias) return "Férias"
  if (r.adiantamento) return "Adiantamento"
  if (r.complementar_mensal) return "Complementar"
  return null
}

/** Perfil do funcionário identificado pelo id em `usuarios`. */
export async function buscarPerfilFuncionario(
  usuarioId: string
): Promise<PerfilFuncionario | null> {
  const admin = await createAdminClient()

  const { data: usuario } = await admin
    .from("usuarios")
    .select("id, nome_completo, nome_guerra, email")
    .eq("id", usuarioId)
    .maybeSingle()
  if (!usuario) return null

  const { data: vinculos, error: erroVinculos } = await admin
    .from("vinculos_trabalhistas")
    .select(
      "id, trabalhador_id, cargo, lotacao, matricula, regime_trabalho, contrato_admissao, contrato_demissao"
    )
    .eq("empregador_id", await tenantAtual())
    .eq("trabalhador_id", usuarioId)
    .order("contrato_admissao", { ascending: false, nullsFirst: false })
  if (erroVinculos)
    throw new Error(`Falha ao buscar vínculos: ${erroVinculos.message}`)
  // Sem vínculo com o sindicato não é funcionário — perfil não existe.
  if (!vinculos || vinculos.length === 0) return null

  const [
    contracheques,
    ponto,
    feriasPeriodos,
    feriasGozos,
    ausencias,
    faltas,
    atestados,
    asos,
    dependentes,
  ] = await Promise.all([
    admin
      .from("pessoal_contracheques")
      .select(
        "id, arquivo, liberado, created_at, remessa:pessoal_contracheques_remessas(nome_remessa, decimo_terceiro, ferias, adiantamento, complementar_mensal, ordem)",
        { count: "exact" }
      )
      .eq("funcionario_id", usuarioId)
      // `ordem` é a sequência cronológica do Bubble; created_at é só a migração
      .order("ordem", { ascending: false, nullsFirst: false })
      .limit(24),
    admin
      .from("pessoal_registro_ponto")
      .select(
        "id, arquivo, horas_realizadas_70, horas_pagas_70, saldo_remanescente_70, horas_realizadas_100, horas_pagas_100, saldo_remanescente_100, remessa:pessoal_registro_ponto_remessas(nome_remessa)",
        { count: "exact" }
      )
      .eq("funcionario_id", usuarioId)
      .order("ordem", { ascending: false, nullsFirst: false })
      .limit(12),
    admin
      .from("pessoal_ferias")
      .select(
        "id, aquisitivo_inicio, aquisitivo_termino, concessivo_inicio, concessivo_termino, dias_disponiveis, abono_pecuniario, finalizado"
      )
      .eq("trabalhador_id", usuarioId)
      .order("aquisitivo_inicio", { ascending: false, nullsFirst: false }),
    admin
      .from("pessoal_ferias_gozo")
      .select(
        "id, inicio, termino, dias, autorizado, data_autorizacao, aviso_ferias_url"
      )
      .eq("funcionario_id", usuarioId)
      .order("inicio", { ascending: false, nullsFirst: false }),
    admin
      .from("pessoal_ausencias")
      .select("id, inicio, termino, motivo", { count: "exact" })
      .eq("funcionario_id", usuarioId)
      .order("inicio", { ascending: false, nullsFirst: false })
      .limit(20),
    admin
      .from("pessoal_faltas_justificadas")
      .select(
        "id, data_falta, justificativa_tipo, autorizado, data_autorizacao",
        { count: "exact" }
      )
      .eq("funcionario_id", usuarioId)
      .order("data_falta", { ascending: false, nullsFirst: false })
      .limit(20),
    admin
      .from("pes_atestados_medicos")
      .select(
        "id, inicio, termino, quantidade_dias, cid10, atestado_acompanhamento, atestado",
        { count: "exact" }
      )
      .eq("funcionario_id", usuarioId)
      .order("inicio", { ascending: false, nullsFirst: false })
      .limit(20),
    admin
      .from("aso")
      .select("id, data, tipo, vencimento, realizado, arquivo")
      .eq("funcionario_id", usuarioId)
      .order("data", { ascending: false, nullsFirst: false }),
    admin
      .from("pessoal_dependentes")
      .select("id, nome_completo, grau_parentesco, nascimento, ativo")
      .eq("funcionario_id", usuarioId)
      .order("nascimento", { ascending: true, nullsFirst: false }),
  ])

  for (const [nome, r] of [
    ["contracheques", contracheques],
    ["ponto", ponto],
    ["férias", feriasPeriodos],
    ["gozos de férias", feriasGozos],
    ["ausências", ausencias],
    ["faltas", faltas],
    ["atestados", atestados],
    ["ASOs", asos],
    ["dependentes", dependentes],
  ] as const) {
    if (r.error)
      throw new Error(`Falha ao buscar ${nome}: ${r.error.message}`)
  }

  type RemessaContracheque = {
    nome_remessa: string | null
    decimo_terceiro: boolean | null
    ferias: boolean | null
    adiantamento: boolean | null
    complementar_mensal: boolean | null
  }

  return {
    usuario,
    vinculos: (vinculos as (VinculoBruto & { trabalhador_id: string })[]).map(
      (v) => ({
        id: v.id,
        usuarioId: v.trabalhador_id,
        nome: null,
        cargo: v.cargo,
        lotacao: v.lotacao,
        matricula: v.matricula,
        regime_trabalho: v.regime_trabalho,
        contrato_admissao: v.contrato_admissao,
        contrato_demissao: v.contrato_demissao,
      })
    ),
    contracheques: {
      ultimas: (contracheques.data ?? []).map((c) => {
        const r = umaLinha<RemessaContracheque>(c.remessa)
        return {
          id: c.id,
          arquivo: c.arquivo,
          liberado: c.liberado,
          created_at: c.created_at,
          remessa: r?.nome_remessa ?? null,
          remessaTipo: r ? tipoRemessa(r) : null,
        }
      }),
      total: contracheques.count ?? 0,
    },
    ponto: {
      ultimas: (ponto.data ?? []).map((p) => ({
        ...p,
        remessa:
          umaLinha<{ nome_remessa: string | null }>(p.remessa)?.nome_remessa ??
          null,
      })),
      total: ponto.count ?? 0,
    },
    feriasPeriodos: feriasPeriodos.data ?? [],
    feriasGozos: feriasGozos.data ?? [],
    ausencias: {
      ultimas: ausencias.data ?? [],
      total: ausencias.count ?? 0,
    },
    faltas: { ultimas: faltas.data ?? [], total: faltas.count ?? 0 },
    atestados: {
      ultimas: atestados.data ?? [],
      total: atestados.count ?? 0,
    },
    asos: asos.data ?? [],
    dependentes: dependentes.data ?? [],
  }
}

// ── Remessas de contracheques e de controle de ponto ───────────────────────
//
// Mesmo desenho das remessas de receitas dos filiados: a remessa agrupa os
// itens do período; o CRUD dos itens vive no detalhe da remessa. Arquivos
// novos vão ao bucket privado 'pessoal' (PDF; legados são URLs //cdn.bubble).

export type RemessaContracheques = {
  id: string
  nome_remessa: string | null
  ordem: number | null
  finalizada: boolean | null
  decimo_terceiro: boolean | null
  ferias: boolean | null
  adiantamento: boolean | null
  complementar_mensal: boolean | null
  created_at: string | null
  itens: number
}

/** Natureza da remessa derivada das flags (mensal quando nenhuma). */
export function naturezaRemessaContracheques(
  r: Pick<
    RemessaContracheques,
    "decimo_terceiro" | "ferias" | "adiantamento" | "complementar_mensal"
  >
): string {
  if (r.decimo_terceiro === true) return "13º salário"
  if (r.ferias === true) return "Férias"
  if (r.adiantamento === true) return "Adiantamento"
  if (r.complementar_mensal === true) return "Complementar (mensal)"
  return "Mensal"
}

/** Leitura completa em lotes — .order("id") garante paginação estável. */
async function remessaIdsEmLotes(
  tabela: "pessoal_contracheques" | "pessoal_registro_ponto"
): Promise<Map<string, number>> {
  const admin = await createAdminClient()
  const LOTE = 1000
  const porRemessa = new Map<string, number>()
  for (let de = 0; ; de += LOTE) {
    const { data, error } = await admin
      .from(tabela)
      .select("id, remessa_id")
      .order("id", { ascending: true })
      .range(de, de + LOTE - 1)
    if (error) throw new Error(`Falha ao contar itens: ${error.message}`)
    for (const i of data ?? []) {
      if (i.remessa_id) {
        porRemessa.set(i.remessa_id, (porRemessa.get(i.remessa_id) ?? 0) + 1)
      }
    }
    if (!data || data.length < LOTE) break
  }
  return porRemessa
}

export async function listarRemessasContracheques(): Promise<
  RemessaContracheques[]
> {
  const admin = await createAdminClient()
  const [remessas, porRemessa] = await Promise.all([
    admin
      .from("pessoal_contracheques_remessas")
      .select(
        "id, nome_remessa, ordem, finalizada, decimo_terceiro, ferias, adiantamento, complementar_mensal, created_at"
      )
      .eq("emp_proprietaria_id", await tenantAtual())
      .order("ordem", { ascending: false, nullsFirst: false }),
    remessaIdsEmLotes("pessoal_contracheques"),
  ])
  if (remessas.error) {
    throw new Error(`Falha ao listar remessas: ${remessas.error.message}`)
  }
  return (remessas.data ?? []).map((r) => ({
    ...r,
    itens: porRemessa.get(r.id) ?? 0,
  }))
}

export async function buscarRemessaContracheques(
  id: string
): Promise<RemessaContracheques | null> {
  const remessas = await listarRemessasContracheques()
  return remessas.find((r) => r.id === id) ?? null
}

export type ContrachequeDaRemessa = {
  id: string
  funcionario_id: string | null
  funcionarioNome: string | null
  liberado: boolean | null
  arquivo: string | null
  created_at: string | null
}

export async function contrachequesDaRemessa(
  remessaId: string
): Promise<ContrachequeDaRemessa[]> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("pessoal_contracheques")
    .select("id, funcionario_id, liberado, arquivo, created_at")
    .eq("remessa_id", remessaId)
  if (error) throw new Error(`Falha ao listar contracheques: ${error.message}`)
  const itens = data ?? []
  const nomes = await nomesDosUsuarios([
    ...new Set(
      itens.map((i) => i.funcionario_id).filter((v): v is string => !!v)
    ),
  ])
  return itens
    .map((i) => ({
      ...i,
      funcionarioNome: i.funcionario_id
        ? (nomes.get(i.funcionario_id) ?? null)
        : null,
    }))
    .sort((a, b) =>
      (a.funcionarioNome ?? "￿").localeCompare(b.funcionarioNome ?? "￿", "pt-BR")
    )
}

export type RemessaPonto = {
  id: string
  nome_remessa: string | null
  ordem: number | null
  mes_referencia_os: string | null
  ano_referencia_os: string | null
  finalizada: boolean | null
  created_at: string | null
  itens: number
}

export async function listarRemessasPonto(): Promise<RemessaPonto[]> {
  const admin = await createAdminClient()
  const [remessas, porRemessa] = await Promise.all([
    admin
      .from("pessoal_registro_ponto_remessas")
      .select(
        "id, nome_remessa, ordem, mes_referencia_os, ano_referencia_os, finalizada, created_at"
      )
      .eq("emp_proprietaria_id", await tenantAtual())
      .order("ordem", { ascending: false, nullsFirst: false }),
    remessaIdsEmLotes("pessoal_registro_ponto"),
  ])
  if (remessas.error) {
    throw new Error(`Falha ao listar remessas de ponto: ${remessas.error.message}`)
  }
  return (remessas.data ?? []).map((r) => ({
    ...r,
    itens: porRemessa.get(r.id) ?? 0,
  }))
}

export async function buscarRemessaPonto(id: string): Promise<RemessaPonto | null> {
  const remessas = await listarRemessasPonto()
  return remessas.find((r) => r.id === id) ?? null
}

export type RegistroPontoDaRemessa = {
  id: string
  funcionario_id: string | null
  funcionarioNome: string | null
  liberado: boolean | null
  arquivo: string | null
  horas_realizadas_70: number | null
  horas_pagas_70: number | null
  saldo_remanescente_70: number | null
  saldo_remessa_anterior_70: number | null
  horas_realizadas_100: number | null
  horas_pagas_100: number | null
  saldo_remanescente_100: number | null
  saldo_remessa_anterior_100: number | null
  created_at: string | null
}

export async function registrosDaRemessaPonto(
  remessaId: string
): Promise<RegistroPontoDaRemessa[]> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("pessoal_registro_ponto")
    .select(
      "id, funcionario_id, liberado, arquivo, horas_realizadas_70, horas_pagas_70, saldo_remanescente_70, saldo_remessa_anterior_70, horas_realizadas_100, horas_pagas_100, saldo_remanescente_100, saldo_remessa_anterior_100, created_at"
    )
    .eq("remessa_id", remessaId)
  if (error) throw new Error(`Falha ao listar registros de ponto: ${error.message}`)
  const itens = data ?? []
  const nomes = await nomesDosUsuarios([
    ...new Set(
      itens.map((i) => i.funcionario_id).filter((v): v is string => !!v)
    ),
  ])
  return itens
    .map((i) => ({
      ...i,
      funcionarioNome: i.funcionario_id
        ? (nomes.get(i.funcionario_id) ?? null)
        : null,
    }))
    .sort((a, b) =>
      (a.funcionarioNome ?? "￿").localeCompare(b.funcionarioNome ?? "￿", "pt-BR")
    )
}

/** Funcionários ativos para os selects (id em `usuarios` + nome). */
export async function funcionariosParaSelecao(): Promise<
  { usuarioId: string; nome: string }[]
> {
  const { linhas } = await listarFuncionarios({ situacao: "ativos" })
  return linhas.map((f) => ({
    usuarioId: f.usuarioId,
    nome: f.nome ?? "(sem nome)",
  }))
}

/** Próxima ordem sequencial de uma tabela de remessas. */
export async function proximaOrdemRemessa(
  tabela: "pessoal_contracheques_remessas" | "pessoal_registro_ponto_remessas"
): Promise<number> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from(tabela)
    .select("ordem")
    .order("ordem", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle()
  return (data?.ordem ?? 0) + 1
}

/**
 * Aviso de liberação de contracheque/espelho de ponto: notificação interna
 * (sino + histórico) e email ao funcionário. Falha de email não interrompe.
 */
export async function notificarLiberacaoPessoal(
  funcionarioId: string,
  tipo: "contracheque" | "ponto",
  remessaNome: string | null,
  itemId?: string
): Promise<void> {
  const rotulo =
    tipo === "contracheque" ? "contracheque" : "espelho de ponto"
  const titulo =
    tipo === "contracheque"
      ? "Contracheque disponível"
      : "Controle de ponto disponível"
  const mensagem = `Seu ${rotulo}${remessaNome ? ` da remessa ${remessaNome}` : ""} está disponível no sistema.`

  await criarNotificacao({
    usuarioId: funcionarioId,
    texto: mensagem,
    contrachequeId: tipo === "contracheque" ? (itemId ?? null) : null,
    registroPontoId: tipo === "ponto" ? (itemId ?? null) : null,
  })
  await enviarPushTelegram(
    funcionarioId,
    mensagem,
    tipo === "contracheque" ? "contracheque" : "ponto"
  )

  const admin = await createAdminClient()
  const { data: usuario } = await admin
    .from("usuarios")
    .select("email, nome_completo, nome_guerra")
    .eq("id", funcionarioId)
    .maybeSingle()
  if (!usuario?.email) return

  const nome = usuario.nome_completo ?? usuario.nome_guerra ?? null
  await enviarEmail({
    email: usuario.email,
    nome,
    assunto: `${titulo} — Sindipetro-NF`,
    html: `<p>Olá${nome ? `, ${String(nome).split(" ")[0]}` : ""}!</p><p>${mensagem}</p><p>Acesse o sistema em <a href="${SITE_URL}/painel/perfil/contracheques">${SITE_URL}/painel/perfil/contracheques</a>.</p><p>Confluir — Sindipetro-NF</p>`,
  })
}

export type MeuDocumentoPessoal = {
  id: string
  tipo: "contracheque" | "ponto"
  remessaNome: string | null
  arquivo: string | null
  created_at: string | null
}

/** Contracheques e espelhos de ponto LIBERADOS do próprio funcionário. */
export async function meusDocumentosPessoal(
  usuarioId: string
): Promise<{ contracheques: MeuDocumentoPessoal[]; pontos: MeuDocumentoPessoal[] }> {
  const admin = await createAdminClient()
  const [contracheques, pontos, remessasC, remessasP] = await Promise.all([
    admin
      .from("pessoal_contracheques")
      .select("id, arquivo, remessa_id, created_at")
      .eq("funcionario_id", usuarioId)
      .eq("liberado", true),
    admin
      .from("pessoal_registro_ponto")
      .select("id, arquivo, remessa_id, created_at")
      .eq("funcionario_id", usuarioId)
      .eq("liberado", true),
    admin
      .from("pessoal_contracheques_remessas")
      .select("id, nome_remessa, ordem")
      .eq("emp_proprietaria_id", await tenantAtual()),
    admin
      .from("pessoal_registro_ponto_remessas")
      .select("id, nome_remessa, ordem")
      .eq("emp_proprietaria_id", await tenantAtual()),
  ])

  const nomeC = new Map((remessasC.data ?? []).map((r) => [r.id, r]))
  const nomeP = new Map((remessasP.data ?? []).map((r) => [r.id, r]))
  const ordenar = (
    itens: { remessa_id: string | null; [k: string]: unknown }[],
    mapa: Map<string, { nome_remessa: string | null; ordem: number | null }>
  ) =>
    [...itens].sort(
      (a, b) =>
        (mapa.get(String(b.remessa_id))?.ordem ?? 0) -
        (mapa.get(String(a.remessa_id))?.ordem ?? 0)
    )

  return {
    contracheques: ordenar(contracheques.data ?? [], nomeC).map((i) => ({
      id: String(i.id),
      tipo: "contracheque" as const,
      remessaNome: nomeC.get(String(i.remessa_id))?.nome_remessa ?? null,
      arquivo: (i.arquivo as string | null) ?? null,
      created_at: (i.created_at as string | null) ?? null,
    })),
    pontos: ordenar(pontos.data ?? [], nomeP).map((i) => ({
      id: String(i.id),
      tipo: "ponto" as const,
      remessaNome: nomeP.get(String(i.remessa_id))?.nome_remessa ?? null,
      arquivo: (i.arquivo as string | null) ?? null,
      created_at: (i.created_at as string | null) ?? null,
    })),
  }
}

/** URL assinada (1h) para arquivo do bucket 'pessoal'; URLs legadas passam direto. */
export async function urlArquivoPessoal(
  caminho: string | null
): Promise<string | null> {
  if (!caminho) return null
  if (/^(https?:)?\/\//.test(caminho)) {
    return caminho.startsWith("//") ? `https:${caminho}` : caminho
  }
  const admin = await createAdminClient()
  const { data } = await admin.storage
    .from("pessoal")
    .createSignedUrl(caminho, 3600)
  return data?.signedUrl ?? null
}
