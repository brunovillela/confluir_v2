import type { Metadata } from "next"
import Link from "next/link"
import {
  ArrowRight,
  Award,
  Cake,
  CalendarDays,
  ClipboardList,
  ExternalLink,
  IdCard,
  Newspaper,
  UserRoundX,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { requireSessaoPainel } from "@/lib/auth"
import { contaDoUsuario } from "@/lib/db/caixa"
import { ultimoResumo } from "@/lib/db/comunicacao"
import { obterOrganizacao } from "@/lib/db/organizacao"
import {
  resumoPainel,
  ultimasNoticias,
  type EventoDoDia,
} from "@/lib/db/painel"
import { formatarData, formatarDataHora, formatarMoeda } from "@/lib/formato"
import { podeAcessar } from "@/lib/permissoes"

import { ConsultaFiliacao } from "./consulta-filiacao-widget"
import { ResumoIAPainel } from "./resumo-ia-painel"

export const metadata: Metadata = { title: "Painel — Confluir" }

function saudacao(): string {
  const hora = Number(
    new Intl.DateTimeFormat("pt-BR", {
      hour: "numeric",
      hour12: false,
      timeZone: "America/Sao_Paulo",
    }).format(new Date())
  )
  if (hora < 12) return "Bom dia"
  if (hora < 18) return "Boa tarde"
  return "Boa noite"
}

function horaSaoPaulo(iso: string | null): string {
  if (!iso) return ""
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso))
}

function HorarioEvento({ evento }: { evento: EventoDoDia }) {
  if (evento.dia_todo) return <>dia todo</>
  const inicio = horaSaoPaulo(evento.inicio)
  const termino = horaSaoPaulo(evento.termino)
  if (!inicio) return <>—</>
  return (
    <>
      {inicio}
      {termino && termino !== inicio && <>–{termino}</>}
    </>
  )
}

