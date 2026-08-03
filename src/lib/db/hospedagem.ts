import "server-only"
import { tenantAtual } from "@/lib/tenant"

import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Hospedagem — convênio com hotéis parceiros:
 *  - hospedagem_hotel: hotéis disponíveis aos associados;
 *  - hospedagem_tarifas: valores por acomodação (pessoas por quarto);
 *  - hospedagem_cupom: autorização de subsídio emitida ao filiado (a retirada
 *    do cupom NÃO garante reserva nem serviço);
 *  - hospedagem_servico: a reserva efetivada no hotel, que agrupa cupons.
 *
 * `hospedagem_cupom` e `hospedagem_tarifas` não têm emp_proprietaria_id no
 * schema migrado do Bubble — o tenant chega pelos joins com hotel/serviço.
 */

export type Hotel = {
  id: string
  nome: string | null
  foto: string | null
  ativo: boolean | null
  demanda_garantida: boolean | null
  quant_quartos_dedicados: number | null
  max_hospedes_por_quarto: number | null
  max_hospedes_por_dia: number | null
  /** Empresa do hotel — favorecida na ordem de pagamento do faturamento. */
  empresa_id: string | null
  created_at: string | null
  // Colunas de supabase/hospedagem-faturamento.sql (undefined até rodar).
  exige_relatorio_para_faturar?: boolean | null
  acordo_vigencia_inicio?: string | null
  acordo_vigencia_fim?: string | null
}

export type Tarifa = {
  id: string
  hotel_id: string | null
  pessoas_por_quarto: number | null
  custo_por_filiado: number | null
  custo_entidade: number | null
  created_at: string | null
}

export type Cupom = {
  id: string
  check_in: string | null
  sexo: string | null
  cancelado: boolean | null
  compareceu: boolean | null
  aceita_quarto_coletivo: boolean | null
  /** custo_por_filiado da tarifa aplicada quando a reserva é efetivada. */
  tarifa_hospede: number | null
  servico_id: string | null
  filiado_id: string | null
  hotel_id: string | null
  created_at: string | null
}

export type CupomLinha = Cupom & {
  filiadoNome: string | null
  filiadoCpf: string | null
  hotelNome: string | null
  servicoCodigo: string | null
}

export type Servico = {
  id: string
  codigo: string | null
  checkin_date: string | null
  checkout_date: string | null
  sexo: string | null
  coletivo: boolean | null
  finalizado: boolean | null
  quant_ocupantes: number | null
  /** custo_entidade (por quarto) da tarifa aplicada na efetivação. */
  custo_entidade: number | null
  /** Caminho (bucket 'hospedagem') do relatório/extrato assinado pelos hóspedes. */
  relatorio: string | null
  fatura_id: string | null
  hotel_id: string | null
  created_at: string | null
}

export type ServicoLinha = Servico & {
  hotelNome: string | null
  cuponsVinculados: number
  /** Hóspedes com comparecimento registrado — condição de faturamento. */
  comparecidos: number
  faturaCodigo: string | null
}

/** Checkout já passou e o hotel não subiu o relatório/extrato assinado. */
export function relatorioPendente(
  s: Pick<Servico, "checkout_date" | "relatorio">,
  hoje: string
): boolean {
  return !!s.checkout_date && s.checkout_date < hoje && !s.relatorio
}

export type SituacaoCupom = "aguardando" | "reservado" | "cancelado"

/** Situação derivada: cancelado > reservado (vinculado a serviço) > aguardando. */
export function situacaoCupom(c: Pick<Cupom, "cancelado" | "servico_id">): SituacaoCupom {
  if (c.cancelado === true) return "cancelado"
  if (c.servico_id) return "reservado"
  return "aguardando"
}

// "*" tolera as colunas novas de hospedagem-faturamento.sql antes do SQL rodar.
const HOTEL_CAMPOS = "*"
const CUPOM_CAMPOS =
  "id, check_in, sexo, cancelado, compareceu, aceita_quarto_coletivo, tarifa_hospede, servico_id, filiado_id, hotel_id, created_at"
const SERVICO_CAMPOS =
  "id, codigo, checkin_date, checkout_date, sexo, coletivo, finalizado, quant_ocupantes, custo_entidade, relatorio, fatura_id, hotel_id, created_at"

/** Leitura completa em lotes — paginação estável exige .order("id"). */
async function lerLotes<T>(
  consulta: (de: number, ate: number) => PromiseLike<{
    data: T[] | null
    error: { message: string } | null
  }>
): Promise<T[]> {
  const LOTE = 1000
  const linhas: T[] = []
  for (let de = 0; ; de += LOTE) {
    const { data, error } = await consulta(de, de + LOTE - 1)
    if (error) throw new Error(`Falha na leitura de hospedagem: ${error.message}`)
    linhas.push(...(data ?? []))
    if (!data || data.length < LOTE) break
  }
  return linhas
}

// ── Hotéis e tarifas ───────────────────────────────────────────────────────

