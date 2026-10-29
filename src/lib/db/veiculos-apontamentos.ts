import "server-only"

import { esquemaAusente, texto } from "@/lib/db/comum"
import { formatarData } from "@/lib/formato"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Veículos › Checklist — APONTAMENTOS.
 *
 * Um "não conforme" do checklist vira um apontamento com vida própria: segue
 * aberto de um checklist para o outro (o inspetor seguinte responde se
 * permanece), conta o tempo em aberto, avisa a portaria na saída e pede a
 * manutenção corretiva. Vincular uma manutenção NÃO o encerra: só um checklist
 * que o declare sanado — quem conserta não é quem confere.
 *
 * SQL: supabase/migrations/20261029001020_veiculos_checklist_apontamentos.sql
 */

export type Apontamento = {
  id: string
  veiculo_id: string
  item_id: string | null
  categoria: string
  descricao: string | null
  situacao: "aberto" | "resolvido"
  aberto_em: string
  /** Dias inteiros desde a abertura (marcador do tempo em aberto). */
  diasAberto: number
  confirmacoes: number
  ultima_confirmacao_em: string | null
  ultima_observacao: string | null
  resolvido_em: string | null
  manutencao: { id: string; rotulo: string } | null
}

const CAMPOS =
  "id, veiculo_id, item_id, categoria, descricao, situacao, aberto_em, confirmacoes, ultima_confirmacao_em, ultima_observacao, resolvido_em, manutencao_id"

const DIA_MS = 86_400_000

/** "há 12 dias" / "desde hoje" — o marcador de tempo do apontamento. */
export function tempoEmAberto(a: Pick<Apontamento, "diasAberto">): string {
  if (a.diasAberto <= 0) return "aberto hoje"
  return `aberto há ${a.diasAberto} dia${a.diasAberto === 1 ? "" : "s"}`
}

async function rotulosDasManutencoes(
  ids: string[],
): Promise<Map<string, string>> {
  const unicos = [...new Set(ids.filter(Boolean))]
  if (unicos.length === 0) return new Map()
  const admin = await createAdminClient()
  const { data } = await admin
    .from("veiculos_manutencoes")
    .select("id, tipo, descricao, realizada_em")
    .in("id", unicos)
  return new Map(
    ((data ?? []) as Record<string, unknown>[]).map((m) => [
      String(m.id),
      rotuloManutencao(m),
    ]),
  )
}

function rotuloManutencao(m: Record<string, unknown>): string {
  const tipo =
    m.tipo === "preventiva"
      ? "Preventiva"
      : m.tipo === "corretiva"
        ? "Corretiva"
        : "Manutenção"
  const quando = texto(m.realizada_em)
    ? ` de ${formatarData(String(m.realizada_em))}`
    : ""
  const oque = texto(m.descricao)
    ? ` — ${String(m.descricao).slice(0, 60)}`
    : ""
  return `${tipo}${quando}${oque}`
}

function montar(
  linha: Record<string, unknown>,
  manutencoes: Map<string, string>,
): Apontamento {
  const aberto = String(linha.aberto_em)
  const fim =
    linha.situacao === "resolvido" && texto(linha.resolvido_em)
      ? Date.parse(String(linha.resolvido_em))
      : Date.now()
  const manutId = texto(linha.manutencao_id)
  return {
    id: String(linha.id),
    veiculo_id: String(linha.veiculo_id),
    item_id: texto(linha.item_id),
    categoria: String(linha.categoria ?? "(item)"),
    descricao: texto(linha.descricao),
    situacao: linha.situacao === "resolvido" ? "resolvido" : "aberto",
    aberto_em: aberto,
    diasAberto: Math.max(0, Math.floor((fim - Date.parse(aberto)) / DIA_MS)),
    confirmacoes: Number(linha.confirmacoes ?? 0),
    ultima_confirmacao_em: texto(linha.ultima_confirmacao_em),
    ultima_observacao: texto(linha.ultima_observacao),
    resolvido_em: texto(linha.resolvido_em),
    manutencao: manutId
      ? { id: manutId, rotulo: manutencoes.get(manutId) ?? "Manutenção" }
      : null,
  }
}

/**
 * Apontamentos em aberto — de um veículo ou da frota toda —, do mais antigo
 * para o mais novo. Sem a tabela (migração não aplicada), lista vazia.
 */
export async function apontamentosAbertos(
  veiculoId?: string,
): Promise<Apontamento[]> {
  const admin = await createAdminClient()
  let q = admin
    .from("veiculos_checklist_apontamentos")
    .select(CAMPOS)
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("situacao", "aberto")
  if (veiculoId) q = q.eq("veiculo_id", veiculoId)
  const { data, error } = await q
    .order("aberto_em", { ascending: true })
    .limit(1000)
  if (error) {
    if (esquemaAusente(error)) return []
    throw new Error(`Falha ao listar os apontamentos: ${error.message}`)
  }
  const linhas = (data ?? []) as Record<string, unknown>[]
  const manut = await rotulosDasManutencoes(
    linhas.map((l) => String(l.manutencao_id ?? "")),
  )
  return linhas.map((l) => montar(l, manut))
}

