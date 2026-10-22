import "server-only"

import { esquemaAusente, nomesDosUsuarios, texto } from "@/lib/db/comum"
import { faixasHoraExtra } from "@/lib/db/ponto-config"
import { hhmm } from "@/lib/horas"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * MOVIMENTO DA FOLHA PARA A CONTABILIDADE (16/10/2026).
 *
 * A contabilidade (escritório externo) fecha a folha e transmite o eSocial.
 * Cada COMPETÊNCIA (AAAA-MM) junta o que mudou para os funcionários naquele
 * mês, organizado pelos eventos do eSocial: admissões (S-2200), desligamentos
 * (S-2299), alterações contratuais (S-2206) e cadastrais (S-2205), férias e
 * afastamentos (S-2230) e as variáveis da remuneração (S-1200) — horas extras,
 * anuênios, progressões, reembolsos do ACT, faltas e descontos.
 *
 * Como fazem as empresas de referência (o "effective-dated change" da folha
 * terceirizada): cada linha tem a data de VIGÊNCIA; o corte é o dia
 * DIA_CORTE; a competência é ENVIADA uma vez, com a fotografia do que foi
 * entregue; o que for lançado depois — inclusive com vigência num mês já
 * enviado — entra na competência seguinte, marcado como RETROATIVO. Linha já
 * entregue não se repete (casa pela `chave`).
 *
 * O que mudou no cadastro e no contrato sai da trilha de auditoria
 * (supabase/folha-movimento-contabilidade.sql liga o trigger nas tabelas do
 * Pessoal). Tabela das competências: pessoal_folha_competencias.
 */

export const DIA_CORTE = 15

export const SECOES = [
  { id: "admissao", titulo: "Admissões", evento: "S-2200" },
  { id: "desligamento", titulo: "Desligamentos", evento: "S-2299" },
  { id: "contrato", titulo: "Alterações contratuais", evento: "S-2206" },
  { id: "cadastro", titulo: "Alterações cadastrais", evento: "S-2205" },
  { id: "ferias", titulo: "Férias", evento: "S-2230" },
  { id: "afastamento", titulo: "Afastamentos e licenças", evento: "S-2230" },
  { id: "faltas", titulo: "Faltas", evento: "S-1200" },
  { id: "variaveis", titulo: "Variáveis da remuneração", evento: "S-1200" },
  { id: "descontos", titulo: "Descontos", evento: "S-1200" },
  { id: "pendencias", titulo: "Pendências do cadastro", evento: "—" },
] as const

export type SecaoMovimento = (typeof SECOES)[number]["id"]

export type LinhaMovimento = {
  /** Identidade estável da linha (não se repete entre competências). */
  chave: string
  secao: SecaoMovimento
  funcionarioId: string | null
  nome: string | null
  cpf: string | null
  matricula: string | null
  descricao: string
  /** Data de vigência (AAAA-MM-DD) e, quando houver, o fim. */
  inicio: string | null
  fim: string | null
  quantidade: number | null
  valor: number | null
  /** Vigência anterior à competência (lançado depois do envio dela). */
  retroativo: boolean
  /** Link para a origem no painel. */
  origem: string | null
}

export type Competencia = {
  competencia: string
  enviada: boolean
  /** Enviada antes do marco inicial: só para consulta, não conta no cálculo. */
  desconsiderada: boolean
  enviadaEm: string | null
  enviadaPor: string | null
  recebidaEm: string | null
  recebidaPor: string | null
  observacao: string | null
  totalItens: number
}

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
]

export function competenciaValida(c: string | null | undefined): c is string {
  return Boolean(c && /^\d{4}-(0[1-9]|1[0-2])$/.test(c))
}

export function competenciaAtual(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" })
    .format(new Date())
    .slice(0, 7)
}

export function rotuloCompetencia(c: string): string {
  const [a, m] = c.split("-")
  return `${MESES[Number(m) - 1]}/${a}`
}

export function deslocarCompetencia(c: string, meses: number): string {
  const [a, m] = c.split("-").map(Number)
  const d = new Date(Date.UTC(a, m - 1 + meses, 1))
  return d.toISOString().slice(0, 7)
}

const primeiroDia = (c: string) => `${c}-01`
const ultimoDia = (c: string) => {
  const [a, m] = c.split("-").map(Number)
  return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10)
}

// ── Marco inicial ────────────────────────────────────────────────────────────

export type MarcoInicial = { momento: string; observacao: string | null }

/**
 * Marco inicial do movimento (20/10/2026): o que foi registrado até ele conta
 * como enviado à contabilidade e pago (foi passado à mão), e as competências
 * enviadas antes dele são desconsideradas. Sem marco, vale tudo.
 */
export async function marcoInicial(): Promise<MarcoInicial | null> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("pessoal_folha_config")
    .select("marco_inicial, marco_observacao")
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (error) {
    if (esquemaAusente(error)) return null
    throw new Error(`Falha ao ler o marco do movimento: ${error.message}`)
  }
  const momento = texto(data?.marco_inicial)
  return momento ? { momento, observacao: texto(data?.marco_observacao) } : null
}

