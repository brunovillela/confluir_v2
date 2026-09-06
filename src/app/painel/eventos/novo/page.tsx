import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { obterConfig } from "@/lib/db/eventos"

import { EventoForm } from "../evento-forms"

export const metadata: Metadata = { title: "Novo evento — Confluir" }

export default async function NovoEventoPage() {
  await requirePermissao("eventos_gestao")
  const { ativo, config } = await obterConfig()

  return (
    <>
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3">
          <Link href="/painel/eventos">
            <ArrowLeft />
            Eventos
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Novo evento</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Período, capacidade e as regras de inscrição.
        </p>
      </div>

      {!ativo ? (
        <Alert variant="destructive">
          <AlertDescription>
            As tabelas do módulo ainda não existem no banco. Rode
            <code className="mx-1">supabase/eventos.sql</code>
            no SQL Editor do Supabase.
          </AlertDescription>
        </Alert>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Dados do evento</CardTitle>
            <CardDescription>
              Você poderá ajustar tudo enquanto ele estiver em rascunho.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <EventoForm modoFoto={config.modo_foto} />
          </CardContent>
        </Card>
      )}
    </>
  )
}
