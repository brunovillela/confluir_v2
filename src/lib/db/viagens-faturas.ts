import "server-only"

import { esquemaAusente, texto } from "@/lib/db/comum"
import { criarCompraDireta, subirPdfCompras } from "@/lib/db/compras"
import {
  contaDoGasto,
  listarContasDiaria,
  listarTiposDespesaDiaria,
  tiposDeViagem,
} from "@/lib/db/diarias-config"
import { rateioDaOrdem, type LinhaRateio } from "@/lib/db/ordens-rateio"
import { listarViagens } from "@/lib/db/viagens"
import { formatarData } from "@/lib/formato"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"
import type { BeneficiarioViagem, ModalPassagem, TipoItemViagem } from "@/lib/viagens-constantes"

/**
 * Faturas das agências. Uma fatura cobre vários itens (bilhetes, diárias de
 * hotel) de várias viagens; vira UMA aquisição direta em Compras, com a
 * ordem "Em autorização" (passa pela alçada) e o rateio por centro de custo.
 *
 * A conta de cada item vem do de-para das diárias — quadro de quem viaja ×
 * departamento que banca × tipo de gasto (Passagem/Hospedagem) — e pode ser
 * trocada na hora de faturar. A taxa da agência é rateada na proporção dos
 * itens. Ver supabase/viagens-faturas.sql.
 */

export type ItemFaturavel = {
  itemId: string
  viagemId: string
  viagemNumero: number | null
  beneficiarioNome: string
  beneficiarioTipo: BeneficiarioViagem
  departamentoId: string | null
  departamentoNome: string | null
  tipo: TipoItemViagem
  modal: ModalPassagem | null
  /** "Rio → Brasília · 05/10/2026" ou "Brasília · 05/10 a 07/10/2026". */
  descricao: string
  fornecedorId: string | null
  localizador: string | null
  valor: number | null
  contaSugerida: string | null
}

function descreverItem(i: {
  tipo: TipoItemViagem
  origem: string | null
  destino: string | null
  dataViagem: string | null
  cidade: string | null
  checkin: string | null
  checkout: string | null
}): string {
  if (i.tipo === "passagem") {
    return `${i.origem} → ${i.destino}${i.dataViagem ? ` · ${formatarData(i.dataViagem)}` : ""}`
  }
  return `${i.cidade}${i.checkin && i.checkout ? ` · ${formatarData(i.checkin)} a ${formatarData(i.checkout)}` : ""}`
}

/**
 * Itens reservados que ainda não entraram em fatura. Viagem cancelada entra
 * (a reserva pode ter custo); recusada não tem reserva.
 */
export async function itensFaturaveis(): Promise<{
  disponivel: boolean
  itens: ItemFaturavel[]
}> {
  const [{ disponivel, viagens }, { contas }, { tipos }] = await Promise.all([
    listarViagens(),
    listarContasDiaria().catch(() => ({ contas: [] })),
    listarTiposDespesaDiaria().catch(() => ({ tipos: [] })),
  ])
  const deViagem = tiposDeViagem(tipos)
  const itens: ItemFaturavel[] = []
  for (const v of viagens) {
    if (v.situacao === "recusada") continue
    for (const i of v.itens) {
      if (!i.reservado || i.faturaId) continue
      const tipoId = i.tipo === "passagem" ? deViagem.passagem : deViagem.hospedagem
      itens.push({
        itemId: i.id,
        viagemId: v.id,
        viagemNumero: v.numero,
        beneficiarioNome: v.beneficiarioNome,
        beneficiarioTipo: v.beneficiarioTipo,
        departamentoId: v.departamentoId,
        departamentoNome: v.departamentoNome,
        tipo: i.tipo,
        modal: i.modal,
        descricao: descreverItem(i),
        fornecedorId: i.fornecedorId,
        localizador: i.localizador,
        valor: i.valor,
        contaSugerida: tipoId
          ? contaDoGasto(contas, v.beneficiarioTipo, v.departamentoId, tipoId)
          : null,
      })
    }
  }
  return { disponivel, itens }
}

