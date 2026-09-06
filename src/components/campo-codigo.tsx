"use client"

import { useRef, useState } from "react"

import { cn } from "@/lib/utils"

/**
 * Campo de código de 6 dígitos, uma caixa por número.
 *
 * O valor real vive num único `input` escondido com o `name` do formulário —
 * as caixas são só a aparência. Assim a action continua lendo um campo de
 * texto normal, e colar o código do e-mail (seis dígitos de uma vez) funciona.
 */
export function CampoCodigo({
  name = "codigo",
  id = "codigo",
  digitos = 6,
  autoFocus = false,
}: {
  name?: string
  id?: string
  digitos?: number
  autoFocus?: boolean
}) {
  const [valor, setValor] = useState("")
  const caixas = useRef<(HTMLInputElement | null)[]>([])

  function aplicar(novo: string, focar: number) {
    const limpo = novo.replace(/\D/g, "").slice(0, digitos)
    setValor(limpo)
    const alvo = Math.min(Math.max(focar, 0), digitos - 1)
    caixas.current[alvo]?.focus()
  }

  function aoDigitar(i: number, entrada: string) {
    const digitado = entrada.replace(/\D/g, "")
    if (!digitado) return
    // Colar o código inteiro numa caixa preenche todas.
    if (digitado.length > 1) {
      aplicar(valor.slice(0, i) + digitado, i + digitado.length)
      return
    }
    const arr = valor.padEnd(digitos, " ").split("")
    arr[i] = digitado
    aplicar(arr.join("").trimEnd(), i + 1)
  }

  function aoTeclar(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace") {
      e.preventDefault()
      // Caixa vazia: apaga a anterior — é o que a pessoa espera ao corrigir.
      const alvo = valor[i] ? i : i - 1
      if (alvo < 0) return
      const arr = valor.split("")
      arr[alvo] = ""
      aplicar(arr.join(""), alvo)
    } else if (e.key === "ArrowLeft") {
      caixas.current[i - 1]?.focus()
    } else if (e.key === "ArrowRight") {
      caixas.current[i + 1]?.focus()
    }
  }

  return (
    <div className="flex gap-2" id={id}>
      <input type="hidden" name={name} value={valor} />
      {Array.from({ length: digitos }, (_, i) => (
        <input
          key={i}
          ref={(el) => {
            caixas.current[i] = el
          }}
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          aria-label={`Dígito ${i + 1} de ${digitos}`}
          maxLength={digitos}
          value={valor[i] ?? ""}
          autoFocus={autoFocus && i === 0}
          onChange={(e) => aoDigitar(i, e.target.value)}
          onKeyDown={(e) => aoTeclar(i, e)}
          onFocus={(e) => e.target.select()}
          className={cn(
            "border-input bg-background text-foreground size-11 rounded-md border text-center text-lg font-medium tabular-nums shadow-xs outline-none transition-colors",
            "focus:border-ring focus:ring-ring/40 focus:ring-2",
            valor[i] && "border-ring/60"
          )}
        />
      ))}
    </div>
  )
}
