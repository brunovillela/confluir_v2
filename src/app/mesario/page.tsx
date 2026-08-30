import type { Metadata } from "next"
import Link from "next/link"
import {
  Box,
  CheckCircle2,
  ClipboardList,
  LogOut,
  Monitor,
  Vote,
} from "lucide-react"

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
import { mesariosDaSessao, urnasDoMesario } from "@/lib/db/votacao-mesarios"

import { sairMesario } from "./actions"
import { LoginMesario } from "./login-form"

export const metadata: Metadata = { title: "Ambiente do mesário — Confluir" }

function fmtHorario(iso: string | null): string | null {
  return iso
    ? new Date(iso).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null
}

export default async function MesarioPage() {
  const { email, urnas } = await urnasDoMesario()
  const mesarios = await mesariosDaSessao()

  return (
    <div className="mx-auto grid max-w-2xl gap-6 px-4 py-10">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <ClipboardList className="text-primary size-6" />
          Ambiente do mesário
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Registre a presença dos eleitores. O voto é secreto: você nunca vê em
          quem cada pessoa votou.
        </p>
      </div>

      {/* Não autenticado */}
      {!email && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Acesso do mesário</CardTitle>
            <CardDescription>
              Entre com o e-mail cadastrado pela organização. Enviaremos um
              código de acesso.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <LoginMesario />
          </CardContent>
        </Card>
      )}

      {/* Autenticado, mas não é mesário */}
      {email && mesarios.length === 0 && (
        <Card>
          <CardContent className="grid gap-4 pt-6">
            <Alert variant="warning">
              <AlertDescription>
                A conta <strong>{email}</strong> não está cadastrada como
                mesário em nenhuma rodada ativa.
              </AlertDescription>
            </Alert>
            <form action={sairMesario}>
              <Button type="submit" variant="outline" size="sm">
                <LogOut />
                Sair
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Mesário autenticado */}
      {email && mesarios.length > 0 && (
        <>
          <div className="flex items-center justify-between gap-2">
            <p className="text-muted-foreground text-sm">
              Conectado como <strong>{mesarios[0].nome ?? email}</strong>
            </p>
            <form action={sairMesario}>
              <Button type="submit" variant="ghost" size="sm">
                <LogOut />
                Sair
              </Button>
            </form>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Suas urnas</CardTitle>
              <CardDescription>
                Você só opera a urna dentro do horário definido.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              {urnas.length === 0 && (
                <p className="text-muted-foreground py-4 text-center text-sm">
                  Nenhuma urna vinculada às suas rodadas ainda.
                </p>
              )}
              {urnas.map((u) => {
                const ab = fmtHorario(u.abertura)
                const fe = fmtHorario(u.fechamento)
                return (
                  <div
                    key={u.id}
                    className="grid gap-2 rounded-lg border p-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="flex items-center gap-2 text-sm font-medium">
                        {u.tipo === "digital" ? (
                          <Monitor className="size-4" />
                        ) : (
                          <Box className="size-4" />
                        )}
                        {u.nome ?? "Urna"}
                      </p>
                      {u.aberta ? (
                        <Badge
                          variant="outline"
                          className="border-success/40 text-success-fg"
                        >
                          <CheckCircle2 className="size-3" />
                          Aberta
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="text-muted-foreground"
                        >
                          Fora do horário
                        </Badge>
                      )}
                    </div>
                    <p className="text-muted-foreground text-xs">
                      {u.assembleiaNome ?? "Assembleia"}
                      {ab || fe ? ` · ${ab ?? "…"} → ${fe ?? "…"}` : ""}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {u.compareceram.toLocaleString("pt-BR")} de{" "}
                      {u.totalAptos.toLocaleString("pt-BR")} compareceram
                      {u.tipo === "digital" && (
                        <>
                          {" · "}
                          {u.terminalPareado
                            ? "terminal pareado"
                            : "sem terminal pareado"}
                        </>
                      )}
                    </p>
                    <div>
                      <Button size="sm" variant="outline" asChild>
                        <Link href={`/mesario/urna/${u.id}`}>
                          <Vote />
                          Operar urna
                        </Link>
                      </Button>
                    </div>
                  </div>
                )
              })}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
