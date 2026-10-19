import "server-only"

import { cpfConfiavel, grafiasDoCpf } from "@/lib/cpf"
import { texto } from "@/lib/db/comum"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Edição do cadastro do funcionário no Pessoal (pedido do Bruno, 18/09/2026):
 * dados cadastrais, cada vínculo com a entidade (inclusive o desligamento, pela
 * data de demissão) e a exclusão do vínculo — e, desde 19/10, do funcionário
 * inteiro — de quem NUNCA fez parte da entidade: recusada quando há qualquer
 * lançamento no Pessoal (ver LANCAMENTOS).
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
 * Lançamentos do funcionário no Pessoal — o que prova que a pessoa trabalha
 * ou trabalhou na entidade. Com qualquer um deles, nem o vínculo nem o
 * funcionário são excluídos: o caminho é o desligamento. Configuração (função,
 * jornada, GHE, dependentes) não conta: sai junto na exclusão.
 */
// semTenant: tabela sem emp_proprietaria_id — o funcionário (já do tenant) isola.
const LANCAMENTOS: { tabela: string; coluna: string; rotulo: string; plural: string; semTenant?: true }[] = [
  { tabela: "pessoal_contracheques", coluna: "funcionario_id", rotulo: "contracheque", plural: "contracheques", semTenant: true },
  { tabela: "pessoal_registro_ponto", coluna: "funcionario_id", rotulo: "registro de ponto", plural: "registros de ponto", semTenant: true },
  { tabela: "pessoal_ferias", coluna: "trabalhador_id", rotulo: "período de férias", plural: "períodos de férias" },
  { tabela: "pessoal_ferias_gozo", coluna: "funcionario_id", rotulo: "gozo de férias", plural: "gozos de férias" },
  { tabela: "pessoal_informes_rendimentos", coluna: "funcionario_id", rotulo: "informe de rendimentos", plural: "informes de rendimentos" },
  { tabela: "pessoal_diarias_solicitacoes", coluna: "funcionario_id", rotulo: "diária", plural: "diárias" },
  { tabela: "pessoal_diarias_remessas", coluna: "beneficiario_id", rotulo: "remessa de diárias", plural: "remessas de diárias" },
  { tabela: "pessoal_reembolsos_act", coluna: "funcionario_id", rotulo: "reembolso do ACT", plural: "reembolsos do ACT" },
  { tabela: "pessoal_faltas_justificadas", coluna: "funcionario_id", rotulo: "falta justificada", plural: "faltas justificadas" },
  { tabela: "pes_atestados_medicos", coluna: "funcionario_id", rotulo: "atestado médico", plural: "atestados médicos", semTenant: true },
  { tabela: "pessoal_ausencias", coluna: "funcionario_id", rotulo: "ausência", plural: "ausências" },
  { tabela: "aso", coluna: "funcionario_id", rotulo: "ASO", plural: "ASOs", semTenant: true },
  { tabela: "pessoal_treinamentos_alunos", coluna: "aluno_id", rotulo: "treinamento", plural: "treinamentos" },
  { tabela: "pessoal_nivel_salarial", coluna: "funcionario_id", rotulo: "lançamento de nível salarial", plural: "lançamentos de nível salarial" },
  { tabela: "pessoal_anuenio", coluna: "funcionario_id", rotulo: "lançamento de anuênio", plural: "lançamentos de anuênio" },
  { tabela: "pessoal_atividades_executores", coluna: "funcionario_id", rotulo: "atividade avaliada (SST)", plural: "atividades avaliadas (SST)" },
  { tabela: "pessoal_plano_saude", coluna: "titular_id", rotulo: "plano de saúde", plural: "planos de saúde" },
]

/** Configuração do funcionário no Pessoal — sai junto quando ele é excluído. */
const CONFIGURACAO: { tabela: string; coluna: string }[] = [
  { tabela: "pessoal_funcionario_funcao", coluna: "funcionario_id" },
  { tabela: "pessoal_funcionario_jornada", coluna: "funcionario_id" },
  { tabela: "pessoal_ghe_membros", coluna: "funcionario_id" },
  { tabela: "pessoal_dependentes", coluna: "funcionario_id" },
]

export type LancamentoFuncionario = { rotulo: string; quantidade: number }