export async function listarHoteis(): Promise<Hotel[]> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("hospedagem_hotel")
    .select(HOTEL_CAMPOS)
    .eq("emp_proprietaria_id", await tenantAtual())
    .order("nome", { ascending: true })
  if (error) throw new Error(`Falha ao listar hotéis: ${error.message}`)
  return data ?? []
}

export async function buscarHotel(id: string): Promise<Hotel | null> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("hospedagem_hotel")
    .select(HOTEL_CAMPOS)
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (error) throw new Error(`Falha ao buscar hotel: ${error.message}`)
  return data
}

/** Tarifas de todos os hotéis (6 linhas no snapshot), agrupáveis por hotel_id. */
export async function listarTarifas(hotelId?: string): Promise<Tarifa[]> {
  const admin = await createAdminClient()
  let q = admin
    .from("hospedagem_tarifas")
    .select("id, hotel_id, pessoas_por_quarto, custo_por_filiado, custo_entidade, created_at")
    .order("pessoas_por_quarto", { ascending: true })
  if (hotelId) q = q.eq("hotel_id", hotelId)
  const { data, error } = await q
  if (error) throw new Error(`Falha ao listar tarifas: ${error.message}`)
  return data ?? []
}

// ── Cupons ─────────────────────────────────────────────────────────────────

/** Todos os cupons com nome do filiado, hotel e código do serviço resolvidos. */
export async function listarCupons(): Promise<CupomLinha[]> {
  const admin = await createAdminClient()
  const cupons = await lerLotes<Cupom>((de, ate) =>
    admin
      .from("hospedagem_cupom")
      .select(CUPOM_CAMPOS)
      .order("id", { ascending: true })
      .range(de, ate)
  )

  const [filiados, hoteis, servicos] = await Promise.all([
    nomesDeFiliados([...new Set(cupons.map((c) => c.filiado_id).filter((v): v is string => !!v))]),
    listarHoteis(),
    codigosDeServicos([...new Set(cupons.map((c) => c.servico_id).filter((v): v is string => !!v))]),
  ])
  const nomeHotel = new Map(hoteis.map((h) => [h.id, h.nome]))

  return cupons
    .map((c) => ({
      ...c,
      filiadoNome: c.filiado_id ? (filiados.get(c.filiado_id)?.nome ?? null) : null,
      filiadoCpf: c.filiado_id ? (filiados.get(c.filiado_id)?.cpf ?? null) : null,
      hotelNome: c.hotel_id ? (nomeHotel.get(c.hotel_id) ?? null) : null,
      servicoCodigo: c.servico_id ? (servicos.get(c.servico_id) ?? null) : null,
    }))
    .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))
}

/** Cupons aguardando reserva (sem serviço e não cancelados) de um hotel. */
export async function cuponsAguardando(hotelId?: string): Promise<CupomLinha[]> {
  const todos = await listarCupons()
  return todos.filter(
    (c) =>
      situacaoCupom(c) === "aguardando" && (!hotelId || c.hotel_id === hotelId)
  )
}

async function nomesDeFiliados(
  ids: string[]
): Promise<Map<string, { nome: string | null; cpf: string | null }>> {
  const mapa = new Map<string, { nome: string | null; cpf: string | null }>()
  if (ids.length === 0) return mapa
  const admin = await createAdminClient()
  for (let de = 0; de < ids.length; de += 200) {
    const { data, error } = await admin
      .from("filiacoes")
      .select("id, nome_completo, cpf")
      .in("id", ids.slice(de, de + 200))
    if (error) throw new Error(`Falha ao resolver filiados: ${error.message}`)
    for (const f of data ?? []) mapa.set(f.id, { nome: f.nome_completo, cpf: f.cpf })
  }
  return mapa
}

async function codigosDeServicos(ids: string[]): Promise<Map<string, string | null>> {
  const mapa = new Map<string, string | null>()
  if (ids.length === 0) return mapa
  const admin = await createAdminClient()
  for (let de = 0; de < ids.length; de += 200) {
    const { data, error } = await admin
      .from("hospedagem_servico")
      .select("id, codigo")
      .in("id", ids.slice(de, de + 200))
    if (error) throw new Error(`Falha ao resolver serviços: ${error.message}`)
    for (const s of data ?? []) mapa.set(s.id, s.codigo)
  }
  return mapa
}

// ── Serviços (reservas) ────────────────────────────────────────────────────

