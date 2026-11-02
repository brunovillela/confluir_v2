"use client"

import { useActionState, useState } from "react"
import Link from "next/link"
import { Loader2, Trash2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { LiberarEmCampo } from "@/components/liberar-em-campo"

import {
  atualizarRemessaContracheques,
  criarRemessaContracheques,
  excluirRemessaContracheques,
} from "./actions"
import { confirmarEnvio } from "@/components/ui/confirmacao"
import { useEnvioFormulario } from "@/hooks/use-envio-formulario"
import { competenciaDoNome, MESES_REMESSA, nomeRemessaContracheques } from "@/lib/contracheque-leitura"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

export type RemessaFormDados = {
  id: string
  nome_remessa: string | null
  finalizada: boolean | null
  decimo_terceiro: boolean | null
  ferias: boolean | null
  adiantamento: boolean | null
  complementar_mensal: boolean | null
  data_pagamento?: string | null
  liberar_em?: string | null
  liberada_automaticamente_em?: string | null
  itens: number
}

const NATUREZAS = [
  { valor: "mensal", rotulo: "Mensal" },
  { valor: "adiantamento", rotulo: "Adiantamento" },
  { valor: "decimo_terceiro", rotulo: "13º salário" },
  { valor: "ferias", rotulo: "Férias" },
  { valor: "complementar_mensal", rotulo: "Complementar (mensal)" },
]

function naturezaAtual(r?: RemessaFormDados): string {
  if (!r) return ""
  if (r.decimo_terceiro === true) return "decimo_terceiro"
  if (r.ferias === true) return "ferias"
  if (r.adiantamento === true) return "adiantamento"
  if (r.complementar_mensal === true) return "complementar_mensal"
  return "mensal"
}

export function RemessaContrachequesForm({
  remessa,
  comDataPagamento = true,
}: {
  remessa?: RemessaFormDados
  /** false enquanto o SQL da folha não rodou (a coluna não existe). */
  comDataPagamento?: boolean
}) {
  const [estado, formAction, pendente] = useActionState(
    remessa ? atualizarRemessaContracheques : criarRemessaContracheques,
    {}
  )
  const envio = useEnvioFormulario(formAction, estado)
  const [estadoExcluir, excluirAction, excluindo] = useActionState(
    excluirRemessaContracheques,
    {}
  )
  const envio2 = useEnvioFormulario(excluirAction, estadoExcluir, {
    antes: (e) => {
        confirmarEnvio(e, "Excluir esta remessa? Só é possível excluir remessas sem contracheques.")
      },
  })

  // Remessa antiga: mês e ano saem do nome; sem isso no nome, ficam para escolher.
  const competencia = competenciaDoNome(remessa?.nome_remessa)
  const [mes, setMes] = useState(competencia ? MESES_REMESSA[Number(competencia.slice(5, 7)) - 1] : "")
  const [ano, setAno] = useState(competencia?.slice(0, 4) ?? "")
  const [natureza, setNatureza] = useState(naturezaAtual(remessa))
  const rotulo = NATUREZAS.find((n) => n.valor === natureza)?.rotulo
  const nomeGerado = mes && /^\d{4}$/.test(ano) && rotulo ? nomeRemessaContracheques(mes, ano, rotulo) : null

  const erro = estado.erro ?? estadoExcluir.erro
  const voltar = remessa
    ? `/painel/pessoal/contracheques/${remessa.id}`
    : "/painel/pessoal/contracheques"

  return (
    <div className="grid gap-4">
      {erro && (
        <Alert variant="destructive">
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      )}

      <form action={formAction} {...envio} className="grid gap-4">
        {remessa && <input type="hidden" name="id" value={remessa.id} />}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Dados da remessa</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="mes">Mês *</Label>
              <select
                id="mes"
                name="mes"
                required
                value={mes}
                onChange={(e) => setMes(e.target.value)}
                className={SELECT}
              >
                <option value="" disabled>
                  Escolha o mês
                </option>
                {MESES_REMESSA.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ano">Ano *</Label>
              <Input
                id="ano"
                name="ano"
                inputMode="numeric"
                maxLength={4}
                placeholder="AAAA"
                value={ano}
                onChange={(e) => setAno(e.target.value)}
                required
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="natureza">Natureza *</Label>
              <select
                id="natureza"
                name="natureza"
                required
                value={natureza}
                onChange={(e) => setNatureza(e.target.value)}
                className={SELECT}
              >
                <option value="" disabled>
                  Escolha a natureza
                </option>
                {NATUREZAS.map((n) => (
                  <option key={n.valor} value={n.valor}>
                    {n.rotulo}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid content-center gap-0.5">
              <span className="text-muted-foreground text-xs">Nome da remessa, gerado pelo sistema</span>
              <span className="text-sm font-medium">{nomeGerado ?? "Escolha mês, ano e natureza"}</span>
              {remessa?.nome_remessa && nomeGerado && remessa.nome_remessa !== nomeGerado && (
                <span className="text-muted-foreground text-xs">Hoje: {remessa.nome_remessa}. Muda ao salvar.</span>
              )}
            </div>
            {comDataPagamento && (
              <div className="grid gap-1.5">
                <Label htmlFor="data_pagamento">Data de pagamento</Label>
                <Input
                  id="data_pagamento"
                  name="data_pagamento"
                  type="date"
                  defaultValue={remessa?.data_pagamento ?? ""}
                  className="[color-scheme:light] dark:[color-scheme:dark]"
                />
                <span className="text-muted-foreground text-xs">
                  Vira o vencimento das ordens de pagamento dos contracheques.
                </span>
              </div>
            )}
            <LiberarEmCampo remessa={remessa} itens="contracheques" />

            <div className="grid content-end pb-1">
              <label className="text-muted-foreground flex items-center gap-2 text-sm">
                <Checkbox
                  name="finalizada"
                  defaultChecked={remessa?.finalizada === true}
                />
                Remessa finalizada
              </label>
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" asChild>
            <Link href={voltar}>Cancelar</Link>
          </Button>
          <Button type="submit" disabled={pendente}>
            {pendente && <Loader2 className="animate-spin" />}
            {remessa ? "Salvar alterações" : "Criar remessa"}
          </Button>
        </div>
      </form>

      {remessa && (
        <form
          action={excluirAction} {...envio2}
          className="flex justify-end border-t pt-4"
        >
          <input type="hidden" name="id" value={remessa.id} />
          <Button
            type="submit"
            variant="ghost"
            disabled={excluindo || remessa.itens > 0}
            className="text-destructive hover:text-destructive"
          >
            {excluindo ? <Loader2 className="animate-spin" /> : <Trash2 />}
            Excluir remessa
          </Button>
        </form>
      )}
    </div>
  )
}