/** O mais recente de dois momentos (data ou data e hora). */
function maisRecente(a: unknown, b: unknown): string | null {
  const [x, y] = [texto(a), texto(b)]
  if (!x || !y) return x ?? y
  return new Date(x) >= new Date(y) ? x : y
}

// ── Competências enviadas ────────────────────────────────────────────────────

type LinhaCompetencia = Record<string, unknown>

/** As enviadas que valem: as anteriores ao marco ficam de fora. */
async function competenciasEnviadas(
  marco?: MarcoInicial | null
): Promise<{ disponivel: boolean; linhas: LinhaCompetencia[]; desconsideradas: LinhaCompetencia[] }> {
  const admin = await createAdminClient()
  const [{ data, error }, m] = await Promise.all([
    admin
      .from("pessoal_folha_competencias")
      .select("*")
      .eq("emp_proprietaria_id", await tenantAtual())
      .order("competencia", { ascending: false }),
    marco === undefined ? marcoInicial() : Promise.resolve(marco),
  ])
  if (error) {
    if (esquemaAusente(error)) return { disponivel: false, linhas: [], desconsideradas: [] }
    throw new Error(`Falha ao ler as competências: ${error.message}`)
  }
  const todas = (data ?? []) as LinhaCompetencia[]
  const antes = (l: LinhaCompetencia) => Boolean(m && new Date(String(l.enviada_em)) <= new Date(m.momento))
  return { disponivel: true, linhas: todas.filter((l) => !antes(l)), desconsideradas: todas.filter(antes) }
}

function paraCompetencia(l: LinhaCompetencia, nomes: Map<string, string>, desconsiderada: boolean): Competencia {
  return {
    competencia: String(l.competencia),
    enviada: true,
    desconsiderada,
    enviadaEm: texto(l.enviada_em),
    enviadaPor: texto(l.enviada_por) ? (nomes.get(String(l.enviada_por)) ?? null) : null,
    recebidaEm: texto(l.recebida_em),
    recebidaPor: texto(l.recebida_por) ? (nomes.get(String(l.recebida_por)) ?? null) : null,
    observacao: texto(l.observacao),
    totalItens: Number(l.total_itens ?? 0),
  }
}

export async function listarCompetencias(): Promise<{
  disponivel: boolean
  marco: MarcoInicial | null
  competencias: Competencia[]
  /** Enviadas antes do marco: ficam só para consulta. */
  desconsideradas: Competencia[]
}> {
  const marco = await marcoInicial()
  const { disponivel, linhas, desconsideradas } = await competenciasEnviadas(marco)
  const nomes = await nomesDosUsuarios(
    [...linhas, ...desconsideradas]
      .flatMap((l) => [texto(l.enviada_por), texto(l.recebida_por)])
      .filter((v): v is string => Boolean(v))
  )
  return {
    disponivel,
    marco,
    competencias: linhas.map((l) => paraCompetencia(l, nomes, false)),
    desconsideradas: desconsideradas.map((l) => paraCompetencia(l, nomes, true)),
  }
}

/** Competência do marco (AAAA-MM, no horário de Brasília): antes dela nada abre. */
export function competenciaDoMarco(marco: MarcoInicial | null): string | null {
  if (!marco) return null
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(marco.momento)).slice(0, 7)
}

/** A competência: enviada (com a fotografia) ou aberta (calculada agora). */
export async function obterMovimento(competencia: string): Promise<{
  disponivel: boolean
  marco: MarcoInicial | null
  competencia: Competencia
  linhas: LinhaMovimento[]
}> {
  const marco = await marcoInicial()
  const { disponivel, linhas: validas, desconsideradas } = await competenciasEnviadas(marco)
  const bruta = [...validas, ...desconsideradas].find((l) => String(l.competencia) === competencia)
  if (bruta) {
    const nomes = await nomesDosUsuarios(
      [texto(bruta.enviada_por), texto(bruta.recebida_por)].filter((v): v is string => Boolean(v))
    )
    return {
      disponivel,
      marco,
      competencia: paraCompetencia(bruta, nomes, desconsideradas.includes(bruta)),
      linhas: (Array.isArray(bruta.snapshot) ? bruta.snapshot : []) as LinhaMovimento[],
    }
  }
  return {
    disponivel,
    marco,
    competencia: {
      competencia,
      enviada: false,
      desconsiderada: false,
      enviadaEm: null,
      enviadaPor: null,
      recebidaEm: null,
      recebidaPor: null,
      observacao: null,
      totalItens: 0,
    },
    linhas: await calcularMovimento(competencia, marco),
  }
}

// ── O cálculo ────────────────────────────────────────────────────────────────

type Pessoa = { nome: string | null; cpf: string | null; matricula: string | null; ativo: boolean }

