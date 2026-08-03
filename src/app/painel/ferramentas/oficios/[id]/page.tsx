import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Download, Printer } from "lucide-react"

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
import { assinantesVigentes } from "@/lib/db/diretoria"
import {
  candidatosDaEmpresa,
  listarEmpresas,
  obterOficio,
  proximoNumeroDoAno,
} from "@/lib/db/oficios"
import { listarSedes } from "@/lib/db/organizacao"
import { formatarData } from "@/lib/formato"
import {
  eAutomatico,
  limparFormatacaoBubble,
  ROTULOS_TIPO_OFICIO,
  type TipoOficio,
} from "@/lib/oficios-constantes"

import { atualizarOficioAction } from "../actions"
import { OficioForm } from "../oficio-form"
import {
  AdicionarManual,
  CandidatosForm,
  CancelarOficio,
  EmitirOficio,
  RemoverFiliado,
} from "./oficio-acoes"

export const metadata: Metadata = { title: "Ofício — Confluir" }

export default async function OficioPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermissao("ferramentas_oficios")
  const { id } = await params

  const oficio = await obterOficio(id)
  if (!oficio) notFound()

  const rascunho = oficio.situacao === "Rascunho"
  const automatico = eAutomatico(oficio.tipo)

  const [empresas, { sedes }, assinantes, proximoNumero, candidatos] =
    await Promise.all([
      rascunho ? listarEmpresas() : Promise.resolve([]),
      rascunho ? listarSedes() : Promise.resolve({ disponivel: true, sedes: [] }),
      rascunho ? assinantesVigentes() : Promise.resolve([]),
      rascunho ? proximoNumeroDoAno(oficio.data) : Promise.resolve(0),
      rascunho && automatico && oficio.destinatarioEmpresaId
        ? candidatosDaEmpresa(
            oficio.destinatarioEmpresaId,
            oficio.tipo as "desfiliacao" | "filiacao",
            {}
          )
        : Promise.resolve([]),
    ])

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/painel/ferramentas/oficios">
            <ArrowLeft />
            Ofícios
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/oficio/${id}/pdf`} target="_blank">
              <Download />
              Baixar PDF
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href={`/oficio/${id}`} target="_blank">
              <Printer />
              Imprimir
            </Link>
          </Button>
          {rascunho && <CancelarOficio oficioId={id} />}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          {oficio.numero != null
            ? `Ofício ${oficio.numero}/${oficio.ano}`
            : "Ofício (rascunho)"}
        </h1>
        <Badge variant="outline">
          {oficio.tipo
            ? ROTULOS_TIPO_OFICIO[oficio.tipo as TipoOficio] ?? oficio.tipo
            : "—"}
        </Badge>
        <Badge
          variant="outline"
          className={
            oficio.situacao === "Emitido"
              ? "border-success/40 text-success-fg"
              : oficio.situacao === "Cancelado"
                ? "text-muted-foreground line-through"
                : "border-warning/40 text-warning-fg"
          }
        >
          {oficio.situacao}
        </Badge>
      </div>

      {/* Cabeçalho de dados (edição no rascunho, leitura depois) */}
      {rascunho ? (
        <Card>
          <CardContent className="pt-6">
            <OficioForm
              action={atualizarOficioAction}
              dados={{
                id: oficio.id,
                tipo: oficio.tipo,
                data: oficio.data,
                sedeId: oficio.sedeId,
                destinatarioEmpresaId: oficio.destinatarioEmpresaId,
                destinatarioTexto: oficio.destinatarioTexto,
                aosCuidados: oficio.aosCuidados,
                assunto: oficio.assunto,
                corpo: oficio.corpo,
                assinanteIntegranteId: oficio.assinanteIntegranteId,
              }}
              empresas={empresas.map((e) => ({ ...e }))}
              sedes={sedes.map((s) => ({ id: s.id, nome: s.nome ?? "Sede" }))}
              assinantes={assinantes}
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
            <Campo rotulo="Destinatário" valor={oficio.destinatarioNome ?? oficio.destinatarioTexto} />
            <Campo rotulo="Assunto" valor={oficio.assunto} />
            <Campo rotulo="Data" valor={oficio.data ? formatarData(oficio.data) : null} />
            <Campo
              rotulo="Assinante"
              valor={
                oficio.assinanteNome
                  ? `${oficio.assinanteNome}${oficio.assinanteCargo ? ` — ${oficio.assinanteCargo}` : ""}`
                  : null
              }
            />
            {oficio.corpo && (
              <div className="sm:col-span-2">
                <p className="text-muted-foreground text-xs">Corpo</p>
                <p className="mt-0.5 whitespace-pre-wrap">
                  {limparFormatacaoBubble(oficio.corpo)}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Lista de pessoas */}
      {(automatico || oficio.filiados.length > 0) && (
        <Card>
          <CardContent>
            <p className="mb-3 text-sm font-medium">
              Pessoas{" "}
              <span className="text-muted-foreground font-normal">
                ({oficio.filiados.length})
              </span>
            </p>

            {oficio.filiados.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Matrícula</TableHead>
                    {rascunho && <TableHead className="w-10" />}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {oficio.filiados.map((f) => (
                    <TableRow key={f.id}>
                      <TableCell>{f.nome ?? "—"}</TableCell>
                      <TableCell className="tabular-nums">
                        {f.matricula ?? "—"}
                      </TableCell>
                      {rascunho && (
                        <TableCell className="py-1">
                          <RemoverFiliado filiadoId={f.id} oficioId={id} />
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-muted-foreground text-sm">
                Nenhuma pessoa na lista ainda.
              </p>
            )}

            {rascunho && (
              <div className="mt-4 grid gap-4">
                {automatico && oficio.destinatarioEmpresaId && (
                  <div>
                    <p className="text-muted-foreground mb-2 text-xs font-medium uppercase">
                      Carregar da fonte pagadora
                    </p>
                    <CandidatosForm
                      oficioId={id}
                      empresaId={oficio.destinatarioEmpresaId}
                      tipo={oficio.tipo ?? ""}
                      candidatos={candidatos}
                    />
                  </div>
                )}
                {automatico && !oficio.destinatarioEmpresaId && (
                  <p className="text-muted-foreground text-sm">
                    Defina a empresa destinatária acima e salve para carregar a lista.
                  </p>
                )}
                <div>
                  <p className="text-muted-foreground mb-2 text-xs font-medium uppercase">
                    Adicionar manualmente
                  </p>
                  <AdicionarManual oficioId={id} />
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Emissão */}
      {rascunho && (
        <Card>
          <CardContent className="pt-6">
            <p className="mb-1 text-sm font-medium">Emitir ofício</p>
            <p className="text-muted-foreground mb-3 text-sm">
              Ao emitir, o número é atribuído e o documento fica travado. O número
              sugerido é o próximo do ano — ajuste na primeira emissão se estiver
              continuando de uma numeração anterior.
            </p>
            <EmitirOficio oficioId={id} proximoNumero={proximoNumero} />
          </CardContent>
        </Card>
      )}
    </>
  )
}

function Campo({ rotulo, valor }: { rotulo: string; valor: string | null }) {
  return (
    <div>
      <p className="text-muted-foreground text-xs">{rotulo}</p>
      <p className="mt-0.5">{valor ?? "—"}</p>
    </div>
  )
}
