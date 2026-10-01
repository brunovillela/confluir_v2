"use client"

import { startTransition, useActionState, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, MessageCircle, Save, Send, Sparkles, TestTube2, Undo2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  aplicarVariaveis,
  descreverCriterios,
  HORAS_DO_DIA,
  normalizarCriterios,
  ROTULO_ANTECEDENCIA,
  rotuloHora,
  type Antecedencia,
  VARIAVEIS_MENSAGEM,
  type CriteriosAniversario,
} from "@/lib/comunicacao-mensagens-constantes"
import { CONDICOES_NA_FONTE } from "@/lib/filiacao"

import {
  enviarLoteDiaAction,
  enviarTesteAction,
  marcarWhatsappAction,
  salvarEnvioAction,
  salvarModeloAction,
  salvarPadraoAction,
} from "./actions"
import { melhorarParabensAction } from "./ia-actions"

const SELECT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

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

/** A recorrência: envio automático, hora, dia ou véspera, e o aviso à equipe. */
export function EnvioAutomaticoForm({
  config,
  temAntecedencia,
}: {
  config: {
    ativo: boolean
    horaEnvio: number
    avisoEquipeEmails: string[]
    parabensAntecedencia: Antecedencia
    avisoAntecedencia: Antecedencia
  }
  /** O SQL do "no dia ou na véspera" já rodou. */
  temAntecedencia: boolean
}) {
  const [estado, salvar, salvando] = useActionState(salvarEnvioAction, {})
  const [ativo, setAtivo] = useState(config.ativo)
  const [hora, setHora] = useState(String(config.horaEnvio))

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        const dados = new FormData(e.currentTarget)
        startTransition(() => salvar(dados))
      }}
      className="grid gap-4"
    >
      <Retorno erro={estado.erro} ok={estado.ok} />
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
            Todo dia, na hora escolhida, para os filiados ativos que fazem aniversário (no dia ou na véspera) e
            têm e-mail. Desligado, ninguém recebe sozinho — dá para enviar pela lista do dia.
          </span>
        </span>
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid content-start gap-1.5">
          <Label htmlFor="parabens_antecedencia">Quando o parabéns chega ao filiado</Label>
          <select
            id="parabens_antecedencia"
            name="parabens_antecedencia"
            defaultValue={String(config.parabensAntecedencia)}
            disabled={!temAntecedencia}
            className={SELECT}
          >
            {([0, 1] as const).map((a) => (
              <option key={a} value={a}>
                {ROTULO_ANTECEDENCIA[a]}
              </option>
            ))}
          </select>
          <p className="text-muted-foreground text-xs">
            Na véspera, ajuste o texto (&quot;amanhã é o seu dia&quot;) — a IA faz isso se você pedir.
          </p>
        </div>
        <div className="grid content-start gap-1.5">
          <Label htmlFor="aviso_antecedencia">Quando o aviso chega à equipe</Label>
          <select
            id="aviso_antecedencia"
            name="aviso_antecedencia"
            defaultValue={String(config.avisoAntecedencia)}
            disabled={!temAntecedencia}
            className={SELECT}
          >
            {([0, 1] as const).map((a) => (
              <option key={a} value={a}>
                {ROTULO_ANTECEDENCIA[a]}
              </option>
            ))}
          </select>
          <p className="text-muted-foreground text-xs">Na véspera, a equipe se prepara para mandar os WhatsApps no dia.</p>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-[180px_1fr]">
        <div className="grid content-start gap-1.5">
          <Label htmlFor="hora_envio">Hora do envio</Label>
          <select id="hora_envio" name="hora_envio" value={hora} onChange={(e) => setHora(e.target.value)} className={SELECT}>
            {HORAS_DO_DIA.map((h) => (
              <option key={h} value={h}>
                {rotuloHora(h)}
              </option>
            ))}
          </select>
          <p className="text-muted-foreground text-xs">Hora de Brasília. Os e-mails saem em até 15 minutos.</p>
        </div>
        <div className="grid content-start gap-1.5">
          <Label htmlFor="aviso_equipe_emails">Aviso à equipe (opcional)</Label>
          <Input
            id="aviso_equipe_emails"
            name="aviso_equipe_emails"
            defaultValue={config.avisoEquipeEmails.join(", ")}
            placeholder="comunicacao@entidade.org.br, secretaria@entidade.org.br"
          />
          <p className="text-muted-foreground text-xs">
            Quem recebe, no mesmo horário, a lista dos aniversariantes com o link do WhatsApp de cada um — para
            mandar pelo celular. Funciona mesmo com o e-mail automático desligado. Separe por vírgula.
          </p>
        </div>
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={salvando}>
          {salvando ? <Loader2 className="animate-spin" /> : <Save />}
          Salvar
        </Button>
      </div>
    </form>
  )
}

