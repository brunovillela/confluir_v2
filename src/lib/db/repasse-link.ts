import "server-only"

import { randomBytes, randomUUID } from "node:crypto"

import { esquemaAusente, hojeSP } from "@/lib/db/comum"
import { emailContatoEntidade, nomeEntidade } from "@/lib/db/organizacao"
import { quadroRepasse, regrasRepasse, tiposControlados, unidadeRepasse, invalidarAvisosRepasse } from "@/lib/db/repasse"
import { enviarEmail } from "@/lib/email"
import { escaparHtml, paragrafo, tituloEmail } from "@/lib/email-layout"
import { formatarMoeda } from "@/lib/formato"
import {
  competenciaAplica,
  competenciaDoDia,
  competenciaValida,
  ehTipoContribuicao,
  regraEfetiva,
  rotuloCompetencia,
  somarMeses,
  type SituacaoEnvio,
  type TipoContribuicao,
} from "@/lib/repasse"
import { createAdminClient } from "@/lib/supabase/admin"
import { origemAtual } from "@/lib/tenant-url"
import { tenantAtual } from "@/lib/tenant"

/**
 * Link do RH da fonte pagadora (15/11/2026): cada empresa tem um endereço
 * próprio (/relacao/<token>), sem login, para mandar a relação de descontos
 * do mês (ou dizer que não houve desconto), ver as inclusões e exclusões que
 * o sindicato comunicou e confirmar que recebeu. Migração 20261115150821.
 */

export const BUCKET_RELACOES = "relacoes-desconto"
export const MAX_ARQUIVO_RELACAO = 25 * 1024 * 1024
const EXTENSOES = new Set(["pdf", "xlsx", "xls", "ods", "csv", "txt", "jpg", "jpeg", "png", "webp"])
/** Quantos meses para trás o RH pode mandar relação. */
const MESES_ENVIO = 12

export type LinkRh = {
  id: string
  token: string
  url: string
  criadoEm: string
  criadoPor: string | null
  ultimoAcessoEm: string | null
}

const novoToken = () => randomBytes(24).toString("base64url")

export async function linkDaEmpresa(empresaId: string): Promise<LinkRh | null> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("filiacao_repasse_links")
    .select("id, token, criado_em, criado_por, ultimo_acesso_em")
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("empresa_id", empresaId)
    .is("revogado_em", null)
    .maybeSingle()
  if (error) {
    if (esquemaAusente(error)) return null
    throw new Error(`Falha ao ler o link do RH: ${error.message}`)
  }
  if (!data) return null
  return {
    id: data.id,
    token: data.token,
    url: `${await origemAtual()}/relacao/${data.token}`,
    criadoEm: data.criado_em,
    criadoPor: data.criado_por,
    ultimoAcessoEm: data.ultimo_acesso_em,
  }
}

/** Gera o link da empresa; o anterior, se houver, deixa de funcionar. */
export async function gerarLink(empresaId: string, usuarioNome: string | null): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data: dono } = await admin.from("empresa").select("id").eq("id", empresaId).maybeSingle()
  if (!dono) return { erro: "Empresa não encontrada." }
  await admin
    .from("filiacao_repasse_links")
    .update({ revogado_em: new Date().toISOString(), revogado_por: usuarioNome })
    .eq("emp_proprietaria_id", emp)
    .eq("empresa_id", empresaId)
    .is("revogado_em", null)
  const { error } = await admin
    .from("filiacao_repasse_links")
    .insert({ emp_proprietaria_id: emp, empresa_id: empresaId, token: novoToken(), criado_por: usuarioNome })
  if (error) return { erro: esquemaAusente(error) ? "O link do RH ainda não está no banco." : `Não foi possível gerar o link: ${error.message}` }
  return {}
}

export async function revogarLink(empresaId: string, usuarioNome: string | null): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin
    .from("filiacao_repasse_links")
    .update({ revogado_em: new Date().toISOString(), revogado_por: usuarioNome })
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("empresa_id", empresaId)
    .is("revogado_em", null)
  if (error) return { erro: `Não foi possível desativar o link: ${error.message}` }
  return {}
}

