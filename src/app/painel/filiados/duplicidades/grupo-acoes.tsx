"use client"

import Link from "next/link"
import { useActionState, useState } from "react"
import { Loader2, Merge } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { type EstadoForm } from "@/lib/contas"

import { ignorarAction } from "./actions"

export function AcoesDoGrupo({
  tipo,
  chave,
  ids,
}: {
  tipo: string
  chave: string
  ids: string[]
}) {
  const [aberto, setAberto] = useState(false)
  const [estado, enviar, pendente] = useActionState<EstadoForm, FormData>(ignorarAction, {})
  if (estado.ok) return <p className="text-muted-foreground text-sm">{estado.ok}</p>
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" asChild>
          <Link href={`/painel/filiados/duplicidades/mesclar?ids=${ids.join(",")}`}>
            <Merge />
            Mesclar
          </Link>
        </Button>
        {!aberto && (
          <Button size="sm" variant="ghost" onClick={() => setAberto(true)}>
            Não é duplicidade
          </Button>
        )}
      </div>
      {aberto && (
        <form action={enviar} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="tipo" value={tipo} />
          <input type="hidden" name="chave" value={chave} />
          <input type="hidden" name="cadastros" value={ids.join(",")} />
          <Input name="motivo" placeholder="Por quê? (ex.: homônimos)" className="h-8 w-full sm:w-64" />
          <Button type="submit" size="sm" variant="outline" disabled={pendente}>
            {pendente && <Loader2 className="animate-spin" />}
            Confirmar
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setAberto(false)}>
            Voltar
          </Button>
        </form>
      )}
      {estado.erro && <p className="text-destructive text-sm">{estado.erro}</p>}
    </div>
  )
}
