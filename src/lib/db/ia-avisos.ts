import "server-only"

import { avisarQuemPode, depoisDaResposta } from "@/lib/db/avisos"
import { inicioDoMes } from "@/lib/db/ia-config"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Avisos da IA aos administradores (quem tem `gestao_sistema`), pelo sistema
 * de avisos (sino; e-mail, Telegram e celular conforme Meu perfil → Avisos):
 *  - o custo estimado do mês passou de 80% e de 100% do teto — um aviso por
 *    nível por mês;
 *  - a OpenAI recusou a chave da entidade (inválida, sem permissão ou sem
 *    créditos) — no máximo um aviso por dia.
 * A marca em ia_config é gravada por um UPDATE condicional antes de avisar:
 * chamadas simultâneas não duplicam o aviso. Tudo aqui é melhor esforço e
 * roda depois da resposta; nunca atrasa nem derruba a chamada de IA.
 */

const LINK = "/painel/gestao/ia"

function mesDeBrasilia(agora = new Date()): string {
  return new Date(agora.getTime() - 3 * 3600_000).toISOString().slice(0, 7)
}

function usd(n: number): string {
  return `US$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** Confere o teto depois de uma chamada e avisa ao cruzar 80% ou 100%. */
export async function conferirTetoIA(emp: string, limite: number, bloqueia: boolean): Promise<void> {
  try {
    // O cliente sai daqui, ainda dentro da entidade da requisição (ou do comTenant do bot).
    const admin = await createAdminClient()
    depoisDaResposta(async () => {
      const { data: gastoBruto } = await admin.rpc("ia_uso_custo_desde", { p_emp: emp, p_de: inicioDoMes().toISOString() })
      const gasto = Number(gastoBruto ?? 0) || 0
      const nivel = gasto >= limite ? 100 : gasto >= limite * 0.8 ? 80 : null
      if (!nivel) return
      const mes = mesDeBrasilia()
      const { data: marcada } = await admin
        .from("ia_config")
        .update({ aviso_teto_mes: mes, aviso_teto_nivel: nivel })
        .eq("emp_proprietaria_id", emp)
        .or(`aviso_teto_mes.is.null,aviso_teto_mes.neq.${mes},aviso_teto_nivel.is.null,aviso_teto_nivel.lt.${nivel}`)
        .select("emp_proprietaria_id")
      if (!marcada?.length) return
      const texto =
        nivel === 100
          ? bloqueia
            ? `A IA da entidade atingiu o teto mensal (${usd(gasto)} de ${usd(limite)}) e está parada até o dia 1º ou até o teto subir.`
            : `A IA da entidade atingiu o teto mensal (${usd(gasto)} de ${usd(limite)}). O teto só alerta: a IA continua funcionando.`
          : `A IA da entidade chegou a 80% do teto mensal (${usd(gasto)} de ${usd(limite)}).${bloqueia ? " Ao atingir o teto, ela para." : ""}`
      await avisarQuemPode(
        "gestao_sistema",
        [],
        { texto, link: LINK, evento: "gestao_ia", assunto: nivel === 100 ? "Teto mensal da IA atingido" : "IA perto do teto mensal" },
        { client: admin, tenantId: emp }
      )
    })
  } catch (e) {
    console.error("conferirTetoIA:", e)
  }
}

/** A OpenAI recusou a chave da entidade: avisa os administradores (uma vez por dia). */
export async function avisarChaveRecusada(emp: string, motivo: string): Promise<void> {
  try {
    const admin = await createAdminClient()
    depoisDaResposta(async () => {
      const ontem = new Date(Date.now() - 24 * 3600_000).toISOString()
      const { data: marcada } = await admin
        .from("ia_config")
        .update({ chave_aviso_erro_em: new Date().toISOString() })
        .eq("emp_proprietaria_id", emp)
        .or(`chave_aviso_erro_em.is.null,chave_aviso_erro_em.lt."${ontem}"`)
        .select("emp_proprietaria_id")
      if (!marcada?.length) return
      await avisarQuemPode(
        "gestao_sistema",
        [],
        {
          texto: `A OpenAI recusou a chave de IA da entidade: ${motivo} Enquanto isso, as funções de IA falham. Confira em Gestão › Inteligência Artificial.`,
          link: LINK,
          evento: "gestao_ia",
          assunto: "Chave de IA da entidade recusada",
        },
        { client: admin, tenantId: emp }
      )
    })
  } catch (e) {
    console.error("avisarChaveRecusada:", e)
  }
}
