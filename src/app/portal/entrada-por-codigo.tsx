"use client"

import { useActionState, useEffect, useRef, useState } from "react"
import { KeyRound, Loader2, Mail, RotateCw } from "lucide-react"

import { Turnstile } from "@/components/auth/turnstile"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { textoValidade } from "@/lib/auth-email-constantes"
import { formatarCpf } from "@/lib/cpf"

import { confirmarCodigoFiliado, pedirCodigoFiliado, type EstadoPedidoCodigo } from "./actions"
import {
  CampoCpfPortal,
  descritoPor,
  Mensagens,
  renovarTurnstile,
  type EstadoEntrada,
} from "./campos-entrada"
import { useEnvioFormulario } from "@/hooks/use-envio-formulario"

/** Espera para reenviar: a cadência de lib/codigo-acesso.ts (1 código por minuto). */
const ESPERA_REENVIO_S = 60

/**
 * Aba "Código por e-mail" (A1). Passo 1: o CPF. Passo 2: digitar o código que
 * chegou — o mesmo e-mail traz o botão "Entrar no portal" como atalho.
 *
 * O passo 2 aparece para QUALQUER CPF válido (A68): para quem não está no
 * cadastro nada é enviado e o código só não confere. Por isso a tela nunca
 * mostra o e-mail, nem mascarado.
 *
 * O formulário do pedido fica montado nos dois passos (no 2, vira o
 * "Reenviar código"): assim o widget do Turnstile é o mesmo desde o
 * carregamento da página e só precisa ser renovado.
 */
