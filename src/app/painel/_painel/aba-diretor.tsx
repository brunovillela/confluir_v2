import Link from "next/link"
import { CalendarDays, CheckCheck, FileSignature, HandCoins, Handshake, Plane, Receipt, UsersRound, Vote } from "lucide-react"

import { compacto } from "@/components/graficos/base"
import { CartaoHud, KpiHud, ListaHud } from "@/components/painel/hud"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { SessaoPainel } from "@/lib/auth"
import { homeDiretor } from "@/lib/db/diretor-home"
import { formatarData, formatarDataHora, formatarMoeda } from "@/lib/formato"
import { ROTULO_SITUACAO_NEGOCIACAO } from "@/lib/negociacoes-constantes"
import { ROTULO_SITUACAO_VIAGEM } from "@/lib/viagens-constantes"

import { deltaPct } from "./util"

function horaSP(iso: string | null): string {
  if (!iso) return ""
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(new Date(iso))
}

function diaSP(iso: string | null): string {
  if (!iso) return ""
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "short", day: "2-digit", month: "2-digit" }).format(new Date(iso))
}

/**
 * DIRETOR — o que espera a decisão da pessoa, a semana da entidade
 * (agenda, votações, negociações), os números (financeiros só com permissão
 * do Financeiro) e os pedidos dela. Antes era /painel/diretor.
 */
