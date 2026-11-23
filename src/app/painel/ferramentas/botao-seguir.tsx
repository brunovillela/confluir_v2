"use client"

import { useState, useTransition } from "react"
import { Bell, BellRing, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"

import { alternarSeguirAction } from "./seguir-actions"

/**
 * Seguir uma tarefa ou demanda (Onda 4): quem segue recebe os avisos dela sem
 * ser o responsável. Mostra quantas pessoas seguem.
 */
export function BotaoSeguir({
  tipo,
  id,
  seguindo: inicial,
  total: totalInicial,
}: {
  tipo: "tarefa" | "demanda"
  id: string
  seguindo: boolean
  total: number
}) {
  const [estado, setEstado] = useState({ seguindo: inicial, total: totalInicial })
  const [erro, setErro] = useState<string | null>(null)
  const [pendente, iniciar] = useTransition()
  const outros = estado.total - (estado.seguindo ? 1 : 0)
  const dica = estado.seguindo
    ? `Você recebe os avisos desta ${tipo}${outros > 0 ? ` (e mais ${outros} pessoa${outros === 1 ? "" : "s"})` : ""}. Clique para deixar de seguir.`
    : `Seguir: receber os avisos desta ${tipo} sem ser o responsável.${estado.total ? ` ${estado.total} pessoa${estado.total === 1 ? " segue" : "s seguem"}.` : ""}`
  return (
    <span className="inline-flex items-center gap-2">
      <Button
        type="button"
        size="sm"
        variant={estado.seguindo ? "secondary" : "outline"}
        disabled={pendente}
        title={dica}
        aria-pressed={estado.seguindo}
        onClick={() =>
          iniciar(async () => {
            setErro(null)
            const r = await alternarSeguirAction(tipo, id, !estado.seguindo)
            if (r.erro) setErro(r.erro)
            else setEstado({ seguindo: Boolean(r.seguindo), total: r.total ?? 0 })
          })
        }
      >
        {pendente ? <Loader2 className="animate-spin" /> : estado.seguindo ? <BellRing /> : <Bell />}
        {estado.seguindo ? "Seguindo" : "Seguir"}
        {estado.total > 0 && <span className="text-muted-foreground text-xs tabular-nums">{estado.total}</span>}
      </Button>
      {erro && <span className="text-destructive text-xs">{erro}</span>}
    </span>
  )
}
