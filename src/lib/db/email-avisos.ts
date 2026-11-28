import "server-only"

import { avisar, depoisDaResposta, usuariosComPermissao, type Destinatario } from "@/lib/db/avisos"
import { contextoDoTenant } from "@/lib/db/comunicacao-mensagens"
import { falhasSeguidas, FALHAS_SEGUIDAS_ALERTA, nivelDoLimite, periodoBrasilia, rejeicaoAlta, type ControlesEmail } from "@/lib/email-processos"
import type { EventoTelegram } from "@/lib/telegram-eventos"
import { createServiceClient } from "@/lib/supabase/admin"

/**
 * AVISOS DO E-MAIL À GESTÃO (Gestão › E-mail, 27/11/2026 — fase 5). Pelo
 * sistema de avisos (sino; e-mail, Telegram e celular conforme Meu perfil →
 * Avisos), a quem tem `gestao_sistema`:
 *  - teto mensal a 80% e a 100% (uma vez por nível por mês);
 *  - cota do departamento a 80% e a 100% (também ao coordenador dele);
 *  - rejeição alta nos últimos 7 dias (no máximo uma vez por semana);
 *  - chave da conta própria recusada ou ilegível (uma vez por dia);
 *  - remetente da conta própria fora dos domínios verificados (uma vez por dia);
 *  - falhas seguidas do provedor (uma vez por hora).
 * A marca é a linha em email_avisos (chave única por tipo e período): o
 * insert que conflita não avisa de novo, nem com centenas de e-mails saindo ao
 * mesmo tempo. Tudo é melhor esforço e roda depois da resposta: nunca atrasa
 * nem derruba o envio. Usa o cliente de serviço, porque roda também no
 * agendador e no webhook, sempre com a entidade explícita.
 */

const LINK = "/painel/gestao/email"

/** Chaves já marcadas nesta instância: poupam o banco a cada e-mail. */
const jaMarcadas = new Set<string>()

const inteiro = (n: number) => n.toLocaleString("pt-BR")

/**
 * Grava as marcas do aviso. Devolve true se a `principal` entrou agora (o
 * aviso deve sair). As demais (ex.: o 80% quando já chegou a 100%) só são
 * marcadas, para não avisar depois o nível que já passou.
 */
async function marcar(emp: string, principal: string, outras: string[] = []): Promise<boolean> {
  const chave = `${emp}|${principal}`
  if (jaMarcadas.has(chave)) return false
  const todas = [...outras, principal]
  const { data, error } = await createServiceClient()
    .from("email_avisos")
    .upsert(
      todas.map((c) => ({ emp_proprietaria_id: emp, chave: c })),
      { onConflict: "emp_proprietaria_id,chave", ignoreDuplicates: true }
    )
    .select("chave")
  if (error) return false // sem a tabela (migração pendente): não avisa
  for (const c of todas) jaMarcadas.add(`${emp}|${c}`)
  return (data ?? []).some((l) => String(l.chave) === principal)
}

async function enviarAviso(
  emp: string,
  aviso: { texto: string; assunto: string; evento?: EventoTelegram; link?: string },
  extras: Destinatario[] = []
): Promise<void> {
  const svc = createServiceClient()
  const contexto = await contextoDoTenant(emp, svc)
  const amb = { client: svc, tenantId: emp, contexto }
  const destinatarios = await usuariosComPermissao("gestao_sistema", [], amb)
  const ids = new Set(destinatarios.map((d) => d.id))
  for (const d of extras) if (!ids.has(d.id)) destinatarios.push(d)
  await avisar(destinatarios, { texto: aviso.texto, assunto: aviso.assunto, link: aviso.link ?? LINK, evento: aviso.evento ?? "gestao_email" }, amb)
}

function seguro(nome: string, tarefa: () => Promise<void>): void {
  try {
    depoisDaResposta(tarefa)
  } catch (e) {
    console.error(`${nome}:`, e)
  }
}

// ── Teto e cota ─────────────────────────────────────────────────────────────

/**
 * Depois de cada envio contado: teto da entidade e cota do departamento de
 * quem disparou. `enviados` já inclui este e-mail.
 */
