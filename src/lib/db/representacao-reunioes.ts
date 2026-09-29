import "server-only"

import { randomUUID } from "node:crypto"

import { esquemaAusente, hojeSP, nomesDosUsuarios, texto } from "@/lib/db/comum"
import {
  modalidadeReuniao,
  situacaoReuniaoRep,
  tipoReuniaoRep,
  type LadoParticipante,
  type ModalidadeReuniao,
  type SituacaoReuniaoRep,
  type TipoReuniaoRep,
} from "@/lib/representacao-reunioes-constantes"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Reuniões com o empregador e setoriais, na página de cada empregador.
 * Ver supabase/representacao-reunioes.sql. A ata fica no bucket privado
 * `representacao`, em reunioes/…
 */

export const AVISO_SQL_REUNIOES =
  "Reuniões e setoriais usam tabelas novas — rode supabase/representacao-reunioes.sql no Supabase."

const BUCKET = "representacao"

export type ReuniaoLinha = {
  id: string
  tipo: TipoReuniaoRep
  situacao: SituacaoReuniaoRep
  titulo: string
  data: string | null
  horaInicio: string | null
  horaFim: string | null
  modalidade: ModalidadeReuniao
  local: string | null
  unidade: string | null
  presentesTotal: number | null
  participantes: number
  temAta: boolean
  resumoPorIA: boolean
}

export const ORDENS_REUNIAO = { data: "data", titulo: "titulo", situacao: "situacao" } as const

export async function listarReunioes(
  empresaId: string,
  tipo: TipoReuniaoRep,
  f: {
    pagina: number
    porPagina: number
    ordem: keyof typeof ORDENS_REUNIAO
    asc: boolean
    situacao?: SituacaoReuniaoRep | null
    de?: string | null
    ate?: string | null
    busca?: string | null
  }
): Promise<{ disponivel: boolean; linhas: ReuniaoLinha[]; total: number }> {
  const admin = await createAdminClient()
  let q = admin
    .from("representacao_reunioes")
    .select("id, tipo, situacao, titulo, data, hora_inicio, hora_fim, modalidade, local, unidade, presentes_total, ata_caminho, resumo_por_ia", { count: "exact" })
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("empresa_id", empresaId)
    .eq("tipo", tipo)
  if (f.situacao) q = q.eq("situacao", f.situacao)
  if (f.de) q = q.gte("data", f.de)
  if (f.ate) q = q.lte("data", f.ate)
  const busca = (f.busca ?? "").replace(/[,()%*]/g, " ").trim()
  if (busca) q = q.or(`titulo.ilike.%${busca}%,pauta.ilike.%${busca}%,resumo.ilike.%${busca}%,encaminhamentos.ilike.%${busca}%,unidade.ilike.%${busca}%`)
  const de = (f.pagina - 1) * f.porPagina
  const { data, count, error } = await q
    .order(ORDENS_REUNIAO[f.ordem], { ascending: f.asc, nullsFirst: false })
    .order("hora_inicio", { ascending: f.asc, nullsFirst: false })
    .order("id")
    .range(de, de + f.porPagina - 1)
  if (error) {
    if (esquemaAusente(error)) return { disponivel: false, linhas: [], total: 0 }
    throw new Error(`Falha ao listar reuniões: ${error.message}`)
  }
  const ids = (data ?? []).map((r) => String(r.id))
  const contagem = new Map<string, number>()
  if (ids.length) {
    const { data: ps } = await admin.from("representacao_reuniao_participantes").select("reuniao_id").in("reuniao_id", ids)
    for (const p of ps ?? []) contagem.set(String(p.reuniao_id), (contagem.get(String(p.reuniao_id)) ?? 0) + 1)
  }
  return {
    disponivel: true,
    total: count ?? 0,
    linhas: (data ?? []).map((r) => ({
      id: String(r.id),
      tipo: tipoReuniaoRep(r.tipo),
      situacao: situacaoReuniaoRep(r.situacao),
      titulo: String(r.titulo ?? "(sem título)"),
      data: texto(r.data),
      horaInicio: texto(r.hora_inicio),
      horaFim: texto(r.hora_fim),
      modalidade: modalidadeReuniao(r.modalidade),
      local: texto(r.local),
      unidade: texto(r.unidade),
      presentesTotal: typeof r.presentes_total === "number" ? r.presentes_total : null,
      participantes: contagem.get(String(r.id)) ?? 0,
      temAta: Boolean(r.ata_caminho),
      resumoPorIA: r.resumo_por_ia === true,
    })),
  }
}

