import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { RotuloTrilha } from "@/components/layout/trilha-rotulos"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { requirePermissao } from "@/lib/auth"
import { ROTULO_FUNCAO_IA } from "@/lib/congressos/ia"
import { obterCongresso } from "@/lib/db/congressos"
import { iaPermitida, listarSugestoes, usoDaIA } from "@/lib/db/congressos-ia"
import { dadosDaRelatoria, ROTULO_ORIGEM_PROPOSTA } from "@/lib/db/congressos-relatoria"

import { Assistente, type PropostaResumo } from "./assistente"

export const metadata: Metadata = { title: "Assistente da relatoria — Confluir" }

/**
 * Assistente da relatoria (Fase 5): a IA procura propostas parecidas para
 * fundir, eixo e abrangência, o que está fora da competência e contradições
 * entre grupos; lê o caderno de teses. Tudo fica pendente até alguém aceitar.
 */
export default async function AssistentePage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermissao("congressos_relatoria", ["congressos_gestao"])
  const { id } = await params
  const c = await obterCongresso(id)
  if (!c) notFound()
  const base = `/painel/representacao/congressos/${id}`
  const bloqueio = iaPermitida(c, false)
  const [d, sugestoes, uso] = await Promise.all([
    dadosDaRelatoria(c),
    listarSugestoes(c, { funcoes: ["mesclagem", "eixo", "abrangencia", "competencia", "correlacao"] }),
    usoDaIA(c),
  ])
  const nomeGrupo = new Map(d.grupos.map((g) => [g.id, g.nome]))
  const nomeEixo = new Map(d.eixos.map((e) => [e.id, e.nome]))
  const propostas: Record<string, PropostaResumo> = Object.fromEntries(
    d.propostas.map((p) => [
      p.id,
      {
        id: p.id,
        numero: p.numero,
        texto: p.texto,
        eixoId: p.eixoId,
        eixo: p.eixoId ? (nomeEixo.get(p.eixoId) ?? null) : null,
        origem: p.grupoId ? (nomeGrupo.get(p.grupoId) ?? "Grupo") : (p.origemDescricao ?? ROTULO_ORIGEM_PROPOSTA[p.origem]),
        abrangencia: p.abrangencia,
      },
    ])
  )
  const abertas = d.propostas.filter((p) => ["em_debate", "entregue", "plenaria"].includes(p.situacao)).length

  return (
    <>
      <RotuloTrilha valores={{ congressos: "Congressos", [id]: c.nome, assistente: "Assistente da IA" }} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Assistente da relatoria</h1>
          <p className="text-muted-foreground mt-1 max-w-2xl text-xs">
            A IA lê as {abertas} proposta(s) em consolidação, identificadas só pelo número, sem nomes, e sugere. Nada muda sem o aceite de
            alguém da relatoria, e cada aceite ou recusa fica registrado.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`${base}/consolidacao`}>Consolidação</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`${base}/plenaria`}>Mesa da plenária</Link>
          </Button>
        </div>
      </div>
      {bloqueio ? (
        <Alert>
          <AlertDescription>{bloqueio}</AlertDescription>
        </Alert>
      ) : (
        <Assistente
          congressoId={id}
          eixos={d.eixos.map((e) => ({ id: e.id, nome: e.nome }))}
          abrangencias={d.regras.abrangencias}
          propostas={propostas}
          pendentes={sugestoes.filter((s) => s.situacao === "pendente")}
          obsoletas={sugestoes.filter((s) => s.situacao === "obsoleta").length}
        />
      )}
      {uso.length > 0 && (
        <section className="grid gap-2">
          <h2 className="text-sm font-semibold">Quanto a IA ajudou neste congresso</h2>
          <div className="overflow-x-auto">
            <table className="w-full max-w-xl text-sm">
              <thead className="text-muted-foreground text-left text-xs">
                <tr>
                  <th className="py-1 font-normal">Função</th>
                  <th className="py-1 text-right font-normal">Sugestões</th>
                  <th className="py-1 text-right font-normal">Aceitas</th>
                  <th className="py-1 text-right font-normal">Recusadas</th>
                  <th className="py-1 text-right font-normal">Pendentes</th>
                </tr>
              </thead>
              <tbody>
                {uso.map((u) => (
                  <tr key={u.funcao} className="border-t">
                    <td className="py-1">{ROTULO_FUNCAO_IA[u.funcao]}</td>
                    <td className="py-1 text-right tabular-nums">{u.total}</td>
                    <td className="py-1 text-right tabular-nums">{u.aceitas}</td>
                    <td className="py-1 text-right tabular-nums">{u.recusadas}</td>
                    <td className="py-1 text-right tabular-nums">{u.pendentes}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  )
}
