import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, FolderKanban, Pencil } from "lucide-react"

import { TextoComLinks } from "@/components/texto-com-links"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { requirePermissao } from "@/lib/auth"
import {
  listarPessoasAtribuiveis,
  listarTarefasAvulsas,
  obterDemanda,
  resumoExclusaoDemanda,
} from "@/lib/db/nucleo"
import { atendimentoDaDemanda, podeVerAtendimento } from "@/lib/db/portal-atendimentos"
import { formatarData, formatarMoeda } from "@/lib/formato"
import { podeAcessar } from "@/lib/permissoes"

import { Linha } from "../../dados-resumo"
import { IncluirTarefas } from "../../tarefas/tarefa-forms"
import { TarefasLista } from "../../tarefas/tarefas-lista"
import { AtendimentoPainel } from "@/app/painel/filiados/atendimentos/atendimento-painel"

import { listarModelos } from "@/lib/db/modelos"

import { SalvarComoModelo, UsarModelo } from "../../modelos/usar-modelo"
import { ExcluirDemanda, SituacaoDemanda } from "./demanda-acoes"

export const metadata: Metadata = { title: "Demanda — Confluir" }

export default async function DemandaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ salvo?: string }>
}) {
  const sessao = await requirePermissao("ferramentas_demandas", ["ferramentas_tarefas"])
  // Quem só tem Tarefas trabalha nas tarefas; editar a demanda é de Demandas.
  const editor = podeAcessar(sessao.permissoes, "ferramentas_demandas")
  const { id } = await params
  const { salvo } = await searchParams

  const [demanda, pessoas, resumoExclusao, atendimento, avulsas, modelos] = await Promise.all([
    obterDemanda(id),
    listarPessoasAtribuiveis(),
    resumoExclusaoDemanda(id),
    atendimentoDaDemanda(id),
    listarTarefasAvulsas(),
    editor ? listarModelos("demanda") : Promise.resolve([]),
  ])
  if (!demanda) notFound()

  // Quem apaga: o criador. Nas demandas antigas, sem criador registrado, o
  // responsavel assume — senao elas ficariam impossiveis de remover.
  const podeExcluir = demanda.criadoPorId
    ? demanda.criadoPorId === sessao.usuario.id
    : demanda.responsavelId === sessao.usuario.id

  const concluidas = demanda.tarefas.filter((t) => t.concluido).length
  const pendentes = demanda.tarefas.length - concluidas

  const progresso = demanda.tarefas.length > 0 ? (concluidas / demanda.tarefas.length) * 100 : null

  return (
    <>
      <Button variant="ghost" size="sm" asChild className="self-start">
        <Link href="/painel/ferramentas/demandas">
          <ArrowLeft />
          Demandas
        </Link>
      </Button>

      {salvo && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Demanda salva com sucesso.</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">
          {demanda.nome ?? "(sem nome)"}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          {editor ? (
            <SituacaoDemanda demandaId={id} situacao={demanda.situacao} pendentes={pendentes} />
          ) : (
            demanda.situacao && <Badge variant="outline">{demanda.situacao}</Badge>
          )}
          {editor && (
            <UsarModelo modo="demanda" alvoId={id} modelos={modelos.map((m) => ({ id: m.id, nome: m.nome }))} pessoas={pessoas} />
          )}
          {editor && demanda.tarefas.length > 0 && (
            <SalvarComoModelo demandaId={id} nomeSugerido={(demanda.nome ?? "Modelo").slice(0, 120)} />
          )}
          {editor && (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/painel/ferramentas/demandas/${id}/editar`}>
                <Pencil />
                Editar
              </Link>
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent>
            <p className="text-muted-foreground mb-2 text-xs">Descrição</p>
            {demanda.descricao ? (
              <p className="text-sm whitespace-pre-wrap">
                <TextoComLinks texto={demanda.descricao} />
              </p>
            ) : (
              <p className="text-muted-foreground text-sm">Sem descrição.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="grid gap-3">
            <dl className="grid gap-1.5 text-sm">
              <Linha rotulo="Responsável">{demanda.responsavelNome ?? "—"}</Linha>
              <Linha rotulo="Prazo">{demanda.prazo ? formatarData(demanda.prazo) : "—"}</Linha>
              <Linha rotulo="Orçamento">
                {demanda.orcamento != null ? formatarMoeda(demanda.orcamento) : "—"}
              </Linha>
              {demanda.criadoPorNome && <Linha rotulo="Aberta por">{demanda.criadoPorNome}</Linha>}
            </dl>
            {progresso != null && (
              <div className="grid gap-1 border-t pt-3">
                <Progress value={progresso} className="h-2" aria-label="Tarefas concluídas" />
                <p className="text-muted-foreground text-xs">
                  {concluidas} de {demanda.tarefas.length} tarefa{demanda.tarefas.length === 1 ? "" : "s"} concluída
                  {demanda.tarefas.length === 1 ? "" : "s"}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {demanda.projetoId && (
        <Alert>
          <FolderKanban />
          <AlertDescription>
            <p>
              Esta é a demanda do projeto{" "}
              <Link href={`/painel/ferramentas/projetos/${demanda.projetoId}`} className="text-primary font-medium hover:underline">
                {demanda.projetoNome}
              </Link>
              : reúne as tarefas dele. Finalizar o projeto conclui as tarefas e esta demanda.
            </p>
          </AlertDescription>
        </Alert>
      )}

      {atendimento && podeVerAtendimento(sessao.permissoes, atendimento.atendimento.assunto) && (
        // Demanda que nasceu de uma solicitação do portal: responder aqui é
        // responder ao filiado. Pedido de saúde (só Demandas antigas, R2):
        // a conversa fica só para a equipe de saúde.
        <AtendimentoPainel atendimento={atendimento.atendimento} mensagens={atendimento.mensagens} mostrarCabecalho={false} />
      )}

      <Card>
        <CardContent className="grid gap-4">
          <IncluirTarefas
            pessoas={pessoas}
            pai={{ campo: "demanda_id", id }}
            avulsas={avulsas}
            cabecalho={
              <p className="text-sm font-medium">
                Tarefas{" "}
                <span className="text-muted-foreground font-normal">
                  ({concluidas}/{demanda.tarefas.length})
                </span>
              </p>
            }
          />
          <TarefasLista
            tarefas={demanda.tarefas}
            pai={{ campo: "demanda_id", id }}
            vazio="Nenhuma tarefa nesta demanda ainda."
            desvincular
            pessoas={pessoas}
          />
        </CardContent>
      </Card>

      {podeExcluir && editor && (
        <Card>
          <CardContent className="grid gap-3">
            <div>
              <p className="text-sm font-medium">Excluir esta demanda</p>
              <p className="text-muted-foreground mt-1 text-xs">
                {demanda.criadoPorNome
                  ? `Você criou esta demanda em nome próprio, então pode removê-la.`
                  : `Esta demanda é anterior ao registro de criador. Como responsável por ela, você pode removê-la.`}
              </p>
            </div>
            <ExcluirDemanda
              demandaId={demanda.id}
              nome={demanda.nome}
              tarefas={resumoExclusao.tarefas}
              checklists={resumoExclusao.checklists}
              comentarios={resumoExclusao.comentarios}
            />
          </CardContent>
        </Card>
      )}
    </>
  )
}
