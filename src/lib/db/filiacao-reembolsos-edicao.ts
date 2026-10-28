import "server-only"
import { inserirOrdemVerificada } from "@/lib/db/ordens-verificacao"
import { registrarEvento, usuarioDaTrilha } from "@/lib/db/ordens-ciclo"
import { cpfConfiavel, formatarCpf, grafiasDoCpf } from "@/lib/cpf"
import { donosDaPessoa, filtroDosDonos } from "@/lib/db/dados-bancarios-pessoa"

import { gerarCodigoProcesso, subirComprovanteCompras } from "@/lib/db/compras"
import { hojeSP, lerEmLotes, texto } from "@/lib/db/comum"
import { invalidarCacheProntuarios } from "@/lib/db/prontuario"
import { formatarMoeda } from "@/lib/formato"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"
import { ehTipoReembolso, type TipoReembolso } from "@/lib/reembolsos-tipos"

/**
 * Lançamento de reembolsos a filiados — o que a entidade devolve ao associado:
 * desconto salarial de greve, cobrança indevida, despesa em atividade
 * sindical (o `tipo`, 28/10/2026).
 *
 * Cada lançamento gera, no mesmo ato, a ordem de pagamento no Financeiro
 * (tipo "Reembolso", "Em autorização" — a autorização é sempre humana, pela
 * alçada) e um apontamento no prontuário do filiado. O centro de custo vem da
 * configuração; o valor é informado a cada lançamento. Vários de uma vez:
 * `conferirLoteReembolsos` + `criarReembolso` por linha.
 *
 * O COMPROVANTE (opcional, 20/10/2026) é a nota fiscal da ordem: fica em
 * `ordens_pagamento.arquivo_nota_fiscal` (bucket compras, notas/…), sem coluna
 * própria no reembolso — o Financeiro e a auditoria já o enxergam ali.
 *
 * Leitura no perfil do filiado: `filiacao-reembolsos.ts`.
 */

export type ReembolsoLinha = {
  id: string
  data: string | null
  tipo: TipoReembolso
  justificativa: string | null
  valor: number | null
  filiadoId: string | null
  filiadoNome: string | null
  filiadoCpf: string | null
  projetoId: string | null
  projeto: string | null
  prontuarioId: string | null
  ordem: {
    id: string
    codigo: string | null
    situacao: string | null
    valor_pago: number | null
    data_pagamento: string | null
    excluido: boolean | null
    /** Comprovante do reembolso — é a nota fiscal da ordem. */
    arquivo_nota_fiscal: string | null
  } | null
}

export type FiltroReembolsos = {
  busca?: string
  de?: string
  ate?: string
  situacao?: "pendentes" | "pagos" | "todos"
  tipo?: TipoReembolso
  filiadoId?: string
  pagina?: number
}

export type ConfigReembolsoCompleta = {
  centroCustoId: string | null
}

export type DadosReembolso = {
  filiadoId: string
  data: string
  tipo: TipoReembolso
  justificativa: string
  projetoId: string | null
  valor: number
  /** Comprovante da despesa (opcional): vira a nota fiscal da ordem. */
  comprovante?: File | null
}

type Resultado = { ok: true; id: string } | { erro: string }

export const POR_PAGINA = 50

const SELECT_LINHA =
  "id, data, tipo, justificativa, valor, filiado_id, projeto_id, prontuario_id, filiado:filiado_id(nome_completo, cpf), projeto:projeto_id(descricao_sumaria, descricao), ordem:ordem_pagamento_id(id, codigo, situacao, valor_pago, data_pagamento, excluido, arquivo_nota_fiscal)"

const um = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v)

