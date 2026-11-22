import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { RotuloTrilha } from "@/components/layout/trilha-rotulos"
import { Button } from "@/components/ui/button"
import { requirePermissao } from "@/lib/auth"
import { ROTULO_SITUACAO_RESOLUCAO, resolucaoAtrasada, resumoResolucoes } from "@/lib/congressos/encerramento"
import { listarPrograma, obterCongresso } from "@/lib/db/congressos"
import { eventosDasResolucoes, listarResolucoes } from "@/lib/db/congressos-encerramento"
import { listarNegociacoes } from "@/lib/db/negociacoes"
import { formatarDataHora } from "@/lib/formato"
import { podeAcessar } from "@/lib/permissoes"

import { CartaoResolucao, GerarResolucoes, NovaResolucao, type ResolucaoTela } from "../../encerramento-componentes"

export const metadata: Metadata = { title: "Resoluções — Confluir" }

const ACAO: Record<string, string> = { gerada: "Gerada", alterada: "Alterada", situacao: "Situação", nota: "Nota", negociacao: "Negociação", oficio: "Ofício" }

/** Resoluções do congresso e o acompanhamento do cumprimento: quem responde, prazo e situação. */
export default async function ResolucoesPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ filtro?: string }> }) {
  const sessao = await requirePermissao("congressos_relatoria", ["congressos_gestao"])
  const gestor = podeAcessar(sessao.permissoes, "congressos_gestao")
  const { id } = await params
  const { filtro } = await searchParams
  const c = await obterCongresso(id)
  if (!c) notFound()
  const [rs, eventos, programa, negs] = await Promise.all([
    listarResolucoes(c),
    eventosDasResolucoes(c),
    listarPrograma(id),
    gestor ? listarNegociacoes().catch(() => ({ disponivel: false, lista: [] })) : Promise.resolve({ disponivel: false, lista: [] }),
  ])
  const hoje = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" })
  const resumo = resumoResolucoes(rs, hoje)
  const nomeEixo = new Map(programa.eixos.map((e) => [e.id, e.nome]))
  const base = `/painel/representacao/congressos/${id}`
  const visiveis = rs.filter((r) =>
    filtro === "atrasadas" ? resolucaoAtrasada(r, hoje) : filtro === "abertas" ? !["cumprida", "nao_cumprida", "prejudicada"].includes(r.situacao) : filtro === "reservadas" ? r.reservada : true
  )
  const nomeNeg = new Map(negs.lista.map((n) => [n.id, n.titulo]))
  const telas: ResolucaoTela[] = visiveis.map((r) => ({
    id: r.id,
    numero: r.numero,
    titulo: r.titulo,
    texto: r.texto,
    origem: r.propostaNumero ? `Proposta ${r.propostaNumero}` : r.mocaoNumero ? `Moção ${r.mocaoNumero}` : "Registrada à mão",
    eixo: r.eixoId ? (nomeEixo.get(r.eixoId) ?? null) : null,
    reservada: r.reservada,
    destino: r.destino,
    responsavel: r.responsavel,
    prazo: r.prazo,
    situacao: r.situacao,
    atrasada: resolucaoAtrasada(r, hoje),
    negociacao: r.negociacaoId ? (nomeNeg.get(r.negociacaoId) ?? "negociação") : null,
    oficioId: r.oficioId,
    podeOficio: !!r.mocaoId,
    eventos: (eventos.get(r.id) ?? []).map((e) => ({
      quando: formatarDataHora(e.createdAt),
      texto: `${ACAO[e.acao] ?? e.acao}${e.situacao ? `: ${ROTULO_SITUACAO_RESOLUCAO[e.situacao as keyof typeof ROTULO_SITUACAO_RESOLUCAO] ?? e.situacao}` : ""}${e.detalhe ? ` — ${e.detalhe}` : ""}${e.autor ? ` (${e.autor})` : ""}`,
    })),
  }))
  const filtros = [
    { v: "", t: `Todas · ${resumo.total}` },
    { v: "abertas", t: "Em aberto" },
    { v: "atrasadas", t: `Prazo vencido · ${resumo.atrasadas}` },
    { v: "reservadas", t: "Reservadas" },
  ]

  return (
    <>
      <RotuloTrilha valores={{ congressos: "Congressos", [id]: c.nome, resolucoes: "Resoluções" }} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Resoluções</h1>
          <p className="text-muted-foreground mt-1 max-w-2xl text-xs">
            O que a plenária aprovou, com quem responde, o prazo e a situação. {resumo.percentualConcluido}% concluídas
            {resumo.atrasadas ? ` · ${resumo.atrasadas} com prazo vencido` : ""}. As reservadas ficam fora do caderno público.
          </p>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          <GerarResolucoes congressoId={id} />
          <Button asChild variant="outline" size="sm">
            <Link href={`${base}/encerramento/caderno`} target="_blank">
              Caderno (PDF)
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`${base}?aba=encerramento`}>Encerramento</Link>
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {filtros.map((f) => (
          <Button key={f.v} asChild size="sm" variant={(filtro ?? "") === f.v ? "default" : "outline"}>
            <Link href={f.v ? `?filtro=${f.v}` : "?"}>{f.t}</Link>
          </Button>
        ))}
      </div>
      <NovaResolucao congressoId={id} eixos={programa.eixos.map((e) => ({ id: e.id, nome: e.nome }))} />
      {telas.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {rs.length ? "Nenhuma resolução neste filtro." : "Nenhuma resolução ainda. Gere a partir do que a plenária aprovou, ou registre à mão."}
        </p>
      ) : (
        <div className="grid gap-3">
          {telas.map((r) => (
            <CartaoResolucao key={r.id} congressoId={id} r={r} negociacoes={negs.lista.map((n) => ({ id: n.id, titulo: n.titulo }))} gestor={gestor} />
          ))}
        </div>
      )}
    </>
  )
}
