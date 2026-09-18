import "server-only"

import { cpfConfiavel, grafiasDoCpf } from "@/lib/cpf"
import { texto } from "@/lib/db/comum"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Edição do cadastro do funcionário no Pessoal (pedido do Bruno, 18/09/2026):
 * dados cadastrais, cada vínculo com a entidade (inclusive o desligamento, pela
 * data de demissão) e a exclusão do vínculo de quem NUNCA fez parte da entidade
 * — recusada quando há contracheque, ponto ou férias (a mesma trava do Quadro).
 */

const RE_DATA = /^\d{4}-\d{2}-\d{2}$/
const data = (v: string | null | undefined) => (v && RE_DATA.test(v) ? v : null)

export type DadosVinculo = {
  cargo: string | null
  lotacao: string | null
  regime: string | null
  matricula: string | null
  admissao: string | null
  demissao: string | null
}

async function vinculoDaEntidade(vinculoId: string) {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data: v } = await admin
    .from("vinculos_trabalhistas")
    .select("id, trabalhador_id, contrato_admissao")
    .eq("id", vinculoId)
    .eq("empregador_id", emp)
    .maybeSingle()
  return { admin, emp, v }
}

export async function atualizarVinculoFuncionario(
  vinculoId: string,
  dados: DadosVinculo
): Promise<{ erro?: string; ok?: string }> {
  const { admin, emp, v } = await vinculoDaEntidade(vinculoId)
  if (!v) return { erro: "Vínculo não encontrado." }
  const admissao = data(dados.admissao)
  const demissao = data(dados.demissao)
  if (admissao && demissao && demissao < admissao) {
    return { erro: "A data de desligamento não pode ser antes da admissão." }
  }
  const { error } = await admin
    .from("vinculos_trabalhistas")
    .update({
      cargo: dados.cargo,
      lotacao: dados.lotacao,
      regime_trabalho: dados.regime,
      matricula: dados.matricula,
      contrato_admissao: admissao,
      contrato_demissao: demissao,
    })
    .eq("id", vinculoId)
    .eq("empregador_id", emp)
  if (error) return { erro: `Não foi possível salvar o vínculo: ${error.message}` }
  return { ok: demissao ? "Vínculo salvo — desligado." : "Vínculo salvo." }
}

/**
 * Exclui o vínculo de quem nunca trabalhou na entidade. Com contracheque, ponto
 * ou férias no Pessoal, recusa: a pessoa trabalha ou trabalhou aqui — o caminho
 * é o desligamento. Sem vínculo restante, a classificação de trabalho sai do
 * quadro (diretor continua diretor).
 */
export async function excluirVinculoFuncionario(
  vinculoId: string
): Promise<{ erro?: string; ok?: string; restantes?: number }> {
  const { admin, emp, v } = await vinculoDaEntidade(vinculoId)
  if (!v || !v.trabalhador_id) return { erro: "Vínculo não encontrado." }
  const pessoa = String(v.trabalhador_id)
  const [c, p, f] = await Promise.all([
    admin.from("pessoal_contracheques").select("id", { count: "exact", head: true }).eq("funcionario_id", pessoa),
    admin.from("pessoal_registro_ponto").select("id", { count: "exact", head: true }).eq("funcionario_id", pessoa),
    admin.from("pessoal_ferias").select("id", { count: "exact", head: true }).eq("trabalhador_id", pessoa),
  ])
  const registros = (c.count ?? 0) + (p.count ?? 0) + (f.count ?? 0)
  if (registros > 0) {
    return {
      erro: `Há ${registros} registro(s) de contracheque, ponto ou férias desta pessoa no Pessoal — ela trabalha ou trabalhou na entidade. O vínculo não foi excluído; para quem saiu, preencha a data de desligamento.`,
    }
  }
  const { error } = await admin
    .from("vinculos_trabalhistas")
    .delete()
    .eq("id", vinculoId)
    .eq("empregador_id", emp)
  if (error) return { erro: `Não foi possível excluir o vínculo: ${error.message}` }

  const { count: restantes } = await admin
    .from("vinculos_trabalhistas")
    .select("id", { count: "exact", head: true })
    .eq("trabalhador_id", pessoa)
    .eq("empregador_id", emp)
  if ((restantes ?? 0) === 0) {
    await admin
      .from("usuarios")
      .update({ vinculo_instituicao: null, updated_at: new Date().toISOString() })
      .eq("id", pessoa)
      .eq("emp_proprietaria_id", emp)
      .neq("vinculo_instituicao", "Diretor(a)")
  }
  return {
    ok:
      (restantes ?? 0) === 0
        ? "Vínculo excluído. A pessoa não tinha outro vínculo com a entidade e saiu do Pessoal."
        : "Vínculo excluído.",
    restantes: restantes ?? 0,
  }
}

export type DadosCadastraisFuncionario = {
  nomeCompleto: string
  nomeGuerra: string | null
  cpf: string | null
  dataNascimento: string | null
  whatsapp: string | null
}

export async function obterDadosCadastrais(usuarioId: string): Promise<DadosCadastraisFuncionario | null> {
  const admin = await createAdminClient()
  const { data: u } = await admin
    .from("usuarios")
    .select("nome_completo, nome_guerra, cpf, data_nascimento, whatsapp")
    .eq("id", usuarioId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (!u) return null
  return {
    nomeCompleto: texto(u.nome_completo) ?? "",
    nomeGuerra: texto(u.nome_guerra),
    cpf: texto(u.cpf),
    dataNascimento: texto(u.data_nascimento),
    whatsapp: texto(u.whatsapp),
  }
}

/** Dados cadastrais do funcionário (o e-mail não: é o login). */
export async function atualizarDadosCadastrais(
  usuarioId: string,
  dados: DadosCadastraisFuncionario
): Promise<{ erro?: string; ok?: string }> {
  const nome = dados.nomeCompleto.trim().replace(/\s+/g, " ")
  if (nome.split(" ").length < 2) return { erro: "Informe o nome completo." }
  let cpf: string | null = null
  if (dados.cpf && dados.cpf.replace(/\D/g, "")) {
    cpf = cpfConfiavel(dados.cpf)
    if (!cpf) return { erro: "CPF inválido. Confira os dígitos." }
  }
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  if (cpf) {
    const { data: outro } = await admin
      .from("usuarios")
      .select("nome_completo")
      .eq("emp_proprietaria_id", emp)
      .in("cpf", grafiasDoCpf(cpf))
      .neq("id", usuarioId)
      .not("deletado", "is", true)
      .limit(1)
      .maybeSingle()
    if (outro) {
      return { erro: `Este CPF já está no cadastro de ${texto(outro.nome_completo) ?? "outra pessoa"}.` }
    }
  }
  const { error } = await admin
    .from("usuarios")
    .update({
      nome_completo: nome,
      nome_guerra: dados.nomeGuerra?.trim() || null,
      cpf,
      data_nascimento: data(dados.dataNascimento),
      whatsapp: dados.whatsapp?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", usuarioId)
    .eq("emp_proprietaria_id", emp)
  if (error) return { erro: `Não foi possível salvar: ${error.message}` }
  return { ok: "Dados cadastrais salvos." }
}