function GrupoDoDia({
  titulo,
  descricao,
  icone: Icone,
  children,
}: {
  titulo: string
  descricao?: string
  icone: React.ComponentType<{ className?: string }>
  children: React.ReactNode
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">{titulo}</CardTitle>
            {descricao && <CardDescription>{descricao}</CardDescription>}
          </div>
          <Icone className="text-muted-foreground size-4" />
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

export default async function PainelPage() {
  const sessao = await requireSessaoPainel()
  const nome = String(
    sessao.usuario.nome_guerra ?? sessao.usuario.nome_completo ?? ""
  ).split(" ")[0]
  const veAgenda = podeAcessar(sessao.permissoes, "ferramentas_agendas")

  const [resumo, noticias, meuCaixa, org, resumoIA] = await Promise.all([
    resumoPainel(),
    ultimasNoticias(8),
    contaDoUsuario(sessao.usuario.id as string).catch(() => ({
      disponivel: false,
      detalhe: null,
    })),
    obterOrganizacao(),
    ultimoResumo().catch(() => null),
  ])
  const siteUrl = org?.siteUrl ?? null
  const contaCaixa = meuCaixa.detalhe?.conta ?? null
  const aportePendenteCaixa = meuCaixa.detalhe?.extrato.some(
    (m) => m.tipo === "aporte" && m.situacao === "pendente"
  )

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {saudacao()}
          {nome ? `, ${nome}` : ""}
        </h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Hoje é {resumo.hoje} — bom trabalho.
        </p>
      </div>

      {contaCaixa && (
        <Link href="/painel/perfil/caixa" className="group block">
          <Card className="group-hover:border-primary/40 transition-colors">
            <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
              <span className="min-w-0">
                <span className="text-muted-foreground block text-xs">
                  Meu caixa — {contaCaixa.nome}
                </span>
                <span className="block text-2xl font-semibold tabular-nums">
                  {formatarMoeda(contaCaixa.saldo)}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                {aportePendenteCaixa && (
                  <Badge
                    variant="outline"
                    className="border-warning/40 text-warning-fg"
                  >
                    Aporte a confirmar
                  </Badge>
                )}
                {contaCaixa.situacao === "prestacao_pendente" && (
                  <Badge
                    variant="outline"
                    className="border-info/40 text-info-fg"
                  >
                    Prestação em análise
                  </Badge>
                )}
                <ArrowRight className="text-muted-foreground size-4 opacity-0 transition-opacity group-hover:opacity-100" />
              </span>
            </CardContent>
          </Card>
        </Link>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-4">
        {/* Coluna do dia (1/4) — grupos só aparecem com conteúdo */}
        <div className="grid gap-4 lg:col-span-1">
          {resumo.aniversariantes.length > 0 && (
            <GrupoDoDia
              titulo="Aniversariantes de hoje"
              descricao="Funcionários e diretores"
              icone={Cake}
            >
              <ul className="grid gap-2">
                {resumo.aniversariantes.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-center justify-between gap-2 text-sm"
                  >
                    <span className="truncate font-medium">
                      {a.nome ?? "(sem nome)"}
                    </span>
                    <Badge
                      variant="outline"
                      className="text-muted-foreground shrink-0"
                    >
                      {a.vinculo}
                    </Badge>
                  </li>
                ))}
              </ul>
            </GrupoDoDia>
          )}

          {resumo.aniversariosEmprego.length > 0 && (
            <GrupoDoDia
              titulo="Aniversário de emprego"
              descricao="Tempo de casa completado hoje"
              icone={Award}
            >
              <ul className="grid gap-2">
                {resumo.aniversariosEmprego.map((a) => (
                  <li
                    key={a.usuarioId}
                    className="flex items-center justify-between gap-2 text-sm"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">
                        {a.nome ?? "(sem nome)"}
                      </span>
                      {a.cargo && (
                        <span className="text-muted-foreground block truncate text-xs">
                          {a.cargo}
                        </span>
                      )}
                    </span>
                    <Badge
                      variant="outline"
                      className="shrink-0 border-success/40 text-success-fg"
                    >
                      {a.anos} ano{a.anos === 1 ? "" : "s"}
                    </Badge>
                  </li>
                ))}
              </ul>
            </GrupoDoDia>
          )}

          {resumo.ausencias.length > 0 && (
            <GrupoDoDia
              titulo="Ausências de hoje"
              descricao="Ausentes e previsão de retorno"
              icone={UserRoundX}
            >
              <ul className="grid gap-2">
                {resumo.ausencias.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-center justify-between gap-2 text-sm"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">
                        {a.nome ?? "(sem nome)"}
                      </span>
                      <span className="text-muted-foreground block truncate text-xs">
                        {a.motivo ?? "Ausência"}
                      </span>
                    </span>
                    <span className="text-muted-foreground shrink-0 text-xs">
                      {a.termino ? <>até {formatarData(a.termino)}</> : "hoje"}
                    </span>
                  </li>
                ))}
              </ul>
            </GrupoDoDia>
          )}

          {veAgenda && resumo.agenda.length > 0 && (
            <GrupoDoDia
              titulo="Agenda do dia"
              descricao="Eventos e atividades de hoje"
              icone={CalendarDays}
            >
              <ul className="grid gap-2.5">
                {resumo.agenda.map((e) => (
                  <li key={e.id} className="grid gap-0.5 text-sm">
                    <span className="text-muted-foreground text-xs tabular-nums">
                      <HorarioEvento evento={e} />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-medium">
                        {(e.atividade ?? "(sem título)").trim()}
                      </span>
                      {(e.local || e.tipo) && (
                        <span className="text-muted-foreground block truncate text-xs">
                          {[e.local, e.tipo].filter(Boolean).join(" · ")}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </GrupoDoDia>
          )}

          {resumo.tarefas.length > 0 && (
            <GrupoDoDia
              titulo="Tarefas pendentes"
              descricao="Demandas em aberto"
              icone={ClipboardList}
            >
              <ul className="grid gap-2">
                {resumo.tarefas.map((t) => (
                  <li key={t.id} className="grid gap-0.5 text-sm">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium">
                        {t.nome ?? "(sem título)"}
                      </span>
                      <Badge
                        variant="outline"
                        className="text-muted-foreground shrink-0"
                      >
                        {t.situacao ?? "A fazer"}
                      </Badge>
                    </span>
                    <span className="text-muted-foreground block truncate text-xs">
                      {[
                        t.descricao,
                        t.responsavel,
                        t.prazo && `prazo ${formatarData(t.prazo)}`,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </span>
                  </li>
                ))}
              </ul>
            </GrupoDoDia>
          )}

          <GrupoDoDia
            titulo="Consulta de filiação"
            descricao="Informa só a condição — não abre o cadastro"
            icone={IdCard}
          >
            <ConsultaFiliacao />
          </GrupoDoDia>
        </div>

        {/* Resumo do dia — últimas notícias (3/4) */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Resumo do dia</CardTitle>
                <CardDescription>
                  Últimas notícias do Sindipetro-NF — clique na manchete para
                  ler
                </CardDescription>
              </div>
              <Newspaper className="text-muted-foreground size-4" />
            </div>
          </CardHeader>
          <CardContent>
            {resumoIA?.resumo && (
              <ResumoIAPainel
                titulo={resumoIA.titulo ?? "Resumo de notícias"}
                resumo={resumoIA.resumo}
                atualizado={formatarDataHora(resumoIA.created_at)}
              />
            )}
            {noticias.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Nenhuma notícia disponível agora
                {siteUrl ? (
                  <>
                    {" "}
                    —{" "}
                    <a
                      href={siteUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="underline underline-offset-2"
                    >
                      abrir o site
                    </a>
                  </>
                ) : null}
                .
              </p>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2">
                {noticias.map((n) => {
                  const conteudo = (
                    <span className="flex h-full items-start justify-between gap-2">
                      <span className="min-w-0">
                        <span className="block font-medium text-balance">
                          {n.titulo}
                        </span>
                        {n.data && (
                          <span className="text-muted-foreground text-xs">
                            {n.data}
                          </span>
                        )}
                      </span>
                      {n.url && (
                        <ExternalLink className="text-muted-foreground mt-1 size-3.5 shrink-0" />
                      )}
                    </span>
                  )
                  return (
                    <li key={n.id ?? n.url}>
                      {n.id ? (
                        <Link
                          href={`/painel/comunicacao/noticias/${n.id}`}
                          className="hover:bg-muted/60 hover:border-primary/40 block h-full rounded-lg border px-4 py-3 text-sm transition-colors"
                        >
                          {conteudo}
                        </Link>
                      ) : (
                        <a
                          href={n.url ?? "#"}
                          target="_blank"
                          rel="noreferrer"
                          className="hover:bg-muted/60 hover:border-primary/40 block h-full rounded-lg border px-4 py-3 text-sm transition-colors"
                        >
                          {conteudo}
                        </a>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  )
}
