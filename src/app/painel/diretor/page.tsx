import type { Metadata } from "next"
import Link from "next/link"
import {
  ArrowRight,
  CalendarDays,
  CheckCheck,
  FileSignature,
  HandCoins,
  Handshake,
  Plane,
  Receipt,
  UsersRound,
  Vote,
} from "lucide-react"

import { TileIndicador } from "@/components/graficos/tile"
import { moeda } from "@/components/graficos/base"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { requireSessaoPainel } from "@/lib/auth"
import { homeDiretor } from "@/lib/db/diretor-home"
import { formatarData, formatarDataHora, formatarMoeda } from "@/lib/formato"
import { ROTULO_SITUACAO_NEGOCIACAO } from "@/lib/negociacoes-constantes"
import { ROTULO_SITUACAO_VIAGEM } from "@/lib/viagens-constantes"

export const metadata: Metadata = { title: "Diretor — Confluir" }

function horaSP(iso: string | null): string {
  if (!iso) return ""
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(new Date(iso))
}

function diaSP(iso: string | null): string {
  if (!iso) return ""
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "short", day: "2-digit", month: "2-digit" }).format(new Date(iso))
}

/**
 * HOME DO DIRETOR (onda 4, D1): a vista por papel. Primeiro o que espera a
 * decisão da pessoa; depois a semana (agenda, votações, negociações), os
 * números da entidade e os pedidos dela. Tudo com atalho para a tela cheia.
 */
