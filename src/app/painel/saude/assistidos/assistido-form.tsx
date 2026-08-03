"use client"

import { useActionState, useState } from "react"
import { Loader2, Save } from "lucide-react"

import { FiliadoPicker, type SugestaoFiliado } from "@/components/filiado-picker"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { Assistido } from "@/lib/db/atendimentos"

import { salvarAssistidoAction } from "./actions"

const AREA =
  "border-input bg-background text-foreground min-h-20 w-full rounded-md border px-3 py-2 text-sm shadow-xs outline-none"

/** Regimes que esticam a guarda além da NR-07. */
const REGIMES = [
  { valor: "", rotulo: "— nenhum (segue a NR-07) —" },
  { valor: "benzeno", rotulo: "Benzeno (IN 2/1995, PPEOB)" },
  { valor: "radiacao_cnen", rotulo: "Radiação ionizante — regime CNEN" },
  { valor: "amianto", rotulo: "Amianto/asbesto (latência longa)" },
  { valor: "previdenciario", rotulo: "Previdenciário (LTCAT/PPP)" },
]

export function AssistidoForm({
  assistido,
  filiadoInicial,
  retencaoSugerida,
}: {
  assistido?: Assistido
  filiadoInicial?: SugestaoFiliado | null
  /** Sugestão calculada no servidor (registro + 20 ou 40 anos). */
  retencaoSugerida?: string | null
}) {
  const [estado, formAction, pendente] = useActionState(
    salvarAssistidoAction,
    {}
  )
  const [exposto, setExposto] = useState(
    assistido?.exposicao_cancerigeno_quimico ||
      assistido?.exposicao_radiacao_ionizante ||
      false
  )

  return (
    <form action={formAction} className="grid gap-4">
      {assistido && <input type="hidden" name="id" value={assistido.id} />}

      <Card>
        <CardContent className="grid gap-4">
          <p className="text-sm font-medium">Identificação</p>

          <div className="grid gap-1.5">
            <Label htmlFor="nome">Nome *</Label>
            <Input
              id="nome"
              name="nome"
              required
              defaultValue={assistido?.nome ?? ""}
              placeholder="Nome do assistido"
            />
          </div>

          <div className="grid gap-1.5">
            <Label>Filiado</Label>
            <FiliadoPicker
              endpoint="/painel/saude/assistidos/busca-filiado"
              inicial={filiadoInicial}
            />
            <p className="text-muted-foreground text-xs">
              Vincular ao cadastro permite que a pessoa acompanhe o próprio
              histórico pela área do filiado. Opcional — há quem seja atendido
              sem ser filiado.
            </p>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="observacoes">Observações do cadastro</Label>
            <textarea
              id="observacoes"
              name="observacoes"
              defaultValue={assistido?.observacoes ?? ""}
              className={AREA}
              placeholder="Informação administrativa. Conteúdo clínico vai no relatório do atendimento."
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="grid gap-4">
          <div>
            <p className="text-sm font-medium">Guarda do prontuário</p>
            <p className="text-muted-foreground mt-1 text-xs">
              NR-07, item 7.6.1.1: no mínimo 20 anos. O Anexo V dobra para 40
              em caso de exposição a cancerígeno químico ou radiação
              ionizante. Como a norma diz “no mínimo”, isto é piso — nunca
              teto.
            </p>
          </div>

          <div className="grid gap-3 rounded-md border p-3">
            <p className="text-xs font-medium">
              Exposição ocupacional (declaração do PGR)
            </p>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                name="exposicao_cancerigeno_quimico"
                defaultChecked={assistido?.exposicao_cancerigeno_quimico}
                onChange={(e) => e.target.checked && setExposto(true)}
                className="mt-0.5"
              />
              <span>Cancerígeno químico</span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                name="exposicao_radiacao_ionizante"
                defaultChecked={assistido?.exposicao_radiacao_ionizante}
                onChange={(e) => e.target.checked && setExposto(true)}
                className="mt-0.5"
              />
              <span>Radiação ionizante</span>
            </label>
            <p className="text-muted-foreground text-xs">
              Não é derivável do sistema — as tabelas de riscos de atividade
              estão vazias. Marcar aqui conforme o PGR.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="retencao_ate">Guardar até</Label>
              <Input
                id="retencao_ate"
                name="retencao_ate"
                type="date"
                defaultValue={
                  assistido?.retencao_ate ?? retencaoSugerida ?? ""
                }
                className="[color-scheme:light] dark:[color-scheme:dark]"
              />
              {!assistido && retencaoSugerida && (
                <p className="text-muted-foreground text-xs">
                  Sugestão calculada{exposto ? " (40 anos)" : " (20 anos)"} —
                  ajuste se o caso pedir.
                </p>
              )}
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="retencao_regime">Regime especial</Label>
              <select
                id="retencao_regime"
                name="retencao_regime"
                defaultValue={assistido?.retencao_regime ?? ""}
                className="border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none"
              >
                {REGIMES.map((r) => (
                  <option key={r.valor} value={r.valor}>
                    {r.rotulo}
                  </option>
                ))}
              </select>
              <p className="text-muted-foreground text-xs">
                Preenchido, o registro sai da fila de descarte automático e só
                sai do acervo por análise.
              </p>
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="retencao_observacao">Observação da guarda</Label>
            <Input
              id="retencao_observacao"
              name="retencao_observacao"
              defaultValue={assistido?.retencao_observacao ?? ""}
              placeholder="Agente, norma aplicável, decisão do jurídico…"
            />
          </div>
        </CardContent>
      </Card>

      {estado.erro && <p className="text-destructive text-sm">{estado.erro}</p>}

      <div>
        <Button type="submit" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Save />}
          {assistido ? "Salvar alterações" : "Cadastrar assistido"}
        </Button>
      </div>
    </form>
  )
}
