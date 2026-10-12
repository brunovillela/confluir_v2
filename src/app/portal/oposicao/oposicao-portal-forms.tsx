"use client"

import { useActionState, useEffect, useRef, useState } from "react"
import { KeyRound, Loader2, Mail, RotateCw } from "lucide-react"

import { Turnstile } from "@/components/auth/turnstile"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { textoValidade } from "@/lib/auth-email-constantes"
import { validarCpf } from "@/lib/cpf"
import { mascaraCpf } from "@/lib/mascaras"

import { descritoPor, renovarTurnstile } from "../campos-entrada"
import {
  confirmarCodigoFiliado,
  confirmarCodigoTrabalhador,
  enviarCodigoFiliado,
  enviarCodigoTrabalhador,
} from "./actions"

type Estado = { erro?: string; ok?: string }
type Aba = "trabalhador" | "filiado"

/** Espera para reenviar: a cadência de lib/codigo-acesso.ts (1 código por minuto). */
const ESPERA_REENVIO_S = 60

/**
 * Entrada da Oposição para quem não está logado: o trabalhador (nome, CPF e
 * e-mail) ou o filiado (CPF → e-mail do cadastro), os dois por código no
 * e-mail. As abas são o `Tabs` do sistema (A180): a escolhida é anunciada
 * pelo leitor de tela e trocada pelas setas, e não só pela cor. Os dois
 * formulários ficam montados (`forceMount`, o inativo só escondido), como na
 * entrada do portal: o Turnstile de cada um é desenhado no carregamento e o
 * código já pedido não se perde ao olhar a outra aba.
 */
export function AcessoNaoFiliado() {
  const [aba, setAba] = useState<Aba>("trabalhador")

  return (
    <Tabs value={aba} onValueChange={(v) => setAba(v === "filiado" ? "filiado" : "trabalhador")}>
      {/* 44 px no toque (DESIGN.md), como as abas da entrada do portal. */}
      <TabsList
        aria-label="Como você quer se identificar"
        className="w-full group-data-horizontal/tabs:h-10 pointer-coarse:group-data-horizontal/tabs:h-11"
      >
        <TabsTrigger value="trabalhador" className="flex-1">
          Sou trabalhador
        </TabsTrigger>
        <TabsTrigger value="filiado" className="flex-1">
          Sou filiado
        </TabsTrigger>
      </TabsList>
      <TabsContent value="trabalhador" forceMount className="pt-2 data-[state=inactive]:hidden">
        <FormTrabalhador />
      </TabsContent>
      <TabsContent value="filiado" forceMount className="pt-2 data-[state=inactive]:hidden">
        <FormFiliado />
      </TabsContent>
    </Tabs>
  )
}

function Mensagens({ estado, id }: { estado: Estado; id?: string }) {
  if (estado.erro) {
    return (
      <Alert id={id} variant="destructive">
        <AlertDescription>{estado.erro}</AlertDescription>
      </Alert>
    )
  }
  return null
}

/**
 * CPF com máscara e conferência na própria tela (A168): o CPF que não fecha
 * aparece ao completar os 11 números ou ao sair do campo, sem esperar o
 * Turnstile e a volta ao servidor. O valor vai mascarado; as actions limpam.
 */
function CampoCpf({
  id,
  rotulo,
  valor,
  aoMudar,
  aoSair,
  erro,
  dica,
}: {
  id: string
  rotulo: string
  valor: string
  aoMudar: (v: string) => void
  aoSair: () => void
  erro: string | null
  dica?: string
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{rotulo}</Label>
      <Input
        id={id}
        name="cpf"
        inputMode="numeric"
        autoComplete="off"
        placeholder="000.000.000-00"
        required
        value={valor}
        onChange={(e) => aoMudar(mascaraCpf(e.target.value))}
        // Campo vazio não vira erro só de passar por ele: o `required` cuida.
        onBlur={() => {
          if (valor) aoSair()
        }}
        aria-invalid={erro ? true : undefined}
        aria-describedby={descritoPor(erro && `${id}-erro`, dica && `${id}-dica`)}
      />
      {erro && (
        <p id={`${id}-erro`} className="text-destructive text-xs">
          {erro}
        </p>
      )}
      {dica && (
        <p id={`${id}-dica`} className="text-muted-foreground text-xs">
          {dica}
        </p>
      )}
    </div>
  )
}

/** Mensagem da conferência local do CPF (null = sem problema ou incompleto). */
function erroDoCpf(cpf: string, completo: boolean): string | null {
  const digitos = cpf.replace(/\D/g, "")
  if (!completo && digitos.length < 11) return null
  if (digitos.length < 11) return "O CPF tem 11 números."
  return validarCpf(digitos) ? null : "Confira o CPF: estes números não formam um CPF válido."
}

/**
 * Passo 2: o código. Abre com o foco no campo (no celular, o teclado sobe e
 * a tela rola até ele), diz para onde o código foi, quanto tempo vale e o
 * que fazer se não chegar (A168). O tamanho do código não é prometido: hoje
 * o Supabase manda 8 dígitos, e as actions aceitam de 6 a 10.
 */
