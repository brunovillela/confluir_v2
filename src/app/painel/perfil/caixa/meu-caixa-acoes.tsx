"use client"

import { useActionState, useEffect, useState, useTransition } from "react"
import Link from "next/link"
import { Check, CircleAlert, HandCoins, Link2, Loader2, Search } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import type { OcorrenciaCaixa } from "@/lib/db/caixa"
import type { OrdemVinculavel } from "@/lib/db/caixa-vincular"
import { formatarData, formatarDataHora, formatarMoeda } from "@/lib/formato"
import { cn } from "@/lib/utils"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import {
  buscarOrdensCaixa,
  confirmarAporte,
  prestarContas,
  relatarPerda,
  vincularOrdemCaixa,
} from "./actions"
import { confirmarEnvio } from "@/components/ui/confirmacao"

export function ConfirmarAporte({
  movimentacaoId,
  valor,
}: {
  movimentacaoId: string
  valor: string
}) {
  const [estado, formAction, pendente] = useActionState(confirmarAporte, {})
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        confirmarEnvio(e, `Confirmar que você recebeu ${valor} em espécie? A verba fica liberada e a conta abre.`)
      }}
      className="flex flex-wrap items-center gap-2"
    >
      <input type="hidden" name="movimentacao_id" value={movimentacaoId} />
      {estado.erro && (
        <span className="text-destructive text-xs">{estado.erro}</span>
      )}
      <Button type="submit" size="sm" disabled={pendente}>
        {pendente ? <Loader2 className="animate-spin" /> : <Check />}
        Confirmar recebimento de {valor}
      </Button>
    </form>
  )
}

/** `bloqueio`: despesas sem reconhecimento resolvido — a prestação espera. */
export function PrestarContas({ bloqueio = null }: { bloqueio?: string | null }) {
  const [estado, formAction, pendente] = useActionState(prestarContas, {})
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        confirmarEnvio(e, "Prestar contas agora? A conta fica travada para novas compras até a decisão do Financeiro.")
      }}
      className="grid gap-3"
    >
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      {bloqueio && !estado.erro && (
        <Alert variant="warning">
          <AlertDescription>
            {bloqueio}{" "}
            <Link href="/painel/perfil/despesas-caixa" className="underline underline-offset-2">
              Abrir
            </Link>
          </AlertDescription>
        </Alert>
      )}
      <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
        <div className="grid gap-1.5">
          <Label htmlFor="saldo_declarado">Dinheiro em mãos</Label>
          <Input
            id="saldo_declarado"
            name="saldo_declarado"
            inputMode="decimal"
            placeholder="0,00"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="observacao-prestacao">Observações</Label>
          <Input
            id="observacao-prestacao"
            name="observacao"
            placeholder="Notas fiscais entregues ao financeiro…"
          />
        </div>
      </div>
      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={pendente || Boolean(bloqueio)}>
          {pendente ? <Loader2 className="animate-spin" /> : <HandCoins />}
          Prestar contas
        </Button>
      </div>
    </form>
  )
}

export function RelatarPerda() {
  const [estado, formAction, pendente] = useActionState(relatarPerda, {})
  return (
    <form action={formAction} className="grid gap-3">
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <div className="grid gap-1.5">
        <Label htmlFor="descricao-perda">O que aconteceu *</Label>
        <textarea
          id="descricao-perda"
          name="descricao"
          required
          rows={3}
          className="border-input placeholder:text-muted-foreground w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs outline-none"
          placeholder="Descreva a perda, extravio ou diferença encontrada…"
        />
      </div>
      <div className="grid gap-1.5 sm:max-w-48">
        <Label htmlFor="valor-perda">Valor envolvido</Label>
        <Input
          id="valor-perda"
          name="valor"
          inputMode="decimal"
          placeholder="0,00"
        />
      </div>
      <p className="text-muted-foreground text-xs">
        O relato abre uma ocorrência para investigação do Financeiro — o
        saldo só é ajustado depois da apuração.
      </p>
      <div className="flex justify-end">
        <Button type="submit" size="sm" variant="outline" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <CircleAlert />}
          Relatar problema
        </Button>
      </div>
    </form>
  )
}

/**
 * Vincular ordem de pagamento (substitui o "Registrar compra"): busca por
 * beneficiário ou código, escolhe a ordem e liga ao caixa — a forma vira
 * Dinheiro, com este caixa.
 */
