import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, CheckCircle2, CircleAlert } from "lucide-react"

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
import { listarDepartamentos } from "@/lib/db/compras"
import {
  centrosDeCustoParaFolha,
  dadosBancariosDosFuncionarios,
  obterConfigContracheques,
} from "@/lib/db/contracheques-ordens"
import { funcionariosParaSelecao } from "@/lib/db/pessoal"
import { podeAcessar } from "@/lib/permissoes"

import { faixasHoraExtra } from "@/lib/db/ponto-config"
import { configHE, remessasCCParaPonto, sugerirRubricas } from "@/lib/db/ponto-horas-pagas"

import { ConfigContrachequesForm } from "./config-form"
import { ConfigHEForm } from "./he-form"

export const metadata: Metadata = { title: "Configuração dos contracheques — Confluir" }

// A sugestão de rubricas abre os PDFs de uma remessa.
export const maxDuration = 120

export default async function ConfiguracaoContrachequesPage({ searchParams }: { searchParams: Promise<{ sugerir?: string }> }) {
  const sessao = await requirePermissao("pessoal_gestao")
  const { sugerir } = await searchParams
  const [config, centros, departamentos, funcionarios, he, faixas, remessasCC] = await Promise.all([
    obterConfigContracheques(),
    centrosDeCustoParaFolha(),
    listarDepartamentos(),
    funcionariosParaSelecao(),
    configHE(),
    faixasHoraExtra(),
    remessasCCParaPonto(null),
  ])
  const sugestao = sugerir && remessasCC.some((r) => r.id === sugerir) ? await sugerirRubricas(sugerir) : null
  const contas = await dadosBancariosDosFuncionarios(funcionarios.map((f) => f.usuarioId))
  const semConta = funcionarios.filter((f) => {
    const c = contas.get(f.usuarioId)
    return !c || (!c.conta && !c.pix)
  })
  const cadastraCentros = podeAcessar(sessao.permissoes, "financeiro_pagamento", ["financeiro_caixa"])

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/pessoal/contracheques">
            <ArrowLeft />
            Remessas de contracheques
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Configuração dos contracheques</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Como o registro do contracheque vira ordem de pagamento no Financeiro.
        </p>
      </div>

      {!config.disponivel && (
        <Alert variant="warning">
          <AlertDescription>
            Rode <code>supabase/pessoal-contracheques-ordens.sql</code> no Supabase para ativar a
            geração de ordens a partir dos contracheques.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ordem de pagamento da folha</CardTitle>
          <CardDescription>
            Vale para todo contracheque registrado daqui em diante. O vencimento sai da data de
            pagamento da remessa; o valor, do líquido informado no contracheque.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <ConfigContrachequesForm config={config} centros={centros} departamentos={departamentos} />
          <p className="text-muted-foreground text-xs">
            {centros.length === 0 ? "Nenhum centro de custo cadastrado. " : "Não achou o centro de custo? "}
            {cadastraCentros ? (
              <Link href="/painel/financeiro/centros-custo" className="text-foreground underline underline-offset-4">
                Cadastre em Financeiro → Centros de custo
              </Link>
            ) : (
              "Peça ao Financeiro para cadastrá-lo em Centros de custo."
            )}
          </p>
        </CardContent>
      </Card>

      <Card id="horas-extras">
        <CardHeader>
          <CardTitle className="text-base">Horas extras no contracheque</CardTitle>
          <CardDescription>
            Para o Controle de ponto preencher as horas extras pagas (e o valor pago) a partir de uma remessa de
            contracheques. O PDF é lido aqui, no servidor, pelo texto: só as linhas destas rubricas são usadas, e nada
            vai à IA sem as opções abaixo.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {!he.disponivel ? (
            <Alert variant="warning">
              <AlertDescription>A migração das horas pagas ainda não foi aplicada neste banco.</AlertDescription>
            </Alert>
          ) : (
            <>
              <form className="flex flex-wrap items-end gap-2 text-sm" action="/painel/pessoal/contracheques/configuracao#horas-extras">
                <label className="grid gap-1">
                  <span className="text-muted-foreground text-xs">Procurar rubricas de hora extra nos contracheques de</span>
                  <select name="sugerir" defaultValue={sugerir ?? ""} className="border-input bg-background h-9 rounded-md border px-2 text-sm [color-scheme:light] dark:[color-scheme:dark]">
                    <option value="">Escolha a remessa</option>
                    {remessasCC.filter((r) => r.itens > 0).map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.nome} ({r.itens})
                      </option>
                    ))}
                  </select>
                </label>
                <Button type="submit" variant="outline">Procurar</Button>
              </form>
              {sugestao && (
                <p className="text-muted-foreground text-xs">
                  {sugestao.lidos} contracheque(s) lido(s) pelo texto
                  {sugestao.semTexto > 0 && `, ${sugestao.semTexto} escaneado(s) sem texto`}
                  {sugestao.sugestoes.length === 0 && ": nenhuma linha com cara de hora extra. Digite as rubricas abaixo."}
                  {sugestao.sugestoes.length > 0 && ". Só o código e a descrição aparecem aqui, sem valores."}
                </p>
              )}
              <ConfigHEForm config={he} faixas={faixas} sugestoes={sugestao?.sugestoes ?? []} />
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            Dados bancários dos funcionários
            {semConta.length === 0 ? (
              <Badge variant="outline" className="border-success/40 text-success-fg">
                todos cadastrados
              </Badge>
            ) : (
              <Badge variant="warning">{semConta.length} sem conta nem Pix</Badge>
            )}
          </CardTitle>
          <CardDescription>
            A ordem de pagamento leva a conta ou a chave Pix do funcionário. Sem elas, a ordem é
            gerada mesmo assim, mas o Financeiro não tem para onde pagar. Cadastre na ficha de cada
            funcionário.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>Funcionário</TableHead>
                  <TableHead>Conta</TableHead>
                  <TableHead>Pix</TableHead>
                  <TableHead className="text-right">Ficha</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {funcionarios.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-muted-foreground h-16 text-center text-sm">
                      Nenhum funcionário ativo.
                    </TableCell>
                  </TableRow>
                )}
                {funcionarios.map((f) => {
                  const c = contas.get(f.usuarioId)
                  return (
                    <TableRow key={f.usuarioId}>
                      <TableCell className="font-medium">{f.nome}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {c?.conta ? (
                          <span className="inline-flex items-center gap-1">
                            <CheckCircle2 className="text-success-fg size-3.5" />
                            {[c.banco ?? c.bancoCodigo, c.agencia && `ag. ${c.agencia}`, c.conta].filter(Boolean).join(" · ")}
                          </span>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {c?.pix ? (
                          <span className="inline-flex items-center gap-1">
                            <CheckCircle2 className="text-success-fg size-3.5" />
                            {c.pixTipo ?? "Pix"}
                            {c.preferePix && <Badge variant="outline">preferido</Badge>}
                          </span>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Link
                          href={`/painel/pessoal/${f.usuarioId}#dados-bancarios`}
                          className="inline-flex items-center gap-1 text-sm underline-offset-4 hover:underline"
                        >
                          {!c?.conta && !c?.pix && <CircleAlert className="text-warning-fg size-3.5" />}
                          {c?.conta || c?.pix ? "Ver" : "Cadastrar"}
                        </Link>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </>
  )
}
