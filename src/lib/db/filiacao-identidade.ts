import "server-only"

import { cpfConfiavel, formatarCpf, grafiasDoCpf, limparCpf, validarCpf } from "@/lib/cpf"
import { texto } from "@/lib/db/comum"
import { invalidarCacheCadastrosPendentes } from "@/lib/db/filiacao-cadastros-pendentes"
import { normalizarMatricula, proximaMatriculaSindical } from "@/lib/db/filiacao-matricula"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"
import { semAcento } from "@/lib/texto"

/**
 * Identidade do cadastro de filiação: CPF e matrícula sindical.
 *
 * Varredura de 16/09/2026: 507 cadastros com CPF "0" (o perfil de qualquer um
 * juntava todos), 165 CPFs válidos em mais de um cadastro, 10 matrículas
 * sindicais repetidas (2 em pessoas diferentes) e cadastros novos do Confluir
 * nascendo SEM matrícula — o sistema antigo numerava em sequência e o novo não.
 *
 * Regras daqui:
 *  - CPF, quando informado, precisa ser válido e não pode estar em outro
 *    cadastro não excluído (nas duas grafias, com e sem máscara);
 *  - matrícula sindical é da ENTIDADE, não da empresa: sequencial (a próxima
 *    livre), única entre os cadastros não excluídos;
 *  - mesmo nome + mesma data de nascimento em outro cadastro é AVISO, não
 *    bloqueio — homônimos existem; quem cadastra confirma.
 */

export { normalizarMatricula, proximaMatriculaSindical }

export type CadastroParecido = {
  id: string
  nome: string | null
  cpf: string | null
  matricula: string | null
  condicao: string | null
}

/** Cadastros NÃO excluídos com o CPF (qualquer grafia), fora os ignorados. */
async function cadastrosComCpf(cpf: string, ignorarIds: string[]): Promise<CadastroParecido[]> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("filiacoes")
    .select("id, nome_completo, cpf, matricula_sindical, filiacao_condicao")
    .eq("emp_proprietaria_id", await tenantAtual())
    .in("cpf", grafiasDoCpf(cpf))
    .not("filiacao_excluida", "is", true)
  return (data ?? []).filter((f) => !ignorarIds.includes(String(f.id))).map(paraParecido)
}

async function cadastrosComMatricula(matricula: string, ignorarIds: string[]): Promise<CadastroParecido[]> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("filiacoes")
    .select("id, nome_completo, cpf, matricula_sindical, filiacao_condicao")
    .eq("emp_proprietaria_id", await tenantAtual())
    .in("matricula_sindical", [...new Set([matricula, matricula.padStart(5, "0")])])
    .not("filiacao_excluida", "is", true)
  return (data ?? []).filter((f) => !ignorarIds.includes(String(f.id))).map(paraParecido)
}

function paraParecido(f: Record<string, unknown>): CadastroParecido {
  return {
    id: String(f.id),
    nome: texto(f.nome_completo),
    cpf: texto(f.cpf),
    matricula: texto(f.matricula_sindical),
    condicao: texto(f.filiacao_condicao),
  }
}

/** Mesmo nome (sem acento/caixa) e mesma data de nascimento. */
async function cadastrosComNomeENascimento(
  nome: string,
  nascimento: string,
  ignorarIds: string[]
): Promise<CadastroParecido[]> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("filiacoes")
    .select("id, nome_completo, cpf, matricula_sindical, filiacao_condicao")
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("nascimento_data", nascimento)
    .not("filiacao_excluida", "is", true)
    .limit(50)
  const alvo = semAcento(nome).replace(/\s+/g, " ")
  return (data ?? [])
    .filter((f) => !ignorarIds.includes(String(f.id)))
    .filter((f) => semAcento(String(f.nome_completo ?? "")).replace(/\s+/g, " ") === alvo)
    .map(paraParecido)
}

const descrever = (c: CadastroParecido) =>
  `${c.nome ?? "sem nome"}${c.matricula ? `, matrícula ${c.matricula}` : ""}${c.condicao ? ` (${c.condicao})` : ""}`

export type ConferenciaIdentidade = {
  erro?: string
  /** Cadastros que batem nome + nascimento: pede confirmação, não bloqueia. */
  parecidos: CadastroParecido[]
  cpf: string | null
  matricula: string | null
}

/**
 * Confere CPF e matrícula antes de gravar. CPF repetido e matrícula repetida
 * BLOQUEIAM (com o cadastro que já existe na mensagem); nome + nascimento
 * repetidos voltam em `parecidos` para quem cadastra confirmar.
 */
