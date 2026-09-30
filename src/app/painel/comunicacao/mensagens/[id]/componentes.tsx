"use client"

import { startTransition, useActionState, useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { CalendarClock, Loader2, Save, Send, TestTube2, Users } from "lucide-react"

import { EditorOficio } from "@/components/editor-oficio"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  CONDICOES_MALA_DIRETA,
  VARIAVEIS_MENSAGEM,
  type FiltrosMalaDireta,
} from "@/lib/comunicacao-mensagens-constantes"
import { CONDICOES_NA_FONTE, FORMAS_RECEBIMENTO, ROTULOS_FORMA_RECEBIMENTO } from "@/lib/filiacao"

import { enviarLoteMalaDiretaAction, malaDiretaAction, type EstadoMalaDireta } from "../actions"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

function Selecao({
  nome,
  rotulo,
  valor,
  opcoes,
}: {
  nome: string
  rotulo: string
  valor: string | undefined
  opcoes: { valor: string; rotulo: string }[]
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={`f-${nome}`}>{rotulo}</Label>
      <select id={`f-${nome}`} name={nome} defaultValue={valor ?? "todas"} className={SELECT}>
        <option value="todas">Todas</option>
        {opcoes.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.rotulo}
          </option>
        ))}
      </select>
    </div>
  )
}

const n = (v: number) => v.toLocaleString("pt-BR")

