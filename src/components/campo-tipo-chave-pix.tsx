import { Label } from "@/components/ui/label"
import { normalizarTipoPix } from "@/lib/bancos"
import { TIPOS_CHAVE_PIX } from "@/lib/contracheques-constantes"
import { cn } from "@/lib/utils"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full truncate rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

/**
 * TIPO DA CHAVE PIX — o mesmo campo em todos os cadastros de conta (17/11/2026).
 * Cada formulário tinha o seu: rótulo ("Tipo de chave", "Tipo da chave PIX"),
 * lista (CPF e CNPJ separados, "Aleatória") e opção vazia diferentes, e um era
 * texto livre. Aqui: rótulo "Tipo da chave Pix", a lista única (TIPOS_CHAVE_PIX)
 * e o valor salvo já convertido para ela — tipo antigo ou ausente é deduzido
 * pela chave, para vir escolhido na edição.
 */
export function CampoTipoChavePix({
  id,
  name = "pix_tipo",
  valor,
  chave,
  obrigatorio = false,
  className,
}: {
  id: string
  name?: string
  /** O tipo gravado (pode estar fora da lista: "cpf", "Email"…). */
  valor?: string | null
  /** A chave gravada: sem tipo reconhecível, o tipo é deduzido dela. */
  chave?: string | null
  /** Chave obrigatória (pagamento): sem a opção "Sem chave Pix". */
  obrigatorio?: boolean
  className?: string
}) {
  const inicial = valor || chave ? (normalizarTipoPix(valor, chave) ?? "") : ""
  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={id}>Tipo da chave Pix{obrigatorio ? " *" : ""}</Label>
      <select id={id} name={name} required={obrigatorio} defaultValue={inicial} className={SELECT}>
        {obrigatorio ? (
          <option value="" disabled>
            Escolha o tipo
          </option>
        ) : (
          <option value="">Sem chave Pix</option>
        )}
        {TIPOS_CHAVE_PIX.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
    </div>
  )
}
