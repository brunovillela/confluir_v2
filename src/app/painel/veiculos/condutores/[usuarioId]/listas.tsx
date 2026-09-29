import Link from "next/link"
import { AlertTriangle, Filter } from "lucide-react"

import { ColunaOrdenavel, linkDeOrdem } from "@/components/coluna-ordenavel"
import { Paginacao } from "@/components/paginacao"
import { CobrancaBadge, SituacaoAgendamentoBadge } from "@/components/veiculos"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  abastecimentosDoCondutor,
  checklistsDoCondutor,
  infracoesDoCondutor,
  movimentacoesDoCondutor,
  reservasDoCondutor,
  type Pagina,
  type VeiculoDoCondutor,
} from "@/lib/db/veiculos-condutor"
import type { Movimentacao } from "@/lib/db/veiculos"
import { formatarData, formatarDataHora, formatarMoeda } from "@/lib/formato"
import { cn } from "@/lib/utils"
import {
  ROTULOS_SITUACAO_AGENDAMENTO,
  ROTULOS_SITUACAO_COBRANCA,
  SITUACOES_AGENDAMENTO,
  SITUACOES_COBRANCA,
  TIPOS_INFRACAO,
  type SituacaoAgendamento,
  type SituacaoCobranca,
} from "@/lib/veiculos-constantes"

import { lerFiltrosBase, POR_PAGINA_PADRAO, type Aba, type Params } from "./filtros"

const CAMPO =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

type Contexto = {
  usuarioId: string
  aba: Aba
  params: Params
  veiculos: VeiculoDoCondutor[]
  combustiveis: string[]
}

const base = (usuarioId: string) => `/painel/veiculos/condutores/${usuarioId}`

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

/** Formulário GET da aba: veículo e período, mais os campos próprios dela. */
function Filtros({ ctx, children }: { ctx: Contexto; children?: React.ReactNode }) {
  const p = ctx.params
  const algum = ["veiculo", "de", "ate", "situacao", "km", "combustivel", "busca", "cobranca", "tipo", "pendencia"].some(
    (k) => p[k]
  )
  return (
    <form action={base(ctx.usuarioId)} className="grid gap-3 rounded-md border p-3 sm:grid-cols-2 lg:grid-cols-4">
      <input type="hidden" name="aba" value={ctx.aba} />
      {/* Filtrar mantém a ordenação e o tamanho da página (volta à página 1). */}
      {p.porPagina && <input type="hidden" name="porPagina" value={p.porPagina} />}
      {p.ordem && <input type="hidden" name="ordem" value={p.ordem} />}
      {p.dir && <input type="hidden" name="dir" value={p.dir} />}
      <Campo rotulo="Veículo" id="f-veiculo">
        <select id="f-veiculo" name="veiculo" defaultValue={p.veiculo ?? ""} className={CAMPO}>
          <option value="">Todos</option>
          {ctx.veiculos.map((v) => (
            <option key={v.id} value={v.id}>
              {v.rotulo}
            </option>
          ))}
        </select>
      </Campo>
      <Campo rotulo="De" id="f-de">
        <input id="f-de" name="de" type="date" defaultValue={p.de ?? ""} className={CAMPO} />
      </Campo>
      <Campo rotulo="Até" id="f-ate">
        <input id="f-ate" name="ate" type="date" defaultValue={p.ate ?? ""} className={CAMPO} />
      </Campo>
      {children}
      <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4">
        <Button type="submit" size="sm">
          <Filter />
          Filtrar
        </Button>
        {algum && (
          <Button variant="ghost" size="sm" asChild>
            <Link href={`${base(ctx.usuarioId)}?aba=${ctx.aba}`}>Limpar filtros</Link>
          </Button>
        )}
      </div>
    </form>
  )
}

function Rodape<T>({ p }: { p: Pagina<T> }) {
  return (
    <Paginacao
      total={p.total}
      pagina={p.pagina}
      totalPaginas={p.totalPaginas}
      porPagina={p.porPagina}
      padrao={POR_PAGINA_PADRAO}
    />
  )
}

