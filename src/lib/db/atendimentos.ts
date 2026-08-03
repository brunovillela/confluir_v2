import "server-only"
import { tenantAtual } from "@/lib/tenant"

import {
  CHAVE_VERSAO_ATUAL,
  cifrarRelatorio,
  decifrarRelatorio,
  motivoDeAcesso,
  sigiloConfigurado,
  type AtendimentoParaAcesso,
  type MotivoAcesso,
  type PerfilClinico,
} from "@/lib/saude-sigilo"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Saúde — atendimentos, assistidos e profissionais.
 *
 * O relatório clínico NUNCA sai por aqui junto com os metadados. Ele tem
 * função própria (`lerRelatorio`), que exige perfil clínico, decide o
 * acesso e registra a leitura. Metadado (houve atendimento, quando, de quem,
 * por qual profissional) é informação de gestão; conteúdo é clínico.
 *
 * Ver lib/saude-sigilo.ts para a criptografia e as regras de acesso, e
 * supabase/saude-atendimentos.sql para o esquema.
 */

function esquemaAusente(erro: { code?: string } | null): boolean {
  return ["PGRST205", "42P01", "PGRST204", "42703"].includes(erro?.code ?? "")
}

const AVISO_SQL =
  "Atendimentos ainda não configurados — rode supabase/saude-atendimentos.sql no SQL Editor do Supabase."

// ---------------------------------------------------------------------------
// Perfil clínico do usuário logado
// ---------------------------------------------------------------------------

/**
 * Perfil que decide o acesso ao relatório: o cadastro em
 * `saude_profissionais`, se houver. Só isso — acesso clínico não deriva de
 * permissão do painel nem de ser a pessoa atendida.
 */
export async function perfilClinico(
  usuarioId: string
): Promise<PerfilClinico> {
  const admin = await createAdminClient()

  const { data } = await admin
    .from("saude_profissionais")
    .select("id,tipo_id,acesso_todos_tipos,inativo")
    .eq("usuario_id", usuarioId)
    .maybeSingle()

  const p = data as {
    id: string
    tipo_id: string | null
    acesso_todos_tipos: boolean | null
    inativo: boolean | null
  } | null

  return {
    usuarioId,
    profissional: p
      ? {
          id: p.id,
          tipoId: p.tipo_id,
          acessoTodosTipos: p.acesso_todos_tipos === true,
          inativo: p.inativo === true,
        }
      : null,
  }
}

// ---------------------------------------------------------------------------
// Atendimentos — metadados
// ---------------------------------------------------------------------------

export type AtendimentoLinha = {
  id: string
  data_atendimento: string | null
  observacao_aberta: string | null
  assistido_id: string | null
  tipo_id: string | null
  profissional_id: string | null
  atendente_id: string | null
  acompanhamento_id: string | null
  assistidoNome: string | null
  assistidoFiliadoId: string | null
  tipoNome: string | null
  profissionalNome: string | null
  /** Existe relatório? É metadado — não revela conteúdo. */
  temRelatorio: boolean
}

/**
 * Lista atendimentos com os metadados. Sem relatório, por construção: a
 * coluna nem existe nesta tabela (fica em saude_atendimentos_relatorio).
 */
export async function listarAtendimentos(filtros: {
  assistidoId?: string
  tipoId?: string
  busca?: string
}): Promise<{ linhas: AtendimentoLinha[]; disponivel: boolean }> {
  const admin = await createAdminClient()

  let q = admin
    .from("saude_atendimentos")
    .select(
      "id,data_atendimento,observacao_aberta,assistido_id,tipo_id," +
        "profissional_id,atendente_id,acompanhamento_id"
    )
    .eq("emp_proprietaria_id", await tenantAtual())
  if (filtros.assistidoId) q = q.eq("assistido_id", filtros.assistidoId)
  if (filtros.tipoId) q = q.eq("tipo_id", filtros.tipoId)

  const { data, error } = await q
    .order("data_atendimento", { ascending: false, nullsFirst: false })
    .limit(1000)

  if (error) {
    if (esquemaAusente(error)) return { linhas: [], disponivel: false }
    throw error
  }

  type Bruto = Omit<
    AtendimentoLinha,
    "assistidoNome" | "assistidoFiliadoId" | "tipoNome" | "profissionalNome" | "temRelatorio"
  >
  const brutos = (data ?? []) as unknown as Bruto[]
  if (brutos.length === 0) return { linhas: [], disponivel: true }

  const [assistidos, tipos, profissionais, comRelatorio] = await Promise.all([
    mapaAssistidos(brutos.map((a) => a.assistido_id)),
    mapaTipos(),
    mapaProfissionais(),
    idsComRelatorio(brutos.map((a) => a.id)),
  ])

  let linhas: AtendimentoLinha[] = brutos.map((a) => {
    const assistido = a.assistido_id ? assistidos.get(a.assistido_id) : null
    return {
      ...a,
      assistidoNome: assistido?.nome ?? null,
      assistidoFiliadoId: assistido?.filiadoId ?? null,
      tipoNome: a.tipo_id ? (tipos.get(a.tipo_id) ?? null) : null,
      profissionalNome: a.profissional_id
        ? (profissionais.get(a.profissional_id) ?? null)
        : null,
      temRelatorio: comRelatorio.has(a.id),
    }
  })

  // A busca cobre nome do assistido, tipo e observação ABERTA. O relatório
  // fica de fora de propósito: se fosse pesquisável, bastaria digitar um
  // termo clínico e ver quais atendimentos casam para deduzir o conteúdo
  // sem nunca abrir o campo.
  const t = filtros.busca?.trim().toLowerCase()
  if (t) {
    linhas = linhas.filter((l) =>
      [l.assistidoNome, l.tipoNome, l.profissionalNome, l.observacao_aberta]
        .filter(Boolean)
        .some((v) => v!.toLowerCase().includes(t))
    )
  }

  return { linhas, disponivel: true }
}

