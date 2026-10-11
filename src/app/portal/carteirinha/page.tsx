import type { Metadata } from "next"
import Link from "next/link"
import QRCode from "qrcode"
import { Eye, FileText, IdCard, ShieldCheck } from "lucide-react"

import { AcaoVisualizacao } from "@/components/acao-visualizacao"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { dadosCarteirinha } from "@/lib/db/carteirinha"
import { formatarData } from "@/lib/formato"
import { requireVisualizacaoPortal } from "@/lib/visualizacao-filiado"

export const metadata: Metadata = { title: "Carteirinha — Portal" }

function cpfMascarado(cpf: string | null): string {
  if (!cpf || cpf.length !== 11) return "—"
  return `***.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-**`
}

/** Carteirinha digital do filiado (onda 4, F1): identificação + QR verificável. */
export default async function CarteirinhaPage({
  searchParams,
}: {
  searchParams: Promise<{ aviso?: string }>
}) {
  const { filiado, preview } = await requireVisualizacaoPortal()
  const { aviso } = await searchParams
  const dados = await dadosCarteirinha(filiado.cpf)
  const qr = dados?.urlVerificacao ? await QRCode.toDataURL(dados.urlVerificacao, { errorCorrectionLevel: "M", margin: 1, width: 320 }) : null

  return (
    <>
      <div>
        <div className="flex items-center gap-2">
          <IdCard className="text-muted-foreground size-5" />
          <h1 className="text-2xl font-semibold tracking-tight">Carteirinha</h1>
        </div>
        <p className="text-muted-foreground mt-1 text-xs">
          Mostre na portaria ou no convênio. O QR leva à verificação pública, que confirma só a condição da filiação.
        </p>
      </div>

      {/* A rota da declaração devolve para cá quando é aberta na visualização. */}
      {preview && aviso === "visualizacao" && (
        <Alert>
          <Eye />
          <AlertDescription>
            Na visualização pela gestão, a declaração não é emitida: só o
            próprio associado a emite, pela conta dele.
          </AlertDescription>
        </Alert>
      )}

      {!dados ? (
        <Alert variant="destructive">
          <AlertDescription>Não foi possível carregar seu cadastro — fale com o sindicato.</AlertDescription>
        </Alert>
      ) : (
        <>
          <Card className="mx-auto w-full max-w-md overflow-hidden">
            <div className="bg-primary text-primary-foreground px-5 py-3">
              <p className="text-xs opacity-90">{dados.entidade}</p>
              <p className="text-sm font-semibold">Carteira de filiado(a)</p>
            </div>
            <CardContent className="grid gap-4 py-5">
              <div className="grid gap-0.5">
                <p className="text-lg leading-tight font-semibold">{dados.nome}</p>
                <p className="text-muted-foreground text-xs">CPF {cpfMascarado(dados.cpf)}</p>
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <div>
                  <dt className="text-muted-foreground text-xs">Matrícula</dt>
                  <dd className="font-medium tabular-nums">{dados.matricula ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-xs">Filiado(a) desde</dt>
                  <dd className="font-medium">{dados.desde ? formatarData(dados.desde) : "—"}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-muted-foreground text-xs">Condição</dt>
                  <dd>
                    <Badge variant="outline" className={dados.ativo ? "border-success/40 text-success-fg" : "border-destructive/40 text-destructive"}>
                      {dados.condicao ?? "—"}
                    </Badge>
                  </dd>
                </div>
                {dados.fontes.length > 0 && (
                  <div className="col-span-2">
                    <dt className="text-muted-foreground text-xs">Vínculo</dt>
                    <dd className="font-medium">{dados.fontes.join(", ")}</dd>
                  </div>
                )}
              </dl>
              {qr ? (
                <div className="flex items-center gap-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={qr} alt="QR de verificação da carteirinha" className="size-32 rounded-md bg-white p-1" />
                  <p className="text-muted-foreground text-xs">
                    <ShieldCheck className="text-success-fg mb-1 size-4" />
                    Quem ler o QR vê nome, matrícula e a condição atual da filiação. Nada mais.
                  </p>
                </div>
              ) : (
                <p className="text-muted-foreground text-xs">QR de verificação indisponível neste ambiente.</p>
              )}
            </CardContent>
          </Card>

          <div className="mx-auto flex w-full max-w-md flex-wrap items-start gap-2">
            <AcaoVisualizacao preview={preview} nota="Só o próprio associado emite a declaração, pela conta dele.">
              {preview ? (
                // Na visualização, botão sem link: nada para clicar nem para
                // abrir em outra aba. O envelope já esmaece — sem o
                // disabled:opacity-100 o cinza dobraria.
                <Button type="button" disabled className="disabled:opacity-100">
                  <FileText />
                  Declaração de filiação (PDF)
                </Button>
              ) : (
                <Button asChild>
                  <a href="/portal/carteirinha/declaracao" target="_blank" rel="noreferrer">
                    <FileText />
                    Declaração de filiação (PDF)
                  </a>
                </Button>
              )}
            </AcaoVisualizacao>
            {dados.urlVerificacao && (
              <Button variant="outline" asChild>
                <Link href={dados.urlVerificacao} target="_blank" rel="noreferrer">
                  Ver a página de verificação
                </Link>
              </Button>
            )}
          </div>
          <p className="text-muted-foreground mx-auto w-full max-w-md text-xs">
            A declaração sai com a data de hoje e o mesmo QR. Se a filiação deixar de estar ativa, a verificação passa a dizer isso: documentos antigos não valem sozinhos.
          </p>
        </>
      )}
    </>
  )
}
