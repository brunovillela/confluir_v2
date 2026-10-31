import "server-only"

import type { LeituraContracheque } from "@/lib/contracheque-leitura"
import { esquemaAusente, nomesDosUsuarios, texto } from "@/lib/db/comum"
import { lerContrachequePdf } from "@/lib/db/contracheque-ia"
import { gerarOrdemDoContracheque, obterConfigContracheques } from "@/lib/db/contracheques-ordens"
import { guardarPartes, separarPorFuncionario, textoDasPaginas } from "@/lib/db/pdf-por-funcionario"
import { naturezaRemessaContracheques } from "@/lib/db/pessoal"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * IMPORTAÇÃO DA FOLHA DE CONTRACHEQUES (30/10/2026).
 *
 * O mesmo caminho do relatório de ponto (lib/db/ponto-importacao), sem saldo:
 * o PDF da folha (global, parcial ou de um funcionário) é dividido por
 * funcionário (lib/db/pdf-por-funcionario), a IA lê o líquido, os totais e a
 * competência de cada um, o gestor confere e aplica. Cada contracheque entra
 * BLOQUEADO ao funcionário (nada é avisado) e, com a geração de ordens ligada
 * na configuração, gera a ordem de pagamento como o registro manual. Quem já
 * tem contracheque na remessa é pulado: para trocar, exclui-se o antigo.
 */

export type SituacaoItemCC = "pendente" | "lido" | "erro" | "aplicado" | "descartado"

export type ItemImportacaoCC = {
  id: string
  paginas: number[]
  nomeLido: string | null
  cpfLido: string | null
  funcionarioId: string | null
  funcionarioNome: string | null
  arquivo: string
  situacao: SituacaoItemCC
  leitura: LeituraContracheque | null
  erro: string | null
  contrachequeId: string | null
}

export type ImportacaoCC = {
  id: string
  remessaId: string
  arquivo: string
  nomeArquivo: string | null
  paginas: number
  criadoEm: string
  criadoPor: string | null
  itens: ItemImportacaoCC[]
}

const TABELA = "pessoal_contracheque_importacoes"
const ITENS = "pessoal_contracheque_importacao_itens"
const PASTA = (remessaId: string) => `contracheques/${remessaId}/importacoes`

// ── 1. Receber e dividir ─────────────────────────────────────────────────────

export async function criarImportacaoCC({
  remessaId,
  arquivo,
  usuarioId,
}: {
  remessaId: string
  arquivo: File
  usuarioId: string
}): Promise<{ id?: string; erro?: string }> {
  if (arquivo.type !== "application/pdf" && !/\.pdf$/i.test(arquivo.name)) return { erro: "Envie a folha em PDF." }
  const bytes = new Uint8Array(await arquivo.arrayBuffer())
  const lidas = await textoDasPaginas(bytes)
  if ("erro" in lidas) return lidas

  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data: remessa } = await admin
    .from("pessoal_contracheques_remessas")
    .select("id, finalizada")
    .eq("id", remessaId)
    .eq("emp_proprietaria_id", emp)
    .maybeSingle()
  if (!remessa) return { erro: "Remessa não encontrada." }
  if (remessa.finalizada === true) return { erro: "A remessa está finalizada — reabra para importar." }

  const partes = await separarPorFuncionario(lidas.paginas)
  const id = crypto.randomUUID()
  const guardado = await guardarPartes(bytes, partes, PASTA(remessaId), id)
  if ("erro" in guardado) return guardado

  const { error } = await admin.from(TABELA).insert({
    id,
    emp_proprietaria_id: emp,
    remessa_id: remessaId,
    arquivo: guardado.original,
    nome_arquivo: arquivo.name,
    paginas: lidas.paginas.length,
    criado_por: usuarioId,
  })
  if (error) {
    return {
      erro: esquemaAusente(error)
        ? "A importação ainda não está configurada no banco (migração contracheque_importacao)."
        : `Não foi possível registrar a importação: ${error.message}`,
    }
  }
  const ins = await admin.from(ITENS).insert(
    partes.map((p, i) => ({
      emp_proprietaria_id: emp,
      importacao_id: id,
      paginas: p.paginas,
      cpf_lido: p.cpf,
      nome_lido: p.nome,
      funcionario_id: p.funcionarioId,
      arquivo: guardado.caminhos[i],
    }))
  )
  if (ins.error) return { erro: `Não foi possível registrar os funcionários: ${ins.error.message}` }
  return { id }
}

