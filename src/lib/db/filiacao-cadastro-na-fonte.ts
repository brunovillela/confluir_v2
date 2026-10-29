import "server-only"

import type { CampoVinculo } from "@/lib/atualizacao-lista"
import { cpfConfiavel } from "@/lib/cpf"
import { atribuirMatriculaSindical, cadastrosComCpf } from "@/lib/db/filiacao-identidade"
import { condicaoNaFontePadrao } from "@/lib/filiacao"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Cadastrar quem veio numa lista externa e não tinha cadastro (29/10/2026):
 * o núcleo comum dos "não encontrados" da relação de pagamentos (Receitas) e
 * da lista de trabalhadores. Uma pessoa por chamada:
 *  - CPF que já está num cadastro: reaproveita (não duplica); com
 *    `ativarExistente`, um cadastro não Ativo passa a Ativo (pagou);
 *  - senão cria o cadastro na condição pedida, com a matrícula sindical;
 *  - abre o vínculo na fonte se a pessoa ainda não tem um aberto nela, com os
 *    dados do emprego que vieram (e o espelho "informado pela fonte");
 *  - anota no prontuário o que foi feito e de onde veio.
 * O que é de cada tela (agrupar linhas, ligar lançamentos, marcar o lote)
 * fica com quem chama.
 */

export type PessoaDaLista = {
  nome: string
  cpf: string | null
  /** Matrícula na fonte pagadora, como veio. */
  matriculaFonte: string | null
  /** Dados pessoais lidos da lista (colunas de `filiacoes`), já padronizados. */
  cadastro?: Record<string, string | undefined>
  /** Dados do emprego lidos da lista (colunas de `filiacao_vinculos`). */
  vinculo?: Partial<Record<CampoVinculo, string>>
}

export type OpcoesCadastroNaFonte = {
  fonte: { id: string; fundo_pensao?: boolean | null }
  /** Condição sindical de quem é CRIADO. */
  condicao: string
  /** Cadastro já existente (pelo CPF) e não Ativo passa a Ativo. */
  ativarExistente: boolean
  /** De onde veio, com o artigo, para o prontuário: "a lista de trabalhadores \"x.xlsx\"". */
  origem: string
  usuarioId: string | null
}

export type ResultadoCadastroNaFonte = {
  filiadoId?: string
  criado?: boolean
  erro?: string
  /** Cadastrado, mas algo depois falhou (o vínculo). */
  aviso?: string
}

const SO_DIGITOS = ["telefone_1", "telefone_2", "endereco_cep"]

/** "a lista…" → "da lista…" / "na lista…" (a origem vem com o artigo). */
const contrair = (preposicao: "d" | "n", origem: string) => origem.replace(/^(a|o)s? /i, (art) => preposicao + art.toLowerCase())

export async function cadastrarNaFonte(p: PessoaDaLista, o: OpcoesCadastroNaFonte): Promise<ResultadoCadastroNaFonte> {
  const nome = p.nome.replace(/\s+/g, " ").trim().slice(0, 160)
  if (nome.length < 3) return { erro: "Informe o nome." }
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const agora = new Date().toISOString()
  const cpf = p.cpf ? cpfConfiavel(p.cpf) : null
  const feito: string[] = []

  let filiadoId: string | null = null
  let criado = false
  if (cpf) {
    const [existente] = await cadastrosComCpf(cpf, [])
    if (existente) {
      filiadoId = existente.id
      if (o.ativarExistente && existente.condicao !== "Ativo") {
        await admin
          .from("filiacoes")
          .update({ filiacao_condicao: "Ativo", condicao_desde: agora, ativo_em: agora })
          .eq("id", filiadoId)
          .eq("emp_proprietaria_id", emp)
        feito.push("passou a Ativo")
      }
    }
  }

  if (!filiadoId) {
    const cadastro: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(p.cadastro ?? {})) {
      if (v) cadastro[k] = SO_DIGITOS.includes(k) ? v.replace(/\D/g, "") : v
    }
    const { data: novo, error } = await admin
      .from("filiacoes")
      .insert({
        ...cadastro,
        nome_completo: nome,
        cpf,
        filiacao_condicao: o.condicao,
        condicao_desde: agora,
        ...(o.condicao === "Ativo" ? { ativo_em: agora } : {}),
        emp_proprietaria_id: emp,
      })
      .select("id")
      .single()
    if (error || !novo) return { erro: `Não foi possível cadastrar: ${error?.message ?? "?"}` }
    filiadoId = String(novo.id)
    await atribuirMatriculaSindical(filiadoId)
    criado = true
  }

  // Vínculo aberto nesta fonte (o reaproveitado pode já ter).
  let aviso: string | undefined
  const { data: aberto } = await admin
    .from("filiacao_vinculos")
    .select("id")
    .eq("filiado_id", filiadoId)
    .eq("fonte_pagadora_id", o.fonte.id)
    .is("data_desfiliacao", null)
    .is("filiacao_data_saida", null)
    .limit(1)
  if (!aberto?.length) {
    const v = p.vinculo ?? {}
    const matricula = v.matricula ?? p.matriculaFonte
    const { error } = await admin.from("filiacao_vinculos").insert({
      filiado_id: filiadoId,
      fonte_pagadora_id: o.fonte.id,
      matricula,
      cargo: v.cargo ?? null,
      lotacao: v.lotacao ?? null,
      data_entrada_admissao: v.data_entrada_admissao ?? null,
      data_saida_demissao: v.data_saida_demissao ?? null,
      regime_trabalho: v.regime_trabalho ?? null,
      condicao_na_fonte: v.condicao_na_fonte ?? condicaoNaFontePadrao(o.fonte.fundo_pensao === true),
      fonte_pg_matricula: matricula,
      fonte_pg_cargo: v.cargo ?? null,
      fonte_pg_lotacao: v.lotacao ?? null,
      fonte_pg_admissao: v.data_entrada_admissao ?? null,
      emp_proprietaria_id: emp,
    })
    if (error) aviso = `Cadastrado, mas o vínculo falhou: ${error.message}`
    else feito.push("ganhou o vínculo na fonte")
  }

  const descricao = criado
    ? `Cadastrado a partir ${contrair("d", o.origem)} (condição ${o.condicao}).`
    : feito.length
      ? `Encontrado pelo CPF ${contrair("n", o.origem)}: ${feito.join(" e ")}.`
      : null
  if (descricao) {
    const { error } = await admin.from("filiacao_prontuario").insert({
      filiacao_id: filiadoId,
      data: agora,
      tipo: "Atualização cadastral",
      descricao,
      diretor_funcionario_id: o.usuarioId,
      emp_proprietaria_id: emp,
      created_at: agora,
      modified_at: agora,
    })
    if (error) console.error("cadastrarNaFonte — prontuário:", error.message)
  }
  return { filiadoId, criado, aviso }
}
