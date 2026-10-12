import "server-only"

import { type EstadoForm } from "@/lib/contas"
import { registrarFalhaLogin } from "@/lib/login-bloqueio"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Estado do envio do código: `email` devolve o endereço digitado quando o
 * servidor recusa — o React limpa o formulário ao fim da action, e a recusa
 * ("este e-mail recebeu vários códigos…") fala de um endereço que sumiria.
 */
export type EstadoEnvioCodigo = EstadoForm & { email?: string }

/**
 * LIMITE DE ENVIO DO CÓDIGO DO E-MAIL DE VOTAÇÃO (A142).
 *
 * Sem limite, um filiado logado mandava códigos sem parar para qualquer
 * endereço — enchendo a caixa de um terceiro com o remetente da entidade e
 * gastando a reputação do domínio — e cada envio derrubava o código anterior
 * enquanto a pessoa ainda digitava. Duas travas, sem tabela nova:
 *
 *  - INTERVALO: um código novo só 60 s depois do anterior, contado pelo
 *    vencimento do código pendente (`pend_expira_em` − validade), que já está
 *    na linha do filiado em `votacao_email_verificado`;
 *  - DEGRAUS, por filiado E por endereço: o contador do bloqueio de login
 *    (lib/login-bloqueio, tabela `login_tentativas`) com chaves próprias —
 *    5 envios seguidos travam 15 min, 10 travam 1 h; parado 1 h, recomeça.
 *    A chave do endereço segura o caso de muitos filiados mirarem o mesmo
 *    e-mail.
 *
 * Sem a tabela, ou com erro de banco, nada trava (como no login): o limite é
 * proteção, não pode impedir quem precisa verificar o e-mail.
 */

/** Precisa ser a mesma validade de lib/db/votacao-portal.ts (CODIGO_VALIDADE_MIN). */
const VALIDADE_CODIGO_MIN = 15
const INTERVALO_S = 60

function chaveDoFiliado(cpf: string): string {
  return `codigo_votacao:cpf:${cpf.replace(/\D/g, "")}`
}

function chaveDoEndereco(email: string): string {
  return `codigo_votacao:email:${email.trim().toLowerCase()}`
}

function minutos(n: number): string {
  return `${n} minuto${n === 1 ? "" : "s"}`
}

/** Minutos que faltam no bloqueio da chave; null quando livre (ou sem tabela). */
async function minutosBloqueado(chave: string, emp: string): Promise<number | null> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("login_tentativas")
    .select("bloqueado_ate")
    .eq("emp_proprietaria_id", emp)
    .eq("chave", chave)
    .maybeSingle()
  if (error || !data?.bloqueado_ate) return null
  const falta = new Date(String(data.bloqueado_ate)).getTime() - Date.now()
  return falta > 0 ? Math.max(1, Math.ceil(falta / 60_000)) : null
}

/**
 * Mensagem para quem não pode pedir outro código agora, ou null quando pode.
 * Chamar ANTES de gerar e enviar o código.
 */
export async function recusaDeEnvioDeCodigo(cpf: string, email: string): Promise<string | null> {
  const emp = await tenantAtual()
  const admin = await createAdminClient()
  const { data } = await admin
    .from("votacao_email_verificado")
    .select("pend_email, pend_expira_em")
    .eq("emp_proprietaria_id", emp)
    .eq("cpf", cpf)
    .maybeSingle()
  if (data?.pend_expira_em) {
    const enviadoEm = new Date(String(data.pend_expira_em)).getTime() - VALIDADE_CODIGO_MIN * 60_000
    const passou = Math.floor((Date.now() - enviadoEm) / 1000)
    if (passou >= 0 && passou < INTERVALO_S) {
      const falta = INTERVALO_S - passou
      return `Acabamos de enviar um código para ${String(data.pend_email ?? "o seu e-mail")}. Confira a caixa de entrada (e o spam) e, se não chegar, peça outro daqui a ${falta} segundo${falta === 1 ? "" : "s"}.`
    }
  }

  const [doFiliado, doEndereco] = await Promise.all([
    minutosBloqueado(chaveDoFiliado(cpf), emp),
    minutosBloqueado(chaveDoEndereco(email), emp),
  ])
  if (doFiliado) {
    return `Você já pediu vários códigos em pouco tempo. Use o último que chegou ou peça outro daqui a ${minutos(doFiliado)}.`
  }
  if (doEndereco) {
    return `Este e-mail recebeu vários códigos em pouco tempo. Para protegê-lo, um novo código só daqui a ${minutos(doEndereco)}.`
  }
  return null
}

/**
 * O envio falhou depois de o código novo ser gravado (o servidor de e-mail
 * recusou): ninguém recebeu esse código. Apaga a pendência que acabou de
 * nascer — sem isso, o intervalo responderia "acabamos de enviar um código"
 * e a tela pediria um código que não chegou. Só a deste pedido: mesmo
 * endereço e vencimento a menos de 1 min da validade cheia (o intervalo
 * garante que não houve outro envio nesse tempo). Chamar quando o envio
 * devolver erro; os erros de antes da gravação não acham o que apagar.
 */
export async function descartarCodigoNaoEnviado(cpf: string, email: string): Promise<void> {
  const desde = new Date(Date.now() + (VALIDADE_CODIGO_MIN * 60 - INTERVALO_S) * 1000).toISOString()
  const admin = await createAdminClient()
  const { error } = await admin
    .from("votacao_email_verificado")
    .update({
      pend_email: null,
      pend_codigo_hash: null,
      pend_codigo_token: null,
      pend_expira_em: null,
      updated_at: new Date().toISOString(),
    })
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("cpf", cpf)
    .eq("pend_email", email.trim().toLowerCase())
    .gt("pend_expira_em", desde)
  if (error) console.error("código de votação (descartar pendente):", error.message)
}

/** Conta um envio feito (para o filiado e para o endereço). Chamar DEPOIS de enviar. */
export async function registrarEnvioDeCodigo(cpf: string, email: string): Promise<void> {
  await Promise.all([
    registrarFalhaLogin(chaveDoFiliado(cpf)),
    registrarFalhaLogin(chaveDoEndereco(email)),
  ]).catch((e) => console.error("limite do código de votação:", e))
}
