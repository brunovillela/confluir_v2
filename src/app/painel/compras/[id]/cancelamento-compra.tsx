"use client"

import { useActionState, useState } from "react"
import { Ban, CheckCircle2, Loader2 } from "lucide-react"

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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useEnvioFormulario } from "@/hooks/use-envio-formulario"
import { ACEITA_NOTA, prepararArquivo } from "@/lib/arquivo-envio"

import { marcarCreditoUsadoAction, registrarCancelamentoCompraAction } from "./actions"

type Estado = { erro?: string; ok?: string; avisos?: string[] }

const valorBR = (v: number | null) =>
  v === null ? "" : v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/**
 * O vendedor cancelou a compra depois de feita: crédito para compras futuras
 * ou devolução do dinheiro. Tira a compra de Notas a receber.
 */
export function RegistrarCancelamentoCompra({
  processoId,
  fornecimentoId,
  valor,
  hoje,
}: {
  processoId: string
  fornecimentoId: string
  valor: number | null
  hoje: string
}) {
  const [aberto, setAberto] = useState(false)
  const [desfecho, setDesfecho] = useState<"credito" | "devolucao">("credito")
  const [arquivoErro, setArquivoErro] = useState<string | null>(null)
  const [estado, acao, pendente] = useActionState(async (prev: Estado, fd: FormData) => {
    const r = await registrarCancelamentoCompraAction(prev, fd)
    if (r.ok && !r.avisos?.length) setAberto(false)
    return r
  }, {})
  const envio = useEnvioFormulario(acao, estado)

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="h-7">
          <Ban />
          Compra cancelada pelo vendedor
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Compra cancelada pelo vendedor</DialogTitle>
          <DialogDescription>
            A nota não vai chegar: a compra sai de Notas a receber. Ordens ainda não pagas são canceladas; nas
            pagas, o comprovante do cancelamento fica como documento da despesa.
          </DialogDescription>
        </DialogHeader>
        <form action={acao} {...envio} className="grid gap-3">
          <input type="hidden" name="processo_id" value={processoId} />
          <input type="hidden" name="fornecimento_id" value={fornecimentoId} />
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">O que aconteceu com o dinheiro?</legend>
            {(
              [
                ["credito", "Virou crédito para compras futuras", "Fica em Créditos com fornecedores até ser usado."],
                ["devolucao", "Foi devolvido", "Estorno no cartão, Pix ou depósito de volta na conta."],
              ] as const
            ).map(([v, rotulo, ajuda]) => (
              <label key={v} className="hover:bg-muted/50 flex cursor-pointer items-start gap-2 rounded-md border p-2.5 text-sm">
                <input
                  type="radio"
                  name="desfecho"
                  value={v}
                  checked={desfecho === v}
                  onChange={() => setDesfecho(v)}
                  className="mt-0.5"
                />
                <span>
                  <span className="block font-medium">{rotulo}</span>
                  <span className="text-muted-foreground block text-xs">{ajuda}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor={`cc-valor-${fornecimentoId}`}>
                Valor {desfecho === "credito" ? "do crédito" : "devolvido"}
              </Label>
              <Input
                id={`cc-valor-${fornecimentoId}`}
                name="valor"
                inputMode="decimal"
                defaultValue={valorBR(valor)}
                required={desfecho === "credito"}
                placeholder="0,00"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`cc-data-${fornecimentoId}`}>Data</Label>
              <Input id={`cc-data-${fornecimentoId}`} name="data" type="date" defaultValue={hoje} max={hoje} required />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`cc-obs-${fornecimentoId}`}>Observação</Label>
            <Textarea
              id={`cc-obs-${fornecimentoId}`}
              name="obs"
              rows={2}
              placeholder={desfecho === "credito" ? "Código do vale, validade, motivo…" : "Como voltou, motivo…"}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`cc-arq-${fornecimentoId}`}>Comprovante (opcional)</Label>
            <Input
              id={`cc-arq-${fornecimentoId}`}
              name="comprovante"
              type="file"
              accept={ACEITA_NOTA}
              onChange={async (e) => {
                const { erro } = await prepararArquivo(e.currentTarget)
                setArquivoErro(erro ?? null)
              }}
            />
            <p className="text-muted-foreground text-xs">E-mail do vendedor, comprovante do estorno ou do vale-crédito.</p>
            {arquivoErro && <p className="text-destructive text-xs">{arquivoErro}</p>}
          </div>
          {estado.erro && (
            <Alert variant="destructive">
              <AlertDescription>{estado.erro}</AlertDescription>
            </Alert>
          )}
          {estado.ok && estado.avisos?.length ? (
            <Alert variant="warning">
              <AlertDescription>
                {estado.ok} Mas: {estado.avisos.join(" · ")}
              </AlertDescription>
            </Alert>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setAberto(false)}>
              Fechar
            </Button>
            <Button type="submit" disabled={pendente || !!arquivoErro}>
              {pendente ? <Loader2 className="animate-spin" /> : <Ban />}
              Registrar cancelamento
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Marca o crédito como usado, com a compra em que entrou. */
export function MarcarCreditoUsado({ processoId, fornecimentoId }: { processoId: string; fornecimentoId: string }) {
  const [aberto, setAberto] = useState(false)
  const [estado, acao, pendente] = useActionState(async (prev: Estado, fd: FormData) => {
    const r = await marcarCreditoUsadoAction(prev, fd)
    if (r.ok) setAberto(false)
    return r
  }, {})
  const envio = useEnvioFormulario(acao, estado)
  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="h-7">
          <CheckCircle2 />
          Marcar como usado
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Crédito usado</DialogTitle>
          <DialogDescription>Em que compra o crédito foi usado? Ele sai da lista de créditos em aberto.</DialogDescription>
        </DialogHeader>
        <form action={acao} {...envio} className="grid gap-3">
          <input type="hidden" name="processo_id" value={processoId} />
          <input type="hidden" name="fornecimento_id" value={fornecimentoId} />
          <Input name="obs" placeholder="Ex.: processo 2026.1120… — cadeiras" />
          {estado.erro && (
            <Alert variant="destructive">
              <AlertDescription>{estado.erro}</AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pendente}>
              {pendente && <Loader2 className="animate-spin" />}
              Marcar como usado
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
