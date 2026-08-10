"use client"

import { useActionState } from "react"
import { Loader2, Save } from "lucide-react"

import { EmpresaCombobox, type EmpresaOpcao } from "@/components/empresa-combobox"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { type EstadoForm } from "@/lib/contas"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

export type NotaFormDados = {
  id?: string
  numero_nota?: string | null
  entrada?: boolean | null
  data_emissao?: string | null
  fornecedor_id?: string | null
}

export function NotaForm({
  action,
  dados,
  fornecedores,
  temArquivo,
}: {
  action: (prev: EstadoForm, formData: FormData) => Promise<EstadoForm>
  dados?: NotaFormDados
  fornecedores: EmpresaOpcao[]
  /** Já existe um arquivo anexado? (muda o rótulo do input) */
  temArquivo?: boolean
}) {
  const [estado, formAction, pendente] = useActionState(action, {})

  return (
    <form action={formAction} className="grid max-w-2xl gap-4">
      {dados?.id && <input type="hidden" name="nota_id" value={dados.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="numero_nota">Número da nota *</Label>
          <Input
            id="numero_nota"
            name="numero_nota"
            required
            defaultValue={dados?.numero_nota ?? ""}
            className="tabular-nums"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="entrada">Tipo</Label>
          <select
            id="entrada"
            name="entrada"
            defaultValue={dados?.entrada === false ? "saida" : "entrada"}
            className={SELECT}
          >
            <option value="entrada">Entrada</option>
            <option value="saida">Saída</option>
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="data_emissao">Data da emissão</Label>
          <Input
            id="data_emissao"
            name="data_emissao"
            type="date"
            defaultValue={dados?.data_emissao ?? ""}
            className="[color-scheme:light] dark:[color-scheme:dark]"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="fornecedor_id">Fornecedor</Label>
          <EmpresaCombobox
            empresas={fornecedores}
            name="fornecedor_id"
            defaultId={dados?.fornecedor_id ?? undefined}
          />
        </div>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="arquivo_nota_file">
            Arquivo da nota (PDF){temArquivo ? " — substituir" : ""}
          </Label>
          <Input
            id="arquivo_nota_file"
            name="arquivo_nota_file"
            type="file"
            accept="application/pdf,image/*"
          />
          {temArquivo && (
            <p className="text-muted-foreground text-xs">
              Já há um arquivo anexado; enviar um novo substitui o atual.
            </p>
          )}
        </div>
      </div>

      {estado.erro && <p className="text-destructive text-sm">{estado.erro}</p>}
      <div>
        <Button type="submit" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Save />}
          {dados?.id ? "Salvar alterações" : "Cadastrar nota fiscal"}
        </Button>
      </div>
    </form>
  )
}