function paraLinha(r: Record<string, unknown>): ReembolsoLinha {
  const filiado = um(r.filiado as Record<string, string | null> | Record<string, string | null>[] | null)
  const projeto = um(r.projeto as Record<string, string | null> | Record<string, string | null>[] | null)
  const ordem = um(r.ordem as ReembolsoLinha["ordem"] | ReembolsoLinha["ordem"][] | null)
  return {
    id: r.id as string,
    data: (r.data as string | null) ?? null,
    tipo: ehTipoReembolso(r.tipo) ? r.tipo : "outro",
    justificativa: (r.justificativa as string | null) ?? null,
    valor: typeof r.valor === "number" ? r.valor : r.valor ? Number(r.valor) : null,
    filiadoId: (r.filiado_id as string | null) ?? null,
    filiadoNome: filiado?.nome_completo ?? null,
    filiadoCpf: filiado?.cpf ?? null,
    projetoId: (r.projeto_id as string | null) ?? null,
    projeto: projeto?.descricao_sumaria ?? projeto?.descricao ?? null,
    prontuarioId: (r.prontuario_id as string | null) ?? null,
    ordem: ordem ?? null,
  }
}

// ── Leitura ────────────────────────────────────────────────────────────────

/** A consulta da lista com os filtros da tela — a página, os totais e a planilha. */
function consultaFiltrada(
  admin: Awaited<ReturnType<typeof createAdminClient>>,
  emp: string,
  filtro: FiltroReembolsos,
  select: string,
  contar = false
) {
  let q = admin
    .from("filiacao_reembolsos")
    .select(select, contar ? { count: "exact" } : undefined)
    .eq("emp_proprietaria_id", emp)
  if (filtro.filiadoId) q = q.eq("filiado_id", filtro.filiadoId)
  if (filtro.tipo) q = q.eq("tipo", filtro.tipo)
  if (filtro.de) q = q.gte("data", filtro.de)
  if (filtro.ate) q = q.lte("data", filtro.ate)
  if (filtro.situacao === "pagos") q = q.eq("ordem.situacao", "Paga")
  if (filtro.situacao === "pendentes") q = q.neq("ordem.situacao", "Paga")

  const busca = (filtro.busca ?? "").trim()
  if (busca) {
    const digitos = busca.replace(/\D/g, "")
    q = digitos.length >= 3
      ? q.or(`cpf.ilike.%${digitos}%,nome_completo.ilike.%${busca}%`, { referencedTable: "filiado" })
      : q.ilike("filiado.nome_completo", `%${busca}%`)
    q = q.not("filiado", "is", null)
  }
  if (filtro.situacao === "pagos" || filtro.situacao === "pendentes") q = q.not("ordem", "is", null)
  return q
}

