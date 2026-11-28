"use client"

import { useActionState } from "react"
import { FileUp, Loader2, Trash2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { confirmarEnvio } from "@/components/ui/confirmacao"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SelectNativo } from "@/components/ui/select-nativo"
import { useEnvioFormulario } from "@/hooks/use-envio-formulario"
import { type EstadoForm } from "@/lib/contas"

import {
  apagarFaturaAction,
  casarLinhaAction,
  conferirFaturaAction,
  incluirDaFaturaAction,
  incluirSugeridosAction,
  lancarCopartAction,
  lerFaturaAction,
} from "./actions"

function Retorno({ estado }: { estado: EstadoForm }) {
  if (estado.erro)
    return (
      <Alert variant="destructive">
        <AlertDescription>{estado.erro}</AlertDescription>
      </Alert>
    )
  if (estado.ok) return <p className="text-success-fg text-sm">{estado.ok}</p>
  return null
}

export function LerFaturaForm({ contratoId, competencia, substituir }: { contratoId: string; competencia: string; substituir: boolean }) {
  const [estado, formAction, pendente] = useActionState(lerFaturaAction, {})
  const envio = useEnvioFormulario(
    formAction,
    estado,
    substituir ? { antes: (e) => confirmarEnvio(e, "Ler de novo substitui a fatura deste mês (e as linhas casadas à mão). Continuar?") } : {}
  )
  return (
    <form action={formAction} {...envio} className="grid gap-3">
      <Retorno estado={estado} />
      <input type="hidden" name="contrato_id" value={contratoId} />
      <input type="hidden" name="competencia" value={competencia} />
      <div className="grid gap-1.5">
        <Label htmlFor="fatura-arquivo">Arquivo da fatura (PDF, planilha, CSV ou foto; até 4 MB)</Label>
        <Input id="fatura-arquivo" name="arquivo" type="file" accept=".pdf,.xlsx,.xls,.ods,.csv,.txt,image/jpeg,image/png,image/webp" required />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <FileUp />}
          {substituir ? "Ler de novo" : "Ler a fatura"}
        </Button>
        {pendente && <span className="text-muted-foreground text-sm">Lendo a fatura com a IA… pode levar um minuto.</span>}
      </div>
    </form>
  )
}

export function CasarLinhaForm({
  faturaId,
  indice,
  atual,
  opcoes,
}: {
  faturaId: string
  indice: number
  atual: string | null
  opcoes: { id: string; nome: string }[]
}) {
  const [estado, formAction, pendente] = useActionState(casarLinhaAction, {})
  const envio = useEnvioFormulario(formAction, estado)
  return (
    <form action={formAction} {...envio} className="flex flex-wrap items-center gap-1.5">
      <input type="hidden" name="fatura_id" value={faturaId} />
      <input type="hidden" name="indice" value={indice} />
      <SelectNativo name="beneficiario_id" defaultValue={atual ?? ""} aria-label="Beneficiário desta linha" className="h-7 max-w-56 text-xs">
        <option value="">Ninguém (não é do plano)</option>
        {opcoes.map((o) => (
          <option key={o.id} value={o.id}>
            {o.nome}
          </option>
        ))}
      </SelectNativo>
      <Button type="submit" variant="outline" size="sm" disabled={pendente}>
        {pendente ? <Loader2 className="animate-spin" /> : "Casar"}
      </Button>
      {estado.erro && <span className="text-destructive text-xs">{estado.erro}</span>}
    </form>
  )
}

export function LancarCopartForm({ contratoId, competencia, resumo }: { contratoId: string; competencia: string; resumo: string }) {
  const [estado, formAction, pendente] = useActionState(lancarCopartAction, {})
  const envio = useEnvioFormulario(formAction, estado, {
    antes: (e) => confirmarEnvio(e, `Lançar a coparticipação da fatura no mês (${resumo})? O valor já lançado de cada titular é substituído.`),
  })
  return (
    <form action={formAction} {...envio} className="grid gap-2">
      <Retorno estado={estado} />
      <input type="hidden" name="contrato_id" value={contratoId} />
      <input type="hidden" name="competencia" value={competencia} />
      <div>
        <Button type="submit" variant="outline" disabled={pendente}>
          {pendente && <Loader2 className="animate-spin" />}
          Lançar a coparticipação da fatura
        </Button>
      </div>
    </form>
  )
}

