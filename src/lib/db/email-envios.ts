import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { departamentoDaPessoa } from "@/lib/db/departamento-principal"
import { conferirFalhasEmail, conferirLimitesEmail, conferirRejeicaoEmail } from "@/lib/db/email-avisos"
import { bloquearPorRejeicao, contarEnvio, controlesEmail, enderecoBloqueado, enviadosNoMes } from "@/lib/db/email-controles"
import { envioDaMarca, motivoParaBarrar, mudancaDoEvento, processoEmail } from "@/lib/email-processos"
import { usuarioIdAtual } from "@/lib/sessao-atual"
import { createServiceClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * REGISTRO DOS E-MAILS (Gestão, 23/11/2026 — fase 1 da gestão do e-mail).
 * Cada e-mail que sai por lib/email.ts ganha uma linha em email_envios antes
 * de ir ao provedor (o id vai no cabeçalho X-Mailin-custom) e é concluída com
 * a resposta. O webhook do Brevo completa a linha com a entrega, o adiamento
 * ou a rejeição. Não guarda assunto nem corpo.
 *
 * O registro é acessório: sem a tabela (migração pendente) ou com falha de
 * rede, o e-mail sai do mesmo jeito.
 */

export type SituacaoEnvio = "enviando" | "enviado" | "falhou" | "sem_configuracao" | "teste" | "barrado"
export type ProvedorEmail = "brevo" | "resend" | "nenhum"

export type AberturaEnvio = {
  /** Entidade explícita (agendador); sem ela, a da requisição. */
  tenantId?: string
  processo: string
  detalhe?: string | null
  destinatario: string
  provedor: ProvedorEmail
  /** De que conta sai: a própria da entidade ou a da plataforma. */
  conta?: "entidade" | "plataforma"
  situacao: SituacaoEnvio
  anexos: number
}

function dominioDe(email: string): string | null {
  const d = email.trim().toLowerCase().split("@")[1]
  return d && d.length <= 255 ? d : null
}

/**
 * Trava da Gestão (fase 3): módulo desligado, teto, cota do departamento ou
 * endereço bloqueado. null = pode sair. Em caso de erro, não barra.
 */
async function travaDoEnvio(emp: string, processo: string, destinatario: string, departamentoId: string | null): Promise<string | null> {
  try {
    const [{ controles }, bloqueado] = await Promise.all([controlesEmail(emp), enderecoBloqueado(emp, destinatario)])
    // Com teto ou cota, conta sempre: para barrar (se "parar no teto") e para avisar a Gestão a 80% e 100% (fase 5).
    const precisaContar = controles.limiteMensal !== null || Object.keys(controles.cotasDepartamento).length > 0
    const contagem = precisaContar
      ? await enviadosNoMes(emp, Boolean(departamentoId && controles.cotasDepartamento[departamentoId] !== undefined))
      : { total: 0, porDepto: new Map<string, number>() }
    const doDepartamento = departamentoId ? (contagem.porDepto.get(departamentoId) ?? 0) : 0
    const motivo = motivoParaBarrar({
      processo,
      controles,
      enderecoBloqueado: bloqueado,
      enviadosNoMes: contagem.total,
      departamentoId,
      enviadosDoDepartamento: doDepartamento,
    })
    if (precisaContar) {
      // Este e-mail entra na conta se sair; barrado no teto, a conta já passou do limite.
      const soma = motivo ? 0 : 1
      conferirLimitesEmail(emp, controles, contagem.total + soma, departamentoId, doDepartamento + soma)
    }
    return motivo
  } catch {
    return null
  }
}

/**
 * Confere as travas da Gestão e grava a linha do envio. Devolve o id (null se
 * não conseguiu registrar) e, se a Gestão barrou, o motivo — aí o e-mail não
 * sai e a linha fica como "barrado".
 */
export async function abrirRegistroEnvio(a: AberturaEnvio): Promise<{ id: string | null; emp: string | null; barrado: string | null }> {
  let emp: string | null = null
  let barrado: string | null = null
  try {
    emp = a.tenantId ?? (await tenantAtual())
    // Quem disparou só existe com sessão; no agendador, ninguém (usuarioIdAtual devolve null).
    const usuarioId = await usuarioIdAtual()
    const departamentoId = usuarioId ? await departamentoDaPessoa(usuarioId, emp) : null
    const proc = processoEmail(a.processo)
    barrado = await travaDoEnvio(emp, proc.chave, a.destinatario, departamentoId)
    if (!barrado && a.situacao === "enviando") contarEnvio(emp, departamentoId)
    const id = crypto.randomUUID()
    const { error } = await createServiceClient()
      .from("email_envios")
      .insert({
        id,
        emp_proprietaria_id: emp,
        processo: proc.chave,
        modulo: proc.modulo,
        detalhe: a.detalhe ? a.detalhe.slice(0, 80) : null,
        usuario_id: usuarioId,
        departamento_id: departamentoId,
        destinatario: a.destinatario.trim().slice(0, 320),
        dominio: dominioDe(a.destinatario),
        provedor: a.provedor,
        ...(a.conta ? { conta: a.conta } : {}),
        situacao: barrado ? "barrado" : a.situacao,
        erro: barrado,
        anexos: a.anexos,
      })
    return { id: error ? null : id, emp, barrado }
  } catch {
    return { id: null, emp, barrado }
  }
}

/** Resultado do provedor na linha do envio. */
export async function concluirRegistroEnvio(
  reg: { id: string | null; emp: string | null } | null,
  situacao: SituacaoEnvio,
  erro?: string | null,
  /** A conta mudou no caminho (a da entidade recusou e saiu pela plataforma). */
  conta?: "entidade" | "plataforma"
): Promise<void> {
  if (!reg?.id || !reg.emp) return
  try {
    await createServiceClient()
      .from("email_envios")
      .update({ situacao, erro: erro ? erro.slice(0, 200) : null, ...(conta ? { conta } : {}) })
      .eq("id", reg.id)
      .eq("emp_proprietaria_id", reg.emp)
    // Fase 5: as últimas tentativas falharam todas? Avisa a Gestão.
    if (situacao === "falhou") conferirFalhasEmail(reg.emp)
  } catch {
    // Acessório: o e-mail já saiu (ou não) de qualquer jeito.
  }
}

/**
 * Evento do webhook do Brevo na linha do envio (pela marca `e:<id>` do
 * X-Mailin-custom). Devolve o que fez, para o log da rota. Nunca lança.
 */
export async function registrarEventoEnvio(client: SupabaseClient, e: Record<string, unknown>, somenteEntidade: string | null = null): Promise<string> {
  try {
    const id = envioDaMarca(String(e["X-Mailin-custom"] ?? e["x-mailin-custom"] ?? ""))
    if (!id) return "sem registro"
    const evento = String(e.event ?? "").toLowerCase()
    const mudanca = mudancaDoEvento(e)
    if (!mudanca) return `envio: ignorado (${evento})`
    let q = client.from("email_envios").update(mudanca).eq("id", id)
    // Token da conta de uma entidade: só mexe nos e-mails dela.
    if (somenteEntidade) q = q.eq("emp_proprietaria_id", somenteEntidade)
    const { data, error } = await q.select("emp_proprietaria_id, destinatario").maybeSingle()
    if (error) return `erro envio: ${error.message}`
    // Rejeição definitiva: o endereço vai para os bloqueios (a Gestão libera).
    if (mudanca.rejeitado_em && data?.destinatario) {
      await bloquearPorRejeicao(String(data.emp_proprietaria_id), String(data.destinatario), String(mudanca.rejeicao ?? evento))
      conferirRejeicaoEmail(String(data.emp_proprietaria_id))
      return `envio: ${evento} (endereço bloqueado)`
    }
    return `envio: ${evento}`
  } catch (erro) {
    return `erro envio: ${erro instanceof Error ? erro.message : String(erro)}`
  }
}
