"use client"

import { startTransition, useActionState, useMemo, useState } from "react"
import { BedDouble, Loader2, Send } from "lucide-react"

import { EmpresaCombobox, type EmpresaOpcao } from "@/components/empresa-combobox"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { IconePassagem } from "@/components/viagens"
import { formatarMoeda } from "@/lib/formato"

import { registrarFaturaAction } from "../actions"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

export type ItemParaFatura = {
  itemId: string
  viagemNumero: number | null
  beneficiarioNome: string
  tipo: "passagem" | "hospedagem"
  modal: "aerea" | "rodoviaria" | null
  descricao: string
  fornecedorId: string | null
  localizador: string | null
  valor: number | null
  contaSugerida: string | null
  departamentoNome: string | null
}

export type ContaOpcao = { id: string; nome: string; classificador: string | null; grupo: string }

function lerValor(s: string): number {
  const limpo = s.replace(/\s|R\$/g, "")
  if (!limpo) return 0
  const n = Number(limpo.includes(",") ? limpo.replace(/\./g, "").replace(",", ".") : limpo)
  return Number.isFinite(n) ? n : 0
}

const paraCampo = (v: number | null) => (v === null ? "" : v.toFixed(2).replace(".", ","))

/**
 * Lançar a fatura da agência. Os itens da agência escolhida (e os reservados
 * sem agência informada) aparecem para marcar; cada linha traz o valor da
 * reserva e a conta do de-para, os dois editáveis.
 */