export function conferirLimitesEmail(
  emp: string,
  controles: ControlesEmail,
  enviados: number,
  departamentoId: string | null,
  enviadosDoDepartamento: number
): void {
  const { mes } = periodoBrasilia()
  const nivelTeto = nivelDoLimite(enviados, controles.limiteMensal)
  const cota = departamentoId ? controles.cotasDepartamento[departamentoId] : undefined
  const nivelCota = departamentoId ? nivelDoLimite(enviadosDoDepartamento, cota) : null
  // Já avisado nesta instância: nem agenda a tarefa.
  if ((!nivelTeto || jaMarcadas.has(`${emp}|teto:${mes}:${nivelTeto}`)) && (!nivelCota || jaMarcadas.has(`${emp}|cota:${departamentoId}:${mes}:${nivelCota}`))) return

  seguro("conferirLimitesEmail", async () => {
    const para = controles.bloquearNoLimite
    if (nivelTeto && controles.limiteMensal) {
      const limite = controles.limiteMensal
      if (await marcar(emp, `teto:${mes}:${nivelTeto}`, nivelTeto === 100 ? [`teto:${mes}:80`] : [])) {
        const texto =
          nivelTeto === 100
            ? para
              ? `Os e-mails da entidade atingiram o teto mensal (${inteiro(enviados)} de ${inteiro(limite)}). Os não essenciais param até o dia 1º ou até o teto subir; acesso, códigos, votação e assinatura continuam saindo.`
              : `Os e-mails da entidade atingiram o teto mensal (${inteiro(enviados)} de ${inteiro(limite)}). O teto só alerta: os e-mails continuam saindo.`
            : `Os e-mails da entidade chegaram a 80% do teto mensal (${inteiro(enviados)} de ${inteiro(limite)}).${para ? " Ao atingir o teto, os não essenciais param." : ""}`
        await enviarAviso(emp, { texto, assunto: nivelTeto === 100 ? "Teto mensal de e-mails atingido" : "E-mails perto do teto mensal" })
      }
    }
    if (nivelCota && cota && departamentoId) {
      if (await marcar(emp, `cota:${departamentoId}:${mes}:${nivelCota}`, nivelCota === 100 ? [`cota:${departamentoId}:${mes}:80`] : [])) {
        const svc = createServiceClient()
        const { data: d } = await svc
          .from("empresa_departamentos")
          .select("departamento, coordenador_id")
          .eq("emp_proprietaria_id", emp)
          .eq("id", departamentoId)
          .maybeSingle()
        const nome = String(d?.departamento ?? "o departamento")
        const extras: Destinatario[] = []
        if (d?.coordenador_id) {
          const { data: u } = await svc
            .from("usuarios")
            .select("id, nome_completo, nome_guerra, email")
            .eq("id", String(d.coordenador_id))
            .not("inativo", "is", true)
            .maybeSingle()
          if (u) extras.push({ id: String(u.id), nome: (u.nome_completo ?? u.nome_guerra ?? null) as string | null, email: (u.email ?? null) as string | null, permissoes: {} })
        }
        const texto =
          nivelCota === 100
            ? para
              ? `Os e-mails de ${nome} atingiram a cota do mês (${inteiro(enviadosDoDepartamento)} de ${inteiro(cota)}). Os não essenciais disparados pelo departamento param até o dia 1º ou até a cota subir.`
              : `Os e-mails de ${nome} atingiram a cota do mês (${inteiro(enviadosDoDepartamento)} de ${inteiro(cota)}). A cota só alerta: os e-mails continuam saindo.`
            : `Os e-mails de ${nome} chegaram a 80% da cota do mês (${inteiro(enviadosDoDepartamento)} de ${inteiro(cota)}).${para ? " Ao atingir a cota, os não essenciais do departamento param." : ""}`
        await enviarAviso(
          emp,
          { texto, assunto: nivelCota === 100 ? `Cota de e-mails de ${nome} atingida` : `E-mails de ${nome} perto da cota`, evento: "email_cota_departamento" },
          extras
        )
      }
    }
  })
}

// ── Rejeição alta ───────────────────────────────────────────────────────────

/** Última conferência da rejeição por entidade nesta instância (no máximo uma por hora). */
const rejeicaoConferida = new Map<string, number>()

