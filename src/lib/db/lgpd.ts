import "server-only"

import { cpfConfiavel, grafiasDoCpf } from "@/lib/cpf"
import { esquemaAusente, hojeSP } from "@/lib/db/comum"
import { cifrarRelatorio, sigiloConfigurado } from "@/lib/saude-sigilo"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * LGPD executável (onda 1, S16) — ver supabase/lgpd-execucao.sql.
 *  - anonimizarFiliacao: direito ao esquecimento, pela gestão.
 *  - registrarAceiteTermo / historicoAceites: consentimento versionado.
 *  - dadosDoTitular: portabilidade (tudo que o sistema tem sobre a pessoa).
 */

export type ResumoAnonimizacao = {
  filiacoes: number
  telefones: number
  enderecos: number
  dados_bancarios: number
  contatos_emergencia: number
  identidades_acesso: number
  aceites: number
  saude_desvinculados: number
  contas_apagadas: number
}

const RETIDOS =
  "Linha da filiação sem identificadores (integridade referencial, matrícula e estatística); vínculos de filiação e histórico de contribuições; prontuário administrativo; acervo de saúde ocupacional com identificadores cifrados."
const BASE_LEGAL =
  "LGPD art. 16, I (conservação para cumprimento de obrigação legal) e art. 11, II, a (dado de saúde sob obrigação legal); NR-07 7.6.1.1 e Anexo V (guarda de 20/40 anos)."

/** Ids de todos os registros da pessoa (mesmo CPF) e o CPF em dígitos. */
async function registrosDaPessoa(filiacaoId: string): Promise<{ ids: string[]; cpf: string | null; nome: string | null } | null> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data: f } = await admin
    .from("filiacoes")
    .select("id, cpf, nome_completo, anonimizada_em")
    .eq("id", filiacaoId)
    .eq("emp_proprietaria_id", emp)
    .maybeSingle()
  if (!f) return null
  const cpf = cpfConfiavel(typeof f.cpf === "string" ? f.cpf : null)
  if (!cpf) return { ids: [String(f.id)], cpf: null, nome: (f.nome_completo as string | null) ?? null }
  const { data: todos } = await admin
    .from("filiacoes")
    .select("id")
    .eq("emp_proprietaria_id", emp)
    .in("cpf", grafiasDoCpf(cpf))
  return { ids: (todos ?? []).map((r) => String(r.id)), cpf, nome: (f.nome_completo as string | null) ?? null }
}

/**
 * Anonimiza o cadastro administrativo da pessoa. Ordem: (1) grava no acervo
 * de saúde as cópias cifradas de nome e CPF (identidade própria do acervo);
 * (2) a função SQL destrói os identificadores e corta os vínculos; (3) as
 * contas de acesso do portal são apagadas; (4) o livro de solicitações
 * recebe o registro, sem dados pessoais.
 */
