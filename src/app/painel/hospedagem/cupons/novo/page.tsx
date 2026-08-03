import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { Button } from "@/components/ui/button"
import { requirePermissao } from "@/lib/auth"
import { listarHoteis } from "@/lib/db/hospedagem"

import { CHAVE_EMITIR_CUPOM, CHAVES_EMITIR_CUPOM_ALT } from "../chaves"
import { CupomForm } from "../cupom-form"

export const metadata: Metadata = { title: "Novo cupom de hospedagem — Confluir" }

export default async function NovoCupomPage() {
  await requirePermissao(CHAVE_EMITIR_CUPOM, CHAVES_EMITIR_CUPOM_ALT)

  const hoteis = (await listarHoteis()).filter((h) => h.ativo !== false)

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/hospedagem/cupons">
            <ArrowLeft />
            Cupons de hospedagem
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Novo cupom</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Autorização do sindicato para o filiado ter subsídio no hotel parceiro.
        </p>
      </div>
      <CupomForm hoteis={hoteis.map((h) => ({ id: h.id, nome: h.nome }))} />
    </>
  )
}
