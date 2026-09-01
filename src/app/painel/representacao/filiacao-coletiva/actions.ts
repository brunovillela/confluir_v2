"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao, requireSessaoPainel } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import {
  aplicarProcesso,
  maturarFiliacoesColetivas,
  reverterProcesso,
} from "@/lib/db/filiacao-coletiva"
import { createAdminClient } from "@/lib/supabase/admin"
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/env"
import { tenantAtual } from "@/lib/tenant"

/**
 * Filiação coletiva — escrita. O cadastro nasce de uma RODADA com cláusula;
 * a aplicação do lote e, principalmente, a REVERSÃO são ações de peso: a
 * reversão exige a senha do usuário logado (confirmação forte).
 */

async function exigir() {
  return requirePermissao("assembleias")
}

function txt(fd: FormData, campo: string): string | null {
  const v = String(fd.get(campo) ?? "").trim()
  return v === "" ? null : v
}

export async function criarProcessoColetivo(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  const sessao = await exigir()
  const rodadaId = txt(fd, "rod_assembleia_id")
  const titulo = txt(fd, "titulo")
  if (!rodadaId) return { erro: "Escolha a rodada de assembleia." }
  if (!titulo) return { erro: "Dê um título ao processo." }
  const dias = Number((txt(fd, "dias_desistencia") ?? "").replace(/\D/g, ""))
  if (!Number.isFinite(dias) || dias <= 0) {
    return { erro: "Informe o prazo de desistência em dias." }
  }

  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("filiacao_coletiva")
    .insert({
      emp_proprietaria_id: await tenantAtual(),
      rod_assembleia_id: rodadaId,
      acordo_id: txt(fd, "acordo_id"),
      titulo,
      observacoes: txt(fd, "observacoes"),
      dias_desistencia: dias,
      situacao: "rascunho",
      criado_por: sessao.usuario.id,
    })
    .select("id")
    .single()
  if (error || !data) {
    if ((error?.code ?? "") === "23505") {
      return { erro: "Esta rodada já tem um processo de filiação coletiva." }
    }
    return { erro: `Não foi possível criar: ${error?.message}` }
  }
  revalidatePath("/painel/representacao/filiacao-coletiva")
  redirect(`/painel/representacao/filiacao-coletiva/${data.id}`)
}

/** Aplica o lote conciliado (decisões das dúvidas vêm como duvida_<aptoId>). */
export async function aplicarProcessoAction(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  await exigir()
  const id = txt(fd, "id")
  if (!id) return { erro: "Processo inválido." }
  if (txt(fd, "confirmacao") !== "APLICAR") {
    return { erro: 'Digite APLICAR para confirmar o processamento.' }
  }
  const decisoes: Record<string, string> = {}
  for (const [k, v] of fd.entries()) {
    if (k.startsWith("duvida_") && typeof v === "string" && v) {
      decisoes[k.slice("duvida_".length)] = v
    }
  }
  const { erro, resumo } = await aplicarProcesso(id, decisoes)
  if (erro) return { erro }
  revalidatePath(`/painel/representacao/filiacao-coletiva/${id}`)
  revalidatePath("/painel/filiados/coletivas")
  return {
    ok: `Processo aplicado: ${resumo?.criados ?? 0} filiação(ões) criada(s), ${resumo?.recarimbados ?? 0} atualizada(s), ${resumo?.mantidos ?? 0} mantida(s) como ativa(s)${resumo?.ignorados ? `, ${resumo.ignorados} ignorada(s)` : ""}.`,
  }
}

/**
 * REVERSÃO — desfaz o lote inteiro. Confirmação forte: além de digitar
 * REVERTER, o usuário reautentica com a própria senha (mitiga o "foi sem
 * querer"). A senha é validada contra o Supabase Auth e não é gravada.
 */
export async function reverterProcessoAction(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  const sessao = await exigir()
  const id = txt(fd, "id")
  const senha = txt(fd, "senha")
  if (!id) return { erro: "Processo inválido." }
  if (txt(fd, "confirmacao") !== "REVERTER") {
    return { erro: "Digite REVERTER para confirmar." }
  }
  if (!senha) return { erro: "Informe sua senha para confirmar a reversão." }

  const email = String(sessao.usuario.email ?? sessao.user.email ?? "")
  if (!email) return { erro: "Não foi possível identificar seu e-mail de acesso." }

  // reautenticação isolada (não toca nos cookies da sessão atual)
  const { createClient } = await import("@supabase/supabase-js")
  const verificador = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { error: erroLogin } = await verificador.auth.signInWithPassword({
    email,
    password: senha,
  })
  if (erroLogin) return { erro: "Senha incorreta — a reversão não foi feita." }

  const { erro, revertidos } = await reverterProcesso(id, sessao.usuario.id)
  if (erro) return { erro }
  revalidatePath(`/painel/representacao/filiacao-coletiva/${id}`)
  revalidatePath("/painel/filiados/coletivas")
  return { ok: `Processo revertido: ${revertidos ?? 0} registro(s) desfeito(s).` }
}

export async function excluirProcessoAction(
  _prev: EstadoForm,
  fd: FormData
): Promise<EstadoForm> {
  await exigir()
  const id = txt(fd, "id")
  if (!id) return { erro: "Processo inválido." }
  const admin = await createAdminClient()
  const { data } = await admin
    .from("filiacao_coletiva")
    .select("situacao")
    .eq("id", id)
    .maybeSingle()
  if (data?.situacao === "processado") {
    return {
      erro: "Um processo aplicado não pode ser excluído — use a reversão.",
    }
  }
  const { error } = await admin
    .from("filiacao_coletiva")
    .delete()
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: `Não foi possível excluir: ${error.message}` }
  revalidatePath("/painel/representacao/filiacao-coletiva")
  redirect("/painel/representacao/filiacao-coletiva?excluido=1")
}

/** Botão "processar agora" — roda a maturação sem esperar o tick diário. */
export async function maturarAgoraAction(
  _prev: EstadoForm,
  _fd: FormData
): Promise<EstadoForm> {
  await exigir()
  const { avancados, ativados } = await maturarFiliacoesColetivas()
  revalidatePath("/painel/filiados/coletivas")
  revalidatePath("/painel/representacao/filiacao-coletiva")
  if (avancados === 0 && ativados === 0) {
    return { ok: "Nada a fazer — ninguém venceu o prazo hoje." }
  }
  return {
    ok: `${avancados} filiação(ões) informada(s) à fonte e ${ativados} ativada(s).`,
  }
}
