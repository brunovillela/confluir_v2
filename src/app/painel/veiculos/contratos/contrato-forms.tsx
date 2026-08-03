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
  return (
    <form action={formAction} className="grid max-w-2xl gap-4">
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
  return (
    <form action={formAction} className="grid gap-2">
      <input type="hidden" name="contrato_id" value={contratoId} />
      <div className="flex flex-wrap items-center gap-2">
        <Input
          name="competencia"
          type="month"
          required
          className="h-8 w-44 text-sm [color-scheme:light] dark:[color-scheme:dark]"
        />
        <Input
          name="valor"
          required
          inputMode="decimal"
          defaultValue={valorPadrao}
          placeholder="Valor (R$)"
          className="h-8 w-32 text-sm tabular-nums"
        />
        <Input
          name="vencimento"
          type="date"
          className="h-8 w-40 text-sm [color-scheme:light] dark:[color-scheme:dark]"
        />
        <Button type="submit" size="sm" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Receipt />}
          Gerar mensalidade
        </Button>
      </div>
      <p className="text-muted-foreground text-xs">
        Competência, valor e vencimento — a ordem nasce &apos;Em
        autorização&apos; no Financeiro.
      </p>
      {estado.erro && <p className="text-destructive text-xs">{estado.erro}</p>}
    </form>
  )
}

export function FinalizarContratoForm({ contratoId }: { contratoId: string }) {
  const [estado, formAction, pendente] = useActionState(
    finalizarContratoAction,
    {}
  )
  return (
    <form
      action={formAction}
      className="inline-flex flex-col items-end gap-1"
      onSubmit={(e) => {
        if (
          !confirm(
            "Finalizar este contrato? Os veículos vinculados serão desvinculados."
          )
        ) {
          e.preventDefault()
        }
      }}
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
