import "server-only"

import { lerEmLotes, lerEmLotesPorIds, texto } from "@/lib/db/comum"
import { listarNiveisSalariais, referenciaDaData } from "@/lib/db/carreira"
import { criarNotificacao } from "@/lib/db/notificacoes"
import { funcionariosParaSelecao } from "@/lib/db/pessoal"
import { createAdminClient } from "@/lib/supabase/admin"
import {
  nomeTabelaSalarial,
  planejarVigencia,
  rotuloTabelaSalarial,
  type DegrauDestino,
  type NivelAtual,
  type PlanoVigencia,
} from "@/lib/tabela-salarial"
import { tenantAtual } from "@/lib/tenant"

/**
 * TABELAS SALARIAIS (03/11/2026): cada tabela é um período, com os degraus em
 * pessoal_nivel_salarial_base e no máximo uma vigente por entidade. Os
 * lançamentos e o reajuste trabalham com a vigente; as outras ficam guardadas.
 * Tornar vigente é ação da gestão, com prévia: leva cada funcionário ativo ao
 * degrau equivalente da nova tabela (lib/tabela-salarial), e a antiga não muda.
 */

export type TabelaSalarial = {
  id: string
  nome: string | null
  data_inicio: string | null
  data_fim: string | null
  vigente: boolean
  degraus: number
}

const TABELA = "pessoal_tabelas_salariais"
const BASE = "pessoal_nivel_salarial_base"

export async function listarTabelasSalariais(): Promise<TabelaSalarial[]> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data, error } = await admin
    .from(TABELA)
    .select("id, nome, data_inicio, data_fim, vigente")
    .eq("emp_proprietaria_id", emp)
    .order("data_inicio", { ascending: false, nullsFirst: true })
  if (error) throw new Error(`Falha ao listar as tabelas salariais: ${error.message}`)
  const degraus = await lerEmLotes<{ tabela_id: string | null }>((de, ate) =>
    admin.from(BASE).select("tabela_id").eq("emp_proprietaria_id", emp).order("id").range(de, ate)
  )
  const porTabela = new Map<string, number>()
  for (const d of degraus) if (d.tabela_id) porTabela.set(d.tabela_id, (porTabela.get(d.tabela_id) ?? 0) + 1)
  return (data ?? []).map((t) => ({ ...t, degraus: porTabela.get(t.id) ?? 0 }))
}

export async function buscarTabelaSalarial(id: string): Promise<TabelaSalarial | null> {
  return (await listarTabelasSalariais()).find((t) => t.id === id) ?? null
}

type Vigencia = { inicio: string; fim: string }

/** Início e término vêm do formulário; o nome sai deles. */
export function lerVigencia(formData: FormData): Vigencia | { erro: string } {
  const inicio = String(formData.get("data_inicio") ?? "")
  const fim = String(formData.get("data_fim") ?? "")
  if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio)) return { erro: "Informe a data de início da vigência." }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fim)) return { erro: "Informe a data de término da vigência." }
  if (fim < inicio) return { erro: "O término não pode ser antes do início." }
  return { inicio, fim }
}

const erroDeGravacao = (e: { code?: string; message: string }) =>
  e.code === "23505" ? "Já existe uma tabela com este início e este término." : `Não foi possível salvar: ${e.message}`

/**
 * Cria a tabela, em branco ou copiando os degraus de outra (com um percentual,
 * no reajuste). Nasce não vigente: nenhum salário muda até torná-la vigente.
 */
