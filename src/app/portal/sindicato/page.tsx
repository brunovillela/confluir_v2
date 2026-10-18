import type { Metadata } from "next"
import Link from "next/link"
import { unstable_rethrow } from "next/navigation"
import * as Sentry from "@sentry/nextjs"
import { Clock, ExternalLink, Globe, Mail, MapPin, MessagesSquare, Phone, Users } from "lucide-react"

import { CabecalhoPagina } from "@/components/portal/cabecalho-pagina"
import { EstadoVazio } from "@/components/portal/estado-vazio"
import { paginaIndisponivel } from "@/components/portal/guarda-parte"
import { Indisponivel } from "@/components/portal/inicio/indisponivel"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { nomeEntidade } from "@/lib/db/organizacao"
import { estadoDaParte, opcoesDaParte } from "@/lib/db/portal-partes"
import {
  canaisDoSindicato,
  diretoriaVigente,
  type CanaisDoSindicato,
  type DiretoriaVigente,
  type MembroDaDiretoria,
} from "@/lib/db/sindicato-portal"
import { formatarData } from "@/lib/formato"
import { opcoesPadrao } from "@/lib/portal-partes-constantes"
import { requireVisualizacaoPortal } from "@/lib/visualizacao-filiado"

export const metadata: Metadata = { title: "O sindicato" }

/** Link que leva a uma linha inteira de texto: 44 px no toque (DESIGN.md). */
const LINK =
  "text-foreground font-medium underline-offset-4 hover:underline rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:inline-flex pointer-coarse:min-h-11 pointer-coarse:items-center"

/** Carga de um bloco: falhou, vai para o log/Sentry e a página diz que não carregou. */
async function carregar<T>(bloco: string, fazer: () => Promise<T>): Promise<{ valor: T } | null> {
  try {
    return { valor: await fazer() }
  } catch (e) {
    unstable_rethrow(e)
    console.error(`portal, o sindicato (${bloco}):`, e instanceof Error ? e.message : e)
    Sentry.captureException(e, { tags: { area: "portal-sindicato", bloco } })
    return null
  }
}

/**
 * "O sindicato" (onda 5 da avaliação de 11/10/2026: A63 + A155): onde e como
 * falar com a entidade pelos canais que ELA cadastrou (Configurações ›
 * Organização e as sedes) e quem compõe a diretoria do mandato vigente.
 *
 * Só o que existe no cadastro: e-mail, site, endereço e telefones de cada
 * sede. Não há campo de WhatsApp nem de horário de atendimento — a página
 * não inventa nenhum dos dois (a entidade os escreve no texto livre abaixo,
 * se quiser). Da diretoria, só nome e cargo; para falar com
 * alguém dela, o caminho é o Atendimento (fica registrado e tem prazo), nunca
 * um contato pessoal. Sem dados, a página diz o que fazer.
 *
 * Nada aqui grava: no "Ver como filiado" a página é a mesma.
 *
 * Área do associado: a entidade escolhe mostrar ou não a diretoria (sem
 * ela, nem a consulta roda) e o destaque "da sua base", e pode escrever um
 * texto livre de horário e outros canais (WhatsApp, plantão), que aparece
 * abaixo dos canais oficiais. Com o Atendimento desabilitado, os convites
 * para abrir uma solicitação saem.
 */
