import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import {
  ArrowRight,
  CalendarClock,
  FileSignature,
  FileText,
  Handshake,
  Landmark,
  Link2,
  Megaphone,
  Pencil,
  Receipt,
  ScrollText,
  UserRoundCheck,
} from "lucide-react"

import { RotuloTrilha } from "@/components/layout/trilha-rotulos"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { VoltarLista } from "@/components/voltar-lista"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import {
  acordosDoEmpregador,
  campanhasDeOposicaoDoEmpregador,
  contarVotacoesDoEmpregador,
  filtrarAcordos,
} from "@/lib/db/empregador-painel"
import { listarCategoriasFonte } from "@/lib/db/fonte-categorias"
import { gruposPorFonte } from "@/lib/db/grupos-empresariais"
import { buscarFontePagadora, estatisticasFonteDetalhe } from "@/lib/db/fontes"
import { listarDocumentosEmpregador } from "@/lib/db/representacao-docs"
import { resumoReunioes } from "@/lib/db/representacao-reunioes"
import { formatarCnpjCpf, formatarData } from "@/lib/formato"
import { podeAcessar } from "@/lib/permissoes"
import { nomeCategoriaDaFonte } from "@/lib/saude-cadastros"
import { ROTULO_TIPO_DOC } from "@/lib/representacao-docs-constantes"
import { cn } from "@/lib/utils"

import { AbaAcordos, AbaOposicoes, AbaReunioes, AbaVotacoes } from "./abas"
import { AbaArrecadacao } from "./aba-arrecadacao"
import { AdicionarDocumento, BotaoExcluirDocumento } from "./empregador-docs-forms"
import { ABAS_EMPREGADOR, lerAbaEmpregador, type AbaEmpregador, type Params } from "./filtros"

export const metadata: Metadata = { title: "Empregador — Confluir" }

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{rotulo}</dt>
      <dd className="mt-0.5 text-sm">{children ?? "—"}</dd>
    </div>
  )
}

function Mini({
  rotulo,
  valor,
  detalhe,
  href,
  icone: Icone,
  alerta,
}: {
  rotulo: string
  valor: string
  detalhe?: string | null
  href?: string | null
  icone: typeof Handshake
  alerta?: boolean
}) {
  const conteudo = (
    <div className={cn("h-full rounded-lg border p-3 transition-colors", href && "hover:border-primary/40", alerta && "border-warning/50")}>
      <p className="text-muted-foreground flex items-center justify-between text-xs">
        {rotulo}
        <Icone className="size-3.5" />
      </p>
      <p className={cn("mt-0.5 line-clamp-1 text-sm font-semibold", alerta && "text-warning-fg")}>{valor}</p>
      {detalhe && <p className="text-muted-foreground line-clamp-1 text-xs">{detalhe}</p>}
    </div>
  )
  return href ? (
    <Link href={href} className="block h-full">
      {conteudo}
    </Link>
  ) : (
    conteudo
  )
}

const n = (v: number) => v.toLocaleString("pt-BR")

