"use client"

import { useActionState } from "react"
import { Loader2, Save } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { ErroNoCampo } from "@/components/ui/erro-no-campo"
import { Input } from "@/components/ui/input"
import { type EstadoForm } from "@/lib/contas"
import { useEnvioFormulario } from "@/hooks/use-envio-formulario"

import { salvarMinutosHumanosAction } from "../actions"

export type GrupoMinutos = {
  titulo: string
  operacoes: { chave: string; titulo: string; semIA: string; estimativa: number; ajuste: number | null }[]
}

/**
 * Tempo de uma pessoa por operação. Em branco, vale a estimativa do catálogo
 * (o placeholder). A entidade ajusta ao seu jeito de trabalhar.
 */
export function MinutosForm({ grupos }: { grupos: GrupoMinutos[] }) {
  const [estado, action, pendente] = useActionState<EstadoForm, FormData>(salvarMinutosHumanosAction, {})
  const envio = useEnvioFormulario(action, estado, { manter: true })
  return (
    <form action={action} {...envio} className="grid gap-4">
      <ErroNoCampo estado={estado} />
      <div className="grid gap-2">
        {grupos.map((g) => {
          const ajustadas = g.operacoes.filter((o) => o.ajuste !== null).length
          return (
            <details key={g.titulo} className="rounded-lg border px-3 py-2" open={ajustadas > 0 || undefined}>
              <summary className="cursor-pointer text-sm font-medium">
                {g.titulo}
                <span className="text-muted-foreground ml-2 text-xs font-normal">
                  {ajustadas ? `${ajustadas} ajustada${ajustadas === 1 ? "" : "s"}` : "estimativas do sistema"}
                </span>
              </summary>
              <ul className="mt-2 divide-y">
                {g.operacoes.map((o) => (
                  <li key={o.chave} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <div className="min-w-0">
                      <label htmlFor={`min-${o.chave}`} className="text-sm">
                        {o.titulo}
                      </label>
                      <p className="text-muted-foreground text-xs">Sem a IA: {o.semIA.charAt(0).toLowerCase() + o.semIA.slice(1)}.</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        id={`min-${o.chave}`}
                        name={`min:${o.chave}`}
                        inputMode="decimal"
                        defaultValue={o.ajuste === null ? "" : String(o.ajuste).replace(".", ",")}
                        placeholder={String(o.estimativa)}
                        className="w-20 text-right"
                      />
                      <span className="text-muted-foreground text-xs">min</span>
                    </div>
                  </li>
                ))}
              </ul>
            </details>
          )
        })}
      </div>
      <div>
        <Button type="submit" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Save />}
          Salvar tempos
        </Button>
      </div>
      {estado.ok && (
        <Alert variant="success">
          <AlertDescription>{estado.ok}</AlertDescription>
        </Alert>
      )}
      {estado.erro && !estado.campo && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
    </form>
  )
}
