"use client"

import { useActionState } from "react"
import { Loader2, Save } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { type EstadoForm } from "@/lib/contas"
import { FORMAS_PAGAMENTO_FOLHA } from "@/lib/contracheques-constantes"

import { salvarConfigContrachequesAction } from "./actions"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

type Opcao = { id: string; nome: string }

export function ConfigContrachequesForm({
  config,
  centros,
  departamentos,
}: {
  config: {
    gerarOrdem: boolean
    centroCustoId: string | null
    departamentoId: string | null
    formaPagamento: string
  }
  centros: Opcao[]
  departamentos: Opcao[]
}) {
  const [estado, formAction, pendente] = useActionState<EstadoForm, FormData>(
    salvarConfigContrachequesAction,
    {}
  )

  return (
    <form action={formAction} className="grid max-w-3xl gap-4">
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      {estado.ok && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>{estado.ok}</AlertDescription>
        </Alert>
      )}

      <label className="flex items-start gap-3">
        <Switch name="gerar_ordem" defaultChecked={config.gerarOrdem} className="mt-0.5" />
        <span className="grid gap-0.5">
          <span className="text-sm font-medium">Gerar ordem de pagamento a cada contracheque registrado</span>
          <span className="text-muted-foreground text-xs">
            A ordem nasce &quot;Em autorização&quot; no Financeiro, em favor do funcionário, com o valor
            líquido e o PDF do contracheque no lugar da nota fiscal.
          </span>
        </span>
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="centro_custo_id">Centro de custo da despesa *</Label>
          <select id="centro_custo_id" name="centro_custo_id" defaultValue={config.centroCustoId ?? ""} className={SELECT}>
            <option value="">— escolha —</option>
            {centros.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="departamento_id">Departamento</Label>
          <select id="departamento_id" name="departamento_id" defaultValue={config.departamentoId ?? ""} className={SELECT}>
            <option value="">— nenhum —</option>
            {departamentos.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="forma_pagamento">Forma de pagamento padrão</Label>
          <select id="forma_pagamento" name="forma_pagamento" defaultValue={config.formaPagamento} className={SELECT}>
            {FORMAS_PAGAMENTO_FOLHA.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
          <span className="text-muted-foreground text-xs">
            Quem tem &quot;pagar por Pix&quot; nos dados bancários sai como Pix, com a chave na ordem.
          </span>
        </div>
      </div>

      <div>
        <Button type="submit" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Save />}
          Salvar configuração
        </Button>
      </div>
    </form>
  )
}