// ── Registrar ───────────────────────────────────────────────────────────────

export type NovaFatura = {
  fornecedorId: string
  numero: string
  emissao: string
  vencimento: string | null
  formaPagamento: string | null
  departamentoId: string | null
  taxas: number
  observacao: string | null
  arquivo: File
  linhas: { itemId: string; valor: number; centroCustoId: string }[]
}

const centavos = (v: number) => Math.round(v * 100)

/**
 * Taxa rateada na proporção dos itens, em centavos; a sobra do arredondamento
 * vai para o maior item, para a soma bater exato.
 */
function distribuirTaxa(valores: number[], taxa: number): number[] {
  const base = valores.map(centavos)
  const total = base.reduce((s, v) => s + v, 0)
  const taxaC = centavos(taxa)
  if (taxaC === 0 || total === 0) return base.map(() => 0)
  const partes = base.map((v) => Math.floor((v * taxaC) / total))
  const sobra = taxaC - partes.reduce((s, v) => s + v, 0)
  const maior = base.indexOf(Math.max(...base))
  partes[maior] += sobra
  return partes
}

export async function registrarFatura(
  nova: NovaFatura,
  usuarioId: string
): Promise<{ erro?: string; id?: string }> {
  if (!nova.fornecedorId) return { erro: "Escolha a agência." }
  if (!nova.numero.trim()) return { erro: "Informe o número da fatura." }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(nova.emissao)) return { erro: "Informe a data de emissão." }
  if (nova.linhas.length === 0) return { erro: "Marque os itens que a fatura cobre." }
  if (!Number.isFinite(nova.taxas) || nova.taxas < 0) return { erro: "Taxa inválida." }
  for (const l of nova.linhas) {
    if (!Number.isFinite(l.valor) || l.valor <= 0) {
      return { erro: "Todo item marcado precisa de valor maior que zero." }
    }
    if (!l.centroCustoId) {
      return { erro: "Todo item marcado precisa de conta — defina no de-para ou escolha na linha." }
    }
  }

  const { itens } = await itensFaturaveis()
  const porId = new Map(itens.map((i) => [i.itemId, i]))
  const fora = nova.linhas.filter((l) => !porId.has(l.itemId))
  if (fora.length) {
    return { erro: "Algum item marcado já foi faturado ou deixou de estar reservado — recarregue." }
  }

  // Departamento da compra: o informado ou o que mais pesa nos itens.
  const pesoDepto = new Map<string, number>()
  for (const l of nova.linhas) {
    const d = porId.get(l.itemId)!.departamentoId
    if (d) pesoDepto.set(d, (pesoDepto.get(d) ?? 0) + l.valor)
  }
  const departamentoId =
    nova.departamentoId ?? [...pesoDepto].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
  if (!departamentoId) {
    return { erro: "Escolha o departamento da compra — nenhum item tem departamento." }
  }

  // Valores em centavos: itens + parte da taxa de cada um.
  const taxaPorLinha = distribuirTaxa(
    nova.linhas.map((l) => l.valor),
    nova.taxas
  )
  const valorItensC = nova.linhas.reduce((s, l) => s + centavos(l.valor), 0)
  const totalC = valorItensC + centavos(nova.taxas)

  const grupos = new Map<string, { valorC: number; itens: ItemFaturavel[]; deptos: Set<string> }>()
  nova.linhas.forEach((l, i) => {
    const item = porId.get(l.itemId)!
    const g = grupos.get(l.centroCustoId) ?? { valorC: 0, itens: [], deptos: new Set<string>() }
    g.valorC += centavos(l.valor) + taxaPorLinha[i]
    g.itens.push(item)
    if (item.departamentoId) g.deptos.add(item.departamentoId)
    grupos.set(l.centroCustoId, g)
  })
  const ordenados = [...grupos].sort((a, b) => b[1].valorC - a[1].valorC)
  const contaPrincipal = ordenados[0][0]

  const { caminho, erro: erroArquivo } = await subirPdfCompras("viagens/faturas", nova.arquivo)
  if (erroArquivo || !caminho) return { erro: erroArquivo ?? "Falha ao subir a fatura." }

  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const apagarArquivo = () => admin.storage.from("compras").remove([caminho])

  // 1. A fatura.
  const { data: fatura, error: erroFatura } = await admin
    .from("viagens_faturas")
    .insert({
      emp_proprietaria_id: emp,
      fornecedor_id: nova.fornecedorId,
      numero: nova.numero.trim(),
      emissao: nova.emissao,
      vencimento: nova.vencimento,
      forma_pagamento: nova.formaPagamento,
      departamento_id: departamentoId,
      valor_itens: valorItensC / 100,
      valor_taxas: centavos(nova.taxas) / 100,
      valor_total: totalC / 100,
      arquivo: caminho,
      observacao: nova.observacao,
      criado_por: usuarioId,
    })
    .select("id")
    .single()
  if (erroFatura || !fatura) {
    await apagarArquivo()
    if (erroFatura?.code === "23505") return { erro: "Esta fatura desta agência já foi lançada." }
    if (erroFatura && esquemaAusente(erroFatura)) {
      return { erro: "Faturas ainda não configuradas — rode supabase/viagens-faturas.sql." }
    }
    return { erro: `Não foi possível registrar a fatura: ${erroFatura?.message}` }
  }
  const faturaId = String(fatura.id)

  const desfazerItensEFatura = async () => {
    await admin
      .from("viagens_itens")
      .update({ fatura_id: null, centro_custo_id: null })
      .eq("fatura_id", faturaId)
    await admin.from("viagens_faturas").delete().eq("id", faturaId)
    await apagarArquivo()
  }

  // 2. Os itens: presos à fatura só se ainda estiverem livres (corrida).
  for (const l of nova.linhas) {
    const { data, error } = await admin
      .from("viagens_itens")
      .update({
        fatura_id: faturaId,
        valor: l.valor,
        centro_custo_id: l.centroCustoId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", l.itemId)
      .is("fatura_id", null)
      .select("id")
    if (error || !data?.length) {
      await desfazerItensEFatura()
      return {
        erro: error
          ? `Não foi possível vincular os itens: ${error.message}`
          : "Outra pessoa faturou um destes itens agora — recarregue.",
      }
    }
  }

  // 3. A aquisição direta: processo + fornecimento + ordem "Em autorização".
  const viagensNums = [...new Set(nova.linhas.map((l) => porId.get(l.itemId)!.viagemNumero))]
    .filter((n): n is number => n !== null)
    .sort((a, b) => a - b)
  const { id: processoId, ordemId, erro: erroCompra } = await criarCompraDireta({
    produto: `Passagens e hospedagens — fatura ${nova.numero.trim()}`,
    e_produto: false,
    observacao: [
      `Viagens nº ${viagensNums.join(", ")}.`,
      nova.taxas > 0 ? `Inclui taxa da agência de R$ ${nova.taxas.toFixed(2).replace(".", ",")}.` : null,
      nova.observacao,
    ]
      .filter(Boolean)
      .join(" "),
    departamento_id: departamentoId,
    centro_custo_id: contaPrincipal,
    projeto_id: null,
    data_limite: null,
    local_entrega: null,
    solicitante_id: usuarioId,
    fornecedor_id: nova.fornecedorId,
    valor: totalC / 100,
    forma_pagamento: nova.formaPagamento,
    data_compra: nova.emissao,
    vencimento: nova.vencimento,
    comprador_id: usuarioId,
    nota_fiscal_url: caminho,
    // Serviço: não passa por "Recebimentos pendentes".
    ja_recebido: true,
    recebedor_id: usuarioId,
  })
  if (erroCompra || !processoId || !ordemId) {
    await desfazerItensEFatura()
    return { erro: erroCompra ?? "Não foi possível gerar a compra." }
  }

  // 4. Rateio: só quando há mais de uma conta (uma só já é a conta da ordem).
  if (ordenados.length > 1) {
    const { error: erroRateio } = await admin.from("ordens_pagamento_rateio").insert(
      ordenados.map(([centro, g], i) => ({
        ordem_id: ordemId,
        centro_custo_despesa_id: centro,
        departamento_id: g.deptos.size === 1 ? [...g.deptos][0] : departamentoId,
        descricao: `Viagens nº ${[...new Set(g.itens.map((x) => x.viagemNumero))].join(", ")} — ${g.itens.length} ${g.itens.length === 1 ? "item" : "itens"}`,
        valor: g.valorC / 100,
        ordem: i,
        emp_proprietaria_id: emp,
      }))
    )
    if (erroRateio) console.error("Falha ao gravar o rateio da fatura:", erroRateio.message)
  }

  await admin
    .from("viagens_faturas")
    .update({ processo_compra_id: processoId, ordem_pagamento_id: ordemId })
    .eq("id", faturaId)

  return { id: faturaId }
}

// ── Leitura ─────────────────────────────────────────────────────────────────

export type Fatura = {
  id: string
  numero: string
  fornecedorId: string
  fornecedorNome: string | null
  emissao: string
  vencimento: string | null
  formaPagamento: string | null
  departamentoNome: string | null
  valorItens: number
  valorTaxas: number
  valorTotal: number
  arquivo: string
  observacao: string | null
  processoId: string | null
  processoCodigo: string | null
  ordemId: string | null
  ordemCodigo: string | null
  ordemSituacao: string | null
  createdAt: string
}

const SELECT_FATURA =
  "id, numero, fornecedor_id, emissao, vencimento, forma_pagamento, valor_itens, valor_taxas, valor_total, arquivo, observacao, processo_compra_id, ordem_pagamento_id, created_at, fornecedor:empresa!viagens_faturas_fornecedor_id_fkey(nome_fantasia, nome_razao), empresa_departamentos(departamento), compras_solicitacoes(codigo), ordens_pagamento(codigo, situacao)"

function mapFatura(f: Record<string, unknown>): Fatura {
  const forn = f.fornecedor as { nome_fantasia?: unknown; nome_razao?: unknown } | null
  const depto = f.empresa_departamentos as { departamento?: unknown } | null
  const processo = f.compras_solicitacoes as { codigo?: unknown } | null
  const ordem = f.ordens_pagamento as { codigo?: unknown; situacao?: unknown } | null
  return {
    id: String(f.id),
    numero: String(f.numero ?? ""),
    fornecedorId: String(f.fornecedor_id),
    fornecedorNome: forn ? (texto(forn.nome_fantasia) ?? texto(forn.nome_razao)) : null,
    emissao: String(f.emissao),
    vencimento: texto(f.vencimento),
    formaPagamento: texto(f.forma_pagamento),
    departamentoNome: texto(depto?.departamento),
    valorItens: Number(f.valor_itens ?? 0),
    valorTaxas: Number(f.valor_taxas ?? 0),
    valorTotal: Number(f.valor_total ?? 0),
    arquivo: String(f.arquivo ?? ""),
    observacao: texto(f.observacao),
    processoId: texto(f.processo_compra_id),
    processoCodigo: texto(processo?.codigo),
    ordemId: texto(f.ordem_pagamento_id),
    ordemCodigo: texto(ordem?.codigo),
    ordemSituacao: texto(ordem?.situacao),
    createdAt: String(f.created_at),
  }
}

export async function listarFaturas(): Promise<{ disponivel: boolean; faturas: Fatura[] }> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("viagens_faturas")
    .select(SELECT_FATURA)
    .eq("emp_proprietaria_id", await tenantAtual())
    .order("emissao", { ascending: false })
    .order("created_at", { ascending: false })
    .range(0, 999)
  if (error) {
    if (esquemaAusente(error)) return { disponivel: false, faturas: [] }
    throw new Error(`Falha ao listar as faturas: ${error.message}`)
  }
  return { disponivel: true, faturas: (data ?? []).map((f) => mapFatura(f as Record<string, unknown>)) }
}

