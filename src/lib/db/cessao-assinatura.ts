import "server-only"

import {
  conferirCodigo,
  gerarCodigoAssinatura,
  hashCodigo,
  hashTexto,
  MAX_TENTATIVAS_CODIGO,
  novoCertificado,
  VALIDADE_CODIGO_MIN,
} from "@/lib/db/assinatura-comum"
import { esquemaAusente, texto } from "@/lib/db/comum"
import { obterSolicitacao } from "@/lib/db/espacos-esteira"
import { termoDaCessao } from "@/lib/db/espacos-termo"
import { obterOrganizacao } from "@/lib/db/organizacao"
import { enviarEmail } from "@/lib/email"
import {
  botaoEmail,
  caixaAviso,
  caixaCodigo,
  escaparHtml,
  linkReserva,
  paragrafo,
  textoSuave,
  tituloEmail,
} from "@/lib/email-layout"
import { createAdminClient, createServiceClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"
import { origemAtual } from "@/lib/tenant-url"

/**
 * Assinatura do termo de cessão — DOIS assinantes, em ordem.
 *
 * O envelope é o mesmo dos ofícios (`documento_assinaturas`, generalizado em
 * supabase/assinatura-generalizada.sql): token do link, código por e-mail,
 * hash do conteúdo e certificado. O que muda aqui é o número de assinantes e o
 * que acontece no fim.
 *
 * A ordem não é enfeite: quem cede assina primeiro, e só então o link vai para
 * quem recebe. Assinar um documento que a outra parte ainda pode mudar não
 * seria assinatura — seria expectativa.
 */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type PapelCessao = "cedente" | "concessionario"

export const ROTULO_PAPEL: Record<PapelCessao, string> = {
  cedente: "Cedente (entidade)",
  concessionario: "Concessionário",
}

export type AssinaturaCessao = {
  id: string
  nome: string | null
  email: string | null
  papel: PapelCessao
  ordem: number
  situacao: "pendente" | "assinado" | "recusado" | "cancelado"
  certificado: string | null
  token: string
  enviadoEm: string | null
  visualizadoEm: string | null
  assinadoEm: string | null
  recusadoEm: string | null
  motivoRecusa: string | null
  hashDocumento: string | null
}

function normalizar(l: Record<string, unknown>): AssinaturaCessao {
  return {
    id: String(l.id),
    nome: texto(l.nome),
    email: texto(l.email),
    papel: (l.papel as PapelCessao) ?? "concessionario",
    ordem: Number(l.ordem ?? 1),
    situacao: (l.situacao as AssinaturaCessao["situacao"]) ?? "pendente",
    certificado: texto(l.certificado),
    token: String(l.token),
    enviadoEm: texto(l.enviado_em),
    visualizadoEm: texto(l.visualizado_em),
    assinadoEm: texto(l.assinado_em),
    recusadoEm: texto(l.recusado_em),
    motivoRecusa: texto(l.motivo_recusa),
    hashDocumento: texto(l.hash_documento),
  }
}

export async function assinaturasDaCessao(
  solicitacaoId: string
): Promise<AssinaturaCessao[]> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("documento_assinaturas")
    .select("*")
    .eq("documento_tipo", "cessao")
    .eq("documento_id", solicitacaoId)
    .order("ordem", { ascending: true })
  if (error) return []
  return (data ?? []).map((l) => normalizar(l as Record<string, unknown>))
}

/**
 * Cria os dois envelopes e manda o link para o PRIMEIRO assinante. O hash do
 * termo é congelado agora: se alguém regerar o termo depois, a assinatura não
 * confere mais e o sistema recusa.
 */
