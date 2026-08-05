import Image from "next/image"

import { cn } from "@/lib/utils"

/**
 * Marca do Confluir.
 * - `reduzida` (padrão): símbolo (peças) + nome em texto — para locais de
 *   pouca largura.
 * - `completa`: wordmark completo — para headers e telas com folga lateral;
 *   troca automaticamente para a variante clara no tema escuro.
 * - `sidebar`: wordmark claro (fundo navy) + tenant em fonte pequena quando
 *   expandida; só o símbolo quando colapsada (reage ao group da Sidebar).
 */
export function Marca({
  className,
  variante = "reduzida",
  tenant,
}: {
  className?: string
  variante?: "reduzida" | "completa" | "sidebar"
  /** Nome do tenant na variante sidebar (data-driven; sem hardcode). */
  tenant?: string | null
}) {
  if (variante === "sidebar") {
    return (
      <span className={cn("flex w-full min-w-0 items-center justify-center", className)}>
        <span className="grid w-fit justify-items-start gap-0 group-data-[collapsible=icon]:hidden">
          <Image
            src="/logo-confluir-completa-dark.png"
            alt="Confluir"
            width={300}
            height={100}
            priority
            className="h-14 w-auto"
          />
          {tenant && (
            <span className="justify-self-end text-xs leading-none opacity-70">
              {tenant}
            </span>
          )}
        </span>
        <Image
          src="/logo-confluir-reduzida.png"
          alt="Confluir"
          width={40}
          height={40}
          className="hidden size-8 shrink-0 group-data-[collapsible=icon]:block"
        />
      </span>
    )
  }

  if (variante === "completa") {
    return (
      <span className={cn("inline-flex shrink-0 items-center", className)}>
        <Image
          src="/logo-confluir-completa.png"
          alt="Confluir"
          width={300}
          height={100}
          priority
          className="h-9 w-auto dark:hidden"
        />
        <Image
          src="/logo-confluir-completa-dark.png"
          alt="Confluir"
          width={300}
          height={100}
          priority
          className="hidden h-9 w-auto dark:block"
        />
      </span>
    )
  }

  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <Image
        src="/logo-confluir-reduzida.png"
        alt=""
        width={40}
        height={40}
        className="size-9 shrink-0"
      />
      <div className="grid leading-tight">
        <span className="text-base font-semibold tracking-tight">
          Confluir
        </span>
        {tenant && <span className="text-xs opacity-70">{tenant}</span>}
      </div>
    </div>
  )
}
