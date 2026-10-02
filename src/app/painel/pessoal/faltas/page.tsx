import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, CalendarCheck, Settings } from "lucide-react"

import { GrupoColapsavel } from "@/components/grupo-colapsavel"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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
import { AVISO_SQL_FALTAS, lerConfigFaltas, listarFaltas, type FaltaJustificada } from "@/lib/db/faltas"
import { funcionariosParaSelecao, urlArquivoPessoal } from "@/lib/db/pessoal"
import { ROTULO_SITUACAO_FALTA, resumoLimites, type SituacaoFalta } from "@/lib/faltas-constantes"
import { formatarData } from "@/lib/formato"

import { DecisaoFalta, ExcluirFaltaBotao, RegistrarFaltaForm } from "./faltas-forms"

export const metadata: Metadata = { title: "Faltas justificadas — Confluir" }

const SELECT_FILTRO =
  "border-input bg-background text-foreground h-9 max-w-64 truncate rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

const CLASSE_SITUACAO: Record<SituacaoFalta, string> = {
  aguardando: "border-warning/40 text-warning-fg",
  autorizada: "border-success/40 text-success-fg",
  recusada: "border-destructive/40 text-destructive",
}

function BadgeFalta({ situacao }: { situacao: SituacaoFalta }) {
  return (
    <Badge variant="outline" className={`whitespace-nowrap ${CLASSE_SITUACAO[situacao]}`}>
      {ROTULO_SITUACAO_FALTA[situacao]}
    </Badge>
  )
}

async function LinkComprovacao({ caminho }: { caminho: string | null }) {
  const url = await urlArquivoPessoal(caminho)
  if (!url) return <span className="text-muted-foreground">—</span>
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
      Abrir
    </a>
  )
}

