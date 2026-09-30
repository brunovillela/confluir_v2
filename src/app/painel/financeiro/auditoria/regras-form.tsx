"use client"

import { useActionState } from "react"
import { Loader2, Save, Sparkles } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SEVERIDADES, type Severidade } from "@/lib/auditoria-regras-catalogo"
import { cn } from "@/lib/utils"

import { salvarRegrasAction } from "./actions"

const TEXTAREA =
  "border-input bg-background text-foreground w-full rounded-md border px-3 py-2 text-sm shadow-xs outline-none"

export type RegraTela = {
  codigo: string
  titulo: string
  pergunta: string
  explicacao: string
  ia: boolean
  severidade: Severidade
  personalizada: boolean
  parametros: {
    chave: string
    rotulo: string
    tipo: "moeda" | "dias" | "texto" | "sim_nao"
    valor: number | string | boolean
    ajuda?: string
  }[]
}

const COR: Record<Severidade, string> = {
  aceitar: "border-border",
  alertar: "border-warning/50 bg-warning/5",
  bloquear: "border-destructive/50 bg-destructive/5",
}

function valorTexto(v: number | string | boolean, tipo: string): string {
  if (tipo === "moeda" && typeof v === "number") return v.toFixed(2).replace(".", ",")
  return String(v)
}

/** As regras de UMA origem: a resposta de cada uma e os parâmetros. */
export function RegrasForm({ origem, regras }: { origem: string; regras: RegraTela[] }) {
  const [estado, acao, pendente] = useActionState(salvarRegrasAction, {})
  return (
    <form action={acao} className="grid gap-4">
      <input type="hidden" name="origem" value={origem} />
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

      {regras.map((r) => (
        <fieldset key={r.codigo} className={cn("grid gap-3 rounded-lg border p-4", COR[r.severidade])}>
          <legend className="sr-only">{r.titulo}</legend>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1 basis-72">
              <p className="flex flex-wrap items-center gap-2 font-medium">
                {r.titulo}
                {r.ia && (
                  <Badge variant="outline" className="gap-1">
                    <Sparkles className="size-3" />
                    IA
                  </Badge>
                )}
                {!r.personalizada && (
                  <Badge variant="outline" className="text-muted-foreground">
                    padrão do sistema
                  </Badge>
                )}
              </p>
              <p className="mt-1 text-sm">{r.pergunta}</p>
              <p className="text-muted-foreground mt-1 text-xs">{r.explicacao}</p>
            </div>
            <div className="grid gap-1.5" role="radiogroup" aria-label={`Resposta para ${r.titulo}`}>
              {SEVERIDADES.map((s) => (
                <label key={s.valor} className="flex items-start gap-2 text-sm">
                  <input
                    type="radio"
                    name={`sev_${r.codigo}`}
                    value={s.valor}
                    defaultChecked={r.severidade === s.valor}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="font-medium">{s.rotulo}</span>
                    <span className="text-muted-foreground block text-xs">{s.descricao}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          {r.parametros.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2">
              {r.parametros.map((p) => {
                const nome = `par_${r.codigo}_${p.chave}`
                if (p.tipo === "sim_nao") {
                  return (
                    <label key={p.chave} className="flex items-start gap-2 text-sm sm:col-span-2">
                      <input type="checkbox" name={nome} defaultChecked={p.valor === true} className="mt-0.5" />
                      <span>
                        {p.rotulo}
                        {p.ajuda && <span className="text-muted-foreground block text-xs">{p.ajuda}</span>}
                      </span>
                    </label>
                  )
                }
                if (p.tipo === "texto") {
                  return (
                    <div key={p.chave} className="grid gap-1.5 sm:col-span-2">
                      <Label htmlFor={nome}>{p.rotulo}</Label>
                      <textarea id={nome} name={nome} rows={3} defaultValue={String(p.valor)} className={TEXTAREA} />
                      {p.ajuda && <p className="text-muted-foreground text-xs">{p.ajuda}</p>}
                    </div>
                  )
                }
                return (
                  <div key={p.chave} className="grid gap-1.5">
                    <Label htmlFor={nome}>{p.rotulo}</Label>
                    <Input
                      id={nome}
                      name={nome}
                      inputMode={p.tipo === "moeda" ? "decimal" : "numeric"}
                      defaultValue={valorTexto(p.valor, p.tipo)}
                      className="max-w-48"
                    />
                    {p.ajuda && <p className="text-muted-foreground text-xs">{p.ajuda}</p>}
                  </div>
                )
              })}
            </div>
          )}
        </fieldset>
      ))}

      <div className="flex justify-end">
        <Button type="submit" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Save />}
          Salvar regras desta origem
        </Button>
      </div>
    </form>
  )
}
