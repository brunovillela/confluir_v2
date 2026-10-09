"use client"

import Link from "next/link"
import { useActionState, useState } from "react"
import {
  Activity,
  CalendarClock,
  FileText,
  Gavel,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  Vote,
} from "lucide-react"

import { ModalidadeBadge } from "@/components/assembleias"
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Switch } from "@/components/ui/switch"
import {
  MODALIDADES,
  ROTULOS_MODALIDADE,
  temUrna,
  type Modalidade,
  type SituacaoJanela,
} from "@/lib/assembleias-constantes"
import type { AssembleiaLinha } from "@/lib/db/assembleias"
import { formatarData, formatarDataHora } from "@/lib/formato"

import {
  anexarAtaAction,
  apagarAssembleia,
  novaAssembleia,
  prorrogarAssembleiaAction,
  salvarAssembleia,
} from "./actions"
import { confirmarEnvio } from "@/components/ui/confirmacao"

const TEXTAREA =
  "border-input bg-background text-foreground w-full rounded-md border px-3 py-2 text-sm shadow-xs outline-none"

const DESCRICOES_MODALIDADE: Record<Modalidade, string> = {
  online: "Eleitores votam pelo sistema (área do filiado ou /votar público).",
  urna: "Presencial no local: mesário registra a presença; voto em urna física ou digital.",
  hibrida: "Online e presencial com urnas ao mesmo tempo.",
  reuniao:
    "Reunião de colaboradores na base, com ata assinada; o resultado entra agregado.",
}

export function AssembleiasDaRodada({
  rodadaId,
  assembleias,
  esquemaPronto,
  editavel,
  motivoBloqueio,
  janelas,
  atas,
  terminoDaRodada,
}: {
  rodadaId: string
  assembleias: AssembleiaLinha[]
  esquemaPronto: boolean
  editavel: boolean
  motivoBloqueio: string | null
  /** Situação da janela de cada assembleia, calculada no servidor. */
  janelas: Record<string, JanelaItem>
  /** Link assinado da ata de cada assembleia que tem ata. */
  atas: Record<string, string>
  terminoDaRodada: string | null
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Assembleias da rodada</CardTitle>
        <CardDescription>
          Onde e como os aptos votam dentro do período: online, urna com
          mesário ou reunião de trabalhadores.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {!esquemaPronto && (
          <Alert variant="warning">
            <AlertDescription>
              Rode <code>supabase/assembleias.sql</code> no SQL Editor do
              Supabase para habilitar o vínculo assembleia→rodada.
            </AlertDescription>
          </Alert>
        )}
        {!editavel && motivoBloqueio && (
          <p className="text-muted-foreground text-sm">{motivoBloqueio}</p>
        )}
        {assembleias.length === 0 && esquemaPronto && (
          <p className="text-muted-foreground py-2 text-center text-sm">
            Nenhuma assembleia cadastrada nesta rodada ainda.
          </p>
        )}
        {assembleias.map((a) => (
          <AssembleiaItem
            key={a.id}
            rodadaId={rodadaId}
            assembleia={a}
            editavel={editavel}
            janela={janelas[a.id] ?? { situacao: "antes", fim: null }}
            ataUrl={atas[a.id] ?? null}
            terminoDaRodada={terminoDaRodada}
          />
        ))}
        {esquemaPronto && editavel && (
          <NovaAssembleiaForm rodadaId={rodadaId} />
        )}
      </CardContent>
    </Card>
  )
}

