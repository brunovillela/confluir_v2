import "server-only"

import { redirect } from "next/navigation"

import { requireSessaoPainel, type SessaoPainel } from "@/lib/auth"
import { texto } from "@/lib/db/comum"
import {
  CHAVES_DECISAO,
  REGRAS_VAZIAS,
  regrasEfetivas,
  rotuloOpcao,
  valorDecisao,
  type ChaveDecisao,
  type RegrasOposicao,
} from "@/lib/oposicao-constantes"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * DECISÕES JURÍDICAS DA OPOSIÇÃO (28/10/2026): o padrão da entidade
 * (`oposicao_regras`) e a decisão de cada campanha (`oposicao_campanha.regra_*`,
 * nula = padrão). A campanha só abre com todas decididas, e ao abrir grava as
 * decisões vigentes nela (lib/db/oposicao.ts, criar/atualizarCampanha).
 */

export type RegrasDaEntidade = {
  regras: RegrasOposicao
  definidoPorNome: string | null
  atualizadoEm: string | null
  /** Aviso de privacidade da oposição; null = o texto padrão do sistema. */
  avisoPrivacidade: string | null
}

/** O padrão da entidade (tudo nulo enquanto ninguém decidiu). */
export async function regrasDaEntidade(): Promise<RegrasDaEntidade> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("oposicao_regras")
    .select(`${CHAVES_DECISAO.join(", ")}, definido_por_nome, atualizado_em, aviso_privacidade`)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  const linha = (data ?? null) as Record<string, unknown> | null
  return {
    regras: Object.fromEntries(CHAVES_DECISAO.map((c) => [c, texto(linha?.[c])])) as RegrasOposicao,
    definidoPorNome: texto(linha?.definido_por_nome),
    atualizadoEm: texto(linha?.atualizado_em),
    avisoPrivacidade: texto(linha?.aviso_privacidade),
  }
}

/** As colunas regra_* de uma linha de `oposicao_campanha`. */
export function regrasDaLinhaCampanha(linha: Record<string, unknown> | null | undefined): RegrasOposicao {
  if (!linha) return { ...REGRAS_VAZIAS }
  return Object.fromEntries(CHAVES_DECISAO.map((c) => [c, texto(linha[`regra_${c}`])])) as RegrasOposicao
}

/** A campanha em colunas: { regra_carta_fora_prazo: …, … }. */
export function colunasDasRegras(regras: RegrasOposicao): Record<string, string | null> {
  return Object.fromEntries(CHAVES_DECISAO.map((c) => [`regra_${c}`, regras[c]]))
}

export const COLUNAS_REGRA = CHAVES_DECISAO.map((c) => `regra_${c}`).join(", ")

export type RegrasDaCampanha = {
  /** O que a campanha decidiu (nulo = segue a entidade). */
  propria: RegrasOposicao
  entidade: RegrasOposicao
  /** O que vale. */
  efetivas: RegrasOposicao
}

/** As decisões que valem numa campanha. Campanha inexistente → as da entidade. */
export async function regrasDaCampanha(campanhaId: string | null | undefined): Promise<RegrasDaCampanha> {
  const entidade = (await regrasDaEntidade()).regras
  let propria = { ...REGRAS_VAZIAS }
  if (campanhaId) {
    const admin = await createAdminClient()
    const { data } = await admin
      .from("oposicao_campanha")
      .select(COLUNAS_REGRA)
      .eq("id", campanhaId)
      .eq("emp_proprietaria_id", await tenantAtual())
      .maybeSingle()
    propria = regrasDaLinhaCampanha(data as Record<string, unknown> | null)
  }
  return { propria, entidade, efetivas: regrasEfetivas(propria, entidade) }
}

/** Lê do formulário as cinco decisões (campo `regra_<chave>`; "" = nulo). */
export function regrasDoFormulario(fd: FormData): RegrasOposicao {
  return Object.fromEntries(
    CHAVES_DECISAO.map((c) => [c, valorDecisao(c, String(fd.get(`regra_${c}`) ?? "").trim() || null)])
  ) as RegrasOposicao
}

/** Salva o padrão da entidade; cada mudança vai para a trilha com autor e antes → depois. */
export async function salvarRegrasDaEntidade(
  regras: RegrasOposicao,
  usuario: { id: string; nome: string | null }
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const antes = (await regrasDaEntidade()).regras
  const mudou = CHAVES_DECISAO.filter((c) => (antes[c] ?? null) !== (regras[c] ?? null))
  if (mudou.length === 0) return {}
  const { error } = await admin.from("oposicao_regras").upsert(
    {
      emp_proprietaria_id: emp,
      ...regras,
      definido_por: usuario.id,
      definido_por_nome: usuario.nome,
      atualizado_em: new Date().toISOString(),
    },
    { onConflict: "emp_proprietaria_id" }
  )
  if (error) return { erro: `Falha ao salvar as decisões: ${error.message}` }
  const detalhe = mudou
    .map((c) => `${c}: ${rotuloOpcao(c, antes[c]) ?? "—"} → ${rotuloOpcao(c, regras[c]) ?? "—"}`)
    .join("; ")
  const { error: erroTrilha } = await admin.from("oposicao_eventos").insert({
    opositor_id: null,
    campanha_id: null,
    evento: "regras_entidade_editadas",
    detalhe,
    usuario_id: usuario.id,
    emp_proprietaria_id: emp,
  })
  if (erroTrilha) console.error("[oposicao] trilha das decisões não gravada:", erroTrilha.message)
  return {}
}

