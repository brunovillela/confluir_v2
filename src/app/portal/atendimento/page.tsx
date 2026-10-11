import type { Metadata } from "next"
import Link from "next/link"
import { ChevronDown, Info, Reply } from "lucide-react"

import { AcaoVisualizacao } from "@/components/acao-visualizacao"
import { SituacaoAtendimentoBadge } from "@/components/atendimento/conversa"
import { GrupoColapsavel } from "@/components/grupo-colapsavel"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { assuntoAtendimento, assuntosPorExtenso, prazoLegivel } from "@/lib/atendimento-constantes"
import { hojeSP } from "@/lib/db/comum"
import { meusAtendimentos, type Atendimento } from "@/lib/db/portal-atendimentos"
import { formatarDataHora } from "@/lib/formato"
import { cn } from "@/lib/utils"
import { requireVisualizacaoPortal } from "@/lib/visualizacao-filiado"

import { NovaSolicitacaoForm } from "./formularios"

export const metadata: Metadata = { title: "Atendimento — Portal do Associado" }

/** Acima disso, as concluídas recolhem: com duas ou três solicitações, esconder uma atrapalha. */
const RECOLHER_CONCLUIDAS_ACIMA = 5

type Parametros = { assunto?: string | string[]; titulo?: string | string[]; nova?: string | string[] }

function um(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v
}

/**
 * O filiado abre solicitações e acompanha cada uma (onda 4, F2). Quem já tem
 * solicitações vê primeiro a lista — as respondidas, que esperam por ele, no
 * topo e em destaque — com o formulário recolhido atrás de "Nova
 * solicitação" (A95/A96); quem não tem nenhuma, ou chega por um link com o
 * assunto já escolhido (?assunto=&titulo=, A23; ?nova=1), vê o formulário
 * aberto.
 */
export default async function PortalAtendimentoPage({ searchParams }: { searchParams: Promise<Parametros> }) {
  const { filiado, preview } = await requireVisualizacaoPortal()
  const p = await searchParams
  const { lista, disponivel } = await meusAtendimentos(filiado.cpf)
  const hoje = hojeSP()

  // Só assunto da lista fechada; o resumo, no tamanho do campo.
  const assuntoInicial = assuntoAtendimento(um(p.assunto))?.chave ?? null
  const tituloInicial = um(p.titulo)?.trim().replace(/\s+/g, " ").slice(0, 140) || null
  const abrirFormulario = lista.length === 0 || um(p.nova) === "1" || !!assuntoInicial || !!tituloInicial

  const abertas = lista.filter((a) => a.situacao !== "concluida")
  const concluidas = lista.filter((a) => a.situacao === "concluida")
  const recolher = lista.length > RECOLHER_CONCLUIDAS_ACIMA && concluidas.length > 0

  // A key remonta o formulário quando outro link traz outro assunto/resumo
  // sem sair da página: o assunto escolhido vive num estado do formulário.
  const formulario = (
    <AcaoVisualizacao preview={preview}>
      <NovaSolicitacaoForm
        key={`${assuntoInicial ?? ""}|${tituloInicial ?? ""}`}
        assuntoInicial={assuntoInicial}
        tituloInicial={tituloInicial}
      />
    </AcaoVisualizacao>
  )

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Atendimento</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Fale com a entidade por aqui: {assuntosPorExtenso()}. Cada pedido tem prazo de resposta.
        </p>
      </div>

      {!disponivel ? (
        <Alert>
          <Info />
          <AlertDescription>O atendimento pelo portal ainda não está disponível nesta entidade.</AlertDescription>
        </Alert>
      ) : lista.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Nova solicitação</CardTitle>
            <CardDescription>Escolha o assunto, resuma o pedido e conte os detalhes. A entidade responde por aqui e você recebe um aviso.</CardDescription>
          </CardHeader>
          <CardContent>{formulario}</CardContent>
        </Card>
      ) : (
        <>
          {/* Recolhido, é um botão de uma linha acima da lista (padrão da casa: GrupoColapsavel). */}
          <GrupoColapsavel titulo="Nova solicitação" descricao="Abrir um pedido novo à entidade" aberto={abrirFormulario}>
            {formulario}
          </GrupoColapsavel>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Minhas solicitações</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2">
              {recolher ? (
                <>
                  {abertas.length > 0 ? (
                    <ListaSolicitacoes itens={abertas} hoje={hoje} />
                  ) : (
                    <p className="text-muted-foreground py-2 text-sm">Nenhuma solicitação em aberto.</p>
                  )}
                  <details className="group border-t pt-2">
                    <summary className="hover:bg-muted/40 -mx-2 flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-md px-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
                      Concluídas ({concluidas.length})
                      <ChevronDown className="text-muted-foreground size-4 transition-transform group-open:rotate-180" aria-hidden />
                    </summary>
                    <ListaSolicitacoes itens={concluidas} hoje={hoje} />
                  </details>
                </>
              ) : (
                <ListaSolicitacoes itens={lista} hoje={hoje} />
              )}
            </CardContent>
          </Card>
        </>
      )}
    </>
  )
}

function ListaSolicitacoes({ itens, hoje }: { itens: Atendimento[]; hoje: string }) {
  return (
    <ul className="divide-y">
      {itens.map((a) => {
        const prazo = prazoLegivel(a, hoje)
        const respondida = a.situacao === "respondida"
        return (
          <li key={a.id}>
            <Link
              href={`/portal/atendimento/${a.id}`}
              className={cn(
                "-mx-2 flex min-h-14 flex-wrap items-center justify-between gap-2 rounded-md px-2 py-3 transition-colors",
                // A resposta que espera pela pessoa salta aos olhos (vem primeiro na lista).
                respondida ? "bg-primary/5 hover:bg-primary/10" : "hover:bg-muted/40"
              )}
            >
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{a.titulo}</span>
                {respondida && (
                  <span className="mt-0.5 flex items-center gap-1.5 text-sm">
                    <Reply className="text-primary size-4 shrink-0" aria-hidden />
                    A entidade respondeu — abra para ler
                  </span>
                )}
                <span className="text-muted-foreground mt-0.5 block text-xs">
                  {a.assuntoRotulo} · aberta em {formatarDataHora(a.criadoEm)}
                  {prazo ? ` · ${prazo}` : ""}
                </span>
              </span>
              <SituacaoAtendimentoBadge situacao={a.situacao} atrasada={a.atrasada} />
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