const CAMPOS_CONTRATO: Record<string, string> = {
  cargo: "Cargo",
  lotacao: "Lotação",
  matricula: "Matrícula",
  regime_trabalho: "Regime de trabalho",
  regime_trabalho_os: "Regime de trabalho",
  contrato_trabalho: "Contrato de trabalho",
  cbo_numero: "CBO",
}
const CAMPOS_CADASTRO: Record<string, string> = {
  nome_completo: "Nome",
  cpf: "CPF",
  data_nascimento: "Nascimento",
  nascimento_data: "Nascimento",
  estado_civil: "Estado civil",
  sexo: "Sexo",
  escolaridade: "Escolaridade",
}

function valorTexto(v: unknown): string {
  if (v === null || v === undefined || v === "") return "(vazio)"
  return String(v)
}

/**
 * Linhas da competência ABERTA. Janela: as datas de vigência do mês (e, havendo
 * competência anterior enviada, as dos dois meses antes — o que não foi
 * entregue entra como retroativo); as alterações do cadastro desde o envio
 * anterior (ou o início do mês).
 */
export async function calcularMovimento(
  competencia: string,
  marcoInformado?: MarcoInicial | null
): Promise<LinhaMovimento[]> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const marco = marcoInformado === undefined ? await marcoInicial() : marcoInformado
  const momentoMarco = marco ? new Date(marco.momento) : null
  const { linhas: enviadas } = await competenciasEnviadas(marco)
  const anteriores = enviadas.filter((l) => String(l.competencia) < competencia)
  const ultimaAnterior = anteriores[0]
  const jaEntregues = new Set(
    enviadas.flatMap((l) => (Array.isArray(l.snapshot) ? (l.snapshot as LinhaMovimento[]).map((x) => x.chave) : []))
  )

  const inicioMes = primeiroDia(competencia)
  const fimMes = ultimoDia(competencia)
  // Com o marco, a janela também recua dois meses: o retroativo lançado depois
  // dele entra; o que foi registrado antes fica de fora pelo momento.
  const desde = ultimaAnterior || marco ? primeiroDia(deslocarCompetencia(competencia, -2)) : inicioMes
  // Desde o envio anterior OU o início do mês — o que vier antes: a anterior
  // enviada com atraso não engole o que mudou no começo deste mês (o que ela
  // já levou não se repete, pela chave).
  const inicioMesUtc = `${inicioMes}T03:00:00Z`
  const referencia = ultimaAnterior ? new Date(String(ultimaAnterior.enviada_em)) : momentoMarco
  const auditoriaDesde =
    referencia && referencia < new Date(inicioMesUtc) ? referencia.toISOString() : inicioMesUtc
  const auditoriaAte = `${deslocarCompetencia(competencia, 1)}-01T03:00:00Z`

  // Funcionários: vínculos com a entidade (um por pessoa, o mais recente).
  const { data: vincs } = await admin
    .from("vinculos_trabalhistas")
    .select("id, trabalhador_id, cargo, lotacao, matricula, contrato_admissao, contrato_demissao, created_at, updated_at")
    .eq("empregador_id", emp)
  const vinculos = (vincs ?? []) as Record<string, unknown>[]
  const ids = [...new Set(vinculos.map((v) => texto(v.trabalhador_id)).filter((v): v is string => Boolean(v)))]
  const { data: us } = ids.length
    ? await admin.from("usuarios").select("id, nome_completo, nome_guerra, cpf").in("id", ids)
    : { data: [] }
  const usuario = new Map(((us ?? []) as Record<string, unknown>[]).map((u) => [String(u.id), u]))
  const pessoa = new Map<string, Pessoa>()
  for (const v of vinculos) {
    const id = texto(v.trabalhador_id)
    if (!id) continue
    const atual = pessoa.get(id)
    const ativo = !v.contrato_demissao
    if (atual && atual.ativo && !ativo) continue
    const u = usuario.get(id)
    pessoa.set(id, {
      nome: texto(u?.nome_completo) ?? texto(u?.nome_guerra),
      cpf: texto(u?.cpf),
      matricula: texto(v.matricula),
      ativo,
    })
  }
  const funcionarios = new Set(pessoa.keys())
  const vinculoDe = new Map(vinculos.map((v) => [String(v.id), texto(v.trabalhador_id)]))

  const linhas: LinhaMovimento[] = []
  const add = ({
    registradoEm,
    ...l
  }: Omit<LinhaMovimento, "nome" | "cpf" | "matricula" | "retroativo"> & {
    retroativo?: boolean
    /** Quando o lançamento entrou no sistema: até o marco, já foi enviado e pago. */
    registradoEm: unknown
  }) => {
    if (jaEntregues.has(l.chave)) return
    if (momentoMarco) {
      const r = texto(registradoEm)
      if (!r || new Date(r) <= momentoMarco) return
    }
    const p = l.funcionarioId ? pessoa.get(l.funcionarioId) : null
    linhas.push({
      ...l,
      nome: p?.nome ?? null,
      cpf: p?.cpf ?? null,
      matricula: p?.matricula ?? null,
      retroativo: l.retroativo ?? Boolean(l.inicio && l.inicio < inicioMes),
    })
  }
  const naJanela = (d: unknown) => {
    const s = texto(d)?.slice(0, 10)
    return Boolean(s && s >= desde && s <= fimMes)
  }

  // 1–2. Admissões e desligamentos.
  for (const v of vinculos) {
    const f = texto(v.trabalhador_id)
    if (!f) continue
    if (naJanela(v.contrato_admissao)) {
      add({
        chave: `admissao:${v.id}`,
        registradoEm: v.created_at,
        secao: "admissao",
        funcionarioId: f,
        descricao: `Admissão — ${[texto(v.cargo), texto(v.lotacao)].filter(Boolean).join(" · ") || "cargo não informado"}`,
        inicio: texto(v.contrato_admissao)?.slice(0, 10) ?? null,
        fim: null,
        quantidade: null,
        valor: null,
        origem: `/painel/pessoal/${f}`,
      })
    }
    if (naJanela(v.contrato_demissao)) {
      add({
        chave: `desligamento:${v.id}`,
        registradoEm: v.updated_at,
        secao: "desligamento",
        funcionarioId: f,
        descricao: "Desligamento (último dia do contrato)",
        inicio: texto(v.contrato_demissao)?.slice(0, 10) ?? null,
        fim: null,
        quantidade: null,
        valor: null,
        origem: `/painel/pessoal/${f}`,
      })
    }
  }

  // 3–4. Alterações contratuais e cadastrais (trilha de auditoria).
  const { data: auds } = await admin
    .from("auditoria")
    .select("id, tabela, registro_id, operacao, campos, antes, depois, momento")
    .eq("emp_proprietaria_id", emp)
    .in("tabela", [
      "vinculos_trabalhistas",
      "usuarios",
      "dados_bancarios",
      "enderecos",
      "pessoal_dependentes",
      "pessoal_funcionario_jornada",
      "pessoal_funcionario_funcao",
      "pessoal_nivel_salarial_base",
    ])
    .gt("momento", auditoriaDesde)
    .lt("momento", auditoriaAte)
    .order("momento", { ascending: true })
    .range(0, 4999)
  for (const a of (auds ?? []) as Record<string, unknown>[]) {
    const tabela = String(a.tabela)
    const antes = (a.antes ?? {}) as Record<string, unknown>
    const depois = (a.depois ?? {}) as Record<string, unknown>
    const linha = { ...antes, ...depois }
    const quando = texto(a.momento)?.slice(0, 10) ?? null
    const campos = (Array.isArray(a.campos) ? a.campos : []) as string[]
    const op = String(a.operacao)
    const base = { chave: `aud:${a.id}`, registradoEm: a.momento, inicio: quando, fim: null, quantidade: null, valor: null, retroativo: Boolean(quando && quando < inicioMes) }

    if (tabela === "vinculos_trabalhistas") {
      const f = vinculoDe.get(String(a.registro_id)) ?? texto(linha.trabalhador_id)
      if (!f || op !== "UPDATE") continue
      const mudancas = campos
        .filter((c) => CAMPOS_CONTRATO[c])
        .map((c) => `${CAMPOS_CONTRATO[c]}: ${valorTexto(antes[c])} → ${valorTexto(depois[c])}`)
      if (mudancas.length) add({ ...base, secao: "contrato", funcionarioId: f, descricao: mudancas.join("; "), origem: `/painel/pessoal/${f}` })
    } else if (tabela === "usuarios") {
      const f = String(a.registro_id)
      if (!funcionarios.has(f) || op !== "UPDATE") continue
      const mudancas = campos
        .filter((c) => CAMPOS_CADASTRO[c])
        .map((c) => `${CAMPOS_CADASTRO[c]}: ${valorTexto(antes[c])} → ${valorTexto(depois[c])}`)
      if (mudancas.length) add({ ...base, secao: "cadastro", funcionarioId: f, descricao: mudancas.join("; "), origem: `/painel/pessoal/${f}` })
    } else if (tabela === "dados_bancarios" || tabela === "enderecos") {
      const f = texto(linha.usuario_id)
      if (!f || !funcionarios.has(f)) continue
      const oque = tabela === "dados_bancarios" ? "Conta bancária / Pix" : "Endereço"
      const acao = op === "INSERT" ? "incluído(a)" : op === "DELETE" ? "excluído(a)" : "alterado(a)"
      const resumo =
        tabela === "dados_bancarios"
          ? [texto(linha.banco), texto(linha.agencia) && `ag. ${linha.agencia}`, texto(linha.conta) && `conta ${linha.conta}`, texto(linha.pix) && `Pix ${linha.pix}`]
              .filter(Boolean)
              .join(" · ")
          : [texto(linha.logradouro), texto(linha.numero), texto(linha.bairro), texto(linha.cidade), texto(linha.estado), texto(linha.cep)]
              .filter(Boolean)
              .join(", ")
      add({ ...base, secao: "cadastro", funcionarioId: f, descricao: `${oque} ${acao}${resumo ? ` — ${resumo}` : ""}`, origem: `/painel/pessoal/${f}` })
    } else if (tabela === "pessoal_dependentes") {
      const f = texto(linha.funcionario_id)
      if (!f || !funcionarios.has(f)) continue
      const acao = op === "INSERT" ? "incluído" : op === "DELETE" ? "excluído" : "alterado"
      add({
        ...base,
        secao: "cadastro",
        funcionarioId: f,
        descricao: `Dependente ${acao} — ${[texto(linha.nome_completo), texto(linha.grau_parentesco), texto(linha.nascimento) && `nasc. ${linha.nascimento}`].filter(Boolean).join(" · ")}`,
        origem: `/painel/pessoal/${f}`,
      })
    } else if (tabela === "pessoal_funcionario_jornada" || tabela === "pessoal_funcionario_funcao") {
      const f = texto(linha.funcionario_id)
      if (!f || !funcionarios.has(f)) continue
      add({
        ...base,
        // Uma linha por funcionário e dia: várias mudanças na jornada viram uma só.
        chave: `${tabela}:${f}:${quando}`,
        secao: "contrato",
        funcionarioId: f,
        descricao: tabela === "pessoal_funcionario_jornada" ? "Jornada de trabalho alterada" : "Função alterada",
        origem: `/painel/pessoal/${f}`,
      })
    } else if (tabela === "pessoal_nivel_salarial_base" && op === "UPDATE" && campos.includes("salario_base")) {
      add({
        ...base,
        chave: `tabela-salarial:${quando}`,
        secao: "contrato",
        funcionarioId: null,
        descricao: "Tabela salarial alterada (reajuste) — conferir os salários de todos os funcionários",
        origem: "/painel/pessoal/niveis/tabela",
      })
    }
  }

  // Leituras por data de vigência (em paralelo).
  const proximoMes = deslocarCompetencia(competencia, 1)
  const faixas = await faixasHoraExtra()
  const [gozos, atestados, ausencias, faltas, anuenios, niveis, reembolsos, infracoes, ponto] = await Promise.all([
    admin.from("pessoal_ferias_gozo").select("id, funcionario_id, inicio, termino, dias, autorizado, abono_solicitado, data_autorizacao, created_at")
      .gte("inicio", desde).lte("inicio", `${proximoMes}-02`).eq("autorizado", true),
    admin.from("pes_atestados_medicos").select("id, funcionario_id, inicio, termino, quantidade_dias, cid10, created_at")
      .lte("inicio", fimMes).gte("termino", desde),
    admin.from("pessoal_ausencias").select("id, funcionario_id, inicio, termino, motivo, observacao, created_at")
      .in("motivo", ["Falta injustificada", "Licença"]).lte("inicio", fimMes).gte("termino", desde),
    admin.from("pessoal_faltas_justificadas").select("id, funcionario_id, data_falta, justificativa_tipo, autorizado, data_autorizacao, created_at")
      .eq("autorizado", true).gte("data_falta", desde).lte("data_falta", fimMes),
    admin.from("pessoal_anuenio").select("id, funcionario_id, nivel_atual_id, nivel_atual_data, created_at")
      .eq("emp_proprietaria_id", emp).gte("nivel_atual_data", desde).lte("nivel_atual_data", fimMes),
    admin.from("pessoal_nivel_salarial").select("id, funcionario_id, nivel_atual_id, nivel_atual_data, tipo_avanco, created_at")
      .eq("emp_proprietaria_id", emp).gte("nivel_atual_data", desde).lte("nivel_atual_data", fimMes),
    admin.from("pessoal_reembolsos_act").select("id, funcionario_id, tipo_id, valor_aprovado, pagamento_mes, pagamento_ano, situacao, created_at")
      .eq("emp_proprietaria_id", emp).in("situacao", ["aprovado", "pago"]),
    admin.from("veiculos_infracoes").select("id, codigo, condutor_infrator_id, cobranca_valor, infracao_data, infracao_descricao, created_at")
      .eq("cobranca_forma", "contracheque").eq("cobranca_situacao", "pendente"),
    admin.from("pessoal_registro_ponto_remessas").select("id, nome_remessa, mes_referencia_os, ano_referencia_os")
      .eq("emp_proprietaria_id", emp),
  ])

  // 5. Férias (início no mês; as que começam até o dia 2 do mês seguinte
  // também, porque o pagamento sai até 2 dias antes do início).
  for (const g of (gozos.data ?? []) as Record<string, unknown>[]) {
    const f = texto(g.funcionario_id)
    if (!f || !funcionarios.has(f)) continue
    const inicio = texto(g.inicio)?.slice(0, 10) ?? null
    const antecipada = Boolean(inicio && inicio > fimMes)
    add({
      chave: `ferias:${g.id}`,
      registradoEm: maisRecente(g.created_at, g.data_autorizacao),
      secao: "ferias",
      funcionarioId: f,
      descricao: [
        `Férias — ${g.dias ?? "?"} dia(s)`,
        g.abono_solicitado ? "com abono pecuniário" : null,
        antecipada ? "início no mês seguinte: pagamento nesta competência" : null,
      ]
        .filter(Boolean)
        .join(" · "),
      inicio,
      fim: texto(g.termino)?.slice(0, 10) ?? null,
      quantidade: Number(g.dias ?? 0) || null,
      valor: null,
      origem: `/painel/pessoal/ferias/funcionario/${f}`,
    })
  }

  // 6. Afastamentos (atestados) e licenças.
  for (const a of (atestados.data ?? []) as Record<string, unknown>[]) {
    const f = texto(a.funcionario_id)
    if (!f || !funcionarios.has(f)) continue
    const dias = Number(a.quantidade_dias ?? 0) || null
    add({
      chave: `atestado:${a.id}`,
      registradoEm: a.created_at,
      secao: "afastamento",
      funcionarioId: f,
      descricao: [
        "Atestado médico",
        texto(a.cid10) ? `CID ${a.cid10}` : null,
        dias && dias > 15 ? "mais de 15 dias: afastamento a partir do 16º dia vai ao INSS (S-2230)" : null,
      ]
        .filter(Boolean)
        .join(" · "),
      inicio: texto(a.inicio)?.slice(0, 10) ?? null,
      fim: texto(a.termino)?.slice(0, 10) ?? null,
      quantidade: dias,
      valor: null,
      origem: "/painel/pessoal/atestados",
    })
  }
  for (const a of (ausencias.data ?? []) as Record<string, unknown>[]) {
    const f = texto(a.funcionario_id)
    if (!f || !funcionarios.has(f)) continue
    const injustificada = a.motivo === "Falta injustificada"
    add({
      chave: `ausencia:${a.id}`,
      registradoEm: a.created_at,
      secao: injustificada ? "faltas" : "afastamento",
      funcionarioId: f,
      descricao: `${String(a.motivo)}${injustificada ? " — descontar" : ""}${texto(a.observacao) ? ` · ${a.observacao}` : ""}`,
      inicio: texto(a.inicio)?.slice(0, 10) ?? null,
      fim: texto(a.termino)?.slice(0, 10) ?? null,
      quantidade: null,
      valor: null,
      origem: "/painel/pessoal/atestados?aba=ausencias",
    })
  }

  // 7. Faltas justificadas autorizadas (abonadas).
  for (const fj of (faltas.data ?? []) as Record<string, unknown>[]) {
    const f = texto(fj.funcionario_id)
    if (!f || !funcionarios.has(f)) continue
    add({
      chave: `falta:${fj.id}`,
      registradoEm: maisRecente(fj.created_at, fj.data_autorizacao),
      secao: "faltas",
      funcionarioId: f,
      descricao: `Falta justificada (abonada)${texto(fj.justificativa_tipo) ? ` — ${fj.justificativa_tipo}` : ""}`,
      inicio: texto(fj.data_falta)?.slice(0, 10) ?? null,
      fim: null,
      quantidade: 1,
      valor: null,
      origem: "/painel/pessoal/faltas",
    })
  }

  // 8. Variáveis: anuênios, progressões, reembolsos do ACT e horas extras.
  const idsAnu = [...new Set(((anuenios.data ?? []) as Record<string, unknown>[]).map((a) => texto(a.nivel_atual_id)).filter((v): v is string => Boolean(v)))]
  const idsNiv = [...new Set(((niveis.data ?? []) as Record<string, unknown>[]).map((a) => texto(a.nivel_atual_id)).filter((v): v is string => Boolean(v)))]
  const idsTipos = [...new Set(((reembolsos.data ?? []) as Record<string, unknown>[]).map((r) => texto(r.tipo_id)).filter((v): v is string => Boolean(v)))]
  const [baseAnu, baseNiv, tiposRe] = await Promise.all([
    idsAnu.length ? admin.from("pessoal_anuenio_base").select("id, nivel, aliquota").in("id", idsAnu) : Promise.resolve({ data: [] }),
    idsNiv.length
      ? admin.from("pessoal_nivel_salarial_base").select("id, nivel_vertical, nivel_horizontal, nivel_carreira, salario_base").in("id", idsNiv)
      : Promise.resolve({ data: [] }),
    idsTipos.length ? admin.from("pessoal_reembolsos_act_tipos").select("id, nome").in("id", idsTipos) : Promise.resolve({ data: [] }),
  ])
  const anuBase = new Map(((baseAnu.data ?? []) as Record<string, unknown>[]).map((b) => [String(b.id), b]))
  const nivBase = new Map(((baseNiv.data ?? []) as Record<string, unknown>[]).map((b) => [String(b.id), b]))
  const tipoNome = new Map(((tiposRe.data ?? []) as Record<string, unknown>[]).map((t) => [String(t.id), texto(t.nome)]))

  for (const a of (anuenios.data ?? []) as Record<string, unknown>[]) {
    const f = texto(a.funcionario_id)
    if (!f || !funcionarios.has(f)) continue
    const b = anuBase.get(String(a.nivel_atual_id))
    const aliquota = b ? Number(b.aliquota ?? 0) : null
    add({
      chave: `anuenio:${a.id}`,
      registradoEm: a.created_at,
      secao: "variaveis",
      funcionarioId: f,
      descricao: `Anuênio — passa ao nível ${b?.nivel ?? "?"}${aliquota !== null ? ` (${(aliquota * 100).toLocaleString("pt-BR")}%)` : ""}`,
      inicio: texto(a.nivel_atual_data)?.slice(0, 10) ?? null,
      fim: null,
      quantidade: null,
      valor: null,
      origem: `/painel/pessoal/anuenios/${a.id}`,
    })
  }
  for (const n of (niveis.data ?? []) as Record<string, unknown>[]) {
    const f = texto(n.funcionario_id)
    if (!f || !funcionarios.has(f)) continue
    const b = nivBase.get(String(n.nivel_atual_id))
    add({
      chave: `nivel:${n.id}`,
      registradoEm: n.created_at,
      secao: "contrato",
      funcionarioId: f,
      descricao: `Progressão salarial${texto(n.tipo_avanco) ? ` (${n.tipo_avanco})` : ""} — nível ${[b?.nivel_vertical, b?.nivel_horizontal, b?.nivel_carreira].filter(Boolean).join(" ")}`,
      inicio: texto(n.nivel_atual_data)?.slice(0, 10) ?? null,
      fim: null,
      quantidade: null,
      valor: b ? Number(b.salario_base ?? 0) || null : null,
      origem: `/painel/pessoal/niveis/${n.id}`,
    })
  }
  const [anoC, mesC] = competencia.split("-")
  const mesNome = MESES[Number(mesC) - 1]
  for (const r of (reembolsos.data ?? []) as Record<string, unknown>[]) {
    const f = texto(r.funcionario_id)
    if (!f || !funcionarios.has(f)) continue
    if (texto(r.pagamento_mes) !== mesNome || texto(r.pagamento_ano) !== anoC) continue
    add({
      chave: `reembolso:${r.id}`,
      registradoEm: r.created_at,
      secao: "variaveis",
      funcionarioId: f,
      descricao: `Reembolso do ACT — ${tipoNome.get(String(r.tipo_id)) ?? "tipo não informado"}`,
      inicio: inicioMes,
      fim: null,
      quantidade: null,
      valor: Number(r.valor_aprovado ?? 0) || null,
      retroativo: false,
      origem: `/painel/pessoal/reembolsos/${r.id}`,
    })
  }
  const remessaPonto = ((ponto.data ?? []) as Record<string, unknown>[]).find(
    (p) => texto(p.mes_referencia_os) === mesNome && texto(p.ano_referencia_os) === anoC
  )
  if (remessaPonto) {
    const { data: regs } = await admin
      .from("pessoal_registro_ponto")
      .select("id, funcionario_id, horas_pagas_70, horas_pagas_100, horas_realizadas_70, horas_realizadas_100, created_at")
      .eq("remessa_id", String(remessaPonto.id))
    for (const r of (regs ?? []) as Record<string, unknown>[]) {
      const f = texto(r.funcionario_id)
      if (!f || !funcionarios.has(f)) continue
      for (const pct of ["70", "100"] as const) {
        const pagas = Number(r[`horas_pagas_${pct}`] ?? 0)
        if (!pagas) continue
        add({
          chave: `he${pct}:${r.id}`,
          registradoEm: r.created_at,
          secao: "variaveis",
          funcionarioId: f,
          // Quantidade em decimal (o que a contabilidade lança); o texto traz HH:MM.
          descricao: `Horas extras a ${faixas[pct]} (pagas: ${hhmm(pagas)}) — realizadas ${hhmm(Number(r[`horas_realizadas_${pct}`] ?? 0))}`,
          inicio: inicioMes,
          fim: fimMes,
          quantidade: pagas,
          valor: null,
          retroativo: false,
          origem: `/painel/pessoal/ponto/${remessaPonto.id}`,
        })
      }
    }
  }

  // 9. Descontos: infrações de trânsito a descontar em contracheque.
  for (const i of (infracoes.data ?? []) as Record<string, unknown>[]) {
    const f = texto(i.condutor_infrator_id)
    if (!f || !funcionarios.has(f)) continue
    add({
      chave: `infracao:${i.id}`,
      registradoEm: i.created_at,
      secao: "descontos",
      funcionarioId: f,
      descricao: `Infração de trânsito ${texto(i.codigo) ?? ""} a descontar${texto(i.infracao_descricao) ? ` — ${i.infracao_descricao}` : ""}`.trim(),
      inicio: inicioMes,
      fim: null,
      quantidade: null,
      valor: Number(i.cobranca_valor ?? 0) || null,
      retroativo: false,
      origem: `/painel/veiculos/infracoes/${i.id}`,
    })
  }

  // 10. Pendências do cadastro dos ativos (informativas, repetem enquanto houver).
  const { data: bancos } = ids.length
    ? await admin.from("dados_bancarios").select("usuario_id").in("usuario_id", ids)
    : { data: [] }
  const comConta = new Set(((bancos ?? []) as Record<string, unknown>[]).map((b) => String(b.usuario_id)))
  for (const [f, p] of pessoa) {
    if (!p.ativo) continue
    const faltas: string[] = []
    if (!p.cpf) faltas.push("sem CPF")
    if (!comConta.has(f)) faltas.push("sem conta bancária ou Pix")
    if (faltas.length) {
      linhas.push({
        chave: `pend:${competencia}:${f}`,
        secao: "pendencias",
        funcionarioId: f,
        nome: p.nome,
        cpf: p.cpf,
        matricula: p.matricula,
        descricao: `Cadastro incompleto: ${faltas.join(", ")}`,
        inicio: null,
        fim: null,
        quantidade: null,
        valor: null,
        retroativo: false,
        origem: `/painel/pessoal/${f}`,
      })
    }
  }

  const ordem = new Map<string, number>(SECOES.map((s, i) => [s.id, i]))
  return linhas.sort(
    (a, b) =>
      (ordem.get(a.secao) ?? 99) - (ordem.get(b.secao) ?? 99) ||
      (a.nome ?? "").localeCompare(b.nome ?? "", "pt-BR") ||
      (a.inicio ?? "").localeCompare(b.inicio ?? "")
  )
}

