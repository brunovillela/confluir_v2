import "server-only"

import { identidadeDaConta } from "@/lib/auth-identidade"
import { buscarFiliadoPorCpf } from "@/lib/contas"
import { grafiasDoCpf } from "@/lib/cpf"
import { CONDICAO_COLETIVA } from "@/lib/filiacao"
import { createAdminClient } from "@/lib/supabase/admin"
import { createClient } from "@/lib/supabase/server"
import { tenantAtual } from "@/lib/tenant"

/**
 * Apoio da tela de entrada do portal (/portal). Fica FORA de actions.ts de
 * propósito: tudo o que um arquivo "use server" exporta vira endpoint
 * chamável pelo navegador, e nada daqui pode ser.
 */

/**
 * Algum registro do CPF está "Em processo de filiação coletiva" (A4). Erro de
 * leitura = não está: na dúvida vale a mensagem genérica de filiação inativa.
 */
export async function emFiliacaoColetiva(cpf: string): Promise<boolean> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("filiacoes")
    .select("id")
    .in("cpf", grafiasDoCpf(cpf))
    .eq("emp_proprietaria_id", await tenantAtual())
    .not("filiacao_excluida", "is", true)
    .eq("filiacao_condicao", CONDICAO_COLETIVA)
    .limit(1)
  if (error) return false
  return (data ?? []).length > 0
}

/**
 * O que dizer a quem PROVOU a identidade (senha, código ou link do e-mail) mas
 * não tem filiação ativa. Antes da prova a resposta é sempre a genérica — o
 * status da filiação não pode ser descoberto chutando CPFs.
 */
export function mensagemFiliacaoNaoAtiva(emColetiva: boolean): string {
  return emColetiva
    ? "Sua filiação coletiva está em andamento, e o portal abre quando ela for concluída. Se quiser desistir dentro do prazo, use o link de desistência do e-mail que a entidade enviou ou procure o sindicato."
    : "Sua filiação não está ativa. Procure o sindicato para regularizar seu cadastro."
}

/**
 * Quem entrou pelo BOTÃO do e-mail passa pelo /auth/confirm e chega aqui com
 * sessão, mas o portal só abre para filiação ativa: sem isto, a pessoa via a
 * tela de entrada de novo, sem explicação. Só responde a quem tem sessão com
 * identidade de filiado — ou seja, a quem já provou ser o dono do CPF.
 */
export async function avisoDaSessaoSemPortal(): Promise<string | null> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  const identidade = await identidadeDaConta(user.id)
  if (identidade?.tipo !== "filiado") return null
  const filiado = await buscarFiliadoPorCpf(identidade.cpf)
  if (!filiado || filiado.ativo) return null
  return mensagemFiliacaoNaoAtiva(await emFiliacaoColetiva(identidade.cpf))
}

/**
 * Segura a resposta até `pisoMs` (mais até 25% de variação) contados de
 * `inicio`. As actions de entrada respondem no mesmo tempo aproximado para
 * CPF conhecido e desconhecido: sem isto, a demora do envio do e-mail (ou da
 * conferência do código) contava quem é filiado (A68).
 */
export async function igualarTempo(inicio: number, pisoMs: number): Promise<void> {
  const alvo = pisoMs + Math.random() * pisoMs * 0.25
  const falta = alvo - (Date.now() - inicio)
  if (falta > 0) await new Promise((resolver) => setTimeout(resolver, falta))
}
