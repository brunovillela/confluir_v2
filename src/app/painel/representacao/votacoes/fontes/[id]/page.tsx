import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Building2, CircleAlert, FileText, Vote } from "lucide-react"

import { LembrarLista, VoltarLista } from "@/components/voltar-lista"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { requirePermissao } from "@/lib/auth"
import { caminhoVotacao } from "@/lib/db/votacao-caminho"
import {
  panoramaDaFonte,
  participacao,
  resumoResultado,
  temParticipacao,
  ROTULO_SITUACAO_RODADA,
  type CampanhaDaFonte,
  type RodadaPanorama,
} from "@/lib/db/votacao-panorama"
import { semLinkDasRodadas } from "@/lib/db/votacao-sem-link"
import { formatarCnpjCpf, formatarData } from "@/lib/formato"
import { hrefAssembleia, hrefCampanha, hrefFonte, hrefRodada, RAIZ_VOTACOES, SEM_FONTE } from "@/lib/votacao-navegacao"

import { SeloSemLink } from "../../selo-sem-link"
import { TrilhaVotacoes } from "../../trilha"

export const metadata: Metadata = { title: "Fonte pagadora — Votações — Confluir" }

type Busca = { situacao?: string; ano?: string; ordem?: string }

/**
 * A FONTE PAGADORA nas Votações (reorganização de 17/10/2026): todas as
 * campanhas da fonte — inclusive as compartilhadas com outras fontes —, os
 * indicadores, o gráfico de participação rodada a rodada e o que pede atenção.
 * "Sem fonte pagadora" reúne as campanhas sem vínculo e as rodadas sem campanha
 * (legado).
 */
