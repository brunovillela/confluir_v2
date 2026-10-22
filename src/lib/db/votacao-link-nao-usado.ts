import "server-only"

import { lerEmLotes } from "@/lib/db/comum"
import { janelasOnline, type Ambiente } from "@/lib/db/votacao-sem-link"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * LINK PESSOAL QUE NÃO ESTÁ SENDO USADO (21/10/2026).
 *
 * Na Halliburton (21/10), os 2.180 links pessoais saíram 17 h antes da
 * abertura, a Brevo os deu como entregues — e só 33 dos 964 votos vieram por
 * eles. Os cliques registrados eram do robô de segurança do e-mail da
 * empresa, segundos depois da entrega; gente mesmo não abriu. Todo mundo caiu
 * no link geral + código no e-mail pessoal (1.113 códigos), e vieram as
 * reclamações de "não recebi o e-mail". Na SLB, 79% votaram pelo link.
 *
 * O sinal aparece cedo: na primeira meia hora já eram 48 votos por código
 * contra 6 pelo link. Aqui se conta, nas rodadas com votação pela internet
 * ABERTA, por onde entraram os votantes (lib/votacao-canais.ts) e quantos dos
 * que usaram o código já tinham o link pessoal na caixa quando votaram.
 *
 * Dispara quando, com ao menos MIN_VOTANTES votos de canal conhecido, a maior
 * parte veio pelo código E a maioria desses tinha recebido o link — ou seja,
 * o link saiu e não serviu (filtro, quarentena, caixa corporativa que não é
 * lida). Rodada sem o link enviado é outro problema: o alerta "sem link".
 * Com mais de 90% dos aptos já votados ele se cala — não há mais quem ajudar.
 */

/** Abaixo disso a proporção ainda é ruído. */
export const MIN_VOTANTES_LINK = 20
/** Fração dos votos (de canal conhecido) que vieram pelo código. */
const FRACAO_CODIGO = 0.6
/** Fração dos que usaram o código e já tinham o link pessoal na caixa. */
const FRACAO_TINHA_LINK = 0.5
/** Com quase todos já votados não há o que fazer: alerta só se falta esta fração. */
const FRACAO_FALTAM = 0.1

export type RodadaLinkNaoUsado = {
  rodadaId: string
  rodadaNome: string | null
  campanhaId: string | null
  /** Aptos da rodada (das assembleias com voto pela internet). */
  aptos: number
  /** Aptos que ainda não votaram. */
  faltam: number
  /** Votantes com canal registrado. */
  votantes: number
  /** Entraram pelo link pessoal. */
  peloLink: number
  /** Entraram com código por e-mail (link geral ou tela do código). */
  peloCodigo: number
  /** Dos que entraram com código, quantos já tinham o link pessoal ao votar. */
  tinhamLink: number
  /** Sem código e sem link pessoal: Telegram, portal, urna. */
  outros: number
  /** Domínio mais comum dos e-mails da lista (ex.: halliburton.com). */
  dominio: string | null
}

type Linha = {
  hora_voto: string | null
  acesso_canal: string | null
  aviso_email_em: string | null
  aviso_primeiro_em: string | null
  aviso_email_para: string | null
  email_corporativo: string | null
}

function primeiroAviso(l: Linha): string | null {
  const datas = [l.aviso_primeiro_em, l.aviso_email_em].filter((d): d is string => Boolean(d))
  return datas.length ? datas.sort()[0] : null
}

function dominioMaisComum(linhas: Linha[]): string | null {
  const conta = new Map<string, number>()
  for (const l of linhas) {
    const d = (l.aviso_email_para ?? l.email_corporativo)?.split("@")[1]?.trim().toLowerCase()
    if (d) conta.set(d, (conta.get(d) ?? 0) + 1)
  }
  let melhor: string | null = null
  let n = 0
  for (const [d, c] of conta) if (c > n) [melhor, n] = [d, c]
  // Só vale citar o domínio se ele for a maior parte da lista.
  return melhor && n >= linhas.length / 2 ? melhor : null
}

/** Medição de uma rodada (sem decidir se alerta). */
function medir(linhas: Linha[]): Omit<RodadaLinkNaoUsado, "rodadaId" | "rodadaNome" | "campanhaId"> {
  let peloLink = 0
  let peloCodigo = 0
  let tinhamLink = 0
  let outros = 0
  const faltam = linhas.filter((l) => !l.hora_voto).length
  for (const l of linhas) {
    if (!l.hora_voto || !l.acesso_canal) continue
    if (l.acesso_canal === "link_pessoal") peloLink++
    else if (l.acesso_canal === "link_unico_email" || l.acesso_canal === "codigo_email") {
      peloCodigo++
      const aviso = primeiroAviso(l)
      if (aviso && aviso < l.hora_voto) tinhamLink++
    } else outros++
  }
  return { aptos: linhas.length, faltam, votantes: peloLink + peloCodigo + outros, peloLink, peloCodigo, tinhamLink, outros, dominio: dominioMaisComum(linhas) }
}

export function linkNaoUsado(
  m: Pick<RodadaLinkNaoUsado, "aptos" | "faltam" | "votantes" | "peloCodigo" | "tinhamLink">
): boolean {
  return (
    m.faltam >= m.aptos * FRACAO_FALTAM &&
    m.votantes >= MIN_VOTANTES_LINK &&
    m.peloCodigo >= m.votantes * FRACAO_CODIGO &&
    m.tinhamLink >= m.peloCodigo * FRACAO_TINHA_LINK
  )
}

/**
 * Rodadas com votação pela internet aberta em que o link pessoal saiu e não
 * está sendo usado. Tolerante: sem as colunas da fase 4 (acesso_canal) ou
 * com erro de leitura, devolve vazio.
 */
export async function rodadasComLinkNaoUsado(
  amb: Ambiente,
  filtro: { rodadaIds?: string[]; campanhaIds?: string[] } = {}
): Promise<RodadaLinkNaoUsado[]> {
  const { client, emp } = amb
  try {
    const abertas = (await janelasOnline(amb, filtro)).filter((j) => j.aberta)
    if (abertas.length === 0) return []
    // Uma rodada que falhe na leitura não derruba as outras.
    const resultado = await Promise.all(
      abertas.map(async (j) => {
        try {
          const linhas = await lerEmLotes<Linha>((de, ate) =>
            client
              .from("voto_assembleias_aptos")
              .select("hora_voto, acesso_canal, aviso_email_em, aviso_primeiro_em, aviso_email_para, email_corporativo")
              .eq("emp_proprietaria_id", emp)
              .eq("rod_assembleia_id", j.rodadaId)
              .or(`assembleia_id.is.null,assembleia_id.in.(${j.online.join(",")})`)
              .order("id")
              .range(de, ate)
          )
          return { rodadaId: j.rodadaId, rodadaNome: j.rodadaNome, campanhaId: j.campanhaId, ...medir(linhas) }
        } catch (e) {
          console.error("[votacao-link-nao-usado]", j.rodadaId, e instanceof Error ? e.message : e)
          return null
        }
      })
    )
    return resultado.filter((r): r is RodadaLinkNaoUsado => r !== null && linkNaoUsado(r))
  } catch {
    return []
  }
}

/** `rodadasComLinkNaoUsado` com o cliente e o tenant da requisição. */
export async function linkNaoUsadoDasRodadas(
  filtro: { rodadaIds?: string[]; campanhaIds?: string[] } = {}
): Promise<RodadaLinkNaoUsado[]> {
  return rodadasComLinkNaoUsado({ client: await createAdminClient(), emp: await tenantAtual() }, filtro)
}
