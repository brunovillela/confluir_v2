import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Sparkles } from "lucide-react"

import { RotuloTrilha } from "@/components/layout/trilha-rotulos"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { requirePermissao } from "@/lib/auth"
import { ROTULO_APRECIACAO } from "@/lib/congressos/relatoria"
import { obterCongresso } from "@/lib/db/congressos"
import { iaPermitida, listarSugestoes } from "@/lib/db/congressos-ia"
import { dadosDaRelatoria, ROTULO_APONTAMENTO, ROTULO_ORIGEM_PROPOSTA } from "@/lib/db/congressos-relatoria"

import { AplicarGrupos } from "../../relatoria-componentes"
import { Consolidacao, type ItemConsolidacao } from "./consolidacao"

export const metadata: Metadata = { title: "Consolidação — Confluir" }

export default async function ConsolidacaoPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermissao("congressos_relatoria", ["congressos_gestao"])
  const { id } = await params
  const c = await obterCongresso(id)
  if (!c) notFound()
  const iaLigada = !iaPermitida(c, false)
  const [d, sugestoes] = await Promise.all([dadosDaRelatoria(c), iaLigada ? listarSugestoes(c, { pendentes: true }) : Promise.resolve([])])
  const redacao = new Map(sugestoes.filter((s) => s.funcao === "refino").map((s) => [s.propostaIds[0], s]))
  const pendentesAssistente = sugestoes.filter((s) => ["mesclagem", "eixo", "abrangencia", "competencia", "correlacao"].includes(s.funcao)).length
  const base = `/painel/representacao/congressos/${id}`
  const nomeGrupo = new Map(d.grupos.map((g) => [g.id, g.nome]))
  const entregues = d.grupos.filter((g) => g.relatorioEntregueEm).length

  const itens: ItemConsolidacao[] = d.propostas.map((p) => ({
    id: p.id,
    numero: p.numero,
    eixoId: p.eixoId,
    grupo: p.grupoId ? (nomeGrupo.get(p.grupoId) ?? null) : null,
    origem: p.origemDescricao ?? ROTULO_ORIGEM_PROPOSTA[p.origem],
    ehFusao: p.origem === "fusao",
    abrangencia: p.abrangencia,
    texto: p.texto,
    versao: p.versao,
    situacao: p.situacao,
    classificacao: p.classificacao,
    apontamentos: d.apontamentos
      .filter((a) => a.propostaId === p.id && !a.retiradoEm)
      .map((a) => ({ id: a.id, tipo: ROTULO_APONTAMENTO[a.tipo], texto: a.texto, grupo: a.grupoId ? (nomeGrupo.get(a.grupoId) ?? "") : "" })),
    apreciacoes: d.apreciacoes
      .filter((a) => a.propostaId === p.id)
      .map((a) => ({ grupo: nomeGrupo.get(a.grupoId) ?? "Grupo", placar: `${a.aFavor} × ${a.contra} × ${a.abstencao}`, resultado: ROTULO_APRECIACAO[a.resultado] })),
    redacaoIA: redacao.get(p.id) ?? null,
  }))

  return (
    <>
      <RotuloTrilha valores={{ congressos: "Congressos", [id]: c.nome, consolidacao: "Consolidação" }} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Consolidação das propostas</h1>
          <p className="text-muted-foreground mt-1 text-xs">
            {entregues} de {d.grupos.length} grupo(s) entregaram o relatório · {d.propostas.length} proposta(s). Fundir, mover de eixo e
            mudar o texto guardam o histórico: nada se perde.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {d.regras.haVotacao && <AplicarGrupos congressoId={id} />}
          {iaLigada && (
            <Button asChild size="sm">
              <Link href={`${base}/assistente`}>
                <Sparkles />
                Assistente da IA{pendentesAssistente ? ` · ${pendentesAssistente}` : ""}
              </Link>
            </Button>
          )}
          <Button asChild variant="outline" size="sm">
            <Link href={`${base}/plenaria`}>Mesa da plenária</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`${base}?aba=relatoria`}>Grupos</Link>
          </Button>
        </div>
      </div>
      {d.alertasCota.length > 0 && (
        <Alert>
          <AlertDescription>
            <div className="font-medium">Acima da cota de saída do regimento</div>
            <ul className="mt-1 list-disc pl-5">
              {d.alertasCota.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}
      <Consolidacao
        congressoId={id}
        itens={itens}
        eixos={d.eixos.map((e) => ({ id: e.id, nome: e.nome }))}
        grupos={d.grupos.map((g) => g.nome)}
        abrangencias={d.regras.abrangencias}
        consensoDebate={d.regras.consensoDebate}
        iaLigada={iaLigada}
      />
    </>
  )
}
