import type { Metadata } from "next"

import { VoltarLista } from "@/components/voltar-lista"
import { requirePermissao } from "@/lib/auth"
import { hojeSP } from "@/lib/db/comum"
import { listarCentrosDeDebito } from "@/lib/db/financeiro"

import { Distribuidor } from "./distribuidor"

export const metadata: Metadata = { title: "Distribuir comprovantes — Confluir" }

export default async function DistribuirComprovantesPage() {
  await requirePermissao("financeiro_pagamento")
  const debitos = (await listarCentrosDeDebito()).map((c) => ({
    id: c.id,
    nome: [c.acesso, c.nome_da_conta ?? "(sem nome)"].filter(Boolean).join(" — "),
  }))
  return (
    <>
      <div>
        <VoltarLista chave="ordens" base="/painel/financeiro/ordens" rotulo="Ordens de pagamento" />
        <h1 className="text-2xl font-semibold tracking-tight">Distribuir comprovantes</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Envie um ou vários comprovantes de pagamento (PDF, JPG ou PNG; um PDF pode ter vários, um por página). O
          sistema lê cada um, procura a ordem sem comprovante que casa com ele e mostra para você confirmar. Ordem já
          paga só ganha o comprovante; ordem a pagar fica Paga, com a data e o valor do comprovante.
        </p>
      </div>
      <Distribuidor debitos={debitos} hoje={hojeSP()} />
    </>
  )
}
