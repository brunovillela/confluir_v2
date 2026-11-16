"use client"

import { Fragment, useActionState, useState } from "react"
import { Loader2, Pencil, Plus, RotateCcw, Save, Trash2, X } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { confirmar, type OpcoesConfirmacao } from "@/components/ui/confirmacao"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { EstadoForm } from "@/lib/contas"

import { desfazerAjusteDiaAction, salvarDiaMarcacaoAction } from "../../../marcacoes-actions"

export type DiaEdicao = {
  data: string
  diaSemana: string
  ocorrencia: string | null
  marcacoes: string[]
  trabalhadoMin: number
  intervaloMin: number | null
  alertas: string[]
  ajustado: boolean
  /** Texto do que o espelho trazia, para o título do selo "Ajustado". */
  original: string | null
}

/**
 * Pergunta antes de enviar: na 1ª passada cancela o envio e abre o diálogo; se
 * confirmado, reenvia pelo mesmo botão com a marca `confirmado` (2ª passada segue).
 */
function confirmarAntes(e: React.FormEvent<HTMLFormElement>, botao: HTMLButtonElement | null, opcoes: OpcoesConfirmacao) {
  const form = e.currentTarget
  if (form.dataset.confirmado) {
    delete form.dataset.confirmado
    return
  }
  e.preventDefault()
  void confirmar(opcoes).then((ok) => {
    if (!ok) return
    form.dataset.confirmado = "1"
    form.requestSubmit(botao ?? undefined)
  })
}

const hm = (min: number) => `${Math.floor(min / 60)}h${String(min % 60).padStart(2, "0")}`
const ddmm = (data: string) => data.split("-").reverse().slice(0, 2).join("/")

