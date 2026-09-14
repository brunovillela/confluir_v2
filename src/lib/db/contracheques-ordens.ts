import "server-only"

import { esquemaAusente, nomesDosUsuarios, texto } from "@/lib/db/comum"
import { gerarCodigoProcesso } from "@/lib/db/compras"
import {
  FORMA_PAGAMENTO_FOLHA_PADRAO,
  FORMAS_PAGAMENTO_FOLHA,
  rotuloTipoConta,
  TIPO_ORDEM_FOLHA,
} from "@/lib/contracheques-constantes"
import { formatarData, formatarMoeda } from "@/lib/formato"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Contracheque → ordem de pagamento em favor do funcionário.
 *
 * No registro do contracheque (com o valor líquido), nasce uma ordem tipo
 * "Folha de pagamento", "Em autorização", com o PDF do contracheque no lugar
 * da nota fiscal — copiado para o bucket `comprovantes`, onde o Financeiro
 * já lê os anexos da ordem. Centro de custo, departamento e forma de pagamento
 * vêm da configuração do tenant; o vencimento, da data de pagamento da
 * remessa; a conta ou chave Pix, dos dados bancários do funcionário.
 * SQL: supabase/pessoal-contracheques-ordens.sql.
 */

export const AVISO_SQL_FOLHA =
  "Rode supabase/pessoal-contracheques-ordens.sql no Supabase para gerar ordens a partir dos contracheques."

// ── Configuração ────────────────────────────────────────────────────────────

export type ConfigContracheques = {
  disponivel: boolean
  gerarOrdem: boolean
  centroCustoId: string | null
  departamentoId: string | null
  formaPagamento: string
}

export async function obterConfigContracheques(): Promise<ConfigContracheques> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("pessoal_contracheques_config")
    .select("gerar_ordem, centro_custo_despesa_id, departamento_id, forma_pagamento")
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (error && !esquemaAusente(error)) {
    throw new Error(`Falha ao ler a configuração dos contracheques: ${error.message}`)
  }
  return {
    disponivel: !error,
    // Sem linha de configuração, a geração vale (é o padrão do pedido).
    gerarOrdem: error ? false : data?.gerar_ordem !== false,
    centroCustoId: texto(data?.centro_custo_despesa_id),
    departamentoId: texto(data?.departamento_id),
    formaPagamento: texto(data?.forma_pagamento) ?? FORMA_PAGAMENTO_FOLHA_PADRAO,
  }
}

export async function salvarConfigContracheques(
  dados: {
    gerarOrdem: boolean
    centroCustoId: string | null
    departamentoId: string | null
    formaPagamento: string
  },
  usuarioId: string
): Promise<{ erro?: string }> {
  if (!(FORMAS_PAGAMENTO_FOLHA as readonly string[]).includes(dados.formaPagamento)) {
    return { erro: "Escolha a forma de pagamento." }
  }
  const admin = await createAdminClient()
  const { error } = await admin.from("pessoal_contracheques_config").upsert(
    {
      emp_proprietaria_id: await tenantAtual(),
      gerar_ordem: dados.gerarOrdem,
      centro_custo_despesa_id: dados.centroCustoId,
      departamento_id: dados.departamentoId,
      forma_pagamento: dados.formaPagamento,
      atualizada_por: usuarioId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "emp_proprietaria_id" }
  )
  if (error) {
    if (esquemaAusente(error)) return { erro: AVISO_SQL_FOLHA }
    return { erro: `Falha ao salvar a configuração: ${error.message}` }
  }
  return {}
}

/** Centros de custo usáveis do tenant, para o select da configuração. */
export async function centrosDeCustoParaFolha(): Promise<{ id: string; nome: string }[]> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("centros_de_custo")
    .select("id, nome_da_conta, classificador, usavel")
    .eq("emp_proprietaria_id", await tenantAtual())
    .order("classificador", { ascending: true, nullsFirst: false })
    .order("nome_da_conta", { ascending: true })
  if (error) throw new Error(`Falha ao listar centros de custo: ${error.message}`)
  return (data ?? [])
    .filter((c) => c.usavel !== false)
    .map((c) => ({
      id: String(c.id),
      nome: [c.classificador, c.nome_da_conta].filter(Boolean).join(" - ") || "(sem nome)",
    }))
}

// ── Dados bancários do funcionário ──────────────────────────────────────────

export type DadosBancarios = {
  id: string
  banco: string | null
  bancoCodigo: string | null
  agencia: string | null
  conta: string | null
  tipoConta: string | null
  pix: string | null
  pixTipo: string | null
  favorecido: string | null
  preferePix: boolean
}