export async function enviarTermoParaAssinatura(
  solicitacaoId: string,
  dados: {
    cedenteNome: string
    cedenteEmail: string
    concessionarioNome: string
    concessionarioEmail: string
  },
  usuarioId: string
): Promise<{ erro?: string }> {
  const [pedido, termo] = await Promise.all([
    obterSolicitacao(solicitacaoId),
    termoDaCessao(solicitacaoId),
  ])
  if (!pedido) return { erro: "Pedido não encontrado." }
  if (!termo.texto) return { erro: "Gere o termo antes de enviar para assinatura." }
  if (!EMAIL.test(dados.cedenteEmail) || !EMAIL.test(dados.concessionarioEmail)) {
    return { erro: "Informe e-mails válidos para as duas partes." }
  }
  if (!dados.cedenteNome.trim() || !dados.concessionarioNome.trim()) {
    return { erro: "Informe o nome de quem assina pelas duas partes." }
  }

  const jaExiste = await assinaturasDaCessao(solicitacaoId)
  if (jaExiste.some((a) => a.situacao === "assinado")) {
    return { erro: "Este termo já tem assinatura — cancele antes de reenviar." }
  }

  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const hash = hashTexto(termo.texto)

  // Reenvio limpa o que estava pendente, para não deixar link velho valendo.
  await admin
    .from("documento_assinaturas")
    .delete()
    .eq("documento_tipo", "cessao")
    .eq("documento_id", solicitacaoId)

  const { error } = await admin.from("documento_assinaturas").insert([
    {
      documento_tipo: "cessao",
      documento_id: solicitacaoId,
      ordem: 1,
      papel: "cedente",
      nome: dados.cedenteNome.trim(),
      email: dados.cedenteEmail.trim().toLowerCase(),
      situacao: "pendente",
      hash_documento: hash,
      certificado: novoCertificado(),
      enviado_por_id: usuarioId,
      enviado_em: new Date().toISOString(),
      emp_proprietaria_id: emp,
    },
    {
      documento_tipo: "cessao",
      documento_id: solicitacaoId,
      ordem: 2,
      papel: "concessionario",
      nome: dados.concessionarioNome.trim(),
      email: dados.concessionarioEmail.trim().toLowerCase(),
      situacao: "pendente",
      hash_documento: hash,
      certificado: novoCertificado(),
      enviado_por_id: usuarioId,
      emp_proprietaria_id: emp,
    },
  ])
  if (error) {
    if (esquemaAusente(error)) {
      return {
        erro: "Assinatura ainda não configurada — rode supabase/assinatura-generalizada.sql.",
      }
    }
    return { erro: `Não foi possível enviar: ${error.message}` }
  }

  await admin
    .from("cessao_solicitacoes")
    .update({ termo_hash: hash, termo_assinado_em: null })
    .eq("id", solicitacaoId)

  await registrarEvento(solicitacaoId, "termo_enviado", "Enviado para assinatura", usuarioId)

  const primeiro = (await assinaturasDaCessao(solicitacaoId)).find((a) => a.ordem === 1)
  if (primeiro) await convidar(primeiro, pedido.espacoNome, pedido.numero)
  return {}
}

async function registrarEvento(
  solicitacaoId: string,
  tipo: string,
  detalhe: string | null,
  usuarioId: string | null
): Promise<void> {
  const admin = await createAdminClient()
  await admin.from("cessao_solicitacao_eventos").insert({
    solicitacao_id: solicitacaoId,
    tipo,
    detalhe,
    usuario_id: usuarioId,
    emp_proprietaria_id: await tenantAtual(),
  })
}

/** Convite com o link pessoal — o código só vai quando a pessoa pedir. */
async function convidar(
  a: AssinaturaCessao,
  espaco: string,
  numero: number | null
): Promise<void> {
  if (!a.email) return
  const link = `${await origemAtual()}/assinar/${a.token}`
  await enviarEmail({
    email: a.email,
    nome: a.nome,
    assunto: `Assine o termo de cessão — ${espaco}`,
    html:
      tituloEmail("Termo de cessão para assinar") +
      paragrafo(
        `Você é quem assina como <strong>${escaparHtml(ROTULO_PAPEL[a.papel])}</strong> o termo de cessão do espaço <strong>${escaparHtml(espaco)}</strong>${numero ? ` (pedido nº ${numero})` : ""}.`
      ) +
      botaoEmail(link, "Ler e assinar o termo") +
      linkReserva(link) +
      textoSuave(
        "Ao abrir, você lê o termo inteiro e pede um código de 6 dígitos para confirmar a assinatura."
      ),
  })
}

// ── O lado público ───────────────────────────────────────────────────────────

export type EnvelopeCessao = {
  assinatura: AssinaturaCessao
  solicitacaoId: string
  espaco: string
  numero: number | null
  termo: string
  entidade: string | null
  /** A outra parte e como ela está. */
  outra: { nome: string | null; papel: PapelCessao; situacao: string } | null
  /** Ainda não é a vez desta pessoa. */
  aguardandoAnterior: boolean
}

