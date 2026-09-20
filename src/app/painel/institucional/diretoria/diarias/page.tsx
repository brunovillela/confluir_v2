import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, HandCoins, Landmark } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Paginacao } from "@/components/paginacao"
import { GrandesNumerosDiarias, SituacaoDiariaBadge } from "@/components/diarias"
import { RotuloTrilha } from "@/components/layout/trilha-rotulos"
import { requirePermissao } from "@/lib/auth"
import { listarSolicitacoesDiaria, listarTiposDiaria, SITUACOES_DIARIA } from "@/lib/db/diarias"
import { diretoresParaDiaria } from "@/lib/db/diarias-diretoria"
import { formatarData, formatarMoeda } from "@/lib/formato"
import { lerPaginacao, paginar } from "@/lib/paginacao"
import { semAcento } from "@/lib/texto"

import { AbasDiretoria } from "../abas-diretoria"
import { LancarDiariaDiretor } from "./lancar-diaria"

export const metadata: Metadata = { title: "Diárias da diretoria — Confluir" }

const SELECT_FILTRO =
  "border-input bg-background text-foreground h-9 max-w-52 truncate rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

const ROTULOS_SITUACAO: Record<string, string> = {
  aguardando: "Aguardando avaliação",
  aprovada: "Aprovadas",
  reprovada: "Reprovadas",
  cancelada: "Canceladas",
}

type ParamsLista = {
  busca?: string
  situacao?: string
  departamento?: string
  pagina?: string
  porPagina?: string
}

