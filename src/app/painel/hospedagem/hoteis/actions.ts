"use server"

import { tenantAtual } from "@/lib/tenant"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { SITE_URL } from "@/lib/env"
import { createAdminClient } from "@/lib/supabase/admin"

function lerCampos(formData: FormData) {
  const texto = (campo: string) => {
    const v = String(formData.get(campo) ?? "").trim()
    return v === "" ? null : v
  }
  const inteiro = (campo: string) => {
    const v = texto(campo)
    if (v === null) return null
    const n = Number(v)
    return Number.isInteger(n) && n >= 0 ? n : null
  }
  return {
    nome: texto("nome"),
    ativo: formData.get("ativo") === "on",
    // A marcação antiga acompanha a modalidade (telas e relatórios legados).
    demanda_garantida: formData.get("modalidade") === "garantida",
    quant_quartos_dedicados: inteiro("quant_quartos_dedicados"),
    max_hospedes_por_quarto: inteiro("max_hospedes_por_quarto"),
    max_hospedes_por_dia: inteiro("max_hospedes_por_dia"),
    exige_relatorio_para_faturar:
      formData.get("exige_relatorio_para_faturar") === "on",
    // A vigência do hotel vem do CONTRATO — vínculo obrigatório.
    contrato_id: texto("contrato_id"),
  }
}

/**
 * Campos da modalidade. Demanda garantida valida e grava os parâmetros; ao
 * voltar para pagamento por uso, só a modalidade muda (os parâmetros ficam,
 * para uma eventual volta). Hotel que nunca foi garantido não envia nada —
 * assim o cadastro segue funcionando antes do SQL da demanda garantida.
 */
function camposDaModalidade(
  formData: FormData,
  dados: ReturnType<typeof lerCampos>
): { campos: Record<string, unknown> } | { erro: string } {
  const modalidade = formData.get("modalidade") === "garantida" ? "garantida" : "uso"
  if (modalidade === "uso") {
    return formData.get("modalidade_anterior") === "garantida"
      ? { campos: { modalidade: "uso" } }
      : { campos: {} }
  }

  const inteiro = (campo: string, min: number, max: number, padrao: number) => {
    const v = String(formData.get(campo) ?? "").trim()
    if (v === "") return padrao
    const n = Number(v)
    return Number.isInteger(n) && n >= min && n <= max ? n : Number.NaN
  }
  const hora = (campo: string, padrao: string) => {
    const v = String(formData.get(campo) ?? "").trim() || padrao
    return /^\d{2}:\d{2}$/.test(v) ? v : null
  }

  const semana = Array.from({ length: 7 }, (_, i) => {
    const v = String(formData.get(`quartos_dia_${i}`) ?? "").trim()
    if (v === "") return null
    const n = Number(v)
    return Number.isInteger(n) && n >= 0 && n <= 500 ? n : Number.NaN
  })
  if (semana.some((n) => Number.isNaN(n))) {
    return { erro: "Quartos por dia da semana: use números inteiros de 0 a 500 ou deixe em branco." }
  }
  if (!dados.max_hospedes_por_quarto || dados.max_hospedes_por_quarto < 1) {
    return { erro: "Na demanda garantida, informe o máximo de hóspedes por quarto (as vagas de cada quarto)." }
  }
  const algumQuarto =
    (dados.quant_quartos_dedicados ?? 0) > 0 || semana.some((n) => (n ?? 0) > 0)
  if (!algumQuarto) {
    return { erro: "Na demanda garantida, informe os quartos dedicados." }
  }

  const travaDias = inteiro("trava_dias_antes", 0, 60, 3)
  const maxNoites = inteiro("max_noites", 1, 60, 7)
  const cancelamento = inteiro("cancelamento_horas", 0, 720, 24)
  const espera = inteiro("espera_prazo_horas", 1, 168, 12)
  const travaHora = hora("trava_hora", "12:00")
  const checkin = hora("horario_checkin", "14:00")
  if ([travaDias, maxNoites, cancelamento, espera].some((n) => Number.isNaN(n))) {
    return { erro: "Confira os números da demanda garantida: dias da trava (0 a 60), noites (1 a 60), cancelamento (0 a 720 horas) e confirmação da espera (1 a 168 horas)." }
  }
  if (!travaHora || !checkin) return { erro: "Informe os horários no formato HH:MM." }

  return {
    campos: {
      modalidade: "garantida",
      quartos_por_dia_semana: semana.every((n) => n === null) ? null : semana,
      regra_distribuicao: formData.get("regra_distribuicao") === "distribuicao" ? "distribuicao" : "lotacao",
      trava_ultimo_quarto: formData.get("trava_ultimo_quarto") === "on",
      trava_dias_antes: travaDias,
      trava_hora: travaHora,
      max_noites: maxNoites,
      horario_checkin: checkin,
      cancelamento_horas: cancelamento,
      espera_prazo_horas: espera,
    },
  }
}

