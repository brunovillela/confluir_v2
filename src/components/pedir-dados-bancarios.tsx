"use client"

import { useActionState, useState } from "react"
import { Copy, Link2, Loader2, Mail, MessageCircle, Send } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useEnvioFormulario } from "@/hooks/use-envio-formulario"
import { formatarData } from "@/lib/formato"
import {
  cancelarPedidoDadosBancariosAction,
  pedirDadosBancariosAction,
  type EstadoPedido,
} from "@/app/painel/pedidos-dados-bancarios-actions"

export type PedidoAberto = {
  id: string
  criadoEm: string
  abertoEm: string | null
  enviadoPara: string | null
}

/** Texto da mensagem que acompanha o link no WhatsApp. */
function mensagem(link: string): string {
  return `Olá! Para recebermos seus pagamentos, informe sua chave Pix ou conta bancária (no seu CPF/CNPJ) por este link, que vale 7 dias: ${link}`
}

/**
 * "Pedir dados bancários": gera o link de uso único para o próprio favorecido
 * informar a chave Pix ou a conta — por e-mail (o sistema envia), pelo
 * WhatsApp (abre a conversa com a mensagem pronta) ou copiando o link.
 */
export function PedirDadosBancarios({
  dono,
  emailSugerido,
  telefoneSugerido,
  pendente,
}: {
  dono: { tipo: "fornecedor" | "usuario" | "filiado"; id: string }
  emailSugerido?: string | null
  telefoneSugerido?: string | null
  /** O pedido ainda sem resposta (o mais recente). */
  pendente?: PedidoAberto | null
}) {
  const [aberto, setAberto] = useState(false)
  const [copiado, setCopiado] = useState(false)
  const [estado, formAction, enviando] = useActionState<EstadoPedido, FormData>(pedirDadosBancariosAction, {})
  const envio = useEnvioFormulario(formAction, estado)
  const [telefone, setTelefone] = useState(telefoneSugerido ?? "")
  const fone = telefone.replace(/\D/g, "")
  const whatsapp = estado.link ? `https://wa.me/${fone.length <= 11 ? `55${fone}` : fone}?text=${encodeURIComponent(mensagem(estado.link))}` : null

  return (
    <div className="grid gap-1">
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogTrigger asChild>
          <Button type="button" variant="outline" size="sm">
            <Send />
            Pedir dados bancários
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Pedir dados bancários</DialogTitle>
            <DialogDescription>
              O favorecido recebe um link, sem senha, para informar a chave Pix ou a conta no próprio CPF/CNPJ. O
              link vale 7 dias e serve uma vez; ordens que esperavam a conta seguem sozinhas.
            </DialogDescription>
          </DialogHeader>
          <form action={formAction} {...envio} className="grid gap-3">
            <input type="hidden" name="dono_tipo" value={dono.tipo} />
            <input type="hidden" name="dono_id" value={dono.id} />
            {estado.erro && (
              <Alert variant="destructive">
                <AlertDescription>{estado.erro}</AlertDescription>
              </Alert>
            )}
            <div className="grid gap-1.5">
              <Label htmlFor={`pedido-email-${dono.id}`}>E-mail</Label>
              <div className="flex gap-2">
                <Input id={`pedido-email-${dono.id}`} name="email" type="email" defaultValue={emailSugerido ?? ""} />
                <Button type="submit" name="canal" value="email" disabled={enviando}>
                  {enviando ? <Loader2 className="animate-spin" /> : <Mail />}
                  Enviar
                </Button>
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`pedido-fone-${dono.id}`}>WhatsApp (com DDD)</Label>
              <div className="flex gap-2">
                <Input
                  id={`pedido-fone-${dono.id}`}
                  name="telefone"
                  inputMode="tel"
                  value={telefone}
                  onChange={(e) => setTelefone(e.target.value)}
                />
                <Button type="submit" name="canal" value="whatsapp" variant="outline" disabled={enviando}>
                  <MessageCircle />
                  Gerar
                </Button>
              </div>
            </div>
            <div>
              <Button type="submit" name="canal" value="link" variant="ghost" size="sm" disabled={enviando}>
                <Link2 />
                Só gerar o link
              </Button>
            </div>
          </form>
          {estado.link && (
            <div className="grid gap-2 rounded-md border p-3">
              <p className="text-sm">
                {estado.canal === "email" && !estado.erro ? "E-mail enviado. " : ""}Link do pedido:
              </p>
              <div className="flex gap-2">
                <Input readOnly value={estado.link} onFocus={(e) => e.currentTarget.select()} />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    void navigator.clipboard?.writeText(estado.link ?? "")
                    setCopiado(true)
                  }}
                >
                  <Copy />
                  {copiado ? "Copiado" : "Copiar"}
                </Button>
              </div>
              {estado.canal === "whatsapp" && whatsapp && (
                <Button asChild>
                  <a href={whatsapp} target="_blank" rel="noopener noreferrer">
                    <MessageCircle />
                    Abrir o WhatsApp com a mensagem
                  </a>
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
      {pendente && (
        <form action={cancelarPedidoDadosBancariosAction} className="text-muted-foreground flex flex-wrap items-center gap-x-2 text-xs">
          <input type="hidden" name="dono_tipo" value={dono.tipo} />
          <input type="hidden" name="dono_id" value={dono.id} />
          <input type="hidden" name="pedido_id" value={pendente.id} />
          <span>
            Pedido enviado em {formatarData(pendente.criadoEm)}
            {pendente.enviadoPara ? ` para ${pendente.enviadoPara}` : ""} ·{" "}
            {pendente.abertoEm ? `aberto em ${formatarData(pendente.abertoEm)}` : "ainda não aberto"}
          </span>
          <button type="submit" className="underline">
            Cancelar pedido
          </button>
        </form>
      )}
    </div>
  )
}
