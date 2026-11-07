import "server-only"

import { randomUUID } from "node:crypto"

import { mascararEmailMedio } from "@/lib/contas"
import { grafiasDoCpf } from "@/lib/cpf"
import { texto } from "@/lib/db/comum"
import { registrarEventoFicha } from "@/lib/db/filiacao-publica"
import { enviarEmail } from "@/lib/email"
import { botaoEmail, paragrafo, tituloEmail } from "@/lib/email-layout"
import {
  VALIDADE_LINK_DIAS,
  faltaNoPasso,
  mesmoNascimento,
  primeiroPassoIncompleto,
  type DadosFicha,
} from "@/lib/ficha-filiacao"
import { bloqueioAtivo, limparFalhasLogin, registrarFalhaLogin } from "@/lib/login-bloqueio"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"
import { origemAtual } from "@/lib/tenant-url"

/**
 * Ficha de filiação online, começando pelo CPF (07/11/2026).
 *
 *  1. CPF + nascimento. Cadastro com o CPF E o mesmo nascimento → o link vai
 *     para o e-mail do cadastro (mascarado na tela). Senão → a pessoa informa
 *     um e-mail. A resposta da tela é a mesma para "não existe" e "nascimento
 *     não bate": o CPF sozinho não revela quem está na base.
 *  2. O link do e-mail (`/ficha/<token>`) confirma o e-mail e abre a ficha
 *     na aba nova. Pelo e-mail do cadastro, os dados vêm preenchidos; por outro
 *     e-mail ("não tenho mais acesso"), a ficha começa vazia — quem só sabe CPF e
 *     nascimento não pode ler endereço e telefone de ninguém — e a identidade é
 *     conferida na avaliação pela assinatura gov.br.
 *  3. Na aprovação (filiacao-publica.ts), o cadastro do CPF é ATUALIZADO e
 *     ganha um vínculo novo; só sem cadastro é que nasce outro.
 */

const SITUACOES_ABERTAS = ["aguardando_verificacao", "em_preenchimento", "aguardando_assinatura", "nao_avaliada"]

type Admin = Awaited<ReturnType<typeof createAdminClient>>

export type CadastroDoCpf = {
  id: string
  nome: string | null
  nascimento: string | null
  email: string | null
  condicao: string | null
  vinculoAberto: boolean
}

/** O cadastro do CPF (não excluído). Com mais de um, o Ativo; depois o mais novo. */
export async function cadastroDoCpf(cpf: string, admin?: Admin): Promise<CadastroDoCpf | null> {
  const db = admin ?? (await createAdminClient())
  const emp = await tenantAtual()
  const { data } = await db
    .from("filiacoes")
    .select("id, nome_completo, nascimento_data, email_pessoal, email_corporativo, filiacao_condicao, created_at")
    .eq("emp_proprietaria_id", emp)
    .in("cpf", grafiasDoCpf(cpf))
    .not("filiacao_excluida", "is", true)
  const lista = (data ?? []).sort(
    (a, b) =>
      Number(b.filiacao_condicao === "Ativo") - Number(a.filiacao_condicao === "Ativo") ||
      String(b.created_at ?? "").localeCompare(String(a.created_at ?? ""))
  )
  const f = lista[0]
  if (!f) return null
  const { count } = await db
    .from("filiacao_vinculos")
    .select("id", { count: "exact", head: true })
    .eq("emp_proprietaria_id", emp)
    .eq("filiado_id", f.id)
    .is("data_desfiliacao", null)
    .is("filiacao_data_saida", null)
  return {
    id: String(f.id),
    nome: texto(f.nome_completo),
    nascimento: texto(f.nascimento_data),
    email: texto(f.email_pessoal) ?? texto(f.email_corporativo),
    condicao: texto(f.filiacao_condicao),
    vinculoAberto: (count ?? 0) > 0,
  }
}

const expiraEm = () => new Date(Date.now() + VALIDADE_LINK_DIAS * 86_400_000).toISOString()

