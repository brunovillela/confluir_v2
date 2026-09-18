"use client"

import { useState, type ReactNode } from "react"
import { Pencil, Plus, X } from "lucide-react"

import { Button } from "@/components/ui/button"

/**
 * Um botão que abre o formulário (pedido do Bruno, 18/09: nada de formulário
 * aberto direto). `resumo` aparece enquanto fechado; `children` é o formulário.
 */
export function AbrirFormulario({
  rotulo,
  icone = "editar",
  resumo,
  children,
}: {
  rotulo: string
  icone?: "editar" | "novo"
  resumo?: ReactNode
  children: ReactNode
}) {
  const [aberto, setAberto] = useState(false)
  const Icone = icone === "novo" ? Plus : Pencil
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">{!aberto && resumo}</div>
        <Button
          type="button"
          size="sm"
          variant={aberto ? "ghost" : icone === "novo" ? "default" : "outline"}
          onClick={() => setAberto((v) => !v)}
        >
          {aberto ? <X /> : <Icone />}
          {aberto ? "Fechar" : rotulo}
        </Button>
      </div>
      {aberto && children}
    </div>
  )
}
