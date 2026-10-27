"use client"

import { useActionState } from "react"
import { FileCheck2, Loader2, Receipt, ScrollText } from "lucide-react"

import {
  EmpresaCombobox as FornecedorCombobox,
  type EmpresaOpcao as FornecedorOpcao,
} from "@/components/empresa-combobox"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import {
  criarContratoAction,
  finalizarContratoAction,
  gerarOrdemAluguelAction,
} from "./actions"
import { confirmarEnvio } from "@/components/ui/confirmacao"
import { useEnvioFormulario } from "@/hooks/use-envio-formulario"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

export type Opcao = { id: string; rotulo: string }

export function NovoContratoForm({
  fornecedores,
  usuarios,
  departamentos,
  centrosCusto,
  responsavelPadraoId,
}: {
  fornecedores: FornecedorOpcao[]
  usuarios: Opcao[]
  departamentos: Opcao[]
  centrosCusto: Opcao[]
  responsavelPadraoId: string
}) {
  const [estado, formAction, pendente] = useActionState(
    criarContratoAction,
    {}
  )
  const envio1 = useEnvioFormulario(formAction, estado)
  return (
    <form action={formAction} {...envio1} className="grid max-w-2xl gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="numero">Nº do contrato na locadora *</Label>
          <Input id="numero" name="numero" required className="tabular-nums" />
        </div>
        <div className="grid gap-1.5">
          <Label>Locadora (fornecedor) *</Label>
          <FornecedorCombobox empresas={fornecedores} name="fornecedor_id" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="vigencia_inicio">Início da vigência *</Label>
          <Input
            id="vigencia_inicio"
            name="vigencia_inicio"
            type="date"
            required
            className="[color-scheme:light] dark:[color-scheme:dark]"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="vigencia_termino">Término da vigência</Label>
          <Input
            id="vigencia_termino"
            name="vigencia_termino"
            type="date"
            className="[color-scheme:light] dark:[color-scheme:dark]"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="valor_mensal">Valor mensal (R$)</Label>
          <Input
            id="valor_mensal"
            name="valor_mensal"
            inputMode="decimal"
            placeholder="3.500,00"
            className="tabular-nums"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="responsavel_id">Responsável</Label>
          <select
            id="responsavel_id"
            name="responsavel_id"
            defaultValue={responsavelPadraoId}
            className={SELECT}
          >
            {usuarios.map((u) => (
              <option key={u.id} value={u.id}>
                {u.rotulo}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="departamento_id">Departamento</Label>
          <select
            id="departamento_id"
            name="departamento_id"
            defaultValue=""
            className={SELECT}
          >
            <option value="">(não informado)</option>
            {departamentos.map((d) => (
              <option key={d.id} value={d.id}>
                {d.rotulo}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="centro_custo_id">Centro de custo</Label>
          <select
            id="centro_custo_id"
            name="centro_custo_id"
            defaultValue=""
            className={SELECT}
          >
            <option value="">(não informado)</option>
            {centrosCusto.map((c) => (
              <option key={c.id} value={c.id}>
                {c.rotulo}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="finalidade">Finalidade do aluguel</Label>
          <Input
            id="finalidade"
            name="finalidade"
            placeholder="Ex.: transporte da diretoria; deslocamento para assembleias…"
          />
        </div>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="arquivo_contrato">Contrato assinado (PDF/JPG/PNG)</Label>
          <Input
            id="arquivo_contrato"
            name="arquivo_contrato"
            type="file"
            accept="application/pdf,image/jpeg,image/png"
          />
        </div>
      </div>
      {estado.erro && <p className="text-destructive text-sm">{estado.erro}</p>}
      <div>
        <Button type="submit" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <ScrollText />}
          Registrar contrato
        </Button>
      </div>
    </form>
  )
}

export function GerarOrdemAluguelForm({
  contratoId,
  valorPadrao,
}: {
  contratoId: string
  valorPadrao: string
}) {
  const [estado, formAction, pendente] = useActionState(
    gerarOrdemAluguelAction,
    {}
  )
  const envio2 = useEnvioFormulario(formAction, estado)
  return (
    <form action={formAction} {...envio2} className="grid gap-2">
      <input type="hidden" name="contrato_id" value={contratoId} />
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="grid gap-1">
          <Label htmlFor={`periodo-inicio-${contratoId}`} className="text-xs">
            Período cobrado — de *
          </Label>
          <Input
            id={`periodo-inicio-${contratoId}`}
            name="periodo_inicio"
            type="date"
            required
            className="h-8 text-sm [color-scheme:light] dark:[color-scheme:dark]"
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor={`periodo-fim-${contratoId}`} className="text-xs">
            até *
          </Label>
          <Input
            id={`periodo-fim-${contratoId}`}
            name="periodo_fim"
            type="date"
            required
            className="h-8 text-sm [color-scheme:light] dark:[color-scheme:dark]"
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor={`valor-${contratoId}`} className="text-xs">
            Valor (R$) *
          </Label>
          <Input
            id={`valor-${contratoId}`}
            name="valor"
            required
            inputMode="decimal"
            defaultValue={valorPadrao}
            className="h-8 text-sm tabular-nums"
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor={`vencimento-${contratoId}`} className="text-xs">
            Vencimento
          </Label>
          <Input
            id={`vencimento-${contratoId}`}
            name="vencimento"
            type="date"
            className="h-8 text-sm [color-scheme:light] dark:[color-scheme:dark]"
          />
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="grid gap-1">
          <Label htmlFor={`fatura-${contratoId}`} className="text-xs">
            Fatura da locadora (PDF/JPG/PNG)
          </Label>
          <Input
            id={`fatura-${contratoId}`}
            name="fatura"
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            className="h-8 text-xs"
          />
        </div>
        <div className="grid gap-1">
          <Label htmlFor={`boleto-${contratoId}`} className="text-xs">
            Boleto, se houver
          </Label>
          <Input
            id={`boleto-${contratoId}`}
            name="boleto"
            type="file"
            accept="application/pdf,image/jpeg,image/png,image/webp"
            className="h-8 text-xs"
          />
        </div>
      </div>
      <p className="text-muted-foreground text-xs">
        Uma cobrança por fatura: o período não precisa ser o mês inteiro —
        locação curta e prorrogação no mesmo mês saem em cobranças separadas.
        O vencimento pode cair depois do término do contrato e é corrigível
        depois na ordem, no Financeiro. Com boleto, a forma de pagamento vira
        Boleto.
      </p>
      {estado.erro && <p className="text-destructive text-xs">{estado.erro}</p>}
      <div>
        <Button type="submit" size="sm" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Receipt />}
          Gerar cobrança
        </Button>
      </div>
    </form>
  )
}

export function FinalizarContratoForm({ contratoId }: { contratoId: string }) {
  const [estado, formAction, pendente] = useActionState(
    finalizarContratoAction,
    {}
  )
  const envio3 = useEnvioFormulario(formAction, estado, {
    antes: (e) => {
        confirmarEnvio(e, "Finalizar este contrato? Os veículos vinculados serão desvinculados.")
      },
  })
  return (
    <form
      action={formAction} {...envio3}
      className="inline-flex flex-col items-end gap-1"
    >
      <input type="hidden" name="contrato_id" value={contratoId} />
      <Button type="submit" variant="outline" size="sm" disabled={pendente}>
        {pendente ? <Loader2 className="animate-spin" /> : <FileCheck2 />}
        Finalizar contrato
      </Button>
      {estado.erro && (
        <span className="text-destructive text-xs">{estado.erro}</span>
      )}
    </form>
  )
}