async function idsComRelatorio(ids: string[]): Promise<Set<string>> {
  const encontrados = new Set<string>()
  if (ids.length === 0) return encontrados
  const admin = await createAdminClient()
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await admin
      .from("saude_atendimentos_relatorio")
      .select("atendimento_id")
      .in("atendimento_id", ids.slice(i, i + 200))
    if (error) return encontrados
    for (const r of (data ?? []) as { atendimento_id: string }[]) {
      encontrados.add(r.atendimento_id)
    }
  }
  return encontrados
}

export async function buscarAtendimento(
  id: string
): Promise<AtendimentoLinha | null> {
  const { linhas } = await listarAtendimentos({})
  return linhas.find((l) => l.id === id) ?? null
}

// ---------------------------------------------------------------------------
// Registro de atendimento
// ---------------------------------------------------------------------------

export type DadosAtendimento = {
  assistido_id: string
  tipo_id: string | null
  profissional_id: string | null
  data_atendimento: string
  observacao_aberta: string | null
}

/** Tipo do apontamento gerado no prontuário do filiado. */
export const TIPO_PRONTUARIO_SAUDE = "Atendimento de saúde"

/**
 * Apontamento GENÉRICO no prontuário do filiado.
 *
 * Registra que houve atendimento e de qual especialidade — nunca o
 * conteúdo. É o rastro que a equipe de filiação enxerga; o clínico fica no
 * relatório cifrado, fora do alcance de quem lê o prontuário.
 *
 * Só acontece quando o assistido está vinculado a um filiado: atendimento a
 * não filiado não tem prontuário onde apontar, e isso é caso normal, não
 * erro.
 *
 * Idempotente por `atendimento_id`: editar o atendimento atualiza o
 * apontamento em vez de criar outro.
 */
