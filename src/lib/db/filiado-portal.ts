import "server-only"
import type { SupabaseClient } from "@supabase/supabase-js"

import { cpfConfiavel, grafiasDoCpf } from "@/lib/cpf"
import { tenantAtual } from "@/lib/tenant"

import { createAdminClient } from "@/lib/supabase/admin"

import {
  contratoDoHotel,
  listarHoteis,
  situacaoCupom,
  type Hotel,
} from "./hospedagem"

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
  /** Datas dos marcos do processo (para a trilha de etapas no portal). */
  created_at: string | null
  ficha_assinada_em: string | null
  filiacao_informada_fonte_em: string | null
  ativo_em: string | null
  desfiliacao_informada_fonte_em: string | null
  inativo_em: string | null
}

const CAMPOS_CADASTRO =
  "id, nome_completo, cpf, matricula_sindical, filiacao_condicao, sexo, nascimento_data, email_pessoal, email_corporativo, telefone_1, telefone_1_whatsapp, telefone_2, telefone_2_whatsapp, endereco_cep, endereco_logradouro, endereco_numero, endereco_complemento, endereco_bairro, endereco_cidade, endereco_estado, tl_lgpd_data, tl_desconto_data, created_at, ficha_assinada_em, filiacao_informada_fonte_em, ativo_em, desfiliacao_informada_fonte_em, inativo_em"

/** Registro mais recente (não excluído) do CPF — base das telas do portal. */
export async function cadastroDoFiliado(
  cpfBruto: string
): Promise<CadastroFiliado | null> {
  const cpf = cpfConfiavel(cpfBruto)
  if (!cpf) return null
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("filiacoes")
    .select(CAMPOS_CADASTRO)
    .in("cpf", grafiasDoCpf(cpf))
    .eq("emp_proprietaria_id", await tenantAtual())
    .not("filiacao_excluida", "is", true)
    .order("updated_at", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`Falha ao ler o cadastro: ${error.message}`)
  return data
}

/**
 * Ids de todos os registros (não excluídos) do CPF. Fora de requisição (a
 * fila da hospedagem no tick), passe `client` e `tenantId`.
 */
export async function registrosDoCpf(
  cpfBruto: string,
  amb: { client?: SupabaseClient; tenantId?: string } = {}
): Promise<string[]> {
  const cpf = cpfConfiavel(cpfBruto)
  if (!cpf) return []
  const admin = amb.client ?? (await createAdminClient())
  const { data, error } = await admin
    .from("filiacoes")
    .select("id")
    .in("cpf", grafiasDoCpf(cpf))
    .eq("emp_proprietaria_id", amb.tenantId ?? (await tenantAtual()))
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
  /**
   * O que o hotel confirmou (cupom reservado, achado A39): datas efetivas da
   * reserva, pessoas no quarto — que explicam a tarifa — e o código dela.
   */
  estadia: EstadiaConfirmada | null
}

export type EstadiaConfirmada = {
  codigo: string | null
  checkIn: string | null
  checkOut: string | null
  pessoas: number | null
}

/** Reservas (serviços) dos cupons, em lotes de 200 ids. */
async function estadiasDosServicos(ids: string[]): Promise<Map<string, EstadiaConfirmada>> {
  const mapa = new Map<string, EstadiaConfirmada>()
  if (ids.length === 0) return mapa
  const admin = await createAdminClient()
  for (let de = 0; de < ids.length; de += 200) {
    const { data, error } = await admin
      .from("hospedagem_servico")
      .select("id, codigo, checkin_date, checkout_date, quant_ocupantes")
      .in("id", ids.slice(de, de + 200))
    if (error) break
    for (const s of data ?? []) {
      mapa.set(s.id as string, {
        codigo: (s.codigo as string | null) ?? null,
        checkIn: s.checkin_date ? String(s.checkin_date).slice(0, 10) : null,
        checkOut: s.checkout_date ? String(s.checkout_date).slice(0, 10) : null,
        pessoas: typeof s.quant_ocupantes === "number" ? s.quant_ocupantes : null,
      })
    }
  }
  return mapa
}

export async function cuponsDoFiliado(cpf: string): Promise<CupomDoFiliado[]> {
  const ids = await registrosDoCpf(cpf)
  if (ids.length === 0) return []
  const admin = await createAdminClient()
  const [{ data, error }, hoteis] = await Promise.all([
    admin
      .from("hospedagem_cupom")
      // "*" tolera as colunas da demanda garantida antes do SQL rodar.
      .select("*")
      .in("filiado_id", ids)
      .order("created_at", { ascending: false }),
    listarHoteis(),
  ])
  if (error) throw new Error(`Falha ao listar cupons: ${error.message}`)
  const nomeHotel = new Map(hoteis.map((h) => [h.id, h.nome]))
  // Reservas de demanda garantida têm lista própria (Minhas reservas).
  const cupons = (data ?? []).filter((c) => c.reserva_garantida !== true)
  const estadias = await estadiasDosServicos([
    ...new Set(
      cupons
        .filter((c) => c.cancelado !== true && c.servico_id)
        .map((c) => c.servico_id as string)
    ),
  ])
  return cupons.map((c) => ({
    ...c,
    hotelNome: c.hotel_id ? (nomeHotel.get(c.hotel_id) ?? null) : null,
    situacao: situacaoCupom(c),
    estadia:
      c.cancelado !== true && c.servico_id ? (estadias.get(c.servico_id) ?? null) : null,
  }))
}

export async function hoteisDisponiveis(): Promise<Hotel[]> {
  return (await listarHoteis()).filter((h) => h.ativo !== false)
}

// ── Hospedagem: o que o associado vê antes de pedir ─────────────────────────

