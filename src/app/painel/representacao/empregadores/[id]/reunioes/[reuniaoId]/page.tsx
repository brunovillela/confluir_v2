import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, CalendarClock, FileText, MapPin, Pencil, Sparkles, Users, Video } from "lucide-react"

import { RotuloTrilha } from "@/components/layout/trilha-rotulos"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { buscarFontePagadora } from "@/lib/db/fontes"
import { obterReuniao, type Participante } from "@/lib/db/representacao-reunioes"
import { listarUsuariosAtivos } from "@/lib/db/veiculos"
import { formatarData, formatarDataHora } from "@/lib/formato"
import {
  INFO_TIPO_REUNIAO,
  ROTULO_MODALIDADE,
  ROTULO_SITUACAO_REUNIAO,
} from "@/lib/representacao-reunioes-constantes"

import { ExcluirReuniao } from "../excluir-reuniao"
import { ReuniaoForm } from "../reuniao-form"

export const metadata: Metadata = { title: "Reunião — Confluir" }
// A leitura da ata pela IA roda na server action desta página.
export const maxDuration = 120

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function Texto({ titulo, valor }: { titulo: string; valor: string | null }) {
  if (!valor) return null
  return (
    <div>
      <p className="text-muted-foreground text-xs">{titulo}</p>
      <p className="mt-0.5 text-sm leading-relaxed whitespace-pre-wrap">{valor}</p>
    </div>
  )
}

function Lista({ titulo, pessoas, total }: { titulo: string; pessoas: Participante[]; total?: number | null }) {
  if (!pessoas.length && !total) return null
  return (
    <div>
      <p className="text-muted-foreground text-xs">
        {titulo}
        {total ? ` · ${total} presente(s)` : pessoas.length ? ` · ${pessoas.length}` : ""}
      </p>
      <ul className="mt-1 grid gap-0.5 text-sm">
        {pessoas.map((p, i) => (
          <li key={i}>
            {p.nome}
            {p.cargo && <span className="text-muted-foreground"> — {p.cargo}</span>}
          </li>
        ))}
      </ul>
    </div>
  )
}

