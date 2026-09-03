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
import {
  listarCanais,
  obterPolitica,
  OBJETIVOS,
} from "@/lib/db/comunicacao-textos"

import { SolicitacaoForm } from "../textos-forms"

export const metadata: Metadata = { title: "Novo texto — Confluir" }

export default async function NovoTextoPage() {
  await requirePermissao("noticias")
  const [canais, { ativo, politica }] = await Promise.all([
    listarCanais(true),
    obterPolitica(),
  ])

  return (
    <>
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3">
          <Link href="/painel/comunicacao/textos">
            <ArrowLeft />
            Assistente de redação
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Novo texto</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Quanto mais concreto o campo de fatos, menos genérico o resultado.
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
            <CardTitle>A solicitação</CardTitle>
            <CardDescription>
              A IA escreve a partir da política editorial da entidade, das
              convenções do canal escolhido e dos fatos informados aqui.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SolicitacaoForm
              canais={canais.map((c) => ({
                id: c.id,
                nome: c.nome,
                limite: c.limite_caracteres,
                suportaBusca: c.suporta_busca,
              }))}
              objetivos={OBJETIVOS.map((o) => ({
                valor: o.valor,
                rotulo: o.rotulo,
              }))}
              temPolitica={politica.politica.trim().length > 0}
            />
          </CardContent>
        </Card>
      )}
    </>
  )
}
