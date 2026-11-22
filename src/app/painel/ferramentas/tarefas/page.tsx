import type { Metadata } from "next"
import Link from "next/link"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { CalendarDays, Columns3, Gauge, List, ListChecks, TriangleAlert } from "lucide-react"

import { AbasVisao } from "@/components/abas-visao"
import { requirePermissao } from "@/lib/auth"
import { hojeSP } from "@/lib/db/comum"
import { listarDemandas, listarPessoasAtribuiveis, listarTarefas, type TarefaLinha } from "@/lib/db/nucleo"
import { marcosNoPeriodo } from "@/lib/db/projetos"
import { tarefaDaConversa } from "@/lib/db/tarefa-conversa"
import { somarDias } from "@/lib/deliberacoes-constantes"
import { cargaPorPessoa, DIAS_FEITO_NO_QUADRO, semanasDoMes } from "@/lib/nucleo-constantes"
import { podeAcessar } from "@/lib/permissoes"

import { CalendarioPrazos, type ItemCalendario } from "./calendario-prazos"
import { CargaTrabalho } from "./carga-trabalho"
import { ConversaTarefa } from "./conversa-tarefa"
import { QuadroTarefas } from "./quadro-tarefas"
import { AdicionarTarefa } from "./tarefa-forms"
import { TarefasLista } from "./tarefas-lista"

export const metadata: Metadata = { title: "Tarefas — Confluir" }

const SELECT_FILTRO =
  "border-input bg-background text-foreground h-9 max-w-52 truncate rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

type Params = {
  busca?: string
  status?: string
  minhas?: string
  responsavel?: string
  conversa?: string
  visao?: string
  mes?: string
}

const VISOES = ["lista", "quadro", "calendario", "carga"] as const
type Visao = (typeof VISOES)[number]

/** Atrasadas agrupadas por responsável, da pessoa com mais para a com menos. */
function atrasadasPorPessoa(tarefas: TarefaLinha[]): { id: string | null; nome: string; quantidade: number }[] {
  const mapa = new Map<string, { id: string | null; nome: string; quantidade: number }>()
  for (const t of tarefas) {
    const chave = t.demandadoId ?? ""
    const atual = mapa.get(chave) ?? { id: t.demandadoId, nome: t.demandadoNome ?? "Sem responsável", quantidade: 0 }
    atual.quantidade += 1
    mapa.set(chave, atual)
  }
  return [...mapa.values()].sort((a, b) => b.quantidade - a.quantidade || a.nome.localeCompare(b.nome, "pt-BR"))
}

