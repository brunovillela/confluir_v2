import "server-only"

import { createHash, randomBytes } from "node:crypto"

import { normalizarConfig, valor, type ConfigCongresso } from "@/lib/congressos/config"
import {
  conferirLinhas,
  type LinhaConferida,
  type LinhaImportada,
} from "@/lib/congressos/importacao"
import {
  inscricaoAberta,
  normalizarDireitos,
  resumoDireitos,
  situacaoNaInscricao,
  vagasDaBase,
  type CategoriaPapel,
  type Direitos,
} from "@/lib/congressos/regras"
import { grafiasDoCpf, validarCpf } from "@/lib/cpf"
import {
  adicionarParticipante,
  listarPapeis,
  listarParticipantes,
  listarUnidades,
  registrarHistorico,
  type Congresso,
} from "@/lib/db/congressos"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"
import { semAcento } from "@/lib/texto"

/**
 * Congressos — inscrição pública, link pessoal e importação de listas.
 *
 * O lado PÚBLICO usa service role de propósito (quem se inscreve não tem
 * conta) e recebe `tenantId` EXPLÍCITO, vindo do subdomínio, como em Eventos.
 * O link pessoal guarda só o HASH do token: quem tem o link age como a pessoa,
 * então gerar outro invalida o anterior.
 */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

function novoToken(): string {
  return randomBytes(24).toString("base64url")
}

const t = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null)

// ── Gestão: link pessoal e página pública ────────────────────────────────────

/** Gera (ou troca) o link pessoal. Devolve o token em claro uma única vez. */
export async function gerarLinkPessoal(
  congressoId: string,
  participanteId: string,
  autorId: string
): Promise<{ token?: string; erro?: string }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const token = novoToken()
  const { data, error } = await admin
    .from("congresso_participantes")
    .update({ token_hash: hashToken(token), token_gerado_em: new Date().toISOString() })
    .eq("emp_proprietaria_id", emp)
    .eq("congresso_id", congressoId)
    .eq("id", participanteId)
    .select("id")
    .maybeSingle()
  if (error || !data) return { erro: error?.message ?? "Participante não encontrado." }
  await registrarHistorico(congressoId, participanteId, "link_pessoal", { acao: "gerado" }, autorId)
  return { token }
}

export async function salvarPaginaPublica(
  c: Congresso,
  slug: string,
  aberta: boolean
): Promise<{ erro?: string }> {
  if (aberta && !slug) return { erro: "Defina o endereço da página antes de abrir a inscrição." }
  if (slug === "eu") return { erro: "Esse endereço é reservado. Escolha outro." }
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { error } = await admin
    .from("congressos")
    .update({ slug: slug || null, inscricao_publica: aberta, updated_at: new Date().toISOString() })
    .eq("emp_proprietaria_id", emp)
    .eq("id", c.id)
  if (error) return { erro: error.code === "23505" ? "Esse endereço já é usado por outro congresso." : error.message }
  return {}
}

// ── Público ──────────────────────────────────────────────────────────────────

export type CongressoPublico = {
  id: string
  nome: string
  edicao: number | null
  tema: string | null
  inicio: string | null
  termino: string | null
  local: string | null
  config: ConfigCongresso
  aberta: boolean
  motivoFechada?: string
  papeis: { id: string; nome: string; resumo: string }[]
  unidades: { id: string; nome: string }[]
  rotuloUnidade: string
}

const ROTULO_TIPO_UNIDADE: Record<string, string> = {
  base: "Base",
  entidade: "Entidade",
  segmento: "Segmento",
  ramo: "Ramo",
  delegacao: "Delegação",
}

