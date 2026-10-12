import "server-only"

import { texto } from "@/lib/db/comum"
import { registrosDoCpf } from "@/lib/db/filiado-portal"
import { formaRecebimento, type FormaRecebimento } from "@/lib/filiacao"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * MEU CADASTRO — leituras que só a página do cadastro no portal usa (achado
 * A34 da avaliação de 11/10/2026): onde a pessoa trabalha (os vínculos com a
 * fonte pagadora), desde quando é filiada e como contribui. Tudo SOMENTE
 * LEITURA: quem corrige é a secretaria, pelo painel.
 *
 * Mesmas colunas e mesmos atalhos do legado que a ficha do painel usa
 * (buscarPerfilFiliado em lib/db/filiados.ts): matrícula, cargo e lotação
 * caem para as colunas `fonte_pg_*` do cadastro antigo quando o vínculo novo
 * está vazio, e em fundo de pensão cargo e lotação "não se aplicam".
 */

export type VinculoDoPortal = {
  id: string
  fonte: string | null
  /** A fonte é fundo de pensão: cargo e lotação não se aplicam. */
  fundoPensao: boolean
  matricula: string | null
  cargo: string | null
  lotacao: string | null
  /** Trabalhador(a) da ativa / aposentado(a) / pensionista (ver CONDICOES_NA_FONTE). */
  condicaoNaFonte: string | null
  /** Admissão na fonte (AAAA-MM-DD…), quando registrada. */
  admissao: string | null
  /** Início da filiação por esta fonte. */
  desde: string | null
  /** Fim da filiação por esta fonte (só nos vínculos encerrados). */
  ate: string | null
}

export type VinculosDoPortal = {
  /** Vínculos sem data de saída — onde a contribuição é descontada hoje. */
  abertos: VinculoDoPortal[]
  /** Vínculos encerrados, do mais recente para o mais antigo. */
  anteriores: VinculoDoPortal[]
  /** Data (AAAA-MM-DD) em que a filiação começou, ou null se desconhecida. */
  filiadoDesde: string | null
  /** Como a entidade recebe a contribuição (forma_recebimento do cadastro). */
  forma: FormaRecebimento | null
}

const CAMPOS_VINCULO =
  "id, fonte_pagadora_id, matricula, fonte_pg_matricula, cargo, fonte_pg_cargo, lotacao, fonte_pg_lotacao, condicao_na_fonte, data_entrada_admissao, fonte_pg_admissao, data_filiacao, filiacao_data_adesao, data_desfiliacao, filiacao_data_saida"

/**
 * Vínculos com a fonte pagadora de TODOS os registros do CPF (a pessoa pode
 * ter mais de um registro em `filiacoes`), a data de filiação e a forma de
 * contribuição do registro mais recente (`filiacaoId`, o mesmo de
 * cadastroDoFiliado).
 *
 * "Filiado desde" segue a regra da carteirinha (desdeQuando em
 * lib/db/carteirinha.ts): o marco `ativo_em`, e na falta dele a filiação mais
 * antiga dos vínculos — para as duas telas não mostrarem datas diferentes.
 */
export async function vinculosDoFiliado(cpf: string, filiacaoId: string): Promise<VinculosDoPortal> {
  const ids = await registrosDoCpf(cpf)
  const idsDaPessoa = ids.length ? ids : [filiacaoId]
  const admin = await createAdminClient()
  const emp = await tenantAtual()

  const [vinculosRes, marcoRes, formaRes] = await Promise.all([
    admin
      .from("filiacao_vinculos")
      .select(CAMPOS_VINCULO)
      .in("filiado_id", idsDaPessoa)
      .order("created_at", { ascending: false }),
    admin.from("filiacoes").select("ativo_em").eq("id", filiacaoId).eq("emp_proprietaria_id", emp).maybeSingle(),
    // Consulta à parte: sem a coluna (supabase/filiacao-forma-recebimento.sql),
    // só a linha "Forma de contribuição" deixa de aparecer.
    admin
      .from("filiacoes")
      .select("forma_recebimento")
      .eq("id", filiacaoId)
      .eq("emp_proprietaria_id", emp)
      .maybeSingle(),
  ])
  if (vinculosRes.error) throw new Error(`Falha ao ler os vínculos: ${vinculosRes.error.message}`)
  const linhas = vinculosRes.data ?? []

  // Nomes das fontes e quais são fundo de pensão, num lote só.
  const fonteIds = [
    ...new Set(linhas.map((v) => texto(v.fonte_pagadora_id)).filter((v): v is string => !!v)),
  ]
  const nomes = new Map<string, string>()
  const fundos = new Set<string>()
  if (fonteIds.length) {
    const { data: empresas } = await admin
      .from("empresa")
      .select("id, empresa, nome_fantasia, nome_razao, fundo_pensao")
      .in("id", fonteIds)
    for (const e of empresas ?? []) {
      const nome = texto(e.nome_fantasia) ?? texto(e.empresa) ?? texto(e.nome_razao)
      if (nome) nomes.set(String(e.id), nome)
      if (e.fundo_pensao === true) fundos.add(String(e.id))
    }
  }

  const vinculos: VinculoDoPortal[] = linhas.map((v) => {
    const fonteId = texto(v.fonte_pagadora_id)
    return {
      id: String(v.id),
      fonte: fonteId ? (nomes.get(fonteId) ?? null) : null,
      fundoPensao: fonteId ? fundos.has(fonteId) : false,
      matricula: texto(v.matricula) ?? texto(v.fonte_pg_matricula),
      cargo: texto(v.cargo) ?? texto(v.fonte_pg_cargo),
      lotacao: texto(v.lotacao) ?? texto(v.fonte_pg_lotacao),
      condicaoNaFonte: texto(v.condicao_na_fonte),
      admissao: texto(v.data_entrada_admissao) ?? texto(v.fonte_pg_admissao),
      desde: texto(v.data_filiacao) ?? texto(v.filiacao_data_adesao),
      ate: texto(v.data_desfiliacao) ?? texto(v.filiacao_data_saida),
    }
  })

  // Aberto = sem data de saída nem de desfiliação (o critério da carteirinha
  // e da contribuição).
  const abertos = vinculos.filter((v) => !v.ate)
  const anteriores = vinculos
    .filter((v) => !!v.ate)
    .sort((a, b) => String(b.ate).localeCompare(String(a.ate)))

  const primeira = vinculos
    .map((v) => v.desde)
    .filter((d): d is string => !!d)
    .sort()[0]

  return {
    abertos,
    anteriores,
    filiadoDesde: texto(marcoRes.data?.ativo_em)?.slice(0, 10) ?? primeira?.slice(0, 10) ?? null,
    forma: formaRes.error ? null : formaRecebimento(formaRes.data?.forma_recebimento),
  }
}