export function VincularOrdem() {
  const [termo, setTermo] = useState("")
  const [ordens, setOrdens] = useState<OrdemVinculavel[]>([])
  const [buscou, setBuscou] = useState(false)
  const [erroBusca, setErroBusca] = useState<string | null>(null)
  const [escolhida, setEscolhida] = useState<OrdemVinculavel | null>(null)
  const [buscando, buscar] = useTransition()
  const [estado, formAction, pendente] = useActionState(vincularOrdemCaixa, {})

  // Busca com espera curta depois da digitação.
  useEffect(() => {
    const t = termo.trim()
    if (t.length < 2) return
    const timer = setTimeout(() => {
      buscar(async () => {
        const r = await buscarOrdensCaixa(t)
        setErroBusca(r.erro ?? null)
        setOrdens(r.ordens)
        setBuscou(true)
        setEscolhida((atual) => (atual && r.ordens.some((o) => o.id === atual.id) ? atual : null))
      })
    }, 350)
    return () => clearTimeout(timer)
  }, [termo])

  const curto = termo.trim().length < 2
  const lista = curto ? [] : ordens

  return (
    <div className="grid gap-3">
      <div className="grid gap-1.5">
        <Label htmlFor="busca-ordem">Beneficiário ou código da ordem</Label>
        <div className="relative">
          <Search className="text-muted-foreground absolute top-2.5 left-2.5 size-4" />
          <Input
            id="busca-ordem"
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            placeholder="Ex.: Atacadão, 2026.0923.1001…"
            className="pl-8"
            autoComplete="off"
          />
          {buscando && <Loader2 className="text-muted-foreground absolute top-2.5 right-2.5 size-4 animate-spin" />}
        </div>
        <p className="text-muted-foreground text-xs">
          Aparecem ordens autorizadas (A pagar, Processando) ou pagas que ainda não estão em nenhum caixa.
        </p>
      </div>

      {erroBusca && (
        <Alert variant="destructive">
          <AlertDescription>{erroBusca}</AlertDescription>
        </Alert>
      )}
      {!curto && buscou && !buscando && lista.length === 0 && !erroBusca && (
        <p className="text-muted-foreground text-sm">Nenhuma ordem encontrada para “{termo.trim()}”.</p>
      )}
      {lista.length > 0 && (
        <ul className="grid max-h-72 gap-1.5 overflow-y-auto">
          {lista.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                onClick={() => setEscolhida(o)}
                className={cn(
                  "hover:bg-muted/50 grid w-full gap-0.5 rounded-lg border px-3 py-2 text-left text-sm",
                  escolhida?.id === o.id && "border-primary bg-primary/5"
                )}
              >
                <span className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{o.beneficiario ?? "Sem beneficiário"}</span>
                  <span className="tabular-nums">{formatarMoeda(o.valor)}</span>
                </span>
                <span className="text-muted-foreground text-xs">
                  {o.codigo ?? "—"} · {o.situacao}
                  {o.forma ? ` · ${o.forma}` : ""}
                  {o.data ? ` · ${formatarData(o.data)}` : ""}
                </span>
                {o.descricao && <span className="text-muted-foreground truncate text-xs">{o.descricao}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}

      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <form
        action={formAction}
        onSubmit={(e) =>
          confirmarEnvio(
            e,
            escolhida
              ? `Vincular a ordem ${escolhida.codigo ?? ""} (${formatarMoeda(escolhida.valor)}) ao seu caixa? A forma de pagamento passa a Dinheiro, com este caixa${escolhida.situacao === "Paga" ? "" : ", e a ordem fica Paga"}, e o valor sai do saldo.`
              : "Escolha uma ordem."
          )
        }
        className="flex justify-end"
      >
        <input type="hidden" name="ordem_id" value={escolhida?.id ?? ""} />
        <Button type="submit" size="sm" disabled={!escolhida || pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Link2 />}
          Vincular ao meu caixa
        </Button>
      </form>
    </div>
  )
}

function ListaOcorrencias({ ocorrencias }: { ocorrencias: OcorrenciaCaixa[] }) {
  if (ocorrencias.length === 0) return null
  return (
    <ul className="grid gap-2 border-t pt-3">
      {ocorrencias.map((o) => (
        <li
          key={o.id}
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
        >
          <span className="min-w-0">
            <span className="block truncate">{o.descricao}</span>
            <span className="text-muted-foreground block text-xs">
              {formatarDataHora(o.created_at)}
              {o.resolucao && <> · {o.resolucao}</>}
            </span>
          </span>
          <Badge
            variant="outline"
            className={
              o.situacao === "resolvida"
                ? "border-success/40 text-success-fg"
                : o.situacao === "em_investigacao"
                  ? "border-warning/40 text-warning-fg"
                  : "text-destructive border-destructive/40"
            }
          >
            {o.situacao === "resolvida" ? "Resolvida" : o.situacao === "em_investigacao" ? "Em investigação" : "Aberta"}
          </Badge>
        </li>
      ))}
    </ul>
  )
}

/**
 * Botões do topo de Meu caixa: Vincular ordem de pagamento, Prestar contas e
 * Relatar problema — cada um abre o seu formulário numa janela.
 */
export function AcoesDoCaixa({
  contaAberta,
  bloqueio,
  ocorrencias,
}: {
  contaAberta: boolean
  bloqueio: string | null
  ocorrencias: OcorrenciaCaixa[]
}) {
  const abertas = ocorrencias.filter((o) => o.situacao !== "resolvida").length
  const dica = contaAberta ? undefined : "A conta precisa estar aberta"
  return (
    <div className="flex flex-wrap gap-2">
      <Dialog>
        <DialogTrigger asChild>
          <Button size="sm" disabled={!contaAberta} title={dica}>
            <Link2 />
            Vincular ordem de pagamento
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Vincular ordem de pagamento</DialogTitle>
            <DialogDescription>
              Ligue ao seu caixa a ordem que você pagou em dinheiro: a forma de pagamento passa a Dinheiro, com este
              caixa, e o valor sai do saldo.
            </DialogDescription>
          </DialogHeader>
          <VincularOrdem />
        </DialogContent>
      </Dialog>

      <Dialog>
        <DialogTrigger asChild>
          <Button size="sm" variant="outline" disabled={!contaAberta} title={dica}>
            <HandCoins />
            Prestar contas
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Prestar contas</DialogTitle>
            <DialogDescription>Fecha o ciclo: o Financeiro confere o dinheiro e as despesas.</DialogDescription>
          </DialogHeader>
          <PrestarContas bloqueio={bloqueio} />
        </DialogContent>
      </Dialog>

      <Dialog>
        <DialogTrigger asChild>
          <Button size="sm" variant="outline">
            <CircleAlert />
            Relatar problema
            {abertas > 0 && (
              <Badge variant="outline" className="text-destructive border-destructive/40 ml-1 tabular-nums">
                {abertas}
              </Badge>
            )}
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Relatar problema com dinheiro</DialogTitle>
            <DialogDescription>Perda, extravio ou diferença — abre investigação do Financeiro.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <RelatarPerda />
            <ListaOcorrencias ocorrencias={ocorrencias} />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
