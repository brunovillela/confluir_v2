"use client"

import { useState } from "react"

import { Input } from "@/components/ui/input"
import { mascararCpfParcial } from "@/lib/cpf"

/** Input de CPF com máscara progressiva. Envia o valor mascarado — as actions limpam com limparCpf(). */
export function CampoCpf(props: React.ComponentProps<typeof Input>) {
  const [valor, setValor] = useState("")

  return (
    <Input
      {...props}
      type="text"
      inputMode="numeric"
      autoComplete="username"
      placeholder="000.000.000-00"
      value={valor}
      onChange={(e) => setValor(mascararCpfParcial(e.target.value))}
    />
  )
}
