"use client"

import { startTransition, useActionState, useRef, useState } from "react"
import { FilePlus2, FileUp, Loader2, Paperclip } from "lucide-react"

import { ConfirmacaoAuditoria } from "@/components/confirmacao-auditoria"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import { ACEITA_NOTA, prepararArquivo } from "../../../compras/nova/arquivo-envio"
import {
  receberDocumentoCusteioAction,
  registrarExtraordinarioAction,
  salvarFormalizacaoAction,
} from "../actions"

/** Anexa ou troca o documento que formaliza o custeio. */
export function FormalizacaoForm({ custeioId, url }: { custeioId: string; url: string | null }) {
  const [estado, acao, pendente] = useActionState(salvarFormalizacaoAction, {})
  const [erroArquivo, setErroArquivo] = useState<string | null>(null)
  return (
    <div className="grid gap-3">
      {url ? (
        <a href={url} target="_blank" rel="noopener noreferrer" className="text-primary inline-flex items-center gap-1 text-sm hover:underline">
          <Paperclip className="size-4" />
          Abrir a formalização
        </a>
      ) : (
        <p className="text-muted-foreground text-sm">Nenhum documento de formalização anexado.</p>
      )}
      <form action={acao} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="custeio_id" value={custeioId} />
        <Input
          name="formalizacao"
          type="file"
          required
          accept={ACEITA_NOTA}
          aria-label="Arquivo da formalização"
          className="max-w-72"
          onChange={async (e) => {
            const { erro } = await prepararArquivo(e.currentTarget)
            setErroArquivo(erro ?? null)
          }}
        />
        <Button type="submit" size="sm" variant="outline" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <FileUp />}
          {url ? "Trocar" : "Anexar"}
        </Button>
      </form>
      {(erroArquivo ?? estado.erro) && <p className="text-destructive text-xs">{erroArquivo ?? estado.erro}</p>}
    </div>
  )
}

/** Pagamento fora das parcelas: nasce Em autorização (autorização pontual). */
export function ExtraordinarioForm({ custeioId, boleto }: { custeioId: string; boleto: boolean }) {
  const [aberto, setAberto] = useState(false)
  const [estado, acao, pendente] = useActionState(registrarExtraordinarioAction, {})
  if (!aberto) {
    return (
      <Button variant="outline" size="sm" onClick={() => setAberto(true)}>
        <FilePlus2 />
        Pagamento extraordinário
      </Button>
    )
  }
  return (
    <form action={acao} className="grid gap-3 rounded-md border p-3">
      <input type="hidden" name="custeio_id" value={custeioId} />
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="grid gap-1.5">
          <Label htmlFor="ex_valor">Valor (R$) *</Label>
          <Input id="ex_valor" name="valor" inputMode="decimal" required placeholder="0,00" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="ex_venc">Vencimento</Label>
          <Input id="ex_venc" name="vencimento" type="date" />
        </div>
        {boleto && (
          <div className="grid gap-1.5">
            <Label htmlFor="ex_boleto">Boleto (PDF ou foto) *</Label>
            <Input id="ex_boleto" name="boleto_arquivo" type="file" required accept={ACEITA_NOTA} />
          </div>
        )}
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="ex_desc">Motivo *</Label>
        <Input id="ex_desc" name="descricao" required placeholder="Ex.: táxi extra no retorno do evento" />
      </div>
      <p className="text-muted-foreground text-xs">
        Fora das parcelas autorizadas: a ordem nasce Em autorização e precisa da alçada e da permissão de
        autorizar custeio.
      </p>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pendente}>
          {pendente && <Loader2 className="animate-spin" />}
          Registrar pagamento
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setAberto(false)}>
          Cancelar
        </Button>
      </div>
    </form>
  )
}

/** Documento fiscal (nota, cupom, recibo) de uma parcela que o aguarda. */
export function ReceberDocumentoCusteioForm({
  custeioId,
  ordemId,
  valor,
}: {
  custeioId: string
  ordemId: string
  valor: number | null
}) {
  const [estado, acao, pendente] = useActionState(receberDocumentoCusteioAction, {})
  const formRef = useRef<HTMLFormElement>(null)
  const [erroArquivo, setErroArquivo] = useState<string | null>(null)
  if (estado.ok) return <p className="text-success-fg text-xs">{estado.ok}</p>
  return (
    <form
      ref={formRef}
      onSubmit={(e) => {
        e.preventDefault()
        const dados = new FormData(e.currentTarget)
        startTransition(() => acao(dados))
      }}
      className="flex flex-wrap items-center gap-2"
    >
      <ConfirmacaoAuditoria estado={estado} formRef={formRef} pendente={pendente} />
      <input type="hidden" name="custeio_id" value={custeioId} />
      <input type="hidden" name="ordem_id" value={ordemId} />
      <Input
        name="nota"
        type="file"
        required
        accept={ACEITA_NOTA}
        aria-label="Documento fiscal"
        className="h-8 max-w-56 text-xs"
        onChange={async (e) => {
          const { erro } = await prepararArquivo(e.currentTarget)
          setErroArquivo(erro ?? null)
        }}
      />
      <Input
        name="valor"
        inputMode="decimal"
        defaultValue={valor == null ? "" : valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        aria-label="Valor do documento"
        title="Valor do documento — altere se veio diferente da parcela"
        className="h-8 w-28 text-right text-xs tabular-nums"
      />
      <Button type="submit" size="sm" disabled={pendente} className="h-8">
        {pendente ? <Loader2 className="animate-spin" /> : <FileUp />}
        Enviar
      </Button>
      {(erroArquivo ?? estado.erro) && (
        <span className="text-destructive basis-full text-xs">{erroArquivo ?? estado.erro}</span>
      )}
    </form>
  )
}
