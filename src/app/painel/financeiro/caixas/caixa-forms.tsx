"use client"

import { useActionState } from "react"
import Link from "next/link"
import { Check, Loader2, Power, X } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import {
  alternarContaAtiva,
  aprovarPrestacao,
  atualizarOcorrencia,
  criarContaCaixa,
  lancarAporte,
  rejeitarPrestacao,
} from "./actions"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

export function NovaContaForm({
  pessoas,
}: {
  pessoas: { id: string; nome: string }[]
}) {
  const [estado, formAction, pendente] = useActionState(criarContaCaixa, {})
  return (
    <form action={formAction} className="grid gap-4">
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="responsavel_usuario_id">Pessoa responsável *</Label>
          <select
            id="responsavel_usuario_id"
            name="responsavel_usuario_id"
            required
            defaultValue=""
            className={SELECT}
          >
            <option value="" disabled>
              Escolha o funcionário ou diretor…
            </option>
            {pessoas.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="nome">Nome da conta *</Label>
          <Input
            id="nome"
            name="nome"
            required
            placeholder="Caixa da recepção, caixa de viagens…"
          />
        </div>
      </div>
      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" asChild>
          <Link href="/painel/financeiro/caixas">Cancelar</Link>
        </Button>
        <Button type="submit" disabled={pendente}>
          {pendente && <Loader2 className="animate-spin" />}
          Autorizar conta de caixa
        </Button>
      </div>
    </form>
  )
}

export function AporteForm({ contaId }: { contaId: string }) {
  const [estado, formAction, pendente] = useActionState(lancarAporte, {})
  return (
    <form action={formAction} className="grid gap-3">
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <input type="hidden" name="conta_id" value={contaId} />
      <div className="grid gap-3 sm:grid-cols-[12rem_1fr]">
        <div className="grid gap-1.5">
          <Label htmlFor="valor">Valor do aporte *</Label>
          <Input
            id="valor"
            name="valor"
            inputMode="decimal"
            placeholder="0,00"
            required
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="descricao">Descrição</Label>
          <Input
            id="descricao"
            name="descricao"
            placeholder="Verba de julho, reforço para o evento…"
          />
        </div>
      </div>
      <p className="text-muted-foreground text-xs">
        O valor fica aguardando a confirmação de recebimento do responsável —
        só depois a verba é liberada e a conta abre.
      </p>
      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={pendente}>
          {pendente && <Loader2 className="animate-spin" />}
          Lançar aporte
        </Button>
      </div>
    </form>
  )
}

export function DecisaoPrestacao({
  contaId,
  prestacaoId,
}: {
  contaId: string
  prestacaoId: string
}) {
  const [aprovar, aprovarAction, aprovando] = useActionState(
    aprovarPrestacao,
    {}
  )
  const [rejeitar, rejeitarAction, rejeitando] = useActionState(
    rejeitarPrestacao,
    {}
  )
  const erro = aprovar.erro ?? rejeitar.erro

  return (
    <div className="grid gap-3">
      {erro && (
        <Alert variant="destructive">
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      )}
      <form
        action={aprovarAction}
        onSubmit={(e) => {
          if (
            !confirm(
              "Aprovar a prestação de contas? O saldo remanescente vira acerto e a conta FECHA até o próximo aporte."
            )
          ) {
            e.preventDefault()
          }
        }}
        className="grid gap-2"
      >
        <input type="hidden" name="conta_id" value={contaId} />
        <input type="hidden" name="prestacao_id" value={prestacaoId} />
        <div className="grid gap-1.5">
          <Label htmlFor="observacao_financeiro">
            Observação da conferência
          </Label>
          <Input
            id="observacao_financeiro"
            name="observacao_financeiro"
            placeholder="Dinheiro e notas conferidos…"
          />
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="submit" size="sm" disabled={aprovando}>
            {aprovando ? <Loader2 className="animate-spin" /> : <Check />}
            Aprovar e fechar a conta
          </Button>
        </div>
      </form>
      <form
        action={rejeitarAction}
        onSubmit={(e) => {
          if (!confirm("Rejeitar a prestação? A conta volta a ficar aberta.")) {
            e.preventDefault()
          }
        }}
        className="grid gap-2 border-t pt-3"
      >
        <input type="hidden" name="conta_id" value={contaId} />
        <input type="hidden" name="prestacao_id" value={prestacaoId} />
        <div className="grid gap-1.5">
          <Label htmlFor="motivo_rejeicao">Motivo da rejeição *</Label>
          <Input
            id="motivo_rejeicao"
            name="observacao_financeiro"
            placeholder="Falta o comprovante da compra X…"
          />
        </div>
        <div className="flex justify-end">
          <Button
            type="submit"
            size="sm"
            variant="outline"
            disabled={rejeitando}
            className="text-destructive hover:text-destructive"
          >
            {rejeitando ? <Loader2 className="animate-spin" /> : <X />}
            Rejeitar prestação
          </Button>
        </div>
      </form>
    </div>
  )
}

export function OcorrenciaAtualizar({
  contaId,
  ocorrenciaId,
}: {
  contaId: string
  ocorrenciaId: string
}) {
  const [estado, formAction, pendente] = useActionState(atualizarOcorrencia, {})
  return (
    <form action={formAction} className="grid gap-2 border-t pt-3">
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <input type="hidden" name="conta_id" value={contaId} />
      <input type="hidden" name="ocorrencia_id" value={ocorrenciaId} />
      <div className="grid gap-2 sm:grid-cols-[11rem_1fr_9rem]">
        <div className="grid gap-1.5">
          <Label htmlFor={`sit-${ocorrenciaId}`}>Situação</Label>
          <select
            id={`sit-${ocorrenciaId}`}
            name="situacao"
            defaultValue="em_investigacao"
            className={SELECT}
          >
            <option value="em_investigacao">Em investigação</option>
            <option value="resolvida">Resolvida</option>
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`res-${ocorrenciaId}`}>Parecer / resolução</Label>
          <Input
            id={`res-${ocorrenciaId}`}
            name="resolucao"
            placeholder="O que foi apurado…"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`aj-${ocorrenciaId}`}>Perda apurada</Label>
          <Input
            id={`aj-${ocorrenciaId}`}
            name="ajuste_perda"
            inputMode="decimal"
            placeholder="0,00"
          />
        </div>
      </div>
      <p className="text-muted-foreground text-xs">
        Ao resolver com “perda apurada”, o valor é debitado do extrato da
        conta como perda.
      </p>
      <div className="flex justify-end">
        <Button type="submit" size="sm" variant="outline" disabled={pendente}>
          {pendente && <Loader2 className="animate-spin" />}
          Atualizar ocorrência
        </Button>
      </div>
    </form>
  )
}

export function AlternarContaAtiva({
  contaId,
  ativa,
}: {
  contaId: string
  ativa: boolean
}) {
  const [estado, formAction, pendente] = useActionState(alternarContaAtiva, {})
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (
          !confirm(
            ativa
              ? "Desativar esta conta de caixa? Ela some das opções de pagamento."
              : "Reativar esta conta de caixa?"
          )
        ) {
          e.preventDefault()
        }
      }}
      className="flex items-center justify-end gap-2"
    >
      <input type="hidden" name="conta_id" value={contaId} />
      <input type="hidden" name="ativar" value={ativa ? "0" : "1"} />
      {estado.erro && (
        <span className="text-destructive text-xs">{estado.erro}</span>
      )}
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        disabled={pendente}
        className={ativa ? "text-destructive hover:text-destructive" : ""}
      >
        {pendente ? <Loader2 className="animate-spin" /> : <Power />}
        {ativa ? "Desativar conta" : "Reativar conta"}
      </Button>
    </form>
  )
}
