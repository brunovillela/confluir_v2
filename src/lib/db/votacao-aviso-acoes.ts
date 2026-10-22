import "server-only"

import { texto } from "@/lib/db/comum"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * RASTRO DAS AÇÕES SOBRE OS AVISOS DA RODADA (22/10/2026).
 *
 * Na Halliburton, com a votação aberta, alguém clicou em "Reenviar a quem não
 * votou": 1.209 aptos voltaram para a fila e o alerta "sem link" acendeu — sem
 * como saber quem nem quando. Daqui em diante cada reenvio, envio manual em
 * lotes, aviso prévio e mudança do envio automático fica registrado
 * (`voto_aviso_acoes`) e aparece no card do aviso da rodada.
 */

export type AcaoAviso =
  | "reabrir_nao_votaram"
  | "reabrir_todos"
  | "reabrir_falhas"
  | "reabrir_contato"
  | "enviar_aviso"
  | "enviar_aviso_previo"
  | "aviso_auto"
  | "aviso_previo_auto"

export const ROTULOS_ACAO_AVISO: Record<AcaoAviso, string> = {
  reabrir_nao_votaram: "Reenviar a quem não votou",
  reabrir_todos: "Reenviar para todos",
  reabrir_falhas: "Tentar de novo as falhas",
  reabrir_contato: "Reenviar só pelo e-mail pessoal e Telegram",
  enviar_aviso: "Envio do aviso (botão)",
  enviar_aviso_previo: "Envio do aviso prévio (botão)",
  aviso_auto: "Envio automático do aviso",
  aviso_previo_auto: "Aviso prévio automático",
}

/** Lotes seguidos do mesmo envio, pela mesma pessoa, viram uma linha só. */
const JANELA_ACUMULAR_MS = 15 * 60_000

/**
 * Registra a ação. Nunca lança: o rastro não pode impedir o envio — mas a
 * falha vai para o log do servidor.
 */
export async function registrarAcaoAviso(dados: {
  rodadaId: string
  acao: AcaoAviso
  quantidade?: number | null
  detalhe?: string | null
  usuario: { id: string; nome: string | null }
  /** Soma à última linha igual (mesma pessoa, mesma ação, até 15 min) — lotes de um envio. */
  acumular?: boolean
}): Promise<void> {
  try {
    const client = await createAdminClient()
    const emp = await tenantAtual()
    if (dados.acumular) {
      const { data: ultima } = await client
        .from("voto_aviso_acoes")
        .select("id, quantidade, criado_em")
        .eq("emp_proprietaria_id", emp)
        .eq("rodada_id", dados.rodadaId)
        .eq("acao", dados.acao)
        .eq("usuario_id", dados.usuario.id)
        .order("criado_em", { ascending: false })
        .limit(1)
        .maybeSingle()
      if (ultima && Date.now() - new Date(String(ultima.criado_em)).getTime() < JANELA_ACUMULAR_MS) {
        await client
          .from("voto_aviso_acoes")
          .update({ quantidade: Number(ultima.quantidade ?? 0) + (dados.quantidade ?? 0) })
          .eq("id", ultima.id)
          .eq("emp_proprietaria_id", emp)
        return
      }
    }
    const { error } = await client.from("voto_aviso_acoes").insert({
      emp_proprietaria_id: emp,
      rodada_id: dados.rodadaId,
      acao: dados.acao,
      quantidade: dados.quantidade ?? null,
      detalhe: dados.detalhe ?? null,
      usuario_id: dados.usuario.id,
      usuario_nome: dados.usuario.nome,
    })
    if (error) console.error("[votacao-aviso-acoes]", error.message)
  } catch (e) {
    console.error("[votacao-aviso-acoes]", e instanceof Error ? e.message : e)
  }
}

export type AcaoAvisoRegistrada = {
  acao: AcaoAviso
  rotulo: string
  quantidade: number | null
  detalhe: string | null
  usuarioNome: string | null
  criadoEm: string
}

/** Últimas ações da rodada (vazio sem a migração). */
export async function acoesAvisoDaRodada(rodadaId: string, limite = 8): Promise<AcaoAvisoRegistrada[]> {
  const client = await createAdminClient()
  const { data, error } = await client
    .from("voto_aviso_acoes")
    .select("acao, quantidade, detalhe, usuario_nome, criado_em")
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("rodada_id", rodadaId)
    .order("criado_em", { ascending: false })
    .limit(limite)
  if (error) return []
  return (data ?? []).map((a) => ({
    acao: a.acao as AcaoAviso,
    rotulo: ROTULOS_ACAO_AVISO[a.acao as AcaoAviso] ?? String(a.acao),
    quantidade: typeof a.quantidade === "number" ? a.quantidade : null,
    detalhe: texto(a.detalhe),
    usuarioNome: texto(a.usuario_nome),
    criadoEm: String(a.criado_em),
  }))
}
