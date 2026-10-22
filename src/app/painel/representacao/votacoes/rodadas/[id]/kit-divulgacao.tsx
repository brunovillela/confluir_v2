"use client"

import { useState } from "react"
import { Check, Copy, Download, Megaphone, MessageCircle, Printer } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { KitDivulgacao } from "@/lib/db/votacao-divulgacao"

/**
 * Kit de divulgação da rodada (fase 2 do plano de 21/10/2026): texto pronto
 * para WhatsApp e delegados, QR code e cartaz do link geral, e o contador de
 * quem já se pré-cadastrou (e-mail pessoal ou Telegram).
 */
export function KitDivulgacaoCard({ rodadaId, kit }: { rodadaId: string; kit: KitDivulgacao }) {
  const [copiado, setCopiado] = useState<"texto" | "link" | null>(null)
  const copiar = async (o: "texto" | "link") => {
    try {
      await navigator.clipboard.writeText(o === "texto" ? kit.texto : kit.link)
      setCopiado(o)
      setTimeout(() => setCopiado(null), 2000)
    } catch {
      // Sem permissão de área de transferência: o texto continua selecionável.
    }
  }
  const n = (v: number) => v.toLocaleString("pt-BR")
  const pct = kit.aptos ? Math.round((100 * kit.preCadastrados) / kit.aptos) : 0

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Megaphone className="size-4" />
          {kit.momento === "antes" ? "Pré-cadastro e divulgação" : "Divulgação"}
        </CardTitle>
        <CardDescription>
          {kit.momento === "antes"
            ? "Leve os aptos ao link geral antes da abertura. Quem se cadastra (Telegram ou e-mail pessoal) recebe o link pessoal ali — e não depende do e-mail da empresa nem de código no dia."
            : "A votação está aberta. Divulgue o link geral com as dicas do Telegram e do lixo eletrônico."}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-1 rounded-md border p-2.5">
          <p className="text-sm">
            <span className="font-medium">Pré-cadastrados:</span> {n(kit.preCadastrados)} de {n(kit.aptos)} aptos ({pct}%)
          </p>
          <p className="text-muted-foreground text-xs">
            Telegram: {n(kit.porTelegram)} · e-mail pessoal: {n(kit.porEmail)}. A lista de aptos precisa estar importada
            para o cadastro encontrar a pessoa. O link sai para eles no envio do aviso (botão ou envio automático) e,
            depois dele, a quem se cadastrar, em até 15 minutos.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <div className="grid gap-2">
            <p className="text-sm font-medium">Texto para WhatsApp e delegados</p>
            <pre className="bg-muted/50 max-h-64 overflow-auto rounded-md p-3 text-xs whitespace-pre-wrap">{kit.texto}</pre>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => copiar("texto")}>
                {copiado === "texto" ? <Check /> : <Copy />}
                {copiado === "texto" ? "Copiado" : "Copiar texto"}
              </Button>
              <Button size="sm" variant="outline" asChild>
                <a href={`https://wa.me/?text=${encodeURIComponent(kit.texto)}`} target="_blank" rel="noreferrer">
                  <MessageCircle />
                  Abrir no WhatsApp
                </a>
              </Button>
              <Button size="sm" variant="ghost" onClick={() => copiar("link")}>
                {copiado === "link" ? <Check /> : <Copy />}
                {copiado === "link" ? "Copiado" : "Copiar só o link"}
              </Button>
            </div>
          </div>
          <div className="grid justify-items-center gap-2 self-start">
            {/* eslint-disable-next-line @next/next/no-img-element -- data URL gerada no servidor */}
            <img src={kit.qr} alt={`QR code do link geral de votação: ${kit.link}`} className="size-36 rounded-md border bg-white" />
            <div className="flex flex-wrap justify-center gap-1">
              <Button size="sm" variant="ghost" asChild>
                <a href={kit.qr} download="qrcode-votacao.png">
                  <Download />
                  QR
                </a>
              </Button>
              <Button size="sm" variant="ghost" asChild>
                <a href={`/painel/representacao/votacoes/rodadas/${rodadaId}/cartaz`} target="_blank" rel="noreferrer">
                  <Printer />
                  Cartaz
                </a>
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
