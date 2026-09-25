"use client"

import { useActionState, useState, type ReactNode } from "react"
import { Ban, CircleCheck, Loader2, Pencil, Play, Save, X } from "lucide-react"

import { EmpresaCombobox, type EmpresaOpcao } from "@/components/empresa-combobox"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { type EstadoForm } from "@/lib/contas"
import type { SituacaoViagem } from "@/lib/viagens-constantes"

import {
  concluirAtendimentoAction,
  encerrarViagemAction,
  iniciarAtendimentoAction,
  salvarReservaAction,
} from "../actions"

function Retorno({ estado }: { estado: EstadoForm }) {
  if (estado.erro) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{estado.erro}</AlertDescription>
      </Alert>
    )
  }
  if (estado.ok) {
    return (
      <Alert variant="success">
        <AlertDescription>{estado.ok}</AlertDescription>
      </Alert>
    )
  }
  return null
}

/**
 * Barra de ações da viagem: iniciar, concluir e avisar, recusar, cancelar.
 * Recusar e cancelar pedem motivo — ele vai no e-mail.
 */
export function AcoesViagem({
  id,
  situacao,
  pendentes,
}: {
  id: string
  situacao: SituacaoViagem
  /** Itens ainda sem reserva registrada. */
  pendentes: number
}) {
  const [iniciar, acaoIniciar, iniciando] = useActionState(iniciarAtendimentoAction, {})
  const [concluir, acaoConcluir, concluindo] = useActionState(concluirAtendimentoAction, {})
  const [encerrar, acaoEncerrar, encerrando] = useActionState(encerrarViagemAction, {})
  const [motivoPara, setMotivoPara] = useState<"recusada" | "cancelada" | null>(null)

  const aberta = situacao === "solicitada" || situacao === "em_atendimento"
  const encerrada = situacao === "cancelada" || situacao === "recusada"
  if (encerrada) return null

  return (
    <div className="grid gap-3">
      {/* Só o retorno da ação mais adiantada — "iniciado" não fica por cima de "atendida". */}
      <Retorno
        estado={
          encerrar.erro || encerrar.ok ? encerrar : concluir.erro || concluir.ok ? concluir : iniciar
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        {situacao === "solicitada" && (
          <form action={acaoIniciar}>
            <input type="hidden" name="id" value={id} />
            <Button type="submit" variant="outline" disabled={iniciando}>
              {iniciando ? <Loader2 className="animate-spin" /> : <Play />}
              Iniciar atendimento
            </Button>
          </form>
        )}
        {aberta && (
          <form
            action={acaoConcluir}
            onSubmit={(e) => {
              if (!confirm("Concluir o atendimento e enviar o aviso por e-mail?")) {
                e.preventDefault()
              }
            }}
          >
            <input type="hidden" name="id" value={id} />
            <Button type="submit" disabled={concluindo || pendentes > 0}>
              {concluindo ? <Loader2 className="animate-spin" /> : <CircleCheck />}
              Concluir e avisar
            </Button>
          </form>
        )}
        {aberta && (
          <Button
            type="button"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={() => setMotivoPara("recusada")}
          >
            <Ban />
            Recusar
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          className="text-destructive hover:text-destructive"
          onClick={() => setMotivoPara("cancelada")}
        >
          <X />
          Cancelar viagem
        </Button>
      </div>
      {aberta && pendentes > 0 && (
        <p className="text-muted-foreground text-xs">
          Para concluir, registre a reserva de {pendentes === 1 ? "1 item" : `${pendentes} itens`}{" "}
          (lápis de cada item).
        </p>
      )}

      {motivoPara && (
        <form action={acaoEncerrar} className="grid gap-2 rounded-lg border p-4">
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="como" value={motivoPara} />
          <Label htmlFor="motivo_encerrar">
            {motivoPara === "recusada" ? "Motivo da recusa *" : "Motivo do cancelamento *"}
          </Label>
          <Textarea
            id="motivo_encerrar"
            name="motivo"
            rows={2}
            required
            placeholder="Vai no e-mail para quem viaja e para quem pediu."
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setMotivoPara(null)}>
              Voltar
            </Button>
            <Button type="submit" variant="destructive" disabled={encerrando}>
              {encerrando && <Loader2 className="animate-spin" />}
              {motivoPara === "recusada" ? "Recusar e avisar" : "Cancelar e avisar"}
            </Button>
          </div>
        </form>
      )}
    </div>
  )
}

/**
 * Cartão de um item na gestão. Diferente do CartaoEditavel, o pedido continua
 * à vista enquanto a reserva é preenchida — é dele que a equipe copia os dados.
 */
export function ItemAtendimento({
  titulo,
  reservado,
  editavel,
  resumo,
  children,
}: {
  titulo: ReactNode
  reservado: boolean
  editavel: boolean
  resumo: ReactNode
  children: ReactNode
}) {
  const [editando, setEditando] = useState(false)
  return (
    <div className="rounded-lg border p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {titulo}
          {!reservado && editavel && (
            <span className="border-warning/40 text-warning-fg rounded-full border px-2 py-0.5 text-xs">
              Falta reservar
            </span>
          )}
        </div>
        {editavel && (
          <Button
            variant={editando || reservado ? "ghost" : "outline"}
            size="sm"
            onClick={() => setEditando((v) => !v)}
            aria-label={editando ? "Fechar a reserva" : "Registrar a reserva"}
          >
            {editando ? <X /> : <Pencil />}
            {!editando && !reservado && "Registrar reserva"}
          </Button>
        )}
      </div>
      {resumo}
      {editando && children}
    </div>
  )
}

/** Registrar (ou corrigir) a reserva de um item. */
export function ReservaItemForm({
  item,
  fornecedores,
  temVoucher,
  tipo,
}: {
  item: {
    id: string
    fornecedorId: string | null
    localizador: string | null
    reservaDescricao: string | null
    valor: number | null
  }
  fornecedores: EmpresaOpcao[]
  temVoucher: boolean
  tipo: "passagem" | "hospedagem"
}) {
  const [estado, formAction, pendente] = useActionState(salvarReservaAction, {})

  return (
    <form action={formAction} className="mt-4 grid gap-4 border-t pt-4">
      <Retorno estado={estado} />
      <input type="hidden" name="item_id" value={item.id} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5 sm:col-span-2">
          <Label>Agência ou operadora</Label>
          <EmpresaCombobox
            empresas={fornecedores}
            name="fornecedor_id"
            defaultId={item.fornecedorId ?? undefined}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`localizador-${item.id}`}>Localizador</Label>
          <Input
            id={`localizador-${item.id}`}
            name="localizador"
            defaultValue={item.localizador ?? ""}
            placeholder={tipo === "passagem" ? "Ex.: XPTO12" : "Nº da reserva"}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`valor-${item.id}`}>Valor (R$)</Label>
          <Input
            id={`valor-${item.id}`}
            name="valor"
            inputMode="decimal"
            placeholder="0,00"
            defaultValue={
              item.valor !== null ? item.valor.toFixed(2).replace(".", ",") : ""
            }
          />
        </div>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor={`reserva-${item.id}`}>Detalhes da reserva</Label>
          <Textarea
            id={`reserva-${item.id}`}
            name="reserva_descricao"
            rows={3}
            defaultValue={item.reservaDescricao ?? ""}
            placeholder={
              tipo === "passagem"
                ? "Ex.: Gol G3 1234 — sai 08:15 do Galeão, chega 09:55 em Brasília. 1 mala de 23 kg."
                : "Ex.: Hotel Central, Setor Hoteleiro Sul Q. 3 — café incluso, check-in a partir das 14h."
            }
          />
          <p className="text-muted-foreground text-xs">
            Vai no e-mail para quem viaja. Informe o localizador ou os detalhes (ou os dois).
          </p>
        </div>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor={`voucher-${item.id}`}>
            {tipo === "passagem" ? "Bilhete (PDF)" : "Voucher (PDF)"}
          </Label>
          <Input id={`voucher-${item.id}`} name="voucher" type="file" accept="application/pdf" />
          {temVoucher && (
            <label className="text-muted-foreground flex items-center gap-2 text-xs">
              <input type="checkbox" name="remover_voucher" className="size-3.5" />
              Remover o arquivo atual
            </label>
          )}
        </div>
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Save />}
          Gravar reserva
        </Button>
      </div>
    </form>
  )
}
