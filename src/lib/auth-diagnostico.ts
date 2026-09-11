import "server-only"

import { createHash } from "node:crypto"

import {
  textoValidade,
  VALIDADE_LINK_EMAIL_SEGUNDOS,
  type MotivoRecusaLink,
} from "@/lib/auth-email-constantes"
import { descreveErroAuth } from "@/lib/contas"
import { createServiceClient } from "@/lib/supabase/admin"

/**
 * Diagnóstico de link ou código de e-mail recusado pelo Supabase Auth.
 *
 * Problema: o Supabase devolve o MESMO erro (`otp_expired`, "Token has
 * expired or is invalid") para código vencido, já usado, substituído por um
 * pedido mais novo ou digitado errado. A tela dizia "inválido ou expirou" e
 * ninguém sabia qual era.
 *
 * Solução: olhar a tabela interna `auth.one_time_tokens` pela função
 * `public.auth_diagnostico_token` (supabase/auth-diagnostico-token.sql):
 *  - token ainda está lá e é mais velho que a validade → EXPIRADO;
 *  - token sumiu → foi USADO (o Supabase apaga no uso) ou um pedido mais
 *    novo o substituiu.
 * Sem a função no banco, tudo degrada para a mensagem genérica de antes.
 *
 * Cada recusa vai para o log do servidor (Vercel → Logs) com o motivo, o tipo,
 * a idade do token e o user-agent. Os aceites também são logados: um aceite
 * com user-agent de robô seguido de "usado" é a assinatura de antivírus de
 * e-mail abrindo o link antes da pessoa.
 */

type ErroAuth = { message?: string; status?: number; code?: string } | null

type ConsultaToken = {
  token_encontrado: boolean
  token_criado_em: string | null
  ultimo_token_email_em: string | null
}

async function consultarToken(
  tokenHash: string,
  email?: string
): Promise<ConsultaToken | null> {
  try {
    // Auth pré-tenant: service role direto (regra de src/lib/supabase/admin.ts).
    const { data, error } = await createServiceClient().rpc("auth_diagnostico_token", {
      p_token_hash: tokenHash,
      p_email: email ?? null,
    })
    if (error || !data) {
      // Sem a função no banco (ou sem permissão) o diagnóstico só degrada,
      // mas o motivo precisa ficar no log para alguém corrigir.
      console.warn(
        "[auth/diagnostico] consulta indisponível:",
        error ? `${error.code ?? ""} ${error.message}`.trim() : "sem dados"
      )
      return null
    }
    return data as ConsultaToken
  } catch (e) {
    console.warn("[auth/diagnostico] consulta falhou:", e instanceof Error ? e.message : e)
    return null
  }
}

function idadeMinutos(criadoEm: string | null): number | null {
  if (!criadoEm) return null
  return Math.round((Date.now() - new Date(criadoEm).getTime()) / 60_000)
}

function passouDaValidade(criadoEm: string | null): boolean {
  const idade = idadeMinutos(criadoEm)
  return idade !== null && idade * 60 > VALIDADE_LINK_EMAIL_SEGUNDOS
}

function ehLimite(erro: ErroAuth): boolean {
  return erro?.status === 429 || /rate_limit/i.test(erro?.code ?? "")
}

/** O mesmo hash que o Supabase guarda: sha224(email + código), em hex. */
function hashDoCodigo(email: string, codigo: string): string {
  return createHash("sha224").update(email + codigo).digest("hex")
}

/** Link aceito — só log, para cruzar com recusas posteriores. */
export function registrarLinkAceito(tipo: string, userAgent: string | null) {
  console.info(
    "[auth/confirm] link aceito:",
    JSON.stringify({ tipo, userAgent })
  )
}

