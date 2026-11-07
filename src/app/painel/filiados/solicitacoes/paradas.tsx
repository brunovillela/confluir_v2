"use client"

import Link from "next/link"
import { useActionState, useState } from "react"
import { Loader2, MessageCircle, RotateCw } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useEnvioFormulario } from "@/hooks/use-envio-formulario"
import { type EstadoForm } from "@/lib/contas"
import { DIAS_PARADA, diasDesde, linkWhatsapp, ondeParou } from "@/lib/ficha-filiacao"
import { formatarData, formatarTelefone } from "@/lib/formato"

import { acaoFichaParadaAction } from "./actions"

export type Parada = {
  id: string
  nome: string | null
  email: string | null
  telefone: string | null
  telefoneWhatsapp: boolean
  situacao: string
  passo: number
  desde: string | null
  ultimoContato: { em: string | null; nota: string | null } | null
}

/** As ações sobre uma ficha parada (também usadas na página da ficha). */
export function AcoesFichaParada({ parada, compacto = false }: { parada: Parada; compacto?: boolean }) {
  const [estado, enviar, pendente] = useActionState<EstadoForm, FormData>(acaoFichaParadaAction, {})
  const envio = useEnvioFormulario(enviar, estado)
  const [aberto, setAberto] = useState<"contato" | "desistencia" | null>(null)
  const zap = linkWhatsapp(parada.telefone)
  const primeiroNome = parada.nome?.split(" ")[0] ?? ""
  const mensagem = encodeURIComponent(
    parada.situacao === "aguardando_assinatura"
      ? `Olá${primeiroNome ? `, ${primeiroNome}` : ""}! Aqui é do sindicato. Vimos que a sua ficha de filiação está quase pronta: falta só assinar no gov.br. Podemos ajudar?`
      : `Olá${primeiroNome ? `, ${primeiroNome}` : ""}! Aqui é do sindicato. Vimos que você começou a ficha de filiação e não terminou. Podemos ajudar?`
  )

  return (
    <form action={enviar} {...envio} className="grid gap-2">
      <input type="hidden" name="id" value={parada.id} />
      <div className={`flex flex-wrap gap-2 ${compacto ? "" : "justify-end"}`}>
        {zap && (
          <Button variant="outline" size="sm" asChild>
            <a href={`${zap}?text=${mensagem}`} target="_blank" rel="noreferrer">
              <MessageCircle />
              WhatsApp
            </a>
          </Button>
        )}
        {parada.email && (
          <Button type="submit" name="acao" value="reenviar" variant="outline" size="sm" disabled={pendente}>
            {pendente ? <Loader2 className="animate-spin" /> : <RotateCw />}
            Reenviar link
          </Button>
        )}
        <Button type="button" variant="outline" size="sm" onClick={() => setAberto(aberto === "contato" ? null : "contato")}>
          Registrar contato
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setAberto(aberto === "desistencia" ? null : "desistencia")}>
          Desistiu
        </Button>
      </div>
      {aberto && (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            name="nota"
            placeholder={aberto === "contato" ? "O que foi conversado (ex.: vai assinar amanhã)" : "Motivo (opcional)"}
            className="h-8 min-w-0 flex-1 basis-56"
          />
          <Button type="submit" name="acao" value={aberto} size="sm" variant={aberto === "desistencia" ? "destructive" : "default"} disabled={pendente}>
            {aberto === "contato" ? "Salvar contato" : "Marcar desistência"}
          </Button>
        </div>
      )}
      {estado.ok && <p className="text-success-fg text-xs">{estado.ok}</p>}
      {estado.erro && <p className="text-destructive text-xs">{estado.erro}</p>}
    </form>
  )
}

/** "Pararam no meio": quem começou a ficha e não chegou à avaliação. */
export function FichasParadas({ paradas }: { paradas: Parada[] }) {
  if (paradas.length === 0) return <p className="text-muted-foreground text-sm">Ninguém parado no meio da ficha.</p>
  return (
    <ul className="divide-y">
      {paradas.map((p) => {
        const dias = diasDesde(p.desde)
        return (
          <li key={p.id} className="grid gap-2 py-3 lg:grid-cols-[1fr_auto] lg:items-start">
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 font-medium">
                <Link href={`/painel/filiados/solicitacoes/${p.id}`} className="hover:underline">
                  {p.nome ?? p.email ?? "Sem nome ainda"}
                </Link>
                <Badge variant={p.situacao === "aguardando_assinatura" ? "warning" : "outline"}>{ondeParou(p.situacao, p.passo)}</Badge>
                <span className={`text-xs ${dias >= DIAS_PARADA ? "text-warning-fg font-medium" : "text-muted-foreground"}`}>
                  {dias === 0 ? "hoje" : `há ${dias} dia${dias === 1 ? "" : "s"}`}
                </span>
              </p>
              <p className="text-muted-foreground text-xs">
                {[p.email, p.telefone && `${formatarTelefone(p.telefone)}${p.telefoneWhatsapp ? " (WhatsApp)" : ""}`].filter(Boolean).join(" · ") || "Sem contato além do e-mail"}
              </p>
              {p.ultimoContato && (
                <p className="text-muted-foreground text-xs">
                  Último contato em {formatarData(p.ultimoContato.em)}
                  {p.ultimoContato.nota && `: ${p.ultimoContato.nota}`}
                </p>
              )}
            </div>
            <AcoesFichaParada parada={p} />
          </li>
        )
      })}
    </ul>
  )
}
