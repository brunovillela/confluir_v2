"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Loader2, Lock, MonitorSmartphone, Vote } from "lucide-react"

import { CedulaForm } from "@/app/portal/votacao/[id]/cedula-form"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import type { EstadoTerminal } from "@/lib/db/votacao-mesarios"

import { iniciarTerminal, votarNoTerminalAction } from "./actions"
import { CHAVE_TERMINAL } from "./constantes"

function lerToken(): string | null {
  try {
    return localStorage.getItem(CHAVE_TERMINAL)
  } catch {
    return null
  }
}

export function TerminalVotacao() {
  const [token, setToken] = useState<string | null>(null)
  const [estado, setEstado] = useState<EstadoTerminal | null>(null)
  const [iniciando, setIniciando] = useState(false)
  const tokenRef = useRef<string | null>(null)

  const iniciar = useCallback(async () => {
    setIniciando(true)
    try {
      const { sessaoToken } = await iniciarTerminal()
      try {
        localStorage.setItem(CHAVE_TERMINAL, sessaoToken)
      } catch {
        // segue em memória mesmo sem localStorage
      }
      tokenRef.current = sessaoToken
      setToken(sessaoToken)
    } finally {
      setIniciando(false)
    }
  }, [])

  // Recupera o token do kiosk ao montar. localStorage só existe no cliente, então
  // não dá para ler no render (hidrataria diferente do SSR) — a leitura única no
  // efeito é a sincronização correta com esse sistema externo.
  useEffect(() => {
    const t = lerToken()
    if (t) {
      tokenRef.current = t
      // eslint-disable-next-line react-hooks/set-state-in-effect -- leitura única de localStorage no mount
      setToken(t)
    }
  }, [])

  // Polling do estado enquanto houver token.
  useEffect(() => {
    if (!token) return
    let vivo = true
    async function puxar() {
      try {
        const r = await fetch(
          `/urna/estado?token=${encodeURIComponent(tokenRef.current ?? "")}`,
          { cache: "no-store" }
        )
        if (!r.ok) return
        const dados = (await r.json()) as EstadoTerminal
        if (!vivo) return
        // Token inválido (terminal removido/expirado): volta à tela de início.
        if (dados.status === "novo") {
          try {
            localStorage.removeItem(CHAVE_TERMINAL)
          } catch {
            // ignora
          }
          tokenRef.current = null
          setToken(null)
          setEstado(null)
          return
        }
        setEstado(dados)
      } catch {
        // tenta de novo no próximo ciclo
      }
    }
    puxar()
    const id = setInterval(puxar, 2500)
    return () => {
      vivo = false
      clearInterval(id)
    }
  }, [token])

  // Sem token → tela de início.
  if (!token) {
    return (
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="flex items-center justify-center gap-2 text-lg">
            <MonitorSmartphone className="text-primary size-5" />
            Terminal de votação
          </CardTitle>
          <CardDescription>
            Inicie o terminal neste computador. Ele mostrará um código para o
            mesário parear.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid justify-items-center">
          <Button size="lg" onClick={iniciar} disabled={iniciando}>
            {iniciando && <Loader2 className="animate-spin" />}
            Iniciar terminal de votação
          </Button>
        </CardContent>
      </Card>
    )
  }

  // Cédula liberada para um eleitor.
  if (estado?.status === "votando" && estado.perguntas.length > 0) {
    return (
      <Card key={`ced:${estado.aptoNome ?? ""}`}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Vote className="text-primary size-5" />
            {estado.aptoNome ?? "Eleitor"}
          </CardTitle>
          <CardDescription>
            {estado.emSeparado ? (
              <>
                <strong>Voto em separado</strong> — {estado.urnaNome ?? "Urna"}.
                Seu voto é secreto e será validado na apuração.
              </>
            ) : (
              <>
                {estado.urnaNome ?? "Urna"} — seu voto é secreto. Faça suas
                escolhas e confirme.
              </>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CedulaForm
            assembleiaId={estado.assembleiaId ?? ""}
            perguntas={estado.perguntas}
            acao={votarNoTerminalAction}
            camposOcultos={{ sessao_token: token }}
          />
        </CardContent>
      </Card>
    )
  }

  if (estado?.status === "encerrado") {
    return (
      <Estado
        icone={<Lock className="text-muted-foreground size-10" />}
        titulo="Terminal encerrado"
        texto="Este terminal foi encerrado. Fale com o mesário para iniciar um novo."
      />
    )
  }

  // Pareado (ou aguardando pareamento): mostra o código enquanto não pareado.
  if (estado && estado.status !== "aguardando") {
    return (
      <Estado
        icone={<Loader2 className="text-primary size-10 animate-spin" />}
        titulo="Aguardando o próximo eleitor"
        texto={`Pareado à ${estado.urnaNome ?? "urna"}. Quando o mesário registrar a presença de um eleitor, a cédula aparece aqui.`}
      />
    )
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="flex items-center justify-center gap-2 text-lg">
          <MonitorSmartphone className="text-primary size-5" />
          Terminal de votação
        </CardTitle>
        <CardDescription>
          Informe este código ao mesário para parear o terminal.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid justify-items-center gap-3">
        <div className="bg-muted rounded-xl px-8 py-6 font-mono text-5xl font-bold tracking-[0.35em]">
          {estado?.codigo ?? "······"}
        </div>
        <Alert>
          <AlertDescription>
            Assim que o mesário parear, este terminal fica pronto para receber os
            votos. Não feche esta janela.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  )
}

function Estado({
  icone,
  titulo,
  texto,
}: {
  icone: React.ReactNode
  titulo: string
  texto: string
}) {
  return (
    <Card>
      <CardContent className="grid justify-items-center gap-3 py-12 text-center">
        {icone}
        <p className="text-lg font-semibold">{titulo}</p>
        <p className="text-muted-foreground max-w-sm text-sm">{texto}</p>
      </CardContent>
    </Card>
  )
}
