import { Fragment } from "react"
import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, Ban, CheckCircle2, Info, PauseCircle, TriangleAlert } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { hojeSP, nomesDosUsuarios } from "@/lib/db/comum"
import { configDoPortal, type SituacaoParte } from "@/lib/db/portal-partes"
import { formatarData, formatarDataHora } from "@/lib/formato"
import { moduloDaRota, podeAcessarModulo, type Permissoes } from "@/lib/permissoes"
import {
  CHAVES_PARTES,
  definicaoDaParte,
  estadosPermitidos,
  GRUPOS_PARTES,
  PARTES_PORTAL,
  ROTULO_ESTADO_PARTE,
  type ChaveParte,
  type DefinicaoParte,
  type EstadoParte,
} from "@/lib/portal-partes-constantes"
import { cn } from "@/lib/utils"

import { ConferirComoAssociado } from "./conferir-como-associado"
import { cobrancasPixEmAberto, votacoesOnlineAbertas } from "./contexto"
import { FormularioParte, type ValorOpcao } from "./formulario-parte"
import { contagemDasPartes } from "./resumo"

export const metadata: Metadata = {
  title: "Área do associado — Confluir",
}

type ConfigDaParte = SituacaoParte & { opcoes: unknown }

const SELO: Record<EstadoParte, { variant: "success" | "warning" | "destructive"; Icone: typeof Ban }> = {
  habilitada: { variant: "success", Icone: CheckCircle2 },
  suspensa: { variant: "warning", Icone: PauseCircle },
  desabilitada: { variant: "destructive", Icone: Ban },
}

/** Contorno do cartão: quem não está habilitada salta à vista ao rolar. */
const ANEL: Record<EstadoParte, string> = {
  habilitada: "",
  suspensa: "ring-warning/60 dark:ring-warning/60",
  desabilitada: "ring-destructive/40 dark:ring-destructive/50",
}

