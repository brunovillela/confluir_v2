"use client"

import { useActionState, useState } from "react"
import Link from "next/link"
import { ExternalLink, Loader2, RefreshCw, RotateCcw, Sparkles } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"

import { CatForm } from "./cat-forms"
import { ClassificacaoCatAviso } from "./classificacao-cat"
import { extrairCatDePdf } from "./importar-pdf-actions"

const FILE =
  "border-input bg-background text-foreground w-full max-w-md rounded-md border px-3 py-1.5 text-sm shadow-xs outline-none file:mr-3 file:rounded file:border-0 file:bg-muted file:px-2 file:py-1"

export function ImportarCatPdf() {
  const [estado, formAction, pendente] = useActionState(extrairCatDePdf, {})
  const [atualizandoExistente, setAtualizandoExistente] = useState(false)

  if (estado.valores) {
    const c = estado.classificacao
    const duplicada = c?.classe === "duplicada"
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

        {c && (
          <ClassificacaoCatAviso classificacao={c}>
            {duplicada && (
              <p className="text-xs">
                Esta CAT não precisa ser lançada de novo.
                {estado.existente
                  ? " Se o PDF trouxer dados novos ou corrigidos, atualize a CAT que já existe."
                  : ""}
              </p>
            )}
            {c.classe === "atualizacao" && (
              <p className="text-xs">
                Ao salvar, a CAT fica ligada à CAT de origem — as duas aparecem juntas na página de cada uma.
              </p>
            )}
          </ClassificacaoCatAviso>
        )}

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/painel/saude/cat/nova/pdf">
              <RotateCcw />
              Enviar outro PDF
            </Link>
          </Button>
          {duplicada && estado.existente && (
            <>
              <Button size="sm" variant="outline" asChild>
                <Link href={`/painel/saude/cat/${estado.existente.id}`} target="_blank">
                  <ExternalLink />
                  Abrir a CAT existente
                </Link>
              </Button>
              {!atualizandoExistente && (
                <Button size="sm" onClick={() => setAtualizandoExistente(true)}>
                  <RefreshCw />
                  Atualizar a existente com o PDF
                </Button>
              )}
            </>
          )}
        </div>

        {duplicada ? (
          estado.existente &&
          atualizandoExistente && (
            <div className="grid gap-3">
              <Alert variant="info">
                <AlertDescription>
                  {estado.existente.diferentes.length === 0 ? (
                    <p>O PDF só completa campos vazios da CAT existente — nada do que já estava muda.</p>
                  ) : (
                    <>
                      <p className="font-medium">
                        Campos em que o PDF é diferente da CAT existente (já trocados abaixo — confira):
                      </p>
                      <ul className="mt-1 grid gap-0.5 text-xs sm:grid-cols-2">
                        {estado.existente.diferentes.map((d) => (
                          <li key={d}>• {d}</li>
                        ))}
                      </ul>
                    </>
                  )}
                </AlertDescription>
              </Alert>
              <CatForm id={estado.existente.id} valores={estado.existente.valores} />
            </div>
          )
        ) : (
          <CatForm
            valores={estado.valores}
            origemId={c?.classe === "atualizacao" ? c.origemId : null}
            pedirConfirmacao={c?.classe === "possivel_duplicada"}
          />
        )}
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
        para você conferir, e compara com a base: avisa se a CAT já foi lançada,
        se é uma atualização de outra (reabertura, óbito) ou se pode ser
        duplicidade. Funciona com PDF digital e também escaneado (imagem) — o
        escaneado usa a leitura por visão e pode demorar um pouco mais.
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
