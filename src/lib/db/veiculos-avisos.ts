import "server-only"

import { texto } from "@/lib/db/comum"
import { enviarPushTelegram } from "@/lib/db/telegram"
import {
  situacaoDosPlanos,
  vencimentoDoPlano,
  type SituacaoPlano,
} from "@/lib/db/veiculos-manutencoes"
import { podeAcessar, PERMISSOES_USUARIO_FK, type Permissoes } from "@/lib/permissoes"
import { resolverPermissoes } from "@/lib/permissoes-resolver"
import { createServiceClient } from "@/lib/supabase/admin"
import { origemDoTenant } from "@/lib/tenant-url"

/**
 * Aviso ATIVO das preventivas da frota (cron diário, /api/veiculos/preventivas/tick).
 *
 * As telas já mostravam a revisão próxima ou vencida — mas só para quem abria
 * Manutenções ou a página do veículo. Aqui a gestão da frota (permissão
 * `veiculos_gestao`, direta ou por perfil) recebe no sino e no Telegram:
 *
 * - uma vez quando a preventiva entra na janela de alerta (se aproximando);
 * - uma vez quando vence.
 *
 * Sem tabela de controle: o texto do aviso é estável enquanto a base do plano
 * não muda (nomeia o vencimento, "20/10/2026 ou aos 60.000 km", e não "faltam
 * N dias"), então repetir o mesmo texto para a mesma pessoa é o que se evita.
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

/** Gestores da frota do tenant: permissão efetiva, cadastro ativo. */
async function gestoresDaFrota(tenantId: string): Promise<string[]> {
  const svc = createServiceClient()
  const { data: acessos } = await svc
    .from("permissoes")
    .select("*")
    .eq("emp_proprietaria_id", tenantId)
    .not(PERMISSOES_USUARIO_FK, "is", null)
  const ids = (acessos ?? []).map((a) => String(a[PERMISSOES_USUARIO_FK]))
  if (ids.length === 0) return []
  const { data: usuarios } = await svc
    .from("usuarios")
    .select("id")
    .in("id", ids)
    .not("inativo", "is", true)
    .not("deletado", "is", true)
  const ativos = new Set((usuarios ?? []).map((u) => String(u.id)))

  const gestores: string[] = []
  for (const acesso of acessos ?? []) {
    const id = String(acesso[PERMISSOES_USUARIO_FK])
    if (!ativos.has(id)) continue
    const efetivas = await resolverPermissoes(svc, id, acesso as Permissoes)
    if (podeAcessar(efetivas, "veiculos_gestao")) gestores.push(id)
  }
  return gestores
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

  const gestores = await gestoresDaFrota(tenantId)
  if (gestores.length === 0) return { alertas: alertas.length, enviados: 0 }

  const { data: tenant } = await svc.from("tenants").select("slug").eq("empresa_id", tenantId).maybeSingle()
  const slug = texto(tenant?.slug)
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date())

  let enviados = 0
  for (const s of alertas) {
    const aviso = textoAvisoPreventiva(s)
    const { data: jaAvisados } = await svc
      .from("notificacoes")
      .select("usuario_id")
      .in("usuario_id", gestores)
      .eq("notificacao", aviso)
    const avisados = new Set((jaAvisados ?? []).map((n) => String(n.usuario_id)))

    for (const usuarioId of gestores) {
      if (avisados.has(usuarioId)) continue
      const { error } = await svc.from("notificacoes").insert({
        usuario_id: usuarioId,
        notificacao: aviso,
        notificado: false,
        notificacao_data: hoje,
      })
      if (error) continue
      const link = slug ? `\n${origemDoTenant(slug)}/painel/veiculos/${s.plano.veiculo_id}` : ""
      await enviarPushTelegram(usuarioId, `${aviso}${link}`, "veiculos_manutencao", svc)
      enviados++
    }
  }
  return { alertas: alertas.length, enviados }
}
