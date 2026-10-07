"use client"

import { useActionState, useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Building2, Loader2, Mail, MessageCircle, Send } from "lucide-react"

import { Turnstile } from "@/components/auth/turnstile"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

import {
  confirmarCodigoLinkUnico,
  consultarTelegramLinkUnico,
  enviarLinkAoEmailDaEmpresa,
  iniciarTelegramLinkUnico,
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
 * Confirmação pelo Telegram: gera o link do bot, e a página consulta a cada
 * 3 s até a pessoa compartilhar o número lá — aí recarrega já identificada.
 */
function ConfirmarTelegram({ destaque = false }: { destaque?: boolean }) {
  const router = useRouter()
  const [link, setLink] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [situacao, setSituacao] = useState<string>("pendente")
  const [gerando, iniciar] = useTransition()

  useEffect(() => {
    if (!link) return
    const timer = setInterval(async () => {
      const r = await consultarTelegramLinkUnico().catch(() => null)
      if (!r) return
      setSituacao(r.situacao)
      if (r.situacao === "confirmado") {
        clearInterval(timer)
        router.refresh()
      } else if (r.situacao === "expirado" || r.situacao === "invalido") {
        clearInterval(timer)
      }
    }, 3000)
    return () => clearInterval(timer)
  }, [link, router])

  const gerar = () =>
    iniciar(async () => {
      setErro(null)
      setSituacao("pendente")
      const r = await iniciarTelegramLinkUnico()
      if (r.erro || !r.link) setErro(r.erro ?? "Não foi possível abrir o Telegram agora.")
      else {
        setLink(r.link)
        window.open(r.link, "_blank", "noopener")
      }
    })

  if (!link || situacao === "expirado" || situacao === "invalido") {
    return (
      <div className="grid gap-2">
        {erro && (
          <Alert variant="destructive">
            <AlertDescription>{erro}</AlertDescription>
          </Alert>
        )}
        {(situacao === "expirado" || situacao === "invalido") && link && (
          <p className="text-muted-foreground text-xs">A confirmação expirou. Toque de novo para gerar outra.</p>
        )}
        <Button type="button" variant={destaque ? "default" : "outline"} onClick={gerar} disabled={gerando}>
          {gerando ? <Loader2 className="animate-spin" /> : <MessageCircle />}
          Confirmar pelo Telegram
        </Button>
        <p className="text-muted-foreground text-xs">
          Não depende de e-mail: você confirma o seu número no Telegram e volta para cá.
        </p>
      </div>
    )
  }

  return (
    <div className="bg-muted/50 grid gap-2 rounded-md p-3 text-sm">
      <p className="font-medium">No Telegram:</p>
      <ol className="text-muted-foreground list-decimal pl-5 text-xs">
        <li>
          Abra a conversa com o bot do sindicato —{" "}
          <a href={link} target="_blank" rel="noreferrer" className="text-primary font-medium underline underline-offset-4">
            toque aqui se ela não abriu
          </a>
          ;
        </li>
        <li>
          aperte <strong>Iniciar</strong>;
        </li>
        <li>
          toque em <strong>📱 Compartilhar meu número</strong>.
        </li>
      </ol>
      <p className="text-muted-foreground flex items-center gap-2 text-xs">
        <Loader2 className="size-3 animate-spin" />
        {situacao === "aguardando_numero"
          ? "Conversa aberta — falta compartilhar o número."
          : "Esperando a confirmação no Telegram… esta página segue sozinha."}
      </p>
    </div>
  )
}

/**
 * Passo 1 do link único: confirmar um e-mail que a pessoa RECEBE. Antes de
 * mandar o código, barra o e-mail da empresa (o filtro dela retém o código) e
 * confere erro de digitação no domínio.
 */
export function EntrarForm({ telegramDisponivel = false }: { telegramDisponivel?: boolean }) {
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
          Ainda nada? {telegramDisponivel ? "Confirme pelo Telegram abaixo, " : ""}recarregue a página e tente outro
          e-mail pessoal, ou fale com o sindicato.
        </p>
        {telegramDisponivel && <ConfirmarTelegram />}
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

      {telegramDisponivel && (
        <div className="grid gap-2 border-t pt-4">
          <p className="text-muted-foreground text-center text-xs">ou</p>
          <ConfirmarTelegram destaque={Boolean(corporativo)} />
        </div>
      )}

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
