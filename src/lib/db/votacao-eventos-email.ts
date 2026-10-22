import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

/**
 * EVENTOS DE ENTREGA DA BREVO NOS E-MAILS DE VOTAÇÃO (fase 4 do plano de
 * 21/10/2026, docs/plano-votacao-entrega-preparacao.md).
 *
 * Cada e-mail de votação sai com o cabeçalho `X-Mailin-custom`
 * ("voto|<entidade>|<tipo>|<apto>"), que a Brevo devolve em cada evento do
 * webhook (/api/webhooks/brevo). Aqui o evento vira marca no apto:
 *
 *  - tipo "a" (aviso com o link pessoal, ao e-mail da lista):
 *      entregue → email_entregue_em;
 *      clique até 2 min depois da entrega → email_clique_robo_em (o robô de
 *        segurança da empresa abre todos os links logo que a mensagem chega —
 *        Halliburton, 21/10: 29 de 30 cliques); depois → email_clique_humano_em;
 *      rejeição definitiva → email_rejeicao + aviso_email_erro "rejeitado"
 *        (conta como sem link no alerta da rodada; não volta para a fila);
 *  - tipo "p" (aviso prévio) e "c" (contato do link geral): rejeição
 *    definitiva → erro "rejeitado" na marca própria.
 *
 * O cliente vem de quem chama (a rota usa o service role: o webhook atende
 * todas as entidades, e a entidade vem no cabeçalho).
 */

export type TipoEmailVoto = "a" | "p" | "c"

/** Valor do X-Mailin-custom de um e-mail de votação. */
export function marcaEmailVoto(tenantId: string, tipo: TipoEmailVoto, aptoId: string): Record<string, string> {
  return { "X-Mailin-custom": `voto|${tenantId}|${tipo}|${aptoId}` }
}

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
const MARCA = new RegExp(`^voto\\|(${UUID})\\|([apc])\\|(${UUID})$`, "i")

/** Janela em que um clique depois da entrega é do robô, não de gente. */
const JANELA_ROBO_MS = 2 * 60_000

const REJEICOES = new Set(["hard_bounce", "invalid_email", "blocked", "spam", "complaint"])

export type EventoBrevo = Record<string, unknown>

function quando(e: EventoBrevo): string {
  const epoch = Number(e.ts_event ?? e.ts_epoch ?? e.ts)
  if (Number.isFinite(epoch) && epoch > 0) return new Date(epoch > 1e12 ? epoch : epoch * 1000).toISOString()
  const d = new Date(String(e.date ?? ""))
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString()
}

/** Processa um evento; devolve o que fez (para o log da rota). Nunca lança. */
export async function registrarEventoBrevo(client: SupabaseClient, e: EventoBrevo): Promise<string> {
  try {
    const marca = MARCA.exec(String(e["X-Mailin-custom"] ?? e["x-mailin-custom"] ?? "").trim())
    if (!marca) return "ignorado (não é de votação)"
    const [, emp, tipo, aptoId] = marca
    const evento = String(e.event ?? "").toLowerCase()
    const em = quando(e)

    if (REJEICOES.has(evento)) {
      const motivo = `${evento}${e.reason ? `: ${String(e.reason)}` : ""}`.slice(0, 200)
      if (tipo === "a") {
        await client
          .from("voto_assembleias_aptos")
          .update({ email_rejeicao: motivo, aviso_email_erro: "rejeitado" })
          .eq("id", aptoId)
          .eq("emp_proprietaria_id", emp)
          .is("hora_voto", null)
        return `rejeição do aviso (${evento})`
      }
      const coluna = tipo === "p" ? "aviso_previo_erro" : "aviso_contato_erro"
      let q = client.from("voto_assembleias_aptos").update({ [coluna]: "rejeitado" }).eq("id", aptoId).eq("emp_proprietaria_id", emp)
      // Contato pelos dois canais: o Telegram ainda chegou — não é falha.
      if (tipo === "c") q = q.eq("aviso_contato_canais", "email")
      await q
      return `rejeição (${tipo}, ${evento})`
    }
    if (tipo !== "a") return "ignorado (só a rejeição importa neste tipo)"

    if (evento === "delivered") {
      await client.from("voto_assembleias_aptos").update({ email_entregue_em: em }).eq("id", aptoId).eq("emp_proprietaria_id", emp)
      return "entregue"
    }
    if (evento === "click") {
      const { data } = await client
        .from("voto_assembleias_aptos")
        .select("email_entregue_em, email_clique_humano_em, email_clique_robo_em")
        .eq("id", aptoId)
        .eq("emp_proprietaria_id", emp)
        .maybeSingle()
      if (!data) return "apto não encontrado"
      const entregue = data.email_entregue_em ? new Date(String(data.email_entregue_em)).getTime() : null
      const t = new Date(em).getTime()
      const robo = entregue !== null && t >= entregue && t - entregue < JANELA_ROBO_MS
      const coluna = robo ? "email_clique_robo_em" : "email_clique_humano_em"
      if (!data[coluna]) {
        await client.from("voto_assembleias_aptos").update({ [coluna]: em }).eq("id", aptoId).eq("emp_proprietaria_id", emp)
      }
      return robo ? "clique do robô" : "clique de gente"
    }
    return `ignorado (${evento})`
  } catch (erro) {
    return `erro: ${erro instanceof Error ? erro.message : String(erro)}`
  }
}

export type ResumoEntregaBrevo = {
  /** Avisos com o link pessoal entregues ao servidor do destinatário. */
  entregues: number
  /** Aptos com clique de gente (mais de 2 min depois da entrega). */
  cliqueGente: number
  /** Aptos em que só o robô de segurança clicou. */
  soRobo: number
  /** Endereços rejeitados de vez (hard bounce, inválido, bloqueado, spam). */
  rejeitados: number
}

/** Resumo dos eventos da Brevo na rodada (null = migração não aplicada ou webhook ainda sem eventos). */
export async function resumoEntregaBrevo(rodadaId: string): Promise<ResumoEntregaBrevo | null> {
  const { createAdminClient } = await import("@/lib/supabase/admin")
  const { tenantAtual } = await import("@/lib/tenant")
  const client = await createAdminClient()
  const emp = await tenantAtual()
  const base = () =>
    client
      .from("voto_assembleias_aptos")
      .select("id", { count: "exact", head: true })
      .eq("emp_proprietaria_id", emp)
      .eq("rod_assembleia_id", rodadaId)
  const [entregues, gente, robo, rejeitados] = await Promise.all([
    base().not("email_entregue_em", "is", null),
    base().not("email_clique_humano_em", "is", null),
    base().not("email_clique_robo_em", "is", null).is("email_clique_humano_em", null),
    base().not("email_rejeicao", "is", null),
  ])
  if (entregues.error) return null
  const r = { entregues: entregues.count ?? 0, cliqueGente: gente.count ?? 0, soRobo: robo.count ?? 0, rejeitados: rejeitados.count ?? 0 }
  return r.entregues + r.rejeitados > 0 ? r : null
}
