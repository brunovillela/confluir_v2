import { BadgeCheck, Clock } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { rotuloTipoConta } from "@/lib/contracheques-constantes"
import type { ValoresDadosBancarios } from "@/components/dados-bancarios-campos"
import { cn } from "@/lib/utils"

/**
 * Uma conta bancária em linhas curtas (banco, agência/conta, Pix, titular) —
 * Meu perfil → Dados bancários e a conferência do Financeiro. `destaque`
 * marca os campos que mudaram (comparação antes × depois).
 */
export function ContaBancariaResumo({
  conta,
  destaque = [],
  className,
}: {
  conta: Partial<ValoresDadosBancarios> | null
  destaque?: string[]
  className?: string
}) {
  if (!conta) return <p className="text-muted-foreground text-sm">—</p>
  const linhas: [string, string, string | null][] = [
    ["banco", "Banco", [conta.banco, conta.bancoCodigo ? `(${conta.bancoCodigo})` : null].filter(Boolean).join(" ") || null],
    [
      "conta",
      "Agência / conta",
      conta.agencia || conta.conta
        ? [[conta.agencia, conta.conta].filter(Boolean).join(" / "), rotuloTipoConta(conta.tipoConta ?? null)].filter(Boolean).join(" · ")
        : null,
    ],
    ["pix", "Pix", [conta.pixTipo, conta.pix].filter(Boolean).join(": ") || null],
    ["titular", "Titular", [conta.favorecido, conta.titularDocumento].filter(Boolean).join(" · ") || null],
    ["prefere", "Pagar por", conta.preferePix ? "Pix" : "Conta bancária"],
  ]
  return (
    <dl className={cn("grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm", className)}>
      {linhas
        .filter(([, , v]) => v)
        .map(([chave, rotulo, valor]) => (
          <div key={chave} className="contents">
            <dt className="text-muted-foreground text-xs leading-5">{rotulo}</dt>
            <dd className={cn("min-w-0 break-words", destaque.includes(chave) && "text-warning-fg font-medium")}>{valor}</dd>
          </div>
        ))}
    </dl>
  )
}

/** Quais linhas do resumo mudaram entre a conta antiga e a pedida. */
export function camposAlterados(
  antes: Partial<ValoresDadosBancarios> | null,
  depois: Partial<ValoresDadosBancarios> | null
): string[] {
  if (!antes || !depois) return []
  const dif = (...k: (keyof ValoresDadosBancarios)[]) => k.some((c) => (antes[c] ?? null) !== (depois[c] ?? null))
  return [
    dif("banco", "bancoCodigo") && "banco",
    dif("agencia", "conta", "tipoConta") && "conta",
    dif("pix", "pixTipo") && "pix",
    dif("favorecido", "titularDocumento") && "titular",
    dif("preferePix") && "prefere",
  ].filter((v): v is string => Boolean(v))
}

/** Situação de um pedido de alteração de conta (Meu perfil e Financeiro). */
export function SituacaoAlteracaoBadge({ situacao }: { situacao: "aguardando" | "confirmada" | "recusada" | "cancelada" }) {
  if (situacao === "confirmada")
    return (
      <Badge variant="outline" className="border-success/40 text-success-fg">
        <BadgeCheck />
        Financeiro ciente
      </Badge>
    )
  if (situacao === "aguardando")
    return (
      <Badge variant="outline" className="border-warning/40 text-warning-fg">
        <Clock />
        Aguardando o Financeiro
      </Badge>
    )
  if (situacao === "recusada")
    return (
      <Badge variant="outline" className="text-destructive border-destructive/40">
        Recusada
      </Badge>
    )
  return (
    <Badge variant="outline" className="text-muted-foreground">
      Cancelada
    </Badge>
  )
}
