import type { Metadata } from "next"
import Link from "next/link"
import { CheckCircle2, ClipboardCheck, LogOut, Scale } from "lucide-react"

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
import { apuradoresDaSessao, urnasDoApurador } from "@/lib/db/votacao-apuracao"

import { sairApurador } from "./actions"
import { LoginApurador } from "./login-form"

export const metadata: Metadata = { title: "Ambiente do apurador — Confluir" }

const ROTULO_STATUS = {
  nao_iniciada: "Não iniciada",
  em_andamento: "Em andamento",
  concluida: "Concluída",
} as const

export default async function ApuradorPage() {
  const { email, urnas } = await urnasDoApurador()
  const apuradores = await apuradoresDaSessao()

  return (
    <div className="mx-auto grid max-w-2xl gap-6 px-4 py-10">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Scale className="text-primary size-6" />
          Ambiente do apurador
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Abra a urna, ateste a integridade dos lacres e apure a contagem por
          opção, com branco e nulo.
        </p>
      </div>

      {!email && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Acesso do apurador</CardTitle>
            <CardDescription>
              Entre com o e-mail cadastrado pela organização. Enviaremos um
              código de acesso.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LoginApurador />
          </CardContent>
        </Card>
      )}

      {email && apuradores.length === 0 && (
        <Card>
          <CardContent className="grid gap-4 pt-6">
            <Alert variant="warning">
              <AlertDescription>
                A conta <strong>{email}</strong> não está cadastrada como
                apurador em nenhuma rodada ativa.
              </AlertDescription>
            </Alert>
            <form action={sairApurador}>
              <Button type="submit" variant="outline" size="sm">
                <LogOut />
                Sair
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {email && apuradores.length > 0 && (
        <>
          <div className="flex items-center justify-between gap-2">
            <p className="text-muted-foreground text-sm">
              Conectado como <strong>{apuradores[0].nome ?? email}</strong>
            </p>
            <form action={sairApurador}>
              <Button type="submit" variant="ghost" size="sm">
                <LogOut />
                Sair
              </Button>
            </form>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Urnas atribuídas</CardTitle>
              <CardDescription>
                As urnas que a organização atribuiu a você para apurar.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              {urnas.length === 0 && (
                <p className="text-muted-foreground py-4 text-center text-sm">
                  Nenhuma urna atribuída a você ainda.
                </p>
              )}
              {urnas.map((u) => (
                <div key={u.id} className="grid gap-2 rounded-lg border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium">{u.nome ?? "Urna"}</p>
                    <Badge
                      variant="outline"
                      className={
                        u.apuracaoStatus === "concluida"
                          ? "border-success/40 text-success-fg"
                          : u.apuracaoStatus === "em_andamento"
                            ? "border-warning/40 text-warning-fg"
                            : "text-muted-foreground"
                      }
                    >
                      {u.apuracaoStatus === "concluida" && (
                        <CheckCircle2 className="size-3" />
                      )}
                      {ROTULO_STATUS[u.apuracaoStatus]}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground text-xs">
                    {u.assembleiaNome ?? "Assembleia"} ·{" "}
                    {u.tipo === "fisica" ? "física" : "digital"}
                  </p>
                  <div>
                    <Button size="sm" variant="outline" asChild>
                      <Link href={`/apurador/urna/${u.id}`}>
                        <ClipboardCheck />
                        Apurar urna
                      </Link>
                    </Button>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
