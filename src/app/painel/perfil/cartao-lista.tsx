"use client"

import { useState, type ReactNode } from "react"
import { Plus, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

/**
 * Cartão compacto de uma lista do perfil (telefones, endereços): título com
 * ícone e "Adicionar" no cabeçalho; o formulário abre acima da lista e some
 * no X. Ocupa metade da largura no desktop — os dois cartões lado a lado.
 */
export function CartaoLista({
  titulo,
  icone,
  item,
  formulario,
  children,
}: {
  titulo: string
  icone: ReactNode
  /** Nome de UM item, para o rótulo do botão (ex.: "telefone"). */
  item: string
  formulario: ReactNode
  children: ReactNode
}) {
  const [adicionando, setAdicionando] = useState(false)
  return (
    <Card className="gap-0 py-4">
      <CardContent className="grid gap-3 px-4">
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-2 font-medium">
            {icone}
            {titulo}
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="h-7"
            onClick={() => setAdicionando((v) => !v)}
            aria-label={adicionando ? "Fechar" : `Adicionar ${item}`}
          >
            {adicionando ? <X /> : <Plus />}
            {adicionando ? "Fechar" : "Adicionar"}
          </Button>
        </div>
        {adicionando && <div className="bg-muted/40 rounded-lg border p-3">{formulario}</div>}
        {children}
      </CardContent>
    </Card>
  )
}
