import "server-only"

import { grafiasDoCpf } from "@/lib/cpf"
import { hojeSP } from "@/lib/db/comum"
import { regrasDaCampanha, regrasDaEntidade } from "@/lib/db/oposicao-regras"
import { nomesConferem } from "@/lib/db/votacao-primeiro-acesso"
import { emailsDeEnvio } from "@/lib/email-cadastro"
import { padraoDaDecisao } from "@/lib/oposicao-constantes"
import { motivoNascimentoSuspeito } from "@/lib/saude-cadastros"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * ENTRADA DA OPOSIÇÃO PELO CPF (22/11/2026). Antes, a pessoa escolhia entre
 * "Sou filiado" e "Não sou filiado" — e quem achava que era filiado (ou não)
 * caía no caminho errado; o filiado sem e-mail no cadastro não tinha saída.
 * Agora o CPF decide:
 *  - filiado ATIVO com e-mail → código para os e-mails do cadastro;
 *  - filiado ATIVO sem e-mail → nome, nascimento e um e-mail novo, conferidos
 *    com a ficha, segundo a decisão "Filiado sem e-mail no cadastro"
 *    (padrão da entidade ou da campanha); o e-mail vai para a ficha, com
 *    registro no prontuário;
 *  - qualquer outro (desfiliado, nunca filiado) → trabalhador: nome + e-mail.
 * Mostrar o caminho revela se o CPF é de filiado ativo — o mesmo que a aba do
 * filiado já mostrava (e-mails com máscara média), decisão de 30/10/2026.
 */

export const MAX_EMAILS_FILIADO = 3

/** Marca, no prontuário, de quem entrou conferido só pelo nome (a avaliação mostra). */
export const MARCA_SO_PELO_NOME = "conferido só pelo nome"

export type RotaCpf =
  | { rota: "filiado"; emails: string[] }
  | { rota: "filiado_sem_email" }
  | { rota: "trabalhador" }

type Ficha = {
  id: string
  nome_completo: string | null
  nascimento_data: string | null
  filiacao_condicao: string | null
  email_pessoal: string | null
  email_corporativo: string | null
}

async function fichasDoCpf(cpf: string): Promise<Ficha[]> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("filiacoes")
    .select("id, nome_completo, nascimento_data, filiacao_condicao, email_pessoal, email_corporativo")
    .in("cpf", grafiasDoCpf(cpf))
    .eq("emp_proprietaria_id", await tenantAtual())
    .not("filiacao_excluida", "is", true)
    .order("updated_at", { ascending: false, nullsFirst: false })
    .limit(10)
  return (data ?? []) as Ficha[]
}

// Pela régua de lib/email-cadastro.ts: só ficha com e-mail que recebe conta
// como "com e-mail" — a de e-mail estragado segue o caminho do sem e-mail.
const emailsDe = (fichas: Ficha[]) => emailsDeEnvio(fichas.flatMap((f) => [f.email_pessoal, f.email_corporativo]))

export async function rotaDoCpf(cpf: string): Promise<RotaCpf> {
  const fichas = await fichasDoCpf(cpf)
  if (!fichas.some((f) => f.filiacao_condicao === "Ativo")) return { rota: "trabalhador" }
  const emails = emailsDe(fichas).slice(0, MAX_EMAILS_FILIADO)
  return emails.length > 0 ? { rota: "filiado", emails } : { rota: "filiado_sem_email" }
}

/** A decisão que vale: a da campanha (se a entrada veio de uma), senão o padrão da entidade. */
export async function regraFiliadoSemEmail(campanhaId: string | null): Promise<string> {
  if (campanhaId) {
    const r = await regrasDaCampanha(campanhaId).catch(() => null)
    if (r?.efetivas.filiado_sem_email) return r.efetivas.filiado_sem_email
  }
  const entidade = (await regrasDaEntidade()).regras
  return entidade.filiado_sem_email ?? padraoDaDecisao("filiado_sem_email") ?? "nome_nascimento"
}

export const ERRO_PROCURE_SINDICATO =
  "Seu cadastro de filiado está sem e-mail. Procure o sindicato para cadastrar um e-mail seu e depois volte aqui."