export async function envelopeCessaoPorToken(
  token: string
): Promise<EnvelopeCessao | null> {
  if (!UUID.test(token)) return null
  const db = createServiceClient()
  const { data } = await db
    .from("documento_assinaturas")
    .select("*")
    .eq("token", token)
    .eq("documento_tipo", "cessao")
    .maybeSingle()
  if (!data) return null

  const a = normalizar(data as Record<string, unknown>)
  const solicitacaoId = String(data.documento_id)
  const { data: pedido } = await db
    .from("cessao_solicitacoes")
    .select("numero, termo_texto, espaco_id")
    .eq("id", solicitacaoId)
    .maybeSingle()
  if (!pedido?.termo_texto) return null

  const [{ data: espaco }, { data: todas }, org] = await Promise.all([
    db.from("cessao_espacos").select("nome").eq("id", pedido.espaco_id).maybeSingle(),
    db
      .from("documento_assinaturas")
      .select("*")
      .eq("documento_tipo", "cessao")
      .eq("documento_id", solicitacaoId)
      .order("ordem", { ascending: true }),
    obterOrganizacao(),
  ])

  const lista = (todas ?? []).map((l) => normalizar(l as Record<string, unknown>))
  const anteriores = lista.filter((x) => x.ordem < a.ordem)
  const outra = lista.find((x) => x.id !== a.id) ?? null

  return {
    assinatura: a,
    solicitacaoId,
    espaco: texto(espaco?.nome) ?? "espaço",
    numero: (pedido.numero as number | null) ?? null,
    termo: String(pedido.termo_texto),
    entidade: org?.nomeRazao ?? org?.nomeFantasia ?? null,
    outra: outra
      ? { nome: outra.nome, papel: outra.papel, situacao: outra.situacao }
      : null,
    aguardandoAnterior: anteriores.some((x) => x.situacao !== "assinado"),
  }
}

export async function registrarAberturaCessao(
  envelope: EnvelopeCessao,
  contexto: { ip: string | null; userAgent: string | null }
): Promise<void> {
  const db = createServiceClient()
  if (!envelope.assinatura.visualizadoEm) {
    await db
      .from("documento_assinaturas")
      .update({ visualizado_em: new Date().toISOString() })
      .eq("id", envelope.assinatura.id)
  }
  await db.from("documento_assinatura_eventos").insert({
    assinatura_id: envelope.assinatura.id,
    tipo: "abertura",
    detalhe: null,
    ip: contexto.ip,
    user_agent: contexto.userAgent,
  })
}

export async function solicitarCodigoCessao(
  token: string
): Promise<{ erro?: string; destino?: string }> {
  const envelope = await envelopeCessaoPorToken(token)
  if (!envelope) return { erro: "Link inválido." }
  const a = envelope.assinatura
  if (a.situacao !== "pendente") return { erro: "Este termo não está aguardando sua assinatura." }
  if (envelope.aguardandoAnterior) {
    return { erro: "A outra parte ainda não assinou. Você será avisado quando for sua vez." }
  }
  if (!a.email) return { erro: "Não há e-mail para enviar o código." }

  const db = createServiceClient()
  const codigo = gerarCodigoAssinatura()
  await db
    .from("documento_assinaturas")
    .update({
      codigo_hash: hashCodigo(codigo, a.token),
      codigo_expira_em: new Date(Date.now() + VALIDADE_CODIGO_MIN * 60000).toISOString(),
      codigo_tentativas: 0,
    })
    .eq("id", a.id)

  await enviarEmail({
    email: a.email,
    nome: a.nome,
    assunto: `Código para assinar — ${envelope.espaco}`,
    html:
      tituloEmail("Seu código de assinatura") +
      paragrafo("Digite o código abaixo na página para concluir sua assinatura:") +
      caixaCodigo(codigo) +
      textoSuave(`O código vale por ${VALIDADE_CODIGO_MIN} minutos.`),
  })
  return { destino: a.email }
}

