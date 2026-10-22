"use client"

import { startTransition, useActionState, useState } from "react"
import { Loader2, Plus, Tags, Trash2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SelectNativo } from "@/components/ui/select-nativo"
import { Textarea } from "@/components/ui/textarea"
import { formatarMoeda } from "@/lib/formato"
import { parseValorBR } from "@/lib/valores"

import { reclassificarOrdemAction } from "./actions"

type Opcao = { id: string; rotulo: string }
type Linha = { centroId: string; departamentoId: string; descricao: string; valor: string }

/**
 * Reclassificar a ordem (Financeiro): centro de custo, departamento e rateio.
 * Não passa pela autorização e vale também para a ordem paga — até o mês do
 * pagamento ser fechado na Exportação contábil (aí `trava` explica por quê).
 */
export function ReclassificarOrdem({
  ordemId,
  valorOrdem,
  atual,
  centros,
  departamentos,
  trava,
}: {
  ordemId: string
  valorOrdem: number
  atual: { centroId: string; departamentoId: string; rateio: Linha[] }
  centros: Opcao[]
  departamentos: Opcao[]
  trava: string | null
}) {
  const [aberto, setAberto] = useState(false)
  if (trava) {
    return (
      <p className="text-muted-foreground max-w-xs text-right text-xs" title={trava}>
        {trava}
      </p>
    )
  }
  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Tags />
          Reclassificar
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Reclassificar a ordem</DialogTitle>
          <DialogDescription>
            Centro de custo, departamento e rateio da despesa. O valor e o favorecido não mudam, e a ordem não volta
            para autorização.
          </DialogDescription>
        </DialogHeader>
        {/* key: reabrir o diálogo traz a classificação atual. */}
        <Formulario
          key={String(aberto)}
          ordemId={ordemId}
          valorOrdem={valorOrdem}
          atual={atual}
          centros={centros}
          departamentos={departamentos}
        />
      </DialogContent>
    </Dialog>
  )
}

