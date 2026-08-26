import type { Metadata } from "next"
import { Boxes, MapPin, Receipt } from "lucide-react"

import { CartaoArea } from "@/components/cartao-area"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { requirePermissao } from "@/lib/auth"
import { resumoPatrimonio } from "@/lib/db/patrimonio"

export const metadata: Metadata = { title: "Patrimônio — Confluir" }

export default async function PatrimonioPage() {
  await requirePermissao("patrimonio_geral", ["patrimonio_leitura"])
  const resumo = await resumoPatrimonio()

  const plural = (n: number, un: string, uns = `${un}s`) =>
    `${n.toLocaleString("pt-BR")} ${n === 1 ? un : uns}`

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Patrimônio</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Bens patrimoniais da instituição: itens, onde ficam, notas fiscais e
          cautelas.
        </p>
      </div>

      {!resumo.disponivel && (
        <Alert variant="warning">
          <AlertDescription>
            Patrimônio ainda não configurado — rode{" "}
            <code>supabase/patrimonio.sql</code> no SQL Editor do Supabase.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <CartaoArea
          titulo="Itens patrimoniais"
          descricao="Bens do patrimônio, com situação, recinto e cautela"
          href="/painel/patrimonio/itens"
          icone={Boxes}
          indicador={
            resumo.disponivel
              ? `${plural(resumo.totalItens, "item", "itens")} · ${resumo.emCautela} em cautela`
              : null
          }
        />
        <CartaoArea
          titulo="Recintos"
          descricao="Locais onde os bens ficam e seus responsáveis"
          href="/painel/patrimonio/recintos"
          icone={MapPin}
          indicador={resumo.disponivel ? plural(resumo.recintos, "recinto") : null}
        />
        <CartaoArea
          titulo="Notas fiscais"
          descricao="Notas de entrada e saída dos bens patrimoniais"
          href="/painel/patrimonio/notas"
          icone={Receipt}
          indicador={resumo.disponivel ? plural(resumo.notas, "nota") : null}
        />
      </div>
    </>
  )
}
