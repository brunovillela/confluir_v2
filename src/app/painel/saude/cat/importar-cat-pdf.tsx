"use client"

import { useActionState } from "react"
import Link from "next/link"
import { Loader2, RotateCcw, Sparkles } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"

import { CatForm } from "./cat-forms"
import { extrairCatDePdf } from "./importar-pdf-actions"

const FILE =
  "border-input bg-background text-foreground w-full max-w-md rounded-md border px-3 py-1.5 text-sm shadow-xs outline-none file:mr-3 file:rounded file:border-0 file:bg-muted file:px-2 file:py-1"

export function ImportarCatPdf() {
  const [estado, formAction, pendente] = useActionState(extrairCatDePdf, {})

  if (estado.valores) {
    return (
      <div className="grid gap-4">
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>
            <p className="font-medium">
              Campos preenchidos pela IA — revise antes de salvar.
            </p>
            <p className="mt-0.5 text-sm">
              A IA pode errar (CBO, datas, códigos). Confira cada campo e
              corrija o que precisar; a CAT só é criada quando você clicar em
              salvar.
            </p>
            {estado.avisos && estado.avisos.length > 0 && (
              <ul className="mt-2 grid gap-0.5 text-xs">
                {estado.avisos.map((a, i) => (
                  <li key={i}>• {a}</li>
                ))}
              </ul>
            )}
          </AlertDescription>
        </Alert>
        <div>
          <Button variant="outline" size="sm" asChild>
            <Link href="/painel/saude/cat/nova/pdf">
              <RotateCcw />
              Enviar outro PDF
            </Link>
          </Button>
        </div>
        <CatForm valores={estado.valores} />
      </div>
    )
  }

  return (
    <form action={formAction} className="grid gap-3">
      <input
        type="file"
        name="arquivo"
        accept="application/pdf"
        required
        className={FILE}
      />
      <p className="text-muted-foreground text-xs">
        Um PDF de CAT por vez. A IA lê o documento e pré-preenche os 50 campos
        para você conferir. Funciona com PDF digital e também escaneado (imagem)
        — o escaneado usa a leitura por visão e pode demorar um pouco mais.
      </p>
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <div>
        <Button type="submit" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Sparkles />}
          {pendente ? "Lendo o PDF…" : "Ler PDF com IA"}
        </Button>
      </div>
    </form>
  )
}