export default async function PortalSindicatoPage() {
  // Desabilitado: o "indisponível" antes de qualquer leitura — o layout
  // renderiza junto com esta página e não a impede de rodar.
  const indisponivel = await paginaIndisponivel("sindicato")
  if (indisponivel) return indisponivel
  const { filiado } = await requireVisualizacaoPortal()
  // Na dúvida, o de sempre: tudo à vista e o Atendimento no ar.
  const opcoesP = opcoesDaParte("sindicato").catch(() => opcoesPadrao("sindicato"))
  const [opcoes, atendimento, entidade, canais, diretoria] = await Promise.all([
    opcoesP,
    estadoDaParte("atendimento").catch(() => "habilitada" as const),
    nomeEntidade().catch(() => null),
    carregar("canais", () => canaisDoSindicato()),
    opcoesP.then((o) =>
      o.mostrar_diretoria
        ? carregar("diretoria", () => diretoriaVigente(filiado.cpf, { destacarBase: o.destacar_base }))
        : null
    ),
  ])
  const comAtendimento = atendimento !== "desabilitada"
  const nosCanais = entidade ? `Os canais oficiais de ${entidade}` : "Os canais oficiais da entidade"

  return (
    <>
      <CabecalhoPagina
        secao="/portal/sindicato"
        titulo="O sindicato"
        subtitulo={opcoes.mostrar_diretoria ? `${nosCanais} e quem compõe a diretoria.` : `${nosCanais}.`}
      />

      <section aria-labelledby="titulo-canais" className="grid gap-3">
        <h2 id="titulo-canais" className="text-lg font-semibold">
          Fale com o sindicato
        </h2>

        {comAtendimento && (
          <Card>
            <CardHeader>
              <CardTitle role="heading" aria-level={3} className="flex items-center gap-2">
                <MessagesSquare className="text-primary size-4" aria-hidden />
                Pelo portal
              </CardTitle>
              <CardDescription>
                Abra uma solicitação no Atendimento: ela fica registrada, tem prazo de resposta e a resposta chega
                aqui no portal e por e-mail.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild className="w-full sm:w-auto">
                <Link href="/portal/atendimento">Abrir uma solicitação</Link>
              </Button>
            </CardContent>
          </Card>
        )}

        <CartaoCanais canais={canais?.valor ?? null} comAtendimento={comAtendimento} />

        {opcoes.texto_canais && (
          <Card>
            <CardHeader>
              <CardTitle role="heading" aria-level={3} className="flex items-center gap-2">
                <Clock className="text-primary size-4" aria-hidden />
                Horário e outros canais
              </CardTitle>
            </CardHeader>
            <CardContent>
              {/* Texto livre da entidade: as quebras de linha que ela escreveu ficam. */}
              <p className="text-sm break-words whitespace-pre-line">{opcoes.texto_canais}</p>
            </CardContent>
          </Card>
        )}
      </section>

      {opcoes.mostrar_diretoria && (
        <section aria-labelledby="titulo-diretoria" className="grid gap-3">
          <div>
            <h2 id="titulo-diretoria" className="text-lg font-semibold">
              Diretoria
            </h2>
            {diretoria?.valor && (
              <p className="text-muted-foreground mt-1 text-xs">
                {diretoria.valor.mandato ? `Mandato ${diretoria.valor.mandato}` : "Mandato vigente"}
                {diretoria.valor.inicio && diretoria.valor.termino
                  ? ` · de ${formatarData(diretoria.valor.inicio)} a ${formatarData(diretoria.valor.termino)}`
                  : ""}
              </p>
            )}
          </div>
          <BlocoDiretoria diretoria={diretoria} comAtendimento={comAtendimento} />
        </section>
      )}
    </>
  )
}

