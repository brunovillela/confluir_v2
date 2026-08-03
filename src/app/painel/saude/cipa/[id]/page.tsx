import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { CircleCheck, FileText, Pencil, Users } from "lucide-react"

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
import { buscarReuniaoCipa, urlAta } from "@/lib/db/cipa"
import { empresasParaSelecao, usuariosAtivos } from "@/lib/db/cipa-apoio"
import { formatarData } from "@/lib/formato"

import { SituacaoBadge } from "../page"
import {
  AtaForm,
  ComparecimentoBotao,
  ExcluirReuniaoBotao,
  RemoverRepresentanteBotao,
  RepresentanteForm,
  ReuniaoForm,
} from "../cipa-forms"

export const metadata: Metadata = { title: "Reunião de CIPA — Confluir" }

export default async function ReuniaoCipaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ editar?: string; salvo?: string; ata?: string }>
}) {
  await requirePermissao("saude_cat", ["saude_atendimento", "saude_gestao"])

  const { id } = await params
  const { editar, salvo, ata } = await searchParams
  const reuniao = await buscarReuniaoCipa(id)
  if (!reuniao) notFound()

  if (editar === "1") {
    const empresas = await empresasParaSelecao()
    return (
      <>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            Editar reunião
          </h1>
          <Button variant="outline" asChild>
            <Link href={`/painel/saude/cipa/${id}`}>Cancelar</Link>
          </Button>
        </div>
        <ReuniaoForm reuniao={reuniao} empresas={empresas} />
      </>
    )
  }

  const [linkAta, usuarios] = await Promise.all([
    urlAta(reuniao.ata_arquivo),
    usuariosAtivos(),
  ])
  const presentes = reuniao.representantes.filter((r) => r.compareceu).length

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {reuniao.empresaNome ?? "Reunião de CIPA"}
          </h1>
          <p className="text-muted-foreground mt-1 text-xs">
            {formatarData(reuniao.data_reuniao)}
            {reuniao.unidade && ` · ${reuniao.unidade}`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" asChild>
            <Link href={`/painel/saude/cipa/${id}?editar=1`}>
              <Pencil />
              Editar
            </Link>
          </Button>
          <ExcluirReuniaoBotao id={id} />
          <Button variant="outline" asChild>
            <Link href="/painel/saude/cipa">Voltar à lista</Link>
          </Button>
        </div>
      </div>

      {(salvo || ata) && (
        <Alert variant="success">
          <CircleCheck />
          <AlertDescription>
            {ata ? "Ata enviada." : "Reunião salva."}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-4">
        <Card>
          <CardContent>
            <p className="text-muted-foreground text-xs">Situação</p>
            <div className="mt-2">
              <SituacaoBadge situacao={reuniao.situacao} />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-muted-foreground text-xs">Convite recebido</p>
            <p className="mt-1 text-sm font-medium">
              {reuniao.convite_recebido_em
                ? formatarData(reuniao.convite_recebido_em)
                : "sem convite formal"}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-muted-foreground text-xs">Representação</p>
            <p className="mt-1 text-sm font-medium tabular-nums">
              {reuniao.representantes.length === 0
                ? "—"
                : `${presentes} de ${reuniao.representantes.length} presentes`}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-muted-foreground text-xs">Tipo</p>
            <div className="mt-2 flex flex-wrap gap-1">
              <Badge variant="outline">
                {reuniao.ordinaria === false ? "Extraordinária" : "Ordinária"}
              </Badge>
              {reuniao.online && <Badge variant="outline">Online</Badge>}
              {reuniao.demanda_embarque && (
                <Badge variant="outline">Embarque</Badge>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {reuniao.motivo_ausencia && (
        <Card>
          <CardContent>
            <p className="mb-1 text-sm font-medium">
              Motivo da ausência / recusa
            </p>
            <p className="text-sm">{reuniao.motivo_ausencia}</p>
          </CardContent>
        </Card>
      )}

      {/* Representantes */}
      <Card>
        <CardContent className="grid gap-4">
          <p className="flex items-center gap-2 text-sm font-medium">
            <Users className="text-muted-foreground size-4" />
            Representantes do sindicato
          </p>

          {reuniao.representantes.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Nenhum representante indicado.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Vínculo</TableHead>
                  <TableHead className="w-32">Compareceu</TableHead>
                  <TableHead className="w-40"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reuniao.representantes.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">
                      {r.nomeExibicao}
                    </TableCell>
                    <TableCell>
                      {r.usuario_id ? (
                        <Badge variant="outline">Usuário</Badge>
                      ) : r.filiado_id ? (
                        <Badge variant="outline">Filiado</Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">
                          nome digitado
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {r.compareceu ? (
                        <Badge variant="success">Sim</Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">
                          não
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <ComparecimentoBotao
                          id={r.id}
                          reuniaoId={id}
                          compareceu={r.compareceu}
                        />
                        <RemoverRepresentanteBotao id={r.id} reuniaoId={id} />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          <div className="border-t pt-4">
            <RepresentanteForm reuniaoId={id} usuarios={usuarios} />
          </div>
        </CardContent>
      </Card>

      {/* Pauta */}
      {(reuniao.assuntos || reuniao.motivo_especifico || reuniao.observacoes) && (
        <Card>
          <CardContent className="grid gap-3">
            {reuniao.motivo_especifico && (
              <div>
                <p className="text-sm font-medium">Motivo específico</p>
                <p className="mt-1 text-sm">{reuniao.motivo_especifico}</p>
              </div>
            )}
            {reuniao.assuntos && (
              <div>
                <p className="text-sm font-medium">Assuntos tratados</p>
                <p className="mt-1 text-sm whitespace-pre-line">
                  {reuniao.assuntos}
                </p>
              </div>
            )}
            {reuniao.observacoes && (
              <div>
                <p className="text-sm font-medium">Observações</p>
                <p className="mt-1 text-sm whitespace-pre-line">
                  {reuniao.observacoes}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Ata */}
      <Card>
        <CardContent className="grid gap-3">
          <p className="flex items-center gap-2 text-sm font-medium">
            <FileText className="text-muted-foreground size-4" />
            Ata da reunião
          </p>
          {linkAta ? (
            <p className="text-sm">
              <a
                href={linkAta}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline"
              >
                Abrir PDF da ata
              </a>
              <span className="text-muted-foreground ml-2 text-xs">
                link válido por 1 hora
              </span>
            </p>
          ) : (
            <p className="text-muted-foreground text-sm">
              Nenhuma ata enviada.
            </p>
          )}
          <AtaForm reuniaoId={id} />
        </CardContent>
      </Card>
    </>
  )
}
