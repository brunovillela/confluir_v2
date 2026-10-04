"use client"

import { useActionState, useState } from "react"
import { Check, Loader2, Save, Trash2, X } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { ConfigFaltas } from "@/lib/faltas-constantes"

import {
  decidirFaltaAction,
  excluirFaltaAction,
  registrarFaltaAction,
  salvarConfigFaltasAction,
} from "./actions"
import { confirmarEnvio } from "@/components/ui/confirmacao"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full truncate rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"
const TEXTAREA =
  "border-input bg-background text-foreground w-full rounded-md border px-3 py-2 text-sm shadow-xs outline-none"

function Retorno({ erro, ok }: { erro?: string; ok?: string }) {
  if (erro) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{erro}</AlertDescription>
      </Alert>
    )
  }
  if (ok) {
    return (
      <Alert className="border-success/40 text-success-fg">
        <AlertDescription>{ok}</AlertDescription>
      </Alert>
    )
  }
  return null
}

/** Registro pela gestão: a falta já nasce autorizada. */
export function RegistrarFaltaForm({
  funcionarios,
  tipos,
  hoje,
}: {
  funcionarios: { usuarioId: string; nome: string }[]
  tipos: string[]
  hoje: string
}) {
  const [estado, acao, pendente] = useActionState(registrarFaltaAction, {})
  return (
    <form action={acao} className="grid gap-4">
      <Retorno erro={estado.erro} ok={estado.ok} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="funcionario_id">Funcionário *</Label>
          <select id="funcionario_id" name="funcionario_id" required defaultValue="" className={SELECT}>
            <option value="" disabled>
              Escolha o funcionário
            </option>
            {funcionarios.map((f) => (
              <option key={f.usuarioId} value={f.usuarioId}>
                {f.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="data">Data da falta *</Label>
          <Input id="data" name="data" type="date" required defaultValue={hoje} />
        </div>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="tipo">Justificativa *</Label>
          <select id="tipo" name="tipo" required defaultValue="" className={SELECT}>
            <option value="" disabled>
              Escolha a justificativa
            </option>
            {tipos.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="comprovacao">Comprovação (PDF ou foto, opcional)</Label>
          <Input id="comprovacao" name="comprovacao" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="observacao">Observação</Label>
          <Input id="observacao" name="observacao" />
        </div>
        <label className="text-muted-foreground flex items-start gap-2 text-sm sm:col-span-2">
          <input type="checkbox" name="ignorar_limite" className="mt-0.5 size-4" />
          <span>
            Registrar mesmo se passar do limite configurado
            <span className="block text-xs">
              Fica anotado na observação que a falta foi lançada acima do limite.
            </span>
          </span>
        </label>
      </div>
      <div>
        <Button type="submit" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Check />}
          Registrar falta autorizada
        </Button>
      </div>
    </form>
  )
}

/** Autorizar ou recusar (com motivo) uma falta aguardando. */
export function DecisaoFalta({ id }: { id: string }) {
  const [estado, acao, pendente] = useActionState(decidirFaltaAction, {})
  const [recusando, setRecusando] = useState(false)
  if (estado.ok) return <span className="text-success-fg text-xs">{estado.ok}</span>
  return (
    <form action={acao} className="flex flex-wrap items-center justify-end gap-1.5">
      <input type="hidden" name="id" value={id} />
      {recusando ? (
        <>
          <Input name="motivo" required minLength={5} placeholder="Motivo da recusa" className="h-8 w-56 text-xs" />
          <Button type="submit" name="decisao" value="recusar" size="sm" variant="destructive" disabled={pendente} className="h-8">
            {pendente ? <Loader2 className="animate-spin" /> : <X />}
            Recusar
          </Button>
          <Button type="button" size="sm" variant="ghost" className="h-8" onClick={() => setRecusando(false)}>
            Voltar
          </Button>
        </>
      ) : (
        <>
          <Button type="submit" name="decisao" value="autorizar" size="sm" disabled={pendente} className="h-8">
            {pendente ? <Loader2 className="animate-spin" /> : <Check />}
            Autorizar
          </Button>
          <Button type="button" size="sm" variant="outline" className="h-8" onClick={() => setRecusando(true)}>
            Recusar…
          </Button>
        </>
      )}
      {estado.erro && <span className="text-destructive basis-full text-right text-xs">{estado.erro}</span>}
    </form>
  )
}

export function ExcluirFaltaBotao({ id }: { id: string }) {
  const [estado, acao, pendente] = useActionState(excluirFaltaAction, {})
  return (
    <form
      action={acao}
      onSubmit={(e) => {
        confirmarEnvio(e, "Excluir esta falta justificada? A ausência gerada por ela sai junto.")}}
      className="inline-flex items-center"
    >
      <input type="hidden" name="id" value={id} />
      {estado.erro && <span className="text-destructive mr-1 text-xs">{estado.erro}</span>}
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        disabled={pendente}
        aria-label="Excluir falta"
        className="text-destructive hover:text-destructive h-7 px-2"
      >
        {pendente ? <Loader2 className="animate-spin" /> : <Trash2 />}
      </Button>
    </form>
  )
}

/** Limites (vazio = sem limite) e tipos de justificativa. */
export function ConfigFaltasForm({ config }: { config: ConfigFaltas }) {
  const [estado, acao, pendente] = useActionState(salvarConfigFaltasAction, {})
  const campo = (nome: string, rotulo: string, valor: number | null, dica: string) => (
    <div className="grid gap-1.5">
      <Label htmlFor={nome}>{rotulo}</Label>
      <Input
        id={nome}
        name={nome}
        type="number"
        min={0}
        step={1}
        inputMode="numeric"
        placeholder="Sem limite"
        defaultValue={valor ?? ""}
      />
      <p className="text-muted-foreground text-xs">{dica}</p>
    </div>
  )
  return (
    <form action={acao} className="grid gap-5">
      <Retorno erro={estado.erro} />
      <div className="grid gap-4 sm:grid-cols-3">
        {campo("limite_ano", "Total por ano", config.limiteAno, "No período do acordo (vigência do ACT).")}
        {campo("limite_mes", "Máximo por mês", config.limiteMes, "No mês civil — evita concentrar.")}
        {campo("limite_semana", "Máximo por semana", config.limiteSemana, "De segunda a domingo.")}
      </div>
      <p className="text-muted-foreground -mt-2 text-xs">
        Deixe em branco para não limitar. Contam as faltas aguardando e as autorizadas; a recusada
        libera a vaga.
      </p>
      <div className="grid gap-3 rounded-lg border p-4">
        <p className="text-sm font-medium">Comprovação</p>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            name="exige_comprovacao"
            defaultChecked={config.exigeComprovacao}
            className="mt-0.5 size-4"
          />
          <span>
            Comprovação obrigatória
            <span className="text-muted-foreground block text-xs">
              Falta que já aconteceu (ou é hoje) só é pedida com o documento. Falta futura pode ser
              pedida antes e comprovada depois, pelo botão &quot;Anexar comprovação&quot; do Meu perfil.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            name="trava_sem_comprovacao"
            defaultChecked={config.travaSemComprovacao}
            className="mt-0.5 size-4"
          />
          <span>
            Sem comprovar a última falta autorizada, o funcionário não pede outra
            <span className="text-muted-foreground block text-xs">
              Vale para a falta autorizada mais recente cuja data já passou. As faltas vindas do
              sistema anterior não contam (quase nenhuma tem arquivo).
            </span>
          </span>
        </label>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="tipos">Tipos de justificativa (um por linha) *</Label>
        <textarea
          id="tipos"
          name="tipos"
          rows={6}
          required
          defaultValue={config.tipos.join("\n")}
          className={TEXTAREA}
        />
        <p className="text-muted-foreground text-xs">
          As hipóteses previstas no acordo. Tirar um tipo da lista não muda as faltas já registradas
          com ele.
        </p>
      </div>
      <div>
        <Button type="submit" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Save />}
          Salvar configurações
        </Button>
      </div>
    </form>
  )
}