export default async function FontePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Params>
}) {
  const sessao = await requirePermissao("empregadores")
  const podeEditar = podeAcessar(sessao.permissoes, "empregadores")
  const { id } = await params
  const sp = await searchParams
  const [fonte, categorias, grupoDaFonte] = await Promise.all([
    buscarFontePagadora(id),
    listarCategoriasFonte(),
    gruposPorFonte(),
  ])
  const grupo = grupoDaFonte.get(id) ?? null
  if (!fonte) notFound()

  const permitidas = ABAS_EMPREGADOR.filter((a) => !a.permissao || podeAcessar(sessao.permissoes, a.permissao)).map((a) => a.chave)
  const aba: AbaEmpregador = lerAbaEmpregador(sp.aba, permitidas)
  const ve = (a: AbaEmpregador) => permitidas.includes(a)

  const [stats, reunioes, acordos, votacoes, oposicoes] = await Promise.all([
    estatisticasFonteDetalhe(id),
    resumoReunioes(id),
    ve("acordos") ? acordosDoEmpregador(id) : Promise.resolve([]),
    ve("votacoes") ? contarVotacoesDoEmpregador(id) : Promise.resolve(0),
    ve("oposicoes") ? campanhasDeOposicaoDoEmpregador(id) : Promise.resolve([]),
  ])
  const documentos = aba === "visao" ? await listarDocumentosEmpregador(id) : []

  const nome = fonte.nome_fantasia ?? fonte.nome_razao ?? "(sem nome)"
  const aqui = `/painel/representacao/empregadores/${id}`
  const fechados = filtrarAcordos(acordos, "fechados")
  const vigente = acordos
    .filter((a) => a.situacao === "vigente")
    .sort((a, b) => (b.vigenciaFim ?? "").localeCompare(a.vigenciaFim ?? ""))[0]
  const cartas = oposicoes.reduce((s, c) => s + c.total, 0)
  const contagem: Record<AbaEmpregador, number | null> = {
    visao: null,
    acordos: fechados.length,
    votacoes,
    oposicoes: cartas,
    reunioes: reunioes.reunioes,
    setoriais: reunioes.setoriais,
    arrecadacao: null,
  }

  const indicadores = [
    { titulo: "Filiados ativos", valor: stats.filiadosAtivos, detalhe: "pessoas com condição “Ativo” e vínculo em aberto", icone: UserRoundCheck, href: `/painel/filiados/lista?fonte=${id}&condicao=Ativo&situacao=todas` },
    { titulo: "Vínculos em aberto", valor: stats.vinculosAbertos, detalhe: "sem data de desfiliação", icone: Link2, href: `/painel/filiados/lista?fonte=${id}&situacao=todas` },
    { titulo: "Vínculos no histórico", valor: stats.vinculosTotal, detalhe: "todos os vínculos já registrados", icone: Landmark, href: `/painel/filiados/lista?fonte=${id}&situacao=todas` },
    {
      titulo: "Contribuições",
      valor: stats.contribuicoes,
      detalhe: stats.contribuicoes === null ? "contagem indisponível agora — recarregue" : "lançamentos ligados à fonte",
      icone: Receipt,
      href: null,
    },
  ]

  return (
    <>
      <RotuloTrilha valores={{ [id]: nome }} />
      <div>
        <VoltarLista
          chave="empregadores"
          base="/painel/representacao/empregadores"
          rotulo="Empregadores"
        />
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">{nome}</h1>
              <Badge variant="outline" className="text-muted-foreground">
                {nomeCategoriaDaFonte(fonte, categorias)}
              </Badge>
              {fonte.inativa === true ? (
                <Badge variant="outline" className="text-muted-foreground">
                  Inativa
                </Badge>
              ) : (
                <Badge variant="outline" className="border-success/40 text-success-fg">
                  Ativa
                </Badge>
              )}
              {grupo && (
                <Badge variant="info" asChild>
                  <Link href={`/painel/representacao/empregadores/grupos/${grupo.id}`}>
                    {/^grupo\b/i.test(grupo.nome) ? grupo.nome : `Grupo ${grupo.nome}`}
                  </Link>
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground mt-1 font-mono text-sm">{formatarCnpjCpf(fonte.cnpj_cpf)}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {podeEditar && (
              <Button variant="outline" asChild>
                <Link href={`${aqui}/editar`}>
                  <Pencil />
                  Editar
                </Link>
              </Button>
            )}
            <Button asChild>
              <Link href={`/painel/filiados/lista?fonte=${id}&condicao=Ativo&situacao=todas`}>
                Ver filiados da fonte
                <ArrowRight />
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {sp.excluida === "1" && (
        <Alert variant="success">
          <AlertDescription>Registro excluído.</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {indicadores.map((ind) => {
          const conteudo = (
            <Card key={ind.titulo} className={ind.href ? "group-hover:border-primary/40 h-full transition-colors" : "h-full"}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardDescription>{ind.titulo}</CardDescription>
                  <ind.icone className="text-muted-foreground size-4" />
                </div>
                <CardTitle className="text-2xl tabular-nums">{ind.valor === null ? "—" : ind.valor.toLocaleString("pt-BR")}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-xs">{ind.detalhe}</p>
              </CardContent>
            </Card>
          )
          return ind.href ? (
            <Link key={ind.titulo} href={ind.href} className="group">
              {conteudo}
            </Link>
          ) : (
            conteudo
          )
        })}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {ve("acordos") && (
          <Mini
            rotulo="Acordo vigente"
            icone={FileSignature}
            valor={vigente?.titulo ?? "nenhum"}
            detalhe={vigente ? `até ${formatarData(vigente.vigenciaFim)}${vigente.estado === "vencido" ? " · vencido" : vigente.estado === "vencendo" ? " · vencendo" : ""}` : null}
            href={vigente ? `/painel/representacao/acordos/${vigente.id}` : `${aqui}?aba=acordos`}
            alerta={vigente?.estado === "vencido" || vigente?.estado === "vencendo"}
          />
        )}
        <Mini
          rotulo="Reuniões com a empresa"
          icone={Handshake}
          valor={`${n(reunioes.reunioes12m)} em 12 meses`}
          detalhe={reunioes.ultima?.tipo === "empregador" ? `última: ${formatarData(reunioes.ultima.data)}` : null}
          href={`${aqui}?aba=reunioes`}
        />
        <Mini
          rotulo="Setoriais"
          icone={Megaphone}
          valor={`${n(reunioes.setoriais12m)} em 12 meses`}
          href={`${aqui}?aba=setoriais`}
        />
        <Mini
          rotulo="Próxima agenda"
          icone={CalendarClock}
          valor={reunioes.proxima ? formatarData(reunioes.proxima.data) : "nada agendado"}
          detalhe={reunioes.proxima?.titulo ?? null}
          href={reunioes.proxima ? `${aqui}/reunioes/${reunioes.proxima.id}` : null}
        />
      </div>

      <div className="grid gap-3">
        <nav className="flex flex-wrap gap-1.5 border-b pb-2" aria-label="Seções do empregador">
          {ABAS_EMPREGADOR.filter((a) => ve(a.chave)).map((a) => (
            <Button key={a.chave} variant={aba === a.chave ? "default" : "ghost"} size="sm" asChild>
              <Link href={`${aqui}?aba=${a.chave}`} aria-current={aba === a.chave ? "page" : undefined}>
                {a.rotulo}
                {contagem[a.chave] !== null && <span className="tabular-nums opacity-70">{n(contagem[a.chave]!)}</span>}
              </Link>
            </Button>
          ))}
        </nav>

        {aba === "acordos" && <AbaAcordos ctx={{ empresaId: id, aba, params: sp }} />}
        {aba === "votacoes" && <AbaVotacoes ctx={{ empresaId: id, aba, params: sp }} />}
        {aba === "oposicoes" && <AbaOposicoes ctx={{ empresaId: id, aba, params: sp }} />}
        {aba === "reunioes" && <AbaReunioes ctx={{ empresaId: id, aba, params: sp }} tipo="empregador" podeEditar={podeEditar} />}
        {aba === "setoriais" && <AbaReunioes ctx={{ empresaId: id, aba, params: sp }} tipo="setorial" podeEditar={podeEditar} />}
        {aba === "arrecadacao" && <AbaArrecadacao empresaId={id} nome={nome} />}

        {aba === "visao" && (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Dados da fonte</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Campo rotulo="Nome">{fonte.nome_fantasia ?? "—"}</Campo>
                  <Campo rotulo="Razão social">{fonte.nome_razao ?? "—"}</Campo>
                  <Campo rotulo="CNPJ / CPF">{formatarCnpjCpf(fonte.cnpj_cpf)}</Campo>
                  <Campo rotulo="Categoria">{nomeCategoriaDaFonte(fonte, categorias)}</Campo>
                  <Campo rotulo="Cadastro">{formatarData(fonte.created_at)}</Campo>
                  <Campo rotulo="Inativa desde">{fonte.inativa === true ? formatarData(fonte.inativa_data) : "—"}</Campo>
                </dl>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base">Documentação legal</CardTitle>
                    <CardDescription>Cartas, atas, editais e demais documentos da representação</CardDescription>
                  </div>
                  <ScrollText className="text-muted-foreground size-4" />
                </div>
              </CardHeader>
              <CardContent className="grid gap-4">
                {documentos.length === 0 ? (
                  <p className="text-muted-foreground text-sm">Nenhum documento cadastrado.</p>
                ) : (
                  <ul className="grid gap-2">
                    {documentos.map((d) => (
                      <li key={d.id} className="border-border flex items-start justify-between gap-2 rounded-md border p-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium">
                            {d.numero && <span className="text-muted-foreground mr-1 tabular-nums">{d.numero}</span>}
                            {d.titulo ?? "(sem título)"}{" "}
                            <Badge variant="secondary" className="ml-1 align-middle">
                              {ROTULO_TIPO_DOC[d.tipo]}
                            </Badge>
                          </p>
                          <p className="text-muted-foreground mt-0.5 text-xs">
                            {d.data_documento ? formatarData(d.data_documento) : "sem data"}
                            {d.vigencia_fim && <> · vigência até {formatarData(d.vigencia_fim)}</>}
                            {d.arquivoUrl && (
                              <>
                                {" · "}
                                <a href={d.arquivoUrl} target="_blank" rel="noreferrer" className="text-primary inline-flex items-center gap-1 hover:underline">
                                  <FileText className="size-3" /> abrir PDF
                                </a>
                              </>
                            )}
                          </p>
                          {d.observacoes && <p className="text-muted-foreground mt-0.5 text-xs whitespace-pre-wrap">{d.observacoes}</p>}
                        </div>
                        {podeEditar && <BotaoExcluirDocumento documentoId={d.id} empresaId={id} />}
                      </li>
                    ))}
                  </ul>
                )}
                {podeEditar && <AdicionarDocumento empresaId={id} />}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </>
  )
}
