"use client"

import { useActionState, useState } from "react"
import Link from "next/link"
import { Loader2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SelectNativo } from "@/components/ui/select-nativo"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import { MOTIVOS_DESFILIACAO } from "@/lib/churn-constantes"
import {
  CONDICOES_NA_FONTE,
  REGIMES_TRABALHO,
  condicaoNaFontePadrao,
} from "@/lib/filiacao"

import { atualizarVinculo, criarVinculo } from "./actions"

export type OpcaoFonte = { id: string; nome: string; fundoPensao: boolean }

export type VinculoFormDados = {
  id: string
  fonte_pagadora_id: string | null
  cargo: string | null
  lotacao: string | null
  matricula: string | null
  data_entrada_admissao: string | null
  data_saida_demissao: string | null
  data_filiacao: string | null
  data_desfiliacao: string | null
  /** Data de saída do sistema antigo (não editável aqui): também encerra o vínculo. */
  filiacao_data_saida?: string | null
  desfiliacao_motivo?: string | null
  condicao_na_fonte: string | null
  regime_trabalho: string | null
}

function CampoData({
  nome,
  rotulo,
  valor,
  aoMudar,
}: {
  nome: string
  rotulo: string
  valor: string | null
  aoMudar?: (valor: string) => void
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={nome}>{rotulo}</Label>
      <Input
        id={nome}
        name={nome}
        type="date"
        defaultValue={(valor ?? "").slice(0, 10)}
        onChange={aoMudar ? (e) => aoMudar(e.target.value) : undefined}
      />
    </div>
  )
}

export function VinculoForm({
  filiadoId,
  fontes,
  vinculo,
}: {
  filiadoId: string
  fontes: OpcaoFonte[]
  vinculo?: VinculoFormDados
}) {
  const [estado, formAction, pendente] = useActionState(
    vinculo ? atualizarVinculo : criarVinculo,
    {}
  )
  const erro = estado.erro

  // A condição na fonte segue o TIPO da fonte enquanto o usuário não a
  // escolher: empresa → trabalhador da ativa; fundo de pensão → aposentado.
  const [fonteId, setFonteId] = useState(vinculo?.fonte_pagadora_id ?? "")
  const [condicao, setCondicao] = useState(vinculo?.condicao_na_fonte ?? "")
  const [condicaoEscolhida, setCondicaoEscolhida] = useState(
    Boolean(vinculo?.condicao_na_fonte)
  )
  // O motivo só vale para vínculo encerrado: sem data de desfiliação (nem a
  // de saída do sistema antigo), o campo fica desligado e não vai no envio.
  const [dataDesfiliacao, setDataDesfiliacao] = useState(vinculo?.data_desfiliacao ?? "")
  const encerrado = Boolean(dataDesfiliacao || vinculo?.filiacao_data_saida)
  const fonteEhFundo = (id: string) =>
    fontes.find((f) => f.id === id)?.fundoPensao ?? false
  const condicaoEfetiva =
    condicao || (fonteId ? condicaoNaFontePadrao(fonteEhFundo(fonteId)) : "")
  const escolherFonte = (id: string) => {
    setFonteId(id)
    if (!condicaoEscolhida) setCondicao(condicaoNaFontePadrao(fonteEhFundo(id)))
  }

  return (
    <div className="grid gap-4">
      {erro && (
        <Alert variant="destructive">
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      )}

      <form action={formAction} className="grid gap-4">
        <input type="hidden" name="filiado_id" value={filiadoId} />
        {vinculo && <input type="hidden" name="vinculo_id" value={vinculo.id} />}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Dados do vínculo</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div className="grid gap-1.5">
              <Label htmlFor="fonte_pagadora_id">Fonte pagadora *</Label>
              <Select
                name="fonte_pagadora_id"
                value={fonteId || undefined}
                onValueChange={escolherFonte}
                required
              >
                <SelectTrigger id="fonte_pagadora_id" className="w-full">
                  <SelectValue placeholder="Selecione a fonte" />
                </SelectTrigger>
                <SelectContent>
                  {fontes.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="matricula">Matrícula na fonte</Label>
              <Input
                id="matricula"
                name="matricula"
                defaultValue={vinculo?.matricula ?? ""}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="cargo">Cargo</Label>
              <Input id="cargo" name="cargo" defaultValue={vinculo?.cargo ?? ""} />
            </div>
            <div className="grid gap-1.5 lg:col-span-2">
              <Label htmlFor="lotacao">Lotação</Label>
              <Input
                id="lotacao"
                name="lotacao"
                defaultValue={vinculo?.lotacao ?? ""}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="condicao_na_fonte">Condição na fonte pagadora</Label>
              <Select
                name="condicao_na_fonte"
                value={condicaoEfetiva || undefined}
                onValueChange={(v) => {
                  setCondicao(v)
                  setCondicaoEscolhida(true)
                }}
              >
                <SelectTrigger id="condicao_na_fonte" className="w-full">
                  <SelectValue placeholder="Escolha a fonte primeiro" />
                </SelectTrigger>
                <SelectContent>
                  {CONDICOES_NA_FONTE.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-muted-foreground text-xs">
                Situação nesta fonte — diferente da condição sindical. Padrão:
                empresa → ativa; fundo de pensão → aposentado.
              </p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="regime_trabalho">Regime de trabalho (turno)</Label>
              <Select
                name="regime_trabalho"
                defaultValue={vinculo?.regime_trabalho ?? undefined}
              >
                <SelectTrigger id="regime_trabalho" className="w-full">
                  <SelectValue placeholder="Não informado" />
                </SelectTrigger>
                <SelectContent>
                  {REGIMES_TRABALHO.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <CampoData
              nome="data_entrada_admissao"
              rotulo="Admissão na fonte"
              valor={vinculo?.data_entrada_admissao ?? null}
            />
            <CampoData
              nome="data_saida_demissao"
              rotulo="Saída na fonte"
              valor={vinculo?.data_saida_demissao ?? null}
            />
            <CampoData
              nome="data_filiacao"
              rotulo="Filiação"
              valor={vinculo?.data_filiacao ?? null}
            />
            <CampoData
              nome="data_desfiliacao"
              rotulo="Desfiliação"
              valor={vinculo?.data_desfiliacao ?? null}
              aoMudar={setDataDesfiliacao}
            />
            <div className="grid gap-1.5">
              <Label htmlFor="desfiliacao_motivo">Motivo da desfiliação</Label>
              <SelectNativo
                id="desfiliacao_motivo"
                name="desfiliacao_motivo"
                defaultValue={vinculo?.desfiliacao_motivo ?? ""}
                disabled={!encerrado}
              >
                <option value="">Não informado</option>
                {MOTIVOS_DESFILIACAO.map((m) => (
                  <option key={m.chave} value={m.chave}>
                    {m.rotulo}
                  </option>
                ))}
              </SelectNativo>
              <p className="text-muted-foreground text-xs">
                {encerrado
                  ? "Por que este vínculo foi encerrado — alimenta o churn."
                  : "Informe a data de desfiliação para registrar o motivo."}
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" asChild>
            <Link href={`/painel/filiados/${filiadoId}`}>Cancelar</Link>
          </Button>
          <Button type="submit" disabled={pendente}>
            {pendente && <Loader2 className="animate-spin" />}
            {vinculo ? "Salvar alterações" : "Adicionar vínculo"}
          </Button>
        </div>
      </form>


    </div>
  )
}