export function FaturaForm({
  fornecedores,
  itens,
  contas,
  departamentos,
  formas,
}: {
  fornecedores: EmpresaOpcao[]
  itens: ItemParaFatura[]
  contas: ContaOpcao[]
  departamentos: { id: string; nome: string }[]
  formas: readonly string[]
}) {
  const [estado, formAction, pendente] = useActionState(registrarFaturaAction, {})
  const [fornecedorId, setFornecedorId] = useState<string | null>(null)
  const [marcados, setMarcados] = useState<Set<string>>(new Set())
  const [valores, setValores] = useState<Record<string, string>>(() =>
    Object.fromEntries(itens.map((i) => [i.itemId, paraCampo(i.valor)]))
  )
  const [taxas, setTaxas] = useState("")

  const visiveis = useMemo(
    () => itens.filter((i) => fornecedorId && (i.fornecedorId === fornecedorId || !i.fornecedorId)),
    [itens, fornecedorId]
  )
  const grupos = useMemo(
    () => [...new Set(contas.map((c) => c.grupo))].sort((a, b) => a.localeCompare(b, "pt-BR")),
    [contas]
  )
  const soma = visiveis
    .filter((i) => marcados.has(i.itemId))
    .reduce((s, i) => s + lerValor(valores[i.itemId] ?? ""), 0)
  const total = soma + lerValor(taxas)

  const alternar = (id: string) =>
    setMarcados((atual) => {
      const novo = new Set(atual)
      if (novo.has(id)) novo.delete(id)
      else novo.add(id)
      return novo
    })

  return (
    <form
      // Pelo onSubmit: o React 19 limpa o formulário depois de uma action, e
      // um erro apagaria número, datas e o PDF escolhido.
      onSubmit={(e) => {
        e.preventDefault()
        const dados = new FormData(e.currentTarget)
        startTransition(() => formAction(dados))
      }}
      className="grid gap-6"
    >
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="grid gap-1.5 sm:col-span-2">
          <Label>Agência ou operadora *</Label>
          <EmpresaCombobox
            empresas={fornecedores}
            name="fornecedor_id"
            onChange={(id) => {
              setFornecedorId(id)
              setMarcados(new Set())
            }}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="numero">Número da fatura *</Label>
          <Input id="numero" name="numero" required />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="arquivo">PDF da fatura *</Label>
          <Input id="arquivo" name="arquivo" type="file" accept="application/pdf" required />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="emissao">Emissão *</Label>
          <Input id="emissao" name="emissao" type="date" required />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="vencimento">Vencimento (pagar em)</Label>
          <Input id="vencimento" name="vencimento" type="date" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="forma_pagamento">Forma de pagamento</Label>
          <select id="forma_pagamento" name="forma_pagamento" defaultValue="Boleto" className={SELECT}>
            {formas.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="departamento_id">Departamento da compra</Label>
          <select id="departamento_id" name="departamento_id" defaultValue="" className={SELECT}>
            <option value="">O dos itens (automático)</option>
            {departamentos.map((d) => (
              <option key={d.id} value={d.id}>
                {d.nome}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-2">
        <p className="text-sm font-semibold">Itens que a fatura cobra</p>
        {!fornecedorId ? (
          <p className="text-muted-foreground rounded-md border border-dashed p-4 text-sm">
            Escolha a agência para ver os itens reservados com ela.
          </p>
        ) : visiveis.length === 0 ? (
          <p className="text-muted-foreground rounded-md border border-dashed p-4 text-sm">
            Nenhum item reservado com esta agência aguarda fatura.
          </p>
        ) : (
          <div className="grid gap-2">
            {visiveis.map((i) => {
              const marcado = marcados.has(i.itemId)
              return (
                <div
                  key={i.itemId}
                  className={`grid gap-3 rounded-lg border p-3 text-sm lg:grid-cols-[auto_1fr_9rem_18rem] lg:items-center ${marcado ? "border-primary/50 bg-primary/5" : ""}`}
                >
                  <input
                    type="checkbox"
                    name={`item_${i.itemId}`}
                    checked={marcado}
                    onChange={() => alternar(i.itemId)}
                    aria-label={`Incluir o item da viagem nº ${i.viagemNumero ?? ""}`}
                    className="size-4"
                  />
                  <div className="min-w-0">
                    <p className="flex items-center gap-1.5 font-medium">
                      {i.tipo === "passagem" ? (
                        <IconePassagem modal={i.modal} className="text-muted-foreground size-3.5 shrink-0" />
                      ) : (
                        <BedDouble className="text-muted-foreground size-3.5 shrink-0" />
                      )}
                      {i.descricao}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      Viagem nº {i.viagemNumero ?? "—"} · {i.beneficiarioNome}
                      {i.localizador ? ` · loc. ${i.localizador}` : ""}
                      {i.departamentoNome ? ` · ${i.departamentoNome}` : ""}
                      {!i.fornecedorId ? " · reserva sem agência informada" : ""}
                    </p>
                  </div>
                  <Input
                    name={`valor_${i.itemId}`}
                    inputMode="decimal"
                    placeholder="0,00"
                    aria-label="Valor na fatura"
                    value={valores[i.itemId] ?? ""}
                    disabled={!marcado}
                    onChange={(e) => setValores((v) => ({ ...v, [i.itemId]: e.target.value }))}
                  />
                  <select
                    name={`conta_${i.itemId}`}
                    aria-label="Conta contábil"
                    defaultValue={i.contaSugerida ?? ""}
                    disabled={!marcado}
                    className={`${SELECT} ${marcado && !i.contaSugerida ? "border-warning" : ""}`}
                  >
                    <option value="">
                      {i.contaSugerida ? "Escolha a conta" : "Sem conta no de-para — escolha"}
                    </option>
                    {grupos.map((g) => (
                      <optgroup key={g} label={g}>
                        {contas
                          .filter((c) => c.grupo === g)
                          .map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.classificador ? `${c.classificador} — ` : ""}
                              {c.nome}
                            </option>
                          ))}
                      </optgroup>
                    ))}
                  </select>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="taxas">Taxa da agência (R$)</Label>
          <Input
            id="taxas"
            name="taxas"
            inputMode="decimal"
            placeholder="0,00"
            value={taxas}
            onChange={(e) => setTaxas(e.target.value)}
          />
          <p className="text-muted-foreground text-xs">
            Taxa de emissão ou de serviço. É rateada na proporção dos itens.
          </p>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="observacao">Observação</Label>
          <Textarea id="observacao" name="observacao" rows={2} />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <p className="text-sm">
          {marcados.size} {marcados.size === 1 ? "item" : "itens"} ·{" "}
          <strong className="text-base">{formatarMoeda(total)}</strong>
          {lerValor(taxas) > 0 && (
            <span className="text-muted-foreground"> (itens {formatarMoeda(soma)} + taxa)</span>
          )}
        </p>
        <Button type="submit" disabled={pendente || marcados.size === 0}>
          {pendente ? <Loader2 className="animate-spin" /> : <Send />}
          Lançar e enviar para pagamento
        </Button>
      </div>
      <p className="text-muted-foreground -mt-3 text-xs">
        Gera uma aquisição direta em Compras e a ordem de pagamento, que passa pela avaliação por
        alçada antes do financeiro pagar.
      </p>
    </form>
  )
}
