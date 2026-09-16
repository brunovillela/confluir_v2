import "server-only"
import { cpfConfiavel } from "@/lib/cpf"

import { esquemaAusente, texto } from "@/lib/db/comum"
import { MAX_CONTATOS_EMERGENCIA, VINCULOS_EMERGENCIA } from "@/lib/filiacao"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Contatos de emergência do filiado — nome, telefone e vínculo. São da
 * PESSOA: a leitura vai pelo CPF (todos os registros dela em `filiacoes`) e,
 * sem CPF, pelo registro. Editados pela gestão da filiação (ficha) e pelo
 * próprio filiado (portal). SQL: supabase/filiacao-contatos-emergencia.sql.
 */

export type ContatoEmergencia = {
  id: string
  nome: string
  telefone: string
  vinculo: string | null
  origem: "painel" | "portal"
}

/** A pessoa: CPF (preferido) e o registro de filiação de referência. */
export type PessoaFiliada = { cpf: string | null; filiadoId: string }

const TABELA = "filiacao_contatos_emergencia"
export const AVISO_SQL_EMERGENCIA =
  "Contatos de emergência indisponíveis — rode supabase/filiacao-contatos-emergencia.sql no Supabase."

const digitos = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "")

export async function listarContatosEmergencia(
  pessoa: PessoaFiliada
): Promise<{ disponivel: boolean; contatos: ContatoEmergencia[] }> {
  const admin = await createAdminClient()
  // Sem CPF confiável, os contatos são do cadastro, não "da pessoa".
  const cpf = cpfConfiavel(pessoa.cpf)
  let consulta = admin
    .from(TABELA)
    .select("id, nome, telefone, vinculo, origem")
    .eq("emp_proprietaria_id", await tenantAtual())
  consulta = cpf ? consulta.eq("cpf", cpf) : consulta.eq("filiado_id", pessoa.filiadoId)
  const { data, error } = await consulta.order("created_at", { ascending: true })
  if (error) {
    if (esquemaAusente(error)) return { disponivel: false, contatos: [] }
    throw new Error(`Falha ao listar contatos de emergência: ${error.message}`)
  }
  return {
    disponivel: true,
    contatos: (data ?? []).map((c) => ({
      id: String(c.id),
      nome: texto(c.nome) ?? "",
      telefone: texto(c.telefone) ?? "",
      vinculo: texto(c.vinculo),
      origem: c.origem === "portal" ? "portal" : "painel",
    })),
  }
}

/** Valida o formulário; devolve os dados limpos ou a mensagem de erro. */
export function lerContatoEmergencia(
  formData: FormData
): { erro: string } | { dados: { nome: string; telefone: string; vinculo: string } } {
  const nome = String(formData.get("nome") ?? "").replace(/\s+/g, " ").trim()
  const telefone = digitos(String(formData.get("telefone") ?? ""))
  const vinculo = String(formData.get("vinculo") ?? "").trim()
  if (nome.length < 2) return { erro: "Informe o nome do contato." }
  if (nome.length > 120) return { erro: "O nome ficou longo demais." }
  if (telefone.length < 10 || telefone.length > 11) {
    return { erro: "Informe o telefone com DDD, ex.: (22) 99999-9999." }
  }
  if (!(VINCULOS_EMERGENCIA as readonly string[]).includes(vinculo)) {
    return { erro: "Escolha o vínculo com o filiado." }
  }
  return { dados: { nome, telefone, vinculo } }
}

/** Cria (sem `id`) ou atualiza um contato da pessoa. */
export async function salvarContatoEmergencia(p: {
  pessoa: PessoaFiliada
  id?: string | null
  dados: { nome: string; telefone: string; vinculo: string }
  origem: "painel" | "portal"
  usuarioId?: string | null
}): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const cpf = digitos(p.pessoa.cpf) || null

  if (p.id) {
    // Só atualiza contato desta mesma pessoa (o id veio do formulário).
    const { contatos, disponivel } = await listarContatosEmergencia(p.pessoa)
    if (!disponivel) return { erro: AVISO_SQL_EMERGENCIA }
    if (!contatos.some((c) => c.id === p.id)) return { erro: "Contato não encontrado." }
    const { error } = await admin
      .from(TABELA)
      .update({
        ...p.dados,
        origem: p.origem,
        atualizado_por: p.usuarioId ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", p.id)
      .eq("emp_proprietaria_id", emp)
    if (error) return { erro: `Falha ao salvar o contato: ${error.message}` }
    return {}
  }

  const { contatos, disponivel } = await listarContatosEmergencia(p.pessoa)
  if (!disponivel) return { erro: AVISO_SQL_EMERGENCIA }
  if (contatos.length >= MAX_CONTATOS_EMERGENCIA) {
    return { erro: `Cada filiado pode ter até ${MAX_CONTATOS_EMERGENCIA} contatos de emergência.` }
  }
  const { error } = await admin.from(TABELA).insert({
    ...p.dados,
    emp_proprietaria_id: emp,
    filiado_id: p.pessoa.filiadoId,
    cpf,
    origem: p.origem,
    atualizado_por: p.usuarioId ?? null,
  })
  if (error) return { erro: `Falha ao adicionar o contato: ${error.message}` }
  return {}
}

export async function excluirContatoEmergencia(
  pessoa: PessoaFiliada,
  id: string
): Promise<{ erro?: string }> {
  const { contatos, disponivel } = await listarContatosEmergencia(pessoa)
  if (!disponivel) return { erro: AVISO_SQL_EMERGENCIA }
  if (!contatos.some((c) => c.id === id)) return { erro: "Contato não encontrado." }
  const admin = await createAdminClient()
  const { error } = await admin
    .from(TABELA)
    .delete()
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: `Falha ao excluir o contato: ${error.message}` }
  return {}
}
