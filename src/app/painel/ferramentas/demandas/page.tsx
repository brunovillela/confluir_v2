import type { Metadata } from "next"
import Link from "next/link"
import { Columns3, List, ListChecks, Plus, TriangleAlert } from "lucide-react"

import { AbasVisao } from "@/components/abas-visao"

import { PessoaNome } from "@/components/pessoa-nome"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { requirePermissao } from "@/lib/auth"
import { hojeSP } from "@/lib/db/comum"
import { listarDemandas, resumoDemandas } from "@/lib/db/nucleo"
import { formatarData } from "@/lib/formato"
import { podeAcessar } from "@/lib/permissoes"
import { SITUACOES_DEMANDA } from "@/lib/nucleo-constantes"

import { listarModelos } from "@/lib/db/modelos"
import { listarFiltrosSalvos } from "@/lib/db/filtros-salvos"
import { departamentosComIntegrantes } from "@/lib/db/paineis"
import { consultaCanonica } from "@/lib/ferramentas-acompanhamento"
import { listarPessoasAtribuiveis } from "@/lib/db/nucleo"

import { FiltrosSalvos } from "../filtros-salvos"
import { UsarModelo } from "../modelos/usar-modelo"
import { QuadroDemandas } from "./quadro-demandas"

/** Demandas Feito que o quadro mostra (as primeiras da lista); o resto fica na lista. */
const FEITO_NO_QUADRO = 30

export const metadata: Metadata = { title: "Demandas — Confluir" }

const SELECT_FILTRO =
  "border-input bg-background text-foreground h-9 max-w-52 truncate rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

const CLASSE_SITUACAO: Record<string, string> = {
  "A fazer": "border-warning/40 text-warning-fg",
  Fazendo: "border-primary/40 text-primary",
  Feito: "text-muted-foreground",
}

type Params = {
  busca?: string
  situacao?: string
  excluida?: string
  tipo?: string
  visao?: string
  responsavel?: string
  departamento?: string
}

