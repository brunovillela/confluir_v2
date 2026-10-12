import "server-only"

import { cpfConfiavel, grafiasDoCpf } from "@/lib/cpf"
import { texto } from "@/lib/db/comum"
import { listarTermos, type TermoVersao } from "@/lib/db/filiacao-termos"
import { formaRecebimento, type FormaRecebimento } from "@/lib/filiacao"
import { formatarData } from "@/lib/formato"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Consentimentos do titular para a página LGPD do portal (A35/A71).
 *
 * O aceite é gravado contra o termo VERSIONADO da entidade
 * (`filiacao_tl_lgpd`/`filiacao_tl_desconto`, uma linha `em_vigor` por tipo):
 * o id fica no cadastro (`filiacoes.tl_lgpd_id`, pela ficha pública e pela
 * migração) e no livro de aceites (`filiacao_tl_aceites`, pelo portal). Esta
 * leitura junta as versões do tenant e o que o cadastro guarda, para a tela
 * mostrar exatamente o texto aceito — ou o que será aceito.
 */

export type ConsentimentosDoCadastro = {
  /** Versão aceita gravada no cadastro (null em aceites legados sem versão). */
  lgpdId: string | null
  descontoId: string | null
  /** Como a pessoa contribui; null = não informado (cadastros migrados). */
  forma: FormaRecebimento | null
}

/** O que os registros do CPF guardam (o mais recente primeiro; vale o primeiro preenchido). */
export async function consentimentosDoCadastro(cpfBruto: string): Promise<ConsentimentosDoCadastro> {
  const vazio = { lgpdId: null, descontoId: null, forma: null }
  const cpf = cpfConfiavel(cpfBruto)
  if (!cpf) return vazio
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("filiacoes")
    .select("tl_lgpd_id, tl_desconto_id, forma_recebimento")
    .in("cpf", grafiasDoCpf(cpf))
    .eq("emp_proprietaria_id", await tenantAtual())
    .not("filiacao_excluida", "is", true)
    .order("updated_at", { ascending: false, nullsFirst: false })
  if (error) return vazio
  const linhas = data ?? []
  return {
    lgpdId: linhas.map((l) => texto(l.tl_lgpd_id)).find(Boolean) ?? null,
    descontoId: linhas.map((l) => texto(l.tl_desconto_id)).find(Boolean) ?? null,
    forma: linhas.map((l) => formaRecebimento(l.forma_recebimento)).find(Boolean) ?? null,
  }
}

/** Versões dos dois termos do tenant; sem tabela ou sem termo, listas vazias. */
export async function versoesDosTermos(): Promise<{ lgpd: TermoVersao[]; desconto: TermoVersao[] }> {
  const [lgpd, desconto] = await Promise.all([
    listarTermos("lgpd").catch(() => [] as TermoVersao[]),
    listarTermos("desconto").catch(() => [] as TermoVersao[]),
  ])
  return { lgpd, desconto }
}

/** Termo em vigor do tipo (com texto) — o que um aceite novo registra. */
export function termoVigente(versoes: TermoVersao[]): TermoVersao | null {
  return versoes.find((v) => v.emVigor && v.texto) ?? null
}

/**
 * Dia (em São Paulo) de um timestamp. `formatarData` lê só o AAAA-MM-DD do
 * início da string — de um timestamptz em UTC, à noite, sairia o dia seguinte.
 */
function diaSP(timestamp: string): string {
  const d = new Date(timestamp)
  if (Number.isNaN(d.getTime())) return formatarData(timestamp)
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo" }).format(d)
}

/** "versão LGPD-2026, de 02/08/2026" — o código e a data em que a versão foi criada. */
export function rotuloVersao(v: TermoVersao | null): string {
  if (!v) return "versão não identificada"
  if (v.codigo && v.created_at) return `versão ${v.codigo}, de ${diaSP(v.created_at)}`
  if (v.codigo) return `versão ${v.codigo}`
  if (v.created_at) return `versão de ${diaSP(v.created_at)}`
  return "versão sem código"
}