function CamposAssembleia({
  assembleia,
  prefixo,
}: {
  assembleia?: AssembleiaLinha
  prefixo: string
}) {
  return (
    <>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="grid gap-1.5 md:col-span-2">
          <Label htmlFor={`${prefixo}-nome`}>Nome da assembleia *</Label>
          <Input
            id={`${prefixo}-nome`}
            name="nome"
            required
            defaultValue={assembleia?.nome ?? ""}
            placeholder="Ex.: Assembleia online — Unidade central"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${prefixo}-inicio`}>Início</Label>
          <Input
            id={`${prefixo}-inicio`}
            name="data_inicio"
            type="date"
            defaultValue={assembleia?.data_inicio ?? ""}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${prefixo}-termino`}>Término</Label>
          <Input
            id={`${prefixo}-termino`}
            name="data_termino"
            type="date"
            defaultValue={assembleia?.data_termino ?? ""}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${prefixo}-hora-inicio`}>Hora de início</Label>
          <Input
            id={`${prefixo}-hora-inicio`}
            name="hora_inicio"
            type="time"
            defaultValue={assembleia?.hora_inicio ?? ""}
          />
          <p className="text-muted-foreground text-xs">
            Em branco, a votação abre à 0h do dia de início.
          </p>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${prefixo}-hora-termino`}>Hora de término</Label>
          <Input
            id={`${prefixo}-hora-termino`}
            name="hora_termino"
            type="time"
            defaultValue={assembleia?.hora_termino ?? ""}
          />
          <p className="text-muted-foreground text-xs">
            Em branco, fecha às 23h59 do dia de término.
          </p>
        </div>
        <div className="grid gap-1.5 md:col-span-2">
          <Label htmlFor={`${prefixo}-descricao`}>Descrição</Label>
          <textarea
            id={`${prefixo}-descricao`}
            name="descricao"
            rows={2}
            defaultValue={assembleia?.descricao ?? ""}
            className={TEXTAREA}
          />
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label>Modalidade *</Label>
        <RadioGroup
          name="modalidade"
          defaultValue={assembleia?.modalidade ?? "online"}
          className="grid gap-2 md:grid-cols-2"
        >
          {MODALIDADES.map((m) => (
            <label
              key={m}
              className="hover:bg-muted/40 flex cursor-pointer items-start gap-2 rounded-lg border p-3"
            >
              <RadioGroupItem value={m} className="mt-0.5" />
              <span className="grid gap-0.5">
                <span className="text-sm font-medium">
                  {ROTULOS_MODALIDADE[m]}
                </span>
                <span className="text-muted-foreground text-xs">
                  {DESCRICOES_MODALIDADE[m]}
                </span>
              </span>
            </label>
          ))}
        </RadioGroup>
      </div>

      <VotoEmSeparadoSwitch inicial={assembleia?.voto_em_separado ?? false} />
      <SomenteFiliadosSwitch inicial={assembleia?.somente_filiados ?? false} />

      <div className="grid gap-3 rounded-lg border p-3">
        <div className="grid gap-0.5">
          <p className="text-sm font-medium">Assembleia virtual (opcional)</p>
          <p className="text-muted-foreground text-xs">
            Quando houver reunião online, informe o link da sala com a data e a hora. O link vai no e-mail
            de aviso aos aptos.
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-4">
          <div className="grid gap-1.5 md:col-span-2">
            <Label htmlFor={`${prefixo}-sala-link`}>Link da sala</Label>
            <Input
              id={`${prefixo}-sala-link`}
              name="sala_link"
              type="url"
              inputMode="url"
              defaultValue={assembleia?.sala_link ?? ""}
              placeholder="https://meet.google.com/…"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${prefixo}-sala-data`}>Data</Label>
            <Input
              id={`${prefixo}-sala-data`}
              name="sala_data"
              type="date"
              defaultValue={assembleia?.sala_data ?? ""}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${prefixo}-sala-hora`}>Hora</Label>
            <Input
              id={`${prefixo}-sala-hora`}
              name="sala_hora"
              type="time"
              defaultValue={assembleia?.sala_hora ?? ""}
            />
          </div>
        </div>
      </div>
    </>
  )
}

/**
 * Pleito INTERNO × assembleia da categoria.
 *
 * Assembleia de categoria é de toda a base — vota quem trabalha, filiado ou
 * não. Já a eleição de diretoria e a consulta aos associados são só de
 * filiados, e é nelas que a carência de filiação faz sentido. Sem este
 * marcador não havia como o sistema saber a diferença.
 */
function SomenteFiliadosSwitch({ inicial }: { inicial: boolean }) {
  const [ativo, setAtivo] = useState(inicial)
  return (
    <div className="grid gap-1">
      <label className="flex items-center gap-2 text-sm">
        <Switch
          checked={ativo}
          onCheckedChange={setAtivo}
          aria-label="Pleito somente para filiados"
        />
        <span className={ativo ? "font-medium" : "text-muted-foreground"}>
          Somente filiados
        </span>
        <input
          type="hidden"
          name="somente_filiados"
          value={ativo ? "on" : ""}
        />
      </label>
      <p className="text-muted-foreground text-xs">
        {ativo
          ? "Pleito interno: votam apenas filiados, e a carência configurada em Filiados se aplica."
          : "Assembleia da categoria: vota toda a base apta, filiada ou não. Nenhuma carência se aplica."}
      </p>
    </div>
  )
}

