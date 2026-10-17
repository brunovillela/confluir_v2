"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Copy, Loader2, Merge } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { confirmar } from "@/components/ui/confirmacao"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import type { AptoDuplicado, GrupoDuplicado } from "@/lib/db/aptos-duplicados"

import { unificarDuplicadosAction } from "./actions"

const n = (v: number) => v.toLocaleString("pt-BR")

/**
 * Aptos repetidos na lista da rodada (fase 2 do plano de 16/10/2026): a mesma
 * pessoa em duas linhas faz a participação contar linhas, não pessoas — na SLB,
 * 703 "votaram" para 692 votos. Mostra os grupos e unifica (uma linha de cada).
 */
export function DuplicadosAptos({ rodadaId, grupos }: { rodadaId: string; grupos: GrupoDuplicado[] }) {
  const router = useRouter()
  const [aberto, setAberto] = useState(false)
  const [mensagem, setMensagem] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null)
  const [pendente, iniciar] = useTransition()
  const repetidas = grupos.reduce((s, g) => s + g.remover.length, 0)
  const ficam = grupos.reduce((s, g) => s + g.ficam.length, 0)

  if (grupos.length === 0 && !mensagem) return null

  async function unificar() {
    const ok = await confirmar({
      titulo: `Unificar ${n(grupos.length)} pessoa(s) repetida(s)?`,
      descricao: `Fica uma linha de cada pessoa — a que votou ou tem mais dados — completada com o que faltava; ${n(repetidas)} linha(s) repetida(s) saem da lista. Quem votou continua constando como votante.`,
      confirmar: "Unificar",
      destrutivo: true,
    })
    if (!ok) return
    iniciar(async () => {
      const r = await unificarDuplicadosAction(rodadaId)
      setMensagem(r.erro ? { tipo: "erro", texto: r.erro } : { tipo: "ok", texto: r.ok ?? "Feito." })
      setAberto(false)
      router.refresh()
    })
  }

  return (
    <>
      {mensagem && (
        <Alert variant={mensagem.tipo === "ok" ? "success" : "error"}>
          <AlertDescription>{mensagem.texto}</AlertDescription>
        </Alert>
      )}
      {grupos.length > 0 && (
        <Alert variant="warning">
          <Copy />
          <AlertTitle>
            {n(grupos.length)} {grupos.length === 1 ? "pessoa aparece" : "pessoas aparecem"} mais de uma vez na lista
          </AlertTitle>
          <AlertDescription>
            <p>
              Mesmo CPF, ou mesmo e-mail sem CPFs diferentes. O voto de uma linha marca as outras, e a participação
              conta cada linha.
            </p>
            <Dialog open={aberto} onOpenChange={setAberto}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" className="mt-2">
                  <Merge />
                  Ver e unificar
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Aptos repetidos</DialogTitle>
                  <DialogDescription>
                    Em cada pessoa, a primeira linha fica (a que votou, tem comprovante, CPF ou recebeu o link) e as
                    outras saem.
                    {ficam > 0 &&
                      ` ${n(ficam)} repetida(s) com comprovante de votação próprio ficam, para o código continuar valendo.`}
                  </DialogDescription>
                </DialogHeader>
                <div className="grid max-h-[55vh] gap-2 overflow-y-auto pr-1">
                  {grupos.slice(0, 200).map((g) => (
                    <div key={g.manter.id} className="grid gap-1 rounded-md border p-2 text-sm">
                      <Linha apto={g.manter} rotulo="fica" />
                      {g.remover.map((a) => (
                        <Linha key={a.id} apto={a} rotulo="sai" />
                      ))}
                      {g.ficam.map((a) => (
                        <Linha key={a.id} apto={a} rotulo="fica (comprovante)" />
                      ))}
                    </div>
                  ))}
                  {grupos.length > 200 && (
                    <p className="text-muted-foreground text-xs">E mais {n(grupos.length - 200)} pessoa(s).</p>
                  )}
                </div>
                <div className="flex justify-end">
                  <Button onClick={unificar} disabled={pendente || repetidas === 0} variant="destructive">
                    {pendente ? <Loader2 className="animate-spin" /> : <Merge />}
                    Unificar ({n(repetidas)} linha(s) saem)
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </AlertDescription>
        </Alert>
      )}
    </>
  )
}

function Linha({ apto, rotulo }: { apto: AptoDuplicado; rotulo: string }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
      <Badge variant={rotulo === "sai" ? "outline" : "secondary"} className="w-28 justify-center">
        {rotulo}
      </Badge>
      <span className="font-medium">{apto.nome ?? "(sem nome)"}</span>
      <span className="text-muted-foreground text-xs">
        {[apto.cpf ? `CPF ${apto.cpf}` : "sem CPF", apto.matricula && `mat. ${apto.matricula}`, apto.email]
          .filter(Boolean)
          .join(" · ")}
        {apto.votou ? " · votou" : ""}
      </span>
    </div>
  )
}
