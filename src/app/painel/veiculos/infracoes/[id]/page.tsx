import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { ArrowLeft, ExternalLink } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { GrupoColapsavel } from "@/components/grupo-colapsavel"
import { CobrancaBadge } from "@/components/veiculos"
import { requirePermissao } from "@/lib/auth"
import {
  buscarInfracao,
  historicoDaInfracao,
  urlArquivoVeiculos,
} from "@/lib/db/veiculos"
import { formatarData, formatarDataHora, formatarMoeda } from "@/lib/formato"
import { podeAcessar } from "@/lib/permissoes"
import { ROTULOS_FORMA_COBRANCA } from "@/lib/veiculos-constantes"

import {
  AvaliacaoInfracaoForm,
  GerarOrdemMultaForm,
  JustificativaForm,
} from "../infracao-forms"

export const metadata: Metadata = { title: "Infração — Confluir" }

const ROTULOS_EVENTO: Record<string, string> = {
  registro: "Registro",
  justificativa: "Justificativa",
  avaliacao: "Avaliação",
  ordem_pagamento: "Ordem de pagamento",
  baixa: "Baixa da cobrança",
}

export default async function InfracaoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ salvo?: string }>
}) {
  const sessao = await requirePermissao("veiculos", ["veiculos_gestao"])
  const gestor = podeAcessar(sessao.permissoes, "veiculos_gestao")
  const { id } = await params
  const { salvo } = await searchParams

  const infracao = await buscarInfracao(id)
  if (!infracao) notFound()
  // Sem gestão, o condutor só vê as próprias infrações.
  if (!gestor && infracao.condutor_id !== sessao.usuario.id) {
    redirect("/painel/veiculos/infracoes")
  }

  const [historico, notificacaoUrl, boletoUrl, comprovanteUrl] =
    await Promise.all([
      historicoDaInfracao(id),
      urlArquivoVeiculos(infracao.arquivo_notificacao),
      urlArquivoVeiculos(infracao.boleto_url),
      urlArquivoVeiculos(infracao.baixa_comprovante_url),
    ])

  const proprioCondutor = infracao.condutor_id === sessao.usuario.id
  const aguardandoJustificativa = !infracao.justificativa
  const aguardandoAvaliacao =
    Boolean(infracao.justificativa) &&
    infracao.cobranca_situacao === null &&
    !infracao.legado

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2">
          <Link href="/painel/veiculos/infracoes">
            <ArrowLeft />
            Infrações
          </Link>
        </Button>
        <h1 className="flex flex-wrap items-center gap-3 text-2xl font-semibold tracking-tight">
          Infração de {formatarData(infracao.infracao_data)}
          {infracao.infracao_tipo && (
            <Badge variant="outline">{infracao.infracao_tipo}</Badge>
          )}
          <CobrancaBadge situacao={infracao.cobranca_situacao} />
        </h1>
        <p className="text-muted-foreground mt-1 text-xs">
          {infracao.veiculoPlaca ?? "—"} {infracao.veiculoModelo ?? ""} ·{" "}
          {infracao.condutorNome ?? "condutor não identificado"}
          {infracao.codigo ? ` · ${infracao.codigo}` : ""}
        </p>
      </div>

      {salvo && (
        <Alert variant="success">
          <AlertDescription>Registro salvo.</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="grid gap-2 text-sm">
            <p className="font-medium">Autuação</p>
            <Linha rotulo="Descrição" valor={infracao.descricao} />
            <Linha rotulo="Local" valor={infracao.local} />
            <Linha rotulo="Órgão autuador" valor={infracao.orgao_autuador} />
            <Linha rotulo="Nº do auto" valor={infracao.auto_de} />
            <Linha rotulo="Valor da multa" valor={formatarMoeda(infracao.custo)} />
            <Linha
              rotulo="Condutor notificado em"
              valor={
                infracao.notificado_em ? formatarData(infracao.notificado_em) : null
              }
            />
            <div className="mt-1 flex flex-wrap gap-3">
              {notificacaoUrl && (
                <DocLink url={notificacaoUrl} rotulo="Notificação da autuação" />
              )}
              {boletoUrl && <DocLink url={boletoUrl} rotulo="Boleto" />}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="grid gap-2 text-sm">
            <p className="font-medium">Justificativa e cobrança</p>
            {infracao.justificativa ? (
              <>
                <p className="bg-muted rounded-md p-3">
                  {infracao.justificativa}
                </p>
                <Linha
                  rotulo="Apresentada em"
                  valor={formatarData(infracao.justificativa_em)}
                />
              </>
            ) : (
              <p className="text-muted-foreground">
                Justificativa ainda não apresentada.
              </p>
            )}
            {infracao.cobranca_situacao !== null && (
              <>
                {infracao.avaliadorNome && (
                  <Linha rotulo="Avaliada por" valor={infracao.avaliadorNome} />
                )}
                {infracao.cobranca_situacao !== "isenta" && (
                  <>
                    <Linha
                      rotulo="Forma de cobrança"
                      valor={
                        infracao.cobranca_forma
                          ? ROTULOS_FORMA_COBRANCA[infracao.cobranca_forma]
                          : null
                      }
                    />
                    <Linha
                      rotulo="Valor cobrado"
                      valor={formatarMoeda(infracao.cobranca_valor)}
                    />
                  </>
                )}
                {infracao.cobranca_situacao === "baixada" && (
                  <>
                    <Linha
                      rotulo="Baixada por"
                      valor={infracao.baixaPorNome ?? "(legado)"}
                    />
                    <Linha
                      rotulo="Baixa em"
                      valor={formatarData(infracao.baixa_em)}
                    />
                    <Linha
                      rotulo="Observação da baixa"
                      valor={infracao.baixa_observacao}
                    />
                    {comprovanteUrl && (
                      <DocLink url={comprovanteUrl} rotulo="Comprovante da baixa" />
                    )}
                  </>
                )}
              </>
            )}
            {infracao.ordemCodigo && (
              <Linha
                rotulo="Ordem da multa"
                valor={`${infracao.ordemCodigo} — ${infracao.ordemSituacao ?? ""}`}
              />
            )}
          </CardContent>
        </Card>
      </div>

      {aguardandoJustificativa && (proprioCondutor || gestor) && (
        <GrupoColapsavel
          titulo="Apresentar justificativa"
          descricao={
            proprioCondutor
              ? "Explique as circunstâncias da infração"
              : "Registrar a justificativa recebida do condutor"
          }
          aberto
        >
          <JustificativaForm infracaoId={infracao.id} />
        </GrupoColapsavel>
      )}

      {gestor && aguardandoAvaliacao && (
        <GrupoColapsavel
          titulo="Avaliar justificativa"
          descricao="Sindical (sindicato assume) ou cobrança ao condutor"
          aberto
        >
          <AvaliacaoInfracaoForm
            infracaoId={infracao.id}
            valorPadrao={
              infracao.custo?.toLocaleString("pt-BR", {
                minimumFractionDigits: 2,
              }) ?? ""
            }
          />
        </GrupoColapsavel>
      )}

      {gestor && !infracao.ordem_pagamento_id && !infracao.legado && (
        <GrupoColapsavel
          titulo="Ordem de pagamento da multa"
          descricao="O sindicato paga o órgão autuador; a ordem nasce 'Em autorização'"
        >
          <GerarOrdemMultaForm
            infracaoId={infracao.id}
            valorTexto={formatarMoeda(infracao.custo)}
          />
        </GrupoColapsavel>
      )}

      {infracao.cobranca_situacao === "pendente" && (
        <Alert variant="warning">
          <AlertDescription>
            Cobrança pendente — a baixa é registrada pelo Financeiro em{" "}
            <Link
              href="/painel/financeiro/multas"
              className="font-medium underline"
            >
              Cobranças de multas
            </Link>
            .
          </AlertDescription>
        </Alert>
      )}

      <GrupoColapsavel
        titulo="Histórico (auditoria)"
        descricao="Linha do tempo imutável para o Conselho Fiscal"
        resumo={
          <span className="text-muted-foreground text-sm tabular-nums">
            {historico.length}
          </span>
        }
        aberto={historico.length > 0}
      >
        {historico.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Sem eventos registrados (infração legada do Bubble).
          </p>
        ) : (
          <ol className="grid gap-3">
            {historico.map((e) => (
              <li key={e.id} className="border-border border-l-2 pl-3 text-sm">
                <p className="font-medium">
                  {ROTULOS_EVENTO[e.evento] ?? e.evento}
                  <span className="text-muted-foreground ml-2 font-normal">
                    {formatarDataHora(e.created_at)}
                    {e.usuarioNome ? ` · ${e.usuarioNome}` : ""}
                  </span>
                </p>
                {e.detalhe && (
                  <p className="text-muted-foreground mt-0.5">{e.detalhe}</p>
                )}
              </li>
            ))}
          </ol>
        )}
      </GrupoColapsavel>
    </>
  )
}

function Linha({
  rotulo,
  valor,
}: {
  rotulo: string
  valor: string | null | undefined
}) {
  return (
    <p className="flex items-baseline justify-between gap-3">
      <span className="text-muted-foreground shrink-0">{rotulo}</span>
      <span className="text-right">{valor ?? "—"}</span>
    </p>
  )
}

function DocLink({ url, rotulo }: { url: string; rotulo: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="text-primary flex items-center gap-1.5 hover:underline"
    >
      <ExternalLink className="size-3.5" />
      {rotulo}
    </a>
  )
}