export default async function DiretorPage() {
  const sessao = await requireSessaoPainel()
  const h = await homeDiretor(sessao)
  const nome = String(sessao.usuario.nome_guerra ?? sessao.usuario.nome_completo ?? "").split(" ")[0]
  const decisoes = h.ordens.length + h.assinaturas.length + h.diarias.length
  const kpis = h.kpis

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Diretor</h1>
          <p className="text-muted-foreground mt-1 text-xs">
            {h.diretoria
              ? `${nome}, ${[h.diretoria.cargo, h.diretoria.grupoNome].filter(Boolean).join(" · ")}${h.diretoria.mandatoNome ? ` — ${h.diretoria.mandatoNome}` : ""}`
              : `${nome}, o que espera a sua decisão e a semana da entidade.`}
          </p>
        </div>
        <Button asChild>
          <Link href="/painel/aprovar">
            <CheckCheck />
            Aprovar{decisoes > 0 ? ` (${decisoes})` : ""}
          </Link>
        </Button>
      </div>

      {h.coordenados.length > 0 && (
        <Link href="/painel/coordenador" className="group block">
          <Card className="border-primary/30 group-hover:border-primary transition-colors">
            <CardContent className="flex flex-wrap items-center justify-between gap-3 py-3">
              <span className="flex min-w-0 items-center gap-3">
                <UsersRound className="text-primary size-5 shrink-0" />
                <span className="min-w-0">
                  <span className="block text-sm font-medium">Coordenação — {h.coordenados.map((d) => d.nome).join(", ")}</span>
                  <span className="text-muted-foreground block text-xs">
                    Pedidos da equipe, compras e ordens, orçado × realizado, contratos e a equipe do departamento
                  </span>
                </span>
              </span>
              <ArrowRight className="text-muted-foreground size-4 shrink-0" />
            </CardContent>
          </Card>
        </Link>
      )}

      {/* ── Para decidir ──────────────────────────────────────────────── */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Atalho
          icone={Receipt}
          titulo="Ordens na sua alçada"
          valor={h.ordens.length}
          nota={h.alcada > 0 ? `alçada ${formatarMoeda(h.alcada)}${h.ordensAcima ? ` · ${h.ordensAcima} acima` : ""}` : "sem alçada de aprovação"}
          href="/painel/aprovar"
        />
        <Atalho icone={FileSignature} titulo="Documentos para assinar" valor={h.assinaturas.length} nota="ofícios, termos e contratos" href="/painel/aprovar" />
        <Atalho
          icone={HandCoins}
          titulo="Diárias aguardando"
          valor={h.diarias.length}
          nota={h.podeDiariasDiretoria ? "da diretoria" : h.podeDiariasQuadro ? "do quadro" : "sem permissão para avaliar"}
          href="/painel/aprovar"
        />
      </div>

      {/* ── A semana ──────────────────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Bloco icone={CalendarDays} titulo="Agenda da semana" href="/painel/ferramentas/agenda" vazio="Nada marcado nos próximos 7 dias.">
          {h.agenda.map((c) => (
            <li key={c.id} className="flex items-start justify-between gap-3 py-2 text-sm">
              <span className="min-w-0">
                <span className="block truncate font-medium">{c.atividade ?? "(sem título)"}</span>
                {c.local && <span className="text-muted-foreground block truncate text-xs">{c.local}</span>}
              </span>
              <span className="text-muted-foreground shrink-0 text-right text-xs tabular-nums">
                {diaSP(c.inicio)}
                <br />
                {c.diaTodo ? "dia todo" : horaSP(c.inicio)}
              </span>
            </li>
          ))}
        </Bloco>
        <Bloco icone={Vote} titulo="Votações" href="/painel/representacao/votacoes" vazio="Nenhuma votação aberta ou marcada.">
          {h.votacoes.map((v) => (
            <li key={v.id} className="py-2 text-sm">
              <span className="block font-medium">{v.nome ?? "(sem nome)"}</span>
              <span className="text-muted-foreground block text-xs">
                {v.campanha ? `${v.campanha} · ` : ""}
                {v.inicio ? formatarData(v.inicio) : "?"} a {v.termino ? formatarData(v.termino) : "?"}
              </span>
            </li>
          ))}
        </Bloco>
        <Bloco icone={Handshake} titulo="Negociações em curso" href="/painel/representacao/negociacoes" vazio="Nenhuma negociação em andamento.">
          {h.negociacoes.map((n) => (
            <li key={n.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span className="min-w-0">
                <span className="block truncate font-medium">{n.titulo}</span>
                <span className="text-muted-foreground block truncate text-xs">
                  {n.empresas.slice(0, 2).join(", ")}
                  {n.empresas.length > 2 ? ` +${n.empresas.length - 2}` : ""}
                  {n.dataBase ? ` · data-base ${n.dataBase}` : ""}
                </span>
              </span>
              <Badge variant="outline" className="shrink-0">
                {ROTULO_SITUACAO_NEGOCIACAO[n.situacao]}
              </Badge>
            </li>
          ))}
        </Bloco>
      </div>

      {/* ── Números ───────────────────────────────────────────────────── */}
      {kpis && (kpis.filiacao || kpis.financeiro || kpis.arrecadacao) && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {kpis.filiacao && (
            <TileIndicador
              rotulo="Filiados ativos"
              valor={kpis.filiacao.ativosHoje.toLocaleString("pt-BR")}
              delta={delta(kpis.filiacao.ativosHoje, kpis.filiacao.ativosHa12Meses)}
              deltaRotulo="em 12 meses"
              sparkline={kpis.filiacao.ativosSerie}
              href="/painel/indicadores"
            />
          )}
          {kpis.arrecadacao && (
            <TileIndicador
              rotulo={`Arrecadação${kpis.arrecadacao.ultimoMes ? ` · ${kpis.arrecadacao.ultimoMes.slice(5, 7)}/${kpis.arrecadacao.ultimoMes.slice(0, 4)}` : ""}`}
              valor={moeda(kpis.arrecadacao.valorUltimoMes)}
              delta={delta(kpis.arrecadacao.valorUltimoMes, kpis.arrecadacao.valorMesAnterior)}
              deltaRotulo="vs. mês anterior"
              href="/painel/indicadores"
            />
          )}
          {kpis.financeiro && (
            <TileIndicador
              rotulo="Saldo em caixa"
              valor={kpis.financeiro.saldoCaixa === null ? "—" : moeda(kpis.financeiro.saldoCaixa)}
              nota={`a pagar em 30 dias: ${moeda(kpis.financeiro.aPagar30d.valor)}`}
              href="/painel/financeiro/gerencial"
            />
          )}
          {kpis.financeiro && (
            <TileIndicador
              rotulo="Ordens vencidas"
              valor={String(kpis.financeiro.vencidas.quantidade)}
              nota={kpis.financeiro.vencidas.quantidade ? moeda(kpis.financeiro.vencidas.valor) : "nenhuma"}
              href="/painel/financeiro/ordens"
            />
          )}
        </div>
      )}

      {/* ── Meus pedidos ──────────────────────────────────────────────── */}
      {(h.minhasViagens.length > 0 || h.minhasDiarias.length > 0) && (
        <div className="grid gap-4 lg:grid-cols-2">
          {h.minhasViagens.length > 0 && (
            <Bloco icone={Plane} titulo="Minhas viagens em andamento" href="/painel/perfil/viagens" vazio="">
              {h.minhasViagens.map((v) => (
                <li key={v.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{v.eventoTitulo ?? v.eventoExterno ?? v.motivo}</span>
                    <span className="text-muted-foreground block text-xs">
                      {v.inicio ? formatarData(v.inicio) : "sem data"} · pedido em {formatarDataHora(v.createdAt)}
                    </span>
                  </span>
                  <Badge variant="outline" className="shrink-0">
                    {ROTULO_SITUACAO_VIAGEM[v.situacao]}
                  </Badge>
                </li>
              ))}
            </Bloco>
          )}
          {h.minhasDiarias.length > 0 && (
            <Bloco icone={HandCoins} titulo="Minhas diárias aguardando" href="/painel/perfil/diarias" vazio="">
              {h.minhasDiarias.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{d.tipoNome ?? "Diária"}{d.quantidade ? ` × ${d.quantidade}` : ""}</span>
                    <span className="text-muted-foreground block text-xs">
                      {d.data_inicio ? formatarData(d.data_inicio) : ""}
                      {d.motivo ? ` · ${d.motivo}` : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm tabular-nums">{d.valor_total !== null ? formatarMoeda(d.valor_total + d.valorDespesas) : "—"}</span>
                </li>
              ))}
            </Bloco>
          )}
        </div>
      )}
    </>
  )
}

