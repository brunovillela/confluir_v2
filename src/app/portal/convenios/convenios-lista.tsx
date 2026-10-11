"use client"

import { useMemo, useRef, useState } from "react"
import { ExternalLink, FileText, Mail, MapPin, Phone, Search, X } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { semAcento } from "@/lib/texto"
import { cn } from "@/lib/utils"

/** Um contato já pronto para virar link (montado no servidor, page.tsx). */
export type ContatoAcionavel = { texto: string; href: string | null }

export type UnidadePortal = {
  id: string
  nome: string | null
  online: boolean
  presencial: boolean
  endereco: string | null
  mapa: string | null
  telefones: ContatoAcionavel[]
  emails: ContatoAcionavel[]
  site: string | null
}

export type ConvenioPortal = {
  id: string
  conveniador: string | null
  infoSumarias: string | null
  infoVantagens: string | null
  arquivoUrl: string | null
  logoUrl: string | null
  /** "Válido até DD/MM/AAAA", quando o convênio tem término. */
  validade: string | null
  /** "Termina em N dias", nos últimos 30 dias de vigência. */
  terminaEmBreve: string | null
  unidades: UnidadePortal[]
  /** Texto sem acento para a busca: nome, categoria, vantagens, unidades e endereços. */
  busca: string
}

export type GrupoConvenios = {
  /** Âncora da seção: #cat-otica. */
  id: string
  categoria: string
  convenios: ConvenioPortal[]
}

/** Alvo de 44 px no toque, como os demais controles do portal (DESIGN.md). */
const ACAO = "pointer-coarse:min-h-11"

/**
 * Lista de convênios do portal (A78): índice de categorias com âncoras e,
 * quando a lista é longa, busca por nome, serviço ou cidade, filtrando em
 * memória. As seções têm `id` e saem do servidor já renderizadas, então as
 * âncoras funcionam antes de o JavaScript carregar.
 */
export function ConveniosLista({
  grupos,
  comBusca,
}: {
  grupos: GrupoConvenios[]
  comBusca: boolean
}) {
  const [termo, setTermo] = useState("")
  const campo = useRef<HTMLInputElement>(null)
  const palavras = useMemo(() => semAcento(termo).split(/\s+/).filter(Boolean), [termo])

  // Todas as palavras precisam aparecer: "ótica campos" acha a ótica de Campos.
  const visiveis = useMemo(
    () =>
      palavras.length === 0
        ? grupos
        : grupos
            .map((g) => ({
              ...g,
              convenios: g.convenios.filter((c) => palavras.every((p) => c.busca.includes(p))),
            }))
            .filter((g) => g.convenios.length > 0),
    [grupos, palavras]
  )
  const encontrados = visiveis.reduce((n, g) => n + g.convenios.length, 0)

  return (
    <>
      {comBusca && (
        <div>
          <div className="relative">
            <Search
              aria-hidden
              className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            />
            <Input
              ref={campo}
              type="search"
              value={termo}
              onChange={(e) => setTermo(e.target.value)}
              placeholder="Buscar por nome, serviço ou cidade"
              aria-label="Buscar convênio"
              className="pl-9"
            />
          </div>
          <div className={cn("flex flex-wrap items-center gap-2", palavras.length > 0 && "mt-2")}>
            {/* A região existe desde o início: leitor de tela só anuncia
                mudança em região que já estava na página. Só o resultado
                fica nela; o botão, fora, não entra no anúncio. */}
            <p aria-live="polite" className="text-muted-foreground text-sm">
              {palavras.length === 0
                ? null
                : encontrados === 0
                  ? `Nenhum convênio para “${termo.trim()}”.`
                  : `${encontrados} convênio${encontrados === 1 ? "" : "s"} para “${termo.trim()}”.`}
            </p>
            {palavras.length > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className={ACAO}
                onClick={() => {
                  setTermo("")
                  // O botão some com a busca vazia: o foco volta ao campo, não ao topo da página.
                  campo.current?.focus()
                }}
              >
                <X />
                Limpar busca
              </Button>
            )}
          </div>
        </div>
      )}

      {grupos.length > 1 && visiveis.length > 0 && (
        <nav aria-label="Categorias de convênio" className="flex flex-wrap gap-2">
          {visiveis.map((g) => (
            <a key={g.id} href={`#${g.id}`} className={cn(buttonVariants({ variant: "outline", size: "sm" }), ACAO)}>
              {g.categoria}
              <span className="text-muted-foreground tabular-nums">
                {g.convenios.length}
                {/* Sem isto, o leitor de tela diz só "Ótica 3". */}
                <span className="sr-only"> {g.convenios.length === 1 ? "convênio" : "convênios"}</span>
              </span>
            </a>
          ))}
        </nav>
      )}

      {visiveis.map((g) => (
        <section key={g.id} id={g.id} aria-labelledby={`${g.id}-titulo`} className="grid scroll-mt-20 gap-3">
          <h2 id={`${g.id}-titulo`} className="text-lg font-semibold">
            {g.categoria}
          </h2>
          <div className="grid gap-3 lg:grid-cols-2">
            {g.convenios.map((c) => (
              <CartaoConvenio key={c.id} convenio={c} />
            ))}
          </div>
        </section>
      ))}
    </>
  )
}

