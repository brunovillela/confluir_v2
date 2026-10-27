"use client"

import { useActionState, useRef, useState, useSyncExternalStore } from "react"
import { Loader2 } from "lucide-react"

import { Turnstile } from "@/components/auth/turnstile"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { opcoesPadrao } from "@/lib/portal-partes-constantes"

import { loginFiliadoSenha } from "./actions"
import {
  CampoCpfPortal,
  descritoPor,
  Mensagens,
  renovarTurnstile,
  type EstadoEntrada,
} from "./campos-entrada"
import { EntradaPorCodigo } from "./entrada-por-codigo"
import { useEnvioFormulario } from "@/hooks/use-envio-formulario"

type Aba = "codigo" | "senha"

/** Última aba escolhida neste aparelho (A158). */
const CHAVE_ABA = "confluir:portal-entrada:aba"

function lerAbaLembrada(): Aba | null {
  try {
    const aba = window.localStorage.getItem(CHAVE_ABA)
    return aba === "codigo" || aba === "senha" ? aba : null
  } catch {
    // Sem storage (aba anônima, bloqueio do navegador): começa no código.
    return null
  }
}

function lembrarAba(aba: Aba) {
  try {
    window.localStorage.setItem(CHAVE_ABA, aba)
  } catch {
    // Sem storage: só não lembra.
  }
}

/** O localStorage não avisa mudanças desta própria aba; lê-se a cada render. */
const semAssinatura = () => () => {}

/** A orientação de antes, padrão da opção "orientacao_entrada". */
const ORIENTACAO_PADRAO = opcoesPadrao("portal").orientacao_entrada

/**
 * Entrada do portal: código por e-mail (padrão) ou CPF e senha.
 *
 * `next`: caminho do portal para onde voltar depois de entrar (A30), já
 * validado pela página. Vai em todos os formulários; as actions validam de
 * novo.
 *
 * As duas abas ficam montadas (`forceMount`, a inativa só escondida): o
 * Turnstile de cada formulário é desenhado no carregamento da página, e o
 * passo do código não se perde ao olhar a outra aba.
 */
export function PortalLoginForm({
  next = null,
  preferirCodigo = false,
  orientacao = ORIENTACAO_PADRAO,
}: {
  next?: string | null
  /** Link do e-mail recusado: a tela manda pedir outro código, então abre nessa aba. */
  preferirCodigo?: boolean
  /**
   * Rodapé para quem não consegue entrar — o texto da entidade (Filiados ›
   * Área do associado › Portal inteiro), que pode dar o telefone ou o horário
   * da secretaria.
   */
  orientacao?: string
}) {
  // Um CPF só para as duas abas (A158).
  const [cpf, setCpf] = useState("")
  // A aba lembrada só existe no navegador: o servidor (e a hidratação) usam
  // "codigo", e a lembrada entra logo depois, sem divergir do HTML.
  const lembrada = useSyncExternalStore(semAssinatura, lerAbaLembrada, () => null)
  const [escolhida, setEscolhida] = useState<Aba | null>(preferirCodigo ? "codigo" : null)
  const aba: Aba = escolhida ?? lembrada ?? "codigo"
  const [criarSenha, setCriarSenha] = useState(false)

  const formSenha = useRef<HTMLFormElement>(null)
  const [estadoSenha, actionSenha, pendenteSenha] = useActionState(
    async (prev: EstadoEntrada, fd: FormData) => {
      const r = await loginFiliadoSenha(prev, fd)
      renovarTurnstile(formSenha.current)
      return r
    },
    {}
  )
  const envio = useEnvioFormulario(actionSenha, estadoSenha, {
    ref: formSenha,
  })

  const trocarAba = (valor: string) => {
    const nova: Aba = valor === "senha" ? "senha" : "codigo"
    setEscolhida(nova)
    setCriarSenha(false)
    lembrarAba(nova)
  }

  // "Esqueci minha senha / criar senha" (A66): o caminho é o código por
  // e-mail, e depois a tela de senha que já existe. Não vira a aba lembrada.
  const irParaCriarSenha = () => {
    setEscolhida("codigo")
    setCriarSenha(true)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Portal do Associado</CardTitle>
        <CardDescription>
          Entre com o seu CPF: por um código enviado ao seu e-mail ou com a sua
          senha.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <Tabs value={aba} onValueChange={trocarAba}>
          {/* 44 px no toque (DESIGN.md): as abas são o primeiro alvo da tela. */}
          <TabsList className="w-full group-data-horizontal/tabs:h-10 pointer-coarse:group-data-horizontal/tabs:h-11">
            <TabsTrigger value="codigo" className="flex-1">
              Código por e-mail
            </TabsTrigger>
            <TabsTrigger value="senha" className="flex-1">
              CPF e senha
            </TabsTrigger>
          </TabsList>

          <TabsContent value="codigo" forceMount className="data-[state=inactive]:hidden">
            <EntradaPorCodigo
              cpf={cpf}
              aoMudarCpf={setCpf}
              next={next}
              criarSenha={criarSenha}
              aoDesistirDeCriarSenha={() => setCriarSenha(false)}
            />
          </TabsContent>

          <TabsContent value="senha" forceMount className="data-[state=inactive]:hidden">
            <form action={actionSenha} {...envio} className="grid gap-4 pt-2">
              {next && <input type="hidden" name="next" value={next} />}
              <Mensagens id="erro-senha" erro={estadoSenha.erro} ok={estadoSenha.ok} />
              <div className="grid gap-2">
                <Label htmlFor="cpf-senha">CPF</Label>
                <CampoCpfPortal
                  id="cpf-senha"
                  valor={cpf}
                  aoMudar={setCpf}
                  required
                  aria-describedby={descritoPor(estadoSenha.erro && "erro-senha")}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="senha">Senha</Label>
                <Input
                  id="senha"
                  name="senha"
                  type="password"
                  autoComplete="current-password"
                  required
                  aria-describedby={descritoPor(estadoSenha.erro && "erro-senha")}
                />
              </div>
              <Turnstile acao="portal_senha" />
              <Button type="submit" disabled={pendenteSenha}>
                {pendenteSenha && <Loader2 className="animate-spin" />}
                Entrar
              </Button>
              {/* A resposta é a mesma para quem tem e quem não tem senha (ou
                  cadastro): a saída fica sempre à vista. */}
              <div className="grid gap-0.5">
                <p className="text-muted-foreground text-xs">
                  Esqueceu a senha ou ainda não criou uma? Entre com o código por
                  e-mail e, em seguida, crie a senha.
                </p>
                <Button
                  type="button"
                  variant="link"
                  className="justify-self-start px-0"
                  onClick={irParaCriarSenha}
                >
                  Esqueci minha senha / criar senha
                </Button>
              </div>
            </form>
          </TabsContent>
        </Tabs>

        {/* Orientação fixa, para todo mundo: as actions não dizem "seu
            cadastro não possui e-mail" (isso confirmava o CPF). */}
        <p className="text-muted-foreground text-xs whitespace-pre-line">
          {orientacao}
        </p>
      </CardContent>
    </Card>
  )
}