export async function lancamentosDoFuncionario(usuarioId: string): Promise<LancamentoFuncionario[]> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const contagens = await Promise.all(
    LANCAMENTOS.map(async (l) => {
      let q = admin.from(l.tabela).select("id", { count: "exact", head: true }).eq(l.coluna, usuarioId)
      if (!l.semTenant) q = q.eq("emp_proprietaria_id", emp)
      const { count, error } = await q
      // Tabela ausente num tenant não trava; erro de verdade, sim (fail closed).
      if (error && !/does not exist|schema cache/i.test(error.message)) {
        throw new Error(`Falha ao conferir ${l.rotulo}: ${error.message}`)
      }
      return { rotulo: (count ?? 0) === 1 ? l.rotulo : l.plural, quantidade: count ?? 0 }
    })
  )
  return contagens.filter((c) => c.quantidade > 0)
}

/** "3 contracheques, 1 período de férias" — para a mensagem de recusa. */
export function descreverLancamentos(lista: LancamentoFuncionario[]): string {
  return lista.map((l) => `${l.quantidade} ${l.rotulo}`).join(", ")
}

/**
 * Exclui o vínculo de quem nunca trabalhou na entidade. Com lançamento no
 * Pessoal, recusa: a pessoa trabalha ou trabalhou aqui — o caminho é o
 * desligamento. Sem vínculo restante, a classificação de trabalho sai do
 * quadro (diretor continua diretor).
 */
export async function excluirVinculoFuncionario(
  vinculoId: string
): Promise<{ erro?: string; ok?: string; restantes?: number }> {
  const { admin, emp, v } = await vinculoDaEntidade(vinculoId)
  if (!v || !v.trabalhador_id) return { erro: "Vínculo não encontrado." }
  const pessoa = String(v.trabalhador_id)
  const lancamentos = await lancamentosDoFuncionario(pessoa)
  if (lancamentos.length > 0) {
    return {
      erro: `Esta pessoa tem lançamentos no Pessoal (${descreverLancamentos(lancamentos)}) — ela trabalha ou trabalhou na entidade. O vínculo não foi excluído; para quem saiu, preencha a data de desligamento.`,
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

/**
 * Exclui o FUNCIONÁRIO do Pessoal (pedido de 19/10): todos os vínculos dele
 * com a entidade e a configuração do Pessoal (função, jornada, GHE,
 * dependentes). Só quando não há nenhum lançamento — com contracheque, férias,
 * ponto etc. a pessoa trabalhou aqui e o caminho é o desligamento.
 *
 * O cadastro da PESSOA (usuarios) fica: pode ser filiado, diretor ou ter
 * login — só a classificação de trabalho sai (diretor continua diretor).
 */
export async function excluirFuncionario(usuarioId: string): Promise<{ erro?: string; ok?: string }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data: pessoa } = await admin
    .from("usuarios")
    .select("id, nome_completo")
    .eq("id", usuarioId)
    .eq("emp_proprietaria_id", emp)
    .maybeSingle()
  if (!pessoa) return { erro: "Funcionário não encontrado." }

  const lancamentos = await lancamentosDoFuncionario(usuarioId)
  if (lancamentos.length > 0) {
    return {
      erro: `Não dá para excluir: há lançamentos no Pessoal (${descreverLancamentos(lancamentos)}). Para quem saiu da entidade, preencha a data de desligamento no vínculo.`,
    }
  }

  for (const c of CONFIGURACAO) {
    const { error } = await admin.from(c.tabela).delete().eq(c.coluna, usuarioId).eq("emp_proprietaria_id", emp)
    if (error && !/does not exist|schema cache/i.test(error.message)) {
      return { erro: `Não foi possível excluir (${c.tabela}): ${error.message}` }
    }
  }
  const { error } = await admin
    .from("vinculos_trabalhistas")
    .delete()
    .eq("trabalhador_id", usuarioId)
    .eq("empregador_id", emp)
  if (error) return { erro: `Não foi possível excluir os vínculos: ${error.message}` }
  await admin
    .from("usuarios")
    .update({ vinculo_instituicao: null, updated_at: new Date().toISOString() })
    .eq("id", usuarioId)
    .eq("emp_proprietaria_id", emp)
    .neq("vinculo_instituicao", "Diretor(a)")
  return { ok: `${texto(pessoa.nome_completo) ?? "O funcionário"} foi excluído do Pessoal.` }
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
