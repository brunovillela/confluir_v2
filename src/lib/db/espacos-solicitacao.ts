import "server-only"

import { createHash, randomInt, timingSafeEqual } from "node:crypto"

import { buscarFiliadoPorCpf } from "@/lib/contas"
import { limparCpf, validarCpf } from "@/lib/cpf"
import { esquemaAusente, texto } from "@/lib/db/comum"
import { avisarEquipeNovoPedido } from "@/lib/db/espacos-esteira"
import { enviarEmail } from "@/lib/email"
import {
  botaoEmail,
  caixaAviso,
  caixaCodigo,
  escaparHtml,
  paragrafo,
  tituloEmail,
} from "@/lib/email-layout"
import {
  calcularExigencias,
  periodosChocam,
  totalExigencias,
  type ExigenciaCalculada,
  type Gatilho,
  type Janela,
  type ModoJanela,
  type RegraExigencia,
  type RespostasEvento,
} from "@/lib/espacos-constantes"
import { createAdminClient, createServiceClient } from "@/lib/supabase/admin"
import { origemAtual } from "@/lib/tenant-url"

/**
 * Cessão de espaços — fase 2: as regras de segurança, a disponibilidade e o
 * pedido feito pelo link público. Ver supabase/cessao-solicitacoes.sql.
 *
 * O lado público não tem sessão: o tenant vem do subdomínio e é passado
 * explicitamente, como em eventos-publico.ts.
 */

const VALIDADE_CODIGO_MIN = 20
const MAX_TENTATIVAS = 5
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// ── Código de confirmação ────────────────────────────────────────────────────

function hashCodigo(codigo: string, token: string): string {
  return createHash("sha256").update(`${codigo}:${token}`).digest("hex")
}

function conferirHash(codigo: string, token: string, hash: string): boolean {
  const a = Buffer.from(hashCodigo(codigo, token))
  const b = Buffer.from(hash)
  return a.length === b.length && timingSafeEqual(a, b)
}

const novoCodigo = () => String(randomInt(0, 1_000_000)).padStart(6, "0")

// ── Regras de segurança do espaço ────────────────────────────────────────────

export type RegraLinha = RegraExigencia & { id: string }

export async function listarRegras(espacoId: string): Promise<RegraLinha[]> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("cessao_espaco_exigencias")
    .select("id, gatilho, de, ate, bombeiros, segurancas, observacao")
    .eq("espaco_id", espacoId)
    .order("gatilho", { ascending: true })
    .order("de", { ascending: true, nullsFirst: true })
  if (error) return []
  return (data ?? []).map((r) => ({
    id: String(r.id),
    gatilho: r.gatilho as Gatilho,
    de: (r.de as number | null) ?? null,
    ate: (r.ate as number | null) ?? null,
    bombeiros: Number(r.bombeiros ?? 0),
    segurancas: Number(r.segurancas ?? 0),
    observacao: texto(r.observacao),
  }))
}

export type DadosRegra = {
  gatilho: Gatilho
  de: number | null
  ate: number | null
  bombeiros: number
  segurancas: number
  observacao: string | null
}