function Formulario({
  ordemId,
  valorOrdem,
  atual,
  centros,
  departamentos,
}: {
  ordemId: string
  valorOrdem: number
  atual: { centroId: string; departamentoId: string; rateio: Linha[] }
  centros: Opcao[]
  departamentos: Opcao[]
}) {
  const [estado, acao, pendente] = useActionState(reclassificarOrdemAction, {})
  const [ratear, setRatear] = useState(atual.rateio.length > 1)
  const [linhas, setLinhas] = useState<Linha[]>(
    atual.rateio.length > 1
      ? atual.rateio
      : [
          { centroId: atual.centroId, departamentoId: atual.departamentoId, descricao: "", valor: valorTexto(valorOrdem) },
          { centroId: "", departamentoId: "", descricao: "", valor: "" },
        ]
  )
  const soma = linhas.reduce((s, l) => s + (parseValorBR(l.valor) ?? 0), 0)
  const falta = Math.round((valorOrdem - soma) * 100) / 100
  const muda = (i: number, campo: keyof Linha, valor: string) =>
    setLinhas((ls) => ls.map((l, j) => (j === i ? { ...l, [campo]: valor } : l)))

  return (
    // Envio por startTransition: com `action={acao}` o React 19 reinicia o
    // formulário depois de um erro e os campos controlados (rateio) se perdem.
    <form
      onSubmit={(e) => {
        e.preventDefault()
        const dados = new FormData(e.currentTarget)
        startTransition(() => acao(dados))
      }}
      className="grid gap-4"
    >
      <input type="hidden" name="id" value={ordemId} />
      <input type="hidden" name="rateio" value={ratear ? JSON.stringify(linhas) : "[]"} />
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={ratear} onChange={(e) => setRatear(e.target.checked)} />
        Ratear entre mais de um centro de custo
      </label>

      {!ratear ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="recl_centro">Centro de custo da despesa *</Label>
            <SelectNativo id="recl_centro" name="centro_custo_despesa_id" defaultValue={atual.centroId} required>
              <option value="" disabled>
                Escolha…
              </option>
              <OpcoesCentro centros={centros} atual={atual.centroId} />
            </SelectNativo>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="recl_depto">Departamento</Label>
            <SelectNativo id="recl_depto" name="departamento_id" defaultValue={atual.departamentoId}>
              <option value="">Nenhum</option>
              {departamentos.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.rotulo}
                </option>
              ))}
            </SelectNativo>
          </div>
        </div>
      ) : (
        <div className="grid gap-2">
          {linhas.map((l, i) => (
            <div key={i} className="grid gap-2 rounded-md border p-2 sm:grid-cols-[2fr_1.3fr_1.3fr_7rem_auto] sm:items-end">
              <div className="grid gap-1">
                <Label className="text-xs">Centro de custo {i === 0 && "(o da ordem)"}</Label>
                <SelectNativo aria-label={`Centro de custo da linha ${i + 1}`} value={l.centroId} onChange={(e) => muda(i, "centroId", e.target.value)} required>
                  <option value="" disabled>
                    Escolha…
                  </option>
                  <OpcoesCentro centros={centros} atual={l.centroId} />
                </SelectNativo>
              </div>
              <div className="grid gap-1">
                <Label className="text-xs">Departamento</Label>
                <SelectNativo aria-label={`Departamento da linha ${i + 1}`} value={l.departamentoId} onChange={(e) => muda(i, "departamentoId", e.target.value)}>
                  <option value="">Nenhum</option>
                  {departamentos.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.rotulo}
                    </option>
                  ))}
                </SelectNativo>
              </div>
              <div className="grid gap-1">
                <Label className="text-xs">Descrição</Label>
                <Input aria-label={`Descrição da linha ${i + 1}`} value={l.descricao} onChange={(e) => muda(i, "descricao", e.target.value)} />
              </div>
              <div className="grid gap-1">
                <Label className="text-xs">Valor</Label>
                <Input
                  aria-label={`Valor da linha ${i + 1}`}
                  inputMode="decimal"
                  value={l.valor}
                  onChange={(e) => muda(i, "valor", e.target.value)}
                  className="text-right tabular-nums"
                  required
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Tirar a linha"
                disabled={linhas.length <= 2}
                onClick={() => setLinhas((ls) => ls.filter((_, j) => j !== i))}
              >
                <Trash2 />
              </Button>
            </div>
          ))}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setLinhas((ls) => [
                  ...ls,
                  { centroId: "", departamentoId: "", descricao: "", valor: falta > 0 ? valorTexto(falta) : "" },
                ])
              }
            >
              <Plus />
              Linha
            </Button>
            <p className={`text-xs tabular-nums ${Math.abs(falta) >= 0.01 ? "text-destructive" : "text-muted-foreground"}`}>
              Soma {formatarMoeda(soma)} de {formatarMoeda(valorOrdem)}
              {Math.abs(falta) >= 0.01 && ` — ${falta > 0 ? "faltam" : "sobram"} ${formatarMoeda(Math.abs(falta))}`}
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-1.5">
        <Label htmlFor="recl_motivo">Motivo *</Label>
        <Textarea id="recl_motivo" name="motivo" rows={2} required />
      </div>
      <p className="text-muted-foreground text-xs">
        A mudança fica no histórico da ordem, com o antes e o depois. Depois que o mês do pagamento é fechado na
        Exportação contábil, a classificação trava.
      </p>
      <Button type="submit" size="sm" disabled={pendente} className="justify-self-start">
        {pendente ? <Loader2 className="animate-spin" /> : <Tags />}
        Salvar classificação
      </Button>
    </form>
  )
}

/** Centros usáveis — e o atual, mesmo que não seja mais (para não sumir do select). */
function OpcoesCentro({ centros, atual }: { centros: Opcao[]; atual: string }) {
  return (
    <>
      {atual && !centros.some((c) => c.id === atual) && <option value={atual}>(centro atual, não usável)</option>}
      {centros.map((c) => (
        <option key={c.id} value={c.id}>
          {c.rotulo}
        </option>
      ))}
    </>
  )
}

function valorTexto(v: number): string {
  return v.toFixed(2).replace(".", ",")
}
