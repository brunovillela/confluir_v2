import type { Metadata } from "next"
import Link from "next/link"
import { CalendarClock, Info } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { hojeSP } from "@/lib/db/comum"
import { CONDICAO_COLETIVA } from "@/lib/filiacao"
import { formatarData } from "@/lib/formato"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"
import { requireVisualizacaoPortal } from "@/lib/visualizacao-filiado"

import { DesistirForm } from "./desistir-form"
import { PortalShell } from "../portal-shell"

export const metadata: Metadata = { title: "Minha filiação — Confluir" }

/**
 * Área do filiado — desistência da FILIAÇÃO COLETIVA. Só habilitada para quem
 * está na condição "Em processo de filiação coletiva" e dentro do prazo; para
 * os demais, explica o caminho normal (procurar o sindicato).
 */
export default async function DesfiliacaoPortalPage() {
  const { filiado, preview } = await requireVisualizacaoPortal()
  const admin = await createAdminClient()
  const { data } = await admin
    .from("filiacoes")
    .select("filiacao_condicao, filiacao_coletiva_prazo")
    .eq("id", filiado.filiacaoId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()

  const condicao = (data?.filiacao_condicao as string | null) ?? null
  const prazo = (data?.filiacao_coletiva_prazo as string | null) ?? null
  const hoje = hojeSP()
  const emColetiva = condicao === CONDICAO_COLETIVA
  const dentroDoPrazo = emColetiva && (!prazo || prazo >= hoje)

  return (
    <PortalShell>
      <div className="mx-auto grid w-full max-w-2xl gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Minha filiação
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Situação atual: <strong>{condicao ?? "—"}</strong>
          </p>
        </div>

        {dentroDoPrazo ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                <CalendarClock className="mr-1 inline size-4 align-[-3px]" />
                Você foi filiado por decisão da assembleia
              </CardTitle>
              <CardDescription>
                A categoria aprovou, em assembleia, um acordo coletivo com
                cláusula de filiação coletiva — por isso você consta como
                filiado.
                {prazo && (
                  <>
                    {" "}
                    Se não quiser permanecer, você pode desistir até{" "}
                    <strong>{formatarData(prazo)}</strong>, aqui mesmo.
                  </>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <Alert>
                <AlertDescription>
                  <Info className="mr-1 inline size-4 align-[-3px]" />
                  Ao desistir, o sindicato comunica o seu empregador para
                  encerrar o desconto em folha. Você deixa de ter acesso aos
                  serviços exclusivos dos filiados.
                </AlertDescription>
              </Alert>
              <DesistirForm preview={preview} />
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Desfiliação pela internet
              </CardTitle>
              <CardDescription>
                {emColetiva && prazo
                  ? `O prazo de desistência online terminou em ${formatarData(prazo)}.`
                  : "A desfiliação pela área do filiado está disponível apenas durante o prazo de desistência da filiação coletiva."}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              <p className="text-muted-foreground text-sm">
                Para se desfiliar, procure o sindicato pelos canais de
                atendimento — o pedido é registrado e comunicado ao seu
                empregador.
              </p>
              <div>
                <Button asChild variant="outline" size="sm">
                  <Link href="/portal/inicio">Voltar ao início</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </PortalShell>
  )
}
