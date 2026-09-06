import type { Metadata } from "next"

import { Marca } from "@/components/marca"
import { Card, CardContent } from "@/components/ui/card"

import { PedirCodigo } from "./formularios"

export const metadata: Metadata = {
  title: "Meus dados — Confluir",
  robots: { index: false },
}

export default function MeusDadosPage() {
  return (
    <main className="mx-auto w-full max-w-lg px-4 py-10">
      <div className="mb-8 flex flex-col items-center text-center">
        <Marca variante="completa" />
        <h1 className="mt-6 text-2xl font-semibold tracking-tight">
          Seus dados
        </h1>
        <p className="text-muted-foreground mt-2 text-sm">
          Aqui você vê, corrige ou pede a exclusão dos dados que informou ao se
          inscrever em eventos da entidade.
        </p>
      </div>

      <Card>
        <CardContent>
          <PedirCodigo />
        </CardContent>
      </Card>

      <p className="text-muted-foreground mt-6 text-center text-xs">
        Direito garantido pela Lei Geral de Proteção de Dados (art. 18). Se
        preferir, procure a secretaria da entidade.
      </p>
    </main>
  )
}