/** Manda (ou reenvia) o link da ficha. Sem serviço de e-mail, o link vai para o log. */
async function enviarLink(email: string, nome: string | null, token: string): Promise<void> {
  const link = `${await origemAtual()}/ficha/${token}`
  const html =
    tituloEmail("Continue a sua filiação") +
    paragrafo(`Olá${nome ? `, ${nome.split(" ")[0]}` : ""}! Toque no botão abaixo para continuar a sua ficha de filiação.`) +
    botaoEmail(link, "Continuar minha filiação") +
    paragrafo(
      `O link vale por ${VALIDADE_LINK_DIAS} dias e leva de volta ao ponto onde você parou. Se não foi você quem pediu, ignore este e-mail.`
    )
  const enviado = await enviarEmail({ email, nome, assunto: "Continue a sua filiação", html })
  if (!enviado) console.info(`[filiar] link da ficha (e-mail não enviado): ${link}`)
}

async function criarFicha(
  admin: Admin,
  dados: {
    cpf: string
    nascimento: string
    email: string
    caminho: "cadastro" | "outro_email" | "novo"
    cadastroId: string | null
    nome: string | null
    ip: string | null
    ua: string | null
  }
): Promise<{ id: string; token: string } | { erro: string }> {
  const token = randomUUID()
  const { data, error } = await admin
    .from("filiacao_solicitacoes")
    .insert({
      token,
      cpf: dados.cpf,
      nascimento_data: dados.nascimento,
      email: dados.email,
      caminho: dados.caminho,
      cadastro_existente_id: dados.cadastroId,
      situacao: "aguardando_verificacao",
      link_expira_em: expiraEm(),
      ip: dados.ip,
      user_agent: dados.ua,
      emp_proprietaria_id: await tenantAtual(),
    })
    .select("id")
    .single()
  if (error || !data) return { erro: `Não foi possível começar a ficha: ${error?.message ?? "?"}` }
  await registrarEventoFicha(String(data.id), "ficha_iniciada", `caminho=${dados.caminho}`, dados.ip, dados.ua)
  await enviarLink(dados.email, dados.nome, token)
  return { id: String(data.id), token }
}

export type InicioPeloCpf =
  | { tipo: "link_enviado"; fichaId: string; emailMascarado: string; emAndamento: boolean }
  | { tipo: "ja_filiado"; nome: string | null }
  | { tipo: "pedir_email"; semEmailNoCadastro: boolean }
  | { tipo: "erro"; erro: string }

/** Passo 1: CPF + nascimento. */
export async function iniciarPeloCpf(p: {
  cpf: string
  nascimento: string
  ip: string | null
  ua: string | null
}): Promise<InicioPeloCpf> {
  const chave = `filiar:${p.cpf}`
  const bloqueio = await bloqueioAtivo(chave)
  if (bloqueio) return { tipo: "erro", erro: bloqueio }
  const admin = await createAdminClient()
  const emp = await tenantAtual()

  // Ficha em andamento deste CPF, com o mesmo nascimento: reenvia o link dela.
  const { data: abertas } = await admin
    .from("filiacao_solicitacoes")
    .select("id, token, email, nome_completo, nascimento_data, situacao")
    .eq("emp_proprietaria_id", emp)
    .eq("cpf", p.cpf)
    .in("situacao", SITUACOES_ABERTAS)
    .order("created_at", { ascending: false })
    .limit(1)
  const aberta = abertas?.[0]
  if (aberta && mesmoNascimento(p.nascimento, texto(aberta.nascimento_data)) && texto(aberta.email)) {
    if (["aguardando_verificacao", "em_preenchimento"].includes(String(aberta.situacao))) {
      await admin.from("filiacao_solicitacoes").update({ link_expira_em: expiraEm() }).eq("id", aberta.id)
    }
    await enviarLink(String(aberta.email), texto(aberta.nome_completo), String(aberta.token))
    await registrarEventoFicha(String(aberta.id), "link_reenviado", "pelo CPF", p.ip, p.ua)
    await limparFalhasLogin(chave)
    return { tipo: "link_enviado", fichaId: String(aberta.id), emailMascarado: mascararEmailMedio(String(aberta.email)), emAndamento: true }
  }

  const cadastro = await cadastroDoCpf(p.cpf, admin)
  if (!cadastro || !mesmoNascimento(p.nascimento, cadastro.nascimento)) {
    // Mesma resposta para "não existe" e "nascimento não bate".
    await registrarFalhaLogin(chave)
    return { tipo: "pedir_email", semEmailNoCadastro: false }
  }
  await limparFalhasLogin(chave)
  if (cadastro.condicao === "Ativo" && cadastro.vinculoAberto) return { tipo: "ja_filiado", nome: cadastro.nome }
  if (!cadastro.email) return { tipo: "pedir_email", semEmailNoCadastro: true }

  const r = await criarFicha(admin, {
    cpf: p.cpf,
    nascimento: p.nascimento,
    email: cadastro.email,
    caminho: "cadastro",
    cadastroId: cadastro.id,
    nome: cadastro.nome,
    ip: p.ip,
    ua: p.ua,
  })
  if ("erro" in r) return { tipo: "erro", erro: r.erro }
  return { tipo: "link_enviado", fichaId: r.id, emailMascarado: mascararEmailMedio(cadastro.email), emAndamento: false }
}

