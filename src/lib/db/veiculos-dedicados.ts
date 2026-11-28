import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { hojeSP, texto } from "@/lib/db/comum"
import { createServiceClient } from "@/lib/supabase/admin"
import { enviarTelegram } from "@/lib/telegram"
import { PREFIXO_CALLBACK_CHECKLIST } from "@/lib/telegram-checklist-fluxo"

/**
 * Carros de locação de uso DEDICADO (27/11/2026): ficam com um condutor e não
 * passam pela recepção, então o checklist (com o km) é pedido ao próprio
 * condutor pelo Telegram — /checklist, lib/telegram-checklist.ts.
 *
 * O prazo é o MESMO do checklist da frota: `veiculos.checklist_recorrencia_dias`
 * do carro ou a recorrência do tenant, e o aviso começa na antecedência
 * configurada. O tick diário de veículos (/api/veiculos/preventivas/tick) pede
 * quando o prazo chega e lembra a cada 3 dias (`veiculos.checklist_pedido_em`);
 * o resumo diário da gestão (vencimentos.ts) mostra o carro com o checklist
 * vencido, a quem foi pedido e desde quando — ou que o condutor não tem o
 * Telegram vinculado.
 *
 * Fora de requisição: service role e tenant explícito em toda consulta.
 */

const DIA_MS = 86_400_000
/** Lembrete ao condutor enquanto o checklist não vem. */
const INTERVALO_LEMBRETE_DIAS = 3

export type SituacaoDedicado = {
  veiculoId: string
  veiculoRotulo: string
  contratoId: string
  condutorId: string
  condutorNome: string | null
  /** Chat do Telegram do condutor, se vinculado e com o telefone confirmado. */
  chatId: string | null
  ultimoEm: string | null
  /** "aaaa-mm-dd" do vencimento; hoje, se nunca houve checklist. */
  venceEm: string
  diasRestantes: number
  /** Dentro da antecedência do aviso, ou vencido. */
  noPrazo: boolean
  vencido: boolean
  pedidoEm: string | null
}