/** Link recusado na rota /auth/confirm: loga e devolve o motivo. */
export async function diagnosticarLinkRecusado(p: {
  erro: ErroAuth
  fluxo: "token_hash" | "code" | "erro_na_url"
  tipo?: string | null
  tokenHash?: string | null
  userAgent?: string | null
}): Promise<MotivoRecusaLink> {
  const codigo = p.erro?.code ?? ""
  let motivo: MotivoRecusaLink = "invalido"
  let consulta: ConsultaToken | null = null

  if (ehLimite(p.erro)) {
    motivo = "limite"
  } else if (/pkce_code_verifier_not_found|bad_code_verifier/.test(codigo)) {
    // Fluxo PKCE: o link foi aberto num navegador diferente do que pediu
    // (o cookie com o code_verifier só existe no navegador do pedido).
    motivo = "outro_navegador"
  } else if (/flow_state_not_found/.test(codigo)) {
    // O "code" do redirecionamento já foi trocado por sessão: link reaberto.
    motivo = "usado"
  } else if (/flow_state_expired/.test(codigo)) {
    motivo = "expirado"
  } else if (p.tokenHash) {
    consulta = await consultarToken(p.tokenHash)
    if (consulta) {
      if (!consulta.token_encontrado) motivo = "usado"
      else if (passouDaValidade(consulta.token_criado_em)) motivo = "expirado"
    }
  }
  // Sem token_hash, um otp_expired pode ser vencido OU já usado: fica
  // "invalido" (mensagem genérica) em vez de afirmar um dos dois.

  console.error(
    "[auth/confirm] link recusado:",
    JSON.stringify({
      motivo,
      fluxo: p.fluxo,
      tipo: p.tipo ?? null,
      erro: p.erro ? descreveErroAuth(p.erro) : null,
      diagnostico_disponivel: consulta !== null,
      idade_token_min: idadeMinutos(consulta?.token_criado_em ?? null),
      userAgent: p.userAgent ?? null,
    })
  )
  return motivo
}

/**
 * Código de 6 dígitos recusado (mesário, apurador, votação, oposição): loga e
 * devolve a mensagem da tela.
 */
export async function diagnosticarCodigoRecusado(p: {
  erro: ErroAuth
  email: string
  token: string
  fluxo: string
}): Promise<string> {
  const email = p.email.trim().toLowerCase()
  const validade = textoValidade()
  let mensagem = `Código inválido ou expirado. Os códigos valem ${validade}; se precisar, peça um novo.`
  let motivo = "desconhecido"
  let consulta: ConsultaToken | null = null

  if (ehLimite(p.erro)) {
    motivo = "limite"
    mensagem = "Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente de novo."
  } else {
    consulta = await consultarToken(hashDoCodigo(email, p.token), email)
    if (consulta) {
      if (consulta.token_encontrado) {
        if (passouDaValidade(consulta.token_criado_em)) {
          motivo = "expirado"
          mensagem = `Este código passou do prazo de ${validade}. Peça um novo código.`
        }
      } else if (consulta.ultimo_token_email_em) {
        // Há um código pendente para este e-mail, mas não é o digitado.
        if (passouDaValidade(consulta.ultimo_token_email_em)) {
          motivo = "expirado"
          mensagem = `O último código enviado passou do prazo de ${validade}. Peça um novo código.`
        } else {
          motivo = "nao_confere"
          mensagem =
            "Código incorreto. Confira os dígitos no e-mail mais recente: cada novo pedido anula o código anterior."
        }
      } else {
        motivo = "usado"
        mensagem = "Este código já foi usado ou não vale mais. Peça um novo código."
      }
    }
  }

  console.error(
    "[auth/codigo] código recusado:",
    JSON.stringify({
      motivo,
      fluxo: p.fluxo,
      erro: p.erro ? descreveErroAuth(p.erro) : null,
      diagnostico_disponivel: consulta !== null,
      idade_token_min: idadeMinutos(
        consulta?.token_criado_em ?? consulta?.ultimo_token_email_em ?? null
      ),
    })
  )
  return mensagem
}
