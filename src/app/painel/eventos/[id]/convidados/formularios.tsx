"use client"

import { useActionState } from "react"
import { Loader2, Trash2, Upload, UserPlus } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import {
  excluirConvidadoAction,
  importarPlanilhaAction,
  lancarConvidadoAction,
} from "./actions"

export function ImportarPlanilha({ eventoId }: { eventoId: string }) {
  const [estado, formAction, pendente] = useActionState(
    importarPlanilhaAction,
    {}
  )

  return (
    <form action={formAction} className="grid gap-4 pt-2">
      <input type="hidden" name="eventoId" value={eventoId} />

      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      {estado.ok && (
        <Alert variant="success">
          <AlertDescription>{estado.ok}</AlertDescription>
        </Alert>
      )}

      {estado.problemas && estado.problemas.length > 0 && (
        <div className="rounded-md border">
          <div className="border-b px-3 py-2 text-sm font-medium">
            Linhas com problema
          </div>
          <div className="max-h-72 overflow-y-auto">
            <table className="w-full text-sm">
              <tbody>
                {estado.problemas.map((p) => (
                  <tr key={`${p.linha}-${p.motivo}`} className="border-b last:border-0">
                    <td className="text-muted-foreground w-16 px-3 py-1.5 tabular-nums">
                      linha {p.linha}
                    </td>
                    <td className="px-3 py-1.5">{p.nome}</td>
                    <td className="text-muted-foreground px-3 py-1.5">
                      {p.motivo}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="grid gap-2">
        <Label htmlFor="planilha">Planilha preenchida (.xlsx)</Label>
        <Input
          id="planilha"
          name="planilha"
          type="file"
          accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          required
        />
      </div>

      <label className="flex items-start gap-3 rounded-md border p-3">
        <input
          type="checkbox"
          name="ignorar_erros"
          className="mt-0.5 size-4"
          defaultChecked={false}
        />
        <span className="text-sm">
          Importar as linhas certas mesmo assim
          <span className="text-muted-foreground block text-xs">
            Sem isto, um erro em qualquer linha impede a importação inteira — o
            que costuma ser o que você quer da primeira vez.
            {estado.aguardando
              ? ` Marcando, entram ${estado.aguardando} convidado(s).`
              : ""}
          </span>
        </span>
      </label>

      <div>
        <Button type="submit" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Upload />}
          Importar
        </Button>
      </div>
    </form>
  )
}

export function LancarConvidado({ eventoId }: { eventoId: string }) {
  const [estado, formAction, pendente] = useActionState(
    lancarConvidadoAction,
    {}
  )

  return (
    <form action={formAction} className="grid gap-4 pt-2">
      <input type="hidden" name="eventoId" value={eventoId} />

      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      {estado.ok && (
        <Alert variant="success">
          <AlertDescription>{estado.ok}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="nome">Nome completo</Label>
          <Input id="nome" name="nome" required />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="cpf">CPF</Label>
          <Input id="cpf" name="cpf" inputMode="numeric" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="email">E-mail</Label>
          <Input id="email" name="email" type="email" />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="telefone">Telefone</Label>
          <Input id="telefone" name="telefone" />
        </div>
        <div className="grid gap-2 sm:col-span-2">
          <Label htmlFor="convidado_por">A convite de</Label>
          <Input
            id="convidado_por"
            name="convidado_por"
            placeholder="diretor, departamento, entidade parceira…"
          />
        </div>
      </div>

      <div>
        <Button type="submit" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <UserPlus />}
          Lançar convidado
        </Button>
      </div>
    </form>
  )
}

export function RemoverConvidado({
  eventoId,
  inscricaoId,
  nome,
}: {
  eventoId: string
  inscricaoId: string
  nome: string
}) {
  const [estado, formAction, pendente] = useActionState(
    excluirConvidadoAction,
    {}
  )

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="eventoId" value={eventoId} />
      <input type="hidden" name="inscricaoId" value={inscricaoId} />
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        disabled={pendente}
        aria-label={`Remover ${nome}`}
        title={`Remover ${nome}`}
      >
        {pendente ? <Loader2 className="animate-spin" /> : <Trash2 />}
      </Button>
      {estado.erro && (
        <span className="text-destructive text-xs">{estado.erro}</span>
      )}
    </form>
  )
}