export default async function DemandasPage({
  searchParams,
}: {
  searchParams: Promise<Params>
}) {
  const sessao = await requirePermissao("ferramentas_demandas", ["ferramentas_tarefas"])
  const editor = podeAcessar(sessao.permissoes, "ferramentas_demandas")
  const veAnomalias = podeAcessar(sessao.permissoes, "ferramentas_anomalias")

  const brutos = await searchParams
  const busca = (brutos.busca ?? "").trim()
  const excluida = brutos.excluida === "1"
  const situacao =
    brutos.situacao === "abertas" || brutos.situacao === "atrasadas" || (SITUACOES_DEMANDA as readonly string[]).includes(brutos.situacao ?? "")
      ? brutos.situacao
      : ""
  // Vindo da caixa de entrada ("Relatos do sistema a tratar").
  const tipo = (brutos.tipo ?? "").trim().slice(0, 60)
  const quadro = brutos.visao === "quadro"
  const eu = String(sessao.usuario.id)
  const [deptos, filtrosSalvos, pessoas] = await Promise.all([
    departamentosComIntegrantes(),
    listarFiltrosSalvos("demandas", eu),
    listarPessoasAtribuiveis(),
  ])
  const depto = deptos.find((d) => d.id === (brutos.departamento ?? "").trim()) ?? null
  const responsavel = pessoas.some((p) => p.id === brutos.responsavel) ? (brutos.responsavel as string) : ""
  // Responsável e departamento juntos: a pessoa, se for do departamento.
  const responsavelIds = responsavel
    ? depto && !depto.integrantes.includes(responsavel)
      ? []
      : [responsavel]
    : depto?.integrantes

  const [resumo, demandas, modelos] = await Promise.all([
    resumoDemandas(),
    // O quadro mostra as três colunas: ignora o filtro de situação.
    listarDemandas({ busca, situacao: quadro ? "" : situacao, tipo: tipo || undefined, responsavelIds }),
    editor ? listarModelos("demanda") : Promise.resolve([]),
  ])
  const feitas = demandas.filter((d) => d.situacao === "Feito")
  const doQuadro = quadro
    ? [...demandas.filter((d) => d.situacao !== "Feito"), ...feitas.slice(0, FEITO_NO_QUADRO)]
    : []
  const linkVisao = (v: string) => {
    const p = new URLSearchParams()
    if (busca) p.set("busca", busca)
    if (tipo) p.set("tipo", tipo)
    if (responsavel) p.set("responsavel", responsavel)
    if (depto) p.set("departamento", depto.id)
    if (v === "quadro") p.set("visao", "quadro")
    else if (situacao) p.set("situacao", situacao)
    const q = p.toString()
    return `/painel/ferramentas/demandas${q ? `?${q}` : ""}`
  }

  return (
    <>
      {tipo && (
        <Alert>
          <AlertDescription>
            Mostrando só: {tipo}
            {situacao === "abertas" ? " (em aberto)" : ""} —{" "}
            <Link href="/painel/ferramentas/demandas" className="underline underline-offset-2">
              ver todas
            </Link>
          </AlertDescription>
        </Alert>
      )}
      {excluida && (
        <Alert>
          <AlertDescription>Demanda excluída.</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Demandas</h1>
          <p className="text-muted-foreground mt-1 text-xs">
            Frentes de atuação com prazo, responsável e tarefas
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/painel/ferramentas/tarefas">
              <ListChecks />
              Tarefas
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
          {editor && (
            <UsarModelo modo="nova_demanda" modelos={modelos.map((m) => ({ id: m.id, nome: m.nome }))} pessoas={pessoas} />
          )}
          {editor && (
            <Button asChild>
              <Link href="/painel/ferramentas/demandas/nova">
                <Plus />
                Nova demanda
              </Link>
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <CardResumo rotulo="Demandas" valor={resumo.total} />
        <CardResumo rotulo="A fazer" valor={resumo.aFazer} />
        <CardResumo rotulo="Fazendo" valor={resumo.fazendo} />
        <CardResumo rotulo="Feito" valor={resumo.feito} />
      </div>

      <AbasVisao
        atual={quadro ? "quadro" : "lista"}
        abas={[
          { id: "lista", rotulo: "Lista", icone: List, href: linkVisao("lista") },
          { id: "quadro", rotulo: "Quadro", icone: Columns3, href: linkVisao("quadro") },
        ]}
      />

      <FiltrosSalvos
        pagina="demandas"
        consultaAtual={consultaCanonica("demandas", brutos)}
        atalhos={[
          { id: "fixo-minhas", nome: "Minhas em aberto", consulta: consultaCanonica("demandas", { responsavel: eu, situacao: "abertas" }), fixo: true },
          { id: "fixo-atrasadas", nome: "Atrasadas", consulta: consultaCanonica("demandas", { situacao: "atrasadas" }), fixo: true },
          ...filtrosSalvos,
        ]}
      />

      <form
        className="flex flex-wrap items-center gap-2"
        action="/painel/ferramentas/demandas"
      >
        {quadro && <input type="hidden" name="visao" value="quadro" />}
        {tipo && <input type="hidden" name="tipo" value={tipo} />}
        <input
          type="search"
          name="busca"
          defaultValue={busca}
          placeholder="Nome da demanda"
          className={`${SELECT_FILTRO} w-64 max-w-full`}
        />
        {!quadro && (
          <select name="situacao" defaultValue={situacao} className={SELECT_FILTRO} aria-label="Situação">
            <option value="">Todas as situações</option>
            <option value="abertas">Em aberto</option>
            <option value="atrasadas">Atrasadas (prazo vencido)</option>
            {SITUACOES_DEMANDA.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        )}
        <select name="responsavel" defaultValue={responsavel} className={SELECT_FILTRO} aria-label="Responsável">
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
        {deptos.length > 0 && (
          <select name="departamento" defaultValue={depto?.id ?? ""} className={SELECT_FILTRO} aria-label="Departamento">
            <option value="">Todos os departamentos</option>
            {deptos.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nome}
              </option>
            ))}
          </select>
        )}
        <Button type="submit" variant="outline" size="sm">
          Filtrar
        </Button>
      </form>

      {quadro ? (
        <QuadroDemandas
          demandas={doQuadro}
          editor={editor}
          feitoOcultas={Math.max(0, feitas.length - FEITO_NO_QUADRO)}
          hoje={hojeSP()}
        />
      ) : (
        <Card>
          <CardContent>
            {demandas.length === 0 ? (
              <p className="text-muted-foreground py-8 text-center text-sm">
                <ListChecks className="mx-auto mb-2 size-5" />
                Nenhuma demanda encontrada com estes filtros.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Demanda</TableHead>
                    <TableHead>Responsável</TableHead>
                    <TableHead>Prazo</TableHead>
                    <TableHead>Tarefas</TableHead>
                    <TableHead>Situação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {demandas.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell className="max-w-80">
                        <Link
                          href={`/painel/ferramentas/demandas/${d.id}`}
                          className="text-primary font-medium hover:underline"
                        >
                          <span className="line-clamp-2">{d.nome ?? "(sem nome)"}</span>
                        </Link>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        {d.responsavelNome ? <PessoaNome nome={d.responsavelNome} fotoUrl={d.responsavelFotoUrl} /> : "—"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        {d.prazo ? formatarData(d.prazo) : "—"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums text-sm">
                        {d.tarefasTotal > 0
                          ? `${d.tarefasConcluidas}/${d.tarefasTotal}`
                          : "—"}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={
                            CLASSE_SITUACAO[d.situacao ?? ""] ?? "text-muted-foreground"
                          }
                        >
                          {d.situacao ?? "—"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </>
  )
}

function CardResumo({ rotulo, valor }: { rotulo: string; valor: number }) {
  return (
    <Card>
      <CardContent>
        <p className="text-muted-foreground text-xs">{rotulo}</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">
          {valor.toLocaleString("pt-BR")}
        </p>
      </CardContent>
    </Card>
  )
}