// ── 2. Ler com a IA ──────────────────────────────────────────────────────────

async function lerItem(item: { id: string; arquivo: string }): Promise<"lido" | "erro"> {
  const admin = await createAdminClient()
  const gravar = (campos: Record<string, unknown>) =>
    admin.from(ITENS).update({ ...campos, lido_em: new Date().toISOString() }).eq("id", item.id)
  const { data: blob } = await admin.storage.from("pessoal").download(item.arquivo)
  if (!blob) {
    await gravar({ situacao: "erro", erro: "Páginas não encontradas no armazenamento." })
    return "erro"
  }
  const { leitura, erro } = await lerContrachequePdf(new Uint8Array(await blob.arrayBuffer()))
  if (erro || !leitura) {
    await gravar({ situacao: "erro", erro: erro ?? "A IA não devolveu a leitura." })
    return "erro"
  }
  await gravar({ situacao: "lido", erro: null, leitura })
  return "lido"
}

/**
 * Lê UM lote de itens pendentes (até `paralelos`, em paralelo) e devolve
 * quantos faltam; a tela chama de novo até zerar (hooks/use-leitura-em-lotes).
 * Um lote só por chamada: vários estouravam o tempo da função (cada leitura
 * da IA leva até um minuto ou mais) e a leitura parava no meio.
 */
export async function lerPendentesCC(
  importacaoId: string,
  { paralelos = 4 }: { paralelos?: number } = {}
): Promise<{ lidos: number; erros: number; faltam: number }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data } = await admin
    .from(ITENS)
    .select("id, arquivo")
    .eq("importacao_id", importacaoId)
    .eq("emp_proprietaria_id", emp)
    .eq("situacao", "pendente")
    .order("created_at")
    .limit(paralelos)
  const r = await Promise.all((data ?? []).map((i) => lerItem(i)))
  const { count } = await admin
    .from(ITENS)
    .select("id", { count: "exact", head: true })
    .eq("importacao_id", importacaoId)
    .eq("situacao", "pendente")
  return { lidos: r.filter((x) => x === "lido").length, erros: r.filter((x) => x === "erro").length, faltam: count ?? 0 }
}

// ── 3. Conferir ──────────────────────────────────────────────────────────────

export async function obterImportacaoCC(id: string): Promise<ImportacaoCC | null> {
  const admin = await createAdminClient()
  const { data: imp, error } = await admin
    .from(TABELA)
    .select("*")
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (error || !imp) return null
  const { data: its } = await admin.from(ITENS).select("*").eq("importacao_id", id).order("created_at").order("id")
  const linhas = (its ?? []) as Record<string, unknown>[]
  const nomes = await nomesDosUsuarios(
    [...linhas.map((l) => texto(l.funcionario_id)), texto(imp.criado_por)].filter((v): v is string => Boolean(v))
  )
  const itens = linhas
    .map((l) => {
      const contrachequeId = texto(l.contracheque_id)
      // Contracheque aplicado e depois excluído na remessa: o item volta a poder ser aplicado.
      const situacao = l.situacao === "aplicado" && !contrachequeId ? "lido" : (l.situacao as SituacaoItemCC)
      return {
        id: String(l.id),
        paginas: (l.paginas as number[]) ?? [],
        nomeLido: texto(l.nome_lido),
        cpfLido: texto(l.cpf_lido),
        funcionarioId: texto(l.funcionario_id),
        funcionarioNome: texto(l.funcionario_id) ? (nomes.get(String(l.funcionario_id)) ?? null) : null,
        arquivo: String(l.arquivo),
        situacao,
        leitura: (l.leitura as LeituraContracheque | null) ?? null,
        erro: texto(l.erro),
        contrachequeId,
      }
    })
    .sort((a, b) => (a.paginas[0] ?? 0) - (b.paginas[0] ?? 0))
  return {
    id: String(imp.id),
    remessaId: String(imp.remessa_id),
    arquivo: String(imp.arquivo),
    nomeArquivo: texto(imp.nome_arquivo),
    paginas: Number(imp.paginas ?? 0),
    criadoEm: String(imp.created_at),
    criadoPor: texto(imp.criado_por) ? (nomes.get(String(imp.criado_por)) ?? null) : null,
    itens,
  }
}

