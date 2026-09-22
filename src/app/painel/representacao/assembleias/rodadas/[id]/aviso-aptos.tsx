"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Mail, MailCheck, RotateCcw, Send, Square } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import type { ResumoAvisoAptos } from "@/lib/db/votacao-aviso"
import { formatarDataHora } from "@/lib/formato"

import { enviarAvisoAptosTeste, enviarLoteAvisoAptos, reabrirAvisosAptos } from "./actions"

type Mensagem = { tipo: "ok" | "erro"; texto: string } | null

/**
 * Aviso por e-mail aos aptos da rodada: envia em lotes enquanto a página
 * estiver aberta. Cada apto fica marcado, então parar e continuar depois não
 * repete ninguém — e quem entrar na lista mais tarde aparece como pendente.
 */
export function AvisoAptos({
  rodadaId,
  resumo,
  bloqueio,
}: {
  rodadaId: string
  resumo: ResumoAvisoAptos
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
    if (
      !window.confirm(
        `Enviar o aviso "você está habilitado a votar" para ${resumo.pendentes.toLocaleString("pt-BR")} apto(s) ainda não avisado(s)?`
      )
    )
      return
    parar.current = false
    setEnviando(true)
    setMensagem(null)
    let feitos = 0
    let enviados = 0
    setProgresso({ feitos: 0, total: resumo.pendentes, enviados: 0 })
    try {
      while (!parar.current) {
        const r = await enviarLoteAvisoAptos(rodadaId)
        if (r.erro || !r.resultado) {
          setMensagem({ tipo: "erro", texto: r.erro ?? "Falha no envio." })
          break
        }
        feitos += r.resultado.processados
        enviados += r.resultado.enviados
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

  const pct = progresso.total > 0 ? Math.round((progresso.feitos / progresso.total) * 100) : 0
  const travado = enviando || ocupado

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Mail className="size-4" />
          Aviso por e-mail aos aptos
        </CardTitle>
        <CardDescription>
          Avisa cada apto de que está habilitado a votar nesta rodada, com o botão para a votação e
          o passo a passo. Vai para o e-mail corporativo da lista ou, sem ele, para o e-mail do
          filiado dono do CPF. Ninguém recebe duas vezes.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Numero rotulo="Avisados" valor={resumo.enviados} destaque />
          <Numero rotulo="Pendentes" valor={resumo.pendentes} />
          <Numero rotulo="Sem e-mail" valor={resumo.semEmail} dica="Sem e-mail corporativo nem filiado com e-mail." />
          <Numero rotulo="E-mail repetido" valor={resumo.duplicados} dica="O mesmo e-mail já recebeu por outro apto." />
          <Numero rotulo="Falhas" valor={resumo.falhas} dica="O provedor recusou; dá para tentar de novo." />
        </div>
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
              disabled={travado || Boolean(bloqueio) || resumo.pendentes === 0}
              onClick={enviarTudo}
            >
              <Send />
              {resumo.pendentes === 0
                ? "Todos avisados"
                : resumo.enviados > 0
                  ? `Avisar ${resumo.pendentes.toLocaleString("pt-BR")} pendente(s)`
                  : `Avisar ${resumo.pendentes.toLocaleString("pt-BR")} apto(s)`}
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
          {resumo.enviados + resumo.semEmail + resumo.duplicados > 0 && (
            <Button
              variant="ghost"
              size="sm"
              disabled={travado}
              onClick={() =>
                executar(
                  () => reabrirAvisosAptos(rodadaId, "todos"),
                  "Voltar TODOS os aptos para a fila? O próximo envio manda o aviso de novo para a lista inteira (use para um lembrete)."
                )
              }
            >
              <RotateCcw />
              Reenviar para todos
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
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
    <div className="rounded-md border p-3" title={dica}>
      <p className="text-muted-foreground text-xs">{rotulo}</p>
      <p className={destaque ? "text-success-fg text-xl font-semibold" : "text-xl font-semibold"}>
        {valor.toLocaleString("pt-BR")}
      </p>
    </div>
  )
}
