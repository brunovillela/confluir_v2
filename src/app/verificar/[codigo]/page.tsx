import type { Metadata } from "next"
import { AlertTriangle, Ban, BadgeCheck, Clock3 } from "lucide-react"

import { Marca } from "@/components/marca"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { verificarCertificadoMinuta } from "@/lib/db/minuta-assinatura"
import { verificarCertificadoRpa } from "@/lib/db/rpa-assinatura"
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
  const contrato = await verificarCertificadoMinuta(decodeURIComponent(codigo))
  if (contrato) return <VerificacaoContrato v={contrato} />
  const recibo = await verificarCertificadoRpa(decodeURIComponent(codigo))
  if (recibo) return <VerificacaoContrato v={recibo} documento="recibo" />
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
            // Cancelado depois de assinado: a assinatura é autêntica (aconteceu),
            // mas o documento não vale — as duas coisas ditas, o cancelamento em destaque.
            <>
              <Alert variant="destructive" className="border-destructive border-2">
                <Ban />
                <AlertDescription>
                  <p className="text-base font-semibold">
                    OFÍCIO CANCELADO
                    {v.canceladoEm ? ` em ${formatarMomento(v.canceladoEm)}` : ""}
                  </p>
                  <p className="mt-1">
                    A entidade cancelou este ofício <strong>depois</strong> de assinado. Não o
                    considere em vigor.
                  </p>
                  {v.cancelamentoMotivo && (
                    <p className="mt-1">
                      <strong>Motivo:</strong> {v.cancelamentoMotivo}
                    </p>
                  )}
                </AlertDescription>
              </Alert>
              <Alert>
                <BadgeCheck />
                <AlertDescription>
                  A assinatura é <strong>autêntica</strong>: o documento foi de fato assinado
                  eletronicamente na data abaixo, e o resumo do conteúdo é o daquele momento. O
                  cancelamento é um ato posterior e não altera o que foi assinado.
                </AlertDescription>
              </Alert>
            </>
          ) : v.oficioSituacao === "Cancelado" ? (
            <Alert variant="destructive">
              <Ban />
              <AlertDescription>
                Este certificado <strong>não tem assinatura concluída</strong> e o ofício foi{" "}
                <strong>cancelado</strong>
                {v.canceladoEm ? ` em ${formatarMomento(v.canceladoEm)}` : ""}.
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
            uso único e assinatura, com data, hora e endereço IP
            {v.oficioSituacao === "Cancelado" ? " — e, nos PDFs gerados depois, o cancelamento" : ""}.
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

/** Certificado de assinatura de contrato (minuta assinada eletronicamente). */
function VerificacaoContrato({
  v,
  documento = "contrato",
}: {
  v: NonNullable<Awaited<ReturnType<typeof verificarCertificadoMinuta>>>
  /** O mesmo certificado serve ao contrato e ao recibo (RPA). */
  documento?: "contrato" | "recibo"
}) {
  const doc = documento === "recibo" ? "recibo" : "contrato"
  const valida = v.situacao === "assinado" && v.conteudoIntegro
  return (
    <main className="mx-auto w-full max-w-xl px-4 py-10">
      <div className="mb-8 flex flex-col items-center text-center">
        <Marca variante="completa" />
        <h1 className="mt-6 text-2xl font-semibold tracking-tight">Verificação de assinatura</h1>
      </div>
      <div className="grid gap-4">
        {valida ? (
          <Alert className="border-success/40 text-success-fg">
            <BadgeCheck />
            <AlertDescription>
              Assinatura <strong>válida</strong>: corresponde a um {doc} assinado eletronicamente e o
              conteúdo não foi alterado desde então.
              {documento === "recibo" ? "" : v.concluida ? " Todas as partes assinaram." : " Ainda faltam assinaturas de outras partes."}
            </AlertDescription>
          </Alert>
        ) : v.situacao === "assinado" ? (
          <Alert variant="destructive">
            <AlertTriangle />
            <AlertDescription>
              Esta pessoa assinou, mas o conteúdo do {doc} <strong>mudou depois</strong> ou o envio foi
              cancelado. Esta assinatura não vale para o conteúdo atual.
            </AlertDescription>
          </Alert>
        ) : (
          <Alert>
            <Clock3 />
            <AlertDescription>
              Este certificado <strong>não tem assinatura concluída</strong> ({v.situacao}).
            </AlertDescription>
          </Alert>
        )}
        <Card>
          <CardHeader>
            <CardTitle className="font-mono text-lg tracking-wider">{v.certificado}</CardTitle>
            <CardDescription>
              {v.titulo}
              {v.entidade ? ` · ${v.entidade}` : ""}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <Campo rotulo="Assinado por" valor={v.nome} />
              <Campo rotulo="Papel" valor={v.papel} />
              <Campo rotulo="CPF (conferido na assinatura)" valor={v.cpf} />
              <Campo
                rotulo="Data e hora da assinatura"
                valor={v.assinadoEm ? `${formatarMomento(v.assinadoEm)} (horário de Brasília)` : null}
              />
              <div className="sm:col-span-2">
                <dt className="text-muted-foreground text-xs">Resumo do conteúdo assinado (SHA-256)</dt>
                <dd className="mt-0.5 font-mono text-xs break-all">{v.hash ?? "—"}</dd>
              </div>
            </dl>
          </CardContent>
        </Card>
        <p className="text-muted-foreground text-center text-xs">
          A página de certificado ao fim do PDF do {doc} traz a trilha completa de cada assinatura:
          envio, abertura, código de uso único, conferência do CPF e assinatura, com data, hora, IP e
          navegador.
        </p>
      </div>
    </main>
  )
}
