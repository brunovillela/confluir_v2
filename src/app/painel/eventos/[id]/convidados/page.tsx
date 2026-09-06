import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Download, TriangleAlert } from "lucide-react"

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
import { GrupoColapsavel } from "@/components/grupo-colapsavel"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { requirePermissao } from "@/lib/auth"
import {
  capacidadeDoEvento,
  listarInscricoes,
  obterEvento,
} from "@/lib/db/eventos"
import { formatarCnpjCpf, formatarData } from "@/lib/formato"

import { ImportarPlanilha, LancarConvidado, RemoverConvidado } from "./formularios"

export const metadata: Metadata = { title: "Convidados — Confluir" }

function Numero({
  rotulo,
  valor,
  detalhe,
}: {
  rotulo: string
  valor: string | number
  detalhe?: string
}) {
  return (
    <Card>
      <CardContent className="grid gap-1">
        <span className="text-muted-foreground text-xs">{rotulo}</span>
        <span className="text-2xl font-semibold tabular-nums">{valor}</span>
        {detalhe && (
          <span className="text-muted-foreground text-xs">{detalhe}</span>
        )}
      </CardContent>
    </Card>
  )
}

export default async function ConvidadosPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermissao("eventos_gestao")
  const { id } = await params

  const evento = await obterEvento(id)
  if (!evento) notFound()

  const [capacidade, inscricoes] = await Promise.all([
    capacidadeDoEvento(evento),
    listarInscricoes({ eventoId: id, situacao: "todas" }),
  ])
  const convidados = inscricoes.filter((i) => i.reservada_por !== null)

  return (
    <>
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3">
          <Link href={`/painel/eventos/${id}`}>
            <ArrowLeft />
            {evento.titulo ?? "Evento"}
          </Link>
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Convidados</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Vagas que a entidade reserva e lança por dentro. Entram já
              confirmados — não passam por aprovação nem confirmam e-mail.
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <a href={`/painel/eventos/${id}/convidados/modelo`}>
              <Download />
              Baixar modelo (.xlsx)
            </a>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Numero
          rotulo="Convidados"
          valor={convidados.length}
          detalhe={`${capacidade.convidadosConfirmados} confirmado(s)`}
        />
        <Numero
          rotulo="Cota"
          valor={capacidade.cotaConvidados || "—"}
          detalhe={
            capacidade.cotaConvidados > 0
              ? `${capacidade.cotaRestante} vaga(s) guardada(s) ainda livre(s)`
              : "nenhuma vaga guardada"
          }
        />
        <Numero
          rotulo="Vagas do público"
          valor={capacidade.vagasPublicas ?? "—"}
          detalhe={
            capacidade.publicasRestantes !== null
              ? `${capacidade.publicasRestantes} livre(s)`
              : "sem lotação definida"
          }
        />
        <Numero
          rotulo="Total confirmado"
          valor={capacidade.confirmadas}
          detalhe={
            capacidade.vagas !== null
              ? `de ${capacidade.vagas} vagas`
              : undefined
          }
        />
      </div>

      {capacidade.cotaConvidados === 0 && (
        <Alert variant="info">
          <AlertDescription>
            Este evento não guarda vagas para convidados. Você ainda pode
            lançá-los, mas eles disputam as mesmas vagas do link público — se o
            auditório encher antes, não sobra lugar para a lista da diretoria.
            A reserva se define em <strong>Editar › Capacidade</strong>.
          </AlertDescription>
        </Alert>
      )}

      {capacidade.excedeLotacao && (
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertDescription>
            Os confirmados ({capacidade.confirmadas}) já passaram da lotação do
            local ({capacidade.lotacao}). A lotação é limitada pelas normas de
            prevenção e combate a incêndio e pânico e não pode ser ultrapassada
            no dia.
          </AlertDescription>
        </Alert>
      )}

      <GrupoColapsavel
        titulo="Importar planilha"
        descricao="Baixe o modelo, preencha e suba. Confiro tudo antes de gravar."
      >
        <ImportarPlanilha eventoId={id} />
      </GrupoColapsavel>

      <GrupoColapsavel
        titulo="Lançar um convidado"
        descricao="Para uma pessoa só, sem planilha."
      >
        <LancarConvidado eventoId={id} />
      </GrupoColapsavel>

      <Card>
        <CardHeader>
          <CardTitle>Lista</CardTitle>
          <CardDescription>
            {convidados.length === 0
              ? "Nenhum convidado lançado ainda."
              : `${convidados.length} convidado(s).`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {convidados.length > 0 && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>CPF</TableHead>
                    <TableHead>A convite de</TableHead>
                    <TableHead>Origem</TableHead>
                    <TableHead className="text-right">Presenças</TableHead>
                    <TableHead>Lançado em</TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {convidados.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-medium">
                        {c.anonimizada_em
                          ? "(participante anonimizado)"
                          : (c.nome ?? "—")}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {formatarCnpjCpf(c.cpf) || (
                          <Badge variant="warning">sem CPF</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {c.convidado_por ?? "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {c.origem === "planilha" ? "planilha" : "lançamento"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {c.presencas || "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground whitespace-nowrap">
                        {formatarData(c.created_at)}
                      </TableCell>
                      <TableCell>
                        {c.presencas === 0 && !c.anonimizada_em && (
                          <RemoverConvidado
                            eventoId={id}
                            inscricaoId={c.id}
                            nome={c.nome ?? "convidado"}
                          />
                        )}
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
