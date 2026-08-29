import type { Metadata } from "next"

import { AuthShell } from "@/components/auth/auth-shell"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  elegibilidadeEleitorEmail,
  elegibilidadeParaVotar,
  perguntasDaAssembleia,
} from "@/lib/db/votacao-portal"
import { createClient } from "@/lib/supabase/server"

import { CedulaForm } from "@/app/portal/votacao/[id]/cedula-form"

import { votarPublico } from "./actions"
import { VotarForm } from "./votar-form"

export const metadata: Metadata = { title: "Votação — Confluir" }

export default async function VotarPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  // Sessão do eleitor (criada pelo OTP) — a identidade é o CPF do metadata.
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const cpf =
    typeof user?.user_metadata?.cpf === "string" &&
    user.user_metadata.cpf.length === 11
      ? user.user_metadata.cpf
      : null

  // Sem sessão → identificação (CPF de filiado ou e-mail de não-filiado).
  if (!user) {
    return (
      <AuthShell rodape="O acesso é temporário e expira ao final da votação.">
        <VotarForm assembleiaId={id} />
      </AuthShell>
    )
  }

  // Identidade da sessão: filiado (CPF no metadata) ou não-filiado (e-mail).
  const eleg = cpf
    ? await elegibilidadeParaVotar(cpf, id)
    : user.email
      ? await elegibilidadeEleitorEmail(user.email, id)
      : null
  const perguntas = eleg?.online ? await perguntasDaAssembleia(id) : []

  return (
    <AuthShell rodape="O acesso é temporário e expira ao final da votação.">
      <Card>
        <CardHeader>
          <CardTitle>{eleg?.nome ?? "Cédula de votação"}</CardTitle>
          <CardDescription>
            {eleg?.empregador ?? "Escolha uma opção em cada pergunta."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!eleg ? (
            <Alert variant="warning">
              <AlertDescription>
                Você não está apto a votar nesta assembleia, ou a votação não
                está aberta.
              </AlertDescription>
            </Alert>
          ) : !eleg.online ? (
            <Alert variant="warning">
              <AlertDescription>
                Esta assembleia é presencial — não há cédula online.
              </AlertDescription>
            </Alert>
          ) : eleg.jaVotou ? (
            <Alert className="border-success/40 text-success-fg">
              <AlertDescription>
                Você já votou nesta assembleia. Obrigado por participar.
              </AlertDescription>
            </Alert>
          ) : perguntas.length === 0 ? (
            <Alert variant="warning">
              <AlertDescription>
                A cédula desta assembleia ainda não tem perguntas.
              </AlertDescription>
            </Alert>
          ) : (
            <CedulaForm assembleiaId={id} perguntas={perguntas} acao={votarPublico} />
          )}
        </CardContent>
      </Card>
    </AuthShell>
  )
}
