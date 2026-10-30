import "server-only"

import { esquemaAusente, nomesDosUsuarios, texto } from "@/lib/db/comum"
import { competenciaDaRemessa, saldosAnterioresPonto } from "@/lib/db/ponto-analise"
import { regrasApuracaoPonto } from "@/lib/db/ponto-config"
import { isentosNaCompetencia } from "@/lib/db/ponto-isencoes"
import { duasCasas } from "@/lib/horas"
import { lerCartaoPdf } from "@/lib/db/ponto-cartao-ia"
import { guardarPartes, separarPorFuncionario, textoDasPaginas } from "@/lib/db/pdf-por-funcionario"
import { apurarMes, type Apuracao, type LeituraCartao, type RegrasApuracao } from "@/lib/ponto-apuracao"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * IMPORTAÇÃO DE RELATÓRIO DE PONTO (29/10/2026).
 *
 * Um PDF do relógio (global, parcial ou de um funcionário só) é dividido por
 * funcionário pelo TEXTO de cada página (CPF, ou o nome do cadastro), sem IA.
 * Depois a IA lê as batidas de cada um e o código apura as horas com as
 * regras da entidade (lib/ponto-apuracao). Nada vai para a remessa antes de o
 * gestor conferir e aplicar.
 */

export type SituacaoItem = "pendente" | "lido" | "erro" | "aplicado" | "descartado"

export type ItemImportacao = {
  id: string
  paginas: number[]
  nomeLido: string | null
  cpfLido: string | null
  funcionarioId: string | null
  funcionarioNome: string | null
  arquivo: string
  situacao: SituacaoItem
  leitura: LeituraCartao | null
  apuracao: Apuracao | null
  erro: string | null
  registroId: string | null
}

export type Importacao = {
  id: string
  remessaId: string
  /** PDF original (bucket pessoal). */
  arquivo: string
  nomeArquivo: string | null
  paginas: number
  periodoInicio: string | null
  periodoFim: string | null
  criadoEm: string
  criadoPor: string | null
  itens: ItemImportacao[]
}

const PERIODO = /(\d{2})\/(\d{2})\/(\d{4})\s*(?:até|a|-)\s*(\d{2})\/(\d{2})\/(\d{4})/i
const iso = (d: string, m: string, a: string) => `${a}-${m}-${d}`
const PASTA = (remessaId: string) => `ponto/${remessaId}/importacoes`

// ── 1. Receber e dividir ─────────────────────────────────────────────────────

export async function criarImportacao({
  remessaId,
  arquivo,
  usuarioId,
}: {
  remessaId: string
  arquivo: File
  usuarioId: string
}): Promise<{ id?: string; erro?: string }> {
  if (arquivo.type !== "application/pdf" && !/\.pdf$/i.test(arquivo.name)) return { erro: "Envie o relatório em PDF." }
  const bytes = new Uint8Array(await arquivo.arrayBuffer())
  const lidas = await textoDasPaginas(bytes)
  if ("erro" in lidas) return lidas
  const paginasTexto = lidas.paginas

  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data: remessa } = await admin
    .from("pessoal_registro_ponto_remessas")
    .select("id, finalizada")
    .eq("id", remessaId)
    .eq("emp_proprietaria_id", emp)
    .maybeSingle()
  if (!remessa) return { erro: "Remessa não encontrada." }
  if (remessa.finalizada === true) return { erro: "A remessa está finalizada — reabra para importar." }

  // Uma parte por funcionário (CPF, senão o nome do cadastro) — lib/db/pdf-por-funcionario.
  const partes = await separarPorFuncionario(paginasTexto)
  const periodo = PERIODO.exec(paginasTexto[0] ?? "")

  const id = crypto.randomUUID()
  const guardado = await guardarPartes(bytes, partes, PASTA(remessaId), id)
  if ("erro" in guardado) return guardado
  const itens = partes.map((p, i) => ({
    emp_proprietaria_id: emp,
    importacao_id: id,
    paginas: p.paginas,
    cpf_lido: p.cpf,
    nome_lido: p.nome,
    funcionario_id: p.funcionarioId,
    arquivo: guardado.caminhos[i],
  }))

  const { error } = await admin.from("pessoal_ponto_importacoes").insert({
    id,
    emp_proprietaria_id: emp,
    remessa_id: remessaId,
    arquivo: guardado.original,
    nome_arquivo: arquivo.name,
    paginas: paginasTexto.length,
    periodo_inicio: periodo ? iso(periodo[1], periodo[2], periodo[3]) : null,
    periodo_fim: periodo ? iso(periodo[4], periodo[5], periodo[6]) : null,
    criado_por: usuarioId,
  })
  if (error) {
    return {
      erro: esquemaAusente(error)
        ? "A importação ainda não está configurada no banco (migração ponto_apuracao_importacao)."
        : `Não foi possível registrar a importação: ${error.message}`,
    }
  }
  const ins = await admin.from("pessoal_ponto_importacao_itens").insert(itens)
  if (ins.error) return { erro: `Não foi possível registrar os funcionários: ${ins.error.message}` }
  return { id }
}