async function registrarNoProntuario(
  atendimentoId: string,
  assistidoId: string,
  data: string
): Promise<void> {
  const admin = await createAdminClient()

  const { data: assistido } = await admin
    .from("saude_assistidos")
    .select("filiado_id")
    .eq("id", assistidoId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()

  const filiadoId = (assistido as { filiado_id: string | null } | null)
    ?.filiado_id
  if (!filiadoId) return

  // Uniforme de propósito, SEM a especialidade (decisão do Bruno,
  // 21/07/2026). Nomear o tipo revelaria à equipe de filiação qual
  // serviço a pessoa procurou — inócuo para medicina do trabalho, mas
  // sensível para psicologia ou serviço social. O prontuário registra que
  // houve atendimento; a especialidade fica no módulo de Saúde.
  const descricao = "Atendido(a) pelo serviço de saúde."

  // Não usar upsert aqui: o índice único de `atendimento_id` é PARCIAL
  // (só vale para não-nulo, porque os 13 mil apontamentos legados têm a
  // coluna nula), e o `ON CONFLICT (atendimento_id)` do PostgREST não casa
  // com índice parcial. Select → insert/update faz o mesmo efeito, e o
  // índice segue valendo como trava contra duplicata.
  const { data: existente } = await admin
    .from("filiacao_prontuario")
    .select("id")
    .eq("atendimento_id", atendimentoId)
    .maybeSingle()

  const campos = {
    filiacao_id: filiadoId,
    tipo: TIPO_PRONTUARIO_SAUDE,
    descricao,
    data,
  }

  const { error } = existente
    ? await admin
        .from("filiacao_prontuario")
        .update(campos)
        .eq("id", (existente as { id: string }).id)
    : await admin.from("filiacao_prontuario").insert({
        ...campos,
        atendimento_id: atendimentoId,
        emp_proprietaria_id: await tenantAtual(),
      })

  // Falha aqui não desfaz o atendimento: o registro clínico é o que
  // importa, e o apontamento pode ser refeito. Mas não some em silêncio.
  if (error) {
    console.error("[saude] apontamento no prontuário falhou:", error.message)
  }
}

export async function criarAtendimento(
  dados: DadosAtendimento,
  atendenteId: string
): Promise<{ id?: string; erro?: string }> {
  const admin = await createAdminClient()

  if (!dados.assistido_id) return { erro: "Escolha o assistido." }
  if (!dados.data_atendimento) return { erro: "Informe a data do atendimento." }

  const { data, error } = await admin
    .from("saude_atendimentos")
    .insert({
      assistido_id: dados.assistido_id,
      tipo_id: dados.tipo_id,
      profissional_id: dados.profissional_id,
      data_atendimento: dados.data_atendimento,
      observacao_aberta: dados.observacao_aberta?.trim() || null,
      atendente_id: atendenteId,
      emp_proprietaria_id: await tenantAtual(),
    })
    .select("id")
    .single()

  if (error) return { erro: esquemaAusente(error) ? AVISO_SQL : error.message }

  const id = (data as { id: string }).id
  await registrarNoProntuario(id, dados.assistido_id, dados.data_atendimento)
  return { id }
}

export async function atualizarAtendimento(
  id: string,
  dados: DadosAtendimento
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()

  const { data: alteradas, error } = await admin
    .from("saude_atendimentos")
    .update({
      assistido_id: dados.assistido_id,
      tipo_id: dados.tipo_id,
      profissional_id: dados.profissional_id,
      data_atendimento: dados.data_atendimento,
      observacao_aberta: dados.observacao_aberta?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
    .select("id")

  if (error) return { erro: esquemaAusente(error) ? AVISO_SQL : error.message }
  if ((alteradas ?? []).length === 0) return { erro: "Atendimento não encontrado." }

  await registrarNoProntuario(id, dados.assistido_id, dados.data_atendimento)
  return {}
}

// ---------------------------------------------------------------------------
// Relatório clínico — o caminho restrito
// ---------------------------------------------------------------------------

export type ResultadoRelatorio =
  | { situacao: "sem_relatorio" }
  | { situacao: "sem_chave" }
  | { situacao: "negado" }
  | { situacao: "ilegivel" }
  | { situacao: "ok"; texto: string; motivo: MotivoAcesso }

/**
 * Lê o relatório clínico. Único caminho para o conteúdo.
 *
 * Toda tentativa — concedida ou negada — vai para a trilha de auditoria.
 * O registro do acesso é feito ANTES de devolver o texto: se a gravação do
 * log falhar, a leitura falha junto. Um relatório lido sem rastro é
 * exatamente o que este módulo existe para impedir.
 */
export async function lerRelatorio(
  atendimentoId: string,
  perfil: PerfilClinico,
  atendimento: AtendimentoParaAcesso
): Promise<ResultadoRelatorio> {
  const motivo = motivoDeAcesso(perfil, atendimento)

  if (!motivo) {
    await registrarAcesso(atendimentoId, perfil.usuarioId, "negado", null)
    return { situacao: "negado" }
  }
  if (!sigiloConfigurado()) return { situacao: "sem_chave" }

  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("saude_atendimentos_relatorio")
    .select("relatorio_cifrado")
    .eq("atendimento_id", atendimentoId)
    .maybeSingle()

  if (error || !data) return { situacao: "sem_relatorio" }

  const texto = decifrarRelatorio(
    (data as { relatorio_cifrado: string }).relatorio_cifrado,
    atendimentoId
  )
  if (texto === null) return { situacao: "ilegivel" }

  await registrarAcesso(atendimentoId, perfil.usuarioId, "leitura", motivo)
  return { situacao: "ok", texto, motivo }
}

/** Grava (ou substitui) o relatório, sempre cifrado. */
export async function gravarRelatorio(
  atendimentoId: string,
  texto: string,
  perfil: PerfilClinico,
  atendimento: AtendimentoParaAcesso
): Promise<{ erro?: string }> {
  const motivo = motivoDeAcesso(perfil, atendimento)
  if (!motivo) {
    await registrarAcesso(atendimentoId, perfil.usuarioId, "negado", null)
    return { erro: "Sem permissão para escrever o relatório deste atendimento." }
  }
  if (!sigiloConfigurado()) {
    return {
      erro:
        "SAUDE_RELATORIO_CHAVE não configurada — o relatório não pode ser gravado com sigilo.",
    }
  }

  const admin = await createAdminClient()
  const limpo = texto.trim()

  if (!limpo) {
    const { error } = await admin
      .from("saude_atendimentos_relatorio")
      .delete()
      .eq("atendimento_id", atendimentoId)
    if (error) return { erro: esquemaAusente(error) ? AVISO_SQL : error.message }
    await registrarAcesso(atendimentoId, perfil.usuarioId, "gravacao", motivo)
    return {}
  }

  const { error } = await admin.from("saude_atendimentos_relatorio").upsert(
    {
      atendimento_id: atendimentoId,
      relatorio_cifrado: cifrarRelatorio(limpo, atendimentoId),
      chave_versao: CHAVE_VERSAO_ATUAL,
      autor_profissional_id: perfil.profissional?.id ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "atendimento_id" }
  )
  if (error) return { erro: esquemaAusente(error) ? AVISO_SQL : error.message }

  await registrarAcesso(atendimentoId, perfil.usuarioId, "gravacao", motivo)
  return {}
}

/** Trilha de auditoria — só INSERT, nunca update nem delete. */
export async function registrarAcesso(
  atendimentoId: string,
  usuarioId: string,
  acao: "leitura" | "gravacao" | "negado",
  motivo: MotivoAcesso | null
): Promise<void> {
  const admin = await createAdminClient()
  await admin.from("saude_atendimentos_acessos").insert({
    atendimento_id: atendimentoId,
    usuario_id: usuarioId,
    acao,
    motivo,
  })
}

export type AcessoRegistrado = {
  id: string
  usuario_id: string | null
  acao: string
  motivo: string | null
  criado_em: string
  usuarioNome: string | null
}

/** Histórico de acessos de um atendimento. */
export async function acessosDoAtendimento(
  atendimentoId: string
): Promise<AcessoRegistrado[]> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("saude_atendimentos_acessos")
    .select("id,usuario_id,acao,motivo,criado_em")
    .eq("atendimento_id", atendimentoId)
    .order("criado_em", { ascending: false })
    .limit(200)
  if (error) return []

  const brutos = (data ?? []) as Omit<AcessoRegistrado, "usuarioNome">[]
  const ids = [...new Set(brutos.map((a) => a.usuario_id).filter(Boolean))]
  const nomes = new Map<string, string>()
  if (ids.length > 0) {
    const { data: us } = await admin
      .from("usuarios")
      .select("id,nome_completo")
      .in("id", ids as string[])
    for (const u of (us ?? []) as { id: string; nome_completo: string | null }[]) {
      if (u.nome_completo) nomes.set(u.id, u.nome_completo)
    }
  }
  return brutos.map((a) => ({
    ...a,
    usuarioNome: a.usuario_id ? (nomes.get(a.usuario_id) ?? null) : null,
  }))
}

// ---------------------------------------------------------------------------
// Apoio: assistidos, tipos e profissionais
// ---------------------------------------------------------------------------

async function mapaAssistidos(
  ids: (string | null)[]
): Promise<Map<string, { nome: string | null; filiadoId: string | null }>> {
  const mapa = new Map<string, { nome: string | null; filiadoId: string | null }>()
  const limpos = [...new Set(ids.filter((v): v is string => Boolean(v)))]
  if (limpos.length === 0) return mapa
  const admin = await createAdminClient()
  for (let i = 0; i < limpos.length; i += 200) {
    const { data } = await admin
      .from("saude_assistidos")
      .select("id,nome,filiado_id")
      .in("id", limpos.slice(i, i + 200))
    for (const a of (data ?? []) as {
      id: string
      nome: string | null
      filiado_id: string | null
    }[]) {
      mapa.set(a.id, { nome: a.nome, filiadoId: a.filiado_id })
    }
  }
  return mapa
}

async function mapaTipos(): Promise<Map<string, string>> {
  const mapa = new Map<string, string>()
  const admin = await createAdminClient()
  const { data } = await admin
    .from("saude_atendimentos_tipos")
    .select("id,nome")
    .eq("emp_proprietaria_id", await tenantAtual())
  for (const t of (data ?? []) as { id: string; nome: string | null }[]) {
    if (t.nome) mapa.set(t.id, t.nome)
  }
  return mapa
}

async function mapaProfissionais(): Promise<Map<string, string>> {
  const mapa = new Map<string, string>()
  const admin = await createAdminClient()
  const { data } = await admin
    .from("saude_profissionais")
    .select("id,usuario_id,profissao")
    .eq("emp_proprietaria_id", await tenantAtual())
  const brutos = (data ?? []) as {
    id: string
    usuario_id: string | null
    profissao: string | null
  }[]
  const ids = [...new Set(brutos.map((p) => p.usuario_id).filter(Boolean))]
  const nomes = new Map<string, string>()
  if (ids.length > 0) {
    const { data: us } = await admin
      .from("usuarios")
      .select("id,nome_completo")
      .in("id", ids as string[])
    for (const u of (us ?? []) as { id: string; nome_completo: string | null }[]) {
      if (u.nome_completo) nomes.set(u.id, u.nome_completo)
    }
  }
  for (const p of brutos) {
    const nome = p.usuario_id ? nomes.get(p.usuario_id) : null
    mapa.set(p.id, nome ?? p.profissao ?? "Profissional")
  }
  return mapa
}

/**
 * Contagens das áreas de atendimento, para os cards do painel de Saúde.
 *
 * Devolve `null` por área cujo esquema ainda não existe — o card mostra
 * "Configurar" em vez de "0 registros", que seria mentira.
 */
export async function contagensAtendimento(): Promise<{
  atendimentos: number | null
  assistidos: number | null
  agendamentos: number | null
  profissionais: number | null
  cipa: number | null
}> {
  const admin = await createAdminClient()
  const contar = async (tabela: string): Promise<number | null> => {
    // GET com count, não head: em tabela ausente o HEAD volta sem corpo e
    // perde o PGRST205, então a degradação não seria detectada.
    const { count, error } = await admin
      .from(tabela)
      .select("id", { count: "exact" })
      .limit(1)
    if (error) return null
    return count ?? 0
  }

  const [atendimentos, assistidos, agendamentos, profissionais, cipa] =
    await Promise.all([
      contar("saude_atendimentos"),
      contar("saude_assistidos"),
      contar("saude_agenda_atendimentos"),
      contar("saude_profissionais"),
      contar("saude_cipa_agenda"),
    ])

  return { atendimentos, assistidos, agendamentos, profissionais, cipa }
}

// ---------------------------------------------------------------------------
// Agenda
// ---------------------------------------------------------------------------

export type AgendamentoSaude = {
  id: string
  inicio: string | null
  termino: string | null
  online: boolean
  assistido_id: string | null
  profissional_id: string | null
  assistidoNome: string | null
  profissionalNome: string | null
  /** Já existe atendimento registrado para este assistido nesta data? */
  atendido: boolean
}

export async function listarAgenda(filtros: {
  de?: string
  ate?: string
}): Promise<{ linhas: AgendamentoSaude[]; disponivel: boolean }> {
  const admin = await createAdminClient()

  let q = admin
    .from("saude_agenda_atendimentos")
    .select("id,inicio,termino,online,assistido_id,profissional_id")
    .eq("emp_proprietaria_id", await tenantAtual())
  if (filtros.de) q = q.gte("inicio", filtros.de)
  if (filtros.ate) q = q.lte("inicio", filtros.ate)

  const { data, error } = await q.order("inicio", { nullsFirst: false }).limit(500)
  if (error) {
    if (esquemaAusente(error)) return { linhas: [], disponivel: false }
    throw error
  }

  type Bruto = Omit<
    AgendamentoSaude,
    "assistidoNome" | "profissionalNome" | "atendido"
  >
  const brutos = (data ?? []) as unknown as Bruto[]
  if (brutos.length === 0) return { linhas: [], disponivel: true }

  const [assistidos, profissionais] = await Promise.all([
    mapaAssistidos(brutos.map((a) => a.assistido_id)),
    mapaProfissionais(),
  ])

  // Marca quem já foi atendido na data agendada — evita que a equipe cobre
  // comparecimento de quem já compareceu.
  const { data: ats } = await admin
    .from("saude_atendimentos")
    .select("assistido_id,data_atendimento")
    .eq("emp_proprietaria_id", await tenantAtual())
  const feitos = new Set(
    ((ats ?? []) as { assistido_id: string | null; data_atendimento: string | null }[])
      .filter((a) => a.assistido_id && a.data_atendimento)
      .map((a) => `${a.assistido_id}|${a.data_atendimento}`)
  )

  return {
    linhas: brutos.map((a) => ({
      ...a,
      online: a.online === true,
      assistidoNome: a.assistido_id
        ? (assistidos.get(a.assistido_id)?.nome ?? null)
        : null,
      profissionalNome: a.profissional_id
        ? (profissionais.get(a.profissional_id) ?? null)
        : null,
      atendido:
        !!a.assistido_id && !!a.inicio && feitos.has(`${a.assistido_id}|${a.inicio}`),
    })),
    disponivel: true,
  }
}

export type DadosAgendamento = {
  assistido_id: string
  profissional_id: string | null
  inicio: string
  termino: string | null
  online: boolean
}

export async function salvarAgendamento(
  dados: DadosAgendamento,
  id?: string
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  if (!dados.assistido_id) return { erro: "Escolha o assistido." }
  if (!dados.inicio) return { erro: "Informe a data." }
  if (dados.termino && dados.termino < dados.inicio) {
    return { erro: "O término não pode ser anterior ao início." }
  }

  const registro = {
    assistido_id: dados.assistido_id,
    profissional_id: dados.profissional_id,
    inicio: dados.inicio,
    termino: dados.termino,
    online: dados.online,
    updated_at: new Date().toISOString(),
  }

  const { error } = id
    ? await admin
        .from("saude_agenda_atendimentos")
        .update(registro)
        .eq("id", id)
        .eq("emp_proprietaria_id", await tenantAtual())
    : await admin
        .from("saude_agenda_atendimentos")
        .insert({ ...registro, emp_proprietaria_id: await tenantAtual() })

  if (error) return { erro: esquemaAusente(error) ? AVISO_SQL : error.message }
  return {}
}

export async function excluirAgendamento(
  id: string
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin
    .from("saude_agenda_atendimentos")
    .delete()
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: esquemaAusente(error) ? AVISO_SQL : error.message }
  return {}
}

// ---------------------------------------------------------------------------
// Área do filiado — o que a pessoa atendida vê sobre si
// ---------------------------------------------------------------------------

export type MeuAtendimento = {
  id: string
  data_atendimento: string | null
  observacao_aberta: string | null
  tipoNome: string | null
  profissionalNome: string | null
}

/**
 * Histórico do próprio filiado para o /portal.
 *
 * Devolve APENAS a observação aberta. Esta função não consulta
 * `saude_atendimentos_relatorio` em nenhuma hipótese — o relatório clínico
 * fica sob guarda profissional e não tem caminho até aqui. É por isso que
 * ela vive separada de `listarAtendimentos`, em vez de ganhar um parâmetro:
 * um `select` a mais numa função compartilhada bastaria para vazar.
 *
 * Recebe os ids de filiação já resolvidos pelo chamador (a sessão do portal
 * identifica o filiado pelo CPF), e devolve vazio se não vier nenhum — sem
 * filiação não há histórico próprio a mostrar.
 */
export async function meusAtendimentos(
  filiadoIds: string[]
): Promise<{ linhas: MeuAtendimento[]; disponivel: boolean }> {
  if (filiadoIds.length === 0) return { linhas: [], disponivel: true }

  const admin = await createAdminClient()

  const { data: assistidos, error: erroAssistidos } = await admin
    .from("saude_assistidos")
    .select("id")
    .in("filiado_id", filiadoIds)

  if (erroAssistidos) {
    if (esquemaAusente(erroAssistidos)) return { linhas: [], disponivel: false }
    throw erroAssistidos
  }

  const ids = ((assistidos ?? []) as { id: string }[]).map((a) => a.id)
  if (ids.length === 0) return { linhas: [], disponivel: true }

  const { data, error } = await admin
    .from("saude_atendimentos")
    .select("id,data_atendimento,observacao_aberta,tipo_id,profissional_id")
    .in("assistido_id", ids)
    .order("data_atendimento", { ascending: false, nullsFirst: false })
    .limit(500)

  if (error) {
    if (esquemaAusente(error)) return { linhas: [], disponivel: false }
    throw error
  }

  const brutos = (data ?? []) as unknown as {
    id: string
    data_atendimento: string | null
    observacao_aberta: string | null
    tipo_id: string | null
    profissional_id: string | null
  }[]
  const [tipos, profissionais] = await Promise.all([
    mapaTipos(),
    mapaProfissionais(),
  ])

  return {
    linhas: brutos.map((a) => ({
      id: a.id,
      data_atendimento: a.data_atendimento,
      observacao_aberta: a.observacao_aberta,
      tipoNome: a.tipo_id ? (tipos.get(a.tipo_id) ?? null) : null,
      profissionalNome: a.profissional_id
        ? (profissionais.get(a.profissional_id) ?? null)
        : null,
    })),
    disponivel: true,
  }
}

// ---------------------------------------------------------------------------
// Assistidos
// ---------------------------------------------------------------------------

export type Assistido = {
  id: string
  nome: string | null
  observacoes: string | null
  filiado_id: string | null
  empresa_id: string | null
  retencao_ate: string | null
  retencao_regime: string | null
  retencao_observacao: string | null
  exposicao_cancerigeno_quimico: boolean
  exposicao_radiacao_ionizante: boolean
  /** Preenchido quando o cadastro do filiado foi anonimizado. */
  nome_retido_cifrado: string | null
  filiadoNome: string | null
  filiadoCpf: string | null
  filiadoCondicao: string | null
  atendimentos: number
}

const CAMPOS_ASSISTIDO =
  "id,nome,observacoes,filiado_id,empresa_id,retencao_ate,retencao_regime," +
  "retencao_observacao,exposicao_cancerigeno_quimico," +
  "exposicao_radiacao_ionizante,nome_retido_cifrado"

export async function listarAssistidos(busca?: string): Promise<{
  linhas: Assistido[]
  disponivel: boolean
}> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("saude_assistidos")
    .select(CAMPOS_ASSISTIDO)
    .eq("emp_proprietaria_id", await tenantAtual())
    .order("nome")
    .limit(1000)

  if (error) {
    if (esquemaAusente(error)) return { linhas: [], disponivel: false }
    throw error
  }

  type Bruto = Omit<
    Assistido,
    "filiadoNome" | "filiadoCpf" | "filiadoCondicao" | "atendimentos"
  >
  const brutos = (data ?? []) as unknown as Bruto[]
  if (brutos.length === 0) return { linhas: [], disponivel: true }

  // Dados do filiado vêm do cadastro. Quando ele foi anonimizado, não há
  // mais nome lá — e o nome próprio do acervo de saúde fica cifrado, só
  // legível por profissional. Aqui a lista mostra o que o cadastro tem.
  const filiadoIds = [
    ...new Set(brutos.map((a) => a.filiado_id).filter(Boolean)),
  ] as string[]
  const filiados = new Map<
    string,
    { nome: string | null; cpf: string | null; condicao: string | null }
  >()
  for (let i = 0; i < filiadoIds.length; i += 200) {
    const { data: fs } = await admin
      .from("filiacoes")
      .select("id,nome_completo,cpf,filiacao_condicao")
      .in("id", filiadoIds.slice(i, i + 200))
    for (const f of (fs ?? []) as {
      id: string
      nome_completo: string | null
      cpf: string | null
      filiacao_condicao: string | null
    }[]) {
      filiados.set(f.id, {
        nome: f.nome_completo,
        cpf: f.cpf,
        condicao: f.filiacao_condicao,
      })
    }
  }

  const { data: ats } = await admin
    .from("saude_atendimentos")
    .select("assistido_id")
    .eq("emp_proprietaria_id", await tenantAtual())
  const contagem = new Map<string, number>()
  for (const a of (ats ?? []) as { assistido_id: string | null }[]) {
    if (a.assistido_id) {
      contagem.set(a.assistido_id, (contagem.get(a.assistido_id) ?? 0) + 1)
    }
  }

  let linhas: Assistido[] = brutos.map((a) => {
    const f = a.filiado_id ? filiados.get(a.filiado_id) : null
    return {
      ...a,
      exposicao_cancerigeno_quimico: a.exposicao_cancerigeno_quimico === true,
      exposicao_radiacao_ionizante: a.exposicao_radiacao_ionizante === true,
      filiadoNome: f?.nome ?? null,
      filiadoCpf: f?.cpf ?? null,
      filiadoCondicao: f?.condicao ?? null,
      atendimentos: contagem.get(a.id) ?? 0,
    }
  })

  const t = busca?.trim().toLowerCase()
  if (t) {
    const digitos = t.replace(/\D/g, "")
    linhas = linhas.filter(
      (l) =>
        (l.nome ?? "").toLowerCase().includes(t) ||
        (l.filiadoNome ?? "").toLowerCase().includes(t) ||
        (digitos.length >= 3 && (l.filiadoCpf ?? "").includes(digitos))
    )
  }

  return { linhas, disponivel: true }
}