/** Coluna ausente = SQL da demanda garantida ainda não rodado. */
function mensagemDeErroHotel(error: { code?: string; message: string }): string {
  if (error.code === "PGRST204" || error.code === "42703") {
    return "a demanda garantida ainda não está instalada no banco — rode supabase/hospedagem-demanda-garantida.sql."
  }
  return error.message
}

export async function criarHotel(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("filiacao_hospedagens_gestao")

  const dados = lerCampos(formData)
  if (!dados.nome) return { erro: "O nome do hotel é obrigatório." }
  if (!dados.contrato_id) {
    return { erro: "Vincule um contrato ao hotel (obrigatório)." }
  }

  const modalidade = camposDaModalidade(formData, dados)
  if ("erro" in modalidade) return { erro: modalidade.erro }

  const admin = await createAdminClient()
  const { error } = await admin.from("hospedagem_hotel").insert({
    ...dados,
    ...modalidade.campos,
    emp_proprietaria_id: await tenantAtual(),
  })
  if (error) return { erro: `Não foi possível criar: ${mensagemDeErroHotel(error)}` }

  revalidatePath("/painel/hospedagem/hoteis")
  revalidatePath("/painel/hospedagem")
  redirect("/painel/hospedagem/hoteis?salvo=1")
}

export async function atualizarHotel(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("filiacao_hospedagens_gestao")

  const id = String(formData.get("id") ?? "")
  if (!id) return { erro: "Hotel inválido." }

  const dados = lerCampos(formData)
  if (!dados.nome) return { erro: "O nome do hotel é obrigatório." }
  if (!dados.contrato_id) {
    return { erro: "Vincule um contrato ao hotel (obrigatório)." }
  }

  const modalidade = camposDaModalidade(formData, dados)
  if ("erro" in modalidade) return { erro: modalidade.erro }

  const admin = await createAdminClient()
  const { error, count } = await admin
    .from("hospedagem_hotel")
    .update({ ...dados, ...modalidade.campos }, { count: "exact" })
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: `Não foi possível salvar: ${mensagemDeErroHotel(error)}` }
  if (count === 0) return { erro: "Hotel não encontrado." }

  revalidatePath("/painel/hospedagem/hoteis")
  revalidatePath(`/painel/hospedagem/hoteis/${id}`)
  revalidatePath("/painel/hospedagem")
  redirect("/painel/hospedagem/hoteis?salvo=1")
}

export async function criarTarifa(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("filiacao_hospedagens_gestao")

  const hotelId = String(formData.get("hotel_id") ?? "")
  if (!hotelId) return { erro: "Hotel inválido." }

  const numero = (campo: string) => {
    const v = String(formData.get(campo) ?? "").trim().replace(",", ".")
    if (v === "") return null
    const n = Number(v)
    return Number.isFinite(n) && n >= 0 ? n : null
  }
  const pessoas = numero("pessoas_por_quarto")
  const custoFiliado = numero("custo_por_filiado")
  const custoEntidade = numero("custo_entidade")

  if (pessoas === null || !Number.isInteger(pessoas) || pessoas < 1) {
    return { erro: "Informe quantas pessoas por quarto (número inteiro)." }
  }
  if (custoFiliado === null && custoEntidade === null) {
    return { erro: "Informe pelo menos um dos custos (filiado ou entidade)." }
  }

  const admin = await createAdminClient()
  const { error } = await admin.from("hospedagem_tarifas").insert({
    hotel_id: hotelId,
    pessoas_por_quarto: pessoas,
    custo_por_filiado: custoFiliado,
    custo_entidade: custoEntidade,
  })
  if (error) return { erro: `Não foi possível criar a tarifa: ${error.message}` }

  revalidatePath(`/painel/hospedagem/hoteis/${hotelId}`)
  revalidatePath("/painel/hospedagem/hoteis")
  return { ok: "Tarifa adicionada." }
}

