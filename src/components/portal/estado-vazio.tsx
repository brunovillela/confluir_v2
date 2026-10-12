import type { LucideIcon } from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

/**
 * Lista vazia no portal, num desenho só (A140): ícone, a frase e, quando
 * ajuda, uma explicação e a ação que resolve. Antes eram sete desenhos
 * (ícone de 4, 5 ou 6 px, py-4 a py-10, linha de tabela, parágrafo solto).
 *
 *  - padrão: centralizado, dentro do cartão que já existe (o da lista);
 *  - `cartao`: o mesmo, num cartão próprio — a lista era a página inteira;
 *  - `compacto`: uma linha com o ícone à esquerda, para o cartão que tem mais
 *    coisa além da lista (os blocos do Início, uma sublista).
 */
export function EstadoVazio({
  icone: Icone,
  titulo,
  descricao,
  acao,
  cartao = false,
  compacto = false,
  className,
}: {
  icone: LucideIcon
  titulo: React.ReactNode
  descricao?: React.ReactNode
  /** Botão ou link que tira a pessoa do vazio ("Ver todos", "Falar com…"). */
  acao?: React.ReactNode
  cartao?: boolean
  compacto?: boolean
  className?: string
}) {
  if (compacto) {
    return (
      <div className={cn("text-muted-foreground flex items-start gap-2 py-1 text-sm", className)}>
        <Icone aria-hidden className="mt-0.5 size-4 shrink-0" />
        <div className="grid min-w-0 gap-1">
          <p>{titulo}</p>
          {descricao && <p className="text-xs">{descricao}</p>}
          {acao && <div className="mt-1">{acao}</div>}
        </div>
      </div>
    )
  }

  const miolo = (
    <div className={cn("text-muted-foreground flex flex-col items-center gap-2 py-10 text-center", className)}>
      <Icone aria-hidden className="size-6" />
      {/* Com explicação, a frase vira o título dela. */}
      <p className={cn("text-sm", descricao && "text-foreground font-medium")}>{titulo}</p>
      {descricao && <p className="max-w-prose text-sm text-balance">{descricao}</p>}
      {acao && <div className="mt-2 flex flex-wrap justify-center gap-2">{acao}</div>}
    </div>
  )

  if (!cartao) return miolo
  return (
    <Card>
      <CardContent>{miolo}</CardContent>
    </Card>
  )
}
