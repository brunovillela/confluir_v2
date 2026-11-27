import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { esquecerContaEmail } from "@/lib/db/email-conta"
import { testarConta, type Provedor } from "@/lib/email-provedores"
import { decifrarSegredoDetalhado } from "@/lib/segredos"

/**
 * TESTE DIÁRIO DA CONTA PRÓPRIA DE E-MAIL (Gestão › E-mail, 27/11/2026 —
 * fase 4). Roda no mesmo tick diário da chave de IA (/api/gestao/ia/tick):
 * testa a chave do Brevo ou do Resend de cada entidade que tem uma e grava o
 * resultado em email_config (chave_testada_em / chave_teste_erro), que a tela
 * mostra. Teste repetido uma vez antes de dar falha. Os avisos à Gestão
 * entram na fase 5.
 */

export type ResultadoTesteEmail = { tenant: string; situacao: "ok" | "falhou" | "ilegivel" | "erro"; detalhe?: string }

export async function testarContasEmailDasEntidades(svc: SupabaseClient, unico?: string | null): Promise<ResultadoTesteEmail[]> {
  let q = svc.from("email_config").select("emp_proprietaria_id, provedor, chave_cifrada, chave_versao").not("chave_cifrada", "is", null)
  if (unico) q = q.eq("emp_proprietaria_id", unico)
  const { data, error } = await q
  if (error) return []
  const resultados: ResultadoTesteEmail[] = []
  for (const l of (data ?? []) as Record<string, unknown>[]) {
    const emp = String(l.emp_proprietaria_id)
    try {
      const provedor: Provedor = l.provedor === "resend" ? "resend" : "brevo"
      const chave = decifrarSegredoDetalhado(String(l.chave_cifrada), Number(l.chave_versao ?? 0), emp).texto
      const agora = new Date().toISOString()
      if (!chave) {
        const motivo = "A chave guardada não pode ser lida neste servidor (a chave de cifra mudou). Os e-mails estão saindo pela conta da plataforma."
        await svc.from("email_config").update({ chave_testada_em: agora, chave_teste_erro: motivo }).eq("emp_proprietaria_id", emp)
        resultados.push({ tenant: emp, situacao: "ilegivel" })
        continue
      }
      let teste = await testarConta({ provedor, chave })
      if (teste.erro) teste = await testarConta({ provedor, chave })
      await svc.from("email_config").update({ chave_testada_em: agora, chave_teste_erro: teste.erro }).eq("emp_proprietaria_id", emp)
      esquecerContaEmail(emp)
      resultados.push(teste.erro ? { tenant: emp, situacao: "falhou", detalhe: teste.erro } : { tenant: emp, situacao: "ok" })
    } catch (e) {
      resultados.push({ tenant: emp, situacao: "erro", detalhe: e instanceof Error ? e.message : String(e) })
    }
  }
  return resultados
}
