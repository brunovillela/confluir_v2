import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Download } from "lucide-react"

import { RotuloTrilha } from "@/components/layout/trilha-rotulos"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { requirePermissao } from "@/lib/auth"
import {
  DIA_CORTE,
  SECOES,
  competenciaAtual,
  competenciaValida,
  obterMovimento,
  rotuloCompetencia,
} from "@/lib/db/folha-movimento"
import { formatarData, formatarDataHora, formatarMoeda } from "@/lib/formato"
import { podeAcessar } from "@/lib/permissoes"

import { EnviarCompetenciaForm, ReceberCompetenciaBotao } from "../forms"

export const metadata: Metadata = { title: "Movimento da folha — Confluir" }

export default async function CompetenciaPage({ params }: { params: Promise<{ competencia: string }> }) {
  const sessao = await requirePermissao("pessoal_contabilidade_envio", ["pessoal_contabilidade"])
  const { competencia } = await params
  if (!competenciaValida(competencia)) notFound()
  const envia = sessao.permissoes["pessoal_contabilidade_envio"] === true
  const recebe = sessao.permissoes["pessoal_contabilidade"] === true
  // O escritório externo em geral não abre a ficha; quem é do Pessoal, sim.
  const veFicha = podeAcessar(sessao.permissoes, "pessoal_gestao", ["pessoal_contracheque"])

  const { disponivel, competencia: c, linhas } = await obterMovimento(competencia)
  // A contabilidade só enxerga o que foi enviado.
  if (!c.enviada && !envia) notFound()

  const rotulo = rotuloCompetencia(competencia)
  const hoje = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date())
  const antesDoCorte = competencia === competenciaAtual() && Number(hoje.slice(8, 10)) < DIA_CORTE
  const futura = competencia > competenciaAtual()
  const retroativos = linhas.filter((l) => l.retroativo).length
  const porSecao = SECOES.map((s) => ({ ...s, linhas: linhas.filter((l) => l.secao === s.id) })).filter(
    (s) => s.linhas.length > 0
  )

  return (
    <>
      <RotuloTrilha valores={{ [competencia]: rotulo }} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">Movimento da folha — {rotulo}</h1>
            {c.enviada ? (
              c.recebidaEm ? (
                <Badge variant="success">Recebida</Badge>
              ) : (
                <Badge variant="info">Enviada</Badge>
              )
            ) : (
              <Badge variant="warning">Aberta (prévia)</Badge>
            )}
          </div>
          <p className="text-muted-foreground mt-1 text-xs">
            {c.enviada
              ? `Enviada ${formatarDataHora(c.enviadaEm)}${c.enviadaPor ? ` por ${c.enviadaPor}` : ""}${
                  c.recebidaEm
                    ? ` · recebida ${formatarDataHora(c.recebidaEm)}${c.recebidaPor ? ` por ${c.recebidaPor}` : ""}`
                    : ""
                }. Esta é a fotografia do que foi entregue.`
              : `Calculada agora a partir dos cadastros. Corte no dia ${DIA_CORTE}.`}
          </p>
        </div>
        <Button asChild variant="outline">
          <a href={`/painel/pessoal/contabilidade/${competencia}/csv`}>
            <Download /> Exportar planilha (CSV)
          </a>
        </Button>
      </div>

      {c.observacao && (
        <Alert>
          <AlertDescription className="whitespace-pre-wrap">
            <strong>Observação de quem enviou:</strong> {c.observacao}
          </AlertDescription>
        </Alert>
      )}

      <section className="flex flex-wrap gap-2 text-xs">
        {porSecao.length === 0 ? (
          <span className="text-muted-foreground">Nenhuma alteração nesta competência.</span>
        ) : (
          porSecao.map((s) => (
            <a key={s.id} href={`#${s.id}`} className="hover:bg-muted rounded-md border px-2 py-1">
              {s.titulo}: <strong className="tabular-nums">{s.linhas.length}</strong>
            </a>
          ))
        )}
        {retroativos > 0 && <Badge variant="warning">{retroativos} retroativo(s)</Badge>}
      </section>

      {porSecao.map((s) => (
        <Card key={s.id} id={s.id}>
          <CardHeader>
            <CardTitle className="text-base">
              {s.titulo}{" "}
              {s.evento !== "—" && (
                <span className="text-muted-foreground text-xs font-normal">· eSocial {s.evento}</span>
              )}
            </CardTitle>
            {s.id === "pendencias" && (
              <CardDescription>
                Informativo: dados que faltam no cadastro e podem travar a folha ou o eSocial.
              </CardDescription>
            )}
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Funcionário</TableHead>
                    <TableHead>Descrição</TableHead>
                    <TableHead className="whitespace-nowrap">Vigência</TableHead>
                    <TableHead className="text-right">Qtd.</TableHead>
                    <TableHead className="text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {s.linhas.map((l) => (
                    <TableRow key={l.chave}>
                      <TableCell className="min-w-40 align-top">
                        {veFicha && l.funcionarioId ? (
                          <Link href={`/painel/pessoal/${l.funcionarioId}`} className="font-medium hover:underline">
                            {l.nome ?? "—"}
                          </Link>
                        ) : (
                          <span className="font-medium">{l.nome ?? (l.funcionarioId ? "—" : "Todos")}</span>
                        )}
                        {(l.cpf || l.matricula) && (
                          <span className="text-muted-foreground block text-xs">
                            {[l.cpf && `CPF ${l.cpf}`, l.matricula && `mat. ${l.matricula}`].filter(Boolean).join(" · ")}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="min-w-64 align-top whitespace-normal">
                        {envia && l.origem ? (
                          <Link href={l.origem} className="hover:underline">
                            {l.descricao}
                          </Link>
                        ) : (
                          l.descricao
                        )}
                        {l.retroativo && (
                          <Badge variant="warning" className="ml-2">
                            Retroativo
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="align-top whitespace-nowrap">
                        {l.inicio ? formatarData(l.inicio) : "—"}
                        {l.fim && l.fim !== l.inicio ? ` – ${formatarData(l.fim)}` : ""}
                      </TableCell>
                      <TableCell className="text-right align-top tabular-nums">
                        {l.quantidade !== null ? l.quantidade.toLocaleString("pt-BR") : "—"}
                      </TableCell>
                      <TableCell className="text-right align-top whitespace-nowrap tabular-nums">
                        {l.valor !== null ? formatarMoeda(l.valor) : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ))}

      {!c.enviada && envia && disponivel && !futura && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Enviar à contabilidade</CardTitle>
            <CardDescription>
              Confira as linhas acima (cada uma leva ao lançamento de origem). Enviada, a contabilidade é avisada e a
              competência fica congelada.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <EnviarCompetenciaForm
              competencia={competencia}
              rotulo={rotulo}
              total={linhas.length}
              antesDoCorte={antesDoCorte}
            />
          </CardContent>
        </Card>
      )}

      {c.enviada && !c.recebidaEm && recebe && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recebimento</CardTitle>
            <CardDescription>Confirme que o escritório recebeu e vai processar esta competência.</CardDescription>
          </CardHeader>
          <CardContent>
            <ReceberCompetenciaBotao competencia={competencia} />
          </CardContent>
        </Card>
      )}
    </>
  )
}