export async function listarServicos(): Promise<ServicoLinha[]> {
  const admin = await createAdminClient()
  const empId = await tenantAtual()
  const [servicos, hoteis, vinculos, faturas] = await Promise.all([
    lerLotes<Servico>((de, ate) =>
      admin
        .from("hospedagem_servico")
        .select(SERVICO_CAMPOS)
        .eq("emp_proprietaria_id", empId)
        .order("id", { ascending: true })
        .range(de, ate)
    ),
    listarHoteis(),
    lerLotes<{ servico_id: string | null; compareceu: boolean | null }>((de, ate) =>
      admin
        .from("hospedagem_cupom")
        .select("servico_id, compareceu")
        .not("servico_id", "is", null)
        .order("id", { ascending: true })
        .range(de, ate)
    ),
    lerLotes<{ id: string; codigo: string | null }>((de, ate) =>
      admin
        .from("hospedagem_fatura")
        .select("id, codigo")
        .order("id", { ascending: true })
        .range(de, ate)
    ),
  ])

  const nomeHotel = new Map(hoteis.map((h) => [h.id, h.nome]))
  const codigoFatura = new Map(faturas.map((f) => [f.id, f.codigo]))
  const porServico = new Map<string, { total: number; comparecidos: number }>()
  for (const v of vinculos) {
    if (!v.servico_id) continue
    const atual = porServico.get(v.servico_id) ?? { total: 0, comparecidos: 0 }
    atual.total++
    if (v.compareceu === true) atual.comparecidos++
    porServico.set(v.servico_id, atual)
  }

  return servicos
    .map((s) => ({
      ...s,
      hotelNome: s.hotel_id ? (nomeHotel.get(s.hotel_id) ?? null) : null,
      cuponsVinculados: porServico.get(s.id)?.total ?? 0,
      comparecidos: porServico.get(s.id)?.comparecidos ?? 0,
      faturaCodigo: s.fatura_id ? (codigoFatura.get(s.fatura_id) ?? null) : null,
    }))
    .sort(
      (a, b) =>
        (b.checkin_date ?? "").localeCompare(a.checkin_date ?? "") ||
        (b.created_at ?? "").localeCompare(a.created_at ?? "")
    )
}

export async function buscarServico(
  id: string
): Promise<{ servico: Servico; hotel: Hotel | null; cupons: CupomLinha[] } | null> {
  const admin = await createAdminClient()
  const { data: servico, error } = await admin
    .from("hospedagem_servico")
    .select(SERVICO_CAMPOS)
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (error) throw new Error(`Falha ao buscar serviço: ${error.message}`)
  if (!servico) return null

  const { data: cuponsBrutos, error: erroCupons } = await admin
    .from("hospedagem_cupom")
    .select(CUPOM_CAMPOS)
    .eq("servico_id", id)
    .order("created_at", { ascending: true })
  if (erroCupons) throw new Error(`Falha nos cupons do serviço: ${erroCupons.message}`)

  const cupons = cuponsBrutos ?? []
  const [filiados, hotel] = await Promise.all([
    nomesDeFiliados([...new Set(cupons.map((c) => c.filiado_id).filter((v): v is string => !!v))]),
    servico.hotel_id ? buscarHotel(servico.hotel_id) : Promise.resolve(null),
  ])

  return {
    servico,
    hotel,
    cupons: cupons.map((c) => ({
      ...c,
      filiadoNome: c.filiado_id ? (filiados.get(c.filiado_id)?.nome ?? null) : null,
      filiadoCpf: c.filiado_id ? (filiados.get(c.filiado_id)?.cpf ?? null) : null,
      hotelNome: hotel?.nome ?? null,
      servicoCodigo: servico.codigo,
    })),
  }
}

// ── Usuários do hotel (Porta 4) ────────────────────────────────────────────

export type UsuarioHotel = {
  id: string
  hotel_id: string
  email: string
  nome: string | null
  auth_user_id: string | null
  ativo: boolean
  created_at: string | null
}

/** PGRST205/42P01 = tabela ainda não criada (rodar supabase/hospedagem-hotel.sql). */
function tabelaAusente(erro: { code?: string } | null): boolean {
  return erro?.code === "PGRST205" || erro?.code === "42P01"
}

export async function usuariosDoHotel(
  hotelId: string
): Promise<{ disponivel: boolean; usuarios: UsuarioHotel[] }> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("hospedagem_hotel_usuarios")
    .select("id, hotel_id, email, nome, auth_user_id, ativo, created_at")
    .eq("hotel_id", hotelId)
    .order("created_at", { ascending: true })
  if (error) {
    if (tabelaAusente(error)) return { disponivel: false, usuarios: [] }
    throw new Error(`Falha ao listar usuários do hotel: ${error.message}`)
  }
  return { disponivel: true, usuarios: data ?? [] }
}

/**
 * Resolve a sessão do hotel: conta Auth → registro ativo em
 * hospedagem_hotel_usuarios → hotel. Busca por auth_user_id com fallback por
 * email (conta que já existia no Auth antes do convite) — nesse caso grava o
 * auth_user_id para as próximas.
 */
export async function usuarioHotelDaConta(
  authUserId: string,
  email: string | null
): Promise<{ usuarioHotel: UsuarioHotel; hotel: Hotel } | null> {
  const admin = await createAdminClient()
  const campos = "id, hotel_id, email, nome, auth_user_id, ativo, created_at"

  const porAuth = await admin
    .from("hospedagem_hotel_usuarios")
    .select(campos)
    .eq("auth_user_id", authUserId)
    .eq("ativo", true)
    .maybeSingle()
  if (porAuth.error && !tabelaAusente(porAuth.error)) {
    throw new Error(`Falha na sessão do hotel: ${porAuth.error.message}`)
  }

  let usuarioHotel = porAuth.data ?? null
  if (!usuarioHotel && email) {
    const porEmail = await admin
      .from("hospedagem_hotel_usuarios")
      .select(campos)
      .ilike("email", email)
      .is("auth_user_id", null)
      .eq("ativo", true)
      .maybeSingle()
    if (porEmail.data) {
      usuarioHotel = { ...porEmail.data, auth_user_id: authUserId }
      await admin
        .from("hospedagem_hotel_usuarios")
        .update({ auth_user_id: authUserId })
        .eq("id", porEmail.data.id)
    }
  }
  if (!usuarioHotel) return null

  const hotel = await buscarHotel(usuarioHotel.hotel_id)
  if (!hotel) return null
  return { usuarioHotel, hotel }
}