/** Contagens para as abas e indicadores da página do empregador. */
export async function resumoReunioes(empresaId: string): Promise<{
  disponivel: boolean
  reunioes: number
  setoriais: number
  reunioes12m: number
  setoriais12m: number
  proxima: { id: string; tipo: TipoReuniaoRep; titulo: string; data: string | null } | null
  ultima: { id: string; tipo: TipoReuniaoRep; titulo: string; data: string | null } | null
}> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("representacao_reunioes")
    .select("id, tipo, situacao, titulo, data")
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("empresa_id", empresaId)
    .order("data", { ascending: true, nullsFirst: false })
    .limit(1000)
  const vazio = { reunioes: 0, setoriais: 0, reunioes12m: 0, setoriais12m: 0, proxima: null, ultima: null }
  if (error) return { disponivel: !esquemaAusente(error), ...vazio }
  const hoje = hojeSP()
  const ha12 = new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10)
  const linhas = (data ?? []).map((r) => ({
    id: String(r.id),
    tipo: tipoReuniaoRep(r.tipo),
    situacao: situacaoReuniaoRep(r.situacao),
    titulo: String(r.titulo ?? "(sem título)"),
    data: texto(r.data),
  }))
  const validas = linhas.filter((r) => r.situacao !== "cancelada")
  const conta = (t: TipoReuniaoRep, desde?: string) =>
    validas.filter((r) => r.tipo === t && (!desde || (r.data ?? "") >= desde)).length
  return {
    disponivel: true,
    reunioes: linhas.filter((r) => r.tipo === "empregador").length,
    setoriais: linhas.filter((r) => r.tipo === "setorial").length,
    reunioes12m: conta("empregador", ha12),
    setoriais12m: conta("setorial", ha12),
    proxima: validas.find((r) => r.situacao === "agendada" && (r.data ?? "") >= hoje) ?? null,
    ultima: [...validas].reverse().find((r) => r.situacao === "realizada" && (r.data ?? "") <= hoje) ?? null,
  }
}

// ── Detalhe ──────────────────────────────────────────────────────────────────

export type Participante = {
  lado: LadoParticipante
  usuarioId: string | null
  nome: string
  cargo: string | null
}

export type ReuniaoDetalhe = {
  id: string
  empresaId: string
  tipo: TipoReuniaoRep
  situacao: SituacaoReuniaoRep
  titulo: string
  data: string | null
  horaInicio: string | null
  horaFim: string | null
  modalidade: ModalidadeReuniao
  local: string | null
  linkOnline: string | null
  unidade: string | null
  presentesTotal: number | null
  pauta: string | null
  resumo: string | null
  encaminhamentos: string | null
  ataUrl: string | null
  ataNome: string | null
  temAta: boolean
  resumoPorIA: boolean
  participantes: Participante[]
  criadoPor: string | null
  criadoEm: string
  atualizadoEm: string
}

