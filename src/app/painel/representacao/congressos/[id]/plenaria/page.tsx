import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { RotuloTrilha } from "@/components/layout/trilha-rotulos"
import { Button } from "@/components/ui/button"
import { requirePermissao } from "@/lib/auth"
import { valor } from "@/lib/congressos/config"
import { ROTULO_MAIORIA } from "@/lib/congressos/relatoria"
import { obterCongresso } from "@/lib/db/congressos"
import { dadosDaPlenaria } from "@/lib/db/congressos-relatoria"

import { Plenaria } from "./plenaria"

export const metadata: Metadata = { title: "Mesa da plenária — Confluir" }

export default async function PlenariaPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ sessao?: string }> }) {
  await requirePermissao("congressos_relatoria", ["congressos_gestao"])
  const { id } = await params
  const sp = await searchParams
  const c = await obterCongresso(id)
  if (!c) notFound()
  const d = await dadosDaPlenaria(c, sp.sessao ?? null)
  const base = `/painel/representacao/congressos/${id}`
  const nomeEixo = new Map(d.eixos.map((e) => [e.id, e.nome]))
  const numero = new Map(d.propostas.map((p) => [p.id, p.numero]))
  const numeroMocao = new Map(d.mocoes.map((m) => [m.id, m.numero]))

  return (
    <>
      <RotuloTrilha valores={{ congressos: "Congressos", [id]: c.nome, plenaria: "Plenária" }} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Mesa da plenária</h1>
          <p className="text-muted-foreground mt-1 text-xs">
            {d.sessao ? `${d.sessao.titulo} · ` : ""}
            {d.presentesVotantes} presente(s) com voto agora, de {d.emExercicio} em exercício · aprova por {ROTULO_MAIORIA[d.regras.maioria]}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`${base}/consolidacao`}>Consolidação</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`${base}?aba=dia`}>Quórum</Link>
          </Button>
        </div>
      </div>
      <Plenaria
        congressoId={id}
        sessaoId={d.sessao?.id ?? null}
        regras={{
          maioria: d.regras.maioria,
          semOposicao: d.regras.semOposicao,
          emBloco: d.regras.emBloco,
          destaqueNome: d.regras.destaqueNome,
          formaVoto: d.regras.formaVoto,
          novasPlenaria: valor<string>(c.config, "propostas.novas_plenaria") ?? "acordo_texto",
        }}
        eixos={d.eixos.map((e) => ({ id: e.id, nome: e.nome }))}
        propostas={d.propostas.map((p) => ({
          id: p.id,
          numero: p.numero,
          eixo: p.eixoId ? (nomeEixo.get(p.eixoId) ?? null) : null,
          texto: p.texto,
          situacao: p.situacao,
          classificacao: p.classificacao,
          destaquePor: p.destaquePor,
        }))}
        mocoes={d.mocoes.map((m) => ({ id: m.id, numero: m.numero, titulo: m.titulo, texto: m.texto, tipo: m.tipo, situacao: m.situacao }))}
        votacoes={d.votacoes
          .filter((v) => v.propostaIds.some((pid) => numero.has(pid)) || v.mocaoIds.some((mid) => numeroMocao.has(mid)))
          .map((v) => ({
            id: v.id,
            numeros: v.propostaIds.map((pid) => numero.get(pid)).filter((n): n is number => n !== undefined).sort((a, b) => a - b),
            mocoes: v.mocaoIds.map((mid) => numeroMocao.get(mid)).filter((n): n is number => n !== undefined),
            forma: v.forma,
            placar: v.aFavor !== null ? `${v.aFavor} × ${v.contra ?? 0} × ${v.abstencao ?? 0}` : null,
            resultado: v.resultado,
            createdAt: v.createdAt,
          }))
          .reverse()}
      />
    </>
  )
}
