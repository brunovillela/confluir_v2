import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { obterCampanhaPublica } from "@/lib/db/oposicao"
import { orientacoesDaCampanha, paraOrientacao } from "@/lib/db/oposicao-ciencia"
import { requireOposicao } from "@/lib/db/oposicao-regras"
import { nomeEntidade } from "@/lib/db/organizacao"
import { formatarData } from "@/lib/formato"
import { DECLARACAO_PADRAO, exigeDocumentoComRegras } from "@/lib/oposicao-constantes"
import { nomesDasEtapas } from "@/lib/oposicao-orientacoes"
import { cn } from "@/lib/utils"

import { Etapas } from "@/app/portal/oposicao/[id]/oposicao-flow"
import { PerguntasFrequentes } from "@/app/portal/oposicao/orientacoes"

export const metadata: Metadata = { title: "Ver como o trabalhador — Oposição — Confluir" }

/**
 * "Ver como o trabalhador" (onda 1 das melhorias, 31/10/2026): o que o filiado
 * e o não filiado leem antes de se opor — as etapas, as instruções, o aviso de
 * privacidade, as perguntas frequentes e a declaração —, montado pelas mesmas
 * funções do portal. Funciona com a campanha em rascunho, para o jurídico
 * revisar o texto exato que vai ser aceito. Só leitura: nada se registra.
 */
export default async function PreviaOposicaoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ perfil?: string }>
}) {
  const { id } = await params
  await requireOposicao("consultar", id)
  const filiado = (await searchParams).perfil !== "nao_filiado"
  const [campanha, entidade] = await Promise.all([obterCampanhaPublica(id), nomeEntidade()])
  if (!campanha) notFound()

  const orientacoes = orientacoesDaCampanha(campanha, filiado, entidade)
  const base = paraOrientacao(campanha, filiado)
  const exigeCarta = exigeDocumentoComRegras(campanha.modo_formalizacao, filiado, campanha.regras)
  const aqui = `/painel/representacao/oposicao/${id}`

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href={aqui}>
            <ArrowLeft />
            Campanha
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight text-balance">Ver como o trabalhador</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          {campanha.nome ?? "Campanha"} · prazo {formatarData(campanha.prazo_inicio)} a{" "}
          {formatarData(campanha.prazo_fim)}. O texto abaixo é o que a pessoa lê e aceita no portal; o que ela aceitar
          fica gravado na oposição.
        </p>
      </div>

      <nav aria-label="Perfil" className="flex flex-wrap gap-2">
        {[
          { chave: "filiado", rotulo: "Sou filiado", ativo: filiado },
          { chave: "nao_filiado", rotulo: "Não sou filiado", ativo: !filiado },
        ].map((p) => (
          <Button key={p.chave} variant={p.ativo ? "default" : "outline"} size="sm" asChild>
            <Link href={`${aqui}/previa?perfil=${p.chave}`} aria-current={p.ativo ? "page" : undefined}>
              {p.rotulo}
            </Link>
          </Button>
        ))}
      </nav>

      {!campanha.regrasCompletas && (
        <Alert variant="warning">
          <AlertDescription>
            Faltam decisões jurídicas: as instruções sobre carta, vídeo e prova podem mudar quando elas forem tomadas.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">1. Leia antes de começar</CardTitle>
          <CardDescription>
            A pessoa só segue depois de marcar que leu e clicar em “Li e quero prosseguir”.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5">
          <Etapas atual={0} etapas={nomesDasEtapas(filiado, base.temVideo)} />
          <ol className="grid list-decimal gap-2 pl-5 text-sm">
            {orientacoes.instrucoes.map((texto, i) => (
              <li key={i}>{texto}</li>
            ))}
          </ol>
          <div className="grid gap-2">
            <h3 className="text-sm font-semibold">Aviso de privacidade</h3>
            <div className="bg-muted/30 max-h-64 overflow-y-auto rounded-lg border p-3 text-sm whitespace-pre-line">
              {orientacoes.aviso}
            </div>
          </div>
          <div className="grid gap-1">
            <h3 className="text-sm font-semibold">Perguntas frequentes</h3>
            <PerguntasFrequentes itens={orientacoes.perguntas} />
          </div>
        </CardContent>
      </Card>

      {filiado && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">2. Confira os seus dados</CardTitle>
            <CardDescription>Só o filiado.</CardDescription>
          </CardHeader>
          <CardContent className="text-muted-foreground grid gap-2 text-sm">
            <p>
              Se ainda não aceitou a versão em vigor, aceita o termo de privacidade geral da entidade. Depois completa
              e-mail, telefone e endereço (obrigatórios; o endereço começa pelo CEP) e clica em “Meus dados estão
              corretos”.
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{filiado ? "3" : "2"}. Confirmação</CardTitle>
          <CardDescription>
            {base.temVideo
              ? base.videoMinimo
                ? "Antes, o vídeo, com o tempo mínimo exigido."
                : "Antes, o vídeo, sem tempo mínimo."
              : "Sem vídeo."}{" "}
            {base.temFontes ? "Escolhe a empresa entre as da campanha." : "Escolhe a empresa numa lista geral."}
            {!filiado && campanha.regras.prova_nao_filiado === "matricula" && " A matrícula é obrigatória."}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          <p className="text-muted-foreground text-xs">Declaração que a pessoa confirma:</p>
          <div
            className={cn(
              "rounded-lg border p-3 text-sm whitespace-pre-line",
              !campanha.texto_declaracao && "border-dashed"
            )}
          >
            {campanha.texto_declaracao ?? DECLARACAO_PADRAO}
          </div>
          {!campanha.texto_declaracao && (
            <p className="text-muted-foreground text-xs">Sem texto próprio: é a declaração padrão do sistema.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{filiado ? "4" : "3"}. Comprovante</CardTitle>
          <CardDescription>
            {exigeCarta
              ? "Com protocolo. A oposição fica “aguardando a carta”: a pessoa baixa a carta em PDF, assina e envia pelo comprovante."
              : "Com protocolo. A oposição vai direto para a avaliação; não há carta."}
          </CardDescription>
        </CardHeader>
      </Card>
    </>
  )
}