function VotoEmSeparadoSwitch({ inicial }: { inicial: boolean }) {
  const [ativo, setAtivo] = useState(inicial)
  return (
    <label className="flex items-center gap-2 text-sm">
      <Switch
        checked={ativo}
        onCheckedChange={setAtivo}
        aria-label="Permitir voto em separado"
      />
      <span className={ativo ? "font-medium" : "text-muted-foreground"}>
        Voto em separado
      </span>
      <input type="hidden" name="voto_em_separado" value={ativo ? "on" : ""} />
    </label>
  )
}

export type JanelaItem = {
  situacao: SituacaoJanela
  /** Fim da janela (ISO); sem término próprio, o da rodada. */
  fim: string | null
}

/** Agendada → Em votação → Encerrada (aguarda ou com apuração). */
function SituacaoBadge({
  situacao,
  apuracaoEncerrada,
}: {
  situacao: SituacaoJanela
  apuracaoEncerrada: boolean
}) {
  if (apuracaoEncerrada) {
    return <Badge variant="secondary">Apuração encerrada</Badge>
  }
  if (situacao === "aberta") return <Badge variant="success">Em votação</Badge>
  if (situacao === "encerrada") {
    return <Badge variant="warning">Encerrada · a apurar</Badge>
  }
  return <Badge variant="info">Agendada</Badge>
}