export async function importacoesDaRemessaCC(
  remessaId: string
): Promise<{ id: string; nomeArquivo: string | null; criadoEm: string; paginas: number }[]> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from(TABELA)
    .select("id, nome_arquivo, created_at, paginas")
    .eq("remessa_id", remessaId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .order("created_at", { ascending: false })
  if (error) return []
  return (data ?? []).map((d) => ({ id: d.id, nomeArquivo: d.nome_arquivo, criadoEm: d.created_at, paginas: d.paginas }))
}

/** Funcionários que já têm contracheque nesta remessa (a importação pula). */
export async function comContrachequeNaRemessa(remessaId: string): Promise<Set<string>> {
  const admin = await createAdminClient()
  const { data } = await admin.from("pessoal_contracheques").select("funcionario_id").eq("remessa_id", remessaId)
  return new Set((data ?? []).map((r) => String(r.funcionario_id)))
}

/** Por que um item não pode ir para a remessa (null = pode). */
export function bloqueioDoItemCC(
  item: Pick<ItemImportacaoCC, "situacao" | "funcionarioId" | "leitura">,
  jaTem: Set<string>,
  exigeLiquido: boolean
): string | null {
  if (item.situacao === "aplicado") return "Já aplicado."
  if (item.situacao === "descartado") return "Descartado."
  if (item.situacao !== "lido" || !item.leitura) return "Ainda não lido."
  if (!item.funcionarioId) return "Escolha o funcionário."
  if (jaTem.has(item.funcionarioId)) return "Já tem contracheque nesta remessa: exclua o antigo para trocar."
  if (exigeLiquido && (item.leitura.valorLiquido === null || item.leitura.valorLiquido <= 0)) {
    return "Sem valor líquido: a ordem de pagamento precisa dele."
  }
  return null
}

export async function associarFuncionarioCC(itemId: string, funcionarioId: string | null): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin
    .from(ITENS)
    .update({ funcionario_id: funcionarioId })
    .eq("id", itemId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .is("contracheque_id", null)
  return error ? { erro: error.message } : {}
}

export async function descartarItemCC(itemId: string, voltar = false): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data } = await admin.from(ITENS).select("leitura").eq("id", itemId).eq("emp_proprietaria_id", emp).maybeSingle()
  const situacao = voltar ? (data?.leitura ? "lido" : "pendente") : "descartado"
  const { error } = await admin
    .from(ITENS)
    .update({ situacao })
    .eq("id", itemId)
    .eq("emp_proprietaria_id", emp)
    .is("contracheque_id", null)
  return error ? { erro: error.message } : {}
}

// ── 4. Aplicar à remessa ─────────────────────────────────────────────────────

/**
 * Cria o contracheque de cada funcionário marcado: o PDF dele (as páginas
 * separadas), o valor líquido lido e — com a geração ligada — a ordem de
 * pagamento. Sempre bloqueado ao funcionário.
 */