export async function obterReuniao(id: string, empresaId: string): Promise<ReuniaoDetalhe | null> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data: r } = await admin
    .from("representacao_reunioes")
    .select("*")
    .eq("id", id)
    .eq("empresa_id", empresaId)
    .eq("emp_proprietaria_id", emp)
    .maybeSingle()
  if (!r) return null
  const { data: ps } = await admin
    .from("representacao_reuniao_participantes")
    .select("lado, usuario_id, nome, cargo, ordem")
    .eq("reuniao_id", id)
    .eq("emp_proprietaria_id", emp)
    .order("ordem")
  const nomes = await nomesDosUsuarios([
    ...(ps ?? []).map((p) => String(p.usuario_id ?? "")).filter(Boolean),
    String(r.criado_por_id ?? ""),
  ])
  let ataUrl: string | null = null
  if (r.ata_caminho) {
    const { data: s } = await admin.storage.from(BUCKET).createSignedUrl(String(r.ata_caminho), 3600)
    ataUrl = s?.signedUrl ?? null
  }
  return {
    id: String(r.id),
    empresaId: String(r.empresa_id),
    tipo: tipoReuniaoRep(r.tipo),
    situacao: situacaoReuniaoRep(r.situacao),
    titulo: String(r.titulo ?? "(sem título)"),
    data: texto(r.data),
    horaInicio: texto(r.hora_inicio),
    horaFim: texto(r.hora_fim),
    modalidade: modalidadeReuniao(r.modalidade),
    local: texto(r.local),
    linkOnline: texto(r.link_online),
    unidade: texto(r.unidade),
    presentesTotal: typeof r.presentes_total === "number" ? r.presentes_total : null,
    pauta: texto(r.pauta),
    resumo: texto(r.resumo),
    encaminhamentos: texto(r.encaminhamentos),
    ataUrl,
    ataNome: texto(r.ata_nome),
    temAta: Boolean(r.ata_caminho),
    resumoPorIA: r.resumo_por_ia === true,
    participantes: (ps ?? []).map((p) => ({
      lado: (["sindicato", "empresa", "trabalhador"].includes(String(p.lado)) ? p.lado : "sindicato") as LadoParticipante,
      usuarioId: texto(p.usuario_id),
      // Do sindicato com conta: o nome vem do cadastro (fica atualizado).
      nome: (p.usuario_id ? nomes.get(String(p.usuario_id)) : null) ?? String(p.nome ?? "(sem nome)"),
      cargo: texto(p.cargo),
    })),
    criadoPor: r.criado_por_id ? (nomes.get(String(r.criado_por_id)) ?? null) : null,
    criadoEm: String(r.created_at),
    atualizadoEm: String(r.updated_at),
  }
}

// ── Escrita ──────────────────────────────────────────────────────────────────

export type DadosReuniao = {
  tipo: TipoReuniaoRep
  situacao: SituacaoReuniaoRep
  titulo: string
  data: string | null
  horaInicio: string | null
  horaFim: string | null
  modalidade: ModalidadeReuniao
  local: string | null
  linkOnline: string | null
  unidade: string | null
  presentesTotal: number | null
  pauta: string | null
  resumo: string | null
  encaminhamentos: string | null
  resumoPorIA: boolean
  participantes: Participante[]
  /** Caminho novo da ata (já no bucket); undefined = não mexer. */
  ata?: { caminho: string; nome: string } | null
}

function linha(d: DadosReuniao) {
  return {
    tipo: d.tipo,
    situacao: d.situacao,
    titulo: d.titulo,
    data: d.data,
    hora_inicio: d.horaInicio,
    hora_fim: d.horaFim,
    modalidade: d.modalidade,
    local: d.local,
    link_online: d.linkOnline,
    unidade: d.unidade,
    presentes_total: d.presentesTotal,
    pauta: d.pauta,
    resumo: d.resumo,
    encaminhamentos: d.encaminhamentos,
    resumo_por_ia: d.resumoPorIA,
    updated_at: new Date().toISOString(),
    ...(d.ata !== undefined ? { ata_caminho: d.ata?.caminho ?? null, ata_nome: d.ata?.nome ?? null } : {}),
  }
}

async function gravarParticipantes(reuniaoId: string, ps: Participante[]) {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  await admin.from("representacao_reuniao_participantes").delete().eq("reuniao_id", reuniaoId).eq("emp_proprietaria_id", emp)
  if (!ps.length) return
  await admin.from("representacao_reuniao_participantes").insert(
    ps.map((p, i) => ({
      emp_proprietaria_id: emp,
      reuniao_id: reuniaoId,
      lado: p.lado,
      usuario_id: p.usuarioId,
      nome: p.nome,
      cargo: p.cargo,
      ordem: i,
    }))
  )
}

