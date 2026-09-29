import Link from "next/link"
import { FileText, Filter, Plus, Sparkles } from "lucide-react"

import { ColunaOrdenavel, linkDeOrdem } from "@/components/coluna-ordenavel"
import { Paginacao } from "@/components/paginacao"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { ROTULO_TIPO, SITUACOES_ACORDO } from "@/lib/acordos-constantes"
import { listarCampanhas, type OrdemCampanha } from "@/lib/db/assembleias"
import {
  acordosDoEmpregador,
  campanhasDeOposicaoDoEmpregador,
  filtrarAcordos,
  FILTROS_ACORDO,
  ORDENS_OPOSICAO,
  oposicoesDoEmpregador,
  type FiltroAcordo,
} from "@/lib/db/empregador-painel"
import { AVISO_SQL_REUNIOES, listarReunioes, ORDENS_REUNIAO } from "@/lib/db/representacao-reunioes"
import { formatarData } from "@/lib/formato"
import { ROTULO_SITUACAO_OPOSITOR, SITUACOES_OPOSITOR, type SituacaoOpositor } from "@/lib/oposicao-constantes"
import { paginar } from "@/lib/paginacao"
import {
  INFO_TIPO_REUNIAO,
  ROTULO_MODALIDADE,
  ROTULO_SITUACAO_REUNIAO,
  SITUACOES_REUNIAO_REP,
  type SituacaoReuniaoRep,
  type TipoReuniaoRep,
} from "@/lib/representacao-reunioes-constantes"

import { lerLista, POR_PAGINA_PADRAO, type AbaEmpregador, type Params } from "./filtros"

const CAMPO =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

type Ctx = { empresaId: string; aba: AbaEmpregador; params: Params }

const base = (empresaId: string) => `/painel/representacao/empregadores/${empresaId}`

function Campo({ rotulo, id, children }: { rotulo: string; id: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1">
      <label htmlFor={id} className="text-muted-foreground text-xs">
        {rotulo}
      </label>
      {children}
    </div>
  )
}

/** Formulário GET da aba: mantém ordem e tamanho da página; filtrar volta à página 1. */
function Filtros({ ctx, periodo, busca, children }: { ctx: Ctx; periodo?: boolean; busca?: string; children?: React.ReactNode }) {
  const p = ctx.params
  const algum = ["de", "ate", "busca", "situacao", "campanha", "filtro"].some((k) => p[k])
  return (
    <form action={base(ctx.empresaId)} className="grid gap-3 rounded-md border p-3 sm:grid-cols-2 lg:grid-cols-4">
      <input type="hidden" name="aba" value={ctx.aba} />
      {p.porPagina && <input type="hidden" name="porPagina" value={p.porPagina} />}
      {p.ordem && <input type="hidden" name="ordem" value={p.ordem} />}
      {p.dir && <input type="hidden" name="dir" value={p.dir} />}
      {children}
      {periodo && (
        <>
          <Campo rotulo="De" id="f-de">
            <input id="f-de" name="de" type="date" defaultValue={p.de ?? ""} className={CAMPO} />
          </Campo>
          <Campo rotulo="Até" id="f-ate">
            <input id="f-ate" name="ate" type="date" defaultValue={p.ate ?? ""} className={CAMPO} />
          </Campo>
        </>
      )}
      {busca && (
        <Campo rotulo={busca} id="f-busca">
          <input id="f-busca" name="busca" type="search" defaultValue={p.busca ?? ""} className={CAMPO} />
        </Campo>
      )}
      <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
        <Button type="submit" size="sm">
          <Filter />
          Filtrar
        </Button>
        {algum && (
          <Button variant="ghost" size="sm" asChild>
            <Link href={`${base(ctx.empresaId)}?aba=${ctx.aba}`}>Limpar filtros</Link>
          </Button>
        )}
      </div>
    </form>
  )
}

function ordenacao(ctx: Ctx, ordem: string, dir: "asc" | "desc") {
  return { ordem, dir, href: linkDeOrdem(base(ctx.empresaId), { ...ctx.params, aba: ctx.aba }, ordem, dir, ["pagina"]) }
}

