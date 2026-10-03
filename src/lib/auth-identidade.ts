import "server-only"

import { cache } from "react"

import { grafiasDoCpf, validarCpf } from "@/lib/cpf"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * IDENTIDADE DAS CONTAS DO PORTAL, VOTAÇÃO E OPOSIÇÃO.
 *
 * Até 03/10/2026 a identidade era `user_metadata.cpf`, que o próprio usuário
 * altera pela API pública do Supabase (`auth.updateUser({ data })`). Qualquer
 * sessão podia virar qualquer filiado — inclusive para votar. Ver o achado S1
 * em docs/avaliacao-sistema-2026-10-03.md e supabase/auth-identidades.sql.
 *
 * Agora a identidade mora em `auth_identidades`, que SÓ este módulo grava,
 * com duas provas possíveis:
 *   - senha: `signInWithPassword` com o e-mail do cadastro do CPF;
 *   - código: o código foi enviado ao e-mail do cadastro e conferido.
 * Nos fluxos por código, o servidor registra o par e-mail↔CPF ANTES de
 * enviar (vínculo pendente) e o consome DEPOIS de o código ser conferido. O
 * formulário nunca decide o CPF.
 *
 * Regras de vínculo (vincularIdentidade):
 *   1. `filiado`: o e-mail verificado da conta tem de ser um dos e-mails do
 *      cadastro daquele CPF (igualdade exata, sem `ilike`).
 *   2. `nao_filiado`: o CPF não pode ser de filiado ativo (esse entra como
 *      filiado); o CPF é a autodeclaração do opositor, como sempre foi.
 *   3. Conta já vinculada a OUTRO CPF: recusa (e-mail compartilhado entre
 *      pessoas diferentes — dado legado — se resolve na secretaria).
 *   4. CPF já vinculado a OUTRA conta: recusa (índice único no banco).
 *   5. Mesmo CPF: idempotente; um não filiado que se filia vira `filiado`.
 */

export type TipoIdentidade = "filiado" | "nao_filiado"

export type Identidade = {
  tipo: TipoIdentidade
  cpf: string
  nome: string | null
}

export type ResultadoVinculo = { ok: true; identidade: Identidade } | { ok: false; erro: string }

/** Validade do vínculo pendente — a mesma do link/código de e-mail (2 h). */
const PENDENCIA_SEGUNDOS = 7200

const ERRO_OUTRO_CPF =
  "Esta conta de acesso está vinculada a outro CPF. Procure o sindicato para regularizar o seu cadastro."
const ERRO_CPF_EM_OUTRA_CONTA =
  "Este CPF já está vinculado a outra conta de acesso. Procure o sindicato para regularizar o seu cadastro."
const ERRO_EMAIL_NAO_E_DO_CADASTRO =
  "O e-mail desta conta não é o e-mail do cadastro deste CPF. Procure o sindicato para atualizar seus dados."

/** A identidade da conta no tenant atual. Cacheada por request. */
export const identidadeDaConta = cache(
  async (authUserId: string): Promise<Identidade | null> => {
    const admin = await createAdminClient()
    const { data } = await admin
      .from("auth_identidades")
      .select("tipo, cpf, nome")
      .eq("auth_user_id", authUserId)
      .eq("emp_proprietaria_id", await tenantAtual())
      .maybeSingle()
    if (!data) return null
    return {
      tipo: data.tipo as TipoIdentidade,
      cpf: String(data.cpf),
      nome: (data.nome as string | null) ?? null,
    }
  }
)

/** E-mails (minúsculos) do cadastro de filiação deste CPF, e se há filiação ativa. */
async function cadastroDoCpf(cpf: string): Promise<{ emails: Set<string>; ativo: boolean; existe: boolean }> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("filiacoes")
    .select("email_pessoal, email_corporativo, filiacao_condicao")
    .in("cpf", grafiasDoCpf(cpf))
    .eq("emp_proprietaria_id", await tenantAtual())
    .not("filiacao_excluida", "is", true)
  const linhas = data ?? []
  const emails = new Set<string>()
  for (const f of linhas) {
    for (const e of [f.email_pessoal, f.email_corporativo]) {
      if (typeof e === "string" && e.trim()) emails.add(e.trim().toLowerCase())
    }
  }
  return {
    emails,
    ativo: linhas.some((f) => f.filiacao_condicao === "Ativo"),
    existe: linhas.length > 0,
  }
}

/**
 * Grava a identidade da conta, depois da prova de posse do e-mail. Nunca
 * sobrescreve um CPF diferente; devolve o erro que a tela mostra.
 */
