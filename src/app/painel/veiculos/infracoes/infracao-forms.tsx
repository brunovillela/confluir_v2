"use client"

import { useActionState, useState } from "react"
import { FileWarning, Loader2, Receipt, Scale, Send } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  ROTULOS_FORMA_COBRANCA,
  FORMAS_COBRANCA,
  TIPOS_INFRACAO,
} from "@/lib/veiculos-constantes"

import {
  avaliarInfracaoAction,
  criarInfracaoAction,
  gerarOrdemMultaAction,
  justificarInfracaoAction,
} from "./actions"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

export type Opcao = { id: string; rotulo: string }

export function NovaInfracaoForm({
  veiculos,
  usuarios,
}: {
  veiculos: Opcao[]
  usuarios: Opcao[]
}) {
  const [estado, formAction, pendente] = useActionState(criarInfracaoAction, {})
  return (
    <form action={formAction} className="grid max-w-2xl gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="veiculo_id">Veículo *</Label>
          <select
            id="veiculo_id"
            name="veiculo_id"
            required
            defaultValue=""
            className={SELECT}
          >
            <option value="" disabled>
              Escolha o veículo
            </option>
            {veiculos.map((v) => (
              <option key={v.id} value={v.id}>
                {v.rotulo}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="condutor_usuario_id">Condutor infrator *</Label>
          <select
            id="condutor_usuario_id"
            name="condutor_usuario_id"
            required
            defaultValue=""
            className={SELECT}
          >
            <option value="" disabled>
              Quem dirigia
            </option>
            {usuarios.map((u) => (
              <option key={u.id} value={u.id}>
                {u.rotulo}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="infracao_data">Data da infração *</Label>
          <Input
            id="infracao_data"
            name="infracao_data"
            type="date"
            required
            className="[color-scheme:light] dark:[color-scheme:dark]"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="infracao_tipo">Gravidade *</Label>
          <select
            id="infracao_tipo"
            name="infracao_tipo"
            required
            defaultValue=""
            className={SELECT}
          >
            <option value="" disabled>
              Escolha
            </option>
            {TIPOS_INFRACAO.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="orgao_autuador">Órgão autuador *</Label>
          <Input
            id="orgao_autuador"
            name="orgao_autuador"
            required
            placeholder="DER-RJ, DETRAN, PRF…"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="auto_de">Nº do auto</Label>
          <Input id="auto_de" name="auto_de" placeholder="X37192593" />
        </div>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="descricao">Descrição da infração *</Label>
          <Input
            id="descricao"
            name="descricao"
            required
            placeholder="Transitar em velocidade superior à máxima permitida…"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="local">Local</Label>
          <Input id="local" name="local" placeholder="Rodovia, km, cidade/UF" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="custo">Valor da multa (R$)</Label>
          <Input
            id="custo"
            name="custo"
            inputMode="decimal"
            placeholder="130,00"
            className="tabular-nums"
          />
        </div>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="arquivo_notificacao">
            Notificação da autuação (PDF/JPG/PNG)
          </Label>
          <Input
            id="arquivo_notificacao"
            name="arquivo_notificacao"
            type="file"
            accept="application/pdf,image/jpeg,image/png"
          />
        </div>
      </div>
      <p className="text-muted-foreground text-sm">
        Ao registrar, o condutor é notificado (sino e email) para apresentar a
        justificativa.
      </p>
      {estado.erro && <p className="text-destructive text-sm">{estado.erro}</p>}
      <div>
        <Button type="submit" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <FileWarning />}
          Registrar infração
        </Button>
      </div>
    </form>
  )
}

export function JustificativaForm({ infracaoId }: { infracaoId: string }) {
  const [estado, formAction, pendente] = useActionState(
    justificarInfracaoAction,
    {}
  )
  return (
    <form action={formAction} className="grid max-w-2xl gap-3">
      <input type="hidden" name="infracao_id" value={infracaoId} />
      <div className="grid gap-1.5">
        <Label htmlFor="descricao">Justificativa</Label>
        <Textarea
          id="descricao"
          name="descricao"
          required
          rows={3}
          placeholder="Descreva as circunstâncias — se estava em atividade sindical, detalhe qual."
        />
      </div>
      {estado.erro && <p className="text-destructive text-sm">{estado.erro}</p>}
      <div>
        <Button type="submit" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Send />}
          Enviar justificativa
        </Button>
      </div>
    </form>
  )
}

/** Gestor: sindical (sindicato assume) × cobrar do condutor. */
export function AvaliacaoInfracaoForm({
  infracaoId,
  valorPadrao,
}: {
  infracaoId: string
  valorPadrao: string
}) {
  const [estado, formAction, pendente] = useActionState(
    avaliarInfracaoAction,
    {}
  )
  const [decisao, setDecisao] = useState<"sindical" | "cobrar">("sindical")

  return (
    <form action={formAction} className="grid max-w-2xl gap-3">
      <input type="hidden" name="infracao_id" value={infracaoId} />
      <input type="hidden" name="decisao" value={decisao} />
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="decisao_visual"
            checked={decisao === "sindical"}
            onChange={() => setDecisao("sindical")}
          />
          Atividade sindical — o sindicato assume a multa
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name="decisao_visual"
            checked={decisao === "cobrar"}
            onChange={() => setDecisao("cobrar")}
          />
          Não sindical — cobrar do condutor
        </label>
      </div>
      {decisao === "cobrar" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="cobranca_forma">Forma de cobrança *</Label>
            <select
              id="cobranca_forma"
              name="cobranca_forma"
              required
              defaultValue=""
              className={SELECT}
            >
              <option value="" disabled>
                Escolha
              </option>
              {FORMAS_COBRANCA.map((f) => (
                <option key={f} value={f}>
                  {ROTULOS_FORMA_COBRANCA[f]}
                </option>
              ))}
            </select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="cobranca_valor">Valor da cobrança (R$) *</Label>
            <Input
              id="cobranca_valor"
              name="cobranca_valor"
              inputMode="decimal"
              defaultValue={valorPadrao}
              className="tabular-nums"
            />
          </div>
        </div>
      )}
      <div className="grid gap-1.5">
        <Label htmlFor="observacao">Observação</Label>
        <Input id="observacao" name="observacao" placeholder="Opcional" />
      </div>
      <p className="text-muted-foreground text-sm">
        O desconto em diárias ainda será criado no módulo de diárias — a
        cobrança fica registrada e pendente para o Financeiro dar baixa.
      </p>
      {estado.erro && <p className="text-destructive text-sm">{estado.erro}</p>}
      <div>
        <Button type="submit" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Scale />}
          Salvar avaliação
        </Button>
      </div>
    </form>
  )
}

export function GerarOrdemMultaForm({
  infracaoId,
  valorTexto,
}: {
  infracaoId: string
  valorTexto: string
}) {
  const [estado, formAction, pendente] = useActionState(
    gerarOrdemMultaAction,
    {}
  )
  return (
    <form
      action={formAction}
      className="grid max-w-2xl gap-3"
      onSubmit={(e) => {
        if (
          !confirm(
            `Gerar a ordem de pagamento da multa (${valorTexto}, 'Em autorização')?`
          )
        ) {
          e.preventDefault()
        }
      }}
    >
      <input type="hidden" name="infracao_id" value={infracaoId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="vencimento">Vencimento do boleto</Label>
          <Input
            id="vencimento"
            name="vencimento"
            type="date"
            className="[color-scheme:light] dark:[color-scheme:dark]"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="boleto">Boleto (PDF/JPG/PNG)</Label>
          <Input
            id="boleto"
            name="boleto"
            type="file"
            accept="application/pdf,image/jpeg,image/png"
          />
        </div>
      </div>
      {estado.erro && <p className="text-destructive text-sm">{estado.erro}</p>}
      <div>
        <Button type="submit" variant="outline" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Receipt />}
          Gerar ordem de pagamento
        </Button>
      </div>
    </form>
  )
}