export async function criarTabelaSalarial(
  { inicio, fim }: Vigencia,
  usuarioId: string,
  copia?: { tabelaId: string; percentual?: number | null }
): Promise<{ id?: string; erro?: string }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data, error } = await admin
    .from(TABELA)
    .insert({
      emp_proprietaria_id: emp,
      nome: nomeTabelaSalarial(inicio, fim),
      data_inicio: inicio,
      data_fim: fim,
      criado_por: usuarioId,
    })
    .select("id")
    .single()
  if (error || !data) return { erro: error ? erroDeGravacao(error) : "Não foi possível criar a tabela." }
  if (!copia) return { id: data.id }

  const origem = await lerEmLotes<Record<string, unknown>>((de, ate) =>
    admin
      .from(BASE)
      .select("ordem, nivel_vertical, nivel_horizontal, nivel_carreira, salario_base, cargo_id, sindicato_id")
      .eq("tabela_id", copia.tabelaId)
      .order("id")
      .range(de, ate)
  )
  const fator = 1 + (copia.percentual ?? 0) / 100
  const { error: erroCopia } = origem.length
    ? await admin.from(BASE).insert(
        origem.map((d) => ({
          ...d,
          emp_proprietaria_id: emp,
          tabela_id: data.id,
          salario_base: d.salario_base === null ? null : Math.round(Number(d.salario_base) * fator * 100) / 100,
        }))
      )
    : { error: null }
  if (erroCopia) {
    await admin.from(TABELA).delete().eq("id", data.id)
    return { erro: `Não foi possível copiar os degraus: ${erroCopia.message}` }
  }
  return { id: data.id }
}

export async function salvarVigenciaTabela(id: string, { inicio, fim }: Vigencia): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error, count } = await admin
    .from(TABELA)
    .update(
      { nome: nomeTabelaSalarial(inicio, fim), data_inicio: inicio, data_fim: fim, updated_at: new Date().toISOString() },
      { count: "exact" }
    )
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: erroDeGravacao(error) }
  if (count === 0) return { erro: "Tabela não encontrada." }
  return {}
}

async function degrausDaTabela(id: string): Promise<DegrauDestino[]> {
  const admin = await createAdminClient()
  return lerEmLotes<DegrauDestino>((de, ate) =>
    admin
      .from(BASE)
      .select("id, cargo_id, nivel_vertical, nivel_horizontal, nivel_carreira, salario_base, ordem")
      .eq("tabela_id", id)
      .order("ordem", { ascending: true, nullsFirst: false })
      .order("id")
      .range(de, ate)
  )
}

/** O lançamento mais recente de cada funcionário ativo. */
async function niveisAtuais(): Promise<NivelAtual[]> {
  const [niveis, ativos] = await Promise.all([listarNiveisSalariais(), funcionariosParaSelecao()])
  const idsAtivos = new Set(ativos.map((f) => f.usuarioId))
  const vistos = new Set<string>()
  const atuais: NivelAtual[] = []
  // A lista vem da data mais recente para a mais antiga: o primeiro é o atual.
  for (const n of niveis) {
    if (!n.funcionario_id || vistos.has(n.funcionario_id) || !idsAtivos.has(n.funcionario_id)) continue
    vistos.add(n.funcionario_id)
    atuais.push({
      lancamentoId: n.id,
      funcionarioId: n.funcionario_id,
      funcionarioNome: n.funcionarioNome,
      desde: n.nivel_atual_data,
      nivelAtualId: n.nivel_atual_id,
      atual: n.nivelAtual,
      proximoId: n.proximo_nivel_id,
      proximo: n.proximoNivel,
    })
  }
  return atuais.sort((a, b) => (a.funcionarioNome ?? "").localeCompare(b.funcionarioNome ?? "", "pt-BR"))
}

export async function previaVigencia(tabela: TabelaSalarial): Promise<PlanoVigencia> {
  const [atuais, degraus] = await Promise.all([niveisAtuais(), degrausDaTabela(tabela.id)])
  return planejarVigencia(atuais, degraus, tabela.data_inicio ?? "")
}

/**
 * Torna a tabela vigente e leva os funcionários aos degraus equivalentes. A
 * marca vem primeiro: se um lançamento falhar, o retorno diz quem faltou, para
 * corrigir no lançamento dele.
 */