export default async function ReuniaoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; reuniaoId: string }>
  searchParams: Promise<{ editar?: string; salvo?: string }>
}) {
  await requirePermissao("empregadores")
  const { id, reuniaoId } = await params
  if (!UUID.test(reuniaoId)) notFound()
  const sp = await searchParams
  const [fonte, r] = await Promise.all([buscarFontePagadora(id), obterReuniao(reuniaoId, id)])
  if (!fonte || !r) notFound()
  const nome = fonte.nome_fantasia ?? fonte.nome_razao ?? "(sem nome)"
  const info = INFO_TIPO_REUNIAO[r.tipo]
  const aqui = `/painel/representacao/empregadores/${id}/reunioes/${reuniaoId}`
  const lista = `/painel/representacao/empregadores/${id}?aba=${r.tipo === "setorial" ? "setoriais" : "reunioes"}`
  const editando = sp.editar === "1"
  const usuarios = editando ? await listarUsuariosAtivos() : []
  const horario = [r.horaInicio, r.horaFim].filter(Boolean).join(" às ")

  return (
    <>
      <RotuloTrilha valores={{ [id]: nome, reunioes: info.plural, [reuniaoId]: r.titulo }} />
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href={lista}>
            <ArrowLeft />
            {nome} · {info.plural}
          </Link>
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight text-balance">{r.titulo}</h1>
              <Badge variant="secondary">{info.curto}</Badge>
              <Badge
                variant="outline"
                className={
                  r.situacao === "agendada"
                    ? "border-warning/40 text-warning-fg"
                    : r.situacao === "cancelada"
                      ? "text-muted-foreground line-through"
                      : "border-success/40 text-success-fg"
                }
              >
                {ROTULO_SITUACAO_REUNIAO[r.situacao]}
              </Badge>
            </div>
            <p className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <span className="inline-flex items-center gap-1">
                <CalendarClock className="size-4" />
                {formatarData(r.data)}
                {horario ? `, ${horario}` : ""}
              </span>
              <span className="inline-flex items-center gap-1">
                {r.modalidade === "presencial" ? <MapPin className="size-4" /> : <Video className="size-4" />}
                {ROTULO_MODALIDADE[r.modalidade]}
                {r.local ? ` · ${r.local}` : ""}
              </span>
              {r.tipo === "setorial" && r.unidade && (
                <span className="inline-flex items-center gap-1">
                  <Users className="size-4" />
                  {r.unidade}
                </span>
              )}
            </p>
          </div>
          {!editando && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" asChild>
                <Link href={`${aqui}?editar=1`}>
                  <Pencil />
                  Editar
                </Link>
              </Button>
            </div>
          )}
        </div>
      </div>

      {sp.salvo === "1" && !editando && (
        <Alert variant="success">
          <AlertDescription>{info.curto} salva.</AlertDescription>
        </Alert>
      )}

      {editando ? (
        <Card>
          <CardContent className="pt-6">
            <ReuniaoForm empresaId={id} tipo={r.tipo} reuniao={r} usuarios={usuarios} aoCancelarHref={aqui} />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                Resumo
                {r.resumoPorIA && (
                  <Badge variant="outline" className="text-primary gap-1 font-normal">
                    <Sparkles className="size-3" /> lido da ata pela IA
                  </Badge>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <Texto titulo="Pauta" valor={r.pauta} />
              <Texto titulo="O que foi discutido" valor={r.resumo} />
              <Texto titulo="Encaminhamentos" valor={r.encaminhamentos} />
              {!r.pauta && !r.resumo && !r.encaminhamentos && (
                <p className="text-muted-foreground text-sm">Sem resumo ainda. Edite e anexe a ata para a IA ler.</p>
              )}
            </CardContent>
          </Card>
          <div className="grid content-start gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Participantes</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3">
                <Lista titulo="Pelo sindicato" pessoas={r.participantes.filter((p) => p.lado === "sindicato")} />
                {r.tipo === "setorial" ? (
                  <Lista titulo="Trabalhadores" pessoas={r.participantes.filter((p) => p.lado === "trabalhador")} total={r.presentesTotal} />
                ) : (
                  <Lista titulo="Pela empresa" pessoas={r.participantes.filter((p) => p.lado === "empresa")} />
                )}
                {!r.participantes.length && !r.presentesTotal && <p className="text-muted-foreground text-sm">Não informados.</p>}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Ata e registro</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2 text-sm">
                {r.ataUrl ? (
                  <a href={r.ataUrl} target="_blank" rel="noreferrer" className="text-primary inline-flex items-center gap-1.5 hover:underline">
                    <FileText className="size-4" />
                    {r.ataNome ?? "Abrir a ata"}
                  </a>
                ) : (
                  <p className="text-muted-foreground">Sem ata anexada.</p>
                )}
                {r.linkOnline && (
                  <a href={r.linkOnline} target="_blank" rel="noreferrer" className="text-primary inline-flex items-center gap-1.5 break-all hover:underline">
                    <Video className="size-4 shrink-0" />
                    Link da reunião
                  </a>
                )}
                <p className="text-muted-foreground text-xs">
                  Registrada em {formatarDataHora(r.criadoEm)}
                  {r.criadoPor ? ` por ${r.criadoPor}` : ""}
                  {r.atualizadoEm.slice(0, 16) !== r.criadoEm.slice(0, 16) ? ` · atualizada em ${formatarDataHora(r.atualizadoEm)}` : ""}
                </p>
              </CardContent>
            </Card>
            <ExcluirReuniao empresaId={id} reuniaoId={r.id} tipo={r.tipo} />
          </div>
        </div>
      )}
    </>
  )
}