function PassoCodigo({
  idPrefixo,
  aviso,
  confirmar,
  ocultos,
}: {
  idPrefixo: string
  aviso: string | undefined
  confirmar: (prev: Estado, fd: FormData) => Promise<Estado>
  ocultos: Record<string, string>
}) {
  // Cada pedido aceito monta um passo novo (key): o erro do código anterior
  // não vale para o que acabou de ser pedido.
  const [estado, acao, pendente] = useActionState(confirmar, {})
  const [codigo, setCodigo] = useState("")
  const campo = useRef<HTMLInputElement>(null)

  // Código recusado: o foco volta ao campo, com os dígitos selecionados.
  useEffect(() => {
    if (!estado.erro) return
    campo.current?.focus()
    campo.current?.select()
  }, [estado])

  const idCampo = `${idPrefixo}-token`
  return (
    <form action={acao} className="grid gap-3 border-t pt-4">
      {Object.entries(ocultos).map(([nome, valor]) => (
        <input key={nome} type="hidden" name={nome} value={valor} />
      ))}
      {aviso && (
        <Alert variant="info">
          <Mail />
          <AlertDescription>{aviso}</AlertDescription>
        </Alert>
      )}
      <Mensagens id={`${idCampo}-erro`} estado={estado} />
      <div className="grid gap-1.5">
        <Label htmlFor={idCampo}>Código recebido por e-mail</Label>
        <Input
          ref={campo}
          id={idCampo}
          name="token"
          inputMode="numeric"
          autoComplete="one-time-code"
          minLength={6}
          maxLength={10}
          required
          autoFocus
          value={codigo}
          onChange={(e) => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 10))}
          aria-invalid={estado.erro ? true : undefined}
          aria-describedby={descritoPor(estado.erro && `${idCampo}-erro`, `${idCampo}-dica`)}
          className="text-center text-lg tracking-[0.4em]"
        />
        <p id={`${idCampo}-dica`} className="text-muted-foreground text-xs">
          O código vale por {textoValidade()} e serve uma vez só.
        </p>
      </div>
      <Button type="submit" disabled={pendente}>
        {pendente ? <Loader2 className="animate-spin" /> : <KeyRound />}
        Entrar
      </Button>
      <div className="bg-muted/50 grid gap-1 rounded-md p-3 text-xs">
        <p className="font-medium">Não chegou em 1 ou 2 minutos?</p>
        <ul className="text-muted-foreground list-disc pl-4">
          <li>
            Procure no <strong>Spam</strong> ou no <strong>Lixo eletrônico</strong>;
            no Gmail, também em <strong>Promoções</strong> e <strong>Atualizações</strong>.
          </li>
          <li>O assunto é “Confluir | Seu código de acesso”.</li>
          <li>
            Dá para pedir outro no botão <strong>Reenviar código</strong>, uma vez
            por minuto. Vale sempre o do e-mail mais recente.
          </li>
        </ul>
      </div>
    </form>
  )
}

/** O pedido do código: Turnstile renovado a cada envio e espera do reenvio. */
function usePedidoCodigo(
  form: React.RefObject<HTMLFormElement | null>,
  enviar: (prev: Estado, fd: FormData) => Promise<Estado>,
  aoEnviar: (fd: FormData, r: Estado) => void
) {
  const [espera, setEspera] = useState(0)
  const [estado, acao, pendente] = useActionState(async (prev: Estado, fd: FormData) => {
    const r = await enviar(prev, fd)
    // O token do Turnstile vale um envio só: sem renovar, o "Reenviar
    // código" esbarrava em "não foi possível confirmar que você não é um robô".
    renovarTurnstile(form.current)
    if (r.ok) {
      aoEnviar(fd, r)
      setEspera(ESPERA_REENVIO_S)
    }
    return r
  }, {})

  useEffect(() => {
    if (espera <= 0) return
    const t = window.setTimeout(() => setEspera((s) => s - 1), 1000)
    return () => window.clearTimeout(t)
  }, [espera])

  return { estado, acao, pendente, espera }
}

function BotaoPedido({ enviado, pendente, espera }: { enviado: boolean; pendente: boolean; espera: number }) {
  if (!enviado) {
    return (
      <Button type="submit" disabled={pendente}>
        {pendente ? <Loader2 className="animate-spin" /> : <Mail />}
        Enviar código
      </Button>
    )
  }
  return (
    <Button type="submit" variant="outline" disabled={pendente || espera > 0}>
      {pendente ? <Loader2 className="animate-spin" /> : <RotateCw />}
      {espera > 0 ? `Reenviar código (${espera} s)` : "Reenviar código"}
    </Button>
  )
}

