"use client"

import { useActionState, useState } from "react"
import { Loader2, Save, ShieldOff, Undo2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { mascaraCpf } from "@/lib/mascaras"
import {
  BENEFICIOS,
  ESCOPOS,
  type CarenciaConfig,
  type RegraInadimplencia,
} from "@/lib/filiacao-direitos-constantes"

import {
  concederSuspensaoAction,
  revogarSuspensaoAction,
  salvarCarenciaAction,
  salvarRegraAction,
} from "./actions"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

/**
 * "Quem se filiar hoje tem direito em …".
 *
 * O "hoje" vem PRONTO do servidor. Ler o relógio no render é impuro, e lê-lo
 * num efeito dispara renderização em cascata — as duas coisas o lint barra, e
 * com razão. Uma data que muda uma vez por dia não precisa de nenhum dos dois.
 */
function PreviaDaData({ hojeIso, dias }: { hojeIso: string; dias: number }) {
  const alvo = new Date(hojeIso)
  alvo.setDate(alvo.getDate() + dias)
  return (
    <p className="text-muted-foreground text-xs">
      Quem se filiar hoje passa a ter direito em{" "}
      <strong>
        {new Intl.DateTimeFormat("pt-BR", {
          timeZone: "America/Sao_Paulo",
        }).format(alvo)}
      </strong>
      .
    </p>
  )
}

function Recado({ erro, ok }: { erro?: string; ok?: string }) {
  if (!erro && !ok) return null
  return (
    <Alert variant={erro ? "destructive" : "success"}>
      <AlertDescription className="text-sm">{erro ?? ok}</AlertDescription>
    </Alert>
  )
}

export function CarenciaForm({
  carencia,
  hojeIso,
}: {
  carencia: CarenciaConfig
  hojeIso: string
}) {
  const [estado, formAction, pendente] = useActionState(
    salvarCarenciaAction,
    {}
  )
  const [ativo, setAtivo] = useState(carencia.ativo)
  const [dias, setDias] = useState(String(carencia.dias))

  const meta = BENEFICIOS.find((b) => b.chave === carencia.beneficio)!
  const n = Number(dias) || 0

  return (
    <form action={formAction} className="grid gap-3 rounded-lg border p-4">
      <input type="hidden" name="beneficio" value={carencia.beneficio} />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-medium">{meta.rotulo}</h3>
          <p className="text-muted-foreground mt-0.5 text-xs">
            {meta.descricao}
          </p>
        </div>
        <label className="flex shrink-0 items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="ativo"
            className="size-4"
            checked={ativo}
            onChange={(e) => setAtivo(e.target.checked)}
          />
          Exigir carência
        </label>
      </div>

      <Recado erro={estado.erro} ok={estado.ok} />

      {ativo && (
        <>
          <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
            <div className="grid gap-1.5">
              <Label htmlFor={`dias-${carencia.beneficio}`}>Dias</Label>
              <Input
                id={`dias-${carencia.beneficio}`}
                name="dias"
                type="number"
                min={0}
                max={3650}
                value={dias}
                onChange={(e) => setDias(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`obs-${carencia.beneficio}`}>
                Observação (opcional)
              </Label>
              <Input
                id={`obs-${carencia.beneficio}`}
                name="observacao"
                defaultValue={carencia.observacao ?? ""}
                placeholder="Ex.: art. 12 do estatuto"
              />
            </div>
          </div>
          {n > 0 && <PreviaDaData hojeIso={hojeIso} dias={n} />}
        </>
      )}

      {!ativo && (
        <>
          <input type="hidden" name="dias" value={dias} />
          <p className="text-muted-foreground text-xs">
            Sem carência — o direito vale desde a filiação.
          </p>
        </>
      )}

      <div>
        <Button type="submit" size="sm" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Save />}
          Salvar
        </Button>
      </div>
    </form>
  )
}

export function RegraForm({ regra }: { regra: RegraInadimplencia }) {
  const [estado, formAction, pendente] = useActionState(salvarRegraAction, {})
  const [ativo, setAtivo] = useState(regra.ativo)
  const [quantidade, setQuantidade] = useState(String(regra.quantidade))
  const [consecutivas, setConsecutivas] = useState(regra.exigirConsecutivas)

  return (
    <form action={formAction} className="grid gap-3 rounded-lg border p-4">
      <input type="hidden" name="tipo" value={regra.tipo} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-medium">{regra.tipo}</h3>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="ativo"
            className="size-4"
            checked={ativo}
            onChange={(e) => setAtivo(e.target.checked)}
          />
          Usar esta regra
        </label>
      </div>

      <Recado erro={estado.erro} ok={estado.ok} />

      {ativo ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor={`qtd-${regra.tipo}`}>Faltas para inativar</Label>
              <Input
                id={`qtd-${regra.tipo}`}
                name="quantidade"
                type="number"
                min={1}
                value={quantidade}
                onChange={(e) => setQuantidade(e.target.value)}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`jan-${regra.tipo}`}>
                Olhar quantas remessas para trás
              </Label>
              <Input
                id={`jan-${regra.tipo}`}
                name="janela_remessas"
                type="number"
                min={1}
                max={120}
                defaultValue={regra.janelaRemessas}
              />
            </div>
          </div>

          <label className="flex items-start gap-3 rounded-md border p-3">
            <input
              type="checkbox"
              name="exigir_consecutivas"
              className="mt-0.5 size-4"
              checked={consecutivas}
              onChange={(e) => setConsecutivas(e.target.checked)}
            />
            <span className="text-sm">
              As faltas precisam ser seguidas
              <span className="text-muted-foreground block text-xs">
                {consecutivas
                  ? `Conta a partir da remessa mais recente: quem voltou a pagar sai da lista, mesmo com buraco antigo. ${quantidade} falta(s) seguida(s) inativa.`
                  : `Soma faltas avulsas dentro da janela. ${quantidade} falta(s), seguidas ou não, inativa.`}
              </span>
            </span>
          </label>
        </>
      ) : (
        <p className="text-muted-foreground text-xs">
          Esta contribuição não conta para inadimplência.
        </p>
      )}

      <div>
        <Button type="submit" size="sm" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Save />}
          Salvar
        </Button>
      </div>
    </form>
  )
}

