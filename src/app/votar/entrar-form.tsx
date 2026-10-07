"use client"

import { useActionState, useState } from "react"
import { Building2, Loader2, Mail, Send } from "lucide-react"

import { Turnstile } from "@/components/auth/turnstile"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import {
  confirmarCodigoLinkUnico,
  enviarLinkAoEmailDaEmpresa,
  solicitarCodigoLinkUnico,
  type EstadoEntrar,
} from "./actions"

const REMETENTE = "nao-responda@confluir.online"

/** Onde o e-mail costuma parar quando "não chega". */
function OndeProcurar({ assunto }: { assunto: string }) {
  return (
    <div className="bg-muted/50 grid gap-1 rounded-md p-3 text-xs">
      <p className="font-medium">Não chegou em 1 ou 2 minutos? Procure em todas as pastas:</p>
      <ul className="text-muted-foreground list-disc pl-4">
        <li>
          <strong>Spam</strong> ou <strong>Lixo eletrônico</strong>
        </li>
        <li>
          No Gmail: <strong>Promoções</strong>, <strong>Atualizações</strong> e <strong>Social</strong>
        </li>
        <li>
          No Outlook/Hotmail: <strong>Outros</strong> e <strong>Lixo eletrônico</strong>
        </li>
      </ul>
      <p className="text-muted-foreground">
        Remetente: <strong>{REMETENTE}</strong> · assunto “{assunto}”. Achou no spam? Marque como “não é spam”.
      </p>
    </div>
  )
}

/**
 * Passo 1 do link único: confirmar um e-mail que a pessoa RECEBE. Antes de
 * mandar o código, barra o e-mail da empresa (o filtro dela retém o código) e
 * confere erro de digitação no domínio.
 */
export function EntrarForm() {
  const [email, setEmail] = useState("")
  const [pedido, pedir, pedindo] = useActionState(
    async (prev: EstadoEntrar, formData: FormData) => {
      setEmail(String(formData.get("email") ?? ""))
      return solicitarCodigoLinkUnico(prev, formData)
    },
    {}
  )
  const [link, mandarLink, mandandoLink] = useActionState(enviarLinkAoEmailDaEmpresa, {})
  const [conf, confirmar, confirmando] = useActionState(confirmarCodigoLinkUnico, {})

  // Link pessoal reenviado ao e-mail da empresa.
  if (link.linkEnviado) {
    return (
      <div className="grid gap-3">
        <Alert variant="success">
          <AlertDescription>
            {link.ok} Abra o e-mail “Você está habilitado a votar” e clique em <strong>Ir para a votação</strong>.
          </AlertDescription>
        </Alert>
        <OndeProcurar assunto="Você está habilitado a votar — …" />
        <p className="text-muted-foreground text-xs">
          O filtro da empresa pode segurar a mensagem em quarentena. Se não chegar, recarregue a página e use um
          e-mail pessoal.
        </p>
      </div>
    )
  }

  if (pedido.ok) {
    return (
      <form action={confirmar} className="grid gap-4">
        <input type="hidden" name="email" value={email} />
        <Alert>
          <AlertDescription>{pedido.ok}</AlertDescription>
        </Alert>
        {conf.erro && (
          <Alert variant="destructive">
            <AlertDescription>{conf.erro}</AlertDescription>
          </Alert>
        )}
        <div className="grid gap-2">
          <Label htmlFor="token">Código de verificação</Label>
          <Input
            id="token"
            name="token"
            inputMode="numeric"
            pattern="\d{6,10}"
            maxLength={10}
            placeholder="Código"
            className="text-center text-lg tracking-[0.4em]"
            autoComplete="one-time-code"
            required
          />
        </div>
        <Button type="submit" disabled={confirmando}>
          {confirmando && <Loader2 className="animate-spin" />}
          Confirmar
        </Button>
        <OndeProcurar assunto="Confluir | Seu código de acesso" />
        <p className="text-muted-foreground text-xs">
          Ainda nada? Recarregue a página e tente outro e-mail pessoal, ou fale com o sindicato.
        </p>
      </form>
    )
  }

  const corporativo = pedido.corporativo ?? link.corporativo
  const sugestao = pedido.sugestao

  return (
    <div className="grid gap-4">
      {corporativo && (
        <Alert variant="warning">
          <AlertDescription className="grid gap-1">
            <span className="flex items-center gap-2 font-medium">
              <Building2 className="size-4" />
              Este é o e-mail da sua empresa
            </span>
            <span>
              O filtro de e-mail da empresa costuma bloquear o nosso código. Digite abaixo um{" "}
              <strong>e-mail pessoal</strong> (Gmail, Hotmail, Yahoo…).
            </span>
          </AlertDescription>
        </Alert>
      )}

      <form action={pedir} className="grid gap-4" key={sugestao?.email ?? corporativo?.email ?? "inicio"}>
        {pedido.erro && (
          <Alert variant="destructive">
            <AlertDescription>{pedido.erro}</AlertDescription>
          </Alert>
        )}
        {sugestao && (
          <Alert variant="warning">
            <AlertDescription className="grid gap-2">
              <span>
                Você quis dizer <strong>{sugestao.email}</strong>?
              </span>
              <span className="flex flex-wrap gap-2">
                <Button type="submit" size="sm" name="email" value={sugestao.email} disabled={pedindo}>
                  Sim, usar {sugestao.email.split("@")[1]}
                </Button>
                {!pedido.erro && (
                  <Button
                    type="submit"
                    size="sm"
                    variant="outline"
                    name="forcar"
                    value="1"
                    disabled={pedindo}
                  >
                    Não, está certo
                  </Button>
                )}
              </span>
            </AlertDescription>
          </Alert>
        )}
        <div className="grid gap-2">
          <Label htmlFor="email">Seu e-mail pessoal</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            defaultValue={sugestao?.digitado ?? (pedido.erro ? email : "")}
            required={!sugestao}
          />
          <p className="text-muted-foreground text-xs">
            Use um e-mail que você recebe — de preferência o pessoal (Gmail, por exemplo). E-mails de empresa costumam
            barrar as nossas mensagens.
          </p>
        </div>
        <Turnstile acao="votacao_link_unico" />
        <Button type="submit" disabled={pedindo}>
          {pedindo ? <Loader2 className="animate-spin" /> : <Mail />}
          Receber código
        </Button>
      </form>

      {corporativo?.temLink && (
        <form action={mandarLink} className="grid gap-2 border-t pt-4">
          <input type="hidden" name="email" value={corporativo.email} />
          {link.erro && (
            <Alert variant="destructive">
              <AlertDescription>{link.erro}</AlertDescription>
            </Alert>
          )}
          <p className="text-muted-foreground text-xs">
            Não tem e-mail pessoal? Podemos mandar o seu <strong>link de votação</strong> para{" "}
            <strong>{corporativo.email}</strong> — esse formato passa melhor pelo filtro da empresa.
          </p>
          <Turnstile acao="votacao_link_empresa" />
          <Button type="submit" variant="outline" size="sm" disabled={mandandoLink}>
            {mandandoLink ? <Loader2 className="animate-spin" /> : <Send />}
            Mandar o link de votação para este e-mail
          </Button>
        </form>
      )}
    </div>
  )
}
