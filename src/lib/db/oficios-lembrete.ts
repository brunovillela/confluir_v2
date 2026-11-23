import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { avisar, type Destinatario } from "@/lib/db/avisos"
import { esquemaAusente, hojeSP, texto } from "@/lib/db/comum"
import type { ContextoEmail } from "@/lib/email"
import { marcoDoLembreteAssinatura } from "@/lib/oficios-constantes"

const DIA_SP = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" })

function diasEntre(de: string, ate: string): number {
  const a = Date.UTC(+de.slice(0, 4), +de.slice(5, 7) - 1, +de.slice(8, 10))
  const b = Date.UTC(+ate.slice(0, 4), +ate.slice(5, 7) - 1, +ate.slice(8, 10))
  return Math.round((b - a) / 86_400_000)
}

function juntar(nomes: string[]): string {
  return nomes.length <= 1 ? (nomes[0] ?? "") : `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]}`
}

/**
 * OFÍCIO PARADO EM ASSINATURA (23/11/2026), no tick diário das pendências.
 * Ofícios ficavam semanas em "Aguardando assinatura" sem ninguém lembrar
 * (16 na entidade, alguns desde setembro). Quem enviou recebe o lembrete
 * aos 3, 7 e 14 dias de espera e, depois, a cada 14 dias — uma vez por marco
 * (chave em avisos_entregas) — com os dois caminhos: reenviar o convite ou,
 * se o ofício foi assinado à mão ou pelo gov.br, finalizar com o PDF.
 * A espera conta do envio mais recente aos que ainda não assinaram.
 */
export async function lembrarOficiosParados(
  client: SupabaseClient,
  tenantId: string,
  contexto: ContextoEmail
): Promise<{ parados: number; avisos: number; erros: string[] }> {
  const erros: string[] = []
  const hoje = hojeSP()
  const { data: oficios, error } = await client
    .from("oficios")
    .select("id, numero, ano, enviado_por_id")
    .eq("emp_proprietaria_id", tenantId)
    .eq("situacao", "Aguardando assinatura")
    .not("enviado_por_id", "is", null)
    .limit(500)
  if (error) {
    if (!esquemaAusente(error)) erros.push(error.message)
    return { parados: 0, avisos: 0, erros }
  }
  const lista = oficios ?? []
  if (!lista.length) return { parados: 0, avisos: 0, erros }

  const { data: envelopes } = await client
    .from("documento_assinaturas")
    .select("oficio_id, nome, enviado_em")
    .eq("emp_proprietaria_id", tenantId)
    .in("oficio_id", lista.map((o) => String(o.id)))
    .eq("situacao", "pendente")
  const pendentes = new Map<string, { nomes: string[]; enviadoEm: string }>()
  for (const e of envelopes ?? []) {
    const id = String(e.oficio_id)
    const enviado = texto(e.enviado_em)
    if (!enviado) continue
    const atual = pendentes.get(id) ?? { nomes: [], enviadoEm: enviado }
    if (texto(e.nome)) atual.nomes.push(String(e.nome))
    if (enviado > atual.enviadoEm) atual.enviadoEm = enviado
    pendentes.set(id, atual)
  }

  const remetentes = [...new Set(lista.map((o) => String(o.enviado_por_id)))]
  const { data: us } = await client
    .from("usuarios")
    .select("id, nome_completo, nome_guerra, email")
    .in("id", remetentes)
    .eq("emp_proprietaria_id", tenantId)
    .not("inativo", "is", true)
    .not("deletado", "is", true)
  const pessoa = new Map<string, Destinatario>(
    (us ?? []).map((u) => [
      String(u.id),
      { id: String(u.id), nome: texto(u.nome_completo) ?? texto(u.nome_guerra), email: texto(u.email), permissoes: {} },
    ])
  )

  const amb = { client, tenantId, contexto }
  let parados = 0
  let avisos = 0
  for (const o of lista) {
    const p = pendentes.get(String(o.id))
    if (!p) continue
    const enviadoDia = DIA_SP.format(new Date(p.enviadoEm))
    const dias = diasEntre(enviadoDia, hoje)
    const marco = marcoDoLembreteAssinatura(dias)
    if (marco == null) continue
    parados++
    const remetente = pessoa.get(String(o.enviado_por_id))
    if (!remetente) continue
    const numero = o.numero != null ? `${o.numero}/${o.ano}` : "sem número"
    const quem = p.nomes.length ? juntar(p.nomes) : "quem assina"
    try {
      avisos += await avisar(
        [remetente],
        {
          texto: `O Ofício ${numero} espera a assinatura de ${quem} há ${dias} dias. Reenvie o convite ou, se ele foi assinado à mão ou pelo gov.br, finalize o ofício com o PDF assinado.`,
          link: `/painel/ferramentas/oficios/${o.id}`,
          evento: "oficio_assinatura_parada",
          assunto: `Ofício ${numero} esperando assinatura`,
          chaveEntrega: `oficio:${o.id}:parado:${enviadoDia}:${marco}`,
        },
        amb
      )
    } catch (e) {
      erros.push(`${o.id}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  return { parados, avisos, erros }
}
