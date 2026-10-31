import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { esquemaAusente, hojeSP } from "@/lib/db/comum"
import { enviarEmail, type ContextoEmail } from "@/lib/email"
import { botaoEmail, escaparHtml, linkReserva, paragrafo, textoSuave, tituloEmail } from "@/lib/email-layout"
import { formatarMoeda } from "@/lib/formato"
import { MAX_LEMBRETES, proximaAcaoLembrete } from "@/lib/rpa-lembrete-regra"

/**
 * Lembretes da assinatura do RPA (onda 3 do plano do RPA), pelo tick diário
 * (/api/pendencias/tick, etapa "rpa"). Link pendente sem assinatura há
 * DIAS_LEMBRETE dias (lib/rpa-lembrete-regra.ts) desde o último contato (envio, reenvio ou lembrete): o
 * prestador recebe o mesmo link de novo, até MAX_LEMBRETES vezes. Depois do
 * último, passados mais DIAS_LEMBRETE dias, quem emitiu o RPA é avisado
 * (sino e e-mail), uma vez. Tudo fica na trilha da assinatura (eventos
 * "lembrete" e "lembretes_esgotados"), que é o que torna o tick idempotente.
 */

type Linha = Record<string, unknown>
const t = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null)

export async function lembrarAssinaturasRpa(
  client: SupabaseClient,
  tenantId: string,
  contexto: ContextoEmail
): Promise<{ lembretes: number; esgotados: number; erros: string[] }> {
  const erros: string[] = []
  const { data, error } = await client
    .from("documento_assinaturas")
    .select("id, documento_id, nome, email, token, enviado_em, enviado_por_id, created_at")
    .eq("emp_proprietaria_id", tenantId)
    .eq("documento_tipo", "rpa")
    .eq("situacao", "pendente")
    .limit(500)
  if (error) {
    if (!esquemaAusente(error)) erros.push(error.message)
    return { lembretes: 0, esgotados: 0, erros }
  }
  const pendentes = (data ?? []) as Linha[]
  if (!pendentes.length) return { lembretes: 0, esgotados: 0, erros }

  const ids = pendentes.map((a) => String(a.id))
  const [{ data: evs }, { data: rpas }] = await Promise.all([
    client
      .from("documento_assinatura_eventos")
      .select("assinatura_id, tipo, created_at")
      .in("assinatura_id", ids)
      .in("tipo", ["enviado", "reenviado", "lembrete", "lembretes_esgotados"]),
    client
      .from("compras_rpa")
      .select("id, numero, valor_liquido, criado_por, arquivo_assinado")
      .in(
        "id",
        pendentes.map((a) => String(a.documento_id))
      ),
  ])
  const rpaPorId = new Map(((rpas ?? []) as Linha[]).map((r) => [String(r.id), r]))
  const eventos = (evs ?? []) as Linha[]

  let lembretes = 0
  let esgotados = 0
  for (const a of pendentes) {
    const rpa = rpaPorId.get(String(a.documento_id))
    if (!rpa || t(rpa.arquivo_assinado)) continue
    const daqui = eventos.filter((e) => e.assinatura_id === a.id)
    const feitos = daqui.filter((e) => e.tipo === "lembrete").length
    const acao = proximaAcaoLembrete({
      contatos: daqui
        .filter((e) => e.tipo !== "lembretes_esgotados")
        .map((e) => Date.parse(String(e.created_at)))
        .concat([Date.parse(String(a.enviado_em ?? a.created_at))]),
      lembretesFeitos: feitos,
      esgotado: daqui.some((e) => e.tipo === "lembretes_esgotados"),
      agora: Date.now(),
    })
    if (acao === "nada") continue
    const numero = rpa.numero ?? "—"
    try {
      if (acao === "lembrete") {
        const email = t(a.email)
        if (!email) continue
        const link = `${contexto.origem}/assinar/${String(a.token)}`
        const ok = await enviarEmail({
          email,
          nome: t(a.nome),
          assunto: `Lembrete: recibo (RPA nº ${numero}) aguardando sua assinatura — ${contexto.entidade}`,
          html:
            tituloEmail("Seu recibo ainda aguarda a assinatura") +
            paragrafo(
              `${escaparHtml(contexto.entidade)} enviou o <strong>Recibo de Pagamento a Autônomo nº ${numero}</strong>, de ${escaparHtml(formatarMoeda(rpa.valor_liquido as number | null))} líquidos, e ele ainda não foi assinado. O pagamento só segue depois da sua assinatura.`
            ) +
            botaoEmail(link, "Ler e assinar o recibo") +
            linkReserva(link) +
            textoSuave(
              "É o mesmo link que você recebeu antes: você lê o recibo, pede um código de 6 dígitos por e-mail e confirma com seu nome completo e CPF. Se preferir assinar no papel ou pelo gov.br, fale com quem contratou o serviço."
            ),
          contexto,
        })
        if (!ok) {
          erros.push(`${String(a.id)}: e-mail não saiu`)
          continue
        }
        await client.from("documento_assinatura_eventos").insert({
          assinatura_id: a.id,
          tipo: "lembrete",
          detalhe: `Lembrete ${feitos + 1} de ${MAX_LEMBRETES}, para ${email}`,
          emp_proprietaria_id: tenantId,
        })
        lembretes++
      } else {
        // Esgotou: avisa quem emitiu (ou quem enviou o link), uma vez.
        const destinoId = t(rpa.criado_por) ?? t(a.enviado_por_id)
        const linkRpa = `/painel/compras/rpa/${String(rpa.id)}`
        const texto = `O RPA nº ${numero} ainda não foi assinado pelo prestador${t(a.nome) ? ` (${t(a.nome)})` : ""}, mesmo após ${MAX_LEMBRETES} lembretes por e-mail. Colha a assinatura no papel ou pelo gov.br e anexe o recibo.`
        if (destinoId) {
          await client.from("notificacoes").insert({
            usuario_id: destinoId,
            notificacao: texto.slice(0, 500),
            notificado: false,
            notificacao_data: hojeSP(),
            link: linkRpa,
          })
          const { data: u } = await client
            .from("usuarios")
            .select("nome_completo, nome_guerra, email")
            .eq("id", destinoId)
            .maybeSingle()
          const email = t(u?.email)
          if (email) {
            await enviarEmail({
              email,
              nome: t(u?.nome_completo) ?? t(u?.nome_guerra),
              assunto: `RPA nº ${numero} sem assinatura do prestador`,
              html:
                paragrafo(escaparHtml(texto)) +
                paragrafo(
                  "Enquanto o recibo não estiver assinado, a ordem de pagamento não segue para autorização. Na página do RPA, baixe o PDF e anexe o recibo assinado (no papel ou pelo gov.br), ou reenvie o link."
                ) +
                botaoEmail(`${contexto.origem}${linkRpa}`, "Abrir o RPA"),
              contexto,
            })
          }
        }
        await client.from("documento_assinatura_eventos").insert({
          assinatura_id: a.id,
          tipo: "lembretes_esgotados",
          detalhe: destinoId ? "Quem emitiu o RPA foi avisado" : "Sem usuário para avisar",
          emp_proprietaria_id: tenantId,
        })
        esgotados++
      }
    } catch (e) {
      erros.push(`${String(a.id)}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  return { lembretes, esgotados, erros }
}