/**
 * Passo 1, com e-mail: quem não tem cadastro, quem tem mas o nascimento não
 * bateu, e a boia "não tenho mais acesso ao e-mail do cadastro". Uma ficha
 * aberta do CPF que ainda não foi concluída sai como desistência: a nova não
 * herda os dados dela.
 */
export async function iniciarComEmail(p: {
  cpf: string
  nascimento: string
  email: string
  ip: string | null
  ua: string | null
}): Promise<InicioPeloCpf> {
  const chave = `filiar:${p.cpf}`
  const bloqueio = await bloqueioAtivo(chave)
  if (bloqueio) return { tipo: "erro", erro: bloqueio }
  const admin = await createAdminClient()
  const emp = await tenantAtual()

  const { data: abertas } = await admin
    .from("filiacao_solicitacoes")
    .select("id, situacao")
    .eq("emp_proprietaria_id", emp)
    .eq("cpf", p.cpf)
    .in("situacao", SITUACOES_ABERTAS)
  for (const a of abertas ?? []) {
    if (["aguardando_assinatura", "nao_avaliada"].includes(String(a.situacao))) {
      return {
        tipo: "erro",
        erro: "Já existe uma ficha deste CPF concluída e esperando assinatura ou avaliação. Para mudar o e-mail dela, fale com o sindicato.",
      }
    }
  }
  for (const a of abertas ?? []) {
    await admin
      .from("filiacao_solicitacoes")
      .update({ situacao: "desistente", updated_at: new Date().toISOString() })
      .eq("id", a.id)
      .eq("emp_proprietaria_id", emp)
    await registrarEventoFicha(String(a.id), "substituida", "começou outra ficha com outro e-mail", p.ip, p.ua)
  }

  // O CPF pode ter cadastro (a aprovação o atualiza), mas a ficha não vem preenchida.
  const cadastro = await cadastroDoCpf(p.cpf, admin)
  const r = await criarFicha(admin, {
    cpf: p.cpf,
    nascimento: p.nascimento,
    email: p.email.trim().toLowerCase(),
    caminho: cadastro ? "outro_email" : "novo",
    cadastroId: cadastro?.id ?? null,
    nome: null,
    ip: p.ip,
    ua: p.ua,
  })
  if ("erro" in r) return { tipo: "erro", erro: r.erro }
  return { tipo: "link_enviado", fichaId: r.id, emailMascarado: mascararEmailMedio(p.email), emAndamento: false }
}

