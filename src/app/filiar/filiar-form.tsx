"use client"

import Link from "next/link"
import { useActionState, useRef, useState } from "react"
import { ArrowLeft, ArrowRight, Loader2, Mail, MailQuestion, RotateCw } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { renovarTurnstile, Turnstile } from "@/components/auth/turnstile"
import { limparCpf, mascararCpfParcial, validarCpf } from "@/lib/cpf"
import { dataValida } from "@/lib/ficha-filiacao"

import {
  comecarComEmailAction,
  comecarPeloCpfAction,
  reenviarLinkAction,
  type EstadoInicio,
} from "./actions"

const CAMPO = "h-12 text-base"

/** "04111986" → "04/11/1986", digitando. */
function mascararData(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 8)
  return [d.slice(0, 2), d.slice(2, 4), d.slice(4)].filter(Boolean).join("/")
}
/** "04/11/1986" → "1986-11-04" (ou vazio). */
function dataIso(v: string): string {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(v)
  return m ? `${m[3]}-${m[2]}-${m[1]}` : ""
}

type Tela = "cpf" | "email"

/**
 * O começo da ficha, uma pergunta por vez: CPF e nascimento; depois, conforme o
 * caso, "abra o seu e-mail" (com reenvio e a boia "não tenho mais acesso"),
 * "informe um e-mail" ou "você já é filiado".
 */