export async function assinarCessao(
  token: string,
  entrada: { codigo: string; aceite: boolean },
  contexto: { ip: string | null; userAgent: string | null }
): Promise<{ erro?: string; concluido?: boolean }> {
  if (!entrada.aceite) {
    return { erro: "Confirme que leu o termo e concorda em assiná-lo." }
  }
  const envelope = await envelopeCessaoPorToken(token)
  if (!envelope) return { erro: "Link inválido." }
  const a = envelope.assinatura
  if (a.situacao !== "pendente") return { erro: "Este termo não está aguardando sua assinatura." }
  if (envelope.aguardandoAnterior) {
    return { erro: "A outra parte ainda não assinou." }
  }

  const db = createServiceClient()
  const { data: segredo } = await db
    .from("documento_assinaturas")
    .select("codigo_hash, codigo_expira_em, codigo_tentativas")
    .eq("id", a.id)
    .single()
  const codigo = entrada.codigo.replace(/\D/g, "")
  if (!segredo?.codigo_hash) return { erro: "Peça o código primeiro." }
  if ((segredo.codigo_tentativas ?? 0) >= MAX_TENTATIVAS_CODIGO) {
    return { erro: "Muitas tentativas. Peça um novo código." }
  }
  if (
    !segredo.codigo_expira_em ||
    new Date(String(segredo.codigo_expira_em)).getTime() < Date.now()
  ) {
    return { erro: "O código expirou. Peça um novo." }
  }
  if (codigo.length !== 6 || !conferirCodigo(codigo, a.token, String(segredo.codigo_hash))) {
    await db
      .from("documento_assinaturas")
      .update({ codigo_tentativas: (segredo.codigo_tentativas ?? 0) + 1 })
      .eq("id", a.id)
    return { erro: "Código errado." }
  }

  // O termo não pode ter mudado entre o envio e a assinatura.
  if (a.hashDocumento && a.hashDocumento !== hashTexto(envelope.termo)) {
    return {
      erro: "O termo mudou depois do envio. Peça à entidade para enviar de novo.",
    }
  }

  const agora = new Date().toISOString()
  await db
    .from("documento_assinaturas")
    .update({
      situacao: "assinado",
      assinado_em: agora,
      codigo_hash: null,
      ip: contexto.ip,
      user_agent: contexto.userAgent,
      updated_at: agora,
    })
    .eq("id", a.id)
  await db.from("documento_assinatura_eventos").insert({
    assinatura_id: a.id,
    tipo: "assinatura",
    detalhe: a.certificado,
    ip: contexto.ip,
    user_agent: contexto.userAgent,
  })

  // Próximo da fila, ou fim.
  const { data: restantes } = await db
    .from("documento_assinaturas")
    .select("*")
    .eq("documento_tipo", "cessao")
    .eq("documento_id", envelope.solicitacaoId)
    .order("ordem", { ascending: true })
  const lista = (restantes ?? []).map((l) => normalizar(l as Record<string, unknown>))
  const proximo = lista.find((x) => x.situacao === "pendente")

  if (proximo) {
    await db
      .from("documento_assinaturas")
      .update({ enviado_em: agora })
      .eq("id", proximo.id)
    await convidar(proximo, envelope.espaco, envelope.numero)
    return { concluido: false }
  }

  await db
    .from("cessao_solicitacoes")
    .update({ termo_assinado_em: agora, updated_at: agora })
    .eq("id", envelope.solicitacaoId)
  await db.from("cessao_solicitacao_eventos").insert({
    solicitacao_id: envelope.solicitacaoId,
    tipo: "termo_assinado",
    detalhe: "Assinado pelas duas partes",
  })
  return { concluido: true }
}

export async function recusarCessao(
  token: string,
  motivo: string,
  contexto: { ip: string | null; userAgent: string | null }
): Promise<{ erro?: string }> {
  if (!motivo.trim()) return { erro: "Diga o motivo da recusa." }
  const envelope = await envelopeCessaoPorToken(token)
  if (!envelope) return { erro: "Link inválido." }
  const a = envelope.assinatura
  if (a.situacao !== "pendente") return { erro: "Este termo não está aguardando sua assinatura." }

  const db = createServiceClient()
  const agora = new Date().toISOString()
  await db
    .from("documento_assinaturas")
    .update({
      situacao: "recusado",
      recusado_em: agora,
      motivo_recusa: motivo.trim(),
      ip: contexto.ip,
      user_agent: contexto.userAgent,
      updated_at: agora,
    })
    .eq("id", a.id)
  await db.from("documento_assinatura_eventos").insert({
    assinatura_id: a.id,
    tipo: "recusa",
    detalhe: motivo.trim(),
    ip: contexto.ip,
    user_agent: contexto.userAgent,
  })
  await db.from("cessao_solicitacao_eventos").insert({
    solicitacao_id: envelope.solicitacaoId,
    tipo: "termo_recusado",
    detalhe: `${a.nome ?? "assinante"}: ${motivo.trim()}`,
  })
  return {}
}

/** Cancela os envelopes pendentes — some com os links já enviados. */
export async function cancelarAssinaturaCessao(
  solicitacaoId: string,
  usuarioId: string
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin
    .from("documento_assinaturas")
    .update({ situacao: "cancelado", updated_at: new Date().toISOString() })
    .eq("documento_tipo", "cessao")
    .eq("documento_id", solicitacaoId)
    .eq("situacao", "pendente")
  if (error) return { erro: `Não foi possível cancelar: ${error.message}` }
  await registrarEvento(solicitacaoId, "termo_cancelado", "Assinatura cancelada", usuarioId)
  return {}
}

/** Aviso no corpo do e-mail quando as duas assinaturas saem. */
export async function avisoTermoCompleto(solicitacaoId: string): Promise<void> {
  const pedido = await obterSolicitacao(solicitacaoId)
  if (!pedido?.email) return
  await enviarEmail({
    email: pedido.email,
    nome: pedido.solicitante,
    assunto: `Termo de cessão assinado — ${pedido.espacoNome}`,
    html:
      tituloEmail("Termo assinado pelas duas partes") +
      paragrafo(
        `O termo de cessão do espaço <strong>${escaparHtml(pedido.espacoNome)}</strong> está assinado.`
      ) +
      caixaAviso("Guarde este e-mail: ele confirma a cessão."),
  })
}
