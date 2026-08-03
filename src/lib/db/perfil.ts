import "server-only"
import { tenantAtual } from "@/lib/tenant"

import { minhasFerias, resumoPeriodo, somarDias } from "@/lib/db/ferias"
import { meusDocumentosPessoal } from "@/lib/db/pessoal"
import { meusAsos } from "@/lib/db/pessoal-saude"
import { formatarData } from "@/lib/formato"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Perfil do usuário logado (registro `usuarios`) + contatos (telefones,
 * enderecos) e a indicação de funcionário (tem vínculo trabalhista). A foto
 * fica no bucket privado `usuarios`. Ver [[confluir-fase-3a]].
 */

function texto(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null
}

const TIPOS_IMG: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
}

export async function urlFoto(caminho: string | null): Promise<string | null> {
  if (!caminho) return null
  if (/^(https?:)?\/\//.test(caminho)) {
    return caminho.startsWith("//") ? `https:${caminho}` : caminho
  }
  const admin = await createAdminClient()
  const { data } = await admin.storage.from("usuarios").createSignedUrl(caminho, 3600)
  return data?.signedUrl ?? null
}

// ── Perfil ──────────────────────────────────────────────────────────────────

export type Perfil = {
  id: string
  nomeCompleto: string | null
  nomeGuerra: string | null
  cpf: string | null
  email: string | null
  emailEmpresa: string | null
  whatsapp: string | null
  dataNascimento: string | null
  sexo: string | null
  estadoCivil: string | null
  escolaridade: string | null
  matricula: string | null
  fotoUrl: string | null
  cargo: string | null
  ehFuncionario: boolean
}

export async function obterPerfil(usuarioId: string): Promise<Perfil | null> {
  const admin = await createAdminClient()
  const { data: u } = await admin
    .from("usuarios")
    .select(
      "id, nome_completo, nome_guerra, cpf, email, email_empresa, whatsapp, data_nascimento, sexo, estado_civil, escolaridade, empresa_matricula, foto"
    )
    .eq("id", usuarioId)
    .maybeSingle()
  if (!u) return null

  const { data: vinc } = await admin
    .from("vinculos_trabalhistas")
    .select("cargo, contrato_demissao")
    .eq("trabalhador_id", usuarioId)
    .order("contrato_admissao", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle()

  return {
    id: u.id as string,
    nomeCompleto: texto(u.nome_completo),
    nomeGuerra: texto(u.nome_guerra),
    cpf: texto(u.cpf),
    email: texto(u.email),
    emailEmpresa: texto(u.email_empresa),
    whatsapp: texto(u.whatsapp),
    dataNascimento: texto(u.data_nascimento),
    sexo: texto(u.sexo),
    estadoCivil: texto(u.estado_civil),
    escolaridade: texto(u.escolaridade),
    matricula: texto(u.empresa_matricula),
    fotoUrl: await urlFoto(texto(u.foto)),
    cargo: texto(vinc?.cargo),
    ehFuncionario: Boolean(vinc),
  }
}

export type DadosPerfil = {
  nome_guerra: string | null
  email: string | null
  whatsapp: string | null
  data_nascimento: string | null
  sexo: string | null
  estado_civil: string | null
  escolaridade: string | null
}

export async function atualizarPerfil(
  usuarioId: string,
  dados: DadosPerfil
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin
    .from("usuarios")
    .update({ ...dados, updated_at: new Date().toISOString() })
    .eq("id", usuarioId)
  if (error) return { erro: `Falha ao salvar perfil: ${error.message}` }
  return {}
}

export async function atualizarFoto(
  usuarioId: string,
  arquivo: File
): Promise<{ erro?: string }> {
  const ext = TIPOS_IMG[arquivo.type]
  if (!ext) return { erro: "A foto deve ser JPG, PNG ou WEBP." }
  if (arquivo.size > 3 * 1024 * 1024) return { erro: "A foto deve ter no máximo 3 MB." }
  const caminho = `${usuarioId}/${Date.now()}.${ext}`
  const admin = await createAdminClient()
  const { error } = await admin.storage
    .from("usuarios")
    .upload(caminho, arquivo, { contentType: arquivo.type, upsert: true })
  if (error) return { erro: `Falha ao subir a foto: ${error.message}` }
  const { error: erroDb } = await admin
    .from("usuarios")
    .update({ foto: caminho, updated_at: new Date().toISOString() })
    .eq("id", usuarioId)
  if (erroDb) return { erro: `Foto subiu, mas falhou ao salvar: ${erroDb.message}` }
  return {}
}

// ── Telefones ───────────────────────────────────────────────────────────────

export type Telefone = {
  id: string
  numero: string | null
  tipo: string | null
  whatsapp: boolean
}

export async function listarTelefones(usuarioId: string): Promise<Telefone[]> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("telefones")
    .select("id, numero, tipo, whatsapp")
    .eq("usuario_id", usuarioId)
    .order("favorito", { ascending: false })
  return (data ?? []).map((t) => ({
    id: t.id as string,
    numero: texto(t.numero),
    tipo: texto(t.tipo),
    whatsapp: t.whatsapp === true,
  }))
}