export function ConcederSuspensao({
  cpfInicial = "",
  escopoInicial,
  alvos,
}: {
  cpfInicial?: string
  escopoInicial?: "carencia" | "inadimplencia"
  /** Benefícios ou tipos de remessa para o campo "vale para". */
  alvos: { carencia: { valor: string; rotulo: string }[]; inadimplencia: { valor: string; rotulo: string }[] }
}) {
  const [estado, formAction, pendente] = useActionState(
    concederSuspensaoAction,
    {}
  )
  const [cpf, setCpf] = useState(mascaraCpf(cpfInicial))
  const [escopo, setEscopo] = useState(escopoInicial ?? "carencia")

  return (
    <form action={formAction} className="grid gap-4 pt-2">
      <Recado erro={estado.erro} ok={estado.ok} />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="cpf-susp">CPF do filiado</Label>
          <Input
            id="cpf-susp"
            name="cpf"
            inputMode="numeric"
            placeholder="000.000.000-00"
            value={cpf}
            onChange={(e) => setCpf(mascaraCpf(e.target.value))}
            required
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="escopo-susp">Suspende o quê</Label>
          <select
            id="escopo-susp"
            name="escopo"
            className={SELECT}
            value={escopo}
            onChange={(e) =>
              setEscopo(e.target.value as "carencia" | "inadimplencia")
            }
          >
            {ESCOPOS.map((e) => (
              <option key={e.chave} value={e.chave}>
                {e.rotulo}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="alvo-susp">Vale para</Label>
          <select id="alvo-susp" name="alvo" className={SELECT} defaultValue="">
            <option value="">Tudo</option>
            {alvos[escopo].map((a) => (
              <option key={a.valor} value={a.valor}>
                {a.rotulo}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="vigencia-susp">Até quando (opcional)</Label>
          <Input id="vigencia-susp" name="vigencia_ate" type="date" />
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="motivo-susp">Justificativa</Label>
        <Textarea
          id="motivo-susp"
          name="motivo"
          rows={2}
          placeholder={
            escopo === "carencia"
              ? "Ex.: trocou de empregador em 03/2026, sem interrupção da filiação."
              : "Ex.: afastado pelo INSS desde 01/2026, sem desconto em folha."
          }
          required
        />
        <p className="text-muted-foreground text-xs">
          Fica registrada com o seu nome e a data. É o que explica a exceção
          quando alguém perguntar.
        </p>
      </div>

      <div>
        <Button type="submit" size="sm" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <ShieldOff />}
          Conceder efeito suspensivo
        </Button>
      </div>
    </form>
  )
}

export function RevogarSuspensao({ id }: { id: string }) {
  const [estado, formAction, pendente] = useActionState(
    revogarSuspensaoAction,
    {}
  )

  if (estado.ok) {
    return <span className="text-muted-foreground text-xs">{estado.ok}</span>
  }

  return (
    <form action={formAction} className="grid gap-1">
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant="ghost" size="sm" disabled={pendente}>
        {pendente ? <Loader2 className="animate-spin" /> : <Undo2 />}
        Revogar
      </Button>
      {estado.erro && (
        <span className="text-destructive text-xs">{estado.erro}</span>
      )}
    </form>
  )
}