// ── 2. Ler com a IA ──────────────────────────────────────────────────────────

async function lerItem(item: { id: string; arquivo: string }, regras: RegrasApuracao): Promise<"lido" | "erro"> {
  const admin = await createAdminClient()
  const gravar = (campos: Record<string, unknown>) =>
    admin.from("pessoal_ponto_importacao_itens").update({ ...campos, lido_em: new Date().toISOString() }).eq("id", item.id)
  const { data: blob } = await admin.storage.from("pessoal").download(item.arquivo)
  if (!blob) {
    await gravar({ situacao: "erro", erro: "Páginas não encontradas no armazenamento." })
    return "erro"
  }
  const { leitura, erro } = await lerCartaoPdf(new Uint8Array(await blob.arrayBuffer()))
  if (erro || !leitura) {
    await gravar({ situacao: "erro", erro: erro ?? "A IA não devolveu a leitura." })
    return "erro"
  }
  await gravar({ situacao: "lido", erro: null, leitura, apuracao: apurarMes(leitura, regras) })
  return "lido"
}

/** Lê os itens pendentes, alguns por vez, dentro de um orçamento de tempo; a tela chama de novo até zerar. */
export async function lerItensPendentes(
  importacaoId: string,
  { orcamentoMs = 200_000, paralelos = 4 }: { orcamentoMs?: number; paralelos?: number } = {}
): Promise<{ lidos: number; erros: number; faltam: number }> {
  const inicio = Date.now()
  const admin = await createAdminClient()
  const regras = await regrasApuracaoPonto()
  let lidos = 0
  let erros = 0
  for (;;) {
    const { data } = await admin
      .from("pessoal_ponto_importacao_itens")
      .select("id, arquivo")
      .eq("importacao_id", importacaoId)
      .eq("emp_proprietaria_id", await tenantAtual())
      .eq("situacao", "pendente")
      .order("created_at")
      .limit(paralelos)
    const lote = data ?? []
    if (lote.length === 0 || Date.now() - inicio > orcamentoMs) break
    const r = await Promise.all(lote.map((i) => lerItem(i, regras)))
    lidos += r.filter((x) => x === "lido").length
    erros += r.filter((x) => x === "erro").length
  }
  const { count } = await admin
    .from("pessoal_ponto_importacao_itens")
    .select("id", { count: "exact", head: true })
    .eq("importacao_id", importacaoId)
    .eq("situacao", "pendente")
  return { lidos, erros, faltam: count ?? 0 }
}

/** Reapura os itens lidos (depois de mudar as regras), sem ler de novo. */
export async function reapurarImportacao(importacaoId: string): Promise<void> {
  const admin = await createAdminClient()
  const regras = await regrasApuracaoPonto()
  const { data } = await admin
    .from("pessoal_ponto_importacao_itens")
    .select("id, leitura")
    .eq("importacao_id", importacaoId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("situacao", "lido")
  for (const i of data ?? []) {
    if (!i.leitura) continue
    await admin
      .from("pessoal_ponto_importacao_itens")
      .update({ apuracao: apurarMes(i.leitura as LeituraCartao, regras) })
      .eq("id", i.id)
  }
}

// ── 3. Conferir ──────────────────────────────────────────────────────────────

export async function obterImportacao(id: string): Promise<Importacao | null> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data: imp, error } = await admin
    .from("pessoal_ponto_importacoes")
    .select("*")
    .eq("id", id)
    .eq("emp_proprietaria_id", emp)
    .maybeSingle()
  if (error || !imp) return null
  const { data: its } = await admin
    .from("pessoal_ponto_importacao_itens")
    .select("*")
    .eq("importacao_id", id)
    .order("created_at")
    .order("id")
  const linhas = (its ?? []) as Record<string, unknown>[]
  const nomes = await nomesDosUsuarios(
    [...linhas.map((l) => texto(l.funcionario_id)), texto(imp.criado_por)].filter((v): v is string => Boolean(v))
  )
  const itens = linhas
    .map((l) => ({
      id: String(l.id),
      paginas: (l.paginas as number[]) ?? [],
      nomeLido: texto(l.nome_lido),
      cpfLido: texto(l.cpf_lido),
      funcionarioId: texto(l.funcionario_id),
      funcionarioNome: texto(l.funcionario_id) ? (nomes.get(String(l.funcionario_id)) ?? null) : null,
      arquivo: String(l.arquivo),
      situacao: l.situacao as SituacaoItem,
      leitura: (l.leitura as LeituraCartao | null) ?? null,
      apuracao: (l.apuracao as Apuracao | null) ?? null,
      erro: texto(l.erro),
      registroId: texto(l.registro_id),
    }))
    .sort((a, b) => (a.paginas[0] ?? 0) - (b.paginas[0] ?? 0))
  return {
    id: String(imp.id),
    remessaId: String(imp.remessa_id),
    arquivo: String(imp.arquivo),
    nomeArquivo: texto(imp.nome_arquivo),
    paginas: Number(imp.paginas ?? 0),
    periodoInicio: texto(imp.periodo_inicio),
    periodoFim: texto(imp.periodo_fim),
    criadoEm: String(imp.created_at),
    criadoPor: texto(imp.criado_por) ? (nomes.get(String(imp.criado_por)) ?? null) : null,
    itens,
  }
}

