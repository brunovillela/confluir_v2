"use client"

import { useState } from "react"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { formatarData } from "@/lib/formato"
import {
  ehDataISO,
  lerDias,
  retornoDoPeriodo,
  ultimoDiaDoPeriodo,
} from "@/lib/periodo-dias"

/**
 * Início + quantidade de dias; o último dia é calculado (o dia de início conta
 * como o primeiro — ver lib/periodo-dias.ts). Grava `inicio` e `dias` no
 * formulário; o servidor recalcula o término, a tela só mostra a prévia.
 */
export function CamposPeriodo({
  rotuloInicio = "Início *",
  rotuloDias = "Dias *",
  nomeDias = "dias",
  inicioPadrao,
  diasPadrao,
  placeholderDias = "Ex.: 10",
  mostrarRetorno = true,
}: {
  rotuloInicio?: string
  rotuloDias?: string
  nomeDias?: string
  inicioPadrao?: string | null
  diasPadrao?: number | null
  placeholderDias?: string
  mostrarRetorno?: boolean
}) {
  const [inicio, setInicio] = useState(inicioPadrao ?? "")
  const [dias, setDias] = useState(diasPadrao != null ? String(diasPadrao) : "")

  const n = lerDias(dias)
  const valido = ehDataISO(inicio) && n !== null

  return (
    <div className="grid gap-3 sm:col-span-2">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="grid gap-1.5">
          <Label htmlFor="inicio">{rotuloInicio}</Label>
          <Input
            id="inicio"
            name="inicio"
            type="date"
            required
            value={inicio}
            onChange={(e) => setInicio(e.target.value)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={nomeDias}>{rotuloDias}</Label>
          <Input
            id={nomeDias}
            name={nomeDias}
            type="number"
            min={1}
            step={1}
            inputMode="numeric"
            required
            placeholder={placeholderDias}
            value={dias}
            onChange={(e) => setDias(e.target.value)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label>Último dia</Label>
          <div className="bg-muted/50 text-foreground flex h-9 items-center rounded-md border px-3 text-sm tabular-nums">
            {valido ? formatarData(ultimoDiaDoPeriodo(inicio, n)) : "—"}
          </div>
        </div>
      </div>
      <p className="text-muted-foreground text-xs">
        O dia de início conta como o primeiro dia
        {valido && mostrarRetorno ? (
          <>
            {" "}— retorno ao trabalho em{" "}
            <strong className="text-foreground">
              {formatarData(retornoDoPeriodo(inicio, n))}
            </strong>
            .
          </>
        ) : (
          "."
        )}
      </p>
    </div>
  )
}
