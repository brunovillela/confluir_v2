"use client"

import { useActionState, useRef, useState } from "react"
import { Check, FileUp, Loader2, QrCode } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

import { trocarCodigoPixAction, trocarNotaFiscalAction } from "./actions"

type Estado = { erro?: string; ok?: string }

function Retorno({ estado }: { estado: Estado }) {
  if (!estado.erro && !estado.ok) return null
  return (
    <Alert
      variant={estado.erro ? "destructive" : undefined}
      className={estado.ok ? "border-success/40 text-success-fg" : undefined}
    >
      <AlertDescription>{estado.erro ?? estado.ok}</AlertDescription>
    </Alert>
  )
}

/**
 * Novo código Pix copia e cola para uma ordem ainda não paga — o código do
 * fornecedor expira. Fechado por padrão: abre com o botão.
 */
export function NovoCodigoPix({
  processoId,
  ordemId,
  finalAtual,
}: {
  processoId: string
  ordemId: string
  finalAtual: string | null
}) {
  const [aberto, setAberto] = useState(false)
  const [estado, acao, pendente] = useActionState(trocarCodigoPixAction, {})

  if (!aberto) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" className="h-7" onClick={() => setAberto(true)}>
          <QrCode />
          Novo código Pix
        </Button>
        {estado.ok && <span className="text-success-fg text-xs">{estado.ok}</span>}
      </div>
    )
  }

  return (
    <form action={acao} className="grid gap-2 rounded-md border p-3">
      <input type="hidden" name="processo_id" value={processoId} />
      <input type="hidden" name="ordem_id" value={ordemId} />
      <p className="text-muted-foreground text-xs">
        Cole o código Pix copia e cola novo
        {finalAtual ? ` — o atual termina em …${finalAtual}` : ""}. O anterior deixa de valer nesta ordem.
      </p>
      <Textarea name="pix_codigo" required rows={3} placeholder="000201…" className="font-mono text-xs" />
      <Retorno estado={estado} />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pendente}>
          {pendente && <Loader2 className="animate-spin" />}
          Salvar código
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setAberto(false)}>
          Fechar
        </Button>
      </div>
    </form>
  )
}

/**
 * Nota fiscal específica de um pagamento, em forma de ícone: a descrição
 * aparece no hover e o clique abre o seletor de arquivo — escolhido, sobe
 * na hora.
 */
export function NotaDoPagamentoIcone({
  processoId,
  ordemId,
  temNota,
}: {
  processoId: string
  ordemId: string
  temNota: boolean
}) {
  const [estado, acao, pendente] = useActionState(trocarNotaFiscalAction, {})
  const formRef = useRef<HTMLFormElement>(null)
  const arquivoRef = useRef<HTMLInputElement>(null)
  const descricao = temNota
    ? "Trocar a nota fiscal deste pagamento (a anterior fica na trilha da ordem)"
    : "Incluir a nota fiscal específica deste pagamento"

  return (
    <form ref={formRef} action={acao} className="inline-flex items-center gap-1">
      <input type="hidden" name="processo_id" value={processoId} />
      <input type="hidden" name="alvo" value="pagamento" />
      <input type="hidden" name="id" value={ordemId} />
      <input
        ref={arquivoRef}
        type="file"
        name="nota_fiscal"
        accept=".pdf,.jpg,.jpeg,.png,.webp"
        className="hidden"
        onChange={(e) => {
          if (e.currentTarget.files?.length) formRef.current?.requestSubmit()
        }}
      />
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label={descricao}
            disabled={pendente}
            onClick={() => arquivoRef.current?.click()}
          >
            {pendente ? <Loader2 className="animate-spin" /> : <FileUp />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{descricao} — PDF ou imagem, até 4 MB</TooltipContent>
      </Tooltip>
      {!pendente && estado.ok && <Check className="text-success-fg size-4" aria-label={estado.ok} />}
      {!pendente && estado.erro && <span className="text-destructive max-w-56 text-xs">{estado.erro}</span>}
    </form>
  )
}

/**
 * Incluir ou trocar a nota fiscal — da COMPRA (fornecimento) ou do
 * PAGAMENTO (a ordem). A nota costuma chegar depois; vale mesmo com a
 * ordem paga.
 */
export function TrocarNotaFiscal({
  processoId,
  alvo,
  id,
  temNota,
}: {
  processoId: string
  alvo: "compra" | "pagamento"
  id: string
  temNota: boolean
}) {
  const [aberto, setAberto] = useState(false)
  const [estado, acao, pendente] = useActionState(trocarNotaFiscalAction, {})
  const rotulo = `${temNota ? "Trocar" : "Incluir"} nota ${alvo === "compra" ? "da compra" : "do pagamento"}`

  if (!aberto) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" className="h-7" onClick={() => setAberto(true)}>
          <FileUp />
          {rotulo}
        </Button>
        {estado.ok && <span className="text-success-fg text-xs">{estado.ok}</span>}
      </div>
    )
  }

  return (
    <form action={acao} className="grid gap-2 rounded-md border p-3">
      <input type="hidden" name="processo_id" value={processoId} />
      <input type="hidden" name="alvo" value={alvo} />
      <input type="hidden" name="id" value={id} />
      <p className="text-muted-foreground text-xs">
        {alvo === "compra"
          ? "Nota fiscal do fornecimento. A ordem de pagamento acompanha, se usava a mesma nota (ou nenhuma)."
          : "Nota fiscal específica deste pagamento."}{" "}
        PDF, JPG, PNG ou WEBP, até 4 MB.
        {temNota ? " A nota anterior fica registrada na trilha da ordem." : ""}
      </p>
      <Input type="file" name="nota_fiscal" required accept=".pdf,.jpg,.jpeg,.png,.webp" />
      <Retorno estado={estado} />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pendente}>
          {pendente && <Loader2 className="animate-spin" />}
          Salvar nota
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setAberto(false)}>
          Fechar
        </Button>
      </div>
    </form>
  )
}