export default async function TarefasPage({
  searchParams,
}: {
  searchParams: Promise<Params>
}) {
  // Quem só é responsável (sem a permissão de Tarefas) usa Meu perfil →
  // Minhas tarefas (/painel/perfil/tarefas).
  const sessao = await requirePermissao("ferramentas_tarefas", ["ferramentas_demandas"])
  const veAnomalias = podeAcessar(sessao.permissoes, "ferramentas_anomalias")
  const veProjetos = podeAcessar(sessao.permissoes, "ferramentas_projetos", ["ferramentas_projetos_edicao"])
  const eu = String(sessao.usuario.id)
  const hoje = hojeSP()

  const brutos = await searchParams
  const busca = (brutos.busca ?? "").trim()
  const status =
    brutos.status === "concluidas" ||
    brutos.status === "atrasadas" ||
    brutos.status === "todas"
      ? brutos.status
      : "pendentes"
  // "Minhas": as tarefas de que sou o responsável (o link dos avisos).
  const minhas = brutos.minhas === "1"
  const responsavel = minhas ? eu : (brutos.responsavel ?? "").trim() || undefined
  const visao: Visao = (VISOES as readonly string[]).includes(brutos.visao ?? "") ? (brutos.visao as Visao) : "lista"
  const mes = /^\d{4}-\d{2}$/.test(brutos.mes ?? "") ? (brutos.mes as string) : hoje.slice(0, 7)
  const semanas = semanasDoMes(mes)
  const periodo = { de: semanas[0][0], ate: semanas.at(-1)!.at(-1)! }

  // Cada visão lê o que precisa: a lista segue o filtro de situação; o
  // quadro e o calendário olham todas (o quadro só as concluídas recentes);
  // a carga olha as abertas de todos.
  const statusDaVisao = visao === "lista" ? status : visao === "carga" ? "pendentes" : "todas"
  const [{ disponivel, tarefas: todas }, pessoas, atrasadasGerais, tarefaDoAviso, marcos, demandas] = await Promise.all([
    listarTarefas({ busca, status: statusDaVisao, demandadoId: visao === "carga" ? undefined : responsavel }),
    listarPessoasAtribuiveis(),
    // O quadro de atrasadas por pessoa: quem acompanha a equipe (lista geral).
    minhas || visao !== "lista" ? Promise.resolve(null) : listarTarefas({ status: "atrasadas" }),
    brutos.conversa ? tarefaDaConversa(brutos.conversa, { id: eu, permissoes: sessao.permissoes }) : Promise.resolve(null),
    visao === "calendario" && veProjetos && !responsavel ? marcosNoPeriodo(periodo.de, periodo.ate) : Promise.resolve([]),
    visao === "calendario" && !responsavel ? listarDemandas({ situacao: "abertas" }) : Promise.resolve([]),
  ])
  // Tarefa de anomalia qualquer um executa; o CONTEÚDO da anomalia (nome e
  // link) só vai para quem tem a permissão de Anomalias — nem chega ao cliente.
  const tarefas = veAnomalias
    ? todas
    : todas.map((t) => (t.paiTipo === "anomalia" ? { ...t, paiId: null, paiNome: null } : t))
  const porPessoa = atrasadasGerais?.disponivel ? atrasadasPorPessoa(atrasadasGerais.tarefas) : []

  const limiteFeito = somarDias(hoje, -DIAS_FEITO_NO_QUADRO)
  const doQuadro = tarefas.filter((t) => !t.concluido || (t.concluidaEm ?? "") >= limiteFeito)
  const doCalendario: ItemCalendario[] =
    visao === "calendario"
      ? [
          ...tarefas
            .filter((t) => t.prazo && t.prazo >= periodo.de && t.prazo <= periodo.ate)
            .map((t) => ({
              id: t.id,
              data: t.prazo as string,
              tipo: "tarefa" as const,
              titulo: t.titulo ?? "(sem título)",
              detalhe: t.demandadoNome,
              href: t.paiTipo === "demanda" && t.paiId ? `/painel/ferramentas/demandas/${t.paiId}` : t.paiTipo === "projeto" && t.paiId ? `/painel/ferramentas/projetos/${t.paiId}` : null,
              concluido: t.concluido,
              atrasado: t.situacao === "atrasada",
            })),
          ...marcos
            .filter((m) => !m.projetoFinalizado)
            .map((m) => ({
              id: m.id,
              data: m.dataPrevista,
              tipo: "marco" as const,
              titulo: m.titulo,
              detalhe: m.projetoTitulo,
              href: `/painel/ferramentas/projetos/${m.projetoId}`,
              concluido: Boolean(m.concluidoEm),
              atrasado: !m.concluidoEm && m.dataPrevista < hoje,
            })),
          ...demandas
            .filter((d) => d.prazo && d.prazo >= periodo.de && d.prazo <= periodo.ate)
            .map((d) => ({
              id: d.id,
              data: d.prazo as string,
              tipo: "demanda" as const,
              titulo: d.nome ?? "(sem nome)",
              detalhe: d.responsavelNome,
              href: `/painel/ferramentas/demandas/${d.id}`,
              concluido: false,
              atrasado: (d.prazo as string) < hoje,
            })),
        ]
      : []

  // Os links das abas e do mês levam os filtros junto.
  const comFiltros = (extra: Record<string, string>) => {
    const p = new URLSearchParams()
    if (busca) p.set("busca", busca)
    if (minhas) p.set("minhas", "1")
    else if (responsavel) p.set("responsavel", responsavel)
    for (const [k, v] of Object.entries(extra)) if (v) p.set(k, v)
    const q = p.toString()
    return `/painel/ferramentas/tarefas${q ? `?${q}` : ""}`
  }

  return (
    <>
      {tarefaDoAviso && (
        <ConversaTarefa tarefaId={tarefaDoAviso.id} titulo={tarefaDoAviso.titulo} abertaDeInicio semBotao />
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tarefas</h1>
          <p className="text-muted-foreground mt-1 text-xs">
            Tarefas de demandas, projetos e anomalias — ou avulsas
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/painel/ferramentas/demandas">
              <ListChecks />
              Demandas
            </Link>
          </Button>
          {veAnomalias && (
            <Button variant="outline" size="sm" asChild>
              <Link href="/painel/ferramentas/anomalias">
                <TriangleAlert />
                Anomalias
              </Link>
            </Button>
          )}
        </div>
      </div>

      {!disponivel && (
        <Alert variant="warning">
          <AlertDescription>
            As tarefas usam colunas novas — rode{" "}
            <code>supabase/nucleo-ferramentas.sql</code> no SQL Editor do Supabase
            para habilitá-las.
          </AlertDescription>
        </Alert>
      )}

      <AbasVisao
        atual={visao}
        abas={[
          { id: "lista", rotulo: "Lista", icone: List, href: comFiltros({ status: status === "pendentes" ? "" : status }) },
          { id: "quadro", rotulo: "Quadro", icone: Columns3, href: comFiltros({ visao: "quadro" }) },
          { id: "calendario", rotulo: "Calendário", icone: CalendarDays, href: comFiltros({ visao: "calendario" }) },
          { id: "carga", rotulo: "Carga por pessoa", icone: Gauge, href: comFiltros({ visao: "carga" }) },
        ]}
      />

      {disponivel && (visao === "lista" || visao === "quadro") && (
        <Card>
          <CardContent>
            <p className="mb-3 text-sm font-medium">Nova tarefa avulsa</p>
            <AdicionarTarefa pessoas={pessoas} />
          </CardContent>
        </Card>
      )}

      {porPessoa.length > 0 && (
        <Card>
          <CardContent>
            <p className="mb-3 text-sm font-medium">
              Atrasadas por responsável{" "}
              <span className="text-muted-foreground font-normal">
                ({porPessoa.reduce((s, p) => s + p.quantidade, 0)})
              </span>
            </p>
            <ul className="flex flex-wrap gap-2">
              {porPessoa.map((p) => (
                <li key={p.id ?? "sem"}>
                  {p.id ? (
                    <Link
                      href={`/painel/ferramentas/tarefas?status=atrasadas&responsavel=${p.id}`}
                      className="hover:bg-muted inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm"
                    >
                      {p.nome}
                      <span className="text-destructive font-semibold tabular-nums">{p.quantidade}</span>
                    </Link>
                  ) : (
                    <span className="text-muted-foreground inline-flex items-center gap-2 rounded-md border border-dashed px-3 py-1.5 text-sm">
                      {p.nome}
                      <span className="font-semibold tabular-nums">{p.quantidade}</span>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {visao !== "carga" && (
      <form
        className="flex flex-wrap items-center gap-2"
        action="/painel/ferramentas/tarefas"
      >
        {visao !== "lista" && <input type="hidden" name="visao" value={visao} />}
        {visao === "calendario" && <input type="hidden" name="mes" value={mes} />}
        <input
          type="search"
          name="busca"
          defaultValue={busca}
          placeholder="Descrição da tarefa"
          className={`${SELECT_FILTRO} w-64 max-w-full`}
        />
        {visao === "lista" && (
          <select name="status" defaultValue={status} className={SELECT_FILTRO} aria-label="Situação">
            <option value="pendentes">Pendentes</option>
            <option value="atrasadas">Atrasadas</option>
            <option value="concluidas">Concluídas</option>
            <option value="todas">Todas</option>
          </select>
        )}
        <select
          name="responsavel"
          defaultValue={minhas ? eu : (responsavel ?? "")}
          className={SELECT_FILTRO}
          aria-label="Responsável"
        >
          <option value="">De todos</option>
          <option value={eu}>Minhas</option>
          {pessoas
            .filter((p) => p.id !== eu)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
        </select>
        <Button type="submit" variant="outline" size="sm">
          Filtrar
        </Button>
      </form>
      )}

      {visao === "lista" && (
        <Card>
          <CardContent>
            <TarefasLista
              tarefas={tarefas}
              vazio={minhas ? "Nenhuma tarefa sua com estes filtros." : "Nenhuma tarefa com estes filtros."}
              pessoas={pessoas}
            />
          </CardContent>
        </Card>
      )}

      {visao === "quadro" && <QuadroTarefas tarefas={doQuadro} diasFeito={DIAS_FEITO_NO_QUADRO} />}

      {visao === "calendario" && (
        <Card>
          <CardContent>
            <CalendarioPrazos
              mes={mes}
              hoje={hoje}
              itens={doCalendario}
              linkMes={(m) => comFiltros({ visao: "calendario", mes: m })}
            />
            {responsavel && (
              <p className="text-muted-foreground mt-2 text-xs">
                Filtrado por responsável: só as tarefas da pessoa (marcos e prazos de demanda aparecem em De todos).
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {visao === "carga" && (
        <Card>
          <CardContent>
            <p className="mb-1 text-sm font-medium">Carga de trabalho por pessoa</p>
            <p className="text-muted-foreground mb-3 text-xs">
              As tarefas abertas de cada responsável, por prazo. A semana vai de segunda a domingo; clique no nome ou no número para ver a lista.
            </p>
            <CargaTrabalho carga={cargaPorPessoa(tarefas, hoje)} />
          </CardContent>
        </Card>
      )}
    </>
  )
}