// ── Envio e recebimento ──────────────────────────────────────────────────────

/** Envia a competência: grava a fotografia das linhas e trava. */
export async function enviarCompetencia(
  competencia: string,
  usuarioId: string,
  observacao: string | null
): Promise<{ erro?: string; total?: number; reembolsos?: string[] }> {
  if (!competenciaValida(competencia)) return { erro: "Competência inválida." }
  const marco = await marcoInicial()
  const { disponivel, linhas: enviadas, desconsideradas } = await competenciasEnviadas(marco)
  if (!disponivel) return { erro: "Rode supabase/folha-movimento-contabilidade.sql no SQL Editor antes de enviar." }
  if (enviadas.some((l) => String(l.competencia) === competencia)) return { erro: "Esta competência já foi enviada." }
  const inicial = competenciaDoMarco(marco)
  if (inicial && competencia < inicial) return { erro: "Competência anterior ao marco inicial do movimento." }
  if (desconsideradas.some((l) => String(l.competencia) === competencia)) {
    return { erro: "Esta competência foi enviada antes do marco inicial — o que veio depois dele entra na seguinte." }
  }
  if (enviadas.some((l) => String(l.competencia) > competencia)) {
    return { erro: "Já existe competência posterior enviada — lance o que faltou na competência aberta (entra como retroativo)." }
  }
  const linhas = await calcularMovimento(competencia, marco)
  const admin = await createAdminClient()
  const { error } = await admin.from("pessoal_folha_competencias").insert({
    emp_proprietaria_id: await tenantAtual(),
    competencia,
    enviada_por: usuarioId,
    observacao,
    snapshot: linhas,
    total_itens: linhas.length,
  })
  if (error) {
    if (error.code === "23505") return { erro: "Esta competência já foi enviada por outra pessoa." }
    return { erro: `Não foi possível enviar: ${error.message}` }
  }
  return {
    total: linhas.length,
    // Os reembolsos do ACT que foram nesta competência (para passarem a pagos).
    reembolsos: linhas.filter((l) => l.chave.startsWith("reembolso:")).map((l) => l.chave.slice("reembolso:".length)),
  }
}

