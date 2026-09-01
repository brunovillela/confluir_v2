import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, RotateCcw, TriangleAlert } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { requirePermissao } from "@/lib/auth"
import { buscarProcesso, conciliar } from "@/lib/db/filiacao-coletiva"
import { formatarCnpjCpf, formatarData } from "@/lib/formato"

import {
  AplicarProcesso,
  ExcluirProcesso,
  ReverterProcesso,
} from "../coletiva-forms"
import { SituacaoBadge } from "../page"

export const metadata: Metadata = { title: "Filiação coletiva — Confluir" }

const ROTULO_CHAVE: Record<string, string> = {
  cpf: "CPF",
  matricula: "matrícula",
  email: "e-mail",
  nome: "nome",
  manual: "escolha do gestor",
  nenhum: "—",
}

const ROTULO_RESULTADO: Record<string, string> = {
  mantido_ativo: "Já era ativo",
  criado: "Cadastro criado",
  recarimbado: "Condição alterada",
  duvida: "Dúvida",
  ignorado: "Ignorado",
  desistiu: "Desistiu no prazo",
}

export default async function ProcessoColetivoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermissao("assembleias")
  const { id } = await params
  const dados = await buscarProcesso(id)
  if (!dados) notFound()
  const { processo, itens } = dados

  // rascunho: mostra o PLANO (nada gravado ainda). aplicado: mostra o efeito.
  const rascunho = processo.situacao === "rascunho"
  const conciliacao = rascunho ? await conciliar(processo.rodadaId!) : null

  return (
    <>
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3">
          <Link href="/painel/representacao/filiacao-coletiva">
            <ArrowLeft />
            Filiação coletiva
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            {processo.titulo ?? "(sem título)"}
          </h1>
          <SituacaoBadge situacao={processo.situacao} />
        </div>
        <p className="text-muted-foreground mt-1 text-xs">
          Rodada: {processo.rodadaNome ?? "—"}
          {processo.acordoTitulo ? ` · ACT: ${processo.acordoTitulo}` : ""} ·
          prazo de desistência: {processo.dias ?? "—"} dias
          {processo.prazo_ate ? ` (até ${formatarData(processo.prazo_ate)})` : ""}
        </p>
      </div>

      {processo.situacao === "revertido" && (
        <Alert variant="destructive">
          <AlertDescription>
            Processo revertido em{" "}
            {processo.revertido_em
              ? formatarData(processo.revertido_em.slice(0, 10))
              : "—"}{" "}
            — as filiações criadas foram excluídas e as demais voltaram à
            condição anterior.
          </AlertDescription>
        </Alert>
      )}

      {/* Resumo da conciliação (rascunho) ou do resultado (aplicado) */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {rascunho && conciliacao ? (
          <>
            <Indicador titulo="Aptos na rodada" valor={conciliacao.resumo.total} />
            <Indicador
              titulo="Já ativos (nada muda)"
              valor={conciliacao.resumo.mantidos}
            />
            <Indicador
              titulo="Serão cadastrados"
              valor={conciliacao.resumo.aCriar}
            />
            <Indicador
              titulo="Mudam de condição"
              valor={conciliacao.resumo.aRecarimbar}
            />
          </>
        ) : (
          <>
            <Indicador titulo="Aptos processados" valor={processo.totais.total} />
            <Indicador titulo="Cadastros criados" valor={processo.totais.criados} />
            <Indicador
              titulo="Condições alteradas"
              valor={processo.totais.recarimbados}
            />
            <Indicador
              titulo="Já ativos"
              valor={processo.totais.mantidos}
            />
          </>
        )}
      </div>

      {!rascunho && (processo.totais.desistiram > 0 || processo.totais.ativados > 0) && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Indicador
            titulo="Desistiram no prazo"
            valor={processo.totais.desistiram}
          />
          <Indicador titulo="Já ativados" valor={processo.totais.ativados} />
        </div>
      )}

      {rascunho && conciliacao && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Conciliação — revise antes de aplicar
            </CardTitle>
            <CardDescription>
              O casamento usa CPF, matrícula e e-mail automaticamente. Quando só
              o nome bate, vira dúvida para você decidir — nada é gravado até
              você aplicar.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {conciliacao.resumo.duvidas > 0 && (
              <Alert className="border-warning/40 text-warning-fg">
                <AlertDescription>
                  <TriangleAlert className="mr-1 inline size-4 align-[-3px]" />
                  {conciliacao.resumo.duvidas} apto(s) casaram só pelo nome —
                  resolva abaixo antes de aplicar.
                </AlertDescription>
              </Alert>
            )}
            <AplicarProcesso
              id={processo.id}
              resumo={conciliacao.resumo}
              duvidas={conciliacao.itens
                .filter((i) => i.resultado === "duvida")
                .map((i) => ({
                  aptoId: i.aptoId,
                  nome: i.nome,
                  cpf: i.cpf ? formatarCnpjCpf(i.cpf) : null,
                  candidatos: i.candidatos.map((c) => ({
                    ...c,
                    cpf: c.cpf ? formatarCnpjCpf(c.cpf) : null,
                  })),
                }))}
            />

            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Apto</TableHead>
                    <TableHead className="hidden md:table-cell">CPF</TableHead>
                    <TableHead className="hidden lg:table-cell">Casou por</TableHead>
                    <TableHead>O que acontece</TableHead>
                    <TableHead className="hidden sm:table-cell">
                      Condição atual
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {conciliacao.itens.slice(0, 300).map((i) => (
                    <TableRow key={i.aptoId}>
                      <TableCell className="max-w-56 truncate font-medium">
                        {i.nome ?? "(sem nome)"}
                      </TableCell>
                      <TableCell className="text-muted-foreground hidden whitespace-nowrap md:table-cell">
                        {i.cpf ? formatarCnpjCpf(i.cpf) : "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground hidden lg:table-cell">
                        {ROTULO_CHAVE[i.chave] ?? i.chave}
                      </TableCell>
                      <TableCell>
                        <ResultadoBadge resultado={i.resultado} />
                      </TableCell>
                      <TableCell className="text-muted-foreground hidden max-w-40 truncate sm:table-cell">
                        {i.condicaoAtual ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            {conciliacao.itens.length > 300 && (
              <p className="text-muted-foreground text-xs">
                Mostrando os 300 primeiros de {conciliacao.itens.length}. Todos
                serão processados.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {!rascunho && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pessoas do processo</CardTitle>
            <CardDescription>
              O que aconteceu com cada apto e onde cada um está agora.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Pessoa</TableHead>
                    <TableHead className="hidden md:table-cell">CPF</TableHead>
                    <TableHead>Resultado</TableHead>
                    <TableHead className="hidden lg:table-cell">
                      Condição anterior
                    </TableHead>
                    <TableHead className="hidden sm:table-cell">
                      Condição atual
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {itens.length === 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="text-muted-foreground h-16 text-center text-sm"
                      >
                        Nenhum item registrado.
                      </TableCell>
                    </TableRow>
                  )}
                  {itens.map((i) => (
                    <TableRow key={i.id}>
                      <TableCell className="max-w-56 truncate font-medium">
                        {i.filiacao_id ? (
                          <Link
                            href={`/painel/filiados/${i.filiacao_id}`}
                            className="hover:underline"
                          >
                            {i.nome_completo ?? "(sem nome)"}
                          </Link>
                        ) : (
                          (i.nome_completo ?? "(sem nome)")
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground hidden whitespace-nowrap md:table-cell">
                        {i.cpf ? formatarCnpjCpf(i.cpf) : "—"}
                      </TableCell>
                      <TableCell>
                        <ResultadoBadge resultado={i.resultado ?? ""} />
                      </TableCell>
                      <TableCell className="text-muted-foreground hidden max-w-40 truncate lg:table-cell">
                        {i.condicao_anterior ?? "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground hidden max-w-40 truncate sm:table-cell">
                        {i.condicaoAtual ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {processo.situacao === "processado" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-destructive text-base">
              <RotateCcw className="mr-1 inline size-4 align-[-3px]" />
              Reverter o processo
            </CardTitle>
            <CardDescription>
              Desfaz o lote inteiro. Exige confirmação por senha — é uma ação
              de massa, sem volta.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ReverterProcesso id={processo.id} />
          </CardContent>
        </Card>
      )}

      {rascunho && (
        <Card>
          <CardHeader>
            <CardTitle className="text-destructive text-base">
              Excluir rascunho
            </CardTitle>
            <CardDescription>
              Nada foi gravado ainda — excluir apenas descarta este processo.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ExcluirProcesso id={processo.id} />
          </CardContent>
        </Card>
      )}
    </>
  )
}

function Indicador({ titulo, valor }: { titulo: string; valor: number }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-muted-foreground text-xs">{titulo}</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">{valor}</p>
      </CardContent>
    </Card>
  )
}

function ResultadoBadge({ resultado }: { resultado: string }) {
  const rotulo = ROTULO_RESULTADO[resultado] ?? resultado
  if (resultado === "criado") {
    return (
      <Badge variant="outline" className="border-success/40 text-success-fg">
        {rotulo}
      </Badge>
    )
  }
  if (resultado === "duvida") {
    return (
      <Badge variant="outline" className="border-warning/40 text-warning-fg">
        {rotulo}
      </Badge>
    )
  }
  if (resultado === "desistiu" || resultado === "ignorado") {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        {rotulo}
      </Badge>
    )
  }
  return <Badge variant="secondary">{rotulo}</Badge>
}
