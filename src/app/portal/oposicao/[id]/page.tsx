import type { Metadata } from "next"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { ArrowLeft } from "lucide-react"

import { Marca } from "@/components/marca"
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
import { formatarData } from "@/lib/formato"
import { estadoPrazo } from "@/lib/oposicao-constantes"

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
  const sessao = await requireSessaoTrabalhador()
  const { id } = await params
  const campanha = await obterCampanhaPublica(id)
  if (!campanha || campanha.situacao !== "aberta") notFound()

  // Já se opôs → vai direto ao comprovante.
  const minha = await minhaOposicao(id, sessao.cpf)
  if (minha) redirect(`/portal/oposicao/comprovante/${minha.id}`)

  const prazo = estadoPrazo(campanha.prazo_inicio, campanha.prazo_fim, hojeSP())
  const ehFiliado = sessao.perfil === "filiado"
  const videoUrl = ehFiliado
    ? campanha.video_filiado_url
    : campanha.video_nao_filiado_url
  const videoTempo = ehFiliado
    ? campanha.video_filiado_tempo
    : campanha.video_nao_filiado_tempo

  return (
    <div className="mx-auto grid min-h-dvh max-w-2xl gap-6 px-4 py-8">
      <header className="flex items-center justify-between">
        <Marca />
        <Button variant="ghost" size="sm" asChild>
          <Link href="/portal/oposicao">
            <ArrowLeft />
            Voltar
          </Link>
        </Button>
      </header>

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
            <OposicaoFlow
              campanha={campanha}
              videoUrl={videoUrl}
              videoTempo={videoTempo}
            />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
