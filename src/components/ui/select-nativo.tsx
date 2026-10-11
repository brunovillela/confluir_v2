import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * `<select>` do navegador com a cara do `Input`: 32 px no mouse, 44 px no
 * toque, anel de foco visível e borda de erro em `aria-invalid` (o
 * `ErroNoCampo` marca sozinho). Para formulário com server action no celular
 * é melhor que o `Select` do Radix: abre o seletor do próprio sistema e vai
 * no FormData sem input oculto. Só lista suspensa simples — com `multiple`
 * ou `size` a altura fixa corta as opções.
 *
 * Detalhes: a opção vazia e desabilitada (`<option value="" disabled>Escolha…</option>`)
 * aparece apagada, como placeholder — um "Todas" vazio de filtro, que é
 * escolha de verdade, não; `color-scheme` e o fundo das opções
 * seguem o tema, senão a lista aberta sai clara com texto claro no Windows.
 * A cor das opções sobrepõe a do navegador, então a desabilitada volta a ser
 * apagada à mão — senão o "Escolha…" parece uma opção válida na lista.
 */
function SelectNativo({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="select-nativo"
      className={cn(
        "h-8 pointer-coarse:h-11 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 text-base transition-colors outline-none [color-scheme:light] focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 has-[option[value='']:disabled:checked]:text-muted-foreground md:text-sm dark:[color-scheme:dark] dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_option]:bg-popover [&_option]:text-popover-foreground [&_option:disabled]:text-muted-foreground",
        className
      )}
      {...props}
    />
  )
}

export { SelectNativo }