export async function importacoesDaRemessa(remessaId: string): Promise<{ id: string; nomeArquivo: string | null; criadoEm: string; paginas: number }[]> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("pessoal_ponto_importacoes")
    .select("id, nome_arquivo, created_at, paginas")
    .eq("remessa_id", remessaId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .order("created_at", { ascending: false })
  if (error) return []
  return (data ?? []).map((d) => ({ id: d.id, nomeArquivo: d.nome_arquivo, criadoEm: d.created_at, paginas: d.paginas }))
}

/** Por que um item lido não pode ir para a remessa (null = pode). */
export function bloqueioDoItem(
  item: Pick<ItemImportacao, "situacao" | "funcionarioId" | "apuracao">,
  regras: RegrasApuracao,
  isentos: Set<string>
): string | null {
  if (item.situacao === "aplicado") return "Já aplicado."
  if (item.situacao === "descartado") return "Descartado."
  if (item.situacao !== "lido" || !item.apuracao) return "Ainda não lido."
  if (!item.funcionarioId) return "Escolha o funcionário."
  if (isentos.has(item.funcionarioId)) return "Isento de registro de ponto no mês."
  if (item.apuracao.semBatidas && regras.mesSemBatidas === "alertar") return "Mês sem batidas: não é lançado (regra da entidade)."
  return null
}

export async function isentosDaRemessa(remessaId: string): Promise<Set<string>> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("pessoal_registro_ponto_remessas")
    .select("nome_remessa, mes_referencia_os, ano_referencia_os")
    .eq("id", remessaId)
    .maybeSingle()
  const { inteiro } = await isentosNaCompetencia(data ? competenciaDaRemessa(data) : null)
  return new Set(inteiro.keys())
}

export async function associarFuncionario(itemId: string, funcionarioId: string | null): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin
    .from("pessoal_ponto_importacao_itens")
    .update({ funcionario_id: funcionarioId })
    .eq("id", itemId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .neq("situacao", "aplicado")
  return error ? { erro: error.message } : {}
}

