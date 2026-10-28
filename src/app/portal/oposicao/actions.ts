"use server"

import { headers } from "next/headers"
import { redirect } from "next/navigation"

import type { User } from "@supabase/supabase-js"

import { destinoDaOposicao, garantirCadastroNaoFiliado, requireSessaoTrabalhador } from "@/lib/auth"
import { consumirVinculoPendente, registrarVinculoPendente } from "@/lib/auth-identidade"
import {
  buscarFiliadoPorCpf,
  mascararEmail,
  type EstadoForm,
} from "@/lib/contas"
import { limparCpf, validarCpf } from "@/lib/cpf"
import { hojeSP } from "@/lib/db/comum"
import {
  avisarOposicaoRegistrada,
  minhaOposicao,
  obterCampanhaPublica,
  registrarDesistencia,
  registrarOposicao,
  subirDocumentoAssinado,
  opcoesFontes,
  vinculosAtivos,
} from "@/lib/db/oposicao"
import { estadoPrazo, exigeDocumento } from "@/lib/oposicao-constantes"
import { diagnosticarCodigoRecusado, emailDoCodigo } from "@/lib/auth-diagnostico"
import { textoValidade } from "@/lib/auth-email-constantes"
import { createClient } from "@/lib/supabase/server"
import { exigirHumano } from "@/lib/turnstile"

function texto(fd: FormData, campo: string): string {
  return String(fd.get(campo) ?? "").trim()
}

/**
 * "Não é você? Sair" e o "Sair" da tela do trabalhador: encerra a sessão e
 * volta à entrada da Oposição — a do portal (/portal) é só para filiados.
 */
export async function sairDaOposicao(): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect("/portal/oposicao")
}

/** IP e user-agent da requisição, para a trilha de auditoria. */
async function rastro(): Promise<{ ip: string | null; ua: string | null }> {
  const h = await headers()
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    null
  return { ip, ua: h.get("user-agent") }
}

// ── Acesso por CÓDIGO no e-mail (OTP), espelhando o /votar ───────────────────
// Filiado: identifica-se pelo CPF (o código vai aos e-mails do cadastro).
// Trabalhador não-filiado: informa nome, CPF e e-mail (o código vai a esse
// e-mail). O e-mail é verificado pelo OTP; o CPF é a autodeclaração do opositor.
//
// Onda 1 da avaliação da oposição (27/10/2026):
//  - o e-mail leva SÓ o código (semLink): o robô do filtro da empresa não
//    gasta mais o acesso abrindo o link antes da pessoa (A2);
//  - as respostas não dizem se um CPF é de filiado (A7) — filiação sindical é
//    dado sensível. A aba do filiado responde igual para qualquer CPF válido;
//    a do trabalhador não recusa filiado antes do código;
//  - o código vai a TODOS os e-mails do cadastro do filiado, não só ao
//    primeiro (A5);
//  - o desfiliado também recebe pela aba do filiado e entra como trabalhador
//    (A4, ver getSessaoTrabalhador);
//  - o e-mail do trabalhador é conferido como na votação (A9).

/** Até quantos e-mails do cadastro recebem o código do filiado. */
const MAX_EMAILS_FILIADO = 3

const CONTEXTO_CODIGO = "Use o código abaixo para registrar a sua oposição à contribuição."

/**
 * Estado da aba do trabalhador: além de erro/ok, a conferência do e-mail.
 * `sugestao` = parece erro de digitação; `alerta` = domínio que costuma
 * barrar as nossas mensagens (empresa), com a opção de seguir mesmo assim.
 */
export type EstadoAcessoOposicao = EstadoForm & {
  sugestao?: { email: string; digitado: string }
  alerta?: { email: string; texto: string }
  /** O e-mail para o qual o código foi (a tela mostra a dica da caixa). */
  email?: string
}

/** Filiado pede o código: CPF → e-mails do cadastro. Resposta igual para qualquer CPF. */
export async function enviarCodigoFiliado(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  const cpf = limparCpf(texto(fd, "cpf"))
  if (!validarCpf(cpf)) return { erro: "CPF inválido." }
  const erroHumano = await exigirHumano(fd)
  if (erroHumano) return { erro: erroHumano }
  const neutra = {
    ok: "Se este CPF tiver cadastro de filiado com e-mail, o código foi enviado para o e-mail do cadastro (o pessoal e, se houver, o da empresa).",
  }
  const filiado = await buscarFiliadoPorCpf(cpf)
  // Ativo ou não: o desfiliado entra e segue como trabalhador. Sem cadastro
  // ou sem e-mail, nada é enviado — e a tela não diz isso.
  const emails = (filiado?.emails ?? []).slice(0, MAX_EMAILS_FILIADO)
  if (emails.length === 0) return neutra
  const { enviarCodigoAcesso } = await import("@/lib/codigo-acesso")
  for (const email of emails) {
    // Cada e-mail é uma conta; o vínculo pendente (e-mail ↔ CPF) vira a
    // identidade só depois de o código daquele e-mail ser conferido.
    await registrarVinculoPendente({ email, tipo: "filiado", cpf })
    const { erro } = await enviarCodigoAcesso({
      email,
      metadata: { tipo: "filiado" },
      next: "/portal/oposicao",
      contexto: CONTEXTO_CODIGO,
      semLink: true,
    })
    if (erro) console.warn("[oposicao] código do filiado não enviado a um dos e-mails:", erro)
  }
  return neutra
}

