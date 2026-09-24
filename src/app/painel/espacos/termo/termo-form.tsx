"use client"

import { useActionState, useState } from "react"
import { Loader2, Sparkles } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { MARCADORES, renderizarTermo } from "@/lib/espacos-termo"

import { redigirComIAAction, salvarTermoAction } from "./actions"

/** Exemplo para a prévia — não é dado de cessão nenhuma. */
const EXEMPLO = Object.fromEntries(MARCADORES.map((m) => [m.chave, m.exemplo]))

export function TermoForm({ textoInicial }: { textoInicial: string }) {
  const [texto, setTexto] = useState(textoInicial)
  const [verPrevia, setVerPrevia] = useState(false)
  const [salvo, salvar, salvando] = useActionState(salvarTermoAction, {})
  const [ia, redigir, redigindo] = useActionState(redigirComIAAction, {})

  // A sugestão da IA entra no editor, para a pessoa ler e ajustar antes de salvar.
  if (ia.texto && ia.texto !== textoInicial && texto === textoInicial) {
    queueMicrotask(() => setTexto(ia.texto!))
  }

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="size-4" />
            Escrever com ajuda da IA
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <p className="text-muted-foreground text-sm">
            A IA escreve o <strong>modelo padrão</strong>, com os marcadores no
            lugar do que muda a cada cessão. Ela não preenche horário, nome nem
            valor — isso vem do pedido. Leia e ajuste antes de salvar.
          </p>
          {ia.erro && (
            <Alert variant="destructive">
              <AlertDescription>{ia.erro}</AlertDescription>
            </Alert>
          )}
          {ia.ok && (
            <Alert variant="success">
              <AlertDescription>{ia.ok}</AlertDescription>
            </Alert>
          )}
          <form action={redigir} className="grid gap-2">
            <input type="hidden" name="texto" value={texto} />
            <div className="grid gap-1.5">
              <Label htmlFor="instrucao">O que você quer mudar ou incluir</Label>
              <Input
                id="instrucao"
                name="instrucao"
                placeholder="Ex.: incluir cláusula sobre uso de som após as 22h"
              />
            </div>
            <div className="flex justify-end">
              <Button type="submit" variant="outline" size="sm" disabled={redigindo}>
                {redigindo && <Loader2 className="animate-spin" />}
                Pedir sugestão
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">Modelo do termo</CardTitle>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setVerPrevia((v) => !v)}
            >
              {verPrevia ? "Voltar a editar" : "Ver prévia com exemplo"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3">
          {salvo.erro && (
            <Alert variant="destructive">
              <AlertDescription>{salvo.erro}</AlertDescription>
            </Alert>
          )}
          {salvo.ok && (
            <Alert variant="success">
              <AlertDescription>{salvo.ok}</AlertDescription>
            </Alert>
          )}
          {salvo.aviso && (
            <Alert variant="warning">
              <AlertDescription>{salvo.aviso}</AlertDescription>
            </Alert>
          )}

          {verPrevia ? (
            <pre className="bg-muted/40 max-h-[32rem] overflow-auto rounded-md p-4 text-sm whitespace-pre-wrap">
              {renderizarTermo(texto, EXEMPLO)}
            </pre>
          ) : (
            <form action={salvar} className="grid gap-3">
              <Textarea
                name="texto"
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                rows={22}
                className="font-mono text-xs"
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-muted-foreground text-xs">
                  Salvar cria uma <strong>versão nova</strong>. Os termos já
                  gerados continuam como estão.
                </p>
                <Button type="submit" disabled={salvando}>
                  {salvando && <Loader2 className="animate-spin" />}
                  Salvar nova versão
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Marcadores disponíveis</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-1.5 sm:grid-cols-2">
          {MARCADORES.map((m) => (
            <div key={m.chave} className="flex flex-wrap items-baseline gap-2 text-sm">
              <Badge variant="outline" className="font-mono text-xs">
                {`{{${m.chave}}}`}
              </Badge>
              <span className="text-muted-foreground">{m.rotulo}</span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
