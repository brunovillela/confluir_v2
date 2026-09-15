import type { Metadata } from "next"
import { AlertTriangle, BadgeCheck, Clock3 } from "lucide-react"

import { Marca } from "@/components/marca"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { formatarMomento, verificarCertificado } from "@/lib/db/oficios-assinatura"
import { formatarData } from "@/lib/formato"

export const metadata: Metadata = {
  title: "Verificação de assinatura — Confluir",
  robots: { index: false },
}

/**
 * Destino do QR Code do ofício assinado: confirma, sem login, que o
 * certificado existe, quem assinou, quando, e o resumo SHA-256 do conteúdo.
 * Não mostra o texto do ofício.
 */
export default async function VerificarCertificadoPage({
  params,
}: {
  params: Promise<{ codigo: string }>
}) {
  const { codigo } = await params
  const v = await verificarCertificado(decodeURIComponent(codigo))

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-10">
      <div className="mb-8 flex flex-col items-center text-center">
        <Marca variante="completa" />
        <h1 className="mt-6 text-2xl font-semibold tracking-tight">Verificação de assinatura</h1>
      </div>

      {!v ? (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertDescription>
            Certificado <strong className="font-mono">{decodeURIComponent(codigo)}</strong> não encontrado.
            Confira o código impresso sob a assinatura do ofício.
          </AlertDescription>
        </Alert>
      ) : (
        <div className="grid gap-4">
          {v.situacao === "assinado" && v.oficioSituacao !== "Cancelado" ? (
            <Alert className="border-success/40 text-success-fg">
              <BadgeCheck />
              <AlertDescription>
                Assinatura <strong>válida</strong>: este certificado corresponde a um ofício assinado
                eletronicamente.
              </AlertDescription>
            </Alert>
          ) : v.situacao === "assinado" ? (
            <Alert variant="destructive">
              <AlertTriangle />
              <AlertDescription>
                O ofício foi assinado, mas <strong>cancelado depois</strong> pela entidade. Não o
                considere em vigor.
              </AlertDescription>
            </Alert>
          ) : (
            <Alert>
              <Clock3 />
              <AlertDescription>
                Este certificado <strong>não tem assinatura concluída</strong> (
                {v.situacao === "pendente" ? "aguardando assinatura" : v.situacao}).
              </AlertDescription>
            </Alert>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="font-mono text-lg tracking-wider">{v.certificado}</CardTitle>
              <CardDescription>Ofício {v.numero} · {v.remetente}</CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <Campo rotulo="Assunto" valor={v.assunto} />
                <Campo rotulo="Destinatário" valor={v.destinatario} />
                <Campo rotulo="Data do ofício" valor={v.data ? formatarData(v.data) : null} />
                <Campo rotulo="Assinado por" valor={[v.assinante, v.cargo].filter(Boolean).join(" — ") || null} />
                <Campo
                  rotulo="Data e hora da assinatura"
                  valor={v.assinadoEm ? `${formatarMomento(v.assinadoEm)} (horário de Brasília)` : null}
                />
                <div className="sm:col-span-2">
                  <dt className="text-muted-foreground text-xs">Resumo do conteúdo (SHA-256)</dt>
                  <dd className="mt-0.5 font-mono text-xs break-all">{v.hash ?? "—"}</dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <p className="text-muted-foreground text-center text-xs">
            A página de certificado ao fim do PDF traz a trilha completa: envio, abertura, código de
            uso único e assinatura, com data, hora e endereço IP.
          </p>
        </div>
      )}
    </main>
  )
}

function Campo({ rotulo, valor }: { rotulo: string; valor: string | null }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{rotulo}</dt>
      <dd className="mt-0.5">{valor ?? "—"}</dd>
    </div>
  )
}
