import type { Metadata } from "next"
import { AlertTriangle, BadgeCheck, ShieldCheck } from "lucide-react"

import { Marca } from "@/components/marca"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ROTULOS_MODALIDADE } from "@/lib/assembleias-constantes"
import { conferirComprovante, ROTULO_CANAL } from "@/lib/db/voto-comprovante"
import { formatarData, formatarDataHora } from "@/lib/formato"

export const metadata: Metadata = {
  title: "Comprovante de votação — Confluir",
  robots: { index: false },
}

/**
 * Conferência pública do comprovante de votação, sem login. Confirma que a
 * participação existe — assembleia, data/hora e canal — e nunca mostra em quem
 * a pessoa votou: o código vive no registro de participação, separado das
 * escolhas.
 */
export default async function ComprovantePage({
  params,
}: {
  params: Promise<{ codigo: string }>
}) {
  const { codigo } = await params
  const c = await conferirComprovante(decodeURIComponent(codigo))

  return (
    <main className="mx-auto w-full max-w-xl px-4 py-10">
      <div className="mb-8 flex flex-col items-center text-center">
        <Marca variante="completa" />
        <h1 className="mt-6 text-2xl font-semibold tracking-tight">Comprovante de votação</h1>
      </div>

      {!c ? (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertDescription>
            Comprovante <strong className="font-mono">{decodeURIComponent(codigo)}</strong> não
            encontrado. Confira o código como ele aparece no e-mail de confirmação.
          </AlertDescription>
        </Alert>
      ) : (
        <div className="grid gap-4">
          <Alert variant="success">
            <BadgeCheck />
            <AlertDescription>
              <strong>Voto computado.</strong> A participação deste comprovante está registrada.
            </AlertDescription>
          </Alert>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{c.assembleia?.assembleia ?? "Assembleia"}</CardTitle>
              {c.assembleia?.rodada && (
                <CardDescription>
                  {c.assembleia.rodada}
                  {c.assembleia.campanhaTema ? ` · ${c.assembleia.campanhaTema}` : ""}
                </CardDescription>
              )}
            </CardHeader>
            <CardContent className="grid gap-3 text-sm">
              <Dado rotulo="Código">
                <span className="font-mono tracking-wider">{c.codigo}</span>
              </Dado>
              <Dado rotulo="Voto computado em">{formatarDataHora(c.quando)}</Dado>
              <Dado rotulo="Canal">{ROTULO_CANAL[c.canal]}</Dado>
              {c.assembleia && (
                <Dado rotulo="Modalidade">{ROTULOS_MODALIDADE[c.assembleia.modalidade]}</Dado>
              )}
              {c.assembleia?.termino && (
                <Dado rotulo="Votação até">
                  {formatarData(c.assembleia.termino)}
                  {c.assembleia.horaTermino ? ` às ${c.assembleia.horaTermino}` : ""}
                </Dado>
              )}
              {c.eleitor && (
                <Dado rotulo="Eleitor">
                  {c.eleitor}
                  {c.documento ? ` · ${c.documento}` : ""}
                </Dado>
              )}
              {c.hash && (
                <Dado rotulo="Resumo (SHA-256)">
                  <span className="font-mono text-xs break-all">{c.hash}</span>
                </Dado>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldCheck className="size-4" />
                Como a votação é protegida
              </CardTitle>
            </CardHeader>
            <CardContent className="text-muted-foreground grid gap-2 text-sm">
              <p>
                <strong className="text-foreground">O voto é secreto.</strong> As escolhas ficam
                gravadas separadas do cadastro do eleitor. Este comprovante nasce do registro de
                participação, que não guarda as respostas — por isso ele nunca mostra, nem aqui nem
                no e-mail, em quem a pessoa votou.
              </p>
              <p>
                <strong className="text-foreground">Um voto por pessoa.</strong> A participação vale
                para a rodada inteira: quem vota online não vota na urna, e o mesmo CPF ou e-mail não
                vota duas vezes.
              </p>
              <p>
                <strong className="text-foreground">Registro lacrado.</strong> O resumo SHA-256 é
                calculado a partir do código, da assembleia e do momento do voto. Se o registro fosse
                alterado, ele deixaria de conferir.
              </p>
              <p>
                <strong className="text-foreground">Resultado.</strong> A apuração só é publicada
                depois do término da rodada, na área do filiado, em Votação.
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </main>
  )
}

function Dado({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5 sm:grid-cols-[180px_1fr] sm:items-baseline sm:gap-3">
      <span className="text-muted-foreground text-xs">{rotulo}</span>
      <span>{children}</span>
    </div>
  )
}
