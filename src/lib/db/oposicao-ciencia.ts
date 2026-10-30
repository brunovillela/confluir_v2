import "server-only"

import { createHash } from "node:crypto"
import { cookies } from "next/headers"

import type { CampanhaPublica } from "@/lib/db/oposicao"
import {
  avisoPrivacidadePadrao,
  instrucoesDaCampanha,
  perguntasGerais,
  textoDaCiencia,
  type CampanhaParaOrientacao,
  type PerguntaFrequente,
} from "@/lib/oposicao-orientacoes"

/**
 * Oposição: a ciência antes de se opor (pedido do Bruno, 30/10/2026). A
 * pessoa lê as instruções da campanha e o aviso de privacidade e clica em
 * "Li e quero prosseguir"; o filiado, depois, confere os dados. Os dois passos
 * ficam marcados num cookie por campanha — preso ao CPF de quem leu (um
 * computador da família não passa a ciência adiante) e, o da leitura, ao hash
 * do texto (texto mudou, lê de novo). O registro que vale é o da oposição:
 * na confirmação, o texto lido, o hash e a hora vão para oposicao_opositor.
 */

export type OrientacoesDaCampanha = {
  instrucoes: string[]
  aviso: string
  /** Instruções + aviso, como gravados no ato. */
  texto: string
  hash: string
  /** As gerais do sistema e, depois, as da campanha. */
  perguntas: PerguntaFrequente[]
}

function sha256(t: string): string {
  return createHash("sha256").update(t, "utf8").digest("hex")
}

/** O que as orientações precisam saber da campanha, para o perfil. */
export function paraOrientacao(c: CampanhaPublica, filiado: boolean): CampanhaParaOrientacao {
  const videoUrl = filiado ? c.video_filiado_url : c.video_nao_filiado_url
  const tempo = filiado ? c.video_filiado_tempo : c.video_nao_filiado_tempo
  const videoMinimo = c.regras.video_minimo === "exigir" && Boolean(tempo && tempo > 0)
  return {
    prazo_inicio: c.prazo_inicio,
    prazo_fim: c.prazo_fim,
    modo_formalizacao: c.modo_formalizacao,
    regras: c.regras,
    videoMinimo,
    temVideo: Boolean(videoUrl) || videoMinimo,
    temFontes: c.fontes.length > 0,
    temQuestionario: c.perguntas.length > 0,
  }
}

export function orientacoesDaCampanha(c: CampanhaPublica, filiado: boolean, entidade: string): OrientacoesDaCampanha {
  const base = paraOrientacao(c, filiado)
  const instrucoes = instrucoesDaCampanha(base, filiado)
  const aviso = c.avisoPrivacidade?.trim() || avisoPrivacidadePadrao(entidade)
  const texto = textoDaCiencia(instrucoes, aviso)
  return {
    instrucoes,
    aviso,
    texto,
    hash: sha256(texto),
    perguntas: [...perguntasGerais(base, entidade), ...c.perguntasFrequentes],
  }
}

// ── Cookies dos passos ──────────────────────────────────────────────────────

const VALIDADE_S = 2 * 24 * 60 * 60

function marcaDaPessoa(campanhaId: string, cpf: string): string {
  return sha256(`${campanhaId}|${cpf.replace(/\D/g, "")}`).slice(0, 24)
}

function nome(passo: "ciencia" | "dados", campanhaId: string): string {
  return `op_${passo}_${campanhaId.replace(/[^0-9a-f]/gi, "")}`
}

async function gravar(passo: "ciencia" | "dados", campanhaId: string, valor: string): Promise<void> {
  ;(await cookies()).set(nome(passo, campanhaId), valor, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/portal/oposicao",
    maxAge: VALIDADE_S,
  })
}

/** "Li e quero prosseguir": a marca da leitura deste texto por esta pessoa. */
export async function gravarCiencia(campanhaId: string, cpf: string, hash: string): Promise<void> {
  await gravar("ciencia", campanhaId, `${hash}.${marcaDaPessoa(campanhaId, cpf)}.${Date.now()}`)
}

/** Quando a pessoa leu o texto de agora (ISO) — null se não leu, leu outro texto ou é outra pessoa. */
export async function cienciaRegistrada(campanhaId: string, cpf: string, hash: string): Promise<string | null> {
  const v = (await cookies()).get(nome("ciencia", campanhaId))?.value ?? ""
  const [h, marca, quando] = v.split(".")
  if (h !== hash || marca !== marcaDaPessoa(campanhaId, cpf)) return null
  const ms = Number(quando)
  return Number.isFinite(ms) && ms > 0 ? new Date(ms).toISOString() : null
}

/** "Meus dados estão corretos": o filiado conferiu o cadastro. */
export async function gravarDadosConferidos(campanhaId: string, cpf: string): Promise<void> {
  await gravar("dados", campanhaId, `${marcaDaPessoa(campanhaId, cpf)}.${Date.now()}`)
}

export async function dadosConferidos(campanhaId: string, cpf: string): Promise<boolean> {
  const v = (await cookies()).get(nome("dados", campanhaId))?.value ?? ""
  return v.split(".")[0] === marcaDaPessoa(campanhaId, cpf)
}
