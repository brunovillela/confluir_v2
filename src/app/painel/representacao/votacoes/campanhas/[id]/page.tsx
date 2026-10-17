import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowRight, CalendarRange, CircleAlert } from "lucide-react"

import { VoltarLista } from "@/components/voltar-lista"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { obterCampanha } from "@/lib/db/assembleias"
import { listarFontesPagadoras } from "@/lib/db/fontes"
import { caminhoVotacao } from "@/lib/db/votacao-caminho"
import {
  panoramaDaCampanha,
  participacao,
  resumoResultado,
  type RodadaPanorama,
} from "@/lib/db/votacao-panorama"
import { semLinkDasRodadas } from "@/lib/db/votacao-sem-link"
import { formatarData, formatarDataHora } from "@/lib/formato"
import { hrefAssembleia, hrefCampanha, hrefFonte, hrefRodada, RAIZ_VOTACOES } from "@/lib/votacao-navegacao"

import { ContagemRegressiva } from "../../contagem-regressiva"
import { SituacaoRodadaBadge, VoltarNivel } from "../../navegacao"
import { SeloSemLink } from "../../selo-sem-link"
import { TrilhaVotacoes } from "../../trilha"
import { CampanhaForm, type FonteOpcao } from "../campanha-form"
import { NovaRodadaForm } from "./nova-rodada-form"

export const metadata: Metadata = { title: "Campanha — Confluir" }

/**
 * A CAMPANHA (reorganização de 17/10/2026): a linha do tempo das rodadas — com
 * situação, participação e resultado de cada uma —, os indicadores, a próxima
 * ação e os dados da campanha. As fontes da campanha trocam o contexto
 * (`?fonte=`) por onde a trilha e o "voltar" sobem.
 */
