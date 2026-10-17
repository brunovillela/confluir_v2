import type { Metadata } from "next"
import Link from "next/link"
import { BarChart3, Building2, CircleAlert, Plus, Vote } from "lucide-react"

import { ModalidadeBadge } from "@/components/assembleias"
import { CopiarLinkBotao } from "@/components/copiar-link"
import { LembrarLista } from "@/components/voltar-lista"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { requirePermissao } from "@/lib/auth"
import { resumoAssembleias } from "@/lib/db/assembleias"
import { listarFontesVotacao, painelVotacoes, type OrdemFontes } from "@/lib/db/votacao-painel"
import { participacao } from "@/lib/db/votacao-panorama"
import { formatarCnpjCpf, formatarData } from "@/lib/formato"
import { origemAtual } from "@/lib/tenant-url"
import { hrefAssembleia, hrefFonte, RAIZ_VOTACOES, SEM_FONTE } from "@/lib/votacao-navegacao"

import { linkUnicoVotacao } from "./actions"
import { ContagemRegressiva } from "./contagem-regressiva"

export const metadata: Metadata = { title: "Votações — Confluir" }

const INPUT = "border-input bg-background text-foreground h-9 rounded-md border px-3 text-sm shadow-xs outline-none"
const ORDENS: { chave: OrdemFontes; rotulo: string }[] = [
  { chave: "proxima", rotulo: "Próxima votação" },
  { chave: "ultima", rotulo: "Última votação" },
  { chave: "nome", rotulo: "Nome" },
  { chave: "campanhas", rotulo: "Nº de campanhas" },
]

type Busca = {
  busca?: string
  grupo?: string
  situacao?: string
  ano?: string
  em7dias?: string
  ordem?: string
  pagina?: string
}

/**
 * VOTAÇÕES — PAINEL GERAL (reorganização de 17/10/2026): indicadores, alertas
 * que levam direto ao lugar, o que está em votação agora e a seguir, e as
 * fontes pagadoras com campanhas — com filtros, ordenação e paginação. Daqui
 * se desce: fonte › campanha › rodada › assembleia.
 */
