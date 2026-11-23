import type { Metadata } from "next"
import Link from "next/link"
import { ChartColumn } from "lucide-react"

import { GraficoColunas } from "@/components/graficos/colunas"
import { TileIndicador } from "@/components/graficos/tile"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { requirePermissao } from "@/lib/auth"
import { principaisDoTenant } from "@/lib/db/departamento-principal"
import { departamentosComIntegrantes, painelDoDepartamento, SEMANAS_PAINEL } from "@/lib/db/paineis"
import { rotuloDiasMedios, rotuloSemana } from "@/lib/ferramentas-acompanhamento"
import { podeAcessar } from "@/lib/permissoes"
import { ORDEM_NIVEL_PROJETO, ROTULOS_NIVEL_PROJETO, type NivelProjeto } from "@/lib/projetos-constantes"

import { SeloSituacaoProjeto } from "../projetos/selo-situacao"

export const metadata: Metadata = { title: "Painéis — Confluir" }

const SELECT_FILTRO =
  "border-input bg-background text-foreground h-9 max-w-64 truncate rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

/** Delta assinado entre duas contagens ("+3", "−2", "0"). */
function delta(atual: number, anterior: number) {
  const d = atual - anterior
  return { texto: d === 0 ? "0" : d > 0 ? `+${d}` : `−${Math.abs(d)}`, sinal: Math.sign(d) as -1 | 0 | 1 }
}

/**
 * PAINÉIS POR DEPARTAMENTO (Onda 4): a vazão da semana, o tempo até concluir,
 * as atrasadas por pessoa, as demandas e os projetos do departamento. Abre no
 * departamento principal de quem olha; "Toda a entidade" compara os departamentos.
 */