export async function congressoPublico(slug: string, tenantId: string): Promise<CongressoPublico | null> {
  const admin = await createAdminClient()
  const { data: c } = await admin
    .from("congressos")
    .select("id, nome, edicao, tema, situacao, config, evento_id, inscricao_publica")
    .eq("emp_proprietaria_id", tenantId)
    .eq("slug", slug)
    .maybeSingle()
  if (!c) return null
  const [ev, papeis, unidades] = await Promise.all([
    c.evento_id
      ? admin.from("eventos").select("inicio, termino, local").eq("emp_proprietaria_id", tenantId).eq("id", c.evento_id).maybeSingle()
      : Promise.resolve({ data: null }),
    admin
      .from("congresso_papeis")
      .select("id, nome, categoria, direitos, ordem")
      .eq("emp_proprietaria_id", tenantId)
      .eq("congresso_id", c.id)
      .eq("inscricao_publica", true)
      .order("ordem"),
    admin
      .from("congresso_unidades")
      .select("id, nome, tipo, ordem")
      .eq("emp_proprietaria_id", tenantId)
      .eq("congresso_id", c.id)
      .order("ordem")
      .order("nome"),
  ])
  const config = normalizarConfig(c.config)
  const estado = inscricaoAberta({
    inscricaoPublica: c.inscricao_publica === true,
    situacao: c.situacao as string,
    abre: valor(config, "inscricao.abre"),
    fecha: valor(config, "inscricao.fecha"),
  })
  const listaPapeis = (papeis.data ?? []).map((p) => ({
    id: p.id as string,
    nome: p.nome as string,
    resumo: resumoDireitos(normalizarDireitos(p.categoria as CategoriaPapel, p.direitos)),
  }))
  const tipos = new Set((unidades.data ?? []).map((u) => u.tipo as string))
  return {
    id: c.id as string,
    nome: c.nome as string,
    edicao: c.edicao === null ? null : Number(c.edicao),
    tema: t(c.tema),
    inicio: t(ev.data?.inicio),
    termino: t(ev.data?.termino),
    local: t(ev.data?.local),
    config,
    aberta: estado.aberta && listaPapeis.length > 0,
    motivoFechada: estado.aberta && !listaPapeis.length ? "A inscrição por este link não está aberta." : estado.motivo,
    papeis: listaPapeis,
    unidades: (unidades.data ?? []).map((u) => ({ id: u.id as string, nome: u.nome as string })),
    rotuloUnidade: tipos.size === 1 ? ROTULO_TIPO_UNIDADE[[...tipos][0]] ?? "Base" : "Base ou entidade",
  }
}

export type DadosInscricao = {
  nome: string
  nomeSocial: string | null
  cpf: string
  email: string
  telefone: string | null
  genero: string | null
  acessibilidade: string | null
  papelId: string
  unidadeId: string | null
  ip: string | null
}

/**
 * Inscrição pela página pública. As travas são revalidadas aqui (a action é
 * alcançável por POST direto). A situação sai da configuração: por ordem de
 * inscrição, ocupa a vaga se houver; senão, lista de espera.
 */
export async function inscreverPublico(
  slug: string,
  tenantId: string,
  d: DadosInscricao
): Promise<{ token?: string; situacao?: string; erro?: string; congressoNome?: string }> {
  const pub = await congressoPublico(slug, tenantId)
  if (!pub) return { erro: "Congresso não encontrado." }
  if (!pub.aberta) return { erro: pub.motivoFechada ?? "As inscrições estão fechadas." }
  if (d.nome.trim().length < 5) return { erro: "Informe o nome completo." }
  if (!validarCpf(d.cpf)) return { erro: "CPF inválido." }
  if (!EMAIL.test(d.email)) return { erro: "Informe um e-mail válido." }
  if (!pub.papeis.some((p) => p.id === d.papelId)) return { erro: "Escolha como vai participar." }
  if (pub.unidades.length && !d.unidadeId) return { erro: `Escolha a ${pub.rotuloUnidade.toLowerCase()}.` }
  if (d.unidadeId && !pub.unidades.some((u) => u.id === d.unidadeId)) return { erro: "Base inválida." }

  const admin = await createAdminClient()
  const { data: jaExiste } = await admin
    .from("congresso_participantes")
    .select("id")
    .eq("emp_proprietaria_id", tenantId)
    .eq("congresso_id", pub.id)
    .eq("cpf", d.cpf)
    .maybeSingle()
  if (jaExiste) {
    return { erro: "Já existe inscrição com este CPF. Use o link pessoal que você recebeu por e-mail ou procure a comissão organizadora." }
  }

  // Ficha de filiado pelo CPF (a conferência de elegibilidade usa o vínculo).
  const { data: fichas } = await admin
    .from("filiacoes")
    .select("id, filiacao_condicao")
    .eq("emp_proprietaria_id", tenantId)
    .in("cpf", grafiasDoCpf(d.cpf))
    .limit(5)
  const ficha = (fichas ?? []).find((f) => f.filiacao_condicao === "Ativo") ?? (fichas ?? [])[0] ?? null

  // Vagas da base agora.
  const { data: papelRow } = await admin
    .from("congresso_papeis")
    .select("categoria, direitos")
    .eq("emp_proprietaria_id", tenantId)
    .eq("id", d.papelId)
    .single()
  const direitos: Direitos = normalizarDireitos(papelRow!.categoria as CategoriaPapel, papelRow!.direitos)
  let vagas: number | null = null
  let ocupadas = 0
  if (d.unidadeId) {
    const { data: u } = await admin
      .from("congresso_unidades")
      .select("limite_delegados, socios")
      .eq("emp_proprietaria_id", tenantId)
      .eq("id", d.unidadeId)
      .single()
    vagas = vagasDaBase(pub.config, { limite_delegados: u?.limite_delegados ?? null, socios: u?.socios ?? null }).vagas
    const { data: daBase } = await admin
      .from("congresso_participantes")
      .select("situacao, papel_id")
      .eq("emp_proprietaria_id", tenantId)
      .eq("congresso_id", pub.id)
      .eq("unidade_id", d.unidadeId)
      .in("situacao", ["confirmado", "inscrito"])
    const { data: todosPapeis } = await admin
      .from("congresso_papeis")
      .select("id, categoria, direitos")
      .eq("emp_proprietaria_id", tenantId)
      .eq("congresso_id", pub.id)
    const ocupa = new Map(
      (todosPapeis ?? []).map((p) => [p.id as string, normalizarDireitos(p.categoria as CategoriaPapel, p.direitos).ocupa_vaga])
    )
    ocupadas = (daBase ?? []).filter((p) => p.papel_id && ocupa.get(p.papel_id as string)).length
  }
  const situacao = situacaoNaInscricao({ config: pub.config, ocupaVaga: direitos.ocupa_vaga && !!d.unidadeId, vagas, ocupadas })

  const token = novoToken()
  const { data, error } = await admin
    .from("congresso_participantes")
    .insert({
      emp_proprietaria_id: tenantId,
      congresso_id: pub.id,
      nome: d.nome.trim(),
      nome_social: d.nomeSocial,
      cpf: d.cpf,
      email: d.email,
      telefone: d.telefone,
      genero: d.genero,
      acessibilidade: d.acessibilidade,
      filiacao_id: ficha?.id ?? null,
      papel_id: d.papelId,
      unidade_id: d.unidadeId,
      situacao,
      origem: "inscricao",
      token_hash: hashToken(token),
      token_gerado_em: new Date().toISOString(),
      aceite_em: new Date().toISOString(),
      inscricao_ip: d.ip,
    })
    .select("id")
    .single()
  if (error || !data) {
    if (error?.code === "23505") return { erro: "Já existe inscrição com este CPF." }
    return { erro: "Não foi possível registrar a inscrição. Tente de novo em instantes." }
  }
  await admin.from("congresso_participante_historico").insert({
    emp_proprietaria_id: tenantId,
    congresso_id: pub.id,
    participante_id: data.id,
    acao: "inscricao",
    detalhe: { origem: "inscricao", situacao, vagas, ocupadas_antes: ocupadas },
    autor_id: null,
  })
  return { token, situacao, congressoNome: pub.nome }
}

