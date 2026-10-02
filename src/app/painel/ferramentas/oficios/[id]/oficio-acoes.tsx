"use client"

import { useActionState, useState } from "react"
import { Ban, Check, Loader2, Plus, Send, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { type EstadoForm } from "@/lib/contas"
import { type CandidatoFiliado } from "@/lib/db/oficios"
import { formatarData } from "@/lib/formato"
import { MOTIVO_CANCELAMENTO_MIN } from "@/lib/oficios-constantes"

import {
  adicionarCandidatosAction,
  adicionarManualAction,
  cancelarOficioAction,
  emitirOficioAction,
  removerFiliadoAction,
} from "../actions"

const INPUT =
  "border-input bg-background text-foreground h-9 rounded-md border px-3 text-sm shadow-xs outline-none"

export function EmitirOficio({
  oficioId,
  proximoNumero,
}: {
  oficioId: string
  proximoNumero: number
}) {
  const [estado, formAction, pendente] = useActionState<EstadoForm, FormData>(
    emitirOficioAction,
    {}
  )
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="oficio_id" value={oficioId} />
      {/* Número não se edita: é o último do ano + 1, atribuído na emissão. */}
      <div className="grid gap-1 text-xs">
        Número
        <span className={`${INPUT} bg-muted/40 flex w-28 items-center tabular-nums`}>
          {proximoNumero}
          <span className="text-muted-foreground ml-1">(previsto)</span>
        </span>
      </div>
      <Button type="submit" disabled={pendente}>
        {pendente ? <Loader2 className="animate-spin" /> : <Send />}
        Emitir
      </Button>
      {estado.erro && (
        <p className="text-destructive w-full text-sm">{estado.erro}</p>
      )}
    </form>
  )
}

/**
 * Cancelar o ofício — em qualquer situação, inclusive emitido e assinado.
 * Pede o motivo (vai para o registro, para a trilha da assinatura e, se
 * houver assinatura eletrônica, para a página pública de verificação) e
 * explica antes o que acontece.
 */
export function CancelarOficio({
  oficioId,
  numero,
  situacao,
  assinadoEletronicamente,
  pessoasQueVoltam,
  liberacoes,
}: {
  oficioId: string
  /** "12/2026", ou null no rascunho sem número. */
  numero: string | null
  situacao: string | null
  assinadoEletronicamente: boolean
  /** Filiação/desfiliação: nomes que voltam à lista de pendentes da fonte. */
  pessoasQueVoltam: number
  /** Liberações sindicais registradas com este ofício. */
  liberacoes: number
}) {
  const [estado, formAction, pendente] = useActionState<EstadoForm, FormData>(
    cancelarOficioAction,
    {}
  )
  const [aberto, setAberto] = useState(false)
  const [motivo, setMotivo] = useState("")
  const emitido = situacao === "Emitido"
  const curto = motivo.trim().length < MOTIVO_CANCELAMENTO_MIN

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="text-destructive hover:text-destructive">
          <Ban />
          Cancelar ofício
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancelar o ofício{numero ? ` ${numero}` : ""}?</DialogTitle>
          <DialogDescription>
            O cancelamento não se desfaz. O ofício continua na lista, marcado como cancelado
            {numero ? ", e o número não volta a ser usado" : ""}.
          </DialogDescription>
        </DialogHeader>

        <ul className="text-muted-foreground grid list-disc gap-1.5 pl-5 text-sm">
          {assinadoEletronicamente ? (
            <>
              <li>
                A <strong className="text-foreground">assinatura eletrônica não é apagada</strong>: o
                certificado, o resumo do conteúdo e o PDF assinado ficam guardados como estão.
              </li>
              <li>
                A página de verificação (o QR Code) passa a mostrar, em destaque, que o ofício foi
                cancelado depois de assinado — com a data e{" "}
                <strong className="text-foreground">o motivo, que fica público</strong> para quem tiver
                o código.
              </li>
              <li>O assinante e quem enviou para assinatura são avisados.</li>
            </>
          ) : situacao === "Aguardando assinatura" ? (
            <li>O link de assinatura deixa de valer na hora.</li>
          ) : emitido ? (
            <li>O PDF assinado à mão, se anexado, continua guardado.</li>
          ) : null}
          {emitido && <li>O PDF baixado daqui em diante sai com a tarja “CANCELADO”.</li>}
          {pessoasQueVoltam > 0 && (
            <li>
              {pessoasQueVoltam === 1 ? "O nome da lista volta" : `Os ${pessoasQueVoltam} nomes da lista voltam`} a
              aparecer como pendentes desta fonte pagadora, para entrar num novo ofício.
            </li>
          )}
          {liberacoes > 0 && (
            <li>
              {liberacoes === 1 ? "A liberação sindical registrada" : `As ${liberacoes} liberações sindicais registradas`}{" "}
              com este ofício continuam no mandato — revise em Institucional › Diretoria.
            </li>
          )}
        </ul>

        <form action={formAction} className="grid gap-3">
          <input type="hidden" name="oficio_id" value={oficioId} />
          <div className="grid gap-1.5">
            <Label htmlFor="motivo-cancelar-oficio">Motivo do cancelamento</Label>
            <Textarea
              id="motivo-cancelar-oficio"
              name="motivo"
              required
              minLength={MOTIVO_CANCELAMENTO_MIN}
              rows={3}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Ex.: emitido em duplicidade com o Ofício 14/2026"
            />
            <p className="text-muted-foreground text-xs">
              Pelo menos {MOTIVO_CANCELAMENTO_MIN} caracteres.
              {assinadoEletronicamente && " Aparece na página pública de verificação."}
            </p>
          </div>
          {estado.erro && <p className="text-destructive text-sm">{estado.erro}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setAberto(false)}>
              Voltar
            </Button>
            <Button type="submit" variant="destructive" disabled={pendente || curto}>
              {pendente ? <Loader2 className="animate-spin" /> : <Ban />}
              Confirmar cancelamento
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function AdicionarManual({ oficioId }: { oficioId: string }) {
  const [estado, formAction, pendente] = useActionState<EstadoForm, FormData>(
    adicionarManualAction,
    {}
  )
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2">
      <input type="hidden" name="oficio_id" value={oficioId} />
      <label className="grid gap-1 text-xs">
        Nome
        <input name="nome" required className={`${INPUT} w-64`} />
      </label>
      <label className="grid gap-1 text-xs">
        Matrícula
        <input name="matricula" className={`${INPUT} w-40`} />
      </label>
      <Button type="submit" size="sm" variant="outline" disabled={pendente}>
        {pendente ? <Loader2 className="animate-spin" /> : <Plus />}
        Adicionar
      </Button>
      {estado.erro && (
        <p className="text-destructive w-full text-sm">{estado.erro}</p>
      )}
    </form>
  )
}

