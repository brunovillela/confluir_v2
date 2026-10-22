"use client"

import { startTransition, useActionState, useCallback, useRef, useState } from "react"
import { FileUp, Loader2, Paperclip, Receipt } from "lucide-react"

import { ConfirmacaoAuditoria } from "@/components/confirmacao-auditoria"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import { ACEITA_NOTA, prepararArquivo } from "@/lib/arquivo-envio"
import { FORMAS_ORDEM_CONTRATO, ROTULO_FORMA_CONTRATO } from "@/lib/compras-constantes"
import { PERIODICIDADES, type Periodicidade } from "@/lib/custeio-constantes"
import { DetalhePagamento, type CaixaOpcao } from "@/app/painel/compras/nova/detalhe-pagamento"
import {
  gerarOrdensCusteioAction,
  meiosDoCusteioAction,
  receberDocumentoCusteioAction,
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

/** Valor NUMERIC → texto pt-BR editável (sem símbolo). */
function valorParaTexto(valor: number | null): string {
  if (valor == null) return ""
  return valor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const SELECT =
  "border-input bg-background text-foreground h-9 w-full truncate rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

/** A forma já validada no custeio — pré-preenche o formulário de novas ordens. */
export type PadraoPagamentoCusteio = {
  forma: string | null
  escolha?: string
  caixaContaId?: string
  pixCodigo?: string
}

/**
 * Novas ordens de um custeio autorizado, como o "Gerar ordens" do contrato.
 * A forma vem preenchida com a do custeio e pode mudar só para estas ordens.
 */
export function GerarOrdensCusteioForm({
  custeioId,
  valorPadrao,
  primeiroSugerido,
  caixas,
  padrao,
  podeAutorizar,
}: {
  custeioId: string
  valorPadrao: number | null
  primeiroSugerido: string
  caixas: CaixaOpcao[]
  padrao: PadraoPagamentoCusteio
  podeAutorizar: boolean
}) {
  const [estado, formAction, pendente] = useActionState(gerarOrdensCusteioAction, {})
  const formRef = useRef<HTMLFormElement>(null)
  const [periodicidade, setPeriodicidade] = useState<Periodicidade>("mensal")
  const [quantidade, setQuantidade] = useState("1")
  const formaInicial = padrao.forma && (FORMAS_ORDEM_CONTRATO as readonly string[]).includes(padrao.forma) ? padrao.forma : ""
  const [forma, setForma] = useState(formaInicial)
  const buscarMeios = useCallback(() => meiosDoCusteioAction(custeioId), [custeioId])

  return (
    <form
      ref={formRef}
      // Pelo onSubmit: a análise da auditoria pode devolver o formulário para
      // ajuste (boletos inclusive), e com `action=` o React o limparia.
      onSubmit={(e) => {
        e.preventDefault()
        const dados = new FormData(e.currentTarget)
        startTransition(() => formAction(dados))
      }}
      className="grid gap-4"
    >
      <input type="hidden" name="custeio_id" value={custeioId} />
      <ConfirmacaoAuditoria estado={estado} formRef={formRef} pendente={pendente} />
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="grid gap-1.5">
          <Label htmlFor="gc_periodicidade">Periodicidade</Label>
          <select
            id="gc_periodicidade"
            name="periodicidade"
            className={SELECT}
            value={periodicidade}
            onChange={(e) => setPeriodicidade(e.target.value as Periodicidade)}
          >
            {PERIODICIDADES.map((p) => (
              <option key={p.chave} value={p.chave}>
                {p.rotulo}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="gc_valor">Valor por ordem *</Label>
          <Input id="gc_valor" name="valor_parcela" inputMode="decimal" required placeholder="0,00" defaultValue={valorParaTexto(valorPadrao)} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="gc_venc">{periodicidade === "unica" ? "Vencimento *" : "Primeiro vencimento *"}</Label>
          <Input id="gc_venc" name="primeiro_vencimento" type="date" required defaultValue={primeiroSugerido} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="gc_qtd">Quantidade</Label>
          <Input
            id="gc_qtd"
            name="quantidade"
            type="number"
            min={1}
            max={120}
            value={periodicidade === "unica" ? "1" : quantidade}
            disabled={periodicidade === "unica"}
            onChange={(e) => setQuantidade(e.target.value)}
          />
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="gc_motivo">Motivo *</Label>
        <Input id="gc_motivo" name="motivo" required placeholder="Ex.: prorrogação da missão por mais dois meses" />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="grid gap-1.5">
          <Label htmlFor="gc_forma">Forma de pagamento *</Label>
          <select id="gc_forma" name="forma_pagamento" required value={forma} onChange={(e) => setForma(e.target.value)} className={SELECT}>
            <option value="" disabled>
              Escolha a forma
            </option>
            {FORMAS_ORDEM_CONTRATO.map((f) => (
              <option key={f} value={f}>
                {ROTULO_FORMA_CONTRATO[f]}
              </option>
            ))}
          </select>
          {formaInicial && forma !== formaInicial && (
            <p className="text-muted-foreground text-xs">
              Diferente da forma do custeio: vale só para estas ordens.
            </p>
          )}
        </div>
        {forma && (
          <DetalhePagamento
            key={forma}
            forma={forma}
            fornecedorId={custeioId}
            cartoes={[]}
            caixas={caixas}
            buscarMeios={buscarMeios}
            futuro
            favorecido="beneficiário"
            boletosEsperados={periodicidade === "unica" ? 1 : Math.max(1, Number(quantidade) || 1)}
            padrao={forma === formaInicial ? padrao : undefined}
          />
        )}
      </div>

      <p className="text-muted-foreground text-xs">
        {podeAutorizar && periodicidade !== "unica" ? (
          <>
            Como você pode autorizar custeios, as parcelas <strong>recorrentes</strong> nascem autorizadas, como
            as originais, e esperam só o documento fiscal.
          </>
        ) : (
          <>
            As novas ordens estendem o que foi autorizado: nascem <strong>Em autorização</strong> e passam pela
            alçada do Financeiro.
          </>
        )}{" "}
        Vencimentos que já têm ordem deste custeio são pulados — dá para rodar de novo sem duplicar.
      </p>

      <div>
        <Button type="submit" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Receipt />}
          Gerar ordens
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
        compacto
        className="max-w-56"
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
