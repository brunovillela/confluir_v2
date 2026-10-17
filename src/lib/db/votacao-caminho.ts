import "server-only"

import { texto } from "@/lib/db/comum"
import { SEM_FONTE } from "@/lib/votacao-navegacao"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * O CAMINHO DE UMA PÁGINA DAS VOTAÇÕES (reorganização de 17/10/2026):
 *
 *   Votações › Fonte pagadora › Campanha › Rodada › Assembleia
 *
 * Uma campanha pode ter várias fontes. A fonte de onde a pessoa veio viaja no
 * endereço (`?fonte=`) por toda a descida; sem ela (link colado, favorito), vale
 * a primeira fonte da campanha em ordem alfabética. Campanha sem fonte fica em
 * "Sem fonte pagadora" (`/fontes/sem-fonte`).
 */

export type Degrau = { id: string; nome: string | null }

export type CaminhoVotacao = {
  fonte: Degrau | null
  /** Todas as fontes da campanha (para trocar de contexto). */
  fontesDaCampanha: Degrau[]
  campanha: Degrau | null
  rodada: Degrau | null
  assembleia: Degrau | null
}

const nomeEmpresa = (e: { nome_fantasia?: string | null; nome_razao?: string | null } | null) =>
  e?.nome_fantasia?.trim() || e?.nome_razao?.trim() || null

export async function caminhoVotacao(alvo: {
  assembleiaId?: string
  rodadaId?: string
  campanhaId?: string
  fonteId?: string | null
}): Promise<CaminhoVotacao> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const caminho: CaminhoVotacao = { fonte: null, fontesDaCampanha: [], campanha: null, rodada: null, assembleia: null }

  let rodadaId = alvo.rodadaId ?? null
  let campanhaId = alvo.campanhaId ?? null
  if (alvo.assembleiaId) {
    const { data } = await admin
      .from("voto_assembleias")
      .select("id, nome_assembleia, rod_assembleia_id, campanha_id")
      .eq("id", alvo.assembleiaId)
      .eq("emp_proprietaria_id", emp)
      .maybeSingle()
    if (data) {
      caminho.assembleia = { id: String(data.id), nome: texto(data.nome_assembleia) }
      rodadaId = texto(data.rod_assembleia_id)
      campanhaId = texto(data.campanha_id)
    }
  }
  if (rodadaId) {
    const { data } = await admin
      .from("voto_rod_assembleias")
      .select("id, nome_assembleia, campanha_id")
      .eq("id", rodadaId)
      .eq("emp_proprietaria_id", emp)
      .maybeSingle()
    if (data) {
      caminho.rodada = { id: String(data.id), nome: texto(data.nome_assembleia) }
      // A campanha da rodada manda; a da assembleia é a reserva.
      campanhaId = texto(data.campanha_id) ?? campanhaId
    }
  }
  if (campanhaId) {
    const [{ data: c }, { data: fontes }] = await Promise.all([
      admin.from("voto_campanha").select("id, tema").eq("id", campanhaId).eq("emp_proprietaria_id", emp).maybeSingle(),
      admin
        .from("voto_campanha_fontes")
        .select("empresa_id, empresa:empresa_id (nome_fantasia, nome_razao)")
        .eq("campanha_id", campanhaId),
    ])
    if (c) caminho.campanha = { id: String(c.id), nome: texto(c.tema) }
    caminho.fontesDaCampanha = (fontes ?? [])
      .map((f) => ({
        id: String(f.empresa_id),
        nome: nomeEmpresa(f.empresa as unknown as { nome_fantasia: string | null; nome_razao: string | null } | null),
      }))
      .sort((a, b) => (a.nome ?? "").localeCompare(b.nome ?? "", "pt-BR"))
  }

  if (alvo.fonteId && alvo.fonteId !== SEM_FONTE) {
    const daCampanha = caminho.fontesDaCampanha.find((f) => f.id === alvo.fonteId)
    if (daCampanha || !caminho.campanha) {
      if (daCampanha) caminho.fonte = daCampanha
      else {
        const { data: e } = await admin
          .from("empresa")
          .select("id, nome_fantasia, nome_razao")
          .eq("id", alvo.fonteId)
          .maybeSingle()
        if (e) caminho.fonte = { id: String(e.id), nome: nomeEmpresa(e) }
      }
    }
  }
  if (!caminho.fonte && caminho.campanha) {
    caminho.fonte = caminho.fontesDaCampanha[0] ?? { id: SEM_FONTE, nome: "Sem fonte pagadora" }
  }
  if (!caminho.fonte && alvo.fonteId === SEM_FONTE) caminho.fonte = { id: SEM_FONTE, nome: "Sem fonte pagadora" }
  return caminho
}
