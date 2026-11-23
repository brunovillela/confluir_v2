import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { avisar, type Destinatario } from "@/lib/db/avisos"
import { esquemaAusente, hojeSP } from "@/lib/db/comum"
import { avisarSeguidores } from "@/lib/db/seguidores"
import type { ContextoEmail } from "@/lib/email"
import { somarDias } from "@/lib/deliberacoes-constantes"
import { DIAS_AVISO_ATRASO_TAREFA, lembreteDePrazo } from "@/lib/nucleo-constantes"

type Linha = Record<string, unknown>
const t = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null)

function dataBR(iso: string): string {
  const [a, m, d] = iso.split("-")
  return `${d}/${m}/${a}`
}

function curto(titulo: string | null): string {
  const s = titulo ?? "(sem título)"
  return s.length > 120 ? `${s.slice(0, 117)}…` : s
}

/**
 * PRAZO DAS TAREFAS (19/11/2026), no tick diário das pendências:
 *  • vence amanhã → o responsável recebe "vence amanhã";
 *  • venceu (até DIAS_AVISO_ATRASO_TAREFA dias atrás) → o responsável recebe
 *    "atrasada" e quem pediu a tarefa (demandante), se for outra pessoa,
 *    recebe "passou do prazo"; quem segue a tarefa ou a demanda dela também
 *    (Onda 4).
 * Cada aviso sai uma vez por tarefa e prazo (chave em avisos_entregas ou o
 * texto no sino): mudar o prazo gera os avisos do prazo novo. Tarefa atrasada
 * há mais tempo segue só na caixa de entrada e no lembrete diário.
 */
export async function lembrarPrazosDeTarefas(
  client: SupabaseClient,
  tenantId: string,
  contexto: ContextoEmail
): Promise<{ vespera: number; atrasadas: number; avisos: number; erros: string[] }> {
  const erros: string[] = []
  const hoje = hojeSP()
  const { data, error } = await client
    .from("demandas_check_tarefas")
    .select("id, titulo, concluido, data_prazo_entrega, demandante_id, demandado_id, demanda_id")
    .eq("emp_proprietaria_id", tenantId)
    .not("concluido", "is", true)
    .not("demandado_id", "is", null)
    .gte("data_prazo_entrega", somarDias(hoje, -DIAS_AVISO_ATRASO_TAREFA))
    .lte("data_prazo_entrega", somarDias(hoje, 1))
    .limit(1000)
  if (error) {
    if (!esquemaAusente(error)) erros.push(error.message)
    return { vespera: 0, atrasadas: 0, avisos: 0, erros }
  }

  const alvos = ((data ?? []) as Linha[])
    .map((l) => ({
      id: String(l.id),
      titulo: curto(t(l.titulo)),
      prazo: t(l.data_prazo_entrega),
      responsavel: t(l.demandado_id),
      pediu: t(l.demandante_id),
      demanda: t(l.demanda_id),
      tipo: lembreteDePrazo({ prazo: t(l.data_prazo_entrega), concluido: l.concluido === true }, hoje),
    }))
    .filter((x) => x.tipo && x.prazo && x.responsavel)
  if (!alvos.length) return { vespera: 0, atrasadas: 0, avisos: 0, erros }

  const ids = [...new Set(alvos.flatMap((a) => [a.responsavel, a.pediu]).filter((v): v is string => !!v))]
  const { data: us } = await client
    .from("usuarios")
    .select("id, nome_completo, nome_guerra, email")
    .in("id", ids)
    .eq("emp_proprietaria_id", tenantId)
    .not("inativo", "is", true)
    .not("deletado", "is", true)
  const pessoa = new Map<string, Destinatario>(
    ((us ?? []) as Linha[]).map((u) => [
      String(u.id),
      { id: String(u.id), nome: t(u.nome_completo) ?? t(u.nome_guerra), email: t(u.email), permissoes: {} },
    ])
  )

  const amb = { client, tenantId, contexto }
  let avisos = 0
  let vespera = 0
  let atrasadas = 0
  for (const a of alvos) {
    const prazo = a.prazo as string
    const responsavel = pessoa.get(a.responsavel as string)
    try {
      if (a.tipo === "vespera") {
        vespera++
        if (responsavel) {
          avisos += await avisar(
            [responsavel],
            {
              texto: `Tarefa sua vence amanhã (${dataBR(prazo)}): "${a.titulo}".`,
              link: "/painel/perfil/tarefas",
              evento: "tarefa_prazo",
              assunto: "Tarefa vence amanhã",
              chaveEntrega: `tarefa:${a.id}:vespera:${prazo}`,
            },
            amb
          )
        }
        continue
      }
      atrasadas++
      if (responsavel) {
        avisos += await avisar(
          [responsavel],
          {
            texto: `Tarefa sua atrasada desde ${dataBR(prazo)}: "${a.titulo}". Conclua no Confluir ou combine um novo prazo com quem pediu.`,
            link: "/painel/perfil/tarefas?status=atrasadas",
            evento: "tarefa_prazo",
            assunto: "Tarefa atrasada",
            chaveEntrega: `tarefa:${a.id}:atraso:${prazo}`,
          },
          amb
        )
      }
      const pediu = a.pediu && a.pediu !== a.responsavel ? pessoa.get(a.pediu) : undefined
      if (pediu) {
        const quem = responsavel?.nome ? `, de ${responsavel.nome},` : ""
        avisos += await avisar(
          [pediu],
          {
            texto: `A tarefa "${a.titulo}"${quem} que você pediu passou do prazo (${dataBR(prazo)}) e não foi concluída.`,
            link: "/painel/ferramentas/tarefas?status=atrasadas",
            evento: "tarefa_atrasada",
            assunto: "Tarefa que você pediu está atrasada",
            chaveEntrega: `tarefa:${a.id}:atraso-pedido:${prazo}`,
          },
          amb
        )
      }
      // Quem segue a tarefa ou a demanda dela (Onda 4), menos quem já foi avisado acima.
      avisos += await avisarSeguidores(
        { tarefaId: a.id, demandaId: a.demanda },
        {
          texto: `A tarefa "${a.titulo}", que você segue, passou do prazo (${dataBR(prazo)}) e não foi concluída.`,
          link: `/painel/perfil/tarefas?conversa=${a.id}`,
          assunto: "Tarefa que você segue está atrasada",
          chaveEntrega: `tarefa:${a.id}:atraso-seguidor:${prazo}`,
        },
        [a.responsavel, a.pediu],
        amb
      )
    } catch (e) {
      erros.push(`${a.id}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  return { vespera, atrasadas, avisos, erros }
}