export type MinhaInscricao = {
  congresso: { nome: string; edicao: number | null; tema: string | null; inicio: string | null; termino: string | null; local: string | null }
  nome: string
  situacao: string
  posicaoEspera: number | null
  papel: string | null
  resumo: string | null
  unidade: string | null
  grupo: string | null
  sessoes: { titulo: string; inicio: string | null; local: string | null }[]
}

/** Página do link pessoal: a situação da pessoa e o programa. */
export async function minhaInscricao(token: string, tenantId: string): Promise<MinhaInscricao | null> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null
  const admin = await createAdminClient()
  const { data: p } = await admin
    .from("congresso_participantes")
    .select("id, congresso_id, nome, nome_social, situacao, papel_id, unidade_id, grupo_id, inscrito_em")
    .eq("emp_proprietaria_id", tenantId)
    .eq("token_hash", hashToken(token))
    .maybeSingle()
  if (!p) return null
  const [c, papel, unidade, grupo, sessoes, espera] = await Promise.all([
    admin.from("congressos").select("nome, edicao, tema, evento_id").eq("emp_proprietaria_id", tenantId).eq("id", p.congresso_id).single(),
    p.papel_id ? admin.from("congresso_papeis").select("nome, categoria, direitos").eq("id", p.papel_id).maybeSingle() : Promise.resolve({ data: null }),
    p.unidade_id ? admin.from("congresso_unidades").select("nome").eq("id", p.unidade_id).maybeSingle() : Promise.resolve({ data: null }),
    p.grupo_id ? admin.from("congresso_grupos").select("nome").eq("id", p.grupo_id).maybeSingle() : Promise.resolve({ data: null }),
    admin
      .from("congresso_sessoes")
      .select("titulo, inicio, local, grupo_id")
      .eq("emp_proprietaria_id", tenantId)
      .eq("congresso_id", p.congresso_id)
      .order("inicio", { nullsFirst: false }),
    p.situacao === "lista_espera" && p.unidade_id
      ? admin
          .from("congresso_participantes")
          .select("id", { count: "exact", head: true })
          .eq("emp_proprietaria_id", tenantId)
          .eq("congresso_id", p.congresso_id)
          .eq("unidade_id", p.unidade_id)
          .eq("situacao", "lista_espera")
          .lte("inscrito_em", p.inscrito_em)
      : Promise.resolve({ count: null }),
  ])
  const ev = c.data?.evento_id
    ? (await admin.from("eventos").select("inicio, termino, local").eq("id", c.data.evento_id).maybeSingle()).data
    : null
  return {
    congresso: {
      nome: (c.data?.nome as string) ?? "Congresso",
      edicao: c.data?.edicao === null || c.data?.edicao === undefined ? null : Number(c.data.edicao),
      tema: t(c.data?.tema),
      inicio: t(ev?.inicio),
      termino: t(ev?.termino),
      local: t(ev?.local),
    },
    nome: (t(p.nome_social) ?? p.nome) as string,
    situacao: p.situacao as string,
    posicaoEspera: (espera as { count: number | null }).count ?? null,
    papel: t(papel.data?.nome),
    resumo: papel.data ? resumoDireitos(normalizarDireitos(papel.data.categoria as CategoriaPapel, papel.data.direitos)) : null,
    unidade: t(unidade.data?.nome),
    grupo: t(grupo.data?.nome),
    sessoes: (sessoes.data ?? [])
      .filter((s) => !s.grupo_id || s.grupo_id === p.grupo_id)
      .map((s) => ({ titulo: s.titulo as string, inicio: t(s.inicio), local: t(s.local) })),
  }
}

