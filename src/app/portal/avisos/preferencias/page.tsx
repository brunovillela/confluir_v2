import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { AcaoVisualizacao } from "@/components/acao-visualizacao"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { preferenciasDoFiliado } from "@/lib/db/portal-avisos"
import { requireVisualizacaoPortal } from "@/lib/visualizacao-filiado"

import { PortalShell } from "../../portal-shell"
import { PreferenciasForm } from "./preferencias-form"

export const metadata: Metadata = { title: "Preferências de avisos — Portal do Associado" }

export default async function PreferenciasAvisosPage() {
  const { filiado, preview, gestorNome } = await requireVisualizacaoPortal()
  const prefs = await preferenciasDoFiliado(filiado.cpf)

  return (
    <PortalShell preview={preview ? { filiadoNome: filiado.nome_completo, gestorNome } : undefined}>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2">
          <Link href="/portal/avisos">
            <ArrowLeft />
            Avisos
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Preferências de avisos</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          O sino do portal recebe tudo. Aqui você escolhe o que também chega por e-mail
          {filiado.email ? ` (${filiado.email})` : ""}.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Por e-mail</CardTitle>
          <CardDescription className="text-xs">
            Desligue um tipo e ele continua aparecendo no sino, só não vai para a sua caixa de entrada.
            Confirmações com QR Code e links de voto chegam sempre.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!filiado.email && (
            <p className="text-muted-foreground mb-4 text-sm">
              Seu cadastro não tem e-mail — inclua um em Meu cadastro para receber avisos fora do portal.
            </p>
          )}
          <AcaoVisualizacao preview={preview}>
            <PreferenciasForm prefs={prefs} />
          </AcaoVisualizacao>
        </CardContent>
      </Card>
    </PortalShell>
  )
}
