import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { contatosDaFolhaDe, empresasSemContatoDaFolha } from "@/lib/db/repasse-cobranca"

import { ContatosFolha } from "../formularios"
import { UsarContato } from "./usar-contato"

export const metadata: Metadata = { title: "Contatos da folha — Confluir" }

/**
 * Empresas que mandam relação e não têm contato da folha com e-mail: sem ele,
 * não há cobrança por e-mail nem envio de inclusões/exclusões ou do link do RH.
 */
export default async function ContatosDaFolhaPage() {
  await requirePermissao("filiacao_receitas", ["filiacao_gestao"])
  const { total, empresas } = await empresasSemContatoDaFolha()
  const atuais = await contatosDaFolhaDe(empresas.map((e) => e.empresaId))

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/filiados/receitas/controle">
            <ArrowLeft />
            Controle de envio
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Contatos da folha</h1>
        <p className="text-muted-foreground mt-1 max-w-2xl text-sm">
          Quem cuida dos descontos no RH de cada empresa recebe as cobranças, o link do RH e as inclusões e exclusões.{" "}
          {total - empresas.length} de {total} empresa(s) com filiados ativos já têm contato da folha com e-mail.
        </p>
      </div>

      {empresas.length === 0 ? (
        <Alert className="border-success/40">
          <AlertDescription>Todas as empresas com filiados ativos têm contato da folha com e-mail.</AlertDescription>
        </Alert>
      ) : (
        <div className="grid gap-4">
          {empresas.map((e) => (
            <Card key={e.empresaId}>
              <CardHeader>
                <CardTitle className="text-base">
                  <Link href={`/painel/filiados/receitas/controle/${e.empresaId}`} className="hover:underline">
                    {e.nome}
                  </Link>
                </CardTitle>
                <CardDescription>
                  {e.filiadosAtivos} filiado(s) ativo(s)
                  {e.grupo && ` · grupo ${e.grupo}`}
                  {e.semEmail && " · o contato da folha cadastrado não tem e-mail"}
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4">
                {e.sugestoes.length > 0 && (
                  <div className="grid gap-2">
                    <p className="text-sm font-medium">Contatos já cadastrados da empresa</p>
                    {e.sugestoes.map((s) => (
                      <UsarContato key={s.id} empresaId={e.empresaId} contato={s} />
                    ))}
                  </div>
                )}
                <ContatosFolha empresaId={e.empresaId} contatos={atuais.get(e.empresaId) ?? []} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  )
}
