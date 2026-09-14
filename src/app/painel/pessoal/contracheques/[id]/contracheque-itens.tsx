"use client"

import { useActionState, useState } from "react"
import Link from "next/link"
import { Loader2, Plus, ReceiptText, Trash2, X } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import {
  alternarLiberadoContracheque,
  criarContracheque,
  excluirContracheque,
  gerarOrdemContrachequeAction,
} from "../actions"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

export function NovoContrachequeForm({
  remessaId,
  funcionarios,
  pedirValor,
  gerarOrdem,
}: {
  remessaId: string
  funcionarios: { usuarioId: string; nome: string; semConta: boolean }[]
  /** O campo de valor líquido existe (SQL da folha rodado). */
  pedirValor: boolean
  /** Cada registro gera ordem de pagamento (valor obrigatório). */
  gerarOrdem: boolean
}) {
  const [estado, formAction, pendente] = useActionState(criarContracheque, {})
  const [funcionarioId, setFuncionarioId] = useState("")
  const escolhido = funcionarios.find((f) => f.usuarioId === funcionarioId)

  return (
    <form
      action={formAction}
      className={`grid items-end gap-3 ${pedirValor ? "sm:grid-cols-[1fr_1fr_9rem_auto_auto]" : "sm:grid-cols-[1fr_1fr_auto_auto]"}`}
    >
      {estado.erro && (
        <div className="sm:col-span-full">
          <Alert variant="destructive">
            <AlertDescription>{estado.erro}</AlertDescription>
          </Alert>
        </div>
      )}
      {estado.ok && (
        <div className="sm:col-span-full">
          <Alert className="border-success/40 text-success-fg">
            <AlertDescription>{estado.ok}</AlertDescription>
          </Alert>
        </div>
      )}
      <input type="hidden" name="remessa_id" value={remessaId} />
      <div className="grid gap-1.5">
        <Label htmlFor="funcionario_id">Funcionário *</Label>
        <select
          id="funcionario_id"
          name="funcionario_id"
          required
          value={funcionarioId}
          onChange={(e) => setFuncionarioId(e.target.value)}
          className={SELECT}
        >
          <option value="" disabled>
            Escolha o funcionário
          </option>
          {funcionarios.map((f) => (
            <option key={f.usuarioId} value={f.usuarioId}>
              {f.nome}
              {gerarOrdem && f.semConta ? " (sem dados bancários)" : ""}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="arquivo">Contracheque (PDF) *</Label>
        <Input id="arquivo" name="arquivo" type="file" accept="application/pdf" required />
      </div>
      {pedirValor && (
        <div className="grid gap-1.5">
          <Label htmlFor="valor_liquido">Líquido (R$){gerarOrdem ? " *" : ""}</Label>
          <Input
            id="valor_liquido"
            name="valor_liquido"
            inputMode="decimal"
            placeholder="3.250,00"
            required={gerarOrdem}
            className="tabular-nums"
          />
        </div>
      )}
      <label className="text-muted-foreground flex items-center gap-2 pb-2 text-sm">
        <Checkbox name="liberado" defaultChecked />
        Liberado
      </label>
      <Button type="submit" variant="secondary" disabled={pendente}>
        {pendente ? <Loader2 className="animate-spin" /> : <Plus />}
        Adicionar
      </Button>
      {gerarOrdem && escolhido?.semConta && (
        <p className="text-warning-fg text-xs sm:col-span-full">
          {escolhido.nome} não tem conta nem Pix cadastrados: a ordem será gerada, mas o Financeiro
          não terá para onde pagar.{" "}
          <Link href={`/painel/pessoal/${escolhido.usuarioId}#dados-bancarios`} className="underline underline-offset-4">
            Cadastrar dados bancários
          </Link>
        </p>
      )}
    </form>
  )
}

export function AcoesContracheque({
  id,
  remessaId,
  liberado,
  podeGerarOrdem = false,
  valorLiquido = null,
}: {
  id: string
  remessaId: string
  liberado: boolean
  /** Contracheque sem ordem, com PDF no bucket e o SQL da folha rodado. */
  podeGerarOrdem?: boolean
  valorLiquido?: number | null
}) {
  const [estadoLib, libAction, libPendente] = useActionState(
    alternarLiberadoContracheque,
    {}
  )
  const [estadoExc, excAction, excPendente] = useActionState(
    excluirContracheque,
    {}
  )
  const [estadoOrdem, ordemAction, ordemPendente] = useActionState(
    gerarOrdemContrachequeAction,
    {}
  )
  const [gerando, setGerando] = useState(false)
  const erro = estadoLib.erro ?? estadoExc.erro ?? estadoOrdem.erro

  return (
    <div className="grid justify-items-end gap-1">
      <div className="flex items-center justify-end gap-1">
        {podeGerarOrdem && !gerando && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2"
            onClick={() => setGerando(true)}
          >
            <ReceiptText />
            Gerar ordem
          </Button>
        )}
        <form action={libAction}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="remessa_id" value={remessaId} />
          <input type="hidden" name="liberado" value={String(!liberado)} />
          <Button
            type="submit"
            variant="ghost"
            size="sm"
            disabled={libPendente}
            className="h-7 px-2"
          >
            {libPendente && <Loader2 className="animate-spin" />}
            {liberado ? "Bloquear" : "Liberar"}
          </Button>
        </form>
        <form
          action={excAction}
          onSubmit={(e) => {
            if (!confirm("Excluir este contracheque? Se ele gerou ordem de pagamento, a ordem é cancelada."))
              e.preventDefault()
          }}
        >
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="remessa_id" value={remessaId} />
          <Button
            type="submit"
            variant="ghost"
            size="sm"
            disabled={excPendente}
            aria-label="Excluir contracheque"
            className="text-destructive hover:text-destructive h-7 px-2"
          >
            {excPendente ? <Loader2 className="animate-spin" /> : <Trash2 />}
          </Button>
        </form>
      </div>
      {gerando && (
        <form action={ordemAction} className="flex items-center gap-1">
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="remessa_id" value={remessaId} />
          <Input
            name="valor_liquido"
            inputMode="decimal"
            placeholder="Líquido (R$)"
            aria-label="Valor líquido"
            defaultValue={valorLiquido != null ? valorLiquido.toFixed(2).replace(".", ",") : ""}
            required
            className="h-7 w-28 text-xs tabular-nums"
          />
          <Button type="submit" size="sm" className="h-7 px-2" disabled={ordemPendente}>
            {ordemPendente ? <Loader2 className="animate-spin" /> : <ReceiptText />}
            Gerar
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2"
            aria-label="Cancelar"
            onClick={() => setGerando(false)}
          >
            <X />
          </Button>
        </form>
      )}
      {erro && <span className="text-destructive text-xs">{erro}</span>}
    </div>
  )
}
