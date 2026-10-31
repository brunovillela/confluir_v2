import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { hojeSP } from "@/lib/db/comum"
import { notificarLiberacaoPessoal } from "@/lib/db/pessoal"
import type { ContextoEmail } from "@/lib/email"

/**
 * LIBERAÇÃO AUTOMÁTICA DA REMESSA (31/10/2026) — contracheques e ponto.
 *
 * A remessa com `liberar_em` vencido (hoje ou antes, no fuso de São Paulo) e
 * ainda sem `liberada_automaticamente_em` tem os itens bloqueados liberados
 * ao funcionário, cada um avisado como na liberação manual (sino, e-mail e
 * Telegram conforme a preferência). Roda uma vez por remessa: o que o gestor
 * bloquear depois fica bloqueado. Chamada pelo tick /api/pessoal/liberacao.
 */

const TIPOS = [
  { tipo: "contracheque", remessas: "pessoal_contracheques_remessas", itens: "pessoal_contracheques" },
  { tipo: "ponto", remessas: "pessoal_registro_ponto_remessas", itens: "pessoal_registro_ponto" },
] as const

export async function liberarRemessasDoDia(
  tenantId: string,
  client: SupabaseClient,
  contexto: ContextoEmail
): Promise<{ remessas: number; liberados: number; erros: string[] }> {
  let remessas = 0
  let liberados = 0
  const erros: string[] = []
  for (const t of TIPOS) {
    const { data: rems, error } = await client
      .from(t.remessas)
      .select("id, nome_remessa")
      .eq("emp_proprietaria_id", tenantId)
      .lte("liberar_em", hojeSP())
      .is("liberada_automaticamente_em", null)
    if (error) {
      // Sem a coluna (migração ainda não aplicada): nada a fazer.
      if (error.code !== "42703") erros.push(`${t.remessas}: ${error.message}`)
      continue
    }
    for (const rem of rems ?? []) {
      const { data: alvo, error: erroAlvo } = await client
        .from(t.itens)
        .select("id, funcionario_id")
        .eq("remessa_id", rem.id)
        .or("liberado.is.null,liberado.eq.false")
      if (erroAlvo) {
        erros.push(`${rem.nome_remessa ?? rem.id}: ${erroAlvo.message}`)
        continue
      }
      const ids = (alvo ?? []).map((a) => String(a.id))
      if (ids.length) {
        const { error: erroLib } = await client.from(t.itens).update({ liberado: true }).in("id", ids).eq("remessa_id", rem.id)
        if (erroLib) {
          erros.push(`${rem.nome_remessa ?? rem.id}: ${erroLib.message}`)
          continue
        }
      }
      // Marca antes dos avisos: uma falha de e-mail não libera de novo amanhã.
      await client.from(t.remessas).update({ liberada_automaticamente_em: new Date().toISOString() }).eq("id", rem.id)
      for (const a of alvo ?? []) {
        if (!a.funcionario_id) continue
        try {
          await notificarLiberacaoPessoal(String(a.funcionario_id), t.tipo, rem.nome_remessa ?? null, String(a.id), { client, contexto })
        } catch (e) {
          erros.push(`aviso ${a.id}: ${e instanceof Error ? e.message : String(e)}`)
        }
      }
      remessas++
      liberados += ids.length
    }
  }
  return { remessas, liberados, erros }
}