type Texto = { assunto: string; mensagem: string; textoWhatsapp: string }

/**
 * O texto do parabéns — a mensagem padrão ou uma específica (com os critérios
 * de quem a recebe). Escrito à mão, com prévia, "Melhorar com IA" e teste.
 */
export function EditorParabens({
  modo,
  inicial,
  fontes,
  exemploNome,
  entidade,
  vespera = false,
}: {
  modo: "padrao" | "especifica"
  inicial: Texto & { id?: string; nome?: string; ativo?: boolean; criterios?: CriteriosAniversario }
  fontes: { id: string; nome: string }[]
  exemploNome: string
  entidade: string
  /** O parabéns sai na véspera: o texto deve falar de "amanhã". */
  vespera?: boolean
}) {
  const [salvo, salvar, salvando] = useActionState(modo === "padrao" ? salvarPadraoAction : salvarModeloAction, {})
  const [teste, testar, testando] = useActionState(enviarTesteAction, {})
  const [assunto, setAssunto] = useState(inicial.assunto)
  const [mensagem, setMensagem] = useState(inicial.mensagem)
  const [whatsapp, setWhatsapp] = useState(inicial.textoWhatsapp)
  const [orientacao, setOrientacao] = useState("")
  const [anterior, setAnterior] = useState<Texto | null>(null)
  const [ia, setIa] = useState<{ carregando: boolean; erro?: string }>({ carregando: false })
  const form = useRef<HTMLFormElement>(null)
  const c = inicial.criterios ?? {}
  const v = { nome: exemploNome, entidade }

  async function melhorar() {
    // O público (critérios da tela, mesmo ainda não salvos) orienta o tom.
    let publico: string | undefined
    if (modo === "especifica" && form.current) {
      const fd = new FormData(form.current)
      const criterios = normalizarCriterios({
        idadeDe: fd.get("idadeDe"),
        idadeAte: fd.get("idadeAte"),
        idadeRedonda: fd.get("idadeRedonda"),
        filiadoHaDe: fd.get("filiadoHaDe"),
        filiadoHaAte: fd.get("filiadoHaAte"),
        fontes: fd.getAll("fontes"),
        condicoesFonte: fd.getAll("condicoesFonte"),
        uf: fd.get("uf"),
        cidade: fd.get("cidade"),
      })
      publico = [String(fd.get("nome") ?? "").trim(), descreverCriterios(criterios, fontes)].filter(Boolean).join(" — ")
    }
    setIa({ carregando: true })
    try {
      const r = await melhorarParabensAction({ assunto, mensagem, textoWhatsapp: whatsapp, orientacao, publico, vespera })
      if (r.erro || !r.assunto || !r.mensagem || !r.textoWhatsapp) {
        setIa({ carregando: false, erro: r.erro ?? "A IA não respondeu." })
        return
      }
      setAnterior({ assunto, mensagem, textoWhatsapp: whatsapp })
      setAssunto(r.assunto)
      setMensagem(r.mensagem)
      setWhatsapp(r.textoWhatsapp)
      setIa({ carregando: false })
    } catch {
      setIa({ carregando: false, erro: "Não foi possível falar com a IA. Tente de novo." })
    }
  }

  function desfazer() {
    if (!anterior) return
    setAssunto(anterior.assunto)
    setMensagem(anterior.mensagem)
    setWhatsapp(anterior.textoWhatsapp)
    setAnterior(null)
  }

  return (
    <form
      ref={form}
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
      {inicial.id && <input type="hidden" name="id" value={inicial.id} />}
      <Retorno erro={salvo.erro} ok={salvo.ok} />
      <Retorno erro={teste.erro} ok={teste.ok} />

      {modo === "especifica" && (
        <div className="grid gap-4 rounded-lg border p-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
            <div className="grid gap-1.5">
              <Label htmlFor="nome">Nome</Label>
              <Input id="nome" name="nome" defaultValue={inicial.nome ?? ""} placeholder="Ex.: Aposentados, 60 anos, Filiados há 20 anos" />
            </div>
            <label className="flex h-9 items-center gap-2 text-sm">
              <input type="checkbox" name="ativo" defaultChecked={inicial.ativo ?? true} className="accent-primary size-4" />
              Em uso
            </label>
          </div>

          <div>
            <p className="text-sm font-medium">Quem recebe esta mensagem</p>
            <p className="text-muted-foreground text-xs">
              Preencha só o que importa: o que estiver preenchido precisa valer ao mesmo tempo. Quem não se encaixar recebe a
              mensagem padrão.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-sm">Idade que completa</legend>
              <div className="flex items-center gap-2">
                <Input name="idadeDe" type="number" min={0} max={150} defaultValue={c.idadeDe ?? ""} placeholder="de" className="w-24" aria-label="Idade de" />
                <span className="text-muted-foreground text-xs">até</span>
                <Input name="idadeAte" type="number" min={0} max={150} defaultValue={c.idadeAte ?? ""} placeholder="até" className="w-24" aria-label="Idade até" />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="idadeRedonda" defaultChecked={c.idadeRedonda === true} className="accent-primary" />
                Só idades redondas (30, 40, 50…)
              </label>
            </fieldset>
            <fieldset className="grid content-start gap-2">
              <legend className="mb-1 text-sm">Tempo de filiação (anos)</legend>
              <div className="flex items-center gap-2">
                <Input name="filiadoHaDe" type="number" min={0} max={100} defaultValue={c.filiadoHaDe ?? ""} placeholder="de" className="w-24" aria-label="Filiado há, de" />
                <span className="text-muted-foreground text-xs">até</span>
                <Input name="filiadoHaAte" type="number" min={0} max={100} defaultValue={c.filiadoHaAte ?? ""} placeholder="até" className="w-24" aria-label="Filiado há, até" />
              </div>
              <p className="text-muted-foreground text-xs">Conta da primeira filiação. &quot;0 até 0&quot; = filiado há menos de um ano.</p>
            </fieldset>
            <fieldset className="grid content-start gap-1.5">
              <legend className="mb-1 text-sm">Condição na fonte</legend>
              {CONDICOES_NA_FONTE.map((x) => (
                <label key={x} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="condicoesFonte" value={x} defaultChecked={c.condicoesFonte?.includes(x)} className="accent-primary" />
                  {x}
                </label>
              ))}
            </fieldset>
            <fieldset className="grid content-start gap-1.5">
              <legend className="mb-1 text-sm">Fonte pagadora</legend>
              <div className="grid max-h-40 gap-1.5 overflow-y-auto rounded-md border p-2">
                {fontes.length === 0 && <span className="text-muted-foreground text-xs">Nenhuma fonte cadastrada.</span>}
                {fontes.map((x) => (
                  <label key={x.id} className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="fontes" value={x.id} defaultChecked={c.fontes?.includes(x.id)} className="accent-primary" />
                    {x.nome}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="grid grid-cols-[90px_1fr] gap-2 sm:col-span-2">
              <div className="grid gap-1.5">
                <Label htmlFor="uf">UF</Label>
                <Input id="uf" name="uf" maxLength={2} defaultValue={c.uf ?? ""} className="uppercase" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="cidade">Cidade contém</Label>
                <Input id="cidade" name="cidade" defaultValue={c.cidade ?? ""} />
              </div>
            </div>
          </div>
        </div>
      )}

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
          {vespera && (
            <p className="text-warning-fg text-xs">
              O parabéns está configurado para sair na véspera: escreva pensando em &quot;amanhã é o seu dia&quot;.
            </p>
          )}

          <div className="bg-muted/30 grid gap-2 rounded-lg border p-3">
            <Label htmlFor="orientacao" className="flex items-center gap-1.5">
              <Sparkles className="text-primary size-4" />
              Melhorar com IA
            </Label>
            <Input
              id="orientacao"
              value={orientacao}
              onChange={(e) => setOrientacao(e.target.value)}
              placeholder="Opcional: o que ajustar (ex.: mais curta, lembrar da colônia de férias)"
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={melhorar} disabled={ia.carregando}>
                {ia.carregando ? <Loader2 className="animate-spin" /> : <Sparkles />}
                {ia.carregando ? "Reescrevendo…" : "Melhorar com IA"}
              </Button>
              {anterior && !ia.carregando && (
                <Button type="button" variant="ghost" size="sm" onClick={desfazer}>
                  <Undo2 />
                  Desfazer
                </Button>
              )}
              <span className="text-muted-foreground text-xs">
                A IA reescreve o assunto, o e-mail e o WhatsApp. Confira antes de salvar.
              </span>
            </div>
            {ia.erro && <p className="text-destructive text-xs">{ia.erro}</p>}
          </div>
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
export function EnviarAgora({ pendentes, dia }: { pendentes: number; dia: string }) {
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
        const r = await enviarLoteDiaAction(dia)
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
