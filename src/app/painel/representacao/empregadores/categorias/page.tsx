import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, Settings } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { listarCategoriasCriadas } from "@/lib/db/fonte-categorias"
import { podeAcessar } from "@/lib/permissoes"
import { categoriasSistema } from "@/lib/saude-cadastros"

import { LinhaCategoria, NovaCategoriaForm } from "./categorias-forms"

export const metadata: Metadata = { title: "Categorias de fonte — Confluir" }

/** Cadastro das categorias de fonte pagadora da entidade. */
export default async function CategoriasFontePage() {
  const sessao = await requirePermissao("empregadores")
  const podeConfigurarSaude = podeAcessar(sessao.permissoes, "filiacao_gestao")
  const { categorias, disponivel } = await listarCategoriasCriadas()

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/representacao/empregadores">
            <ArrowLeft />
            Empregadores
          </Link>
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Categorias de fonte</h1>
          {podeConfigurarSaude && (
            <Button asChild variant="outline" size="sm">
              <Link href="/painel/filiados/saude-cadastros/configuracao">
                <Settings />
                Saúde dos cadastros
              </Link>
            </Button>
          )}
        </div>
        <p className="text-muted-foreground mt-1 max-w-3xl text-sm">
          Toda fonte pagadora tem uma categoria. Além de Empregador e Fundo de
          pensão, a entidade pode criar as suas. Cada categoria criada segue as
          regras de vínculo de uma das duas — em fundo de pensão, por exemplo,
          cargo e lotação não se aplicam — e ganha uma aba própria na
          configuração da saúde dos cadastros.
        </p>
      </div>

      {!disponivel && (
        <Alert className="border-warning/40">
          <AlertDescription>
            Rode <code>supabase/fonte-categorias.sql</code> para poder criar categorias.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Categorias</CardTitle>
          <CardDescription>
            A categoria de cada fonte é escolhida na edição da fonte.
          </CardDescription>
        </CardHeader>
        <CardContent className="divide-y">
          {categoriasSistema().map((c) => (
            <div key={c.chave} className="flex flex-wrap items-center justify-between gap-2 py-3">
              <p className="text-sm font-medium">{c.nome}</p>
              <Badge variant="outline" className="text-muted-foreground">
                do sistema
              </Badge>
            </div>
          ))}
          {categorias.map((c) => (
            <LinhaCategoria key={c.id} {...c} />
          ))}
        </CardContent>
      </Card>

      {disponivel && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Nova categoria</CardTitle>
          </CardHeader>
          <CardContent>
            <NovaCategoriaForm />
          </CardContent>
        </Card>
      )}
    </>
  )
}
