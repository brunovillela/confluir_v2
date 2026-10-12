import type { Metadata } from "next"
import Link from "next/link"
import { AlertTriangle, CalendarClock, CircleCheck, Info, MessageSquarePlus } from "lucide-react"

import { DesistirForm } from "@/app/portal/desfiliacao/desistir-form"
import { Marca } from "@/components/marca"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { oQueAcontece, situacaoDoLink } from "@/lib/db/desistencia-coletiva"
import { emailContatoEntidade, nomeEntidade } from "@/lib/db/organizacao"
import { formatarData, formatarDataHora } from "@/lib/formato"

import { desistirPeloLinkAction } from "./actions"

export const metadata: Metadata = {
  title: "Desistência da filiação — Confluir",
  robots: { index: false },
}

/** Pedido de desfiliação pelo Atendimento do portal (o login devolve para cá via ?next=). */
const ATENDIMENTO_DESFILIACAO = `/portal/atendimento?${new URLSearchParams({
  assunto: "cadastro",
  titulo: "Desfiliação",
})}`

function decodificar(v: string): string {
  try {
    return decodeURIComponent(v)
  } catch {
    return v
  }
}

/**
 * Desistência da FILIAÇÃO COLETIVA sem login (A4): o link assinado que a
 * gestão manda ao trabalhador. Abrir a página não grava nada (leitores de
 * e-mail e antivírus visitam links) — a pessoa confirma digitando CONFIRMO.
 * O link não abre nenhum outro dado do portal: só nome parcial, empresa e
 * prazo. Fora do prazo, explica e aponta o Atendimento.
 */
export default async function DesistirPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ feito?: string | string[] }>
}) {
  const token = decodificar((await params).token)
  const { feito } = await searchParams
  const [situacao, entidade, email] = await Promise.all([
    situacaoDoLink(token),
    nomeEntidade(),
    emailContatoEntidade(),
  ])

  const contato = (
    <>
      {entidade}
      {email && (
        <>
          {" "}
          pelo e-mail{" "}
          <a href={`mailto:${email}`} className="font-medium underline underline-offset-4">
            {email}
          </a>
        </>
      )}
    </>
  )

  const pedirDesfiliacao = (
    <div className="grid gap-3">
      <p className="text-muted-foreground text-sm">
        Você ainda pode pedir a desfiliação: abra uma solicitação no Atendimento
        do portal do associado (entre com o seu CPF) ou fale com {contato}. Se
        o portal ainda não liberar a sua entrada, fale direto com a entidade.
      </p>
      <div>
        <Button asChild>
          <Link href={ATENDIMENTO_DESFILIACAO}>
            <MessageSquarePlus />
            Abrir solicitação de desfiliação
          </Link>
        </Button>
      </div>
    </div>
  )

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-10">
      <div className="mb-8 flex flex-col items-center text-center">
        <Marca variante="completa" />
        <h1 className="mt-6 text-2xl font-semibold tracking-tight">
          Desistência da filiação
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">{entidade}</p>
      </div>

      {situacao.estado === "invalido" && (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertDescription>
            Este link não é válido. Use o link que você recebeu, sem cortar
            nenhuma parte. Se o problema continuar, fale com {contato}.
          </AlertDescription>
        </Alert>
      )}

      {situacao.estado === "registrado" && (
        <div className="grid gap-4">
          {feito === "1" && (
            <Alert variant="success">
              <CircleCheck />
              <AlertDescription>
                Pronto: a sua desistência foi registrada.
              </AlertDescription>
            </Alert>
          )}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Desistência registrada</CardTitle>
              <CardDescription>
                {situacao.em
                  ? `Pedido registrado em ${formatarDataHora(situacao.em)}.`
                  : "O seu pedido de desistência já está registrado."}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm">
              <p className="font-medium">O que acontece agora</p>
              <ul className="text-muted-foreground grid list-disc gap-1 pl-5">
                {oQueAcontece("link").map((linha) => (
                  <li key={linha}>{linha}</li>
                ))}
              </ul>
              <p className="text-muted-foreground">Dúvidas? Fale com {contato}.</p>
            </CardContent>
          </Card>
        </div>
      )}

      {situacao.estado === "vencido" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              O prazo de desistência terminou
            </CardTitle>
            <CardDescription>
              O prazo para desistir da filiação coletiva terminou em{" "}
              {formatarData(situacao.prazo)}.
            </CardDescription>
          </CardHeader>
          <CardContent>{pedirDesfiliacao}</CardContent>
        </Card>
      )}

      {situacao.estado === "encerrado" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Este link não está mais disponível
            </CardTitle>
            <CardDescription>
              A filiação coletiva ligada a este link não está mais em
              andamento — o processo pode ter sido cancelado ou o seu cadastro,
              atualizado pela entidade.
            </CardDescription>
          </CardHeader>
          {/* Sem o botão de desfiliação: aqui a pessoa pode nem estar filiada
              (lote revertido). Quem sabe a situação é a entidade. */}
          <CardContent className="text-muted-foreground text-sm">
            Para saber a sua situação, fale com {contato}.
          </CardContent>
        </Card>
      )}

      {situacao.estado === "aberto" && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              <CalendarClock className="mr-1 inline size-4 align-[-3px]" />
              Você foi filiado por decisão da assembleia
            </CardTitle>
            <CardDescription>
              A categoria aprovou, em assembleia, um acordo coletivo com
              cláusula de filiação coletiva — por isso você passou a constar
              como filiado de {entidade}. Se quiser continuar filiado, não
              precisa fazer nada.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
              {situacao.nome && (
                <>
                  <dt className="text-muted-foreground">Nome</dt>
                  <dd className="font-medium">{situacao.nome}</dd>
                </>
              )}
              {situacao.empresa && (
                <>
                  <dt className="text-muted-foreground">Empresa</dt>
                  <dd className="font-medium">{situacao.empresa}</dd>
                </>
              )}
              <dt className="text-muted-foreground">Prazo para desistir</dt>
              <dd className="font-medium">até {formatarData(situacao.prazo)}</dd>
            </dl>

            <Alert>
              <Info />
              <AlertTitle>O que acontece se você desistir</AlertTitle>
              <AlertDescription>
                <ul className="mt-1 grid list-disc gap-1 pl-5">
                  {oQueAcontece("link").map((linha) => (
                    <li key={linha}>{linha}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>

            <DesistirForm action={desistirPeloLinkAction} token={token} />

            <p className="text-muted-foreground text-xs">
              Este link é pessoal. Se ele chegou a você por engano, não continue
              e avise {entidade}.
            </p>
          </CardContent>
        </Card>
      )}
    </main>
  )
}