function FormTrabalhador() {
  const [nome, setNome] = useState("")
  const [cpf, setCpf] = useState("")
  const [email, setEmail] = useState("")
  const [cpfTocado, setCpfTocado] = useState(false)
  // O que foi pedido fica guardado: mexer nos campos depois do envio não
  // troca o e-mail para o qual o código foi.
  const [pedido, setPedido] = useState<{ nome: string; cpf: string; email: string; aviso?: string; serie: number } | null>(null)
  const formPedido = useRef<HTMLFormElement>(null)
  const pedidoCodigo = usePedidoCodigo(formPedido, enviarCodigoTrabalhador, (fd, r) =>
    setPedido((p) => ({
      nome: String(fd.get("nome") ?? ""),
      cpf: String(fd.get("cpf") ?? ""),
      email: String(fd.get("email") ?? ""),
      aviso: r.ok,
      serie: (p?.serie ?? 0) + 1,
    }))
  )
  const erroCpf = erroDoCpf(cpf, cpfTocado)

  return (
    <div className="grid gap-4">
      <form
        ref={formPedido}
        action={pedidoCodigo.acao}
        onSubmit={(e) => {
          setCpfTocado(true)
          if (erroDoCpf(cpf, true)) {
            // Barrado aqui: o foco vai ao CPF, que já mostra o porquê.
            e.preventDefault()
            e.currentTarget.querySelector<HTMLInputElement>('input[name="cpf"]')?.focus()
          }
        }}
        className="grid gap-3"
      >
        <div className="grid gap-1.5">
          <Label htmlFor="t-nome">Nome completo</Label>
          <Input
            id="t-nome"
            name="nome"
            autoComplete="name"
            required
            value={nome}
            onChange={(e) => setNome(e.target.value)}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <CampoCpf
            id="t-cpf"
            rotulo="CPF"
            valor={cpf}
            aoMudar={(v) => {
              setCpf(v)
              if (v.replace(/\D/g, "").length === 11) setCpfTocado(true)
            }}
            aoSair={() => setCpfTocado(true)}
            erro={erroCpf}
          />
          <div className="grid gap-1.5">
            <Label htmlFor="t-email">E-mail</Label>
            <Input
              id="t-email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-describedby="t-email-dica"
            />
            <p id="t-email-dica" className="text-muted-foreground text-xs">
              O código de acesso chega neste e-mail.
            </p>
          </div>
        </div>
        <Mensagens estado={pedidoCodigo.estado} />
        <Turnstile acao="codigo_oposicao" />
        <BotaoPedido enviado={Boolean(pedido)} pendente={pedidoCodigo.pendente} espera={pedidoCodigo.espera} />
      </form>

      {pedido && (
        <PassoCodigo
          key={pedido.serie}
          idPrefixo="t"
          aviso={pedido.aviso}
          confirmar={confirmarCodigoTrabalhador}
          ocultos={{ nome: pedido.nome, cpf: pedido.cpf, email: pedido.email }}
        />
      )}
    </div>
  )
}

function FormFiliado() {
  const [cpf, setCpf] = useState("")
  const [cpfTocado, setCpfTocado] = useState(false)
  const [pedido, setPedido] = useState<{ cpf: string; aviso?: string; serie: number } | null>(null)
  const formPedido = useRef<HTMLFormElement>(null)
  const pedidoCodigo = usePedidoCodigo(formPedido, enviarCodigoFiliado, (fd, r) =>
    setPedido((p) => ({ cpf: String(fd.get("cpf") ?? ""), aviso: r.ok, serie: (p?.serie ?? 0) + 1 }))
  )
  const erroCpf = erroDoCpf(cpf, cpfTocado)

  return (
    <div className="grid gap-4">
      <form
        ref={formPedido}
        action={pedidoCodigo.acao}
        onSubmit={(e) => {
          setCpfTocado(true)
          if (erroDoCpf(cpf, true)) {
            // Barrado aqui: o foco vai ao CPF, que já mostra o porquê.
            e.preventDefault()
            e.currentTarget.querySelector<HTMLInputElement>('input[name="cpf"]')?.focus()
          }
        }}
        className="grid gap-3"
      >
        <CampoCpf
          id="f-cpf"
          rotulo="CPF do filiado"
          valor={cpf}
          aoMudar={(v) => {
            setCpf(v)
            if (v.replace(/\D/g, "").length === 11) setCpfTocado(true)
          }}
          aoSair={() => setCpfTocado(true)}
          erro={erroCpf}
          dica="Enviaremos o código para o e-mail do seu cadastro."
        />
        <Mensagens estado={pedidoCodigo.estado} />
        <Turnstile acao="codigo_oposicao" />
        <BotaoPedido enviado={Boolean(pedido)} pendente={pedidoCodigo.pendente} espera={pedidoCodigo.espera} />
      </form>

      {pedido && (
        <PassoCodigo
          key={pedido.serie}
          idPrefixo="f"
          aviso={pedido.aviso}
          confirmar={confirmarCodigoFiliado}
          ocultos={{ cpf: pedido.cpf }}
        />
      )}
    </div>
  )
}
