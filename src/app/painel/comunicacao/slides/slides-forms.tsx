"use client"

import { useActionState, useEffect, useRef, useState } from "react"
import {
  ArrowDown,
  ArrowUp,
  Copy,
  Eye,
  EyeOff,
  ImageIcon,
  Loader2,
  Pencil,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  AJUSTES,
  DESCRICAO_MAX,
  DURACAO_MAXIMA,
  DURACAO_MINIMA,
  FAIXA_QUANTIDADE_MAX,
  GIROS,
  ORIENTACOES,
  ROTULO_SITUACAO_SLIDE,
  TITULO_MAX,
  type Orientacao,
  type SituacaoSlide,
  type SlideTv,
} from "@/lib/comunicacao-slides-constantes"

import {
  alternarSlide,
  criarConjuntoSlides,
  duplicarConjuntoSlides,
  excluirConjuntoSlides,
  excluirSlide,
  gerarNovoLinkSlides,
  moverSlide,
  salvarConjuntoSlides,
  salvarSlide,
} from "./actions"

type Estado = { erro?: string; ok?: string }
type ActionForm = (p: Estado, fd: FormData) => Promise<Estado>

const SELECT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"
const FILE =
  "border-input bg-background text-foreground w-full rounded-md border px-3 py-1.5 text-sm shadow-xs outline-none file:mr-3 file:rounded file:border-0 file:bg-muted file:px-2 file:py-1 file:text-sm"

function Recado({ estado }: { estado: Estado }) {
  if (!estado.erro && !estado.ok) return null
  return (
    <Alert variant={estado.erro ? "destructive" : "success"}>
      <AlertDescription className="text-sm">{estado.erro ?? estado.ok}</AlertDescription>
    </Alert>
  )
}

function EscolhaOrientacao({
  valor,
  aoMudar,
}: {
  valor: Orientacao
  aoMudar?: (o: Orientacao) => void
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {ORIENTACOES.map((o) => (
        <label
          key={o.chave}
          className="has-[:checked]:border-primary has-[:checked]:bg-primary/5 flex cursor-pointer items-center gap-3 rounded-lg border p-3"
        >
          <input
            type="radio"
            name="orientacao"
            value={o.chave}
            defaultChecked={valor === o.chave}
            onChange={() => aoMudar?.(o.chave)}
            className="size-4"
          />
          <span
            aria-hidden
            className={`border-foreground/40 shrink-0 rounded-sm border-2 ${
              o.chave === "horizontal" ? "h-6 w-10" : "h-10 w-6"
            }`}
          />
          <span className="text-sm">
            <span className="font-medium">{o.rotulo}</span>
            <span className="text-muted-foreground block text-xs">{o.detalhe}</span>
          </span>
        </label>
      ))}
    </div>
  )
}

// ── Conjunto ─────────────────────────────────────────────────────────────────

export function NovoConjuntoForm() {
  const [estado, action, pend] = useActionState(criarConjuntoSlides, {})
  return (
    <form action={action} className="grid gap-4">
      <Recado estado={estado} />
      <div className="grid gap-1.5">
        <Label htmlFor="nome-conjunto">Nome *</Label>
        <Input
          id="nome-conjunto"
          name="nome"
          placeholder="Ex.: TV da recepção da sede"
          maxLength={120}
          required
        />
      </div>
      <div className="grid gap-1.5">
        <Label>Orientação da TV *</Label>
        <EscolhaOrientacao valor="horizontal" />
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={pend}>
          {pend && <Loader2 className="animate-spin" />}
          Criar conjunto
        </Button>
      </div>
    </form>
  )
}

export type ConfigConjunto = {
  id: string
  nome: string
  orientacao: Orientacao
  girar: string
  duracaoSegundos: number
  mostrarLogo: boolean
  opacidadeLogo: number
  faixaAtiva: boolean
  faixaNoticias: boolean
  faixaQuantidade: number
  faixaTexto: string | null
  mostrarRelogio: boolean
  publicado: boolean
}

