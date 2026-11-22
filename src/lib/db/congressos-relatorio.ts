import "server-only"

import { ROTULO_FUNCAO_IA } from "@/lib/congressos/ia"
import { ROTULO_SITUACAO_RESOLUCAO } from "@/lib/congressos/encerramento"
import { listarPrograma, type Congresso } from "@/lib/db/congressos"
import { dadosDaEleicao, indicadoresDoCongresso, listarResolucoes } from "@/lib/db/congressos-encerramento"
import { usoDaIA } from "@/lib/db/congressos-ia"
import { ROTULO_ORIGEM_PROPOSTA, ROTULO_SITUACAO_PROPOSTA, type OrigemProposta, type SituacaoProposta } from "@/lib/db/congressos-relatoria"
import { formatarData } from "@/lib/formato"
import type { DadosRelatorioPDF } from "@/lib/pdf/relatorio-congresso"

/**
 * Monta o caderno de resoluções (público: sem as reservadas) e o relatório
 * final (interno: tudo, com os números do evento) a partir do que já está
 * registrado — o rascunho sai no mesmo dia do encerramento.
 */

export function periodoDoCongresso(c: Congresso): string | null {
  if (!c.inicio) return null
  const ini = formatarData(c.inicio)
  const fim = c.termino ? formatarData(c.termino) : null
  return fim && fim !== ini ? `de ${ini} a ${fim}` : `em ${ini}`
}

export async function montarRelatorio(c: Congresso, tipo: "caderno" | "relatorio"): Promise<Omit<DadosRelatorioPDF, "entidade" | "geradoEm">> {
  const [todas, programa, eleicao] = await Promise.all([listarResolucoes(c), listarPrograma(c.id), dadosDaEleicao(c)])
  const resolucoes = tipo === "caderno" ? todas.filter((r) => !r.reservada) : todas
  const nomeEixo = new Map(programa.eixos.map((e) => [e.id, e.nome]))
  const ordem = new Map(programa.eixos.map((e, i) => [e.id, i]))
  const grupos = new Map<string, typeof resolucoes>()
  for (const r of resolucoes) {
    const k = r.mocaoId ? "__mocoes" : (r.eixoId ?? "__sem")
    grupos.set(k, [...(grupos.get(k) ?? []), r])
  }
  const eixos = [...grupos.entries()]
    .sort(([a], [b]) => (a === "__mocoes" ? 1000 : (ordem.get(a) ?? 900)) - (b === "__mocoes" ? 1000 : (ordem.get(b) ?? 900)))
    .map(([k, rs]) => ({
      nome: k === "__mocoes" ? "Moções aprovadas" : k === "__sem" ? "Resoluções gerais" : (nomeEixo.get(k) ?? "Eixo"),
      resolucoes: rs.map((r) => ({
        numero: r.numero,
        titulo: r.titulo,
        texto: r.texto,
        reservada: r.reservada,
        origem: r.propostaNumero ? `Proposta ${r.propostaNumero}` : r.mocaoNumero ? `Moção ${r.mocaoNumero}` : "Registrada à mão",
        situacao: ROTULO_SITUACAO_RESOLUCAO[r.situacao],
        responsavel: r.responsavel,
        prazo: r.prazo ? formatarData(r.prazo) : null,
      })),
    }))
  const eleitos = eleicao.chapas.flatMap((ch) =>
    ch.membros.filter((m) => m.eleito).map((m) => ({ chapa: `${ch.numero} · ${ch.nome}`, nome: m.nome, base: m.base, condicao: m.condicao === "titular" ? "Titular" : "Suplente" }))
  )
  const base = {
    tipo,
    congresso: `${c.edicao ? `${c.edicao}º ` : ""}${c.nome}`,
    periodo: periodoDoCongresso(c),
    local: c.local,
    eixos,
    eleitos,
    reservadasOmitidas: todas.length - resolucoes.length,
  }
  if (tipo === "caderno") return { ...base, resumo: [`${resolucoes.length} resolução(ões)`], tabelas: [] }

  const [ind, uso] = await Promise.all([indicadoresDoCongresso(c), usoDaIA(c)])
  const n = (x: Record<string, number>, k: string) => x[k] ?? 0
  const resumo = [
    `${ind.inscritos} inscrito(s), ${ind.credenciados} credenciado(s)`,
    `${ind.propostas.total} proposta(s): ${n(ind.propostas.porSituacao, "aprovada")} aprovada(s), ${n(ind.propostas.porSituacao, "rejeitada")} rejeitada(s), ${n(ind.propostas.porSituacao, "fundida")} fundida(s) em outras`,
    `${ind.mocoes.total} moção(ões) apresentada(s), ${ind.mocoes.aprovadas} aprovada(s), ${ind.mocoes.assinaturas} assinatura(s) válidas`,
    `${ind.resolucoes.total} resolução(ões), ${ind.resolucoes.reservadas} reservada(s)`,
    ...(eleicao.chapas.length ? [`${eleicao.chapas.length} chapa(s) inscrita(s); ${eleitos.length} eleito(s) para a etapa seguinte`] : []),
  ]
  const tabelas = [
    { titulo: "Participação por papel", colunas: ["Papel", "Inscritos", "Credenciados"], linhas: ind.porCategoria.map((x) => [x.categoria, x.inscritos, x.credenciados]) },
    { titulo: "Participação por base", colunas: ["Base", "Inscritos", "Credenciados"], linhas: ind.porBase.map((x) => [x.base, x.inscritos, x.credenciados]) },
    { titulo: "Credenciados por gênero", colunas: ["Gênero", "Credenciados"], linhas: ind.porGenero.map((x) => [x.genero, x.credenciados]) },
    ...(ind.sessoes.length ? [{ titulo: "Presença por sessão", colunas: ["Sessão", "Presentes"], linhas: ind.sessoes.map((x) => [x.titulo, x.presentes]) }] : []),
    {
      titulo: "Propostas por origem",
      colunas: ["Origem", "Propostas"],
      linhas: Object.entries(ind.propostas.porOrigem).map(([k, v]) => [ROTULO_ORIGEM_PROPOSTA[k as OrigemProposta] ?? k, v]),
    },
    {
      titulo: "Propostas por situação",
      colunas: ["Situação", "Propostas"],
      linhas: Object.entries(ind.propostas.porSituacao).map(([k, v]) => [ROTULO_SITUACAO_PROPOSTA[k as SituacaoProposta] ?? k, v]),
    },
    ...(eleicao.chapas.length
      ? [
          {
            titulo: "Eleição da delegação",
            colunas: ["Chapa", "Votos", "Vagas"],
            linhas: eleicao.chapas.map((ch) => [`${ch.numero} · ${ch.nome}${ch.situacao === "impugnada" || ch.situacao === "retirada" ? ` (${ch.situacao})` : ""}`, ch.votos ?? "—", ch.vagasTitulares ?? "—"]),
          },
        ]
      : []),
    ...(uso.length
      ? [{ titulo: "Sugestões da IA", colunas: ["Função", "Sugestões", "Aceitas"], linhas: uso.map((u) => [ROTULO_FUNCAO_IA[u.funcao], u.total, u.aceitas]) }]
      : []),
  ].filter((t) => t.linhas.length)
  return { ...base, resumo, tabelas }
}
