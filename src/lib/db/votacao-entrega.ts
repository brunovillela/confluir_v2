import "server-only"

import { derivarModalidade, temVotoOnline } from "@/lib/assembleias-constantes"
import { colunasHorario, janelaDaAssembleia, situacaoDaAssembleia } from "@/lib/db/assembleias-horarios"
import { lerEmLotes, texto } from "@/lib/db/comum"
import { escopoAptos, filtroAptos } from "@/lib/db/votacao-escopo"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"
import { canalDoApto, ROTULOS_CANAL, semCodigo, type CanalIndicador } from "@/lib/votacao-canais"

/**
 * INDICADORES DE ENTREGA DA VOTAÇÃO (fase 4 do plano de 16/10/2026).
 *
 * Os números da análise SLB × Baker, gerados sozinhos a cada assembleia: a
 * quantos aptos o link pessoal chegou (e se antes da abertura), por onde
 * cada um entrou para votar, quantos códigos por e-mail os aptos pediram (por
 * domínio — o firewall da empresa aparece aqui) e quem pediu código e não
 * votou. Nada aqui toca no voto: tudo sai da participação (o apto).
 *
 * Os códigos vêm de auth_codigos_envios, que registra o e-mail e a hora de
 * cada código mas não para qual votação: contam-se só os enviados aos e-mails
 * dos aptos desta assembleia, de 24 h antes da abertura até o fim.
 */

export type EntregaAssembleia = {
  assembleiaId: string
  nome: string | null
  inicio: number | null
  termino: number | null
  aptos: number
  votaram: number
  link: {
    enviados: number
    /** Primeiro envio antes da abertura (só depois do SQL da fase 2). */
    antesDaAbertura: number | null
    semEmail: number
    falhas: number
  }
  porCanal: { canal: CanalIndicador; rotulo: string; votos: number }[]
  /** Votaram sem depender de código por e-mail (link pessoal, Telegram, portal, urna). */
  semCodigo: number
  /** Votos sem canal registrado (antes de 17/10/2026). */
  semRegistro: number
  codigos: {
    /** Códigos enviados a e-mails de aptos desta assembleia, no período. */
    enviados: number
    emails: number
    porDominio: { dominio: string; codigos: number }[]
    pediramENaoVotaram: number
  }
}

type Apto = {
  hora_voto: string | null
  acesso_canal?: string | null
  comprovante_canal?: string | null
  aviso_primeiro_em?: string | null
  aviso_email_em?: string | null
  aviso_email_erro?: string | null
  email_corporativo: string | null
  email_contato?: string | null
}

const DOMINIO = (e: string) => e.split("@")[1] ?? e