export async function descartarItem(itemId: string, voltar = false): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("pessoal_ponto_importacao_itens")
    .select("leitura")
    .eq("id", itemId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  const situacao = voltar ? (data?.leitura ? "lido" : "pendente") : "descartado"
  const { error } = await admin
    .from("pessoal_ponto_importacao_itens")
    .update({ situacao })
    .eq("id", itemId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .neq("situacao", "aplicado")
  return error ? { erro: error.message } : {}
}

// ── 4. Aplicar à remessa ─────────────────────────────────────────────────────

/**
 * Cria ou atualiza o registro de cada funcionário: horas realizadas das duas
 * faixas (apuradas), o espelho (as páginas dele) e as marcações. Saldo da
 * remessa anterior e horas pagas ficam como estão (ou vêm da remessa anterior,
 * num registro novo); o saldo remanescente é refeito.
 */
export async function aplicarItens(
  importacaoId: string,
  itemIds: string[],
  usuarioId: string
): Promise<{ aplicados: number; pulados: string[]; erro?: string; funcionarios?: { id: string; nome: string }[] }> {
  const imp = await obterImportacao(importacaoId)
  if (!imp) return { aplicados: 0, pulados: [], erro: "Importação não encontrada." }
  const admin = await createAdminClient()
  const { data: remessa } = await admin
    .from("pessoal_registro_ponto_remessas")
    .select("id, ordem, finalizada")
    .eq("id", imp.remessaId)
    .maybeSingle()
  if (!remessa) return { aplicados: 0, pulados: [], erro: "Remessa não encontrada." }
  if (remessa.finalizada === true) return { aplicados: 0, pulados: [], erro: "A remessa está finalizada — reabra para aplicar." }

  const [regras, isentos, saldosAnt] = await Promise.all([
    regrasApuracaoPonto(),
    isentosDaRemessa(imp.remessaId),
    saldosAnterioresPonto(imp.remessaId),
  ])
  const { data: existentes } = await admin
    .from("pessoal_registro_ponto")
    .select("id, funcionario_id, horas_pagas_70, horas_pagas_100, saldo_remessa_anterior_70, saldo_remessa_anterior_100")
    .eq("remessa_id", imp.remessaId)
  const porFuncionario = new Map((existentes ?? []).map((r) => [String(r.funcionario_id), r]))

  let aplicados = 0
  const pulados: string[] = []
  // Quem foi aplicado: a tela pergunta se recalcula as remessas posteriores deles.
  const feitos: { id: string; nome: string }[] = []
  const usados = new Set<string>()
  for (const item of imp.itens.filter((i) => itemIds.includes(i.id))) {
    const nome = item.funcionarioNome ?? item.nomeLido ?? `páginas ${item.paginas.join(", ")}`
    const bloqueio = bloqueioDoItem(item, regras, isentos)
    if (bloqueio || !item.apuracao || !item.funcionarioId) {
      pulados.push(`${nome}: ${bloqueio ?? "sem apuração"}`)
      continue
    }
    if (usados.has(item.funcionarioId)) {
      pulados.push(`${nome}: aparece mais de uma vez na seleção.`)
      continue
    }
    usados.add(item.funcionarioId)
    const num = (v: unknown) => (v === null || v === undefined ? null : Number(v))
    const atual = porFuncionario.get(item.funcionarioId)
    const real70 = duasCasas(item.apuracao.realizadasFaixa1Min / 60)
    const real100 = duasCasas(item.apuracao.realizadasFaixa2Min / 60)
    const ant70 = atual ? num(atual.saldo_remessa_anterior_70) : (saldosAnt[item.funcionarioId]?.saldo70 ?? null)
    const ant100 = atual ? num(atual.saldo_remessa_anterior_100) : (saldosAnt[item.funcionarioId]?.saldo100 ?? null)
    const pag70 = atual ? num(atual.horas_pagas_70) : null
    const pag100 = atual ? num(atual.horas_pagas_100) : null
    const marcacoes = {
      departamento: item.leitura?.departamento ?? null,
      carga_diaria: item.leitura?.jornada[1]?.length ? item.leitura.jornada[1].join(" ") : null,
      dias: item.leitura?.dias ?? [],
    }
    const campos = {
      horas_realizadas_70: real70,
      horas_realizadas_100: real100,
      saldo_remessa_anterior_70: ant70,
      saldo_remessa_anterior_100: ant100,
      saldo_remanescente_70: duasCasas((ant70 ?? 0) + real70 - (pag70 ?? 0)),
      saldo_remanescente_100: duasCasas((ant100 ?? 0) + real100 - (pag100 ?? 0)),
      arquivo: item.arquivo,
      marcacoes,
      marcacoes_erro: null,
      marcacoes_lidas_em: new Date().toISOString(),
      // Nada vai ao funcionário ao aplicar (nem o registro que já estava
      // liberado): o gestor confere e libera na remessa.
      liberado: false,
    }
    let registroId = atual ? String(atual.id) : null
    if (registroId) {
      const { error } = await admin.from("pessoal_registro_ponto").update(campos).eq("id", registroId)
      if (error) {
        pulados.push(`${nome}: ${error.message}`)
        continue
      }
    } else {
      const { data: criado, error } = await admin
        .from("pessoal_registro_ponto")
        .insert({ ...campos, remessa_id: imp.remessaId, funcionario_id: item.funcionarioId, ordem: remessa.ordem })
        .select("id")
        .single()
      if (error || !criado) {
        pulados.push(`${nome}: ${error?.message ?? "não criado"}`)
        continue
      }
      registroId = criado.id
    }
    await admin
      .from("pessoal_ponto_importacao_itens")
      .update({ situacao: "aplicado", registro_id: registroId, aplicado_em: new Date().toISOString(), aplicado_por: usuarioId })
      .eq("id", item.id)
    aplicados++
    feitos.push({ id: item.funcionarioId, nome })
  }
  return { aplicados, pulados, funcionarios: feitos }
}
