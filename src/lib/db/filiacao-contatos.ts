import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Os OUTROS contatos do filiado — os que não cabem nos dois telefones, dois
 * e-mails e um endereço do cadastro.
 *
 * O sistema antigo guardava contato em dois lugares: no cadastro (veio na
 * migração) e em tabelas próprias, com vários por pessoa (vieram em 08/09,
 * com `scripts/migrar-contatos-bubble.mjs`). Não era redundância: 8.961
 * filiados tinham um e-mail nessas tabelas que o cadastro não tinha. Esta
 * leitura mostra tudo o que há, marcando o que já está no cadastro para a
 * secretaria não ver dobrado.
 */

export type ContatoEmail = { id: string; email: string; tipo: string | null; favorito: boolean; noCadastro: boolean }
export type ContatoTelefone = { id: string; numero: string; tipo: string | null; whatsapp: boolean; favorito: boolean; noCadastro: boolean }
export type ContatoEndereco = {
  id: string
  nome: string | null
  tipo: string | null
  favorito: boolean
  linha1: string
  linha2: string
  noCadastro: boolean
}

export type ContatosDoFiliado = {
  emails: ContatoEmail[]
  telefones: ContatoTelefone[]
  enderecos: ContatoEndereco[]
}

const dig = (s: unknown) => String(s ?? "").replace(/\D/g, "")
const norm = (s: unknown) => (typeof s === "string" ? s.trim().toLowerCase() : "")

/**
 * @param cadastro o registro de `filiacoes` da pessoa — serve para marcar o
 * que já aparece no cadastro. Todos os ids da pessoa entram na busca.
 */
export async function contatosDoFiliado(
  filiadoIds: string[],
  cadastro: {
    email_pessoal?: string | null
    email_corporativo?: string | null
    telefone_1?: string | null
    telefone_2?: string | null
    endereco_cep?: string | null
    endereco_logradouro?: string | null
  }
): Promise<ContatosDoFiliado> {
  const vazio: ContatosDoFiliado = { emails: [], telefones: [], enderecos: [] }
  if (filiadoIds.length === 0) return vazio
  const admin = await createAdminClient()
  const emp = await tenantAtual()

  const [emailsRes, telefonesRes, enderecosRes] = await Promise.all([
    admin.from("emails").select("id, email, tipo_email, favorito").eq("emp_proprietaria_id", emp).in("filiado_id", filiadoIds).order("favorito", { ascending: false }),
    admin.from("telefones").select("id, numero, tipo, whatsapp, favorito").eq("emp_proprietaria_id", emp).in("filiado_id", filiadoIds).order("favorito", { ascending: false }),
    admin.from("enderecos").select("id, cep, logradouro, numero, complemento, bairro, cidade, estado, nome_endereco, tipo_endereco, favorito").eq("emp_proprietaria_id", emp).in("filiado_id", filiadoIds).order("favorito", { ascending: false }),
  ])

  const emailsCadastro = new Set([norm(cadastro.email_pessoal), norm(cadastro.email_corporativo)].filter(Boolean))
  const fonesCadastro = new Set([dig(cadastro.telefone_1), dig(cadastro.telefone_2)].filter(Boolean))
  const cepCadastro = dig(cadastro.endereco_cep)
  const logradouroCadastro = norm(cadastro.endereco_logradouro)

  const vistos = new Set<string>()
  const emails: ContatoEmail[] = []
  for (const e of emailsRes.data ?? []) {
    const v = norm(e.email)
    if (!v || vistos.has(v)) continue
    vistos.add(v)
    emails.push({ id: e.id as string, email: v, tipo: (e.tipo_email as string | null) ?? null, favorito: e.favorito === true, noCadastro: emailsCadastro.has(v) })
  }

  const vistosF = new Set<string>()
  const telefones: ContatoTelefone[] = []
  for (const t of telefonesRes.data ?? []) {
    const v = dig(t.numero)
    if (!v || vistosF.has(v)) continue
    vistosF.add(v)
    telefones.push({ id: t.id as string, numero: v, tipo: (t.tipo as string | null) ?? null, whatsapp: t.whatsapp === true, favorito: t.favorito === true, noCadastro: fonesCadastro.has(v) })
  }

  const enderecos: ContatoEndereco[] = (enderecosRes.data ?? []).map((a) => {
    const linha1 = [a.logradouro, a.numero, a.complemento].filter((x) => typeof x === "string" && x.trim()).join(", ")
    const linha2 = [a.bairro, [a.cidade, a.estado].filter(Boolean).join("/"), a.cep ? `CEP ${a.cep}` : null].filter((x) => typeof x === "string" && x.trim()).join(" · ")
    const noCadastro =
      (cepCadastro !== "" && dig(a.cep) === cepCadastro) ||
      (logradouroCadastro !== "" && norm(a.logradouro) === logradouroCadastro)
    return {
      id: a.id as string,
      nome: (a.nome_endereco as string | null) ?? null,
      tipo: (a.tipo_endereco as string | null) ?? null,
      favorito: a.favorito === true,
      linha1,
      linha2,
      noCadastro,
    }
  })

  return { emails, telefones, enderecos }
}
