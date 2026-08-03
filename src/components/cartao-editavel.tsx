"use client"

import { useState, type ReactNode } from "react"
import { Pencil, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

/**
 * Cartão que mostra as INFORMAÇÕES por padrão e abre o formulário de edição
 * ao clicar no lápis (padrão de UX do Confluir — ver [[confluir-ux-formularios]]).
 *
 * `resumo` = a visualização (JSX); `children` = o formulário. O formulário some
 * de volta ao clicar no X. Após salvar, a action revalida a página e o `resumo`
 * reflete o novo dado — o usuário fecha manualmente.
 */
export function CartaoEditavel({
  titulo,
  descricao,
  resumo,
  children,
  abertoInicial = false,
}: {
  titulo: string
  descricao?: string
  resumo: ReactNode
  children: ReactNode
  abertoInicial?: boolean
}) {
  const [editando, setEditando] = useState(abertoInicial)

  return (
    <Card>
      <CardContent>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-medium">{titulo}</p>
            {descricao && (
              <p className="text-muted-foreground mt-0.5 text-sm">{descricao}</p>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setEditando((v) => !v)}
            aria-label={editando ? "Fechar edição" : "Editar"}
          >
            {editando ? <X /> : <Pencil />}
          </Button>
        </div>
        <div className="mt-3">{editando ? children : resumo}</div>
      </CardContent>
    </Card>
  )
}