export async function criarRegra(
  espacoId: string,
  dados: DadosRegra,
  tenantId: string
): Promise<{ erro?: string }> {
  if (dados.gatilho === "publico") {
    if (dados.de === null || dados.de < 0) {
      return { erro: "Informe a partir de quantas pessoas a faixa vale." }
    }
    if (dados.ate !== null && dados.ate < dados.de) {
      return { erro: "O teto da faixa tem de ser maior que o piso." }
    }
    // Faixas que se cruzam fariam duas regras valerem para o mesmo número.
    const existentes = (await listarRegras(espacoId)).filter(
      (r) => r.gatilho === "publico"
    )
    const teto = dados.ate ?? Number.MAX_SAFE_INTEGER
    const choque = existentes.find(
      (r) => dados.de! <= (r.ate ?? Number.MAX_SAFE_INTEGER) && (r.de ?? 0) <= teto
    )
    if (choque) {
      return {
        erro: `Esta faixa se cruza com a de ${choque.de} a ${choque.ate ?? "sem teto"} pessoas.`,
      }
    }
  } else {
    const jaTem = (await listarRegras(espacoId)).some(
      (r) => r.gatilho === dados.gatilho
    )
    if (jaTem) return { erro: "Já existe uma regra para essa condição." }
  }
  if (
    dados.bombeiros === 0 &&
    dados.segurancas === 0 &&
    !dados.observacao?.trim()
  ) {
    return { erro: "A regra precisa exigir alguma coisa: bombeiro, segurança ou uma observação." }
  }

  const admin = await createAdminClient()
  const { error } = await admin.from("cessao_espaco_exigencias").insert({
    espaco_id: espacoId,
    gatilho: dados.gatilho,
    de: dados.gatilho === "publico" ? dados.de : null,
    ate: dados.gatilho === "publico" ? dados.ate : null,
    bombeiros: dados.bombeiros,
    segurancas: dados.segurancas,
    observacao: dados.observacao?.trim() || null,
    emp_proprietaria_id: tenantId,
  })
  if (error) {
    if (esquemaAusente(error)) return { erro: AVISO_SQL_SOLICITACOES }
    return { erro: `Não foi possível salvar a regra: ${error.message}` }
  }
  return {}
}

export async function excluirRegra(id: string): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin
    .from("cessao_espaco_exigencias")
    .delete()
    .eq("id", id)
  return error ? { erro: `Não foi possível excluir: ${error.message}` } : {}
}

export const AVISO_SQL_SOLICITACOES =
  "Solicitações de cessão ainda não configuradas — rode supabase/cessao-solicitacoes.sql no SQL Editor do Supabase."

// ── O espaço pelo link público ───────────────────────────────────────────────

export type EspacoPublico = {
  id: string
  nome: string
  descricao: string | null
  sedeNome: string | null
  capacidade: number | null
  publico: "qualquer" | "interno" | "filiados"
  visita: "obrigatoria" | "facultativa" | "dispensada"
  exigeTermo: boolean
  agendaPublica: boolean
  janelas: Janela[]
  regras: RegraExigencia[]
}

export async function carregarEspacoPublico(
  slug: string,
  tenantId: string
): Promise<EspacoPublico | null> {
  const db = createServiceClient()
  const { data, error } = await db
    .from("cessao_espacos")
    .select(
      "id, nome, descricao, sede_id, capacidade_pessoas, publico_alvo, visita_tecnica, exige_termo, agenda_publica, ativo"
    )
    .eq("slug", slug)
    .eq("emp_proprietaria_id", tenantId)
    .maybeSingle()
  if (error || !data || data.ativo === false) return null

  const [{ data: sede }, { data: janelas }, { data: regras }] = await Promise.all([
    data.sede_id
      ? db.from("empresa_sede").select("nome").eq("id", data.sede_id).maybeSingle()
      : Promise.resolve({ data: null }),
    db
      .from("cessao_espaco_janelas")
      .select("dia_semana, hora_inicio, hora_termino, modo, slot_minutos, rotulo")
      .eq("espaco_id", data.id),
    db
      .from("cessao_espaco_exigencias")
      .select("gatilho, de, ate, bombeiros, segurancas, observacao")
      .eq("espaco_id", data.id),
  ])

  return {
    id: String(data.id),
    nome: texto(data.nome) ?? "(sem nome)",
    descricao: texto(data.descricao),
    sedeNome: sede ? (texto(sede.nome) ?? null) : null,
    capacidade: (data.capacidade_pessoas as number | null) ?? null,
    publico: (data.publico_alvo as EspacoPublico["publico"]) ?? "qualquer",
    visita: (data.visita_tecnica as EspacoPublico["visita"]) ?? "facultativa",
    exigeTermo: data.exige_termo !== false,
    agendaPublica: data.agenda_publica !== false,
    janelas: (janelas ?? []).map((j) => ({
      dia_semana: Number(j.dia_semana),
      hora_inicio: String(j.hora_inicio ?? ""),
      hora_termino: String(j.hora_termino ?? ""),
      modo: (j.modo as ModoJanela) ?? "livre",
      slot_minutos: (j.slot_minutos as number | null) ?? null,
      rotulo: texto(j.rotulo),
    })),
    regras: (regras ?? []).map((r) => ({
      gatilho: r.gatilho as Gatilho,
      de: (r.de as number | null) ?? null,
      ate: (r.ate as number | null) ?? null,
      bombeiros: Number(r.bombeiros ?? 0),
      segurancas: Number(r.segurancas ?? 0),
      observacao: texto(r.observacao),
    })),
  }
}