// ── Usuários do hotel (interface do hotel — Porta 4) ──────────────────────

/**
 * Cria o acesso do pessoal do hotel: registro em hospedagem_hotel_usuarios +
 * convite por email (define a senha em /definir-senha e cai em /hotel/inicio).
 * Se o email já tiver conta no Auth, o vínculo vale mesmo assim — a pessoa
 * entra em /hotel com a senha que já tem.
 */
export async function criarUsuarioHotel(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("filiacao_hospedagens_gestao")

  const hotelId = String(formData.get("hotel_id") ?? "")
  const nome = String(formData.get("nome") ?? "").trim() || null
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase()
  if (!hotelId) return { erro: "Hotel inválido." }
  if (!/^\S+@\S+\.\S+$/.test(email)) return { erro: "Informe um email válido." }

  const admin = await createAdminClient()

  const { data: hotel } = await admin
    .from("hospedagem_hotel")
    .select("id")
    .eq("id", hotelId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (!hotel) return { erro: "Hotel não encontrado." }

  const { data: convite, error: erroConvite } =
    await admin.auth.admin.inviteUserByEmail(email, {
      data: { tipo: "hotel" },
      redirectTo: `${SITE_URL}/auth/confirm?next=/definir-senha`,
    })

  const { error } = await admin.from("hospedagem_hotel_usuarios").insert({
    hotel_id: hotelId,
    email,
    nome,
    auth_user_id: convite?.user?.id ?? null,
    ativo: true,
    emp_proprietaria_id: await tenantAtual(),
  })
  if (error) {
    if (error.code === "PGRST205" || error.code === "42P01") {
      return {
        erro: "A tabela de usuários de hotel ainda não existe — rode supabase/hospedagem-hotel.sql no SQL Editor.",
      }
    }
    if (error.code === "23505") {
      return { erro: "Este email já tem acesso de hotel cadastrado." }
    }
    return { erro: `Não foi possível criar o acesso: ${error.message}` }
  }

  revalidatePath(`/painel/hospedagem/hoteis/${hotelId}`)
  return {
    ok: erroConvite
      ? "Acesso criado. O email já tinha conta — a pessoa entra em /hotel com a senha existente (ou usa a recuperação de senha)."
      : "Acesso criado — convite enviado por email para definição de senha.",
  }
}

export async function alternarUsuarioHotel(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("filiacao_hospedagens_gestao")

  const id = String(formData.get("id") ?? "")
  const hotelId = String(formData.get("hotel_id") ?? "")
  const ativo = String(formData.get("ativo") ?? "") === "true"
  if (!id) return { erro: "Usuário inválido." }

  const admin = await createAdminClient()
  const { error, count } = await admin
    .from("hospedagem_hotel_usuarios")
    .update({ ativo }, { count: "exact" })
    .eq("id", id)
  if (error) return { erro: `Não foi possível salvar: ${error.message}` }
  if (count === 0) return { erro: "Usuário não encontrado." }

  if (hotelId) revalidatePath(`/painel/hospedagem/hoteis/${hotelId}`)
  return { ok: ativo ? "Acesso reativado." : "Acesso desativado." }
}

export async function excluirTarifa(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await requirePermissao("filiacao_hospedagens_gestao")

  const id = String(formData.get("id") ?? "")
  const hotelId = String(formData.get("hotel_id") ?? "")
  if (!id) return { erro: "Tarifa inválida." }

  const admin = await createAdminClient()
  const { error } = await admin.from("hospedagem_tarifas").delete().eq("id", id)
  if (error) return { erro: `Não foi possível excluir: ${error.message}` }

  if (hotelId) revalidatePath(`/painel/hospedagem/hoteis/${hotelId}`)
  revalidatePath("/painel/hospedagem/hoteis")
  return { ok: "Tarifa excluída." }
}