export default async function FaltasPage({
  searchParams,
}: {
  searchParams: Promise<{ ano?: string; funcionario?: string; situacao?: string }>
}) {
  await requirePermissao("pessoal_gestao", ["pessoal_faltas_justificadas"])
  const brutos = await searchParams
  const hoje = hojeSP()
  const ano = /^\d{4}$/.test(brutos.ano ?? "") ? brutos.ano! : hoje.slice(0, 4)

  const [{ disponivel, faltas: doAno }, { faltas: todas }, { config, disponivel: configOk }, funcionarios] =
    await Promise.all([
      listarFaltas({ ano }),
      // Aguardando de qualquer ano: um pedido antigo esquecido não some do radar.
      listarFaltas(),
      lerConfigFaltas(),
      funcionariosParaSelecao(),
    ])
  const aguardando = todas
    .filter((f) => f.situacao === "aguardando")
    .sort((a, b) => (a.data ?? "").localeCompare(b.data ?? ""))
  const anos = [...new Set([hoje.slice(0, 4), ...todas.map((f) => (f.data ?? "").slice(0, 4)).filter(Boolean)])]
    .sort()
    .reverse()

  const situacao = ["aguardando", "autorizada", "recusada"].includes(brutos.situacao ?? "")
    ? (brutos.situacao as SituacaoFalta)
    : null
  const lista = doAno.filter(
    (f) => (!brutos.funcionario || f.funcionarioId === brutos.funcionario) && (!situacao || f.situacao === situacao)
  )

  // Uso por funcionário no ano (as que contam: não recusadas).
  const usoPorFuncionario = new Map<string, number>()
  for (const f of doAno) {
    if (f.situacao === "recusada" || !f.funcionarioId) continue
    usoPorFuncionario.set(f.funcionarioId, (usoPorFuncionario.get(f.funcionarioId) ?? 0) + 1)
  }
  const autorizadasNoAno = doAno.filter((f) => f.situacao === "autorizada").length

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/pessoal">
            <ArrowLeft />
            Pessoal
          </Link>
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Faltas justificadas</h1>
            <p className="text-muted-foreground mt-1 text-xs">
              Pedidos dos funcionários e registros do departamento — limites: {resumoLimites(config)}
            </p>
          </div>
          <Button variant="outline" asChild>
            <Link href="/painel/pessoal/faltas/configuracoes">
              <Settings />
              Configurações
            </Link>
          </Button>
        </div>
      </div>

      {(!disponivel || !configOk) && (
        <Alert>
          <AlertDescription>{AVISO_SQL_FALTAS}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="bg-card rounded-xl border p-4 shadow-xs">
          <p className="text-muted-foreground text-xs">Aguardando autorização</p>
          <p className={`text-3xl font-semibold tabular-nums ${aguardando.length ? "text-warning-fg" : ""}`}>
            {aguardando.length}
          </p>
        </div>
        <div className="bg-card rounded-xl border p-4 shadow-xs">
          <p className="text-muted-foreground text-xs">Autorizadas em {ano}</p>
          <p className="text-3xl font-semibold tabular-nums">{autorizadasNoAno}</p>
        </div>
        <div className="bg-card rounded-xl border p-4 shadow-xs">
          <p className="text-muted-foreground text-xs">Funcionários com falta em {ano}</p>
          <p className="text-3xl font-semibold tabular-nums">{usoPorFuncionario.size}</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Aguardando autorização
            <span className="text-muted-foreground ml-2 text-sm font-normal">{aguardando.length}</span>
          </CardTitle>
          <CardDescription>
            Autorizada, a falta entra como ausência &quot;Falta justificada&quot; do dia e o funcionário
            é avisado. A recusa pede o motivo.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {aguardando.length === 0 ? (
            <p className="text-muted-foreground py-4 text-center text-sm">Nenhum pedido aguardando.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Funcionário</TableHead>
                    <TableHead>Data</TableHead>
                    <TableHead>Justificativa</TableHead>
                    <TableHead>Comprovação</TableHead>
                    <TableHead className="text-right">Decisão</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {aguardando.map((f) => (
                    <TableRow key={f.id}>
                      <TableCell className="max-w-48 font-medium">
                        <span className="line-clamp-1">{f.funcionarioNome ?? "—"}</span>
                        {f.funcionarioId && (
                          <span className="text-muted-foreground text-xs">
                            {usoPorFuncionario.get(f.funcionarioId) ?? 0} no ano
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{formatarData(f.data)}</TableCell>
                      <TableCell className="max-w-72">
                        <span className="line-clamp-2 text-sm">{f.tipo ?? "—"}</span>
                        {f.observacao && <span className="text-muted-foreground line-clamp-2 text-xs">{f.observacao}</span>}
                      </TableCell>
                      <TableCell>
                        <LinkComprovacao caminho={f.comprovacao} />
                      </TableCell>
                      <TableCell className="text-right">
                        <DecisaoFalta id={f.id} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <GrupoColapsavel titulo="Registrar falta" descricao="Lançamento pelo departamento — já autorizada">
        <RegistrarFaltaForm funcionarios={funcionarios} tipos={config.tipos} hoje={hoje} />
      </GrupoColapsavel>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Faltas de {ano}</CardTitle>
          <CardDescription>{lista.length} registro(s)</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <form method="GET" className="flex flex-wrap items-center gap-2">
            <select name="ano" defaultValue={ano} aria-label="Ano" className={SELECT_FILTRO}>
              {anos.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
            <select name="funcionario" defaultValue={brutos.funcionario ?? ""} aria-label="Funcionário" className={SELECT_FILTRO}>
              <option value="">Todos os funcionários</option>
              {funcionarios.map((f) => (
                <option key={f.usuarioId} value={f.usuarioId}>
                  {f.nome}
                </option>
              ))}
            </select>
            <select name="situacao" defaultValue={situacao ?? ""} aria-label="Situação" className={SELECT_FILTRO}>
              <option value="">Todas as situações</option>
              <option value="aguardando">Aguardando</option>
              <option value="autorizada">Autorizadas</option>
              <option value="recusada">Recusadas</option>
            </select>
            <Button type="submit" variant="secondary" size="sm">
              Filtrar
            </Button>
          </form>
          {lista.length === 0 ? (
            <div className="text-muted-foreground flex flex-col items-center gap-2 py-8 text-sm">
              <CalendarCheck className="size-6" />
              Nenhuma falta com estes filtros.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Data</TableHead>
                    <TableHead>Funcionário</TableHead>
                    <TableHead>Justificativa</TableHead>
                    <TableHead>Situação</TableHead>
                    <TableHead className="hidden md:table-cell">Comprovação</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lista.map((f: FaltaJustificada) => (
                    <TableRow key={f.id}>
                      <TableCell className="whitespace-nowrap">{formatarData(f.data)}</TableCell>
                      <TableCell className="max-w-48">
                        <span className="line-clamp-1">{f.funcionarioNome ?? "—"}</span>
                      </TableCell>
                      <TableCell className="max-w-72">
                        <span className="line-clamp-2 text-sm">{f.tipo ?? "—"}</span>
                        {f.situacao === "recusada" && f.motivoRecusa && (
                          <span className="text-destructive line-clamp-2 text-xs">Recusa: {f.motivoRecusa}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <BadgeFalta situacao={f.situacao} />
                        {f.autorizadorNome && f.situacao !== "aguardando" && (
                          <span className="text-muted-foreground block text-xs">
                            {f.autorizadorNome}
                            {f.dataAutorizacao ? `, ${formatarData(f.dataAutorizacao)}` : ""}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <LinkComprovacao caminho={f.comprovacao} />
                      </TableCell>
                      <TableCell className="text-right">
                        <ExcluirFaltaBotao id={f.id} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  )
}
