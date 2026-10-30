"use client"

import { useActionState, useTransition } from "react"
import { Loader2, Upload } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { ErroNoCampo } from "@/components/ui/erro-no-campo"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import { importarRelatorioAction } from "./actions"
import { Trabalhando } from "@/components/trabalhando"

/** Envio do PDF do relógio (um, alguns ou todos os funcionários). */
export function ImportarRelatorioForm({ remessaId }: { remessaId: string }) {
  const [estado, formAction, pendente] = useActionState(importarRelatorioAction, {})
  const [, iniciar] = useTransition()
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault()
        const dados = new FormData(e.currentTarget)
        iniciar(() => formAction(dados))
      }}
    >
      <input type="hidden" name="remessa_id" value={remessaId} />
      <ErroNoCampo estado={estado} />
      {estado.erro && !estado.campo && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <div className="grid gap-1.5">
        <Label htmlFor="arquivo">Relatório de ponto (PDF)</Label>
        <Input id="arquivo" name="arquivo" type="file" accept="application/pdf" />
      </div>
      <Button type="submit" disabled={pendente} className="justify-self-start">
        {pendente ? <Loader2 className="animate-spin" /> : <Upload />}
        {pendente ? "Separando os funcionários…" : "Importar e separar por funcionário"}
      </Button>
      {pendente && (
        <Trabalhando
          titulo="Enviando o PDF e separando as páginas por funcionário…"
          detalhe="Leva alguns segundos. Em seguida abre a conferência, e a IA começa a ler os cartões sozinha."
        />
      )}
    </form>
  )
}
