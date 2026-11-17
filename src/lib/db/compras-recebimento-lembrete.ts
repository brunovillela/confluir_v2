import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { diasDeAtraso, entregaEsperada } from "@/lib/compras-prazo"
import { avisar, usuariosComPermissao, type Destinatario } from "@/lib/db/avisos"
import { esquemaAusente, hojeSP } from "@/lib/db/comum"
import type { ContextoEmail } from "@/lib/email"
import { formatarData } from "@/lib/formato"

type Linha = Record<string, unknown>
const t = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null)

/**
 * Recebimento esquecido (16/11/2026), no tick diário das pendências: cada
 * fornecimento que passou da entrega esperada (previsão → prazo da solicitação
 * → 15 dias da compra) sem recebimento registrado avisa quem comprou, quem
 * pediu e quem tem a permissão de Recebimentos. Repete uma vez por semana de
 * atraso (avisos_entregas, chave por fornecimento e semana).
 */
export async function lembrarRecebimentosAtrasados(
  client: SupabaseClient,
  tenantId: string,
  contexto: ContextoEmail
): Promise<{ atrasados: number; avisos: number; erros: string[] }> {
  const erros: string[] = []
  const amb = { client, tenantId, contexto }
  const { data, error } = await client
    .from("compras_fornecimentos")
    .select("id, processo_id, fornecedor_id, comprador_id, data_compra, previsao_entrega")
    .eq("emp_proprietaria_id", tenantId)
    .eq("recebido", false)
    .or("cancelamento_desfecho.is.null,cancelamento_parcial.eq.true")
    .limit(1000)
  if (error) {
    if (!esquemaAusente(error)) erros.push(error.message)
    return { atrasados: 0, avisos: 0, erros }
  }
  const forns = (data ?? []) as Linha[]
  if (!forns.length) return { atrasados: 0, avisos: 0, erros }

  const procIds = [...new Set(forns.map((f) => String(f.processo_id)))]
  const { data: procs } = await client
    .from("compras_solicitacoes")
    .select("id, codigo, solicitacao_produto, solicitacao_data_limite, solicitante_id, cancelado")
    .in("id", procIds)
  const procPorId = new Map(((procs ?? []) as Linha[]).map((p) => [String(p.id), p]))

  const hoje = hojeSP()
  const atrasados = forns
    .map((f) => {
      const p = procPorId.get(String(f.processo_id))
      if (!p || p.cancelado === true) return null
      const esperada = entregaEsperada(t(f.previsao_entrega), t(p.solicitacao_data_limite), t(f.data_compra))
      const atraso = diasDeAtraso(esperada?.data ?? null, hoje)
      return atraso > 0 && esperada ? { f, p, esperada, atraso } : null
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
  if (!atrasados.length) return { atrasados: 0, avisos: 0, erros }

  const equipe = await usuariosComPermissao("aquisicoes_recebimentos", [], amb)
  const pessoaIds = [
    ...new Set(atrasados.flatMap(({ f, p }) => [t(f.comprador_id), t(p.solicitante_id)]).filter((v): v is string => !!v)),
  ]
  const { data: us } = pessoaIds.length
    ? await client
        .from("usuarios")
        .select("id, nome_completo, nome_guerra, email")
        .in("id", pessoaIds)
        .not("inativo", "is", true)
        .not("deletado", "is", true)
    : { data: [] as Linha[] }
  const pessoa = new Map<string, Destinatario>(
    ((us ?? []) as Linha[]).map((u) => [
      String(u.id),
      { id: String(u.id), nome: t(u.nome_completo) ?? t(u.nome_guerra), email: t(u.email), permissoes: {} },
    ])
  )
  const empIds = [...new Set(atrasados.map(({ f }) => t(f.fornecedor_id)).filter((v): v is string => !!v))]
  const { data: emps } = empIds.length
    ? await client.from("empresa").select("id, nome_fantasia, nome_razao").in("id", empIds)
    : { data: [] as Linha[] }
  const nomeEmp = new Map(((emps ?? []) as Linha[]).map((e) => [String(e.id), t(e.nome_fantasia) ?? t(e.nome_razao)]))

  let avisos = 0
  for (const { f, p, esperada, atraso } of atrasados) {
    const quem = [
      ...equipe,
      ...[t(f.comprador_id), t(p.solicitante_id)].map((id) => (id ? pessoa.get(id) : undefined)).filter((d): d is Destinatario => !!d),
    ]
    const fornecedor = t(f.fornecedor_id) ? nomeEmp.get(String(f.fornecedor_id)) : null
    const semana = Math.floor((atraso - 1) / 7)
    try {
      avisos += await avisar(
        quem,
        {
          texto: `Entrega atrasada: ${t(p.codigo) ?? ""} — ${t(p.solicitacao_produto) ?? "(sem descrição)"}${fornecedor ? ` (${fornecedor})` : ""}, esperada até ${formatarData(esperada.data)}, ${atraso} dia${atraso === 1 ? "" : "s"} sem recebimento registrado. Se já chegou, registre a chegada; se não, cobre o fornecedor.`.slice(0, 400),
          link: "/painel/compras/recebimentos",
          evento: "recebimento_atrasado",
          assunto: `Entrega atrasada: ${t(p.codigo) ?? ""}`,
          chaveEntrega: `recebimento-atrasado:${f.id}:${semana}`,
        },
        amb
      )
    } catch (e) {
      erros.push(`${t(p.codigo)}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  return { atrasados: atrasados.length, avisos, erros }
}
