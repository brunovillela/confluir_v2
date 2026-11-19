import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { AvisoPrivacidade } from "@/components/aviso-privacidade"
import { Marca } from "@/components/marca"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ProgressoLimiar } from "@/app/painel/representacao/congressos/mocoes-componentes"
import { obterCongresso } from "@/lib/db/congressos"
import { mocaoPorCodigo, progressoDaMocao, ROTULO_SITUACAO_MOCAO } from "@/lib/db/congressos-mocoes"
import { tenantAtual } from "@/lib/tenant"

import { AbrirComMeuLink } from "./abrir-com-meu-link"

export const metadata: Metadata = { title: "Moção — Confluir", robots: { index: false }, referrer: "no-referrer" }

/**
 * Destino do QR da moção. Mostra o texto e o progresso; para assinar, abre a
 * moção no link pessoal guardado neste aparelho (sem ele, explica como).
 */
export default async function MocaoPublicaPage({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params
  const tenantId = await tenantAtual()
  const m = await mocaoPorCodigo(tenantId, codigo.toUpperCase())
  if (!m) notFound()
  const c = await obterCongresso(m.congressoId)
  if (!c) notFound()
  const prog = await progressoDaMocao(c, tenantId, m, "publico")

  return (
    <main className="mx-auto grid w-full max-w-2xl gap-5 px-4 py-8">
      <div className="flex flex-col items-center text-center">
        <Marca variante="completa" />
        <p className="text-muted-foreground mt-3 text-xs uppercase tracking-wide">
          {c.edicao ? `${c.edicao}º ` : ""}
          {c.nome}
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>
            Moção {m.numero}
            {m.tipo ? ` · ${m.tipo}` : ""}: {m.titulo}
          </CardTitle>
          <p className="text-muted-foreground text-xs">
            {ROTULO_SITUACAO_MOCAO[m.situacao]}
            {m.destinatario ? ` · Destinatário: ${m.destinatario}` : ""}
          </p>
        </CardHeader>
        <CardContent className="grid gap-4">
          <p className="whitespace-pre-wrap">{m.texto}</p>
          <ProgressoLimiar limiar={prog.limiar} gravado={m.situacao !== "coleta"} />
          {m.situacao === "coleta" && <AbrirComMeuLink codigo={m.codigo} />}
        </CardContent>
      </Card>
      {prog.nomes && prog.nomes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Quem assinou · {prog.nomes.length}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{prog.nomes.join(", ")}</p>
          </CardContent>
        </Card>
      )}
      <AvisoPrivacidade />
    </main>
  )
}