/** O rascunho: texto do e-mail e do WhatsApp, o recorte e os botões de envio. */
export function MalaDiretaForm({
  mensagem,
  fontes,
  ufs,
  amanha,
}: {
  mensagem: {
    id: string
    titulo: string
    assunto: string
    corpo: string
    textoWhatsapp: string
    filtros: FiltrosMalaDireta
  }
  fontes: { id: string; nome: string }[]
  ufs: string[]
  amanha: string
}) {
  const router = useRouter()
  const [estado, agir, agindo] = useActionState<EstadoMalaDireta, FormData>(malaDiretaAction, {})
  const [acao, setAcao] = useState<string | null>(null)
  const [confirmar, setConfirmar] = useState(false)
  // Mexer no recorte invalida a última conferência.
  const [invalidado, setInvalidado] = useState<EstadoMalaDireta["resumo"] | null>(null)
  const resumo = estado.resumo && estado.resumo !== invalidado ? estado.resumo : undefined
  const f = mensagem.filtros

  useEffect(() => {
    if (estado.enviar) {
      router.replace(`/painel/comunicacao/mensagens/${mensagem.id}?enviar=1`)
      router.refresh()
    } else if (estado.ok === "Mensagem agendada.") {
      router.refresh()
    }
  }, [estado, mensagem.id, router])

  const ocupado = (a: string) => agindo && acao === a

  return (
    <form
      // Pelo onSubmit (React 19 limpa o form depois de uma action); o botão
      // clicado decide o que fazer depois de gravar o rascunho.
      onSubmit={(e) => {
        e.preventDefault()
        const dados = new FormData(e.currentTarget)
        const botao = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null
        const qual = botao?.value ?? "salvar"
        dados.set("acao", qual)
        setAcao(qual)
        if (qual !== "enviar") setConfirmar(false)
        startTransition(() => agir(dados))
      }}
      onChange={(e) => {
        // Mexeu no recorte: a conferência anterior deixa de valer.
        if ((e.target as HTMLElement).closest("[data-recorte]")) setInvalidado(estado.resumo ?? null)
      }}
      className="grid gap-4"
    >
      <input type="hidden" name="id" value={mensagem.id} />

      {estado.erro && (
        <Alert variant="destructive">
          <AlertDescription>{estado.erro}</AlertDescription>
        </Alert>
      )}
      {estado.ok && (
        <Alert variant="success">
          <AlertDescription>{estado.ok}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Mensagem</CardTitle>
          <CardDescription>
            O e-mail sai com a identidade da entidade e, no fim, o link para a pessoa se
            descadastrar.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="titulo">Nome interno</Label>
              <Input id="titulo" name="titulo" defaultValue={mensagem.titulo} placeholder="Ex.: Convite para a assembleia de outubro" />
              <p className="text-muted-foreground text-xs">Só a equipe vê — é como a mensagem aparece na lista.</p>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="assunto">Assunto do e-mail</Label>
              <Input id="assunto" name="assunto" defaultValue={mensagem.assunto} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label id="rotulo-corpo" htmlFor="corpo">
              Texto do e-mail
            </Label>
            <EditorOficio id="corpo" name="corpo" rotuloId="rotulo-corpo" valorInicial={mensagem.corpo} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="texto_whatsapp">Texto do WhatsApp (opcional)</Label>
            <Textarea id="texto_whatsapp" name="texto_whatsapp" rows={4} defaultValue={mensagem.textoWhatsapp} />
            <p className="text-muted-foreground text-xs">
              Com texto aqui, a lista de destinatários ganha o botão do WhatsApp ao lado de cada nome.
            </p>
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
        </CardContent>
      </Card>

      <Card data-recorte>
        <CardHeader>
          <CardTitle className="text-base">Quem recebe</CardTitle>
          <CardDescription>
            Os mesmos filtros dos relatórios de filiados. Uma mensagem por pessoa, mesmo com dois
            cadastros; quem pediu para não receber comunicados fica de fora.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <fieldset className="grid gap-2">
            <legend className="mb-1 text-sm font-medium">Condição sindical</legend>
            <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
              {CONDICOES_MALA_DIRETA.map((c) => (
                <label key={c.valor} className="flex cursor-pointer items-center gap-2 text-sm">
                  <input type="checkbox" name="cond" value={c.valor} defaultChecked={f.condicoes.includes(c.valor)} className="accent-primary" />
                  {c.rotulo}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Selecao nome="fonte" rotulo="Fonte pagadora" valor={f.fonte} opcoes={fontes.map((x) => ({ valor: x.id, rotulo: x.nome }))} />
            <Selecao
              nome="condicaoFonte"
              rotulo="Condição na fonte"
              valor={f.condicaoFonte}
              opcoes={CONDICOES_NA_FONTE.map((c) => ({ valor: c, rotulo: c }))}
            />
            <Selecao
              nome="formaRecebimento"
              rotulo="Forma de recebimento"
              valor={f.formaRecebimento}
              opcoes={[
                ...FORMAS_RECEBIMENTO.map((x) => ({ valor: x, rotulo: ROTULOS_FORMA_RECEBIMENTO[x] })),
                { valor: "nao_informado", rotulo: "Não informada" },
              ]}
            />
            <Selecao
              nome="inadimplente"
              rotulo="Inadimplência"
              valor={f.inadimplente}
              opcoes={[
                { valor: "sim", rotulo: "Só inadimplentes" },
                { valor: "nao", rotulo: "Sem inadimplentes" },
              ]}
            />
            <Selecao nome="uf" rotulo="UF" valor={f.uf} opcoes={ufs.map((u) => ({ valor: u, rotulo: u }))} />
            <div className="grid gap-1.5">
              <Label htmlFor="f-cidade">Cidade contém</Label>
              <Input id="f-cidade" name="cidade" defaultValue={f.cidade ?? ""} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="f-lotacao">Lotação contém</Label>
              <Input id="f-lotacao" name="lotacao" defaultValue={f.lotacao ?? ""} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="grid gap-1.5">
                <Label htmlFor="f-idadeMin">Idade de</Label>
                <Input id="f-idadeMin" name="idadeMin" type="number" min={0} max={120} defaultValue={f.idadeMin ?? ""} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="f-idadeMax">até</Label>
                <Input id="f-idadeMax" name="idadeMax" type="number" min={0} max={120} defaultValue={f.idadeMax ?? ""} />
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" value="conferir" variant="outline" disabled={agindo}>
              {ocupado("conferir") ? <Loader2 className="animate-spin" /> : <Users />}
              Conferir destinatários
            </Button>
            {!resumo && <span className="text-muted-foreground text-xs">Grava o rascunho e conta quem recebe.</span>}
          </div>

          {resumo && (
            <div className="bg-muted/40 grid gap-2 rounded-lg border p-4 text-sm">
              <p className="font-medium tabular-nums">
                {resumo.pessoas === 0
                  ? "Ninguém está neste recorte."
                  : `${n(resumo.pessoas)} pessoa${resumo.pessoas === 1 ? "" : "s"} no recorte · ${n(resumo.comEmail - resumo.emailsRepetidos)} e-mail(s) a enviar`}
              </p>
              {resumo.pessoas > 0 && (
                <p className="text-muted-foreground text-xs tabular-nums">
                  {[
                    `${n(resumo.semEmail)} sem e-mail`,
                    resumo.descadastrados ? `${n(resumo.descadastrados)} descadastrado(s)` : null,
                    resumo.emailsRepetidos ? `${n(resumo.emailsRepetidos)} e-mail(s) repetido(s), enviados uma vez` : null,
                    `${n(resumo.comWhatsapp)} com celular para o WhatsApp`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}
              <p className="text-muted-foreground text-xs">{resumo.recorte}</p>
              {resumo.amostra.length > 0 && (
                <p className="text-muted-foreground text-xs">
                  Ex.: {resumo.amostra.join(", ")}
                  {resumo.pessoas > resumo.amostra.length ? "…" : ""}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Envio</CardTitle>
          <CardDescription>
            Mande um teste para você antes. Agendada, a mensagem sai às 9h do dia escolhido, com a
            lista de destinatários fechada agora.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" value="salvar" variant="outline" disabled={agindo}>
              {ocupado("salvar") ? <Loader2 className="animate-spin" /> : <Save />}
              Salvar rascunho
            </Button>
            <Button type="submit" value="teste" variant="outline" disabled={agindo}>
              {ocupado("teste") ? <Loader2 className="animate-spin" /> : <TestTube2 />}
              Enviar teste para mim
            </Button>
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <div className="grid gap-1.5">
              <Label htmlFor="agendar_para">Agendar para</Label>
              <Input id="agendar_para" name="agendar_para" type="date" min={amanha} defaultValue={amanha} className="w-44" />
            </div>
            <Button type="submit" value="agendar" variant="outline" disabled={agindo}>
              {ocupado("agendar") ? <Loader2 className="animate-spin" /> : <CalendarClock />}
              Agendar
            </Button>
            {!confirmar ? (
              <Button type="button" onClick={() => setConfirmar(true)} disabled={agindo}>
                <Send />
                Enviar agora
              </Button>
            ) : null}
          </div>

          {confirmar && (
            <div className="border-warning/40 bg-warning/5 grid gap-3 rounded-lg border p-4 text-sm">
              <p>
                Enviar agora para{" "}
                {resumo ? <strong>{n(resumo.comEmail - resumo.emailsRepetidos)} e-mail(s)</strong> : "todos do recorte"}? Depois
                de começar, dá para interromper, mas não desfazer o que já saiu.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" value="enviar" disabled={agindo}>
                  {ocupado("enviar") ? <Loader2 className="animate-spin" /> : <Send />}
                  Confirmar envio
                </Button>
                <Button type="button" variant="ghost" onClick={() => setConfirmar(false)} disabled={agindo}>
                  Voltar
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </form>
  )
}

/** Manda os e-mails liberados em lotes, com o andamento na tela. */
export function EnviarMalaDireta({ id, pendentes, autoIniciar }: { id: string; pendentes: number; autoIniciar: boolean }) {
  const router = useRouter()
  const [andamento, setAndamento] = useState<{ enviados: number; falhas: number; restantes: number } | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const iniciou = useRef(false)

  async function enviar() {
    setEnviando(true)
    setErro(null)
    let enviados = 0
    let falhas = 0
    try {
      for (let volta = 0; volta < 1000; volta++) {
        const r = await enviarLoteMalaDiretaAction(id)
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
      setErro("A conexão caiu no meio do envio. Clique em Continuar: o envio segue de onde parou.")
    } finally {
      setEnviando(false)
      router.refresh()
    }
  }

  useEffect(() => {
    if (autoIniciar && pendentes > 0 && !iniciou.current) {
      iniciou.current = true
      router.replace(`/painel/comunicacao/mensagens/${id}`)
      void enviar()
    }
    // Só na montagem: o envio automático logo depois de liberar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="grid justify-items-start gap-2">
      <Button type="button" onClick={enviar} disabled={enviando || pendentes === 0}>
        {enviando ? <Loader2 className="animate-spin" /> : <Send />}
        {enviando ? "Enviando…" : pendentes > 0 ? `Continuar: ${n(pendentes)} e-mail(s) na fila` : "Nenhum e-mail na fila"}
      </Button>
      {andamento && (
        <p className="text-muted-foreground text-xs tabular-nums">
          {n(andamento.enviados)} enviado(s){andamento.falhas ? ` · ${n(andamento.falhas)} falha(s)` : ""}
          {andamento.restantes ? ` · faltam ${n(andamento.restantes)}` : " · concluído"}
        </p>
      )}
      {enviando && <p className="text-muted-foreground text-xs">Mantenha esta página aberta até o fim.</p>}
      {erro && <p className="text-destructive text-xs">{erro}</p>}
    </div>
  )
}
