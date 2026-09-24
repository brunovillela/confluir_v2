"use client"

import { useActionState, useMemo, useState } from "react"
import { Loader2, ShieldCheck } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  GATILHOS_CONDICAO,
  calcularExigencias,
  totalExigencias,
  type RegraExigencia,
} from "@/lib/espacos-constantes"

import {
  confirmarPedidoAction,
  conferirFiliadoAction,
  registrarPedidoAction,
  reenviarCodigoAction,
} from "./actions"

type Publico = "qualquer" | "interno" | "filiados"

/**
 * O formulário do pedido, em até três passos:
 *   1. identificação (só quando o espaço é de filiados);
 *   2. o pedido em si, com as exigências calculadas ao vivo;
 *   3. o código que chega por e-mail — sem ele o pedido não vai para a fila.
 */
export function PedidoForm({
  espacoId,
  espacoNome,
  publico,
  capacidade,
  regras,
  temSessaoInterna,
}: {
  espacoId: string
  espacoNome: string
  publico: Publico
  capacidade: number | null
  regras: RegraExigencia[]
  temSessaoInterna: boolean
}) {
  const [identificado, setIdentificado] = useState(publico !== "filiados")
  const [prefill, setPrefill] = useState<{ nome?: string; email?: string }>({})

  const [estado, enviar, enviando] = useActionState(registrarPedidoAction, {})
  const [confirmacao, confirmar, confirmando] = useActionState(
    confirmarPedidoAction,
    {}
  )
  const [reenvio, reenviar, reenviando] = useActionState(reenviarCodigoAction, {})

  // Respostas que mudam as exigências — calculadas na hora, sem ida ao servidor.
  const [publicoEstimado, setPublicoEstimado] = useState<string>("")
  const [condicoes, setCondicoes] = useState<Record<string, boolean>>({})

  const exigencias = useMemo(() => {
    const lista = calcularExigencias(regras, {
      publicoEstimado: publicoEstimado ? Number(publicoEstimado) : null,
      infantil: condicoes.infantil ?? false,
      idoso: condicoes.idoso ?? false,
      mobilidade: condicoes.mobilidade ?? false,
      bebida: condicoes.bebida ?? false,
      estresse: condicoes.estresse ?? false,
    })
    return { lista, ...totalExigencias(lista) }
  }, [regras, publicoEstimado, condicoes])

  if (publico === "interno" && !temSessaoInterna) {
    return (
      <Alert variant="warning">
        <AlertDescription>
          Este espaço é cedido apenas ao <strong>público interno</strong>{" "}
          (funcionários e diretores). Entre no sistema com sua conta para
          solicitar.
        </AlertDescription>
      </Alert>
    )
  }

  // Passo 3 — o pedido existe e espera o código.
  const token = confirmacao.token ?? reenvio.token ?? estado.token
  if (confirmacao.numero) {
    return (
      <Alert variant="success">
        <AlertDescription>
          <strong>Pedido nº {confirmacao.numero} registrado.</strong> Nossa
          equipe vai analisar e entrar em contato pelo e-mail informado. Guarde
          este número.
        </AlertDescription>
      </Alert>
    )
  }
  if (token) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Confirme seu e-mail</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <p className="text-muted-foreground text-sm">
            Enviamos um código de 6 dígitos para o e-mail informado. Enquanto
            ele não for digitado, o pedido não chega à nossa equipe.
          </p>
          {confirmacao.erro && (
            <Alert variant="destructive">
              <AlertDescription>{confirmacao.erro}</AlertDescription>
            </Alert>
          )}
          {reenvio.ok && (
            <Alert variant="success">
              <AlertDescription>{reenvio.ok}</AlertDescription>
            </Alert>
          )}
          <form action={confirmar} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="token" value={token} />
            <div className="grid gap-1.5">
              <Label htmlFor="codigo">Código</Label>
              <Input
                id="codigo"
                name="codigo"
                inputMode="numeric"
                maxLength={6}
                required
                className="w-32 text-center text-lg tracking-widest"
              />
            </div>
            <Button type="submit" disabled={confirmando}>
              {confirmando && <Loader2 className="animate-spin" />}
              Confirmar
            </Button>
          </form>
          <form action={reenviar}>
            <input type="hidden" name="token" value={token} />
            <Button type="submit" variant="ghost" size="sm" disabled={reenviando}>
              {reenviando && <Loader2 className="animate-spin" />}
              Não recebi o código
            </Button>
          </form>
        </CardContent>
      </Card>
    )
  }

  // Passo 1 — identificação do filiado.
  if (!identificado) {
    return (
      <IdentificacaoFiliado
        aoEncontrar={(nome, email) => {
          setPrefill({ nome, email })
          setIdentificado(true)
        }}
      />
    )
  }

  // Passo 2 — o pedido.
  return (
    <form action={enviar} className="grid gap-4">
      <input type="hidden" name="espaco_id" value={espacoId} />
      <input type="hidden" name="publico_alvo" value={publico} />
      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Quem está pedindo</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Campo id="nome" rotulo="Nome completo *" obrigatorio valor={prefill.nome} />
          <Campo id="email" rotulo="E-mail *" tipo="email" obrigatorio valor={prefill.email} />
          <Campo id="telefone" rotulo="Telefone" />
          <Campo id="entidade" rotulo="Entidade ou empresa que representa" />
          <Campo id="representante_nome" rotulo="Responsável no dia do evento" />
          <Campo id="representante_telefone" rotulo="Telefone do responsável" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Quando</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Campo id="inicio" rotulo="Início *" tipo="datetime-local" obrigatorio />
          <Campo id="termino" rotulo="Término *" tipo="datetime-local" obrigatorio />
          <Campo
            id="montagem_inicio"
            rotulo="Liberação para montagem"
            tipo="datetime-local"
            ajuda="Quando você precisa entrar para montar."
          />
          <Campo
            id="desmontagem_termino"
            rotulo="Fim da desmontagem"
            tipo="datetime-local"
            ajuda="Até quando vai ocupar o espaço para desmontar."
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">O evento</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="finalidade">Para que o espaço será usado? *</Label>
            <Textarea id="finalidade" name="finalidade" rows={3} required />
          </div>
          <div className="grid gap-1.5 sm:max-w-xs">
            <Label htmlFor="publico_estimado">Público estimado</Label>
            <Input
              id="publico_estimado"
              name="publico_estimado"
              type="number"
              min={1}
              max={capacidade ?? undefined}
              value={publicoEstimado}
              onChange={(e) => setPublicoEstimado(e.target.value)}
            />
            {capacidade && (
              <p className="text-muted-foreground text-xs">
                A lotação de {espacoNome} é de {capacidade} pessoas.
              </p>
            )}
          </div>

          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">
              Sobre o público e o evento
            </legend>
            {GATILHOS_CONDICAO.map((g) => (
              <label
                key={g.chave}
                className="hover:bg-muted/40 flex items-start gap-2 rounded-md border p-2 text-sm"
              >
                <input
                  type="checkbox"
                  name={`tem_${g.chave}`}
                  className="mt-1"
                  checked={condicoes[g.chave] ?? false}
                  onChange={(e) =>
                    setCondicoes((c) => ({ ...c, [g.chave]: e.target.checked }))
                  }
                />
                <span>{g.pergunta}</span>
              </label>
            ))}
          </fieldset>

          <div className="grid gap-1.5">
            <Label htmlFor="observacoes">Outras informações</Label>
            <Textarea id="observacoes" name="observacoes" rows={2} />
          </div>
        </CardContent>
      </Card>

      {exigencias.lista.length > 0 && (
        <Card className="border-warning/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="size-4" />
              O que o seu evento vai exigir
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <p className="text-muted-foreground text-sm">
              Calculado pelas suas respostas. A contratação é por sua conta, e
              confirmamos a cessão com esses itens no termo.
            </p>
            <ul className="grid gap-1.5">
              {exigencias.lista.map((e, i) => (
                <li key={i} className="rounded-md border p-2 text-sm">
                  <span className="font-medium">{e.motivo}</span>
                  <span className="text-muted-foreground">
                    {" — "}
                    {[
                      e.bombeiros > 0 && bombeiros(e.bombeiros),
                      e.segurancas > 0 && segurancas(e.segurancas),
                      e.observacao,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-sm font-medium">
              Total: {bombeiros(exigencias.bombeiros)} e{" "}
              {segurancas(exigencias.segurancas)}.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end">
        <Button type="submit" disabled={enviando}>
          {enviando && <Loader2 className="animate-spin" />}
          Enviar pedido
        </Button>
      </div>
    </form>
  )
}

/** O plural é irregular: um bombeiro CIVIL, dois bombeiros CIVIS. */
const bombeiros = (n: number) =>
  n === 1 ? "1 bombeiro civil" : `${n} bombeiros civis`
const segurancas = (n: number) =>
  n === 1 ? "1 segurança" : `${n} seguranças`

function IdentificacaoFiliado({
  aoEncontrar,
}: {
  aoEncontrar: (nome?: string, email?: string) => void
}) {
  const [estado, acao, pendente] = useActionState(conferirFiliadoAction, {})
  if (estado.ok === "encontrado") {
    // Passa adiante assim que o CPF confere.
    queueMicrotask(() => aoEncontrar(estado.nome, estado.email))
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Identifique-se</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        <p className="text-muted-foreground text-sm">
          Este espaço é cedido apenas a filiados. Informe seu CPF para
          continuar.
        </p>
        {estado.erro && (
          <Alert variant="destructive">
            <AlertDescription>{estado.erro}</AlertDescription>
          </Alert>
        )}
        <form action={acao} className="flex flex-wrap items-end gap-2">
          <div className="grid gap-1.5">
            <Label htmlFor="cpf">CPF</Label>
            <Input id="cpf" name="cpf" inputMode="numeric" required className="w-48" />
          </div>
          <Button type="submit" disabled={pendente}>
            {pendente && <Loader2 className="animate-spin" />}
            Continuar
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

function Campo({
  id,
  rotulo,
  tipo = "text",
  obrigatorio,
  valor,
  ajuda,
}: {
  id: string
  rotulo: string
  tipo?: string
  obrigatorio?: boolean
  valor?: string
  ajuda?: string
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{rotulo}</Label>
      <Input
        id={id}
        name={id}
        type={tipo}
        required={obrigatorio}
        defaultValue={valor}
      />
      {ajuda && <p className="text-muted-foreground text-xs">{ajuda}</p>}
    </div>
  )
}
