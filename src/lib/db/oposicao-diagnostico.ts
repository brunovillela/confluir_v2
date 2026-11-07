import "server-only"

import { buscarFiliadoPorCpf } from "@/lib/contas"
import { cpfConfiavel, grafiasDoCpf, limparCpf, validarCpf } from "@/lib/cpf"
import { texto } from "@/lib/db/comum"
import { codigoPendenteDoEmail, contaDeAcesso } from "@/lib/auth-diagnostico"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Diagnóstico de acesso da oposição (onda 2 das melhorias, 31/10/2026): o
 * "o código não chegou" respondido com fatos. Por CPF ou e-mail, junta:
 *  - de onde vêm os e-mails (cadastro de filiado, cadastro de não filiado);
 *  - se há código pendente para o e-mail e desde quando — o Supabase guarda
 *    só o código ainda não usado (`auth_diagnostico_token`, a mesma consulta
 *    do diagnóstico da tela de entrada);
 *  - o pedido de código pela oposição ainda não conferido (vínculo pendente);
 *  - a conta já vinculada ao CPF e o último acesso;
 *  - o que a Brevo registrou para o endereço (entregue, recusado, bloqueado,
 *    adiado…), pela API de eventos — o SMTP do Supabase sai pela Brevo;
 *  - as oposições do CPF.
 * E uma orientação pronta para o atendente, endereço por endereço.
 */

export type EventoBrevo = { quando: string; evento: string; assunto: string | null; motivo: string | null }

export type OrigemEmail = "cadastro de filiado" | "cadastro de não filiado" | "informado na busca"

export type DiagnosticoEmail = {
  email: string
  origens: OrigemEmail[]
  /** Código pedido e ainda não usado (o Supabase apaga no uso). */
  codigoPendenteDesde: string | null
  /** Pedido de código pela oposição, ainda não conferido. */
  pedidoOposicao: { tipo: string; em: string } | null
  /** null = a Brevo não foi consultada (sem chave ou falha). */
  eventos: EventoBrevo[] | null
  orientacao: { nivel: "ok" | "atencao" | "problema"; texto: string }
}

export type DiagnosticoAcesso = {
  busca: { tipo: "cpf" | "email"; valor: string }
  pessoa: { nome: string | null; filiado: boolean; ativo: boolean; naoFiliado: boolean } | null
  conta: { email: string | null; ultimoAcesso: string | null; tipo: string } | null
  emails: DiagnosticoEmail[]
  oposicoes: { campanha: string; situacao: string; protocolo: number | null; em: string | null; id: string; campanhaId: string | null }[]
  /** A Brevo não pôde ser consultada (sem chave, ou erro): o motivo. */
  brevoIndisponivel: string | null
}

const NOME_EVENTO: Record<string, string> = {
  requests: "Enviado",
  delivered: "Entregue",
  hardBounces: "Recusado (endereço não existe)",
  softBounces: "Recusado temporariamente",
  blocked: "Bloqueado pela Brevo",
  spam: "Marcado como spam",
  invalid: "Endereço inválido",
  deferred: "Adiado",
  opened: "Aberto",
  clicks: "Clicado",
  unsubscribed: "Descadastrado",
  error: "Erro no envio",
  loadedByProxy: "Aberto (pré-carregado)",
}

