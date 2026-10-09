import "server-only"

import { ROTULOS_MODALIDADE } from "@/lib/assembleias-constantes"
import {
  dadosApuracao,
  listarAssembleiasDaRodada,
  obterRodada,
  type ApuracaoAssembleia,
} from "@/lib/db/assembleias"
import { janelaDaAssembleia } from "@/lib/db/assembleias-horarios"
import { lerEmLotes } from "@/lib/db/comum"
import { escopoAptos, filtroAptos } from "@/lib/db/votacao-escopo"
import { acompanhamentoAssembleia } from "@/lib/db/votacao-mesarios"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

export {
  SECOES_DO_TIPO,
  SECOES_RELATORIO,
  TIPOS_RELATORIO,
  type SecaoRelatorio,
  type TipoRelatorio,
} from "@/lib/assembleias-relatorio-secoes"

/**
 * Relatórios da apuração de uma assembleia ONLINE (09/10/2026):
 *
 *   votantes   — a relação de quem votou (participação, nunca o voto);
 *   resultado  — informações da assembleia + comparecimento + resultado;
 *   completo   — o que o usuário marcar no formulário (SECOES_RELATORIO).
 *
 * Só sai depois do término da assembleia, a mesma régua da apuração.
 */

export type Votante = {
  nome: string | null
  cpf: string | null
  matricula: string | null
  canal: string | null
  quando: string | null
}

export type DadosRelatorioApuracao = {
  apuracao: ApuracaoAssembleia
  campanha: string | null
  rodada: string | null
  rodadaPeriodo: { inicio: string | null; termino: string | null }
  fontes: string[]
  assembleia: {
    nome: string | null
    descricao: string | null
    modalidade: string
    inicio: string | null
    termino: string | null
    votoEmSeparado: boolean
    somenteFiliados: boolean
    sala: { link: string; data: string | null; hora: string | null } | null
  }
  votantes: Votante[]
  /** A rodada tem outras assembleias: a lista é filtrada pela janela/urna. */
  rodadaComVarias: boolean
  emSeparado: { total: number; pendente: number; deferido: number; indeferido: number }
  votosPorUrna: { urna: string | null; compareceram: number }[]
}

const CANAL: Record<string, string> = {
  online: "Online",
  urna_digital: "Urna digital",
  urna_fisica: "Urna física",
}

export async function dadosRelatorioApuracao(
  assembleiaId: string
): Promise<DadosRelatorioApuracao | null> {
  const apuracao = await dadosApuracao(assembleiaId)
  if (!apuracao) return null

  const [rodada, assembleias, acomp] = await Promise.all([
    apuracao.rodadaId ? obterRodada(apuracao.rodadaId) : Promise.resolve(null),
    apuracao.rodadaId
      ? listarAssembleiasDaRodada(apuracao.rodadaId)
      : Promise.resolve({ linhas: [], esquemaPronto: true }),
    acompanhamentoAssembleia(assembleiaId),
  ])
  const a = assembleias.linhas.find((x) => x.id === assembleiaId)
  const janela = a ? janelaDaAssembleia(a, rodada?.termino ?? null) : null
  const rodadaComVarias = assembleias.linhas.length > 1

  return {
    apuracao,
    campanha: rodada?.campanhaTema ?? null,
    rodada: rodada?.nome ?? null,
    rodadaPeriodo: { inicio: rodada?.inicio ?? null, termino: rodada?.termino ?? null },
    fontes: rodada?.fontes ?? [],
    assembleia: {
      nome: a?.nome ?? apuracao.nome,
      descricao: a?.descricao ?? null,
      modalidade: ROTULOS_MODALIDADE[apuracao.modalidade],
      inicio: janela?.inicio != null ? new Date(janela.inicio).toISOString() : null,
      termino: janela?.termino != null ? new Date(janela.termino).toISOString() : null,
      votoEmSeparado: a?.voto_em_separado ?? false,
      somenteFiliados: a?.somente_filiados ?? false,
      sala: a?.sala_link ? { link: a.sala_link, data: a.sala_data, hora: a.sala_hora } : null,
    },
    votantes: await votantesDaAssembleia(assembleiaId, {
      rodadaComVarias,
      inicio: janela?.inicio ?? null,
      termino: janela?.termino ?? null,
    }),
    rodadaComVarias,
    emSeparado: acomp?.emSeparadoContagem ?? { total: 0, pendente: 0, deferido: 0, indeferido: 0 },
    votosPorUrna: acomp?.votosPorUrna ?? [],
  }
}

/**
 * Quem votou. O apto da rodada vale em todas as assembleias dela e o registro
 * de participação não diz em qual votou (o voto é secreto e fica noutra
 * tabela). Com uma assembleia só na rodada, todo votante é dela; com várias,
 * entra quem votou pela urna desta assembleia ou, sem urna, dentro da janela
 * dela.
 */
async function votantesDaAssembleia(
  assembleiaId: string,
  filtro: { rodadaComVarias: boolean; inicio: number | null; termino: number | null }
): Promise<Votante[]> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const escopo = filtroAptos(await escopoAptos(assembleiaId))

  const { data: urnas } = await admin
    .from("voto_urnas")
    .select("id, tipo")
    .eq("emp_proprietaria_id", emp)
    .eq("assembleia_id", assembleiaId)
  const tipoUrna = new Map((urnas ?? []).map((u) => [String(u.id), String(u.tipo ?? "")]))

  const consulta = (colunas: string) =>
    lerEmLotes<Record<string, unknown>>((de, ate) =>
      admin
        .from("voto_assembleias_aptos")
        .select(colunas)
        .eq("emp_proprietaria_id", emp)
        .or(escopo)
        .not("hora_voto", "is", null)
        .order("nome_completo", { ascending: true })
        .order("id")
        .range(de, ate)
    )
  let linhas: Record<string, unknown>[]
  try {
    linhas = await consulta("id, nome_completo, cpf, matricula, hora_voto, presenca_urna_id, comprovante_canal")
  } catch {
    // Sem o SQL do comprovante, a coluna do canal não existe.
    linhas = await consulta("id, nome_completo, cpf, matricula, hora_voto, presenca_urna_id")
  }

  const t = (v: unknown) => (typeof v === "string" && v.trim() ? v : null)
  return linhas
    .filter((l) => {
      if (!filtro.rodadaComVarias) return true
      const urna = t(l.presenca_urna_id)
      if (urna) return tipoUrna.has(urna)
      const quando = Date.parse(String(l.hora_voto))
      if (Number.isNaN(quando)) return false
      if (filtro.inicio !== null && quando < filtro.inicio) return false
      if (filtro.termino !== null && quando > filtro.termino) return false
      return true
    })
    .map((l) => {
      const urna = t(l.presenca_urna_id)
      const canal =
        t(l.comprovante_canal) ??
        (urna ? (tipoUrna.get(urna) === "fisica" ? "urna_fisica" : "urna_digital") : "online")
      return {
        nome: t(l.nome_completo),
        cpf: t(l.cpf),
        matricula: t(l.matricula),
        canal: CANAL[canal] ?? canal,
        quando: t(l.hora_voto),
      }
    })
}
