"use client"

import * as React from "react"
import { Eye, EyeOff } from "lucide-react"

import { cn } from "@/lib/utils"

import { Input } from "./input"

/**
 * Campo de senha com o "olhinho" para ver o que foi digitado (09/11/2026).
 * Mesmas props do Input, menos `type`. O botão não envia o formulário, não
 * entra na ordem do Tab entre os campos e volta a esconder a senha no envio.
 */
function CampoSenha({ className, ...props }: Omit<React.ComponentProps<typeof Input>, "type">) {
  const [visivel, setVisivel] = React.useState(false)
  const ref = React.useRef<HTMLDivElement>(null)

  // Senha nunca fica à mostra depois de enviar (nem no autocompletar do navegador).
  React.useEffect(() => {
    const form = ref.current?.closest("form")
    if (!form) return
    const esconder = () => setVisivel(false)
    form.addEventListener("submit", esconder)
    return () => form.removeEventListener("submit", esconder)
  }, [])

  return (
    <div ref={ref} className="relative">
      <Input type={visivel ? "text" : "password"} className={cn("pr-9", className)} {...props} />
      <button
        type="button"
        onClick={() => setVisivel((v) => !v)}
        aria-label={visivel ? "Ocultar senha" : "Mostrar senha"}
        aria-pressed={visivel}
        aria-controls={props.id}
        title={visivel ? "Ocultar senha" : "Mostrar senha"}
        disabled={props.disabled}
        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 absolute inset-y-0 right-0 flex w-9 items-center justify-center rounded-r-lg outline-none focus-visible:ring-3 disabled:pointer-events-none disabled:opacity-50"
      >
        {visivel ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
      </button>
    </div>
  )
}

export { CampoSenha }
