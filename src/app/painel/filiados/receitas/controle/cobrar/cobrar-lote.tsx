"use client"

import { useActionState, useState } from "react"
import { Link2, Loader2, Send } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { useEnvioFormulario } from "@/hooks/use-envio-formulario"
import { type EstadoForm } from "@/lib/contas"
import { formatarData, formatarMoeda } from "@/lib/formato"
import { rotuloCompetencia } from "@/lib/repasse"
import { cn } from "@/lib/utils"

import { cobrarEmLoteAction } from "../actions"

export type EmpresaCobrarCliente = {
  empresaId: string
  nome: string
  itens: { competencia: number; tipo: string; falta: "relacao" | "deposito"; prazo: string; valor: number }[]
  contatos: { id: string; nome: string; email: string | null }[]
  ultimaCobranca: string | null
  recente: boolean
  temLink: boolean
}

export function CobrarLote({ empresas, mostrarTipo }: { empresas: EmpresaCobrarCliente[]; mostrarTipo: boolean }) {
  const [estado, acao, pendente] = useActionState<EstadoForm, FormData>(cobrarEmLoteAction, {})
  const envio = useEnvioFormulario(acao, estado)
  const podeCobrar = (e: EmpresaCobrarCliente) => e.contatos.some((c) => c.email)
  const [marcadas, setMarcadas] = useState<Set<string>>(
    () => new Set(empresas.filter((e) => podeCobrar(e) && !e.recente).map((e) => e.empresaId))
  )
  const alternar = (id: string) =>
    setMarcadas((m) => {
      const n = new Set(m)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  return (
    <form action={acao} {...envio} className="grid gap-4">
      <div className="grid gap-2">
        {empresas.map((e) => {
          const ok = podeCobrar(e)
          const marcada = marcadas.has(e.empresaId)
          return (
            <label
              key={e.empresaId}
              className={cn(
                "flex items-start gap-3 rounded-lg border p-3 text-sm transition-colors",
                ok ? "hover:bg-muted/50 cursor-pointer" : "opacity-70",
                marcada && "border-primary bg-primary/5"
              )}
            >
              <input
                type="checkbox"
                name="empresa"
                value={e.empresaId}
                checked={marcada}
                disabled={!ok}
                onChange={() => alternar(e.empresaId)}
                className="accent-primary mt-0.5 size-4 shrink-0"
              />
              <span className="grid min-w-0 flex-1 gap-1">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-medium">{e.nome}</span>
                  {e.temLink && (
                    <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
                      <Link2 className="size-3" /> link do RH no e-mail
                    </span>
                  )}
                  {e.recente && e.ultimaCobranca && (
                    <span className="text-warning-fg text-xs">cobrada em {formatarData(e.ultimaCobranca)}</span>
                  )}
                </span>
                <span className="text-muted-foreground text-xs">
                  {e.itens
                    .map(
                      (i) =>
                        `${i.falta === "relacao" ? "relação" : "depósito"} ${rotuloCompetencia(i.competencia)}${mostrarTipo ? ` (${i.tipo})` : ""}${i.falta === "deposito" && i.valor > 0 ? ` de ${formatarMoeda(i.valor)}` : ""}`
                    )
                    .join(" · ")}
                </span>
                <span className={cn("text-xs", ok ? "text-muted-foreground" : "text-destructive")}>
                  {ok
                    ? `Para ${e.contatos.filter((c) => c.email).map((c) => c.email).join(", ")}`
                    : "Sem contato da folha com e-mail: cadastre em Contatos da folha."}
                </span>
              </span>
            </label>
          )
        })}
      </div>
      <Textarea name="mensagem" rows={2} placeholder="Recado a mais, para todas (opcional)" />
      <p className="text-muted-foreground text-xs">
        Cada empresa recebe um e-mail só, com todas as competências pendentes dela, em nome da entidade. A cobrança fica
        registrada na trilha de cada competência e tira a empresa dos avisos por 3 dias. As já cobradas nos últimos 3
        dias vêm desmarcadas.
      </p>
      <div>
        <Button type="submit" disabled={pendente || marcadas.size === 0}>
          {pendente ? <Loader2 className="animate-spin" /> : <Send />}
          Cobrar {marcadas.size} empresa(s)
        </Button>
      </div>
      {estado.erro && <p className="text-destructive text-sm">{estado.erro}</p>}
      {estado.ok && <p className="text-success-fg text-sm">{estado.ok}</p>}
    </form>
  )
}