export async function confirmarCodigoFiliado(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  const cpf = limparCpf(texto(fd, "cpf"))
  const token = texto(fd, "token")
  if (!/^\d{6,10}$/.test(token)) return { erro: "Código inválido." }
  const filiado = validarCpf(cpf) ? await buscarFiliadoPorCpf(cpf) : null
  const emails = (filiado?.emails ?? []).slice(0, MAX_EMAILS_FILIADO)
  // CPF sem cadastro: a mesma mensagem de código errado (A7).
  if (emails.length === 0) {
    return { erro: `Código inválido ou expirado. Os códigos valem ${textoValidade()}; se precisar, peça um novo.` }
  }
  const supabase = await createClient()
  // Em qual dos e-mails está este código? Sem o diagnóstico, tenta um a um.
  const certo = await emailDoCodigo(emails, token)
  const tentativas = certo ? [certo] : emails
  let usuario: User | null = null
  let ultimoErro: Parameters<typeof diagnosticarCodigoRecusado>[0]["erro"] = null
  for (const email of tentativas) {
    const r = await supabase.auth.verifyOtp({ email, token, type: "email" })
    if (!r.error && r.data.user) {
      usuario = r.data.user
      break
    }
    ultimoErro = r.error
  }
  if (!usuario) {
    return {
      erro: await diagnosticarCodigoRecusado({
        erro: ultimoErro,
        email: tentativas[0],
        token,
        fluxo: "oposicao_filiado",
      }),
    }
  }
  const vinculo = await consumirVinculoPendente({
    userId: usuario.id,
    emailVerificado: usuario.email,
  })
  if (vinculo.erro) {
    await supabase.auth.signOut()
    return { erro: vinculo.erro }
  }
  redirect(destinoDaOposicao(texto(fd, "voltar")))
}

/**
 * Conferência do e-mail digitado, antes do "sou humano" (que vale uma vez
 * só): domínio que não recebe e-mail, erro de digitação e domínio de empresa
 * que costuma barrar as nossas mensagens. Null = pode mandar.
 */
async function conferirEmail(email: string, forcar: boolean): Promise<EstadoAcessoOposicao | null> {
  const [{ dominioRecebeEmail, dominiosCorporativosAbertos, PROVEDORES_PESSOAIS, sugerirDominio }, { situacaoDoDominio }] =
    await Promise.all([import("@/lib/db/votacao-link-unico"), import("@/lib/db/votacao-teste-entrega")])
  const [usuario, dominio] = email.split("@")
  const corporativos = await dominiosCorporativosAbertos()
  const sugerido = sugerirDominio(dominio, [...PROVEDORES_PESSOAIS, ...corporativos])
  if (!(await dominioRecebeEmail(dominio))) {
    return sugerido
      ? { erro: `O endereço “${dominio}” não recebe e-mails.`, sugestao: { email: `${usuario}@${sugerido}`, digitado: email } }
      : { erro: `O endereço “${dominio}” não recebe e-mails. Confira o que foi digitado depois do @.` }
  }
  if (forcar) return null
  if (sugerido) return { sugestao: { email: `${usuario}@${sugerido}`, digitado: email } }
  if (PROVEDORES_PESSOAIS.includes(dominio)) return null
  if ((await situacaoDoDominio(dominio)) === "nao_chega") {
    return {
      alerta: {
        email,
        texto: `As nossas mensagens costumam ser barradas pelo filtro de “${dominio}”. Use um e-mail pessoal (Gmail, por exemplo) — ou siga com este, sabendo que o código pode não chegar.`,
      },
    }
  }
  if (corporativos.has(dominio)) {
    return {
      alerta: {
        email,
        texto: `“${dominio}” parece ser e-mail de empresa, e filtros de empresa costumam reter o código. Prefira um e-mail pessoal — ou siga com este.`,
      },
    }
  }
  return null
}

