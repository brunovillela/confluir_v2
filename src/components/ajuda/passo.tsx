import { cn } from "@/lib/utils"

/**
 * Lista de passos numerados de um procedimento. Uso em MDX:
 *
 * <PassoAPasso>
 *   <Passo titulo="Abra o cadastro">...</Passo>
 *   <Passo titulo="Preencha os dados">...</Passo>
 * </PassoAPasso>
 *
 * A numeração é automática (via contador CSS), então reordenar passos não
 * exige renumerar nada.
 */
export function PassoAPasso({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <ol
      className={cn(
        "[counter-reset:passo] my-5 list-none space-y-4 border-l pl-0",
        className
      )}
    >
      {children}
    </ol>
  )
}

export function Passo({
  titulo,
  children,
}: {
  titulo?: string
  children: React.ReactNode
}) {
  return (
    <li className="[counter-increment:passo] relative pl-11">
      <span
        aria-hidden
        className="bg-primary text-primary-foreground absolute top-0 -left-4 flex size-8 items-center justify-center rounded-full text-sm font-semibold before:content-[counter(passo)]"
      />
      {titulo && <p className="mt-1 font-medium">{titulo}</p>}
      <div className="text-muted-foreground [&>*:first-child]:mt-1 text-sm [&_p]:my-1">
        {children}
      </div>
    </li>
  )
}