// ── Efetivação de reserva (regras compartilhadas painel/hotel) ─────────────

/** Código da reserva no padrão legado AAAA.MMDD.HHMM.SSNN (horário de SP). */
export function gerarCodigoServico(): string {
  const partes = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date())
  const p = (tipo: string) => partes.find((x) => x.type === tipo)?.value ?? "00"
  const aleatorio = String(Math.floor(Math.random() * 100)).padStart(2, "0")
  return `${p("year")}.${p("month")}${p("day")}.${p("hour")}${p("minute")}.${p("second")}${aleatorio}`
}

/** Lê e valida os campos comuns do formulário de nova reserva. */
export function lerCamposReserva(formData: FormData):
  | { erro: string }
  | { checkin: string; checkout: string; coletivo: boolean; cupons: string[] } {
  const checkin = String(formData.get("checkin_date") ?? "")
  const checkout = String(formData.get("checkout_date") ?? "")
  const coletivo = formData.get("coletivo") === "on"
  const cupons = formData.getAll("cupons").map(String).filter(Boolean)

  const dataValida = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v)
  if (!dataValida(checkin) || !dataValida(checkout)) {
    return { erro: "Informe as datas de check-in e check-out." }
  }
  if (checkout <= checkin) {
    return { erro: "O check-out precisa ser depois do check-in." }
  }
  if (cupons.length === 0) {
    return { erro: "Selecione pelo menos um cupom para a reserva." }
  }
  if (coletivo && cupons.length < 2) {
    return { erro: "Quarto coletivo precisa de pelo menos dois hóspedes." }
  }
  return { checkin, checkout, coletivo, cupons }
}

/** Tarifa acordada do hotel para N pessoas por quarto. */
export async function tarifaParaOcupacao(
  hotelId: string,
  ocupantes: number
): Promise<Tarifa | null> {
  const tarifas = await listarTarifas(hotelId)
  return tarifas.find((t) => t.pessoas_por_quarto === ocupantes) ?? null
}

export type NovaReserva = {
  hotelId: string
  checkin: string
  checkout: string
  coletivo: boolean
  cupomIds: string[]
}

/**
 * Cria o serviço (reserva) a partir de cupons aguardando, aplicando as
 * regras do convênio:
 *  - todos os cupons precisam estar aguardando (sem serviço, não cancelados)
 *    e ser do hotel da reserva;
 *  - quarto COLETIVO: todos os hóspedes do mesmo sexo (informado) e todos
 *    tendo aceitado quarto coletivo no cupom;
 *  - o preço registrado é a tarifa acordada para a QUANTIDADE efetiva de
 *    pessoas no quarto: `custo_entidade` no serviço (por quarto) e
 *    `tarifa_hospede` em cada cupom (custo_por_filiado da tarifa).
 */
export async function efetivarReserva(
  reserva: NovaReserva
): Promise<{ id: string } | { erro: string }> {
  const { hotelId, checkin, checkout, coletivo, cupomIds } = reserva
  const admin = await createAdminClient()

  const { data: cupons, error: erroCupons } = await admin
    .from("hospedagem_cupom")
    .select("id, sexo, aceita_quarto_coletivo")
    .in("id", cupomIds)
    .eq("hotel_id", hotelId)
    .eq("cancelado", false)
    .is("servico_id", null)
  if (erroCupons) return { erro: `Falha ao conferir cupons: ${erroCupons.message}` }
  if ((cupons ?? []).length !== cupomIds.length) {
    return {
      erro: "Um ou mais cupons selecionados já foram reservados, cancelados ou são de outro hotel — recarregue a página e tente de novo.",
    }
  }

  const erroComposicao = validarComposicaoColetiva(coletivo, cupons ?? [])
  if (erroComposicao) return { erro: erroComposicao }

  const ocupantes = cupomIds.length
  const tarifa = await tarifaParaOcupacao(hotelId, ocupantes)
  if (!tarifa) {
    return {
      erro: `Não há tarifa acordada para ${ocupantes} pessoa${ocupantes === 1 ? "" : "s"} por quarto neste hotel — confira as tarifas cadastradas.`,
    }
  }

  // Sexo do serviço: o do grupo quando é uniforme (obrigatório no coletivo).
  const sexos = new Set((cupons ?? []).map((c) => c.sexo).filter(Boolean))
  const sexo = sexos.size === 1 ? [...sexos][0] : null

  const { data: servico, error } = await admin
    .from("hospedagem_servico")
    .insert({
      codigo: gerarCodigoServico(),
      checkin_date: checkin,
      checkout_date: checkout,
      sexo,
      coletivo,
      finalizado: false,
      quant_ocupantes: ocupantes,
      custo_entidade: tarifa.custo_entidade,
      hotel_id: hotelId,
      emp_proprietaria_id: await tenantAtual(),
    })
    .select("id")
    .single()
  if (error || !servico) {
    return { erro: `Não foi possível criar a reserva: ${error?.message}` }
  }

  const { error: erroVinculo } = await admin
    .from("hospedagem_cupom")
    .update({ servico_id: servico.id, tarifa_hospede: tarifa.custo_por_filiado })
    .in("id", cupomIds)
  if (erroVinculo) {
    return {
      erro: `Reserva criada, mas falhou o vínculo dos cupons: ${erroVinculo.message}`,
    }
  }

  return { id: servico.id }
}