/** Trabalhador não-filiado pede o código: nome + CPF + e-mail. */
export async function enviarCodigoTrabalhador(
  _prev: EstadoAcessoOposicao,
  fd: FormData
): Promise<EstadoAcessoOposicao> {
  const cpf = limparCpf(texto(fd, "cpf"))
  const nome = texto(fd, "nome")
  const email = texto(fd, "email").toLowerCase()
  if (!validarCpf(cpf)) return { erro: "CPF inválido." }
  if (!nome) return { erro: "Informe seu nome completo." }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { erro: "Informe um e-mail válido." }
  }
  const conferencia = await conferirEmail(email, texto(fd, "forcar") === "1")
  if (conferencia) return conferencia
  const erroHumano = await exigirHumano(fd)
  if (erroHumano) return { erro: erroHumano }
  // Nada aqui diz se o CPF é de filiado (A7). Filiado que usa um e-mail do
  // cadastro entra como filiado; com outro e-mail, a recusa vem só depois do
  // código, sem afirmar a filiação (lib/auth-identidade.ts).
  // CPF e nome (autodeclarados, como sempre) ficam como vínculo PENDENTE do
  // e-mail e só viram identidade da conta depois de o código ser conferido.
  // Conta existente não tem nada mexido neste ponto (achado S2).
  await registrarVinculoPendente({ email, tipo: "nao_filiado", cpf, nome })
  const { enviarCodigoAcesso } = await import("@/lib/codigo-acesso")
  const { erro } = await enviarCodigoAcesso({
    email,
    metadata: { tipo: "nao_filiado" },
    next: "/portal/oposicao",
    contexto: CONTEXTO_CODIGO,
    semLink: true,
  })
  if (erro) return { erro }
  return { ok: `Código enviado para ${mascararEmail(email)}.`, email }
}

export async function confirmarCodigoTrabalhador(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  const email = texto(fd, "email").toLowerCase()
  const token = texto(fd, "token")
  if (!/^\d{6,10}$/.test(token)) return { erro: "Código inválido." }

  const supabase = await createClient()
  const { data: verificado, error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: "email",
  })
  if (error || !verificado.user) return { erro: await diagnosticarCodigoRecusado({ erro: error, email, token, fluxo: "oposicao_trabalhador" }) }

  // Código conferido: o vínculo pendente (registrado quando o código foi
  // pedido) vira a identidade da conta. CPF e nome vêm DELE, não do
  // formulário desta etapa; a conta já vinculada a outro CPF é recusada.
  const vinculo = await consumirVinculoPendente({
    userId: verificado.user.id,
    emailVerificado: verificado.user.email,
  })
  if (vinculo.erro) {
    await supabase.auth.signOut()
    return { erro: vinculo.erro }
  }
  if (!vinculo.identidade) {
    await supabase.auth.signOut()
    return { erro: "O pedido do código expirou. Peça um novo código." }
  }
  if (vinculo.identidade.tipo === "filiado") redirect(destinoDaOposicao(texto(fd, "voltar")))

  // Cadastro do trabalhador — pelo CPF da IDENTIDADE da conta; o nome e o
  // e-mail informados agora prevalecem.
  const cadastro = await garantirCadastroNaoFiliado({
    cpf: vinculo.identidade.cpf,
    nome: vinculo.identidade.nome ?? texto(fd, "nome"),
    email,
    atualizar: true,
  })
  if (!cadastro) return { erro: "Não foi possível concluir o seu acesso. Tente de novo." }
  redirect(destinoDaOposicao(texto(fd, "voltar")))
}

// ── Fluxo da oposição ────────────────────────────────────────────────────────

async function campanhaNoPrazo(
  campanhaId: string
): Promise<
  | { erro: string }
  | { campanha: NonNullable<Awaited<ReturnType<typeof obterCampanhaPublica>>> }
> {
  const campanha = await obterCampanhaPublica(campanhaId)
  if (!campanha || campanha.situacao !== "aberta") {
    return { erro: "Campanha indisponível." }
  }
  if (estadoPrazo(campanha.prazo_inicio, campanha.prazo_fim, hojeSP()) !== "aberto") {
    return { erro: "Fora do prazo desta campanha." }
  }
  return { campanha }
}

