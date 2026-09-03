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
import { obterPolitica } from "@/lib/db/comunicacao-textos"
import { formatarDataHora } from "@/lib/formato"

import { PoliticaForm } from "../textos-forms"

export const metadata: Metadata = { title: "Política editorial — Confluir" }

export default async function PoliticaPage() {
  await requirePermissao("noticias")
  const { ativo, politica } = await obterPolitica()

  return (
    <>
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3">
          <Link href="/painel/comunicacao/textos">
            <ArrowLeft />
            Assistente de redação
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">
          Política editorial
        </h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Escrita uma vez, usada em todo texto que a IA produzir. É o que separa
          um texto que soa como a entidade de um texto que soa como qualquer um.
          {politica.updated_at
            ? ` Atualizada em ${formatarDataHora(politica.updated_at)}${
                politica.atualizadaPorNome
                  ? ` por ${politica.atualizadaPorNome}`
                  : ""
              }.`
            : ""}
        </p>
      </div>

      {!ativo ? (
        <Alert variant="destructive">
          <AlertDescription>
            As tabelas do assistente ainda não existem no banco. Rode
            <code className="mx-1">supabase/comunicacao-assistente-textos.sql</code>
            no SQL Editor do Supabase.
          </AlertDescription>
        </Alert>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>A voz da entidade</CardTitle>
            <CardDescription>
              Descreva como o sindicato escreve. Se preferir não começar do
              zero, aponte alguns textos já publicados e deixe a IA deduzir.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PoliticaForm
              inicial={{
                politica: politica.politica,
                publico_padrao: politica.publico_padrao,
                tom_padrao: politica.tom_padrao,
                termos_evitar: politica.termos_evitar,
                assinatura: politica.assinatura,
              }}
            />
          </CardContent>
        </Card>
      )}
    </>
  )
}
