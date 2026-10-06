"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import { listarCentrosDeDebito } from "@/lib/db/financeiro"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"
import {
  cancelarRemessa,
  definirLinhaDigitavel,
  gerarRemessa,
  marcarRemessaEnviada,
  processarRetorno,
  salvarContaBancaria,
} from "@/lib/db/remessas"

const ROTA = "/painel/financeiro/remessas"

function campo(fd: FormData, nome: string): string {
  return String(fd.get(nome) ?? "").trim()
}

function revalidar(id?: string) {
  revalidatePath(ROTA)
  revalidatePath(`${ROTA}/nova`)
  revalidatePath(`${ROTA}/contas`)
  if (id) revalidatePath(`${ROTA}/${id}`)
  revalidatePath("/painel/financeiro")
  revalidatePath("/painel/financeiro/ordens")
}

export async function salvarContaAction(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  await requirePermissao("financeiro_pagamento")
  const id = campo(fd, "conta_id") || null
  const centroCustoId = campo(fd, "centro_custo_id") || null
  if (centroCustoId && !(await centroDeDebitoValido(id, centroCustoId))) {
    return { erro: "Escolha uma conta de pagamento (caixa, banco) como centro de custo do débito.", campo: "centro_custo_id" }
  }
  const r = await salvarContaBancaria(id, {
    apelido: campo(fd, "apelido"),
    bancoCodigo: campo(fd, "banco_codigo"),
    bancoNome: campo(fd, "banco_nome") || null,
    agencia: campo(fd, "agencia"),
    agenciaDv: campo(fd, "agencia_dv") || null,
    conta: campo(fd, "conta"),
    contaDv: campo(fd, "conta_dv") || null,
    tipoConta: campo(fd, "tipo_conta") || "corrente",
    convenio: campo(fd, "convenio") || null,
    versaoArquivo: campo(fd, "versao_arquivo") || null,
    versaoLote: campo(fd, "versao_lote") || null,
    titularNome: campo(fd, "titular_nome") || null,
    titularDocumento: campo(fd, "titular_documento") || null,
    pixChave: campo(fd, "pix_chave") || null,
    centroCustoId,
    ativa: fd.get("ativa") !== null,
  })
  if (r.erro) return { erro: r.erro, campo: r.campo }
  revalidar()
  redirect(`${ROTA}/contas?salvo=1`)
}

export async function linhaDigitavelAction(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  await requirePermissao("financeiro_pagamento")
  const r = await definirLinhaDigitavel(campo(fd, "ordem_id"), campo(fd, "linha") || null)
  if (r.erro) return { erro: r.erro, campo: "linha" }
  revalidar()
  return { ok: "Linha digitável gravada." }
}

export async function gerarRemessaAction(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const sessao = await requirePermissao("financeiro_pagamento")
  const contaId = campo(fd, "conta_id")
  if (!contaId) return { erro: "Escolha a conta bancária.", campo: "conta_id" }
  const ordens = fd.getAll("ordens").map(String).filter(Boolean)
  if (ordens.length === 0) return { erro: "Marque ao menos uma ordem." }
  const r = await gerarRemessa(contaId, ordens, sessao.usuario.id as string)
  if (r.erro || !r.remessaId) return { erro: r.erro ?? "Não foi possível gerar." }
  revalidar(r.remessaId)
  redirect(`${ROTA}/${r.remessaId}?gerada=1`)
}

export async function marcarEnviadaAction(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  await requirePermissao("financeiro_pagamento")
  const id = campo(fd, "remessa_id")
  const r = await marcarRemessaEnviada(id)
  if (r.erro) return { erro: r.erro }
  revalidar(id)
  return { ok: "Marcada como enviada ao banco." }
}

export async function cancelarRemessaAction(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const sessao = await requirePermissao("financeiro_pagamento")
  const id = campo(fd, "remessa_id")
  const r = await cancelarRemessa(id, sessao.usuario.id as string)
  if (r.erro) return { erro: r.erro }
  revalidar(id)
  return { ok: "Remessa cancelada — as ordens voltaram a ficar disponíveis." }
}

export async function processarRetornoAction(_prev: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const sessao = await requirePermissao("financeiro_pagamento")
  const id = campo(fd, "remessa_id")
  const arquivo = fd.get("arquivo")
  if (!(arquivo instanceof File) || arquivo.size === 0) return { erro: "Escolha o arquivo de retorno.", campo: "arquivo" }
  const r = await processarRetorno({ remessaId: id, arquivo, usuarioId: sessao.usuario.id as string })
  if (r.erro) return { erro: r.erro }
  revalidar(id)
  const avisos = r.avisos?.length ? ` Avisos: ${r.avisos.join(" · ")}` : ""
  return { ok: `${r.pagos} paga(s), ${r.rejeitados} rejeitada(s)${r.naoEncontrados ? `, ${r.naoEncontrados} sem correspondência` : ""}.${avisos}` }
}

/** Débito da conta bancária: conta de pagamento — ou o centro que ela já tinha. */
async function centroDeDebitoValido(contaId: string | null, centroId: string): Promise<boolean> {
  if ((await listarCentrosDeDebito()).some((c) => c.id === centroId)) return true
  if (!contaId) return false
  const admin = await createAdminClient()
  const { data } = await admin
    .from("financeiro_contas_bancarias")
    .select("centro_custo_id")
    .eq("id", contaId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  return data?.centro_custo_id === centroId
}
