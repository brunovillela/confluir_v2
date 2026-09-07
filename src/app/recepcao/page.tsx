import type { Metadata } from "next"
import Link from "next/link"
import { CalendarDays } from "lucide-react"

import { Marca } from "@/components/marca"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { eventosParaRecepcao, presentesNoDia } from "@/lib/db/eventos-recepcao"
import { formatarData, formatarDataHora } from "@/lib/formato"

import { Porta } from "./porta"

export const metadata: Metadata = { title: "Recepção — Confluir" }

/**
 * Recepção: porta própria, fora do /painel.
 *
 * Reusa o login normal do sistema (quem opera é usuário com a permissão
 * `eventos_recepcao`) — um segundo mecanismo de autenticação seria mais uma
 * peça para manter sem ganho real. O que muda é a TELA: sem barra lateral,
 * controles grandes, pensada para tablet em pé.
 */
export default async function RecepcaoPage({
  searchParams,
}: {
  searchParams: Promise<{ evento?: string; dia?: string }>
}) {
  await requirePermissao("eventos_recepcao", ["eventos_gestao"])
  const { evento: eventoId, dia: diaId } = await searchParams
  const { ativo, eventos } = await eventosParaRecepcao()

  const evento = eventoId ? eventos.find((e) => e.id === eventoId) : undefined
  const dia = evento && diaId ? evento.dias.find((d) => d.id === diaId) : undefined
  const presentes = dia ? await presentesNoDia(dia.id) : 0

  const hoje = new Date().toISOString().slice(0, 10)

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Marca variante="completa" />
        <span className="text-muted-foreground text-sm">Recepção</span>
      </div>

      {!ativo && (
        <Alert variant="destructive">
          <AlertDescription>
            As tabelas do módulo ainda não existem no banco. Rode
            <code className="mx-1">supabase/eventos.sql</code> no Supabase.
          </AlertDescription>
        </Alert>
      )}

      {/* Passo 1 — escolher o evento */}
      {ativo && !evento && (
        <Card>
          <CardContent className="grid gap-4">
            <h1 className="text-xl font-semibold">Qual evento?</h1>
            {eventos.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Nenhum evento publicado no momento.
              </p>
            ) : (
              <div className="grid gap-2">
                {eventos.map((e) => (
                  <Button
                    key={e.id}
                    asChild
                    variant="outline"
                    className="h-auto justify-start py-4"
                  >
                    <Link href={`/recepcao?evento=${e.id}`}>
                      <span className="grid gap-1 text-left">
                        <span className="text-base font-medium">
                          {e.titulo ?? "(sem título)"}
                        </span>
                        <span className="text-muted-foreground text-xs">
                          {formatarDataHora(e.inicio)}
                        </span>
                      </span>
                    </Link>
                  </Button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Passo 2 — escolher o dia (a presença é por dia) */}
      {ativo && evento && !dia && (
        <Card>
          <CardContent className="grid gap-4">
            <div>
              <h1 className="text-xl font-semibold">{evento.titulo}</h1>
              <p className="text-muted-foreground mt-1 text-sm">
                Qual dia você está atendendo?
              </p>
            </div>
            <div className="grid gap-2">
              {evento.dias.map((d) => (
                <Button
                  key={d.id}
                  asChild
                  variant={d.data === hoje ? "default" : "outline"}
                  className="h-auto justify-start py-4"
                >
                  <Link href={`/recepcao?evento=${evento.id}&dia=${d.id}`}>
                    <CalendarDays />
                    <span className="grid gap-1 text-left">
                      <span className="text-base font-medium">
                        {formatarData(d.data)}
                        {d.data === hoje ? " — hoje" : ""}
                      </span>
                      {d.rotulo && (
                        <span className="text-xs opacity-80">{d.rotulo}</span>
                      )}
                    </span>
                  </Link>
                </Button>
              ))}
            </div>
            <div>
              <Button asChild variant="ghost" size="sm" className="-ml-3 sm:ml-0">
                <Link href="/recepcao">Trocar de evento</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Passo 3 — a porta */}
      {ativo && evento && dia && (
        <div className="grid gap-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h1 className="text-xl font-semibold">{evento.titulo}</h1>
              <p className="text-muted-foreground text-sm">
                {formatarData(dia.data)}
                {dia.rotulo ? ` — ${dia.rotulo}` : ""}
              </p>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href={`/recepcao?evento=${evento.id}`}>Trocar de dia</Link>
            </Button>
          </div>

          <Porta
            eventoId={evento.id}
            diaId={dia.id}
            presentesIniciais={presentes}
          />
        </div>
      )}
    </main>
  )
}