export async function criarReuniao(
  empresaId: string,
  d: DadosReuniao,
  autorId: string
): Promise<{ id?: string; erro?: string }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data: e } = await admin.from("empresa").select("id").eq("id", empresaId).maybeSingle()
  if (!e) return { erro: "Empregador não encontrado." }
  const { data, error } = await admin
    .from("representacao_reunioes")
    .insert({ ...linha(d), empresa_id: empresaId, emp_proprietaria_id: emp, criado_por_id: autorId })
    .select("id")
    .single()
  if (error) return { erro: esquemaAusente(error) ? AVISO_SQL_REUNIOES : `Falha ao salvar: ${error.message}` }
  await gravarParticipantes(String(data.id), d.participantes)
  return { id: String(data.id) }
}

export async function atualizarReuniao(id: string, empresaId: string, d: DadosReuniao): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data: atual } = await admin
    .from("representacao_reunioes")
    .select("ata_caminho")
    .eq("id", id)
    .eq("empresa_id", empresaId)
    .eq("emp_proprietaria_id", emp)
    .maybeSingle()
  if (!atual) return { erro: "Reunião não encontrada." }
  const { error } = await admin.from("representacao_reunioes").update(linha(d)).eq("id", id).eq("emp_proprietaria_id", emp)
  if (error) return { erro: `Falha ao salvar: ${error.message}` }
  // Ata trocada ou removida: o arquivo antigo sai do armazenamento.
  if (d.ata !== undefined && atual.ata_caminho && atual.ata_caminho !== d.ata?.caminho) {
    await admin.storage.from(BUCKET).remove([String(atual.ata_caminho)])
  }
  await gravarParticipantes(id, d.participantes)
  return {}
}

export async function excluirReuniao(id: string, empresaId: string): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data: r } = await admin
    .from("representacao_reunioes")
    .select("ata_caminho")
    .eq("id", id)
    .eq("empresa_id", empresaId)
    .eq("emp_proprietaria_id", emp)
    .maybeSingle()
  if (!r) return { erro: "Reunião não encontrada." }
  const { error } = await admin.from("representacao_reunioes").delete().eq("id", id).eq("emp_proprietaria_id", emp)
  if (error) return { erro: error.message }
  if (r.ata_caminho) await admin.storage.from(BUCKET).remove([String(r.ata_caminho)])
  return {}
}

// ── Ata: envio direto do navegador ao armazenamento ──────────────────────────
// (sem passar pela server action, que corta em 4 MB — atas escaneadas passam
// disso). A pasta leva o tenant: ninguém aponta para a ata de outro sindicato.

const prefixoAta = async () => `reunioes/${await tenantAtual()}/`

/** Link de envio para uma ata nova (PDF). */
export async function prepararEnvioAta(): Promise<{ caminho?: string; token?: string; erro?: string }> {
  const admin = await createAdminClient()
  const caminho = `${await prefixoAta()}${randomUUID()}.pdf`
  const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(caminho)
  if (error || !data) return { erro: `Não foi possível preparar o envio: ${error?.message ?? "?"}` }
  return { caminho, token: data.token }
}

/** A ata informada é deste tenant e existe no armazenamento? */
export async function ataValida(caminho: string): Promise<boolean> {
  if (!caminho.startsWith(await prefixoAta()) || !/^[\w/-]+\.pdf$/.test(caminho)) return false
  const admin = await createAdminClient()
  const pasta = caminho.slice(0, caminho.lastIndexOf("/"))
  const nome = caminho.slice(caminho.lastIndexOf("/") + 1)
  const { data } = await admin.storage.from(BUCKET).list(pasta, { search: nome })
  return (data ?? []).some((f) => f.name === nome)
}

/** Bytes da ata (para a leitura por IA), só se for deste tenant. */
export async function baixarAta(caminho: string): Promise<Uint8Array | null> {
  if (!(await ataValida(caminho))) return null
  const admin = await createAdminClient()
  const { data } = await admin.storage.from(BUCKET).download(caminho)
  return data ? new Uint8Array(await data.arrayBuffer()) : null
}