/** AAAA-MM-DD de amanhã em São Paulo: o mínimo da volta automática. */
function amanhaSP(): string {
  const d = new Date(`${hojeSP()}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

function ancoraDoGrupo(grupo: string): string {
  return `grupo-${grupo
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, "-")}`
}

/** "Também se configura em": só os destinos que a pessoa pode abrir. */
function linksVisiveis(def: DefinicaoParte, permissoes: Permissoes) {
  return def.configuradoEm.filter((l) => {
    const modulo = moduloDaRota(l.href)
    return !modulo || podeAcessarModulo(permissoes, modulo)
  })
}

function SeloEstado({ chave, cfg, fixa }: { chave: ChaveParte; cfg: ConfigDaParte; fixa: boolean }) {
  // Primeiro acesso: o estado é fixo, mas a opção `exigir` liga e desliga o
  // portão — o selo diz o que está valendo.
  if (chave === "primeiro_acesso") {
    const exigido = (cfg.opcoes as { exigir?: boolean }).exigir !== false
    return exigido ? (
      <Badge variant="warning">
        <TriangleAlert aria-hidden />
        Exigido
      </Badge>
    ) : (
      <Badge variant="secondary">Não exigido</Badge>
    )
  }
  if (fixa) {
    return (
      <Badge variant="success">
        <CheckCircle2 aria-hidden />
        Sempre habilitada
      </Badge>
    )
  }
  const { variant, Icone } = SELO[cfg.estado]
  const voltou = cfg.estadoGravado !== cfg.estado && cfg.retornoPrevisto
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <Badge variant={variant}>
        <Icone aria-hidden />
        {ROTULO_ESTADO_PARTE[cfg.estado]}
      </Badge>
      {voltou && (
        <span className="text-muted-foreground text-xs">
          estava {ROTULO_ESTADO_PARTE[cfg.estadoGravado].toLowerCase()};{" "}
          {chave === "portal" ? "voltou sozinho" : "voltou sozinha"} em{" "}
          {formatarData(cfg.retornoPrevisto).slice(0, 5)}
        </span>
      )}
      {cfg.estado !== "habilitada" && cfg.retornoPrevisto && (
        <span className="text-muted-foreground text-xs">volta em {formatarData(cfg.retornoPrevisto)}</span>
      )}
    </span>
  )
}

function CartaoParte({
  chave,
  cfg,
  links,
  aviso,
  amanha,
  ultimaAlteracao,
  disponivel,
  lida,
}: {
  chave: ChaveParte
  cfg: ConfigDaParte
  links: readonly { rotulo: string; href: string }[]
  aviso?: string
  amanha: string
  ultimaAlteracao: string | null
  disponivel: boolean
  lida: boolean
}) {
  const def: DefinicaoParte = definicaoDaParte(chave)
  const fixa = estadosPermitidos(def).length === 1
  // Parte que não se desliga e não tem opção (Avisos, Ajuda): só informa.
  const temFormulario = !fixa || def.opcoes.length > 0

  return (
    // target: realça o cartão quando se chega pelo link da nota da gestão no portal (#parte-…).
    <Card id={`parte-${chave}`} className={cn("target:ring-primary scroll-mt-20 target:ring-2", ANEL[cfg.estado])}>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <CardTitle>{def.titulo}</CardTitle>
          <SeloEstado chave={chave} cfg={cfg} fixa={fixa} />
        </div>
        <CardDescription>{def.descricao}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {def.observacao && (
          <p className="text-muted-foreground flex items-start gap-2 text-xs">
            <Info aria-hidden className="mt-px size-3.5 shrink-0" />
            {def.observacao}
          </p>
        )}
        {aviso && (
          <Alert variant="warning">
            <TriangleAlert aria-hidden />
            <AlertDescription>{aviso}</AlertDescription>
          </Alert>
        )}
        {links.length > 0 && (
          <p className="text-muted-foreground text-xs">
            Também se configura em:{" "}
            {links.map((l, i) => (
              <Fragment key={l.href + l.rotulo}>
                {i > 0 && " · "}
                <Link href={l.href} className="text-foreground underline underline-offset-2">
                  {l.rotulo}
                </Link>
              </Fragment>
            ))}
          </p>
        )}
        {temFormulario ? (
          <FormularioParte
            chave={chave}
            inicial={{
              estado: cfg.estado,
              mensagem: cfg.mensagem,
              // Data já passada não volta ao campo: a parte já voltou sozinha.
              retornoPrevisto: cfg.estado === cfg.estadoGravado ? cfg.retornoPrevisto : null,
              opcoes: cfg.opcoes as Record<string, ValorOpcao>,
            }}
            amanha={amanha}
            ultimaAlteracao={ultimaAlteracao}
            disponivel={disponivel}
            lida={lida}
          />
        ) : (
          ultimaAlteracao && <p className="text-muted-foreground text-xs">{ultimaAlteracao}</p>
        )}
      </CardContent>
    </Card>
  )
}

export default async function AreaDoAssociadoPage() {
  const sessao = await requirePermissao("filiacao_gestao")

  // Os avisos de contexto são um extra: falha neles não derruba a página.
  const [config, cobrancasAbertas, votacoesAbertas] = await Promise.all([
    configDoPortal(),
    cobrancasPixEmAberto().catch(() => 0),
    votacoesOnlineAbertas().catch(() => 0),
  ])
  const cfgDe = (c: ChaveParte) => config.partes[c] as ConfigDaParte
  const nomes = await nomesDosUsuarios(
    CHAVES_PARTES.map((c) => cfgDe(c).atualizadaPor).filter((id): id is string => Boolean(id))
  ).catch(() => new Map<string, string>())

  const avisos: Partial<Record<ChaveParte, string>> = {}
  if (cobrancasAbertas > 0) {
    avisos.contribuicao = `${
      cobrancasAbertas === 1
        ? "Há 1 cobrança Pix em aberto"
        : `Há ${cobrancasAbertas.toLocaleString("pt-BR")} cobranças Pix em aberto`
    }: desabilitar tira o QR do portal; prefira suspender.`
  }
  if (votacoesAbertas > 0) {
    avisos.votacao = "Há votação online aberta: suspender bloqueia o voto pelo portal (o link pessoal continua)."
  }

  const amanha = amanhaSP()
  const ultimaAlteracao = (c: ChaveParte): string | null => {
    const cfg = cfgDe(c)
    if (!cfg.atualizadaEm) return null
    const autor = cfg.atualizadaPor ? nomes.get(cfg.atualizadaPor) : undefined
    return `Última alteração: ${formatarDataHora(cfg.atualizadaEm)}${autor ? ` por ${autor}` : ""}.`
  }
  const cartao = (c: ChaveParte) => (
    <CartaoParte
      key={c}
      chave={c}
      cfg={cfgDe(c)}
      links={linksVisiveis(definicaoDaParte(c), sessao.permissoes)}
      aviso={avisos[c]}
      amanha={amanha}
      ultimaAlteracao={ultimaAlteracao(c)}
      disponivel={config.disponivel}
      lida={config.lida}
    />
  )

  const geral = cfgDe("portal").estado
  const outras = CHAVES_PARTES.filter((c) => c !== "portal")
  const afetadas = outras.filter((c) => cfgDe(c).estado !== "habilitada")
  const contagem = contagemDasPartes({
    suspensas: afetadas.filter((c) => cfgDe(c).estado === "suspensa").length,
    desabilitadas: afetadas.filter((c) => cfgDe(c).estado === "desabilitada").length,
  })
  const grupos = GRUPOS_PARTES.map((grupo) => ({
    grupo,
    // O portal inteiro abre a página; o grupo "Geral" fica só com o Início.
    partes: PARTES_PORTAL.filter((p) => p.grupo === grupo && p.chave !== "portal").map((p) => p.chave),
  })).filter((g) => g.partes.length > 0)

  return (
    <>
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3">
          <Link href="/painel/filiados">
            <ArrowLeft />
            Filiados
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Área do associado</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Habilite, suspenda e configure cada parte do portal do associado. <strong>Suspensa</strong>: continua
          no menu com um aviso e nada é enviado por ela. <strong>Desabilitada</strong>: sai do menu e do Início,
          e a página diz que não está disponível. Sem mudança aqui, tudo funciona como sempre funcionou, exceto o{" "}
          <Link href="#parte-primeiro_acesso" className="text-foreground underline underline-offset-2">
            <strong>Primeiro acesso</strong>
          </Link>
          , que já começa exigido (veja o cartão).
        </p>
      </div>

      {!config.disponivel && (
        <Alert variant="warning">
          <TriangleAlert aria-hidden />
          <AlertTitle>O banco ainda não tem a tabela da Área do associado</AlertTitle>
          <AlertDescription>
            Enquanto isso, todas as partes seguem habilitadas, com as opções padrão, e nada pode ser salvo aqui.
          </AlertDescription>
        </Alert>
      )}

      {/* A leitura falhou (a tabela existe): os cartões mostram o padrão, e
          salvar gravaria por cima do que está guardado — o Salvar fica desligado. */}
      {config.disponivel && !config.lida && (
        <Alert variant="destructive">
          <TriangleAlert aria-hidden />
          <AlertTitle>Não foi possível ler a configuração da Área do associado</AlertTitle>
          <AlertDescription>
            Os cartões abaixo mostram o padrão, não o que está gravado. Recarregue a página antes de salvar.
          </AlertDescription>
        </Alert>
      )}

      {cartao("portal")}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Situação das partes</CardTitle>
            <CardDescription>
              {contagem ? `${contagem}.` : "Todas as partes estão habilitadas."}
              {geral !== "habilitada" &&
                ` Com o portal ${geral === "suspensa" ? "em modo de consulta" : "fora do ar"}, isso vale por cima de cada parte.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {afetadas.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {afetadas.map((c) => (
                  <Badge key={c} asChild variant={SELO[cfgDe(c).estado].variant}>
                    <Link href={`#parte-${c}`}>
                      {definicaoDaParte(c).titulo}
                      <span className="sr-only">: {ROTULO_ESTADO_PARTE[cfgDe(c).estado].toLowerCase()}</span>
                    </Link>
                  </Badge>
                ))}
              </div>
            )}
            <nav aria-label="Grupos de partes" className="text-muted-foreground text-xs">
              Ir para:{" "}
              {grupos.map((g, i) => (
                <Fragment key={g.grupo}>
                  {i > 0 && " · "}
                  <a href={`#${ancoraDoGrupo(g.grupo)}`} className="text-foreground underline underline-offset-2">
                    {g.grupo}
                  </a>
                </Fragment>
              ))}
            </nav>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Conferir como o associado vê</CardTitle>
            <CardDescription>
              Abre o portal de um filiado só para leitura: as partes suspensas e desabilitadas aparecem como para
              ele, com uma nota visível só para a gestão.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ConferirComoAssociado />
          </CardContent>
        </Card>
      </div>

      {grupos.map((g) => (
        <section
          key={g.grupo}
          id={ancoraDoGrupo(g.grupo)}
          aria-labelledby={`${ancoraDoGrupo(g.grupo)}-titulo`}
          className="grid scroll-mt-20 gap-4"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b pb-2">
            <h2 id={`${ancoraDoGrupo(g.grupo)}-titulo`} className="text-lg font-semibold tracking-tight">
              {g.grupo}
            </h2>
            <span className="text-muted-foreground text-xs">
              {g.grupo === "Geral" ? "Topo do menu do portal" : "Grupo do menu do portal"}
            </span>
          </div>
          {g.partes.map(cartao)}
        </section>
      ))}
    </>
  )
}