function mapearDadosBancarios(d: Record<string, unknown>): DadosBancarios {
  return {
    id: String(d.id),
    banco: texto(d.banco),
    bancoCodigo: texto(d.banco_codigo),
    agencia: texto(d.agencia),
    conta: texto(d.conta),
    tipoConta: texto(d.tipo_conta),
    pix: texto(d.pix),
    pixTipo: texto(d.pix_tipo),
    favorecido: texto(d.favorecido),
    preferePix: d.prefere_pix === true,
  }
}

const COLS_BANCO =
  "id, usuario_id, banco, banco_codigo, agencia, conta, tipo_conta, pix, pix_tipo, favorecido, prefere_pix, favorito, created_at"

/** A conta do funcionário (a favorita; senão a mais recente). */
export async function dadosBancariosDoFuncionario(usuarioId: string): Promise<DadosBancarios | null> {
  const mapa = await dadosBancariosDosFuncionarios([usuarioId])
  return mapa.get(usuarioId) ?? null
}

export async function dadosBancariosDosFuncionarios(
  usuarioIds: string[]
): Promise<Map<string, DadosBancarios>> {
  const mapa = new Map<string, DadosBancarios>()
  if (usuarioIds.length === 0) return mapa
  const admin = await createAdminClient()
  for (let de = 0; de < usuarioIds.length; de += 200) {
    const { data, error } = await admin
      .from("dados_bancarios")
      .select(COLS_BANCO)
      .in("usuario_id", usuarioIds.slice(de, de + 200))
      .order("favorito", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
    if (error) throw new Error(`Falha ao ler dados bancários: ${error.message}`)
    for (const d of data ?? []) {
      const id = String(d.usuario_id)
      if (!mapa.has(id)) mapa.set(id, mapearDadosBancarios(d))
    }
  }
  return mapa
}

export type EntradaDadosBancarios = {
  banco: string | null
  bancoCodigo: string | null
  agencia: string | null
  conta: string | null
  tipoConta: string | null
  pix: string | null
  pixTipo: string | null
  favorecido: string | null
  preferePix: boolean
}

/** Uma conta por funcionário: atualiza a existente ou cria. */
export async function salvarDadosBancariosFuncionario(
  usuarioId: string,
  dados: EntradaDadosBancarios
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const atual = await dadosBancariosDoFuncionario(usuarioId)
  const linha = {
    banco: dados.banco,
    banco_codigo: dados.bancoCodigo,
    agencia: dados.agencia,
    conta: dados.conta,
    tipo_conta: dados.tipoConta,
    pix: dados.pix,
    pix_tipo: dados.pixTipo,
    favorecido: dados.favorecido,
    prefere_pix: dados.preferePix,
    favorito: true,
  }
  const { error } = atual
    ? await admin.from("dados_bancarios").update(linha).eq("id", atual.id).eq("usuario_id", usuarioId)
    : await admin.from("dados_bancarios").insert({ ...linha, usuario_id: usuarioId })
  if (error) return { erro: `Falha ao salvar os dados bancários: ${error.message}` }
  return {}
}

/** Linha legível da conta para a descrição da ordem. */
export function contaEmTexto(d: DadosBancarios | null): string {
  if (!d) return "Sem dados bancários cadastrados — cadastre na ficha do funcionário, no Pessoal."
  const conta =
    d.agencia || d.conta
      ? [
          [d.banco, d.bancoCodigo ? `(${d.bancoCodigo})` : null].filter(Boolean).join(" ") || "Banco não informado",
          d.agencia ? `ag. ${d.agencia}` : null,
          d.conta ? `${rotuloTipoConta(d.tipoConta)?.toLowerCase() ?? "conta"} ${d.conta}` : null,
        ]
          .filter(Boolean)
          .join(", ")
      : null
  const pix = d.pix ? `Pix ${d.pixTipo ? `(${d.pixTipo}) ` : ""}${d.pix}` : null
  const partes = d.preferePix ? [pix, conta] : [conta, pix]
  const favorecido = d.favorecido ? ` Favorecido: ${d.favorecido}.` : ""
  return `Crédito: ${partes.filter(Boolean).join(" · ") || "sem conta nem Pix informados"}.${favorecido}`
}

// ── Geração e cancelamento da ordem ─────────────────────────────────────────

/**
 * Gera a ordem do contracheque recém-registrado. Sobe o PDF no bucket
 * `comprovantes` (é onde a ordem lê os anexos) e grava o vínculo no
 * contracheque; qualquer falha desfaz o que já foi feito.
 */
export async function gerarOrdemDoContracheque(p: {
  contrachequeId: string
  funcionarioId: string
  remessa: { id: string; nome: string | null; natureza: string; dataPagamento: string | null }
  valorLiquido: number
  pdf: File | Blob
}): Promise<{ ordemId?: string; semDadosBancarios?: boolean; erro?: string }> {
  const config = await obterConfigContracheques()
  if (!config.disponivel) return { erro: AVISO_SQL_FOLHA }

  const admin = await createAdminClient()
  const [nomes, conta] = await Promise.all([
    nomesDosUsuarios([p.funcionarioId]),
    dadosBancariosDoFuncionario(p.funcionarioId),
  ])
  const nome = nomes.get(p.funcionarioId) ?? "funcionário"

  const caminho = `ordens/contracheques/${p.contrachequeId}.pdf`
  const { error: erroUpload } = await admin.storage
    .from("comprovantes")
    .upload(caminho, p.pdf, { contentType: "application/pdf", upsert: true })
  if (erroUpload) return { erro: `Falha ao anexar o contracheque à ordem: ${erroUpload.message}` }

  const pagarPorPix = Boolean(conta?.pix) && (conta?.preferePix === true || !conta?.conta)
  const descricao = [
    `Contracheque ${p.remessa.natureza.toLowerCase()} — ${p.remessa.nome ?? "remessa sem nome"} — ${nome}.`,
    `Valor líquido ${formatarMoeda(p.valorLiquido)}${p.remessa.dataPagamento ? `, pagamento em ${formatarData(p.remessa.dataPagamento)}` : ""}.`,
    contaEmTexto(conta),
  ].join(" ")

  const { data: ordem, error } = await admin
    .from("ordens_pagamento")
    .insert({
      codigo: gerarCodigoProcesso(),
      tipo: TIPO_ORDEM_FOLHA,
      descricao,
      situacao: "Em autorização",
      valor_inicial_cobranca: p.valorLiquido,
      vencimento: p.remessa.dataPagamento,
      forma_pagamento: pagarPorPix ? "Pix" : config.formaPagamento,
      pix_codigo: pagarPorPix ? conta?.pix : null,
      beneficiario_usuario_id: p.funcionarioId,
      centro_custo_despesa_id: config.centroCustoId,
      departamento_id: config.departamentoId,
      arquivo_nota_fiscal: caminho,
      excluido: false,
      emp_proprietaria_id: await tenantAtual(),
    })
    .select("id")
    .single()
  if (error || !ordem) {
    await admin.storage.from("comprovantes").remove([caminho])
    return { erro: `Não foi possível gerar a ordem de pagamento: ${error?.message}` }
  }

  const { error: erroVinculo } = await admin
    .from("pessoal_contracheques")
    .update({ ordem_pagamento_id: ordem.id, valor_liquido: p.valorLiquido })
    .eq("id", p.contrachequeId)
  if (erroVinculo) {
    await admin.from("ordens_pagamento").delete().eq("id", ordem.id)
    await admin.storage.from("comprovantes").remove([caminho])
    return { erro: `Não foi possível vincular a ordem ao contracheque: ${erroVinculo.message}` }
  }
  return { ordemId: String(ordem.id), semDadosBancarios: !conta || (!conta.conta && !conta.pix) }
}

/** Situações em que a ordem já saiu do controle do Pessoal. */
const SITUACOES_PAGAS = ["Paga", "Processando", "Estornado"]

/**
 * Cancela a ordem do contracheque que está sendo excluído. Ordem paga (ou em
 * processamento) bloqueia a exclusão — o Financeiro precisa estornar antes.
 */
export async function cancelarOrdemDoContracheque(
  ordemId: string,
  motivo: string
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("ordens_pagamento")
    .select("id, codigo, situacao, descricao")
    .eq("id", ordemId)
    .maybeSingle()
  if (!data) return {}
  if (SITUACOES_PAGAS.includes(String(data.situacao))) {
    return {
      erro: `A ordem ${data.codigo ?? ""} já está "${data.situacao}" no Financeiro — o contracheque não pode ser excluído.`,
    }
  }
  if (data.situacao === "Cancelada") return {}
  const { error } = await admin
    .from("ordens_pagamento")
    .update({
      situacao: "Cancelada",
      descricao: [texto(data.descricao), `Cancelada: ${motivo}`].filter(Boolean).join(" "),
    })
    .eq("id", ordemId)
  if (error) return { erro: `Não foi possível cancelar a ordem: ${error.message}` }
  return {}
}

/** Situação e código das ordens dos contracheques, para a lista da remessa. */
export async function ordensDosContracheques(
  ordemIds: string[]
): Promise<Map<string, { codigo: string | null; situacao: string | null }>> {
  const mapa = new Map<string, { codigo: string | null; situacao: string | null }>()
  if (ordemIds.length === 0) return mapa
  const admin = await createAdminClient()
  const { data } = await admin
    .from("ordens_pagamento")
    .select("id, codigo, situacao")
    .in("id", ordemIds)
  for (const o of data ?? []) {
    mapa.set(String(o.id), { codigo: texto(o.codigo), situacao: texto(o.situacao) })
  }
  return mapa
}
