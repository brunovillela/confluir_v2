"use client"

import { useActionState, useState } from "react"
import { CheckCircle2, Loader2, Star } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  COMENTARIO_MAX,
  ETIQUETAS,
  NOTA_EXIGE_COMENTARIO,
  perguntaDasEtiquetas,
  ROTULO_NOTA,
} from "@/lib/hospedagem-avaliacoes-constantes"
import { cn } from "@/lib/utils"

import { enviarAvaliacaoAction } from "./actions"

/**
 * Como no Uber: primeiro as estrelas; com elas aparecem as etiquetas (elogios
 * com 5, "o que pode melhorar" com 1–4) e o comentário — obrigatório com 1–2.
 */
export function AvaliarForm({ token, notaInicial }: { token: string; notaInicial: number | null }) {
  const [estado, acao, pendente] = useActionState(enviarAvaliacaoAction, {})
  const [nota, setNota] = useState<number | null>(notaInicial)
  const [sobre, setSobre] = useState<number | null>(null)
  const [marcadas, setMarcadas] = useState<string[]>([])

  if (estado.ok) {
    return (
      <div className="grid justify-items-center gap-3 py-6 text-center">
        <CheckCircle2 className="text-success-fg size-10" />
        <p className="text-base font-medium">Obrigado pela avaliação!</p>
        <p className="text-muted-foreground text-sm">
          Ela ajuda o sindicato a cuidar dos convênios de hospedagem. Os novos pedidos no portal já
          estão liberados.
        </p>
      </div>
    )
  }

  const exibida = sobre ?? nota
  const comentarioObrigatorio = nota !== null && nota <= NOTA_EXIGE_COMENTARIO

  function trocarNota(n: number) {
    // Mudou de "elogio" para "melhorar" (ou o contrário): as etiquetas mudam de sentido.
    if (nota !== null && (nota === 5) !== (n === 5)) setMarcadas([])
    setNota(n)
  }

  return (
    <form action={acao} className="grid gap-5">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="nota" value={nota ?? ""} />

      <div className="grid justify-items-center gap-2">
        <div
          className="flex gap-1"
          role="radiogroup"
          aria-label="Nota da hospedagem"
          onMouseLeave={() => setSobre(null)}
        >
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={nota === n}
              aria-label={`${n} estrela${n === 1 ? "" : "s"} — ${ROTULO_NOTA[n]}`}
              onClick={() => trocarNota(n)}
              onMouseEnter={() => setSobre(n)}
              className="rounded-md p-1 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <Star
                className={cn(
                  "size-10 transition-colors",
                  exibida !== null && n <= exibida ? "fill-primary text-primary" : "text-muted-foreground/40"
                )}
              />
            </button>
          ))}
        </div>
        <p className="text-muted-foreground h-5 text-sm">
          {exibida ? ROTULO_NOTA[exibida] : "Toque nas estrelas"}
        </p>
      </div>

      {nota !== null && (
        <>
          <div className="grid gap-2">
            <p className="text-sm font-medium">{perguntaDasEtiquetas(nota)}</p>
            <div className="flex flex-wrap gap-2">
              {ETIQUETAS.map((e) => {
                const ativa = marcadas.includes(e.chave)
                return (
                  <label
                    key={e.chave}
                    className={cn(
                      "cursor-pointer rounded-full border px-3 py-1.5 text-sm transition-colors select-none",
                      ativa ? "border-primary bg-primary/10 text-foreground" : "text-muted-foreground hover:bg-muted"
                    )}
                  >
                    <input
                      type="checkbox"
                      name="etiquetas"
                      value={e.chave}
                      checked={ativa}
                      onChange={() =>
                        setMarcadas((m) => (ativa ? m.filter((x) => x !== e.chave) : [...m, e.chave]))
                      }
                      className="sr-only"
                    />
                    {e.rotulo}
                  </label>
                )
              })}
            </div>
          </div>

          <div className="grid gap-1.5">
            <label htmlFor="comentario" className="text-sm font-medium">
              {comentarioObrigatorio ? "O que aconteceu? *" : "Quer contar mais? (opcional)"}
            </label>
            <textarea
              id="comentario"
              name="comentario"
              rows={4}
              maxLength={COMENTARIO_MAX}
              required={comentarioObrigatorio}
              minLength={comentarioObrigatorio ? 10 : undefined}
              placeholder={
                comentarioObrigatorio
                  ? "Conte o que deu errado — isso ajuda o sindicato a resolver com o hotel."
                  : "Algo que o hotel ou o sindicato deveria saber?"
              }
              className="border-input bg-background text-foreground w-full rounded-md border px-3 py-2 text-sm shadow-xs outline-none"
            />
            <p className="text-muted-foreground text-xs">
              O hotel vê a nota e o comentário sem o seu nome. A etiqueta &quot;Aplicativo&quot; vai só
              para o sindicato.
            </p>
          </div>
        </>
      )}

      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}

      <Button type="submit" disabled={pendente || nota === null}>
        {pendente && <Loader2 className="animate-spin" />}
        Enviar avaliação
      </Button>
    </form>
  )
}