export default async function CampanhaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ criada?: string; fonte?: string }>
}) {
  await requirePermissao("assembleias")
  const { id } = await params
  const { criada, fonte: fontePedida } = await searchParams

  const [campanha, fontes, caminho] = await Promise.all([
    obterCampanha(id),
    listarFontesPagadoras(),
    caminhoVotacao({ campanhaId: id, fonteId: fontePedida }),
  ])
  if (!campanha) notFound()
  const fonte = caminho.fonte?.id ?? null

  const [rodadas, semLink] = await Promise.all([panoramaDaCampanha(id), semLinkDasRodadas({ campanhaIds: [id] })])
  const opcoes: FonteOpcao[] = fontes.map((f) => ({
    id: f.id,
    nome: f.nome_fantasia?.trim() || f.nome_razao?.trim() || "(sem nome)",
    inativa: f.inativa === true,
  }))

  const ultima = [...rodadas].reverse().find((r) => r.situacao !== "sem_assembleia" && r.situacao !== "agendada") ?? rodadas.at(-1) ?? null
  const ultimaApurada = [...rodadas].reverse().find((r) => r.resultado) ?? null
  const acoes = proximasAcoes(rodadas, semLink, fonte)

  return (
    <>
      <TrilhaVotacoes caminho={caminho} />
      <div className="grid gap-3">
        {caminho.fonte ? (
          <VoltarLista
            chave={`votacoes-fonte-${caminho.fonte.id}`}
            base={hrefFonte(caminho.fonte.id)}
            rotulo={caminho.fonte.nome ?? "Fonte pagadora"}
            className="-ml-2 mb-1 justify-self-start"
          />
        ) : (
          <VoltarNivel href={RAIZ_VOTACOES} rotulo="Votações" />
        )}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{campanha.tema ?? "(sem tema)"}</h1>
            <Badge variant={campanha.finalizado ? "secondary" : "info"}>{campanha.finalizado ? "Finalizada" : "Aberta"}</Badge>
          </div>
          <p className="text-muted-foreground mt-1 text-xs">Campanha registrada em {formatarData(campanha.created_at)}</p>
        </div>
        {caminho.fontesDaCampanha.length > 1 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-muted-foreground text-xs">Fontes da campanha:</span>
            {caminho.fontesDaCampanha.map((f) => (
              <Button key={f.id} size="sm" className="h-7" variant={f.id === fonte ? "default" : "outline"} asChild>
                <Link href={hrefCampanha(id, f.id)} title="Ver a campanha a partir desta fonte">
                  {f.nome ?? "Fonte"}
                </Link>
              </Button>
            ))}
          </div>
        )}
      </div>

      {criada === "1" && (
        <Alert variant="success">
          <AlertDescription>Campanha criada. Agora cadastre as rodadas de assembleias.</AlertDescription>
        </Alert>
      )}

      <Card className="py-0">
        <CardContent className="flex flex-wrap gap-x-10 gap-y-3 py-4">
          <Indicador rotulo="Rodadas">
            <Numero valor={rodadas.length} />
          </Indicador>
          <Indicador rotulo={ultima ? `Aptos · ${ultima.nome ?? "última rodada"}` : "Aptos"}>
            <Numero valor={ultima?.aptos ?? 0} />
          </Indicador>
          <Indicador rotulo="Votaram">
            <span className="flex items-baseline gap-1.5">
              <Numero valor={ultima?.votaram ?? 0} />
              {ultima && participacao(ultima) !== null && (
                <span className="text-muted-foreground text-xs">{participacao(ultima)}%</span>
              )}
            </span>
          </Indicador>
          <Indicador rotulo={ultimaApurada ? `Resultado · ${ultimaApurada.nome ?? "rodada"}` : "Resultado"}>
            <span className="text-sm font-medium">{ultimaApurada ? resumoResultado(ultimaApurada) ?? "—" : "Sem apuração encerrada"}</span>
          </Indicador>
        </CardContent>
      </Card>

      {acoes.length > 0 && (
        <Alert variant="warning">
          <CircleAlert />
          <AlertDescription>
            <ul className="grid gap-1">
              {acoes.map((a, i) => (
                <li key={i}>
                  {a.texto}{" "}
                  <Link href={a.href} className="font-medium underline underline-offset-4">
                    {a.rotulo}
                  </Link>
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="grid gap-1">
                <CardTitle className="text-base">Linha do tempo das rodadas</CardTitle>
                <CardDescription>Cada rodada com a situação, a participação e o resultado apurado.</CardDescription>
              </div>
              <NovaRodadaForm campanhaId={campanha.id} />
            </div>
          </CardHeader>
          <CardContent>
            {rodadas.length === 0 ? (
              <p className="text-muted-foreground py-8 text-center text-sm">
                <CalendarRange className="mx-auto mb-2 size-5" />
                Nenhuma rodada cadastrada nesta campanha ainda.
              </p>
            ) : (
              <ol className="relative grid gap-3 border-l pl-5">
                {rodadas.map((r) => (
                  <li key={r.id} className="relative">
                    <span className="bg-background border-primary absolute top-4 -left-[27px] size-3 rounded-full border-2" />
                    <ItemRodada r={r} fonte={fonte} semLink={semLink.filter((s) => s.rodadaId === r.id)} />
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>

        <CampanhaForm campanha={campanha} fontes={opcoes} />
      </div>
    </>
  )
}

function ItemRodada({
  r,
  fonte,
  semLink,
}: {
  r: RodadaPanorama
  fonte: string | null
  semLink: Awaited<ReturnType<typeof semLinkDasRodadas>>
}) {
  const p = participacao(r)
  const fim = r.fimEm !== null ? new Date(r.fimEm).toISOString() : null
  const abre = r.abreEm !== null ? new Date(r.abreEm).toISOString() : null
  return (
    <div className="grid gap-2 rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={hrefRodada(r.id, fonte)} className="text-primary font-medium hover:underline">
            {r.nome ?? "(sem nome)"}
          </Link>
          <SituacaoRodadaBadge situacao={r.situacao} />
          <SeloSemLink itens={semLink} href={`${hrefRodada(r.id, fonte, "aptos")}&link=sem_link`} />
        </div>
        <span className="text-muted-foreground text-xs">
          {r.inicio || r.termino ? `${formatarData(r.inicio)} a ${formatarData(r.termino)}` : "Sem período"}
        </span>
      </div>

      {(r.situacao === "em_votacao" || r.situacao === "agendada") && (abre || fim) && (
        <ContagemRegressiva inicio={abre} fim={fim} compacta />
      )}

      <div className="grid gap-1">
        <div className="text-muted-foreground flex justify-between text-xs">
          <span>
            {p === null && r.aptos > 0 && r.votaram === 0 && (r.situacao === "apurada" || r.situacao === "a_apurar")
              ? `${r.aptos.toLocaleString("pt-BR")} aptos · participação não registrada (legado)`
              : `${r.votaram.toLocaleString("pt-BR")} de ${r.aptos.toLocaleString("pt-BR")} aptos votaram`}
          </span>
          <span>{p !== null ? `${p}%` : "—"}</span>
        </div>
        <div className="bg-muted h-1.5 overflow-hidden rounded-full">
          <div className="bg-primary h-full rounded-full" style={{ width: `${p ?? 0}%` }} />
        </div>
      </div>

      {r.resultado && r.resultado.length > 0 && (
        <div className="grid gap-1 text-xs">
          {r.resultado.map((q, i) => (
            <p key={i}>
              <span className="text-muted-foreground">{q.pergunta ?? `Pergunta ${i + 1}`}: </span>
              {q.opcoes
                .map((o) => `${o.texto ?? "Opção"} ${q.total > 0 ? Math.round((o.votos / q.total) * 100) : 0}%`)
                .join(" · ")}
            </p>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        {r.assembleias.map((a) => (
          <Button key={a.id} variant="ghost" size="sm" className="h-7" asChild>
            <Link href={hrefAssembleia(a.id, fonte)}>
              {a.nome ?? "Assembleia"}
              <span className="text-muted-foreground text-[11px]">
                {a.inicio ? formatarDataHora(new Date(a.inicio).toISOString()) : ""}
              </span>
            </Link>
          </Button>
        ))}
        <Button variant="outline" size="sm" className="ml-auto h-7" asChild>
          <Link href={hrefRodada(r.id, fonte)}>
            Abrir rodada
            <ArrowRight />
          </Link>
        </Button>
      </div>
    </div>
  )
}

/** O que pede atenção agora nesta campanha, com o atalho para resolver. */
function proximasAcoes(
  rodadas: RodadaPanorama[],
  semLink: Awaited<ReturnType<typeof semLinkDasRodadas>>,
  fonte: string | null
): { texto: string; rotulo: string; href: string }[] {
  const acoes: { texto: string; rotulo: string; href: string }[] = []
  const agora = Date.now()
  for (const r of rodadas) {
    const nome = r.nome ?? "Rodada"
    for (const a of r.assembleias) {
      // Só as encerradas nos últimos 60 dias (o legado tem apurações nunca fechadas no sistema).
      if (a.situacao === "encerrada" && !a.apuracaoEncerrada && (a.fim ?? 0) >= agora - 60 * 86_400_000) {
        acoes.push({ texto: `${nome}: a apuração de "${a.nome ?? "assembleia"}" ainda não foi encerrada.`, rotulo: "Apurar", href: hrefAssembleia(a.id, fonte, "apuracao") })
      }
    }
    const perto = r.abreEm !== null && r.abreEm - agora <= 7 * 86_400_000
    if (r.situacao === "sem_assembleia") {
      acoes.push({ texto: `${nome} não tem assembleia cadastrada.`, rotulo: "Cadastrar", href: hrefRodada(r.id, fonte) })
    } else if (perto && r.perguntas === 0) {
      acoes.push({ texto: `${nome} abre em breve e não tem perguntas.`, rotulo: "Cadastrar perguntas", href: hrefRodada(r.id, fonte, "perguntas") })
    } else if (perto && r.aptos === 0) {
      acoes.push({ texto: `${nome} abre em breve e não tem aptos.`, rotulo: "Importar aptos", href: hrefRodada(r.id, fonte, "aptos") })
    }
  }
  for (const s of semLink) {
    acoes.push({
      texto: `${s.rodadaNome ?? "Rodada"}: ${s.semLink.toLocaleString("pt-BR")} apto(s) sem link pessoal de voto.`,
      rotulo: "Ver",
      href: `${hrefRodada(s.rodadaId, fonte, "aptos")}&link=sem_link`,
    })
  }
  return acoes.slice(0, 6)
}

function Indicador({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="grid min-w-0 content-start gap-1">
      <p className="text-muted-foreground max-w-56 truncate text-xs">{rotulo}</p>
      {children}
    </div>
  )
}

function Numero({ valor }: { valor: number }) {
  return <span className="text-xl leading-none font-semibold tabular-nums">{valor.toLocaleString("pt-BR")}</span>
}
