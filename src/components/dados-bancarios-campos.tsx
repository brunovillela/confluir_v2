import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { TIPOS_CHAVE_PIX, TIPOS_CONTA } from "@/lib/contracheques-constantes"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

/** O que os campos mostram ao abrir (dado já salvo, ou nada). */
export type ValoresDadosBancarios = {
  banco: string | null
  bancoCodigo: string | null
  agencia: string | null
  conta: string | null
  tipoConta: string | null
  pix: string | null
  pixTipo: string | null
  favorecido: string | null
  titularDocumento: string | null
  preferePix: boolean
}

/**
 * Campos de conta e Pix — lidos no servidor por `lerDadosBancariosForm`
 * (lib/dados-bancarios.ts). `prefixo` deixa os ids únicos quando há mais de
 * um formulário na tela.
 */
export function CamposDadosBancarios({
  prefixo = "db",
  valores,
  titularSugerido,
}: {
  prefixo?: string
  valores: ValoresDadosBancarios | null
  /** CPF/CNPJ sugerido quando a conta ainda não tem o documento do titular. */
  titularSugerido?: string | null
}) {
  const p = prefixo
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor={`${p}-banco`}>Banco</Label>
          <Input id={`${p}-banco`} name="banco" defaultValue={valores?.banco ?? ""} placeholder="Banco do Brasil" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${p}-banco-codigo`}>Código</Label>
          <Input
            id={`${p}-banco-codigo`}
            name="banco_codigo"
            inputMode="numeric"
            maxLength={3}
            defaultValue={valores?.bancoCodigo ?? ""}
            placeholder="001"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${p}-tipo-conta`}>Tipo de conta</Label>
          <select
            id={`${p}-tipo-conta`}
            name="tipo_conta"
            defaultValue={valores?.tipoConta?.toLowerCase() ?? ""}
            className={SELECT}
          >
            <option value="">—</option>
            {TIPOS_CONTA.map((t) => (
              <option key={t.valor} value={t.valor}>
                {t.rotulo}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${p}-agencia`}>Agência</Label>
          <Input id={`${p}-agencia`} name="agencia" defaultValue={valores?.agencia ?? ""} placeholder="1234-5" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${p}-conta`}>Conta</Label>
          <Input id={`${p}-conta`} name="conta" defaultValue={valores?.conta ?? ""} placeholder="12345-6" />
        </div>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor={`${p}-favorecido`}>Favorecido (se não for o próprio)</Label>
          <Input id={`${p}-favorecido`} name="favorecido" defaultValue={valores?.favorecido ?? ""} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${p}-titular-doc`}>CPF/CNPJ do titular</Label>
          <Input
            id={`${p}-titular-doc`}
            name="titular_documento"
            inputMode="numeric"
            defaultValue={valores?.titularDocumento ?? titularSugerido ?? ""}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${p}-pix-tipo`}>Tipo da chave Pix</Label>
          <select id={`${p}-pix-tipo`} name="pix_tipo" defaultValue={valores?.pixTipo ?? ""} className={SELECT}>
            <option value="">—</option>
            {TIPOS_CHAVE_PIX.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5 sm:col-span-3">
          <Label htmlFor={`${p}-pix`}>Chave Pix</Label>
          <Input id={`${p}-pix`} name="pix" defaultValue={valores?.pix ?? ""} />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox name="prefere_pix" defaultChecked={valores?.preferePix ?? false} />
        Pagar por Pix (em vez da conta)
      </label>
    </>
  )
}