export function RemoverFiliado({
  filiadoId,
  oficioId,
}: {
  filiadoId: string
  oficioId: string
}) {
  const [, formAction, pendente] = useActionState<EstadoForm, FormData>(
    removerFiliadoAction,
    {}
  )
  return (
    <form action={formAction}>
      <input type="hidden" name="filiado_id" value={filiadoId} />
      <input type="hidden" name="oficio_id" value={oficioId} />
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        disabled={pendente}
        aria-label="Remover"
      >
        {pendente ? (
          <Loader2 className="animate-spin" />
        ) : (
          <Trash2 className="text-destructive" />
        )}
      </Button>
    </form>
  )
}

export function CandidatosForm({
  oficioId,
  empresaId,
  tipo,
  candidatos,
}: {
  oficioId: string
  empresaId: string
  tipo: string
  candidatos: CandidatoFiliado[]
}) {
  const [estado, formAction, pendente] = useActionState<EstadoForm, FormData>(
    adicionarCandidatosAction,
    {}
  )

  if (candidatos.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Nenhum {tipo === "desfiliacao" ? "desfiliado" : "filiado"} pendente
        nesta fonte pagadora.
      </p>
    )
  }

  return (
    <form action={formAction} className="grid gap-2">
      <input type="hidden" name="oficio_id" value={oficioId} />
      <input type="hidden" name="empresa_id" value={empresaId} />
      <input type="hidden" name="tipo" value={tipo} />
      <div className="max-h-72 overflow-y-auto rounded-md border">
        {candidatos.map((c) => (
          <label
            key={c.vinculoId}
            className="hover:bg-muted/50 flex items-center gap-3 border-b px-3 py-2 text-sm last:border-b-0"
          >
            <input type="checkbox" name="sel" value={c.vinculoId} className="size-4" />
            <span className="flex-1">{c.nome ?? "(sem nome)"}</span>
            {c.matricula && (
              <span className="text-muted-foreground tabular-nums">
                mat. {c.matricula}
              </span>
            )}
            <span className="text-muted-foreground text-xs">
              {c.data ? formatarData(c.data) : ""}
            </span>
          </label>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Check />}
          Adicionar selecionados
        </Button>
        {estado.erro && <span className="text-destructive text-sm">{estado.erro}</span>}
        {estado.ok && (
          <span className="text-success-fg text-sm">{estado.ok}</span>
        )}
      </div>
    </form>
  )
}
