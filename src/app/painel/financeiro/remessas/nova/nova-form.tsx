"use client"

import { useActionState, useState } from "react"
import { AlertTriangle, FileOutput, Loader2, Save } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { confirmarEnvio } from "@/components/ui/confirmacao"
import { ErroNoCampo } from "@/components/ui/erro-no-campo"
import { Input } from "@/components/ui/input"
import { type EstadoForm } from "@/lib/contas"
import type { ContaBancaria, OrdemParaRemessa } from "@/lib/db/remessas"
import { formatarData, formatarMoeda } from "@/lib/formato"

import { gerarRemessaAction, linhaDigitavelAction } from "../actions"

const SELECT =
  "border-input bg-background text-foreground h-9 rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

function LinhaDigitavelForm({ ordemId }: { ordemId: string }) {
  const [estado, action, pendente] = useActionState<EstadoForm, FormData>(linhaDigitavelAction, {})
  return (
    <form action={action} className="mt-1 flex flex-wrap items-center gap-2">
      <input type="hidden" name="ordem_id" value={ordemId} />
      <Input name="linha" placeholder="Linha digitável do boleto (47 dígitos)" className="h-8 w-80 text-xs" inputMode="numeric" />
      <Button type="submit" size="sm" variant="outline" disabled={pendente}>
        {pendente ? <Loader2 className="animate-spin" /> : <Save />}
        Gravar
      </Button>
      {estado.erro && <span className="text-destructive text-xs">{estado.erro}</span>}
      {estado.ok && <span className="text-success-fg text-xs">{estado.ok}</span>}
    </form>
  )
}

export function NovaRemessaForm({ contas, ordens }: { contas: ContaBancaria[]; ordens: OrdemParaRemessa[] }) {
  const [estado, action, gerando] = useActionState(gerarRemessaAction, {})
  const prontas = ordens.filter((o) => o.item && !o.emRemessa)
  const [marcadas, setMarcadas] = useState<Set<string>>(() => new Set(prontas.map((o) => o.id)))
  const total = prontas.filter((o) => marcadas.has(o.id)).reduce((s, o) => s + o.valor, 0)
  const alternar = (id: string) =>
    setMarcadas((atual) => {
      const n = new Set(atual)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  return (
    <form action={action} className="grid gap-4" onSubmit={(e) => confirmarEnvio(e, `Gerar a remessa com ${marcadas.size} ordem(ns), total ${formatarMoeda(total)}?`)}>
      <ErroNoCampo estado={estado} />
      <div className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-xs">
          Conta bancária
          <select name="conta_id" defaultValue={contas.length === 1 ? contas[0].id : ""} className={SELECT} required>
            <option value="" disabled>
              Escolha…
            </option>
            {contas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.apelido} — {c.bancoCodigo} ag. {c.agencia} c/c {c.conta}
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" disabled={gerando || marcadas.size === 0}>
          {gerando ? <Loader2 className="animate-spin" /> : <FileOutput />}
          Gerar remessa ({marcadas.size} · {formatarMoeda(total)})
        </Button>
      </div>
      {estado.erro && !estado.campo && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}

      <ul className="divide-y rounded-lg border">
        {ordens.map((o) => {
          const pronta = Boolean(o.item) && !o.emRemessa
          return (
            <li key={o.id} className="grid gap-1 px-3 py-2 text-sm sm:grid-cols-[auto_1fr_auto] sm:items-start sm:gap-3">
              <label className="flex items-center gap-2 pt-0.5">
                <input type="checkbox" name="ordens" value={o.id} checked={pronta && marcadas.has(o.id)} disabled={!pronta} onChange={() => alternar(o.id)} className="size-4" />
                <span className="font-medium sm:hidden">{o.codigo ?? "—"}</span>
              </label>
              <div className="min-w-0">
                <p>
                  <span className="hidden font-medium sm:inline">{o.codigo ?? "—"} · </span>
                  {o.favorecidoNome ?? "sem favorecido"}
                  <span className="text-muted-foreground"> · {o.tipo ?? "ordem"}{o.vencimento ? ` · vence ${formatarData(o.vencimento)}` : ""}</span>
                </p>
                <p className="text-muted-foreground truncate text-xs">{o.descricao ?? ""}</p>
                {o.destino && <p className="text-xs">{o.destino}</p>}
                {o.emRemessa && (
                  <Badge variant="warning" className="mt-1">
                    já na remessa {o.emRemessa.numero}
                  </Badge>
                )}
                {!o.emRemessa && o.pendencias.length > 0 && (
                  <p className="text-destructive mt-1 flex items-start gap-1 text-xs">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                    {o.pendencias.join(" · ")}
                  </p>
                )}
                {!o.emRemessa && o.meio === "boleto" && o.pendencias.some((p) => /linha digitável/.test(p)) && <LinhaDigitavelForm ordemId={o.id} />}
              </div>
              <p className="text-right font-semibold tabular-nums">{formatarMoeda(o.valor)}</p>
            </li>
          )
        })}
      </ul>
    </form>
  )
}
