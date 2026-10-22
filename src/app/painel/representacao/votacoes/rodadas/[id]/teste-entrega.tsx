"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { MailQuestion, Send, Square } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import type { MedicaoDominio, TesteEntrega } from "@/lib/db/votacao-teste-entrega"
import { formatarData, formatarDataHora } from "@/lib/formato"

import { configurarAvisoPrevioAction, enviarLoteAvisoPrevioAction } from "./actions"

const OPCOES_DIAS = [3, 5, 7] as const

const SELO: Record<string, { rotulo: string; cor: "success" | "warning" | "error" | "secondary" }> = {
  chega: { rotulo: "Chega", cor: "success" },
  nao_chega: { rotulo: "Não chega", cor: "error" },
  incerto: { rotulo: "Incerto", cor: "warning" },
  aguardando: { rotulo: "Medindo", cor: "secondary" },
  sem_envio: { rotulo: "Sem teste", cor: "secondary" },
}

const pct = (n: number, de: number) => (de ? `${Math.round((100 * n) / de)}%` : "—")

function LinhaHistorico({ m }: { m: MedicaoDominio }) {
  return (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <Badge variant={SELO[m.situacao].cor}>{SELO[m.situacao].rotulo}</Badge>
      <span>
        {m.rodadaNome ?? "Rodada"} ({formatarData(m.medidoEm)}):{" "}
        {m.medida === "votacao"
          ? `${m.sucesso.toLocaleString("pt-BR")} de ${m.base.toLocaleString("pt-BR")} votos pelo link pessoal (${pct(m.sucesso, m.base)})`
          : `${m.sucesso.toLocaleString("pt-BR")} de ${m.base.toLocaleString("pt-BR")} confirmaram o aviso prévio (${pct(m.sucesso, m.base)})`}
      </span>
    </li>
  )
}

/**
 * Teste de entrega da rodada (fase 3 do plano de 21/10/2026): aviso prévio ao
 * e-mail corporativo com o botão "Recebi", a taxa de confirmação humana e o
 * histórico do domínio da empresa.
 */
