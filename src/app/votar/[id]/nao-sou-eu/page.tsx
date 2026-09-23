import type { Metadata } from "next"
import { AlertTriangle } from "lucide-react"

import { AuthShell } from "@/components/auth/auth-shell"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { aptoDoToken } from "@/lib/acesso-eleitor"

import { confirmarNaoSouEu } from "../actions"

export const metadata: Metadata = { title: "Não sou eu — Confluir", robots: { index: false } }

/**
 * "Não sou eu" com CONFIRMAÇÃO — e é por isso que existe uma página aqui em
 * vez de um link direto.
 *
 * Em 23/09/2026 o antivírus de e-mail de uma empregadora abriu todos os links
 * da mensagem, como esses programas fazem, e desativou o acesso de 49
 * eleitores de uma vez. Robô abre endereço (GET); robô não aperta botão que
 * envia formulário (POST). Então abrir esta página não muda nada: só o clique
 * no botão desativa o link e avisa o sindicato.
 */
export default async function NaoSouEuPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ t?: string; feito?: string }>
}) {
  const { id } = await params
  const { t = "", feito } = await searchParams

  if (feito === "1") {
    return (
      <AuthShell rodape="O acesso é temporário e expira ao final da votação.">
        <Alert variant="success">
          <AlertDescription>
            Obrigado. Avisamos o sindicato de que este e-mail não é seu, e o link foi
            desativado. Se você recebeu por engano, pode fechar esta página.
          </AlertDescription>
        </Alert>
      </AuthShell>
    )
  }

  const apto = t ? await aptoDoToken(t, id) : null

  return (
    <AuthShell rodape="O acesso é temporário e expira ao final da votação.">
      <Card>
        <CardHeader>
          <CardTitle>Este e-mail não é seu?</CardTitle>
          <CardDescription>
            {apto?.nome
              ? `O link desta mensagem é de ${apto.nome}.`
              : "O link desta mensagem é pessoal e vale para uma pessoa só."}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {!apto ? (
            <Alert variant="warning">
              <AlertTriangle />
              <AlertDescription>
                Este link não é mais válido — ou já foi usado, ou o endereço veio
                incompleto. Não é preciso fazer nada.
              </AlertDescription>
            </Alert>
          ) : (
            <>
              <p className="text-muted-foreground text-sm">
                Confirmando, o link para de funcionar na hora e o sindicato confere o
                cadastro. Faça isso só se a mensagem <strong>não</strong> era para você.
              </p>
              <form action={confirmarNaoSouEu} className="grid gap-2">
                <input type="hidden" name="assembleia_id" value={id} />
                <input type="hidden" name="t" value={t} />
                <Button type="submit" variant="destructive">
                  Confirmo: este e-mail não é meu
                </Button>
              </form>
              <p className="text-muted-foreground text-xs">
                Se o e-mail é seu e você quer votar, feche esta página e use o botão
                &ldquo;Ir para a votação&rdquo; da mensagem.
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </AuthShell>
  )
}
