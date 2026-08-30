"use client"

import { useActionState, useState } from "react"
import {
  Box,
  Loader2,
  Lock,
  Monitor,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  Unlock,
  UserPlus,
} from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Switch } from "@/components/ui/switch"
import type {
  ApuradorBasico,
  LacreLinha,
  MesarioLinha,
  UrnaComLacres,
  UrnaLinha,
} from "@/lib/db/votacao-mesarios"
import { formatarCpf } from "@/lib/cpf"

import {
  atribuirUrnaApuradorAction,
  criarApuradorAction,
  criarMesarioAction,
  criarUrnaAction,
  registrarLacreAction,
  removerApuradorAction,
  removerLacreAction,
  removerMesarioAction,
  removerUrnaAction,
  salvarApuradorAction,
  salvarMesarioAction,
  salvarUrnaAction,
} from "./actions"

/** ISO (UTC) → "YYYY-MM-DDTHH:mm" na hora local, para <input datetime-local>. */
function paraInputLocal(iso: string | null): string {
  if (!iso) return ""
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

function fmtJanela(u: UrnaLinha): string {
  const f = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleString("pt-BR", {
          day: "2-digit",
          month: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        })
      : null
  const ab = f(u.abertura)
  const fe = f(u.fechamento)
  if (!ab && !fe) return "Sem horário definido (sempre aberta)"
  return `${ab ?? "…"} → ${fe ?? "…"}`
}

// ── Urnas ───────────────────────────────────────────────────────────────────

function CamposUrna({ urna }: { urna?: UrnaLinha }) {
  return (
    <>
      <div className="grid gap-1.5">
        <Label htmlFor="urna-nome">Nome da urna *</Label>
        <Input
          id="urna-nome"
          name="nome"
          required
          defaultValue={urna?.nome ?? ""}
          placeholder="Ex.: Urna 1 — Portaria da unidade"
        />
      </div>
      <div className="grid gap-1.5">
        <Label>Tipo *</Label>
        <RadioGroup
          name="tipo"
          defaultValue={urna?.tipo ?? "digital"}
          className="grid gap-2 sm:grid-cols-2"
        >
          <label className="hover:bg-muted/40 flex cursor-pointer items-start gap-2 rounded-lg border p-3">
            <RadioGroupItem value="digital" className="mt-0.5" />
            <span className="grid gap-0.5">
              <span className="text-sm font-medium">Digital</span>
              <span className="text-muted-foreground text-xs">
                Cédula liberada num terminal de votação pareado.
              </span>
            </span>
          </label>
          <label className="hover:bg-muted/40 flex cursor-pointer items-start gap-2 rounded-lg border p-3">
            <RadioGroupItem value="fisica" className="mt-0.5" />
            <span className="grid gap-0.5">
              <span className="text-sm font-medium">Física</span>
              <span className="text-muted-foreground text-xs">
                Voto em papel; resultado lançado agregado na apuração.
              </span>
            </span>
          </label>
        </RadioGroup>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="urna-abertura">Abertura</Label>
          <Input
            id="urna-abertura"
            name="abertura"
            type="datetime-local"
            defaultValue={paraInputLocal(urna?.abertura ?? null)}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="urna-fechamento">Fechamento</Label>
          <Input
            id="urna-fechamento"
            name="fechamento"
            type="datetime-local"
            defaultValue={paraInputLocal(urna?.fechamento ?? null)}
          />
        </div>
      </div>
    </>
  )
}

function AtribuirApurador({
  assembleiaId,
  urna,
  apuradores,
}: {
  assembleiaId: string
  urna: UrnaComLacres
  apuradores: ApuradorBasico[]
}) {
  const [estado, formAction, pendente] = useActionState(
    atribuirUrnaApuradorAction,
    {}
  )
  return (
    <form
      action={formAction}
      className="flex flex-wrap items-center gap-2 rounded-md border border-dashed p-2 text-sm"
    >
      <input type="hidden" name="assembleia_id" value={assembleiaId} />
      <input type="hidden" name="urna_id" value={urna.id} />
      <span className="text-muted-foreground text-xs">Apurador:</span>
      <select
        name="apurador_id"
        defaultValue={urna.apuradorId ?? ""}
        className="border-input bg-background h-8 rounded-md border px-2 text-sm"
      >
        <option value="">— ninguém —</option>
        {apuradores.map((ap) => (
          <option key={ap.id} value={ap.id}>
            {ap.nome ?? ap.email ?? ap.id.slice(0, 8)}
          </option>
        ))}
      </select>
      <Button type="submit" variant="secondary" size="sm" disabled={pendente}>
        {pendente && <Loader2 className="animate-spin" />}
        Atribuir
      </Button>
      {estado.erro && (
        <span className="text-destructive text-xs">{estado.erro}</span>
      )}
    </form>
  )
}

function UrnaItem({
  assembleiaId,
  urna,
  apuradores,
}: {
  assembleiaId: string
  urna: UrnaComLacres
  apuradores: ApuradorBasico[]
}) {
  const [editando, setEditando] = useState(false)
  const [estSalvar, actSalvar, salvando] = useActionState(salvarUrnaAction, {})
  const [estApagar, actApagar, apagando] = useActionState(removerUrnaAction, {})
  const erro = estSalvar.erro ?? estApagar.erro

  if (editando) {
    return (
      <form action={actSalvar} className="grid gap-4 rounded-lg border p-4">
        {erro && (
          <Alert variant="destructive">
            <AlertDescription>{erro}</AlertDescription>
          </Alert>
        )}
        <input type="hidden" name="assembleia_id" value={assembleiaId} />
        <input type="hidden" name="urna_id" value={urna.id} />
        <CamposUrna urna={urna} />
        <label className="flex items-center gap-2 text-sm">
          <Switch name="ativa" defaultChecked={urna.ativa} />
          <span>Urna ativa</span>
        </label>
        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={salvando}>
            {salvando && <Loader2 className="animate-spin" />}
            Salvar urna
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setEditando(false)}
          >
            Cancelar
          </Button>
        </div>
      </form>
    )
  }

  return (
    <div className="grid gap-2 rounded-lg border p-4">
      {erro && (
        <Alert variant="destructive">
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="grid gap-1">
          <p className="flex items-center gap-2 text-sm font-medium">
            {urna.tipo === "digital" ? (
              <Monitor className="size-4" />
            ) : (
              <Box className="size-4" />
            )}
            {urna.nome ?? "(sem nome)"}
          </p>
          <p className="text-muted-foreground text-xs">{fmtJanela(urna)}</p>
          <p className="text-muted-foreground text-xs">
            {urna.compareceram.toLocaleString("pt-BR")} de{" "}
            {urna.totalAptos.toLocaleString("pt-BR")} compareceram
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Badge variant="outline">
            {urna.tipo === "digital" ? "Digital" : "Física"}
          </Badge>
          {urna.aberta ? (
            <Badge
              variant="outline"
              className="border-success/40 text-success-fg"
            >
              Aberta
            </Badge>
          ) : (
            <Badge variant="outline" className="text-muted-foreground">
              Fechada
            </Badge>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setEditando(true)}
            aria-label="Editar urna"
          >
            <Pencil />
          </Button>
          <form
            action={actApagar}
            onSubmit={(e) => {
              if (!confirm("Excluir esta urna?")) e.preventDefault()
            }}
          >
            <input type="hidden" name="assembleia_id" value={assembleiaId} />
            <input type="hidden" name="urna_id" value={urna.id} />
            <Button
              type="submit"
              variant="ghost"
              size="icon"
              disabled={apagando}
              aria-label="Excluir urna"
            >
              {apagando ? <Loader2 className="animate-spin" /> : <Trash2 />}
            </Button>
          </form>
        </div>
      </div>
      {apuradores.length > 0 && (
        <AtribuirApurador
          assembleiaId={assembleiaId}
          urna={urna}
          apuradores={apuradores}
        />
      )}
      <LacresUrna assembleiaId={assembleiaId} urna={urna} />
    </div>
  )
}

// ── Lacres da urna ──────────────────────────────────────────────────────────

const ROTULO_TIPO_LACRE = { boca: "Boca da urna", principal: "Principal" }

function LacresUrna({
  assembleiaId,
  urna,
}: {
  assembleiaId: string
  urna: UrnaComLacres
}) {
  const [aberto, setAberto] = useState(false)
  const [mostrarForm, setMostrarForm] = useState(false)
  const [estado, formAction, pendente] = useActionState(registrarLacreAction, {})
  const [estRemover, removerAction] = useActionState(removerLacreAction, {})

  return (
    <div className="rounded-md border border-dashed p-3">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="flex w-full items-center justify-between gap-2 text-left text-sm font-medium"
      >
        <span className="flex items-center gap-2">
          <ShieldCheck className="size-4" />
          Lacres {urna.lacres.length > 0 && `(${urna.lacres.length})`}
        </span>
        <span className="text-muted-foreground text-xs">
          {aberto ? "ocultar" : "ver"}
        </span>
      </button>

      {aberto && (
        <div className="mt-3 grid gap-3">
          {(estado.erro || estRemover.erro) && (
            <Alert variant="destructive">
              <AlertDescription>
                {estado.erro ?? estRemover.erro}
              </AlertDescription>
            </Alert>
          )}
          {urna.lacres.length === 0 ? (
            <p className="text-muted-foreground text-xs">
              Nenhum lacre registrado. A boca é lacrada ao fim de cada dia e
              rompida no dia seguinte; a principal fica lacrada até a apuração.
            </p>
          ) : (
            <div className="grid gap-1.5">
              {urna.lacres.map((l) => (
                <LacreItem
                  key={l.id}
                  lacre={l}
                  assembleiaId={assembleiaId}
                  removerAction={removerAction}
                />
              ))}
            </div>
          )}

          {mostrarForm ? (
            <form
              action={formAction}
              className="grid gap-3 rounded-md border p-3"
              onSubmit={() => setMostrarForm(true)}
            >
              <input type="hidden" name="assembleia_id" value={assembleiaId} />
              <input type="hidden" name="urna_id" value={urna.id} />
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor={`lacre-tipo-${urna.id}`}>Lacre</Label>
                  <select
                    id={`lacre-tipo-${urna.id}`}
                    name="tipo"
                    className="border-input bg-background h-9 rounded-md border px-3 text-sm"
                  >
                    <option value="boca">Boca da urna</option>
                    <option value="principal">Principal</option>
                  </select>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor={`lacre-evento-${urna.id}`}>Evento</Label>
                  <select
                    id={`lacre-evento-${urna.id}`}
                    name="evento"
                    className="border-input bg-background h-9 rounded-md border px-3 text-sm"
                  >
                    <option value="instalado">Instalado</option>
                    <option value="rompido">Rompido</option>
                  </select>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor={`lacre-numero-${urna.id}`}>Número/série *</Label>
                  <Input id={`lacre-numero-${urna.id}`} name="numero" required />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor={`lacre-data-${urna.id}`}>Data/hora</Label>
                  <Input
                    id={`lacre-data-${urna.id}`}
                    name="data"
                    type="datetime-local"
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="guardado_na_urna"
                  className="size-4"
                />
                <span>Lacre rompido guardado dentro da urna</span>
              </label>
              <div className="grid gap-1.5">
                <Label htmlFor={`lacre-obs-${urna.id}`}>Observação</Label>
                <Input id={`lacre-obs-${urna.id}`} name="observacao" />
              </div>
              <div className="flex gap-2">
                <Button type="submit" size="sm" disabled={pendente}>
                  {pendente && <Loader2 className="animate-spin" />}
                  Registrar lacre
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setMostrarForm(false)}
                >
                  Cancelar
                </Button>
              </div>
            </form>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setMostrarForm(true)}
            >
              <Plus />
              Registrar lacre
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

function LacreItem({
  lacre,
  assembleiaId,
  removerAction,
}: {
  lacre: LacreLinha
  assembleiaId: string
  removerAction: (fd: FormData) => void
}) {
  const fmt = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleString("pt-BR", {
          day: "2-digit",
          month: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        })
      : "—"
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2 text-xs">
      <div className="flex items-center gap-2">
        {lacre.evento === "rompido" ? (
          <Unlock className="size-3.5 text-destructive" />
        ) : (
          <Lock className="text-success-fg size-3.5" />
        )}
        <span className="font-medium">{ROTULO_TIPO_LACRE[lacre.tipo]}</span>
        <span className="font-mono">nº {lacre.numero ?? "—"}</span>
        <Badge variant="outline">
          {lacre.evento === "rompido" ? "Rompido" : "Instalado"}
        </Badge>
        <span className="text-muted-foreground">{fmt(lacre.data)}</span>
        {lacre.guardadoNaUrna && (
          <span className="text-muted-foreground">· guardado na urna</span>
        )}
      </div>
      <form action={removerAction}>
        <input type="hidden" name="assembleia_id" value={assembleiaId} />
        <input type="hidden" name="lacre_id" value={lacre.id} />
        <Button
          type="submit"
          variant="ghost"
          size="icon"
          className="size-6"
          aria-label="Remover lacre"
        >
          <Trash2 className="size-3.5" />
        </Button>
      </form>
    </div>
  )
}

function NovaUrna({ assembleiaId }: { assembleiaId: string }) {
  const [aberto, setAberto] = useState(false)
  const [estado, formAction, pendente] = useActionState(criarUrnaAction, {})

  if (!aberto) {
    return (
      <Button variant="outline" size="sm" onClick={() => setAberto(true)}>
        <Plus />
        Nova urna
      </Button>
    )
  }
  return (
    <form
      action={formAction}
      className="grid gap-4 rounded-lg border border-dashed p-4"
    >
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <input type="hidden" name="assembleia_id" value={assembleiaId} />
      <CamposUrna />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Plus />}
          Criar urna
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setAberto(false)}
        >
          Cancelar
        </Button>
      </div>
    </form>
  )
}

// ── Mesários ────────────────────────────────────────────────────────────────

function CamposMesario({ mesario }: { mesario?: MesarioLinha }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="grid gap-1.5 sm:col-span-2">
        <Label htmlFor="mesario-nome">Nome completo *</Label>
        <Input
          id="mesario-nome"
          name="nome"
          required
          defaultValue={mesario?.nome ?? ""}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="mesario-cpf">CPF</Label>
        <Input
          id="mesario-cpf"
          name="cpf"
          defaultValue={mesario?.cpf ? formatarCpf(mesario.cpf) : ""}
          placeholder="Opcional"
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="mesario-email">E-mail *</Label>
        <Input
          id="mesario-email"
          name="email"
          type="email"
          required
          defaultValue={mesario?.email ?? ""}
          placeholder="acesso ao ambiente do mesário"
        />
      </div>
    </div>
  )
}

function MesarioItem({
  assembleiaId,
  mesario,
}: {
  assembleiaId: string
  mesario: MesarioLinha
}) {
  const [editando, setEditando] = useState(false)
  const [estSalvar, actSalvar, salvando] = useActionState(
    salvarMesarioAction,
    {}
  )
  const [estApagar, actApagar, apagando] = useActionState(
    removerMesarioAction,
    {}
  )
  const erro = estSalvar.erro ?? estApagar.erro

  if (editando) {
    return (
      <form action={actSalvar} className="grid gap-4 rounded-lg border p-4">
        {erro && (
          <Alert variant="destructive">
            <AlertDescription>{erro}</AlertDescription>
          </Alert>
        )}
        <input type="hidden" name="assembleia_id" value={assembleiaId} />
        <input type="hidden" name="mesario_id" value={mesario.id} />
        <CamposMesario mesario={mesario} />
        <label className="flex items-center gap-2 text-sm">
          <Switch name="ativo" defaultChecked={mesario.ativo} />
          <span>Mesário ativo</span>
        </label>
        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={salvando}>
            {salvando && <Loader2 className="animate-spin" />}
            Salvar mesário
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setEditando(false)}
          >
            Cancelar
          </Button>
        </div>
      </form>
    )
  }

  return (
    <div className="grid gap-2 rounded-lg border p-3">
      {erro && (
        <Alert variant="destructive">
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium">{mesario.nome ?? "(sem nome)"}</p>
          <p className="text-muted-foreground text-xs">
            {mesario.email ?? "—"}
            {mesario.cpf ? ` · ${formatarCpf(mesario.cpf)}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {!mesario.ativo && (
            <Badge variant="outline" className="text-muted-foreground">
              Inativo
            </Badge>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setEditando(true)}
            aria-label="Editar mesário"
          >
            <Pencil />
          </Button>
          <form
            action={actApagar}
            onSubmit={(e) => {
              if (!confirm("Excluir este mesário?")) e.preventDefault()
            }}
          >
            <input type="hidden" name="assembleia_id" value={assembleiaId} />
            <input type="hidden" name="mesario_id" value={mesario.id} />
            <Button
              type="submit"
              variant="ghost"
              size="icon"
              disabled={apagando}
              aria-label="Excluir mesário"
            >
              {apagando ? <Loader2 className="animate-spin" /> : <Trash2 />}
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}

function NovoMesario({
  assembleiaId,
  rodadaId,
}: {
  assembleiaId: string
  rodadaId: string
}) {
  const [aberto, setAberto] = useState(false)
  const [estado, formAction, pendente] = useActionState(criarMesarioAction, {})

  if (!aberto) {
    return (
      <Button variant="outline" size="sm" onClick={() => setAberto(true)}>
        <UserPlus />
        Cadastrar mesário
      </Button>
    )
  }
  return (
    <form
      action={formAction}
      className="grid gap-4 rounded-lg border border-dashed p-4"
    >
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <input type="hidden" name="assembleia_id" value={assembleiaId} />
      <input type="hidden" name="rodada_id" value={rodadaId} />
      <CamposMesario />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <UserPlus />}
          Cadastrar
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setAberto(false)}
        >
          Cancelar
        </Button>
      </div>
    </form>
  )
}

// ── Apuradores (mesmo molde dos mesários) ───────────────────────────────────

function CamposApurador({ apurador }: { apurador?: ApuradorBasico }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="grid gap-1.5 sm:col-span-2">
        <Label htmlFor="ap-nome">Nome completo *</Label>
        <Input id="ap-nome" name="nome" required defaultValue={apurador?.nome ?? ""} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="ap-cpf">CPF</Label>
        <Input
          id="ap-cpf"
          name="cpf"
          defaultValue={apurador?.cpf ? formatarCpf(apurador.cpf) : ""}
          placeholder="Opcional"
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="ap-email">E-mail *</Label>
        <Input
          id="ap-email"
          name="email"
          type="email"
          required
          defaultValue={apurador?.email ?? ""}
          placeholder="acesso ao ambiente do apurador"
        />
      </div>
    </div>
  )
}

function ApuradorItem({
  assembleiaId,
  apurador,
}: {
  assembleiaId: string
  apurador: ApuradorBasico
}) {
  const [editando, setEditando] = useState(false)
  const [estSalvar, actSalvar, salvando] = useActionState(salvarApuradorAction, {})
  const [estApagar, actApagar, apagando] = useActionState(removerApuradorAction, {})
  const erro = estSalvar.erro ?? estApagar.erro

  if (editando) {
    return (
      <form action={actSalvar} className="grid gap-4 rounded-lg border p-4">
        {erro && (
          <Alert variant="destructive">
            <AlertDescription>{erro}</AlertDescription>
          </Alert>
        )}
        <input type="hidden" name="assembleia_id" value={assembleiaId} />
        <input type="hidden" name="apurador_id" value={apurador.id} />
        <CamposApurador apurador={apurador} />
        <label className="flex items-center gap-2 text-sm">
          <Switch name="ativo" defaultChecked={apurador.ativo} />
          <span>Apurador ativo</span>
        </label>
        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={salvando}>
            {salvando && <Loader2 className="animate-spin" />}
            Salvar apurador
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setEditando(false)}>
            Cancelar
          </Button>
        </div>
      </form>
    )
  }

  return (
    <div className="grid gap-2 rounded-lg border p-3">
      {erro && (
        <Alert variant="destructive">
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium">{apurador.nome ?? "(sem nome)"}</p>
          <p className="text-muted-foreground text-xs">
            {apurador.email ?? "—"}
            {apurador.cpf ? ` · ${formatarCpf(apurador.cpf)}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {!apurador.ativo && (
            <Badge variant="outline" className="text-muted-foreground">
              Inativo
            </Badge>
          )}
          <Button variant="ghost" size="icon" onClick={() => setEditando(true)} aria-label="Editar apurador">
            <Pencil />
          </Button>
          <form
            action={actApagar}
            onSubmit={(e) => {
              if (!confirm("Excluir este apurador?")) e.preventDefault()
            }}
          >
            <input type="hidden" name="assembleia_id" value={assembleiaId} />
            <input type="hidden" name="apurador_id" value={apurador.id} />
            <Button type="submit" variant="ghost" size="icon" disabled={apagando} aria-label="Excluir apurador">
              {apagando ? <Loader2 className="animate-spin" /> : <Trash2 />}
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}

function NovoApurador({
  assembleiaId,
  rodadaId,
}: {
  assembleiaId: string
  rodadaId: string
}) {
  const [aberto, setAberto] = useState(false)
  const [estado, formAction, pendente] = useActionState(criarApuradorAction, {})

  if (!aberto) {
    return (
      <Button variant="outline" size="sm" onClick={() => setAberto(true)}>
        <UserPlus />
        Cadastrar apurador
      </Button>
    )
  }
  return (
    <form action={formAction} className="grid gap-4 rounded-lg border border-dashed p-4">
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <input type="hidden" name="assembleia_id" value={assembleiaId} />
      <input type="hidden" name="rodada_id" value={rodadaId} />
      <CamposApurador />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <UserPlus />}
          Cadastrar
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setAberto(false)}>
          Cancelar
        </Button>
      </div>
    </form>
  )
}

// ── Composição ──────────────────────────────────────────────────────────────

export function UrnasEMesarios({
  assembleiaId,
  rodadaId,
  urnas,
  mesarios,
  apuradores,
}: {
  assembleiaId: string
  rodadaId: string | null
  urnas: UrnaComLacres[]
  mesarios: MesarioLinha[]
  apuradores: ApuradorBasico[]
}) {
  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Urnas</CardTitle>
          <CardDescription>
            Cada urna tem um horário de funcionamento. Digital libera a cédula
            num terminal de votação pareado; física recebe voto em papel.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {urnas.length === 0 && (
            <p className="text-muted-foreground py-2 text-center text-sm">
              Nenhuma urna cadastrada ainda.
            </p>
          )}
          {urnas.map((u) => (
            <UrnaItem
              key={u.id}
              assembleiaId={assembleiaId}
              urna={u}
              apuradores={apuradores}
            />
          ))}
          <NovaUrna assembleiaId={assembleiaId} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Mesários</CardTitle>
          <CardDescription>
            Cadastrados na rodada. Acessam o ambiente do mesário em{" "}
            <code>/mesario</code> pelo e-mail informado (código por e-mail).
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {!rodadaId ? (
            <Alert variant="warning">
              <AlertDescription>
                Esta assembleia ainda não está vinculada a uma rodada — não é
                possível cadastrar mesários.
              </AlertDescription>
            </Alert>
          ) : (
            <>
              {mesarios.length === 0 && (
                <p className="text-muted-foreground py-2 text-center text-sm">
                  Nenhum mesário cadastrado nesta rodada ainda.
                </p>
              )}
              {mesarios.map((m) => (
                <MesarioItem
                  key={m.id}
                  assembleiaId={assembleiaId}
                  mesario={m}
                />
              ))}
              <NovoMesario assembleiaId={assembleiaId} rodadaId={rodadaId} />
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Apuradores</CardTitle>
          <CardDescription>
            Cadastrados na rodada. Acessam <code>/apurador</code> pelo e-mail
            informado. Atribua urnas a cada apurador no cartão da urna acima.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {!rodadaId ? (
            <Alert variant="warning">
              <AlertDescription>
                Esta assembleia ainda não está vinculada a uma rodada — não é
                possível cadastrar apuradores.
              </AlertDescription>
            </Alert>
          ) : (
            <>
              {apuradores.length === 0 && (
                <p className="text-muted-foreground py-2 text-center text-sm">
                  Nenhum apurador cadastrado nesta rodada ainda.
                </p>
              )}
              {apuradores.map((ap) => (
                <ApuradorItem
                  key={ap.id}
                  assembleiaId={assembleiaId}
                  apurador={ap}
                />
              ))}
              <NovoApurador assembleiaId={assembleiaId} rodadaId={rodadaId} />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