export default async function PaineisPage({ searchParams }: { searchParams: Promise<{ departamento?: string }> }) {
  const sessao = await requirePermissao("ferramentas_tarefas", ["ferramentas_demandas"])
  const veProjetos = podeAcessar(sessao.permissoes, "ferramentas_projetos", ["ferramentas_projetos_edicao"])
  const eu = String(sessao.usuario.id)
  const { departamento: bruto } = await searchParams

  const [deptos, principais] = await Promise.all([departamentosComIntegrantes(), principaisDoTenant()])
  const padrao = principais.get(eu) ?? deptos.find((d) => d.integrantes.includes(eu))?.id ?? null
  const escolhido =
    bruto === "todos" ? null : bruto && deptos.some((d) => d.id === bruto) ? bruto : padrao
  const p = await painelDoDepartamento(escolhido)

  const filtroTarefas = (extra: Record<string, string>) => {
    const q = new URLSearchParams()
    if (p.atual) q.set("departamento", p.atual.id)
    for (const [k, v] of Object.entries(extra)) q.set(k, v)
    return `/painel/ferramentas/tarefas?${q.toString()}`
  }
  const maxAbertas = Math.max(1, ...p.porPessoa.map((x) => x.abertas))
  const porNivel = (Object.keys(ROTULOS_NIVEL_PROJETO) as NivelProjeto[])
    .filter((n) => n !== "finalizado")
    .map((n) => ({ nivel: n, quantidade: p.projetos.filter((x) => x.nivel === n).length }))
  const projetosOrdenados = [...p.projetos].sort((a, b) => ORDEM_NIVEL_PROJETO[a.nivel] - ORDEM_NIVEL_PROJETO[b.nivel])

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <ChartColumn className="text-muted-foreground size-5" />
            Painéis
          </h1>
          <p className="text-muted-foreground mt-1 text-xs">
            {p.atual
              ? `O trabalho das ${p.atual.pessoas} pessoas de ${p.atual.nome}: tarefas e demandas de que elas são responsáveis.`
              : "A entidade inteira, com a comparação entre os departamentos."}
          </p>
        </div>
        <form action="/painel/ferramentas/paineis" className="flex flex-wrap items-center gap-2">
          <select name="departamento" defaultValue={p.atual?.id ?? "todos"} className={SELECT_FILTRO} aria-label="Departamento">
            <option value="todos">Toda a entidade</option>
            {p.departamentos.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nome}
              </option>
            ))}
          </select>
          <Button type="submit" variant="outline" size="sm">
            Ver
          </Button>
        </form>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <TileIndicador rotulo="Tarefas abertas" valor={p.abertas.toLocaleString("pt-BR")} href={filtroTarefas({})} />
        <TileIndicador
          rotulo="Atrasadas"
          valor={p.atrasadas.toLocaleString("pt-BR")}
          href={filtroTarefas({ status: "atrasadas" })}
          nota={p.abertas ? `${Math.round((p.atrasadas / p.abertas) * 100)}% das abertas` : undefined}
        />
        <TileIndicador
          rotulo="Concluídas nesta semana"
          valor={p.concluidasSemana.toLocaleString("pt-BR")}
          delta={delta(p.concluidasSemana, p.concluidasSemanaAnterior)}
          deltaRotulo=" vs. semana passada"
          sparkline={p.concluidas}
        />
        <TileIndicador
          rotulo="Tempo médio até concluir"
          valor={rotuloDiasMedios(p.tempoMedio)}
          nota={
            p.tempoMedioAnterior != null
              ? `Nas 4 semanas antes: ${rotuloDiasMedios(p.tempoMedioAnterior)}`
              : "Concluídas nas últimas 4 semanas"
          }
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <Card>
          <CardContent className="grid gap-2">
            <div>
              <p className="text-sm font-medium">Vazão por semana</p>
              <p className="text-muted-foreground text-xs">
                Tarefas criadas e concluídas nas últimas {SEMANAS_PAINEL} semanas (cada coluna começa na segunda-feira).
              </p>
            </div>
            <GraficoColunas
              titulo="Tarefas criadas e concluídas por semana"
              categorias={p.semanas.map(rotuloSemana)}
              series={[
                { nome: "Criadas", valores: p.criadas },
                { nome: "Concluídas", valores: p.concluidas },
              ]}
            />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="grid gap-3">
            <div>
              <p className="text-sm font-medium">Abertas por pessoa</p>
              <p className="text-muted-foreground text-xs">Atrasadas em vermelho. Clique para ver a lista.</p>
            </div>
            {p.porPessoa.length === 0 ? (
              <p className="text-muted-foreground py-6 text-center text-sm">Nenhuma tarefa aberta.</p>
            ) : (
              <ol className="grid gap-2.5">
                {p.porPessoa.slice(0, 12).map((x) => (
                  <li key={x.id ?? "sem"} className="grid gap-1">
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      {x.id ? (
                        <Link href={`/painel/ferramentas/tarefas?responsavel=${x.id}`} className="hover:text-primary truncate hover:underline">
                          {x.nome}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground truncate">{x.nome}</span>
                      )}
                      <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                        {x.abertas}
                        {x.atrasadas > 0 && <span className="text-destructive ml-1.5 font-medium">{x.atrasadas} atrasada{x.atrasadas === 1 ? "" : "s"}</span>}
                      </span>
                    </div>
                    <div className="bg-muted/60 flex h-2 overflow-hidden rounded-full" aria-hidden>
                      <div className="bg-destructive h-full" style={{ width: `${(x.atrasadas / maxAbertas) * 100}%` }} />
                      <div className="h-full" style={{ width: `${((x.abertas - x.atrasadas) / maxAbertas) * 100}%`, background: "var(--graf-1)" }} />
                    </div>
                  </li>
                ))}
              </ol>
            )}
            {p.porPessoa.length > 12 && (
              <p className="text-muted-foreground text-xs">E mais {p.porPessoa.length - 12} pessoas.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className={`grid gap-4 ${veProjetos ? "lg:grid-cols-[1fr_2fr]" : ""}`}>
        <Card>
          <CardContent className="grid gap-3">
            <p className="text-sm font-medium">Demandas em aberto</p>
            <dl className="grid grid-cols-3 gap-3 text-center">
              {[
                { rotulo: "A fazer", valor: p.demandas.aFazer, classe: "" },
                { rotulo: "Fazendo", valor: p.demandas.fazendo, classe: "" },
                { rotulo: "Com prazo vencido", valor: p.demandas.atrasadas, classe: p.demandas.atrasadas ? "text-destructive" : "" },
              ].map((d) => (
                <div key={d.rotulo} className="rounded-md border p-3">
                  <dd className={`text-2xl font-semibold tabular-nums ${d.classe}`}>{d.valor}</dd>
                  <dt className="text-muted-foreground mt-1 text-xs">{d.rotulo}</dt>
                </div>
              ))}
            </dl>
            <Link
              href={`/painel/ferramentas/demandas?situacao=abertas${p.atual ? `&departamento=${p.atual.id}` : ""}`}
              className="text-primary text-xs hover:underline"
            >
              Ver as demandas
            </Link>
          </CardContent>
        </Card>

        {veProjetos && (
          <Card>
            <CardContent className="grid gap-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-medium">Projetos em andamento por situação</p>
                <p className="text-muted-foreground text-xs">
                  {porNivel.map((n) => `${ROTULOS_NIVEL_PROJETO[n.nivel]}: ${n.quantidade}`).join(" · ")}
                </p>
              </div>
              {projetosOrdenados.length === 0 ? (
                <p className="text-muted-foreground py-4 text-center text-sm">
                  {p.atual ? "Nenhum projeto em andamento com tarefa de alguém do departamento." : "Nenhum projeto em andamento."}
                </p>
              ) : (
                <ul className="grid divide-y">
                  {projetosOrdenados.slice(0, 10).map((x) => (
                    <li key={x.id} className="flex items-center justify-between gap-3 py-1.5 text-sm">
                      <Link href={`/painel/ferramentas/projetos/${x.id}`} className="hover:text-primary min-w-0 truncate hover:underline">
                        {x.titulo}
                      </Link>
                      <SeloSituacaoProjeto nivel={x.nivel} motivos={x.motivos} />
                    </li>
                  ))}
                </ul>
              )}
              {projetosOrdenados.length > 10 && (
                <Link href="/painel/ferramentas/projetos" className="text-primary text-xs hover:underline">
                  Ver os {projetosOrdenados.length} projetos na carteira
                </Link>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {p.comparativo.length > 0 && (
        <Card>
          <CardContent>
            <p className="text-sm font-medium">Departamentos lado a lado</p>
            <p className="text-muted-foreground mb-3 text-xs">
              Quem está em mais de um departamento conta em cada um. Clique no nome para abrir o painel do departamento.
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Departamento</TableHead>
                  <TableHead className="text-right">Pessoas</TableHead>
                  <TableHead className="text-right">Abertas</TableHead>
                  <TableHead className="text-right">Atrasadas</TableHead>
                  <TableHead className="text-right">Concluídas (4 semanas)</TableHead>
                  <TableHead className="text-right">Tempo médio</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {p.comparativo.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell>
                      <Link href={`/painel/ferramentas/paineis?departamento=${d.id}`} className="text-primary hover:underline">
                        {d.nome}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{d.pessoas}</TableCell>
                    <TableCell className="text-right tabular-nums">{d.abertas}</TableCell>
                    <TableCell className={`text-right tabular-nums ${d.atrasadas ? "text-destructive font-medium" : ""}`}>{d.atrasadas}</TableCell>
                    <TableCell className="text-right tabular-nums">{d.concluidas4}</TableCell>
                    <TableCell className="text-right whitespace-nowrap">{rotuloDiasMedios(d.tempoMedio)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </>
  )
}
