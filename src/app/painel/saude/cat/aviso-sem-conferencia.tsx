"use client"

import { useActionState } from "react"
import Link from "next/link"
import { CircleCheck, FileText, Loader2, Pencil, TriangleAlert } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import type { EstadoForm } from "@/lib/contas"

import { marcarCatConferidaAction } from "./actions"

/**
 * Alerta no topo da CAT gravada a partir do PDF sem conferência humana: fica
 * até alguém conferir os campos com o PDF e marcar como conferida.
 */
export function AvisoSemConferencia({
  id,
  avisos,
  urlPdf,
  podeEditar,
  naEdicao,
}: {
  id: string
  avisos: string[]
  urlPdf: string | null
  podeEditar: boolean
  /** Na tela de edição: sem os botões (salve as correções primeiro). */
  naEdicao?: boolean
}) {
  const [estado, acao, pendente] = useActionState<EstadoForm, FormData>(marcarCatConferidaAction, {})

  if (estado.ok) {
    return (
      <Alert variant="success">
        <CircleCheck />
        <AlertDescription>{estado.ok}</AlertDescription>
      </Alert>
    )
  }

  return (
    <Alert variant="warning">
      <TriangleAlert />
      <AlertDescription>
        <div className="grid gap-2">
          <p>
            <strong>CAT registrada sem conferência.</strong> Os campos foram gravados como a IA os leu do PDF, sem
            revisão. Confira com o PDF, corrija o que precisar e marque como conferida.
          </p>
          {avisos.length > 0 && (
            <div>
              <p className="text-xs font-medium">Avisos da leitura:</p>
              <ul className="grid gap-0.5 text-xs">
                {avisos.map((a, i) => (
                  <li key={i}>• {a}</li>
                ))}
              </ul>
            </div>
          )}
          {estado.erro && <p className="text-destructive text-xs">{estado.erro}</p>}
          <div className="flex flex-wrap items-center gap-2">
            {urlPdf && (
              <Button size="sm" variant="outline" className="bg-background" asChild>
                <a href={urlPdf} target="_blank" rel="noreferrer">
                  <FileText />
                  Abrir o PDF
                </a>
              </Button>
            )}
            {podeEditar && !naEdicao && (
              <Button size="sm" variant="outline" className="bg-background" asChild>
                <Link href={`/painel/saude/cat/${id}?editar=1`}>
                  <Pencil />
                  Corrigir campos
                </Link>
              </Button>
            )}
            {podeEditar && !naEdicao && (
              <form action={acao}>
                <input type="hidden" name="id" value={id} />
                <Button size="sm" type="submit" disabled={pendente}>
                  {pendente ? <Loader2 className="animate-spin" /> : <CircleCheck />}
                  Marcar como conferida
                </Button>
              </form>
            )}
          </div>
        </div>
      </AlertDescription>
    </Alert>
  )
}