/** Todas as diárias da diretoria, com permissão própria (não é do RH). */
export default async function DiariasDiretoriaPage({
  searchParams,
}: {
  searchParams: Promise<ParamsLista>
}) {
  await requirePermissao("diretoria_diarias", ["configuracoes"])

  const brutos = await searchParams
  const [{ disponivel, solicitacoes }, diretores, { tipos }] = await Promise.all([
    listarSolicitacoesDiaria({ quadro: "diretor" }),
    diretoresParaDiaria(),
    listarTiposDiaria(),
  ])

  const params = {
    busca: (brutos.busca ?? "").trim(),
    situacao: (SITUACOES_DIARIA as readonly string[]).includes(brutos.situacao ?? "")
      ? brutos.situacao!
      : "todas",
    departamento: (brutos.departamento ?? "").trim(),
  }

  const filtradas = solicitacoes.filter((s) => {
    if (
      params.busca &&
      !semAcento(s.funcionarioNome ?? "").includes(semAcento(params.busca))
    ) {
      return false
    }
    if (params.situacao !== "todas" && s.situacao !== params.situacao) return false
    if (params.departamento && s.departamentoId !== params.departamento) return false
    return true
  })

  // Gasto por departamento no ano — é como a contabilidade enxerga.
  const ano = new Date().getFullYear()
  const porDepartamento = new Map<string, { nome: string; valor: number }>()
  for (const s of solicitacoes) {
    const referencia = s.data_inicio ?? s.created_at
    if (s.situacao !== "aprovada" || !referencia || Number(referencia.slice(0, 4)) !== ano) {
      continue
    }
    const chave = s.departamentoId ?? "(sem departamento)"
    const atual = porDepartamento.get(chave) ?? {
      nome: s.departamentoNome ?? "Sem departamento",
      valor: 0,
    }
    atual.valor += (s.valor_total ?? 0) + s.valorDespesas
    porDepartamento.set(chave, atual)
  }
  const ranking = [...porDepartamento.values()].sort((a, b) => b.valor - a.valor)

  const departamentos = [
    ...new Map(
      diretores
        .filter((d) => d.departamentoId)
        .map((d) => [d.departamentoId!, d.departamentoNome ?? "(sem nome)"])
    ),
  ].sort((a, b) => a[1].localeCompare(b[1], "pt-BR"))

  const paginacao = lerPaginacao(brutos, 30)
  const paginaAtual = paginar(filtradas, paginacao)
  const aguardando = solicitacoes.filter((s) => s.situacao === "aguardando").length

  return (
    <>
      <RotuloTrilha valores={{ diarias: "Diárias" }} />
      <AbasDiretoria atual="diarias" comDiarias />
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/institucional/diretoria">
            <ArrowLeft />
            Diretoria
          </Link>
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Diárias da diretoria</h1>
            <p className="text-muted-foreground mt-1 text-xs">
              {aguardando} aguardando avaliação ·{" "}
              {solicitacoes.length.toLocaleString("pt-BR")} solicitaç
              {solicitacoes.length === 1 ? "ão" : "ões"} no total — a aprovação gera ordem de
              pagamento direta ao diretor, na conta do departamento
            </p>
          </div>
          <Button variant="outline" asChild>
            <Link href="/painel/pessoal/diarias/contas">
              <Landmark />
              Centros de custo
            </Link>
          </Button>
        </div>
      </div>

      {!disponivel && (
        <Alert>
          <AlertDescription>
            As diárias ainda não estão configuradas no banco — rode{" "}
            <code>supabase/diarias.sql</code> e{" "}
            <code>supabase/diarias-diretoria.sql</code> no SQL Editor do Supabase.
          </AlertDescription>
        </Alert>
      )}

      <GrandesNumerosDiarias solicitacoes={solicitacoes} />

      {ranking.length > 0 && (
        <Card>
          <CardContent>
            <p className="text-muted-foreground text-xs">
              Aprovado por departamento em {ano} (diária + despesas)
            </p>
            <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
              {ranking.map((d) => (
                <li key={d.nome} className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate">{d.nome}</span>
                  <span className="tabular-nums">{formatarMoeda(d.valor)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <LancarDiariaDiretor
        diretores={diretores}
        tipos={tipos
          .filter((t) => t.ativa && (t.quadro === "diretor" || t.quadro === "ambos"))
          .map((t) => ({ id: t.id, nome: t.nome, valor: t.valor_reembolso }))}
      />

      <form method="GET" className="flex flex-wrap items-center gap-2">
        <Input
          name="busca"
          defaultValue={params.busca}
          placeholder="Nome do diretor"
          className="h-9 w-full sm:max-w-56"
          aria-label="Buscar por diretor"
        />
        <select
          name="situacao"
          defaultValue={params.situacao}
          aria-label="Filtrar por situação"
          className={SELECT_FILTRO}
        >
          <option value="todas">Todas as situações</option>
          {SITUACOES_DIARIA.map((s) => (
            <option key={s} value={s}>
              {ROTULOS_SITUACAO[s]}
            </option>
          ))}
        </select>
        <select
          name="departamento"
          defaultValue={params.departamento}
          aria-label="Filtrar por departamento"
          className={SELECT_FILTRO}
        >
          <option value="">Todos os departamentos</option>
          {departamentos.map(([id, nome]) => (
            <option key={id} value={id}>
              {nome}
            </option>
          ))}
        </select>
        <Button type="submit" variant="secondary" size="sm">
          Filtrar
        </Button>
      </form>

      <div className="overflow-hidden rounded-xl border">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Diretor(a)</TableHead>
                <TableHead className="hidden md:table-cell">Departamento</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="hidden md:table-cell">Período</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginaAtual.total === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="h-40">
                    <div className="text-muted-foreground flex flex-col items-center justify-center gap-2 text-center">
                      <HandCoins className="size-6" />
                      <p className="text-sm">
                        Nenhuma diária da diretoria
                        {params.busca && <> para “{params.busca}”</>}.
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
              {paginaAtual.linhas.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="max-w-56 font-medium">
                    <span className="block truncate">
                      {s.funcionarioNome ?? "(sem nome)"}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden max-w-40 truncate md:table-cell">
                    {s.departamentoNome ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground max-w-40 truncate">
                    {s.tipoNome ?? "—"}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap tabular-nums">
                    {formatarMoeda(s.valor_total)}
                    {s.valorDespesas > 0 && (
                      <span className="text-muted-foreground block text-xs">
                        + {formatarMoeda(s.valorDespesas)} em despesas
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden whitespace-nowrap md:table-cell">
                    {s.data_inicio ? (
                      <>
                        {formatarData(s.data_inicio)}
                        {s.data_termino && s.data_termino !== s.data_inicio && (
                          <> – {formatarData(s.data_termino)}</>
                        )}
                      </>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>
                    <SituacaoDiariaBadge situacao={s.situacao} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/painel/institucional/diretoria/diarias/${s.id}`}>
                        {s.situacao === "aguardando" ? "Avaliar" : "Ver"}
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <Paginacao
        total={paginaAtual.total}
        pagina={paginaAtual.pagina}
        totalPaginas={paginaAtual.totalPaginas}
        porPagina={paginacao.porPagina}
        padrao={30}
      />
    </>
  )
}