export async function tornarTabelaVigente(
  id: string
): Promise<{ erro?: string; movidos?: number; falhas?: string[]; semEquivalente?: number }> {
  const tabela = await buscarTabelaSalarial(id)
  if (!tabela) return { erro: "Tabela não encontrada." }
  if (tabela.vigente) return { erro: "Esta tabela já é a vigente." }
  if (!tabela.data_inicio) return { erro: "Informe a vigência da tabela antes de torná-la vigente." }
  if (tabela.degraus === 0) return { erro: "A tabela não tem degraus." }

  const plano = await previaVigencia(tabela)
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const agora = new Date().toISOString()
  const { data: anterior } = await admin.from(TABELA).select("id").eq("emp_proprietaria_id", emp).eq("vigente", true).maybeSingle()
  if (anterior) {
    const { error } = await admin.from(TABELA).update({ vigente: false, updated_at: agora }).eq("id", anterior.id)
    if (error) return { erro: `Não foi possível trocar a vigente: ${error.message}` }
  }
  const { error } = await admin.from(TABELA).update({ vigente: true, updated_at: agora }).eq("id", id)
  if (error) {
    if (anterior) await admin.from(TABELA).update({ vigente: true }).eq("id", anterior.id)
    return { erro: `Não foi possível trocar a vigente: ${error.message}` }
  }

  let movidos = 0
  const falhas: string[] = []
  const nome = rotuloTabelaSalarial(tabela)
  for (const m of plano.mudam) {
    const proximo = { proximo_nivel_id: m.proximoPara?.id ?? null }
    const { error: erroLanc } =
      m.modo === "atualiza"
        ? await admin.from("pessoal_nivel_salarial").update({ nivel_atual_id: m.para.id, ...proximo }).eq("id", m.lancamentoId)
        : await admin.from("pessoal_nivel_salarial").insert({
            emp_proprietaria_id: emp,
            funcionario_id: m.funcionarioId,
            tipo_avanco: "Ajuste salarial",
            nivel_atual_id: m.para.id,
            nivel_atual_data: tabela.data_inicio,
            ...referenciaDaData(tabela.data_inicio),
            ...proximo,
            proximo_nivel_data: await dataDoProximo(m.lancamentoId),
          })
    if (erroLanc) {
      falhas.push(`${m.funcionarioNome ?? m.funcionarioId}: ${erroLanc.message}`)
      continue
    }
    movidos++
    // Como no reajuste: aviso interno, sem o valor (ele aparece no painel).
    await criarNotificacao({
      usuarioId: m.funcionarioId,
      texto: `A tabela salarial ${nome} passou a valer. Consulte seu nível salarial e o salário básico no painel.`,
    }).catch((e) => console.error("Falha ao avisar a nova tabela:", e))
  }
  return { movidos, falhas, semEquivalente: plano.semEquivalente.length }
}

async function dataDoProximo(lancamentoId: string): Promise<string | null> {
  const admin = await createAdminClient()
  const { data } = await admin.from("pessoal_nivel_salarial").select("proximo_nivel_data").eq("id", lancamentoId).maybeSingle()
  return texto(data?.proximo_nivel_data)
}

/** Sai a tabela não vigente sem lançamento em nenhum degrau, com os degraus dela. */
export async function excluirTabelaSalarial(id: string): Promise<{ erro?: string }> {
  const tabela = await buscarTabelaSalarial(id)
  if (!tabela) return { erro: "Tabela não encontrada." }
  if (tabela.vigente) return { erro: "A tabela vigente não pode ser excluída." }
  const admin = await createAdminClient()
  const ids = (await degrausDaTabela(id)).map((d) => d.id)
  const emUso = await lerEmLotesPorIds<{ id: string }>(ids, (fatia, de, ate) =>
    admin
      .from("pessoal_nivel_salarial")
      .select("id")
      .or(`nivel_atual_id.in.(${fatia.join(",")}),proximo_nivel_id.in.(${fatia.join(",")})`)
      .order("nivel_atual_data")
      .order("id")
      .range(de, ate)
  )
  if (emUso.length > 0) {
    return { erro: `Há ${emUso.length} lançamento(s) em degraus desta tabela: ela faz parte do histórico e não pode ser excluída.` }
  }
  const { error: erroDegraus } = await admin.from(BASE).delete().eq("tabela_id", id)
  if (erroDegraus) return { erro: `Não foi possível excluir: ${erroDegraus.message}` }
  const { error } = await admin.from(TABELA).delete().eq("id", id)
  return error ? { erro: `Não foi possível excluir: ${error.message}` } : {}
}