export function FiliarForm({ ajuda }: { ajuda: React.ReactNode }) {
  const [cpf, setCpf] = useState("")
  const [nascimento, setNascimento] = useState("")
  const [tela, setTela] = useState<Tela>("cpf")
  const [semAcesso, setSemAcesso] = useState(false)

  const formCpf = useRef<HTMLFormElement>(null)
  const formEmail = useRef<HTMLFormElement>(null)
  const [estadoCpf, enviarCpf, pendenteCpf] = useActionState(async (prev: EstadoInicio, fd: FormData) => {
    const r = await comecarPeloCpfAction(prev, fd)
    renovarTurnstile(formCpf.current)
    if (r.resultado?.tipo === "pedir_email") setTela("email")
    return r
  }, {})
  const [estadoEmail, enviarEmail, pendenteEmail] = useActionState(async (prev: EstadoInicio, fd: FormData) => {
    const r = await comecarComEmailAction(prev, fd)
    renovarTurnstile(formEmail.current)
    return r
  }, {})
  const [estadoReenvio, reenviar, pendenteReenvio] = useActionState(reenviarLinkAction, {})

  const resultado =
    tela === "email" ? (estadoEmail.resultado ?? null) : estadoCpf.resultado?.tipo === "pedir_email" ? null : (estadoCpf.resultado ?? null)
  const cpfCompleto = limparCpf(cpf).length === 11
  const cpfErrado = cpfCompleto && !validarCpf(cpf)
  const nascimentoIso = dataIso(nascimento)
  const nascimentoErrado = nascimento.length === 10 && !dataValida(nascimentoIso)

  const recomecar = () => {
    setTela("cpf")
    setSemAcesso(false)
    window.location.reload()
  }

  // ── Link enviado ──────────────────────────────────────────────────────────
  if (resultado?.tipo === "link_enviado") {
    return (
      <Card>
        <CardContent className="grid gap-5 pt-6 text-center">
          <Mail className="text-primary mx-auto size-12" aria-hidden />
          <div className="grid gap-2">
            <h2 className="text-xl font-semibold">Abra o seu e-mail</h2>
            <p className="text-base">
              {resultado.emAndamento ? "Você já tinha começado a ficha. " : ""}
              Enviamos um link para <strong className="whitespace-nowrap">{resultado.emailMascarado}</strong>.
            </p>
            <p className="text-muted-foreground text-sm">
              Toque no botão <strong>Continuar minha filiação</strong> que está no e-mail. A ficha abre numa nova
              página, e você continua de lá. Se não achar, olhe também a caixa de spam ou lixo eletrônico.
            </p>
          </div>
          <form action={reenviar} className="grid gap-2">
            <input type="hidden" name="ficha" value={resultado.fichaId} />
            {estadoReenvio.ok && <p className="text-success-fg text-sm">{estadoReenvio.ok}</p>}
            {estadoReenvio.erro && <p className="text-destructive text-sm">{estadoReenvio.erro}</p>}
            <Button type="submit" variant="outline" size="lg" disabled={pendenteReenvio}>
              {pendenteReenvio ? <Loader2 className="animate-spin" /> : <RotateCw />}
              Não chegou? Enviar de novo
            </Button>
          </form>
          {tela === "cpf" && (
            <Button type="button" variant="ghost" size="lg" onClick={() => { setSemAcesso(true); setTela("email") }}>
              <MailQuestion />
              Não tenho mais acesso a este e-mail
            </Button>
          )}
          <button type="button" onClick={recomecar} className="text-muted-foreground text-sm underline underline-offset-4">
            Digitei o CPF errado — começar de novo
          </button>
          {ajuda}
        </CardContent>
      </Card>
    )
  }

  // ── Já é filiado ──────────────────────────────────────────────────────────
  if (resultado?.tipo === "ja_filiado") {
    return (
      <Card>
        <CardContent className="grid gap-4 pt-6 text-center">
          <h2 className="text-xl font-semibold">Você já é filiado(a){resultado.nome ? `, ${resultado.nome.split(" ")[0]}` : ""}!</h2>
          <p className="text-base">
            Não precisa preencher a ficha de novo. Seus dados e sua carteirinha ficam na Área do associado.
          </p>
          <Button asChild size="lg">
            <Link href="/portal">Ir para a Área do associado</Link>
          </Button>
          {ajuda}
        </CardContent>
      </Card>
    )
  }

  // ── Informar um e-mail ────────────────────────────────────────────────────
  if (tela === "email") {
    const semEmail = estadoCpf.resultado?.tipo === "pedir_email" && estadoCpf.resultado.semEmailNoCadastro
    return (
      <Card>
        <CardContent className="pt-6">
          <form ref={formEmail} action={enviarEmail} className="grid gap-5">
            <input type="hidden" name="cpf" value={cpf} />
            <input type="hidden" name="nascimento" value={nascimentoIso} />
            <div className="grid gap-1.5">
              <h2 className="text-xl font-semibold">
                {semAcesso ? "Vamos usar outro e-mail" : "Qual é o seu e-mail?"}
              </h2>
              <p className="text-muted-foreground text-sm">
                {semAcesso
                  ? "Informe um e-mail que você abre hoje. Por segurança, a ficha começa em branco e você preenche seus dados de novo; o sindicato confere a sua identidade pela assinatura gov.br."
                  : semEmail
                    ? "Não há e-mail no seu cadastro. Informe um e-mail que você abre hoje: o link para continuar vai para ele."
                    : "Vamos mandar para ele o link para você continuar a ficha. Use um e-mail que você abre hoje."}
              </p>
            </div>
            {estadoEmail.erro && (
              <Alert variant="destructive">
                <AlertDescription>{estadoEmail.erro}</AlertDescription>
              </Alert>
            )}
            <div className="grid gap-1.5">
              <Label htmlFor="email" className="text-base">E-mail</Label>
              <Input id="email" name="email" type="email" inputMode="email" autoComplete="email" required className={CAMPO} aria-invalid={estadoEmail.campo === "email"} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="email_confirmacao" className="text-base">Digite o e-mail de novo</Label>
              <Input
                id="email_confirmacao"
                name="email_confirmacao"
                type="email"
                inputMode="email"
                autoComplete="off"
                required
                className={CAMPO}
                aria-invalid={estadoEmail.campo === "email_confirmacao"}
                onPaste={(e) => e.preventDefault()}
              />
              <p className="text-muted-foreground text-xs">É só para não haver erro de digitação.</p>
            </div>
            <Turnstile acao="filiar_email" />
            <Button type="submit" size="lg" disabled={pendenteEmail}>
              {pendenteEmail ? <Loader2 className="animate-spin" /> : <ArrowRight />}
              Enviar o link para este e-mail
            </Button>
            <button type="button" onClick={recomecar} className="text-muted-foreground inline-flex items-center justify-center gap-1 text-sm underline underline-offset-4">
              <ArrowLeft className="size-3.5" aria-hidden />
              Voltar ao começo
            </button>
            {ajuda}
          </form>
        </CardContent>
      </Card>
    )
  }

  // ── CPF e nascimento ──────────────────────────────────────────────────────
  return (
    <Card>
      <CardContent className="pt-6">
        <form ref={formCpf} action={enviarCpf} className="grid gap-5">
          <input type="hidden" name="nascimento" value={nascimentoIso} />
          {estadoCpf.erro && (
            <Alert variant="destructive">
              <AlertDescription>{estadoCpf.erro}</AlertDescription>
            </Alert>
          )}
          <div className="grid gap-1.5">
            <Label htmlFor="cpf" className="text-base">Seu CPF</Label>
            <Input
              id="cpf"
              name="cpf"
              inputMode="numeric"
              autoComplete="off"
              placeholder="000.000.000-00"
              required
              value={cpf}
              onChange={(e) => setCpf(mascararCpfParcial(e.target.value))}
              aria-invalid={cpfErrado || estadoCpf.campo === "cpf"}
              className={CAMPO}
            />
            {cpfErrado && <p className="text-destructive text-sm">Este CPF não existe. Confira os números.</p>}
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="nascimento_tela" className="text-base">Data de nascimento</Label>
            <Input
              id="nascimento_tela"
              inputMode="numeric"
              autoComplete="bday"
              placeholder="dd/mm/aaaa"
              required
              value={nascimento}
              onChange={(e) => setNascimento(mascararData(e.target.value))}
              aria-invalid={nascimentoErrado || estadoCpf.campo === "nascimento"}
              className={CAMPO}
            />
            {nascimentoErrado && <p className="text-destructive text-sm">Confira a data: dia/mês/ano, como 04/11/1986.</p>}
          </div>
          <Turnstile acao="filiar_cpf" />
          <Button type="submit" size="lg" disabled={pendenteCpf || !cpfCompleto || cpfErrado || !nascimentoIso || nascimentoErrado}>
            {pendenteCpf ? <Loader2 className="animate-spin" /> : <ArrowRight />}
            Continuar
          </Button>
          {ajuda}
        </form>
      </CardContent>
    </Card>
  )
}
