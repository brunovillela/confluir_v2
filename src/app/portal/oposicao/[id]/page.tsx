import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { ArrowLeft } from "lucide-react"

import { Marca } from "@/components/marca"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { requireSessaoTrabalhador } from "@/lib/auth"
import { minhaOposicao, obterCampanhaPublica } from "@/lib/db/oposicao"
import { nomeEntidade } from "@/lib/db/organizacao"
import { formatarData } from "@/lib/formato"
import { estadoPrazo } from "@/lib/oposicao-constantes"
import { getVisualizacaoPortal } from "@/lib/visualizacao-filiado"

import { OposicaoFlow } from "./oposicao-flow"

export const metadata: Metadata = {
  title: "Registrar oposição — Confluir",
}

function hojeSP(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date())
}

export default async function RegistrarOposicaoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  // Na visualização da gestão, a sessão de trabalhador seria a de QUEM ATENDE:
  // a tela mostraria o fluxo dele sob a faixa "Visualizando a área de…". A
  // lista mostra a situação do filiado visualizado (e desliga o "Registrar").
  const vis = await getVisualizacaoPortal()
  if (vis?.preview) redirect("/portal/oposicao")

  const sessao = await requireSessaoTrabalhador()
  const { id } = await params
  const campanha = await obterCampanhaPublica(id)
  if (!campanha || campanha.situacao !== "aberta") notFound()

  // Já se opôs → vai direto ao comprovante. Quem disse "não quero me opor"
  // continua podendo registrar enquanto o prazo estiver aberto (A14).
  const minha = await minhaOposicao(id, sessao.cpf)
  if (minha && minha.situacao !== "desistente") {
    redirect(`/portal/oposicao/comprovante/${minha.id}`)
  }

  const prazo = estadoPrazo(campanha.prazo_inicio, campanha.prazo_fim, hojeSP())
  const ehFiliado = sessao.perfil === "filiado"
  const videoUrl = ehFiliado
    ? campanha.video_filiado_url
    : campanha.video_nao_filiado_url
  const videoTempo = ehFiliado
    ? campanha.video_filiado_tempo
    : campanha.video_nao_filiado_tempo

  const cartao = (
    <Card>
      <CardHeader>
        <CardTitle className="text-balance">
          {campanha.nome ?? "Contribuição assistencial"}
        </CardTitle>
        <CardDescription>
          {campanha.detalhe_desconto}
          <span className="mt-1 block">
            Prazo {formatarData(campanha.prazo_inicio)} –{" "}
            {formatarData(campanha.prazo_fim)}
          </span>
        </CardDescription>
      </CardHeader>
      <CardContent>
        {prazo !== "aberto" ? (
          <p className="text-muted-foreground text-sm">
            {prazo === "antes"
              ? "O prazo para se opor ainda não começou."
              : "O prazo para se opor já encerrou."}
          </p>
        ) : (
          <div className="grid gap-4">
            {minha && (
              <Alert variant="info">
                <AlertDescription>
                  Você optou por não se opor
                  {minha.dia ? ` em ${formatarData(minha.dia)}` : ""}. Se mudou
                  de ideia, siga os passos abaixo para registrar a sua
                  oposição.
                </AlertDescription>
              </Alert>
            )}
            <OposicaoFlow
              campanha={campanha}
              videoUrl={videoUrl}
              videoTempo={videoTempo}
            />
          </div>
        )}
      </CardContent>
    </Card>
  )

  // Na casca do portal (filiado logado — a regra do layout), menu e <main> são
  // do layout: a página é a coluna de leitura com o caminho de volta à lista,
  // como nas outras subpáginas do portal (A17).
  if (vis) {
    return (
      <div className="mx-auto grid w-full max-w-2xl gap-4">
        <div>
          <Button variant="ghost" size="sm" asChild className="-ml-2">
            <Link href="/portal/oposicao">
              <ArrowLeft />
              Contribuição assistencial
            </Link>
          </Button>
        </div>
        {cartao}
      </div>
    )
  }

  // Trabalhador não filiado: tela enxuta, com o <main> como landmark (A181).
  const entidade = await nomeEntidade()
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 px-4 py-8">
      <header className="flex items-center justify-between">
        <Marca tenant={entidade} />
        <Button variant="ghost" size="sm" asChild>
          <Link href="/portal/oposicao">
            <ArrowLeft />
            Voltar
          </Link>
        </Button>
      </header>
      <main id="conteudo" className="grid gap-6">
        {cartao}
      </main>
    </div>
  )
}
