import "server-only"

import { avisar, usuariosComPermissao } from "@/lib/db/avisos"
import { texto } from "@/lib/db/comum"
import { contextoDoTenant } from "@/lib/db/comunicacao-mensagens"
import {
  situacaoDosPlanos,
  vencimentoDoPlano,
  type SituacaoPlano,
} from "@/lib/db/veiculos-manutencoes"
import { createServiceClient } from "@/lib/supabase/admin"

/**
 * Aviso ATIVO das preventivas da frota (cron diário, /api/veiculos/preventivas/tick).
 *
 * As telas já mostravam a revisão próxima ou vencida — mas só para quem abria
 * Manutenções ou a página do veículo. Aqui a gestão da frota (permissão
 * `veiculos_gestao`, direta ou por perfil) recebe por e-mail, Telegram e
 * celular — fora do sino: é pendência, e fica na caixa de entrada:
 *
 * - uma vez quando a preventiva entra na janela de alerta (se aproximando);
 * - uma vez quando vence.
 *
 * O texto do aviso é estável enquanto a base do plano não muda (nomeia o
 * vencimento, "20/10/2026 ou aos 60.000 km", e não "faltam N dias"): ele é a
 * chave em avisos_entregas, e repetir o mesmo texto para a mesma pessoa é o
 * que se evita.
 * Registrada a manutenção, o vencimento seguinte muda o texto e o ciclo recomeça.
 */

export async function tenantsComPreventivas(): Promise<string[]> {
  const svc = createServiceClient()
  const { data, error } = await svc
    .from("veiculos_manutencao_planos")
    .select("emp_proprietaria_id")
    .not("ativo", "is", false)
  if (error) return []
  return [...new Set((data ?? []).map((p) => texto(p.emp_proprietaria_id)).filter((v): v is string => Boolean(v)))]
}

export function textoAvisoPreventiva(s: SituacaoPlano): string {
  const quando = vencimentoDoPlano(s)
  return (
    `${s.vencido ? "Revisão preventiva vencida" : "Revisão preventiva se aproximando"} — ` +
    `${s.veiculoRotulo}: ${s.plano.descricao}` +
    (quando ? ` (prevista para ${quando})` : "") +
    "."
  )
}

export async function avisarPreventivas(tenantId: string): Promise<{ alertas: number; enviados: number }> {
  const svc = createServiceClient()
  const { ativo, linhas } = await situacaoDosPlanos(undefined, { admin: svc, emp: tenantId })
  const alertas = ativo ? linhas.filter((l) => l.vencido || l.proximo) : []
  if (alertas.length === 0) return { alertas: 0, enviados: 0 }

  const amb = { client: svc, tenantId, contexto: await contextoDoTenant(tenantId, svc) }
  const gestores = await usuariosComPermissao("veiculos_gestao", [], amb)
  if (gestores.length === 0) return { alertas: alertas.length, enviados: 0 }

  let enviados = 0
  for (const s of alertas) {
    const aviso = textoAvisoPreventiva(s)
    // Pendência (caixa de entrada → "Revisões preventivas da frota"): sai por
    // e-mail, Telegram e celular, nunca no sino. A chave é o texto estável —
    // uma vez por vencimento, por pessoa.
    enviados += await avisar(
      gestores,
      {
        texto: aviso,
        link: `/painel/veiculos/${s.plano.veiculo_id}`,
        evento: "veiculos_manutencao",
        assunto: s.vencido ? "Revisão preventiva vencida" : "Revisão preventiva se aproximando",
        chaveEntrega: aviso,
      },
      amb
    )
  }
  return { alertas: alertas.length, enviados }
}
