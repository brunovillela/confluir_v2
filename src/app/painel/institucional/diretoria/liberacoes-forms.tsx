"use client"

import { useActionState, useState } from "react"
import { Loader2, Plus, Trash2, Users, User } from "lucide-react"

import { EmpresaCombobox, type EmpresaOpcao } from "@/components/empresa-combobox"
import { FiliadoPicker } from "@/components/filiado-picker"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { type EstadoForm } from "@/lib/contas"

import { adicionarLiberacoesLoteAction } from "./actions"
import { AdicionarLiberacao } from "./diretoria-extra-forms"

type OpcaoIntegrante = { id: string; nome: string; cargo: string | null }
export type OficioOpcao = { id: string; rotulo: string; destinatarioEmpresaId: string | null }

const INPUT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"
const AREA =
  "border-input bg-background text-foreground w-full rounded-md border px-3 py-2 text-sm shadow-xs outline-none"

const BASE = "__base__"

/**
 * Registrar liberação: a chave escolhe entre o formulário individual (um
 * diretor, com documento próprio) e várias liberações pelo mesmo ofício.
 */
export function RegistrarLiberacoes({
  mandatoId,
  integrantes,
  empregadoresPorIntegrante,
  oficios,
  empresas,
  loteDisponivel,
}: {
  mandatoId: string
  integrantes: OpcaoIntegrante[]
  empregadoresPorIntegrante: Record<string, { id: string; nome: string }[]>
  oficios: OficioOpcao[]
  empresas: EmpresaOpcao[]
  /** false antes de supabase/diretoria-liberacoes-lote.sql. */
  loteDisponivel: boolean
}) {
  const [modo, setModo] = useState<"individual" | "varias">("individual")
  return (
    <div className="grid gap-4">
      <div role="radiogroup" aria-label="Tipo de lançamento" className="bg-muted inline-flex w-fit rounded-md p-1">
        {[
          { valor: "individual" as const, rotulo: "Individual", icone: User },
          { valor: "varias" as const, rotulo: "Várias liberações", icone: Users },
        ].map(({ valor, rotulo, icone: Icone }) => (
          <button
            key={valor}
            type="button"
            role="radio"
            aria-checked={modo === valor}
            onClick={() => setModo(valor)}
            className={`inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium transition-colors ${
              modo === valor ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icone className="size-4" />
            {rotulo}
          </button>
        ))}
      </div>

      {modo === "individual" ? (
        <AdicionarLiberacao
          mandatoId={mandatoId}
          integrantes={integrantes}
          empregadoresPorIntegrante={empregadoresPorIntegrante}
        />
      ) : loteDisponivel ? (
        <LiberacoesEmLote mandatoId={mandatoId} integrantes={integrantes} oficios={oficios} empresas={empresas} />
      ) : (
        <p className="text-warning-fg text-sm">
          Para lançar várias liberações, rode <code>supabase/diretoria-liberacoes-lote.sql</code> no Supabase.
        </p>
      )}
    </div>
  )
}

type Linha = { chave: string; pessoa: string }

function LiberacoesEmLote({
  mandatoId,
  integrantes,
  oficios,
  empresas,
}: {
  mandatoId: string
  integrantes: OpcaoIntegrante[]
  oficios: OficioOpcao[]
  empresas: EmpresaOpcao[]
}) {
  const [estado, formAction, pendente] = useActionState<EstadoForm, FormData>(adicionarLiberacoesLoteAction, {})
  const [oficioId, setOficioId] = useState("")
  const [linhas, setLinhas] = useState<Linha[]>([{ chave: "1", pessoa: "" }])
  const [proxima, setProxima] = useState(2)
  const oficio = oficios.find((o) => o.id === oficioId)
  const empresaPadrao = empresas.some((e) => e.id === oficio?.destinatarioEmpresaId)
    ? (oficio?.destinatarioEmpresaId ?? undefined)
    : undefined

  const adicionar = () => {
    setLinhas((l) => [...l, { chave: String(proxima), pessoa: "" }])
    setProxima((n) => n + 1)
  }
  const trocarPessoa = (chave: string, pessoa: string) =>
    setLinhas((l) => l.map((x) => (x.chave === chave ? { ...x, pessoa } : x)))
  const remover = (chave: string) => setLinhas((l) => (l.length > 1 ? l.filter((x) => x.chave !== chave) : l))

  return (
    <form action={formAction} className="grid gap-4">
      <input type="hidden" name="mandato_id" value={mandatoId} />
      <input type="hidden" name="membros" value={linhas.map((l) => l.chave).join(",")} />

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="lote-oficio">Ofício que libera *</Label>
          <select
            id="lote-oficio"
            name="oficio_id"
            required
            value={oficioId}
            onChange={(e) => setOficioId(e.target.value)}
            className={INPUT}
          >
            <option value="" disabled>
              {oficios.length ? "(escolha na área de Ofícios)" : "Nenhum ofício emitido na área de Ofícios"}
            </option>
            {oficios.map((o) => (
              <option key={o.id} value={o.id}>
                {o.rotulo}
              </option>
            ))}
          </select>
          <span className="text-muted-foreground text-xs">
            O ofício é o da área de Ofícios — emita-o lá primeiro. O PDF é o dele.
          </span>
        </div>
        <div className="grid gap-1.5">
          <Label>Empregador (fonte pagadora que libera)</Label>
          <EmpresaCombobox key={oficioId || "sem-oficio"} empresas={empresas} name="empresa_id" defaultId={empresaPadrao} />
          <span className="text-muted-foreground text-xs">Vem preenchido com o destinatário do ofício, quando é fonte pagadora.</span>
        </div>
      </div>

      <div className="grid gap-2">
        <Label>Pessoas liberadas *</Label>
        {linhas.map((linha, n) => (
          <div key={linha.chave} className="bg-muted/30 grid gap-3 rounded-md border p-3 sm:grid-cols-[1fr_10rem_10rem_auto] sm:items-end">
            <div className="grid gap-1.5">
              <Label htmlFor={`membro-${linha.chave}`} className="text-xs">
                Pessoa {n + 1}
              </Label>
              <select
                id={`membro-${linha.chave}`}
                name={linha.pessoa === BASE ? undefined : `membro_${linha.chave}_integrante`}
                required
                value={linha.pessoa}
                onChange={(e) => trocarPessoa(linha.chave, e.target.value)}
                className={INPUT}
              >
                <option value="" disabled>
                  (escolha)
                </option>
                <optgroup label="Diretores do mandato">
                  {integrantes.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.nome}
                      {i.cargo ? ` — ${i.cargo}` : ""}
                    </option>
                  ))}
                </optgroup>
                <option value={BASE}>Trabalhador da base (não é diretor)…</option>
              </select>
              {linha.pessoa === BASE && (
                <FiliadoPicker
                  endpoint="/painel/institucional/diretoria/busca-filiado"
                  nome={`membro_${linha.chave}_filiacao`}
                  placeholder="Busque o filiado por nome, CPF ou matrícula"
                />
              )}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`saida-${linha.chave}`} className="text-xs">
                Saída *
              </Label>
              <input id={`saida-${linha.chave}`} name={`membro_${linha.chave}_inicio`} type="date" required className={INPUT} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`retorno-${linha.chave}`} className="text-xs">
                Retorno
              </Label>
              <input id={`retorno-${linha.chave}`} name={`membro_${linha.chave}_fim`} type="date" className={INPUT} />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => remover(linha.chave)}
              disabled={linhas.length === 1}
              aria-label={`Remover pessoa ${n + 1}`}
            >
              <Trash2 className="text-destructive" />
            </Button>
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="outline" size="sm" onClick={adicionar}>
            <Plus />
            Adicionar pessoa
          </Button>
          <span className="text-muted-foreground text-xs">Sem data de retorno, a liberação fica permanente.</span>
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="lote-obs">Observação (vale para todas)</Label>
        <textarea id="lote-obs" name="observacao" rows={2} className={AREA} />
      </div>

      {estado.erro && <p className="text-destructive text-sm">{estado.erro}</p>}
      {estado.ok && <p className="text-success-fg text-sm">{estado.ok}</p>}
      <div>
        <Button type="submit" size="sm" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Users />}
          Registrar {linhas.length} {linhas.length === 1 ? "liberação" : "liberações"}
        </Button>
      </div>
    </form>
  )
}