export async function conferirIdentidade(dados: {
  cpf: string | null
  matricula: string | null
  nome?: string | null
  nascimento?: string | null
  ignorarIds?: string[]
  /** CPF em branco é permitido (cadastro antigo); no cadastro novo, não. */
  cpfObrigatorio?: boolean
}): Promise<ConferenciaIdentidade> {
  const ignorar = dados.ignorarIds ?? []
  const cpfDigitado = limparCpf(dados.cpf ?? "")
  const matricula = normalizarMatricula(dados.matricula)
  const vazio = { parecidos: [], cpf: null, matricula }

  if (!cpfDigitado && dados.cpfObrigatorio) return { ...vazio, erro: "Informe o CPF." }
  if (cpfDigitado && !validarCpf(cpfDigitado)) {
    return { ...vazio, erro: `CPF ${formatarCpf(cpfDigitado)} inválido — confira os dígitos.` }
  }
  const cpf = cpfConfiavel(cpfDigitado)

  if (cpf) {
    const mesmos = await cadastrosComCpf(cpf, ignorar)
    if (mesmos.length > 0) {
      return {
        ...vazio,
        cpf,
        erro: `O CPF ${formatarCpf(cpf)} já está no cadastro de ${descrever(mesmos[0])}. Abra esse cadastro — se for a mesma pessoa, adicione o vínculo por lá; se for outra, confira qual dos dois CPFs está errado.`,
      }
    }
  }

  if (matricula) {
    if (matricula.length > 7) {
      return { ...vazio, cpf, erro: `A matrícula sindical ${matricula} tem dígitos demais — parece um CPF ou outro número.` }
    }
    const mesmas = await cadastrosComMatricula(matricula, ignorar)
    if (mesmas.length > 0) {
      return {
        ...vazio,
        cpf,
        erro: `A matrícula sindical ${matricula} já é de ${descrever(mesmas[0])}. Deixe o campo em branco para usar a próxima livre.`,
      }
    }
  }

  const parecidos =
    dados.nome && dados.nascimento
      ? await cadastrosComNomeENascimento(dados.nome, dados.nascimento, ignorar)
      : []
  return { parecidos, cpf, matricula }
}

async function registrarNoProntuario(filiacaoId: string, descricao: string, usuarioId: string | null) {
  const admin = await createAdminClient()
  const agora = new Date().toISOString()
  await admin.from("filiacao_prontuario").insert({
    filiacao_id: filiacaoId,
    data: agora,
    tipo: "Atualização cadastral",
    descricao,
    diretor_funcionario_id: usuarioId,
    emp_proprietaria_id: await tenantAtual(),
    created_at: agora,
    modified_at: agora,
  })
}

/**
 * Corrige CPF e/ou matrícula sindical de um cadastro — a tela comum de
 * edição não mexe nesses campos. Fica registrado no prontuário o antes e o
 * depois.
 */
export async function corrigirIdentidade(
  id: string,
  novo: { cpf: string; matricula: string },
  usuarioId: string | null
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { data: atual } = await admin
    .from("filiacoes")
    .select("cpf, matricula_sindical, nome_completo, nascimento_data")
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (!atual) return { erro: "Cadastro não encontrado." }

  const conferencia = await conferirIdentidade({
    cpf: novo.cpf,
    matricula: novo.matricula,
    ignorarIds: [id],
  })
  if (conferencia.erro) return { erro: conferencia.erro }

  const cpfAntes = texto(atual.cpf)
  const matriculaAntes = texto(atual.matricula_sindical)
  const cpfDepois = conferencia.cpf
  const matriculaDepois = conferencia.matricula
  if (cpfAntes === cpfDepois && normalizarMatricula(matriculaAntes) === matriculaDepois) {
    return { erro: "Nada mudou." }
  }
  if (matriculaAntes && !matriculaDepois) {
    return { erro: "A matrícula sindical não pode ficar em branco depois de atribuída." }
  }

  const { error } = await admin
    .from("filiacoes")
    .update({
      cpf: cpfDepois,
      matricula_sindical: matriculaDepois,
      matricula_sindical_numero: matriculaDepois ? Number(matriculaDepois) : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
  if (error) return { erro: `Falha ao gravar: ${error.message}` }

  const mudancas = [
    cpfAntes !== cpfDepois
      ? `CPF: ${cpfAntes ? `"${cpfAntes}"` : "em branco"} → ${cpfDepois ? formatarCpf(cpfDepois) : "em branco"}`
      : null,
    normalizarMatricula(matriculaAntes) !== matriculaDepois
      ? `matrícula sindical: ${matriculaAntes ?? "em branco"} → ${matriculaDepois ?? "em branco"}`
      : null,
  ].filter(Boolean)
  await registrarNoProntuario(id, `Identidade corrigida — ${mudancas.join("; ")}.`, usuarioId)
  invalidarCacheCadastrosPendentes()
  return {}
}

/**
 * Grava a matrícula sindical automática num cadastro recém-criado. Sem índice
 * único ainda (ver supabase/filiacoes-matricula-unica.sql), confere de novo
 * depois de gravar e tenta o número seguinte se outro cadastro pegou o mesmo.
 */
export async function atribuirMatriculaSindical(id: string): Promise<string | null> {
  const admin = await createAdminClient()
  for (let tentativa = 0; tentativa < 5; tentativa++) {
    const numero = (await proximaMatriculaSindical()) + tentativa
    const matricula = String(numero)
    const { error } = await admin
      .from("filiacoes")
      .update({ matricula_sindical: matricula, matricula_sindical_numero: numero })
      .eq("id", id)
      .is("matricula_sindical", null)
    if (error) {
      if (error.code === "23505") continue
      return null
    }
    const outros = await cadastrosComMatricula(matricula, [id])
    if (outros.length === 0) return matricula
    await admin
      .from("filiacoes")
      .update({ matricula_sindical: null, matricula_sindical_numero: null })
      .eq("id", id)
  }
  return null
}
