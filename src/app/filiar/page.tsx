import type { Metadata } from "next"

import { Marca } from "@/components/marca"
import {
  obterTermosVigentes,
  opcoesFontesPublicas,
} from "@/lib/db/filiacao-publica"
import { obterOrganizacao } from "@/lib/db/organizacao"

import { FiliarForm } from "./filiar-form"

export const metadata: Metadata = {
  title: "Ficha de filiação — Confluir",
  robots: { index: false },
}

export default async function FiliarPage() {
  const [fontes, org, termos] = await Promise.all([
    opcoesFontesPublicas(),
    obterOrganizacao(),
    obterTermosVigentes(),
  ])
  const nome = org?.nomeFantasia ?? org?.nomeRazao ?? "ao sindicato"

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <div className="mb-8 flex flex-col items-center text-center">
        <Marca variante="completa" />
        <h1 className="mt-6 text-2xl font-semibold tracking-tight">
          Ficha de filiação
        </h1>
        <p className="text-muted-foreground mt-1 max-w-xl text-sm">
          Preencha seus dados para se filiar {nome === "ao sindicato" ? nome : `ao ${nome}`}.
          Depois de confirmar seu e-mail, você recebe um link para baixar a
          ficha, assiná-la no gov.br e enviá-la para avaliação.
        </p>
      </div>

      <FiliarForm
        fontes={fontes}
        termoLgpd={termos.lgpd?.texto ?? null}
        termoDesconto={termos.desconto?.texto ?? null}
      />

      <p className="text-muted-foreground mt-6 text-center text-xs">
        Já iniciou uma filiação? Use o link enviado ao seu e-mail para continuar.
      </p>
    </main>
  )
}
