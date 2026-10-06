import type { Metadata } from "next"
import Link from "next/link"
import { FileText, HandCoins, ShoppingCart, TreePalm, Users } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { AvaliacaoOrdemForm } from "@/app/painel/compras/avaliacoes/avaliacao-ordem-form"
import { requireSessaoPainel } from "@/lib/auth"
import { ROTULOS_SITUACAO_PROCESSO } from "@/lib/compras-constantes"
import { areaDoCoordenador } from "@/lib/db/coordenador"
import { formatarData, formatarMoeda } from "@/lib/formato"
import { moduloDaRota, podeAcessarModulo } from "@/lib/permissoes"
import { cn } from "@/lib/utils"

import {
  autorizarFeriasCoordenadorAction,
  avaliarDiariaCoordenadorAction,
  decidirFaltaCoordenadorAction,
} from "./actions"
import { DecisaoPedido } from "./decisao-pedido"

export const metadata: Metadata = { title: "Coordenação — Confluir" }

/**
 * ÁREA DO COORDENADOR: o departamento de quem o coordena — pedidos da equipe
 * para decidir, compras e ordens, orçado × realizado, contratos e a equipe.
 * Incremento da área do diretor (link a partir dela e da home).
 */
export default async function CoordenadorPage({
  searchParams,
}: {
  searchParams: Promise<{ depto?: string; salvo?: string }>
}) {
  const sessao = await requireSessaoPainel()
  const { depto, salvo } = await searchParams
  const a = await areaDoCoordenador(sessao, depto)

  if (!a) {
    return (
      <>
        <h1 className="text-2xl font-semibold tracking-tight">Coordenação</h1>
        <Alert>
          <AlertDescription>
            Você não coordena nenhum departamento. A coordenação é definida em Institucional → Organização →
            Departamentos.
          </AlertDescription>
        </Alert>
      </>
    )
  }

  const aqui = `/painel/coordenador?depto=${a.departamento.id}`
  const podeAbrir = (href: string) => {
    const m = moduloDaRota(href)
    return !m || podeAcessarModulo(sessao.permissoes, m)
  }
  const pedidos = a.pedidos.ferias.length + a.pedidos.faltas.length + a.pedidos.diarias.length
  const emAutorizacao = a.ordens.abertas.filter((o) => o.situacao === "Em autorização")
  const totalAberto = a.ordens.abertas.reduce((s, o) => s + (o.valor_inicial_cobranca ?? 0), 0)
  const o = a.orcamento
  const pctTotal = o.totalOrcado > 0 ? o.totalRealizado / o.totalOrcado : 0

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Coordenação — {a.departamento.nome}</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Os pedidos da equipe, as compras e ordens do departamento, o orçamento e os contratos.
        </p>
        {a.outros.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            <span className="text-muted-foreground">Também coordena:</span>
            {a.outros.map((d) => (
              <Link key={d.id} href={`/painel/coordenador?depto=${d.id}`} className="text-primary hover:underline">
                {d.nome}
              </Link>
            ))}
          </div>
        )}
      </div>

      {salvo === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Avaliação registrada.</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Numero titulo="Pedidos da equipe" valor={String(pedidos)} nota="férias, faltas e diárias" destaque={pedidos > 0} href="#pedidos" />
        <Numero
          titulo="Ordens em autorização"
          valor={String(emAutorizacao.length)}
          nota={`${a.ordens.abertas.length} em aberto · ${formatarMoeda(totalAberto)}`}
          href="#ordens"
        />
        <Numero
          titulo={`Orçamento ${o.ano}`}
          valor={o.totalOrcado > 0 ? `${Math.round(pctTotal * 100)}%` : "—"}
          nota={o.totalOrcado > 0 ? `${formatarMoeda(o.totalRealizado)} de ${formatarMoeda(o.totalOrcado)}` : "sem orçamento lançado"}
          alerta={o.totalOrcado > 0 && o.totalRealizado > o.totalEsperado}
          href="#orcamento"
        />
        <Numero titulo="Contratos vigentes" valor={String(a.contratos.length)} nota={`${a.equipe.length} pessoas na equipe`} href="#contratos" />
      </div>

      {/* ── Pedidos da equipe ─────────────────────────────────────────── */}
      <Card id="pedidos" className="scroll-mt-20">
        <CardHeader>
          <CardTitle className="text-base">Pedidos da equipe</CardTitle>
          <CardDescription>
            Pedidos dos funcionários do departamento aguardando decisão. A sua decisão é a autorização — o funcionário é
            avisado como se o Pessoal tivesse decidido.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          {pedidos === 0 && <p className="text-muted-foreground text-sm">Nenhum pedido aguardando.</p>}

          {a.pedidos.ferias.length > 0 && (
            <Grupo icone={TreePalm} titulo={`Férias (${a.pedidos.ferias.length})`}>
              {a.pedidos.ferias.map((g) => (
                <Linha
                  key={g.gozoId}
                  titulo={g.nome}
                  detalhe={`${formatarData(g.inicio)} a ${formatarData(g.termino)}${g.dias ? ` · ${g.dias} dias` : ""}${g.abono ? " · venda de 1/3" : ""}${g.pedidoEm ? ` · pedido em ${formatarData(g.pedidoEm)}` : ""}`}
                >
                  <DecisaoPedido
                    id={g.gozoId}
                    acao={autorizarFeriasCoordenadorAction}
                    pergunta={`Autorizar as férias de ${g.nome} (${formatarData(g.inicio)} a ${formatarData(g.termino)})?`}
                    aprovar={{ valor: "autorizar", rotulo: "Autorizar" }}
                  />
                </Linha>
              ))}
            </Grupo>
          )}

          {a.pedidos.faltas.length > 0 && (
            <Grupo icone={FileText} titulo={`Faltas justificadas (${a.pedidos.faltas.length})`}>
              {a.pedidos.faltas.map((f) => (
                <Linha
                  key={f.id}
                  titulo={f.funcionarioNome ?? "(sem nome)"}
                  detalhe={[formatarData(f.data), f.tipo, f.observacao].filter(Boolean).join(" · ")}
                >
                  <DecisaoPedido
                    id={f.id}
                    acao={decidirFaltaCoordenadorAction}
                    pergunta={`Autorizar a falta justificada de ${f.funcionarioNome ?? "funcionário"} em ${formatarData(f.data)}?`}
                    aprovar={{ valor: "autorizar", rotulo: "Autorizar" }}
                    recusar={{ valor: "recusar", rotulo: "Recusar" }}
                  />
                </Linha>
              ))}
            </Grupo>
          )}

          {a.pedidos.diarias.length > 0 && (
            <Grupo icone={HandCoins} titulo={`Diárias (${a.pedidos.diarias.length})`}>
              {a.pedidos.diarias.map((d) => (
                <Linha
                  key={d.id}
                  titulo={`${d.funcionarioNome ?? "(sem nome)"} — ${formatarMoeda((d.valor_total ?? 0) + d.valorDespesas)}`}
                  detalhe={[
                    `${d.tipoNome ?? "Diária"}${d.quantidade ? ` × ${d.quantidade}` : ""}`,
                    d.data_inicio ? `${formatarData(d.data_inicio)}${d.data_termino ? ` a ${formatarData(d.data_termino)}` : ""}` : null,
                    d.motivo,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                >
                  <DecisaoPedido
                    id={d.id}
                    acao={avaliarDiariaCoordenadorAction}
                    pergunta={`Aprovar a diária de ${d.funcionarioNome ?? "funcionário"}?`}
                    aprovar={{ valor: "aprovar", rotulo: "Aprovar" }}
                    recusar={{ valor: "reprovar", rotulo: "Reprovar" }}
                  />
                </Linha>
              ))}
            </Grupo>
          )}
        </CardContent>
      </Card>

      {/* ── Orçamento ─────────────────────────────────────────────────── */}
      <Card id="orcamento" className="scroll-mt-20">
        <CardHeader>
          <CardTitle className="text-base">Orçado × realizado — {o.ano}</CardTitle>
          <CardDescription>
            Centros de custo do departamento. Só acompanhamento: o orçamento é lançado pelo Financeiro. O esperado é a
            parte do orçado proporcional aos meses já decorridos.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!o.disponivel ? (
            <p className="text-muted-foreground text-sm">O orçamento ainda não está disponível neste sistema.</p>
          ) : o.linhas.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Nenhum centro de custo do departamento tem orçamento ou gasto em {o.ano}.
            </p>
          ) : (
            <div className="grid gap-3">
              {o.linhas.map((l) => {
                const acima = l.orcado > 0 && l.realizado > l.esperadoAteAgora
                return (
                  <div key={l.centroId} className="grid gap-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                      <span className="font-medium">{l.nome}</span>
                      <span className="text-muted-foreground text-xs tabular-nums">
                        {formatarMoeda(l.realizado)}
                        {l.orcado > 0 ? ` de ${formatarMoeda(l.orcado)} · esperado ${formatarMoeda(l.esperadoAteAgora)}` : " · sem orçamento"}
                      </span>
                    </div>
                    {l.orcado > 0 && (
                      <div className="bg-muted relative h-2 overflow-hidden rounded-full">
                        <div
                          className={cn("h-full rounded-full", acima ? "bg-destructive" : "bg-primary")}
                          style={{ width: `${Math.min(100, l.pct * 100)}%` }}
                        />
                        <div
                          className="bg-foreground/50 absolute top-0 h-full w-0.5"
                          style={{ left: `${Math.min(100, (l.esperadoAteAgora / l.orcado) * 100)}%` }}
                          title="Esperado até agora"
                        />
                      </div>
                    )}
                  </div>
                )
              })}
              {o.centrosSemOrcamento > 0 && (
                <p className="text-warning-fg text-xs">
                  {o.centrosSemOrcamento} centro(s) com gasto em {o.ano} e sem orçamento lançado — fale com o Financeiro.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Ordens de pagamento ───────────────────────────────────────── */}
      <Card id="ordens" className="scroll-mt-20">
        <CardHeader>
          <CardTitle className="text-base">Ordens de pagamento do departamento</CardTitle>
          <CardDescription>
            Em aberto ({a.ordens.abertas.length}) · pagas em {o.ano}: {a.ordens.pagasNoAno.quantidade} ·{" "}
            {formatarMoeda(a.ordens.pagasNoAno.valor)}. Aprovar depende da sua alçada.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {a.ordens.abertas.length === 0 && <p className="text-muted-foreground text-sm">Nenhuma ordem em aberto.</p>}
          {a.ordens.abertas.map((ord) => (
            <div key={ord.id} className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-md border p-3">
              <div className="min-w-0 flex-1 basis-64">
                <p className="text-sm font-medium">
                  {podeAbrir(`/painel/financeiro/ordens/${ord.id}`) ? (
                    <Link href={`/painel/financeiro/ordens/${ord.id}`} className="text-primary tabular-nums hover:underline">
                      {ord.codigo ?? "(sem código)"}
                    </Link>
                  ) : (
                    <span className="tabular-nums">{ord.codigo ?? "(sem código)"}</span>
                  )}
                  {ord.favorecidoNome && <> — {ord.favorecidoNome}</>}
                  <Badge variant="outline" className="ml-2 align-middle">
                    {ord.situacao}
                  </Badge>
                </p>
                <p className="text-muted-foreground mt-0.5 truncate text-xs">
                  {[ord.tipo, ord.descricao, ord.vencimento ? `vence ${formatarData(ord.vencimento)}` : null].filter(Boolean).join(" · ")}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-3">
                <span className="text-sm font-semibold whitespace-nowrap tabular-nums">{formatarMoeda(ord.valor_inicial_cobranca)}</span>
                {ord.podeAvaliar && (
                  <AvaliacaoOrdemForm ordemId={ord.id} valorTexto={formatarMoeda(ord.valor_inicial_cobranca)} voltarPara={aqui} />
                )}
              </div>
            </div>
          ))}
          {a.ordens.ultimasPagas.length > 0 && (
            <div className="mt-2">
              <p className="text-muted-foreground mb-1 text-xs font-medium">Últimas pagas</p>
              <ul className="divide-y text-sm">
                {a.ordens.ultimasPagas.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 py-1.5">
                    <span className="min-w-0 truncate">
                      <span className="tabular-nums">{p.codigo ?? "(sem código)"}</span>
                      {p.favorecidoNome ? ` — ${p.favorecidoNome}` : ""}
                    </span>
                    <span className="text-muted-foreground shrink-0 text-xs tabular-nums">{formatarMoeda(p.valor_pago ?? p.valor_inicial_cobranca)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ── Compras ───────────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShoppingCart className="text-muted-foreground size-4" />
              Compras em andamento ({a.compras.length})
            </CardTitle>
            <CardDescription>Processos de aquisição do departamento ainda não recebidos.</CardDescription>
          </CardHeader>
          <CardContent>
            {a.compras.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nenhuma compra em andamento.</p>
            ) : (
              <ul className="divide-y text-sm">
                {a.compras.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 py-2">
                    <span className="min-w-0">
                      {podeAbrir(`/painel/compras/${c.id}`) ? (
                        <Link href={`/painel/compras/${c.id}`} className="text-primary tabular-nums hover:underline">
                          {c.codigo ?? "(sem código)"}
                        </Link>
                      ) : (
                        <span className="tabular-nums">{c.codigo ?? "(sem código)"}</span>
                      )}
                      <span className="text-muted-foreground block truncate text-xs">{c.produto ?? "—"}</span>
                    </span>
                    <Badge variant="outline" className="shrink-0">
                      {ROTULOS_SITUACAO_PROCESSO[c.situacao as keyof typeof ROTULOS_SITUACAO_PROCESSO] ?? c.situacao}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* ── Contratos ─────────────────────────────────────────────────── */}
        <Card id="contratos" className="scroll-mt-20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="text-muted-foreground size-4" />
              Contratos vigentes ({a.contratos.length})
            </CardTitle>
            <CardDescription>Contratos do departamento em vigor (categorias sigilosas ficam de fora).</CardDescription>
          </CardHeader>
          <CardContent>
            {a.contratos.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nenhum contrato vigente.</p>
            ) : (
              <ul className="divide-y text-sm">
                {a.contratos.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 py-2">
                    <span className="min-w-0">
                      {podeAbrir(`/painel/compras/contratos/${c.id}`) ? (
                        <Link href={`/painel/compras/contratos/${c.id}`} className="text-primary hover:underline">
                          {c.codigo ?? c.objeto ?? "(sem código)"}
                        </Link>
                      ) : (
                        <span>{c.codigo ?? c.objeto ?? "(sem código)"}</span>
                      )}
                      <span className="text-muted-foreground block truncate text-xs">
                        {[c.fornecedorNome, c.objeto].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    <span className="shrink-0 text-right text-xs">
                      {c.valor !== null && <span className="block tabular-nums">{formatarMoeda(c.valor)}</span>}
                      <span className={cn("block", c.vigencia === "vencendo" ? "text-warning-fg" : "text-muted-foreground")}>
                        {c.vigencia_termino ? `até ${formatarData(c.vigencia_termino)}` : "sem termo"}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Equipe ────────────────────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="text-muted-foreground size-4" />
              Equipe ({a.equipe.length})
            </CardTitle>
            <CardDescription>Diretores e funcionários do departamento.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {a.equipe.map((m) => (
                <li key={m.usuarioId} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{m.nome}</span>
                    {m.cargo && <span className="text-muted-foreground block truncate text-xs">{m.cargo}</span>}
                  </span>
                  <span className="flex shrink-0 flex-wrap justify-end gap-1">
                    {m.coordenador && <Badge variant="outline">Coordenação</Badge>}
                    <Badge variant="outline" className="text-muted-foreground">
                      {m.origem === "diretor" ? "Diretor" : m.origem === "funcionario" ? "Funcionário" : "Usuário"}
                    </Badge>
                    {m.emFeriasAte && (
                      <Badge variant="outline" className="border-info/40 text-info-fg">
                        Férias até {formatarData(m.emFeriasAte)}
                      </Badge>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TreePalm className="text-muted-foreground size-4" />
              Férias nos próximos 60 dias
            </CardTitle>
            <CardDescription>Gozos já autorizados — para planejar a cobertura.</CardDescription>
          </CardHeader>
          <CardContent>
            {a.feriasProximas.length === 0 ? (
              <p className="text-muted-foreground text-sm">Ninguém da equipe sai de férias nos próximos 60 dias.</p>
            ) : (
              <ul className="divide-y text-sm">
                {a.feriasProximas.map((f, i) => (
                  <li key={`${f.nome}-${f.inicio}-${i}`} className="flex items-center justify-between gap-3 py-2">
                    <span className="truncate font-medium">{f.nome}</span>
                    <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                      {formatarData(f.inicio)} a {formatarData(f.termino)}
                      {f.dias ? ` · ${f.dias} dias` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  )
}

function Numero({
  titulo,
  valor,
  nota,
  href,
  destaque = false,
  alerta = false,
}: {
  titulo: string
  valor: string
  nota: string
  href: string
  destaque?: boolean
  alerta?: boolean
}) {
  return (
    <Link
      href={href}
      className={cn(
        "bg-card hover:border-primary/50 block rounded-xl border p-4 shadow-xs transition-colors",
        destaque && "border-primary/40"
      )}
    >
      <p className="text-muted-foreground text-xs">{titulo}</p>
      <p className={cn("text-3xl font-semibold tabular-nums", alerta && "text-destructive")}>{valor}</p>
      <p className="text-muted-foreground truncate text-xs">{nota}</p>
    </Link>
  )
}

function Grupo({
  icone: Icone,
  titulo,
  children,
}: {
  icone: React.ComponentType<{ className?: string }>
  titulo: string
  children: React.ReactNode
}) {
  return (
    <div className="grid gap-2">
      <p className="flex items-center gap-2 text-sm font-medium">
        <Icone className="text-muted-foreground size-4" />
        {titulo}
      </p>
      <div className="grid gap-2">{children}</div>
    </div>
  )
}

function Linha({ titulo, detalhe, children }: { titulo: string; detalhe: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-md border p-3">
      <div className="min-w-0 flex-1 basis-56">
        <p className="truncate text-sm font-medium">{titulo}</p>
        {detalhe && <p className="text-muted-foreground mt-0.5 text-xs">{detalhe}</p>}
      </div>
      {children}
    </div>
  )
}