export async function AbaDiretor({ sessao }: { sessao: SessaoPainel }) {
  const h = await homeDiretor(sessao)
  const decisoes = h.ordens.length + h.assinaturas.length + h.diarias.length
  const kpis = h.kpis

  return (
    <div className="grid gap-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiHud
          rotulo="Ordens na sua alçada"
          valor={String(h.ordens.length)}
          nota={h.alcada > 0 ? `alçada ${formatarMoeda(h.alcada)}${h.ordensAcima ? ` · ${h.ordensAcima} acima` : ""}` : "sem alçada de aprovação"}
          href="/painel/aprovar"
          destaque={h.ordens.length > 0}
        />
        <KpiHud
          rotulo="Documentos para assinar"
          valor={String(h.assinaturas.length)}
          nota="ofícios, termos e contratos"
          href="/painel/aprovar"
          destaque={h.assinaturas.length > 0}
        />
        <KpiHud
          rotulo="Diárias aguardando"
          valor={String(h.diarias.length)}
          nota={h.podeDiariasDiretoria ? "da diretoria" : h.podeDiariasQuadro ? "do quadro" : "sem permissão para avaliar"}
          href="/painel/aprovar"
          destaque={h.diarias.length > 0}
        />
        <Link href="/painel/aprovar" className="hud-cartao flex flex-col justify-between gap-2 p-3.5">
          <p className="hud-rotulo">Decidir pelo celular</p>
          <Button size="sm" className="pointer-events-none w-full" tabIndex={-1}>
            <CheckCheck />
            Aprovar{decisoes > 0 ? ` (${decisoes})` : ""}
          </Button>
        </Link>
      </div>

      {h.coordenados.length > 0 && (
        <Link href="/painel?aba=coordenacao" className="hud-cartao flex items-center gap-3 p-3.5">
          <UsersRound className="text-primary size-5 shrink-0" />
          <span className="min-w-0 text-sm">
            <span className="block font-medium">Coordenação — {h.coordenados.map((d) => d.nome).join(", ")}</span>
            <span className="text-muted-foreground block text-xs">Pedidos da equipe, compras e ordens, orçado × realizado e contratos — na aba Coordenação</span>
          </span>
        </Link>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <CartaoHud titulo="Agenda da semana" icone={CalendarDays} href="/painel/ferramentas/agenda">
          <ListaHud vazio="Nada marcado nos próximos 7 dias.">
            {h.agenda.map((c) => (
              <li key={c.id} className="flex items-start justify-between gap-3 py-2 text-sm first:pt-0 last:pb-0">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{c.atividade ?? "(sem título)"}</span>
                  {c.local && <span className="text-muted-foreground block truncate text-xs">{c.local}</span>}
                </span>
                <span className="hud-numero text-muted-foreground shrink-0 text-right text-xs">
                  {diaSP(c.inicio)}
                  <br />
                  {c.diaTodo ? "dia todo" : horaSP(c.inicio)}
                </span>
              </li>
            ))}
          </ListaHud>
        </CartaoHud>
        <CartaoHud titulo="Votações" icone={Vote} href="/painel/representacao/votacoes">
          <ListaHud vazio="Nenhuma votação aberta ou marcada.">
            {h.votacoes.map((v) => (
              <li key={v.id} className="py-2 text-sm first:pt-0 last:pb-0">
                <span className="block font-medium">{v.nome ?? "(sem nome)"}</span>
                <span className="text-muted-foreground block text-xs">
                  {v.campanha ? `${v.campanha} · ` : ""}
                  {v.inicio ? formatarData(v.inicio) : "?"} a {v.termino ? formatarData(v.termino) : "?"}
                </span>
              </li>
            ))}
          </ListaHud>
        </CartaoHud>
        <CartaoHud titulo="Negociações em curso" icone={Handshake} href="/painel/representacao/negociacoes">
          <ListaHud vazio="Nenhuma negociação em andamento.">
            {h.negociacoes.map((n) => (
              <li key={n.id} className="flex items-center justify-between gap-3 py-2 text-sm first:pt-0 last:pb-0">
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
          </ListaHud>
        </CartaoHud>
      </div>

      {kpis && (kpis.filiacao || kpis.financeiro || kpis.arrecadacao) && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {kpis.filiacao && (
            <KpiHud
              rotulo="Filiados ativos"
              valor={kpis.filiacao.ativosHoje.toLocaleString("pt-BR")}
              delta={deltaPct(kpis.filiacao.ativosHoje, kpis.filiacao.ativosHa12Meses)}
              deltaRotulo="em 12 meses"
              sparkline={kpis.filiacao.ativosSerie}
              href="/painel?aba=indicadores"
            />
          )}
          {kpis.arrecadacao && (
            <KpiHud
              rotulo={`Arrecadação${kpis.arrecadacao.ultimoMes ? ` · ${kpis.arrecadacao.ultimoMes.slice(5, 7)}/${kpis.arrecadacao.ultimoMes.slice(0, 4)}` : ""}`}
              valor={compacto(kpis.arrecadacao.valorUltimoMes, true)}
              delta={deltaPct(kpis.arrecadacao.valorUltimoMes, kpis.arrecadacao.valorMesAnterior)}
              deltaRotulo="vs. mês anterior"
              href="/painel?aba=indicadores"
            />
          )}
          {kpis.financeiro && (
            <KpiHud
              rotulo="Saldo em caixa"
              valor={kpis.financeiro.saldoCaixa === null ? "—" : compacto(kpis.financeiro.saldoCaixa, true)}
              nota={`a pagar em 30 dias: ${compacto(kpis.financeiro.aPagar30d.valor, true)}`}
              href="/painel/financeiro/gerencial"
            />
          )}
          {kpis.financeiro && (
            <KpiHud
              rotulo="Ordens vencidas"
              valor={String(kpis.financeiro.vencidas.quantidade)}
              nota={kpis.financeiro.vencidas.quantidade ? compacto(kpis.financeiro.vencidas.valor, true) : "nenhuma"}
              href="/painel/financeiro/ordens"
              alerta={kpis.financeiro.vencidas.quantidade > 0}
            />
          )}
        </div>
      )}

      {(h.minhasViagens.length > 0 || h.minhasDiarias.length > 0) && (
        <div className="grid gap-4 lg:grid-cols-2">
          {h.minhasViagens.length > 0 && (
            <CartaoHud titulo="Minhas viagens em andamento" icone={Plane} href="/painel/perfil/viagens">
              <ListaHud vazio="">
                {h.minhasViagens.map((v) => (
                  <li key={v.id} className="flex items-center justify-between gap-3 py-2 text-sm first:pt-0 last:pb-0">
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
              </ListaHud>
            </CartaoHud>
          )}
          {h.minhasDiarias.length > 0 && (
            <CartaoHud titulo="Minhas diárias aguardando" icone={HandCoins} href="/painel/perfil/diarias">
              <ListaHud vazio="">
                {h.minhasDiarias.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-3 py-2 text-sm first:pt-0 last:pb-0">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">
                        {d.tipoNome ?? "Diária"}
                        {d.quantidade ? ` × ${d.quantidade}` : ""}
                      </span>
                      <span className="text-muted-foreground block text-xs">
                        {d.data_inicio ? formatarData(d.data_inicio) : ""}
                        {d.motivo ? ` · ${d.motivo}` : ""}
                      </span>
                    </span>
                    <span className="hud-numero shrink-0 text-sm">
                      {d.valor_total !== null ? formatarMoeda(d.valor_total + d.valorDespesas) : "—"}
                    </span>
                  </li>
                ))}
              </ListaHud>
            </CartaoHud>
          )}
        </div>
      )}

      <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
        <Receipt className="size-3.5" />
        <FileSignature className="size-3.5" />
        Ordens, assinaturas e diárias também ficam na sua caixa de entrada, no topo do painel.
      </p>
    </div>
  )
}
