"use client"

import { Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { TipoReuniaoRep } from "@/lib/representacao-reunioes-constantes"

import { excluirReuniaoAction } from "./actions"
import { confirmarEnvio } from "@/components/ui/confirmacao"

export function ExcluirReuniao({ empresaId, reuniaoId, tipo }: { empresaId: string; reuniaoId: string; tipo: TipoReuniaoRep }) {
  return (
    <form
      action={excluirReuniaoAction}
      onSubmit={(e) => {
        confirmarEnvio(e, `Excluir ${tipo === "setorial" ? "esta setorial" : "esta reunião"}, com a ata e os participantes?`)}}
      className="flex justify-end"
    >
      <input type="hidden" name="empresa_id" value={empresaId} />
      <input type="hidden" name="reuniao_id" value={reuniaoId} />
      <input type="hidden" name="tipo" value={tipo} />
      <Button type="submit" variant="ghost" size="sm" className="text-destructive">
        <Trash2 />
        Excluir
      </Button>
    </form>
  )
}