/**
 * Períodos em que o espaço está ocupado: bloqueios vigentes e cessões
 * confirmadas — dele E dos espaços que compartilham ambiente. Ceder o teatro
 * ocupa o "teatro + mesas", ainda que ninguém tenha pedido esse.
 */
export async function periodosOcupados(
  espacoId: string,
  tenantId: string,
  desde: Date,
  ate: Date
): Promise<{ inicio: number; termino: number; motivo: string }[]> {
  const db = createServiceClient()
  const espacos = [espacoId, ...(await espacosIrmaos(espacoId))]

  const [{ data: bloqueios }, { data: cessoes }] = await Promise.all([
    db
      .from("cessao_espaco_bloqueios")
      .select("inicio, termino, motivo, encerrado_em, espaco_id")
      .in("espaco_id", espacos)
      .is("encerrado_em", null),
    db
      .from("cessao_solicitacoes")
      .select("inicio, termino, montagem_inicio, desmontagem_termino, situacao")
      .in("espaco_id", espacos)
      .in("situacao", ["confirmada", "em_analise", "solicitada"])
      .eq("emp_proprietaria_id", tenantId),
  ])

  const saida: { inicio: number; termino: number; motivo: string }[] = []
  const limite = ate.getTime()

  // A consulta já trouxe só os não encerrados. Um bloqueio sem término ocupa
  // até onde a janela consultada vai — é o "prazo indefinido".
  for (const b of bloqueios ?? []) {
    saida.push({
      inicio: b.inicio ? new Date(String(b.inicio)).getTime() : desde.getTime(),
      termino: b.termino ? new Date(String(b.termino)).getTime() : limite,
      motivo: "bloqueio",
    })
  }
  for (const c of cessoes ?? []) {
    const inicio = c.montagem_inicio ?? c.inicio
    const termino = c.desmontagem_termino ?? c.termino
    if (!inicio || !termino) continue
    saida.push({
      inicio: new Date(String(inicio)).getTime(),
      termino: new Date(String(termino)).getTime(),
      motivo: "cessão",
    })
  }
  return saida
}

async function espacosIrmaos(espacoId: string): Promise<string[]> {
  const db = createServiceClient()
  const { data: meus } = await db
    .from("cessao_espaco_recintos")
    .select("recinto_id")
    .eq("espaco_id", espacoId)
  const ids = [
    ...new Set(
      ((meus ?? []) as unknown as Record<string, unknown>[]).map((r) =>
        String(r.recinto_id)
      )
    ),
  ]
  if (ids.length === 0) return []
  const { data: outros } = await db
    .from("cessao_espaco_recintos")
    .select("espaco_id")
    .in("recinto_id", ids)
    .neq("espaco_id", espacoId)
  return [
    ...new Set(
      ((outros ?? []) as unknown as Record<string, unknown>[]).map((r) =>
        String(r.espaco_id)
      )
    ),
  ]
}

// ── O pedido ─────────────────────────────────────────────────────────────────

export type DadosPedido = {
  espacoId: string
  nome: string
  cpf: string | null
  email: string
  telefone: string | null
  entidade: string | null
  representanteNome: string | null
  representanteTelefone: string | null
  inicio: string
  termino: string
  montagemInicio: string | null
  desmontagemTermino: string | null
  finalidade: string
  publicoEstimado: number | null
  respostas: Omit<RespostasEvento, "publicoEstimado">
  observacoes: string | null
}

/**
 * Cria o pedido em RASCUNHO e manda o código para o e-mail. O pedido só vira
 * 'solicitada' quando o código volta certo — endereço errado não entra na fila
 * da equipe.
 */