/** Manda o link aos contatos da folha (o e-mail não leva nome nem CPF de ninguém). */
export async function enviarLinkPorEmail(
  empresaId: string,
  contatos: { nome: string; email: string }[]
): Promise<{ enviados: string[]; erro?: string }> {
  const link = await linkDaEmpresa(empresaId)
  if (!link) return { enviados: [], erro: "Gere o link antes de enviar." }
  const unidade = await unidadeRepasse(empresaId)
  const corpo =
    tituloEmail("Envio da relação de descontos") +
    paragrafo(`Prezados(as) da ${escaparHtml(unidade?.nome ?? "empresa")},`) +
    paragrafo(
      "Este é o endereço próprio da empresa para enviar ao sindicato a relação mensal dos descontos das contribuições, ou informar que não houve desconto no mês. Por ele vocês também veem as inclusões e exclusões de desconto que o sindicato comunicar e confirmam o recebimento."
    ) +
    `<p style="margin:20px 0"><a href="${link.url}" style="display:inline-block;background:#ea580c;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:600">Abrir a página da empresa</a></p>` +
    paragrafo(`Guarde este endereço: ele vale para todos os meses. Se ele cair em mãos erradas, avise o sindicato para gerar outro.`) +
    paragrafo(`<span style="color:#666;font-size:12px">${escaparHtml(link.url)}</span>`)
  const enviados: string[] = []
  for (const c of contatos) {
    const ok = await enviarEmail({ processo: "filiados.repasse_link", email: c.email, nome: c.nome, assunto: "Relação de descontos: endereço da empresa — {ENTIDADE}", html: corpo })
    if (ok) enviados.push(c.email)
  }
  return { enviados, erro: enviados.length ? undefined : "O e-mail não saiu. Confira a configuração de e-mail da entidade." }
}

// ── Lado público (/relacao/<token>) ─────────────────────────────────────────

type LinkAberto = { id: string; empresaId: string }

async function abrir(token: string): Promise<LinkAberto | null> {
  if (!/^[A-Za-z0-9_-]{32,64}$/.test(token)) return null
  const admin = await createAdminClient()
  const { data } = await admin
    .from("filiacao_repasse_links")
    .select("id, empresa_id, revogado_em, ultimo_acesso_em")
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("token", token)
    .maybeSingle()
  if (!data || data.revogado_em) return null
  // Marca o acesso (no máximo a cada 10 minutos).
  if (!data.ultimo_acesso_em || Date.now() - Date.parse(data.ultimo_acesso_em) > 10 * 60_000) {
    await admin.from("filiacao_repasse_links").update({ ultimo_acesso_em: new Date().toISOString() }).eq("id", data.id)
  }
  return { id: data.id, empresaId: data.empresa_id }
}

export type MesNoLink = {
  competencia: number
  tipo: TipoContribuicao
  situacao: "lancada" | "enviada" | "sem_desconto" | "pendente" | "atrasada" | "sem_valores"
  prazo: string
  enviadoEm: string | null
}

export type ComunicacaoNoLink = {
  id: string
  enviadoEm: string
  confirmacao: { em: string; por: string } | null
  itens: { acao: "inclusao" | "exclusao"; nome: string; cpf: string | null; matricula: string | null; data: string | null }[]
}

export type DadosDoLink = {
  entidade: string
  emailEntidade: string | null
  empresa: string
  tipos: TipoContribuicao[]
  /** Competências que o RH pode escolher no envio (mais recente primeiro). */
  opcoes: { competencia: number; tipo: TipoContribuicao; pendente: boolean }[]
  meses: MesNoLink[]
  comunicacoes: ComunicacaoNoLink[]
}

