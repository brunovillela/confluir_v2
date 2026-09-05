"use client"

import { useActionState, useState } from "react"
import { ClipboardCheck, Loader2, Plus, Save, Trash2 } from "lucide-react"

import { CartaoEditavel } from "@/components/cartao-editavel"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

import {
  registrarChecklist,
  removerItem,
  salvarConfig,
  salvarItem,
  salvarRecorrenciaVeiculo,
} from "./actions"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

export type ItemForm = {
  id: string
  categoria: string
  itens_verificar: string | null
  proposito: string | null
  ordem: number
  ativo: boolean
}

export type VeiculoOpcao = { id: string; rotulo: string; vencido: boolean }

// ── Realizar o checklist ─────────────────────────────────────────────────────

const SITUACOES = [
  { valor: "conforme", rotulo: "Conforme" },
  { valor: "nao_conforme", rotulo: "Não conforme" },
  { valor: "nao_aplica", rotulo: "Não se aplica" },
] as const

/**
 * Um item do checklist. O propósito fica visível porque é o que transforma a
 * conferência em algo consciente — quem sabe que está prevenindo fundição de
 * motor olha o óleo de outro jeito.
 */
function ItemVerificacao({ item }: { item: ItemForm }) {
  const [situacao, setSituacao] = useState<string>("")

  return (
    <div className="grid gap-3 rounded-md border p-4">
      <div className="grid gap-1">
        <span className="font-medium">{item.categoria}</span>
        {item.itens_verificar && (
          <span className="text-sm">{item.itens_verificar}</span>
        )}
        {item.proposito && (
          <span className="text-muted-foreground text-xs">
            Previne: {item.proposito}
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {SITUACOES.map((s) => (
          <label
            key={s.valor}
            className={`cursor-pointer rounded-md border px-3 py-1.5 text-sm ${
              situacao === s.valor
                ? s.valor === "nao_conforme"
                  ? "border-destructive bg-destructive/10 font-medium"
                  : "bg-muted font-medium"
                : "hover:bg-muted/50"
            }`}
          >
            <input
              type="radio"
              name={`situacao_${item.id}`}
              value={s.valor}
              checked={situacao === s.valor}
              onChange={() => setSituacao(s.valor)}
              className="sr-only"
              required
            />
            {s.rotulo}
          </label>
        ))}
      </div>

      {situacao === "nao_conforme" && (
        <div className="grid gap-2">
          <Label htmlFor={`obs_${item.id}`}>O que foi encontrado</Label>
          <Textarea
            id={`obs_${item.id}`}
            name={`obs_${item.id}`}
            rows={2}
            placeholder="Descreva o problema — é o que a oficina vai ler."
            required
          />
        </div>
      )}
      {situacao !== "nao_conforme" && (
        <input type="hidden" name={`obs_${item.id}`} value="" />
      )}
    </div>
  )
}

export function ChecklistForm({
  veiculos,
  itens,
  veiculoFixo,
}: {
  veiculos: VeiculoOpcao[]
  itens: ItemForm[]
  veiculoFixo?: string
}) {
  const [estado, formAction, pendente] = useActionState(registrarChecklist, {})

  return (
    <form action={formAction} className="grid gap-4">
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}

      {veiculoFixo ? (
        <input type="hidden" name="veiculo_id" value={veiculoFixo} />
      ) : (
        <div className="grid gap-2">
          <Label htmlFor="veiculo_id">Veículo</Label>
          <select id="veiculo_id" name="veiculo_id" className={SELECT} required>
            <option value="">Selecione…</option>
            {veiculos.map((v) => (
              <option key={v.id} value={v.id}>
                {v.rotulo}
                {v.vencido ? " — checklist vencido" : ""}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="grid gap-2 sm:max-w-52">
        <Label htmlFor="hodometro">Hodômetro (km)</Label>
        <Input id="hodometro" name="hodometro" type="number" min={0} step={1} />
      </div>

      {itens.length === 0 ? (
        <Alert variant="destructive">
          <AlertDescription>
            Nenhum item de verificação ativo. A gestão da frota precisa cadastrar
            os itens antes.
          </AlertDescription>
        </Alert>
      ) : (
        <div className="grid gap-3">
          {itens.map((i) => (
            <ItemVerificacao key={i.id} item={i} />
          ))}
        </div>
      )}

      <div className="grid gap-2">
        <Label htmlFor="observacoes">Observações gerais</Label>
        <Textarea id="observacoes" name="observacoes" rows={3} />
      </div>

      <div>
        <Button type="submit" disabled={pendente || itens.length === 0}>
          {pendente ? <Loader2 className="animate-spin" /> : <ClipboardCheck />}
          {pendente ? "Registrando…" : "Registrar checklist"}
        </Button>
      </div>
    </form>
  )
}

// ── Configuração da recorrência ──────────────────────────────────────────────

export function ConfigForm({
  inicial,
}: {
  inicial: {
    recorrencia_dias: number
    alerta_antecedencia_dias: number
    ativo: boolean
  }
}) {
  const [estado, formAction, pendente] = useActionState(salvarConfig, {})
  return (
    <form action={formAction} className="grid gap-4">
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      {estado.ok && (
        <Alert>
          <AlertDescription>{estado.ok}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="recorrencia_dias">A cada quantos dias</Label>
          <Input
            id="recorrencia_dias"
            name="recorrencia_dias"
            type="number"
            min={1}
            max={365}
            defaultValue={inicial.recorrencia_dias}
            required
          />
          <p className="text-muted-foreground text-xs">
            Vale para toda a frota. Um veículo específico pode ter prazo próprio,
            definido na página dele.
          </p>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="alerta_antecedencia_dias">Avisar com antecedência</Label>
          <Input
            id="alerta_antecedencia_dias"
            name="alerta_antecedencia_dias"
            type="number"
            min={0}
            defaultValue={inicial.alerta_antecedencia_dias}
          />
          <p className="text-muted-foreground text-xs">
            Dias antes do vencimento em que o aviso já aparece na página do
            veículo.
          </p>
        </div>
      </div>

      <label className="flex items-start gap-3 rounded-md border p-3">
        <input
          type="checkbox"
          name="ativo"
          className="mt-0.5 size-4"
          defaultChecked={inicial.ativo}
        />
        <span className="grid gap-1">
          <span className="text-sm font-medium">Exigir checklist periódico</span>
          <span className="text-muted-foreground text-xs">
            Desmarque para suspender a cobrança sem apagar o histórico — os
            alertas param de aparecer.
          </span>
        </span>
      </label>

      <div>
        <Button type="submit" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Save />}
          Salvar
        </Button>
      </div>
    </form>
  )
}

// ── Catálogo de itens ────────────────────────────────────────────────────────

function CamposItem({ item }: { item?: ItemForm }) {
  const k = item?.id ?? "novo"
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-4">
        <div className="grid gap-2 sm:col-span-3">
          <Label htmlFor={`categoria-${k}`}>Sistema ou categoria</Label>
          <Input
            id={`categoria-${k}`}
            name="categoria"
            defaultValue={item?.categoria}
            placeholder="Freios"
            required
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor={`ordem-${k}`}>Ordem</Label>
          <Input
            id={`ordem-${k}`}
            name="ordem"
            type="number"
            defaultValue={item?.ordem ?? 0}
          />
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor={`itens-${k}`}>O que verificar</Label>
        <Textarea
          id={`itens-${k}`}
          name="itens_verificar"
          rows={2}
          defaultValue={item?.itens_verificar ?? ""}
          placeholder="O que a pessoa deve olhar, na ordem em que vai olhar."
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor={`prop-${k}`}>O que isso previne</Label>
        <Textarea
          id={`prop-${k}`}
          name="proposito"
          rows={2}
          defaultValue={item?.proposito ?? ""}
          placeholder="Aparece na tela de quem confere — é o que faz a verificação ser consciente e não automática."
        />
      </div>

      <label className="flex items-start gap-3 rounded-md border p-3">
        <input
          type="checkbox"
          name="ativo"
          className="mt-0.5 size-4"
          defaultChecked={item?.ativo ?? true}
        />
        <span className="grid gap-1">
          <span className="text-sm font-medium">Ativo</span>
          <span className="text-muted-foreground text-xs">
            Itens inativos somem do formulário, mas continuam legíveis nos
            checklists já realizados.
          </span>
        </span>
      </label>
    </div>
  )
}

export function NovoItemForm() {
  const [estado, formAction, pendente] = useActionState(salvarItem, {})
  return (
    <form action={formAction} className="grid gap-4">
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      {estado.ok && (
        <Alert>
          <AlertDescription>{estado.ok}</AlertDescription>
        </Alert>
      )}
      <CamposItem />
      <div>
        <Button type="submit" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Plus />}
          Adicionar item
        </Button>
      </div>
    </form>
  )
}

export function ItemEditavel({ item }: { item: ItemForm }) {
  const [estado, formAction, pendente] = useActionState(salvarItem, {})
  const [estadoRem, removerAction, removendo] = useActionState(removerItem, {})

  return (
    <CartaoEditavel
      titulo={item.categoria}
      descricao={item.ativo ? undefined : "inativo"}
      resumo={
        <p className="text-muted-foreground line-clamp-2 text-xs">
          {item.itens_verificar || "Sem descrição do que verificar."}
        </p>
      }
    >
      <div className="grid gap-4">
        {estado.erro && (
          <Alert variant="destructive">
            <AlertDescription>{estado.erro}</AlertDescription>
          </Alert>
        )}
        {estado.ok && (
          <Alert>
            <AlertDescription>{estado.ok}</AlertDescription>
          </Alert>
        )}
        {estadoRem.erro && (
          <Alert variant="destructive">
            <AlertDescription>{estadoRem.erro}</AlertDescription>
          </Alert>
        )}

        <form action={formAction} className="grid gap-4">
          <input type="hidden" name="id" value={item.id} />
          <CamposItem item={item} />
          <div>
            <Button type="submit" size="sm" disabled={pendente}>
              {pendente ? <Loader2 className="animate-spin" /> : <Save />}
              Salvar
            </Button>
          </div>
        </form>

        <form action={removerAction}>
          <input type="hidden" name="id" value={item.id} />
          <Button
            type="submit"
            variant="ghost"
            size="sm"
            className="text-destructive"
            disabled={removendo}
          >
            {removendo ? <Loader2 className="animate-spin" /> : <Trash2 />}
            Excluir item
          </Button>
        </form>
      </div>
    </CartaoEditavel>
  )
}

// ── Recorrência própria do veículo (usada na página dele) ────────────────────

export function RecorrenciaVeiculoForm({
  veiculoId,
  atual,
  padrao,
}: {
  veiculoId: string
  atual: number | null
  padrao: number
}) {
  const [estado, formAction, pendente] = useActionState(
    salvarRecorrenciaVeiculo,
    {}
  )
  return (
    <form action={formAction} className="grid gap-3">
      <input type="hidden" name="veiculo_id" value={veiculoId} />
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      {estado.ok && (
        <Alert>
          <AlertDescription>{estado.ok}</AlertDescription>
        </Alert>
      )}
      <div className="grid gap-2 sm:max-w-60">
        <Label htmlFor="checklist_recorrencia_dias">
          Checklist a cada quantos dias
        </Label>
        <Input
          id="checklist_recorrencia_dias"
          name="checklist_recorrencia_dias"
          type="number"
          min={1}
          max={365}
          defaultValue={atual ?? ""}
          placeholder={`${padrao} (padrão da frota)`}
        />
        <p className="text-muted-foreground text-xs">
          Deixe vazio para seguir o padrão da frota, que hoje é de {padrao} dias.
        </p>
      </div>
      <div>
        <Button type="submit" size="sm" variant="outline" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Save />}
          Salvar prazo
        </Button>
      </div>
    </form>
  )
}

// ── Selo de situação, reaproveitado nas listas ───────────────────────────────

export function SeloChecklist({
  vencido,
  proximo,
  nunca,
  dias,
}: {
  vencido: boolean
  proximo: boolean
  nunca: boolean
  dias: number | null
}) {
  if (nunca) return <Badge variant="destructive">nunca realizado</Badge>
  if (vencido) {
    const d = Math.abs(dias ?? 0)
    return (
      <Badge variant="destructive">
        vencido há {d} {d === 1 ? "dia" : "dias"}
      </Badge>
    )
  }
  if (proximo) {
    return (
      <Badge variant="warning">
        vence em {dias} {dias === 1 ? "dia" : "dias"}
      </Badge>
    )
  }
  return <Badge variant="secondary">em dia</Badge>
}
