"use client"

import { useState, useTransition } from "react"
import { ShieldCheck } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { OPCOES_RETER_CONTATOS_DIAS } from "@/lib/assembleias-constantes"
import type { GuardaContatos as Guarda } from "@/lib/db/votacao-expurgo"
import { formatarDataHora } from "@/lib/formato"

import { configurarGuardaContatosAction } from "./actions"

/**
 * Prazo de guarda dos contatos dos aptos (RIPD da votação, V4): depois de
 * apuradas todas as assembleias da rodada e passado este prazo, o cron apaga
 * e-mail de contato, telefone, Telegram e nascimento informado. Nome, CPF,
 * participação e comprovante ficam.
 */
export function GuardaContatos({ rodadaId, guarda }: { rodadaId: string; guarda: Guarda }) {
  const [pendente, iniciar] = useTransition()
  const [mensagem, setMensagem] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null)
  const opcoes = (OPCOES_RETER_CONTATOS_DIAS as readonly number[]).includes(guarda.dias)
    ? OPCOES_RETER_CONTATOS_DIAS
    : [...OPCOES_RETER_CONTATOS_DIAS, guarda.dias].sort((a, b) => a - b)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="size-4" />
          Guarda dos contatos dos aptos
        </CardTitle>
        <CardDescription>
          E-mail de contato, telefone, Telegram e nascimento informados pelos eleitores servem para
          entregar o link e o comprovante. Depois da apuração e do prazo de impugnação, eles são
          apagados sozinhos; nome, CPF, participação e comprovante ficam.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {guarda.expurgadosEm ? (
          <p className="text-sm">Contatos apagados em {formatarDataHora(guarda.expurgadosEm)}.</p>
        ) : (
          <>
            <label className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium">Apagar</span>
              <select
                className="border-input bg-background h-8 rounded-md border px-2 text-sm"
                value={String(guarda.dias)}
                disabled={pendente}
                onChange={(e) => {
                  const dias = Number(e.target.value)
                  setMensagem(null)
                  iniciar(async () => {
                    const r = await configurarGuardaContatosAction(rodadaId, dias)
                    setMensagem(r.erro ? { tipo: "erro", texto: r.erro } : { tipo: "ok", texto: r.ok ?? "Salvo." })
                  })
                }}
              >
                {opcoes.map((d) => (
                  <option key={d} value={d}>
                    {d} dias
                  </option>
                ))}
              </select>
              <span>depois do encerramento da apuração</span>
            </label>
            <p className="text-muted-foreground text-xs">
              {guarda.previstoPara
                ? `Todas as assembleias estão apuradas: os contatos serão apagados a partir de ${formatarDataHora(guarda.previstoPara)}.`
                : "O prazo começa quando a apuração de todas as assembleias da rodada estiver encerrada."}
            </p>
          </>
        )}
        {mensagem && (
          <Alert variant={mensagem.tipo === "ok" ? "success" : "error"}>
            <AlertDescription>{mensagem.texto}</AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  )
}