// ── Importação de listas ─────────────────────────────────────────────────────

export async function conferirImportacao(
  congressoId: string,
  linhas: LinhaImportada[],
  padroes: { papelId: string | null; unidadeId: string | null }
): Promise<LinhaConferida[]> {
  const [papeis, unidades, existentes] = await Promise.all([
    listarPapeis(congressoId),
    listarUnidades(congressoId),
    listarParticipantes(congressoId),
  ])
  return conferirLinhas(linhas, {
    papeis: papeis.map((p) => ({ id: p.id, nome: p.nome, categoria: p.categoria })),
    unidades: unidades.map((u) => ({ id: u.id, nome: u.nome })),
    papelPadrao: padroes.papelId,
    unidadePadrao: padroes.unidadeId,
    cpfsExistentes: new Set(existentes.map((p) => p.cpf).filter((v): v is string => !!v)),
    nomesExistentes: new Set(existentes.filter((p) => p.situacao !== "cancelado").map((p) => semAcento(p.nome))),
  })
}

/**
 * Grava as linhas novas. A conferência é refeita no servidor (o que veio da
 * tela não é confiável) e a ordem do arquivo vira a ordem de inscrição, com
 * um milissegundo entre cada uma.
 */
export async function gravarImportacao(
  congressoId: string,
  linhas: LinhaImportada[],
  padroes: { papelId: string | null; unidadeId: string | null },
  origem: "planilha" | "ata",
  autorId: string
): Promise<{ ok?: string; erro?: string }> {
  const conferidas = await conferirImportacao(congressoId, linhas, padroes)
  const novas = conferidas.filter((l) => l.situacao === "nova")
  if (!novas.length) return { erro: "Nenhuma linha nova para incluir." }
  let gravadas = 0
  const falhas: string[] = []
  for (const l of novas) {
    const r = await adicionarParticipante(
      congressoId,
      {
        nome: l.nome,
        nomeSocial: null,
        cpf: l.cpf,
        email: l.email && EMAIL.test(l.email) ? l.email : null,
        telefone: l.telefone,
        genero: l.genero,
        filiacaoId: null,
        papelId: l.papelId,
        unidadeId: l.unidadeId,
        grupoId: null,
        titularId: null,
        acessibilidade: null,
        observacao: null,
        origem,
      },
      autorId
    )
    if (r.erro) falhas.push(`linha ${l.linha}: ${r.erro}`)
    else gravadas++
  }
  await vincularFichas(congressoId)
  const pulos = conferidas.length - novas.length
  return {
    ok: `${gravadas} participante(s) incluído(s)${pulos ? `; ${pulos} linha(s) já estavam ou tinham problema` : ""}${falhas.length ? `; falharam: ${falhas.slice(0, 5).join("; ")}` : ""}.`,
  }
}

/** Liga à ficha de filiado quem entrou com CPF e ainda está sem ficha. */
async function vincularFichas(congressoId: string) {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data } = await admin
    .from("congresso_participantes")
    .select("id, cpf")
    .eq("emp_proprietaria_id", emp)
    .eq("congresso_id", congressoId)
    .is("filiacao_id", null)
    .not("cpf", "is", null)
  for (const p of data ?? []) {
    const { data: f } = await admin
      .from("filiacoes")
      .select("id, filiacao_condicao")
      .eq("emp_proprietaria_id", emp)
      .in("cpf", grafiasDoCpf(p.cpf as string))
      .limit(5)
    const ficha = (f ?? []).find((x) => x.filiacao_condicao === "Ativo") ?? (f ?? [])[0]
    if (ficha) {
      await admin.from("congresso_participantes").update({ filiacao_id: ficha.id }).eq("emp_proprietaria_id", emp).eq("id", p.id)
    }
  }
}
