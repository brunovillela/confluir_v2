import "server-only"

import { createHash, randomInt } from "node:crypto"

import { cache as cacheReact } from "react"

import { derivarModalidade, horaCurta, ROTULOS_MODALIDADE, type Modalidade } from "@/lib/assembleias-constantes"
import { esquemaAusente } from "@/lib/db/comum"
import { enviarEmail } from "@/lib/email"
import { assuntoComprovante, montarEmailComprovante } from "@/lib/email-comprovante-voto"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"
import { origemAtual } from "@/lib/tenant-url"

/**
 * COMPROVANTE DE VOTAÇÃO — prova que a pessoa votou, nunca o que ela votou.
 *
 * Fica no apto (`voto_assembleias_aptos`), que é o registro de participação;
 * `voto_online`, que guarda as escolhas, não recebe nada — nem o código, nem
 * o horário exato. Assim ninguém liga o comprovante às respostas: o código
 * abre uma página que diz "participação confirmada" e mais nada.
 *
 * O hash é o SHA-256 de código + apto + assembleia + momento. Ele não revela
 * nada sozinho e serve para conferir que o registro não foi alterado depois.
 */

export type CanalVoto = "online" | "urna_digital" | "urna_fisica"

export const ROTULO_CANAL: Record<CanalVoto, string> = {
  online: "Votação online",
  urna_digital: "Urna digital (terminal)",
  urna_fisica: "Urna física (cédula em papel)",
}

/** Sem vogais nem caracteres que se confundem (0/O, 1/I). */
const ALFABETO = "23456789ABCDEFGHJKMNPQRSTVWXYZ"

function bloco(tamanho: number): string {
  let s = ""
  for (let i = 0; i < tamanho; i++) s += ALFABETO[randomInt(ALFABETO.length)]
  return s
}

export function gerarCodigoComprovante(): string {
  return `VT-${bloco(4)}-${bloco(4)}`
}

export function hashComprovante(partes: {
  codigo: string
  aptoId: string
  assembleiaId: string
  quando: string
}): string {
  return createHash("sha256")
    .update(`${partes.codigo}|${partes.aptoId}|${partes.assembleiaId}|${partes.quando}`)
    .digest("hex")
}

export type Comprovante = { codigo: string; hash: string; quando: string }

/**
 * Emite o comprovante nos aptos recém-marcados como votantes. Silencioso:
 * comprovante é um extra, nunca pode derrubar o voto já registrado (nem
 * quando falta o SQL das colunas).
 */
export async function emitirComprovante(dados: {
  aptoIds: string[]
  assembleiaId: string
  canal: CanalVoto
  quando: string
}): Promise<Comprovante | null> {
  if (dados.aptoIds.length === 0) return null
  const codigo = gerarCodigoComprovante()
  const hash = hashComprovante({
    codigo,
    aptoId: dados.aptoIds[0],
    assembleiaId: dados.assembleiaId,
    quando: dados.quando,
  })
  const admin = await createAdminClient()
  const { error } = await admin
    .from("voto_assembleias_aptos")
    .update({
      comprovante_codigo: codigo,
      comprovante_hash: hash,
      comprovante_canal: dados.canal,
      comprovante_em: dados.quando,
    })
    .in("id", dados.aptoIds)
  if (error) return null
  return { codigo, hash, quando: dados.quando }
}

/** Os ids dos aptos marcados com esta hora de voto (para emitir o comprovante). */
export async function aptosVotantes(
  filtroOu: string,
  quando: string
): Promise<string[]> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("voto_assembleias_aptos")
    .select("id")
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("hora_voto", quando)
    .or(filtroOu)
  return (data ?? []).map((a) => String(a.id))
}

export type DadosAssembleiaComprovante = {
  assembleiaId: string
  assembleia: string | null
  rodada: string | null
  campanhaTema: string | null
  modalidade: Modalidade
  inicio: string | null
  termino: string | null
  horaInicio: string | null
  horaTermino: string | null
}

export async function dadosDaAssembleia(
  assembleiaId: string
): Promise<DadosAssembleiaComprovante | null> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const comHoras = await admin
    .from("voto_assembleias")
    .select(
      "id, nome_assembleia, online, urnas_de_votacao, data_inicio, data_termino, hora_inicio, hora_termino, rod_assembleia_id"
    )
    .eq("id", assembleiaId)
    .eq("emp_proprietaria_id", emp)
    .maybeSingle()
  const semHoras = comHoras.error
    ? await admin
        .from("voto_assembleias")
        .select(
          "id, nome_assembleia, online, urnas_de_votacao, data_inicio, data_termino, rod_assembleia_id"
        )
        .eq("id", assembleiaId)
        .eq("emp_proprietaria_id", emp)
        .maybeSingle()
    : null
  const a = (comHoras.data ?? semHoras?.data) as Record<string, unknown> | null | undefined
  if (!a) return null

  const { data: rod } = a.rod_assembleia_id
    ? await admin
        .from("voto_rod_assembleias")
        .select("nome_assembleia, campanha:campanha_id (tema)")
        .eq("id", a.rod_assembleia_id as string)
        .maybeSingle()
    : { data: null }
  const campanha = rod?.campanha as { tema?: string | null } | { tema?: string | null }[] | null
  return {
    assembleiaId,
    assembleia: (a.nome_assembleia as string | null) ?? null,
    rodada: (rod?.nome_assembleia as string | null) ?? null,
    campanhaTema: (Array.isArray(campanha) ? campanha[0]?.tema : campanha?.tema) ?? null,
    modalidade: derivarModalidade(a),
    inicio: (a.data_inicio as string | null) ?? null,
    termino: (a.data_termino as string | null) ?? null,
    horaInicio: horaCurta(a.hora_inicio as string | null),
    horaTermino: horaCurta(a.hora_termino as string | null),
  }
}

