import * as React from "react"

import { cn } from "@/lib/utils"

import { CampoArquivo } from "./campo-arquivo"

type InputProps = React.ComponentProps<"input"> & {
  /** Só para `type="file"`: versão de uma linha (tabelas, ações em linha). */
  compacto?: boolean
  /** Só para `type="file"`: limite mostrado ao lado dos formatos (padrão "até 4 MB"). */
  limite?: string | null
}

function Input({ className, type, compacto, limite, ...props }: InputProps) {
  // Arquivo ganha a área de soltar, com os formatos aceitos à vista.
  if (type === "file") return <CampoArquivo className={className} compacto={compacto} limite={limite} {...props} />
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-8 pointer-coarse:h-11 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Input }