async function eventosBrevo(email: string): Promise<{ eventos: EventoBrevo[] | null; erro: string | null }> {
  const chave = process.env.BREVO_API_KEY
  if (!chave) return { eventos: null, erro: "sem a chave da Brevo no servidor" }
  try {
    const url = new URL("https://api.brevo.com/v3/smtp/statistics/events")
    url.searchParams.set("email", email)
    url.searchParams.set("days", "30")
    url.searchParams.set("limit", "30")
    url.searchParams.set("sort", "desc")
    const r = await fetch(url, {
      headers: { "api-key": chave, Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    })
    if (!r.ok) return { eventos: null, erro: `a Brevo respondeu ${r.status}` }
    const d = (await r.json()) as { events?: Record<string, unknown>[] }
    return {
      eventos: (d.events ?? []).map((e) => ({
        quando: String(e.date ?? ""),
        evento: NOME_EVENTO[String(e.event)] ?? String(e.event ?? "—"),
        assunto: texto(e.subject),
        motivo: texto(e.reason),
      })),
      erro: null,
    }
  } catch (e) {
    return { eventos: null, erro: e instanceof Error && e.name === "TimeoutError" ? "a Brevo não respondeu a tempo" : "falha ao consultar a Brevo" }
  }
}


/** A orientação para o atendente, pelo que aconteceu com o endereço. */
function orientar(d: Omit<DiagnosticoEmail, "orientacao">): DiagnosticoEmail["orientacao"] {
  const ev = d.eventos ?? []
  const ultimo = (nome: string) => ev.find((e) => e.evento === nome)
  if (ultimo("Recusado (endereço não existe)") || ultimo("Endereço inválido")) {
    return {
      nivel: "problema",
      texto:
        "O servidor do destinatário diz que este endereço não existe. Não filiado: use outro e-mail. Filiado: corrija o e-mail no cadastro e peça o código de novo.",
    }
  }
  if (ultimo("Bloqueado pela Brevo")) {
    return {
      nivel: "problema",
      texto:
        "A Brevo bloqueou este endereço (recusa ou reclamação anterior) e não manda mais nada para ele. Use outro e-mail, ou desbloqueie o contato no painel da Brevo (Transactional › Blocked contacts).",
    }
  }
  if (ultimo("Marcado como spam")) {
    return { nivel: "problema", texto: "A pessoa marcou um e-mail nosso como spam; os próximos tendem a ir direto para lá. Peça para procurar no Spam e marcar como \"não é spam\"." }
  }
  const entregue = ultimo("Entregue")
  if (entregue) {
    return {
      nivel: "atencao",
      texto: `Entregue ao servidor do destinatário em ${new Date(entregue.quando).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}. Está na caixa da pessoa: Spam, Lixo eletrônico ou, no Gmail, Promoções e Atualizações. E-mail de empresa pode reter em quarentena.`,
    }
  }
  if (ultimo("Recusado temporariamente") || ultimo("Adiado")) {
    return { nivel: "atencao", texto: "O servidor do destinatário está recusando por enquanto (caixa cheia ou filtro). A Brevo tenta de novo; se persistir, use outro e-mail." }
  }
  if (d.codigoPendenteDesde || d.pedidoOposicao) {
    return d.eventos === null
      ? { nivel: "atencao", texto: "Há pedido de código, mas a Brevo não pôde ser consultada para saber se saiu." }
      : { nivel: "problema", texto: "Há pedido de código, mas a Brevo não registrou envio para este endereço nos últimos 30 dias. Confira o endereço e peça de novo." }
  }
  return { nivel: "ok", texto: "Nenhum pedido de código pendente nem envio recente para este endereço." }
}

export async function diagnosticarAcesso(bruto: string): Promise<DiagnosticoAcesso | { erro: string }> {
  const valor = bruto.trim()
  const ehEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(valor)
  const cpf = ehEmail ? null : limparCpf(valor)
  if (!ehEmail && !(cpf && validarCpf(cpf))) return { erro: "Informe um CPF válido ou um e-mail." }
  const empId = await tenantAtual()
  const admin = await createAdminClient()

  // CPF: de onde vêm os e-mails. E-mail: a pessoa por trás dele, se houver.
  let cpfAlvo = cpf
  if (ehEmail) {
    // ilike para ignorar maiúsculas; "_" e "%" do endereço escapados (no .or,
    // entre aspas, para a pontuação do e-mail não quebrar a sintaxe — ali o
    // "_" fica curinga, o que no pior caso acha o mesmo endereço).
    const minusculo = valor.toLowerCase()
    const email = minusculo.replace(/[\\%_]/g, (c) => `\\${c}`)
    const aspas = `"${minusculo.replace(/"/g, "")}"`
    const [{ data: fil }, { data: nf }] = await Promise.all([
      admin
        .from("filiacoes")
        .select("cpf")
        .eq("emp_proprietaria_id", empId)
        .or(`email_pessoal.ilike.${aspas},email_corporativo.ilike.${aspas}`)
        .limit(1),
      admin.from("portal_nao_filiado").select("cpf").eq("emp_proprietaria_id", empId).ilike("email", email).limit(1),
    ])
    cpfAlvo = cpfConfiavel(texto(fil?.[0]?.cpf) ?? texto(nf?.[0]?.cpf) ?? "")
  }

  const origens = new Map<string, Set<OrigemEmail>>()
  const anotar = (e: string | null | undefined, o: OrigemEmail) => {
    const k = (e ?? "").trim().toLowerCase()
    if (!k) return
    if (!origens.has(k)) origens.set(k, new Set())
    origens.get(k)!.add(o)
  }
  if (ehEmail) anotar(valor, "informado na busca")

  let pessoa: DiagnosticoAcesso["pessoa"] = null
  let conta: DiagnosticoAcesso["conta"] = null
  let oposicoes: DiagnosticoAcesso["oposicoes"] = []
  if (cpfAlvo) {
    const [filiado, { data: nf }, { data: ident }, { data: ops }] = await Promise.all([
      buscarFiliadoPorCpf(cpfAlvo),
      admin.from("portal_nao_filiado").select("nome, email").eq("emp_proprietaria_id", empId).in("cpf", grafiasDoCpf(cpfAlvo)).limit(1),
      admin.from("auth_identidades").select("auth_user_id, tipo").eq("emp_proprietaria_id", empId).eq("cpf", cpfAlvo).limit(1),
      admin
        .from("oposicao_opositor")
        .select("id, situacao, protocolo, confirmado_em, campanha_id, oposicao_campanha(nome)")
        .eq("emp_proprietaria_id", empId)
        .in("cpf", grafiasDoCpf(cpfAlvo))
        .order("confirmado_em", { ascending: false, nullsFirst: false })
        .limit(10),
    ])
    for (const e of filiado?.emails ?? []) anotar(e, "cadastro de filiado")
    anotar(texto(nf?.[0]?.email), "cadastro de não filiado")
    pessoa = {
      nome: filiado?.nome_completo ?? texto(nf?.[0]?.nome),
      filiado: Boolean(filiado),
      ativo: Boolean(filiado?.ativo),
      naoFiliado: Boolean(nf?.length),
    }
    const authId = texto(ident?.[0]?.auth_user_id)
    if (authId) {
      const c = await contaDeAcesso(authId)
      conta = { email: c?.email ?? null, ultimoAcesso: c?.ultimoAcesso ?? null, tipo: texto(ident?.[0]?.tipo) ?? "—" }
    }
    oposicoes = (ops ?? []).map((o) => {
      const camp = o.oposicao_campanha as { nome?: string } | { nome?: string }[] | null
      const nome = Array.isArray(camp) ? camp[0]?.nome : camp?.nome
      return {
        id: String(o.id),
        campanhaId: texto(o.campanha_id),
        campanha: nome ?? "—",
        situacao: String(o.situacao ?? "—"),
        protocolo: o.protocolo == null ? null : Number(o.protocolo),
        em: texto(o.confirmado_em),
      }
    })
  }

  const lista = [...origens.keys()].slice(0, 5)
  const { data: pendentes } = lista.length
    ? await admin
        .from("auth_vinculos_pendentes")
        .select("email, tipo, created_at")
        .eq("emp_proprietaria_id", empId)
        .in("email", lista)
        .order("created_at", { ascending: false })
    : { data: [] }
  let brevoIndisponivel: string | null = null
  const emails = await Promise.all(
    lista.map(async (email) => {
      const [pendente, brevo] = await Promise.all([codigoPendenteDoEmail(email), eventosBrevo(email)])
      if (brevo.erro) brevoIndisponivel = brevo.erro
      const pedido = (pendentes ?? []).find((p) => String(p.email).toLowerCase() === email)
      const base = {
        email,
        origens: [...(origens.get(email) ?? [])],
        codigoPendenteDesde: pendente,
        pedidoOposicao: pedido ? { tipo: String(pedido.tipo), em: String(pedido.created_at) } : null,
        eventos: brevo.eventos,
      }
      return { ...base, orientacao: orientar(base) }
    })
  )

  return {
    busca: { tipo: ehEmail ? "email" : "cpf", valor: ehEmail ? valor.toLowerCase() : (cpf as string) },
    pessoa,
    conta,
    emails,
    oposicoes,
    brevoIndisponivel,
  }
}
