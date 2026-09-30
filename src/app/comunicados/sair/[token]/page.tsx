import type { Metadata } from "next"
import { AlertTriangle, MailCheck, MailX } from "lucide-react"

import { Marca } from "@/components/marca"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { lerTokenDescadastro, situacaoComunicados } from "@/lib/db/comunicacao-descadastro"
import { texto } from "@/lib/db/comum"
import { formatarDataHora } from "@/lib/formato"
import { createServiceClient } from "@/lib/supabase/admin"

import { alterarComunicadosAction } from "./actions"

export const metadata: Metadata = {
  title: "Comunicados por e-mail — Confluir",
  robots: { index: false },
}

/**
 * Descadastro da mala direta, sem login: o link do rodapé de cada e-mail.
 * Abrir a página não descadastra ninguém (leitores de e-mail e antivírus
 * visitam os links) — a pessoa confirma no botão. Dá para voltar a receber.
 */
export default async function DescadastroPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>
  searchParams: Promise<{ feito?: string }>
}) {
  const { token } = await params
  const { feito } = await searchParams
  const titular = lerTokenDescadastro(decodeURIComponent(token))

  let entidade = "a entidade"
  let situacao: Awaited<ReturnType<typeof situacaoComunicados>> | null = null
  if (titular) {
    const svc = createServiceClient()
    const { data } = await svc.from("empresa").select("nome_fantasia, nome_razao").eq("id", titular.emp).maybeSingle()
    entidade = texto(data?.nome_fantasia) ?? texto(data?.nome_razao) ?? entidade
    situacao = await situacaoComunicados(titular, svc)
  }
  const descadastrado = !!situacao?.descadastradoEm

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-10">
      <div className="mb-8 flex flex-col items-center text-center">
        <Marca variante="completa" />
        <h1 className="mt-6 text-2xl font-semibold tracking-tight">Comunicados por e-mail</h1>
        {titular && <p className="text-muted-foreground mt-1 text-sm">{entidade}</p>}
      </div>

      {!titular || !situacao?.disponivel ? (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertDescription>
            Este link não é válido. Use o link do rodapé do e-mail que você recebeu, sem cortar
            nenhuma parte.
          </AlertDescription>
        </Alert>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              {descadastrado ? <MailX className="size-5" /> : <MailCheck className="size-5" />}
              {descadastrado ? "Você não recebe mais os comunicados" : "Você recebe os comunicados"}
            </CardTitle>
            <CardDescription>
              {descadastrado
                ? `Descadastro registrado${situacao.descadastradoEm ? ` em ${formatarDataHora(situacao.descadastradoEm)}` : ""}.`
                : `Mensagens da ${entidade} enviadas por e-mail aos filiados.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 text-sm">
            {feito === "sair" && descadastrado && (
              <Alert variant="success">
                <AlertDescription>Pronto: você não vai mais receber estes comunicados.</AlertDescription>
              </Alert>
            )}
            {feito === "voltar" && !descadastrado && (
              <Alert variant="success">
                <AlertDescription>Pronto: você volta a receber os comunicados.</AlertDescription>
              </Alert>
            )}
            <p className="text-muted-foreground">
              {descadastrado
                ? "Mudou de ideia? Você pode voltar a receber quando quiser."
                : "Se não quiser mais receber, confirme abaixo. Avisos ligados ao que você usa — votações, reservas, recuperação de senha — continuam chegando."}
            </p>
            <form action={alterarComunicadosAction}>
              <input type="hidden" name="token" value={decodeURIComponent(token)} />
              <input type="hidden" name="receber" value={descadastrado ? "1" : "0"} />
              <Button type="submit" variant={descadastrado ? "default" : "destructive"}>
                {descadastrado ? "Voltar a receber" : "Não quero mais receber"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </main>
  )
}
