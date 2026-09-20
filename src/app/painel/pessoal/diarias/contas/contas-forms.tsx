"use client"

import { useActionState, useState } from "react"
import { Loader2, Plus } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { type EstadoForm } from "@/lib/contas"

import { salvarContasDiaria, salvarTipoDespesa } from "./actions"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none"

export type ContaOpcao = {
  id: string
  nome: string
  classificador: string | null
  grupo: string
}

export type GastoParaConta = {
  /** "diaria" ou o id do tipo de despesa. */
  chave: string
  rotulo: string
  contaAtual: string | null
  /** Conta herdada do padrão do quadro, quando o departamento não define. */
  herdadaDe: string | null
}

/** Um select de conta por gasto, salvos juntos. */
export function ContasDoQuadro({
  quadro,
  departamentoId,
  gastos,
  contas,
}: {
  quadro: "funcionario" | "diretor"
  departamentoId: string | null
  gastos: GastoParaConta[]
  contas: ContaOpcao[]
}) {
  const [estado, formAction, pendente] = useActionState<EstadoForm, FormData>(
    salvarContasDiaria,
    {}
  )
  const grupos = [...new Set(contas.map((c) => c.grupo))].sort((a, b) =>
    a.localeCompare(b, "pt-BR")
  )

  return (
    <form action={formAction} className="grid gap-4">
      <input type="hidden" name="quadro" value={quadro} />
      <input type="hidden" name="departamento_id" value={departamentoId ?? ""} />

      <div className="grid gap-4 sm:grid-cols-2">
        {gastos.map((g) => (
          <div key={g.chave} className="grid gap-1.5">
            <Label htmlFor={`conta_${g.chave}`}>{g.rotulo}</Label>
            <select
              id={`conta_${g.chave}`}
              name={`conta_${g.chave}`}
              className={SELECT}
              defaultValue={g.contaAtual ?? ""}
            >
              <option value="">
                {g.herdadaDe ? `Usar o padrão — ${g.herdadaDe}` : "Sem conta definida"}
              </option>
              {grupos.map((grupo) => (
                <optgroup key={grupo} label={grupo}>
                  {contas
                    .filter((c) => c.grupo === grupo)
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.classificador ? `${c.classificador} · ` : ""}
                        {c.nome}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </div>
        ))}
      </div>

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

      <div>
        <Button type="submit" disabled={pendente}>
          {pendente && <Loader2 className="animate-spin" />}
          Salvar contas
        </Button>
      </div>
    </form>
  )
}

/** Cadastro de um tipo de despesa extra (fechado até clicarem). */
export function NovoTipoDespesa() {
  const [aberto, setAberto] = useState(false)
  const [estado, formAction, pendente] = useActionState<EstadoForm, FormData>(
    async (prev, formData) => {
      const r = await salvarTipoDespesa(prev, formData)
      if (r.ok) setAberto(false)
      return r
    },
    {}
  )

  if (!aberto) {
    return (
      <Button size="sm" variant="outline" onClick={() => setAberto(true)}>
        <Plus />
        Novo tipo de despesa
      </Button>
    )
  }

  return (
    <form action={formAction} className="grid gap-4 border-t pt-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="grid gap-1.5">
          <Label htmlFor="nome">Nome</Label>
          <Input id="nome" name="nome" placeholder="Ex.: Estacionamento" required />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="ordem">Ordem</Label>
          <Input id="ordem" name="ordem" type="number" defaultValue="0" />
        </div>
        <div className="grid content-end gap-2 pb-1">
          <label className="text-muted-foreground flex items-center gap-2 text-sm">
            <Checkbox name="exige_comprovante" defaultChecked />
            Exige comprovante
          </label>
          <label className="text-muted-foreground flex items-center gap-2 text-sm">
            <Checkbox name="ativa" defaultChecked />
            Ativo
          </label>
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="descricao">Descrição (opcional)</Label>
        <Input id="descricao" name="descricao" />
      </div>

      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}

      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pendente}>
          {pendente && <Loader2 className="animate-spin" />}
          Salvar
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setAberto(false)}>
          Cancelar
        </Button>
      </div>
    </form>
  )
}
