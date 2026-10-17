import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { derivarModalidade, temVotoOnline } from "@/lib/assembleias-constantes"
import { janelaDaAssembleia, situacaoDaAssembleia } from "@/lib/db/assembleias-horarios"
import { hojeSP, lerEmLotes, texto } from "@/lib/db/comum"
import { dadosDoAviso } from "@/lib/db/votacao-aviso"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"
import { origemAtual } from "@/lib/tenant-url"

/**
 * APTOS SEM LINK PESSOAL (plano de adequação da votação online, 16/10/2026).
 *
 * A assembleia da SLB (14/10) mostrou que o que livra o eleitor do código por
 * e-mail é o link pessoal: 79% votaram por ele. Na da Baker (07/10), só 20%
 * dos aptos receberam o link e as reclamações de código se acumularam. Aqui se
 * conta, por rodada com voto pela internet ainda por abrir ou aberta, quem
 * ainda não votou e está sem o link:
 *
 *  - pendente: o aviso ainda não saiu (ou voltou à fila para reenvio);
 *  - sem e-mail: nem e-mail da lista nem filiado com e-mail;
 *  - falha: o provedor recusou o envio.
 *
 * "E-mail repetido" não entra: o mesmo e-mail já recebeu o link por outro
 * apto, e o voto por ele marca os dois. Quem desligou "Votações" no portal
 * também não: o portal lhe mostra a cédula.
 *
 * Serve à página da rodada, às listas (selo) e à caixa de entrada — que roda
 * também no lembrete diário, fora de requisição: por isso o cliente e o
 * tenant vêm explícitos.
 */

/** Com até este prazo para abrir, a falta de link vira pendência e alerta forte. */
export const HORAS_ALERTA_SEM_LINK = 48

export type RodadaSemLink = {
  rodadaId: string
  rodadaNome: string | null
  campanhaId: string | null
  /** Votação pela internet já aberta em alguma assembleia da rodada. */
  aberta: boolean
  /** Próxima abertura (ms) quando ainda não abriu. */
  abreEm: number | null
  /** Horas até a abertura, no momento da leitura (null se já aberta). */
  horasParaAbrir: number | null
  pendentes: number
  semEmail: number
  falhas: number
  /** pendentes + semEmail + falhas. */
  semLink: number
}

type Ambiente = { client: SupabaseClient; emp: string }

/**
 * Rodadas com voto pela internet ainda por abrir ou aberta (apuração não
 * encerrada) e quantos aptos estão sem link em cada uma. Só devolve as que têm
 * alguém sem link. Tolerante: sem as colunas do aviso, devolve vazio.
 */
export async function rodadasComAptosSemLink(
  amb: Ambiente,
  filtro: { rodadaIds?: string[]; campanhaIds?: string[] } = {}
): Promise<RodadaSemLink[]> {
  const { client, emp } = amb
  try {
    let qr = client
      .from("voto_rod_assembleias")
      .select("id, nome_assembleia, termino, campanha_id, apuracao_encerrada")
      .eq("emp_proprietaria_id", emp)
      .not("apuracao_encerrada", "is", true)
      .or(`termino.gte.${hojeSP()},termino.is.null`)
    if (filtro.rodadaIds) qr = qr.in("id", filtro.rodadaIds.length ? filtro.rodadaIds : ["00000000-0000-0000-0000-000000000000"])
    if (filtro.campanhaIds) qr = qr.in("campanha_id", filtro.campanhaIds.length ? filtro.campanhaIds : ["00000000-0000-0000-0000-000000000000"])
    const { data: rodadas, error } = await qr
    if (error || !rodadas?.length) return []
    const rodadaPorId = new Map(rodadas.map((r) => [String(r.id), r]))

    // Horários só depois do SQL de horários: pede as colunas se existirem.
    const sonda = await client.from("voto_assembleias").select("hora_inicio").limit(1)
    const horas = sonda.error ? "" : ", hora_inicio, hora_termino"
    const { data: brutas, error: erroA } = await client
      .from("voto_assembleias")
      .select("id, online, urnas_de_votacao, data_inicio, data_termino, apuracao_encerrada, rod_assembleia_id" + horas)
      .eq("emp_proprietaria_id", emp)
      .in("rod_assembleia_id", [...rodadaPorId.keys()])
    if (erroA) return []

    const agora = Date.now()
    const porRodada = new Map<string, { aberta: boolean; abreEm: number | null; online: string[] }>()
    for (const a of (brutas ?? []) as unknown as Record<string, unknown>[]) {
      if (a.apuracao_encerrada === true || !temVotoOnline(derivarModalidade(a))) continue
      const rodadaId = String(a.rod_assembleia_id)
      const termino = texto(rodadaPorId.get(rodadaId)?.termino)
      const situacao = situacaoDaAssembleia(a, termino, agora)
      if (situacao === "encerrada") continue
      const item = porRodada.get(rodadaId) ?? { aberta: false, abreEm: null, online: [] }
      item.online.push(String(a.id))
      if (situacao === "aberta") item.aberta = true
      else {
        const inicio = janelaDaAssembleia(a, termino).inicio
        if (inicio !== null && (item.abreEm === null || inicio < item.abreEm)) item.abreEm = inicio
      }
      porRodada.set(rodadaId, item)
    }
    if (porRodada.size === 0) return []

    const resultado = await Promise.all(
      [...porRodada.entries()].map(async ([rodadaId, item]) => {
        // Ainda não votou (nem pela urna) e é apto da rodada inteira ou de
        // uma assembleia com voto pela internet — o apto amarrado a uma
        // assembleia só presencial não precisa de link.
        const contar = async (condicao: string) => {
          const { count, error: e } = await client
            .from("voto_assembleias_aptos")
            .select("id", { count: "exact", head: true })
            .eq("emp_proprietaria_id", emp)
            .eq("rod_assembleia_id", rodadaId)
            .is("hora_voto", null)
            .is("presenca_em", null)
            .or(`assembleia_id.is.null,assembleia_id.in.(${item.online.join(",")})`)
            .or(condicao)
          if (e) throw e
          return count ?? 0
        }
        const [pendentes, semEmail, falhas] = await Promise.all([
          contar("aviso_email_em.is.null"),
          contar("aviso_email_erro.eq.sem_email"),
          contar("aviso_email_erro.eq.falha"),
        ])
        const r = rodadaPorId.get(rodadaId)
        return {
          rodadaId,
          rodadaNome: texto(r?.nome_assembleia),
          campanhaId: texto(r?.campanha_id),
          aberta: item.aberta,
          abreEm: item.aberta ? null : item.abreEm,
          horasParaAbrir: item.aberta || item.abreEm === null ? null : (item.abreEm - agora) / 3600_000,
          pendentes,
          semEmail,
          falhas,
          semLink: pendentes + semEmail + falhas,
        } satisfies RodadaSemLink
      })
    )
    return resultado.filter((r) => r.semLink > 0)
  } catch {
    return []
  }
}

