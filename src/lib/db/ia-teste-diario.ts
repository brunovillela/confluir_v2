import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { contextoDoTenant } from "@/lib/db/comunicacao-mensagens"
import { avisarChaveRecusada } from "@/lib/db/ia-avisos"
import { configIAParaChamada } from "@/lib/db/ia-config"
import { testarChaveIA } from "@/lib/ia"
import { comTenant } from "@/lib/tenant-contexto"

/**
 * TESTE DIÁRIO DA CHAVE DE IA (Gestão, 22/11/2026). Antes, a chave da entidade
 * recusada (revogada, sem créditos) só aparecia quando alguém tentava usar a
 * IA e falhava. O cron (/api/gestao/ia/tick) testa, uma vez por dia, a chave
 * de cada entidade que tem uma — com uma chamada mínima — e avisa quem tem a
 * Gestão do sistema quando ela não responde (no máximo um aviso por dia, a
 * mesma marca do aviso da chamada recusada).
 *
 * Não testa quem usou a chave com sucesso nas últimas 24 horas: ela funciona,
 * e o teste seria só custo. Falha de rede não vira alarme: o teste repete uma
 * vez antes de avisar.
 */

export type ResultadoTesteChave = {
  tenant: string
  situacao: "ok" | "falhou" | "ilegivel" | "usada_recentemente" | "erro"
  detalhe?: string
}

const DIA_MS = 24 * 3600_000

export async function testarChavesDasEntidades(svc: SupabaseClient, unico?: string | null): Promise<ResultadoTesteChave[]> {
  let q = svc.from("ia_config").select("emp_proprietaria_id").not("chave_cifrada", "is", null)
  if (unico) q = q.eq("emp_proprietaria_id", unico)
  const { data, error } = await q
  if (error) throw new Error(`ia_config: ${error.message}`)

  const resultados: ResultadoTesteChave[] = []
  for (const linha of data ?? []) {
    const emp = String(linha.emp_proprietaria_id)
    try {
      const desde = new Date(Date.now() - DIA_MS).toISOString()
      const { count } = await svc
        .from("ia_uso")
        .select("id", { count: "exact", head: true })
        .eq("emp_proprietaria_id", emp)
        .eq("origem_chave", "entidade")
        .eq("sucesso", true)
        .gte("criado_em", desde)
      if ((count ?? 0) > 0) {
        resultados.push({ tenant: emp, situacao: "usada_recentemente" })
        continue
      }
      const contexto = await contextoDoTenant(emp, svc)
      resultados.push(await comTenant({ tenantId: emp, origem: contexto.origem }, () => testarUma(svc, emp)))
    } catch (e) {
      resultados.push({ tenant: emp, situacao: "erro", detalhe: e instanceof Error ? e.message : String(e) })
    }
  }
  return resultados
}

async function testarUma(svc: SupabaseClient, emp: string): Promise<ResultadoTesteChave> {
  const { config, chave } = await configIAParaChamada(emp)
  const agora = new Date().toISOString()
  if (!chave) {
    // A chave existe mas não decifra: a IA está caindo na conta da plataforma sem ninguém saber.
    const motivo = "A chave guardada não pode ser lida neste servidor (a chave de cifra mudou)."
    await svc.from("ia_config").update({ chave_testada_em: agora, chave_teste_erro: motivo }).eq("emp_proprietaria_id", emp)
    await avisarChaveRecusada(emp, motivo, {
      texto: `${motivo} Enquanto isso, a IA da entidade usa a conta da plataforma. Confira em Gestão › Inteligência Artificial.`,
      assunto: "Chave de IA da entidade ilegível",
    })
    return { tenant: emp, situacao: "ilegivel" }
  }
  let erro = await testarChaveIA(chave, config.modelo)
  if (erro) erro = await testarChaveIA(chave, config.modelo)
  await svc.from("ia_config").update({ chave_testada_em: agora, chave_teste_erro: erro }).eq("emp_proprietaria_id", emp)
  if (erro) {
    await avisarChaveRecusada(emp, erro)
    return { tenant: emp, situacao: "falhou", detalhe: erro }
  }
  return { tenant: emp, situacao: "ok" }
}