/**
 * Regra do quarto coletivo: só pessoas do MESMO sexo (informado no cupom) e
 * que aceitaram quarto coletivo. Retorna a mensagem de erro ou null.
 */
export function validarComposicaoColetiva(
  coletivo: boolean,
  cupons: Pick<Cupom, "sexo" | "aceita_quarto_coletivo">[]
): string | null {
  if (!coletivo) return null
  if (cupons.some((c) => c.aceita_quarto_coletivo !== true)) {
    return "Quarto coletivo só com hóspedes que aceitaram quarto coletivo no cupom."
  }
  const sexos = new Set(cupons.map((c) => c.sexo))
  if (sexos.has(null) || sexos.has("")) {
    return "Quarto coletivo exige o sexo informado em todos os cupons."
  }
  if (sexos.size > 1) {
    return "Quarto coletivo só com hóspedes do mesmo sexo."
  }
  return null
}

/**
 * Reaplica contagem e tarifa após vincular/desvincular cupons: atualiza
 * quant_ocupantes, custo_entidade e tarifa_hospede dos cupons vinculados.
 * Sem tarifa acordada para a nova contagem, os valores ficam nulos (o
 * bloqueio preventivo é feito por quem vincula).
 */
export async function reaplicarTarifaDaReserva(servicoId: string): Promise<void> {
  const admin = await createAdminClient()
  const [{ data: servico }, { data: cupons }] = await Promise.all([
    admin
      .from("hospedagem_servico")
      .select("id, hotel_id")
      .eq("id", servicoId)
      .maybeSingle(),
    admin.from("hospedagem_cupom").select("id").eq("servico_id", servicoId),
  ])
  if (!servico) return

  const ocupantes = (cupons ?? []).length
  const tarifa = servico.hotel_id
    ? await tarifaParaOcupacao(servico.hotel_id, ocupantes)
    : null

  await admin
    .from("hospedagem_servico")
    .update({
      quant_ocupantes: ocupantes,
      custo_entidade: tarifa?.custo_entidade ?? null,
    })
    .eq("id", servicoId)
  if (ocupantes > 0) {
    await admin
      .from("hospedagem_cupom")
      .update({ tarifa_hospede: tarifa?.custo_por_filiado ?? null })
      .eq("servico_id", servicoId)
  }
}

type Resultado = { ok: string } | { erro: string }

/**
 * Vincula um cupom aguardando a uma reserva aberta, revalidando composição
 * coletiva e tarifa para a nova ocupação. `restringirHotelId` limita a
 * operação a reservas do próprio hotel (interface do hotel).
 */
