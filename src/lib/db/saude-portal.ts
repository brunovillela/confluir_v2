import "server-only"

import { esquemaAusente, hojeSP, nomesDosUsuarios } from "@/lib/db/comum"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Saúde no portal do associado — o que a pessoa vê sobre si além do
 * histórico de atendimentos (`meusAtendimentos`, lib/db/atendimentos.ts):
 * os próximos agendamentos e as CATs ligadas a ela.
 *
 * As mesmas regras daquele histórico: recebe os ids de filiação já
 * resolvidos pelo chamador (a sessão identifica o filiado pelo CPF), lê só
 * colunas administrativas — nada de relatório, CID, parte do corpo,
 * diagnóstico ou afastamento — e a página não chama nada daqui na
 * visualização pela gestão (lib/visualizacao-filiado.ts). Módulo à parte
 * para nenhuma função do painel ganhar um parâmetro "do portal": um
 * `select` a mais numa função compartilhada bastaria para vazar.
 */

// ---------------------------------------------------------------------------
// Próximos agendamentos (A42)
// ---------------------------------------------------------------------------

export type MeuAgendamento = {
  id: string
  /** AAAA-MM-DD: a agenda guarda só o dia, sem hora (colunas DATE). */
  inicio: string
  termino: string | null
  online: boolean
  /** Tipo de atendimento do profissional; sem ele, a profissão. */
  servico: string | null
  profissional: string | null
}

/**
 * Agendamentos de hoje em diante dos assistidos ligados aos registros de
 * filiação da pessoa, do mais próximo ao mais distante. `disponivel=false`
 * quando a agenda não existe no banco — a página segue sem o card.
 */
export async function meusAgendamentos(
  filiadoIds: string[]
): Promise<{ linhas: MeuAgendamento[]; disponivel: boolean }> {
  if (filiadoIds.length === 0) return { linhas: [], disponivel: true }

  const admin = await createAdminClient()
  const emp = await tenantAtual()

  const { data: assistidos, error: erroAssistidos } = await admin
    .from("saude_assistidos")
    .select("id")
    .eq("emp_proprietaria_id", emp)
    .in("filiado_id", filiadoIds)
  if (erroAssistidos) {
    if (esquemaAusente(erroAssistidos)) return { linhas: [], disponivel: false }
    throw erroAssistidos
  }
  const ids = ((assistidos ?? []) as { id: string }[]).map((a) => a.id)
  if (ids.length === 0) return { linhas: [], disponivel: true }

  // Também o que começou antes e ainda não terminou (agendamento de mais de
  // um dia, com término).
  const hoje = hojeSP()
  const { data, error } = await admin
    .from("saude_agenda_atendimentos")
    .select("id,inicio,termino,online,profissional_id")
    .eq("emp_proprietaria_id", emp)
    .in("assistido_id", ids)
    .or(`inicio.gte.${hoje},termino.gte.${hoje}`)
    .order("inicio", { ascending: true })
    .limit(20)
  if (error) {
    if (esquemaAusente(error)) return { linhas: [], disponivel: false }
    throw error
  }

  const brutos = ((data ?? []) as {
    id: string
    inicio: string | null
    termino: string | null
    online: boolean | null
    profissional_id: string | null
  }[]).filter((a): a is typeof a & { inicio: string } => Boolean(a.inicio))
  if (brutos.length === 0) return { linhas: [], disponivel: true }

  const profissionais = await profissionaisDoPortal(
    brutos.map((a) => a.profissional_id)
  )

  return {
    linhas: brutos.map((a) => {
      const p = a.profissional_id ? profissionais.get(a.profissional_id) : undefined
      return {
        id: a.id,
        inicio: a.inicio,
        termino: a.termino && a.termino !== a.inicio ? a.termino : null,
        online: a.online === true,
        servico: p?.servico ?? null,
        profissional: p?.nome ?? null,
      }
    }),
    disponivel: true,
  }
}

