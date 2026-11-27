import "server-only"

/**
 * Chamadas aos provedores de e-mail (Brevo e Resend): o envio de uma mensagem,
 * o teste de uma chave de API e a lista de domínios da conta. Servem à conta
 * da plataforma e à conta própria da entidade (Gestão › E-mail, fase 4).
 */

export type Provedor = "brevo" | "resend"

export type Credencial = { provedor: Provedor; chave: string }

export type Mensagem = {
  remetente: { email: string; nome: string }
  responderPara: { email: string; nome: string } | null
  para: { email: string; nome?: string | null }
  assunto: string
  html: string
  cabecalhos: Record<string, string>
  anexos: { nome: string; base64: string }[]
  /** Brevo: aceita e descarta, sem entregar (EMAIL_SANDBOX=1). */
  sandbox: boolean
}

export type Resultado = { ok: boolean; status: number | null; erro: string | null }

/** 401/403: a chave foi recusada (revogada, errada ou sem permissão). */
export function chaveRecusada(r: Resultado): boolean {
  return r.status === 401 || r.status === 403
}

const NOME = { brevo: "Brevo", resend: "Resend" } as const

export async function entregar(c: Credencial, m: Mensagem): Promise<Resultado> {
  try {
    const resposta =
      c.provedor === "resend"
        ? await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { Authorization: `Bearer ${c.chave}`, "Content-Type": "application/json" },
            body: JSON.stringify({
              from: `${m.remetente.nome} <${m.remetente.email}>`,
              to: [m.para.email],
              subject: m.assunto,
              html: m.html,
              ...(m.responderPara ? { reply_to: m.responderPara.email } : {}),
              ...(Object.keys(m.cabecalhos).length ? { headers: m.cabecalhos } : {}),
              ...(m.anexos.length ? { attachments: m.anexos.map((a) => ({ filename: a.nome, content: a.base64 })) } : {}),
            }),
          })
        : await fetch("https://api.brevo.com/v3/smtp/email", {
            method: "POST",
            headers: { "api-key": c.chave, "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({
              sender: { email: m.remetente.email, name: m.remetente.nome },
              to: [{ email: m.para.email, name: m.para.nome ?? undefined }],
              ...(m.responderPara ? { replyTo: { email: m.responderPara.email, name: m.responderPara.nome } } : {}),
              subject: m.assunto,
              htmlContent: m.html,
              ...(m.anexos.length ? { attachment: m.anexos.map((a) => ({ name: a.nome, content: a.base64 })) } : {}),
              ...(m.sandbox || Object.keys(m.cabecalhos).length
                ? { headers: { ...m.cabecalhos, ...(m.sandbox ? { "X-Sib-Sandbox": "drop" } : {}) } }
                : {}),
            }),
          })
    return resposta.ok
      ? { ok: true, status: resposta.status, erro: null }
      : { ok: false, status: resposta.status, erro: `${NOME[c.provedor]} recusou (HTTP ${resposta.status})` }
  } catch {
    return { ok: false, status: null, erro: `Falha de rede ao falar com o ${NOME[c.provedor]}` }
  }
}

export type DominioConta = { nome: string; verificado: boolean }

/**
 * Testa a chave e lista os domínios da conta. Brevo: GET /v3/account e
 * /v3/senders/domains. Resend: GET /domains (a chave precisa de acesso total —
 * a "só envio" não lista domínios).
 */
export async function testarConta(c: Credencial): Promise<{ erro: string | null; dominios: DominioConta[]; remetentes: string[] }> {
  try {
    if (c.provedor === "brevo") {
      const h = { "api-key": c.chave, Accept: "application/json" }
      const conta = await fetch("https://api.brevo.com/v3/account", { headers: h })
      if (conta.status === 401 || conta.status === 403) return { erro: "O Brevo recusou a chave (inválida, revogada ou sem permissão).", dominios: [], remetentes: [] }
      if (!conta.ok) return { erro: `O Brevo não respondeu ao teste (HTTP ${conta.status}).`, dominios: [], remetentes: [] }
      const [d, s] = await Promise.all([
        fetch("https://api.brevo.com/v3/senders/domains", { headers: h }),
        fetch("https://api.brevo.com/v3/senders", { headers: h }),
      ])
      const corpo = d.ok ? ((await d.json()) as { domains?: { domain_name?: string; authenticated?: boolean; verified?: boolean }[] }) : {}
      const sends = s.ok ? ((await s.json()) as { senders?: { email?: string; active?: boolean }[] }) : {}
      return {
        erro: null,
        // Remetentes avulsos já validados na conta (sem domínio autenticado).
        remetentes: (sends.senders ?? []).filter((x) => x.email && x.active !== false).map((x) => String(x.email).toLowerCase()),
        dominios: (corpo.domains ?? [])
          .filter((x) => x.domain_name)
          .map((x) => ({ nome: String(x.domain_name).toLowerCase(), verificado: Boolean(x.authenticated || x.verified) })),
      }
    }
    const r = await fetch("https://api.resend.com/domains", { headers: { Authorization: `Bearer ${c.chave}` } })
    if (r.status === 401 || r.status === 403) {
      const texto = await r.text().catch(() => "")
      return {
        erro: /restricted/i.test(texto)
          ? "A chave do Resend é só de envio: crie uma com acesso total (Full access) para o sistema conferir os domínios."
          : "O Resend recusou a chave (inválida ou revogada).",
        dominios: [],
        remetentes: [],
      }
    }
    if (!r.ok) return { erro: `O Resend não respondeu ao teste (HTTP ${r.status}).`, dominios: [], remetentes: [] }
    const corpo = (await r.json()) as { data?: { name?: string; status?: string }[] }
    return {
      erro: null,
      remetentes: [],
      dominios: (corpo.data ?? []).filter((x) => x.name).map((x) => ({ nome: String(x.name).toLowerCase(), verificado: x.status === "verified" })),
    }
  } catch {
    return { erro: `Falha de rede ao falar com o ${NOME[c.provedor]}.`, dominios: [], remetentes: [] }
  }
}
