import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { cotacaoForaDoPrazo, diasUteisDesde } from "@/lib/compras-prazo"
import { avisar, usuariosComPermissao, type Destinatario } from "@/lib/db/avisos"
import { esquemaAusente, hojeSP } from "@/lib/db/comum"
import { lerComprasConfig } from "@/lib/db/compras-config"
import type { ContextoEmail } from "@/lib/email"

type Linha = Record<string, unknown>
const t = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null)

/**
 * Cotação fora do prazo (16/11/2026), no tick diário das pendências: cada
 * solicitação Via Aquisição que passou do prazo da entidade (compras_config)
 * sem a cotação começar avisa os compradores e o coordenador do departamento
 * solicitante — uma vez por solicitação (avisos_entregas, chave estável). A
 * fila continua na caixa de entrada e no lembrete diário.
 */
export async function lembrarCotacoesAtrasadas(
  client: SupabaseClient,
  tenantId: string,
  contexto: ContextoEmail
): Promise<{ atrasadas: number; avisos: number; erros: string[] }> {
  const erros: string[] = []
  const amb = { client, tenantId, contexto }
  const { prazoCotacao } = await lerComprasConfig({ client, tenantId })
  if (prazoCotacao === null) return { atrasadas: 0, avisos: 0, erros }

  const { data, error } = await client
    .from("compras_solicitacoes")
    .select("id, codigo, solicitacao_produto, solicitacao_departamento_id, solicitante_id, created_at")
    .eq("emp_proprietaria_id", tenantId)
    .eq("aquisicao_direta", false)
    .eq("cancelado", false)
    .eq("comprado", false)
    .eq("em_cotacao", false)
    .is("cotacao_termino", null)
    .limit(500)
  if (error) {
    if (!esquemaAusente(error)) erros.push(error.message)
    return { atrasadas: 0, avisos: 0, erros }
  }
  const hoje = hojeSP()
  const atrasadas = ((data ?? []) as Linha[]).filter((p) =>
    cotacaoForaDoPrazo(t(p.created_at)?.slice(0, 10) ?? null, hoje, prazoCotacao)
  )
  if (!atrasadas.length) return { atrasadas: 0, avisos: 0, erros }

  const compradores = await usuariosComPermissao("aquisicoes_comprador", [], amb)
  const deptoIds = [...new Set(atrasadas.map((p) => t(p.solicitacao_departamento_id)).filter((v): v is string => !!v))]
  const coordPorDepto = new Map<string, Destinatario>()
  if (deptoIds.length) {
    const { data: deps } = await client
      .from("empresa_departamentos")
      .select("id, departamento, coordenador_id, legado")
      .eq("emp_proprietaria_id", tenantId)
      .in("id", deptoIds)
    const coordIds = [...new Set(((deps ?? []) as Linha[]).filter((d) => d.legado !== true && t(d.coordenador_id)).map((d) => String(d.coordenador_id)))]
    const { data: us } = coordIds.length
      ? await client
          .from("usuarios")
          .select("id, nome_completo, nome_guerra, email")
          .in("id", coordIds)
          .not("inativo", "is", true)
          .not("deletado", "is", true)
      : { data: [] as Linha[] }
    const porId = new Map(((us ?? []) as Linha[]).map((u) => [String(u.id), u]))
    for (const d of (deps ?? []) as Linha[]) {
      const u = t(d.coordenador_id) ? porId.get(String(d.coordenador_id)) : undefined
      if (u) {
        coordPorDepto.set(String(d.id), {
          id: String(u.id),
          nome: t(u.nome_completo) ?? t(u.nome_guerra),
          email: t(u.email),
          permissoes: {},
        })
      }
    }
  }

  let avisos = 0
  for (const p of atrasadas) {
    const dias = diasUteisDesde(t(p.created_at)?.slice(0, 10) ?? null, hoje)
    const coord = t(p.solicitacao_departamento_id) ? coordPorDepto.get(String(p.solicitacao_departamento_id)) : undefined
    try {
      avisos += await avisar(
        [...compradores, ...(coord ? [coord] : [])],
        {
          texto: `Cotação fora do prazo: ${t(p.codigo) ?? ""} — ${t(p.solicitacao_produto) ?? "(sem descrição)"} espera há ${dias} dias úteis (prazo: ${prazoCotacao}).`.slice(0, 300),
          link: `/painel/compras/${p.id}`,
          evento: "cotacao_atrasada",
          assunto: `Cotação fora do prazo: ${t(p.codigo) ?? ""}`,
          chaveEntrega: `cotacao-atrasada:${p.id}`,
        },
        amb
      )
    } catch (e) {
      erros.push(`${t(p.codigo)}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  return { atrasadas: atrasadas.length, avisos, erros }
}
