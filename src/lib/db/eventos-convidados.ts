import "server-only"

import {
  type LinhaConvidado,
  type ProblemaLinha,
} from "@/lib/eventos-planilha"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Convidados de evento — a cota que a entidade lança de dentro.
 *
 * Reservar vaga é tarefa de dentro (só quem edita eventos lança convidado), em
 * dois caminhos: um a um, no formulário, ou em lote, por planilha.
 *
 * O FORMATO da planilha (modelo e leitura) mora em `lib/eventos-planilha.ts`,
 * que é lógica pura. Aqui fica só o que encosta no banco.
 *
 * SQL: supabase/eventos-convidados.sql
 */

/**
 * Tira da lista quem já está inscrito no evento. Reimportar a mesma planilha
 * corrigida é o caso comum, e ela não pode duplicar ninguém.
 */
export async function conferirNoEvento(
  eventoId: string,
  linhas: LinhaConvidado[]
): Promise<{ novas: LinhaConvidado[]; jaInscritos: ProblemaLinha[] }> {
  if (linhas.length === 0) return { novas: [], jaInscritos: [] }

  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data } = await admin
    .from("eventos_inscricoes")
    .select("cpf")
    .eq("emp_proprietaria_id", emp)
    .eq("evento_id", eventoId)
    .in(
      "cpf",
      linhas.map((l) => l.cpf)
    )

  const existentes = new Set((data ?? []).map((i) => i.cpf as string))
  const novas: LinhaConvidado[] = []
  const jaInscritos: ProblemaLinha[] = []
  for (const l of linhas) {
    if (existentes.has(l.cpf)) {
      jaInscritos.push({
        linha: l.linha,
        nome: l.nome,
        motivo: "já está inscrito neste evento",
      })
    } else {
      novas.push(l)
    }
  }
  return { novas, jaInscritos }
}

/**
 * Grava os convidados. Eles nascem CONFIRMADOS: a vaga foi reservada pela
 * entidade, não há o que aprovar. E `email_confirmado_em` fica nulo de
 * propósito — ninguém confirmou nada, foi a secretaria que digitou.
 */
export async function gravarConvidados(
  eventoId: string,
  usuarioId: string,
  linhas: LinhaConvidado[],
  origem: "planilha" | "painel"
): Promise<{ gravados: number; erro?: string }> {
  if (linhas.length === 0) return { gravados: 0 }

  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { error } = await admin.from("eventos_inscricoes").insert(
    linhas.map((l) => ({
      emp_proprietaria_id: emp,
      evento_id: eventoId,
      nome: l.nome,
      cpf: l.cpf || null,
      email: l.email || null,
      telefone: l.telefone || null,
      convidado_por: l.convidadoPor || null,
      reservada_por: usuarioId,
      origem,
      situacao: "confirmada",
    }))
  )
  if (error) return { gravados: 0, erro: error.message }
  return { gravados: linhas.length }
}

export async function excluirConvidado(
  eventoId: string,
  inscricaoId: string
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()

  // Só apaga convidado (tem `reservada_por`) e só se ninguém tiver registrado
  // presença: quem entrou no evento vira histórico, não some.
  const { data: inscricao } = await admin
    .from("eventos_inscricoes")
    .select("id, reservada_por")
    .eq("emp_proprietaria_id", emp)
    .eq("evento_id", eventoId)
    .eq("id", inscricaoId)
    .maybeSingle()
  if (!inscricao) return { erro: "Convidado não encontrado." }
  if (!inscricao.reservada_por) {
    return { erro: "Esta inscrição não é de convidado — use Avaliar." }
  }

  const { count } = await admin
    .from("eventos_presencas")
    .select("id", { count: "exact", head: true })
    .eq("inscricao_id", inscricaoId)
  if ((count ?? 0) > 0) {
    return {
      erro: "Esta pessoa já teve presença registrada e não pode ser removida.",
    }
  }

  const { error } = await admin
    .from("eventos_inscricoes")
    .delete()
    .eq("emp_proprietaria_id", emp)
    .eq("id", inscricaoId)
  if (error) return { erro: "Não foi possível remover o convidado." }
  return {}
}
