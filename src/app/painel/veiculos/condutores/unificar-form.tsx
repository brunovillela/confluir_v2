"use client"

import { useActionState } from "react"
import { Loader2, Merge } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { GrupoRepetido } from "@/lib/db/veiculos-condutores-cnh"

import { unificarCondutoresAction } from "./actions"
import { confirmarEnvio } from "@/components/ui/confirmacao"

function data(v: string | null): string {
  if (!v) return "—"
  const [a, m, d] = v.slice(0, 10).split("-")
  return `${d}/${m}/${a}`
}

/** Um grupo de cadastros da mesma pessoa, com a escolha de qual fica. */
export function UnificarGrupo({ grupo }: { grupo: GrupoRepetido }) {
  const [estado, acao, pendente] = useActionState(unificarCondutoresAction, {})
  return (
    <form
      action={acao}
      className="grid gap-3 rounded-md border p-3"
      onSubmit={(e) => {
        const n = grupo.membros.length - 1
        confirmarEnvio(e, `Unificar? O cadastro marcado fica; ${n === 1 ? "o outro" : `os outros ${n}`} some${n === 1 ? "" : "m"} da lista de condutores, a CNH vai para o histórico e os lançamentos passam para o que fica.`)
      }}
    >
      <p className="text-sm font-medium">
        {grupo.membros[0].nome}
        <span className="text-muted-foreground ml-2 text-xs font-normal">
          {grupo.motivo === "cpf" ? "mesmo CPF" : "mesmo nome"}
        </span>
      </p>
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <div className="grid gap-2 md:grid-cols-2">
        {grupo.membros.map((m) => (
          <label
            key={m.usuarioId}
            className="has-[:checked]:border-primary has-[:checked]:bg-primary/5 flex cursor-pointer gap-3 rounded-md border p-3 text-sm"
          >
            <input type="hidden" name="membro" value={m.usuarioId} />
            <input
              type="radio"
              name="principal"
              value={m.usuarioId}
              defaultChecked={m.usuarioId === grupo.principalSugerido}
              className="mt-1 size-4"
            />
            <span className="grid gap-1">
              <span className="font-medium break-all">{m.email ?? "(sem e-mail)"}</span>
              <span className="flex flex-wrap gap-1">
                {m.inativo ? (
                  <Badge variant="outline" className="text-muted-foreground">
                    Usuário inativo
                  </Badge>
                ) : (
                  <Badge variant="outline" className="border-success/40 text-success-fg">
                    Usuário ativo
                  </Badge>
                )}
                {m.autorizado && <Badge variant="outline">Autorizado</Badge>}
                {m.usuarioId === grupo.principalSugerido && <Badge variant="secondary">Sugerido</Badge>}
              </span>
              <span className="text-muted-foreground text-xs">
                CNH {m.cnhNumero ?? "não informada"} · validade {data(m.cnhValidade)}
                {m.cpf ? ` · CPF ${m.cpf}` : " · sem CPF"}
              </span>
              <span className="text-muted-foreground text-xs">
                {m.movimentacoes} uso(s){m.ultimoUso ? ` (último ${data(m.ultimoUso)})` : ""} · {m.abastecimentos}{" "}
                abastecimento(s) · {m.infracoes} infração(ões) · {m.reservas} reserva(s)
              </span>
            </span>
          </label>
        ))}
      </div>
      <div>
        <Button type="submit" size="sm" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Merge />}
          Unificar no marcado
        </Button>
      </div>
    </form>
  )
}
