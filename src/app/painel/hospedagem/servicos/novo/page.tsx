import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"
import { requirePermissao } from "@/lib/auth"
import { cuponsAguardando, listarHoteis, listarTarifas } from "@/lib/db/hospedagem"

import { ServicoForm } from "../servico-form"

export const metadata: Metadata = { title: "Nova reserva de hospedagem — Confluir" }

export default async function NovoServicoPage() {
  await requirePermissao("filiacao_hospedagens_edicao", [
    "filiacao_hospedagens_gestao",
  ])

  const [hoteis, cupons, tarifas] = await Promise.all([
    listarHoteis(),
    cuponsAguardando(),
    listarTarifas(),
  ])

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/hospedagem/servicos">
            <ArrowLeft />
            Reservas
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Nova reserva</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Efetiva a hospedagem no hotel usando os cupons aguardando reserva.
        </p>
      </div>
      <ServicoForm
        hoteis={hoteis.map((h) => ({ id: h.id, nome: h.nome }))}
        cuponsAguardando={cupons.map((c) => ({
          id: c.id,
          hotel_id: c.hotel_id,
          filiadoNome: c.filiadoNome,
          check_in: c.check_in,
          sexo: c.sexo,
          aceita_quarto_coletivo: c.aceita_quarto_coletivo,
        }))}
        tarifas={tarifas.map((t) => ({
          hotel_id: t.hotel_id,
          pessoas_por_quarto: t.pessoas_por_quarto,
          custo_por_filiado: t.custo_por_filiado,
          custo_entidade: t.custo_entidade,
        }))}
      />
    </>
  )
}