export async function entregaDaAssembleia(assembleiaId: string): Promise<EntregaAssembleia | null> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data: bruta } = await admin
    .from("voto_assembleias")
    .select("id, nome_assembleia, data_inicio, data_termino, rod_assembleia_id" + (await colunasHorario()))
    .eq("id", assembleiaId)
    .eq("emp_proprietaria_id", emp)
    .maybeSingle()
  if (!bruta) return null
  const a = bruta as unknown as Record<string, unknown>
  const rodadaId = texto(a.rod_assembleia_id)
  const [{ data: rod }, { count: assembleiasNaRodada }] = await Promise.all([
    rodadaId
      ? admin.from("voto_rod_assembleias").select("termino").eq("id", rodadaId).maybeSingle()
      : Promise.resolve({ data: null }),
    rodadaId
      ? admin.from("voto_assembleias").select("id", { count: "exact", head: true }).eq("rod_assembleia_id", rodadaId)
      : Promise.resolve({ count: 1 }),
  ])
  const janela = janelaDaAssembleia(a, texto((rod as { termino?: unknown } | null)?.termino))

  const escopo = filtroAptos(await escopoAptos(assembleiaId))
  const ler = (colunas: string) =>
    lerEmLotes<Apto>((de, ate) =>
      admin
        .from("voto_assembleias_aptos")
        .select(colunas)
        .eq("emp_proprietaria_id", emp)
        .or(escopo)
        .order("id")
        .range(de, ate)
    )
  let aptos: Apto[]
  try {
    aptos = await ler(
      "id, hora_voto, acesso_canal, comprovante_canal, aviso_primeiro_em, aviso_email_em, aviso_email_erro, email_corporativo, email_contato"
    )
  } catch {
    // Antes dos SQLs das fases 2 e 4: sem canal nem primeiro envio.
    aptos = await ler("id, hora_voto, comprovante_canal, aviso_email_em, aviso_email_erro, email_corporativo")
  }

  // Com várias assembleias na rodada, votou NESTA quem votou dentro da janela dela.
  const votouAqui = (x: Apto) => {
    if (!x.hora_voto) return false
    if ((assembleiasNaRodada ?? 1) <= 1) return true
    const t = Date.parse(x.hora_voto)
    return (janela.inicio === null || t >= janela.inicio) && (janela.termino === null || t <= janela.termino)
  }
  const votantes = aptos.filter(votouAqui)

  const temPrimeiro = aptos.some((x) => x.aviso_primeiro_em !== undefined)
  const enviados = aptos.filter((x) => x.aviso_primeiro_em || (x.aviso_email_em && !x.aviso_email_erro))
  const link = {
    enviados: enviados.length,
    antesDaAbertura:
      temPrimeiro && janela.inicio !== null
        ? aptos.filter((x) => x.aviso_primeiro_em && Date.parse(x.aviso_primeiro_em) < (janela.inicio as number)).length
        : null,
    semEmail: aptos.filter((x) => x.aviso_email_erro === "sem_email").length,
    falhas: aptos.filter((x) => x.aviso_email_erro === "falha").length,
  }

  const contagem = new Map<CanalIndicador, number>()
  for (const v of votantes) {
    const c = canalDoApto(v)
    contagem.set(c, (contagem.get(c) ?? 0) + 1)
  }
  const porCanal = [...contagem.entries()]
    .map(([canal, votos]) => ({ canal, rotulo: ROTULOS_CANAL[canal], votos }))
    .sort((p, q) => q.votos - p.votos)

  // Códigos aos e-mails dos aptos, de 24 h antes da abertura até o fim.
  const emailsDoApto = (x: Apto) =>
    [x.email_corporativo, x.email_contato].filter((e): e is string => Boolean(e)).map((e) => e.trim().toLowerCase())
  const emailsAptos = new Set(aptos.flatMap(emailsDoApto))
  const codigosPorEmail = new Map<string, number>()
  if (emailsAptos.size && janela.inicio !== null) {
    try {
      const envios = await lerEmLotes<{ email: string }>((de, ate) => {
        let q = admin
          .from("auth_codigos_envios")
          .select("id, email")
          .eq("emp_proprietaria_id", emp)
          .gte("enviado_em", new Date((janela.inicio as number) - 86_400_000).toISOString())
        if (janela.termino !== null) q = q.lte("enviado_em", new Date(janela.termino).toISOString())
        return q.order("id").range(de, ate)
      })
      for (const e of envios) {
        const email = e.email.trim().toLowerCase()
        if (emailsAptos.has(email)) codigosPorEmail.set(email, (codigosPorEmail.get(email) ?? 0) + 1)
      }
    } catch {
      // sem a tabela de envios (SQL da cadência de códigos): sem o indicador
    }
  }
  const porDominio = new Map<string, number>()
  for (const [email, n] of codigosPorEmail) porDominio.set(DOMINIO(email), (porDominio.get(DOMINIO(email)) ?? 0) + n)

  return {
    assembleiaId,
    nome: texto(a.nome_assembleia),
    inicio: janela.inicio,
    termino: janela.termino,
    aptos: aptos.length,
    votaram: votantes.length,
    link,
    porCanal,
    semCodigo: votantes.filter((v) => semCodigo(canalDoApto(v))).length,
    semRegistro: contagem.get("nao_registrado") ?? 0,
    codigos: {
      enviados: [...codigosPorEmail.values()].reduce((s, n) => s + n, 0),
      emails: codigosPorEmail.size,
      porDominio: [...porDominio.entries()]
        .map(([dominio, codigos]) => ({ dominio, codigos }))
        .sort((p, q) => q.codigos - p.codigos),
      pediramENaoVotaram: aptos.filter((x) => !x.hora_voto && emailsDoApto(x).some((e) => codigosPorEmail.has(e))).length,
    },
  }
}

export type LinhaComparativo = EntregaAssembleia & {
  campanha: string | null
  situacao: "aberta" | "encerrada"
}

/**
 * Comparativo das assembleias com voto pela internet desta versão (as do
 * Bubble não têm os registros), da mais recente para a mais antiga. Só as já
 * abertas ou encerradas.
 */
export async function comparativoEntrega(limite = 12): Promise<LinhaComparativo[]> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data } = await admin
    .from("voto_assembleias")
    .select(
      "id, online, urnas_de_votacao, data_inicio, data_termino, rod_assembleia_id, created_at, rodada:rod_assembleia_id (termino, campanha:campanha_id (tema))" +
        (await colunasHorario())
    )
    .eq("emp_proprietaria_id", emp)
    .is("bubble_id", null)
    .order("data_inicio", { ascending: false, nullsFirst: false })
    .limit(80)
  const agora = Date.now()
  const alvos = ((data ?? []) as unknown as Record<string, unknown>[])
    .filter((a) => temVotoOnline(derivarModalidade(a)))
    .map((a) => {
      const rodada = a.rodada as { termino?: string | null; campanha?: { tema?: string | null } | null } | null
      return { a, rodada, situacao: situacaoDaAssembleia(a, rodada?.termino ?? null, agora) }
    })
    .filter((x) => x.situacao !== "antes")
    .slice(0, limite)

  const linhas = await Promise.all(
    alvos.map(async ({ a, rodada, situacao }) => {
      const e = await entregaDaAssembleia(String(a.id)).catch(() => null)
      return e
        ? ({ ...e, campanha: rodada?.campanha?.tema ?? null, situacao: situacao === "aberta" ? "aberta" : "encerrada" } as LinhaComparativo)
        : null
    })
  )
  return linhas.filter((l): l is LinhaComparativo => l !== null)
}