export function ConfigConjuntoForm({
  conjunto,
  temLogo,
}: {
  conjunto: ConfigConjunto
  temLogo: boolean
}) {
  const [estado, action, pend] = useActionState(salvarConjuntoSlides, {})
  const [comLogo, setComLogo] = useState(conjunto.mostrarLogo)
  const [opacidade, setOpacidade] = useState(conjunto.opacidadeLogo)
  const [comFaixa, setComFaixa] = useState(conjunto.faixaAtiva)
  const [comNoticias, setComNoticias] = useState(conjunto.faixaNoticias)

  return (
    <form action={action} className="grid gap-5">
      <Recado estado={estado} />
      <input type="hidden" name="id" value={conjunto.id} />

      <div className="grid gap-1.5">
        <Label htmlFor="nome">Nome</Label>
        <Input id="nome" name="nome" defaultValue={conjunto.nome} maxLength={120} required />
      </div>

      <div className="grid gap-1.5">
        <Label>Orientação</Label>
        <EscolhaOrientacao valor={conjunto.orientacao} />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor="girar">Rotação na TV</Label>
        <select id="girar" name="girar" defaultValue={conjunto.girar} className={SELECT}>
          {GIROS.map((g) => (
            <option key={g.chave} value={g.chave}>
              {g.rotulo}
            </option>
          ))}
        </select>
        <p className="text-muted-foreground text-xs">
          Use a rotação quando a TV está pendurada numa posição e o navegador
          dela continua na outra — comum em TV vertical.
        </p>
      </div>

      <div className="grid gap-1.5 sm:max-w-56">
        <Label htmlFor="duracao_segundos">Tempo de cada slide (segundos)</Label>
        <Input
          id="duracao_segundos"
          name="duracao_segundos"
          type="number"
          min={DURACAO_MINIMA}
          max={DURACAO_MAXIMA}
          defaultValue={conjunto.duracaoSegundos}
          required
        />
      </div>

      <div className="grid gap-3 rounded-lg border p-4">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            name="mostrar_logo"
            className="size-4"
            checked={comLogo}
            onChange={(e) => setComLogo(e.target.checked)}
          />
          Logo da entidade no canto superior direito
        </label>
        {!temLogo && (
          <p className="text-muted-foreground text-xs">
            A organização ainda não tem logo cadastrado (Institucional → Organização).
          </p>
        )}
        <div hidden={!comLogo} className="grid gap-1.5 pl-6">
          <Label htmlFor="opacidade_logo">Opacidade: {opacidade}%</Label>
          <input
            id="opacidade_logo"
            name="opacidade_logo"
            type="range"
            min={10}
            max={100}
            step={5}
            value={opacidade}
            onChange={(e) => setOpacidade(Number(e.target.value))}
            className="accent-primary w-full sm:max-w-72"
          />
        </div>
      </div>

      <div className="grid gap-3 rounded-lg border p-4">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            name="faixa_ativa"
            className="size-4"
            checked={comFaixa}
            onChange={(e) => setComFaixa(e.target.checked)}
          />
          Faixa de rodapé com as últimas notícias
        </label>
        <div hidden={!comFaixa} className="grid gap-3 pl-6">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <input
              id="faixa_noticias"
              type="checkbox"
              name="faixa_noticias"
              className="size-4"
              checked={comNoticias}
              onChange={(e) => setComNoticias(e.target.checked)}
            />
            <label htmlFor="faixa_noticias">Passar as</label>
            <Input
              name="faixa_quantidade"
              type="number"
              min={1}
              max={FAIXA_QUANTIDADE_MAX}
              defaultValue={conjunto.faixaQuantidade}
              className="h-8 w-20"
              aria-label="Quantidade de notícias"
              disabled={!comNoticias}
            />
            <span>últimas manchetes de Notícias</span>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="faixa_texto">Mensagens fixas (uma por linha, opcional)</Label>
            <Textarea
              id="faixa_texto"
              name="faixa_texto"
              rows={3}
              defaultValue={conjunto.faixaTexto ?? ""}
              placeholder={"Assembleia geral dia 20, às 18h, na sede\nPlantão jurídico às terças e quintas"}
            />
            <p className="text-muted-foreground text-xs">
              Passam antes das notícias, na mesma faixa.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-2">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="mostrar_relogio"
            className="size-4"
            defaultChecked={conjunto.mostrarRelogio}
          />
          Mostrar a hora (horário de Brasília)
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="publicado"
            className="size-4"
            defaultChecked={conjunto.publicado}
          />
          Publicado — desmarcado, as TVs mostram só o logo
        </label>
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={pend}>
          {pend && <Loader2 className="animate-spin" />}
          Salvar conjunto
        </Button>
      </div>
    </form>
  )
}