export async function registrarPedido(
  dados: DadosPedido,
  tenantId: string
): Promise<{ erro?: string; token?: string }> {
  const espacoPorId = await espacoParaPedido(dados.espacoId, tenantId)
  if (!espacoPorId) return { erro: "Espaço não encontrado." }
  if (!EMAIL.test(dados.email)) return { erro: "Informe um e-mail válido." }
  if (!dados.nome.trim()) return { erro: "Informe seu nome." }
  if (!dados.finalidade.trim()) return { erro: "Diga para que o espaço será usado." }

  const inicio = new Date(dados.inicio).getTime()
  const termino = new Date(dados.termino).getTime()
  if (!Number.isFinite(inicio) || !Number.isFinite(termino)) {
    return { erro: "Informe a data e a hora de início e de término." }
  }
  if (termino <= inicio) return { erro: "O término tem de ser depois do início." }
  if (inicio < Date.now()) return { erro: "A data já passou." }
  if (
    espacoPorId.capacidade &&
    dados.publicoEstimado &&
    dados.publicoEstimado > espacoPorId.capacidade
  ) {
    return {
      erro: `A lotação deste espaço é de ${espacoPorId.capacidade} pessoas.`,
    }
  }

  // Choque com bloqueio ou com outra cessão — inclusive dos espaços irmãos.
  const ocupados = await periodosOcupados(
    dados.espacoId,
    tenantId,
    new Date(inicio - 86400000),
    new Date(termino + 86400000)
  )
  const meu = {
    inicio: dados.montagemInicio ? new Date(dados.montagemInicio).getTime() : inicio,
    termino: dados.desmontagemTermino
      ? new Date(dados.desmontagemTermino).getTime()
      : termino,
  }
  const choque = ocupados.find((o) => periodosChocam(meu, o))
  if (choque) {
    return {
      erro:
        choque.motivo === "bloqueio"
          ? "O espaço está bloqueado nesse período."
          : "Já há um pedido para o espaço nesse período.",
    }
  }

  const db = createServiceClient()
  const { data: criada, error } = await db
    .from("cessao_solicitacoes")
    .insert({
      espaco_id: dados.espacoId,
      emp_proprietaria_id: tenantId,
      solicitante_nome: dados.nome.trim(),
      solicitante_cpf: dados.cpf ? limparCpf(dados.cpf) : null,
      solicitante_email: dados.email.trim().toLowerCase(),
      solicitante_telefone: dados.telefone?.trim() || null,
      entidade: dados.entidade?.trim() || null,
      representante_nome: dados.representanteNome?.trim() || null,
      representante_telefone: dados.representanteTelefone?.trim() || null,
      inicio: new Date(inicio).toISOString(),
      termino: new Date(termino).toISOString(),
      montagem_inicio: dados.montagemInicio
        ? new Date(dados.montagemInicio).toISOString()
        : null,
      desmontagem_termino: dados.desmontagemTermino
        ? new Date(dados.desmontagemTermino).toISOString()
        : null,
      finalidade: dados.finalidade.trim(),
      publico_estimado: dados.publicoEstimado,
      tem_infantil: dados.respostas.infantil,
      tem_idoso: dados.respostas.idoso,
      tem_mobilidade: dados.respostas.mobilidade,
      tem_bebida: dados.respostas.bebida,
      tem_estresse: dados.respostas.estresse,
      observacoes: dados.observacoes?.trim() || null,
      situacao: "rascunho",
    })
    .select("id, token, numero")
    .single()
  if (error) {
    if (esquemaAusente(error)) return { erro: AVISO_SQL_SOLICITACOES }
    return { erro: `Não foi possível registrar o pedido: ${error.message}` }
  }

  const token = String(criada.token)
  await congelarExigencias(String(criada.id), espacoPorId.regras, {
    publicoEstimado: dados.publicoEstimado,
    ...dados.respostas,
  }, tenantId)

  const codigo = novoCodigo()
  await db
    .from("cessao_solicitacoes")
    .update({
      codigo_hash: hashCodigo(codigo, token),
      codigo_expira_em: new Date(
        Date.now() + VALIDADE_CODIGO_MIN * 60000
      ).toISOString(),
      codigo_tentativas: 0,
    })
    .eq("id", criada.id)

  await enviarCodigo(dados.email, dados.nome, codigo, espacoPorId.nome)
  return { token }
}

