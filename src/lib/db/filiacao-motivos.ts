import "server-only"

import { motivoDesfiliacaoValido, rotuloMotivoDesfiliacao } from "@/lib/churn-constantes"
import { invalidarCacheChurn } from "@/lib/db/churn"
import { lerEmLotesPorIds, texto } from "@/lib/db/comum"
import { invalidarCacheCadastrosPendentes } from "@/lib/db/filiacao-cadastros-pendentes"
import { invalidarCacheProntuarios } from "@/lib/db/prontuario"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Motivo da desfiliação EM LOTE (29/10/2026): havia 985 vínculos encerrados
 * sem motivo só entre os ativos — um a um, pelo lápis do vínculo, não fecha.
 * A lista vem do churn (quem saiu nos 12 meses) e de Cadastros pendentes
 * (ativos com vínculo encerrado sem motivo); a gravação é uma só.
 */

export type VinculoSemMotivo = {
  vinculoId: string
  filiadoId: string
  nome: string | null
  fonte: string | null
  /** Data de desfiliação (ou a de saída do sistema antigo). */
  saida: string | null
}

/** Vínculos encerrados e sem motivo, dos filiados (ou vínculos) pedidos, mais recentes primeiro. */
export async function vinculosSemMotivo(filtro: { filiadoIds?: string[]; vinculoIds?: string[] }): Promise<VinculoSemMotivo[]> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const porFiliado = filtro.filiadoIds !== undefined
  const ids = (porFiliado ? filtro.filiadoIds : filtro.vinculoIds) ?? []
  if (!ids.length) return []
  const vinculos = await lerEmLotesPorIds<Record<string, unknown>>(ids, (fatia, de, ate) =>
    admin
      .from("filiacao_vinculos")
      .select("id, filiado_id, fonte_pagadora_id, data_desfiliacao, filiacao_data_saida")
      .eq("emp_proprietaria_id", emp)
      .in(porFiliado ? "filiado_id" : "id", fatia)
      .is("desfiliacao_motivo", null)
      .or("data_desfiliacao.not.is.null,filiacao_data_saida.not.is.null")
      .order("id", { ascending: true })
      .range(de, ate)
  )
  const [nomes, fontes] = await Promise.all([
    lerEmLotesPorIds<Record<string, unknown>>(
      vinculos.map((v) => String(v.filiado_id)),
      (fatia, de, ate) => admin.from("filiacoes").select("id, nome_completo").in("id", fatia).order("id", { ascending: true }).range(de, ate)
    ),
    lerEmLotesPorIds<Record<string, unknown>>(
      vinculos.map((v) => texto(v.fonte_pagadora_id)).filter((x): x is string => Boolean(x)),
      (fatia, de, ate) => admin.from("empresa").select("id, nome_fantasia, nome_razao").in("id", fatia).order("id", { ascending: true }).range(de, ate)
    ),
  ])
  const nomePor = new Map(nomes.map((n) => [String(n.id), texto(n.nome_completo)]))
  const fontePor = new Map(fontes.map((f) => [String(f.id), texto(f.nome_fantasia) ?? texto(f.nome_razao)]))
  return vinculos
    .map((v) => ({
      vinculoId: String(v.id),
      filiadoId: String(v.filiado_id),
      nome: nomePor.get(String(v.filiado_id)) ?? null,
      fonte: v.fonte_pagadora_id ? (fontePor.get(String(v.fonte_pagadora_id)) ?? null) : null,
      saida: (texto(v.data_desfiliacao) ?? texto(v.filiacao_data_saida))?.slice(0, 10) ?? null,
    }))
    .sort((a, b) => (b.saida ?? "").localeCompare(a.saida ?? "") || (a.nome ?? "").localeCompare(b.nome ?? "", "pt-BR"))
}

/**
 * Grava o mesmo motivo em vários vínculos encerrados. Só onde ainda não há
 * motivo (não sobrescreve o que alguém registrou) e anota no prontuário de
 * cada filiado.
 */
export async function definirMotivoEmLote(
  vinculoIds: string[],
  motivo: string,
  usuarioId: string
): Promise<{ atualizados?: number; erro?: string }> {
  if (!motivoDesfiliacaoValido(motivo)) return { erro: "Motivo inválido." }
  const ids = [...new Set(vinculoIds)]
  if (!ids.length) return { erro: "Nenhum vínculo marcado." }
  if (ids.length > 2000) return { erro: "No máximo 2.000 vínculos por vez." }
  const admin = await createAdminClient()
  const emp = await tenantAtual()

  const gravados: Record<string, unknown>[] = []
  for (let de = 0; de < ids.length; de += 200) {
    const { data, error } = await admin
      .from("filiacao_vinculos")
      .update({ desfiliacao_motivo: motivo })
      .in("id", ids.slice(de, de + 200))
      .eq("emp_proprietaria_id", emp)
      .is("desfiliacao_motivo", null)
      .or("data_desfiliacao.not.is.null,filiacao_data_saida.not.is.null")
      .select("id, filiado_id, fonte_pagadora_id, data_desfiliacao, filiacao_data_saida")
    if (error) return { erro: `Falha ao gravar: ${error.message}`, atualizados: gravados.length }
    gravados.push(...(data ?? []))
  }

  if (gravados.length) {
    const fontes = await lerEmLotesPorIds<Record<string, unknown>>(
      gravados.map((g) => texto(g.fonte_pagadora_id)).filter((x): x is string => Boolean(x)),
      (fatia, de, ate) => admin.from("empresa").select("id, nome_fantasia, nome_razao").in("id", fatia).order("id", { ascending: true }).range(de, ate)
    ).catch(() => [] as Record<string, unknown>[])
    const fontePor = new Map(fontes.map((f) => [String(f.id), texto(f.nome_fantasia) ?? texto(f.nome_razao)]))
    const agora = new Date().toISOString()
    const rotulo = rotuloMotivoDesfiliacao(motivo)
    const linhas = gravados.map((g) => {
      const fonte = g.fonte_pagadora_id ? fontePor.get(String(g.fonte_pagadora_id)) : null
      const saida = (texto(g.data_desfiliacao) ?? texto(g.filiacao_data_saida))?.slice(0, 10)
      return {
        filiacao_id: String(g.filiado_id),
        data: agora,
        tipo: "Atualização cadastral",
        descricao: `Motivo da desfiliação registrado em lote: ${rotulo}${fonte ? ` (vínculo em ${fonte}` : " (vínculo"}${saida ? `, saída em ${saida.split("-").reverse().join("/")})` : ")"}.`,
        diretor_funcionario_id: usuarioId,
        emp_proprietaria_id: emp,
        created_at: agora,
        modified_at: agora,
      }
    })
    for (let de = 0; de < linhas.length; de += 500) {
      const { error } = await admin.from("filiacao_prontuario").insert(linhas.slice(de, de + 500))
      if (error) console.error("Motivo em lote — prontuário:", error.message)
    }
  }

  invalidarCacheChurn()
  invalidarCacheCadastrosPendentes()
  invalidarCacheProntuarios()
  return { atualizados: gravados.length }
}