/** "Não recebi": reenvia para o mesmo e-mail (a tela só conhece o id). */
export async function reenviarLinkDaFicha(fichaId: string, ip: string | null, ua: string | null): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { data: s } = await admin
    .from("filiacao_solicitacoes")
    .select("id, token, email, nome_completo, situacao, updated_at")
    .eq("id", fichaId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (!s || !texto(s.email) || !SITUACOES_ABERTAS.includes(String(s.situacao))) {
    return { erro: "Não foi possível reenviar. Comece de novo pelo CPF." }
  }
  await admin
    .from("filiacao_solicitacoes")
    .update({ link_expira_em: expiraEm(), updated_at: new Date().toISOString() })
    .eq("id", s.id)
  await enviarLink(String(s.email), texto(s.nome_completo), String(s.token))
  await registrarEventoFicha(String(s.id), "link_reenviado", null, ip, ua)
  return {}
}

/** O painel reenvia o link (para quem parou no meio). */
export async function reenviarLinkPeloPainel(fichaId: string, usuarioId: string): Promise<{ erro?: string; email?: string }> {
  const r = await reenviarLinkDaFicha(fichaId, null, null)
  if (r.erro) return r
  const admin = await createAdminClient()
  const { data } = await admin.from("filiacao_solicitacoes").select("email").eq("id", fichaId).maybeSingle()
  await registrarEventoFicha(fichaId, "link_reenviado_pela_gestao", `usuario=${usuarioId}`, null, null)
  return { email: texto(data?.email) ?? undefined }
}

// ── O link do e-mail ────────────────────────────────────────────────────────

export type FichaAberta = {
  expirado: boolean
  situacao: string
}

/**
 * Abrir o link confirma o e-mail. Ficha ainda não concluída com o link vencido
 * não abre (a pessoa recomeça pelo CPF e recebe outro).
 */
