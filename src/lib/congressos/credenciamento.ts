/**
 * Congressos — regras puras do dia do evento: prazo de credenciamento, troca
 * de titular por suplente, quem está em exercício (vota agora), quórum e
 * leitura dos QR. Testes: tests/unidade/congressos.spec.ts
 */

import { valor, type ConfigCongresso, type ValorAjuste } from "./config"
import type { CategoriaPapel, Direitos } from "./regras"

// ── Prazo ────────────────────────────────────────────────────────────────────

export type ResultadoPrazo = { permitido: boolean; exigeJustificativa: boolean; motivo?: string }

function instante(v: ValorAjuste): number | null {
  if (typeof v !== "string") return null
  const t = Date.parse(v)
  return Number.isNaN(t) ? null : t
}

/** O credenciamento desta pessoa ainda cabe no prazo da configuração? */
export function prazoCredenciamento(config: ConfigCongresso, categoria: CategoriaPapel | null, agora = new Date()): ResultadoPrazo {
  const chave = categoria === "suplente" ? "credenciamento.suplente_ate" : "credenciamento.titular_ate"
  const limite = instante(valor(config, chave))
  if (limite === null || agora.getTime() <= limite) return { permitido: true, exigeJustificativa: false }
  const quem = categoria === "suplente" ? "dos suplentes" : "dos titulares"
  if (valor(config, "credenciamento.apos_prazo") === "justificativa") {
    return { permitido: true, exigeJustificativa: true, motivo: `Fora do prazo de credenciamento ${quem}: registre a justificativa.` }
  }
  return { permitido: false, exigeJustificativa: false, motivo: `O prazo de credenciamento ${quem} terminou.` }
}

// ── Substituição de titular por suplente ─────────────────────────────────────

export type PessoaTroca = {
  id: string
  categoria: CategoriaPapel | null
  unidadeId: string | null
  titularId: string | null
  credenciado: boolean
  situacao: string
  inscritoEm: string
}

/**
 * Confere se o suplente pode assumir no lugar do titular. `substituidos` e
 * `assumiram` são os ids que já estão numa troca ativa.
 */
export function conferirSubstituicao(d: {
  config: ConfigCongresso
  titular: PessoaTroca
  suplente: PessoaTroca
  suplentesDaBase: PessoaTroca[]
  substituidos: Set<string>
  assumiram: Set<string>
  autorizadoPor: string | null
}): { ok: boolean; erro?: string } {
  const { config, titular, suplente } = d
  if (suplente.categoria !== "suplente") return { ok: false, erro: "Só um suplente pode assumir." }
  if (titular.categoria !== "delegado" && titular.categoria !== "nato") return { ok: false, erro: "Só se substitui um delegado titular." }
  // Titular cancelado pode ser substituído: é o caso mais comum de vaga aberta.
  if (suplente.situacao === "cancelado" || suplente.situacao === "recusado") return { ok: false, erro: "O suplente não está ativo no congresso." }
  if (d.substituidos.has(titular.id)) return { ok: false, erro: "Esse titular já foi substituído." }
  if (d.assumiram.has(suplente.id)) return { ok: false, erro: "Esse suplente já assumiu outra vaga." }
  if (suplente.titularId && suplente.titularId !== titular.id) {
    return { ok: false, erro: "Esse suplente está vinculado a outro titular." }
  }
  if (!suplente.titularId && titular.unidadeId !== suplente.unidadeId) {
    return { ok: false, erro: "Titular e suplente são de bases diferentes." }
  }
  const regra = valor<string>(config, "credenciamento.suplente_assume")
  if (regra === "titular_ausente" && titular.credenciado && titular.situacao !== "cancelado") {
    return { ok: false, erro: "O titular está credenciado: o suplente só assume no lugar de titular ausente." }
  }
  if (regra === "ordem") {
    const proximo = d.suplentesDaBase
      .filter((s) => !d.assumiram.has(s.id) && s.situacao !== "cancelado" && s.situacao !== "recusado")
      .sort((a, b) => a.inscritoEm.localeCompare(b.inscritoEm))[0]
    if (proximo && proximo.id !== suplente.id) return { ok: false, erro: "Pela ordem da base, outro suplente assume antes." }
  }
  if (valor(config, "credenciamento.autoriza_troca") !== "ninguem" && !d.autorizadoPor?.trim()) {
    const quem = valor(config, "credenciamento.autoriza_troca") === "comissao" ? "da comissão" : "da coordenação da base"
    return { ok: false, erro: `Informe o nome de quem ${quem} autorizou a troca.` }
  }
  return { ok: true }
}