export default async function VotacoesPage({ searchParams }: { searchParams: Promise<Busca> }) {
  await requirePermissao("assembleias")
  const sp = await searchParams
  const situacao = sp.situacao === "abertas" || sp.situacao === "encerradas" ? sp.situacao : ""
  const ordem = (ORDENS.find((o) => o.chave === sp.ordem)?.chave ?? "proxima") as OrdemFontes
  const filtros = {
    busca: (sp.busca ?? "").trim(),
    grupo: sp.grupo ?? "",
    situacao: situacao as "abertas" | "encerradas" | "",
    ano: sp.ano ?? "",
    em7dias: sp.em7dias === "1",
    ordem,
    pagina: Number(sp.pagina) > 0 ? Number(sp.pagina) : 1,
  }

  const [painel, fontes, resumo, origem] = await Promise.all([
    painelVotacoes(),
    listarFontesVotacao(filtros),
    resumoAssembleias(),
    origemAtual(),
  ])

  const query = (mudar: Partial<Record<keyof Busca, string>>) => {
    const v: Record<string, string> = {
      busca: filtros.busca,
      grupo: filtros.grupo,
      situacao: filtros.situacao,
      ano: filtros.ano,
      em7dias: filtros.em7dias ? "1" : "",
      ordem: filtros.ordem === "proxima" ? "" : filtros.ordem,
      pagina: filtros.pagina > 1 ? String(filtros.pagina) : "",
      ...mudar,
    }
    const q = new URLSearchParams(Object.entries(v).filter(([, x]) => x))
    const s = q.toString()
    return `${RAIZ_VOTACOES}${s ? `?${s}` : ""}`
  }
  const i = painel.indicadores

  return (
    <>
      <LembrarLista chave="votacoes-painel" url={query({})} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Votações</h1>
          <p className="text-muted-foreground mt-1 text-xs">
            Fontes pagadoras › campanhas › rodadas de assembleias › assembleias
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link href={`${RAIZ_VOTACOES}/entrega`}>
              <BarChart3 />
              Entrega das votações
            </Link>
          </Button>
          <Button asChild>
            <Link href={`${RAIZ_VOTACOES}/campanhas/nova`}>
              <Plus />
              Nova campanha
            </Link>
          </Button>
        </div>
      </div>

      {!resumo.esquemaPronto && (
        <Alert variant="warning">
          <AlertDescription>
            Votações ainda não configuradas por completo — rode <code>supabase/assembleias.sql</code> no SQL Editor do
            Supabase.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Tile rotulo="Em votação agora" valor={i.abertasAgora} destaque={i.abertasAgora > 0} />
        <Tile rotulo="Abrem em 7 dias" valor={i.proximos7dias} />
        <Tile rotulo="Rodadas em curso" valor={i.rodadasEmCurso} />
        <Tile rotulo="Campanhas abertas" valor={i.campanhasAbertas} />
        <Tile rotulo="Participação (últimas 5)" valor={i.participacaoMedia !== null ? `${i.participacaoMedia}%` : "—"} />
        <Tile rotulo="Aptos sem link (48 h)" valor={i.semLink} alerta={i.semLink > 0} />
      </div>

      {painel.alertas.length > 0 && (
        <Alert variant={painel.alertas.some((a) => a.tom === "erro") ? "error" : "warning"}>
          <CircleAlert />
          <AlertDescription>
            <ul className="grid gap-1">
              {painel.alertas.slice(0, 10).map((a, k) => (
                <li key={k}>
                  {a.texto}{" "}
                  <Link href={a.href} className="font-medium underline underline-offset-4">
                    {a.rotulo}
                  </Link>
                </li>
              ))}
              {painel.alertas.length > 10 && <li>E mais {painel.alertas.length - 10} aviso(s).</li>}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Vote className="size-4" />
              Agora e a seguir
            </CardTitle>
            <CardDescription>Assembleias em votação e as que abrem nos próximos 7 dias. Participação ao vivo, nunca o resultado.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            {painel.agora.length === 0 ? (
              <p className="text-muted-foreground py-6 text-center text-sm">Nenhuma votação aberta nem marcada para os próximos 7 dias.</p>
            ) : (
              painel.agora.map((a) => {
                const p = participacao(a.rodada)
                return (
                  <Link
                    key={a.assembleiaId}
                    href={hrefAssembleia(a.assembleiaId, a.fonteId)}
                    className="hover:bg-muted/40 grid gap-1.5 rounded-lg border p-3 transition-colors"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                        <span className="font-medium">{a.assembleiaNome ?? "Assembleia"}</span>
                        <Badge variant={a.aberta ? "success" : "info"}>{a.aberta ? "Em votação" : "Agendada"}</Badge>
                        <ModalidadeBadge modalidade={a.rodada.assembleias.find((x) => x.id === a.assembleiaId)?.modalidade ?? "online"} />
                      </div>
                      <ContagemRegressiva
                        inicio={a.inicio !== null ? new Date(a.inicio).toISOString() : null}
                        fim={a.fim !== null ? new Date(a.fim).toISOString() : null}
                        compacta
                      />
                    </div>
                    <p className="text-muted-foreground truncate text-xs">
                      {[a.fonteNome, a.campanhaTema, a.rodada.nome].filter(Boolean).join(" · ")}
                    </p>
                    {a.aberta && (
                      <div className="grid gap-0.5">
                        <div className="text-muted-foreground flex justify-between text-xs">
                          <span>
                            {a.rodada.votaram.toLocaleString("pt-BR")} de {a.rodada.aptos.toLocaleString("pt-BR")} votaram
                          </span>
                          <span>{p !== null ? `${p}%` : "—"}</span>
                        </div>
                        <div className="bg-muted h-1.5 overflow-hidden rounded-full">
                          <div className="bg-primary h-full rounded-full" style={{ width: `${p ?? 0}%` }} />
                        </div>
                      </div>
                    )}
                  </Link>
                )
              })
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Link único de votação</CardTitle>
            <CardDescription>
              <span className="text-foreground font-mono">{origem}/votar</span> mostra as votações online abertas e as
              próximas. Para quem não recebe o e-mail da empresa: divulgue por WhatsApp, cartaz ou QR code.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CopiarLinkBotao obterLink={linkUnicoVotacao} rotulo="Copiar link único" />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Building2 className="size-4" />
            Fontes pagadoras com campanhas
          </CardTitle>
          <CardDescription>Clique numa fonte para ver as campanhas dela.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <form action={RAIZ_VOTACOES} className="flex flex-wrap items-center gap-2">
            <input type="search" name="busca" defaultValue={filtros.busca} placeholder="Fonte, CNPJ ou tema da campanha" className={`${INPUT} w-64 max-w-full`} />
            {fontes.grupos.length > 0 && (
              <select name="grupo" defaultValue={filtros.grupo} className={INPUT} aria-label="Grupo empresarial">
                <option value="">Todos os grupos</option>
                {fontes.grupos.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.nome}
                  </option>
                ))}
              </select>
            )}
            <select name="situacao" defaultValue={filtros.situacao} className={INPUT} aria-label="Situação">
              <option value="">Todas as situações</option>
              <option value="abertas">Com campanha aberta</option>
              <option value="encerradas">Só encerradas</option>
            </select>
            {fontes.anos.length > 0 && (
              <select name="ano" defaultValue={filtros.ano} className={INPUT} aria-label="Ano">
                <option value="">Todos os anos</option>
                {fontes.anos.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            )}
            <select name="ordem" defaultValue={filtros.ordem === "proxima" ? "" : filtros.ordem} className={INPUT} aria-label="Ordenar por">
              {ORDENS.map((o) => (
                <option key={o.chave} value={o.chave === "proxima" ? "" : o.chave}>
                  Ordenar: {o.rotulo}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" name="em7dias" value="1" defaultChecked={filtros.em7dias} className="size-4" />
              Votação em 7 dias
            </label>
            <Button type="submit" variant="outline" size="sm">
              Filtrar
            </Button>
            {(filtros.busca || filtros.grupo || filtros.situacao || filtros.ano || filtros.em7dias || filtros.ordem !== "proxima") && (
              <Button variant="ghost" size="sm" asChild>
                <Link href={RAIZ_VOTACOES}>Limpar</Link>
              </Button>
            )}
          </form>

          {fontes.linhas.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">Nenhuma fonte com estes filtros.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Fonte pagadora</TableHead>
                    <TableHead className="text-right">Campanhas</TableHead>
                    <TableHead>Próxima votação</TableHead>
                    <TableHead>Última votação</TableHead>
                    <TableHead className="text-right">Participação (última)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fontes.linhas.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="max-w-96 min-w-56">
                        <Link href={hrefFonte(l.id)} className="text-primary line-clamp-1 font-medium hover:underline">
                          {l.nome}
                        </Link>
                        <p className="text-muted-foreground flex flex-wrap items-center gap-1.5 text-xs">
                          {l.id === SEM_FONTE ? "Campanhas sem fonte e rodadas sem campanha" : l.cnpj ? formatarCnpjCpf(l.cnpj) : ""}
                          {l.grupo && (
                            <Badge variant="outline" className="text-[11px]">
                              Grupo {l.grupo.nome}
                            </Badge>
                          )}
                        </p>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {l.campanhas}
                        {l.abertas > 0 && <span className="text-muted-foreground text-xs"> · {l.abertas} aberta(s)</span>}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {l.emCurso ? <Badge variant="success">Em votação</Badge> : l.proxima ? formatarData(l.proxima) : "—"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{l.ultima ? formatarData(l.ultima) : "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {l.participacaoUltima !== null ? `${l.participacaoUltima}%` : "—"}
                        {l.aptosUltima ? <span className="text-muted-foreground text-xs"> de {l.aptosUltima.toLocaleString("pt-BR")}</span> : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {fontes.totalPaginas > 1 && (
            <div className="text-muted-foreground flex flex-wrap items-center justify-between gap-3 text-sm">
              <span className="tabular-nums">
                Página {fontes.pagina} de {fontes.totalPaginas} · {fontes.total} fontes
              </span>
              <div className="flex gap-2">
                {fontes.pagina > 1 && (
                  <Button variant="outline" size="sm" asChild>
                    <Link href={query({ pagina: String(fontes.pagina - 1) })}>Anterior</Link>
                  </Button>
                )}
                {fontes.pagina < fontes.totalPaginas && (
                  <Button variant="outline" size="sm" asChild>
                    <Link href={query({ pagina: String(fontes.pagina + 1) })}>Próxima</Link>
                  </Button>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  )
}

function Tile({
  rotulo,
  valor,
  destaque,
  alerta,
}: {
  rotulo: string
  valor: number | string
  destaque?: boolean
  alerta?: boolean
}) {
  return (
    <Card className="py-0">
      <CardContent className="grid gap-1 py-3">
        <p className="text-muted-foreground text-xs">{rotulo}</p>
        <p
          className={
            alerta
              ? "text-warning-fg text-2xl font-semibold tabular-nums"
              : destaque
                ? "text-success-fg text-2xl font-semibold tabular-nums"
                : "text-2xl font-semibold tabular-nums"
          }
        >
          {typeof valor === "number" ? valor.toLocaleString("pt-BR") : valor}
        </p>
      </CardContent>
    </Card>
  )
}
