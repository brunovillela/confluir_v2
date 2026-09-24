import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Pencil } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { RotuloTrilha } from "@/components/layout/trilha-rotulos"
import { requirePermissao } from "@/lib/auth"
import {
  espacosQueCompartilhamAmbiente,
  listarBloqueios,
  listarJanelas,
  listarRecintosParaEspaco,
  listarResponsaveisPossiveis,
  listarSedes,
  obterEspaco,
} from "@/lib/db/espacos"
import { rotuloPublico, rotuloVisita } from "@/lib/espacos-constantes"

import { listarRegras } from "@/lib/db/espacos-solicitacao"

import { EspacoForm } from "../espaco-form"
import { Bloqueios, Janelas } from "./agenda"
import { Exigencias } from "./exigencias"

export const metadata: Metadata = { title: "Espaço — Confluir" }

export default async function EspacoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ criado?: string; salvo?: string; aviso?: string; editar?: string }>
}) {
  const sessao = await requirePermissao("espacos", ["espacos_gestao"])
  const podeGerir = sessao.permissoes?.espacos_gestao === true
  const { id } = await params
  const { criado, salvo, aviso, editar } = await searchParams

  const espaco = await obterEspaco(id)
  if (!espaco) notFound()

  const [janelas, bloqueios, ambientes, sedes, responsaveis, compartilhados, regras] =
    await Promise.all([
      listarJanelas(id),
      listarBloqueios(id),
      listarRecintosParaEspaco(),
      listarSedes(),
      listarResponsaveisPossiveis(),
      espacosQueCompartilhamAmbiente(id),
      listarRegras(id),
    ])

  const meusAmbientes = ambientes.filter((a) => espaco.recintoIds.includes(a.id))
  const editando = editar === "1" && podeGerir

  return (
    <>
      <RotuloTrilha valores={{ [id]: espaco.nome }} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Button variant="ghost" size="icon" asChild>
            <Link href="/painel/espacos" aria-label="Voltar para cessão de espaços">
              <ArrowLeft />
            </Link>
          </Button>
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-tight">
              {espaco.nome}
            </h1>
            <p className="text-muted-foreground mt-1 text-xs">
              {espaco.sedeNome ?? "sem sede"}
              {espaco.capacidade ? ` · até ${espaco.capacidade} pessoas` : ""}
              {espaco.slug ? ` · /espaco/${espaco.slug}` : ""}
            </p>
          </div>
        </div>
        {podeGerir && !editando && (
          <Button variant="outline" asChild>
            <Link href={`/painel/espacos/${id}?editar=1`}>
              <Pencil />
              Editar
            </Link>
          </Button>
        )}
      </div>

      {criado === "1" && (
        <Alert variant="success">
          <AlertDescription>
            Espaço cadastrado. Agora defina os dias e horários em que ele pode
            ser cedido.
          </AlertDescription>
        </Alert>
      )}
      {salvo === "1" && (
        <Alert variant="success">
          <AlertDescription>Espaço salvo.</AlertDescription>
        </Alert>
      )}
      {aviso === "ambientes" && (
        <Alert variant="warning">
          <AlertDescription>
            O espaço foi criado, mas os ambientes não foram gravados. Edite e
            escolha de novo.
          </AlertDescription>
        </Alert>
      )}

      {editando ? (
        <div className="max-w-4xl">
          <EspacoForm
            espaco={{
              id: espaco.id,
              nome: espaco.nome,
              descricao: espaco.descricao,
              sedeId: espaco.sedeId,
              capacidade: espaco.capacidade,
              visita: espaco.visita,
              exigeTermo: espaco.exigeTermo,
              exigeAutorizacao: espaco.exigeAutorizacao,
              publico: espaco.publico,
              agendaPublica: espaco.agendaPublica,
              responsavelVisitaId: espaco.responsavelVisitaId,
              ativo: espaco.ativo,
              recintoIds: espaco.recintoIds,
              recintoPrincipalId: espaco.recintoPrincipalId,
            }}
            sedes={sedes}
            ambientes={ambientes}
            responsaveis={responsaveis}
          />
        </div>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">O espaço</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Campo rotulo="Situação">
                <Badge variant={espaco.ativo ? "info" : "secondary"}>
                  {espaco.ativo ? "Disponível" : "Indisponível"}
                </Badge>
              </Campo>
              <Campo rotulo="Quem pode solicitar">
                {rotuloPublico(espaco.publico)}
              </Campo>
              <Campo rotulo="Visita técnica">{rotuloVisita(espaco.visita)}</Campo>
              <Campo rotulo="Responsável pela visita">
                {espaco.responsavelVisitaNome ?? "definido em cada cessão"}
              </Campo>
              <Campo rotulo="Termo de cessão">
                {espaco.exigeTermo ? "Exigido" : "Dispensado"}
              </Campo>
              <Campo rotulo="Autorização">
                {espaco.exigeAutorizacao ? "Exigida" : "Dispensada"}
              </Campo>
              <Campo rotulo="Agenda no link público">
                {espaco.agendaPublica ? "Visível" : "Oculta"}
              </Campo>
              {espaco.descricao && (
                <div className="sm:col-span-2 lg:col-span-3">
                  <p className="text-muted-foreground text-xs">Descrição</p>
                  <p className="mt-0.5 text-sm whitespace-pre-line">
                    {espaco.descricao}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Ambientes</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              {meusAmbientes.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  Nenhum ambiente vinculado. O espaço funciona assim, mas sem
                  ambiente o sistema não consegue detectar choque com outro
                  espaço do mesmo lugar.
                </p>
              ) : (
                <ul className="grid gap-1.5">
                  {meusAmbientes.map((a) => (
                    <li
                      key={a.id}
                      className="flex flex-wrap items-center gap-2 rounded-md border p-2 text-sm"
                    >
                      <Link
                        href={`/painel/patrimonio/recintos/${a.id}`}
                        className="text-primary font-medium hover:underline"
                      >
                        {a.nome}
                      </Link>
                      {a.id === espaco.recintoPrincipalId && (
                        <Badge variant="outline">principal</Badge>
                      )}
                      <span className="text-muted-foreground text-xs">
                        {a.sede ?? "sem sede"}
                        {a.responsavelNome ? ` · resp.: ${a.responsavelNome}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {compartilhados.length > 0 && (
                <Alert variant="info">
                  <AlertDescription>
                    Estes espaços usam ambiente em comum e não poderão ser
                    cedidos ao mesmo tempo que este:{" "}
                    {compartilhados.map((c, i) => (
                      <span key={c.id}>
                        {i > 0 && ", "}
                        <Link
                          href={`/painel/espacos/${c.id}`}
                          className="font-medium hover:underline"
                        >
                          {c.nome}
                        </Link>{" "}
                        ({c.ambientes.join(", ")})
                      </span>
                    ))}
                    .
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          <Janelas espacoId={id} janelas={janelas} podeGerir={podeGerir} />
          <Exigencias espacoId={id} regras={regras} podeGerir={podeGerir} />
          <Bloqueios espacoId={id} bloqueios={bloqueios} podeGerir={podeGerir} />
        </>
      )}
    </>
  )
}

function Campo({
  rotulo,
  children,
}: {
  rotulo: string
  children: React.ReactNode
}) {
  return (
    <div>
      <p className="text-muted-foreground text-xs">{rotulo}</p>
      <div className="mt-0.5 text-sm">{children}</div>
    </div>
  )
}
