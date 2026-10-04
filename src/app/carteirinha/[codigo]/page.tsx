import type { Metadata } from "next"
import { CircleCheck, CircleX, ShieldQuestion } from "lucide-react"

import { Marca } from "@/components/marca"
import { verificarCarteirinha } from "@/lib/db/carteirinha"
import { formatarData, formatarDataHora } from "@/lib/formato"

export const metadata: Metadata = { title: "Verificação de filiação — Confluir" }
export const dynamic = "force-dynamic"

/**
 * Página PÚBLICA da carteirinha (onda 4, F1): quem lê o QR vê se a filiação
 * está ativa agora, o nome e a matrícula — e só. Código inválido ou
 * adulterado não revela nada.
 */
export default async function VerificarPage({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params
  const v = await verificarCarteirinha(codigo)

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col gap-6 px-4 py-10">
      <div className="flex justify-center">
        <Marca variante="sidebar" tenant={v?.entidade ?? null} />
      </div>
      {!v ? (
        <section className="rounded-xl border p-6 text-center">
          <ShieldQuestion className="text-muted-foreground mx-auto mb-3 size-10" />
          <h1 className="text-lg font-semibold">Código não reconhecido</h1>
          <p className="text-muted-foreground mt-1 text-sm">Este QR não corresponde a uma carteirinha emitida por esta entidade.</p>
        </section>
      ) : (
        <section className={`rounded-xl border p-6 text-center ${v.valida ? "border-success/40" : "border-destructive/40"}`}>
          {v.valida ? <CircleCheck className="text-success-fg mx-auto mb-3 size-12" /> : <CircleX className="text-destructive mx-auto mb-3 size-12" />}
          <h1 className="text-lg font-semibold">{v.valida ? "Filiação ativa" : "Sem filiação ativa"}</h1>
          {v.nome && (
            <dl className="mt-4 grid gap-2 text-left text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Nome</dt>
                <dd className="font-medium">{v.nome}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Matrícula</dt>
                <dd className="font-medium tabular-nums">{v.matricula ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-muted-foreground">Condição</dt>
                <dd className="font-medium">{v.condicao ?? "—"}</dd>
              </div>
              {v.valida && v.desde && (
                <div className="flex justify-between gap-4">
                  <dt className="text-muted-foreground">Filiado(a) desde</dt>
                  <dd className="font-medium">{formatarData(v.desde)}</dd>
                </div>
              )}
            </dl>
          )}
          <p className="text-muted-foreground mt-4 text-xs">
            Situação consultada em {formatarDataHora(v.verificadoEm)} no cadastro de {v.entidade}. Esta página não mostra CPF nem contatos.
          </p>
        </section>
      )}
    </main>
  )
}