function Vazio({ texto }: { texto: string }) {
  return <p className="text-muted-foreground py-8 text-center text-sm">{texto}</p>
}

function ordenacao(ctx: Contexto) {
  const { chaveOrdem, dir } = lerFiltrosBase(ctx.aba, ctx.params)
  const href = linkDeOrdem(base(ctx.usuarioId), { ...ctx.params, aba: ctx.aba }, chaveOrdem, dir, ["pagina"])
  return { ordem: chaveOrdem, dir, href }
}

function VeiculoLink({ id, placa, modelo }: { id: string | null; placa: string | null; modelo?: string | null }) {
  if (!id) return <span className="text-muted-foreground">—</span>
  return (
    <Link href={`/painel/veiculos/${id}`} className="text-primary whitespace-nowrap hover:underline">
      {placa ?? "(sem placa)"}
      {modelo && <span className="text-muted-foreground block text-xs">{modelo}</span>}
    </Link>
  )
}

// ── Movimentações ────────────────────────────────────────────────────────────

/** Devolvida depois da previsão (mesma regra do indicador de atrasos). */
function atrasou(m: Movimentacao): boolean {
  const previsao = m.previsao_retorno
  const devolvida = m.devolucao_em ?? m.data_devolucao
  if (!previsao || !devolvida) return false
  return previsao.length <= 10 ? devolvida.slice(0, 10) > previsao : Date.parse(devolvida) > Date.parse(previsao)
}