export async function buscarAssistido(id: string): Promise<Assistido | null> {
  const { linhas } = await listarAssistidos()
  return linhas.find((a) => a.id === id) ?? null
}

export type DadosAssistido = {
  nome: string
  filiado_id: string | null
  observacoes: string | null
  retencao_ate: string | null
  retencao_regime: string | null
  retencao_observacao: string | null
  exposicao_cancerigeno_quimico: boolean
  exposicao_radiacao_ionizante: boolean
}

export async function salvarAssistido(
  dados: DadosAssistido,
  id?: string
): Promise<{ id?: string; erro?: string }> {
  const admin = await createAdminClient()
  if (!dados.nome.trim()) return { erro: "Informe o nome do assistido." }

  // Um assistido por filiado: dois cadastros partiriam o histórico clínico
  // da mesma pessoa em dois lugares, e o prazo de guarda ficaria em um só.
  if (dados.filiado_id) {
    const { data: existentes } = await admin
      .from("saude_assistidos")
      .select("id,nome")
      .eq("filiado_id", dados.filiado_id)
    const conflito = ((existentes ?? []) as { id: string; nome: string | null }[])
      .find((a) => a.id !== id)
    if (conflito) {
      return {
        erro: `Este filiado já está cadastrado como assistido (“${conflito.nome ?? "sem nome"}”).`,
      }
    }
  }

  const registro = {
    nome: dados.nome.trim(),
    filiado_id: dados.filiado_id || null,
    observacoes: dados.observacoes?.trim() || null,
    retencao_ate: dados.retencao_ate || null,
    retencao_regime: dados.retencao_regime?.trim() || null,
    retencao_observacao: dados.retencao_observacao?.trim() || null,
    exposicao_cancerigeno_quimico: dados.exposicao_cancerigeno_quimico,
    exposicao_radiacao_ionizante: dados.exposicao_radiacao_ionizante,
    updated_at: new Date().toISOString(),
  }

  if (id) {
    const { error } = await admin
      .from("saude_assistidos")
      .update(registro)
      .eq("id", id)
      .eq("emp_proprietaria_id", await tenantAtual())
    if (error) return { erro: esquemaAusente(error) ? AVISO_SQL : error.message }
    return { id }
  }

  const { data, error } = await admin
    .from("saude_assistidos")
    .insert({ ...registro, emp_proprietaria_id: await tenantAtual() })
    .select("id")
    .single()
  if (error) return { erro: esquemaAusente(error) ? AVISO_SQL : error.message }
  return { id: (data as { id: string }).id }
}

