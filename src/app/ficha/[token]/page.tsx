import type { Metadata } from "next"
import { Download, ExternalLink, FileSignature } from "lucide-react"

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
import { Marca } from "@/components/marca"
import { formatarCpf } from "@/lib/cpf"
import {
  obterSolicitacaoPorToken,
  type SituacaoSolicitacao,
} from "@/lib/db/filiacao-publica"
import { formatarData } from "@/lib/formato"

import { UploadAssinadaForm as UploadAssinadaFormClient } from "./ficha-forms"

export const metadata: Metadata = {
  title: "Sua ficha de filiação — Confluir",
  robots: { index: false },
}

const STATUS: Record<
  SituacaoSolicitacao,
  { rotulo: string; classe?: string }
> = {
  aguardando_verificacao: { rotulo: "Aguardando confirmação de e-mail" },
  aguardando_assinatura: {
    rotulo: "Aguardando assinatura",
    classe: "border-warning/40 text-warning-fg",
  },
  nao_avaliada: {
    rotulo: "Em avaliação",
    classe: "border-info/40 text-info-fg",
  },
  aprovada: {
    rotulo: "Filiação aprovada",
    classe: "border-success/40 text-success-fg",
  },
  reprovada: { rotulo: "Não aprovada", classe: "border-destructive/40 text-destructive" },
  desistente: { rotulo: "Desistência" },
}

export default async function FichaPublicaPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ boasvindas?: string; enviado?: string }>
}) {
  const { token } = await params
  const { boasvindas, enviado } = await searchParams
  const s = await obterSolicitacaoPorToken(token)

  if (!s) {
    return (
      <main className="mx-auto w-full max-w-md px-4 py-12 text-center">
        <Marca variante="completa" />
        <p className="text-muted-foreground mt-8 text-sm">
          Ficha não encontrada. Verifique o link enviado ao seu e-mail.
        </p>
      </main>
    )
  }

  const status = STATUS[s.situacao]
  const endereco =
    [
      [s.endereco_logradouro, s.endereco_numero].filter(Boolean).join(", "),
      s.endereco_bairro,
      [s.endereco_cidade, s.endereco_estado].filter(Boolean).join("/"),
    ]
      .filter(Boolean)
      .join(" — ") || null

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10">
      <div className="mb-8 flex flex-col items-center text-center">
        <Marca variante="completa" />
        <h1 className="mt-6 text-2xl font-semibold tracking-tight">
          Sua ficha de filiação
        </h1>
        <div className="mt-2 flex items-center gap-2">
          {s.protocolo && (
            <span className="text-muted-foreground text-xs tabular-nums">
              Protocolo nº {s.protocolo}
            </span>
          )}
          <Badge variant="outline" className={status.classe}>
            {status.rotulo}
          </Badge>
        </div>
      </div>

      {boasvindas === "1" && (
        <Alert className="border-success/40 text-success-fg mb-4">
          <AlertDescription>
            E-mail confirmado! Guarde este link — é o seu acesso à ficha.
          </AlertDescription>
        </Alert>
      )}
      {enviado === "1" && (
        <Alert className="border-success/40 text-success-fg mb-4">
          <AlertDescription>
            Ficha assinada recebida. Sua filiação foi enviada para avaliação.
          </AlertDescription>
        </Alert>
      )}

      {s.situacao === "aguardando_verificacao" && (
        <Alert className="mb-4">
          <AlertDescription>
            Confirme seu e-mail para continuar.{" "}
            <a
              href={`/filiar/verificar?s=${s.token}`}
              className="text-foreground font-medium underline underline-offset-4"
            >
              Inserir o código
            </a>
            .
          </AlertDescription>
        </Alert>
      )}

      {s.situacao === "reprovada" && s.reprovacao_motivo && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>
            Sua filiação não foi aprovada: {s.reprovacao_motivo}
          </AlertDescription>
        </Alert>
      )}

      {/* Assinatura (gov.br) */}
      {s.situacao === "aguardando_assinatura" && (
        <Card className="mb-4">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Assine e envie a ficha</CardTitle>
              <FileSignature className="text-muted-foreground size-4" />
            </div>
            <CardDescription>
              Baixe a ficha, assine no Assinador gov.br e envie o PDF assinado.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <ol className="text-muted-foreground grid gap-2 text-sm">
              <li>
                1. Baixe a sua ficha em PDF no botão abaixo.
              </li>
              <li>
                2. Assine o arquivo no{" "}
                <a
                  href="https://assinador.iti.br"
                  target="_blank"
                  rel="noreferrer"
                  className="text-foreground inline-flex items-center gap-1 underline underline-offset-4"
                >
                  Assinador gov.br <ExternalLink className="size-3" />
                </a>{" "}
                (login com sua conta gov.br).
              </li>
              <li>3. Envie o PDF assinado no campo abaixo.</li>
            </ol>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" asChild>
                <a href={`/ficha/${s.token}/pdf`} target="_blank" rel="noreferrer">
                  <Download />
                  Baixar ficha (PDF)
                </a>
              </Button>
            </div>
            <UploadAssinadaFormClient token={s.token} />
          </CardContent>
        </Card>
      )}

      {/* Download disponível também nos demais estados verificados */}
      {s.situacao !== "aguardando_verificacao" &&
        s.situacao !== "aguardando_assinatura" && (
          <div className="mb-4">
            <Button variant="outline" asChild>
              <a href={`/ficha/${s.token}/pdf`} target="_blank" rel="noreferrer">
                <Download />
                Baixar ficha (PDF)
              </a>
            </Button>
          </div>
        )}

      {/* Resumo dos dados */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dados da ficha</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <Campo rotulo="Nome" valor={s.nome} />
            {s.nome_social && <Campo rotulo="Nome social" valor={s.nome_social} />}
            <Campo rotulo="CPF" valor={s.cpf ? formatarCpf(s.cpf) : null} />
            <Campo
              rotulo="Nascimento"
              valor={s.nascimento ? formatarData(s.nascimento) : null}
            />
            <Campo rotulo="E-mail" valor={s.email} />
            <Campo rotulo="Empregador" valor={s.empregadorNome} />
            <Campo rotulo="Matrícula" valor={s.matricula} />
            <Campo rotulo="Cargo" valor={s.cargo} />
            <Campo rotulo="Lotação" valor={s.lotacao} />
            <div className="sm:col-span-2">
              <Campo rotulo="Endereço" valor={endereco} />
            </div>
          </dl>
        </CardContent>
      </Card>
    </main>
  )
}

function Campo({ rotulo, valor }: { rotulo: string; valor: string | null }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{rotulo}</dt>
      <dd className="mt-0.5">{valor ?? "—"}</dd>
    </div>
  )
}
