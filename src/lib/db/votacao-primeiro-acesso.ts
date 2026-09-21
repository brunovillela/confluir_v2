import "server-only"

import { limparCpf, validarCpf } from "@/lib/cpf"
import { escopoAptos, filtroAptos } from "@/lib/db/votacao-escopo"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"
import { semAcento } from "@/lib/texto"

/**
 * Primeiro acesso do eleitor que entrou pelo E-MAIL CORPORATIVO.
 *
 * As empregadoras não mandam CPF na lista de aptos (LGPD). Sem CPF, a mesma
 * pessoa pode estar na lista duas vezes — pelo e-mail corporativo e pelo CPF,
 * vinda de outra fonte — e votar por cada porta. Por isso, antes da cédula, o
 * eleitor informa CPF, nome completo e data de nascimento.
 *
 * Conferência (a da Receita exigiria contratar o Serpro — Consulta CPF ou
 * Datavalid; aqui é a que dá para fazer com a base da entidade):
 *  1. CPF com dígitos válidos, nome com nome e sobrenome, nascimento plausível;
 *  2. se o CPF é de um FILIADO, nome e nascimento têm de bater com o cadastro;
 *  3. se o CPF já está em OUTRO apto da votação: se esse outro já votou, não
 *     abre; se não votou, só junta quando a identidade confere (filiado
 *     conferido no passo 2, ou o nome do outro apto bate). Senão, marca o
 *     conflito para a gestão e não abre a cédula.
 * Ao juntar, o CPF é gravado no apto do e-mail — e as duas portas de votação
 * passam a enxergar a mesma pessoa (a trava de voto único é por CPF ou e-mail).
 */

type AptoLinha = {
  id: string
  cpf: string | null
  nome_completo: string | null
  hora_voto: string | null
  presenca_em: string | null
  rod_assembleia_id: string | null
}

/** Os aptos desta assembleia com aquele e-mail corporativo. */
async function aptosDoEmail(email: string, assembleiaId: string): Promise<AptoLinha[]> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("voto_assembleias_aptos")
    .select("id, cpf, nome_completo, hora_voto, presenca_em, rod_assembleia_id")
    .eq("emp_proprietaria_id", await tenantAtual())
    .or(filtroAptos(await escopoAptos(assembleiaId)))
    .eq("email_corporativo", email.trim().toLowerCase())
  return (data ?? []) as AptoLinha[]
}

/** O eleitor do e-mail ainda precisa informar os dados? (nenhum apto com CPF) */
export async function precisaInformarDados(email: string, assembleiaId: string): Promise<boolean> {
  const aptos = await aptosDoEmail(email, assembleiaId)
  return aptos.length > 0 && aptos.every((a) => !a.cpf)
}

/** "Maria da Silva Souza" ~ "MARIA SOUZA": primeiro e último nome batem. */
export function nomesConferem(a: string | null, b: string | null): boolean {
  const partes = (v: string | null) =>
    semAcento(v ?? "")
      .replace(/[^a-z ]/g, " ")
      .split(/\s+/)
      .filter((p) => p.length > 1 && !["de", "da", "do", "das", "dos", "e"].includes(p))
  const pa = partes(a)
  const pb = partes(b)
  if (pa.length < 2 || pb.length < 2) return false
  return pa[0] === pb[0] && pa[pa.length - 1] === pb[pb.length - 1]
}

function nascimentoValido(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  const d = new Date(`${v}T12:00:00Z`)
  if (Number.isNaN(d.getTime())) return false
  const idade = (Date.now() - d.getTime()) / (365.25 * 86400000)
  return idade >= 14 && idade <= 110
}

