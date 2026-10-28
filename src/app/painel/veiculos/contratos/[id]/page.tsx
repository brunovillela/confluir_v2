import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, ExternalLink, History } from "lucide-react"

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
import { GrupoColapsavel } from "@/components/grupo-colapsavel"
import { AcoesLinhaOrdem } from "@/app/painel/compras/contratos/[id]/ordens-contrato"
import { requirePermissao } from "@/lib/auth"
import { rotuloCentroCusto } from "@/lib/centros-custo-rotulo"
import { listarDepartamentos, listarFornecedores } from "@/lib/db/compras"
import { ordemMexivelPeloContrato } from "@/lib/db/contratos"
import { listarCentrosCusto } from "@/lib/db/financeiro"
import {
  buscarContrato,
  historicoDoContrato,
  listarUsuariosAtivos,
  urlArquivoVeiculos,
} from "@/lib/db/veiculos"
import { formatarData, formatarDataHora, formatarMoeda } from "@/lib/formato"

import { editarOrdemAluguelAction, excluirOrdemAluguelAction } from "../actions"
import {
  EditarContratoDialog,
  FinalizarContratoForm,
  GerarOrdemAluguelForm,
  ProrrogarContratoDialog,
} from "../contrato-forms"

export const metadata: Metadata = { title: "Contrato de aluguel — Confluir" }