function Rodape({ total, pagina, totalPaginas, porPagina }: { total: number; pagina: number; totalPaginas: number; porPagina: number }) {
  return <Paginacao total={total} pagina={pagina} totalPaginas={totalPaginas} porPagina={porPagina} padrao={POR_PAGINA_PADRAO} />
}

const Vazio = ({ texto }: { texto: string }) => <p className="text-muted-foreground py-8 text-center text-sm">{texto}</p>

// ── Acordos ──────────────────────────────────────────────────────────────────

const COLUNAS_ACORDO = ["fim", "inicio", "titulo"] as const

export async function AbaAcordos({ ctx }: { ctx: Ctx }) {
  const l = lerLista("acordos", ctx.params, COLUNAS_ACORDO)
  const filtro: FiltroAcordo = ctx.params.filtro && ctx.params.filtro in FILTROS_ACORDO ? (ctx.params.filtro as FiltroAcordo) : "fechados"
  const todos = await acordosDoEmpregador(ctx.empresaId)
  const chave = (a: (typeof todos)[number]) =>
    l.ordem === "titulo" ? a.titulo.toLowerCase() : l.ordem === "inicio" ? (a.vigenciaInicio ?? "") : (a.vigenciaFim ?? "")
  const ordenados = filtrarAcordos(todos, filtro).sort((a, b) => {
    const r = chave(a).localeCompare(chave(b), "pt-BR")
    return l.dir === "asc" ? r : -r
  })
  const pag = paginar(ordenados, l)
  const o = ordenacao(ctx, l.ordem, l.dir)
  const rotuloSituacao = Object.fromEntries(SITUACOES_ACORDO.map((s) => [s.chave, s.rotulo])) as Record<string, string>
  return (
    <div className="grid gap-3">
      <Filtros ctx={ctx}>
        <Campo rotulo="Quais acordos" id="f-filtro">
          <select id="f-filtro" name="filtro" defaultValue={filtro} className={CAMPO}>
            {Object.entries(FILTROS_ACORDO).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Campo>
      </Filtros>
      {pag.total === 0 ? (
        <Vazio texto={todos.length ? "Nenhum acordo neste filtro." : "Nenhum acordo ligado a este empregador em Acordos coletivos."} />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <ColunaOrdenavel chave="titulo" rotulo="Acordo" {...o} />
              <TableHead>Tipo</TableHead>
              <ColunaOrdenavel chave="inicio" rotulo="Início" {...o} />
              <ColunaOrdenavel chave="fim" rotulo="Término" {...o} />
              <TableHead>Situação</TableHead>
              <TableHead className="text-right">Cláusulas</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pag.linhas.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="max-w-80">
                  <Link href={`/painel/representacao/acordos/${a.id}`} className="text-primary line-clamp-2 font-medium hover:underline">
                    {a.titulo}
                  </Link>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">{ROTULO_TIPO[a.tipo]}</Badge>
                </TableCell>
                <TableCell className="whitespace-nowrap">{formatarData(a.vigenciaInicio)}</TableCell>
                <TableCell className="whitespace-nowrap">{formatarData(a.vigenciaFim)}</TableCell>
                <TableCell className="whitespace-nowrap">
                  <Badge variant="outline">{rotuloSituacao[a.situacao] ?? a.situacao}</Badge>
                  {a.estado === "vencido" && (
                    <Badge variant="outline" className="border-destructive/40 text-destructive ml-1">
                      Vencido
                    </Badge>
                  )}
                  {a.estado === "vencendo" && (
                    <Badge variant="outline" className="border-warning/40 text-warning-fg ml-1">
                      Vencendo
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">{a.clausulas || "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <Rodape {...pag} porPagina={l.porPagina} />
    </div>
  )
}

// ── Votações ─────────────────────────────────────────────────────────────────

const COLUNAS_VOTACAO: readonly OrdemCampanha[] = ["atividade", "tema", "rodadas", "situacao", "registro"]

export async function AbaVotacoes({ ctx }: { ctx: Ctx }) {
  const l = lerLista("votacoes", ctx.params, COLUNAS_VOTACAO)
  const situacao = ctx.params.situacao === "abertas" || ctx.params.situacao === "finalizadas" ? ctx.params.situacao : "todas"
  // No máximo algumas dezenas por empresa: busca tudo e pagina aqui, no padrão das outras abas.
  const r = await listarCampanhas({
    empresaId: ctx.empresaId,
    busca: l.busca ?? undefined,
    situacao,
    porPagina: 100,
    ordem: l.ordem as OrdemCampanha,
    asc: l.dir === "asc",
  })
  const pag = paginar(r.linhas, l)
  const o = ordenacao(ctx, l.ordem, l.dir)
  return (
    <div className="grid gap-3">
      <Filtros ctx={ctx} busca="Tema">
        <Campo rotulo="Situação" id="f-situacao">
          <select id="f-situacao" name="situacao" defaultValue={situacao === "todas" ? "" : situacao} className={CAMPO}>
            <option value="">Todas</option>
            <option value="abertas">Abertas</option>
            <option value="finalizadas">Finalizadas</option>
          </select>
        </Campo>
      </Filtros>
      {pag.total === 0 ? (
        <Vazio texto="Nenhuma campanha de votação com este empregador entre as fontes." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <ColunaOrdenavel chave="tema" rotulo="Campanha" {...o} />
              <ColunaOrdenavel chave="atividade" rotulo="Agora" {...o} />
              <ColunaOrdenavel chave="rodadas" rotulo="Rodadas" {...o} className="text-right" />
              <ColunaOrdenavel chave="situacao" rotulo="Situação" {...o} />
              <ColunaOrdenavel chave="registro" rotulo="Criada em" {...o} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {pag.linhas.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="max-w-80">
                  <Link href={`/painel/representacao/votacoes/campanhas/${c.id}`} className="text-primary line-clamp-2 font-medium hover:underline">
                    {c.tema ?? "(sem tema)"}
                  </Link>
                  {c.fontes.length > 1 && <span className="text-muted-foreground text-xs">com {c.fontes.length - 1} outra(s) empresa(s)</span>}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {c.atividade?.tipo === "em_curso" ? (
                    <Badge variant="outline" className="border-success/40 text-success-fg">
                      Em votação{c.atividade.termino ? ` até ${formatarData(c.atividade.termino)}` : ""}
                    </Badge>
                  ) : c.atividade?.tipo === "em_breve" ? (
                    <Badge variant="outline" className="border-warning/40 text-warning-fg">
                      Abre {formatarData(c.atividade.inicio)}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums">{c.rodadas}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={c.finalizado ? "text-muted-foreground" : ""}>
                    {c.finalizado ? "Finalizada" : "Aberta"}
                  </Badge>
                </TableCell>
                <TableCell className="whitespace-nowrap">{formatarData(c.created_at)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <Rodape {...pag} porPagina={l.porPagina} />
    </div>
  )
}

// ── Oposições ────────────────────────────────────────────────────────────────

const COLUNAS_OPOSICAO = Object.keys(ORDENS_OPOSICAO)
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function AbaOposicoes({ ctx }: { ctx: Ctx }) {
  const l = lerLista("oposicoes", ctx.params, COLUNAS_OPOSICAO)
  const campanhas = await campanhasDeOposicaoDoEmpregador(ctx.empresaId)
  const campanhaId = ctx.params.campanha && UUID.test(ctx.params.campanha) && campanhas.some((c) => c.id === ctx.params.campanha) ? ctx.params.campanha : null
  const situacao = SITUACOES_OPOSITOR.some((s) => s.chave === ctx.params.situacao) ? (ctx.params.situacao as SituacaoOpositor) : null
  const nomes = new Map(campanhas.map((c) => [c.id, c.nome]))
  const r = await oposicoesDoEmpregador(
    ctx.empresaId,
    { pagina: l.pagina, porPagina: l.porPagina, ordem: l.ordem as keyof typeof ORDENS_OPOSICAO, asc: l.dir === "asc", campanhaId, situacao, busca: l.busca },
    nomes
  )
  const o = ordenacao(ctx, l.ordem, l.dir)
  return (
    <div className="grid gap-3">
      {campanhas.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {campanhas.map((c) => (
            <Link
              key={c.id}
              href={`${base(ctx.empresaId)}?aba=oposicoes&campanha=${c.id}`}
              className={`hover:border-primary/40 rounded-md border px-3 py-1.5 text-sm ${campanhaId === c.id ? "border-primary" : ""}`}
            >
              {c.nome} <span className="text-muted-foreground tabular-nums">· {c.total} carta(s)</span>
            </Link>
          ))}
        </div>
      )}
      <Filtros ctx={ctx} busca="Nome, CPF, matrícula ou protocolo">
        <Campo rotulo="Campanha" id="f-campanha">
          <select id="f-campanha" name="campanha" defaultValue={campanhaId ?? ""} className={CAMPO}>
            <option value="">Todas</option>
            {campanhas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Situação" id="f-situacao">
          <select id="f-situacao" name="situacao" defaultValue={situacao ?? ""} className={CAMPO}>
            <option value="">Todas</option>
            {SITUACOES_OPOSITOR.map((s) => (
              <option key={s.chave} value={s.chave}>
                {s.rotulo}
              </option>
            ))}
          </select>
        </Campo>
      </Filtros>
      {r.total === 0 ? (
        <Vazio texto="Nenhuma carta de oposição de trabalhador deste empregador." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <ColunaOrdenavel chave="nome" rotulo="Trabalhador" {...o} />
              <TableHead>Matrícula / lotação</TableHead>
              <TableHead>Campanha</TableHead>
              <ColunaOrdenavel chave="situacao" rotulo="Situação" {...o} />
              <ColunaOrdenavel chave="data" rotulo="Enviada em" {...o} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {r.linhas.map((x) => (
              <TableRow key={x.id}>
                <TableCell className="max-w-64">
                  {x.campanhaId ? (
                    <Link href={`/painel/representacao/oposicao/${x.campanhaId}/opositor/${x.id}`} className="text-primary font-medium hover:underline">
                      {x.nome ?? "(sem nome)"}
                    </Link>
                  ) : (
                    (x.nome ?? "(sem nome)")
                  )}
                  {x.ehFiliado && (
                    <Badge variant="outline" className="ml-1 text-xs">
                      filiado
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-sm">
                  {x.matricula ?? "—"}
                  {x.lotacao && <span className="text-muted-foreground block text-xs">{x.lotacao}</span>}
                </TableCell>
                <TableCell className="max-w-48 text-sm">
                  <span className="line-clamp-2">{x.campanhaNome ?? "—"}</span>
                </TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className={
                      x.situacao === "aprovada"
                        ? "border-success/40 text-success-fg"
                        : x.situacao === "reprovada"
                          ? "border-destructive/40 text-destructive"
                          : ""
                    }
                  >
                    {ROTULO_SITUACAO_OPOSITOR[x.situacao]}
                  </Badge>
                </TableCell>
                <TableCell className="whitespace-nowrap">{formatarData(x.criadoEm)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <Rodape total={r.total} pagina={l.pagina} totalPaginas={Math.max(1, Math.ceil(r.total / l.porPagina))} porPagina={l.porPagina} />
    </div>
  )
}

// ── Reuniões e setoriais ─────────────────────────────────────────────────────

const COLUNAS_REUNIAO = Object.keys(ORDENS_REUNIAO)

export async function AbaReunioes({ ctx, tipo, podeEditar }: { ctx: Ctx; tipo: TipoReuniaoRep; podeEditar: boolean }) {
  const aba = tipo === "setorial" ? "setoriais" : "reunioes"
  const l = lerLista(aba, ctx.params, COLUNAS_REUNIAO)
  const situacao = SITUACOES_REUNIAO_REP.some((s) => s.chave === ctx.params.situacao) ? (ctx.params.situacao as SituacaoReuniaoRep) : null
  const r = await listarReunioes(ctx.empresaId, tipo, {
    pagina: l.pagina,
    porPagina: l.porPagina,
    ordem: l.ordem as keyof typeof ORDENS_REUNIAO,
    asc: l.dir === "asc",
    situacao,
    de: l.de,
    ate: l.ate,
    busca: l.busca,
  })
  const info = INFO_TIPO_REUNIAO[tipo]
  const o = ordenacao(ctx, l.ordem, l.dir)
  const setorial = tipo === "setorial"
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground text-sm">{info.explicacao}</p>
        {podeEditar && r.disponivel && (
          <Button asChild size="sm">
            <Link href={`${base(ctx.empresaId)}/reunioes/nova?tipo=${tipo}`}>
              <Plus />
              {setorial ? "Nova setorial" : "Nova reunião"}
            </Link>
          </Button>
        )}
      </div>
      {!r.disponivel ? (
        <p className="text-warning-fg rounded-md border p-3 text-sm">{AVISO_SQL_REUNIOES}</p>
      ) : (
        <>
          <Filtros ctx={ctx} periodo busca={setorial ? "Título, pauta, resumo ou unidade" : "Título, pauta ou resumo"}>
            <Campo rotulo="Situação" id="f-situacao">
              <select id="f-situacao" name="situacao" defaultValue={situacao ?? ""} className={CAMPO}>
                <option value="">Todas</option>
                {SITUACOES_REUNIAO_REP.map((s) => (
                  <option key={s.chave} value={s.chave}>
                    {s.rotulo}
                  </option>
                ))}
              </select>
            </Campo>
          </Filtros>
          {r.total === 0 ? (
            <Vazio texto={`Nenhuma ${setorial ? "setorial" : "reunião"} registrada${ctx.params.situacao || ctx.params.busca || ctx.params.de || ctx.params.ate ? " com estes filtros" : ""}.`} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <ColunaOrdenavel chave="data" rotulo="Data" {...o} />
                  <ColunaOrdenavel chave="titulo" rotulo={setorial ? "Setorial" : "Reunião"} {...o} />
                  <TableHead>{setorial ? "Unidade / local" : "Onde"}</TableHead>
                  <TableHead className="text-right">{setorial ? "Presentes" : "Participantes"}</TableHead>
                  <ColunaOrdenavel chave="situacao" rotulo="Situação" {...o} />
                </TableRow>
              </TableHeader>
              <TableBody>
                {r.linhas.map((x) => (
                  <TableRow key={x.id}>
                    <TableCell className="whitespace-nowrap">
                      {formatarData(x.data)}
                      {x.horaInicio && <span className="text-muted-foreground block text-xs">{[x.horaInicio, x.horaFim].filter(Boolean).join("–")}</span>}
                    </TableCell>
                    <TableCell className="max-w-80">
                      <Link href={`${base(ctx.empresaId)}/reunioes/${x.id}`} className="text-primary line-clamp-2 font-medium hover:underline">
                        {x.titulo}
                      </Link>
                      <span className="text-muted-foreground flex items-center gap-2 text-xs">
                        {x.temAta && (
                          <span className="inline-flex items-center gap-0.5">
                            <FileText className="size-3" /> ata
                          </span>
                        )}
                        {x.resumoPorIA && (
                          <span className="text-primary inline-flex items-center gap-0.5">
                            <Sparkles className="size-3" /> resumo da IA
                          </span>
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-56 text-sm">
                      <span className="line-clamp-1">{(setorial ? x.unidade : null) ?? x.local ?? "—"}</span>
                      <span className="text-muted-foreground text-xs">{ROTULO_MODALIDADE[x.modalidade]}</span>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{(setorial ? x.presentesTotal : null) ?? (x.participantes || "—")}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          x.situacao === "agendada"
                            ? "border-warning/40 text-warning-fg"
                            : x.situacao === "cancelada"
                              ? "text-muted-foreground"
                              : "border-success/40 text-success-fg"
                        }
                      >
                        {ROTULO_SITUACAO_REUNIAO[x.situacao]}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <Rodape total={r.total} pagina={l.pagina} totalPaginas={Math.max(1, Math.ceil(r.total / l.porPagina))} porPagina={l.porPagina} />
        </>
      )}
    </div>
  )
}