export async function vincularIdentidade(dados: {
  userId: string
  /** O e-mail da conta, já verificado (senha ou código). */
  emailVerificado: string | null | undefined
  tipo: TipoIdentidade
  cpf: string
  nome?: string | null
  por: "senha" | "codigo" | "migracao"
}): Promise<ResultadoVinculo> {
  const cpf = dados.cpf.replace(/\D/g, "")
  if (!validarCpf(cpf)) return { ok: false, erro: "CPF inválido." }
  const email = (dados.emailVerificado ?? "").trim().toLowerCase()
  if (!email) return { ok: false, erro: "A conta de acesso não tem e-mail verificado." }

  const admin = await createAdminClient()
  const emp = await tenantAtual()

  // Prova por tipo.
  const cadastro = await cadastroDoCpf(cpf)
  let tipo = dados.tipo
  if (tipo === "filiado") {
    if (!cadastro.emails.has(email)) return { ok: false, erro: ERRO_EMAIL_NAO_E_DO_CADASTRO }
  } else if (cadastro.ativo) {
    // Filiado ativo tentando entrar como "trabalhador": a porta é a do filiado,
    // e a prova é a do filiado (e-mail do cadastro).
    if (!cadastro.emails.has(email)) {
      return { ok: false, erro: "Este CPF é de um filiado — use o acesso do filiado (por CPF)." }
    }
    tipo = "filiado"
  }

  // Conta já vinculada?
  const { data: atual } = await admin
    .from("auth_identidades")
    .select("tipo, cpf, nome")
    .eq("auth_user_id", dados.userId)
    .eq("emp_proprietaria_id", emp)
    .maybeSingle()
  if (atual) {
    if (String(atual.cpf) !== cpf) return { ok: false, erro: ERRO_OUTRO_CPF }
    const nome = tipo === "nao_filiado" ? (dados.nome ?? (atual.nome as string | null) ?? null) : null
    if (atual.tipo !== tipo || (atual.nome ?? null) !== nome) {
      await admin
        .from("auth_identidades")
        .update({ tipo, nome })
        .eq("auth_user_id", dados.userId)
        .eq("emp_proprietaria_id", emp)
    }
    return { ok: true, identidade: { tipo, cpf, nome } }
  }

  const nome = tipo === "nao_filiado" ? (dados.nome ?? null) : null
  const { error } = await admin.from("auth_identidades").insert({
    auth_user_id: dados.userId,
    emp_proprietaria_id: emp,
    tipo,
    cpf,
    nome,
    vinculada_por: dados.por,
  })
  if (error) {
    // 23505 = o CPF já é de outra conta (índice único por tenant).
    if (error.code === "23505") return { ok: false, erro: ERRO_CPF_EM_OUTRA_CONTA }
    return { ok: false, erro: "Não foi possível concluir o seu acesso. Tente de novo." }
  }
  return { ok: true, identidade: { tipo, cpf, nome } }
}

/**
 * Registra, ANTES de enviar o código, o par e-mail↔CPF que o servidor
 * derivou. Substitui qualquer pendência anterior do mesmo e-mail.
 */
export async function registrarVinculoPendente(dados: {
  email: string
  tipo: TipoIdentidade
  cpf: string
  nome?: string | null
}): Promise<void> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const email = dados.email.trim().toLowerCase()
  await admin
    .from("auth_vinculos_pendentes")
    .delete()
    .eq("emp_proprietaria_id", emp)
    .eq("email", email)
  await admin.from("auth_vinculos_pendentes").insert({
    emp_proprietaria_id: emp,
    email,
    tipo: dados.tipo,
    cpf: dados.cpf.replace(/\D/g, ""),
    nome: dados.nome ?? null,
    expira_em: new Date(Date.now() + PENDENCIA_SEGUNDOS * 1000).toISOString(),
  })
}

/**
 * DEPOIS de o código ser conferido: consome a pendência do e-mail verificado
 * e grava a identidade. Sem pendência (código pedido antes desta versão, ou
 * conta que já estava vinculada), devolve a identidade que já existir.
 */
export async function consumirVinculoPendente(dados: {
  userId: string
  emailVerificado: string | null | undefined
}): Promise<{ erro?: string; identidade: Identidade | null }> {
  const email = (dados.emailVerificado ?? "").trim().toLowerCase()
  if (!email) return { identidade: await identidadeDaConta(dados.userId) }

  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data: pendentes } = await admin
    .from("auth_vinculos_pendentes")
    .select("id, tipo, cpf, nome, expira_em")
    .eq("emp_proprietaria_id", emp)
    .eq("email", email)
    .order("created_at", { ascending: false })
  const agora = Date.now()
  const valida = (pendentes ?? []).find((p) => new Date(String(p.expira_em)).getTime() > agora)

  // A pendência serve uma vez: some, valendo ou não.
  if ((pendentes ?? []).length > 0) {
    await admin
      .from("auth_vinculos_pendentes")
      .delete()
      .eq("emp_proprietaria_id", emp)
      .eq("email", email)
  }
  if (!valida) return { identidade: await identidadeDaConta(dados.userId) }

  const r = await vincularIdentidade({
    userId: dados.userId,
    emailVerificado: email,
    tipo: valida.tipo as TipoIdentidade,
    cpf: String(valida.cpf),
    nome: (valida.nome as string | null) ?? null,
    por: "codigo",
  })
  return r.ok ? { identidade: r.identidade } : { erro: r.erro, identidade: null }
}
