"use client"

import { startTransition, useActionState, useState } from "react"
import { FolderKanban, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { type EstadoForm } from "@/lib/contas"

import { definirProjetoDiariaAction } from "./actions"

const SELECT =
  "border-input bg-background focus-visible:ring-ring/50 h-9 min-w-0 flex-1 rounded-md border px-3 text-sm shadow-xs outline-none focus-visible:ring-[3px]"

/**
 * Projeto da diária (Pessoal e Diretoria): pôr, trocar ou tirar. A diária
 * entra no gasto do projeto; a ordem da remessa não muda.
 */
export function ProjetoDaDiaria({
  diariaId,
  projetoId,
  projetos,
}: {
  diariaId: string
  projetoId: string | null
  projetos: { id: string; titulo: string }[]
}) {
  const [estado, acao, pendente] = useActionState<EstadoForm, FormData>(definirProjetoDiariaAction, {})
  // Controlado e enviado sem o reset do React 19: depois de salvar, o campo
  // mostra o projeto salvo (o reset voltaria ao da 1ª renderização).
  const [valor, setValor] = useState(projetoId ?? "")
  return (
    <Card>
      <CardContent>
        <form
          action={acao}
          onSubmit={(e) => {
            e.preventDefault()
            const dados = new FormData(e.currentTarget)
            startTransition(() => acao(dados))
          }}
          className="grid gap-1.5"
        >
          <input type="hidden" name="diaria_id" value={diariaId} />
          <label htmlFor="projeto-diaria" className="text-sm font-medium">
            Projeto
          </label>
          <p className="text-muted-foreground text-xs">
            A diária (com as despesas) entra no gasto do projeto. Trocar aqui não mexe na ordem da remessa.
          </p>
          <div className="flex flex-wrap gap-2">
            <select
              id="projeto-diaria"
              name="projeto_id"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              className={SELECT}
            >
              <option value="">Nenhum projeto</option>
              {projetos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.titulo}
                </option>
              ))}
            </select>
            <Button type="submit" variant="outline" size="sm" disabled={pendente}>
              {pendente ? <Loader2 className="animate-spin" /> : <FolderKanban />}
              Salvar projeto
            </Button>
          </div>
          {estado.erro && <p className="text-destructive text-xs">{estado.erro}</p>}
          {estado.ok && <p className="text-success-fg text-xs">{estado.ok}</p>}
        </form>
      </CardContent>
    </Card>
  )
}