/** O mês dia a dia, com corrigir, incluir, retirar e desfazer cada dia. */
export function MarcacoesEdicao({
  registroId,
  competencia,
  dias,
}: {
  registroId: string
  /** AAAA-MM: o dia incluído precisa ser deste mês. */
  competencia: string
  dias: DiaEdicao[]
}) {
  const [editando, setEditando] = useState<string | null>(null)
  const [incluindo, setIncluindo] = useState(false)

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground text-xs">
          Corrija um dia lido errado ou inclua um que faltou. As horas lançadas no registro não mudam: as marcações
          alimentam os alertas e os indicadores.
        </p>
        {!incluindo && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setEditando(null)
              setIncluindo(true)
            }}
          >
            <Plus />
            Incluir dia
          </Button>
        )}
      </div>

      {incluindo && (
        <div className="rounded-md border p-3">
          <FormDia
            registroId={registroId}
            competencia={competencia}
            novo
            existentes={dias.map((d) => d.data)}
            aoTerminar={() => setIncluindo(false)}
          />
        </div>
      )}

      {dias.length > 0 && (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Dia</TableHead>
                <TableHead>Batidas</TableHead>
                <TableHead className="text-right">Trabalhado</TableHead>
                <TableHead className="text-right">Intervalo</TableHead>
                <TableHead>Alertas</TableHead>
                <TableHead className="w-24">
                  <span className="sr-only">Ações</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dias.map((d) => (
                <Fragment key={d.data}>
                  <TableRow className={d.alertas.length ? "bg-warning/5" : d.marcacoes.length ? "" : "text-muted-foreground"}>
                    <TableCell className="whitespace-nowrap tabular-nums">
                      {ddmm(d.data)} {d.diaSemana}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {d.marcacoes.length ? d.marcacoes.join("  ") : (d.ocorrencia ?? "—")}
                      {d.marcacoes.length > 0 && d.ocorrencia && (
                        <span className="text-muted-foreground ml-2 text-xs">{d.ocorrencia}</span>
                      )}
                      {d.ajustado && (
                        <Badge variant="info" className="ml-2" title={d.original ? `No espelho: ${d.original}` : "Dia incluído à mão"}>
                          {d.original ? "Ajustado" : "Incluído"}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{d.trabalhadoMin ? hm(d.trabalhadoMin) : "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{d.intervaloMin !== null ? hm(d.intervaloMin) : "—"}</TableCell>
                    <TableCell className="whitespace-normal">
                      <div className="flex flex-wrap gap-1">
                        {d.alertas.map((a) => (
                          <Badge key={a} variant="warning">
                            {a}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      {editando !== d.data && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          aria-label={`Ajustar ${ddmm(d.data)}`}
                          title="Ajustar"
                          onClick={() => {
                            setIncluindo(false)
                            setEditando(d.data)
                          }}
                        >
                          <Pencil />
                        </Button>
                      )}
                      {d.ajustado && <DesfazerBotao registroId={registroId} data={d.data} incluido={!d.original} />}
                    </TableCell>
                  </TableRow>
                  {editando === d.data && (
                    <TableRow>
                      <TableCell colSpan={6} className="bg-muted/30">
                        <FormDia registroId={registroId} competencia={competencia} dia={d} aoTerminar={() => setEditando(null)} />
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}

function FormDia({
  registroId,
  competencia,
  dia,
  novo = false,
  existentes = [],
  aoTerminar,
}: {
  registroId: string
  competencia: string
  dia?: DiaEdicao
  novo?: boolean
  existentes?: string[]
  aoTerminar: () => void
}) {
  // O React 19 limpa o formulário depois da ação: o que foi digitado vira o valor padrão (volta após o reset).
  const [valores, setValores] = useState<Record<string, string>>({})
  const [estado, formAction, pendente] = useActionState<EstadoForm, FormData>(async (anterior, dados) => {
    setValores(Object.fromEntries([...dados.entries()].map(([k, v]) => [k, String(v)])))
    const r = await salvarDiaMarcacaoAction(anterior, dados)
    if (r.ok) {
      toast.success(r.ok)
      aoTerminar()
    }
    return r
  }, {})
  const [ano, mes] = competencia.split("-").map(Number)
  const ultimo = new Date(Date.UTC(ano, mes, 0)).toISOString().slice(0, 10)
  const id = dia?.data ?? "novo"

  return (
    <form
      action={formAction}
      className="grid gap-3"
      onSubmit={(e) => {
        // Retirar pede confirmação ANTES da ação (dentro dela o diálogo só abriria no fim).
        const botao = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null
        if (botao?.name !== "retirar") return
        confirmarAntes(e, botao, {
          titulo: `Retirar o dia ${dia ? ddmm(dia.data) : ""}?`,
          descricao: "O dia sai das marcações e dos alertas. Fica no histórico de ajustes e pode ser desfeito.",
          confirmar: "Retirar",
          destrutivo: true,
        })
      }}
    >
      <input type="hidden" name="registro_id" value={registroId} />
      <input type="hidden" name="competencia" value={competencia} />
      {!novo && <input type="hidden" name="data" value={dia!.data} />}
      <div className={`grid gap-3 ${novo ? "sm:grid-cols-[10rem_1fr_12rem]" : "sm:grid-cols-[1fr_12rem]"}`}>
        {novo && (
          <div className="grid gap-1">
            <Label htmlFor={`m-data-${id}`}>Dia</Label>
            <Input
              id={`m-data-${id}`}
              name="data"
              type="date"
              min={`${competencia}-01`}
              max={ultimo}
              defaultValue={valores.data ?? ""}
              required
            />
            {existentes.length > 0 && (
              <span className="text-muted-foreground text-xs">Dia que já está na lista é substituído.</span>
            )}
          </div>
        )}
        <div className="grid gap-1">
          <Label htmlFor={`m-batidas-${id}`}>Batidas</Label>
          <Input
            id={`m-batidas-${id}`}
            name="batidas"
            defaultValue={valores.batidas ?? dia?.marcacoes.join(" ") ?? ""}
            placeholder="08:00 12:00 13:00 17:00"
            autoComplete="off"
            autoFocus
          />
          <span className="text-muted-foreground text-xs">Na ordem: entrada, saída, entrada, saída… separadas por espaço.</span>
        </div>
        <div className="grid gap-1">
          <Label htmlFor={`m-oc-${id}`}>Ocorrência</Label>
          <Input
            id={`m-oc-${id}`}
            name="ocorrencia"
            defaultValue={valores.ocorrencia ?? dia?.ocorrencia ?? ""}
            placeholder="Folga, Feriado, Atestado…"
            maxLength={60}
          />
        </div>
      </div>
      <div className="grid gap-1">
        <Label htmlFor={`m-motivo-${id}`}>Motivo (opcional)</Label>
        <Input
          id={`m-motivo-${id}`}
          name="motivo"
          maxLength={300}
          defaultValue={valores.motivo ?? ""}
          placeholder="Ex.: a IA trocou 17:30 por 11:30; conferido no espelho"
        />
      </div>
      {estado.erro && <p className="text-destructive text-sm">{estado.erro}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Save />}
          {novo ? "Incluir" : "Salvar"}
        </Button>
        {!novo && (
          <Button type="submit" size="sm" variant="outline" name="retirar" value="1" disabled={pendente}>
            <Trash2 />
            Retirar o dia
          </Button>
        )}
        <Button type="button" size="sm" variant="ghost" onClick={aoTerminar} disabled={pendente}>
          <X />
          Cancelar
        </Button>
      </div>
    </form>
  )
}

/** Volta o dia ao que o espelho trazia (com `rotulo`, botão com texto — no histórico, para o dia retirado). */
export function DesfazerBotao({
  registroId,
  data,
  incluido,
  rotulo,
}: {
  registroId: string
  data: string
  incluido: boolean
  rotulo?: string
}) {
  const [, formAction, pendente] = useActionState<EstadoForm, FormData>(async (anterior, dados) => {
    const r = await desfazerAjusteDiaAction(anterior, dados)
    if (r.ok) toast.success(r.ok)
    if (r.erro) toast.error(r.erro)
    return r
  }, {})
  return (
    <form
      action={formAction}
      className="inline"
      onSubmit={(e) =>
        confirmarAntes(e, (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null, {
          titulo: incluido ? `Desfazer a inclusão de ${ddmm(data)}?` : `Desfazer o ajuste de ${ddmm(data)}?`,
          descricao: incluido
            ? "O dia sai das marcações, como era antes de ser incluído."
            : "O dia volta a ter o que o espelho trazia. O ajuste fica no histórico.",
          confirmar: "Desfazer",
        })
      }
    >
      <input type="hidden" name="registro_id" value={registroId} />
      <input type="hidden" name="data" value={data} />
      {rotulo ? (
        <Button type="submit" variant="outline" size="sm" className="mt-1" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <RotateCcw />}
          {rotulo}
        </Button>
      ) : (
        <Button
          type="submit"
          variant="ghost"
          size="icon"
          className="size-8"
          aria-label={`Desfazer ajuste de ${ddmm(data)}`}
          title="Voltar ao que o espelho trazia"
          disabled={pendente}
        >
          {pendente ? <Loader2 className="animate-spin" /> : <RotateCcw />}
        </Button>
      )}
    </form>
  )
}
