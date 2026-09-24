"use client"

import { useState } from "react"
import { UsersRound } from "lucide-react"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

/**
 * Toggle da CLÁUSULA DE FILIAÇÃO COLETIVA na rodada de assembleia — o
 * "nascedouro" do processo: marcada aqui, a rodada passa a aparecer como
 * disponível em Representação › Filiação coletiva. O prazo de desistência
 * (dias corridos, como no ACT) também vem daqui.
 */
export function ClausulaColetivaCampos({
  marcadaInicial = false,
  diasInicial = null,
}: {
  marcadaInicial?: boolean
  diasInicial?: number | null
}) {
  const [marcada, setMarcada] = useState(marcadaInicial)
  return (
    <div className="grid gap-3 rounded-lg border p-3">
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          name="clausula_filiacao_coletiva"
          checked={marcada}
          onChange={(e) => setMarcada(e.target.checked)}
          className="mt-0.5 size-4"
        />
        <span>
          <UsersRound className="mr-1 inline size-4 align-[-3px]" />
          O ACT em discussão tem <strong>cláusula de filiação coletiva</strong>
          <span className="text-muted-foreground block text-xs">
            Aprovada a assembleia, todos os aptos a votar tornam-se filiados. A
            rodada fica disponível em Representação → Filiação coletiva para o
            processamento.
          </span>
        </span>
      </label>
      {marcada && (
        <div className="grid max-w-xs gap-1.5">
          <Label htmlFor="filiacao_coletiva_dias">
            Prazo de desistência (dias corridos)
          </Label>
          <Input
            id="filiacao_coletiva_dias"
            name="filiacao_coletiva_dias"
            inputMode="numeric"
            placeholder="Ex.: 30"
            defaultValue={diasInicial ?? ""}
          />
          <p className="text-muted-foreground text-xs">
            Nesse período o trabalhador pode desistir pela área do filiado.
            Vencido o prazo, a filiação é informada à fonte e vira ativa.
          </p>
        </div>
      )}
    </div>
  )
}