function AssembleiaItem({
  rodadaId,
  assembleia,
  editavel,
  janela,
  ataUrl,
  terminoDaRodada,
}: {
  rodadaId: string
  assembleia: AssembleiaLinha
  editavel: boolean
  janela: JanelaItem
  ataUrl: string | null
  terminoDaRodada: string | null
}) {
  const [editando, setEditando] = useState(false)
  const [estadoSalvar, salvarAction, salvando] = useActionState(
    salvarAssembleia,
    {}
  )
  const [estadoApagar, apagarAction, apagando] = useActionState(
    apagarAssembleia,
    {}
  )
  const erro = estadoSalvar.erro ?? estadoApagar.erro

  // Depois do início: nada de editar nem excluir — só prorrogar o término
  // (regra do usuário, 09/10/2026). Apurar só depois do término.
  const iniciada = janela.situacao !== "antes"
  const podeEditar = editavel && !iniciada
  const podeApurar =
    janela.situacao === "encerrada" || assembleia.apuracao_encerrada
  const podeProrrogar = iniciada && !assembleia.apuracao_encerrada

  if (editando && podeEditar) {
    return (
      <form
        action={salvarAction}
        className="grid gap-4 rounded-lg border p-4"
      >
        {erro && (
          <Alert variant="destructive">
            <AlertDescription>{erro}</AlertDescription>
          </Alert>
        )}
        <input type="hidden" name="rodada_id" value={rodadaId} />
        <input type="hidden" name="assembleia_id" value={assembleia.id} />
        <CamposAssembleia assembleia={assembleia} prefixo={assembleia.id} />
        <div className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor={`${assembleia.id}-edital`}>Edital (PDF)</Label>
            <Input
              id={`${assembleia.id}-edital`}
              name="edital"
              type="file"
              accept="application/pdf"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${assembleia.id}-ata`}>Ata (PDF)</Label>
            <Input
              id={`${assembleia.id}-ata`}
              name="ata"
              type="file"
              accept="application/pdf"
            />
          </div>
        </div>
        <div className="flex gap-2">
          <Button type="submit" size="sm" disabled={salvando}>
            {salvando && <Loader2 className="animate-spin" />}
            Salvar assembleia
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
    <div className="grid gap-3 rounded-lg border p-4">
      {erro && (
        <Alert variant="destructive">
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      )}
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="grid min-w-0 gap-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="mr-1 text-sm font-medium">
              {assembleia.nome ?? "(sem nome)"}
            </p>
            <SituacaoBadge
              situacao={janela.situacao}
              apuracaoEncerrada={assembleia.apuracao_encerrada}
            />
            <ModalidadeBadge modalidade={assembleia.modalidade} />
            {assembleia.voto_em_separado && (
              <Badge variant="outline">Voto em separado</Badge>
            )}
            {assembleia.somente_filiados && (
              <Badge variant="secondary">Somente filiados</Badge>
            )}
          </div>
          <p className="text-muted-foreground text-xs">
            {assembleia.data_inicio || assembleia.data_termino
              ? `${formatarData(assembleia.data_inicio)}${assembleia.hora_inicio ? ` ${assembleia.hora_inicio}` : ""} a ${formatarData(assembleia.data_termino)}${assembleia.hora_termino ? ` ${assembleia.hora_termino}` : ""}`
              : "Sem datas definidas"}
            {assembleia.descricao ? ` · ${assembleia.descricao}` : ""}
          </p>
          {assembleia.sala_link && (
            <p className="text-xs">
              <span className="text-muted-foreground">Sala virtual: </span>
              {formatarData(assembleia.sala_data)}
              {assembleia.sala_hora ? ` às ${assembleia.sala_hora}` : ""} ·{" "}
              <a
                href={assembleia.sala_link}
                target="_blank"
                rel="noreferrer"
                className="text-primary underline underline-offset-4"
              >
                abrir link
              </a>
            </p>
          )}
        </div>
        {podeEditar && (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setEditando(true)}
              aria-label="Editar assembleia"
            >
              <Pencil />
            </Button>
            <form
              action={apagarAction}
              onSubmit={(e) => {
                confirmarEnvio(e, "Excluir esta assembleia?")
              }}
            >
              <input type="hidden" name="rodada_id" value={rodadaId} />
              <input type="hidden" name="assembleia_id" value={assembleia.id} />
              <Button
                type="submit"
                variant="ghost"
                size="icon"
                disabled={apagando}
                aria-label="Excluir assembleia"
              >
                {apagando ? <Loader2 className="animate-spin" /> : <Trash2 />}
              </Button>
            </form>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {temUrna(assembleia.modalidade) && (
          <>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/painel/representacao/votacoes/urnas/${assembleia.id}`}>
                <Vote />
                Urnas e mesários
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/painel/representacao/votacoes/acompanhamento/${assembleia.id}`}>
                <Activity />
                Acompanhar
              </Link>
            </Button>
          </>
        )}
        {podeApurar ? (
          <Button variant="outline" size="sm" asChild>
            <Link href={`/painel/representacao/votacoes/apuracao/${assembleia.id}`}>
              <Gavel />
              Apurar
            </Link>
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            disabled
            title={
              janela.fim
                ? `A apuração abre após o término, em ${formatarDataHora(janela.fim)}.`
                : "A apuração abre após o término da assembleia."
            }
          >
            <Gavel />
            Apurar
          </Button>
        )}
        {podeProrrogar && (
          <ProrrogarBotao
            rodadaId={rodadaId}
            assembleia={assembleia}
            fimAtual={janela.fim}
            terminoDaRodada={terminoDaRodada}
          />
        )}
        <AtaBotao
          rodadaId={rodadaId}
          assembleia={assembleia}
          ataUrl={ataUrl}
        />
        {!podeApurar && janela.fim && (
          <span className="text-muted-foreground text-xs">
            Apuração liberada em {formatarDataHora(janela.fim)}
          </span>
        )}
      </div>
    </div>
  )
}

/**
 * Ata da assembleia: ver a atual e anexar (ou trocar). Fica fora da edição
 * porque a ata chega depois da assembleia, quando a edição já travou.
 */
function AtaBotao({
  rodadaId,
  assembleia,
  ataUrl,
}: {
  rodadaId: string
  assembleia: AssembleiaLinha
  ataUrl: string | null
}) {
  const [aberto, setAberto] = useState(false)
  const [estado, formAction, pendente] = useActionState(anexarAtaAction, {})

  const [estadoAnterior, setEstadoAnterior] = useState(estado)
  if (estado !== estadoAnterior) {
    setEstadoAnterior(estado)
    if (estado.ok) setAberto(false)
  }

  return (
    <>
      {ataUrl && (
        <Button variant="outline" size="sm" asChild>
          <a href={ataUrl} target="_blank" rel="noreferrer">
            <FileText />
            Ver ata
          </a>
        </Button>
      )}
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogTrigger asChild>
          <Button variant={ataUrl ? "ghost" : "outline"} size="sm">
            {!ataUrl && <FileText />}
            {ataUrl ? "Trocar ata" : "Anexar ata"}
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{ataUrl ? "Trocar a ata" : "Anexar a ata"}</DialogTitle>
            <DialogDescription>
              {assembleia.nome ?? "Assembleia"} — PDF ou imagem, até 4 MB.
              {ataUrl ? " O arquivo novo substitui o atual." : ""}
            </DialogDescription>
          </DialogHeader>
          <form action={formAction} className="grid gap-4">
            {estado.erro && (
              <Alert variant="destructive">
                <AlertDescription>{estado.erro}</AlertDescription>
              </Alert>
            )}
            <input type="hidden" name="rodada_id" value={rodadaId} />
            <input type="hidden" name="assembleia_id" value={assembleia.id} />
            <Input
              name="ata"
              type="file"
              required
              accept="application/pdf,image/png,image/jpeg,image/webp"
              aria-label="Arquivo da ata"
            />
            <DialogFooter>
              <Button type="submit" disabled={pendente}>
                {pendente ? <Loader2 className="animate-spin" /> : <FileText />}
                Anexar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {estado.ok && !aberto && (
        <span className="text-success-fg text-xs">{estado.ok}</span>
      )}
    </>
  )
}

/** Depois do início, só o término muda: data e hora. */
function ProrrogarBotao({
  rodadaId,
  assembleia,
  fimAtual,
  terminoDaRodada,
}: {
  rodadaId: string
  assembleia: AssembleiaLinha
  fimAtual: string | null
  terminoDaRodada: string | null
}) {
  const [aberto, setAberto] = useState(false)
  const [estado, formAction, pendente] = useActionState(
    prorrogarAssembleiaAction,
    {}
  )
  const [data, setData] = useState(assembleia.data_termino ?? "")

  // Fecha o diálogo quando a action confirma (ajuste de estado no render).
  const [estadoAnterior, setEstadoAnterior] = useState(estado)
  if (estado !== estadoAnterior) {
    setEstadoAnterior(estado)
    if (estado.ok) setAberto(false)
  }

  const estendeRodada =
    Boolean(terminoDaRodada) && data > (terminoDaRodada ?? "").slice(0, 10)

  return (
    <>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm">
            <CalendarClock />
            Prorrogar
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Prorrogar a assembleia</DialogTitle>
            <DialogDescription>
              {assembleia.nome ?? "Assembleia"} — término atual{" "}
              {fimAtual ? formatarDataHora(fimAtual) : "não definido"}. Depois
              do início, só o término pode mudar.
            </DialogDescription>
          </DialogHeader>
          <form action={formAction} className="grid gap-4">
            {estado.erro && (
              <Alert variant="destructive">
                <AlertDescription>{estado.erro}</AlertDescription>
              </Alert>
            )}
            <input type="hidden" name="rodada_id" value={rodadaId} />
            <input type="hidden" name="assembleia_id" value={assembleia.id} />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor={`${assembleia.id}-prorroga-data`}>
                  Novo término *
                </Label>
                <Input
                  id={`${assembleia.id}-prorroga-data`}
                  name="data_termino"
                  type="date"
                  required
                  value={data}
                  onChange={(e) => setData(e.target.value)}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={`${assembleia.id}-prorroga-hora`}>
                  Hora de término
                </Label>
                <Input
                  id={`${assembleia.id}-prorroga-hora`}
                  name="hora_termino"
                  type="time"
                  defaultValue={assembleia.hora_termino ?? ""}
                />
                <p className="text-muted-foreground text-xs">
                  Em branco, fecha às 23h59.
                </p>
              </div>
            </div>
            {estendeRodada && (
              <Alert variant="info">
                <AlertDescription>
                  A nova data passa do término da rodada (
                  {formatarData(terminoDaRodada)}). O período da rodada será
                  estendido junto.
                </AlertDescription>
              </Alert>
            )}
            <DialogFooter>
              <Button type="submit" disabled={pendente}>
                {pendente ? <Loader2 className="animate-spin" /> : <CalendarClock />}
                Prorrogar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {estado.ok && !aberto && (
        <span className="text-success-fg text-xs">{estado.ok}</span>
      )}
    </>
  )
}

function NovaAssembleiaForm({ rodadaId }: { rodadaId: string }) {
  const [aberto, setAberto] = useState(false)
  const [estado, formAction, pendente] = useActionState(novaAssembleia, {})

  if (!aberto) {
    return (
      <div>
        <Button variant="outline" size="sm" onClick={() => setAberto(true)}>
          <Plus />
          Nova assembleia
        </Button>
      </div>
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
      <input type="hidden" name="rodada_id" value={rodadaId} />
      <CamposAssembleia prefixo="nova" />
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Plus />}
          Criar assembleia
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
