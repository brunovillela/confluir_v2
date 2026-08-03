import "server-only"
import { tenantAtual } from "@/lib/tenant"

import { createAdminClient } from "@/lib/supabase/admin"

import { listarHoteis, situacaoCupom, type Hotel } from "./hospedagem"

/**
 * Dados do portal do associado (Porta 2). A identidade é o CPF; a pessoa
 * pode ter mais de um registro em `filiacoes` (histórico migrado) — leituras
 * usam o registro mais recente e as escritas de contato/endereço atualizam
 * TODOS os registros não excluídos do CPF, para manter o cadastro coeso.
 */

export type CadastroFiliado = {
  id: string
  nome_completo: string | null
  cpf: string | null
  matricula_sindical: string | null
  filiacao_condicao: string | null
  sexo: string | null
  nascimento_data: string | null
  email_pessoal: string | null
  email_corporativo: string | null
  telefone_1: string | null
  telefone_1_whatsapp: boolean | null
  telefone_2: string | null
  telefone_2_whatsapp: boolean | null
  endereco_cep: string | null
  endereco_logradouro: string | null
  endereco_numero: string | null
  endereco_complemento: string | null
  endereco_bairro: string | null
  endereco_cidade: string | null
  endereco_estado: string | null
  /** Aceites (LGPD e desconto em folha) — datas registradas. */
  tl_lgpd_data: string | null
  tl_desconto_data: string | null
}

const CAMPOS_CADASTRO =
  "id, nome_completo, cpf, matricula_sindical, filiacao_condicao, sexo, nascimento_data, email_pessoal, email_corporativo, telefone_1, telefone_1_whatsapp, telefone_2, telefone_2_whatsapp, endereco_cep, endereco_logradouro, endereco_numero, endereco_complemento, endereco_bairro, endereco_cidade, endereco_estado, tl_lgpd_data, tl_desconto_data"

/** Registro mais recente (não excluído) do CPF — base das telas do portal. */
export async function cadastroDoFiliado(
  cpf: string
): Promise<CadastroFiliado | null> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("filiacoes")
    .select(CAMPOS_CADASTRO)
    .eq("cpf", cpf)
    .eq("emp_proprietaria_id", await tenantAtual())
    .not("filiacao_excluida", "is", true)
    .order("updated_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`Falha ao ler o cadastro: ${error.message}`)
  return data
}

/** Ids de todos os registros (não excluídos) do CPF. */
export async function registrosDoCpf(cpf: string): Promise<string[]> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("filiacoes")
    .select("id")
    .eq("cpf", cpf)
    .eq("emp_proprietaria_id", await tenantAtual())
    .not("filiacao_excluida", "is", true)
  if (error) throw new Error(`Falha ao ler registros: ${error.message}`)
  return (data ?? []).map((f) => f.id)
}

/** Atualiza campos permitidos em todos os registros do CPF. */
export async function atualizarRegistrosDoCpf(
  cpf: string,
  dados: Record<string, unknown>
): Promise<string | null> {
  const ids = await registrosDoCpf(cpf)
  if (ids.length === 0) return "Cadastro não encontrado."
  const admin = await createAdminClient()
  const { error } = await admin.from("filiacoes").update(dados).in("id", ids)
  if (error) return `Não foi possível salvar: ${error.message}`
  return null
}

// ── Cupons de hospedagem do filiado ────────────────────────────────────────

export type CupomDoFiliado = {
  id: string
  check_in: string | null
  cancelado: boolean | null
  compareceu: boolean | null
  aceita_quarto_coletivo: boolean | null
  tarifa_hospede: number | null
  servico_id: string | null
  hotel_id: string | null
  created_at: string | null
  hotelNome: string | null
  situacao: "aguardando" | "reservado" | "cancelado"
}

export async function cuponsDoFiliado(cpf: string): Promise<CupomDoFiliado[]> {
  const ids = await registrosDoCpf(cpf)
  if (ids.length === 0) return []
  const admin = await createAdminClient()
  const [{ data, error }, hoteis] = await Promise.all([
    admin
      .from("hospedagem_cupom")
      .select(
        "id, check_in, cancelado, compareceu, aceita_quarto_coletivo, tarifa_hospede, servico_id, hotel_id, created_at"
      )
      .in("filiado_id", ids)
      .order("created_at", { ascending: false }),
    listarHoteis(),
  ])
  if (error) throw new Error(`Falha ao listar cupons: ${error.message}`)
  const nomeHotel = new Map(hoteis.map((h) => [h.id, h.nome]))
  return (data ?? []).map((c) => ({
    ...c,
    hotelNome: c.hotel_id ? (nomeHotel.get(c.hotel_id) ?? null) : null,
    situacao: situacaoCupom(c),
  }))
}

export async function hoteisDisponiveis(): Promise<Hotel[]> {
  return (await listarHoteis()).filter((h) => h.ativo !== false)
}

// ── Agenda do aplicativo ───────────────────────────────────────────────────

export type EventoAgenda = {
  id: string
  atividade: string | null
  local: string | null
  inicio: string | null
  termino: string | null
  dia_todo: boolean | null
  tipo: string | null
}

/** Eventos marcados no painel com aplicativo = TRUE, de hoje em diante. */
export async function eventosDoAplicativo(limite = 30): Promise<EventoAgenda[]> {
  const admin = await createAdminClient()
  const hoje = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date())
  const { data, error } = await admin
    .from("agenda")
    .select("id, atividade, local, inicio, termino, dia_todo, tipo")
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("aplicativo", true)
    .gte("inicio", `${hoje}T00:00:00-03:00`)
    .order("inicio", { ascending: true })
    .limit(limite)
  if (error) throw new Error(`Falha ao listar a agenda: ${error.message}`)
  return data ?? []
}