export async function registrarDadosEleitor(dados: {
  email: string
  assembleiaId: string
  cpf: string
  nome: string
  nascimento: string
}): Promise<{ erro?: string }> {
  const cpf = limparCpf(dados.cpf)
  const nome = dados.nome.trim().replace(/\s+/g, " ")
  if (!validarCpf(cpf)) return { erro: "CPF inválido — confira os números." }
  if (nome.split(" ").filter((p) => p.length > 1).length < 2) {
    return { erro: "Informe o nome completo, com sobrenome." }
  }
  if (!nascimentoValido(dados.nascimento)) return { erro: "Informe uma data de nascimento válida." }

  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const meus = await aptosDoEmail(dados.email, dados.assembleiaId)
  if (meus.length === 0) return { erro: "Este e-mail não está na lista de aptos desta votação." }
  if (meus.some((a) => a.cpf)) return {} // já informado antes
  const meusIds = meus.map((a) => a.id)
  const rodadaId = meus.find((a) => a.rod_assembleia_id)?.rod_assembleia_id ?? null

  const marcarConflito = async (motivo: string) => {
    await admin
      .from("voto_assembleias_aptos")
      .update({ cpf_conflito: cpf, conflito_motivo: motivo, conflito_em: new Date().toISOString() })
      .in("id", meusIds)
  }

  // 2. CPF de filiado: nome e nascimento têm de bater com o cadastro.
  const { data: filiado } = await admin
    .from("filiacoes")
    .select("id, nome_completo, nascimento_data")
    .eq("emp_proprietaria_id", emp)
    .eq("cpf", cpf)
    .limit(1)
    .maybeSingle()
  let identidadeConferida = false
  if (filiado) {
    const nomeOk = nomesConferem(nome, filiado.nome_completo as string | null)
    const nascCadastro = filiado.nascimento_data ? String(filiado.nascimento_data).slice(0, 10) : null
    const nascOk = !nascCadastro || nascCadastro === dados.nascimento
    if (!nomeOk || !nascOk) {
      await marcarConflito("Nome ou nascimento não conferem com o cadastro de filiado deste CPF.")
      return {
        erro: "Os dados informados não conferem com o cadastro da entidade para este CPF. Procure o sindicato para liberar o seu voto.",
      }
    }
    identidadeConferida = true
  }

  // 3. CPF já em OUTRO apto da mesma votação.
  let consulta = admin
    .from("voto_assembleias_aptos")
    .select("id, cpf, nome_completo, hora_voto, presenca_em, rod_assembleia_id")
    .eq("emp_proprietaria_id", emp)
    .eq("cpf", cpf)
  consulta = rodadaId
    ? consulta.eq("rod_assembleia_id", rodadaId)
    : consulta.eq("assembleia_id", dados.assembleiaId)
  const { data: outros } = await consulta
  const concorrentes = ((outros ?? []) as AptoLinha[]).filter((o) => !meusIds.includes(o.id))
  if (concorrentes.some((o) => o.hora_voto || o.presenca_em)) {
    await marcarConflito("Já havia voto registrado para este CPF em outro apto da votação.")
    return { erro: "Já há voto registrado para este CPF nesta votação. Procure o sindicato se não foi você." }
  }
  if (
    concorrentes.length > 0 &&
    !identidadeConferida &&
    !concorrentes.some((o) => nomesConferem(nome, o.nome_completo))
  ) {
    await marcarConflito("CPF já está em outro apto da votação com outro nome.")
    return {
      erro: "Este CPF já está na lista de aptos com outro cadastro. Procure o sindicato para conferir.",
    }
  }

  // Tudo certo: grava o CPF (e o que foi declarado) nos aptos do e-mail.
  const agora = new Date().toISOString()
  const completos = {
    cpf,
    nome_informado: nome,
    nascimento_informado: dados.nascimento,
    dados_informados_em: agora,
    cpf_conflito: null,
    conflito_motivo: null,
    conflito_em: null,
    updated_at: agora,
  }
  let { error } = await admin.from("voto_assembleias_aptos").update(completos).in("id", meusIds)
  // Sem o SQL do primeiro acesso as colunas novas não existem: grava só o CPF.
  if (error?.code === "PGRST204") {
    ;({ error } = await admin.from("voto_assembleias_aptos").update({ cpf, updated_at: agora }).in("id", meusIds))
  }
  if (error) return { erro: `Não foi possível salvar os seus dados: ${error.message}` }

  // Nome vazio no apto: completa com o declarado (a lista da empresa vem crua).
  await admin
    .from("voto_assembleias_aptos")
    .update({ nome_completo: nome })
    .in("id", meusIds)
    .is("nome_completo", null)
  return {}
}