/**
 * Prazo de guarda sugerido, conforme a NR-07 (item 7.6.1.1 e Anexo V).
 *
 * Regras confirmadas com o Bruno em 21/07/2026:
 *  • filiado sem vínculo empregatício com o sindicato: conta da DATA DE
 *    REGISTRO, +20 anos;
 *  • empregado do sindicato: conta do desligamento (contrato_demissao);
 *  • exposição a cancerígeno químico ou radiação ionizante dobra para 40.
 *
 * É SUGESTÃO: a norma diz "no mínimo", e benzeno, CNEN, amianto e a camada
 * previdenciária esticam além. Por isso o valor é editável e o campo
 * `retencao_regime` tira o registro do descarte automático.
 */
export function sugerirRetencao(
  inicio: string | null,
  exposicaoEstendida: boolean
): string | null {
  if (!inicio) return null
  const d = new Date(`${inicio}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return null
  d.setUTCFullYear(d.getUTCFullYear() + (exposicaoEstendida ? 40 : 20))
  return d.toISOString().slice(0, 10)
}

// ---------------------------------------------------------------------------
// Tipos de atendimento
// ---------------------------------------------------------------------------

export type TipoAtendimento = {
  id: string
  nome: string | null
  /** Quantos profissionais e atendimentos dependem deste tipo. */
  profissionais?: number
  atendimentos?: number
}

export async function listarTiposAtendimento(comUso = false): Promise<{
  tipos: TipoAtendimento[]
  disponivel: boolean
}> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("saude_atendimentos_tipos")
    .select("id,nome")
    .eq("emp_proprietaria_id", await tenantAtual())
    .order("nome")
  if (error) {
    if (esquemaAusente(error)) return { tipos: [], disponivel: false }
    throw error
  }

  const tipos = (data ?? []) as TipoAtendimento[]
  if (!comUso || tipos.length === 0) return { tipos, disponivel: true }

  const [profs, atends] = await Promise.all([
    admin.from("saude_profissionais").select("tipo_id"),
    admin.from("saude_atendimentos").select("tipo_id"),
  ])
  const conta = (linhas: { tipo_id: string | null }[] | null) => {
    const m = new Map<string, number>()
    for (const l of linhas ?? []) {
      if (l.tipo_id) m.set(l.tipo_id, (m.get(l.tipo_id) ?? 0) + 1)
    }
    return m
  }
  const cp = conta(profs.data as { tipo_id: string | null }[] | null)
  const ca = conta(atends.data as { tipo_id: string | null }[] | null)

  return {
    tipos: tipos.map((t) => ({
      ...t,
      profissionais: cp.get(t.id) ?? 0,
      atendimentos: ca.get(t.id) ?? 0,
    })),
    disponivel: true,
  }
}

export async function salvarTipoAtendimento(
  nome: string,
  id?: string
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const limpo = nome.trim()
  if (!limpo) return { erro: "Informe o nome do tipo." }

  // Nome único: o tipo é a chave do controle de acesso ao relatório, então
  // dois tipos com o mesmo nome viram confusão sobre quem lê o quê.
  const { data: iguais } = await admin
    .from("saude_atendimentos_tipos")
    .select("id,nome")
    .eq("emp_proprietaria_id", await tenantAtual())
  const conflito = ((iguais ?? []) as { id: string; nome: string | null }[]).find(
    (t) => t.id !== id && (t.nome ?? "").trim().toLowerCase() === limpo.toLowerCase()
  )
  if (conflito) return { erro: `Já existe um tipo chamado “${conflito.nome}”.` }

  const { error } = id
    ? await admin
        .from("saude_atendimentos_tipos")
        .update({ nome: limpo, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("emp_proprietaria_id", await tenantAtual())
    : await admin.from("saude_atendimentos_tipos").insert({
        nome: limpo,
        emp_proprietaria_id: await tenantAtual(),
      })

  if (error) return { erro: esquemaAusente(error) ? AVISO_SQL : error.message }
  return {}
}

export async function excluirTipoAtendimento(
  id: string
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()

  // Excluir tipo em uso deixaria profissionais sem habilitação e
  // atendimentos sem classificação — e o tipo é justamente o que decide
  // quem lê o relatório.
  const [{ count: profs }, { count: atends }] = await Promise.all([
    admin
      .from("saude_profissionais")
      .select("id", { count: "exact", head: true })
      .eq("tipo_id", id),
    admin
      .from("saude_atendimentos")
      .select("id", { count: "exact", head: true })
      .eq("tipo_id", id),
  ])
  if ((profs ?? 0) > 0 || (atends ?? 0) > 0) {
    return {
      erro: `Tipo em uso (${profs ?? 0} profissional(is), ${atends ?? 0} atendimento(s)). Renomeie em vez de excluir.`,
    }
  }

  const { error } = await admin
    .from("saude_atendimentos_tipos")
    .delete()
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: esquemaAusente(error) ? AVISO_SQL : error.message }
  return {}
}

// ---------------------------------------------------------------------------
// Profissionais
// ---------------------------------------------------------------------------

export type Profissional = {
  id: string
  usuario_id: string | null
  profissao: string | null
  conselho_classe: string | null
  registro_conselho: string | null
  tipo_id: string | null
  acesso_todos_tipos: boolean
  inativo: boolean
  usuarioNome: string | null
  tipoNome: string | null
}

export async function listarProfissionais(): Promise<{
  linhas: Profissional[]
  disponivel: boolean
}> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("saude_profissionais")
    .select(
      "id,usuario_id,profissao,conselho_classe,registro_conselho,tipo_id," +
        "acesso_todos_tipos,inativo"
    )
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) {
    if (esquemaAusente(error)) return { linhas: [], disponivel: false }
    throw error
  }

  const brutos = (data ?? []) as unknown as Omit<
    Profissional,
    "usuarioNome" | "tipoNome"
  >[]
  const tipos = await mapaTipos()
  const nomes = new Map<string, string>()
  const ids = [...new Set(brutos.map((p) => p.usuario_id).filter(Boolean))]
  if (ids.length > 0) {
    const { data: us } = await admin
      .from("usuarios")
      .select("id,nome_completo")
      .in("id", ids as string[])
    for (const u of (us ?? []) as { id: string; nome_completo: string | null }[]) {
      if (u.nome_completo) nomes.set(u.id, u.nome_completo)
    }
  }

  return {
    linhas: brutos
      .map((p) => ({
        ...p,
        acesso_todos_tipos: p.acesso_todos_tipos === true,
        inativo: p.inativo === true,
        usuarioNome: p.usuario_id ? (nomes.get(p.usuario_id) ?? null) : null,
        tipoNome: p.tipo_id ? (tipos.get(p.tipo_id) ?? null) : null,
      }))
      .sort((a, b) =>
        (a.usuarioNome ?? "").localeCompare(b.usuarioNome ?? "", "pt-BR")
      ),
    disponivel: true,
  }
}

export async function buscarProfissional(
  id: string
): Promise<Profissional | null> {
  const { linhas } = await listarProfissionais()
  return linhas.find((p) => p.id === id) ?? null
}

export type DadosProfissional = {
  usuario_id: string
  profissao: string
  conselho_classe: string | null
  registro_conselho: string | null
  tipo_id: string | null
  acesso_todos_tipos: boolean
  inativo: boolean
}

export async function salvarProfissional(
  dados: DadosProfissional,
  id?: string
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()

  if (!dados.usuario_id) return { erro: "Escolha o usuário." }
  if (!dados.profissao.trim()) return { erro: "Informe a profissão." }

  // Um cadastro por usuário: dois cadastros com tipos diferentes fariam a
  // mesma pessoa ler relatórios de duas especialidades sem que isso
  // estivesse declarado em lugar nenhum.
  const { data: existentes } = await admin
    .from("saude_profissionais")
    .select("id")
    .eq("usuario_id", dados.usuario_id)
  const conflito = ((existentes ?? []) as { id: string }[]).find(
    (p) => p.id !== id
  )
  if (conflito) {
    return { erro: "Esta pessoa já tem cadastro de profissional." }
  }

  const registro = {
    usuario_id: dados.usuario_id,
    profissao: dados.profissao.trim(),
    conselho_classe: dados.conselho_classe?.trim() || null,
    registro_conselho: dados.registro_conselho?.trim() || null,
    tipo_id: dados.tipo_id || null,
    acesso_todos_tipos: dados.acesso_todos_tipos,
    inativo: dados.inativo,
  }

  const { error } = id
    ? await admin
        .from("saude_profissionais")
        .update(registro)
        .eq("id", id)
        .eq("emp_proprietaria_id", await tenantAtual())
    : await admin
        .from("saude_profissionais")
        .insert({ ...registro, emp_proprietaria_id: await tenantAtual() })

  if (error) return { erro: esquemaAusente(error) ? AVISO_SQL : error.message }
  return {}
}

/** Funcionários ativos, para o select de vínculo do profissional. */
export async function usuariosParaProfissional(): Promise<
  { id: string; nome: string }[]
> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("usuarios")
    .select("id,nome_completo,inativo,deletado")
    .order("nome_completo")
    .limit(2000)
  return ((data ?? []) as {
    id: string
    nome_completo: string | null
    inativo: boolean | null
    deletado: boolean | null
  }[])
    .filter((u) => u.inativo !== true && u.deletado !== true && u.nome_completo)
    .map((u) => ({ id: u.id, nome: u.nome_completo! }))
}
