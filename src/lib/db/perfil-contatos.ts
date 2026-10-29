import "server-only"

import { texto } from "@/lib/db/comum"
import { ramaisDoUsuario } from "@/lib/db/ramais"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Meu perfil (29/10/2026): os e-mails pessoais da pessoa (tabela `emails`,
 * como os telefones), os contatos corporativos ESPELHADOS das áreas de
 * origem — e-mail (E-mails institucionais), celular (Linhas institucionais),
 * ramal e telefone direto (Ramais) — e o tempo de casa / mandatos do topo.
 */

// ── E-mails pessoais ─────────────────────────────────────────────────────────

export type EmailPessoal = { id: string; email: string; tipo: string | null }

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function listarEmails(usuarioId: string): Promise<EmailPessoal[]> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("emails")
    .select("id, email, tipo_email")
    .eq("usuario_id", usuarioId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .order("favorito", { ascending: false })
    .order("created_at", { ascending: true })
  return ((data ?? []) as Record<string, unknown>[])
    .filter((e) => texto(e.email))
    .map((e) => ({ id: String(e.id), email: String(e.email), tipo: texto(e.tipo_email) }))
}

export async function adicionarEmail(usuarioId: string, email: string, tipo: string | null): Promise<{ erro?: string }> {
  const limpo = email.trim().toLowerCase()
  if (!RE_EMAIL.test(limpo)) return { erro: "E-mail inválido." }
  const atuais = await listarEmails(usuarioId)
  if (atuais.some((e) => e.email.toLowerCase() === limpo)) return { erro: "Este e-mail já está na lista." }
  const admin = await createAdminClient()
  const { error } = await admin
    .from("emails")
    .insert({ email: limpo, tipo_email: tipo, usuario_id: usuarioId, emp_proprietaria_id: await tenantAtual() })
  if (error) return { erro: `Falha ao adicionar e-mail: ${error.message}` }
  return {}
}

export async function removerEmail(id: string, usuarioId: string): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin.from("emails").delete().eq("id", id).eq("usuario_id", usuarioId)
  if (error) return { erro: `Falha ao remover: ${error.message}` }
  return {}
}

// ── Contatos corporativos (só leitura; mantidos pelo Institucional) ──────────

export type ContatosCorporativos = {
  emails: string[]
  celulares: { numero: string; operadora: string | null }[]
  ramais: { ramal: string | null; telefoneDireto: string | null; local: string | null }[]
}

export async function contatosCorporativos(usuarioId: string, emailEmpresaLegado: string | null): Promise<ContatosCorporativos> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const [emails, linhas, ramais] = await Promise.all([
    admin.from("emails_institucionais").select("endereco").eq("emp_proprietaria_id", emp).eq("usuario_id", usuarioId),
    admin.from("linhas_institucionais").select("numero, operadora").eq("emp_proprietaria_id", emp).eq("usuario_id", usuarioId),
    ramaisDoUsuario(usuarioId),
  ])
  const enderecos = ((emails.data ?? []) as Record<string, unknown>[]).map((e) => texto(e.endereco)).filter((v): v is string => Boolean(v))
  // O e-mail da empresa do cadastro antigo vale enquanto o Institucional não registra um.
  if (enderecos.length === 0 && emailEmpresaLegado) enderecos.push(emailEmpresaLegado)
  return {
    emails: enderecos,
    celulares: ((linhas.data ?? []) as Record<string, unknown>[]).map((l) => ({ numero: String(l.numero ?? ""), operadora: texto(l.operadora) })),
    ramais: ramais.map((r) => ({ ramal: r.ramal, telefoneDireto: r.telefoneDireto, local: r.local })),
  }
}

// ── Topo: tempo de casa e mandatos ───────────────────────────────────────────

/** Admissão do vínculo em vigor com a entidade (null = sem vínculo ativo). */
export async function admissaoAtual(usuarioId: string): Promise<string | null> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("vinculos_trabalhistas")
    .select("contrato_admissao, contrato_demissao")
    .eq("trabalhador_id", usuarioId)
    .eq("empregador_id", await tenantAtual())
    .is("contrato_demissao", null)
    .not("contrato_admissao", "is", null)
    .order("contrato_admissao", { ascending: true })
    .limit(1)
  return texto(data?.[0]?.contrato_admissao)?.slice(0, 10) ?? null
}

/** Anos e meses completos entre a admissão e hoje. */
export function tempoDeCasa(admissao: string, hoje: string): { anos: number; meses: number } {
  const [ay, am, ad] = admissao.split("-").map(Number)
  const [hy, hm, hd] = hoje.split("-").map(Number)
  let meses = (hy - ay) * 12 + (hm - am) - (hd < ad ? 1 : 0)
  if (meses < 0) meses = 0
  return { anos: Math.floor(meses / 12), meses: meses % 12 }
}

/** Mandatos da diretoria de que a pessoa participou (pela conta ou pelo CPF). */
export async function mandatosDaPessoa(usuarioId: string, cpf: string | null): Promise<number> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data: mandatos } = await admin.from("diretoria_mandatos").select("id").eq("emp_proprietaria_id", emp)
  const ids = ((mandatos ?? []) as { id: string }[]).map((m) => String(m.id))
  if (!ids.length) return 0
  const digitos = (cpf ?? "").replace(/\D/g, "")
  const filtro = digitos.length === 11 ? `usuario_id.eq.${usuarioId},cpf.eq.${digitos}` : `usuario_id.eq.${usuarioId}`
  let { data, error } = await admin.from("diretoria_integrantes").select("mandato_id").in("mandato_id", ids).or(filtro)
  if (error && digitos) {
    // Sem a coluna cpf (SQL antigo): só pela conta.
    ;({ data, error } = await admin.from("diretoria_integrantes").select("mandato_id").in("mandato_id", ids).eq("usuario_id", usuarioId))
  }
  if (error) return 0
  return new Set(((data ?? []) as { mandato_id: string }[]).map((d) => String(d.mandato_id))).size
}