async function espacoParaPedido(
  id: string,
  tenantId: string
): Promise<{ nome: string; capacidade: number | null; regras: RegraExigencia[] } | null> {
  const db = createServiceClient()
  const { data } = await db
    .from("cessao_espacos")
    .select("nome, capacidade_pessoas")
    .eq("id", id)
    .eq("emp_proprietaria_id", tenantId)
    .maybeSingle()
  if (!data) return null
  const { data: regras } = await db
    .from("cessao_espaco_exigencias")
    .select("gatilho, de, ate, bombeiros, segurancas, observacao")
    .eq("espaco_id", id)
  return {
    nome: texto(data.nome) ?? "(sem nome)",
    capacidade: (data.capacidade_pessoas as number | null) ?? null,
    regras: (regras ?? []).map((r) => ({
      gatilho: r.gatilho as Gatilho,
      de: (r.de as number | null) ?? null,
      ate: (r.ate as number | null) ?? null,
      bombeiros: Number(r.bombeiros ?? 0),
      segurancas: Number(r.segurancas ?? 0),
      observacao: texto(r.observacao),
    })),
  }
}

/** A cópia que não muda quando a regra do espaço mudar. */
async function congelarExigencias(
  solicitacaoId: string,
  regras: RegraExigencia[],
  respostas: RespostasEvento,
  tenantId: string
): Promise<void> {
  const lista = calcularExigencias(regras, respostas)
  if (lista.length === 0) return
  const db = createServiceClient()
  await db.from("cessao_solicitacao_exigencias").insert(
    lista.map((e) => ({
      solicitacao_id: solicitacaoId,
      gatilho: e.gatilho,
      motivo: e.motivo,
      bombeiros: e.bombeiros,
      segurancas: e.segurancas,
      observacao: e.observacao,
      emp_proprietaria_id: tenantId,
    }))
  )
}

async function enviarCodigo(
  email: string,
  nome: string,
  codigo: string,
  espaco: string
): Promise<void> {
  await enviarEmail({
    email,
    nome,
    assunto: `Confirme seu pedido de uso — ${espaco}`,
    html:
      tituloEmail("Confirme seu pedido") +
      paragrafo(
        `Recebemos um pedido de uso do espaço <strong>${escaparHtml(espaco)}</strong> em seu nome. Digite o código abaixo na página para concluir:`
      ) +
      caixaCodigo(codigo) +
      paragrafo(
        `O código vale por ${VALIDADE_CODIGO_MIN} minutos. Enquanto ele não for digitado, o pedido não chega à nossa equipe.`
      ) +
      caixaAviso(
        "Se não foi você que pediu, ignore esta mensagem — nada será feito."
      ),
  })
}