export async function ListaMovimentacoes({ ctx }: { ctx: Contexto }) {
  const p = ctx.params
  const situacao = p.situacao === "abertas" || p.situacao === "devolvidas" ? p.situacao : null
  const lista = await movimentacoesDoCondutor(ctx.usuarioId, {
    ...lerFiltrosBase("movimentacoes", p).base,
    situacao,
    kmAnormal: p.km === "anormal",
  })
  const o = ordenacao(ctx)
  return (
    <div className="grid gap-3">
      <Filtros ctx={ctx}>
        <Campo rotulo="Situação" id="f-situacao">
          <select id="f-situacao" name="situacao" defaultValue={situacao ?? ""} className={CAMPO}>
            <option value="">Todas</option>
            <option value="abertas">Sem devolução</option>
            <option value="devolvidas">Devolvidas</option>
          </select>
        </Campo>
        <label className="flex items-center gap-2 text-sm sm:col-span-2 lg:col-span-3">
          <input type="checkbox" name="km" value="anormal" defaultChecked={p.km === "anormal"} className="size-4" />
          Só devoluções com km fora do normal
        </label>
      </Filtros>
      {lista.total === 0 ? (
        <Vazio texto="Nenhuma movimentação com estes filtros." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <ColunaOrdenavel chave="saida" rotulo="Saída" {...o} />
              <ColunaOrdenavel chave="devolucao" rotulo="Devolução" {...o} />
              <TableHead>Veículo</TableHead>
              <ColunaOrdenavel chave="destino" rotulo="Destino e motivo" {...o} />
              <ColunaOrdenavel chave="km" rotulo="Km" {...o} className="text-right" />
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {lista.linhas.map((m) => {
              const anormal = (m.observacao_retorno ?? "").includes("Km fora do normal")
              return (
                <TableRow key={m.id}>
                  <TableCell className="whitespace-nowrap">
                    {m.retirada_em ? formatarDataHora(m.retirada_em) : formatarData(m.data_retirada)}
                    {m.sede_retirada && <span className="text-muted-foreground block text-xs">{m.sede_retirada}</span>}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {m.aberta ? (
                      <Badge variant="outline" className="border-warning/40 text-warning-fg">
                        Sem devolução
                      </Badge>
                    ) : m.devolucao_em ? (
                      formatarDataHora(m.devolucao_em)
                    ) : (
                      formatarData(m.data_devolucao)
                    )}
                    {m.previsao_retorno && (
                      <span className={cn("block text-xs", atrasou(m) ? "text-warning-fg" : "text-muted-foreground")}>
                        previsão {m.previsao_retorno.length > 10 ? formatarDataHora(m.previsao_retorno) : formatarData(m.previsao_retorno)}
                        {atrasou(m) ? " · atrasou" : ""}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <VeiculoLink id={m.veiculo_id} placa={m.veiculoPlaca} modelo={m.veiculoModelo} />
                  </TableCell>
                  <TableCell className="max-w-64">
                    <span className="line-clamp-1">{m.destino ?? "—"}</span>
                    {m.motivo && <span className="text-muted-foreground line-clamp-1 text-xs">{m.motivo}</span>}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap tabular-nums">
                    {m.km_rodado !== null ? m.km_rodado.toLocaleString("pt-BR") : "—"}
                    {anormal && (
                      <span className="text-warning-fg flex items-center justify-end gap-1 text-xs" title={m.observacao_retorno ?? ""}>
                        <AlertTriangle className="size-3" />
                        fora do normal
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {m.veiculo_id && (
                      <Link
                        href={`/painel/veiculos/${m.veiculo_id}/historico/${m.id}`}
                        className="text-primary text-xs whitespace-nowrap hover:underline"
                      >
                        Detalhes
                      </Link>
                    )}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      )}
      <Rodape p={lista} />
    </div>
  )
}

// ── Reservas ─────────────────────────────────────────────────────────────────

export async function ListaReservas({ ctx }: { ctx: Contexto }) {
  const p = ctx.params
  const situacao = SITUACOES_AGENDAMENTO.includes(p.situacao as SituacaoAgendamento)
    ? (p.situacao as SituacaoAgendamento)
    : null
  const lista = await reservasDoCondutor(ctx.usuarioId, { ...lerFiltrosBase("reservas", p).base, situacao })
  const o = ordenacao(ctx)
  return (
    <div className="grid gap-3">
      <Filtros ctx={ctx}>
        <Campo rotulo="Situação" id="f-situacao">
          <select id="f-situacao" name="situacao" defaultValue={situacao ?? ""} className={CAMPO}>
            <option value="">Todas</option>
            {SITUACOES_AGENDAMENTO.map((s) => (
              <option key={s} value={s}>
                {ROTULOS_SITUACAO_AGENDAMENTO[s]}
              </option>
            ))}
          </select>
        </Campo>
      </Filtros>
      {lista.total === 0 ? (
        <Vazio texto="Nenhuma reserva com estes filtros." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <ColunaOrdenavel chave="retirada" rotulo="Retirada prevista" {...o} />
              <ColunaOrdenavel chave="pedido" rotulo="Pedido em" {...o} />
              <TableHead>Veículo</TableHead>
              <ColunaOrdenavel chave="destino" rotulo="Destino e motivo" {...o} />
              <ColunaOrdenavel chave="situacao" rotulo="Situação" {...o} />
            </TableRow>
          </TableHeader>
          <TableBody>
            {lista.linhas.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="whitespace-nowrap">
                  {a.data_retirada && a.data_retirada.length > 10 ? formatarDataHora(a.data_retirada) : formatarData(a.data_retirada)}
                  {a.data_retorno && (
                    <span className="text-muted-foreground block text-xs">retorno {formatarData(a.data_retorno)}</span>
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {formatarData(a.created_at)}
                  {a.solicitadoPorNome && (
                    <span className="text-muted-foreground block text-xs">por {a.solicitadoPorNome}</span>
                  )}
                </TableCell>
                <TableCell>
                  <VeiculoLink id={a.veiculo_id} placa={a.veiculoPlaca} modelo={a.veiculoModelo} />
                </TableCell>
                <TableCell className="max-w-64">
                  <span className="line-clamp-1">{a.destino ?? "—"}</span>
                  {a.motivo && <span className="text-muted-foreground line-clamp-1 text-xs">{a.motivo}</span>}
                </TableCell>
                <TableCell>
                  <SituacaoAgendamentoBadge situacao={a.situacao} />
                  {a.negado_motivo && <span className="text-muted-foreground block max-w-56 text-xs">{a.negado_motivo}</span>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <Rodape p={lista} />
    </div>
  )
}

// ── Abastecimentos ───────────────────────────────────────────────────────────

export async function ListaAbastecimentos({ ctx }: { ctx: Contexto }) {
  const p = ctx.params
  const combustivel = p.combustivel && ctx.combustiveis.includes(p.combustivel) ? p.combustivel : null
  const busca = (p.busca ?? "").trim().slice(0, 60) || null
  const lista = await abastecimentosDoCondutor(ctx.usuarioId, {
    ...lerFiltrosBase("abastecimentos", p).base,
    combustivel,
    busca,
  })
  const o = ordenacao(ctx)
  return (
    <div className="grid gap-3">
      <Filtros ctx={ctx}>
        <Campo rotulo="Combustível" id="f-combustivel">
          <select id="f-combustivel" name="combustivel" defaultValue={combustivel ?? ""} className={CAMPO}>
            <option value="">Todos</option>
            {ctx.combustiveis.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Posto ou cidade" id="f-busca">
          <input id="f-busca" name="busca" type="search" defaultValue={busca ?? ""} className={CAMPO} />
        </Campo>
      </Filtros>
      {lista.total === 0 ? (
        <Vazio texto="Nenhum abastecimento com estes filtros." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <ColunaOrdenavel chave="data" rotulo="Data" {...o} />
              <TableHead>Veículo</TableHead>
              <ColunaOrdenavel chave="posto" rotulo="Posto" {...o} />
              <TableHead>Combustível</TableHead>
              <ColunaOrdenavel chave="litros" rotulo="Litros" {...o} className="text-right" />
              <ColunaOrdenavel chave="valor" rotulo="Valor" {...o} className="text-right" />
              <TableHead className="text-right">R$/L</TableHead>
              <ColunaOrdenavel chave="hodometro" rotulo="Hodômetro" {...o} className="text-right" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {lista.linhas.map((a) => (
              <TableRow key={a.id}>
                <TableCell className="whitespace-nowrap">{formatarDataHora(a.data_hora)}</TableCell>
                <TableCell>
                  <VeiculoLink id={a.veiculo_id} placa={a.veiculoPlaca} />
                </TableCell>
                <TableCell className="max-w-56">
                  <span className="line-clamp-1">{a.posto ?? "—"}</span>
                  {a.cidade && <span className="text-muted-foreground text-xs">{a.cidade}</span>}
                </TableCell>
                <TableCell>{a.combustivel ?? "—"}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {a.volume !== null ? a.volume.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : "—"}
                </TableCell>
                <TableCell className="text-right whitespace-nowrap tabular-nums">{a.valor !== null ? formatarMoeda(a.valor) : "—"}</TableCell>
                <TableCell className="text-muted-foreground text-right tabular-nums">
                  {a.valor && a.volume ? (a.valor / a.volume).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">{a.hodometro !== null ? a.hodometro.toLocaleString("pt-BR") : "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <Rodape p={lista} />
    </div>
  )
}

// ── Infrações ────────────────────────────────────────────────────────────────

export async function ListaInfracoes({ ctx }: { ctx: Contexto }) {
  const p = ctx.params
  const cobranca =
    p.cobranca === "sem" ? "sem" : SITUACOES_COBRANCA.includes(p.cobranca as SituacaoCobranca) ? (p.cobranca as SituacaoCobranca) : null
  const tipo = TIPOS_INFRACAO.includes(p.tipo as (typeof TIPOS_INFRACAO)[number]) ? (p.tipo as string) : null
  const lista = await infracoesDoCondutor(ctx.usuarioId, { ...lerFiltrosBase("infracoes", p).base, cobranca, tipo })
  const o = ordenacao(ctx)
  return (
    <div className="grid gap-3">
      <Filtros ctx={ctx}>
        <Campo rotulo="Gravidade" id="f-tipo">
          <select id="f-tipo" name="tipo" defaultValue={tipo ?? ""} className={CAMPO}>
            <option value="">Todas</option>
            {TIPOS_INFRACAO.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Cobrança" id="f-cobranca">
          <select id="f-cobranca" name="cobranca" defaultValue={cobranca ?? ""} className={CAMPO}>
            <option value="">Todas</option>
            {SITUACOES_COBRANCA.map((s) => (
              <option key={s} value={s}>
                {ROTULOS_SITUACAO_COBRANCA[s]}
              </option>
            ))}
            <option value="sem">Sem cobrança (legado)</option>
          </select>
        </Campo>
      </Filtros>
      {lista.total === 0 ? (
        <Vazio texto="Nenhuma infração com estes filtros." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <ColunaOrdenavel chave="data" rotulo="Data" {...o} />
              <TableHead>Veículo</TableHead>
              <ColunaOrdenavel chave="tipo" rotulo="Infração" {...o} />
              <ColunaOrdenavel chave="valor" rotulo="Valor" {...o} className="text-right" />
              <ColunaOrdenavel chave="cobranca" rotulo="Cobrança" {...o} />
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {lista.linhas.map((i) => (
              <TableRow key={i.id}>
                <TableCell className="whitespace-nowrap">{formatarData(i.infracao_data)}</TableCell>
                <TableCell>
                  <VeiculoLink id={i.veiculo_id} placa={i.veiculoPlaca} modelo={i.veiculoModelo} />
                </TableCell>
                <TableCell className="max-w-72">
                  <span className="line-clamp-1">{i.descricao ?? "—"}</span>
                  <span className="text-muted-foreground text-xs">
                    {[i.infracao_tipo, i.local].filter(Boolean).join(" · ")}
                    {i.justificativa_sindical ? " · atividade sindical" : ""}
                  </span>
                </TableCell>
                <TableCell className="text-right whitespace-nowrap tabular-nums">{i.custo !== null ? formatarMoeda(i.custo) : "—"}</TableCell>
                <TableCell>
                  <CobrancaBadge situacao={i.cobranca_situacao} />
                </TableCell>
                <TableCell className="text-right">
                  <Link href={`/painel/veiculos/infracoes/${i.id}`} className="text-primary text-xs whitespace-nowrap hover:underline">
                    Abrir
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <Rodape p={lista} />
    </div>
  )
}

// ── Checklists ───────────────────────────────────────────────────────────────

export async function ListaChecklists({ ctx }: { ctx: Contexto }) {
  const p = ctx.params
  const lista = await checklistsDoCondutor(ctx.usuarioId, {
    ...lerFiltrosBase("checklists", p).base,
    comPendencia: p.pendencia === "sim",
  })
  const o = ordenacao(ctx)
  return (
    <div className="grid gap-3">
      <p className="text-muted-foreground text-xs">Checklists da frota feitos por este condutor como inspetor.</p>
      <Filtros ctx={ctx}>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="pendencia" value="sim" defaultChecked={p.pendencia === "sim"} className="size-4" />
          Só com pendências
        </label>
      </Filtros>
      {lista.total === 0 ? (
        <Vazio texto="Nenhum checklist com estes filtros." />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <ColunaOrdenavel chave="data" rotulo="Data" {...o} />
              <TableHead>Veículo</TableHead>
              <ColunaOrdenavel chave="hodometro" rotulo="Hodômetro" {...o} className="text-right" />
              <ColunaOrdenavel chave="pendencias" rotulo="Pendências" {...o} className="text-right" />
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {lista.linhas.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="whitespace-nowrap">{formatarDataHora(c.realizadoEm)}</TableCell>
                <TableCell>
                  <Link href={`/painel/veiculos/${c.veiculoId}`} className="text-primary hover:underline">
                    {c.veiculoRotulo}
                  </Link>
                </TableCell>
                <TableCell className="text-right tabular-nums">{c.hodometro !== null ? c.hodometro.toLocaleString("pt-BR") : "—"}</TableCell>
                <TableCell className="text-right">
                  {c.pendencias > 0 ? (
                    <Badge variant="outline" className="border-warning/40 text-warning-fg">
                      {c.pendencias}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">0</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Link href={`/painel/veiculos/checklists/${c.id}`} className="text-primary text-xs hover:underline">
                    Abrir
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <Rodape p={lista} />
    </div>
  )
}
