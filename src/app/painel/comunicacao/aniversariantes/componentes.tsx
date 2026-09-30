"use client"

import { startTransition, useActionState, useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, MessageCircle, Save, Send, TestTube2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { aplicarVariaveis, VARIAVEIS_MENSAGEM } from "@/lib/comunicacao-mensagens-constantes"

import {
  enviarLoteHojeAction,
  enviarTesteAction,
  marcarWhatsappAction,
  salvarConfigAction,
} from "./actions"

function Retorno({ erro, ok }: { erro?: string; ok?: string }) {
  if (erro) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{erro}</AlertDescription>
      </Alert>
    )
  }
  if (ok) {
    return (
      <Alert variant="success">
        <AlertDescription>{ok}</AlertDescription>
      </Alert>
    )
  }
  return null
}

/** Texto do parabéns (e-mail e WhatsApp), o envio automático e a prévia. */
export function ConfigAniversarioForm({
  config,
  exemploNome,
  entidade,
}: {
  config: { ativo: boolean; assunto: string; mensagem: string; textoWhatsapp: string }
  exemploNome: string
  entidade: string
}) {
  const [salvo, salvar, salvando] = useActionState(salvarConfigAction, {})
  const [teste, testar, testando] = useActionState(enviarTesteAction, {})
  const [assunto, setAssunto] = useState(config.assunto)
  const [mensagem, setMensagem] = useState(config.mensagem)
  const [whatsapp, setWhatsapp] = useState(config.textoWhatsapp)
  const [ativo, setAtivo] = useState(config.ativo)
  const v = { nome: exemploNome, entidade }

  return (
    <form
      // Pelo onSubmit (React 19 limpa o form depois de uma action); o botão
      // clicado decide se salva ou manda o teste.
      onSubmit={(e) => {
        e.preventDefault()
        const dados = new FormData(e.currentTarget)
        const botao = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null
        startTransition(() => (botao?.value === "teste" ? testar(dados) : salvar(dados)))
      }}
      className="grid gap-5"
    >
      <Retorno erro={salvo.erro} ok={salvo.ok} />
      <Retorno erro={teste.erro} ok={teste.ok} />

      <label className="flex items-start gap-3 rounded-lg border p-3">
        <input
          type="checkbox"
          name="ativo"
          checked={ativo}
          onChange={(e) => setAtivo(e.target.checked)}
          className="accent-primary mt-0.5 size-4"
        />
        <span className="grid gap-0.5">
          <span className="text-sm font-medium">Enviar o parabéns por e-mail automaticamente</span>
          <span className="text-muted-foreground text-xs">
            Todo dia às 9h, para os filiados ativos que fazem aniversário e têm e-mail. Desligado,
            ninguém recebe sozinho — dá para enviar pela lista do dia.
          </span>
        </span>
      </label>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="grid content-start gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="assunto">Assunto do e-mail</Label>
            <Input id="assunto" name="assunto" value={assunto} onChange={(e) => setAssunto(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="mensagem">Mensagem do e-mail</Label>
            <Textarea id="mensagem" name="mensagem" rows={9} value={mensagem} onChange={(e) => setMensagem(e.target.value)} />
            <p className="text-muted-foreground text-xs">Deixe uma linha em branco entre os parágrafos.</p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="texto_whatsapp">Texto do WhatsApp</Label>
            <Textarea id="texto_whatsapp" name="texto_whatsapp" rows={4} value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} />
          </div>
          <p className="text-muted-foreground text-xs">
            Use{" "}
            {VARIAVEIS_MENSAGEM.map((x, i) => (
              <span key={x.chave}>
                {i > 0 && (i === VARIAVEIS_MENSAGEM.length - 1 ? " e " : ", ")}
                <code className="bg-muted rounded px-1">{x.chave}</code> ({x.rotulo})
              </span>
            ))}{" "}
            — cada pessoa recebe com o próprio nome.
          </p>
        </div>

        <div className="grid content-start gap-3">
          <p className="text-sm font-medium">Prévia — como {exemploNome.split(" ")[0]} recebe</p>
          <div className="bg-muted/40 grid gap-2 rounded-lg border p-4 text-sm">
            <p className="text-muted-foreground text-xs">E-mail</p>
            <p className="font-semibold">{aplicarVariaveis(assunto, v)}</p>
            <div className="grid gap-2 whitespace-pre-line">
              {aplicarVariaveis(mensagem, v)
                .split(/\n\s*\n/)
                .map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
            </div>
          </div>
          <div className="grid gap-2 rounded-lg border border-[#25d366]/40 bg-[#25d366]/10 p-4 text-sm">
            <p className="text-muted-foreground text-xs">WhatsApp</p>
            <p className="whitespace-pre-line">{aplicarVariaveis(whatsapp, v)}</p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        <Button type="submit" name="acao" value="teste" variant="outline" disabled={testando || salvando}>
          {testando ? <Loader2 className="animate-spin" /> : <TestTube2 />}
          Enviar teste para mim
        </Button>
        <Button type="submit" name="acao" value="salvar" disabled={salvando || testando}>
          {salvando ? <Loader2 className="animate-spin" /> : <Save />}
          Salvar
        </Button>
      </div>
    </form>
  )
}

/** Manda os e-mails de hoje em lotes, com o andamento na tela. */
export function EnviarAgora({ pendentes }: { pendentes: number }) {
  const router = useRouter()
  const [andamento, setAndamento] = useState<{ enviados: number; falhas: number; restantes: number } | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function enviar() {
    setEnviando(true)
    setErro(null)
    let enviados = 0
    let falhas = 0
    try {
      for (let volta = 0; volta < 200; volta++) {
        const r = await enviarLoteHojeAction()
        if (r.erro) {
          setErro(r.erro)
          break
        }
        enviados += r.enviados ?? 0
        falhas += r.falhas ?? 0
        setAndamento({ enviados, falhas, restantes: r.restantes ?? 0 })
        if (!r.restantes || (r.enviados ?? 0) + (r.falhas ?? 0) === 0) break
      }
    } catch {
      setErro("A conexão caiu no meio do envio. Clique de novo: o envio continua de onde parou.")
    } finally {
      setEnviando(false)
      router.refresh()
    }
  }

  return (
    <div className="grid justify-items-end gap-2">
      <Button type="button" onClick={enviar} disabled={enviando || pendentes === 0}>
        {enviando ? <Loader2 className="animate-spin" /> : <Send />}
        {pendentes > 0 ? `Enviar os ${pendentes} e-mails agora` : "Nenhum e-mail na fila"}
      </Button>
      {andamento && (
        <p className="text-muted-foreground text-xs tabular-nums">
          {andamento.enviados} enviado(s){andamento.falhas ? ` · ${andamento.falhas} falha(s)` : ""}
          {andamento.restantes ? ` · faltam ${andamento.restantes}` : " · concluído"}
        </p>
      )}
      {erro && <p className="text-destructive text-xs">{erro}</p>}
    </div>
  )
}

/** Abre o WhatsApp com o texto pronto e registra quem abriu. */
export function BotaoWhatsapp({ href, envioId, aberto }: { href: string; envioId: string | null; aberto: boolean }) {
  return (
    <Button asChild size="sm" variant={aberto ? "outline" : "default"} className={aberto ? "" : "bg-[#1f9d55] text-white hover:bg-[#1a8a4a]"}>
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        onClick={() => {
          if (envioId) void marcarWhatsappAction(envioId)
        }}
      >
        <MessageCircle />
        {aberto ? "Abrir de novo" : "WhatsApp"}
      </a>
    </Button>
  )
}