export function ConferirFaturaForm({ faturaId, conferida }: { faturaId: string; conferida: boolean }) {
  const [estado, formAction, pendente] = useActionState(conferirFaturaAction, {})
  const envio = useEnvioFormulario(formAction, estado)
  return (
    <form action={formAction} {...envio} className="grid gap-2">
      <Retorno estado={estado} />
      <input type="hidden" name="fatura_id" value={faturaId} />
      {conferida ? (
        <>
          <input type="hidden" name="desfazer" value="1" />
          <div>
            <Button type="submit" variant="ghost" size="sm" disabled={pendente}>
              Desfazer a conferência
            </Button>
          </div>
        </>
      ) : (
        <div className="flex flex-wrap items-end gap-2">
          <div className="grid min-w-64 flex-1 gap-1.5">
            <Label htmlFor="fatura-obs">Observação (opcional)</Label>
            <Input id="fatura-obs" name="observacao" placeholder="Ex.: diferença do pró-rata de inclusão, combinada com a operadora" />
          </div>
          <Button type="submit" disabled={pendente}>
            {pendente && <Loader2 className="animate-spin" />}
            Marcar como conferida
          </Button>
        </div>
      )}
    </form>
  )
}

export function ApagarFaturaBotao({ faturaId }: { faturaId: string }) {
  const [estado, formAction, pendente] = useActionState(apagarFaturaAction, {})
  const envio = useEnvioFormulario(formAction, estado, { antes: (e) => confirmarEnvio(e, "Apagar a leitura desta fatura?") })
  return (
    <form action={formAction} {...envio} className="inline">
      <input type="hidden" name="fatura_id" value={faturaId} />
      <Button type="submit" variant="ghost" size="sm" disabled={pendente}>
        {pendente ? <Loader2 className="animate-spin" /> : <Trash2 />}
        Apagar a leitura
      </Button>
      {estado.erro && <span className="text-destructive text-xs">{estado.erro}</span>}
    </form>
  )
}

type Produto = { id: string; nome: string }

/** Produto (escolha só se houver mais de um) e data de inclusão. */
function ProdutoEInclusao({ produtos, inclusao, compacto }: { produtos: Produto[]; inclusao: string; compacto?: boolean }) {
  const classe = compacto ? "h-7 text-xs" : ""
  return (
    <>
      {produtos.length === 1 ? (
        <input type="hidden" name="produto_id" value={produtos[0].id} />
      ) : (
        <SelectNativo name="produto_id" defaultValue="" aria-label="Produto" className={`${classe} max-w-40`} required>
          <option value="">Produto…</option>
          {produtos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome}
            </option>
          ))}
        </SelectNativo>
      )}
      <Input type="date" name="inclusao" defaultValue={inclusao} aria-label="Inclusão no plano" className={`${classe} w-36`} required />
    </>
  )
}

export function IncluirLinhaForm({
  faturaId,
  contratoId,
  indice,
  sugerida,
  pessoas,
  produtos,
  inclusao,
}: {
  faturaId: string
  contratoId: string
  indice: number
  sugerida: string | null
  pessoas: { chave: string; nome: string; rotulo: string }[]
  produtos: Produto[]
  inclusao: string
}) {
  const [estado, formAction, pendente] = useActionState(incluirDaFaturaAction, {})
  const envio = useEnvioFormulario(formAction, estado)
  return (
    <form action={formAction} {...envio} className="flex flex-wrap items-center gap-1.5">
      <input type="hidden" name="fatura_id" value={faturaId} />
      <input type="hidden" name="contrato_id" value={contratoId} />
      <input type="hidden" name="indice" value={indice} />
      <SelectNativo name="pessoa" defaultValue={sugerida ?? ""} aria-label="Quem é" className="h-7 max-w-64 text-xs" required>
        <option value="">Quem é?</option>
        {pessoas.map((p) => (
          <option key={p.chave} value={p.chave}>
            {p.nome} ({p.rotulo})
          </option>
        ))}
      </SelectNativo>
      <ProdutoEInclusao produtos={produtos} inclusao={inclusao} compacto />
      <Button type="submit" variant="outline" size="sm" disabled={pendente}>
        {pendente ? <Loader2 className="animate-spin" /> : "Incluir"}
      </Button>
      {estado.erro && <span className="text-destructive text-xs">{estado.erro}</span>}
    </form>
  )
}

export function IncluirSugeridosForm({
  faturaId,
  contratoId,
  sugeridos,
  produtos,
  inclusao,
}: {
  faturaId: string
  contratoId: string
  sugeridos: number
  produtos: Produto[]
  inclusao: string
}) {
  const [estado, formAction, pendente] = useActionState(incluirSugeridosAction, {})
  const envio = useEnvioFormulario(formAction, estado, {
    antes: (e) => confirmarEnvio(e, `Incluir no plano as ${sugeridos} pessoas sugeridas pelo nome? Confira antes a lista ao lado de cada linha.`),
  })
  return (
    <form action={formAction} {...envio} className="grid gap-2">
      <Retorno estado={estado} />
      <input type="hidden" name="fatura_id" value={faturaId} />
      <input type="hidden" name="contrato_id" value={contratoId} />
      <div className="flex flex-wrap items-center gap-2">
        <ProdutoEInclusao produtos={produtos} inclusao={inclusao} />
        <Button type="submit" disabled={pendente || sugeridos === 0}>
          {pendente && <Loader2 className="animate-spin" />}
          Incluir os {sugeridos} sugeridos
        </Button>
      </div>
    </form>
  )
}