function CartaoConvenio({ convenio: c }: { convenio: ConvenioPortal }) {
  return (
    <Card className="h-full">
      <CardHeader>
        <div className="flex items-start gap-3">
          {c.logoUrl && <Logo src={c.logoUrl} />}
          <div className="grid min-w-0 gap-1">
            <CardTitle className="text-base">{c.conveniador ?? "Convênio"}</CardTitle>
            {c.infoSumarias && <CardDescription>{c.infoSumarias}</CardDescription>}
            {(c.validade || c.terminaEmBreve) && (
              <p className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
                {c.validade}
                {c.terminaEmBreve && <Badge variant="warning">{c.terminaEmBreve}</Badge>}
              </p>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3">
        {c.infoVantagens && (
          <div>
            <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">Vantagens</p>
            <p className="text-sm whitespace-pre-line">{c.infoVantagens}</p>
          </div>
        )}
        {c.unidades.length > 0 && (
          <div>
            <p className="text-muted-foreground mb-1 text-xs font-medium tracking-wide uppercase">
              Onde ser atendido
            </p>
            {/* Uma coluna quando o cartão divide a linha com outro (lg). */}
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
              {c.unidades.map((u) => (
                <Unidade key={u.id} unidade={u} />
              ))}
            </ul>
          </div>
        )}
        {c.arquivoUrl && (
          <div>
            <Button asChild variant="outline" size="sm" className={ACAO}>
              <a href={c.arquivoUrl} target="_blank" rel="noreferrer">
                <FileText />
                Regras do convênio
                <span className="sr-only"> (abre em nova aba)</span>
              </a>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function Unidade({ unidade: u }: { unidade: UnidadePortal }) {
  const temAcao = u.telefones.length > 0 || u.emails.length > 0 || !!u.mapa || !!u.site
  return (
    <li className="rounded-md border p-3 text-sm">
      <p className="flex flex-wrap items-center gap-1.5 font-medium">
        {u.nome ?? "Unidade"}
        {u.online && <Badge variant="outline">online</Badge>}
        {u.presencial && <Badge variant="outline">presencial</Badge>}
      </p>
      {/* O endereço continua escrito: no computador, quem procura quer ler. */}
      {u.endereco && (
        <p className="text-muted-foreground mt-1 flex items-start gap-1.5 text-xs">
          <MapPin aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          <span>{u.endereco}</span>
        </p>
      )}
      {temAcao && (
        <div className="mt-2 flex flex-wrap gap-2">
          {u.telefones.map((t, i) => (
            <Contato key={`tel-${i}`} contato={t} icone={<Phone />} rotulo="Ligar para" numerico />
          ))}
          {u.emails.map((e, i) => (
            <Contato key={`email-${i}`} contato={e} icone={<Mail />} rotulo="Escrever para" />
          ))}
          {u.mapa && (
            <Button asChild variant="outline" size="sm" className={ACAO}>
              <a href={u.mapa} target="_blank" rel="noreferrer">
                <MapPin />
                Ver no mapa
                <span className="sr-only"> (abre em nova aba)</span>
              </a>
            </Button>
          )}
          {u.site && (
            <Button asChild variant="outline" size="sm" className={ACAO}>
              <a href={u.site} target="_blank" rel="noreferrer">
                <ExternalLink />
                Abrir site
                <span className="sr-only"> (abre em nova aba)</span>
              </a>
            </Button>
          )}
        </div>
      )}
    </li>
  )
}

function Contato({
  contato,
  icone,
  rotulo,
  numerico = false,
}: {
  contato: ContatoAcionavel
  icone: React.ReactNode
  rotulo: string
  numerico?: boolean
}) {
  // Sem link possível (número curto, e-mail malformado), fica o texto.
  if (!contato.href) {
    return (
      <span className={cn("text-muted-foreground inline-flex items-center gap-1.5 text-xs [&_svg]:size-3.5", numerico && "tabular-nums")}>
        {icone}
        {contato.texto}
      </span>
    )
  }
  return (
    <Button asChild variant="outline" size="sm" className={cn(ACAO, "max-w-full min-w-0", numerico && "tabular-nums")}>
      <a href={contato.href}>
        {icone}
        <span className="sr-only">{rotulo} </span>
        <span className="truncate">{contato.texto}</span>
      </a>
    </Button>
  )
}

/**
 * Logo do conveniador. Some se a imagem não carregar, em vez de deixar o
 * ícone de imagem quebrada no cartão — também quando o erro aconteceu antes
 * da hidratação (o `ref` confere a imagem já quebrada). Fundo branco de
 * propósito, como nos QR do portal: o logo é desenhado para o papel e
 * sumiria no tema escuro.
 */
function Logo({ src }: { src: string }) {
  const [falhou, setFalhou] = useState(false)
  if (falhou) return null
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      decoding="async"
      ref={(el) => {
        if (el?.complete && el.naturalWidth === 0) setFalhou(true)
      }}
      onError={() => setFalhou(true)}
      className="size-12 shrink-0 rounded-md border bg-white object-contain p-1"
    />
  )
}
