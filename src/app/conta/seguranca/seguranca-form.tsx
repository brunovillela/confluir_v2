"use client"

import { useActionState } from "react"
import Link from "next/link"
import { Loader2, Smartphone } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import { confirmarCadastro2FA, desativar2FA, iniciarCadastro2FA } from "./actions"

type Fator = { id: string; nome: string; desde: string | null }

export function SegurancaForm({
  fatores,
  sessaoElevada,
  rotaVerificacao,
  emailConta,
}: {
  fatores: Fator[]
  sessaoElevada: boolean
  rotaVerificacao: string
  emailConta: string
}) {
  const [inicio, iniciar, iniciando] = useActionState(iniciarCadastro2FA, {})
  const [confirmacao, confirmar, confirmando] = useActionState(confirmarCadastro2FA, {})
  const [remocao, remover, removendo] = useActionState(desativar2FA, {})

  // Passo 2 — QR e código de confirmação.
  if (inicio.fatorId && inicio.qr) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cadastrar o aplicativo autenticador</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <ol className="text-muted-foreground list-decimal space-y-1 pl-5 text-sm">
            <li>No celular, abra o aplicativo autenticador e escolha &ldquo;adicionar conta&rdquo;.</li>
            <li>Aponte a câmera para o código abaixo (ou digite a chave manualmente).</li>
            <li>Digite aqui o código de 6 dígitos que o aplicativo mostrar.</li>
          </ol>
          <div className="flex flex-col items-center gap-2 rounded-lg border bg-white p-4">
            {/* O QR vem do Supabase como SVG em data URL. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={inicio.qr} alt="Código QR para o aplicativo autenticador" width={192} height={192} />
            <p className="text-muted-foreground text-xs">Conta: {emailConta}</p>
            <p className="font-mono text-xs break-all select-all">{inicio.segredo}</p>
          </div>
          <form action={confirmar} className="grid gap-3">
            <input type="hidden" name="fator_id" value={inicio.fatorId} />
            {confirmacao.erro && (
              <Alert variant="destructive">
                <AlertDescription>{confirmacao.erro}</AlertDescription>
              </Alert>
            )}
            <div className="grid gap-2">
              <Label htmlFor="codigo">Código do aplicativo</Label>
              <Input
                id="codigo"
                name="codigo"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                required
                className="text-center text-lg tracking-[0.4em]"
              />
            </div>
            <Button type="submit" disabled={confirmando}>
              {confirmando && <Loader2 className="animate-spin" />}
              Confirmar e ativar
            </Button>
          </form>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {fatores.length ? "Verificação em duas etapas ativa" : "Verificação em duas etapas desativada"}
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        {fatores.length === 0 ? (
          <>
            <p className="text-muted-foreground text-sm">
              Com ela ativa, quem souber a sua senha ainda não entra: falta o código que só o seu
              celular gera.
            </p>
            <form action={iniciar}>
              {inicio.erro && (
                <Alert variant="destructive" className="mb-3">
                  <AlertDescription>{inicio.erro}</AlertDescription>
                </Alert>
              )}
              <Button type="submit" disabled={iniciando}>
                {iniciando ? <Loader2 className="animate-spin" /> : <Smartphone />}
                Ativar com aplicativo autenticador
              </Button>
            </form>
          </>
        ) : (
          <>
            <ul className="grid gap-2 text-sm">
              {fatores.map((f) => (
                <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2">
                  <span>
                    <Smartphone className="text-muted-foreground mr-2 inline size-4" />
                    {f.nome}
                    {f.desde && <span className="text-muted-foreground"> · desde {f.desde}</span>}
                  </span>
                  {sessaoElevada ? (
                    <form action={remover}>
                      <input type="hidden" name="fator_id" value={f.id} />
                      <Button type="submit" variant="outline" size="sm" disabled={removendo}>
                        {removendo && <Loader2 className="animate-spin" />}
                        Desativar
                      </Button>
                    </form>
                  ) : (
                    <Button asChild variant="outline" size="sm">
                      <Link href={rotaVerificacao}>Confirmar o código para alterar</Link>
                    </Button>
                  )}
                </li>
              ))}
            </ul>
            {remocao.erro && (
              <Alert variant="destructive">
                <AlertDescription>{remocao.erro}</AlertDescription>
              </Alert>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