/** A falta de link já é urgente: votação aberta ou abrindo em até 48 h. */
export function semLinkUrgente(r: Pick<RodadaSemLink, "aberta" | "abreEm">, agora = Date.now()): boolean {
  return r.aberta || (r.abreEm !== null && r.abreEm - agora <= HORAS_ALERTA_SEM_LINK * 3600_000)
}

// ── Na requisição ───────────────────────────────────────────────────────────

/** `rodadasComAptosSemLink` com o cliente e o tenant da requisição. */
export async function semLinkDasRodadas(
  filtro: { rodadaIds?: string[]; campanhaIds?: string[] } = {}
): Promise<RodadaSemLink[]> {
  return rodadasComAptosSemLink({ client: await createAdminClient(), emp: await tenantAtual() }, filtro)
}

export type LinkDeApto = {
  nome: string | null
  cpf: string | null
  matricula: string | null
  telefone: string | null
  situacao: "Pendente de envio" | "Sem e-mail" | "Falha no envio"
  link: string
}

/**
 * Link pessoal de cada apto da rodada que ainda não votou e está sem link
 * (pendente, sem e-mail ou falha) — para distribuir por WhatsApp, delegados
 * ou cartaz. O mesmo link do aviso e do botão "Link de voto": vale só para
 * aquele eleitor e para de abrir a cédula depois do voto.
 */
export async function linksDosAptosSemLink(
  rodadaId: string
): Promise<{ linhas?: LinkDeApto[]; rodadaNome?: string; erro?: string }> {
  const { dados, erro } = await dadosDoAviso(rodadaId)
  if (!dados) return { erro }
  if (!dados.assembleiaOnlineId) return { erro: "Esta rodada não tem assembleia online — não há link de voto." }
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  type Linha = {
    id: string
    nome_completo: string | null
    cpf: string | null
    matricula: string | null
    telefone: string | null
    assembleia_id: string | null
    aviso_email_em: string | null
    aviso_email_erro: string | null
  }
  const aptos = await lerEmLotes<Linha>((de, ate) =>
    admin
      .from("voto_assembleias_aptos")
      .select("id, nome_completo, cpf, matricula, telefone, assembleia_id, aviso_email_em, aviso_email_erro")
      .eq("emp_proprietaria_id", emp)
      .eq("rod_assembleia_id", rodadaId)
      .is("hora_voto", null)
      .is("presenca_em", null)
      .or("aviso_email_em.is.null,aviso_email_erro.in.(sem_email,falha)")
      .order("nome_completo", { ascending: true, nullsFirst: false })
      .order("id")
      .range(de, ate)
  )
  const { gerarTokenAcesso } = await import("@/lib/acesso-eleitor")
  const origem = await origemAtual()
  const online = dados.assembleiaOnlineId
  return {
    rodadaNome: dados.rodadaNome,
    linhas: aptos.map((a) => {
      const assembleiaId = a.assembleia_id ?? online
      return {
        nome: a.nome_completo,
        cpf: a.cpf,
        matricula: a.matricula,
        telefone: a.telefone,
        situacao:
          a.aviso_email_erro === "sem_email"
            ? "Sem e-mail"
            : a.aviso_email_erro === "falha"
              ? "Falha no envio"
              : "Pendente de envio",
        link: `${origem}/votar/${assembleiaId}/entrar?t=${encodeURIComponent(gerarTokenAcesso(String(a.id), assembleiaId))}`,
      }
    }),
  }
}