export async function adicionarTelefone(
  usuarioId: string,
  dados: { numero: string; tipo: string | null; whatsapp: boolean }
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin.from("telefones").insert({
    ...dados,
    usuario_id: usuarioId,
    emp_proprietaria_id: await tenantAtual(),
  })
  if (error) return { erro: `Falha ao adicionar telefone: ${error.message}` }
  return {}
}

export async function removerTelefone(
  id: string,
  usuarioId: string
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin
    .from("telefones")
    .delete()
    .eq("id", id)
    .eq("usuario_id", usuarioId)
  if (error) return { erro: `Falha ao remover: ${error.message}` }
  return {}
}

// ── Endereços ───────────────────────────────────────────────────────────────

export type Endereco = {
  id: string
  tipo: string | null
  cep: string | null
  logradouro: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  cidade: string | null
  estado: string | null
}

export async function listarEnderecos(usuarioId: string): Promise<Endereco[]> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("enderecos")
    .select(
      "id, tipo_endereco, cep, logradouro, numero, complemento, bairro, cidade, estado"
    )
    .eq("usuario_id", usuarioId)
    .order("favorito", { ascending: false })
  return (data ?? []).map((e) => ({
    id: e.id as string,
    tipo: texto(e.tipo_endereco),
    cep: texto(e.cep),
    logradouro: texto(e.logradouro),
    numero: texto(e.numero),
    complemento: texto(e.complemento),
    bairro: texto(e.bairro),
    cidade: texto(e.cidade),
    estado: texto(e.estado),
  }))
}

export type DadosEndereco = {
  tipo_endereco: string | null
  cep: string | null
  logradouro: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  cidade: string | null
  estado: string | null
}

export async function adicionarEndereco(
  usuarioId: string,
  dados: DadosEndereco
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin.from("enderecos").insert({
    ...dados,
    usuario_id: usuarioId,
    emp_proprietaria_id: await tenantAtual(),
  })
  if (error) return { erro: `Falha ao adicionar endereço: ${error.message}` }
  return {}
}

export async function removerEndereco(
  id: string,
  usuarioId: string
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin
    .from("enderecos")
    .delete()
    .eq("id", id)
    .eq("usuario_id", usuarioId)
  if (error) return { erro: `Falha ao remover: ${error.message}` }
  return {}
}

// ── Alertas do funcionário (visuais no topo do perfil) ───────────────────────

export type AlertaPerfil = {
  tipo: "ferias" | "aso" | "contracheque"
  texto: string
  href: string
  severidade: "info" | "warning"
}

/**
 * Nudges do topo do perfil: saldo de férias a gozar, ASO vigente vencendo em
 * até 90 dias (ou vencido) e contracheque recém-liberado. O sino já recebe a
 * notificação do contracheque na liberação (Fase 3A); estes são só visuais.
 */
export async function meusAlertas(usuarioId: string): Promise<AlertaPerfil[]> {
  const [ferias, asos, docs] = await Promise.all([
    minhasFerias(usuarioId),
    meusAsos(usuarioId),
    meusDocumentosPessoal(usuarioId),
  ])
  const hoje = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date())
  const alertas: AlertaPerfil[] = []

  // Férias: saldo de descanso ainda por gozar em período não finalizado.
  const saldo = ferias
    .filter((p) => p.finalizado !== true)
    .reduce((s, p) => s + Math.max(0, resumoPeriodo(p).saldo), 0)
  if (saldo > 0) {
    alertas.push({
      tipo: "ferias",
      texto: `Você tem ${saldo} dia${saldo === 1 ? "" : "s"} de férias a gozar — solicite pelo seu perfil.`,
      href: "/painel/perfil/ferias",
      severidade: "info",
    })
  }

  // ASO: o vigente vencendo em até 90 dias ou já vencido.
  const aso = asos.find((a) => a.ultimo === true && a.vencimento)
  if (aso?.vencimento && aso.vencimento <= somarDias(hoje, 90)) {
    const vencido = aso.vencimento < hoje
    alertas.push({
      tipo: "aso",
      texto: vencido
        ? `Seu ASO venceu em ${formatarData(aso.vencimento)} — procure o exame periódico.`
        : `Seu ASO vence em ${formatarData(aso.vencimento)} — fique atento ao exame periódico.`,
      href: "/painel/perfil/asos",
      severidade: "warning",
    })
  }

  // Contracheque: o mais recente liberado nos últimos 35 dias.
  const ultimo = docs.contracheques[0]
  if (ultimo?.created_at && ultimo.created_at.slice(0, 10) >= somarDias(hoje, -35)) {
    alertas.push({
      tipo: "contracheque",
      texto: `Novo contracheque disponível${ultimo.remessaNome ? `: ${ultimo.remessaNome}` : ""}.`,
      href: "/painel/perfil/contracheques",
      severidade: "info",
    })
  }

  return alertas
}
