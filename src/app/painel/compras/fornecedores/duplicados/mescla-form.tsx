"use client"

import { useActionState, useState } from "react"
import Link from "next/link"
import { Loader2, Merge } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { confirmarEnvio } from "@/components/ui/confirmacao"

import { mesclarFornecedoresAction } from "../actions"

export type CadastroDuplicado = {
  id: string
  nome: string
  razao: string | null
  detalhes: string[]
  alertas: string[]
}

/**
 * Um grupo de cadastros com o mesmo CPF/CNPJ: escolhe-se o que FICA (os
 * outros marcados são incorporados a ele). Quem só consulta vê o grupo sem
 * os controles.
 */
export function MesclaGrupoForm({
  cadastros,
  sugerido,
  podeEditar,
}: {
  cadastros: CadastroDuplicado[]
  sugerido: string
  podeEditar: boolean
}) {
  const [estado, acao, pendente] = useActionState(mesclarFornecedoresAction, {})
  const [principal, setPrincipal] = useState(sugerido)
  const [fora, setFora] = useState<string[]>([])
  const incorporados = cadastros.filter((c) => c.id !== principal && !fora.includes(c.id))
  const nomePrincipal = cadastros.find((c) => c.id === principal)?.nome ?? ""

  return (
    <form
      action={acao}
      onSubmit={(e) =>
        confirmarEnvio(e, {
          titulo: `Mesclar ${incorporados.length} cadastro(s) em "${nomePrincipal}"?`,
          descricao:
            "Ordens de pagamento, contratos, propostas, contas bancárias, endereços e demais registros dos incorporados passam para o cadastro que fica. Os incorporados ficam inativos, apontando para ele. A operação não se desfaz pela tela.",
          confirmar: "Mesclar",
        })
      }
      className="grid gap-3"
    >
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <ul className="grid gap-2">
        {cadastros.map((c) => {
          const fica = c.id === principal
          const entra = !fica && !fora.includes(c.id)
          return (
            <li
              key={c.id}
              className={`flex flex-wrap items-start gap-3 rounded-md border p-3 text-sm ${fica ? "border-primary/60 bg-primary/5" : ""}`}
            >
              {podeEditar && (
                <label className="flex items-center gap-2 pt-0.5 text-xs font-medium">
                  <input
                    type="radio"
                    name="principal"
                    value={c.id}
                    checked={fica}
                    onChange={() => {
                      setPrincipal(c.id)
                      setFora((f) => f.filter((x) => x !== c.id))
                    }}
                    className="size-4"
                  />
                  Fica
                </label>
              )}
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  <Link href={`/painel/compras/fornecedores/${c.id}`} className="text-primary hover:underline">
                    {c.nome}
                  </Link>
                  {c.razao && c.razao !== c.nome && (
                    <span className="text-muted-foreground font-normal"> · {c.razao}</span>
                  )}
                </p>
                <p className="text-muted-foreground text-xs">{c.detalhes.join(" · ")}</p>
                {c.alertas.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {c.alertas.map((a) => (
                      <Badge key={a} variant="outline" className="text-muted-foreground">
                        {a}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
              {podeEditar && !fica && (
                <label className="flex items-center gap-2 pt-0.5 text-xs">
                  <input
                    type="checkbox"
                    name="cadastro_ids"
                    value={c.id}
                    checked={entra}
                    onChange={(e) =>
                      setFora((f) => (e.target.checked ? f.filter((x) => x !== c.id) : [...f, c.id]))
                    }
                    className="size-4"
                  />
                  Incorporar
                </label>
              )}
            </li>
          )
        })}
      </ul>
      {podeEditar && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-muted-foreground text-xs">
            {incorporados.length === 0
              ? "Marque ao menos um cadastro para incorporar."
              : `${incorporados.length} cadastro(s) serão incorporados em "${nomePrincipal}".`}
          </p>
          <Button type="submit" size="sm" disabled={pendente || incorporados.length === 0}>
            {pendente ? <Loader2 className="animate-spin" /> : <Merge />}
            Mesclar
          </Button>
        </div>
      )}
    </form>
  )
}