export async function listarReembolsos(
  filtro: FiltroReembolsos = {}
): Promise<{ linhas: ReembolsoLinha[]; total: number }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const pagina = Math.max(1, filtro.pagina ?? 1)

  const { data, error, count } = await consultaFiltrada(admin, emp, filtro, SELECT_LINHA, true)
    .order("data", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .range((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA - 1)
  if (error) {
    if (/does not exist|schema cache/i.test(error.message)) return { linhas: [], total: 0 }
    throw new Error(`Falha ao listar reembolsos: ${error.message}`)
  }
  return { linhas: (data ?? []).map((r) => paraLinha(r as unknown as Record<string, unknown>)), total: count ?? 0 }
}

/** Todas as linhas do filtro, sem paginar — a planilha da lista. */
export async function todosReembolsos(filtro: FiltroReembolsos = {}): Promise<ReembolsoLinha[]> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const data = await lerEmLotes<Record<string, unknown>>((de, ate) =>
    consultaFiltrada(admin, emp, filtro, SELECT_LINHA)
      .order("data", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .order("id")
      .range(de, ate)
  )
  return data.map(paraLinha)
}

/** Valor do reembolso: o pago na ordem, quando há; senão o lançado (como a lista mostra). */
export const valorDoReembolso = (r: Pick<ReembolsoLinha, "valor" | "ordem">): number =>
  Number(r.ordem?.valor_pago ?? r.valor ?? 0)

/**
 * Situação do dinheiro de um reembolso: pago (ordem Paga), em aberto (ordem
 * viva ainda não paga) ou fora (sem ordem, ordem excluída, cancelada ou
 * estornada — inclui o legado sem ordem ligada).
 */
export function andamentoDoReembolso(r: Pick<ReembolsoLinha, "ordem">): "pago" | "aberto" | "fora" {
  const o = r.ordem
  if (!o || o.excluido) return "fora"
  if (o.situacao === "Paga") return "pago"
  if (o.situacao === "Cancelada" || o.situacao === "Estornado") return "fora"
  return "aberto"
}

export type TotalPorTipo = {
  tipo: TipoReembolso
  quantidade: number
  total: number
  pago: number
  aberto: number
}

/**
 * Totais do filtro da tela por tipo — "quanto devolvemos da greve de 2026":
 * tipo Desconto de greve, período da greve. Lê todas as linhas (sem o teto de
 * 1.000 do PostgREST), só com as colunas que a soma usa.
 */
export async function totaisPorTipo(filtro: FiltroReembolsos = {}): Promise<TotalPorTipo[]> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const data = await lerEmLotes<Record<string, unknown>>((de, ate) =>
    consultaFiltrada(
      admin,
      emp,
      filtro,
      "id, tipo, valor, filiado:filiado_id(nome_completo, cpf), ordem:ordem_pagamento_id(situacao, valor_pago, excluido)"
    )
      .order("id")
      .range(de, ate)
  ).catch(() => [])
  const porTipo = new Map<TipoReembolso, TotalPorTipo>()
  for (const r of data) {
    const tipo = ehTipoReembolso(r.tipo) ? r.tipo : "outro"
    const linha = {
      valor: r.valor == null ? null : Number(r.valor),
      ordem: um(r.ordem as ReembolsoLinha["ordem"] | ReembolsoLinha["ordem"][] | null),
    }
    const valor = valorDoReembolso(linha)
    const t = porTipo.get(tipo) ?? { tipo, quantidade: 0, total: 0, pago: 0, aberto: 0 }
    t.quantidade++
    t.total += valor
    const andamento = andamentoDoReembolso(linha)
    if (andamento === "pago") t.pago += valor
    else if (andamento === "aberto") t.aberto += valor
    porTipo.set(tipo, t)
  }
  return [...porTipo.values()].sort((a, b) => b.total - a.total)
}

export async function obterReembolso(id: string): Promise<ReembolsoLinha | null> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data } = await admin
    .from("filiacao_reembolsos")
    .select(SELECT_LINHA)
    .eq("emp_proprietaria_id", emp)
    .eq("id", id)
    .maybeSingle()
  return data ? paraLinha(data as Record<string, unknown>) : null
}

export async function configReembolsoCompleta(): Promise<ConfigReembolsoCompleta> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data } = await admin
    .from("filiacao_reembolsos_config")
    .select("centro_custo_id")
    .eq("emp_proprietaria_id", emp)
    .maybeSingle()
  return {
    centroCustoId: (data?.centro_custo_id as string | null) ?? null,
  }
}

/**
 * Quanto foi lançado no mês da data — pelo dia do LANÇAMENTO (created_at, no
 * fuso de São Paulo), não pela data de referência: um reembolso retroativo
 * lançado hoje entra no mês corrente.
 */
export async function lancadoNoMes(dataRef: string): Promise<{ total: number; quantidade: number }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const [ano, mes] = dataRef.slice(0, 7).split("-").map(Number)
  const inicio = `${ano}-${String(mes).padStart(2, "0")}-01T00:00:00-03:00`
  const proximo = mes === 12 ? `${ano + 1}-01` : `${ano}-${String(mes + 1).padStart(2, "0")}`
  const fim = `${proximo}-01T00:00:00-03:00`
  // Todos os lançamentos do mês (paginado): o PostgREST corta em 1.000 linhas.
  const data = await lerEmLotes<{ valor: number | null }>((de, ate) =>
    admin
      .from("filiacao_reembolsos")
      .select("id, valor")
      .eq("emp_proprietaria_id", emp)
      .gte("created_at", inicio)
      .lt("created_at", fim)
      .order("id")
      .range(de, ate)
  ).catch(() => [])
  let total = 0
  for (const r of data) total += Number(r.valor ?? 0)
  return { total, quantidade: data.length }
}