/** Confirma o e-mail e coloca o pedido na fila da equipe. */
export async function confirmarPedido(
  token: string,
  codigo: string,
  tenantId: string
): Promise<{ erro?: string; numero?: number }> {
  const db = createServiceClient()
  const { data, error } = await db
    .from("cessao_solicitacoes")
    .select(
      "id, codigo_hash, codigo_expira_em, codigo_tentativas, email_confirmado_em, situacao, numero, espaco_id"
    )
    .eq("token", token)
    .eq("emp_proprietaria_id", tenantId)
    .maybeSingle()
  if (error || !data) return { erro: "Pedido não encontrado." }
  if (data.email_confirmado_em) return { numero: data.numero as number }
  if (!data.codigo_hash) return { erro: "Peça um novo código." }
  if ((data.codigo_tentativas ?? 0) >= MAX_TENTATIVAS) {
    return { erro: "Muitas tentativas. Peça um novo código." }
  }
  if (
    !data.codigo_expira_em ||
    new Date(String(data.codigo_expira_em)).getTime() < Date.now()
  ) {
    return { erro: "O código expirou. Peça um novo." }
  }
  const limpo = limparCpf(codigo)
  if (limpo.length !== 6 || !conferirHash(limpo, token, String(data.codigo_hash))) {
    await db
      .from("cessao_solicitacoes")
      .update({ codigo_tentativas: (data.codigo_tentativas ?? 0) + 1 })
      .eq("id", data.id)
    return { erro: "Código errado." }
  }

  const numero = await proximoNumero(tenantId)
  await db
    .from("cessao_solicitacoes")
    .update({
      email_confirmado_em: new Date().toISOString(),
      situacao: "solicitada",
      enviada_em: new Date().toISOString(),
      numero,
      codigo_hash: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", data.id)

  // Só agora a equipe fica sabendo: antes do código, o pedido não existe para
  // ninguém além de quem digitou.
  const { data: espaco } = await db
    .from("cessao_espacos")
    .select("nome")
    .eq("id", data.espaco_id)
    .maybeSingle()
  await avisarEquipeNovoPedido(
    String(data.id),
    `nº ${numero} — ${texto(espaco?.nome) ?? "espaço"}`
  )
  return { numero }
}

async function proximoNumero(tenantId: string): Promise<number> {
  const db = createServiceClient()
  const { data } = await db
    .from("cessao_solicitacoes")
    .select("numero")
    .eq("emp_proprietaria_id", tenantId)
    .not("numero", "is", null)
    .order("numero", { ascending: false })
    .limit(1)
  return Number(data?.[0]?.numero ?? 0) + 1
}

/** Reenvia o código para o mesmo e-mail do pedido. */
export async function reenviarCodigo(
  token: string,
  tenantId: string
): Promise<{ erro?: string }> {
  const db = createServiceClient()
  const { data } = await db
    .from("cessao_solicitacoes")
    .select("id, solicitante_email, solicitante_nome, email_confirmado_em, espaco_id")
    .eq("token", token)
    .eq("emp_proprietaria_id", tenantId)
    .maybeSingle()
  if (!data) return { erro: "Pedido não encontrado." }
  if (data.email_confirmado_em) return { erro: "Este pedido já foi confirmado." }

  const { data: espaco } = await db
    .from("cessao_espacos")
    .select("nome")
    .eq("id", data.espaco_id)
    .maybeSingle()

  const codigo = novoCodigo()
  await db
    .from("cessao_solicitacoes")
    .update({
      codigo_hash: hashCodigo(codigo, token),
      codigo_expira_em: new Date(
        Date.now() + VALIDADE_CODIGO_MIN * 60000
      ).toISOString(),
      codigo_tentativas: 0,
    })
    .eq("id", data.id)
  await enviarCodigo(
    String(data.solicitante_email),
    String(data.solicitante_nome ?? ""),
    codigo,
    texto(espaco?.nome) ?? "espaço"
  )
  return {}
}

/**
 * Confere o CPF contra a base de filiados — a porta dos espaços cedidos
 * "somente a filiados". Devolve o cadastro para preencher nome e e-mail.
 */
export async function filiadoPeloCpf(
  cpf: string
): Promise<{ erro?: string; nome?: string; email?: string; id?: string }> {
  const limpo = limparCpf(cpf)
  if (!validarCpf(limpo)) return { erro: "CPF inválido." }
  const filiado = await buscarFiliadoPorCpf(limpo)
  if (!filiado) {
    return { erro: "Não encontramos uma filiação com este CPF." }
  }
  if (!filiado.ativo) {
    return {
      erro: "Este espaço é cedido apenas a filiados em dia. Procure a secretaria.",
    }
  }
  return {
    id: filiado.filiacaoId,
    nome: filiado.nome_completo ?? undefined,
    email: filiado.email ?? undefined,
  }
}

/** Resumo para a tela pública mostrar antes de enviar. */
export function previaExigencias(
  regras: RegraExigencia[],
  respostas: RespostasEvento
): { lista: ExigenciaCalculada[]; bombeiros: number; segurancas: number } {
  const lista = calcularExigencias(regras, respostas)
  return { lista, ...totalExigencias(lista) }
}

/** Link da página de acompanhamento do pedido. */
export async function linkDoPedido(token: string): Promise<string> {
  return `${await origemAtual()}/espaco/pedido/${token}`
}

export const botaoPedido = botaoEmail
