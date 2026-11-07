import type { Metadata } from "next"

import { Marca } from "@/components/marca"
import { obterOrganizacao } from "@/lib/db/organizacao"

import { FiliarForm } from "./filiar-form"
import { AjudaFicha } from "./ajuda"
import { AvisoPrivacidade } from "@/components/aviso-privacidade"

export const metadata: Metadata = {
  title: "Ficha de filiação — Confluir",
  robots: { index: false },
}

export default async function FiliarPage() {
  const org = await obterOrganizacao()
  const nome = org?.nomeFantasia ?? org?.nomeRazao ?? null

  return (
    <main className="mx-auto w-full max-w-md px-4 py-10">
      <div className="mb-6 flex flex-col items-center text-center">
        <Marca variante="completa" />
        <h1 className="mt-6 text-2xl font-semibold tracking-tight">Filie-se{nome ? ` ao ${nome}` : ""}</h1>
        <p className="text-muted-foreground mt-2 text-base">
          Comece pelo seu CPF. Se você já foi filiado(a), seus dados vêm preenchidos.
        </p>
      </div>

      <FiliarForm ajuda={<AjudaFicha emailContato={org?.emailContato ?? null} site={org?.siteUrl ?? null} />} />

      <AvisoPrivacidade />
    </main>
  )
}