function BotaoAcao({
  action,
  campos,
  confirmar,
  children,
  variant = "outline",
  className,
}: {
  action: ActionForm
  campos: Record<string, string>
  confirmar?: string
  children: React.ReactNode
  variant?: "outline" | "ghost" | "secondary"
  className?: string
}) {
  const [estado, act, pend] = useActionState(action, {})
  return (
    <form
      action={act}
      className="grid gap-2"
      onSubmit={(e) => {
        if (confirmar && !confirm(confirmar)) e.preventDefault()
      }}
    >
      {Object.entries(campos).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <Button type="submit" size="sm" variant={variant} disabled={pend} className={className}>
        {pend && <Loader2 className="animate-spin" />}
        {children}
      </Button>
      {(estado.erro || estado.ok) && (
        <span className={`text-xs ${estado.erro ? "text-destructive" : "text-success-fg"}`}>
          {estado.erro ?? estado.ok}
        </span>
      )}
    </form>
  )
}

export function BotaoNovoLink({ id }: { id: string }) {
  return (
    <BotaoAcao
      action={gerarNovoLinkSlides}
      campos={{ id }}
      confirmar="Gerar um link novo? O link atual para de funcionar na hora e as TVs que o usam precisam abrir o novo."
    >
      <RefreshCw className="size-3.5" />
      Gerar novo link
    </BotaoAcao>
  )
}

export function DuplicarConjuntoForm({ id, orientacao }: { id: string; orientacao: Orientacao }) {
  const [estado, action, pend] = useActionState(duplicarConjuntoSlides, {})
  const outra: Orientacao = orientacao === "horizontal" ? "vertical" : "horizontal"
  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="id" value={id} />
      <div className="flex flex-wrap items-center gap-2">
        <select name="orientacao" defaultValue={outra} className={`${SELECT} w-auto`} aria-label="Orientação da cópia">
          {ORIENTACOES.map((o) => (
            <option key={o.chave} value={o.chave}>
              Cópia {o.rotulo.toLowerCase()}
            </option>
          ))}
        </select>
        <Button type="submit" size="sm" variant="outline" disabled={pend}>
          {pend ? <Loader2 className="animate-spin" /> : <Copy className="size-3.5" />}
          Duplicar
        </Button>
      </div>
      {estado.erro && <span className="text-destructive text-xs">{estado.erro}</span>}
    </form>
  )
}

export function ExcluirConjunto({ id }: { id: string }) {
  return (
    <BotaoAcao
      action={excluirConjuntoSlides}
      campos={{ id }}
      variant="ghost"
      className="text-destructive hover:text-destructive"
      confirmar="Excluir o conjunto e todos os seus slides? As TVs com este link passam a mostrar o aviso de link inexistente. Para só tirar do ar, desmarque Publicado."
    >
      <Trash2 className="size-3.5" />
      Excluir conjunto
    </BotaoAcao>
  )
}

// ── Slides ───────────────────────────────────────────────────────────────────

const LADO_MAXIMO = 2400
const TAMANHO_SEM_REDUZIR = 1.5 * 1024 * 1024

/**
 * Reduz a imagem no navegador antes do envio: foto de celular passa fácil do
 * limite do servidor, e a TV não precisa de mais que ~2400 px no lado maior.
 * GIF fica como está (perderia a animação).
 */
