"use client"

import { useState } from "react"
import { Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import type { Trecho } from "@/lib/acordos-comparar"

import { diferencaQuadroAction } from "../../actions"

/**
 * Diferença entre duas cláusulas do quadro (ex.: vigente → proposta), com o
 * que saiu riscado e o que entrou em verde. Busca só quando a pessoa pede.
 */
export function DiferencaQuadro({
  negociacaoId,
  antes,
  depois,
  rotulo,
}: {
  negociacaoId: string
  antes: string
  depois: string
  rotulo: string
}) {
  const [trechos, setTrechos] = useState<Trecho[] | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function alternar() {
    if (trechos) {
      setTrechos(null)
      return
    }
    setCarregando(true)
    const r = await diferencaQuadroAction(negociacaoId, antes, depois)
    setCarregando(false)
    if (r.erro) setErro(r.erro)
    else setTrechos(r.trechos ?? [])
  }

  return (
    <div className="grid gap-2">
      <div>
        <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={alternar} disabled={carregando}>
          {carregando && <Loader2 className="animate-spin" />}
          {trechos ? "Fechar diferença" : rotulo}
        </Button>
      </div>
      {erro && <p className="text-destructive text-xs">{erro}</p>}
      {trechos && (
        <div className="bg-muted/30 max-h-[28rem] overflow-auto rounded-md border p-3 text-sm leading-relaxed whitespace-pre-wrap">
          {trechos.map((t, i) =>
            t.tipo === "removido" ? (
              <del key={i} className="bg-destructive/15 text-destructive decoration-destructive/60">
                {t.texto}
              </del>
            ) : t.tipo === "inserido" ? (
              <ins key={i} className="bg-success/15 text-success-fg no-underline">
                {t.texto}
              </ins>
            ) : (
              <span key={i}>{t.texto}</span>
            )
          )}
        </div>
      )}
    </div>
  )
}