export type HotelParaPedido = {
  hotel: Hotel
  /** Último dia do convênio (AAAA-MM-DD); null = contrato sem data de término. */
  vigenciaTermino: string | null
}

/**
 * Hotéis que aceitam pedido HOJE (achado A75): ativos e com contrato em
 * vigor — a mesma conferência da action (`contratoDoHotel`), feita antes,
 * para o seletor não oferecer o que o envio recusaria. Hotel sem contrato
 * vinculado fica de fora pelo mesmo motivo. São poucos hotéis: uma
 * conferência por hotel, em paralelo. A action continua conferindo.
 */
export async function hoteisParaPedido(hoteis: Hotel[]): Promise<HotelParaPedido[]> {
  const ativos = hoteis.filter((h) => h.ativo !== false)
  const contratos = await Promise.all(
    ativos.map((h) => contratoDoHotel(h.id).catch(() => null))
  )
  return ativos.flatMap((hotel, i) => {
    const contrato = contratos[i]
    return contrato?.vigente ? [{ hotel, vigenciaTermino: contrato.vigenciaTermino }] : []
  })
}

/** Parte do associado por pessoas no quarto (custo_por_filiado da tarifa). */
export type TarifaDoPortal = { pessoas: number; valor: number }

/**
 * Tarifas por hotel, para mostrar ANTES do pedido (achado A8).
 * `hospedagem_tarifas` não tem coluna de tenant: só entram as linhas dos
 * hotéis recebidos (os da entidade). Falha na leitura = sem tarifa na tela,
 * nunca a página caída.
 */
export async function tarifasDosHoteis(
  hotelIds: string[]
): Promise<Map<string, TarifaDoPortal[]>> {
  const mapa = new Map<string, TarifaDoPortal[]>()
  const ids = [...new Set(hotelIds)]
  if (ids.length === 0) return mapa
  // Já filtrada na consulta pelos hotéis da entidade — sem varrer as tarifas
  // de todas as entidades (nem bater no teto de 1.000 linhas).
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("hospedagem_tarifas")
    .select("hotel_id, pessoas_por_quarto, custo_por_filiado")
    .in("hotel_id", ids)
  if (error) return mapa
  for (const t of data ?? []) {
    if (!t.hotel_id) continue
    if (t.pessoas_por_quarto === null || t.custo_por_filiado === null) continue
    const lista = mapa.get(t.hotel_id) ?? []
    lista.push({ pessoas: Number(t.pessoas_por_quarto), valor: Number(t.custo_por_filiado) })
    mapa.set(t.hotel_id, lista)
  }
  for (const lista of mapa.values()) lista.sort((a, b) => a.pessoas - b.pessoas)
  return mapa
}

/** Contato do hotel para o associado: endereço com mapa e telefone clicável. */
export type ContatoHotel = {
  endereco: string | null
  /** Busca do endereço no mapa (abre o app de mapas no celular). */
  mapa: string | null
  telefone: string | null
  /** `tel:` para ligar com um toque. */
  tel: string | null
}

function hrefTelefone(telefone: string): string | null {
  const d = telefone.replace(/\D/g, "")
  if (d.length < 8) return null
  if (d.length === 10 || d.length === 11) return `tel:+55${d}`
  // Já com o 55 do país (cadastro "+55 22 …"): só falta o "+".
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) return `tel:+${d}`
  return `tel:${d}`
}

/**
 * Endereço e telefone dos hotéis (achado A40). O endereço é o da empresa do
 * hotel em `enderecos` (o favorito, senão o mais antigo); o telefone, a
 * coluna `telefone` do hotel (supabase/hospedagem-hotel-telefone.sql — até o
 * SQL rodar e a gestão preencher, o cartão mostra só o endereço). Hotel sem
 * nenhum dos dois fica de fora do mapa.
 */
export async function contatosDosHoteis(hoteis: Hotel[]): Promise<Map<string, ContatoHotel>> {
  const mapa = new Map<string, ContatoHotel>()
  if (hoteis.length === 0) return mapa
  const empresas = [...new Set(hoteis.map((h) => h.empresa_id).filter((v): v is string => !!v))]
  const enderecoDaEmpresa = new Map<string, string>()
  if (empresas.length > 0) {
    const admin = await createAdminClient()
    const { data } = await admin
      .from("enderecos")
      .select("empresa_id, logradouro, numero, complemento, bairro, cidade, estado, cep, favorito, created_at")
      .in("empresa_id", empresas)
      .eq("emp_proprietaria_id", await tenantAtual())
      .order("created_at", { ascending: true })
    const linhas = [...(data ?? [])].sort(
      (a, b) => Number(b.favorito === true) - Number(a.favorito === true)
    )
    for (const e of linhas) {
      const empresa = e.empresa_id as string
      if (enderecoDaEmpresa.has(empresa)) continue
      const rua = [e.logradouro, e.numero].filter(Boolean).join(", ")
      const cidade = [e.cidade, e.estado].filter(Boolean).join("/")
      const partes = [
        [rua, e.complemento].filter(Boolean).join(" - "),
        e.bairro,
        cidade,
      ].filter((p): p is string => typeof p === "string" && p.trim() !== "")
      if (partes.length > 0) enderecoDaEmpresa.set(empresa, partes.join(", "))
    }
  }
  for (const h of hoteis) {
    const endereco = h.empresa_id ? (enderecoDaEmpresa.get(h.empresa_id) ?? null) : null
    const telefone = typeof h.telefone === "string" && h.telefone.trim() ? h.telefone.trim() : null
    if (!endereco && !telefone) continue
    mapa.set(h.id, {
      endereco,
      mapa: endereco
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
            [h.nome, endereco].filter(Boolean).join(", ")
          )}`
        : null,
      telefone,
      tel: telefone ? hrefTelefone(telefone) : null,
    })
  }
  return mapa
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