export async function vincularCupomAReserva(
  servicoId: string,
  cupomId: string,
  restringirHotelId?: string
): Promise<Resultado> {
  const admin = await createAdminClient()
  const { data: servico } = await admin
    .from("hospedagem_servico")
    .select("id, hotel_id, coletivo, finalizado")
    .eq("id", servicoId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (!servico || (restringirHotelId && servico.hotel_id !== restringirHotelId)) {
    return { erro: "Reserva não encontrada." }
  }
  if (servico.finalizado === true) {
    return { erro: "A reserva está finalizada — reabra antes de vincular cupons." }
  }

  const [{ data: cupom }, { data: vinculados }] = await Promise.all([
    admin
      .from("hospedagem_cupom")
      .select("id, sexo, aceita_quarto_coletivo")
      .eq("id", cupomId)
      .eq("hotel_id", servico.hotel_id)
      .eq("cancelado", false)
      .is("servico_id", null)
      .maybeSingle(),
    admin
      .from("hospedagem_cupom")
      .select("id, sexo, aceita_quarto_coletivo")
      .eq("servico_id", servicoId),
  ])
  if (!cupom) {
    return { erro: "O cupom já foi reservado, cancelado ou é de outro hotel." }
  }
  const composicao = [...(vinculados ?? []), cupom]
  const erroComposicao = validarComposicaoColetiva(
    servico.coletivo === true,
    composicao
  )
  if (erroComposicao) return { erro: erroComposicao }

  const tarifa = await tarifaParaOcupacao(servico.hotel_id!, composicao.length)
  if (!tarifa) {
    return {
      erro: `Não há tarifa acordada para ${composicao.length} pessoas por quarto neste hotel.`,
    }
  }

  const { error, count } = await admin
    .from("hospedagem_cupom")
    .update({ servico_id: servicoId }, { count: "exact" })
    .eq("id", cupomId)
    .is("servico_id", null)
  if (error) return { erro: `Não foi possível vincular: ${error.message}` }
  if (count === 0) {
    return { erro: "O cupom acabou de ser reservado em outra tela — recarregue." }
  }

  await reaplicarTarifaDaReserva(servicoId)
  return { ok: "Cupom vinculado." }
}

export async function desvincularCupomDaReserva(
  servicoId: string,
  cupomId: string,
  restringirHotelId?: string
): Promise<Resultado> {
  const admin = await createAdminClient()
  if (restringirHotelId) {
    const { data: servico } = await admin
      .from("hospedagem_servico")
      .select("id, hotel_id")
      .eq("id", servicoId)
      .maybeSingle()
    if (!servico || servico.hotel_id !== restringirHotelId) {
      return { erro: "Reserva não encontrada." }
    }
  }

  const { error, count } = await admin
    .from("hospedagem_cupom")
    .update({ servico_id: null, tarifa_hospede: null }, { count: "exact" })
    .eq("id", cupomId)
    .eq("servico_id", servicoId)
  if (error) return { erro: `Não foi possível desvincular: ${error.message}` }
  if (count === 0) return { erro: "Cupom não está vinculado a esta reserva." }

  await reaplicarTarifaDaReserva(servicoId)
  return { ok: "Cupom desvinculado — voltou a aguardar reserva." }
}

export async function registrarComparecimento(
  cupomId: string,
  compareceu: boolean,
  restringirHotelId?: string
): Promise<Resultado> {
  const admin = await createAdminClient()
  let q = admin
    .from("hospedagem_cupom")
    .update({ compareceu }, { count: "exact" })
    .eq("id", cupomId)
  if (restringirHotelId) q = q.eq("hotel_id", restringirHotelId)
  const { error, count } = await q
  if (error) return { erro: `Não foi possível registrar: ${error.message}` }
  if (count === 0) return { erro: "Cupom não encontrado." }
  return { ok: "Comparecimento registrado." }
}

export async function definirReservaFinalizada(
  servicoId: string,
  finalizado: boolean,
  restringirHotelId?: string
): Promise<Resultado> {
  const admin = await createAdminClient()
  let q = admin
    .from("hospedagem_servico")
    .update({ finalizado }, { count: "exact" })
    .eq("id", servicoId)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (restringirHotelId) q = q.eq("hotel_id", restringirHotelId)
  const { error, count } = await q
  if (error) return { erro: `Não foi possível salvar: ${error.message}` }
  if (count === 0) return { erro: "Reserva não encontrada." }
  return { ok: finalizado ? "Reserva finalizada." : "Reserva reaberta." }
}

// ── Dados bancários do hotel ───────────────────────────────────────────────

export type ContaHotel = {
  id: string
  hotel_id: string
  tipo: "pix" | "deposito"
  titular: string | null
  documento: string | null
  banco: string | null
  agencia: string | null
  conta: string | null
  chave_pix: string | null
  ativo: boolean
  created_at: string | null
}

/** Resumo de uma conta para descrição da ordem/exibição. */
export function descreverConta(c: ContaHotel): string {
  if (c.tipo === "pix") {
    const partes = [
      `Pix — chave ${c.chave_pix ?? "(sem chave)"}`,
      c.titular,
      c.banco,
    ].filter(Boolean)
    return partes.join(" · ")
  }
  const partes = [
    `TED — ${c.banco ?? "banco não informado"}`,
    c.agencia ? `ag. ${c.agencia}` : null,
    c.conta ? `conta ${c.conta}` : null,
    c.titular,
    c.documento,
  ].filter(Boolean)
  return partes.join(" · ")
}

export async function contasDoHotel(
  hotelId: string
): Promise<{ disponivel: boolean; contas: ContaHotel[] }> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("hospedagem_hotel_contas")
    .select("*")
    .eq("hotel_id", hotelId)
    .order("created_at", { ascending: true })
  if (error) {
    if (tabelaAusente(error)) return { disponivel: false, contas: [] }
    throw new Error(`Falha ao listar contas do hotel: ${error.message}`)
  }
  return { disponivel: true, contas: (data ?? []) as ContaHotel[] }
}

// ── Faturamento ────────────────────────────────────────────────────────────

export type FaturaLinha = {
  id: string
  codigo: string | null
  /** Caminho da DANFE no bucket 'hospedagem' (ou URL legada). */
  nota_fiscal: string | null
  hotel_id: string | null
  ordem_pagamento_id: string | null
  created_at: string | null
  hotelNome: string | null
  servicos: number
  /** Soma dos subsídios (custo_entidade) dos serviços da fatura. */
  valorTotal: number
  ordemSituacao: string | null
  ordemVencimento: string | null
  ordemForma: string | null
  /** Fechada quando a ordem foi paga. */
  aberta: boolean
}

