"use client"

import { useActionState, useEffect, useRef, useState } from "react"
import { CalendarClock, Loader2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

import { vincularJornada } from "../actions"

export type LinhaVinculo = {
  funcionarioId: string
  nome: string | null
  funcaoNome: string | null
  jornadaNome: string | null
  semana: string | null
}

/**
 * Lista dos funcionários com a jornada de cada um: marque quem quiser, escolha
 * a jornada e vincule de uma vez (ou tire a jornada deles).
 */
export function VincularJornadas({
  linhas,
  jornadas,
  semJornada = true,
  convite = "Marque os funcionários e escolha a jornada:",
  botao = "Vincular",
  vazio = "Nenhum funcionário ativo.",
}: {
  linhas: LinhaVinculo[]
  /** Destinos possíveis. Um só e sem "Sem jornada": vai direto, sem escolha. */
  jornadas: { id: string; nome: string }[]
  /** Oferece "Sem jornada" (tirar a jornada dos marcados). */
  semJornada?: boolean
  convite?: string
  botao?: string
  vazio?: string
}) {
  const destinoFixo = !semJornada && jornadas.length === 1 ? jornadas[0] : null
  const [estado, action, pend] = useActionState(vincularJornada, {})
  const [marcados, setMarcados] = useState<Set<string>>(new Set())
  const todos = useRef<HTMLInputElement>(null)

  const n = marcados.size
  const tudo = n > 0 && n === linhas.length
  useEffect(() => {
    if (todos.current) todos.current.indeterminate = n > 0 && !tudo
  }, [n, tudo])
  // Depois de gravar, desmarca (a lista volta com a jornada nova).
  const [estadoVisto, setEstadoVisto] = useState(estado)
  if (estado !== estadoVisto) {
    setEstadoVisto(estado)
    if (estado.ok) setMarcados(new Set())
  }

  const alternar = (id: string) =>
    setMarcados((m) => {
      const novo = new Set(m)
      if (novo.has(id)) novo.delete(id)
      else novo.add(id)
      return novo
    })

  return (
    <form action={action} className="grid gap-3">
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      {estado.ok && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>{estado.ok}</AlertDescription>
        </Alert>
      )}
      {[...marcados].map((id) => (
        <input key={id} type="hidden" name="funcionario_id" value={id} />
      ))}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm">
          {n === 0 ? convite : `${n === 1 ? "1 marcado" : `${n} marcados`}${destinoFixo ? "" : " →"}`}
        </span>
        {destinoFixo ? (
          <input type="hidden" name="jornada_id" value={destinoFixo.id} />
        ) : (
        <select
          name="jornada_id"
          aria-label="Jornada"
          className="border-input bg-background text-foreground h-9 w-auto min-w-48 max-w-80 rounded-md border px-2 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"
          defaultValue={jornadas[0]?.id ?? ""}
        >
          {jornadas.map((j) => (
            <option key={j.id} value={j.id}>
              {j.nome}
            </option>
          ))}
          {semJornada && <option value="">Sem jornada</option>}
        </select>
        )}
        <Button type="submit" size="sm" disabled={pend || n === 0}>
          {pend && <Loader2 className="animate-spin" />}
          {botao}
        </Button>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-10">
                <input
                  ref={todos}
                  type="checkbox"
                  aria-label="Marcar todos"
                  checked={tudo}
                  onChange={() =>
                    setMarcados(
                      tudo ? new Set() : new Set(linhas.map((l) => l.funcionarioId))
                    )
                  }
                />
              </TableHead>
              <TableHead>Funcionário</TableHead>
              <TableHead className="hidden sm:table-cell">Função</TableHead>
              <TableHead>Jornada</TableHead>
              <TableHead className="text-right">Semana</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {linhas.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="h-32">
                  <div className="text-muted-foreground flex flex-col items-center justify-center gap-2 text-center">
                    <CalendarClock className="size-6" />
                    <p className="text-sm">{vazio}</p>
                  </div>
                </TableCell>
              </TableRow>
            )}
            {linhas.map((l) => (
              <TableRow
                key={l.funcionarioId}
                data-state={marcados.has(l.funcionarioId) ? "selected" : undefined}
              >
                <TableCell>
                  <input
                    type="checkbox"
                    aria-label={`Marcar ${l.nome ?? "funcionário"}`}
                    checked={marcados.has(l.funcionarioId)}
                    onChange={() => alternar(l.funcionarioId)}
                  />
                </TableCell>
                <TableCell className="font-medium">{l.nome ?? "(sem nome)"}</TableCell>
                <TableCell className="text-muted-foreground hidden sm:table-cell">
                  {l.funcaoNome ?? "—"}
                </TableCell>
                <TableCell className={l.jornadaNome ? "" : "text-muted-foreground"}>
                  {l.jornadaNome ?? "sem jornada"}
                </TableCell>
                <TableCell className="text-right tabular-nums">{l.semana ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </form>
  )
}
