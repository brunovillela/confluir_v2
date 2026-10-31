import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { COLUNAS_RPA_CONTABIL, linhasRpaComTotal } from "@/lib/contabil-rpa-planilha"
import { esquemaAusente, hojeSP } from "@/lib/db/comum"
import { rpasPagosNoPeriodo, totalizarRpas } from "@/lib/db/contabil-rpa"
import { enviarEmail, type ContextoEmail } from "@/lib/email"
import { escaparHtml, paragrafo, textoSuave, tituloEmail } from "@/lib/email-layout"
import { formatarMoeda } from "@/lib/formato"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"
import { type ColunaXlsx, planilhaXlsxAbas } from "@/lib/xlsx"

/**
 * Relatório de RPAs à contabilidade (onda 6 do plano do RPA): no dia
 * seguinte ao fechamento do mês (Financeiro › Exportação contábil), o tick
 * diário manda a planilha com a aba RPAs do mês — a mesma da exportação —
 * para o e-mail da contabilidade (financeiro_config.email_contabilidade).
 * Cada fechamento é enviado uma vez (rpa_relatorio_enviado_em); reabrir e
 * fechar de novo gera outro fechamento, que manda a versão corrigida.
 */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
/** Fechamentos mais antigos que isso não são enviados (evita mandar o histórico de uma vez). */
const JANELA_DIAS = 10

const NOME_MES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
]

export async function emailContabilidade(): Promise<string | null> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("financeiro_config")
    .select("email_contabilidade")
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (error) return null
  return (data?.email_contabilidade as string | null) ?? null
}

export async function salvarEmailContabilidade(email: string | null): Promise<{ erro?: string }> {
  const valor = email?.trim().toLowerCase() || null
  if (valor && !EMAIL.test(valor)) return { erro: "E-mail inválido." }
  const admin = await createAdminClient()
  const { error } = await admin
    .from("financeiro_config")
    .upsert(
      { emp_proprietaria_id: await tenantAtual(), email_contabilidade: valor, updated_at: new Date().toISOString() },
      { onConflict: "emp_proprietaria_id" }
    )
  return error ? { erro: `Não foi possível salvar: ${error.message}` } : {}
}

/** Último dia do mês "AAAA-MM", em ISO. */
function ultimoDia(mes: string): string {
  const [a, m] = mes.split("-").map(Number)
  const d = new Date(Date.UTC(a, m, 0))
  return d.toISOString().slice(0, 10)
}

/** Para o tick diário: envia o relatório de cada fechamento de dias anteriores ainda não enviado. */
export async function enviarRelatoriosRpaDoFechamento(
  client: SupabaseClient,
  tenantId: string,
  contexto: ContextoEmail
): Promise<{ enviados: number; erros: string[] }> {
  const erros: string[] = []
  const { data: cfg, error: erroCfg } = await client
    .from("financeiro_config")
    .select("email_contabilidade")
    .eq("emp_proprietaria_id", tenantId)
    .maybeSingle()
  if (erroCfg) {
    if (!esquemaAusente(erroCfg) && erroCfg.code !== "42703") erros.push(erroCfg.message)
    return { enviados: 0, erros }
  }
  const destino = (cfg?.email_contabilidade as string | null)?.trim().toLowerCase()
  if (!destino || !EMAIL.test(destino)) return { enviados: 0, erros }

  // "Dia seguinte ao fechamento": fechado antes de hoje (São Paulo), dentro da janela.
  const inicioDeHoje = new Date(`${hojeSP()}T00:00:00-03:00`).toISOString()
  const desde = new Date(Date.now() - JANELA_DIAS * 864e5).toISOString()
  const { data: fechados, error } = await client
    .from("financeiro_meses_fechados")
    .select("id, mes, fechado_em")
    .eq("emp_proprietaria_id", tenantId)
    .is("reaberto_em", null)
    .is("rpa_relatorio_enviado_em", null)
    .lt("fechado_em", inicioDeHoje)
    .gte("fechado_em", desde)
  if (error) {
    if (!esquemaAusente(error) && error.code !== "42703") erros.push(error.message)
    return { enviados: 0, erros }
  }

  let enviados = 0
  for (const f of (fechados ?? []) as { id: string; mes: string }[]) {
    try {
      const mes = String(f.mes).slice(0, 7)
      const rotulo = `${NOME_MES[Number(mes.slice(5, 7)) - 1]} de ${mes.slice(0, 4)}`
      const rpas = await rpasPagosNoPeriodo(`${mes}-01`, ultimoDia(mes), { client, emp: tenantId })
      const t = totalizarRpas(rpas)
      const semNit = rpas.filter((r) => !r.nitPis).length
      const semAssinatura = rpas.filter((r) => !r.assinado).length
      const anexos = rpas.length
        ? [
            {
              nome: `rpas-${mes}.xlsx`,
              base64: Buffer.from(
                planilhaXlsxAbas([
                  { aba: "RPAs", colunas: COLUNAS_RPA_CONTABIL as ColunaXlsx<unknown>[], linhas: linhasRpaComTotal(rpas) },
                ])
              ).toString("base64"),
            },
          ]
        : undefined
      const ok = await enviarEmail({
        email: destino,
        nome: null,
        assunto: `RPAs de ${rotulo} — ${contexto.entidade}`,
        html:
          tituloEmail(`RPAs pagos em ${rotulo}`) +
          (rpas.length
            ? paragrafo(
                `${escaparHtml(contexto.entidade)} fechou o mês de <strong>${escaparHtml(rotulo)}</strong>. Segue a planilha dos <strong>${t.quantidade} RPA${t.quantidade === 1 ? "" : "s"}</strong> pagos no mês, com o NIT/PIS de cada prestador: bruto ${escaparHtml(formatarMoeda(t.bruto))}, INSS retido ${escaparHtml(formatarMoeda(t.inss))}, IRRF ${escaparHtml(formatarMoeda(t.irrf))}, ISS ${escaparHtml(formatarMoeda(t.iss))}, INSS patronal ${escaparHtml(formatarMoeda(t.inssPatronal))} — custo total ${escaparHtml(formatarMoeda(t.custoTotal))}.`
              ) +
              (semNit || semAssinatura
                ? textoSuave(
                    [
                      semNit ? `${semNit} prestador(es) sem NIT/PIS no cadastro (a planilha marca "não informado").` : "",
                      semAssinatura ? `${semAssinatura} recibo(s) ainda sem a assinatura anexada.` : "",
                    ]
                      .filter(Boolean)
                      .join(" ")
                  )
                : "")
            : paragrafo(
                `${escaparHtml(contexto.entidade)} fechou o mês de <strong>${escaparHtml(rotulo)}</strong> sem nenhum RPA pago.`
              )) +
          textoSuave(
            "Enviado automaticamente no dia seguinte ao fechamento do mês. As demais despesas e receitas estão na exportação contábil do sistema. Em caso de dúvida, responda a este e-mail."
          ),
        anexos,
        contexto,
      })
      if (!ok) {
        erros.push(`${mes}: e-mail não saiu`)
        continue
      }
      await client
        .from("financeiro_meses_fechados")
        .update({ rpa_relatorio_enviado_em: new Date().toISOString(), rpa_relatorio_enviado_para: destino })
        .eq("id", f.id)
      enviados++
    } catch (e) {
      erros.push(`${String(f.mes)}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  return { enviados, erros }
}