/** Histórico do veículo: abertos primeiro, depois os resolvidos mais recentes. */
export async function apontamentosDoVeiculo(
  veiculoId: string,
  limite = 30,
): Promise<Apontamento[]> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("veiculos_checklist_apontamentos")
    .select(CAMPOS)
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("veiculo_id", veiculoId)
    .order("aberto_em", { ascending: false })
    .limit(limite)
  if (error) {
    if (esquemaAusente(error)) return []
    throw new Error(`Falha ao listar os apontamentos: ${error.message}`)
  }
  const linhas = (data ?? []) as Record<string, unknown>[]
  const manut = await rotulosDasManutencoes(
    linhas.map((l) => String(l.manutencao_id ?? "")),
  )
  return linhas
    .map((l) => montar(l, manut))
    .sort((a, b) =>
      a.situacao === b.situacao ? 0 : a.situacao === "aberto" ? -1 : 1,
    )
}

/** Manutenções do veículo para vincular (corretivas primeiro, mais recentes antes). */
export async function manutencoesParaVincular(
  veiculoId: string,
): Promise<{ id: string; rotulo: string }[]> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("veiculos_manutencoes")
    .select("id, tipo, descricao, realizada_em")
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("veiculo_id", veiculoId)
    .order("realizada_em", { ascending: false, nullsFirst: false })
    .limit(50)
  const linhas = (data ?? []) as Record<string, unknown>[]
  return [
    ...linhas.filter((m) => m.tipo === "corretiva"),
    ...linhas.filter((m) => m.tipo !== "corretiva"),
  ].map((m) => ({ id: String(m.id), rotulo: rotuloManutencao(m) }))
}

/**
 * Liga (ou desliga, com `manutencaoId` nulo) o apontamento a uma manutenção do
 * MESMO veículo. Não muda a situação: quem encerra é o próximo checklist.
 */
export async function vincularManutencao(
  apontamentoId: string,
  manutencaoId: string | null,
): Promise<{ erro?: string; veiculoId?: string }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data: a } = await admin
    .from("veiculos_checklist_apontamentos")
    .select("id, veiculo_id")
    .eq("id", apontamentoId)
    .eq("emp_proprietaria_id", emp)
    .maybeSingle()
  if (!a) return { erro: "Apontamento não encontrado." }
  if (manutencaoId) {
    const { data: m } = await admin
      .from("veiculos_manutencoes")
      .select("veiculo_id")
      .eq("id", manutencaoId)
      .eq("emp_proprietaria_id", emp)
      .maybeSingle()
    if (!m || String(m.veiculo_id) !== String(a.veiculo_id)) {
      return { erro: "A manutenção precisa ser do mesmo veículo." }
    }
  }
  const { error } = await admin
    .from("veiculos_checklist_apontamentos")
    .update({ manutencao_id: manutencaoId })
    .eq("id", apontamentoId)
  if (error) return { erro: `Não foi possível vincular: ${error.message}` }
  return { veiculoId: String(a.veiculo_id) }
}

// ── Escrita pelo checklist ──────────────────────────────────────────────────

export type RespostaApontamento = {
  apontamentoId: string
  permanece: boolean
  observacao: string | null
}

/**
 * Aplica o checklist recém-gravado aos apontamentos do veículo: confirma os
 * que permanecem, encerra os sanados e abre um para cada "não conforme" de
 * item sem apontamento aberto. Devolve erro sem desfazer o checklist — quem
 * chama decide.
 */