export async function abrirPeloLink(token: string, ip: string | null, ua: string | null): Promise<FichaAberta | null> {
  const admin = await createAdminClient()
  const { data: s } = await admin
    .from("filiacao_solicitacoes")
    .select("id, situacao, link_expira_em, email_verificado_em")
    .eq("token", token)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (!s) return null
  const situacao = String(s.situacao)
  const preenchendo = ["aguardando_verificacao", "em_preenchimento"].includes(situacao)
  if (preenchendo && texto(s.link_expira_em) && new Date(String(s.link_expira_em)) < new Date()) {
    return { expirado: true, situacao }
  }
  if (situacao === "aguardando_verificacao") {
    await admin
      .from("filiacao_solicitacoes")
      .update({ situacao: "em_preenchimento", email_verificado_em: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", s.id)
    await registrarEventoFicha(String(s.id), "email_verificado", "pelo link do e-mail", ip, ua)
    return { expirado: false, situacao: "em_preenchimento" }
  }
  return { expirado: false, situacao }
}

export type UltimoVinculo = { fonteId: string; fonte: string | null; matricula: string | null; cargo: string | null; lotacao: string | null }

export type FichaParaPreencher = {
  id: string
  token: string
  caminho: "cadastro" | "outro_email" | "novo"
  passo: number
  cpf: string
  email: string
  dados: DadosFicha
  /** Só no caminho "cadastro": a fonte do último vínculo, para "continua lá?". */
  ultimoVinculo: UltimoVinculo | null
  mesmaFonte: boolean | null
}

const COLUNAS_FICHA = [
  "nome_completo",
  "nome_social",
  "sexo",
  "telefone_1",
  "telefone_2",
  "endereco_cep",
  "endereco_logradouro",
  "endereco_numero",
  "endereco_complemento",
  "endereco_bairro",
  "endereco_cidade",
  "endereco_estado",
  "empregador_id",
  "matricula",
  "cargo",
  "lotacao",
] as const

/**
 * A ficha em preenchimento. No caminho "cadastro" e antes do primeiro passo
 * salvo, os dados vêm do cadastro e do último vínculo; depois, do que a pessoa
 * já salvou.
 */
export async function fichaParaPreencher(token: string): Promise<FichaParaPreencher | null> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data: s } = await admin
    .from("filiacao_solicitacoes")
    .select("*")
    .eq("token", token)
    .eq("emp_proprietaria_id", emp)
    .maybeSingle()
  if (!s) return null
  const caminho = (texto(s.caminho) ?? "novo") as FichaParaPreencher["caminho"]
  const passo = Number(s.passo ?? 0)
  const dados: DadosFicha = {
    nascimento: texto(s.nascimento_data),
    telefone_1_whatsapp: s.telefone_1_whatsapp === true,
    sexo: texto(s.sexo) ?? (passo >= 1 ? "Prefiro não informar" : null),
  }
  for (const c of COLUNAS_FICHA) if (c !== "sexo") (dados as Record<string, unknown>)[c] = texto(s[c])

  let ultimoVinculo: UltimoVinculo | null = null
  const cadastroId = texto(s.cadastro_existente_id)
  if (caminho === "cadastro" && cadastroId) {
    const [{ data: f }, { data: vs }] = await Promise.all([
      admin.from("filiacoes").select("*").eq("id", cadastroId).eq("emp_proprietaria_id", emp).maybeSingle(),
      admin
        .from("filiacao_vinculos")
        .select("fonte_pagadora_id, matricula, cargo, lotacao, fonte_pg_cargo, fonte_pg_lotacao, data_filiacao, created_at")
        .eq("filiado_id", cadastroId)
        .eq("emp_proprietaria_id", emp)
        .not("fonte_pagadora_id", "is", null)
        .order("data_filiacao", { ascending: false, nullsFirst: false })
        .order("created_at", { ascending: false })
        .limit(1),
    ])
    const v = vs?.[0]
    if (v) {
      const { data: e } = await admin.from("empresa").select("nome_fantasia, nome_razao, empresa").eq("id", v.fonte_pagadora_id).maybeSingle()
      ultimoVinculo = {
        fonteId: String(v.fonte_pagadora_id),
        fonte: e ? (texto(e.empresa) ?? texto(e.nome_fantasia) ?? texto(e.nome_razao)) : null,
        matricula: texto(v.matricula),
        cargo: texto(v.cargo) ?? texto(v.fonte_pg_cargo),
        lotacao: texto(v.lotacao) ?? texto(v.fonte_pg_lotacao),
      }
    }
    if (f && passo === 0) {
      dados.nome_completo = texto(f.nome_completo)
      dados.nome_social = texto(f.nome_social)
      dados.nascimento = texto(f.nascimento_data) ?? dados.nascimento
      dados.sexo = texto(f.sexo)
      dados.telefone_1 = texto(f.telefone_1)
      dados.telefone_1_whatsapp = f.telefone_1_whatsapp === true
      dados.telefone_2 = texto(f.telefone_2)
      dados.endereco_cep = texto(f.endereco_cep)
      dados.endereco_logradouro = texto(f.endereco_logradouro)
      dados.endereco_numero = texto(f.endereco_numero)
      dados.endereco_complemento = texto(f.endereco_complemento)
      dados.endereco_bairro = texto(f.endereco_bairro)
      dados.endereco_cidade = texto(f.endereco_cidade)
      dados.endereco_estado = texto(f.endereco_estado)
    }
  }
  return {
    id: String(s.id),
    token: String(s.token),
    caminho,
    passo,
    cpf: String(s.cpf ?? ""),
    email: String(s.email ?? ""),
    dados,
    ultimoVinculo,
    mesmaFonte: typeof s.mesma_fonte === "boolean" ? s.mesma_fonte : null,
  }
}