function delta(atual: number, anterior: number | null): { texto: string; sinal: -1 | 0 | 1 } | null {
  if (anterior === null || anterior === 0) return null
  const pct = ((atual - anterior) / Math.abs(anterior)) * 100
  const sinal: -1 | 0 | 1 = pct > 0.05 ? 1 : pct < -0.05 ? -1 : 0
  return { texto: `${pct > 0 ? "+" : ""}${pct.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`, sinal }
}

function Atalho({
  icone: Icone,
  titulo,
  valor,
  nota,
  href,
}: {
  icone: React.ComponentType<{ className?: string }>
  titulo: string
  valor: number
  nota: string
  href: string
}) {
  return (
    <Link href={href} className="group block">
      <Card className={valor > 0 ? "border-primary/40 group-hover:border-primary transition-colors" : "group-hover:border-primary/40 transition-colors"}>
        <CardContent className="flex items-center justify-between gap-3 py-4">
          <span className="flex min-w-0 items-center gap-3">
            <Icone className={valor > 0 ? "text-primary size-5 shrink-0" : "text-muted-foreground size-5 shrink-0"} />
            <span className="min-w-0">
              <span className="block text-sm font-medium">{titulo}</span>
              <span className="text-muted-foreground block truncate text-xs">{nota}</span>
            </span>
          </span>
          <span className="text-2xl font-semibold tabular-nums">{valor}</span>
        </CardContent>
      </Card>
    </Link>
  )
}

function Bloco({
  icone: Icone,
  titulo,
  href,
  vazio,
  children,
}: {
  icone: React.ComponentType<{ className?: string }>
  titulo: string
  href: string
  vazio: string
  children: React.ReactNode[]
}) {
  const temItens = Array.isArray(children) ? children.length > 0 : Boolean(children)
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="text-base">{titulo}</CardTitle>
            {!temItens && vazio && <CardDescription className="text-xs">{vazio}</CardDescription>}
          </div>
          <Link href={href} className="text-muted-foreground hover:text-foreground inline-flex min-h-9 items-center gap-1 text-xs">
            <Icone className="size-4" />
            <ArrowRight className="size-3.5" />
          </Link>
        </div>
      </CardHeader>
      {temItens && (
        <CardContent>
          <ul className="divide-y">{children}</ul>
        </CardContent>
      )}
    </Card>
  )
}
