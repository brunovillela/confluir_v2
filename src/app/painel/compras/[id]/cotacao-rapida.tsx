"use client"

import { useActionState, useMemo, useState } from "react"
import { Loader2, Plus, Trash2, Zap } from "lucide-react"

import { EmpresaCombobox, type EmpresaOpcao } from "@/components/empresa-combobox"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { confirmarEnvio } from "@/components/ui/confirmacao"
import { useEnvioFormulario } from "@/hooks/use-envio-formulario"
import { LIMITE_ENVIO, prepararArquivo } from "@/lib/arquivo-envio"
import { FORMAS_PAGAMENTO_COMPRAS, hojeLocalISO } from "@/lib/compras-constantes"
import { parseValorBR } from "@/lib/valores"

import { cotacaoRapidaAction } from "./actions"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full truncate rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

const MAX_LINHAS = 6

function moeda(v: number): string {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

/**
 * Cotação rápida (16/11/2026): quem já consultou os fornecedores registra as
 * propostas, marca a escolhida e efetiva a compra num envio só. Uma proposta
 * só acima do limite da auditoria pede a justificativa.
 */
export function CotacaoRapidaForm({
  processoId,
  fornecedores,
  regra,
}: {
  processoId: string
  fornecedores: EmpresaOpcao[]
  /** Regra "Compra com uma só proposta" da auditoria. */
  regra: { ativa: boolean; limite: number }
}) {
  const [estado, formAction, pendente] = useActionState(cotacaoRapidaAction, {})
  const [linhas, setLinhas] = useState<number[]>([0])
  const [proxima, setProxima] = useState(1)
  const [escolhida, setEscolhida] = useState("0")
  const [valores, setValores] = useState<Record<number, string>>({})
  const [forns, setForns] = useState<Record<number, string | null>>({})
  const [erroArquivo, setErroArquivo] = useState<string | null>(null)

  const valorEscolhida = parseValorBR(valores[Number(escolhida)] ?? "") ?? 0
  const preenchidas = linhas.filter((i) => (valores[i] ?? "").trim()).length
  // O mesmo fornecedor pode mandar mais de uma proposta, mas conta como uma cotação só.
  const cotaram = new Set(
    linhas.filter((i) => (valores[i] ?? "").trim()).map((i) => forns[i] ?? `linha-${i}`)
  ).size
  const repetido = preenchidas > cotaram
  const pedeJustificativa = regra.ativa && cotaram <= 1 && valorEscolhida > regra.limite

  const envio = useEnvioFormulario(formAction, estado, {
    antes: (e) => {
      // O envio inteiro tem teto de 4 MB: soma os PDFs antes de mandar.
      const form = e.currentTarget as HTMLFormElement
      let total = 0
      for (const el of Array.from(form.querySelectorAll<HTMLInputElement>('input[type="file"]'))) {
        total += el.files?.[0]?.size ?? 0
      }
      if (total > LIMITE_ENVIO) {
        e.preventDefault()
        setErroArquivo("Os PDFs juntos passam de 3,8 MB. Anexe menos arquivos (os outros podem ir depois, na proposta).")
        return
      }
      setErroArquivo(null)
      confirmarEnvio(
        e,
        `Registrar ${preenchidas || 1} proposta(s) e efetivar a compra de ${moeda(valorEscolhida)}?`
      )
    },
  })

  const indiceDe = useMemo(() => new Map(linhas.map((id, pos) => [id, pos])), [linhas])

  return (
    <form action={formAction} {...envio} className="grid gap-4">
      <div className="flex items-start gap-2">
        <Zap className="text-primary mt-0.5 size-4 shrink-0" />
        <div>
          <p className="text-sm font-medium">Cotação rápida</p>
          <p className="text-muted-foreground text-xs">
            Já consultou os fornecedores? Registre as propostas, marque a escolhida e efetive a compra de uma vez. Para
            dividir a compra entre fornecedores, use Iniciar cotação.
          </p>
        </div>
      </div>
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <input type="hidden" name="processo_id" value={processoId} />
      <input type="hidden" name="linhas" value={proxima} />

      <div className="grid gap-3">
        {linhas.map((id) => (
          <fieldset
            key={id}
            className={`grid gap-3 rounded-md border p-3 ${escolhida === String(id) ? "border-success/50 bg-success/5" : "border-border"}`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <legend className="text-sm font-medium">Proposta {(indiceDe.get(id) ?? 0) + 1}</legend>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="escolhida"
                    value={String(id)}
                    checked={escolhida === String(id)}
                    onChange={() => setEscolhida(String(id))}
                    className="accent-primary size-4"
                  />
                  Escolhida
                </label>
                {linhas.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Remover proposta"
                    onClick={() => {
                      setLinhas((l) => l.filter((x) => x !== id))
                      if (escolhida === String(id)) setEscolhida(String(linhas.find((x) => x !== id) ?? 0))
                    }}
                  >
                    <Trash2 />
                  </Button>
                )}
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_9rem_10rem]">
              <div className="grid gap-1.5">
                <Label>Fornecedor *</Label>
                <EmpresaCombobox
                  empresas={fornecedores}
                  name={`fornecedor_id_${id}`}
                  onChange={(v) => setForns((f) => ({ ...f, [id]: v }))}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`rap-valor-${id}`}>Valor *</Label>
                <Input
                  id={`rap-valor-${id}`}
                  name={`valor_${id}`}
                  inputMode="decimal"
                  placeholder="0,00"
                  value={valores[id] ?? ""}
                  onChange={(e) => setValores((v) => ({ ...v, [id]: e.target.value }))}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`rap-prev-${id}`}>Previsão de entrega</Label>
                <Input id={`rap-prev-${id}`} name={`previsao_entrega_${id}`} type="date" />
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor={`rap-forma-${id}`}>Forma de pagamento</Label>
                <select id={`rap-forma-${id}`} name={`forma_pagamento_${id}`} className={SELECT} defaultValue="">
                  <option value="">Não informada</option>
                  {FORMAS_PAGAMENTO_COMPRAS.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`rap-arq-${id}`}>Proposta (PDF, opcional)</Label>
                <Input
                  id={`rap-arq-${id}`}
                  name={`arquivo_${id}`}
                  type="file"
                  accept="application/pdf"
                  compacto
                  limite="até 3,8 MB no total"
                  onChange={async (e) => {
                    const { erro } = await prepararArquivo(e.currentTarget, {
                      aceita: "application/pdf",
                      erroTipo: "Envie a proposta em PDF.",
                      limite: LIMITE_ENVIO,
                      erroLimite: "O PDF deve ter no máximo 3,8 MB.",
                    })
                    setErroArquivo(erro ?? null)
                  }}
                />
              </div>
            </div>
          </fieldset>
        ))}
      </div>

      {linhas.length < MAX_LINHAS && (
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setLinhas((l) => [...l, proxima])
              setProxima((n) => n + 1)
            }}
          >
            <Plus />
            Outra proposta
          </Button>
        </div>
      )}

      {repetido && (
        <p className="text-muted-foreground text-xs">
          Há mais de uma proposta do mesmo fornecedor. Pode registrar todas; para a cotação, cada fornecedor conta uma vez.
        </p>
      )}
      {regra.ativa && !pedeJustificativa && cotaram <= 1 && (
        <p className="text-muted-foreground text-xs">
          Com uma só proposta acima de {moeda(regra.limite)}, a auditoria pede a justificativa e alerta quem autoriza.
        </p>
      )}
      {pedeJustificativa && (
        <div className="grid gap-1.5">
          <Label htmlFor="rap-justificativa">{repetido ? "Por que só um fornecedor?" : "Por que só uma proposta?"} *</Label>
          <Textarea
            id="rap-justificativa"
            name="justificativa_proposta_unica"
            required
            minLength={10}
            maxLength={1000}
            rows={2}
            placeholder="Ex.: fornecedor exclusivo da peça; urgência para o evento de sexta; outros dois não responderam."
          />
          <p className="text-muted-foreground text-xs">
            Acima de {moeda(regra.limite)} com uma proposta, a ordem sai com o alerta da auditoria. A justificativa vai junto,
            para quem autoriza.
          </p>
        </div>
      )}

      {erroArquivo && <p className="text-destructive text-xs">{erroArquivo}</p>}

      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="rap-data">Data da compra *</Label>
          <Input id="rap-data" name="data_compra" type="date" required defaultValue={hojeLocalISO()} />
        </div>
        <Button type="submit" disabled={pendente}>
          {pendente && <Loader2 className="animate-spin" />}
          Registrar e efetivar a compra
        </Button>
      </div>
    </form>
  )
}