export async function anonimizarFiliacao(dados: {
  filiacaoId: string
  executadoPor: string
  motivo: string
}): Promise<{ erro?: string; resumo?: ResumoAnonimizacao }> {
  const pessoa = await registrosDaPessoa(dados.filiacaoId)
  if (!pessoa) return { erro: "Filiação não encontrada." }
  const admin = await createAdminClient()
  const emp = await tenantAtual()

  // 1. Acervo de saúde: identidade própria, cifrada.
  const { data: assistidos, error: erroSaude } = await admin
    .from("saude_assistidos")
    .select("id, nome_retido_cifrado")
    .in("filiado_id", pessoa.ids)
  if (erroSaude && !esquemaAusente(erroSaude)) return { erro: `Acervo de saúde: ${erroSaude.message}` }
  const comAcervo = assistidos ?? []
  if (comAcervo.length > 0) {
    if (!sigiloConfigurado()) {
      return { erro: "Esta pessoa tem acervo de saúde e a chave de sigilo (SAUDE_RELATORIO_CHAVE) não está configurada. Sem ela não dá para reter o acervo com identidade própria." }
    }
    for (const a of comAcervo) {
      if (a.nome_retido_cifrado) continue
      const id = String(a.id)
      const { error } = await admin
        .from("saude_assistidos")
        .update({
          nome_retido_cifrado: cifrarRelatorio(pessoa.nome ?? "", id),
          cpf_retido_cifrado: pessoa.cpf ? cifrarRelatorio(pessoa.cpf, id) : null,
        })
        .eq("id", id)
      if (error) return { erro: `Não foi possível reter o acervo de saúde: ${error.message}` }
    }
  }

  // 2. Contas de acesso a apagar (a função SQL remove a identidade; a conta
  //    Auth é apagada aqui, pela admin API).
  const contas: string[] = []
  if (pessoa.cpf) {
    const { data: ids } = await admin
      .from("auth_identidades")
      .select("auth_user_id")
      .eq("emp_proprietaria_id", emp)
      .eq("cpf", pessoa.cpf)
    for (const i of ids ?? []) contas.push(String(i.auth_user_id))
  }

  // 3. Destruição dos identificadores.
  const { data: r, error } = await admin.rpc("anonimizar_filiacao", {
    p_filiacao_id: dados.filiacaoId,
    p_emp: emp,
  })
  if (error) {
    if (esquemaAusente(error) || /anonimizar_filiacao/.test(error.message)) {
      return { erro: "A rotina de anonimização ainda não está instalada no banco. Rode supabase/lgpd-execucao.sql." }
    }
    return { erro: error.message }
  }
  const bruto = (r ?? {}) as Record<string, number>
  let contasApagadas = 0
  for (const id of contas) {
    const { error: e } = await admin.auth.admin.deleteUser(id)
    if (!e) contasApagadas++
  }
  const resumo: ResumoAnonimizacao = {
    filiacoes: Number(bruto.filiacoes ?? 0),
    telefones: Number(bruto.telefones ?? 0),
    enderecos: Number(bruto.enderecos ?? 0),
    dados_bancarios: Number(bruto.dados_bancarios ?? 0),
    contatos_emergencia: Number(bruto.contatos_emergencia ?? 0),
    identidades_acesso: Number(bruto.identidades_acesso ?? 0),
    aceites: Number(bruto.aceites ?? 0),
    saude_desvinculados: Number(bruto.saude_desvinculados ?? 0),
    contas_apagadas: contasApagadas,
  }

  // 4. Livro de solicitações — sem dados pessoais.
  await admin.from("lgpd_solicitacoes").insert({
    emp_proprietaria_id: emp,
    filiacao_id: dados.filiacaoId,
    tipo: "anonimizacao",
    solicitado_em: hojeSP(),
    concluido_em: new Date().toISOString(),
    executado_por_id: dados.executadoPor,
    registros_anonimizados: `${resumo.filiacoes} registro(s) de filiação; ${resumo.telefones} telefone(s); ${resumo.enderecos} endereço(s); ${resumo.dados_bancarios} dado(s) bancário(s); ${resumo.contatos_emergencia} contato(s) de emergência; ${resumo.identidades_acesso} identidade(s) e ${resumo.contas_apagadas} conta(s) de acesso; ${resumo.saude_desvinculados} registro(s) de saúde desvinculado(s).`,
    registros_retidos: RETIDOS,
    base_legal_retencao: BASE_LEGAL,
    observacao: dados.motivo,
  })
  return { resumo }
}

export type SolicitacaoLgpd = {
  id: string
  tipo: string
  solicitadoEm: string
  concluidoEm: string | null
  registrosAnonimizados: string | null
  observacao: string | null
}

export async function solicitacoesDaFiliacao(filiacaoId: string): Promise<SolicitacaoLgpd[]> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("lgpd_solicitacoes")
    .select("id, tipo, solicitado_em, concluido_em, registros_anonimizados, observacao")
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("filiacao_id", filiacaoId)
    .order("created_at", { ascending: false })
  return (data ?? []).map((s) => ({
    id: String(s.id),
    tipo: String(s.tipo),
    solicitadoEm: String(s.solicitado_em),
    concluidoEm: s.concluido_em ? String(s.concluido_em) : null,
    registrosAnonimizados: (s.registros_anonimizados as string | null) ?? null,
    observacao: (s.observacao as string | null) ?? null,
  }))
}

// ── Consentimento versionado ──────────────────────────────────────────────

export async function termoEmVigor(tipo: "lgpd" | "desconto"): Promise<string | null> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from(tipo === "lgpd" ? "filiacao_tl_lgpd" : "filiacao_tl_desconto")
    .select("id")
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("em_vigor", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  return data?.id ? String(data.id) : null
}

export async function registrarAceiteTermo(dados: {
  cpf: string
  filiacaoId?: string | null
  tipo: "lgpd" | "desconto"
  termoId: string | null
  origem: "portal" | "ficha_publica" | "secretaria"
  ip: string | null
  userAgent: string | null
}): Promise<void> {
  const admin = await createAdminClient()
  const { error } = await admin.from("filiacao_tl_aceites").insert({
    emp_proprietaria_id: await tenantAtual(),
    filiacao_id: dados.filiacaoId ?? null,
    cpf: dados.cpf.replace(/\D/g, ""),
    tipo: dados.tipo,
    termo_id: dados.termoId,
    origem: dados.origem,
    ip: dados.ip,
    user_agent: dados.userAgent ? dados.userAgent.slice(0, 300) : null,
  })
  // Tabela ausente (SQL ainda não rodou) não trava o aceite em si.
  if (error && !esquemaAusente(error)) console.warn("[lgpd] aceite não registrado:", error.message)
}

