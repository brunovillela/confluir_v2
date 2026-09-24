"use client"

import { useState } from "react"
import { Check, Copy, ExternalLink, Link2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

/**
 * O endereço que a entidade divulga. Ficava só no subtítulo, em texto miúdo —
 * e quem precisa divulgar acaba digitando à mão ou pedindo para alguém. Aqui
 * ele aparece inteiro, com um botão para copiar e a mensagem pronta.
 */
export function LinkPublico({
  url,
  espaco,
  ativo,
  temJanela,
}: {
  url: string
  espaco: string
  ativo: boolean
  temJanela: boolean
}) {
  const [copiado, setCopiado] = useState<"link" | "mensagem" | null>(null)
  const mensagem = `Para pedir o uso do ${espaco}, preencha o formulário: ${url}`

  const copiar = async (texto: string, qual: "link" | "mensagem") => {
    try {
      await navigator.clipboard.writeText(texto)
      setCopiado(qual)
      setTimeout(() => setCopiado(null), 2500)
    } catch {
      /* navegador sem permissão de área de transferência — o campo fica à mão */
    }
  }

  const noAr = ativo && temJanela

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Link2 className="size-4" />
          Link para divulgar
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        {!noAr && (
          <Alert variant="warning">
            <AlertDescription>
              {!ativo
                ? "O espaço está indisponível: o link responde “página não encontrada”. Deixe assim enquanto monta o cadastro."
                : "Sem faixa de horário, o link abre mas não aceita pedido. Defina os horários acima."}
            </AlertDescription>
          </Alert>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Input readOnly value={url} className="min-w-64 flex-1 font-mono text-xs" />
          <Button variant="outline" size="sm" onClick={() => copiar(url, "link")}>
            {copiado === "link" ? <Check /> : <Copy />}
            {copiado === "link" ? "Copiado" : "Copiar link"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => copiar(mensagem, "mensagem")}>
            {copiado === "mensagem" ? <Check /> : <Copy />}
            {copiado === "mensagem" ? "Copiada" : "Copiar mensagem"}
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <a href={url} target="_blank" rel="noreferrer">
              <ExternalLink />
              Abrir
            </a>
          </Button>
        </div>
        <p className="text-muted-foreground text-xs">
          Quem abrir não precisa de conta nem de login. Cole no site, no
          WhatsApp ou no e-mail de resposta a quem pergunta pelo espaço.
        </p>
      </CardContent>
    </Card>
  )
}