export default async function ContratoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ salvo?: string }>
}) {
  await requirePermissao("veiculos_gestao")
  const { id } = await params
  const { salvo } = await searchParams

  const contrato = await buscarContrato(id)
  if (!contrato) notFound()
  // Paga, em processamento ou encerrada: sem lápis (o servidor confere de novo).
  const temMexivel = contrato.ordens.some(ordemMexivelPeloContrato)

  const [arquivoUrl, historico, fornecedores, usuarios, departamentos, centros] =
    await Promise.all([
      urlArquivoVeiculos(contrato.arquivo_contrato_url),
      historicoDoContrato(id),
      listarFornecedores(),
      listarUsuariosAtivos(),
      listarDepartamentos(),
      listarCentrosCusto(),
    ])
  const valorMensalTexto =
    contrato.valor_mensal?.toLocaleString("pt-BR", { minimumFractionDigits: 2 }) ?? ""

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2">
          <Link href="/painel/veiculos/contratos">
            <ArrowLeft />
            Contratos de aluguel
          </Link>
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex flex-wrap items-center gap-3 text-2xl font-semibold tracking-tight">
              Contrato {contrato.numero ?? "(sem número)"}
              {contrato.finalizado ? (
                <Badge variant="outline" className="text-muted-foreground">
                  Finalizado
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="border-success/40 text-success-fg"
                >
                  Vigente
                </Badge>
              )}
            </h1>
            <p className="text-muted-foreground mt-1 text-xs">
              {contrato.fornecedorNome ?? "locadora não informada"} ·{" "}
              {formatarData(contrato.vigencia_inicio)} →{" "}
              {formatarData(contrato.vigencia_termino)}
              {contrato.responsavelNome
                ? ` · responsável: ${contrato.responsavelNome}`
                : ""}
            </p>
            {contrato.finalidade && (
              <p className="text-muted-foreground mt-1 text-xs">
                <span className="text-foreground font-medium">Finalidade:</span>{" "}
                {contrato.finalidade}
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-start gap-2">
            <EditarContratoDialog
              contratoId={contrato.id}
              atual={{
                numero: contrato.numero,
                fornecedor_id: contrato.fornecedor_id,
                responsavel_id: contrato.responsavel_id,
                vigencia_inicio: contrato.vigencia_inicio,
                vigencia_termino: contrato.vigencia_termino,
                valor_mensal: valorMensalTexto,
                finalidade: contrato.finalidade,
                centro_custo_id: contrato.centro_custo_id,
                departamento_id: contrato.departamento_id,
                temArquivo: Boolean(contrato.arquivo_contrato_url),
              }}
              opcoes={{
                fornecedores: fornecedores.map((f) => ({
                  id: f.id,
                  nome: f.nome,
                  cnpj_cpf: f.cnpj_cpf,
                  razao: f.nome_razao ?? null,
                  bloqueado: f.bloqueado,
                })),
                usuarios: usuarios.map((u) => ({ id: u.id, rotulo: u.nome })),
                departamentos: departamentos.map((d) => ({ id: d.id, rotulo: d.nome })),
                centrosCusto: centros.map((c) => ({
                  id: String(c.id),
                  rotulo: rotuloCentroCusto(c),
                })),
              }}
            />
            {!contrato.finalizado && (
              <ProrrogarContratoDialog
                contratoId={contrato.id}
                terminoAtual={contrato.vigencia_termino}
                valorAtual={valorMensalTexto}
              />
            )}
            {!contrato.finalizado && (
              <FinalizarContratoForm contratoId={contrato.id} />
            )}
          </div>
        </div>
      </div>

      {salvo && (
        <Alert variant="success">
          <AlertDescription>Registro salvo.</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="grid gap-2 text-sm">
            <p className="font-medium">Veículos vinculados</p>
            {contrato.veiculos.length === 0 ? (
              <p className="text-muted-foreground">
                Nenhum veículo vinculado — faça o vínculo na ficha do veículo.
              </p>
            ) : (
              contrato.veiculos.map((v) => (
                <Link
                  key={v.id}
                  href={`/painel/veiculos/${v.id}`}
                  className="text-primary hover:underline"
                >
                  {v.placa ?? "s/ placa"} — {v.marca_modelo ?? ""}
                </Link>
              ))
            )}
            {arquivoUrl && (
              <a
                href={arquivoUrl}
                target="_blank"
                rel="noreferrer"
                className="text-primary mt-2 flex items-center gap-1.5 hover:underline"
              >
                <ExternalLink className="size-3.5" />
                Contrato assinado
              </a>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="grid gap-2 text-sm">
            <p className="font-medium">Mensalidade contratada</p>
            <p className="text-2xl font-semibold tabular-nums">
              {formatarMoeda(contrato.valor_mensal)}
            </p>
            {!contrato.finalizado && (
              <GerarOrdemAluguelForm
                contratoId={contrato.id}
                valorPadrao={valorMensalTexto}
              />
            )}
          </CardContent>
        </Card>
      </div>

      <GrupoColapsavel
        titulo="Ordens de pagamento do contrato"
        descricao="Cobranças geradas aqui e ordens legadas vinculadas pelo backfill — o lápis edita a ordem enquanto não estiver paga nem em processamento; o código abre a ordem no Financeiro"
        resumo={
          <span className="text-muted-foreground text-sm tabular-nums">
            {contrato.ordens.length}
          </span>
        }
        aberto
      >
        {contrato.ordens.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Nenhuma ordem vinculada a este contrato.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead>Situação</TableHead>
                {temMexivel && <TableHead className="w-24" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {contrato.ordens.map((o) => (
                <TableRow key={o.id}>
                  <TableCell className="whitespace-nowrap tabular-nums">
                    <Link
                      href={`/painel/financeiro/ordens/${o.id}`}
                      className="text-primary hover:underline"
                    >
                      {o.codigo ?? "—"}
                    </Link>
                  </TableCell>
                  <TableCell className="max-w-80">
                    <span className="line-clamp-1">{o.descricao ?? "—"}</span>
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap tabular-nums">
                    {formatarMoeda(o.valor)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {formatarData(o.vencimento)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {o.situacao ?? "—"}
                  </TableCell>
                  {temMexivel && (
                    <TableCell>
                      {ordemMexivelPeloContrato(o) && (
                        <AcoesLinhaOrdem
                          contratoId={contrato.id}
                          ordem={{
                            id: o.id,
                            codigo: o.codigo,
                            descricao: o.descricao,
                            valor: o.valor,
                            vencimento: o.vencimento,
                            situacao: o.situacao,
                          }}
                          acaoEditarOrdem={editarOrdemAluguelAction}
                          acaoExcluirOrdem={excluirOrdemAluguelAction}
                          origemRotulo="contrato de locação"
                        />
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </GrupoColapsavel>

      <GrupoColapsavel
        titulo="Histórico do contrato"
        descricao="Edições e prorrogações, com quem fez, o antes e o depois e o aditivo"
        resumo={
          <span className="text-muted-foreground text-sm tabular-nums">
            {historico.length}
          </span>
        }
      >
        {historico.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Nenhuma edição ou prorrogação registrada.
          </p>
        ) : (
          <ul className="grid gap-3">
            {historico.map((h) => (
              <li key={h.id} className="grid gap-1 border-l-2 pl-3 text-sm">
                <p className="flex flex-wrap items-center gap-2">
                  <History className="text-muted-foreground size-3.5" />
                  <span className="font-medium">
                    {h.evento === "prorrogado" ? "Prorrogado" : "Editado"}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {formatarDataHora(h.quando)}
                    {h.autor ? ` · ${h.autor}` : ""}
                  </span>
                </p>
                {h.mudancas.map((m) => (
                  <p key={m} className="text-muted-foreground text-xs">
                    {m}
                  </p>
                ))}
                {h.motivo && <p className="text-xs">{h.motivo}</p>}
                {h.aditivoUrl && (
                  <a
                    href={h.aditivoUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary flex items-center gap-1.5 text-xs hover:underline"
                  >
                    <ExternalLink className="size-3.5" />
                    Aditivo assinado
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </GrupoColapsavel>
    </>
  )
}