const ERRO_NAO_CONFERE =
  "Os dados informados não conferem com o seu cadastro de filiado. Confira o nome completo e a data de nascimento ou procure o sindicato."
const ERRO_SEM_NASCIMENTO =
  "Seu cadastro de filiado não tem a data de nascimento para conferirmos. Procure o sindicato para cadastrar um e-mail seu e depois volte aqui."

/**
 * Filiado ativo sem e-mail: confere nome e nascimento com a ficha (segundo a
 * regra) e grava o e-mail novo nela, com registro no prontuário. O código de
 * acesso vai depois para esse e-mail — é ele que prova a posse.
 */
export async function liberarFiliadoSemEmail(d: {
  cpf: string
  nome: string
  nascimento: string
  email: string
  regra: string
}): Promise<{ erro?: string; soPeloNome?: boolean }> {
  if (d.regra === "sindicato") return { erro: ERRO_PROCURE_SINDICATO }
  const fichas = await fichasDoCpf(d.cpf)
  const ativas = fichas.filter((f) => f.filiacao_condicao === "Ativo")
  if (ativas.length === 0) return { erro: "Não encontramos filiação ativa para este CPF. Volte e entre como trabalhador." }
  if (emailsDe(fichas).length > 0) {
    return { erro: "Seu cadastro já tem e-mail: volte e peça o código para os e-mails do cadastro." }
  }
  const ficha = ativas.find((f) => nomesConferem(d.nome, f.nome_completo))
  if (!ficha) return { erro: ERRO_NAO_CONFERE }
  const hoje = hojeSP()
  const nascFicha = ficha.nascimento_data ? String(ficha.nascimento_data).slice(0, 10) : null
  const nascConfiavel = nascFicha && motivoNascimentoSuspeito(nascFicha, [], hoje) === null ? nascFicha : null
  let soPeloNome = false
  if (nascConfiavel) {
    if (nascConfiavel !== d.nascimento) return { erro: ERRO_NAO_CONFERE }
  } else if (d.regra === "nome_basta") {
    soPeloNome = true
  } else {
    return { erro: ERRO_SEM_NASCIMENTO }
  }

  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const campos: Record<string, string> = { email_pessoal: d.email }
  // Sem nascimento na ficha: o informado entra (o suspeito não é sobrescrito).
  if (soPeloNome && !nascFicha) campos.nascimento_data = d.nascimento
  const { error } = await admin
    .from("filiacoes")
    .update(campos)
    .eq("id", ficha.id)
    .eq("emp_proprietaria_id", emp)
    .or("email_pessoal.is.null,email_pessoal.eq.")
  if (error) return { erro: "Não foi possível registrar o seu e-mail. Tente de novo." }
  const agora = new Date().toISOString()
  const como = soPeloNome
    ? `Identidade ${MARCA_SO_PELO_NOME} (a ficha não tinha data de nascimento confiável)${campos.nascimento_data ? `; nascimento informado (${d.nascimento.split("-").reverse().join("/")}) gravado na ficha` : ""}`
    : "Identidade conferida por nome e data de nascimento"
  const { error: erroProntuario } = await admin.from("filiacao_prontuario").insert({
    filiacao_id: ficha.id,
    data: agora,
    tipo: "Atualização cadastral",
    descricao: `E-mail pessoal informado pelo próprio filiado ao entrar na Oposição à contribuição: ${d.email}. ${como}. O acesso só se conclui com o código enviado a esse e-mail.`,
    emp_proprietaria_id: emp,
    created_at: agora,
    modified_at: agora,
  })
  if (erroProntuario) console.error("[oposicao] prontuário do e-mail novo não gravado:", erroProntuario.message)
  return { soPeloNome }
}

/** O filiado entrou na oposição conferido só pelo nome (marca no prontuário)? */
export async function entrouSoPeloNome(filiacaoId: string): Promise<boolean> {
  const admin = await createAdminClient()
  const { count } = await admin
    .from("filiacao_prontuario")
    .select("id", { count: "exact", head: true })
    .eq("filiacao_id", filiacaoId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .ilike("descricao", `%${MARCA_SO_PELO_NOME}%`)
  return (count ?? 0) > 0
}