export type ItemDaFatura = {
  itemId: string
  viagemId: string
  viagemNumero: number | null
  beneficiarioNome: string
  tipo: TipoItemViagem
  modal: ModalPassagem | null
  descricao: string
  localizador: string | null
  valor: number | null
  centroCustoNome: string | null
}

export async function buscarFatura(id: string): Promise<{
  fatura: Fatura
  itens: ItemDaFatura[]
  rateio: LinhaRateio[]
} | null> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("viagens_faturas")
    .select(SELECT_FATURA)
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("id", id)
    .maybeSingle()
  if (error) {
    if (esquemaAusente(error)) return null
    throw new Error(`Falha ao buscar a fatura: ${error.message}`)
  }
  if (!data) return null
  const fatura = mapFatura(data as Record<string, unknown>)

  const { viagens } = await listarViagens()
  const doItem = viagens.flatMap((v) =>
    v.itens.filter((i) => i.faturaId === id).map((i) => ({ v, i }))
  )
  const { data: brutos } = await admin
    .from("viagens_itens")
    .select("id, centros_de_custo(nome_da_conta)")
    .eq("fatura_id", id)
  const conta = new Map(
    ((brutos ?? []) as Record<string, unknown>[]).map((b) => [
      String(b.id),
      texto((b.centros_de_custo as { nome_da_conta?: unknown } | null)?.nome_da_conta),
    ])
  )
  const itens = doItem.map(({ v, i }) => ({
    itemId: i.id,
    viagemId: v.id,
    viagemNumero: v.numero,
    beneficiarioNome: v.beneficiarioNome,
    tipo: i.tipo,
    modal: i.modal,
    descricao: descreverItem(i),
    localizador: i.localizador,
    valor: i.valor,
    centroCustoNome: conta.get(i.id) ?? null,
  }))
  const rateio = fatura.ordemId ? await rateioDaOrdem(fatura.ordemId) : []
  return { fatura, itens, rateio }
}

