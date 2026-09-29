"use client"

import { useActionState, useState } from "react"
import { Link2, Loader2, Sparkles, Unlink } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { Trecho } from "@/lib/acordos-comparar"

import {
  analisarParAction,
  desfazerParAction,
  diferencaDoParAction,
  parearManualAction,
} from "../actions"

const SELECT =
  "border-input bg-background text-foreground h-8 w-full rounded-md border px-2 text-xs shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

/**
 * Texto de A e de B lado a lado, com o que saiu riscado em vermelho (A) e o
 * que entrou em verde (B). Busca a diferença só quando a pessoa pede.
 */
export function VerDiferenca({ comparacaoId, parId }: { comparacaoId: string; parId: string }) {
  const [trechos, setTrechos] = useState<Trecho[] | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function abrir() {
    if (trechos) {
      setTrechos(null)
      return
    }
    setCarregando(true)
    const r = await diferencaDoParAction(comparacaoId, parId)
    setCarregando(false)
    if (r.erro) setErro(r.erro)
    else setTrechos(r.trechos ?? [])
  }

  return (
    <div className="grid gap-2">
      <div>
        <Button type="button" variant="outline" size="sm" onClick={abrir} disabled={carregando}>
          {carregando && <Loader2 className="animate-spin" />}
          {trechos ? "Fechar a diferença" : "Ver a diferença no texto"}
        </Button>
      </div>
      {erro && <p className="text-destructive text-xs">{erro}</p>}
      {trechos && (
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="bg-muted/30 max-h-[32rem] overflow-auto rounded-md border p-3 text-sm leading-relaxed whitespace-pre-wrap">
            <p className="text-muted-foreground mb-2 text-xs font-medium">A — antes</p>
            {trechos
              .filter((t) => t.tipo !== "inserido")
              .map((t, i) =>
                t.tipo === "removido" ? (
                  <del key={i} className="bg-destructive/15 text-destructive decoration-destructive/60">
                    {t.texto}
                  </del>
                ) : (
                  <span key={i}>{t.texto}</span>
                )
              )}
          </div>
          <div className="bg-muted/30 max-h-[32rem] overflow-auto rounded-md border p-3 text-sm leading-relaxed whitespace-pre-wrap">
            <p className="text-muted-foreground mb-2 text-xs font-medium">B — depois</p>
            {trechos
              .filter((t) => t.tipo !== "removido")
              .map((t, i) =>
                t.tipo === "inserido" ? (
                  <ins key={i} className="bg-success/15 text-success-fg no-underline">
                    {t.texto}
                  </ins>
                ) : (
                  <span key={i}>{t.texto}</span>
                )
              )}
          </div>
        </div>
      )}
    </div>
  )
}

export function AnalisarPar({ comparacaoId, parId, jaAnalisado }: { comparacaoId: string; parId: string; jaAnalisado: boolean }) {
  const [estado, acao, pendente] = useActionState(analisarParAction, {})
  return (
    <form action={acao} className="inline-flex items-center gap-2">
      <input type="hidden" name="comparacao_id" value={comparacaoId} />
      <input type="hidden" name="par_id" value={parId} />
      <Button type="submit" variant="ghost" size="sm" disabled={pendente}>
        {pendente ? <Loader2 className="animate-spin" /> : <Sparkles />}
        {jaAnalisado ? "Analisar de novo" : "Analisar com IA"}
      </Button>
      {estado.erro && <span className="text-destructive text-xs">{estado.erro}</span>}
    </form>
  )
}

export function DesfazerPar({ comparacaoId, parId }: { comparacaoId: string; parId: string }) {
  return (
    <form
      action={desfazerParAction}
      onSubmit={(e) => {
        if (!confirm("Separar este par? As duas cláusulas viram 'suprimida' e 'nova'.")) e.preventDefault()
      }}
    >
      <input type="hidden" name="comparacao_id" value={comparacaoId} />
      <input type="hidden" name="par_id" value={parId} />
      <Button type="submit" variant="ghost" size="sm" title="O par está errado">
        <Unlink />
        Desfazer par
      </Button>
    </form>
  )
}

/** Suprimida (só A) → escolher a nova (só B) que trata do mesmo assunto. */
export function ParearManual({
  comparacaoId,
  parId,
  novas,
}: {
  comparacaoId: string
  parId: string
  novas: { parId: string; rotulo: string }[]
}) {
  const [estado, acao, pendente] = useActionState(parearManualAction, {})
  if (novas.length === 0) return null
  return (
    <form action={acao} className="grid gap-1.5 sm:max-w-md">
      <input type="hidden" name="comparacao_id" value={comparacaoId} />
      <input type="hidden" name="par_id" value={parId} />
      <div className="flex items-center gap-2">
        <select name="par_nova_id" required defaultValue="" className={SELECT} aria-label="Cláusula de B para parear">
          <option value="" disabled>
            Parear com uma cláusula nova de B…
          </option>
          {novas.map((n) => (
            <option key={n.parId} value={n.parId}>
              {n.rotulo}
            </option>
          ))}
        </select>
        <Button type="submit" variant="outline" size="sm" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Link2 />}
          Parear
        </Button>
      </div>
      {estado.erro && <span className="text-destructive text-xs">{estado.erro}</span>}
    </form>
  )
}