/** CPF com o meio à mostra (***.456.789-**): o RH confere pela matrícula e pelo nome. */
export function mascararCpf(cpf: string | null): string | null {
  const d = (cpf ?? "").replace(/\D/g, "")
  if (d.length !== 11) return null
  return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`
}

const SITUACAO_LINK: Partial<Record<SituacaoEnvio, MesNoLink["situacao"]>> = {
  recebida: "lancada",
  paga: "lancada",
  divergente: "lancada",
  falta_deposito: "lancada",
  recebida_fora: "enviada",
  sem_desconto: "sem_desconto",
  sem_repasse: "sem_valores",
  atrasada: "atrasada",
  aguardando: "pendente",
}

export async function dadosDoLink(token: string): Promise<DadosDoLink | null> {
  const link = await abrir(token)
  if (!link) return null
  const [unidade, regras, entidade, emailEntidade] = await Promise.all([
    unidadeRepasse(link.empresaId),
    regrasRepasse(),
    nomeEntidade(),
    emailContatoEntidade(),
  ])
  if (!unidade) return null
  const daEmpresa = regras.porEmpresa.get(unidade.id) ?? {}
  const tipos = tiposControlados(regras).filter((t) => regraEfetiva(t, regras.geral[t], daEmpresa[t]).controla)
  const atual = competenciaDoDia(hojeSP())
  const opcoes: DadosDoLink["opcoes"] = []
  const meses: MesNoLink[] = []
  for (const tipo of tipos) {
    const q = await quadroRepasse({ tipo, empresaId: unidade.id, ate: atual, meses: MESES_ENVIO })
    const regra = regraEfetiva(tipo, regras.geral[tipo], daEmpresa[tipo])
    for (const c of [...(q.linhas[0]?.celulas ?? [])].reverse()) {
      if (!competenciaAplica(regra, c.competencia) && c.lancamentos === 0) continue
      const situacao = SITUACAO_LINK[c.situacao] ?? null
      const pendente = situacao === "pendente" || situacao === "atrasada"
      opcoes.push({ competencia: c.competencia, tipo, pendente })
      if (situacao && (c.competencia >= somarMeses(atual, -6) || pendente)) {
        meses.push({ competencia: c.competencia, tipo, situacao, prazo: c.prazoEnvio, enviadoEm: c.envioRh?.enviadoEm ?? null })
      }
    }
  }
  opcoes.sort((a, b) => Number(b.pendente) - Number(a.pendente) || b.competencia - a.competencia)

  // Comunicações dos últimos 6 meses, com a confirmação (se houver).
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const desde = new Date(Date.now() - 183 * 86_400_000).toISOString()
  const { data: cabs } = await admin
    .from("filiacao_desconto_comunicacoes")
    .select("id, enviado_em")
    .eq("emp_proprietaria_id", emp)
    .eq("empresa_id", unidade.id)
    .gte("enviado_em", desde)
    .order("enviado_em", { ascending: false })
  const ids = (cabs ?? []).map((c) => c.id)
  const [{ data: itens }, { data: confs }] = ids.length
    ? await Promise.all([
        admin
          .from("filiacao_desconto_comunicacao_itens")
          .select("comunicacao_id, acao, nome, cpf, matricula, data")
          .eq("emp_proprietaria_id", emp)
          .in("comunicacao_id", ids)
          .order("acao", { ascending: false })
          .order("nome"),
        admin.from("filiacao_desconto_confirmacoes").select("comunicacao_id, confirmado_em, confirmado_por").eq("emp_proprietaria_id", emp).in("comunicacao_id", ids),
      ])
    : [{ data: [] }, { data: [] }]
  const conf = new Map((confs ?? []).map((c) => [c.comunicacao_id, { em: c.confirmado_em, por: c.confirmado_por }]))
  const comunicacoes: ComunicacaoNoLink[] = (cabs ?? []).map((c) => ({
    id: c.id,
    enviadoEm: c.enviado_em,
    confirmacao: conf.get(c.id) ?? null,
    itens: (itens ?? [])
      .filter((i) => i.comunicacao_id === c.id)
      .map((i) => ({ acao: i.acao, nome: i.nome ?? "(sem nome)", cpf: mascararCpf(i.cpf), matricula: i.matricula, data: i.data })),
  }))

  return { entidade, emailEntidade, empresa: unidade.nome, tipos, opcoes, meses, comunicacoes }
}

/** URL assinada para o navegador subir o arquivo direto ao armazenamento. */
export async function prepararEnvio(
  token: string,
  nomeArquivo: string,
  tamanho: number
): Promise<{ caminho?: string; tokenUpload?: string; erro?: string }> {
  const link = await abrir(token)
  if (!link) return { erro: "Link inválido ou desativado." }
  const ext = (/\.([a-z0-9]{2,5})$/i.exec(nomeArquivo)?.[1] ?? "").toLowerCase()
  if (!EXTENSOES.has(ext)) return { erro: "Envie PDF, planilha (XLSX, XLS, ODS, CSV), TXT ou imagem (JPG, PNG)." }
  if (tamanho <= 0) return { erro: "O arquivo está vazio." }
  if (tamanho > MAX_ARQUIVO_RELACAO) return { erro: "O arquivo deve ter no máximo 25 MB." }
  const caminho = `${await tenantAtual()}/${link.empresaId}/${randomUUID()}.${ext}`
  const admin = await createAdminClient()
  const { data, error } = await admin.storage.from(BUCKET_RELACOES).createSignedUploadUrl(caminho)
  if (error || !data) return { erro: `Não foi possível preparar o envio: ${error?.message ?? "?"}` }
  return { caminho, tokenUpload: data.token }
}

export async function registrarEnvio(
  token: string,
  dados: {
    caminho: string | null
    nomeArquivo: string | null
    tamanho: number | null
    competencia: number
    tipo: string
    semDesconto: boolean
    valor: number | null
    observacao: string | null
    nome: string
    email: string | null
  }
): Promise<{ erro?: string; campo?: string }> {
  const link = await abrir(token)
  if (!link) return { erro: "Link inválido ou desativado." }
  if (!dados.nome.trim()) return { erro: "Informe o seu nome.", campo: "nome" }
  if (dados.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(dados.email)) return { erro: "E-mail inválido.", campo: "email" }
  if (!competenciaValida(dados.competencia) || dados.competencia > competenciaDoDia(hojeSP())) {
    return { erro: "Escolha a competência.", campo: "competencia" }
  }
  if (!ehTipoContribuicao(dados.tipo)) return { erro: "Escolha o tipo de contribuição.", campo: "tipo" }
  const emp = await tenantAtual()
  if (!dados.semDesconto) {
    const prefixo = `${emp}/${link.empresaId}/`
    if (!dados.caminho || !dados.caminho.startsWith(prefixo) || !/^[0-9a-f-]{36}\.[a-z0-9]{2,5}$/i.test(dados.caminho.slice(prefixo.length))) {
      return { erro: "Envie o arquivo da relação.", campo: "arquivo" }
    }
  }
  const admin = await createAdminClient()
  const { error } = await admin.from("filiacao_repasse_envios").insert({
    emp_proprietaria_id: emp,
    empresa_id: link.empresaId,
    link_id: link.id,
    competencia: dados.competencia,
    tipo: dados.tipo,
    sem_desconto: dados.semDesconto,
    arquivo: dados.semDesconto ? null : dados.caminho,
    nome_arquivo: dados.semDesconto ? null : (dados.nomeArquivo ?? "").slice(0, 200) || null,
    tamanho: dados.semDesconto ? null : dados.tamanho,
    valor_informado: dados.semDesconto ? null : dados.valor,
    observacao: dados.observacao?.slice(0, 2000) ?? null,
    enviado_por: dados.nome.trim().slice(0, 160),
    enviado_email: dados.email?.trim().toLowerCase() ?? null,
  })
  if (error) return { erro: `Não foi possível registrar o envio: ${error.message}` }
  invalidarAvisosRepasse()

  // Recibo para quem enviou (se deu e-mail).
  if (dados.email) {
    const unidade = await unidadeRepasse(link.empresaId)
    const rot = rotuloCompetencia(dados.competencia)
    await enviarEmail({
      processo: "filiados.repasse_recibo",
      email: dados.email,
      nome: dados.nome,
      assunto: `Recebemos: ${dados.semDesconto ? "sem desconto" : "relação de descontos"} de ${rot} — {ENTIDADE}`,
      html:
        tituloEmail(`Recebemos o envio de ${rot}`) +
        paragrafo(
          dados.semDesconto
            ? `Registramos que a ${escaparHtml(unidade?.nome ?? "empresa")} não teve desconto da contribuição ${dados.tipo.toLowerCase()} na competência ${rot}.`
            : `Recebemos a relação de descontos da contribuição ${dados.tipo.toLowerCase()} da competência ${rot} da ${escaparHtml(unidade?.nome ?? "empresa")}${dados.valor ? `, no total de ${formatarMoeda(dados.valor)}` : ""}.`
        ) +
        paragrafo("Obrigado(a)."),
    }).catch(() => false)
  }
  return {}
}

export async function confirmarComunicacaoPeloLink(
  token: string,
  comunicacaoId: string,
  nome: string,
  email: string | null
): Promise<{ erro?: string }> {
  const link = await abrir(token)
  if (!link) return { erro: "Link inválido ou desativado." }
  if (!nome.trim()) return { erro: "Informe o seu nome." }
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data: com } = await admin
    .from("filiacao_desconto_comunicacoes")
    .select("id")
    .eq("id", comunicacaoId)
    .eq("emp_proprietaria_id", emp)
    .eq("empresa_id", link.empresaId)
    .maybeSingle()
  if (!com) return { erro: "Comunicação não encontrada." }
  const { error } = await admin.from("filiacao_desconto_confirmacoes").insert({
    emp_proprietaria_id: emp,
    comunicacao_id: comunicacaoId,
    link_id: link.id,
    confirmado_por: nome.trim().slice(0, 160),
    confirmado_email: email?.trim().toLowerCase() || null,
  })
  if (error) return { erro: error.code === "23505" ? "Esta comunicação já foi confirmada." : `Não foi possível confirmar: ${error.message}` }
  return {}
}

// ── Lado da equipe ──────────────────────────────────────────────────────────

export type EnvioRh = {
  id: string
  competencia: number
  tipo: TipoContribuicao
  semDesconto: boolean
  nomeArquivo: string | null
  tamanho: number | null
  valorInformado: number | null
  observacao: string | null
  enviadoPor: string
  enviadoEmail: string | null
  enviadoEm: string
  arquivadoEm: string | null
}

export async function enviosDaEmpresa(empresaId: string, limite = 30): Promise<EnvioRh[]> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("filiacao_repasse_envios")
    .select("id, competencia, tipo, sem_desconto, nome_arquivo, tamanho, valor_informado, observacao, enviado_por, enviado_email, enviado_em, arquivado_em")
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("empresa_id", empresaId)
    .order("enviado_em", { ascending: false })
    .limit(limite)
  if (error) {
    if (esquemaAusente(error)) return []
    throw new Error(`Falha ao ler os envios do RH: ${error.message}`)
  }
  return (data ?? []).map((e) => ({
    id: e.id,
    competencia: e.competencia,
    tipo: e.tipo as TipoContribuicao,
    semDesconto: e.sem_desconto,
    nomeArquivo: e.nome_arquivo,
    tamanho: e.tamanho,
    valorInformado: e.valor_informado === null ? null : Number(e.valor_informado),
    observacao: e.observacao,
    enviadoPor: e.enviado_por,
    enviadoEmail: e.enviado_email,
    enviadoEm: e.enviado_em,
    arquivadoEm: e.arquivado_em,
  }))
}

/** Endereço temporário (5 minutos) para baixar o arquivo enviado pelo RH. */
export async function urlDoArquivoEnviado(envioId: string): Promise<{ url?: string; erro?: string }> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("filiacao_repasse_envios")
    .select("arquivo, nome_arquivo")
    .eq("id", envioId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (!data?.arquivo) return { erro: "Arquivo não encontrado." }
  const { data: url, error } = await admin.storage
    .from(BUCKET_RELACOES)
    .createSignedUrl(data.arquivo, 300, { download: data.nome_arquivo ?? true })
  if (error || !url) return { erro: `Não foi possível abrir o arquivo: ${error?.message ?? "?"}` }
  return { url: url.signedUrl }
}

/** Dá o envio por tratado sem lançar (arquivo errado, reenviado etc.). */
export async function arquivarEnvio(envioId: string, usuarioNome: string | null): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin
    .from("filiacao_repasse_envios")
    .update({ arquivado_em: new Date().toISOString(), arquivado_por: usuarioNome })
    .eq("id", envioId)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: `Não foi possível arquivar: ${error.message}` }
  invalidarAvisosRepasse()
  return {}
}

/** Confirmações do RH por comunicação (para o histórico de envios). */
export async function confirmacoesDasComunicacoes(ids: string[]): Promise<Map<string, { em: string; por: string }>> {
  if (ids.length === 0) return new Map()
  const admin = await createAdminClient()
  const { data } = await admin
    .from("filiacao_desconto_confirmacoes")
    .select("comunicacao_id, confirmado_em, confirmado_por")
    .eq("emp_proprietaria_id", await tenantAtual())
    .in("comunicacao_id", ids)
  return new Map((data ?? []).map((c) => [c.comunicacao_id, { em: c.confirmado_em, por: c.confirmado_por }]))
}
