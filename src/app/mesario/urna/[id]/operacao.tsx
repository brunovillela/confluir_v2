"use client"

import { useActionState, useState } from "react"
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  DoorOpen,
  Link2,
  Loader2,
  Lock,
  UserCheck,
  UserPlus,
} from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type {
  AptoUrna,
  EstadoDiaUrna,
  EventoLinha,
} from "@/lib/db/votacao-mesarios"
import { formatarCpf } from "@/lib/cpf"

import {
  abrirUrnaDiaAction,
  fecharUrnaDiaAction,
  parearTerminalAction,
  registrarAnomaliaAction,
  registrarEmSeparadoAction,
  registrarPresencaAction,
} from "../../actions"

const ROTULO_EVENTO: Record<string, string> = {
  instalacao: "Instalação",
  abertura: "Abertura",
  fechamento: "Fechamento",
  encerramento: "Encerramento",
  anomalia: "Anomalia",
}

function fmtHora(iso: string | null): string {
  return iso
    ? new Date(iso).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—"
}

export function RitualUrna({
  urnaId,
  aberta,
  estadoDia,
  eventos,
}: {
  urnaId: string
  aberta: boolean
  estadoDia: EstadoDiaUrna
  eventos: EventoLinha[]
}) {
  const [estAbrir, actAbrir, pendAbrir] = useActionState(abrirUrnaDiaAction, {})
  const [estFechar, actFechar, pendFechar] = useActionState(
    fecharUrnaDiaAction,
    {}
  )
  const [estAnom, actAnom, pendAnom] = useActionState(
    registrarAnomaliaAction,
    {}
  )
  const [anomAberto, setAnomAberto] = useState(false)

  return (
    <div className="grid gap-3 rounded-lg border p-4">
      <p className="flex items-center gap-2 text-sm font-medium">
        <DoorOpen className="size-4" />
        Trabalhos da urna
      </p>

      {estadoDia.encerrada ? (
        <Alert>
          <Lock className="size-4" />
          <AlertDescription>
            Urna <strong>encerrada</strong>. Aguarda a apuração.
          </AlertDescription>
        </Alert>
      ) : estadoDia.abertaHoje ? (
        <>
          <Alert className="border-success/40 text-success-fg">
            <AlertDescription>
              Urna <strong>aberta</strong> hoje. Ao final do dia, faça o
              fechamento (ou o encerramento, se for o último).
            </AlertDescription>
          </Alert>
          {(estFechar.erro || estFechar.ok) && (
            <Alert
              variant={estFechar.erro ? "destructive" : "default"}
              className={estFechar.ok ? "border-success/40 text-success-fg" : ""}
            >
              <AlertDescription>{estFechar.erro ?? estFechar.ok}</AlertDescription>
            </Alert>
          )}
          <form action={actFechar} className="grid gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-end">
            <input type="hidden" name="urna_id" value={urnaId} />
            <div className="grid gap-1.5">
              <Label htmlFor="fecha-lacre">Nº do lacre da boca (no fechamento)</Label>
              <Input id="fecha-lacre" name="lacre_boca" placeholder="Opcional" />
            </div>
            <Button type="submit" variant="outline" size="sm" disabled={pendFechar}>
              {pendFechar && <Loader2 className="animate-spin" />}
              Fechar o dia
            </Button>
            <Button
              type="submit"
              name="encerrar"
              value="on"
              variant="outline"
              size="sm"
              disabled={pendFechar}
              className="border-destructive/40"
              onClick={(e) => {
                if (!confirm("Encerrar a urna? Isso conclui os trabalhos e libera para apuração.")) {
                  e.preventDefault()
                }
              }}
            >
              <Lock />
              Encerrar
            </Button>
          </form>
        </>
      ) : (
        <>
          <Alert variant="warning">
            <AlertDescription>
              A urna está <strong>fechada</strong>. Faça a{" "}
              <strong>Abertura do dia</strong> com o primeiro eleitor para começar.
            </AlertDescription>
          </Alert>
          {estAbrir.erro && (
            <Alert variant="destructive">
              <AlertDescription>{estAbrir.erro}</AlertDescription>
            </Alert>
          )}
          {aberta ? (
            <form action={actAbrir} className="grid gap-3">
              <input type="hidden" name="urna_id" value={urnaId} />
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="abre-eleitor">Primeiro eleitor do dia *</Label>
                  <Input id="abre-eleitor" name="primeiro_eleitor" required />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="abre-lacre">Nº do lacre da boca rompido</Label>
                  <Input id="abre-lacre" name="lacre_boca" />
                </div>
              </div>
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" name="atesta_lacre" className="mt-0.5 size-4" required />
                <span>
                  O eleitor atesta que o lacre da boca foi <strong>rompido</strong> para
                  abrir os trabalhos e <strong>introduzido na boca</strong> da urna.
                </span>
              </label>
              <Button type="submit" size="sm" disabled={pendAbrir}>
                {pendAbrir ? <Loader2 className="animate-spin" /> : <DoorOpen />}
                Abrir urna (abertura do dia)
              </Button>
            </form>
          ) : (
            <p className="text-muted-foreground text-xs">
              A urna está fora do horário — a abertura só é possível dentro da janela.
            </p>
          )}
        </>
      )}

      {/* Anomalia */}
      <div className="border-t pt-3">
        {(estAnom.erro || estAnom.ok) && (
          <Alert
            variant={estAnom.erro ? "destructive" : "default"}
            className={estAnom.ok ? "border-success/40 text-success-fg mb-2" : "mb-2"}
          >
            <AlertDescription>{estAnom.erro ?? estAnom.ok}</AlertDescription>
          </Alert>
        )}
        {anomAberto ? (
          <form action={actAnom} className="grid gap-2">
            <input type="hidden" name="urna_id" value={urnaId} />
            <Label htmlFor="anom-desc" className="flex items-center gap-1.5 text-sm">
              <AlertTriangle className="size-4" />
              Descreva a anomalia (ex.: lacre rompido acidental)
            </Label>
            <textarea
              id="anom-desc"
              name="descricao"
              rows={2}
              required
              className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
            />
            <div className="flex gap-2">
              <Button type="submit" size="sm" variant="outline" disabled={pendAnom}>
                {pendAnom && <Loader2 className="animate-spin" />}
                Registrar anomalia
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setAnomAberto(false)}>
                Cancelar
              </Button>
            </div>
          </form>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => setAnomAberto(true)}>
            <AlertTriangle />
            Registrar anomalia
          </Button>
        )}
      </div>

      {/* Histórico de eventos (atas) */}
      {eventos.length > 0 && (
        <div className="border-t pt-3">
          <p className="text-muted-foreground mb-1.5 text-xs font-medium">
            Eventos e atas
          </p>
          <div className="grid gap-1">
            {eventos.slice(0, 8).map((e) => (
              <div key={e.id} className="flex items-center gap-2 text-xs">
                <Badge variant="outline">{ROTULO_EVENTO[e.tipo] ?? e.tipo}</Badge>
                <span className="text-muted-foreground">{fmtHora(e.data)}</span>
                {e.primeiroEleitor && (
                  <span className="text-muted-foreground truncate">
                    · 1º eleitor: {e.primeiroEleitor}
                  </span>
                )}
                {e.descricao && (
                  <span className="text-muted-foreground truncate">· {e.descricao}</span>
                )}
                <a
                  href={`/mesario/urna/${urnaId}/ata/${e.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary ml-auto shrink-0 underline"
                >
                  Ata PDF
                </a>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export function PareamentoTerminal({ urnaId }: { urnaId: string }) {
  const [estado, formAction, pendente] = useActionState(parearTerminalAction, {})
  return (
    <form
      action={formAction}
      className="grid gap-3 rounded-lg border border-dashed p-4"
    >
      <div className="grid gap-1">
        <p className="flex items-center gap-2 text-sm font-medium">
          <Link2 className="size-4" />
          Parear terminal de votação
        </p>
        <p className="text-muted-foreground text-xs">
          Abra <code>/urna</code> no computador de votação e digite aqui o
          código que ele mostrar.
        </p>
      </div>
      <input type="hidden" name="urna_id" value={urnaId} />
      <div className="flex gap-2">
        <div className="grid flex-1 gap-1.5 sm:max-w-[12rem]">
          <Label htmlFor="codigo" className="sr-only">
            Código do terminal
          </Label>
          <Input
            id="codigo"
            name="codigo"
            required
            autoCapitalize="characters"
            className="font-mono tracking-widest uppercase"
            placeholder="Ex.: K7P2QX"
          />
        </div>
        <Button type="submit" variant="secondary" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Link2 />}
          Parear
        </Button>
      </div>
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      {estado.ok && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>{estado.ok}</AlertDescription>
        </Alert>
      )}
    </form>
  )
}

export function VotoEmSeparado({
  urnaId,
  aberta,
}: {
  urnaId: string
  aberta: boolean
}) {
  const [aberto, setAberto] = useState(false)
  const [estado, formAction, pendente] = useActionState(
    registrarEmSeparadoAction,
    {}
  )

  // Após cadastrar: mostra as orientações do procedimento.
  if (estado.ok && estado.instrucoes) {
    return (
      <div className="grid gap-3 rounded-lg border border-dashed p-4">
        <p className="flex items-center gap-2 text-sm font-medium">
          <ClipboardList className="size-4" />
          Voto em separado cadastrado — siga o procedimento
        </p>
        <ol className="text-muted-foreground grid list-decimal gap-1.5 pl-5 text-sm">
          {estado.instrucoes.map((linha, i) => (
            <li key={i}>{linha}</li>
          ))}
        </ol>
        {estado.digital && (
          <Alert className="border-success/40 text-success-fg">
            <CheckCircle2 className="size-4" />
            <AlertDescription>
              Cédula liberada no terminal de votação para o eleitor votar.
            </AlertDescription>
          </Alert>
        )}
        <div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              // recarrega o form limpo para o próximo
              window.location.reload()
            }}
          >
            Cadastrar outro
          </Button>
        </div>
      </div>
    )
  }

  if (!aberto) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => setAberto(true)}
        disabled={!aberta}
      >
        <UserPlus />
        Voto em separado
      </Button>
    )
  }

  return (
    <form
      action={formAction}
      className="grid gap-4 rounded-lg border border-dashed p-4"
    >
      <div className="grid gap-1">
        <p className="text-sm font-medium">Cadastrar voto em separado</p>
        <p className="text-muted-foreground text-xs">
          Para o eleitor que alega direito mas não está na lista de aptos. O voto
          é validado na apuração.
        </p>
      </div>
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      <input type="hidden" name="urna_id" value={urnaId} />
      <div className="grid gap-1.5">
        <Label htmlFor="es-nome">Nome completo *</Label>
        <Input id="es-nome" name="nome" required />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="es-cpf">CPF</Label>
          <Input id="es-cpf" name="cpf" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="es-nasc">Data de nascimento</Label>
          <Input id="es-nasc" name="data_nascimento" type="date" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="es-tel">Telefone</Label>
          <Input id="es-tel" name="telefone" inputMode="tel" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="es-email">E-mail</Label>
          <Input id="es-email" name="email" type="email" />
        </div>
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <UserPlus />}
          Cadastrar e liberar
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

export function ListaPresenca({
  urnaId,
  aberta,
  aptos,
}: {
  urnaId: string
  aberta: boolean
  aptos: AptoUrna[]
}) {
  const [estado, formAction, pendente] = useActionState(
    registrarPresencaAction,
    {}
  )
  return (
    <div className="grid gap-3">
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      {estado.ok && (
        <Alert className="border-success/40 text-success-fg">
          <CheckCircle2 className="size-4" />
          <AlertDescription>{estado.ok}</AlertDescription>
        </Alert>
      )}
      {aptos.length === 0 ? (
        <p className="text-muted-foreground py-4 text-center text-sm">
          Nenhum eleitor encontrado.
        </p>
      ) : (
        <div className="grid gap-2">
          {aptos.map((a) => (
            <div
              key={a.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2.5 text-sm"
            >
              <div className="min-w-0">
                <p className="font-medium">{a.nome ?? "(sem nome)"}</p>
                <p className="text-muted-foreground font-mono text-xs">
                  {a.cpf
                    ? formatarCpf(a.cpf)
                    : a.matricula
                      ? `mat. ${a.matricula}`
                      : "—"}
                </p>
              </div>
              {a.compareceu ? (
                <Badge
                  variant="outline"
                  className="border-success/40 text-success-fg"
                >
                  Compareceu
                </Badge>
              ) : aberta ? (
                <form action={formAction}>
                  <input type="hidden" name="urna_id" value={urnaId} />
                  <input type="hidden" name="apto_id" value={a.id} />
                  <Button
                    type="submit"
                    size="sm"
                    variant="outline"
                    disabled={pendente}
                  >
                    {pendente ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <UserCheck />
                    )}
                    Registrar presença
                  </Button>
                </form>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
