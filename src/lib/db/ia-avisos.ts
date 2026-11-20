import "server-only"

import { avisar, avisarQuemPode, depoisDaResposta, usuariosComPermissao } from "@/lib/db/avisos"
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

/**
 * Cota mensal do departamento a 80% e 100%: avisa quem tem a Gestão do sistema
 * e o coordenador do departamento, uma vez por nível por mês (a marca é a
 * linha em ia_cota_avisos — o insert que conflita não avisa de novo).
 */
export async function conferirCotaIA(emp: string, departamentoId: string, limite: number, bloqueia: boolean): Promise<void> {
  try {
    const admin = await createAdminClient()
    depoisDaResposta(async () => {
      const { data: linhas } = await admin.rpc("ia_uso_custo_por_departamento", { p_emp: emp, p_de: inicioDoMes().toISOString() })
      const linha = ((linhas ?? []) as Record<string, unknown>[]).find((l) => String(l.departamento_id) === departamentoId)
      const gasto = Number(linha?.custo ?? 0) || 0
      const nivel = gasto >= limite ? 100 : gasto >= limite * 0.8 ? 80 : null
      if (!nivel) return
      const mes = mesDeBrasilia()
      // Marca o 80% junto com o 100% (quem pula direto não recebe os dois).
      const niveis = nivel === 100 ? [80, 100] : [80]
      const { data: novas } = await admin
        .from("ia_cota_avisos")
        .upsert(
          niveis.map((n) => ({ emp_proprietaria_id: emp, departamento_id: departamentoId, mes, nivel: n })),
          { onConflict: "emp_proprietaria_id,departamento_id,mes,nivel", ignoreDuplicates: true }
        )
        .select("nivel")
      if (!(novas ?? []).some((n) => Number(n.nivel) === nivel)) return

      const { data: d } = await admin
        .from("empresa_departamentos")
        .select("departamento, coordenador_id")
        .eq("emp_proprietaria_id", emp)
        .eq("id", departamentoId)
        .maybeSingle()
      const nome = String(d?.departamento ?? "o departamento")
      const texto =
        nivel === 100
          ? bloqueia
            ? `A IA de ${nome} atingiu a cota do mês (${usd(gasto)} de ${usd(limite)}) e está parada para o departamento até o dia 1º ou até a cota subir.`
            : `A IA de ${nome} atingiu a cota do mês (${usd(gasto)} de ${usd(limite)}). A cota só alerta: a IA continua funcionando.`
          : `A IA de ${nome} chegou a 80% da cota do mês (${usd(gasto)} de ${usd(limite)}).${bloqueia ? " Ao atingir a cota, ela para para o departamento." : ""}`
      const amb = { client: admin, tenantId: emp }
      const destinatarios = await usuariosComPermissao("gestao_sistema", [], amb)
      if (d?.coordenador_id) {
        const { data: u } = await admin
          .from("usuarios")
          .select("id, nome_completo, nome_guerra, email")
          .eq("id", String(d.coordenador_id))
          .maybeSingle()
        if (u) destinatarios.push({ id: String(u.id), nome: (u.nome_completo ?? u.nome_guerra ?? null) as string | null, email: (u.email ?? null) as string | null, permissoes: {} })
      }
      await avisar(
        destinatarios,
        { texto, link: LINK, evento: "ia_cota_departamento", assunto: nivel === 100 ? `Cota de IA de ${nome} atingida` : `IA de ${nome} perto da cota` },
        amb
      )
    })
  } catch (e) {
    console.error("conferirCotaIA:", e)
  }
}