export async function listarFaturas(hotelId?: string): Promise<FaturaLinha[]> {
  const admin = await createAdminClient()
  let q = admin
    .from("hospedagem_fatura")
    .select("id, codigo, nota_fiscal, hotel_id, ordem_pagamento_id, created_at")
    .order("created_at", { ascending: false })
  if (hotelId) q = q.eq("hotel_id", hotelId)
  const { data: faturas, error } = await q
  if (error) throw new Error(`Falha ao listar faturas: ${error.message}`)
  if (!faturas || faturas.length === 0) return []

  const ids = faturas.map((f) => f.id)
  const ordemIds = faturas
    .map((f) => f.ordem_pagamento_id)
    .filter((v): v is string => !!v)

  const [hoteis, servicosRes, ordensRes] = await Promise.all([
    listarHoteis(),
    admin
      .from("hospedagem_servico")
      .select("fatura_id, custo_entidade")
      .in("fatura_id", ids),
    ordemIds.length
      ? admin
          .from("ordens_pagamento")
          .select("id, situacao, vencimento, forma_pagamento")
          .in("id", ordemIds)
      : Promise.resolve({ data: [], error: null }),
  ])
  if (servicosRes.error) {
    throw new Error(`Falha nos serviços das faturas: ${servicosRes.error.message}`)
  }

  const nomeHotel = new Map(hoteis.map((h) => [h.id, h.nome]))
  const porFatura = new Map<string, { n: number; total: number }>()
  for (const s of servicosRes.data ?? []) {
    if (!s.fatura_id) continue
    const atual = porFatura.get(s.fatura_id) ?? { n: 0, total: 0 }
    atual.n++
    atual.total += s.custo_entidade ?? 0
    porFatura.set(s.fatura_id, atual)
  }
  const ordens = new Map(
    (ordensRes.data ?? []).map((o) => [
      o.id,
      {
        situacao: o.situacao as string | null,
        vencimento: o.vencimento as string | null,
        forma: o.forma_pagamento as string | null,
      },
    ])
  )

  return faturas.map((f) => {
    const ordem = f.ordem_pagamento_id ? ordens.get(f.ordem_pagamento_id) : null
    return {
      ...f,
      hotelNome: f.hotel_id ? (nomeHotel.get(f.hotel_id) ?? null) : null,
      servicos: porFatura.get(f.id)?.n ?? 0,
      valorTotal: porFatura.get(f.id)?.total ?? 0,
      ordemSituacao: ordem?.situacao ?? null,
      ordemVencimento: ordem?.vencimento ?? null,
      ordemForma: ordem?.forma ?? null,
      aberta: ordem?.situacao !== "Paga",
    }
  })
}

/** Vencimento mínimo da fatura: hoje (São Paulo) + carência de 4 dias. */
export function vencimentoMinimoFatura(): string {
  const hoje = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date())
  const d = new Date(`${hoje}T12:00:00-03:00`)
  d.setDate(d.getDate() + 4)
  return d.toISOString().slice(0, 10)
}

/**
 * Serviços faturáveis do hotel: cupom de filiado vinculado com COMPARECIMENTO
 * registrado (preenchido pelo hotel), tarifa aplicada (custo_entidade) e
 * ainda sem fatura. Se o hotel exige o relatório/extrato assinado
 * (configuração), só entra serviço com relatório enviado.
 */
export async function servicosFaturaveis(hotel: Hotel): Promise<ServicoLinha[]> {
  const todos = await listarServicos()
  return todos.filter(
    (s) =>
      s.hotel_id === hotel.id &&
      !s.fatura_id &&
      s.custo_entidade !== null &&
      s.comparecidos > 0 &&
      (hotel.exige_relatorio_para_faturar !== true || !!s.relatorio)
  )
}

export type NovaFatura = {
  hotel: Hotel
  servicoIds: string[]
  /** Caminho da DANFE já enviada ao bucket 'hospedagem'. */
  notaFiscalCaminho: string
  vencimento: string
  forma: "Pix" | "Pix (QR Code)" | "Depósito bancário (TED)" | "Boleto"
  /** Código copia-e-cola quando forma = Pix (QR Code). */
  pixCodigo: string | null
  /** Caminho do boleto (bucket 'comprovantes') quando forma = Boleto. */
  boletoCaminho: string | null
  /** Descrição da conta de recebimento (Pix/TED) para a ordem. */
  recebimento: string | null
}

/**
 * Fecha o faturamento: valida os serviços, cria a ORDEM DE PAGAMENTO
 * (favorecido = empresa do hotel, situação "Em autorização") com a soma dos
 * subsídios — valores com impostos inclusos, conforme o acordo — e a FATURA
 * (DANFE + ordem), vinculando os serviços.
 */
