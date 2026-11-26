"use client"

import { Plus, Trash2 } from "lucide-react"
import { useState } from "react"

import { EmpresaCombobox, type EmpresaOpcao } from "@/components/empresa-combobox"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { ACEITA_NOTA } from "@/lib/arquivo-envio"
import {
  EXPLICACAO_DISPENSA_MINIMA,
  MAX_ORCAMENTOS_DIRETA,
  MOTIVOS_DISPENSA_COTACAO,
} from "@/lib/compras-cotacao-direta"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })

/**
 * Aquisição direta acima do limite da auditoria: os orçamentos de outros
 * fornecedores (viram propostas do processo; a compra fica como a escolhida)
 * ou o motivo da dispensa da cotação. Ver lib/compras-cotacao-direta.
 */
export function CotacaoDireta({
  fornecedores,
  limite,
  valor,
  fornecedorCompraId,
}: {
  fornecedores: EmpresaOpcao[]
  limite: number
  valor: number
  /** O fornecedor da compra: o orçamento tem de ser de outro. */
  fornecedorCompraId: string
}) {
  const [modo, setModo] = useState<"orcamentos" | "dispensa">("orcamentos")
  const [linhas, setLinhas] = useState<number[]>([0])
  const [proxima, setProxima] = useState(1)
  const outros = fornecedores.filter((f) => f.id !== fornecedorCompraId)

  return (
    <fieldset className="border-warning/50 bg-warning/5 grid gap-3 rounded-md border p-3 text-sm">
      <legend className="px-1 font-medium">Cotação — compra acima de {moeda(limite)}</legend>
      <p className="text-muted-foreground text-xs">
        Aquisição direta de {moeda(valor)} passa do limite de {moeda(limite)}. Registre os orçamentos que outros
        fornecedores deram, ou diga por que a cotação foi dispensada. Quem autoriza vê os dois.
      </p>
      <input type="hidden" name="cotacao_modo" value={modo} />
      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2">
          <input type="radio" checked={modo === "orcamentos"} onChange={() => setModo("orcamentos")} className="size-4" />
          Tenho orçamentos de outros fornecedores
        </label>
        <label className="flex items-center gap-2">
          <input type="radio" checked={modo === "dispensa"} onChange={() => setModo("dispensa")} className="size-4" />
          A cotação foi dispensada
        </label>
      </div>

      {modo === "orcamentos" ? (
        <div className="grid gap-3">
          <input type="hidden" name="orcamentos_linhas" value={proxima} />
          {linhas.map((id, pos) => (
            <div key={id} className="bg-background grid gap-3 rounded-md border p-3">
              <div className="flex items-center justify-between">
                <span className="font-medium">Orçamento {pos + 1}</span>
                {linhas.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remover orçamento ${pos + 1}`}
                    onClick={() => setLinhas((l) => l.filter((x) => x !== id))}
                  >
                    <Trash2 />
                  </Button>
                )}
              </div>
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_9rem]">
                <div className="grid gap-1.5">
                  <Label>Fornecedor *</Label>
                  <EmpresaCombobox empresas={outros} name={`orcamento_fornecedor_${id}`} />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor={`orc-valor-${id}`}>Valor orçado *</Label>
                  <Input id={`orc-valor-${id}`} name={`orcamento_valor_${id}`} inputMode="decimal" placeholder="0,00" />
                </div>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`orc-arquivo-${id}`}>Orçamento (PDF ou imagem)</Label>
                <Input id={`orc-arquivo-${id}`} name={`orcamento_arquivo_${id}`} type="file" accept={ACEITA_NOTA} />
              </div>
            </div>
          ))}
          {linhas.length < MAX_ORCAMENTOS_DIRETA && (
            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setLinhas((l) => [...l, proxima])
                  setProxima((p) => p + 1)
                }}
              >
                <Plus />
                Outro orçamento
              </Button>
            </div>
          )}
          <p className="text-muted-foreground text-xs">
            O fornecedor desta compra entra como a proposta escolhida; os orçamentos ficam como as outras propostas do
            processo.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-[16rem_minmax(0,1fr)]">
          <div className="grid gap-1.5">
            <Label htmlFor="dispensa-motivo">Motivo *</Label>
            <select id="dispensa-motivo" name="dispensa_motivo" required defaultValue="" className={SELECT}>
              <option value="" disabled>
                Escolha o motivo
              </option>
              {MOTIVOS_DISPENSA_COTACAO.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="dispensa-explicacao">Explique *</Label>
            <Textarea
              id="dispensa-explicacao"
              name="dispensa_explicacao"
              required
              minLength={EXPLICACAO_DISPENSA_MINIMA}
              maxLength={800}
              rows={2}
              placeholder="Ex.: única gráfica da região com a tiragem no prazo do ato; preço fechado pela federação."
            />
          </div>
        </div>
      )}
    </fieldset>
  )
}
