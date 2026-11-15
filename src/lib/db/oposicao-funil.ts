import "server-only"

import { lerEmLotes, texto } from "@/lib/db/comum"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Funil da campanha (onda 3 das melhorias, 07/11/2026): onde as pessoas
 * param, enquanto ainda dá tempo de agir. As duas primeiras etapas vêm da
 * trilha (`ciencia_registrada` e `dados_conferidos`, com a marca anônima da
 * pessoa — contadas uma vez cada, e só desde que passaram a ser gravadas); o
 * resto, das oposições.
 */

export type ContagemFonte = {
  fonte: string
  registradas: number
  aguardandoCarta: number
  emAnalise: number
  aprovadas: number
  reprovadas: number
}

/** Por origem do link (15/11/2026): quem leu e quem registrou, por canal. */
export type ContagemOrigem = { origem: string | null; leram: number; registraram: number }

export type FunilCampanha = {
  leram: { total: number; filiados: number; naoFiliados: number }
  conferiramDados: number
  desistentes: number
  registradas: { total: number; filiados: number; naoFiliados: number }
  aguardandoCarta: number
  /** Dessas, as que receberam "Pedir nova carta". */
  cartaDevolvida: number
  /** Em análise com carta cuja assinatura não está válida. */
  cartaAConferir: number
  emAnalise: number
  aprovadas: number
  reprovadas: number
  porFonte: ContagemFonte[]
  porOrigem: ContagemOrigem[]
}

export async function funilDaCampanha(campanhaId: string): Promise<FunilCampanha> {
  const empId = await tenantAtual()
  const admin = await createAdminClient()
  const [eventos, ops] = await Promise.all([
    lerEmLotes((de, ate) =>
      admin
        .from("oposicao_eventos")
        .select("id, evento, detalhe, opositor_id")
        .eq("emp_proprietaria_id", empId)
        .eq("campanha_id", campanhaId)
        .in("evento", ["ciencia_registrada", "dados_conferidos", "origem_registrada"])
        .order("id")
        .range(de, ate)
    ),
    lerEmLotes((de, ate) =>
      admin
        .from("oposicao_opositor")
        .select("id, situacao, filiacao_id, empregador_id, documento_assinado_url, carta, reprovacao_motivo, assinatura_validacao")
        .eq("emp_proprietaria_id", empId)
        .eq("campanha_id", campanhaId)
        .order("id")
        .range(de, ate)
    ),
  ])

  const leram = new Map<string, string>()
  const conferiram = new Set<string>()
  // Origem do link (15/11/2026): a da última leitura de cada pessoa e a de
  // cada registro. Só existe desde essa data.
  const origemLeitura = new Map<string, string>()
  const origemRegistro = new Map<string, string>()
  for (const e of eventos) {
    const d = texto(e.detalhe) ?? ""
    const origem = /origem:(\S+)/.exec(d)?.[1]
    if (e.evento === "origem_registrada") {
      if (e.opositor_id && origem) origemRegistro.set(String(e.opositor_id), origem)
      continue
    }
    const pessoa = /pessoa:(\S+)/.exec(d)?.[1]
    if (!pessoa) continue
    if (origem && e.evento === "ciencia_registrada") origemLeitura.set(pessoa, origem)
    if (e.evento === "ciencia_registrada") leram.set(pessoa, /perfil:(\S+)/.exec(d)?.[1] ?? "")
    else conferiram.add(pessoa)
  }

  const f: FunilCampanha = {
    leram: {
      total: leram.size,
      filiados: [...leram.values()].filter((p) => p === "filiado").length,
      naoFiliados: [...leram.values()].filter((p) => p !== "filiado").length,
    },
    conferiramDados: conferiram.size,
    desistentes: 0,
    registradas: { total: 0, filiados: 0, naoFiliados: 0 },
    aguardandoCarta: 0,
    cartaDevolvida: 0,
    cartaAConferir: 0,
    emAnalise: 0,
    aprovadas: 0,
    reprovadas: 0,
    porFonte: [],
    porOrigem: [],
  }
  const origens = new Map<string, ContagemOrigem>()
  const conta = (o: string) => {
    const chave = o === "nenhuma" ? "" : o
    if (!origens.has(chave)) origens.set(chave, { origem: chave || null, leram: 0, registraram: 0 })
    return origens.get(chave)!
  }
  for (const o of origemLeitura.values()) conta(o).leram++
  for (const o of origemRegistro.values()) conta(o).registraram++
  f.porOrigem = [...origens.values()].sort((a, b) => b.registraram - a.registraram || b.leram - a.leram)
  const fontes = new Map<string, ContagemFonte>()
  for (const o of ops) {
    const situacao = String(o.situacao ?? "")
    if (situacao === "desistente") {
      f.desistentes++
      continue
    }
    f.registradas.total++
    if (o.filiacao_id) f.registradas.filiados++
    else f.registradas.naoFiliados++
    const chave = texto(o.empregador_id) ?? "sem"
    if (!fontes.has(chave)) {
      fontes.set(chave, { fonte: chave, registradas: 0, aguardandoCarta: 0, emAnalise: 0, aprovadas: 0, reprovadas: 0 })
    }
    const c = fontes.get(chave)!
    c.registradas++
    if (situacao === "aguardando_documento") {
      f.aguardandoCarta++
      c.aguardandoCarta++
      if (texto(o.reprovacao_motivo)) f.cartaDevolvida++
    } else if (situacao === "nao_avaliada") {
      f.emAnalise++
      c.emAnalise++
      const validacao = o.assinatura_validacao as { situacao?: string } | null
      if ((texto(o.documento_assinado_url) || texto(o.carta)) && validacao?.situacao !== "valida") f.cartaAConferir++
    } else if (situacao === "aprovada") {
      f.aprovadas++
      c.aprovadas++
    } else if (situacao === "reprovada") {
      f.reprovadas++
      c.reprovadas++
    }
  }

  // Nomes das fontes.
  const ids = [...fontes.keys()].filter((k) => k !== "sem")
  const nomes = new Map<string, string>()
  if (ids.length) {
    const { data } = await admin.from("empresa").select("id, nome_fantasia, nome_razao").in("id", ids)
    for (const e of data ?? []) nomes.set(String(e.id), texto(e.nome_fantasia) ?? texto(e.nome_razao) ?? "(sem nome)")
  }
  f.porFonte = [...fontes.values()]
    .map((c) => ({ ...c, fonte: c.fonte === "sem" ? "Sem empresa informada" : (nomes.get(c.fonte) ?? "(empresa removida)") }))
    .sort((a, b) => b.registradas - a.registradas)
  return f
}