/** Manda o e-mail de confirmação. Best-effort: marca quando sai. */
export async function enviarEmailComprovante(dados: {
  aptoIds: string[]
  assembleiaId: string
  comprovante: Comprovante
  canal: CanalVoto
  email: string
  nome: string | null
}): Promise<boolean> {
  const assembleia = await dadosDaAssembleia(dados.assembleiaId)
  if (!assembleia) return false
  const origem = await origemAtual()
  const ok = await enviarEmail({
    email: dados.email,
    nome: dados.nome,
    assunto: assuntoComprovante(assembleia),
    html: montarEmailComprovante({
      assembleia,
      comprovante: dados.comprovante,
      canal: dados.canal,
      nome: dados.nome,
      urlConferencia: `${origem}/comprovante/${dados.comprovante.codigo}`,
    }),
  })
  if (ok) {
    const admin = await createAdminClient()
    await admin
      .from("voto_assembleias_aptos")
      .update({ comprovante_email_em: new Date().toISOString() })
      .in("id", dados.aptoIds)
  }
  return ok
}

export type ComprovanteConferido = {
  codigo: string
  hash: string | null
  canal: CanalVoto
  quando: string | null
  eleitor: string | null
  documento: string | null
  assembleia: DadosAssembleiaComprovante | null
}

/** 'MARIA DA SILVA SOUZA' → 'Maria d. S. S.' (confirma sem expor). */
function nomeParcial(nome: string | null): string | null {
  const partes = (nome ?? "").trim().split(/\s+/).filter(Boolean)
  if (partes.length === 0) return null
  const primeiro = partes[0]
  const iniciais = partes.slice(1).map((p) => `${p[0].toUpperCase()}.`)
  return [primeiro.charAt(0).toUpperCase() + primeiro.slice(1).toLowerCase(), ...iniciais].join(" ")
}

/** '12345678901' → '***.456.789-**' */
function cpfParcial(cpf: string | null): string | null {
  const d = (cpf ?? "").replace(/\D/g, "")
  if (d.length !== 11) return null
  return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`
}

/** Conferência pública pelo código — sem login e sem o conteúdo do voto. */
export async function conferirComprovante(
  codigo: string
): Promise<ComprovanteConferido | null> {
  const limpo = codigo.trim().toUpperCase()
  if (!/^VT-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(limpo)) return null
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("voto_assembleias_aptos")
    .select(
      "id, cpf, nome_completo, hora_voto, assembleia_id, rod_assembleia_id, presenca_urna_id, comprovante_codigo, comprovante_hash, comprovante_canal, comprovante_em"
    )
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("comprovante_codigo", limpo)
    .limit(1)
    .maybeSingle()
  if (error) {
    if (esquemaAusente(error) || error.code === "42703") return null
    throw new Error(`Falha ao conferir o comprovante: ${error.message}`)
  }
  if (!data) return null

  let assembleiaId = (data.assembleia_id as string | null) ?? null
  if (!assembleiaId && data.presenca_urna_id) {
    const { data: urna } = await admin
      .from("voto_urnas")
      .select("assembleia_id")
      .eq("id", data.presenca_urna_id as string)
      .maybeSingle()
    assembleiaId = (urna?.assembleia_id as string | null) ?? null
  }
  if (!assembleiaId && data.rod_assembleia_id) {
    const { assembleiaPrincipalDasRodadas } = await import("@/lib/db/votacao-escopo")
    const mapa = await assembleiaPrincipalDasRodadas([String(data.rod_assembleia_id)])
    assembleiaId = mapa.get(String(data.rod_assembleia_id)) ?? null
  }

  return {
    codigo: limpo,
    hash: (data.comprovante_hash as string | null) ?? null,
    canal: ((data.comprovante_canal as CanalVoto | null) ?? "online") as CanalVoto,
    quando: (data.comprovante_em as string | null) ?? (data.hora_voto as string | null) ?? null,
    eleitor: nomeParcial(data.nome_completo as string | null),
    documento: cpfParcial(data.cpf as string | null),
    assembleia: assembleiaId ? await dadosDaAssembleia(assembleiaId) : null,
  }
}

export { ROTULOS_MODALIDADE }

/** Colunas do comprovante, se o SQL já rodou (senão, vazio). */
export const colunasComprovante = cacheReact(async (): Promise<string> => {
  const admin = await createAdminClient()
  const { error } = await admin
    .from("voto_assembleias_aptos")
    .select("comprovante_codigo")
    .limit(1)
  return error ? "" : ", comprovante_codigo, comprovante_hash, comprovante_canal, comprovante_em"
})

export type ComprovanteDoEleitor = {
  codigo: string
  hash: string | null
  canal: CanalVoto
  quando: string | null
}

/** Lê o comprovante de uma linha de apto (quando as colunas existem). */
export function comprovanteDaLinha(
  linha: Record<string, unknown>
): ComprovanteDoEleitor | null {
  const codigo = linha.comprovante_codigo
  if (typeof codigo !== "string" || !codigo) return null
  return {
    codigo,
    hash: typeof linha.comprovante_hash === "string" ? linha.comprovante_hash : null,
    canal: ((linha.comprovante_canal as CanalVoto | null) ?? "online") as CanalVoto,
    quando: typeof linha.comprovante_em === "string" ? linha.comprovante_em : null,
  }
}
