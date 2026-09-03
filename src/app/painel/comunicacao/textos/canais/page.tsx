import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { GrupoColapsavel } from "@/components/grupo-colapsavel"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { listarCanais } from "@/lib/db/comunicacao-textos"

import { CanalEditavel, NovoCanalForm } from "./canais-forms"

export const metadata: Metadata = {
  title: "Locais de distribuição — Confluir",
}

export default async function CanaisPage() {
  await requirePermissao("noticias")
  const canais = await listarCanais()

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
          Locais de distribuição
        </h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Onde os textos são publicados. Cada canal guarda o tamanho típico e as
          convenções do meio — é o que faz a IA escrever uma legenda de
          Instagram diferente de um cartaz de mural.
        </p>
      </div>

      <Card>
        <CardContent>
          <GrupoColapsavel
            titulo="Novo canal"
            descricao="Vale para qualquer meio, inclusive os que não são digitais."
          >
            <div className="pt-2">
              <NovoCanalForm />
            </div>
          </GrupoColapsavel>
        </CardContent>
      </Card>

      {canais.length === 0 && (
        <Alert>
          <AlertDescription>
            Nenhum canal cadastrado. Se você já rodou o SQL, os canais iniciais
            teriam sido criados — cadastre o primeiro acima.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-3">
        {canais.map((c) => (
          <CanalEditavel
            key={c.id}
            canal={{
              id: c.id,
              nome: c.nome,
              limite_caracteres: c.limite_caracteres,
              orientacoes: c.orientacoes,
              suporta_busca: c.suporta_busca,
              ativo: c.ativo,
              ordem: c.ordem,
            }}
          />
        ))}
      </div>
    </>
  )
}