/** Tamanho máximo do aviso de privacidade da entidade. */
export const MAX_AVISO_PRIVACIDADE = 8000

/**
 * O aviso de privacidade da oposição da entidade (30/10/2026). Texto vazio
 * volta ao padrão do sistema. Cada troca vai para a trilha, com autor. Quem já
 * se opôs guarda o texto que leu (oposicao_opositor.ciencia_texto).
 */
export async function salvarAvisoPrivacidade(
  aviso: string | null,
  usuario: { id: string; nome: string | null }
): Promise<{ erro?: string }> {
  const novo = aviso?.trim() ? aviso.trim().slice(0, MAX_AVISO_PRIVACIDADE) : null
  const antes = await regrasDaEntidade()
  if ((antes.avisoPrivacidade ?? null) === novo) return {}
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { error } = await admin.from("oposicao_regras").upsert(
    {
      emp_proprietaria_id: emp,
      aviso_privacidade: novo,
      definido_por: usuario.id,
      definido_por_nome: usuario.nome,
      atualizado_em: new Date().toISOString(),
    },
    { onConflict: "emp_proprietaria_id" }
  )
  if (error) return { erro: `Falha ao salvar o aviso: ${error.message}` }
  const { error: erroTrilha } = await admin.from("oposicao_eventos").insert({
    opositor_id: null,
    campanha_id: null,
    evento: "aviso_privacidade_editado",
    detalhe: novo ? "Aviso de privacidade da entidade alterado." : "Aviso de privacidade voltou ao padrão do sistema.",
    usuario_id: usuario.id,
    emp_proprietaria_id: emp,
  })
  if (erroTrilha) console.error("[oposicao] trilha do aviso não gravada:", erroTrilha.message)
  return {}
}

// ── Permissões com segregação ────────────────────────────────────────────────

export type AcaoOposicao = "consultar" | "configurar" | "avaliar"

const FLAG_DA_ACAO: Record<Exclude<AcaoOposicao, "consultar">, string> = {
  configurar: "oposicao_configurar",
  avaliar: "oposicao_avaliar",
}

/** As três chaves que dão acesso ao módulo (para o menu e o proxy). */
export const CHAVES_MODULO_OPOSICAO = ["oposicao", "oposicao_configurar", "oposicao_avaliar"]

/**
 * Pode fazer `acao`? Segregação "unica" (ou não decidida): a permissão
 * "oposicao" faz tudo. "separada": configurar e avaliar pedem a permissão
 * própria; consultar aceita qualquer uma das três.
 */
export function podeNaOposicao(
  permissoes: Record<string, unknown> | null,
  acao: AcaoOposicao,
  segregacao: string | null
): boolean {
  const tem = (chave: string) => permissoes?.[chave] === true
  if (acao === "consultar") return CHAVES_MODULO_OPOSICAO.some(tem)
  if (segregacao === "separada") return tem(FLAG_DA_ACAO[acao])
  return tem("oposicao")
}

/**
 * A sessão do painel com o direito de `acao` na campanha (ou no padrão da
 * entidade, sem campanha). Para páginas: sem direito, vai para "sem acesso".
 */
export async function requireOposicao(acao: AcaoOposicao, campanhaId?: string | null): Promise<SessaoPainel> {
  const sessao = await requireSessaoPainel()
  const { efetivas } = await regrasDaCampanha(campanhaId)
  if (!podeNaOposicao(sessao.permissoes as Record<string, unknown>, acao, efetivas.segregacao)) {
    redirect("/painel/sem-acesso")
  }
  return sessao
}

/** Para actions: a mesma conferência, devolvendo a mensagem em vez de redirecionar. */
export async function sessaoParaOposicao(
  acao: AcaoOposicao,
  campanhaId?: string | null
): Promise<{ sessao: SessaoPainel; erro?: undefined } | { sessao?: undefined; erro: string }> {
  const sessao = await requireSessaoPainel()
  const { efetivas } = await regrasDaCampanha(campanhaId)
  if (!podeNaOposicao(sessao.permissoes as Record<string, unknown>, acao, efetivas.segregacao)) {
    return {
      erro:
        acao === "avaliar"
          ? "Você não tem a permissão “Oposição — avaliar” (a segregação de permissões está ligada nesta campanha)."
          : "Você não tem a permissão “Oposição — configurar” (a segregação de permissões está ligada).",
    }
  }
  return { sessao }
}

export type { ChaveDecisao }