function CartaoCanais({ canais, comAtendimento }: { canais: CanaisDoSindicato | null; comAtendimento: boolean }) {
  const vazio = canais !== null && !canais.email && !canais.site && canais.sedes.length === 0
  return (
    <Card>
      <CardHeader>
        <CardTitle role="heading" aria-level={3}>
          Canais oficiais
        </CardTitle>
        <CardDescription>Os contatos que a própria entidade cadastrou.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {canais === null ? (
          <Indisponivel>
            {comAtendimento
              ? "Não foi possível carregar os canais agora. Use o Atendimento acima ou tente de novo daqui a pouco."
              : "Não foi possível carregar os canais agora. Tente de novo daqui a pouco."}
          </Indisponivel>
        ) : vazio ? (
          <EstadoVazio
            compacto
            icone={Phone}
            titulo="A entidade ainda não publicou telefone, endereço ou e-mail por aqui."
            descricao={comAtendimento ? "Use o Atendimento acima: a resposta chega no portal." : undefined}
          />
        ) : (
          <>
            {(canais.email || canais.site) && (
              <ul className="grid gap-2 text-sm">
                {canais.email && (
                  <li className="flex items-center gap-2">
                    <Mail className="text-muted-foreground size-4 shrink-0" aria-hidden />
                    <span className="sr-only">E-mail: </span>
                    <a href={`mailto:${canais.email}`} className={`${LINK} break-all`}>
                      {canais.email}
                    </a>
                  </li>
                )}
                {canais.site && (
                  <li className="flex items-center gap-2">
                    <Globe className="text-muted-foreground size-4 shrink-0" aria-hidden />
                    <span className="sr-only">Site: </span>
                    <a href={canais.site} target="_blank" rel="noreferrer" className={`${LINK} break-all`}>
                      {canais.siteRotulo}
                      <span className="sr-only"> (abre em outra aba)</span>
                    </a>
                  </li>
                )}
              </ul>
            )}

            {canais.sedes.length > 0 && (
              <ul className="grid gap-4 sm:grid-cols-2">
                {canais.sedes.map((s) => (
                  <li key={s.id} className="grid content-start gap-1.5 rounded-lg border p-3 text-sm">
                    <p className="font-medium">{s.nome ?? "Sede"}</p>
                    {s.endereco && (
                      <p className="text-muted-foreground flex items-start gap-2">
                        <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
                        <span>
                          {s.endereco}
                          {s.mapa && (
                            <>
                              {" · "}
                              <a href={s.mapa} target="_blank" rel="noreferrer" className={LINK}>
                                Ver no mapa
                                <ExternalLink className="ml-1 inline size-3.5 align-[-2px]" aria-hidden />
                                <span className="sr-only"> (abre em outra aba)</span>
                              </a>
                            </>
                          )}
                        </span>
                      </p>
                    )}
                    {s.telefones.length > 0 && (
                      <p className="text-muted-foreground flex items-start gap-2">
                        <Phone className="mt-0.5 size-4 shrink-0" aria-hidden />
                        <span className="sr-only">Telefones: </span>
                        <span className="flex flex-wrap gap-x-3">
                          {s.telefones.map((t, i) =>
                            t.tel ? (
                              <a key={i} href={t.tel} className={`${LINK} tabular-nums`}>
                                {t.texto}
                              </a>
                            ) : (
                              <span key={i} className="text-foreground tabular-nums">
                                {t.texto}
                              </span>
                            )
                          )}
                        </span>
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {canais.incompleto && (
              <Indisponivel className="text-xs">Parte dos canais não carregou agora — pode faltar algum.</Indisponivel>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

function ListaDeMembros({ membros }: { membros: MembroDaDiretoria[] }) {
  return (
    <ul className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
      {membros.map((m) => (
        <li key={m.id} className="min-w-0 text-sm">
          <span className="block font-medium">{m.nome}</span>
          {m.cargo && <span className="text-muted-foreground block text-xs">{m.cargo}</span>}
        </li>
      ))}
    </ul>
  )
}

function BlocoDiretoria({
  diretoria,
  comAtendimento,
}: {
  diretoria: { valor: DiretoriaVigente | null } | null
  /** Atendimento não desabilitado: o convite para falar com a diretoria por lá aparece. */
  comAtendimento: boolean
}) {
  const comoFalar = comAtendimento ? (
    <p className="text-muted-foreground text-xs">
      Quer falar com alguém da diretoria?{" "}
      <Link href="/portal/atendimento" className={LINK}>
        Abra uma solicitação no Atendimento
      </Link>{" "}
      e diga com quem quer falar.
    </p>
  ) : null

  if (diretoria === null) {
    return (
      <Card>
        <CardContent>
          <Indisponivel>Não foi possível carregar a diretoria agora. Tente de novo daqui a pouco.</Indisponivel>
        </CardContent>
      </Card>
    )
  }

  const d = diretoria.valor
  if (!d || d.grupos.length === 0) {
    return (
      <Card>
        <CardContent className="grid gap-2">
          <EstadoVazio compacto icone={Users} titulo="A composição da diretoria ainda não foi publicada no portal." />
          {comoFalar}
        </CardContent>
      </Card>
    )
  }

  const varios = d.grupos.length > 1
  return (
    <>
      {d.daSuaBase.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle role="heading" aria-level={3} className="flex items-center gap-2">
              Da sua base
              <Badge variant="secondary">{d.daSuaBase.length}</Badge>
            </CardTitle>
            <CardDescription>Integrantes da diretoria que trabalham na mesma empresa que você.</CardDescription>
          </CardHeader>
          <CardContent>
            <ListaDeMembros membros={d.daSuaBase} />
          </CardContent>
        </Card>
      )}

      {d.grupos.map((g) => (
        <Card key={g.id}>
          {(varios || g.nome) && (
            <CardHeader>
              <CardTitle role="heading" aria-level={3}>
                {g.nome ?? "Demais integrantes"}
              </CardTitle>
            </CardHeader>
          )}
          <CardContent>
            <ListaDeMembros membros={g.membros} />
          </CardContent>
        </Card>
      ))}

      {comoFalar}
    </>
  )
}
