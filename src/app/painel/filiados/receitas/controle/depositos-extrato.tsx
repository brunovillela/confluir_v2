"use client"

import { useActionState, useState } from "react"
import { CheckCheck, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { useEnvioFormulario } from "@/hooks/use-envio-formulario"
import { type EstadoForm } from "@/lib/contas"
import { formatarData, formatarMoeda } from "@/lib/formato"
import { rotuloCompetencia } from "@/lib/repasse"
import { cn } from "@/lib/utils"

import { confirmarDepositosAction } from "./actions"

export type SugestaoCliente = {
  chave: string
  empresaNome: string
  tipo: string
  competencia: number
  valorRelacao: number
  remessaId: string
  fonteId: string
  seguro: boolean
  candidatos: {
    lancamentoId: string
    data: string
    valor: number
    descricao: string | null
    confianca: "alta" | "media" | "baixa"
    motivos: string[]
  }[]
}

const ROTULO_CONFIANCA = { alta: "Muito provável", media: "Provável", baixa: "Possível" } as const
const CLASSE_CONFIANCA = {
  alta: "bg-success/15 text-success-fg border-success/30",
  media: "bg-info/10 text-info-fg border-info/30",
  baixa: "bg-muted text-muted-foreground border-transparent",
} as const

/**
 * Créditos do extrato que parecem ser o depósito de uma relação lançada.
 * Marcar e confirmar cria a comprovação da fonte e concilia o crédito.
 * `mostrarEmpresa` = false na página da própria empresa.
 */
export function DepositosExtrato({ sugestoes, mostrarEmpresa = true }: { sugestoes: SugestaoCliente[]; mostrarEmpresa?: boolean }) {
  const [estado, acao, pendente] = useActionState<EstadoForm, FormData>(confirmarDepositosAction, {})
  const envio = useEnvioFormulario(acao, estado)
  // relação → crédito marcado (um por relação); os "seguros" já vêm marcados.
  const [marcados, setMarcados] = useState<Record<string, string | null>>(() =>
    Object.fromEntries(sugestoes.map((s) => [s.chave, s.seguro ? s.candidatos[0].lancamentoId : null]))
  )
  const escolhidos = Object.values(marcados).filter(Boolean).length
  const alternar = (chave: string, id: string) => setMarcados((m) => ({ ...m, [chave]: m[chave] === id ? null : id }))

  return (
    <form action={acao} {...envio} className="grid gap-3">
      <div className="grid gap-3">
        {sugestoes.map((s) => (
          <div key={s.chave} className="rounded-lg border p-3">
            <p className="text-sm">
              {mostrarEmpresa && <span className="font-medium">{s.empresaNome} · </span>}
              <span className={cn(!mostrarEmpresa && "font-medium")}>
                {s.tipo} {rotuloCompetencia(s.competencia)}
              </span>
              <span className="text-muted-foreground"> · relação de {formatarMoeda(s.valorRelacao)}</span>
            </p>
            <div className="mt-2 grid gap-1.5">
              {s.candidatos.map((c) => {
                const marcado = marcados[s.chave] === c.lancamentoId
                return (
                  <label
                    key={c.lancamentoId}
                    className={cn(
                      "hover:bg-muted/50 flex cursor-pointer items-start gap-3 rounded-md border p-2 text-sm transition-colors",
                      marcado ? "border-primary bg-primary/5" : "border-transparent"
                    )}
                  >
                    <input
                      type="checkbox"
                      name="deposito"
                      value={`${c.lancamentoId}|${s.remessaId}|${s.fonteId}`}
                      checked={marcado}
                      onChange={() => alternar(s.chave, c.lancamentoId)}
                      className="accent-primary mt-0.5 size-4 shrink-0"
                    />
                    <span className="grid min-w-0 flex-1 gap-0.5">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-medium tabular-nums">{formatarMoeda(c.valor)}</span>
                        <span className="text-muted-foreground tabular-nums">em {formatarData(c.data)}</span>
                        <span className={cn("rounded border px-1.5 py-0.5 text-[11px] font-medium", CLASSE_CONFIANCA[c.confianca])}>
                          {ROTULO_CONFIANCA[c.confianca]}
                        </span>
                        {Math.abs(c.valor - s.valorRelacao) > 0.01 && (
                          <span className="text-warning-fg text-xs">diferença de {formatarMoeda(c.valor - s.valorRelacao)}</span>
                        )}
                      </span>
                      {c.descricao && <span className="text-muted-foreground truncate text-xs">{c.descricao}</span>}
                      <span className="text-muted-foreground text-xs">{c.motivos.join(" · ")}</span>
                    </span>
                  </label>
                )
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm" disabled={pendente || escolhidos === 0}>
          {pendente ? <Loader2 className="animate-spin" /> : <CheckCheck />}
          Confirmar {escolhidos} depósito(s)
        </Button>
        <p className="text-muted-foreground text-xs">
          Confirmar registra o depósito na remessa e concilia o crédito no extrato do Financeiro.
        </p>
      </div>
      {estado.erro && <p className="text-destructive text-sm">{estado.erro}</p>}
      {estado.ok && <p className="text-success-fg text-sm">{estado.ok}</p>}
    </form>
  )
}