async function reduzirImagem(arquivo: File): Promise<File> {
  if (arquivo.type === "image/gif") return arquivo
  const url = URL.createObjectURL(arquivo)
  try {
    const img = await new Promise<HTMLImageElement>((ok, falha) => {
      const i = new Image()
      i.onload = () => ok(i)
      i.onerror = falha
      i.src = url
    })
    const maior = Math.max(img.naturalWidth, img.naturalHeight)
    if (maior <= LADO_MAXIMO && arquivo.size <= TAMANHO_SEM_REDUZIR) return arquivo
    const escala = Math.min(1, LADO_MAXIMO / maior)
    const canvas = document.createElement("canvas")
    canvas.width = Math.round(img.naturalWidth * escala)
    canvas.height = Math.round(img.naturalHeight * escala)
    canvas.getContext("2d")?.drawImage(img, 0, 0, canvas.width, canvas.height)
    const gerar = (tipo: string) =>
      new Promise<Blob | null>((ok) => canvas.toBlob(ok, tipo, 0.86))
    let blob = arquivo.type === "image/png" ? await gerar("image/png") : null
    if (!blob || blob.size > 3 * 1024 * 1024) blob = await gerar("image/jpeg")
    if (!blob) return arquivo
    const ext = blob.type === "image/png" ? "png" : "jpg"
    const nome = arquivo.name.replace(/\.[^.]+$/, "") || "slide"
    return new File([blob], `${nome}.${ext}`, { type: blob.type })
  } catch {
    return arquivo
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function SlideForm({
  conjuntoId,
  orientacao,
  duracaoPadrao,
  slide,
}: {
  conjuntoId: string
  orientacao: Orientacao
  duracaoPadrao: number
  slide?: SlideTv
}) {
  const [estado, action, pend] = useActionState(salvarSlide, {})
  const [previa, setPrevia] = useState<string | null>(null)
  const [preparando, setPreparando] = useState(false)
  const [titulo, setTitulo] = useState(slide?.titulo ?? "")
  const [removerImagem, setRemoverImagem] = useState(false)
  const entrada = useRef<HTMLInputElement>(null)
  const sufixo = slide?.id ?? "novo"

  // Formulário de inclusão: o React limpa os campos depois do envio; a
  // prévia e o título (estado local) acompanham quando o slide entrou.
  const [estadoVisto, setEstadoVisto] = useState(estado)
  if (estado !== estadoVisto) {
    setEstadoVisto(estado)
    if (!slide && estado.ok) {
      setPrevia(null)
      setTitulo("")
    }
  }

  useEffect(() => {
    return () => {
      if (previa) URL.revokeObjectURL(previa)
    }
  }, [previa])

  const imagemAtual = removerImagem ? null : (slide?.imagemUrl ?? null)
  const mostrar = previa ?? imagemAtual

  return (
    <form action={action} className="grid gap-4">
      <Recado estado={estado} />
      <input type="hidden" name="conjunto_id" value={conjuntoId} />
      {slide && <input type="hidden" name="id" value={slide.id} />}

      <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
        <div
          className={`bg-muted text-muted-foreground flex items-center justify-center overflow-hidden rounded-md border ${
            orientacao === "vertical" ? "aspect-[9/16] w-24 sm:w-full" : "aspect-video w-40 sm:w-full"
          }`}
        >
          {mostrar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={mostrar} alt="" className="size-full object-cover" />
          ) : (
            <ImageIcon className="size-6" />
          )}
        </div>
        <div className="grid content-start gap-1.5">
          <Label htmlFor={`imagem-${sufixo}`}>
            Imagem {slide?.imagemUrl ? "(vazio mantém a atual)" : "(opcional se houver título)"}
          </Label>
          <input
            ref={entrada}
            id={`imagem-${sufixo}`}
            name="imagem"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className={FILE}
            onChange={async (e) => {
              const original = e.target.files?.[0]
              if (!original) {
                setPrevia(null)
                return
              }
              setPreparando(true)
              const reduzida = await reduzirImagem(original)
              if (reduzida !== original && entrada.current) {
                const dt = new DataTransfer()
                dt.items.add(reduzida)
                entrada.current.files = dt.files
              }
              setPrevia(URL.createObjectURL(reduzida))
              setPreparando(false)
            }}
          />
          <p className="text-muted-foreground text-xs">
            Ideal: {orientacao === "vertical" ? "1080 × 1920" : "1920 × 1080"} px. Imagens
            grandes são reduzidas antes do envio.
          </p>
          {slide?.imagemUrl && !previa && (
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                name="remover_imagem"
                className="size-3.5"
                checked={removerImagem}
                onChange={(e) => setRemoverImagem(e.target.checked)}
              />
              Tirar a imagem (slide só com texto)
            </label>
          )}
        </div>
      </div>

      <div className="grid gap-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <Label htmlFor={`titulo-${sufixo}`}>Título</Label>
          <span className="text-muted-foreground text-xs tabular-nums">
            {titulo.length}/{TITULO_MAX}
          </span>
        </div>
        <Input
          id={`titulo-${sufixo}`}
          name="titulo"
          maxLength={TITULO_MAX}
          value={titulo}
          onChange={(e) => setTitulo(e.target.value)}
          placeholder="Ex.: Assembleia geral dia 20, às 18h"
        />
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor={`descricao-${sufixo}`}>Descrição</Label>
        <Textarea
          id={`descricao-${sufixo}`}
          name="descricao"
          rows={2}
          maxLength={DESCRICAO_MAX}
          defaultValue={slide?.descricao ?? ""}
          placeholder="Uma ou duas frases curtas — a TV é lida de longe e de passagem."
        />
      </div>

      <div className="grid gap-1.5">
        <Label>Imagem na tela</Label>
        <div className="grid gap-2 sm:grid-cols-2">
          {AJUSTES.map((a) => (
            <label
              key={a.chave}
              className="has-[:checked]:border-primary has-[:checked]:bg-primary/5 flex cursor-pointer items-start gap-2 rounded-lg border p-2.5 text-sm"
            >
              <input
                type="radio"
                name="ajuste"
                value={a.chave}
                defaultChecked={(slide?.ajuste ?? "cobrir") === a.chave}
                className="mt-0.5 size-4"
              />
              <span>
                <span className="font-medium">{a.rotulo}</span>
                <span className="text-muted-foreground block text-xs">{a.detalhe}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="grid gap-1.5">
          <Label htmlFor={`duracao-${sufixo}`}>Segundos na tela</Label>
          <Input
            id={`duracao-${sufixo}`}
            name="duracao_segundos"
            type="number"
            min={DURACAO_MINIMA}
            max={DURACAO_MAXIMA}
            defaultValue={slide?.duracaoSegundos ?? ""}
            placeholder={`${duracaoPadrao} (padrão)`}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`de-${sufixo}`}>Exibir a partir de</Label>
          <Input id={`de-${sufixo}`} name="exibir_de" type="date" defaultValue={slide?.exibirDe ?? ""} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`ate-${sufixo}`}>Exibir até</Label>
          <Input id={`ate-${sufixo}`} name="exibir_ate" type="date" defaultValue={slide?.exibirAte ?? ""} />
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="submit" disabled={pend || preparando} variant={slide ? "secondary" : "default"}>
          {(pend || preparando) && <Loader2 className="animate-spin" />}
          {preparando ? "Preparando a imagem…" : slide ? "Salvar slide" : "Adicionar slide"}
        </Button>
      </div>
    </form>
  )
}

function BotaoIcone({
  action,
  campos,
  title,
  children,
  destrutivo,
  confirmar,
}: {
  action: ActionForm
  campos: Record<string, string>
  title: string
  children: React.ReactNode
  destrutivo?: boolean
  confirmar?: string
}) {
  const [, act, pend] = useActionState(action, {})
  return (
    <form
      action={act}
      onSubmit={(e) => {
        if (confirmar && !confirm(confirmar)) e.preventDefault()
      }}
    >
      {Object.entries(campos).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <Button
        type="submit"
        variant="ghost"
        size="sm"
        disabled={pend}
        title={title}
        aria-label={title}
        className={destrutivo ? "text-destructive hover:text-destructive h-7 px-2" : "h-7 px-2"}
      >
        {pend ? <Loader2 className="size-3.5 animate-spin" /> : children}
      </Button>
    </form>
  )
}

const COR_SITUACAO: Record<SituacaoSlide, string> = {
  no_ar: "border-success/40 text-success-fg",
  oculto: "text-muted-foreground",
  agendado: "border-info/40 text-info-fg",
  encerrado: "text-muted-foreground",
}

export function LinhaSlide({
  slide,
  posicao,
  primeiro,
  ultimo,
  situacao,
  periodo,
  conjuntoId,
  orientacao,
  duracaoPadrao,
}: {
  slide: SlideTv
  posicao: number
  primeiro: boolean
  ultimo: boolean
  situacao: SituacaoSlide
  periodo: string | null
  conjuntoId: string
  orientacao: Orientacao
  duracaoPadrao: number
}) {
  return (
    <li className="px-3 py-3">
      <div className={`flex items-center gap-3 ${situacao === "no_ar" ? "" : "opacity-70"}`}>
        <span className="text-muted-foreground w-5 shrink-0 text-right text-xs tabular-nums">
          {posicao}
        </span>
        <div
          className={`bg-muted text-muted-foreground flex shrink-0 items-center justify-center overflow-hidden rounded border ${
            orientacao === "vertical" ? "h-16 w-9" : "h-10 w-16"
          }`}
        >
          {slide.imagemUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={slide.imagemUrl} alt="" className="size-full object-cover" />
          ) : (
            <span className="text-[9px] font-semibold uppercase">texto</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {slide.titulo ?? <span className="text-muted-foreground italic">sem título</span>}
          </p>
          <div className="text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            <Badge variant="outline" className={COR_SITUACAO[situacao]}>
              {ROTULO_SITUACAO_SLIDE[situacao]}
            </Badge>
            <span className="tabular-nums">
              {slide.duracaoSegundos ?? duracaoPadrao}s
            </span>
            {periodo && <span>{periodo}</span>}
          </div>
        </div>
        <div className="flex shrink-0 items-center">
          {!primeiro && (
            <BotaoIcone action={moverSlide} campos={{ id: slide.id, direcao: "subir" }} title="Subir">
              <ArrowUp className="size-3.5" />
            </BotaoIcone>
          )}
          {!ultimo && (
            <BotaoIcone action={moverSlide} campos={{ id: slide.id, direcao: "descer" }} title="Descer">
              <ArrowDown className="size-3.5" />
            </BotaoIcone>
          )}
          <BotaoIcone
            action={alternarSlide}
            campos={{ id: slide.id }}
            title={slide.ativo ? "Ocultar da TV" : "Mostrar na TV"}
          >
            {slide.ativo ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
          </BotaoIcone>
          <BotaoIcone
            action={excluirSlide}
            campos={{ id: slide.id }}
            title="Excluir slide"
            destrutivo
            confirmar="Excluir este slide? Para tirar da TV só por um tempo, prefira ocultar (olho)."
          >
            <X className="size-3.5" />
          </BotaoIcone>
        </div>
      </div>
      <details className="mt-2 pl-8">
        <summary className="text-muted-foreground hover:text-foreground cursor-pointer text-xs">
          <Pencil className="mr-1 inline size-3 align-[-1px]" />
          Editar
        </summary>
        <div className="mt-3">
          <SlideForm
            conjuntoId={conjuntoId}
            orientacao={orientacao}
            duracaoPadrao={duracaoPadrao}
            slide={slide}
          />
        </div>
      </details>
    </li>
  )
}