/**
 * Desfaz a fatura enquanto a ordem ainda não foi autorizada: apaga ordem,
 * fornecimento e processo, e devolve os itens para "a faturar".
 */
export async function desfazerFatura(id: string): Promise<{ erro?: string }> {
  const achada = await buscarFatura(id)
  if (!achada) return { erro: "Fatura não encontrada." }
  const { fatura } = achada
  if (fatura.ordemSituacao && fatura.ordemSituacao !== "Em autorização") {
    return {
      erro: `A ordem já está "${fatura.ordemSituacao}" — peça ao financeiro para cancelá-la antes.`,
    }
  }
  const admin = await createAdminClient()
  if (fatura.processoId) {
    await admin.from("compras_fornecimentos").delete().eq("processo_id", fatura.processoId)
  }
  if (fatura.ordemId) {
    const { error } = await admin.from("ordens_pagamento").delete().eq("id", fatura.ordemId)
    if (error) return { erro: `Não foi possível apagar a ordem: ${error.message}` }
  }
  if (fatura.processoId) {
    await admin.from("compras_solicitacoes").delete().eq("id", fatura.processoId)
  }
  await admin
    .from("viagens_itens")
    .update({ fatura_id: null, centro_custo_id: null })
    .eq("fatura_id", id)
  const { error } = await admin.from("viagens_faturas").delete().eq("id", id)
  if (error) return { erro: `Não foi possível apagar a fatura: ${error.message}` }
  await admin.storage.from("compras").remove([fatura.arquivo])
  return {}
}
