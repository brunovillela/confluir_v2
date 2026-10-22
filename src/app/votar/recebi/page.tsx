import type { Metadata } from "next"
import Link from "next/link"
import { CheckCircle2, MailCheck } from "lucide-react"

import { AuthShell } from "@/components/auth/auth-shell"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

import { confirmarRecebidoAction } from "./actions"

export const metadata: Metadata = { title: "Recebi o e-mail — Confluir", robots: { index: false } }

/**
 * "Recebi este e-mail" do aviso prévio (teste de entrega, fase 3 do plano de
 * 21/10/2026). Como no "Não sou eu": abrir a página não grava nada — o robô de
 * segurança da empresa abre todos os links da mensagem. Só o envio do
 * formulário (POST), que é gente apertando o botão, confirma.
 */
export default async function RecebiPage({ searchParams }: { searchParams: Promise<{ t?: string; feito?: string; erro?: string }> }) {
  const { t = "", feito, erro } = await searchParams

  if (feito === "1") {
    return (
      <AuthShell>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="text-success-fg size-5" />
              Obrigado!
            </CardTitle>
            <CardDescription>
              O sindicato agora sabe que o e-mail chega até você. Quando a votação abrir, o seu link pessoal de voto
              chega nesta mesma caixa.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <p className="text-muted-foreground">
              Quer receber o link também no celular? Cadastre-se pelo <strong>Telegram</strong> (sem código) ou com um
              e-mail pessoal.
            </p>
            <Button variant="outline" asChild>
              <Link href="/votar">Cadastrar Telegram ou e-mail pessoal</Link>
            </Button>
          </CardContent>
        </Card>
      </AuthShell>
    )
  }

  return (
    <AuthShell>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MailCheck className="size-5" />
            Confirme que o e-mail chegou
          </CardTitle>
          <CardDescription>
            Um clique no botão abaixo avisa o sindicato de que o e-mail da empresa chega até você. Não é o voto e não
            pede nenhum dado.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {erro && (
            <Alert variant="error">
              <AlertDescription>{erro}</AlertDescription>
            </Alert>
          )}
          {t ? (
            <form action={confirmarRecebidoAction}>
              <input type="hidden" name="t" value={t} />
              <Button type="submit" className="w-full">
                Recebi o e-mail
              </Button>
            </form>
          ) : (
            <Alert variant="warning">
              <AlertDescription>O endereço veio incompleto. Abra de novo o botão do e-mail.</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </AuthShell>
  )
}