// ── Quem vota agora ──────────────────────────────────────────────────────────

export type PessoaExercicio = {
  id: string
  situacao: string
  credenciado: boolean
  categoria: CategoriaPapel | null
  direitos: Direitos | null
}

/**
 * Em exercício = pode votar agora. Titular credenciado e não substituído, ou
 * suplente credenciado que assumiu uma vaga. Lista de espera e cancelados
 * nunca contam.
 */
export function emExercicio(pessoas: PessoaExercicio[], trocas: { titularId: string; suplenteId: string }[]): Set<string> {
  const substituidos = new Set(trocas.map((t) => t.titularId))
  const assumiram = new Set(trocas.map((t) => t.suplenteId))
  const r = new Set<string>()
  for (const p of pessoas) {
    if (!p.credenciado || !p.direitos?.voto_plenaria) continue
    if (p.situacao !== "confirmado" && p.situacao !== "inscrito") continue
    if (p.direitos.voto_so_substituindo) {
      if (assumiram.has(p.id)) r.add(p.id)
      continue
    }
    if (!substituidos.has(p.id)) r.add(p.id)
  }
  return r
}

// ── Quórum ───────────────────────────────────────────────────────────────────

export type Quorum = { base: number; exigido: number | null; presentes: number; atingido: boolean | null; percentual: number }

/** Quórum de instalação: % dos que contam no quórum (credenciados em exercício). */
export function calcularQuorum(config: ConfigCongresso, base: number, presentes: number): Quorum {
  const pct = Number(valor(config, "presenca.quorum_instalacao") ?? 0)
  const exigido = pct > 0 ? Math.ceil((base * pct) / 100 - 1e-9) : null
  return {
    base,
    exigido,
    presentes,
    atingido: exigido === null ? null : presentes >= exigido,
    percentual: base ? Math.round((presentes / base) * 1000) / 10 : 0,
  }
}

// ── QR ───────────────────────────────────────────────────────────────────────

/**
 * O que um QR lido na mesa ou na porta significa:
 *   CGRC:<código>  crachá impresso
 *   CGRP:<token>   QR do link pessoal mostrado no celular
 *   URL …/congresso/eu/<token>  o próprio link pessoal
 *   CGRS:<sessão>:<código>  código da sala (lido pelo participante)
 */
export type QrLido =
  | { tipo: "cracha"; codigo: string }
  | { tipo: "pessoal"; token: string }
  | { tipo: "sala"; sessaoId: string; codigo: string }
  | null

export function lerQr(texto: string): QrLido {
  const t = texto.trim()
  let m = /^CGRC:([A-Za-z0-9_-]{8,64})$/.exec(t)
  if (m) return { tipo: "cracha", codigo: m[1] }
  m = /^CGRP:([A-Za-z0-9_-]{20,64})$/.exec(t)
  if (m) return { tipo: "pessoal", token: m[1] }
  m = /\/congresso\/eu\/([A-Za-z0-9_-]{20,64})(?:[?#].*)?$/.exec(t)
  if (m) return { tipo: "pessoal", token: m[1] }
  m = /^CGRS:([0-9a-f-]{36}):([A-Z0-9]{4,10})$/.exec(t)
  if (m) return { tipo: "sala", sessaoId: m[1], codigo: m[2] }
  return null
}

/** CPF mascarado para listas impressas: ***.456.789-** */
export function cpfParcial(cpf: string | null): string {
  if (!cpf || cpf.length !== 11) return "—"
  return `***.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-**`
}
