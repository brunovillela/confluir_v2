"use client"

import { useActionState, useRef, useState } from "react"
import { Check, FileUp, Loader2, QrCode } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
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
 * fornecedor expira. Ícone com a descrição no hover; o clique abre a janela
 * com o campo do código.
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
  const [estado, acao, pendente] = useActionState(async (prev: Estado, dados: FormData) => {
    const r = await trocarCodigoPixAction(prev, dados)
    if (r.ok) setAberto(false)
    return r
  }, {})
  const descricao = "Incluir novo código Pix copia e cola (o anterior expirou)"

  return (
    <span className="inline-flex items-center gap-1">
      <Dialog open={aberto} onOpenChange={setAberto}>
        <Tooltip>
          <TooltipTrigger asChild>
            <DialogTrigger asChild>
              <Button type="button" variant="ghost" size="icon" className="size-7" aria-label={descricao}>
                <QrCode />
              </Button>
            </DialogTrigger>
          </TooltipTrigger>
          <TooltipContent>{descricao}</TooltipContent>
        </Tooltip>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo código Pix</DialogTitle>
            <DialogDescription>
              Cole o código copia e cola novo{finalAtual ? ` — o atual termina em …${finalAtual}` : ""}. O
              anterior deixa de valer nesta ordem.
            </DialogDescription>
          </DialogHeader>
          <form action={acao} className="grid gap-3">
            <input type="hidden" name="processo_id" value={processoId} />
            <input type="hidden" name="ordem_id" value={ordemId} />
            <Textarea
              name="pix_codigo"
              required
              rows={4}
              placeholder="000201…"
              className="font-mono text-xs break-all"
              autoFocus
            />
            {estado.erro && <Retorno estado={estado} />}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setAberto(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={pendente}>
                {pendente && <Loader2 className="animate-spin" />}
                Salvar código
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {!aberto && estado.ok && <Check className="text-success-fg size-4" aria-label={estado.ok} />}
    </span>
  )
}

const DESCRICAO_NOTA = {
  compra: {
    trocar: "Trocar a nota fiscal da compra (a ordem acompanha, se usava a mesma nota)",
    incluir: "Incluir a nota fiscal da compra (a ordem acompanha, se não tinha nota)",
  },
  pagamento: {
    trocar: "Trocar a nota fiscal deste pagamento (a anterior fica na trilha da ordem)",
    incluir: "Incluir a nota fiscal específica deste pagamento",
  },
}

/**
 * Incluir ou trocar a nota fiscal — da COMPRA (fornecimento) ou do
 * PAGAMENTO (a ordem) — em forma de ícone: a descrição aparece no hover e o
 * clique abre o seletor de arquivo; escolhido, sobe na hora. A nota costuma
 * chegar depois; vale mesmo com a ordem paga.
 */
export function NotaFiscalIcone({
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
  const [estado, acao, pendente] = useActionState(trocarNotaFiscalAction, {})
  const formRef = useRef<HTMLFormElement>(null)
  const arquivoRef = useRef<HTMLInputElement>(null)
  const descricao = DESCRICAO_NOTA[alvo][temNota ? "trocar" : "incluir"]

  return (
    <form ref={formRef} action={acao} className="inline-flex items-center gap-1">
      <input type="hidden" name="processo_id" value={processoId} />
      <input type="hidden" name="alvo" value={alvo} />
      <input type="hidden" name="id" value={id} />
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
