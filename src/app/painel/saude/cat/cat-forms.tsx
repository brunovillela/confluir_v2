"use client"

import { useActionState } from "react"
import { Loader2, Save, Upload } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  BLOCOS,
  CAMPOS_CAT,
  nomeCampo,
  type CampoCat,
} from "@/lib/saude-campos"

import {
  atualizarCatAction,
  criarCatAction,
  importarCatsAction,
} from "./actions"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

export function ImportarCatsForm() {
  const [estado, formAction, pendente] = useActionState(importarCatsAction, {})
  return (
    <form action={formAction} className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          type="file"
          name="arquivo"
          accept=".csv,text/csv"
          required
          className="max-w-sm"
        />
        <Button type="submit" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Upload />}
          Importar CATs
        </Button>
      </div>
      {estado.erro && (
        <p className="text-destructive text-sm whitespace-pre-line">
          {estado.erro}
        </p>
      )}
    </form>
  )
}

/** Formulário individual — os 50 campos, na ordem e nos blocos do formulário. */
export function CatForm({
  valores,
  id,
}: {
  /** Valores atuais por nome de campo (`campo_<n>`), na edição. */
  valores?: Record<string, string>
  id?: string
}) {
  const [estado, formAction, pendente] = useActionState(
    id ? atualizarCatAction : criarCatAction,
    {}
  )

  return (
    <form action={formAction} className="grid gap-4">
      {id && <input type="hidden" name="id" value={id} />}

      {BLOCOS.map((bloco) => (
        <Card key={bloco}>
          <CardContent>
            <p className="mb-3 text-sm font-medium">{bloco}</p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {CAMPOS_CAT.filter((c) => c.bloco === bloco).map((campo) => (
                <Campo
                  key={campo.n}
                  campo={campo}
                  valor={valores?.[nomeCampo(campo)] ?? ""}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      ))}

      {estado.erro && <p className="text-destructive text-sm">{estado.erro}</p>}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Save />}
          {id ? "Salvar alterações" : "Cadastrar CAT"}
        </Button>
      </div>
    </form>
  )
}

function Campo({ campo, valor }: { campo: CampoCat; valor: string }) {
  const nome = nomeCampo(campo)
  const obrigatorio = campo.n === 11 || campo.n === 19
  const rotulo = (
    <Label htmlFor={nome}>
      <span className="text-muted-foreground tabular-nums">{campo.n}</span>{" "}
      {campo.rotulo}
      {obrigatorio && " *"}
    </Label>
  )

  return (
    <div
      className={`grid gap-1.5 ${campo.largo ? "sm:col-span-2 lg:col-span-3" : ""}`}
    >
      {rotulo}
      {campo.tipo === "bool" ? (
        <select id={nome} name={nome} defaultValue={valor} className={SELECT}>
          <option value="">Não informado</option>
          <option value="Sim">Sim</option>
          <option value="Não">Não</option>
        </select>
      ) : campo.tipo === "data" ? (
        <Input
          id={nome}
          name={nome}
          type="date"
          defaultValue={valor}
          required={obrigatorio}
          className="[color-scheme:light] dark:[color-scheme:dark]"
        />
      ) : campo.tipo === "inteiro" ? (
        <Input
          id={nome}
          name={nome}
          inputMode="numeric"
          defaultValue={valor}
          className="tabular-nums"
        />
      ) : (
        <Input
          id={nome}
          name={nome}
          defaultValue={valor}
          required={obrigatorio}
          placeholder={dica(campo)}
        />
      )}
      {ajuda(campo) && (
        <p className="text-muted-foreground text-xs">{ajuda(campo)}</p>
      )}
    </div>
  )
}

function dica(campo: CampoCat): string | undefined {
  if (campo.tipo === "codigo") return "757010600 – Perna (do tornozelo ao joelho)"
  if (campo.tipo === "cbo") return "311205 - Técnico em petroquímica"
  if (campo.tipo === "cid") return "S01.4"
  if (campo.tipo === "cpf") return "000.000.000-00"
  if (campo.n === 20 || campo.n === 41) return "HH:MM"
  return undefined
}

function ajuda(campo: CampoCat): string | undefined {
  if (campo.tipo === "codigo") {
    return "Código de 9 dígitos e descrição, separados por travessão. Sem o código, o registro entra na fila de revisão."
  }
  if (campo.tipo === "cbo") return "Código de 6 dígitos e ocupação."
  if (campo.n === 44) {
    return "É este campo que alimenta o indicador de afastamento do painel."
  }
  return undefined
}
