"use client"

import { startTransition, useActionState, useEffect, useRef, useState } from "react"
import { Check, Loader2, LogOut } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { confirmarEnvio } from "@/components/ui/confirmacao"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { SelectNativo } from "@/components/ui/select-nativo"
import { Textarea } from "@/components/ui/textarea"
import type { CampanhaPublica, VinculoAtivo } from "@/lib/db/oposicao"
import { formatarData } from "@/lib/formato"
import { DECLARACAO_PADRAO, exigeDocumento } from "@/lib/oposicao-constantes"
import { cn } from "@/lib/utils"

import { confirmarOposicao, desistir, sairDaOposicao } from "../actions"

/** Extrai o id do YouTube de um id cru ou URL. */
function idYoutube(v: string | null): string | null {
  if (!v) return null
  const s = v.trim()
  if (/^[\w-]{11}$/.test(s)) return s
  const m = s.match(/(?:v=|youtu\.be\/|embed\/)([\w-]{11})/)
  return m ? m[1] : null
}

/**
 * Onde a pessoa está no caminho (A104): um `<ol>` simples, como no
 * acompanhamento do /filiar. A etapa atual vai com `aria-current="step"` e
 * negrito; as feitas, com o ícone de visto — não só a cor.
 */
function Etapas({ atual, comVideo }: { atual: number; comVideo: boolean }) {
  const etapas = comVideo ? ["Vídeo", "Dados e confirmação", "Comprovante"] : ["Dados e confirmação", "Comprovante"]
  return (
    <ol aria-label="Etapas da oposição" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
      {etapas.map((nome, i) => {
        const feita = i < atual
        const agora = i === atual
        return (
          <li key={nome} aria-current={agora ? "step" : undefined} className="flex items-center gap-1.5">
            <span
              aria-hidden
              className={cn(
                "flex size-5 shrink-0 items-center justify-center rounded-full border text-xs tabular-nums",
                agora && "border-primary bg-primary text-primary-foreground",
                feita && "border-success/40 bg-success/10 text-success-fg"
              )}
            >
              {feita ? <Check className="size-3" /> : i + 1}
            </span>
            <span className={agora ? "text-foreground font-semibold" : "text-muted-foreground"}>
              {nome}
              {feita && <span className="sr-only"> (concluída)</span>}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

export function OposicaoFlow({
  campanha,
  videoUrl,
  videoTempo,
  identidade,
  filiado,
  vinculos,
}: {
  campanha: CampanhaPublica
  videoUrl: string | null
  videoTempo: number | null
  /** Quem vai ficar registrado como opositor — vem da sessão, não do formulário. */
  identidade: { nome: string | null; cpfParcial: string; email: string | null }
  filiado: boolean
  /** Vínculos ativos do cadastro do filiado (A103); vazio para o não filiado. */
  vinculos: VinculoAtivo[]
}) {
  const minimo = videoTempo && videoTempo > 0 ? videoTempo : 0
  const comVideo = minimo > 0 || Boolean(videoUrl)
  const [restante, setRestante] = useState(minimo)
  const [etapa, setEtapa] = useState<"video" | "form">(comVideo ? "video" : "form")
  const [estado, formAction, pendente] = useActionState(confirmarOposicao, {})
  const [estDesistir, desistirAction, pendDesistir] = useActionState(desistir, {})

  // ── Fonte pagadora e matrícula (A103) ──────────────────────────────────────
  // Com fontes na campanha, a lista é a delas (a action só aceita essas,
  // A144); o cadastro do filiado só pré-seleciona quando há UMA fonte dele
  // entre elas. Sem fontes na campanha, o filiado escolhe entre os próprios
  // vínculos, para a carta não sair com a fonte em branco.
  const fontesCampanha = [...campanha.fontes].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
  const usaFontesCampanha = fontesCampanha.length > 0
  const opcoesFonte = usaFontesCampanha
    ? fontesCampanha
    : vinculos.map((v) => ({ id: v.fonteId, nome: v.fonteNome }))
  const doCadastro = usaFontesCampanha
    ? vinculos.filter((v) => fontesCampanha.some((f) => f.id === v.fonteId))
    : vinculos
  const sugestao = doCadastro.length === 1 ? doCadastro[0] : null
  const [fonteId, setFonteId] = useState(sugestao?.fonteId ?? "")
  const [matricula, setMatricula] = useState(sugestao?.matricula ?? "")
  const [matriculaEditada, setMatriculaEditada] = useState(false)
  const [respostas, setRespostas] = useState<Record<string, string>>({})
  const [aceite, setAceite] = useState(false)
  const nomeFonte = opcoesFonte.find((f) => f.id === fonteId)?.nome ?? null

  const trocarFonte = (id: string) => {
    setFonteId(id)
    // A matrícula acompanha a fonte enquanto a pessoa não a digitou à mão.
    if (!matriculaEditada) setMatricula(vinculos.find((v) => v.fonteId === id)?.matricula ?? "")
  }

  useEffect(() => {
    if (etapa !== "video" || restante <= 0) return
    const t = setInterval(() => setRestante((r) => Math.max(0, r - 1)), 1000)
    return () => clearInterval(t)
  }, [etapa, restante])

  // Ao sair do vídeo, o foco vai para o título da etapa nova: no teclado e no
  // leitor de tela a pessoa não fica num botão que sumiu.
  const tituloForm = useRef<HTMLHeadingElement>(null)
  const veioDoVideo = useRef(false)
  useEffect(() => {
    if (etapa === "form" && veioDoVideo.current) {
      veioDoVideo.current = false
      tituloForm.current?.focus()
    }
  }, [etapa])

  // Erro da confirmação: o aviso fica no topo do formulário, longe do botão.
  const alertaErro = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (estado.erro) alertaErro.current?.scrollIntoView({ block: "center" })
  }, [estado])

  const embed = idYoutube(videoUrl)

  if (etapa === "video") {
    const esperando = restante > 0
    return (
      <div className="grid gap-4">
        <Etapas atual={0} comVideo />
        <div className="grid gap-1">
          <h2 className="text-base font-semibold">Antes de decidir</h2>
          <p className="text-muted-foreground text-sm">
            A entidade pede que você assista a este vídeo antes de decidir. Nada
            é registrado nesta etapa.
          </p>
        </div>

        {embed ? (
          <div className="aspect-video w-full overflow-hidden rounded-lg border">
            <iframe
              src={`https://www.youtube.com/embed/${embed}`}
              title="Vídeo da entidade sobre a contribuição"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope"
              allowFullScreen
              className="h-full w-full"
            />
          </div>
        ) : videoUrl ? (
          <Alert>
            <AlertDescription>
              Assista ao vídeo da entidade:{" "}
              <a
                href={videoUrl}
                target="_blank"
                rel="noreferrer"
                className="text-primary underline"
              >
                abrir vídeo
              </a>
            </AlertDescription>
          </Alert>
        ) : null}

        {minimo > 0 && (
          <>
            {/* Os segundos ficam para quem enxerga; o leitor de tela ouve só
                duas frases — a da espera e a da liberação (A129). */}
            <p aria-hidden className="text-muted-foreground text-center text-sm">
              {esperando ? (
                <>
                  O botão “Prosseguir com a oposição” libera em{" "}
                  <span className="text-foreground font-semibold tabular-nums">{restante} s</span>.
                </>
              ) : (
                "Pronto: você já pode prosseguir."
              )}
            </p>
            <span id="espera-video" className="sr-only" aria-live="polite">
              {esperando ? "Aguarde o vídeo terminar para prosseguir." : "Você já pode prosseguir."}
            </span>
          </>
        )}

        {estDesistir.erro && (
          <Alert variant="destructive">
            <AlertDescription>{estDesistir.erro}</AlertDescription>
          </Alert>
        )}

        {/* O primário vem sozinho; "não quero me opor" fica embaixo, discreto
            e com confirmação — lado a lado, parecia um "voltar" (A14). O
            espaço de 12px impede que as áreas de toque dos dois se encostem.
            Durante a espera o botão continua focável (aria-disabled, não
            disabled): quem navega pelo teclado o encontra e ouve o porquê. */}
        <div className="flex flex-col items-start gap-3 sm:items-end">
          <Button
            type="button"
            aria-disabled={esperando || undefined}
            aria-describedby={minimo > 0 ? "espera-video" : undefined}
            onClick={() => {
              if (esperando) return
              veioDoVideo.current = true
              setEtapa("form")
            }}
            className={cn(esperando && "cursor-not-allowed opacity-50 hover:bg-primary")}
          >
            Prosseguir com a oposição
          </Button>
          <form
            action={desistirAction}
            onSubmit={(e) =>
              confirmarEnvio(e, {
                titulo: "Seguir sem registrar oposição?",
                descricao: `Nenhuma oposição será registrada agora. Enquanto o prazo estiver aberto${
                  campanha.prazo_fim ? ` (até ${formatarData(campanha.prazo_fim)})` : ""
                }, você pode voltar e registrar a sua oposição.`,
                confirmar: "Não quero me opor",
                cancelar: "Voltar",
                destrutivo: false,
              })
            }
          >
            <input type="hidden" name="campanha_id" value={campanha.id} />
            <Button
              type="submit"
              variant="ghost"
              disabled={pendDesistir}
              className="text-muted-foreground"
            >
              {pendDesistir && <Loader2 className="animate-spin" />}
              Não quero me opor
            </Button>
          </form>
        </div>
      </div>
    )
  }

  const exigeCarta = exigeDocumento(campanha.modo_formalizacao, filiado)

  return (
    <div className="grid gap-5">
      <Etapas atual={comVideo ? 1 : 0} comVideo={comVideo} />
      <h2 ref={tituloForm} tabIndex={-1} className="text-base font-semibold outline-none">
        Seus dados e a confirmação
      </h2>

      {/* Quem fica registrado como opositor (A104): nome, CPF e e-mail vêm da
          sessão — a pessoa os vê ANTES do ato, não só no comprovante. Fica
          fora do formulário da oposição: o "Sair" é outro formulário. */}
      <section aria-labelledby="quem-se-opoe" className="bg-muted/40 grid gap-3 rounded-md border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id="quem-se-opoe" className="text-sm font-semibold">
            Quem está se opondo
          </h3>
          <form action={sairDaOposicao}>
            <Button type="submit" variant="link" className="px-0">
              <LogOut />
              Não é você? Sair
            </Button>
          </form>
        </div>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <Dado rotulo="Nome" valor={identidade.nome} />
          <Dado rotulo="CPF" valor={identidade.cpfParcial} />
          <Dado rotulo="E-mail" valor={identidade.email} />
          <Dado rotulo="Campanha" valor={campanha.nome ?? "Contribuição assistencial"} />
        </dl>
      </section>

      <form
        // Pelo onSubmit, e não por `action`: o React 19 limpa o formulário
        // depois de uma action. O <select> controlado da fonte voltava a
        // mostrar a primeira da lista com o estado ainda na escolhida (o
        // reenvio ia com outra fonte, como no A149 da hospedagem), e o
        // Checkbox do Radix, que escuta o "reset", se desmarcava.
        onSubmit={(e) => {
          e.preventDefault()
          const dados = new FormData(e.currentTarget)
          startTransition(() => formAction(dados))
        }}
        className="grid gap-5"
      >
        <input type="hidden" name="campanha_id" value={campanha.id} />
        {estado.erro && (
          <Alert ref={alertaErro} variant="destructive">
            <AlertDescription>{estado.erro}</AlertDescription>
          </Alert>
        )}

        <fieldset className="grid gap-4">
          <legend className="mb-1 text-sm font-semibold">Confira seus dados</legend>
          {filiado && sugestao && (
            <p className="text-muted-foreground -mt-2 text-xs">
              Preenchemos com o seu cadastro de filiado. Se algo mudou, corrija aqui.
            </p>
          )}
          {filiado && !sugestao && doCadastro.length > 1 && (
            <p className="text-muted-foreground -mt-2 text-xs">
              Pelo seu cadastro, você tem vínculo com {doCadastro.map((v) => v.fonteNome).join(", ")}.
              Escolha a fonte pagadora desta oposição.
            </p>
          )}

          {opcoesFonte.length > 0 && (
            <div className="grid gap-1.5">
              <Label htmlFor="empregador_id">Sua fonte pagadora</Label>
              <SelectNativo
                id="empregador_id"
                name="empregador_id"
                required={usaFontesCampanha}
                value={fonteId}
                onChange={(e) => trocarFonte(e.target.value)}
                aria-describedby={usaFontesCampanha ? undefined : "empregador-dica"}
              >
                {usaFontesCampanha ? (
                  <option value="" disabled>
                    Selecione…
                  </option>
                ) : (
                  <option value="">Outra (não está na lista)</option>
                )}
                {opcoesFonte.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nome}
                  </option>
                ))}
              </SelectNativo>
              {!usaFontesCampanha && (
                <p id="empregador-dica" className="text-muted-foreground text-xs">
                  São as fontes pagadoras do seu cadastro. Se a atual não está na
                  lista, escolha “Outra”.
                </p>
              )}
            </div>
          )}

          <div className="grid gap-1.5">
            <Label htmlFor="matricula">Matrícula na fonte pagadora (se souber)</Label>
            <Input
              id="matricula"
              name="matricula"
              autoComplete="off"
              maxLength={40}
              value={matricula}
              onChange={(e) => {
                setMatricula(e.target.value)
                setMatriculaEditada(true)
              }}
              className="sm:w-56"
            />
          </div>
        </fieldset>

        {campanha.perguntas.length > 0 && (
          <fieldset className="grid gap-4">
            <legend className="mb-1 text-sm font-semibold">Perguntas da entidade</legend>
            <p className="text-muted-foreground -mt-2 text-xs">Responder é opcional.</p>
            {campanha.perguntas.map((p, i) => (
              <div key={p.id} className="grid gap-1.5">
                <Label htmlFor={`p_${p.id}`}>
                  {i + 1}. {p.pergunta}
                </Label>
                <Textarea
                  id={`p_${p.id}`}
                  name={`pergunta_${p.id}`}
                  rows={2}
                  value={respostas[p.id] ?? ""}
                  onChange={(e) => setRespostas((r) => ({ ...r, [p.id]: e.target.value }))}
                />
              </div>
            ))}
          </fieldset>
        )}

        <div className="grid gap-3">
          {campanha.texto_declaracao && (
            <div
              id="texto-declaracao"
              className="bg-muted/40 rounded-md border p-4 text-sm whitespace-pre-wrap"
            >
              {campanha.texto_declaracao}
            </div>
          )}
          {/* Checkbox do sistema dentro de um rótulo de 44px de altura (A154):
              o texto inteiro marca e desmarca. */}
          <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm">
            <Checkbox
              name="declaracao"
              required
              checked={aceite}
              onCheckedChange={(v) => setAceite(v === true)}
              aria-describedby={campanha.texto_declaracao ? "texto-declaracao" : undefined}
              className="mt-0.5"
            />
            <span>
              {campanha.texto_declaracao
                ? "Li a declaração acima e confirmo a minha oposição."
                : DECLARACAO_PADRAO}
            </span>
          </label>
        </div>

        <div className="grid gap-2">
          <p className="text-muted-foreground text-xs">
            Será registrada a oposição de <strong className="text-foreground">{identidade.nome ?? "—"}</strong>{" "}
            (CPF {identidade.cpfParcial}
            {nomeFonte ? `, ${nomeFonte}` : ""}).{" "}
            {exigeCarta
              ? "Em seguida, o comprovante mostra como assinar a carta no gov.br e enviá-la — sem a carta, a oposição não é avaliada."
              : "Em seguida, você recebe o comprovante."}
          </p>
          <div>
            <Button type="submit" disabled={pendente}>
              {pendente && <Loader2 className="animate-spin" />}
              Confirmar oposição
            </Button>
          </div>
        </div>
      </form>
    </div>
  )
}

function Dado({ rotulo, valor }: { rotulo: string; valor: string | null }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground text-xs">{rotulo}</dt>
      <dd className="mt-0.5 break-words">{valor ?? "—"}</dd>
    </div>
  )
}
