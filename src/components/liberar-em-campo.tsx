import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { formatarData } from "@/lib/formato"

/**
 * Campo "Liberar automaticamente em" das remessas de contracheques e de ponto:
 * nesse dia a rotina diária libera os itens ainda bloqueados e avisa cada
 * funcionário (lib/db/pessoal-liberacao-automatica).
 */
export function LiberarEmCampo({
  remessa,
  itens,
}: {
  remessa?: { liberar_em?: string | null; liberada_automaticamente_em?: string | null }
  /** "contracheques" ou "registros de ponto", para o texto de ajuda. */
  itens: string
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor="liberar_em">Liberar automaticamente em</Label>
      <Input
        id="liberar_em"
        name="liberar_em"
        type="date"
        defaultValue={remessa?.liberar_em ?? ""}
        className="[color-scheme:light] dark:[color-scheme:dark]"
      />
      <span className="text-muted-foreground text-xs">
        Nesse dia, de manhã, os {itens} ainda bloqueados são liberados e cada funcionário é avisado. Vazio: só a
        liberação manual.
        {remessa?.liberada_automaticamente_em &&
          ` Liberada automaticamente em ${formatarData(remessa.liberada_automaticamente_em)}; uma data futura agenda de novo.`}
      </span>
    </div>
  )
}