export type AceiteRegistrado = {
  tipo: string
  aceitoEm: string
  origem: string
  termoId: string | null
  ip: string | null
}

export async function historicoAceites(cpf: string): Promise<AceiteRegistrado[]> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("filiacao_tl_aceites")
    .select("tipo, aceito_em, origem, termo_id, ip")
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("cpf", cpf.replace(/\D/g, ""))
    .order("aceito_em", { ascending: false })
  if (error) return []
  return (data ?? []).map((a) => ({
    tipo: String(a.tipo),
    aceitoEm: String(a.aceito_em),
    origem: String(a.origem),
    termoId: a.termo_id ? String(a.termo_id) : null,
    ip: (a.ip as string | null) ?? null,
  }))
}

// ── Portabilidade ─────────────────────────────────────────────────────────

const CAMPOS_FILIACAO =
  "id, cpf, nome_completo, nome_social, sexo, nascimento_data, telefone_1, telefone_1_whatsapp, telefone_2, telefone_2_whatsapp, email_pessoal, email_corporativo, endereco_cep, endereco_logradouro, endereco_numero, endereco_complemento, endereco_bairro, endereco_cidade, endereco_estado, matricula_sindical, filiacao_condicao, condicao_desde, tl_lgpd_data, tl_desconto_data, forma_recebimento, comunicados_optout_em, created_at"

/** Tenta a tabela por `filiado_id`; se a coluna não existir, por `filiacao_id`. */
async function porPessoa(tabela: string, ids: string[], colunas = "*"): Promise<unknown[] | { indisponivel: true }> {
  const admin = await createAdminClient()
  for (const coluna of ["filiado_id", "filiacao_id"]) {
    const { data, error } = await admin.from(tabela).select(colunas).in(coluna, ids)
    if (!error) return data ?? []
    if (error.code !== "42703") return { indisponivel: true }
  }
  return { indisponivel: true }
}

/** Tudo que o sistema guarda sobre a pessoa, para ela levar (art. 18, V). */
export async function dadosDoTitular(cpfBruto: string): Promise<Record<string, unknown>> {
  const cpf = cpfConfiavel(cpfBruto)
  if (!cpf) return { erro: "Cadastro sem CPF confiável." }
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data: filiacoes } = await admin
    .from("filiacoes")
    .select(CAMPOS_FILIACAO)
    .eq("emp_proprietaria_id", emp)
    .in("cpf", grafiasDoCpf(cpf))
    .not("filiacao_excluida", "is", true)
  const ids = (filiacoes ?? []).map((f) => String(f.id))
  const [vinculos, telefones, enderecos, contatosEmergencia, dadosBancarios, cupons, inscricoes, reembolsos, aceites] = await Promise.all([
    porPessoa("filiacao_vinculos", ids, "id, fonte_pagadora_id, matricula, data_filiacao, data_desfiliacao, data_saida_demissao, regime, condicao"),
    porPessoa("telefones", ids, "numero, tipo, whatsapp, favorito"),
    porPessoa("enderecos", ids, "cep, logradouro, numero, complemento, bairro, cidade, estado, tipo_endereco"),
    porPessoa("filiacao_contatos_emergencia", ids, "nome, telefone, vinculo"),
    porPessoa("dados_bancarios", ids, "banco, agencia, conta, tipo_conta, pix, pix_tipo, favorecido"),
    porPessoa("hospedagem_cupom", ids, "*"),
    porPessoa("eventos_inscricoes", ids, "*"),
    porPessoa("filiacao_reembolsos", ids, "*"),
    historicoAceites(cpf),
  ])
  return {
    geradoEm: new Date().toISOString(),
    titular: { cpf },
    filiacoes: filiacoes ?? [],
    vinculos,
    telefones,
    enderecos,
    contatosEmergencia,
    dadosBancarios,
    hospedagem: cupons,
    eventos: inscricoes,
    reembolsos,
    aceites,
    observacao:
      "Os votos em assembleias são secretos e não são atribuíveis a você; só a participação fica registrada. Dados de saúde ocupacional podem ser pedidos à equipe de saúde.",
  }
}

export async function registrarPortabilidade(filiacaoId: string | null): Promise<void> {
  const admin = await createAdminClient()
  await admin.from("lgpd_solicitacoes").insert({
    emp_proprietaria_id: await tenantAtual(),
    filiacao_id: filiacaoId,
    tipo: "portabilidade",
    solicitado_em: hojeSP(),
    concluido_em: new Date().toISOString(),
    registros_anonimizados: null,
    observacao: "Exportação dos próprios dados pelo portal (JSON).",
  })
}