export function TesteEntregaCard({ rodadaId, teste }: { rodadaId: string; teste: TesteEntrega }) {
  const router = useRouter()
  const [enviando, setEnviando] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [progresso, setProgresso] = useState({ feitos: 0, total: 0, enviados: 0 })
  const [mensagem, setMensagem] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null)
  const parar = useRef(false)
  const p = teste.previo

  if (!teste.disponivel) {
    return (
      <Alert variant="warning">
        <AlertDescription>Teste de entrega: falta aplicar a migração da fase 3.</AlertDescription>
      </Alert>
    )
  }

  async function enviarTudo() {
    if (!window.confirm(`Enviar o aviso prévio (teste de entrega) para ${p.pendentes.toLocaleString("pt-BR")} apto(s)?`)) return
    parar.current = false
    setEnviando(true)
    setMensagem(null)
    let feitos = 0
    let enviados = 0
    setProgresso({ feitos: 0, total: p.pendentes, enviados: 0 })
    try {
      while (!parar.current) {
        const r = await enviarLoteAvisoPrevioAction(rodadaId)
        if (r.erro || !r.resultado) {
          setMensagem({ tipo: "erro", texto: r.erro ?? "Falha no envio." })
          break
        }
        feitos += r.resultado.processados
        enviados += r.resultado.enviados
        setProgresso({ feitos, total: feitos + r.resultado.restantes, enviados })
        if (r.resultado.restantes === 0 || r.resultado.processados === 0) {
          setMensagem({ tipo: "ok", texto: `Aviso prévio enviado a ${enviados.toLocaleString("pt-BR")} apto(s). A taxa vale depois de 24 h.` })
          break
        }
      }
      if (parar.current) setMensagem({ tipo: "ok", texto: `Interrompido: ${enviados.toLocaleString("pt-BR")} enviado(s). Clique de novo para continuar.` })
    } finally {
      setEnviando(false)
      router.refresh()
    }
  }

  async function mudarDias(dias: number | null) {
    setOcupado(true)
    setMensagem(null)
    try {
      const r = await configurarAvisoPrevioAction(rodadaId, dias)
      setMensagem(r.erro ? { tipo: "erro", texto: r.erro } : { tipo: "ok", texto: r.ok ?? "Feito." })
      router.refresh()
    } finally {
      setOcupado(false)
    }
  }

  const selo = SELO[p.situacao]
  const progressoPct = progresso.total > 0 ? Math.round((progresso.feitos / progresso.total) * 100) : 0

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <MailQuestion className="size-4" />
          Teste de entrega
          {teste.dominio && <span className="text-muted-foreground font-normal">@{teste.dominio}</span>}
          <Badge variant={selo.cor}>{selo.rotulo}</Badge>
        </CardTitle>
        <CardDescription>
          Dias antes da votação, um aviso prévio ao e-mail da empresa pede um clique em “Recebi”. O robô de segurança da
          empresa não confirma — só gente. Se quase ninguém confirmar, o e-mail não está chegando: aposte no
          pré-cadastro e no Telegram.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm">
        {teste.historico.length > 0 && (
          <div className="grid gap-1 rounded-md border p-2.5">
            <p className="font-medium">Nas votações anteriores desta empresa</p>
            <ul className="text-muted-foreground grid gap-1 text-xs">
              {teste.historico.slice(0, 3).map((m) => (
                <LinhaHistorico key={`${m.rodadaId}-${m.medida}`} m={m} />
              ))}
            </ul>
          </div>
        )}
        {!teste.dominio && (
          <p className="text-muted-foreground text-xs">
            A lista não tem um domínio de empresa predominante (e-mails pessoais ou de várias empresas): o teste mede, mas
            não entra no histórico por empresa.
          </p>
        )}

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Numero rotulo="Avisados" valor={p.avisados} />
          <Numero rotulo="Confirmaram" valor={p.confirmaram} extra={pct(p.confirmaram, p.avisados)} />
          <Numero rotulo="Pendentes" valor={p.pendentes} />
          <Numero rotulo="Sem e-mail / falha" valor={p.semEmail + p.falhas} />
        </div>
        {p.primeiroEnvio && (
          <p className="text-muted-foreground text-xs">
            Primeiro envio em {formatarDataHora(p.primeiroEnvio)}
            {p.situacao === "aguardando" ? " — a taxa vale a partir de 24 h depois." : "."}
          </p>
        )}

        {!teste.aberta && (
          <label className="flex flex-wrap items-center gap-2 rounded-md border p-2.5">
            <span className="font-medium">Envio automático</span>
            <select
              className="border-input bg-background h-8 rounded-md border px-2 text-sm"
              value={teste.dias === null ? "" : String(teste.dias)}
              disabled={ocupado || enviando}
              onChange={(e) => mudarDias(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">Desligado</option>
              {OPCOES_DIAS.map((d) => (
                <option key={d} value={d}>
                  {d} dias antes da abertura
                </option>
              ))}
            </select>
            {teste.comecaEm !== null && (
              <span className="text-muted-foreground text-xs">
                {teste.automaticoAtivo ? "Em andamento (a cada 15 min)." : `Sai em ${formatarDataHora(new Date(teste.comecaEm).toISOString())}.`}
              </span>
            )}
          </label>
        )}

        {enviando && (
          <div className="grid gap-1.5" aria-live="polite">
            <Progress value={progressoPct} className="h-2" />
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

        {!teste.aberta ? (
          <div className="flex flex-wrap gap-2">
            {enviando ? (
              <Button variant="outline" size="sm" onClick={() => (parar.current = true)}>
                <Square />
                Parar
              </Button>
            ) : (
              <Button size="sm" disabled={ocupado || p.pendentes === 0} onClick={enviarTudo}>
                <Send />
                {p.pendentes === 0 ? "Todos receberam o aviso prévio" : `Enviar aviso prévio (${p.pendentes.toLocaleString("pt-BR")})`}
              </Button>
            )}
          </div>
        ) : (
          <p className="text-muted-foreground text-xs">A votação já abriu: o aviso prévio não é mais enviado.</p>
        )}
      </CardContent>
    </Card>
  )
}

function Numero({ rotulo, valor, extra }: { rotulo: string; valor: number; extra?: string }) {
  return (
    <div className="rounded-md border p-2.5">
      <p className="text-muted-foreground text-xs">{rotulo}</p>
      <p className="text-xl font-semibold">
        {valor.toLocaleString("pt-BR")}
        {extra && <span className="text-muted-foreground ml-1 text-sm font-normal">{extra}</span>}
      </p>
    </div>
  )
}