export async function confirmarOposicao(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  const sessao = await requireSessaoTrabalhador()
  const campanhaId = texto(fd, "campanha_id")

  const r = await campanhaNoPrazo(campanhaId)
  if ("erro" in r) return { erro: r.erro }
  const campanha = r.campanha

  if (texto(fd, "declaracao") !== "on") {
    return { erro: "Marque a confirmação da oposição para prosseguir." }
  }
  // A fonte vem de um <select>, mas o valor é do navegador (A144): só vale
  // uma fonte DESTA campanha — editar a página não registra a oposição numa
  // empresa onde a pessoa não trabalha (a entidade envia as listas por fonte).
  let empregadorId: string | null = texto(fd, "empregador_id") || null
  if (campanha.fontes.length) {
    if (!empregadorId) return { erro: "Selecione sua fonte pagadora." }
    if (!campanha.fontes.some((f) => f.id === empregadorId)) {
      return { erro: "Selecione uma fonte pagadora desta campanha." }
    }
  } else if (empregadorId) {
    // Campanha sem fontes marcadas: o filiado escolhe entre os vínculos ativos
    // do cadastro (A103), para a carta não sair com a fonte em branco. Fora
    // deles, nada é gravado.
    // O não filiado escolhe entre as fontes da entidade (M5). Fora das
    // opções oferecidas, nada é gravado.
    const permitidas =
      sessao.perfil === "filiado"
        ? (await vinculosAtivos(sessao.cpf)).map((v) => v.fonteId)
        : (await opcoesFontes()).map((f) => f.id)
    if (!permitidas.includes(empregadorId)) empregadorId = null
  }

  const respostas = campanha.perguntas.map((p) => ({
    perguntaId: p.id,
    resposta: texto(fd, `pergunta_${p.id}`),
  }))
  const exigeDoc = exigeDocumento(
    campanha.modo_formalizacao,
    sessao.perfil === "filiado"
  )
  const { ip, ua } = await rastro()

  const { id, protocolo, confirmadoEm, erro } = await registrarOposicao(
    {
      campanhaId,
      cpf: sessao.cpf,
      nome: sessao.nome,
      email: sessao.email,
      perfil: sessao.perfil,
      filiacaoId: sessao.perfil === "filiado" ? sessao.refId : null,
      empregadorId,
      matricula: texto(fd, "matricula").slice(0, 40) || null,
      respostas,
      ip,
      userAgent: ua,
    },
    exigeDoc
  )
  if (erro || !id) return { erro: erro ?? "Falha ao registrar." }
  // Comprovante por e-mail (A16), depois da resposta: o filiado também no
  // sino; o não filiado, no e-mail que confirmou com o código.
  avisarOposicaoRegistrada({
    opositorId: id,
    protocolo: protocolo ?? null,
    confirmadoEm: confirmadoEm ?? new Date().toISOString(),
    campanhaNome: campanha.nome,
    prazoFim: campanha.prazo_fim,
    exigeDocumento: exigeDoc,
    pessoa: {
      cpf: sessao.cpf,
      nome: sessao.nome,
      email: sessao.email,
      filiado: sessao.perfil === "filiado",
    },
  })
  // ?registrada=1: o comprovante mostra, uma vez, o vídeo de agradecimento.
  redirect(`/portal/oposicao/comprovante/${id}?registrada=1`)
}

/** "Não quero me opor" — dentro do prazo, a pessoa ainda pode voltar e se opor. */
export async function desistir(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  const sessao = await requireSessaoTrabalhador()
  const campanhaId = texto(fd, "campanha_id")
  // Mesma guarda da confirmação (A143): campanha deste tenant, aberta e no
  // prazo. O CPF é o da sessão, nunca o do formulário.
  const r = await campanhaNoPrazo(campanhaId)
  if ("erro" in r) return { erro: r.erro }
  const { ip, ua } = await rastro()
  const { erro } = await registrarDesistencia(
    campanhaId,
    {
      cpf: sessao.cpf,
      nome: sessao.nome,
      email: sessao.email,
      perfil: sessao.perfil,
      filiacaoId: sessao.perfil === "filiado" ? sessao.refId : null,
    },
    ip,
    ua
  )
  if (erro) return { erro }
  redirect("/portal/oposicao?desistiu=1")
}

export async function enviarDocumento(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  const sessao = await requireSessaoTrabalhador()
  const opositorId = texto(fd, "opositor_id")
  const arquivo = fd.get("documento")
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { erro: "Anexe o PDF assinado." }
  }
  const oposicao = await minhaOposicao(texto(fd, "campanha_id"), sessao.cpf)
  if (!oposicao || oposicao.id !== opositorId) {
    return { erro: "Oposição não encontrada." }
  }
  // Quem optou por não se opor registra a oposição antes; o documento sozinho
  // não pode virar uma oposição "não avaliada".
  if (oposicao.situacao === "desistente") {
    return { erro: "Registre a oposição antes de enviar o documento." }
  }
  const { ip, ua } = await rastro()
  // A primeira carta e a troca do arquivo (em análise, no prazo) passam pela
  // mesma função, que decide o que é aceito (A53).
  const { erro } = await subirDocumentoAssinado(
    opositorId,
    sessao.cpf,
    arquivo,
    ip,
    ua
  )
  if (erro) return { erro }
  // O comprovante mostra o resultado da conferência da assinatura e o link
  // para o PDF enviado — lidos do que acabou de ser gravado.
  redirect(`/portal/oposicao/comprovante/${opositorId}`)
}