/** A contabilidade confirma que recebeu (uma vez). */
export async function receberCompetencia(competencia: string, usuarioId: string): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("pessoal_folha_competencias")
    .update({ recebida_em: new Date().toISOString(), recebida_por: usuarioId })
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("competencia", competencia)
    .is("recebida_em", null)
    .select("id")
  if (error) return { erro: `Não foi possível registrar: ${error.message}` }
  if ((data ?? []).length === 0) return { erro: "Competência não enviada ou já recebida." }
  return {}
}

/** CSV (;) com BOM, para abrir no Excel ou importar no sistema da contabilidade. */
export function movimentoEmCsv(competencia: string, linhas: LinhaMovimento[]): string {
  const titulo = new Map<string, { titulo: string; evento: string }>(SECOES.map((s) => [s.id, s]))
  const br = (d: string | null) => (d ? d.split("-").reverse().join("/") : "")
  const cel = (v: unknown) => {
    const s = v === null || v === undefined ? "" : String(v)
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const cab = ["Competência", "Seção", "Evento eSocial", "Funcionário", "CPF", "Matrícula", "Descrição", "Vigência", "Fim", "Quantidade", "Valor", "Retroativo"]
  const corpo = linhas.map((l) =>
    [
      rotuloCompetencia(competencia),
      titulo.get(l.secao)?.titulo ?? l.secao,
      titulo.get(l.secao)?.evento ?? "",
      l.nome ?? "",
      l.cpf ?? "",
      l.matricula ?? "",
      l.descricao,
      br(l.inicio),
      br(l.fim),
      l.quantidade !== null ? String(l.quantidade).replace(".", ",") : "",
      l.valor !== null ? l.valor.toFixed(2).replace(".", ",") : "",
      l.retroativo ? "sim" : "",
    ]
      .map(cel)
      .join(";")
  )
  return "﻿" + [cab.join(";"), ...corpo].join("\r\n")
}
