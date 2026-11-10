import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { CalendarDays, MapPin } from "lucide-react"

import { AvisoPrivacidade } from "@/components/aviso-privacidade"
import { Marca } from "@/components/marca"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Card, CardContent } from "@/components/ui/card"
import { descreverValor, AJUSTE_POR_CHAVE, valor } from "@/lib/congressos/config"
import { congressoPublico } from "@/lib/db/congressos-inscricao"
import { obterOrganizacao } from "@/lib/db/organizacao"
import { formatarData } from "@/lib/formato"
import { tenantAtual } from "@/lib/tenant"

import { InscricaoCongressoForm } from "./inscricao-form"

export const metadata: Metadata = {
  title: "Inscrição no congresso — Confluir",
  robots: { index: false },
}

export default async function CongressoPublicoPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const tenantId = await tenantAtual()
  const [c, org] = await Promise.all([congressoPublico(slug, tenantId), obterOrganizacao()])
  if (!c) notFound()
  const entidade = org?.nomeFantasia ?? org?.nomeRazao ?? null
  const fecha = valor(c.config, "inscricao.fecha")

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10">
      <div className="mb-8 flex flex-col items-center text-center">
        <Marca variante="completa" />
        {entidade && <p className="text-muted-foreground mt-3 text-xs uppercase tracking-wide">{entidade}</p>}
      </div>

      <div className="mb-6 text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-balance">
          {c.edicao ? `${c.edicao}º ` : ""}
          {c.nome}
        </h1>
        {c.tema && <p className="text-muted-foreground mt-2 text-balance">{c.tema}</p>}
        <div className="text-muted-foreground mt-3 grid gap-1 text-sm">
          {c.inicio && (
            <p className="flex items-center justify-center gap-2">
              <CalendarDays className="size-4" />
              {formatarData(c.inicio)}
              {c.termino && formatarData(c.termino) !== formatarData(c.inicio) ? ` a ${formatarData(c.termino)}` : ""}
            </p>
          )}
          {c.local && (
            <p className="flex items-center justify-center gap-2">
              <MapPin className="size-4" />
              {c.local}
            </p>
          )}
        </div>
      </div>

      {c.aberta ? (
        <Card>
          <CardContent className="grid gap-5">
            <div>
              <h2 className="text-lg font-medium">Inscrição</h2>
              {typeof fecha === "string" && (
                <p className="text-muted-foreground mt-1 text-xs">
                  Até {descreverValor(AJUSTE_POR_CHAVE.get("inscricao.fecha")!, fecha)}.
                </p>
              )}
              {valor(c.config, "delegacao.forma") === "ordem_inscricao" && (
                <p className="text-muted-foreground mt-1 text-xs">
                  As vagas de cada base são preenchidas pela ordem de inscrição; passado o limite, a inscrição entra na lista
                  de espera.
                </p>
              )}
            </div>
            <InscricaoCongressoForm
              slug={slug}
              papeis={c.papeis}
              unidades={c.unidades}
              rotuloUnidade={c.rotuloUnidade}
              pedeNomeSocial={valor(c.config, "inscricao.pede_nome_social") === true}
              pedeGenero={valor(c.config, "inscricao.pede_genero") === true || Number(valor(c.config, "cotas.genero_minimo")) > 0}
              pedeAcessibilidade={valor(c.config, "inscricao.pede_acessibilidade") === true}
            />
          </CardContent>
        </Card>
      ) : (
        <Alert>
          <AlertDescription>{c.motivoFechada ?? "As inscrições estão fechadas."}</AlertDescription>
        </Alert>
      )}
      <AvisoPrivacidade />
    </main>
  )
}