/** Salva um passo (1 a 3). O servidor confere o que falta; nada é gravado pela metade. */
export async function salvarPassoDaFicha(
  token: string,
  passo: 1 | 2 | 3,
  dados: DadosFicha & { mesma_fonte?: boolean | null }
): Promise<{ erro?: string; campo?: string }> {
  const ficha = await fichaParaPreencher(token)
  if (!ficha) return { erro: "Ficha não encontrada." }
  const admin = await createAdminClient()
  const { data: s } = await admin.from("filiacao_solicitacoes").select("situacao, link_expira_em").eq("id", ficha.id).maybeSingle()
  if (s?.situacao !== "em_preenchimento") return { erro: "Esta ficha já foi concluída." }
  if (texto(s.link_expira_em) && new Date(String(s.link_expira_em)) < new Date()) {
    return { erro: "O link venceu. Comece de novo pelo CPF para receber outro." }
  }

  // No passo 3 do caminho "cadastro", "continuo na mesma empresa" fixa a fonte.
  if (passo === 3 && dados.mesma_fonte === true && ficha.ultimoVinculo) dados.empregador_id = ficha.ultimoVinculo.fonteId
  const falta = faltaNoPasso(passo, dados)
  if (falta) return { erro: falta.erro, campo: falta.campo }

  const so = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null)
  const digitos = (v: string | null | undefined) => (so(v) ? so(v)!.replace(/\D/g, "") : null)
  const patch: Record<string, unknown> =
    passo === 1
      ? {
          nome_completo: so(dados.nome_completo),
          nome_social: so(dados.nome_social),
          nascimento_data: dados.nascimento,
          sexo: dados.sexo === "Prefiro não informar" ? null : dados.sexo,
        }
      : passo === 2
        ? {
            telefone_1: digitos(dados.telefone_1),
            telefone_1_whatsapp: dados.telefone_1_whatsapp === true,
            telefone_2: digitos(dados.telefone_2),
            endereco_cep: digitos(dados.endereco_cep),
            endereco_logradouro: so(dados.endereco_logradouro),
            endereco_numero: so(dados.endereco_numero),
            endereco_complemento: so(dados.endereco_complemento),
            endereco_bairro: so(dados.endereco_bairro),
            endereco_cidade: so(dados.endereco_cidade),
            endereco_estado: so(dados.endereco_estado)?.toUpperCase(),
          }
        : {
            empregador_id: dados.empregador_id,
            matricula: so(dados.matricula),
            cargo: so(dados.cargo),
            lotacao: so(dados.lotacao),
            mesma_fonte: ficha.ultimoVinculo ? dados.mesma_fonte === true : null,
          }
  // Quem salva o passo 1 já respondeu o sexo, mesmo com "Prefiro não informar".
  const { error } = await admin
    .from("filiacao_solicitacoes")
    .update({ ...patch, passo: Math.max(ficha.passo, passo), updated_at: new Date().toISOString() })
    .eq("id", ficha.id)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: `Não foi possível salvar: ${error.message}` }
  return {}
}

/** Passo 4: autorizações. A ficha fica pronta para assinar no gov.br. */
export async function concluirFicha(
  token: string,
  termos: { lgpdId: string | null; descontoId: string | null },
  ip: string | null,
  ua: string | null
): Promise<{ erro?: string; passo?: number }> {
  const ficha = await fichaParaPreencher(token)
  if (!ficha) return { erro: "Ficha não encontrada." }
  const incompleto = primeiroPassoIncompleto(ficha.dados)
  if (incompleto || ficha.passo < 3) return { erro: "Falta preencher um passo anterior.", passo: incompleto ?? ficha.passo + 1 }
  const admin = await createAdminClient()
  const agora = new Date().toISOString()
  const { error } = await admin
    .from("filiacao_solicitacoes")
    .update({
      aceite_lgpd_data: agora,
      aceite_desconto_data: agora,
      tl_lgpd_id: termos.lgpdId,
      tl_desconto_id: termos.descontoId,
      situacao: "aguardando_assinatura",
      passo: 4,
      updated_at: agora,
    })
    .eq("id", ficha.id)
    .eq("situacao", "em_preenchimento")
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: `Não foi possível concluir: ${error.message}` }
  await registrarEventoFicha(ficha.id, "ficha_preenchida", null, ip, ua)
  return {}
}
