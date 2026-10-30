"use client"

import { useActionState, useTransition } from "react"
import { Loader2, Upload } from "lucide-react"

import { Trabalhando } from "@/components/trabalhando"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { ErroNoCampo } from "@/components/ui/erro-no-campo"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import { importarFolhaAction } from "./actions"

/** Envio do PDF da folha (um, alguns ou todos os funcionários). */
export function ImportarFolhaForm({ remessaId }: { remessaId: string }) {
  const [estado, formAction, pendente] = useActionState(importarFolhaAction, {})
  const [, iniciar] = useTransition()
  return (
    <form
      className="grid gap-4"
      // Envio por transição: num erro, o React 19 limparia o formulário.
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
        <Label htmlFor="arquivo">Folha de contracheques (PDF)</Label>
        <Input id="arquivo" name="arquivo" type="file" accept="application/pdf" />
      </div>
      <Button type="submit" disabled={pendente} className="justify-self-start">
        {pendente ? <Loader2 className="animate-spin" /> : <Upload />}
        {pendente ? "Separando os funcionários…" : "Importar e separar por funcionário"}
      </Button>
      {pendente && (
        <Trabalhando
          titulo="Enviando o PDF e separando as páginas por funcionário…"
          detalhe="Leva alguns segundos. Em seguida abre a conferência, e a IA começa a ler os contracheques sozinha."
        />
      )}
    </form>
  )
}