export default async function FontePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Busca>
}) {
  await requirePermissao("assembleias")
  const { id } = await params
  const sp = await searchParams
  const [panorama, caminho] = await Promise.all([panoramaDaFonte(id), caminhoVotacao({ fonteId: id })])
  if (!panorama) notFound()
  const semFonte = id === SEM_FONTE
  const nome = panorama.fonte?.nome ?? "Sem fonte pagadora"

  const semLink = await semLinkDasRodadas({ campanhaIds: panorama.campanhas.map((c) => c.id) })
  const todas: RodadaPanorama[] = [...panorama.campanhas.flatMap((c) => c.rodadas), ...panorama.rodadasSemCampanha]
  // Só as com participação registrada (o legado do Bubble não guardava quem votou).
  const realizadas = todas.filter(temParticipacao)
  const media = realizadas.length
    ? Math.round(realizadas.reduce((s, r) => s + (participacao(r) ?? 0), 0) / realizadas.length)
    : null
  const ultimaRealizada = [...realizadas].sort((x, y) => (y.fimEm ?? 0) - (x.fimEm ?? 0))[0] ?? null
  const proxima = todas
    .filter((r) => r.abreEm !== null || r.situacao === "em_votacao")
    .sort((x, y) => (x.abreEm ?? 0) - (y.abreEm ?? 0))[0] ?? null

  // Filtros e ordem da lista de campanhas.
  const situacao = sp.situacao === "abertas" || sp.situacao === "finalizadas" ? sp.situacao : "todas"
  const anos = [...new Set(panorama.campanhas.map((c) => anoDa(c)).filter((a): a is string => Boolean(a)))].sort().reverse()
  const ano = anos.includes(sp.ano ?? "") ? (sp.ano as string) : ""
  const ordem = sp.ordem === "tema" ? "tema" : "recentes"
  let campanhas = panorama.campanhas.filter(
    (c) => (situacao === "todas" || (situacao === "abertas" ? !c.finalizada : c.finalizada)) && (!ano || anoDa(c) === ano)
  )
  if (ordem === "tema") campanhas = [...campanhas].sort((x, y) => (x.tema ?? "").localeCompare(y.tema ?? "", "pt-BR"))
  const query = (mudar: Partial<Busca>) => {
    const q = new URLSearchParams()
    const v = { situacao, ano, ordem, ...mudar }
    if (v.situacao && v.situacao !== "todas") q.set("situacao", v.situacao)
    if (v.ano) q.set("ano", v.ano)
    if (v.ordem && v.ordem !== "recentes") q.set("ordem", v.ordem)
    const s = q.toString()
    return `${hrefFonte(id)}${s ? `?${s}` : ""}`
  }
  const urlAtual = query({})

  const atencao = [
    ...todas.flatMap((r) =>
      r.assembleias
        // Só o que nasceu no Confluir: o legado do Bubble tem apurações nunca fechadas aqui.
        .filter((a) => !a.legado && a.situacao === "encerrada" && !a.apuracaoEncerrada)
        .map((a) => ({ texto: `${r.nome ?? "Rodada"}: apuração de "${a.nome ?? "assembleia"}" pendente.`, href: hrefAssembleia(a.id, semFonte ? null : id, "apuracao"), rotulo: "Apurar" }))
    ),
    ...semLink.map((s) => ({
      texto: `${s.rodadaNome ?? "Rodada"}: ${s.semLink.toLocaleString("pt-BR")} apto(s) sem link pessoal de voto.`,
      href: `${hrefRodada(s.rodadaId, semFonte ? null : id, "aptos")}&link=sem_link`,
      rotulo: "Ver",
    })),
  ].slice(0, 6)

  return (
    <>
      <TrilhaVotacoes caminho={caminho} />
      <LembrarLista chave={`votacoes-fonte-${id}`} url={urlAtual} />
      <div className="grid gap-3">
        <VoltarLista chave="votacoes-painel" base={RAIZ_VOTACOES} rotulo="Votações" className="-ml-2 mb-1 justify-self-start" />
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">{nome}</h1>
              {panorama.fonte?.grupo && <Badge variant="outline">Grupo {panorama.fonte.grupo.nome}</Badge>}
            </div>
            <p className="text-muted-foreground mt-1 text-xs">
              {semFonte
                ? "Campanhas sem fonte pagadora vinculada e rodadas sem campanha (legado)."
                : panorama.fonte?.cnpj
                  ? `CNPJ ${formatarCnpjCpf(panorama.fonte.cnpj)}`
                  : "Fonte pagadora"}
            </p>
          </div>
          {!semFonte && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" asChild>
                <Link href={`/painel/representacao/empregadores/${id}`}>
                  <Building2 />
                  Ficha do empregador
                </Link>
              </Button>
              <Button variant="outline" size="sm" asChild>
                <Link href={`/painel/representacao/empregadores/${id}?aba=acordos`}>
                  <FileText />
                  Acordos coletivos
                </Link>
              </Button>
            </div>
          )}
        </div>
      </div>

      <Card className="py-0">
        <CardContent className="flex flex-wrap gap-x-10 gap-y-3 py-4">
          <Indicador rotulo="Campanhas">
            <span className="flex items-baseline gap-1.5">
              <Numero valor={panorama.campanhas.length} />
              <span className="text-muted-foreground text-xs">
                {panorama.campanhas.filter((c) => !c.finalizada).length} aberta(s)
              </span>
            </span>
          </Indicador>
          <Indicador rotulo="Rodadas">
            <Numero valor={todas.length} />
          </Indicador>
          <Indicador rotulo="Participação média">
            <span className="text-xl leading-none font-semibold tabular-nums">{media !== null ? `${media}%` : "—"}</span>
          </Indicador>
          <Indicador rotulo="Última votação">
            <span className="text-sm font-medium">
              {ultimaRealizada
                ? `${formatarData(ultimaRealizada.termino ?? ultimaRealizada.inicio)} · ${participacao(ultimaRealizada) ?? 0}%`
                : "—"}
            </span>
          </Indicador>
          <Indicador rotulo="Próxima votação">
            <span className="text-sm font-medium">
              {proxima
                ? proxima.situacao === "em_votacao"
                  ? `Em votação · ${proxima.nome ?? ""}`
                  : `${formatarData(new Date(proxima.abreEm as number).toISOString())} · ${proxima.nome ?? ""}`
                : "—"}
            </span>
          </Indicador>
        </CardContent>
      </Card>

      {atencao.length > 0 && (
        <Alert variant="warning">
          <CircleAlert />
          <AlertDescription>
            <ul className="grid gap-1">
              {atencao.map((a, i) => (
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

      {realizadas.length > 1 && <GraficoParticipacao rodadas={realizadas} fonte={semFonte ? null : id} />}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="grid gap-1">
              <CardTitle className="text-base">Campanhas</CardTitle>
              <CardDescription>
                {semFonte ? "Sem fonte pagadora vinculada." : "Inclusive as compartilhadas com outras fontes."}
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {(["todas", "abertas", "finalizadas"] as const).map((s) => (
                <Button key={s} size="sm" variant={situacao === s ? "default" : "outline"} asChild>
                  <Link href={query({ situacao: s })}>{s === "todas" ? "Todas" : s === "abertas" ? "Abertas" : "Finalizadas"}</Link>
                </Button>
              ))}
              {anos.length > 1 && (
                <>
                  <span className="text-muted-foreground ml-2 text-xs">Ano:</span>
                  <Button size="sm" variant={!ano ? "default" : "outline"} asChild>
                    <Link href={query({ ano: "" })}>Todos</Link>
                  </Button>
                  {anos.map((a) => (
                    <Button key={a} size="sm" variant={ano === a ? "default" : "outline"} asChild>
                      <Link href={query({ ano: a })}>{a}</Link>
                    </Button>
                  ))}
                </>
              )}
              <span className="text-muted-foreground ml-2 text-xs">Ordem:</span>
              <Button size="sm" variant={ordem === "recentes" ? "default" : "outline"} asChild>
                <Link href={query({ ordem: "recentes" })}>Recentes</Link>
              </Button>
              <Button size="sm" variant={ordem === "tema" ? "default" : "outline"} asChild>
                <Link href={query({ ordem: "tema" })}>Tema</Link>
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {campanhas.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">Nenhuma campanha com estes filtros.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Campanha</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead className="text-right">Rodadas</TableHead>
                  <TableHead>Última rodada</TableHead>
                  <TableHead className="text-right">Participação</TableHead>
                  <TableHead>Resultado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {campanhas.map((c) => (
                  <LinhaCampanha key={c.id} c={c} fonte={semFonte ? null : id} semLink={semLink} />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {panorama.rodadasSemCampanha.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Rodadas sem campanha ({panorama.rodadasSemCampanha.length})</CardTitle>
            <CardDescription>Rodadas antigas que não foram ligadas a nenhuma campanha.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rodada</TableHead>
                  <TableHead>Período</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead className="text-right">Participação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {panorama.rodadasSemCampanha.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Link href={hrefRodada(r.id, SEM_FONTE)} className="text-primary font-medium hover:underline">
                        {r.nome ?? "(sem nome)"}
                      </Link>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formatarData(r.inicio)} a {formatarData(r.termino)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{ROTULO_SITUACAO_RODADA[r.situacao]}</Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {participacao(r) !== null ? `${participacao(r)}%` : "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </>
  )
}

function anoDa(c: CampanhaDaFonte): string | null {
  return (c.rodadas.at(-1)?.inicio ?? c.criadaEm ?? "").slice(0, 4) || null
}

function LinhaCampanha({
  c,
  fonte,
  semLink,
}: {
  c: CampanhaDaFonte
  fonte: string | null
  semLink: Awaited<ReturnType<typeof semLinkDasRodadas>>
}) {
  const ultima = c.rodadas.at(-1) ?? null
  const apurada = [...c.rodadas].reverse().find((r) => r.resultado) ?? null
  const p = ultima ? participacao(ultima) : null
  return (
    <TableRow>
      <TableCell className="max-w-96">
        <Link href={hrefCampanha(c.id, fonte)} className="text-primary line-clamp-2 font-medium hover:underline">
          {c.tema ?? "(sem tema)"}
        </Link>
        <div className="mt-1 flex flex-wrap gap-1">
          {c.outrasFontes.length > 0 && (
            <Badge variant="outline" className="text-[11px]">
              também: {c.outrasFontes.map((f) => f.nome ?? "fonte").join(", ")}
            </Badge>
          )}
          <SeloSemLink
            itens={semLink.filter((s) => s.campanhaId === c.id)}
            href={hrefCampanha(c.id, fonte)}
          />
        </div>
      </TableCell>
      <TableCell>
        <Badge variant={c.finalizada ? "secondary" : "info"}>{c.finalizada ? "Finalizada" : "Aberta"}</Badge>
      </TableCell>
      <TableCell className="text-right tabular-nums">{c.rodadas.length}</TableCell>
      <TableCell className="whitespace-nowrap">
        {ultima ? (
          <>
            <Link href={hrefRodada(ultima.id, fonte)} className="hover:underline">
              {ultima.nome ?? "Rodada"}
            </Link>
            <p className="text-muted-foreground text-xs">
              {formatarData(ultima.inicio)} · {ROTULO_SITUACAO_RODADA[ultima.situacao]}
            </p>
          </>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="text-right tabular-nums">{p !== null ? `${p}%` : "—"}</TableCell>
      <TableCell className="max-w-56 text-xs">{apurada ? resumoResultado(apurada) ?? "—" : "—"}</TableCell>
    </TableRow>
  )
}

/** Participação de cada rodada realizada, em ordem de data (a base vota mais ou menos?). */
function GraficoParticipacao({ rodadas, fonte }: { rodadas: RodadaPanorama[]; fonte: string | null }) {
  const ordem = [...rodadas].sort((x, y) => (x.fimEm ?? 0) - (y.fimEm ?? 0)).slice(-24)
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Vote className="size-4" />
          Participação rodada a rodada
        </CardTitle>
        <CardDescription>Quanto dos aptos votou em cada rodada realizada (as últimas 24).</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex h-36 items-end gap-1">
          {ordem.map((r) => {
            const p = participacao(r) ?? 0
            return (
              <Link
                key={r.id}
                href={hrefRodada(r.id, fonte)}
                className="group flex h-full min-w-3 flex-1 flex-col justify-end"
                title={`${r.nome ?? "Rodada"} · ${formatarData(r.inicio)} · ${p}% (${r.votaram} de ${r.aptos})`}
              >
                <span className="text-muted-foreground mb-0.5 text-center text-[10px] tabular-nums">{p}%</span>
                <span className="bg-primary/80 group-hover:bg-primary block rounded-t-sm" style={{ height: `${Math.max(2, p)}%` }} />
              </Link>
            )
          })}
        </div>
        <div className="text-muted-foreground mt-1 flex justify-between text-[11px]">
          <span>{formatarData(ordem[0]?.inicio ?? null)}</span>
          <span>{formatarData(ordem.at(-1)?.inicio ?? null)}</span>
        </div>
      </CardContent>
    </Card>
  )
}

function Indicador({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="grid min-w-0 content-start gap-1">
      <p className="text-muted-foreground text-xs">{rotulo}</p>
      {children}
    </div>
  )
}

function Numero({ valor }: { valor: number }) {
  return <span className="text-xl leading-none font-semibold tabular-nums">{valor.toLocaleString("pt-BR")}</span>
}