// ── Lançamento ─────────────────────────────────────────────────────────────

type DadoBancario = {
  id: unknown
  pix: unknown
  banco: unknown
  banco_codigo: unknown
  agencia: unknown
  conta: unknown
  prefere_pix: unknown
}

/**
 * Destino do pagamento entre os dados bancários da pessoa (já na ordem: a
 * principal primeiro). Mesma regra de completarFormaPadrao.
 */
function destinoDoReembolso(
  bancos: DadoBancario[]
): { forma: "Pix" | "Depósito bancário (TED)"; id: string; pix: string | null } | null {
  const comPix = bancos.filter((b) => texto(b.pix))
  const comConta = bancos.filter((b) => texto(b.conta) && texto(b.agencia) && (texto(b.banco) || texto(b.banco_codigo)))
  const pixPreferido = comPix.find((b) => b.prefere_pix === true)
  const escolha = pixPreferido
    ? { forma: "Pix" as const, dado: pixPreferido }
    : comConta[0]
      ? { forma: "Depósito bancário (TED)" as const, dado: comConta[0] }
      : comPix[0]
        ? { forma: "Pix" as const, dado: comPix[0] }
        : null
  if (!escolha) return null
  return { forma: escolha.forma, id: String(escolha.dado.id), pix: texto(escolha.dado.pix) }
}

