import type { Metadata } from "next"
import Link from "next/link"
import { CalendarDays, Camera, ScanFace, ShieldCheck } from "lucide-react"

import { Marca } from "@/components/marca"
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
import {
  dadosDoTitular,
  reciboDeExclusao,
  situacaoDaSessao,
  type DadoDoTitular,
} from "@/lib/db/eventos-titular"
import { formatarCnpjCpf, formatarDataHora, formatarTelefone } from "@/lib/formato"
import { tenantAtual } from "@/lib/tenant"

import { ConfirmarAcesso, Corrigir, Excluir } from "../formularios"

export const metadata: Metadata = {
  title: "Meus dados — Confluir",
  robots: { index: false },
}

const ROTULO_SITUACAO: Record<string, string> = {
  pendente: "aguardando confirmação",
  aguardando_email: "confirme seu e-mail",
  aguardando_aprovacao: "em análise",
  confirmada: "inscrição confirmada",
  recusada: "não aprovada",
  cancelada: "cancelada",
}

function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10">
      <div className="mb-8 flex flex-col items-center text-center">
        <Marca variante="completa" />
        <h1 className="mt-6 text-2xl font-semibold tracking-tight">
          Seus dados
        </h1>
      </div>
      {children}
    </main>
  )
}

function Inscricao({ d }: { d: DadoDoTitular }) {
  return (
    <div className="rounded-lg border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium">{d.eventoTitulo ?? "Evento"}</p>
          {d.eventoInicio && (
            <p className="text-muted-foreground flex items-center gap-1.5 text-sm">
              <CalendarDays className="size-3.5" />
              {formatarDataHora(d.eventoInicio)}
            </p>
          )}
        </div>
        <Badge variant={d.situacao === "confirmada" ? "success" : "secondary"}>
          {ROTULO_SITUACAO[d.situacao] ?? d.situacao}
        </Badge>
      </div>

      <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        <div className="flex justify-between gap-2 sm:block">
          <dt className="text-muted-foreground">Nome</dt>
          <dd className="truncate">{d.nome ?? "—"}</dd>
        </div>
        <div className="flex justify-between gap-2 sm:block">
          <dt className="text-muted-foreground">CPF</dt>
          <dd className="tabular-nums">{formatarCnpjCpf(d.cpf) || "—"}</dd>
        </div>
        <div className="flex justify-between gap-2 sm:block">
          <dt className="text-muted-foreground">Telefone</dt>
          <dd>{formatarTelefone(d.telefone) || "—"}</dd>
        </div>
        <div className="flex justify-between gap-2 sm:block">
          <dt className="text-muted-foreground">Inscrição feita em</dt>
          <dd>{formatarDataHora(d.inscritaEm)}</dd>
        </div>
      </dl>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        {d.temFoto ? (
          <Badge variant="outline" className="gap-1">
            {d.fotoBiometrica ? (
              <ScanFace className="size-3" />
            ) : (
              <Camera className="size-3" />
            )}
            {d.fotoBiometrica
              ? "foto usada no controle de acesso"
              : "foto guardada para conferência na portaria"}
          </Badge>
        ) : (
          <span className="text-muted-foreground">Sem foto.</span>
        )}
        {d.presencas > 0 && (
          <span className="text-muted-foreground">
            {d.presencas} {d.presencas === 1 ? "presença" : "presenças"}{" "}
            registrada{d.presencas === 1 ? "" : "s"}.
          </span>
        )}
      </div>
    </div>
  )
}

export default async function MeusDadosTokenPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const tenantId = await tenantAtual()
  const situacao = await situacaoDaSessao(token, tenantId)

  if (situacao === "aguardando") {
    return (
      <Moldura>
        <Card>
          <CardHeader>
            <CardTitle>Confirme que o e-mail é seu</CardTitle>
            <CardDescription>
              Digite o código de 6 dígitos que enviamos.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ConfirmarAcesso token={token} />
          </CardContent>
        </Card>
      </Moldura>
    )
  }

  if (situacao !== "confirmada") {
    return (
      <Moldura>
        <Alert variant="info">
          <AlertDescription>
            Este acesso não vale mais — ele dura poucas horas, de propósito.
            Comece de novo informando seu e-mail.
          </AlertDescription>
        </Alert>
        <div className="mt-4 flex justify-center">
          <Button asChild>
            <Link href="/meus-dados">Começar de novo</Link>
          </Button>
        </div>
      </Moldura>
    )
  }

  const [carga, recibo] = await Promise.all([
    dadosDoTitular(token, tenantId),
    reciboDeExclusao(token, tenantId),
  ])
  if (!carga) {
    return (
      <Moldura>
        <Alert variant="info">
          <AlertDescription>
            Sessão encerrada. Comece de novo informando seu e-mail.
          </AlertDescription>
        </Alert>
      </Moldura>
    )
  }

  const { email, dados } = carga
  const primeiro = dados[0]
  const temBiometria = dados.some(
    (d) => d.fotoBiometrica || d.acessoSituacao === "enviado"
  )

  return (
    <Moldura>
      <div className="grid gap-6">
        <Alert variant="info">
          <ShieldCheck />
          <AlertDescription>
            Você está identificado como <strong>{email}</strong>. Este acesso
            expira em algumas horas e não cria conta nem senha.
          </AlertDescription>
        </Alert>

        {recibo && (
          <Alert variant="success">
            <ShieldCheck />
            <AlertDescription className="grid gap-2">
              <span>
                <strong>Exclusão concluída</strong> em{" "}
                {formatarDataHora(recibo.em)}. Apagamos sua identificação de{" "}
                {recibo.registros}{" "}
                {recibo.registros === 1 ? "inscrição" : "inscrições"} — nome,
                CPF, e-mail, telefone e foto. O registro de presença ficou sem
                dono, para os números do evento continuarem certos.
              </span>
              {recibo.remocaoAcessoPendente && (
                <span>
                  Sua remoção do sistema de controle de acesso está registrada
                  como pendência da equipe: ela é feita fora do Confluir.
                </span>
              )}
              <span className="text-xs">
                Guarde esta tela como comprovante. Se precisar, a secretaria
                tem o mesmo registro.
              </span>
            </AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Suas inscrições</CardTitle>
            <CardDescription>
              O que a entidade guarda sobre você por causa dos eventos.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {dados.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Não há nenhuma inscrição ligada a este e-mail.
              </p>
            ) : (
              dados.map((d) => <Inscricao key={d.inscricaoId} d={d} />)
            )}
          </CardContent>
        </Card>

        {dados.length > 0 && (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Corrigir</CardTitle>
                <CardDescription>
                  Se algum dado está errado, ajuste aqui (LGPD art. 18, III).
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Corrigir
                  token={token}
                  nome={primeiro?.nome ?? null}
                  telefone={formatarTelefone(primeiro?.telefone) || null}
                />
              </CardContent>
            </Card>

            <Excluir token={token} temBiometria={temBiometria} />
          </>
        )}

        <p className="text-muted-foreground text-center text-xs">
          Direito garantido pela Lei Geral de Proteção de Dados (art. 18). Em
          caso de dúvida, procure a secretaria da entidade.
        </p>
      </div>
    </Moldura>
  )
}
