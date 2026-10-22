import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { iniciais } from "@/lib/texto"
import { cn } from "@/lib/utils"

/**
 * Avatar de quem tem acesso ao sistema: a foto (`fotoUrl`, de
 * fotosDosUsuarios) ou, sem ela, as iniciais. Usado onde a pessoa é o
 * assunto da linha — ausente, aniversariante, funcionário, responsável.
 * Nos registros de auditoria ("por fulano") fica só o nome. `selo`: ícone
 * pequeno no canto (bolo do aniversário, medalha do tempo de casa).
 */
export function AvatarPessoa({
  nome,
  fotoUrl,
  size = "sm",
  selo,
  className,
}: {
  nome: string | null
  fotoUrl?: string | null
  size?: "sm" | "default" | "lg"
  selo?: React.ReactNode
  className?: string
}) {
  return (
    <Avatar size={size} className={className} aria-hidden>
      {fotoUrl ? <AvatarImage src={fotoUrl} alt="" /> : null}
      <AvatarFallback className="font-medium">{iniciais(nome)}</AvatarFallback>
      {selo ? (
        <span className="bg-background text-primary ring-background absolute -right-1 -bottom-1 z-10 flex size-4 items-center justify-center rounded-full ring-1 [&>svg]:size-3">
          {selo}
        </span>
      ) : null}
    </Avatar>
  )
}

/** Avatar + nome na mesma linha; `children` substitui o nome (link, etc.). */
export function PessoaNome({
  nome,
  fotoUrl,
  size = "sm",
  selo,
  className,
  children,
}: {
  nome: string | null
  fotoUrl?: string | null
  size?: "sm" | "default" | "lg"
  selo?: React.ReactNode
  className?: string
  children?: React.ReactNode
}) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-2", className)}>
      <AvatarPessoa nome={nome} fotoUrl={fotoUrl} size={size} selo={selo} />
      <span className="min-w-0 truncate">{children ?? nome ?? "(sem nome)"}</span>
    </span>
  )
}
