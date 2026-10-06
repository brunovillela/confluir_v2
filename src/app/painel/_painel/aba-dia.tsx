import Link from "next/link"
import { Award, Cake, CalendarDays, ClipboardList, ExternalLink, IdCard, Newspaper, UserRoundX, Wallet } from "lucide-react"

import { Carrossel } from "@/components/painel/carrossel"
import { CartaoHud, ListaHud } from "@/components/painel/hud"
import { Badge } from "@/components/ui/badge"
import type { SessaoPainel } from "@/lib/auth"
import { contaDoUsuario } from "@/lib/db/caixa"
import { ultimoResumo } from "@/lib/db/comunicacao"
import { obterOrganizacao } from "@/lib/db/organizacao"
import { resumoPainel, ultimasNoticias, type EventoDoDia } from "@/lib/db/painel"
import { buscarCondutorDoUsuario } from "@/lib/db/veiculos"
import { formatarData, formatarDataHora, formatarMoeda } from "@/lib/formato"
import { podeAcessar } from "@/lib/permissoes"

import { ConsultaFiliacao } from "../consulta-filiacao-widget"
import { MeusVeiculos } from "../meus-veiculos"
import { ResumoIAPainel } from "../resumo-ia-painel"

function horaSaoPaulo(iso: string | null): string {
  if (!iso) return ""
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(new Date(iso))
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

/**
 * MEU DIA — a aba de todo mundo: o caixa da pessoa, os veículos, quem faz
 * aniversário, quem está ausente, a agenda e as tarefas do dia, a consulta de
 * filiação e as notícias em slides. Cartões só aparecem com conteúdo.
 */
export async function AbaDia({ sessao }: { sessao: SessaoPainel }) {
  const uid = sessao.usuario.id as string
  const veAgenda = podeAcessar(sessao.permissoes, "ferramentas_agendas")
  const [resumo, noticias, meuCaixa, org, resumoIA, condutor] = await Promise.all([
    resumoPainel(uid),
    ultimasNoticias(9),
    contaDoUsuario(uid).catch(() => ({ disponivel: false, detalhe: null })),
    obterOrganizacao(),
    ultimoResumo().catch(() => null),
    buscarCondutorDoUsuario(uid).catch(() => null),
  ])
  const siteUrl = org?.siteUrl ?? null
  const contaCaixa = meuCaixa.detalhe?.conta ?? null
  const aportePendente = meuCaixa.detalhe?.extrato.some((m) => m.tipo === "aporte" && m.situacao === "pendente")

  return (
    <div className="grid gap-4">
      <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
        {contaCaixa && (
          <Link href="/painel/perfil/caixa" className="hud-cartao block p-4">
            <p className="hud-rotulo flex items-center gap-1.5">
              <Wallet className="text-primary size-3.5" />
              Meu caixa — {contaCaixa.nome}
            </p>
            <p className="hud-numero hud-numero-destaque mt-2 text-3xl font-semibold">{formatarMoeda(contaCaixa.saldo)}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {aportePendente && (
                <Badge variant="outline" className="border-warning/40 text-warning-fg">
                  Aporte a confirmar
                </Badge>
              )}
              {contaCaixa.situacao === "prestacao_pendente" && (
                <Badge variant="outline" className="border-info/40 text-info-fg">
                  Prestação em análise
                </Badge>
              )}
            </div>
          </Link>
        )}

        <MeusVeiculos usuarioId={uid} condutor={condutor} />

        {veAgenda && resumo.agenda.length > 0 && (
          <CartaoHud titulo="Agenda do dia" icone={CalendarDays} href="/painel/ferramentas/agenda">
            <ListaHud vazio="">
              {resumo.agenda.map((e) => (
                <li key={e.id} className="grid gap-0.5 py-2 text-sm first:pt-0 last:pb-0">
                  <span className="hud-numero text-primary text-xs">
                    <HorarioEvento evento={e} />
                  </span>
                  <span className="truncate font-medium">{(e.atividade ?? "(sem título)").trim()}</span>
                  {(e.local || e.tipo) && (
                    <span className="text-muted-foreground truncate text-xs">{[e.local, e.tipo].filter(Boolean).join(" · ")}</span>
                  )}
                  {e.empresas && e.empresas.length > 0 && (
                    <span className="mt-1 flex flex-wrap gap-1">
                      {e.empresas.map((nome) => (
                        <Badge key={nome} variant="outline" className="text-xs">
                          {nome}
                        </Badge>
                      ))}
                    </span>
                  )}
                </li>
              ))}
            </ListaHud>
          </CartaoHud>
        )}

        {resumo.tarefas.length > 0 && (
          <CartaoHud titulo="Tarefas pendentes" descricao="Demandas em aberto" icone={ClipboardList}>
            <ListaHud vazio="">
              {resumo.tarefas.map((t) => (
                <li key={t.id} className="grid gap-0.5 py-2 text-sm first:pt-0 last:pb-0">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium">{t.nome ?? "(sem título)"}</span>
                    <Badge variant="outline" className="text-muted-foreground shrink-0">
                      {t.situacao ?? "A fazer"}
                    </Badge>
                  </span>
                  <span className="text-muted-foreground truncate text-xs">
                    {[t.descricao, t.responsavel, t.prazo && `prazo ${formatarData(t.prazo)}`].filter(Boolean).join(" · ") || "—"}
                  </span>
                </li>
              ))}
            </ListaHud>
          </CartaoHud>
        )}

        {resumo.ausencias.length > 0 && (
          <CartaoHud titulo="Ausências de hoje" descricao="Ausentes e previsão de retorno" icone={UserRoundX}>
            <ListaHud vazio="">
              {resumo.ausencias.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-2 py-2 text-sm first:pt-0 last:pb-0">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{a.nome ?? "(sem nome)"}</span>
                    <span className="text-muted-foreground block truncate text-xs">{a.tipo}</span>
                  </span>
                  <span className="text-muted-foreground shrink-0 text-right text-xs">
                    {a.retorno ? <>volta em {formatarData(a.retorno)}</> : a.termino ? <>até {formatarData(a.termino)}</> : "sem retorno previsto"}
                  </span>
                </li>
              ))}
            </ListaHud>
          </CartaoHud>
        )}

        {(resumo.aniversariantes.length > 0 || resumo.aniversariosEmprego.length > 0) && (
          <CartaoHud titulo="Comemorações de hoje" descricao="Aniversários e tempo de casa" icone={Cake}>
            <ListaHud vazio="">
              {[
                ...resumo.aniversariantes.map((a) => (
                  <li key={`a-${a.id}`} className="flex items-center justify-between gap-2 py-2 text-sm first:pt-0 last:pb-0">
                    <span className="flex min-w-0 items-center gap-2">
                      <Cake className="text-primary size-3.5 shrink-0" />
                      <span className="truncate font-medium">{a.nome ?? "(sem nome)"}</span>
                    </span>
                    <Badge variant="outline" className="text-muted-foreground shrink-0">
                      {a.vinculo}
                    </Badge>
                  </li>
                )),
                ...resumo.aniversariosEmprego.map((a) => (
                  <li key={`e-${a.usuarioId}`} className="flex items-center justify-between gap-2 py-2 text-sm first:pt-0 last:pb-0">
                    <span className="flex min-w-0 items-center gap-2">
                      <Award className="text-primary size-3.5 shrink-0" />
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{a.nome ?? "(sem nome)"}</span>
                        {a.cargo && <span className="text-muted-foreground block truncate text-xs">{a.cargo}</span>}
                      </span>
                    </span>
                    <Badge variant="outline" className="border-success/40 text-success-fg shrink-0">
                      {a.anos} ano{a.anos === 1 ? "" : "s"} de casa
                    </Badge>
                  </li>
                )),
              ]}
            </ListaHud>
          </CartaoHud>
        )}

        <CartaoHud titulo="Consulta de filiação" descricao="Informa só a condição — não abre o cadastro" icone={IdCard}>
          <ConsultaFiliacao />
        </CartaoHud>
      </div>

      <CartaoHud titulo="Resumo do dia" descricao="Últimas notícias — clique na manchete para ler" icone={Newspaper}>
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
                {" "}—{" "}
                <a href={siteUrl} target="_blank" rel="noreferrer" className="underline underline-offset-2">
                  abrir o site
                </a>
              </>
            ) : null}
            .
          </p>
        ) : (
          <Carrossel colunas={3} rotulo="Notícias">
            {noticias.map((n) => {
              const conteudo = (
                <span className="flex h-full flex-col justify-between gap-2">
                  <span className="font-medium text-balance">{n.titulo}</span>
                  <span className="text-muted-foreground flex items-center justify-between gap-2 text-xs">
                    <span className="hud-numero">{n.data ?? ""}</span>
                    {n.url && !n.id && <ExternalLink className="size-3.5 shrink-0" />}
                  </span>
                </span>
              )
              const classe = "hud-cartao block h-full min-h-28 p-4 text-sm"
              return n.id ? (
                <Link key={n.id} href={`/painel/comunicacao/noticias/${n.id}`} className={classe}>
                  {conteudo}
                </Link>
              ) : (
                <a key={n.url} href={n.url ?? "#"} target="_blank" rel="noreferrer" className={classe}>
                  {conteudo}
                </a>
              )
            })}
          </Carrossel>
        )}
      </CartaoHud>
    </div>
  )
}