function diasEntre(de: string, ate: string): number {
  return Math.round((Date.parse(`${ate}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / DIA_MS)
}

function somarDias(iso: string, dias: number): string {
  return new Date(Date.parse(`${iso}T12:00:00Z`) + dias * DIA_MS).toISOString().slice(0, 10)
}

export async function tenantsComDedicados(): Promise<string[]> {
  const svc = createServiceClient()
  const { data, error } = await svc
    .from("veiculo_contratos_aluguel")
    .select("emp_proprietaria_id")
    .eq("uso", "dedicado")
    .not("finalizado", "is", true)
    .not("condutor_dedicado_id", "is", null)
  if (error) return []
  return [...new Set((data ?? []).map((c) => texto(c.emp_proprietaria_id)).filter((v): v is string => Boolean(v)))]
}

/** Os carros dedicados do tenant e a situação do checklist de cada um. */
export async function situacaoDosDedicados(
  tenantId: string,
  svc: SupabaseClient = createServiceClient()
): Promise<SituacaoDedicado[]> {
  const { data: contratos } = await svc
    .from("veiculo_contratos_aluguel")
    .select("id, condutor_dedicado_id")
    .eq("emp_proprietaria_id", tenantId)
    .eq("uso", "dedicado")
    .not("finalizado", "is", true)
    .not("condutor_dedicado_id", "is", null)
  if (!contratos?.length) return []
  const condutorDo = new Map(contratos.map((c) => [String(c.id), String(c.condutor_dedicado_id)]))

  const [{ data: carros }, { data: config }] = await Promise.all([
    svc
      .from("veiculos")
      .select("id, placa, marca_modelo, codigo, contrato_aluguel_id, checklist_recorrencia_dias, checklist_pedido_em")
      .eq("emp_proprietaria_id", tenantId)
      .in("contrato_aluguel_id", [...condutorDo.keys()])
      .not("inativo", "is", true),
    svc
      .from("veiculos_checklist_config")
      .select("recorrencia_dias, alerta_antecedencia_dias, ativo")
      .eq("emp_proprietaria_id", tenantId)
      .maybeSingle(),
  ])
  if (!carros?.length || config?.ativo === false) return []
  const recorrenciaFrota = Number(config?.recorrencia_dias ?? 30) || 30
  const antecedencia = Number(config?.alerta_antecedencia_dias ?? 3) || 0

  const ids = carros.map((v) => String(v.id))
  const condutorIds = [...new Set(carros.map((v) => condutorDo.get(String(v.contrato_aluguel_id)) ?? ""))].filter(Boolean)
  const [{ data: checklists }, { data: pessoas }] = await Promise.all([
    svc
      .from("veiculos_checklists")
      .select("veiculo_id, realizado_em")
      .eq("emp_proprietaria_id", tenantId)
      .in("veiculo_id", ids)
      .order("realizado_em", { ascending: false })
      .limit(500),
    svc.from("usuarios").select("id, nome_completo, nome_guerra, telegram_chat_id, telegram_telefone").in("id", condutorIds),
  ])
  const ultimo = new Map<string, string>()
  for (const c of checklists ?? []) {
    const v = String(c.veiculo_id)
    if (!ultimo.has(v)) ultimo.set(v, String(c.realizado_em))
  }
  const pessoa = new Map((pessoas ?? []).map((p) => [String(p.id), p]))

  const hoje = hojeSP()
  return carros.map((v) => {
    const condutorId = condutorDo.get(String(v.contrato_aluguel_id)) ?? ""
    const p = pessoa.get(condutorId)
    const ultimoEm = ultimo.get(String(v.id)) ?? null
    const recorrencia = Number(v.checklist_recorrencia_dias) || recorrenciaFrota
    const venceEm = ultimoEm ? somarDias(ultimoEm.slice(0, 10), recorrencia) : hoje
    const diasRestantes = diasEntre(hoje, venceEm)
    return {
      veiculoId: String(v.id),
      veiculoRotulo: [texto(v.placa), texto(v.marca_modelo)].filter(Boolean).join(" · ") || (texto(v.codigo) ?? "Veículo"),
      contratoId: String(v.contrato_aluguel_id),
      condutorId,
      condutorNome: texto(p?.nome_completo) ?? texto(p?.nome_guerra),
      chatId: texto(p?.telegram_chat_id) && texto(p?.telegram_telefone) ? texto(p?.telegram_chat_id) : null,
      ultimoEm,
      venceEm,
      diasRestantes,
      noPrazo: diasRestantes <= antecedencia,
      vencido: ultimoEm === null || diasRestantes < 0,
      pedidoEm: texto(v.checklist_pedido_em),
    }
  })
}

/**
 * Tick diário: pede o checklist ao condutor de cada carro dedicado cujo prazo
 * chegou — uma vez quando entra no prazo e, sem resposta, a cada 3 dias.
 */
export async function pedirChecklistDedicados(tenantId: string): Promise<{ carros: number; pedidos: number }> {
  const svc = createServiceClient()
  const lista = await situacaoDosDedicados(tenantId, svc)
  let pedidos = 0
  for (const s of lista.filter((s) => s.noPrazo && s.chatId)) {
    // Pedido deste ciclo (depois do último checklist) há menos de 3 dias: espera.
    const pedidoNoCiclo = s.pedidoEm && (!s.ultimoEm || s.pedidoEm > s.ultimoEm)
    if (pedidoNoCiclo && Date.now() - Date.parse(s.pedidoEm!) < INTERVALO_LEMBRETE_DIAS * DIA_MS) continue
    const quando =
      s.ultimoEm === null
        ? "Ele ainda não tem checklist registrado."
        : s.diasRestantes < 0
          ? `O checklist venceu há ${-s.diasRestantes} dia${s.diasRestantes === -1 ? "" : "s"}.`
          : s.diasRestantes === 0
            ? "O checklist vence hoje."
            : `O checklist vence em ${s.diasRestantes} dia${s.diasRestantes === 1 ? "" : "s"}.`
    const ok = await enviarTelegram({
      chatId: s.chatId!,
      texto:
        `🚗 Hora do checklist do <b>${s.veiculoRotulo}</b>, o carro que está com você. ${quando}\n\n` +
        "São poucos toques: o km do painel e a conferência dos itens. Se preferir, mande /checklist quando estiver junto do carro.",
      botoes: [[{ texto: "Fazer o checklist agora", dado: `${PREFIXO_CALLBACK_CHECKLIST}v:${s.veiculoId}` }]],
    })
    if (!ok) continue
    await svc
      .from("veiculos")
      .update({ checklist_pedido_em: new Date().toISOString() })
      .eq("id", s.veiculoId)
      .eq("emp_proprietaria_id", tenantId)
    pedidos++
  }
  return { carros: lista.length, pedidos }
}
