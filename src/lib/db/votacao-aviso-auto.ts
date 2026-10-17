import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { hojeSP } from "@/lib/db/comum"
import { contextoDoTenant } from "@/lib/db/comunicacao-mensagens"
import { enviarLoteAviso } from "@/lib/db/votacao-aviso"
import { janelasOnline } from "@/lib/db/votacao-sem-link"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * ENVIO AUTOMÁTICO DOS LINKS PESSOAIS (fase 2 do plano de 16/10/2026).
 *
 * Na rodada com o envio automático ligado, os links começam a sair sozinhos
 * N horas antes da abertura da votação pela internet — e continuam saindo a
 * quem entrar na lista depois, até a votação terminar. A falha do provedor
 * volta para a fila UMA vez, 1 h depois. Quem dispara é o tick de 15 em 15
 * minutos (/api/votacao/tick), fora de requisição: service client e tenant
 * explícitos. Colunas: supabase/votacao-aviso-fase2.sql.
 *
 * Motivo: na assembleia da SLB (14/10) o link chegou a todos e 79% votaram
 * sem código; na da Baker (07/10), só 20% tinham o link quando a votação abriu.
 */

/** Opções da tela: horas antes da abertura. */
export const OPCOES_AVISO_AUTO = [24, 48, 72] as const

/** Espera antes de tentar de novo um envio que o provedor recusou. */
const ESPERA_NOVA_TENTATIVA_MS = 3600_000

export type AvisoAutoDaRodada = {
  /** false = falta rodar supabase/votacao-aviso-fase2.sql. */
  disponivel: boolean
  horas: number | null
  /** Quando os links começam a sair (ms); null se a votação já abriu ou não há data. */
  comecaEm: number | null
  /** Já está na janela de envio (o tick manda a cada 15 min). */
  ativo: boolean
}

export async function avisoAutoDaRodada(rodadaId: string): Promise<AvisoAutoDaRodada> {
  const client = await createAdminClient()
  const emp = await tenantAtual()
  const { data, error } = await client
    .from("voto_rod_assembleias")
    .select("aviso_auto_horas")
    .eq("id", rodadaId)
    .eq("emp_proprietaria_id", emp)
    .maybeSingle()
  if (error) return { disponivel: false, horas: null, comecaEm: null, ativo: false }
  const horas = typeof data?.aviso_auto_horas === "number" ? data.aviso_auto_horas : null
  if (horas === null) return { disponivel: true, horas: null, comecaEm: null, ativo: false }
  const [janela] = await janelasOnline({ client, emp }, { rodadaIds: [rodadaId] })
  if (!janela) return { disponivel: true, horas, comecaEm: null, ativo: false }
  const comecaEm = janela.abreEm === null ? null : janela.abreEm - horas * 3600_000
  return { disponivel: true, horas, comecaEm, ativo: janela.aberta || (comecaEm !== null && comecaEm <= Date.now()) }
}

/** Liga (horas antes da abertura) ou desliga (null) o envio automático da rodada. */
export async function configurarAvisoAuto(rodadaId: string, horas: number | null): Promise<{ erro?: string }> {
  if (horas !== null && !(OPCOES_AVISO_AUTO as readonly number[]).includes(horas)) {
    return { erro: "Escolha 24, 48 ou 72 horas antes da abertura." }
  }
  const client = await createAdminClient()
  const { error } = await client
    .from("voto_rod_assembleias")
    .update({ aviso_auto_horas: horas })
    .eq("id", rodadaId)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) {
    if (error.code === "42703" || error.code === "PGRST204") {
      return { erro: "Falta rodar o SQL supabase/votacao-aviso-fase2.sql." }
    }
    return { erro: `Não foi possível salvar: ${error.message}` }
  }
  return {}
}

export type ResultadoAvisoAuto = {
  rodadas: number
  enviados: number
  novasTentativas: number
  /** Rodadas que pararam no limite de tempo (seguem no próximo tick). */
  interrompidas: number
  erros: string[]
}

/** Devolve à fila, uma vez, as falhas com mais de 1 h. */
async function reenfileirarFalhas(client: SupabaseClient, emp: string, rodadaId: string): Promise<number> {
  const { data, error } = await client
    .from("voto_assembleias_aptos")
    .update({ aviso_email_em: null, aviso_email_para: null, aviso_email_erro: null, aviso_tentativas: 1 })
    .eq("emp_proprietaria_id", emp)
    .eq("rod_assembleia_id", rodadaId)
    .eq("aviso_email_erro", "falha")
    .eq("aviso_tentativas", 0)
    .lt("aviso_email_em", new Date(Date.now() - ESPERA_NOVA_TENTATIVA_MS).toISOString())
    .is("hora_voto", null)
    .select("id")
  if (error) throw new Error(`falhas: ${error.message}`)
  return data?.length ?? 0
}

/**
 * Tick: para cada rodada com envio automático ligado e já na janela, devolve
 * as falhas antigas à fila e envia aos pendentes em lotes, até `limite` (ms).
 */
export async function rodarAvisosAutomaticos(opcoes: {
  /** Service client (só o tick o cria): sem tenant na requisição, cada leitura filtra à mão. */
  client: SupabaseClient
  limite: number
  tenant?: string | null
}): Promise<ResultadoAvisoAuto> {
  const r: ResultadoAvisoAuto = { rodadas: 0, enviados: 0, novasTentativas: 0, interrompidas: 0, erros: [] }
  const client = opcoes.client
  let q = client
    .from("voto_rod_assembleias")
    .select("emp_proprietaria_id")
    .not("aviso_auto_horas", "is", null)
    .not("apuracao_encerrada", "is", true)
    .or(`termino.gte.${hojeSP()},termino.is.null`)
  if (opcoes.tenant) q = q.eq("emp_proprietaria_id", opcoes.tenant)
  const { data, error } = await q
  if (error) {
    // Sem a coluna (SQL da fase 2 não rodado), não há o que fazer.
    if (error.code !== "42703") r.erros.push(`rodadas: ${error.message}`)
    return r
  }
  const tenants = [...new Set((data ?? []).map((x) => String(x.emp_proprietaria_id)))]

  for (const emp of tenants) {
    const janelas = await janelasOnline({ client, emp }, { soComEnvioAutomatico: true })
    const agora = Date.now()
    const naJanela = janelas.filter(
      (j) => j.avisoAutoHoras !== null && (j.aberta || (j.abreEm !== null && j.abreEm - j.avisoAutoHoras * 3600_000 <= agora))
    )
    if (naJanela.length === 0) continue
    const contexto = await contextoDoTenant(emp, client)
    for (const j of naJanela) {
      if (Date.now() > opcoes.limite) {
        r.interrompidas++
        continue
      }
      r.rodadas++
      try {
        r.novasTentativas += await reenfileirarFalhas(client, emp, j.rodadaId)
        for (;;) {
          if (Date.now() > opcoes.limite) {
            r.interrompidas++
            break
          }
          const lote = await enviarLoteAviso(j.rodadaId, 60, { client, tenantId: emp, contexto })
          if (lote.erro || !lote.resultado) {
            r.erros.push(`${j.rodadaNome ?? j.rodadaId}: ${lote.erro ?? "falha no envio"}`)
            break
          }
          r.enviados += lote.resultado.enviados
          if (lote.resultado.restantes === 0 || lote.resultado.processados === 0) break
        }
      } catch (e) {
        r.erros.push(`${j.rodadaNome ?? j.rodadaId}: ${e instanceof Error ? e.message : String(e)}`)
      }
    }
  }
  return r
}