/**
 * Nome e serviço só dos profissionais da lista. Não reaproveita o
 * `mapaProfissionais` de atendimentos.ts: aquele lê todos os profissionais
 * da entidade a cada chamada, e aqui são um ou dois.
 */
async function profissionaisDoPortal(
  ids: (string | null)[]
): Promise<Map<string, { nome: string | null; servico: string | null }>> {
  const mapa = new Map<string, { nome: string | null; servico: string | null }>()
  const unicos = [...new Set(ids.filter((v): v is string => Boolean(v)))]
  if (unicos.length === 0) return mapa

  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data } = await admin
    .from("saude_profissionais")
    .select("id,usuario_id,profissao,tipo_id")
    .eq("emp_proprietaria_id", emp)
    .in("id", unicos)
  const brutos = (data ?? []) as {
    id: string
    usuario_id: string | null
    profissao: string | null
    tipo_id: string | null
  }[]

  const tipoIds = [...new Set(brutos.map((p) => p.tipo_id).filter((v): v is string => Boolean(v)))]
  const [nomes, tipos] = await Promise.all([
    nomesDosUsuarios(brutos.map((p) => p.usuario_id).filter((v): v is string => Boolean(v))),
    tipoIds.length === 0
      ? Promise.resolve(new Map<string, string>())
      : admin
          .from("saude_atendimentos_tipos")
          .select("id,nome")
          .eq("emp_proprietaria_id", emp)
          .in("id", tipoIds)
          .then(({ data: ts }) => {
            const m = new Map<string, string>()
            for (const t of (ts ?? []) as { id: string; nome: string | null }[]) {
              if (t.nome?.trim()) m.set(t.id, t.nome.trim())
            }
            return m
          }),
  ])

  for (const p of brutos) {
    mapa.set(p.id, {
      nome: (p.usuario_id ? nomes.get(p.usuario_id) : null) ?? null,
      servico: (p.tipo_id ? tipos.get(p.tipo_id) : null) ?? (p.profissao?.trim() || null),
    })
  }
  return mapa
}

// ---------------------------------------------------------------------------
// CATs ligadas ao associado (A77)
// ---------------------------------------------------------------------------

export type MinhaCat = {
  id: string
  numero: string | null
  /** AAAA-MM-DD. */
  dataAcidente: string | null
  empresa: string | null
}

/**
 * CATs que o serviço de saúde LIGOU a um dos registros de filiação da
 * pessoa (`saude_cat.filiado_id`, gravado em vincularFiliadoCat com
 * confirmação humana). Não casa por CPF nem por nome: a base migrada quase
 * não tem CPF, e um homônimo ou um dígito trocado mostraria o acidente de
 * outra pessoa — ver a nota no topo de lib/db/saude.ts.
 *
 * Só número, data e empresa. Tipo de acidente, afastamento, CID, parte
 * atingida e diagnóstico ficam de fora: o associado sabe o que lhe
 * aconteceu, e a tela pode estar aberta na frente de outra pessoa. Cópias
 * descartadas (`duplicada_de_id`) não aparecem, como no painel.
 */
export async function minhasCats(filiadoIds: string[]): Promise<MinhaCat[]> {
  if (filiadoIds.length === 0) return []

  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("saude_cat")
    .select("id,numero_cat,data_acidente,empregador_razao_social")
    .eq("emp_proprietaria_id", await tenantAtual())
    .in("filiado_id", filiadoIds)
    .is("duplicada_de_id", null)
    .order("data_acidente", { ascending: false, nullsFirst: false })
    .limit(50)
  if (error) {
    if (esquemaAusente(error)) return []
    throw error
  }

  return ((data ?? []) as {
    id: string
    numero_cat: string | null
    data_acidente: string | null
    empregador_razao_social: string | null
  }[]).map((c) => ({
    id: c.id,
    numero: c.numero_cat?.trim() || null,
    dataAcidente: c.data_acidente,
    empresa: c.empregador_razao_social?.trim() || null,
  }))
}