export async function criarReembolso(dados: DadosReembolso, atorId: string): Promise<Resultado> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()

  const { data: filiado } = await admin
    .from("filiacoes")
    .select("id, nome_completo, cpf")
    .eq("emp_proprietaria_id", emp)
    .eq("id", dados.filiadoId)
    .maybeSingle()
  if (!filiado) return { erro: "Filiado não encontrado." }
  const nome = texto(filiado.nome_completo) ?? "Filiado"
  const cpf = cpfConfiavel(texto(filiado.cpf))
  const config = await configReembolsoCompleta()

  // Favorecido: quem tem login entra pela conta; senão, avulso por nome e CPF.
  let usuarioId: string | null = null
  if (cpf) {
    const { data: u } = await admin
      .from("usuarios")
      .select("id")
      .eq("emp_proprietaria_id", emp)
      .eq("cpf", cpf)
      .limit(1)
      .maybeSingle()
    usuarioId = u ? String(u.id) : null
  }

  // Pix do filiado, se a entidade guarda: já vai na ordem, para o Financeiro
  // não pedir de novo. A conta pode estar em qualquer cadastro da pessoa
  // (fichas de filiado, Pessoal, fornecedor PF — mesmo CPF): uma conta por
  // pessoa, não por papel (lib/db/dados-bancarios-pessoa).
  // A escolha segue a regra central (completarFormaPadrao, ordens-destino):
  // Pix só quando a pessoa prefere Pix; senão a conta (TED), a principal
  // primeiro; sem conta, qualquer chave Pix. Toda ordem nasce com forma
  // (26/10/2026).
  const filtroPessoa = filtroDosDonos(await donosDaPessoa("filiado", String(filiado.id))) ?? `filiado_id.eq.${filiado.id}`
  const { data: bancos, error: erroBancos } = await admin
    .from("dados_bancarios")
    .select("id, pix, banco, banco_codigo, agencia, conta, favorito, prefere_pix, created_at")
    .or(filtroPessoa)
    .order("favorito", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
  if (erroBancos) console.error("Falha ao ler os dados bancários do filiado para o reembolso:", erroBancos.message)
  const destino = destinoDoReembolso(bancos ?? [])

  // O comprovante sobe antes de tudo: falhou, nada é gravado.
  let comprovante: string | null = null
  if (dados.comprovante) {
    const up = await subirComprovanteCompras(`notas/reembolsos-filiados/${filiado.id}`, dados.comprovante)
    if (up.erro || !up.caminho) return { erro: up.erro ?? "Falha ao subir o comprovante." }
    comprovante = up.caminho
  }

  const descricaoOrdem = `Reembolso a filiado — ${nome} — ${dados.justificativa}`
  const { data: ordem, error: erroOrdem } = await inserirOrdemVerificada({
      codigo: gerarCodigoProcesso(),
      tipo: "Reembolso",
      descricao: descricaoOrdem,
      situacao: "Em autorização",
      valor_inicial_cobranca: dados.valor,
      vencimento: hojeSP(),
      forma_pagamento: destino?.forma ?? null,
      pix_codigo: destino?.forma === "Pix" ? destino.pix : null,
      ...(destino ? { dados_bancarios_id: destino.id } : {}),
      beneficiario_usuario_id: usuarioId,
      beneficiario_nome_avulso: usuarioId ? null : nome,
      beneficiario_doc_avulso: usuarioId ? null : cpf,
      centro_custo_despesa_id: config.centroCustoId,
      projeto_id: dados.projetoId,
      arquivo_nota_fiscal: comprovante,
      excluido: false,
      emp_proprietaria_id: emp,
    }, comprovante ? { comprovante } : {})
  if (erroOrdem || !ordem) {
    return { erro: `Não foi possível gerar a ordem de pagamento: ${erroOrdem?.message}` }
  }

  const agora = new Date().toISOString()
  const { data: apontamento } = await admin
    .from("filiacao_prontuario")
    .insert({
      filiacao_id: filiado.id,
      data: `${dados.data}T12:00:00-03:00`,
      tipo: "Reembolso",
      descricao: `Reembolso a filiado de ${formatarMoeda(dados.valor)} — ${dados.justificativa}`,
      diretor_funcionario_id: atorId,
      emp_proprietaria_id: emp,
      created_at: agora,
      modified_at: agora,
    })
    .select("id")
    .maybeSingle()

  const { data, error } = await admin
    .from("filiacao_reembolsos")
    .insert({
      filiado_id: filiado.id,
      data: dados.data,
      tipo: dados.tipo,
      justificativa: dados.justificativa,
      valor: dados.valor,
      ordem_pagamento_id: ordem.id,
      projeto_id: dados.projetoId,
      prontuario_id: apontamento?.id ?? null,
      criado_por: atorId,
      emp_proprietaria_id: emp,
    })
    .select("id")
    .single()
  if (error || !data) {
    // Sem o reembolso, a ordem e o apontamento seriam órfãos.
    await admin.from("ordens_pagamento").delete().eq("id", ordem.id).eq("emp_proprietaria_id", emp)
    if (apontamento?.id) {
      await admin.from("filiacao_prontuario").delete().eq("id", apontamento.id).eq("emp_proprietaria_id", emp)
    }
    return { erro: `Não foi possível lançar o reembolso: ${error?.message}` }
  }
  invalidarCacheProntuarios()
  return { ok: true, id: data.id as string }
}

/**
 * Edita data, justificativa, projeto e valor. Com a ordem já paga, só
 * justificativa e projeto mudam — o dinheiro saiu, o valor e a data ficam.
 * O comprovante pode ser anexado ou trocado mesmo com a ordem paga.
 */
