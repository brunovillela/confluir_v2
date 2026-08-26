import "server-only"
import { nomesDosUsuarios } from "@/lib/db/comum"
import { tenantAtual } from "@/lib/tenant"

import { criarNotificacao } from "@/lib/db/notificacoes"
import { enviarPushTelegram } from "@/lib/db/telegram"
import { enviarEmail } from "@/lib/email"
import { SITE_URL } from "@/lib/env"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Informes de rendimentos — mesmo desenho das remessas de contracheques:
 * `pessoal_informes_rendimentos_remessas` (7 migradas; uma por ano-base,
 * `fechada` trava os itens) agrupa `pessoal_informes_rendimentos` (126:
 * funcionário + arquivo + liberado). O funcionário vê SÓ os itens liberados
 * no autosserviço; liberar dispara notificação interna + email.
 *
 * Arquivos novos vão ao bucket privado 'pessoal' (informes/<remessa>/);
 * legados são URLs //cdn do Bubble (urlArquivoPessoal resolve os dois).
 */

export type RemessaInformes = {
  id: string
  ano_referencia_os: string | null
  ordem: number | null
  fechada: boolean | null
  created_at: string | null
  itens: number
}

export async function listarRemessasInformes(): Promise<RemessaInformes[]> {
  const admin = await createAdminClient()
  const [remessas, itens] = await Promise.all([
    admin
      .from("pessoal_informes_rendimentos_remessas")
      .select("id, ano_referencia_os, ordem, fechada, created_at")
      .eq("emp_proprietaria_id", await tenantAtual())
      .order("ordem", { ascending: false, nullsFirst: false }),
    admin
      .from("pessoal_informes_rendimentos")
      .select("id, remessa_id")
      .eq("emp_proprietaria_id", await tenantAtual()),
  ])
  if (remessas.error) {
    throw new Error(`Falha ao listar remessas: ${remessas.error.message}`)
  }
  if (itens.error) {
    throw new Error(`Falha ao contar informes: ${itens.error.message}`)
  }
  const porRemessa = new Map<string, number>()
  for (const i of itens.data ?? []) {
    if (i.remessa_id) {
      porRemessa.set(i.remessa_id, (porRemessa.get(i.remessa_id) ?? 0) + 1)
    }
  }
  return (remessas.data ?? []).map((r) => ({
    ...r,
    itens: porRemessa.get(r.id) ?? 0,
  }))
}

export async function buscarRemessaInformes(
  id: string
): Promise<RemessaInformes | null> {
  const remessas = await listarRemessasInformes()
  return remessas.find((r) => r.id === id) ?? null
}

/** Próxima ordem sequencial das remessas de informes. */
export async function proximaOrdemRemessaInformes(): Promise<number> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("pessoal_informes_rendimentos_remessas")
    .select("ordem")
    .eq("emp_proprietaria_id", await tenantAtual())
    .order("ordem", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle()
  return (data?.ordem ?? 0) + 1
}

export type InformeDaRemessa = {
  id: string
  funcionario_id: string | null
  funcionarioNome: string | null
  liberado: boolean | null
  arquivo_url: string | null
  created_at: string | null
}

export async function informesDaRemessa(
  remessaId: string
): Promise<InformeDaRemessa[]> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("pessoal_informes_rendimentos")
    .select("id, funcionario_id, liberado, arquivo_url, created_at")
    .eq("remessa_id", remessaId)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) throw new Error(`Falha ao listar informes: ${error.message}`)
  const itens = data ?? []
  const nomes = await nomesDosUsuarios([
    ...new Set(
      itens.map((i) => i.funcionario_id).filter((v): v is string => !!v)
    ),
  ])
  return itens
    .map((i) => ({
      ...i,
      funcionarioNome: i.funcionario_id
        ? (nomes.get(i.funcionario_id) ?? null)
        : null,
    }))
    .sort((a, b) =>
      (a.funcionarioNome ?? "￿").localeCompare(b.funcionarioNome ?? "￿", "pt-BR")
    )
}

export type MeuInforme = {
  id: string
  ano: string | null
  arquivo_url: string | null
  created_at: string | null
}

/** Informes LIBERADOS do próprio funcionário, do ano mais recente ao mais antigo. */
export async function meusInformes(usuarioId: string): Promise<MeuInforme[]> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("pessoal_informes_rendimentos")
    .select("id, ano_referencia_os, arquivo_url, created_at")
    .eq("funcionario_id", usuarioId)
    .eq("liberado", true)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) throw new Error(`Falha ao listar seus informes: ${error.message}`)
  return (data ?? [])
    .map((i) => ({
      id: i.id,
      ano: i.ano_referencia_os,
      arquivo_url: i.arquivo_url,
      created_at: i.created_at,
    }))
    .sort((a, b) => (b.ano ?? "").localeCompare(a.ano ?? ""))
}

/** Aviso de informe liberado: notificação interna + email (email não interrompe). */
export async function notificarInformeLiberado(
  funcionarioId: string,
  ano: string | null
): Promise<void> {
  const mensagem = `Seu informe de rendimentos${ano ? ` do ano-base ${ano}` : ""} está disponível no sistema.`
  try {
    await criarNotificacao({ usuarioId: funcionarioId, texto: mensagem })
  } catch (e) {
    console.error("Falha ao notificar informe de rendimentos:", e)
  }
  await enviarPushTelegram(funcionarioId, mensagem, "informe")

  const admin = await createAdminClient()
  const { data: usuario } = await admin
    .from("usuarios")
    .select("email, nome_completo, nome_guerra")
    .eq("id", funcionarioId)
    .maybeSingle()
  if (!usuario?.email) return

  const nome = usuario.nome_completo ?? usuario.nome_guerra ?? null
  await enviarEmail({
    email: usuario.email,
    nome,
    assunto: "Informe de rendimentos disponível — {ENTIDADE}",
    html: `<p>Olá${nome ? `, ${String(nome).split(" ")[0]}` : ""}!</p><p>${mensagem}</p><p>Acesse em <a href="${SITE_URL}/painel/perfil/contracheques">${SITE_URL}/painel/perfil/contracheques</a>.</p><p>Confluir — {ENTIDADE}</p>`,
  })
}
