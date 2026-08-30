"use client"

import { useActionState, useState } from "react"
import {
  CheckCircle2,
  ClipboardList,
  Link2,
  Loader2,
  UserCheck,
  UserPlus,
} from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { AptoUrna } from "@/lib/db/votacao-mesarios"
import { formatarCpf } from "@/lib/cpf"

import {
  parearTerminalAction,
  registrarEmSeparadoAction,
  registrarPresencaAction,
} from "../../actions"

export function PareamentoTerminal({ urnaId }: { urnaId: string }) {
  const [estado, formAction, pendente] = useActionState(parearTerminalAction, {})
  return (
    <form
      action={formAction}
      className="grid gap-3 rounded-lg border border-dashed p-4"
    >
      <div className="grid gap-1">
        <p className="flex items-center gap-2 text-sm font-medium">
          <Link2 className="size-4" />
          Parear terminal de votação
        </p>
        <p className="text-muted-foreground text-xs">
          Abra <code>/urna</code> no computador de votação e digite aqui o
          código que ele mostrar.
        </p>
      </div>
      <input type="hidden" name="urna_id" value={urnaId} />
      <div className="flex gap-2">
        <div className="grid flex-1 gap-1.5 sm:max-w-[12rem]">
          <Label htmlFor="codigo" className="sr-only">
            Código do terminal
          </Label>
          <Input
            id="codigo"
            name="codigo"
            required
            autoCapitalize="characters"
            className="font-mono tracking-widest uppercase"
            placeholder="Ex.: K7P2QX"
          />
        </div>
        <Button type="submit" variant="secondary" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Link2 />}
          Parear
        </Button>
      </div>
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      {estado.ok && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>{estado.ok}</AlertDescription>
        </Alert>
      )}
    </form>
  )
}

export function VotoEmSeparado({
  urnaId,
  aberta,
}: {
  urnaId: string
  aberta: boolean
}) {
  const [aberto, setAberto] = useState(false)
  const [estado, formAction, pendente] = useActionState(
    registrarEmSeparadoAction,
    {}
  )

  // Após cadastrar: mostra as orientações do procedimento.
  if (estado.ok && estado.instrucoes) {
    return (
      <div className="grid gap-3 rounded-lg border border-dashed p-4">
        <p className="flex items-center gap-2 text-sm font-medium">
          <ClipboardList className="size-4" />
          Voto em separado cadastrado — siga o procedimento
        </p>
        <ol className="text-muted-foreground grid list-decimal gap-1.5 pl-5 text-sm">
          {estado.instrucoes.map((linha, i) => (
            <li key={i}>{linha}</li>
          ))}
        </ol>
        {estado.digital && (
          <Alert className="border-success/40 text-success-fg">
            <CheckCircle2 className="size-4" />
            <AlertDescription>
              Cédula liberada no terminal de votação para o eleitor votar.
            </AlertDescription>
          </Alert>
        )}
        <div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              // recarrega o form limpo para o próximo
              window.location.reload()
            }}
          >
            Cadastrar outro
          </Button>
        </div>
      </div>
    )
  }

  if (!aberto) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => setAberto(true)}
        disabled={!aberta}
      >
        <UserPlus />
        Voto em separado
      </Button>
    )
  }

  return (
    <form
      action={formAction}
      className="grid gap-4 rounded-lg border border-dashed p-4"
    >
      <div className="grid gap-1">
        <p className="text-sm font-medium">Cadastrar voto em separado</p>
        <p className="text-muted-foreground text-xs">
          Para o eleitor que alega direito mas não está na lista de aptos. O voto
          é validado na apuração.
        </p>
      </div>
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <input type="hidden" name="urna_id" value={urnaId} />
      <div className="grid gap-1.5">
        <Label htmlFor="es-nome">Nome completo *</Label>
        <Input id="es-nome" name="nome" required />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="es-cpf">CPF</Label>
          <Input id="es-cpf" name="cpf" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="es-nasc">Data de nascimento</Label>
          <Input id="es-nasc" name="data_nascimento" type="date" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="es-tel">Telefone</Label>
          <Input id="es-tel" name="telefone" inputMode="tel" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="es-email">E-mail</Label>
          <Input id="es-email" name="email" type="email" />
        </div>
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <UserPlus />}
          Cadastrar e liberar
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setAberto(false)}
        >
          Cancelar
        </Button>
      </div>
    </form>
  )
}

export function ListaPresenca({
  urnaId,
  aberta,
  aptos,
}: {
  urnaId: string
  aberta: boolean
  aptos: AptoUrna[]
}) {
  const [estado, formAction, pendente] = useActionState(
    registrarPresencaAction,
    {}
  )
  return (
    <div className="grid gap-3">
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      {estado.ok && (
        <Alert className="border-success/40 text-success-fg">
          <CheckCircle2 className="size-4" />
          <AlertDescription>{estado.ok}</AlertDescription>
        </Alert>
      )}
      {aptos.length === 0 ? (
        <p className="text-muted-foreground py-4 text-center text-sm">
          Nenhum eleitor encontrado.
        </p>
      ) : (
        <div className="grid gap-2">
          {aptos.map((a) => (
            <div
              key={a.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2.5 text-sm"
            >
              <div className="min-w-0">
                <p className="font-medium">{a.nome ?? "(sem nome)"}</p>
                <p className="text-muted-foreground font-mono text-xs">
                  {a.cpf
                    ? formatarCpf(a.cpf)
                    : a.matricula
                      ? `mat. ${a.matricula}`
                      : "—"}
                </p>
              </div>
              {a.compareceu ? (
                <Badge
                  variant="outline"
                  className="border-success/40 text-success-fg"
                >
                  Compareceu
                </Badge>
              ) : aberta ? (
                <form action={formAction}>
                  <input type="hidden" name="urna_id" value={urnaId} />
                  <input type="hidden" name="apto_id" value={a.id} />
                  <Button
                    type="submit"
                    size="sm"
                    variant="outline"
                    disabled={pendente}
                  >
                    {pendente ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <UserCheck />
                    )}
                    Registrar presença
                  </Button>
                </form>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
