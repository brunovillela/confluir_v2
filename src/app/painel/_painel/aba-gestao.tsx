import Link from "next/link"
import { CalendarDays, CheckCheck, Handshake, UsersRound, Vote } from "lucide-react"

import { CartaoHud, KpiHud, ListaHud } from "@/components/painel/hud"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { SessaoPainel } from "@/lib/auth"
import { gestaoDoUsuario, temDecisoes } from "@/lib/db/diretor-home"
import { agruparPorRemessa } from "@/lib/db/diarias"
import { formatarData, formatarMoeda } from "@/lib/formato"
import { ROTULO_SITUACAO_NEGOCIACAO } from "@/lib/negociacoes-constantes"

import { AbaIndicadores, type VistaIndicadores } from "./aba-indicadores"

function horaSP(iso: string | null): string {
  if (!iso) return ""
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(new Date(iso))
}

function diaSP(iso: string | null): string {
  if (!iso) return ""
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "short", day: "2-digit", month: "2-digit" }).format(new Date(iso))
}

/**
 * GESTÃO — uma aba só para diretoria e gestão (06/10/2026: uniu "Diretor" e
 * "Indicadores"). O conteúdo muda conforme a função:
 *   • decisões (ordens na alçada, assinaturas, diárias) — para quem decide;
 *   • a semana da entidade (agenda, votações, negociações) — só para quem é
 *     do mandato vigente;
 *   • indicadores (visão geral, churn, custos) — conforme as permissões de
 *     cada bloco.
 */
export async function AbaGestao({
  sessao,
  veIndicadores,
  vista,
  atualizado,
  erro,
}: {
  sessao: SessaoPainel
  veIndicadores: boolean
  vista: VistaIndicadores
  atualizado?: string
  erro?: string
}) {
  const h = await gestaoDoUsuario(sessao)
  const decide = temDecisoes(sessao) || h.assinaturas.length > 0
  // 08/10: diárias em remessa contam por remessa (a decisão é dela).
  const grupos = agruparPorRemessa(h.diarias)
  const diariasADecidir = grupos.remessas.length + grupos.avulsas.length
  const decisoes = h.ordens.length + h.assinaturas.length + diariasADecidir
  const nome = String(sessao.usuario.nome_guerra ?? sessao.usuario.nome_completo ?? "").split(" ")[0]

  return (
    <div className="grid gap-4">
      {h.diretoria && (
        <p className="text-muted-foreground text-xs">
          {nome}, {[h.diretoria.cargo, h.diretoria.grupoNome].filter(Boolean).join(" · ")}
          {h.diretoria.mandatoNome ? ` — ${h.diretoria.mandatoNome}` : ""}
        </p>
      )}

      {decide && (
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
            rotulo="Remessas de diárias"
            valor={String(diariasADecidir)}
            nota={h.podeDiariasDiretoria && h.podeDiariasQuadro ? "diretoria e quadro" : h.podeDiariasDiretoria ? "da diretoria" : h.podeDiariasQuadro ? "do quadro" : "sem permissão para avaliar"}
            href="/painel/aprovar"
            destaque={diariasADecidir > 0}
          />
          <Link href="/painel/aprovar" className="hud-cartao flex flex-col justify-between gap-2 p-3.5">
            <p className="hud-rotulo">Decidir pelo celular</p>
            <Button size="sm" className="pointer-events-none w-full" tabIndex={-1}>
              <CheckCheck />
              Aprovar{decisoes > 0 ? ` (${decisoes})` : ""}
            </Button>
          </Link>
        </div>
      )}

      {h.coordenados.length > 0 && (
        <Link href="/painel?aba=coordenacao" className="hud-cartao flex items-center gap-3 p-3.5">
          <UsersRound className="text-primary size-5 shrink-0" />
          <span className="min-w-0 text-sm">
            <span className="block font-medium">Coordenação — {h.coordenados.map((d) => d.nome).join(", ")}</span>
            <span className="text-muted-foreground block text-xs">Pedidos da equipe, ordens, orçado × realizado e contratos — na aba Coordenação</span>
          </span>
        </Link>
      )}

      {h.diretoria && (
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
      )}

      {veIndicadores && <AbaIndicadores sessao={sessao} vista={vista} atualizado={atualizado} erro={erro} />}

      {!decide && !h.diretoria && !veIndicadores && h.coordenados.length === 0 && (
        <p className="text-muted-foreground text-sm">Nada de gestão para o seu perfil.</p>
      )}
    </div>
  )
}