export function EntradaPorCodigo({
  cpf,
  aoMudarCpf,
  next,
  criarSenha,
  aoDesistirDeCriarSenha,
}: {
  cpf: string
  aoMudarCpf: (cpf: string) => void
  next: string | null
  /** Veio de "Esqueci minha senha / criar senha": depois do código, a senha. */
  criarSenha: boolean
  aoDesistirDeCriarSenha: () => void
}) {
  const formPedido = useRef<HTMLFormElement>(null)
  const campoCpf = useRef<HTMLInputElement>(null)
  const focarCpf = useRef(false)
  const [etapa, setEtapa] = useState<"cpf" | "codigo">("cpf")
  // O CPF do pedido fica guardado: mudar o campo na outra aba não troca o
  // CPF de um código já pedido.
  const [cpfPedido, setCpfPedido] = useState("")
  // Cada pedido aceito (o primeiro ou um reenvio) abre um passo 2 novo: o
  // erro do código anterior não vale para o que acabou de ser pedido.
  const [serie, setSerie] = useState(0)
  const [espera, setEspera] = useState(0)
  // A resposta do último pedido aceito: um reenvio recusado (ex.: Turnstile)
  // não apaga a orientação do passo 2.
  const [aviso, setAviso] = useState<string | undefined>(undefined)

  const [estadoPedido, pedir, pedindo] = useActionState(
    async (prev: EstadoPedidoCodigo, fd: FormData) => {
      const r = await pedirCodigoFiliado(prev, fd)
      renovarTurnstile(formPedido.current)
      if (r.pedido) {
        // No reenvio, o campo oculto traz o próprio CPF do pedido.
        setCpfPedido(String(fd.get("cpf") ?? ""))
        setSerie((s) => s + 1)
        setAviso(r.ok)
        setEtapa("codigo")
        setEspera(ESPERA_REENVIO_S)
      }
      return r
    },
    {}
  )
  const envio = useEnvioFormulario(pedir, estadoPedido, {
    ref: formPedido,
  })

  // Contagem do "Reenviar código".
  useEffect(() => {
    if (espera <= 0) return
    const timer = window.setTimeout(() => setEspera((s) => s - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [espera])

  // "Usar outro CPF" devolve o foco ao campo, já vazio.
  useEffect(() => {
    if (etapa === "cpf" && focarCpf.current) {
      focarCpf.current = false
      campoCpf.current?.focus()
    }
  }, [etapa])

  const usarOutroCpf = () => {
    focarCpf.current = true
    aoMudarCpf("")
    setEspera(0)
    setEtapa("cpf")
  }

  return (
    <div className="grid gap-4 pt-2">
      {etapa === "codigo" && (
        <PassoCodigo
          key={serie}
          cpf={cpfPedido}
          next={next}
          criarSenha={criarSenha}
          aviso={aviso}
        />
      )}

      <form action={pedir} {...envio} className="grid gap-4">
        {next && <input type="hidden" name="next" value={next} />}
        {etapa === "cpf" ? (
          <>
            <Mensagens id="erro-pedido-codigo" erro={estadoPedido.erro} />
            {criarSenha && (
              <Alert variant="info">
                <AlertDescription className="grid gap-1">
                  <span>
                    Para criar ou trocar a senha, entre primeiro com um código
                    enviado ao e-mail do cadastro. Em seguida, o portal pede a
                    nova senha.
                  </span>
                  <Button
                    type="button"
                    variant="link"
                    className="justify-self-start px-0"
                    onClick={aoDesistirDeCriarSenha}
                  >
                    Só quero entrar, sem criar senha
                  </Button>
                </AlertDescription>
              </Alert>
            )}
            <div className="grid gap-2">
              <Label htmlFor="cpf-codigo">CPF</Label>
              <CampoCpfPortal
                ref={campoCpf}
                id="cpf-codigo"
                valor={cpf}
                aoMudar={aoMudarCpf}
                required
                aria-describedby={descritoPor(estadoPedido.erro && "erro-pedido-codigo", "dica-cpf-codigo")}
              />
              <p id="dica-cpf-codigo" className="text-muted-foreground text-xs">
                Enviaremos um código para o e-mail do seu cadastro. O mesmo
                e-mail traz o botão “Entrar no portal”, que faz o mesmo que
                digitar o código.
              </p>
            </div>
          </>
        ) : (
          <>
            <input type="hidden" name="cpf" value={cpfPedido} />
            <Mensagens erro={estadoPedido.erro} />
          </>
        )}
        <Turnstile acao="portal_codigo" />
        {etapa === "cpf" ? (
          <Button type="submit" disabled={pedindo}>
            {pedindo ? <Loader2 className="animate-spin" /> : <Mail />}
            Receber código por e-mail
          </Button>
        ) : (
          <div className="grid gap-2">
            <div className="flex flex-wrap gap-2">
              <Button type="submit" variant="outline" disabled={pedindo || espera > 0}>
                {pedindo ? <Loader2 className="animate-spin" /> : <RotateCw />}
                {espera > 0 ? `Reenviar código (${espera} s)` : "Reenviar código"}
              </Button>
              <Button type="button" variant="ghost" onClick={usarOutroCpf}>
                Usar outro CPF
              </Button>
            </div>
            <p className="text-muted-foreground text-xs">
              Dá para pedir outro código a cada minuto, até 5 por hora. Vale
              sempre o do e-mail mais recente.
            </p>
          </div>
        )}
      </form>
    </div>
  )
}

/**
 * Passo 2: o código. O campo segue o de /login/verificacao (teclado numérico,
 * `one-time-code` para o celular sugerir o código). O tamanho não é fixo: o
 * código do Supabase hoje tem 8 dígitos (commit 51b9e93), e a tela não promete
 * um número.
 */
function PassoCodigo({
  cpf,
  next,
  criarSenha,
  aviso,
}: {
  cpf: string
  next: string | null
  criarSenha: boolean
  aviso?: string
}) {
  const [estado, confirmar, confirmando] = useActionState<EstadoEntrada, FormData>(
    confirmarCodigoFiliado,
    {}
  )
  const [codigo, setCodigo] = useState("")
  const campo = useRef<HTMLInputElement>(null)

  // Código recusado: o foco volta ao campo, com os dígitos selecionados, para
  // corrigir ou colar o código certo sem procurar onde tocar.
  useEffect(() => {
    if (!estado.erro) return
    campo.current?.focus()
    campo.current?.select()
  }, [estado])

  return (
    <div className="grid gap-4">
      <Alert variant="info">
        <Mail />
        <AlertDescription>
          <span>
            CPF <strong>{formatarCpf(cpf)}</strong>. {aviso}
          </span>
        </AlertDescription>
      </Alert>

      <form action={confirmar} className="grid gap-4">
        <input type="hidden" name="cpf" value={cpf} />
        {next && <input type="hidden" name="next" value={next} />}
        {criarSenha && <input type="hidden" name="criar_senha" value="1" />}
        <Mensagens id="erro-codigo-acesso" erro={estado.erro} />
        <div className="grid gap-2">
          <Label htmlFor="codigo-acesso">Código recebido por e-mail</Label>
          {/* Sem maxLength: ele cortaria um "Código: 1234…" colado antes de
              a limpeza tirar o texto. Só os números ficam. */}
          <Input
            ref={campo}
            id="codigo-acesso"
            name="codigo"
            inputMode="numeric"
            autoComplete="one-time-code"
            minLength={6}
            required
            autoFocus
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 10))}
            aria-invalid={estado.erro ? true : undefined}
            aria-describedby={descritoPor(estado.erro && "erro-codigo-acesso", "dica-codigo-acesso")}
            className="text-center text-lg tracking-[0.4em]"
          />
          <p id="dica-codigo-acesso" className="text-muted-foreground text-xs">
            O código vale por {textoValidade()} e serve uma vez só.
          </p>
        </div>
        <Button type="submit" disabled={confirmando}>
          {confirmando ? <Loader2 className="animate-spin" /> : <KeyRound />}
          {criarSenha ? "Entrar e criar a senha" : "Entrar"}
        </Button>
      </form>

      <div className="bg-muted/50 grid gap-1 rounded-md p-3 text-xs">
        <p className="font-medium">Não chegou em 1 ou 2 minutos?</p>
        <ul className="text-muted-foreground list-disc pl-4">
          <li>
            Procure no <strong>Spam</strong> ou no <strong>Lixo eletrônico</strong>;
            no Gmail, também em <strong>Promoções</strong> e <strong>Atualizações</strong>.
          </li>
          <li>O assunto é “Confluir | Seu código de acesso”.</li>
          <li>
            No e-mail, tocar em <strong>Entrar no portal</strong> faz o mesmo que
            digitar o código.
          </li>
        </ul>
      </div>
    </div>
  )
}