/** Chamado pelo webhook a cada rejeição: confere a taxa dos últimos 7 dias. */
export function conferirRejeicaoEmail(emp: string): void {
  const ultima = rejeicaoConferida.get(emp) ?? 0
  if (Date.now() - ultima < 3600_000) return
  rejeicaoConferida.set(emp, Date.now())
  seguro("conferirRejeicaoEmail", async () => {
    const svc = createServiceClient()
    const desde = new Date(Date.now() - 7 * 24 * 3600_000).toISOString()
    const [{ count: enviados }, { count: rejeitados }] = await Promise.all([
      svc.from("email_envios").select("id", { count: "exact", head: true }).eq("emp_proprietaria_id", emp).eq("situacao", "enviado").gte("criado_em", desde),
      svc.from("email_envios").select("id", { count: "exact", head: true }).eq("emp_proprietaria_id", emp).not("rejeitado_em", "is", null).gte("criado_em", desde),
    ])
    const e = enviados ?? 0
    const r = rejeitados ?? 0
    if (!rejeicaoAlta(e, r)) return
    if (!(await marcar(emp, `rejeicao:${periodoBrasilia().semana}`))) return
    await enviarAviso(emp, {
      texto: `${inteiro(r)} de ${inteiro(e)} e-mails dos últimos 7 dias foram rejeitados (${Math.round((r / e) * 100)}%). Rejeição alta derruba a reputação do domínio e faz os e-mails caírem no spam: confira os endereços rejeitados (já bloqueados) e a origem dos cadastros.`,
      assunto: "Rejeição alta nos e-mails da entidade",
      link: `${LINK}?periodo=7d&situacao=rejeitado#historico`,
    })
  })
}

// ── Conta própria ───────────────────────────────────────────────────────────

/** A chave da conta própria foi recusada (num envio ou no teste diário) ou não pode ser lida. */
export function avisarChaveEmailRecusada(emp: string, motivo: string, ilegivel = false): void {
  seguro("avisarChaveEmailRecusada", async () => {
    if (!(await marcar(emp, `chave:${periodoBrasilia().dia}`))) return
    await enviarAviso(emp, {
      texto: ilegivel
        ? "A chave da conta própria de e-mail não pode ser lida neste servidor (a chave de cifra mudou). Os e-mails estão saindo pela conta da plataforma até ela ser cadastrada de novo em Gestão › E-mail."
        : `O provedor recusou a chave da conta própria de e-mail: ${motivo} Os e-mails estão saindo pela conta da plataforma. Confira em Gestão › E-mail.`,
      assunto: ilegivel ? "Chave de e-mail da entidade ilegível" : "Chave de e-mail da entidade recusada",
      link: `${LINK}#conta`,
    })
  })
}

/** O teste diário achou o remetente fora dos domínios e remetentes verificados da conta. */
export function avisarRemetenteNaoVerificado(emp: string, remetente: string): void {
  seguro("avisarRemetenteNaoVerificado", async () => {
    if (!(await marcar(emp, `remetente:${periodoBrasilia().dia}`))) return
    await enviarAviso(emp, {
      texto: `O remetente ${remetente} não está mais num domínio verificado da conta própria de e-mail. O provedor pode recusar ou mandar para o spam: confira os registros de DNS no painel do provedor.`,
      assunto: "Remetente de e-mail sem domínio verificado",
      link: `${LINK}#conta`,
    })
  })
}

// ── Falhas seguidas ─────────────────────────────────────────────────────────

/** Chamado a cada envio que falhou: as últimas tentativas falharam todas? */
export function conferirFalhasEmail(emp: string): void {
  if (jaMarcadas.has(`${emp}|falhas:${periodoBrasilia().hora}`)) return
  seguro("conferirFalhasEmail", async () => {
    const { data } = await createServiceClient()
      .from("email_envios")
      .select("situacao")
      .eq("emp_proprietaria_id", emp)
      .in("situacao", ["enviado", "falhou"])
      .order("criado_em", { ascending: false })
      .limit(FALHAS_SEGUIDAS_ALERTA)
    const situacoes = (data ?? []).map((l) => String(l.situacao))
    if (!falhasSeguidas(situacoes)) return
    if (!(await marcar(emp, `falhas:${periodoBrasilia().hora}`))) return
    await enviarAviso(emp, {
      texto: `Os últimos ${FALHAS_SEGUIDAS_ALERTA} e-mails da entidade não saíram: o provedor está recusando ou fora do ar. Confira o erro no histórico da Gestão › E-mail.`,
      assunto: "E-mails da entidade falhando",
      link: `${LINK}?periodo=7d&situacao=falhou#historico`,
    })
  })
}
