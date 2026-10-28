import "server-only"

import { limparCpf } from "@/lib/cpf"
import type { EntradaDadosBancarios } from "@/lib/dados-bancarios"
import { texto } from "@/lib/db/comum"
import { ligarOrdensSemForma } from "@/lib/db/ordens-destino"
import { AVISO_REPETIDA, dadoRepetido } from "@/lib/db/dados-bancarios-repetida"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Dados bancários do filiado (cartão da ficha) — `dados_bancarios` com
 * `filiado_id`. São da PESSOA: a leitura junta todos os registros dela em
 * `filiacoes` pelo CPF, como o reembolso faz ao montar a ordem. O principal
 * (`favorito`) é o primeiro que o reembolso usa. A tabela não tem
 * emp_proprietaria_id: o tenant vem da filiação, pela RLS.
 */

export type DadoBancarioFiliado = {
  id: string
  banco: string | null
  bancoCodigo: string | null
  agencia: string | null
  conta: string | null
  tipoConta: string | null
  pix: string | null
  pixTipo: string | null
  favorecido: string | null
  titularDocumento: string | null
  preferePix: boolean
  principal: boolean
}

const COLUNAS =
  "id, filiado_id, banco, banco_codigo, agencia, conta, tipo_conta, pix, pix_tipo, favorecido, titular_documento, prefere_pix, favorito, created_at"

/** Todos os registros de filiação da pessoa no tenant (pelo CPF). */
async function registrosDaPessoa(filiadoId: string): Promise<string[] | null> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data: f } = await admin
    .from("filiacoes")
    .select("id, cpf")
    .eq("id", filiadoId)
    .eq("emp_proprietaria_id", emp)
    .maybeSingle()
  if (!f) return null
  const cpf = limparCpf(String(f.cpf ?? ""))
  if (cpf.length !== 11) return [String(f.id)]
  const { data: outros } = await admin
    .from("filiacoes")
    .select("id, cpf")
    .eq("emp_proprietaria_id", emp)
    .ilike("cpf", `%${cpf.slice(-6)}%`)
  return [
    ...new Set([
      String(f.id),
      ...(outros ?? []).filter((o) => limparCpf(String(o.cpf ?? "")) === cpf).map((o) => String(o.id)),
    ]),
  ]
}

export async function listarDadosBancariosFiliado(filiadoId: string): Promise<DadoBancarioFiliado[]> {
  const registros = await registrosDaPessoa(filiadoId)
  if (!registros) return []
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("dados_bancarios")
    .select(COLUNAS)
    .in("filiado_id", registros)
    .order("favorito", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
  if (error) throw new Error(`Falha ao ler os dados bancários do filiado: ${error.message}`)
  return (data ?? []).map((d) => ({
    id: String(d.id),
    banco: texto(d.banco),
    bancoCodigo: texto(d.banco_codigo),
    agencia: texto(d.agencia),
    conta: texto(d.conta),
    tipoConta: texto(d.tipo_conta),
    pix: texto(d.pix),
    pixTipo: texto(d.pix_tipo),
    favorecido: texto(d.favorecido),
    titularDocumento: texto(d.titular_documento),
    preferePix: d.prefere_pix === true,
    principal: d.favorito === true,
  }))
}

/**
 * Cria (no registro aberto na ficha) ou atualiza um dado da pessoa. O
 * primeiro cadastrado já nasce principal; marcar principal desmarca os outros.
 */
export async function salvarDadoBancarioFiliado({
  filiadoId,
  id,
  dados,
  principal,
}: {
  filiadoId: string
  id: string | null
  dados: EntradaDadosBancarios
  principal: boolean
}): Promise<{ erro?: string }> {
  const registros = await registrosDaPessoa(filiadoId)
  if (!registros) return { erro: "Filiado não encontrado." }
  const atuais = await listarDadosBancariosFiliado(filiadoId)
  if (id && !atuais.some((d) => d.id === id)) return { erro: "Dado bancário não encontrado neste filiado." }
  const ehPrincipal = principal || atuais.length === 0 || (atuais.length === 1 && atuais[0].id === id)
  if (await dadoRepetido({ coluna: "filiado_id", ids: registros }, dados, id)) return { erro: AVISO_REPETIDA }

  const admin = await createAdminClient()
  const linha = {
    banco: dados.banco,
    banco_codigo: dados.bancoCodigo,
    agencia: dados.agencia,
    conta: dados.conta,
    tipo_conta: dados.tipoConta,
    pix: dados.pix,
    pix_tipo: dados.pixTipo,
    favorecido: dados.favorecido,
    titular_documento: dados.titularDocumento,
    prefere_pix: dados.preferePix,
    ...(ehPrincipal ? { favorito: true } : {}),
  }
  const { data: salvo, error } = id
    ? await admin.from("dados_bancarios").update(linha).eq("id", id).in("filiado_id", registros).select("id").single()
    : await admin
        .from("dados_bancarios")
        .insert({ ...linha, filiado_id: filiadoId, favorito: ehPrincipal })
        .select("id")
        .single()
  if (error || !salvo) return { erro: `Falha ao salvar os dados bancários: ${error?.message ?? "sem retorno"}` }

  if (ehPrincipal) {
    const { error: e } = await admin
      .from("dados_bancarios")
      .update({ favorito: false })
      .in("filiado_id", registros)
      .neq("id", String(salvo.id))
      .eq("favorito", true)
    if (e) console.error("Falha ao desmarcar o principal anterior:", e.message)
  }
  // Ordens antigas do filiado (ex.: reembolso) que esperavam a conta recebem esta.
  await ligarOrdensSemForma(String(salvo.id)).catch((e) => console.error("ligarOrdensSemForma:", e))
  return {}
}

export async function excluirDadoBancarioFiliado(filiadoId: string, id: string): Promise<{ erro?: string }> {
  const registros = await registrosDaPessoa(filiadoId)
  if (!registros) return { erro: "Filiado não encontrado." }
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("dados_bancarios")
    .delete()
    .eq("id", id)
    .in("filiado_id", registros)
    .select("id")
  if (error) {
    // FK de ordens_pagamento (e afins): o destino de pagamentos já feitos fica.
    if (error.code === "23503") {
      return { erro: "Esta conta já foi usada em ordens de pagamento e não pode ser excluída. Edite-a ou cadastre outra como principal." }
    }
    return { erro: `Falha ao excluir: ${error.message}` }
  }
  if (!data?.length) return { erro: "Dado bancário não encontrado neste filiado." }
  return {}
}
