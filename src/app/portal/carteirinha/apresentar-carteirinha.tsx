"use client"

import { useEffect, useState } from "react"
import { Maximize2, X } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "@/components/ui/dialog"

/** O que a Wake Lock API devolve (tipado à mão: nem todo navegador tem). */
type Trava = { release: () => Promise<void> }
type ComTrava = { wakeLock?: { request: (tipo: "screen") => Promise<Trava> } }

/**
 * Modo "Apresentar" da carteirinha (A36): a tela inteira para a portaria ou o
 * balcão do convênio — fundo claro fixo (o leitor de QR erra no tema escuro),
 * nome grande, matrícula, condição e o QR ocupando o que couber. O Dialog
 * trava a rolagem da página por baixo; enquanto ele está aberto, a tela não
 * apaga sozinha (Wake Lock, onde o navegador deixa — onde não deixa, nada
 * muda).
 *
 * Só mexe no estado da tela: no "Ver como filiado" continua funcionando,
 * como manda o AcaoVisualizacao.
 */
export function ApresentarCarteirinha({
  entidade,
  nome,
  matricula,
  condicao,
  ativo,
  qr,
}: {
  entidade: string
  nome: string
  matricula: string | null
  condicao: string | null
  ativo: boolean
  qr: string
}) {
  const [aberto, setAberto] = useState(false)

  useEffect(() => {
    if (!aberto) return
    const nav = navigator as Navigator & ComTrava
    let trava: Trava | null = null
    let cancelado = false
    nav.wakeLock
      ?.request("screen")
      .then((t) => {
        if (cancelado) void t.release().catch(() => {})
        else trava = t
      })
      .catch(() => {})
    return () => {
      cancelado = true
      void trava?.release().catch(() => {})
    }
  }, [aberto])

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <Button className="w-full sm:w-auto">
          <Maximize2 />
          Apresentar carteirinha
        </Button>
      </DialogTrigger>
      {/* data-theme="light" no próprio conteúdo: os tokens viram os do tema
          claro aqui dentro, qualquer que seja o tema da pessoa. */}
      <DialogContent
        data-theme="light"
        showCloseButton={false}
        className="bg-background text-foreground inset-0 flex h-dvh max-h-none max-w-none translate-x-0 translate-y-0 flex-col items-center justify-between gap-4 overflow-y-auto rounded-none p-4 ring-0 sm:max-w-none"
      >
        <div className="grid w-full max-w-md justify-items-center gap-1 pt-2 text-center">
          <p className="text-muted-foreground text-sm">{entidade}</p>
          <DialogTitle className="text-2xl leading-tight font-semibold">{nome}</DialogTitle>
          <DialogDescription className="text-foreground flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-base">
            <span>
              Matrícula <strong className="tabular-nums">{matricula ?? "—"}</strong>
            </span>
            <Badge
              variant="outline"
              className={ativo ? "border-success/40 text-success-fg h-6 text-sm" : "border-destructive/40 text-destructive h-6 text-sm"}
            >
              {condicao ?? "—"}
            </Badge>
          </DialogDescription>
        </div>

        {/* Quadrado que cabe na tela em pé e deitada. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={qr}
          alt="QR de verificação da carteirinha"
          className="aspect-square w-[min(88vw,62dvh)] max-w-[28rem] rounded-lg bg-white p-2"
        />

        <div className="grid w-full max-w-md gap-2 pb-2 text-center">
          <p className="text-muted-foreground text-xs">
            Quem ler o QR confere nome, matrícula e a condição da filiação hoje.
          </p>
          {/* As variantes dark: do outline casam com o tema da PÁGINA ([data-theme=dark] *),
              mesmo aqui dentro do bloco claro — sobrescritas para o botão seguir o claro. */}
          <Button
            variant="outline"
            className="dark:bg-background dark:border-input dark:hover:bg-muted w-full"
            onClick={() => setAberto(false)}
          >
            <X />
            Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
