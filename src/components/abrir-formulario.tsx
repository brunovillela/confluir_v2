"use client"

import { useState, type ReactNode } from "react"
import { Pencil, Plus, X } from "lucide-react"

import { Button } from "@/components/ui/button"

/**
 * Um botão que abre o formulário (pedido do Bruno, 18/09: nada de formulário
 * aberto direto). `resumo` aparece enquanto fechado; `children` é o formulário.
 * Para editar um registro com formulário que já traz o próprio cartão, use
 * CartaoDados + `?editar=1` (components/cartao-dados.tsx).
 */
export function AbrirFormulario({
  rotulo,
  icone = "editar",
  resumo,
  abertoInicial = false,
  children,
}: {
  rotulo: string
  icone?: "editar" | "novo"
  resumo?: ReactNode
  /** Já aberto ao carregar (quando a URL indica que a pessoa veio preencher). */
  abertoInicial?: boolean
  children: ReactNode
}) {
  const [aberto, setAberto] = useState(abertoInicial)
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
