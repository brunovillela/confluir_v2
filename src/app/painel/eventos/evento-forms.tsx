"use client"

import { useActionState, useEffect, useState } from "react"
import {
  CalendarPlus,
  Loader2,
  Save,
  Send,
  TriangleAlert,
  UserSearch,
} from "lucide-react"

import { GrupoColapsavel } from "@/components/grupo-colapsavel"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { paraCampoDataHora } from "@/lib/formato"

import {
  avaliarInscricao,
  conciliarFiliadosAction,
  enviarRsvpAction,
  mudarSituacaoEvento,
  salvarEvento,
} from "./actions"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

export type EventoInicial = {
  id: string
  titulo: string | null
  descricao: string | null
  local: string | null
  endereco: string | null
  inicio: string | null
  termino: string | null
  lotacao_maxima: number | null
  overbooking_percentual: number
  inscricoes_abrem_em: string | null
  inscricoes_fecham_em: string | null
  limite_inscricoes: number | null
  cota_convidados: number | null
  exige_aprovacao: boolean
  confirma_filiado_automatico: boolean
  exige_foto: boolean
  exige_rsvp: boolean
  rsvp_abre_em: string | null
}

export function EventoForm({
  inicial,
  modoFoto,
}: {
  inicial?: EventoInicial
  /** Modo do tenant: define se a exigência de foto sequer pode ser oferecida. */
  modoFoto: "nenhuma" | "visual" | "biometrica"
}) {
  const [estado, formAction, pendente] = useActionState(salvarEvento, {})
  const [lotacao, setLotacao] = useState(
    inicial?.lotacao_maxima != null ? String(inicial.lotacao_maxima) : ""
  )
  const [overbooking, setOverbooking] = useState(
    String(inicial?.overbooking_percentual ?? 0)
  )
  const [cota, setCota] = useState(
    inicial?.cota_convidados != null ? String(inicial.cota_convidados) : ""
  )
  const [rsvp, setRsvp] = useState(inicial?.exige_rsvp ?? false)

  const l = Number(lotacao) || 0
  const o = Number(overbooking) || 0
  const c = Number(cota) || 0
  const vagas = l > 0 ? l + Math.floor((l * o) / 100) : null
  const publicas = vagas === null ? null : Math.max(0, vagas - c)

  return (
    <form action={formAction} className="grid gap-5">
      {inicial && <input type="hidden" name="id" value={inicial.id} />}
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-2">
        <Label htmlFor="titulo">Título</Label>
        <Input
          id="titulo"
          name="titulo"
          defaultValue={inicial?.titulo ?? ""}
          placeholder="Assembleia Geral Extraordinária"
          required
        />
        {!inicial && (
          <p className="text-muted-foreground text-xs">
            O endereço público do evento é gerado a partir do título e não muda
            depois — escolha com cuidado.
          </p>
        )}
      </div>

      <div className="grid gap-2">
        <Label htmlFor="descricao">Descrição</Label>
        <Textarea
          id="descricao"
          name="descricao"
          rows={4}
          defaultValue={inicial?.descricao ?? ""}
          placeholder="O que é, para quem é, o que a pessoa precisa levar."
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="card">Imagem do card</Label>
        <Input id="card" name="card" type="file" accept=".jpg,.jpeg,.png,.webp" />
        <p className="text-muted-foreground text-xs">
          JPG, PNG ou WebP, até 5 MB. Aparece na página pública e nas redes.
          {inicial ? " Enviar uma nova substitui a atual." : ""}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="inicio">Início</Label>
          <Input
            id="inicio"
            name="inicio"
            type="datetime-local"
            defaultValue={paraCampoDataHora(inicial?.inicio ?? null)}
            required
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="termino">Término</Label>
          <Input
            id="termino"
            name="termino"
            type="datetime-local"
            defaultValue={paraCampoDataHora(inicial?.termino ?? null)}
            required
          />
        </div>
      </div>
      <p className="text-muted-foreground -mt-3 text-xs">
        O evento pode atravessar vários dias. O sistema cria um dia para cada
        data do período — a presença é registrada <strong>por dia</strong>.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="local">Local</Label>
          <Input
            id="local"
            name="local"
            defaultValue={inicial?.local ?? ""}
            placeholder="Sede do sindicato"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="endereco">Endereço</Label>
          <Input
            id="endereco"
            name="endereco"
            defaultValue={inicial?.endereco ?? ""}
          />
        </div>
      </div>

      {/* ── Capacidade ── */}
      <div className="grid gap-4 rounded-md border p-4">
        <p className="text-sm font-medium">Capacidade</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="lotacao_maxima">Lotação máxima</Label>
            <Input
              id="lotacao_maxima"
              name="lotacao_maxima"
              type="number"
              min={1}
              value={lotacao}
              onChange={(e) => setLotacao(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="overbooking_percentual">Overbooking (%)</Label>
            <Input
              id="overbooking_percentual"
              name="overbooking_percentual"
              type="number"
              min={0}
              max={100}
              value={overbooking}
              onChange={(e) => setOverbooking(e.target.value)}
            />
          </div>
        </div>

        <div className="grid gap-2 sm:max-w-60">
          <Label htmlFor="cota_convidados">Vagas guardadas para convidados</Label>
          <Input
            id="cota_convidados"
            name="cota_convidados"
            type="number"
            min={0}
            value={cota}
            onChange={(e) => setCota(e.target.value)}
          />
          <p className="text-muted-foreground text-xs">
            Reserva que o link público nao pode ocupar. Use quando a diretoria
            ainda vai lançar convidados e o auditório corre risco de esgotar
            antes disso.
          </p>
        </div>

        {vagas !== null && (
          <p className="text-muted-foreground text-xs">
            Serão oferecidas <strong>{vagas} vagas</strong> para uma lotação de{" "}
            {l}
            {c > 0 && publicas !== null ? (
              <>
                {" "}
                — <strong>{publicas}</strong> no link público e{" "}
                <strong>{c}</strong> guardadas para convidados
              </>
            ) : null}
            .
          </p>
        )}

        {vagas !== null && c > vagas && (
          <Alert variant="destructive">
            <TriangleAlert />
            <AlertDescription>
              A cota de convidados ({c}) é maior que as vagas ofertadas ({vagas}
              ): o link público não teria vaga alguma.
            </AlertDescription>
          </Alert>
        )}

        {o > 0 && (
          <Alert variant="warning">
            <TriangleAlert />
            <AlertDescription>
              Vagas acima da lotação. Se o comparecimento for maior que o
              previsto, pode haver excesso de pessoas, filas na recepção e
              convidados sem acomodação — a lotação máxima do local é limitada
              pelas normas de prevenção e combate a incêndio e pânico, e não
              pode ser ultrapassada no dia.
            </AlertDescription>
          </Alert>
        )}
      </div>

      {/* ── Travas e regras ── */}
      <GrupoColapsavel
        titulo="Travas e regras de inscrição"
        descricao="Janela de datas, teto próprio, aprovação e RSVP."
      >
        <div className="grid gap-4 pt-2">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="inscricoes_abrem_em">Inscrições abrem em</Label>
              <Input
                id="inscricoes_abrem_em"
                name="inscricoes_abrem_em"
                type="datetime-local"
                defaultValue={paraCampoDataHora(
                  inicial?.inscricoes_abrem_em ?? null
                )}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="inscricoes_fecham_em">Inscrições fecham em</Label>
              <Input
                id="inscricoes_fecham_em"
                name="inscricoes_fecham_em"
                type="datetime-local"
                defaultValue={paraCampoDataHora(
                  inicial?.inscricoes_fecham_em ?? null
                )}
              />
            </div>
          </div>

          <div className="grid gap-2 sm:max-w-60">
            <Label htmlFor="limite_inscricoes">Teto de inscrições</Label>
            <Input
              id="limite_inscricoes"
              name="limite_inscricoes"
              type="number"
              min={1}
              defaultValue={inicial?.limite_inscricoes ?? ""}
            />
            <p className="text-muted-foreground text-xs">
              Trava por quantidade, independente da lotação. Vale o menor entre
              os dois.
            </p>
          </div>

          <label className="flex items-start gap-3 rounded-md border p-3">
            <input
              type="checkbox"
              name="exige_aprovacao"
              className="mt-0.5 size-4"
              defaultChecked={inicial?.exige_aprovacao ?? false}
            />
            <span className="grid gap-1">
              <span className="text-sm font-medium">
                Cada inscrição passa por aprovação
              </span>
              <span className="text-muted-foreground text-xs">
                Sem isto, a inscrição já nasce confirmada assim que o e-mail for
                validado.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-3 rounded-md border p-3">
            <input
              type="checkbox"
              name="confirma_filiado_automatico"
              className="mt-0.5 size-4"
              defaultChecked={inicial?.confirma_filiado_automatico ?? true}
            />
            <span className="grid gap-1">
              <span className="text-sm font-medium">
                Filiado se inscreve direto
              </span>
              <span className="text-muted-foreground text-xs">
                Quem se inscreve pela área do filiado é confirmado na hora,
                mesmo com aprovação ligada.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-3 rounded-md border p-3">
            <input
              type="checkbox"
              name="exige_rsvp"
              className="mt-0.5 size-4"
              checked={rsvp}
              onChange={(e) => setRsvp(e.target.checked)}
            />
            <span className="grid gap-1">
              <span className="text-sm font-medium">Pedir RSVP por e-mail</span>
              <span className="text-muted-foreground text-xs">
                Antes do evento, um e-mail com link pergunta se a pessoa pretende
                comparecer — é o que reduz a incerteza e calibra o overbooking.
              </span>
            </span>
          </label>

          {rsvp && (
            <div className="grid gap-2 sm:max-w-72">
              <Label htmlFor="rsvp_abre_em">A confirmação abre em</Label>
              <Input
                id="rsvp_abre_em"
                name="rsvp_abre_em"
                type="datetime-local"
                defaultValue={paraCampoDataHora(inicial?.rsvp_abre_em ?? null)}
              />
              <p className="text-muted-foreground text-xs">
                Nesta data o e-mail sai e o botão de confirmar aparece para o
                inscrito. Antes disso o passo fica travado, dizendo a ele quando
                a pergunta chega. Escolha depois do fim das inscrições — quem
                confirma no minuto seguinte à inscrição não está dizendo nada
                novo.
              </p>
            </div>
          )}

          {modoFoto === "nenhuma" ? (
            <Alert>
              <AlertDescription>
                A entidade está configurada para <strong>não pedir foto</strong>.
                Para exigir foto neste ou em outros eventos, altere a
                configuração do módulo.
              </AlertDescription>
            </Alert>
          ) : (
            <label className="flex items-start gap-3 rounded-md border p-3">
              <input
                type="checkbox"
                name="exige_foto"
                className="mt-0.5 size-4"
                defaultChecked={inicial?.exige_foto ?? false}
              />
              <span className="grid gap-1">
                <span className="text-sm font-medium">
                  Exigir foto para concluir a inscrição
                </span>
                <span className="text-muted-foreground text-xs">
                  {modoFoto === "biometrica"
                    ? "A foto alimenta o reconhecimento facial do controle de acesso. Marcado, quem recusar NÃO consegue se inscrever — a tela pública dirá isso antes da captura."
                    : "A foto serve à conferência visual na recepção. Marcado, ela passa a ser obrigatória para concluir a inscrição."}
                </span>
              </span>
            </label>
          )}
        </div>
      </GrupoColapsavel>

      <div>
        <Button type="submit" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <Save />}
          {inicial ? "Salvar alterações" : "Criar evento"}
        </Button>
        {!inicial && (
          <p className="text-muted-foreground mt-2 text-xs">
            O evento nasce como rascunho — o link público só vai ao ar quando
            você publicar.
          </p>
        )}
      </div>
    </form>
  )
}

// ── Ciclo de vida ────────────────────────────────────────────────────────────

export function SituacaoEventoForm({
  eventoId,
  situacao,
}: {
  eventoId: string
  situacao: string
}) {
  const [estado, formAction, pendente] = useActionState(mudarSituacaoEvento, {})
  const [nova, setNova] = useState(situacao)

  const precisaMotivo = nova === "cancelado" || nova === "adiado"

  return (
    <form action={formAction} className="grid gap-3">
      <input type="hidden" name="id" value={eventoId} />
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
        <Label htmlFor="situacao">Situação</Label>
        <select
          id="situacao"
          name="situacao"
          className={SELECT}
          value={nova}
          onChange={(e) => setNova(e.target.value)}
        >
          <option value="rascunho">Rascunho</option>
          <option value="publicado">Publicado</option>
          <option value="encerrado">Encerrado</option>
          <option value="adiado">Adiado</option>
          <option value="cancelado">Cancelado</option>
        </select>
      </div>

      {nova === "adiado" && (
        <div className="grid gap-2 sm:max-w-60">
          <Label htmlFor="adiado_para">Nova data (se já houver)</Label>
          <Input id="adiado_para" name="adiado_para" type="datetime-local" />
          <p className="text-muted-foreground text-xs">
            Pode ficar vazio — o aviso dirá que o evento foi adiado sem nova
            data.
          </p>
        </div>
      )}

      {precisaMotivo && (
        <div className="grid gap-2">
          <Label htmlFor="motivo">Motivo</Label>
          <Textarea id="motivo" name="motivo" rows={2} required />
          <p className="text-muted-foreground text-xs">
            Vai no aviso a quem se inscreveu. &quot;Adiado&quot; sem explicação
            gera mais dúvida que informação.
          </p>
        </div>
      )}

      <div>
        <Button
          type="submit"
          size="sm"
          variant={precisaMotivo ? "destructive" : "default"}
          disabled={pendente || nova === situacao}
        >
          {pendente ? <Loader2 className="animate-spin" /> : <CalendarPlus />}
          Aplicar
        </Button>
      </div>
    </form>
  )
}

// ── Avaliação de inscrição ───────────────────────────────────────────────────

export function AvaliarInscricao({
  inscricaoId,
  situacao,
}: {
  inscricaoId: string
  situacao: string
}) {
  const [estado, formAction, pendente] = useActionState(avaliarInscricao, {})
  const [decisao, setDecisao] = useState("")

  return (
    <form action={formAction} className="grid gap-2">
      <input type="hidden" name="inscricao_id" value={inscricaoId} />
      {estado.erro && (
        <p className="text-destructive text-xs">{estado.erro}</p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <select
          name="decisao"
          className={`${SELECT} max-w-44`}
          value={decisao}
          onChange={(e) => setDecisao(e.target.value)}
        >
          <option value="">Situação atual: {situacao}</option>
          <option value="confirmada">Confirmar</option>
          <option value="lista_espera">Lista de espera</option>
          <option value="recusada">Recusar</option>
        </select>
        <Button type="submit" size="sm" variant="outline" disabled={pendente || !decisao}>
          {pendente ? <Loader2 className="animate-spin" /> : null}
          Aplicar
        </Button>
      </div>
      {decisao === "recusada" && (
        <Input name="motivo" placeholder="Motivo da recusa (vai no e-mail)" required />
      )}
      {decisao !== "recusada" && <input type="hidden" name="motivo" value="" />}
    </form>
  )
}

/**
 * Disparo do RSVP.
 *
 * O envio é MANUAL de propósito: quem sabe a hora certa de perguntar "você
 * vem?" é quem organiza. O que o sistema faz é destravar o botão sozinho no
 * instante em que a data de abertura chega — sem recarregar a página, e
 * mostrando quanto falta até lá.
 */
function faltam(ms: number): string {
  const seg = Math.max(0, Math.floor(ms / 1000))
  const d = Math.floor(seg / 86400)
  const h = Math.floor((seg % 86400) / 3600)
  const m = Math.floor((seg % 3600) / 60)
  if (d > 0) return `${d} dia${d === 1 ? "" : "s"} e ${h}h`
  if (h > 0) return `${h}h${String(m).padStart(2, "0")}`
  if (m > 0) return `${m} minuto${m === 1 ? "" : "s"}`
  return "menos de um minuto"
}

export function EnviarRsvpForm({
  eventoId,
  abreEm,
  enviadoEm,
  jaEnviados,
  semResposta,
}: {
  eventoId: string
  /** Nulo = o organizador ainda não disse quando a confirmação abre. */
  abreEm: string | null
  enviadoEm: string | null
  jaEnviados: number
  semResposta: number
}) {
  const [estado, formAction, pendente] = useActionState(enviarRsvpAction, {})
  // Null até montar: o servidor não pode decidir "já abriu", senão a resposta
  // renderizada chega ao navegador já vencida e a hidratação diverge.
  const [restante, setRestante] = useState<number | null>(null)

  useEffect(() => {
    if (!abreEm) return
    const alvo = new Date(abreEm).getTime()
    const tick = () => setRestante(alvo - Date.now())
    tick()
    // De minuto em minuto basta: o botão destrava sozinho quando a hora chega.
    const id = setInterval(tick, 30_000)
    return () => clearInterval(id)
  }, [abreEm])

  if (!abreEm) {
    return (
      <Alert variant="warning">
        <TriangleAlert />
        <AlertDescription>
          Falta dizer <strong>quando a confirmação abre</strong>. Sem data, a
          pergunta chegaria junto com a inscrição — e quem confirma no minuto
          seguinte não está dizendo nada novo. Defina em Editar.
        </AlertDescription>
      </Alert>
    )
  }

  const aberto = restante !== null && restante <= 0

  return (
    <div className="grid gap-3">
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      {estado.ok && (
        <Alert variant="success">
          <AlertDescription>{estado.ok}</AlertDescription>
        </Alert>
      )}

      {restante !== null && !aberto && (
        <Alert variant="info">
          <AlertDescription>
            A confirmação abre em <strong>{faltam(restante)}</strong>. Até lá o
            passo fica travado para o inscrito, que já foi avisado na página
            dele de que receberá o e-mail nessa data. O botão libera sozinho
            quando a hora chegar.
          </AlertDescription>
        </Alert>
      )}

      {aberto && !enviadoEm && !estado.ok && (
        <Alert variant="warning">
          <TriangleAlert />
          <AlertDescription>
            A confirmação já abriu e o e-mail <strong>ainda não foi
            enviado</strong>. Os inscritos estão esperando por ele.
          </AlertDescription>
        </Alert>
      )}

      <form action={formAction} className="grid gap-3">
        <input type="hidden" name="id" value={eventoId} />

        {jaEnviados > 0 && (
          <label className="flex items-start gap-3 rounded-md border p-3">
            <input type="checkbox" name="reenviar" className="mt-0.5 size-4" />
            <span className="text-sm">
              Cobrar quem não respondeu
              <span className="text-muted-foreground block text-xs">
                {semResposta} pessoa(s) receberam e ainda não disseram se vêm.
                Sem marcar, o envio alcança só quem nunca foi perguntado.
              </span>
            </span>
          </label>
        )}

        <div>
          <Button
            type="submit"
            size="sm"
            disabled={pendente || restante === null || !aberto}
          >
            {pendente ? <Loader2 className="animate-spin" /> : <Send />}
            Perguntar quem vem
          </Button>
        </div>
      </form>
    </div>
  )
}

/** Conciliação retroativa de inscritos com filiações, por CPF. */
export function ConciliarFiliadosForm({ eventoId }: { eventoId: string }) {
  const [estado, formAction, pendente] = useActionState(
    conciliarFiliadosAction,
    {}
  )

  return (
    <form action={formAction} className="grid gap-2">
      <input type="hidden" name="id" value={eventoId} />
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      {estado.ok && (
        <Alert variant="success">
          <AlertDescription>{estado.ok}</AlertDescription>
        </Alert>
      )}
      <div>
        <Button type="submit" size="sm" variant="outline" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <UserSearch />}
          Conciliar inscritos com filiados
        </Button>
      </div>
    </form>
  )
}
