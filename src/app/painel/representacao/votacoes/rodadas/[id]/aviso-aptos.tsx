"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Mail, MailCheck, RotateCcw, Send, Square } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import type { ResumoAvisoAptos } from "@/lib/db/votacao-aviso"
import type { ResumoAvisoContato } from "@/lib/db/votacao-aviso-contato"
import type { ResumoEntregaBrevo } from "@/lib/db/votacao-eventos-email"
import type { AcaoAvisoRegistrada } from "@/lib/db/votacao-aviso-acoes"
import type { AvisoAutoDaRodada } from "@/lib/db/votacao-aviso-auto"
import { formatarDataHora } from "@/lib/formato"

import {
  configurarAvisoAutoAction,
  enviarAvisoAptosTeste,
  enviarLoteAvisoAptos,
  reabrirAvisosAptos,
  reabrirAvisosContatoAction,
} from "./actions"

type Mensagem = { tipo: "ok" | "erro"; texto: string } | null

/**
 * Aviso por e-mail aos aptos da rodada: envia em lotes enquanto a página
 * estiver aberta. Cada apto fica marcado, então parar e continuar depois não
 * repete ninguém — e quem entrar na lista mais tarde aparece como pendente.
 */
export function AvisoAptos({
  id,
  rodadaId,
  resumo,
  contato = null,
  entrega = null,
  acoes = [],
  auto,
  bloqueio,
}: {
  /** Âncora do alerta "Ir para o envio" (aptos sem link). */
  id?: string
  rodadaId: string
  resumo: ResumoAvisoAptos
  /** Aviso pelo e-mail pessoal/Telegram do link geral (fase 1, 21/10/2026); null = sem voto online ou sem a migração. */
  contato?: ResumoAvisoContato | null
  /** Eventos da Brevo pelo webhook (fase 4, 22/10/2026); null = sem eventos ainda. */
  entrega?: ResumoEntregaBrevo | null
  /** Rastro de quem reenviou/enviou/mudou o automático (22/10/2026). */
  acoes?: AcaoAvisoRegistrada[]
  /** Envio automático dos links (fase 2); null = rodada sem voto pela internet. */
  auto: AvisoAutoDaRodada | null
  /** Motivo para não enviar (sem assembleia, período encerrado…). */
  bloqueio: string | null
}) {
  const router = useRouter()
  const [enviando, setEnviando] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [progresso, setProgresso] = useState({ feitos: 0, total: 0, enviados: 0 })
  const [mensagem, setMensagem] = useState<Mensagem>(null)
  const parar = useRef(false)

  if (!resumo.esquemaPronto) {
    return (
      <Alert variant="warning">
        <AlertDescription>
          Para avisar os aptos por e-mail, rode o SQL <code>supabase/aptos-aviso-email.sql</code>.
        </AlertDescription>
      </Alert>
    )
  }

  async function enviarTudo() {
    const partes = [
      resumo.pendentes > 0 && `${resumo.pendentes.toLocaleString("pt-BR")} apto(s) pelo e-mail da lista`,
      contatoPendentes > 0 && `${contatoPendentes.toLocaleString("pt-BR")} pelo e-mail pessoal ou Telegram que cadastraram`,
    ].filter(Boolean)
    if (!window.confirm(`Enviar o aviso "você está habilitado a votar": ${partes.join(" e ")}?`)) return
    parar.current = false
    setEnviando(true)
    setMensagem(null)
    let feitos = 0
    let enviados = 0
    setProgresso({ feitos: 0, total: totalPendentes, enviados: 0 })
    try {
      while (!parar.current) {
        const r = await enviarLoteAvisoAptos(rodadaId)
        if (r.erro || !r.resultado) {
          setMensagem({ tipo: "erro", texto: r.erro ?? "Falha no envio." })
          break
        }
        feitos += r.resultado.processados
        enviados += r.resultado.enviados + (r.resultado.contatos ?? 0)
        setProgresso({ feitos, total: feitos + r.resultado.restantes, enviados })
        if (r.resultado.restantes === 0 || r.resultado.processados === 0) {
          setMensagem({
            tipo: "ok",
            texto: `Envio concluído: ${enviados.toLocaleString("pt-BR")} e-mail(s) enviado(s).`,
          })
          break
        }
      }
      if (parar.current) {
        setMensagem({
          tipo: "ok",
          texto: `Envio interrompido: ${enviados.toLocaleString("pt-BR")} enviado(s) até aqui. Clique de novo para continuar de onde parou.`,
        })
      }
    } finally {
      setEnviando(false)
      router.refresh()
    }
  }

  async function executar(acao: () => Promise<{ ok?: string; erro?: string }>, confirmar?: string) {
    if (confirmar && !window.confirm(confirmar)) return
    setOcupado(true)
    setMensagem(null)
    try {
      const r = await acao()
      setMensagem(r.erro ? { tipo: "erro", texto: r.erro } : { tipo: "ok", texto: r.ok ?? "Feito." })
      router.refresh()
    } finally {
      setOcupado(false)
    }
  }

  const contatoPendentes = contato?.pendentes ?? 0
  const totalPendentes = resumo.pendentes + contatoPendentes
  const pct = progresso.total > 0 ? Math.round((progresso.feitos / progresso.total) * 100) : 0
  const travado = enviando || ocupado

  return (
    <Card id={id} className="scroll-mt-4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Mail className="size-4" />
          Aviso por e-mail aos aptos
        </CardTitle>
        <CardDescription>
          Avisa cada apto de que está habilitado a votar, com o botão para a votação. Vai ao
          e-mail corporativo da lista ou, sem ele, ao do filiado — e também ao e-mail pessoal ou ao Telegram que a
          pessoa cadastrou no link geral. Ninguém recebe duas vezes pelo mesmo canal.
        </CardDescription>
      </CardHeader>
      <CardContent className="@container grid gap-4">
        <div className="grid grid-cols-3 gap-2 @2xl:grid-cols-5">
          <Numero rotulo="Avisados" valor={resumo.enviados} destaque />
          <Numero rotulo="Pendentes" valor={resumo.pendentes} />
          <Numero rotulo="Sem e-mail" valor={resumo.semEmail} dica="Sem e-mail corporativo nem filiado com e-mail." />
          <Numero rotulo="E-mail repetido" valor={resumo.duplicados} dica="O mesmo e-mail já recebeu por outro apto." />
          <Numero rotulo="Falhas" valor={resumo.falhas} dica="O provedor recusou; dá para tentar de novo." />
        </div>
        {contato && contato.comContato > 0 && (
          <div className="grid gap-1 rounded-md border p-2.5 text-sm">
            <p>
              <span className="font-medium">Pelo canal que a pessoa escolheu:</span>{" "}
              {contato.comContato.toLocaleString("pt-BR")} apto(s) cadastraram no link geral um e-mail pessoal (
              {contato.porEmail.toLocaleString("pt-BR")}) ou o Telegram ({contato.porTelegram.toLocaleString("pt-BR")}).
              O link pessoal vai também para lá.
            </p>
            <p className="text-muted-foreground text-xs">
              Avisados por esse canal: {contato.avisados.toLocaleString("pt-BR")}
              {contato.pendentes > 0 && <> · aguardando: {contato.pendentes.toLocaleString("pt-BR")}</>}
              {contato.falhas > 0 && <> · falhas: {contato.falhas.toLocaleString("pt-BR")}</>}. Depois do primeiro envio,
              quem se cadastrar recebe sozinho em até 15 minutos.
            </p>
          </div>
        )}
        {entrega && (
          <div className="grid gap-1 rounded-md border p-2.5 text-sm">
            <p>
              <span className="font-medium">Na Brevo:</span> {entrega.entregues.toLocaleString("pt-BR")} entregue(s) ·{" "}
              {entrega.cliqueGente.toLocaleString("pt-BR")} aberto(s) por gente
              {entrega.soRobo > 0 && <> · {entrega.soRobo.toLocaleString("pt-BR")} só pelo robô de segurança</>}
              {entrega.rejeitados > 0 && <> · {entrega.rejeitados.toLocaleString("pt-BR")} endereço(s) rejeitado(s)</>}
            </p>
            <p className="text-muted-foreground text-xs">
              Clique até 2 minutos depois da entrega é do robô de segurança da empresa, que abre todos os links. Muita
              entrega com clique só do robô = o e-mail chega ao servidor, mas não a quem vota. Endereço rejeitado conta
              como sem link.
            </p>
          </div>
        )}
        {resumo.reenvio > 0 && (
          <p className="text-muted-foreground text-xs">
            Dos {resumo.pendentes.toLocaleString("pt-BR")} pendentes, {resumo.reenvio.toLocaleString("pt-BR")} já receberam o
            link antes e voltaram para a fila num reenvio — o link deles continua valendo; o próximo envio é só um lembrete.
          </p>
        )}
        {resumo.ultimoEnvio && (
          <p className="text-muted-foreground text-xs">
            Último envio em {formatarDataHora(resumo.ultimoEnvio)}.
          </p>
        )}

        {bloqueio && (
          <Alert variant="info">
            <AlertDescription>{bloqueio}</AlertDescription>
          </Alert>
        )}

        {auto && !bloqueio && (
          <EnvioAutomatico
            auto={auto}
            desativado={travado}
            aoMudar={(horas) => executar(() => configurarAvisoAutoAction(rodadaId, horas))}
          />
        )}

        {enviando && (
          <div className="grid gap-1.5" aria-live="polite">
            <Progress value={pct} className="h-2" />
            <p className="text-muted-foreground text-xs">
              {progresso.feitos.toLocaleString("pt-BR")} de {progresso.total.toLocaleString("pt-BR")} processados ·{" "}
              {progresso.enviados.toLocaleString("pt-BR")} enviados. Mantenha esta página aberta.
            </p>
          </div>
        )}

        {mensagem && (
          <Alert variant={mensagem.tipo === "ok" ? "success" : "error"}>
            <AlertDescription>{mensagem.texto}</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-wrap gap-2">
          {enviando ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                parar.current = true
              }}
            >
              <Square />
              Parar
            </Button>
          ) : (
            <Button
              size="sm"
              disabled={travado || Boolean(bloqueio) || totalPendentes === 0}
              onClick={enviarTudo}
            >
              <Send />
              {totalPendentes === 0
                ? "Todos avisados"
                : resumo.enviados > 0
                  ? `Avisar ${totalPendentes.toLocaleString("pt-BR")} pendente(s)`
                  : `Avisar ${totalPendentes.toLocaleString("pt-BR")} apto(s)`}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            disabled={travado || Boolean(bloqueio)}
            onClick={() => executar(() => enviarAvisoAptosTeste(rodadaId))}
          >
            {ocupado ? <Loader2 className="animate-spin" /> : <MailCheck />}
            Enviar teste para mim
          </Button>
          {resumo.falhas > 0 && (
            <Button
              variant="outline"
              size="sm"
              disabled={travado}
              onClick={() => executar(() => reabrirAvisosAptos(rodadaId, "falhas"))}
            >
              <RotateCcw />
              Tentar de novo as falhas
            </Button>
          )}
          {resumo.enviados > 0 && (
            <Button
              variant="outline"
              size="sm"
              disabled={travado}
              onClick={() =>
                executar(
                  () => reabrirAvisosAptos(rodadaId, "nao_votaram"),
                  "Devolver para a fila do aviso todos os aptos que ainda não votaram? Eles só recebem de novo quando alguém clicar em Avisar pendentes. Fica registrado quem fez."
                )
              }
            >
              <RotateCcw />
              Reenviar a quem não votou
            </Button>
          )}
          {contato && contato.avisados > 0 && (
            <Button
              variant="outline"
              size="sm"
              disabled={travado}
              onClick={() =>
                executar(
                  () => reabrirAvisosContatoAction(rodadaId),
                  "Reenviar o link só pelo e-mail pessoal e pelo Telegram, a quem ainda não votou? O e-mail da empresa não recebe de novo. Fica registrado quem fez."
                )
              }
            >
              <RotateCcw />
              Reenviar só pelo e-mail pessoal e Telegram
            </Button>
          )}
          {resumo.enviados + resumo.semEmail + resumo.duplicados > 0 && (
            <Button
              variant="ghost"
              size="sm"
              disabled={travado}
              onClick={() =>
                executar(
                  () => reabrirAvisosAptos(rodadaId, "todos"),
                  "Voltar TODOS os aptos para a fila? O próximo envio manda o aviso de novo para a lista inteira (use para um lembrete). Fica registrado quem fez."
                )
              }
            >
              <RotateCcw />
              Reenviar para todos
            </Button>
          )}
        </div>

        {acoes.length > 0 && (
          <div className="grid gap-1 border-t pt-3">
            <p className="text-sm font-medium">Quem mexeu nos avisos</p>
            <ul className="text-muted-foreground grid gap-1 text-xs">
              {acoes.map((a) => (
                <li key={`${a.criadoEm}-${a.acao}`}>
                  {formatarDataHora(a.criadoEm)} · <span className="text-foreground">{a.usuarioNome ?? "—"}</span> ·{" "}
                  {a.rotulo}
                  {a.quantidade !== null &&
                    ` · ${a.quantidade.toLocaleString("pt-BR")} ${a.acao.startsWith("reabrir") ? "apto(s) de volta à fila" : "enviado(s)"}`}
                  {a.detalhe && ` (${a.detalhe})`}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

const OPCOES_AUTO = [24, 48, 72] as const

/**
 * Envio automático dos links pessoais: N horas antes da abertura os links
 * começam a sair sozinhos (a cada 15 min), inclusive a quem entrar na lista
 * depois; a falha do provedor é tentada de novo uma vez, 1 h depois.
 */
function EnvioAutomatico({
  auto,
  desativado,
  aoMudar,
}: {
  auto: AvisoAutoDaRodada
  desativado: boolean
  aoMudar: (horas: number | null) => void
}) {
  if (!auto.disponivel) {
    return (
      <p className="text-muted-foreground text-xs">
        Envio automático: rode o SQL <code>supabase/votacao-aviso-fase2.sql</code> para ligar.
      </p>
    )
  }
  return (
    <div className="grid gap-1.5 rounded-md border p-2.5">
      <label className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">Envio automático</span>
        <select
          className="border-input bg-background h-8 rounded-md border px-2 text-sm"
          value={auto.horas === null ? "" : String(auto.horas)}
          disabled={desativado}
          onChange={(e) => aoMudar(e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">Desligado</option>
          {OPCOES_AUTO.map((h) => (
            <option key={h} value={h}>
              {h} h antes da abertura
            </option>
          ))}
        </select>
      </label>
      <p className="text-muted-foreground text-xs">
        {auto.horas === null
          ? "Ligado, os links saem sozinhos antes da abertura e a quem entrar na lista depois, sem precisar desta página aberta."
          : auto.ativo
            ? "Em andamento: os pendentes recebem o link a cada 15 minutos, e uma falha do provedor é tentada de novo 1 h depois."
            : auto.comecaEm !== null
              ? `Os links começam a sair em ${formatarDataHora(new Date(auto.comecaEm).toISOString())}.`
              : "Começa quando a votação pela internet tiver data de abertura."}
      </p>
    </div>
  )
}

function Numero({
  rotulo,
  valor,
  destaque,
  dica,
}: {
  rotulo: string
  valor: number
  destaque?: boolean
  dica?: string
}) {
  return (
    <div className="rounded-md border p-2.5" title={dica}>
      <p className="text-muted-foreground text-xs">{rotulo}</p>
      <p className={destaque ? "text-success-fg text-xl font-semibold" : "text-xl font-semibold"}>
        {valor.toLocaleString("pt-BR")}
      </p>
    </div>
  )
}
