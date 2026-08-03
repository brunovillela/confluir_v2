import type { Metadata } from "next"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { requirePermissao } from "@/lib/auth"
import { sugerirRetencao } from "@/lib/db/atendimentos"

import { AssistidoForm } from "../assistido-form"

export const metadata: Metadata = { title: "Novo assistido — Confluir" }

export default async function NovoAssistidoPage() {
  await requirePermissao("saude_atendimento", ["saude_gestao"])

  // Cadastro novo conta a guarda a partir de hoje — que é a data de
  // registro, conforme decidido para quem não tem vínculo empregatício com
  // o sindicato. Marcar exposição depois exige revisar a data.
  const hoje = new Date().toISOString().slice(0, 10)

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Novo assistido
          </h1>
          <p className="text-muted-foreground mt-1 text-xs">
            Identificação e prazo de guarda do prontuário
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/painel/saude/assistidos">Voltar à lista</Link>
        </Button>
      </div>

      <AssistidoForm retencaoSugerida={sugerirRetencao(hoje, false)} />
    </>
  )
}