export async function aplicarChecklistAosApontamentos(dados: {
  veiculoId: string
  checklistId: string
  realizadoEm: string
  inspetorId: string
  respostas: RespostaApontamento[]
  novos: { item_id: string; categoria: string; descricao: string | null }[]
}): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  for (const r of dados.respostas) {
    const campos = r.permanece
      ? {
          ultima_confirmacao_em: dados.realizadoEm,
          ...(r.observacao ? { ultima_observacao: r.observacao } : {}),
        }
      : {
          situacao: "resolvido",
          resolvido_em: dados.realizadoEm,
          checklist_resolucao_id: dados.checklistId,
          resolvido_por: dados.inspetorId,
        }
    const { data: atual } = await admin
      .from("veiculos_checklist_apontamentos")
      .select("confirmacoes")
      .eq("id", r.apontamentoId)
      .eq("veiculo_id", dados.veiculoId)
      .eq("situacao", "aberto")
      .maybeSingle()
    if (!atual) continue
    const { error } = await admin
      .from("veiculos_checklist_apontamentos")
      .update(
        r.permanece
          ? { ...campos, confirmacoes: Number(atual.confirmacoes ?? 0) + 1 }
          : campos,
      )
      .eq("id", r.apontamentoId)
      .eq("emp_proprietaria_id", emp)
    if (error)
      return {
        erro: `Não foi possível atualizar o apontamento: ${error.message}`,
      }
  }
  if (dados.novos.length) {
    const { error } = await admin
      .from("veiculos_checklist_apontamentos")
      .insert(
        dados.novos.map((n) => ({
          emp_proprietaria_id: emp,
          veiculo_id: dados.veiculoId,
          item_id: n.item_id,
          categoria: n.categoria,
          descricao: n.descricao,
          aberto_em: dados.realizadoEm,
          checklist_abertura_id: dados.checklistId,
        })),
      )
    if (error)
      return { erro: `Não foi possível abrir o apontamento: ${error.message}` }
  }
  return {}
}

/** Formato da lista na tela (ApontamentoTela, em checklists/apontamentos.tsx). */
export function apontamentoParaTela(
  a: Apontamento,
  veiculoRotulo?: string | null,
) {
  return {
    id: a.id,
    veiculo_id: a.veiculo_id,
    veiculoRotulo: veiculoRotulo ?? null,
    categoria: a.categoria,
    descricao: a.descricao,
    situacao: a.situacao,
    tempo:
      a.situacao === "aberto"
        ? tempoEmAberto(a)
        : `ficou ${a.diasAberto} dia${a.diasAberto === 1 ? "" : "s"} em aberto`,
    abertoEm: dataSP(a.aberto_em),
    resolvidoEm: a.resolvido_em ? dataSP(a.resolvido_em) : null,
    confirmacoes: a.confirmacoes,
    ultima_observacao: a.ultima_observacao,
    manutencao: a.manutencao,
  }
}

/**
 * Alertas do painel de Veículos, por veículo: apontamento sem manutenção pede
 * a CORRETIVA (grave); com manutenção vinculada, falta só o checklist dizer
 * que foi sanado.
 */
export async function alertasApontamentos(): Promise<
  { chave: string; texto: string; href: string; grave: boolean }[]
> {
  const abertos = await apontamentosAbertos()
  if (abertos.length === 0) return []
  const admin = await createAdminClient()
  const { data } = await admin
    .from("veiculos")
    .select("id, codigo, placa, marca_modelo")
    .in("id", [...new Set(abertos.map((a) => a.veiculo_id))])
  const rotulo = new Map(
    ((data ?? []) as Record<string, unknown>[]).map((v) => [
      String(v.id),
      [v.placa, v.marca_modelo].filter(Boolean).join(" · ") ||
        String(v.codigo ?? "veículo"),
    ]),
  )
  const alertas: {
    chave: string
    texto: string
    href: string
    grave: boolean
  }[] = []
  for (const veiculoId of new Set(abertos.map((a) => a.veiculo_id))) {
    const doVeiculo = abertos.filter((a) => a.veiculo_id === veiculoId)
    const href = `/painel/veiculos/${veiculoId}#apontamentos`
    const nome = rotulo.get(veiculoId) ?? "Veículo"
    const semManutencao = doVeiculo.filter((a) => !a.manutencao)
    if (semManutencao.length) {
      const maisAntigo = Math.max(...semManutencao.map((a) => a.diasAberto))
      alertas.push({
        chave: `apontamento-corretiva-${veiculoId}`,
        texto: `${nome}: ${semManutencao.length === 1 ? `"${semManutencao[0].categoria}"` : `${semManutencao.length} apontamentos`} do checklist pede${semManutencao.length === 1 ? "" : "m"} manutenção corretiva (${tempoEmAberto({ diasAberto: maisAntigo })})`,
        href,
        grave: true,
      })
    }
    const comManutencao = doVeiculo.filter((a) => a.manutencao)
    if (comManutencao.length) {
      alertas.push({
        chave: `apontamento-confirmar-${veiculoId}`,
        texto: `${nome}: manutenção feita em ${comManutencao.length === 1 ? `"${comManutencao[0].categoria}"` : `${comManutencao.length} apontamentos`} — falta o checklist confirmar que foi sanado`,
        href,
        grave: false,
      })
    }
  }
  return alertas
}

/**
 * Data de um TIMESTAMP no horário de Brasília. (formatarData lê o começo do
 * texto como data — certo para colunas `date`, errado para um horário em UTC:
 * o checklist das 21h viraria o dia seguinte.)
 */
function dataSP(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? "—"
    : new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(d)
}
