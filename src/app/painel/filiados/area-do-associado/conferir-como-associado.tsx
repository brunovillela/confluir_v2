"use client"

import { useState } from "react"
import { useFormStatus } from "react-dom"
import { Eye, Loader2 } from "lucide-react"

import { FiliadoPicker } from "@/components/filiado-picker"
import { Button } from "@/components/ui/button"
import { iniciarVisualizacaoFiliado } from "@/lib/actions/visualizacao"

function BotaoVer() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" variant="outline" disabled={pending}>
      {pending ? <Loader2 className="animate-spin" /> : <Eye />}
      Ver como o associado
    </Button>
  )
}

/**
 * "Ver como filiado" a partir daqui: escolhe a pessoa e abre o portal dela
 * em somente leitura (o mesmo fluxo do botão "Visualizar área" do cadastro).
 * A busca é a do módulo Filiados, que já exige a permissão.
 */
export function ConferirComoAssociado() {
  const [erro, setErro] = useState<string | null>(null)

  return (
    <form
      action={iniciarVisualizacaoFiliado}
      className="grid gap-2"
      onSubmit={(e) => {
        if (!new FormData(e.currentTarget).get("filiacaoId")) {
          e.preventDefault()
          setErro("Escolha um filiado na busca.")
        } else setErro(null)
      }}
    >
      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <FiliadoPicker endpoint="/painel/filiados/busca" nome="filiacaoId" />
        <BotaoVer />
      </div>
      {erro && (
        <p role="alert" className="text-destructive text-xs">
          {erro}
        </p>
      )}
    </form>
  )
}
