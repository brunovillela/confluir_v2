"use client"

import { useActionState, useState } from "react"
import { CalendarClock, Loader2, Trash2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  DIAS_SEMANA,
  MODOS_JANELA,
  MOTIVOS_BLOQUEIO,
  blocosDaJanela,
  horaCurta,
  rotuloMotivo,
  type ModoJanela,
} from "@/lib/espacos-constantes"
import { formatarDataHora } from "@/lib/formato"

import {
  criarBloqueioAction,
  criarJanelasAction,
  encerrarBloqueioAction,
  excluirBloqueioAction,
  excluirJanelaAction,
} from "../actions"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

type JanelaLinha = {
  id: string
  dia_semana: number
  hora_inicio: string
  hora_termino: string
  modo: ModoJanela
  slot_minutos: number | null
  rotulo: string | null
}

export function Janelas({
  espacoId,
  janelas,
  podeGerir,
}: {
  espacoId: string
  janelas: JanelaLinha[]
  podeGerir: boolean
}) {
  const [estado, formAction, pendente] = useActionState(criarJanelasAction, {})
  const [modo, setModo] = useState<ModoJanela>("livre")

  const porDia = DIAS_SEMANA.map((d) => ({
    ...d,
    faixas: janelas.filter((j) => j.dia_semana === d.dia),
  }))

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Quando pode ser cedido</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        {janelas.length === 0 ? (
          <Alert variant="warning">
            <AlertDescription>
              Sem faixa de horário, o espaço não aparece para quem quiser
              solicitar. Defina ao menos um dia.
            </AlertDescription>
          </Alert>
        ) : (
          <div className="grid gap-2">
            {porDia
              .filter((d) => d.faixas.length > 0)
              .map((d) => (
                <div key={d.dia} className="flex flex-wrap items-start gap-2">
                  <span className="w-28 shrink-0 text-sm font-medium">
                    {d.rotulo}
                  </span>
                  <div className="flex min-w-0 flex-wrap gap-2">
                    {d.faixas.map((j) => {
                      const blocos = blocosDaJanela(j)
                      return (
                        <span
                          key={j.id}
                          className="flex items-center gap-2 rounded-md border px-2 py-1 text-sm"
                        >
                          <span>
                            {horaCurta(j.hora_inicio)} às {horaCurta(j.hora_termino)}
                            {j.rotulo ? ` · ${j.rotulo}` : ""}
                          </span>
                          <Badge variant="outline" className="text-muted-foreground">
                            {j.modo === "slots"
                              ? `${blocos.length} bloco${blocos.length === 1 ? "" : "s"} de ${j.slot_minutos} min`
                              : "horário livre"}
                          </Badge>
                          {podeGerir && (
                            <form action={excluirJanelaAction}>
                              <input type="hidden" name="id" value={j.id} />
                              <input type="hidden" name="espaco_id" value={espacoId} />
                              <Button
                                type="submit"
                                variant="ghost"
                                size="icon"
                                className="size-6"
                                aria-label="Excluir faixa"
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            </form>
                          )}
                        </span>
                      )
                    })}
                  </div>
                </div>
              ))}
          </div>
        )}

        {podeGerir && (
          <form action={formAction} className="grid gap-3 rounded-md border p-3">
            <input type="hidden" name="espaco_id" value={espacoId} />
            {estado.erro && (
              <Alert variant="destructive">
                <AlertDescription>{estado.erro}</AlertDescription>
              </Alert>
            )}
            {estado.ok && (
              <Alert variant="success">
                <AlertDescription>{estado.ok}</AlertDescription>
              </Alert>
            )}

            <div className="grid gap-1.5">
              <Label>Dias da semana *</Label>
              <div className="flex flex-wrap gap-1.5">
                {DIAS_SEMANA.map((d) => (
                  <label
                    key={d.dia}
                    className="hover:bg-muted/40 flex items-center gap-1.5 rounded-md border px-2 py-1 text-sm"
                  >
                    <input type="checkbox" name="dias" value={d.dia} />
                    {d.curto}
                  </label>
                ))}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-4">
              <div className="grid gap-1.5">
                <Label htmlFor="hora_inicio">Das *</Label>
                <Input id="hora_inicio" name="hora_inicio" type="time" required />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="hora_termino">Até *</Label>
                <Input id="hora_termino" name="hora_termino" type="time" required />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="modo">Forma de cessão *</Label>
                <select
                  id="modo"
                  name="modo"
                  className={SELECT}
                  value={modo}
                  onChange={(e) => setModo(e.target.value as ModoJanela)}
                >
                  {MODOS_JANELA.map((m) => (
                    <option key={m.chave} value={m.chave}>
                      {m.rotulo}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="slot_minutos">Bloco (min)</Label>
                <Input
                  id="slot_minutos"
                  name="slot_minutos"
                  type="number"
                  min={15}
                  step={15}
                  disabled={modo !== "slots"}
                  placeholder={modo === "slots" ? "120" : "—"}
                />
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="rotulo">Nome da faixa</Label>
              <Input id="rotulo" name="rotulo" placeholder="Ex.: Manhã, Noite" />
            </div>

            <div className="flex justify-end">
              <Button type="submit" size="sm" disabled={pendente}>
                {pendente && <Loader2 className="animate-spin" />}
                Adicionar faixa
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  )
}

type BloqueioLinha = {
  id: string
  inicio: string | null
  termino: string | null
  motivo: string
  descricao: string | null
  encerrado_em: string | null
  vigente: boolean
  indefinido: boolean
}

export function Bloqueios({
  espacoId,
  bloqueios,
  podeGerir,
}: {
  espacoId: string
  bloqueios: BloqueioLinha[]
  podeGerir: boolean
}) {
  const [estado, formAction, pendente] = useActionState(criarBloqueioAction, {})
  const emAberto = bloqueios.filter((b) => !b.encerrado_em)
  const encerrados = bloqueios.filter((b) => b.encerrado_em)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Bloqueios de agenda</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        {emAberto.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Nenhum bloqueio ativo. O espaço segue a agenda normal.
          </p>
        ) : (
          <div className="grid gap-2">
            {emAberto.map((b) => (
              <div
                key={b.id}
                className="flex flex-wrap items-start justify-between gap-2 rounded-md border p-2.5 text-sm"
              >
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-medium">
                    <CalendarClock className="size-4" />
                    {rotuloMotivo(b.motivo)}
                    {b.vigente && (
                      <Badge
                        variant="outline"
                        className="border-destructive/40 text-destructive"
                      >
                        em vigor
                      </Badge>
                    )}
                    {b.indefinido && (
                      <Badge variant="outline" className="text-muted-foreground">
                        prazo indefinido
                      </Badge>
                    )}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    De {formatarDataHora(b.inicio)}
                    {b.termino
                      ? ` a ${formatarDataHora(b.termino)}`
                      : " — até alguém encerrar"}
                    {b.descricao ? ` · ${b.descricao}` : ""}
                  </p>
                </div>
                {podeGerir && (
                  <div className="flex shrink-0 gap-1">
                    <form action={encerrarBloqueioAction}>
                      <input type="hidden" name="id" value={b.id} />
                      <input type="hidden" name="espaco_id" value={espacoId} />
                      <Button type="submit" variant="outline" size="sm">
                        Encerrar
                      </Button>
                    </form>
                    <form action={excluirBloqueioAction}>
                      <input type="hidden" name="id" value={b.id} />
                      <input type="hidden" name="espaco_id" value={espacoId} />
                      <Button
                        type="submit"
                        variant="ghost"
                        size="icon"
                        aria-label="Excluir bloqueio"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </form>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {podeGerir && (
          <form action={formAction} className="grid gap-3 rounded-md border p-3">
            <input type="hidden" name="espaco_id" value={espacoId} />
            {estado.erro && (
              <Alert variant="destructive">
                <AlertDescription>{estado.erro}</AlertDescription>
              </Alert>
            )}
            {estado.ok && (
              <Alert variant="success">
                <AlertDescription>{estado.ok}</AlertDescription>
              </Alert>
            )}

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="grid gap-1.5">
                <Label htmlFor="inicio">Começa em *</Label>
                <Input
                  id="inicio"
                  name="inicio"
                  type="datetime-local"
                  required
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="termino">Termina em</Label>
                <Input id="termino" name="termino" type="datetime-local" />
                <p className="text-muted-foreground text-xs">
                  Em branco = prazo indefinido.
                </p>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="motivo">Motivo *</Label>
                <select id="motivo" name="motivo" className={SELECT} required>
                  {MOTIVOS_BLOQUEIO.map((m) => (
                    <option key={m.chave} value={m.chave}>
                      {m.rotulo}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="descricao">Descrição</Label>
              <Input
                id="descricao"
                name="descricao"
                placeholder="Ex.: troca do piso do palco"
              />
            </div>
            <div className="flex justify-end">
              <Button type="submit" size="sm" disabled={pendente}>
                {pendente && <Loader2 className="animate-spin" />}
                Bloquear período
              </Button>
            </div>
          </form>
        )}

        {encerrados.length > 0 && (
          <details className="text-sm">
            <summary className="text-muted-foreground cursor-pointer">
              {encerrados.length} bloqueio{encerrados.length === 1 ? "" : "s"}{" "}
              encerrado{encerrados.length === 1 ? "" : "s"}
            </summary>
            <ul className="text-muted-foreground mt-2 grid gap-1 text-xs">
              {encerrados.map((b) => (
                <li key={b.id}>
                  {rotuloMotivo(b.motivo)} — de {formatarDataHora(b.inicio)},
                  encerrado em {formatarDataHora(b.encerrado_em)}
                </li>
              ))}
            </ul>
          </details>
        )}
      </CardContent>
    </Card>
  )
}