export async function atualizarReembolso(
  id: string,
  dados: Omit<DadosReembolso, "filiadoId">
): Promise<Resultado> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const atual = await obterReembolso(id)
  if (!atual) return { erro: "Reembolso não encontrado." }
  const paga = atual.ordem?.situacao === "Paga"
  const ordemViva = atual.ordem && !atual.ordem.excluido ? atual.ordem : null

  let comprovante: string | null = null
  if (dados.comprovante) {
    if (!ordemViva) {
      return { erro: "Este reembolso não tem ordem de pagamento ativa para receber o comprovante." }
    }
    const up = await subirComprovanteCompras(
      `notas/reembolsos-filiados/${atual.filiadoId ?? id}`,
      dados.comprovante
    )
    if (up.erro || !up.caminho) return { erro: up.erro ?? "Falha ao subir o comprovante." }
    comprovante = up.caminho
  }

  const registro: Record<string, unknown> = {
    tipo: dados.tipo,
    justificativa: dados.justificativa,
    projeto_id: dados.projetoId,
    updated_at: new Date().toISOString(),
  }
  if (!paga) {
    registro.data = dados.data
    registro.valor = dados.valor
  }
  const { error } = await admin
    .from("filiacao_reembolsos")
    .update(registro)
    .eq("emp_proprietaria_id", emp)
    .eq("id", id)
  if (error) return { erro: `Não foi possível salvar: ${error.message}` }

  if (ordemViva) {
    const ordem: Record<string, unknown> = {
      descricao: `Reembolso a filiado — ${atual.filiadoNome ?? "Filiado"} — ${dados.justificativa}`,
      projeto_id: dados.projetoId,
    }
    if (!paga) ordem.valor_inicial_cobranca = dados.valor
    if (comprovante) ordem.arquivo_nota_fiscal = comprovante
    await admin.from("ordens_pagamento").update(ordem).eq("emp_proprietaria_id", emp).eq("id", ordemViva.id)
    // Na trilha da ordem — e a auditoria reavalia a ordem como ficou.
    await registrarEvento(
      ordemViva.id,
      "corrigida",
      await usuarioDaTrilha(),
      comprovante
        ? ordemViva.arquivo_nota_fiscal
          ? "Reembolso a filiado editado; comprovante trocado."
          : "Reembolso a filiado editado; comprovante anexado."
        : "Reembolso a filiado editado.",
      ordem
    )
  }
  if (atual.prontuarioId) {
    await admin
      .from("filiacao_prontuario")
      .update({
        descricao: `Reembolso a filiado de ${formatarMoeda(paga ? (atual.valor ?? dados.valor) : dados.valor)} — ${dados.justificativa}`,
        modified_at: new Date().toISOString(),
      })
      .eq("emp_proprietaria_id", emp)
      .eq("id", atual.prontuarioId)
    invalidarCacheProntuarios()
  }
  return { ok: true, id }
}

/** Desfaz um lançamento: a ordem é marcada excluída e o apontamento some. Ordem paga não se desfaz. */
export async function excluirReembolso(id: string): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const atual = await obterReembolso(id)
  if (!atual) return { erro: "Reembolso não encontrado." }
  if (atual.ordem?.situacao === "Paga") {
    return { erro: "A ordem deste reembolso já foi paga. Um pagamento indevido se trata no Financeiro, não apagando o registro." }
  }
  const { error } = await admin
    .from("filiacao_reembolsos")
    .delete()
    .eq("emp_proprietaria_id", emp)
    .eq("id", id)
  if (error) return { erro: `Não foi possível excluir: ${error.message}` }
  if (atual.ordem && !atual.ordem.excluido) {
    await admin
      .from("ordens_pagamento")
      .update({ excluido: true })
      .eq("emp_proprietaria_id", emp)
      .eq("id", atual.ordem.id)
  }
  if (atual.prontuarioId) {
    await admin.from("filiacao_prontuario").delete().eq("emp_proprietaria_id", emp).eq("id", atual.prontuarioId)
    invalidarCacheProntuarios()
  }
  return {}
}

// ── Lançamento em lote ─────────────────────────────────────────────────────

/** Uma linha da lista colada ou da planilha. */
export type LinhaLote = { linha: number; cpf: string; valor: number | null }

/** A linha conferida: com o filiado achado ou o motivo de não lançar. */
export type LinhaLoteConferida = {
  linha: number
  cpf: string
  valor: number | null
  filiadoId: string | null
  nome: string | null
  problema: string | null
  /** Sem chave Pix nem conta: dá para pedir os dados pelo link. */
  semConta: boolean
  /** Pedido de dados bancários em aberto (quando foi criado). */
  pedidoEm: string | null
}