export async function aplicarItensCC(
  importacaoId: string,
  itemIds: string[],
  usuarioId: string
): Promise<{ aplicados: number; ordens: number; semDadosBancarios: string[]; pulados: string[]; erro?: string }> {
  const vazio = { aplicados: 0, ordens: 0, semDadosBancarios: [], pulados: [] }
  const imp = await obterImportacaoCC(importacaoId)
  if (!imp) return { ...vazio, erro: "Importação não encontrada." }
  const admin = await createAdminClient()
  const { data: remessa } = await admin
    .from("pessoal_contracheques_remessas")
    .select("*")
    .eq("id", imp.remessaId)
    .maybeSingle()
  if (!remessa) return { ...vazio, erro: "Remessa não encontrada." }
  if (remessa.finalizada === true) return { ...vazio, erro: "A remessa está finalizada — reabra para aplicar." }

  const config = await obterConfigContracheques()
  if (config.gerarOrdem && !config.centroCustoId) {
    return {
      ...vazio,
      erro: "Defina o centro de custo da folha em Contracheques → Configuração antes de aplicar (ou desligue ali a geração de ordens).",
    }
  }
  const dadosRemessa = {
    id: imp.remessaId,
    nome: (remessa.nome_remessa as string | null) ?? null,
    natureza: naturezaRemessaContracheques(remessa),
    dataPagamento: (remessa.data_pagamento as string | null) ?? null,
  }
  const jaTem = await comContrachequeNaRemessa(imp.remessaId)

  let aplicados = 0
  let ordens = 0
  const pulados: string[] = []
  const semDadosBancarios: string[] = []
  for (const item of imp.itens.filter((i) => itemIds.includes(i.id))) {
    const nome = item.funcionarioNome ?? item.nomeLido ?? `páginas ${item.paginas.join(", ")}`
    const bloqueio = bloqueioDoItemCC(item, jaTem, config.gerarOrdem)
    if (bloqueio || !item.funcionarioId || !item.leitura) {
      pulados.push(`${nome}: ${bloqueio ?? "sem leitura"}`)
      continue
    }
    const liquido = item.leitura.valorLiquido
    const { data: criado, error } = await admin
      .from("pessoal_contracheques")
      .insert({
        remessa_id: imp.remessaId,
        funcionario_id: item.funcionarioId,
        ordem: remessa.ordem,
        // Nada vai ao funcionário ao aplicar: o gestor confere e libera na remessa.
        liberado: false,
        arquivo: item.arquivo,
        ...(liquido !== null && config.disponivel ? { valor_liquido: liquido } : {}),
      })
      .select("id")
      .single()
    if (error || !criado) {
      pulados.push(`${nome}: ${error?.message ?? "não criado"}`)
      continue
    }
    if (config.gerarOrdem && liquido !== null) {
      const { data: pdf } = await admin.storage.from("pessoal").download(item.arquivo)
      const ordem = pdf
        ? await gerarOrdemDoContracheque({
            contrachequeId: criado.id,
            funcionarioId: item.funcionarioId,
            remessa: dadosRemessa,
            valorLiquido: liquido,
            pdf,
          })
        : { erro: "PDF não encontrado no armazenamento." }
      if (ordem.erro) {
        // Como no registro manual: sem ordem, o contracheque não vale.
        await admin.from("pessoal_contracheques").delete().eq("id", criado.id)
        pulados.push(`${nome}: ${ordem.erro}`)
        continue
      }
      ordens++
      if ("semDadosBancarios" in ordem && ordem.semDadosBancarios) semDadosBancarios.push(nome)
    }
    jaTem.add(item.funcionarioId)
    await admin
      .from(ITENS)
      .update({ situacao: "aplicado", contracheque_id: criado.id, aplicado_em: new Date().toISOString(), aplicado_por: usuarioId })
      .eq("id", item.id)
    aplicados++
  }
  return { aplicados, ordens, semDadosBancarios, pulados }
}