export async function faturarServicos(
  nova: NovaFatura
): Promise<{ faturaId: string } | { erro: string }> {
  const { hotel, servicoIds } = nova
  if (servicoIds.length === 0) {
    return { erro: "Selecione pelo menos um serviço para faturar." }
  }

  const faturaveis = await servicosFaturaveis(hotel)
  const porId = new Map(faturaveis.map((s) => [s.id, s]))
  const selecionados = servicoIds.map((id) => porId.get(id))
  if (selecionados.some((s) => !s)) {
    return {
      erro: "Um ou mais serviços selecionados não estão mais faturáveis (já faturados ou sem comparecimento registrado) — recarregue a página.",
    }
  }
  const servicos = selecionados as ServicoLinha[]

  const total = servicos.reduce((acc, s) => acc + (s.custo_entidade ?? 0), 0)
  const inicio = servicos
    .map((s) => s.checkin_date)
    .filter(Boolean)
    .sort()[0]
  const fim = servicos
    .map((s) => s.checkout_date)
    .filter(Boolean)
    .sort()
    .at(-1)
  const dataBr = (v: string | null | undefined) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v ?? "")
    return m ? `${m[3]}/${m[2]}/${m[1]}` : "—"
  }

  const codigo = gerarCodigoServico()
  const descricao = [
    `Hospedagem — subsídio de ${servicos.length} reserva${servicos.length === 1 ? "" : "s"} no ${hotel.nome ?? "hotel parceiro"}`,
    `(período ${dataBr(inicio)} a ${dataBr(fim)}).`,
    "Valores com impostos inclusos, conforme o acordo.",
    nova.recebimento ? `Recebimento: ${nova.recebimento}.` : null,
  ]
    .filter(Boolean)
    .join(" ")

  const admin = await createAdminClient()
  const { data: ordem, error: erroOrdem } = await admin
    .from("ordens_pagamento")
    .insert({
      codigo,
      tipo: "Hospedagem",
      descricao,
      situacao: "Em autorização",
      // valor_inicial_cobranca = valor cobrado; valor_pago é preenchido no
      // registro do pagamento (CRUD na página da ordem).
      valor_inicial_cobranca: total,
      vencimento: nova.vencimento,
      forma_pagamento: nova.forma,
      pix_codigo: nova.pixCodigo,
      arquivo_boleto: nova.boletoCaminho,
      beneficiario_fornecedor_id: hotel.empresa_id,
      emp_proprietaria_id: await tenantAtual(),
    })
    .select("id")
    .single()
  if (erroOrdem || !ordem) {
    return { erro: `Não foi possível gerar a ordem de pagamento: ${erroOrdem?.message}` }
  }

  const { data: fatura, error: erroFatura } = await admin
    .from("hospedagem_fatura")
    .insert({
      codigo,
      nota_fiscal: nova.notaFiscalCaminho,
      hotel_id: hotel.id,
      ordem_pagamento_id: ordem.id,
    })
    .select("id")
    .single()
  if (erroFatura || !fatura) {
    return { erro: `Ordem criada, mas a fatura falhou: ${erroFatura?.message}` }
  }

  const { error: erroVinculo } = await admin
    .from("hospedagem_servico")
    .update({ fatura_id: fatura.id })
    .in("id", servicoIds)
  if (erroVinculo) {
    return {
      erro: `Fatura criada, mas falhou o vínculo dos serviços: ${erroVinculo.message}`,
    }
  }

  return { faturaId: fatura.id }
}

/** URL assinada (1h) de um arquivo do bucket 'hospedagem'; URLs http passam direto. */
export async function urlArquivoHospedagem(
  caminho: string | null
): Promise<string | null> {
  if (!caminho) return null
  if (/^(https?:)?\/\//.test(caminho)) {
    return caminho.startsWith("//") ? `https:${caminho}` : caminho
  }
  const admin = await createAdminClient()
  const { data } = await admin.storage
    .from("hospedagem")
    .createSignedUrl(caminho, 3600)
  return data?.signedUrl ?? null
}

// ── Visão geral ────────────────────────────────────────────────────────────

export type ResumoHospedagem = {
  hoteisAtivos: number
  cuponsAguardando: number
  reservasAbertas: number
  /** % de comparecimento entre cupons reservados com check-in já passado. */
  comparecimento: number | null
}

export async function resumoHospedagem(): Promise<ResumoHospedagem> {
  const [hoteis, cupons, servicos] = await Promise.all([
    listarHoteis(),
    listarCupons(),
    listarServicos(),
  ])
  const hoje = new Date().toISOString().slice(0, 10)

  const encerrados = cupons.filter(
    (c) => situacaoCupom(c) === "reservado" && c.check_in && c.check_in < hoje
  )
  const compareceram = encerrados.filter((c) => c.compareceu === true).length

  return {
    hoteisAtivos: hoteis.filter((h) => h.ativo !== false).length,
    cuponsAguardando: cupons.filter((c) => situacaoCupom(c) === "aguardando").length,
    reservasAbertas: servicos.filter(
      (s) => s.finalizado !== true && (s.checkout_date ?? "") >= hoje
    ).length,
    comparecimento:
      encerrados.length > 0
        ? Math.round((compareceram / encerrados.length) * 100)
        : null,
  }
}