const emPartes = <T,>(lista: T[], tamanho = 200): T[][] =>
  Array.from({ length: Math.ceil(lista.length / tamanho) }, (_, i) => lista.slice(i * tamanho, (i + 1) * tamanho))

/**
 * Confere o lote antes de lançar (nada é gravado): acha cada filiado pelo CPF
 * (o cadastro mais recente, quando a pessoa tem vários vínculos) e aponta o
 * que impede o lançamento — CPF inválido ou não encontrado, CPF repetido na
 * lista, valor inválido, nenhuma chave Pix nem conta cadastrada (a ordem não
 * nasceria) e reembolso já lançado com a mesma data e o mesmo valor. Consultas
 * agrupadas: um lote de 400 não vira 400 idas ao banco.
 */
export async function conferirLoteReembolsos(linhas: LinhaLote[], data: string): Promise<LinhaLoteConferida[]> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const cpfs = [...new Set(linhas.map((l) => cpfConfiavel(l.cpf)).filter((c): c is string => Boolean(c)))]
  const grafias = cpfs.flatMap((c) => grafiasDoCpf(c))

  type Fil = { id: string; nome_completo: string | null; cpf: string | null; created_at: string | null }
  const filiacoes: Fil[] = []
  const usuarios: { id: string; cpf: string | null }[] = []
  const empresas: { id: string; cnpj_cpf: string | null }[] = []
  for (const parte of emPartes(grafias)) {
    const [f, u, e] = await Promise.all([
      admin.from("filiacoes").select("id, nome_completo, cpf, created_at").eq("emp_proprietaria_id", emp).in("cpf", parte),
      admin.from("usuarios").select("id, cpf").eq("emp_proprietaria_id", emp).in("cpf", parte),
      admin.from("empresa").select("id, cnpj_cpf").eq("emp_proprietaria_id", emp).in("cnpj_cpf", parte),
    ])
    filiacoes.push(...((f.data ?? []) as Fil[]))
    usuarios.push(...((u.data ?? []) as { id: string; cpf: string | null }[]))
    empresas.push(...((e.data ?? []) as { id: string; cnpj_cpf: string | null }[]))
  }

  // CPF → cadastros da pessoa
  const filiacoesDe = new Map<string, Fil[]>()
  for (const f of filiacoes) {
    const c = cpfConfiavel(f.cpf)
    if (c) filiacoesDe.set(c, [...(filiacoesDe.get(c) ?? []), f])
  }
  const cpfDoDono = new Map<string, string>()
  for (const f of filiacoes) { const c = cpfConfiavel(f.cpf); if (c) cpfDoDono.set(`filiado_id:${f.id}`, c) }
  for (const u of usuarios) { const c = cpfConfiavel(u.cpf); if (c) cpfDoDono.set(`usuario_id:${u.id}`, c) }
  for (const e of empresas) { const c = cpfConfiavel(e.cnpj_cpf); if (c) cpfDoDono.set(`fornecedor_id:${e.id}`, c) }

  // Quem tem destino bancário (chave Pix ou conta completa), em qualquer papel.
  const comDestino = new Set<string>()
  const donos: [string, string[]][] = [
    ["filiado_id", filiacoes.map((f) => f.id)],
    ["usuario_id", usuarios.map((u) => u.id)],
    ["fornecedor_id", empresas.map((e) => e.id)],
  ]
  for (const [coluna, ids] of donos) {
    for (const parte of emPartes(ids)) {
      const { data: bancos } = await admin
        .from("dados_bancarios")
        .select(`${coluna}, pix, conta, agencia, banco, banco_codigo`)
        .in(coluna, parte)
      for (const b of (bancos ?? []) as unknown as Record<string, unknown>[]) {
        const serve = texto(b.pix) || (texto(b.conta) && texto(b.agencia) && (texto(b.banco) || texto(b.banco_codigo)))
        const c = cpfDoDono.get(`${coluna}:${b[coluna]}`)
        if (serve && c) comDestino.add(c)
      }
    }
  }

  // Pedido de dados bancários ainda em aberto, por cadastro de filiado.
  const pedidoAberto = new Map<string, string>()
  for (const parte of emPartes(filiacoes.map((f) => f.id))) {
    const { data: pedidos } = await admin
      .from("financeiro_pedidos_dados_bancarios")
      .select("filiado_id, created_at")
      .in("filiado_id", parte)
      .is("respondido_em", null)
      .is("cancelado_em", null)
      .gt("expira_em", new Date().toISOString())
    for (const d of (pedidos ?? []) as { filiado_id: string; created_at: string }[]) {
      if (!pedidoAberto.has(d.filiado_id) || d.created_at > (pedidoAberto.get(d.filiado_id) ?? "")) {
        pedidoAberto.set(d.filiado_id, d.created_at)
      }
    }
  }

  // Já lançado: mesma pessoa, mesma data de referência, mesmo valor.
  const lancados = new Set<string>()
  for (const parte of emPartes(filiacoes.map((f) => f.id))) {
    const { data: existentes } = await admin
      .from("filiacao_reembolsos")
      .select("filiado_id, valor")
      .eq("emp_proprietaria_id", emp)
      .eq("data", data)
      .in("filiado_id", parte)
    for (const r of (existentes ?? []) as { filiado_id: string; valor: number | null }[]) {
      const c = cpfDoDono.get(`filiado_id:${r.filiado_id}`)
      if (c) lancados.add(`${c}|${Number(r.valor ?? 0).toFixed(2)}`)
    }
  }

  const vistos = new Map<string, number>()
  return linhas.map((l) => {
    const cpf = cpfConfiavel(l.cpf)
    const base = {
      linha: l.linha,
      cpf: cpf ? formatarCpf(cpf) : l.cpf,
      valor: l.valor,
      filiadoId: null,
      nome: null,
      semConta: false,
      pedidoEm: null,
    }
    if (l.valor == null || !(l.valor > 0)) return { ...base, problema: "Valor inválido." }
    if (!cpf) return { ...base, problema: "CPF inválido." }
    const anterior = vistos.get(cpf)
    if (anterior) return { ...base, problema: `CPF repetido na lista (linha ${anterior}).` }
    vistos.set(cpf, l.linha)
    const cadastros = (filiacoesDe.get(cpf) ?? []).sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")))
    const filiado = cadastros[0]
    if (!filiado) return { ...base, problema: "Nenhum filiado com este CPF." }
    const achado = { ...base, filiadoId: filiado.id, nome: texto(filiado.nome_completo) }
    if (!comDestino.has(cpf)) {
      const pedido = pedidoAberto.get(filiado.id)
      return {
        ...achado,
        semConta: true,
        pedidoEm: pedido ?? null,
        problema: pedido
          ? `Sem chave Pix nem conta — dados bancários pedidos em ${new Date(pedido).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}, aguardando resposta.`
          : "Sem chave Pix nem conta cadastrada — peça os dados bancários (botão acima) ou cadastre na ficha.",
      }
    }
    if (lancados.has(`${cpf}|${l.valor.toFixed(2)}`)) {
      return { ...achado, problema: "Já lançado com esta data e este valor." }
    }
    return { ...achado, problema: null }
  })
}

// ── Configuração ───────────────────────────────────────────────────────────

export async function salvarConfigReembolso(
  dados: ConfigReembolsoCompleta,
  atorId: string
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  if (dados.centroCustoId) {
    const { data: cc } = await admin
      .from("centros_de_custo")
      .select("id")
      .eq("emp_proprietaria_id", emp)
      .eq("id", dados.centroCustoId)
      .maybeSingle()
    if (!cc) return { erro: "Centro de custo não encontrado." }
  }
  const { error } = await admin.from("filiacao_reembolsos_config").upsert(
    {
      emp_proprietaria_id: emp,
      centro_custo_id: dados.centroCustoId,
      atualizada_por: atorId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "emp_proprietaria_id" }
  )
  if (error) return { erro: `Não foi possível salvar: ${error.message}` }
  return {}
}
