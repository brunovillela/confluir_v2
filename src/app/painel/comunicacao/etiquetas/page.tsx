import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, Download, FileSpreadsheet, Printer, Ruler, Search, X } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { GrupoColapsavel } from "@/components/grupo-colapsavel"
import { requirePermissao } from "@/lib/auth"
import {
  folhasDoLote,
  listarEmissoes,
  selecionarDestinatarios,
} from "@/lib/db/comunicacao-etiquetas"
import { listarSedes } from "@/lib/db/organizacao"
import {
  codigosDoModelo,
  CONDICOES_ETIQUETA,
  consultaEtiquetas,
  FOLHAS,
  lerFiltrosEtiquetas,
  lerOpcoesEtiquetas,
  medidasDoModelo,
  MODELOS_PIMACO,
  ORDENS_ETIQUETA,
  planoDeLotes,
  porFolha,
  type ParametrosBrutos,
} from "@/lib/etiquetas-pimaco"
import { CONDICOES_NA_FONTE } from "@/lib/filiacao"
import { formatarDataHora } from "@/lib/formato"
import { podeAcessar } from "@/lib/permissoes"

import { PreviaFolha } from "./previa-folha"

export const metadata: Metadata = { title: "Etiquetas para os Correios — Confluir" }

const SELECT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"
const SEM_ENDERECO_VISIVEIS = 200

function Selecao({
  nome,
  rotulo,
  valor,
  opcoes,
}: {
  nome: string
  rotulo: string
  valor: string
  opcoes: readonly { valor: string; rotulo: string }[]
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={`f-${nome}`}>{rotulo}</Label>
      <select id={`f-${nome}`} name={nome} defaultValue={valor} className={SELECT}>
        {opcoes.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.rotulo}
          </option>
        ))}
      </select>
    </div>
  )
}

function Marcador({ nome, rotulo, marcado, valor = "1" }: { nome: string; rotulo: string; marcado: boolean; valor?: string }) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm">
      <input type="checkbox" name={nome} value={valor} defaultChecked={marcado} className="accent-primary" />
      {rotulo}
    </label>
  )
}

export default async function EtiquetasPage({
  searchParams,
}: {
  searchParams: Promise<ParametrosBrutos>
}) {
  const sessao = await requirePermissao("comunicacao_etiquetas", ["filiacao_gestao"])
  const brutos = await searchParams
  const filtros = lerFiltrosEtiquetas(brutos)
  const opcoes = lerOpcoesEtiquetas(brutos)
  const { modelo } = opcoes

  const [selecao, emissoes, { sedes }] = await Promise.all([
    selecionarDestinatarios(filtros),
    listarEmissoes(),
    listarSedes().catch(() => ({ disponivel: false, sedes: [] })),
  ])
  const { base, comEndereco, semEndereco } = selecao
  const lotes = planoDeLotes(comEndereco.length, modelo, opcoes.inicio)
  const primeiraFolha = lotes[0] ? folhasDoLote(comEndereco, opcoes, { ...lotes[0], folhas: 1 })[0] : null
  const totalFolhas = lotes.reduce((s, l) => s + l.folhas, 0)

  const consulta = consultaEtiquetas(filtros, opcoes)
  const comConsulta = (caminho: string, extra: Record<string, string> = {}) => {
    const q = new URLSearchParams(consulta)
    for (const [k, v] of Object.entries(extra)) q.set(k, v)
    return `${caminho}?${q.toString()}`
  }
  const ajustes = new URLSearchParams({ modelo: modelo.codigo })
  if (opcoes.ajusteX) ajustes.set("ajusteX", String(opcoes.ajusteX))
  if (opcoes.ajusteY) ajustes.set("ajusteY", String(opcoes.ajusteY))

  const n = (v: number) => v.toLocaleString("pt-BR")
  const voltarParaComunicacao = podeAcessar(sessao.permissoes, "noticias", ["comunicacao_etiquetas"])
  const filtroAplicado = Object.keys(brutos).length > 0

  return (
    <>
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3">
          <Link href={voltarParaComunicacao ? "/painel/comunicacao" : "/painel/filiados/relatorios"}>
            <ArrowLeft />
            {voltarParaComunicacao ? "Comunicação" : "Relatórios"}
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Etiquetas para os Correios</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Etiquetas de endereçamento nas folhas Pimaco para enviar publicações
          impressas aos filiados — de qualquer condição sindical. Uma etiqueta
          por pessoa, na ordem do CEP.
        </p>
      </div>

      {!emissoes.ativo && (
        <Alert variant="warning">
          <AlertDescription>
            As emissões ainda não ficam registradas — rode{" "}
            <code>supabase/comunicacao-etiquetas.sql</code> no SQL Editor do
            Supabase.
          </AlertDescription>
        </Alert>
      )}

      <form method="get" className="grid gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Quem recebe</CardTitle>
            <CardDescription>
              Marque as condições sindicais e, se quiser, estreite por fonte
              pagadora, condição na fonte ou lugar.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <fieldset className="grid gap-2">
              <legend className="mb-1 text-sm font-medium">Condição sindical</legend>
              <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                {CONDICOES_ETIQUETA.map((c) => (
                  <Marcador
                    key={c.valor}
                    nome="cond"
                    valor={c.valor}
                    rotulo={c.rotulo}
                    marcado={filtros.condicoes.includes(c.valor)}
                  />
                ))}
              </div>
              {filtros.condicoes.includes("Falecido") && (
                <p className="text-warning-fg text-xs">
                  &quot;Falecido&quot; está marcado — confira se a publicação deve mesmo ir para esses endereços.
                </p>
              )}
            </fieldset>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Selecao
                nome="fonte"
                rotulo="Fonte pagadora (vínculo corrente)"
                valor={filtros.fonte ?? "todas"}
                opcoes={[{ valor: "todas", rotulo: "Todas" }, ...base.fontes.map((f) => ({ valor: f.id, rotulo: f.nome }))]}
              />
              <Selecao
                nome="condicaoFonte"
                rotulo="Condição na fonte"
                valor={filtros.condicaoFonte ?? "todas"}
                opcoes={[{ valor: "todas", rotulo: "Todas" }, ...CONDICOES_NA_FONTE.map((c) => ({ valor: c, rotulo: c }))]}
              />
              <Selecao
                nome="uf"
                rotulo="UF"
                valor={filtros.uf ?? "todas"}
                opcoes={[{ valor: "todas", rotulo: "Todas" }, ...base.ufs.map((u) => ({ valor: u, rotulo: u }))]}
              />
              <div className="grid gap-1.5">
                <Label htmlFor="f-cidade">Cidade contém</Label>
                <Input id="f-cidade" name="cidade" defaultValue={filtros.cidade ?? ""} />
              </div>
              <div className="grid gap-1.5 sm:col-span-2">
                <Label htmlFor="f-busca">Nome ou CPF</Label>
                <Input id="f-busca" name="busca" defaultValue={filtros.busca ?? ""} placeholder="Para reimprimir a etiqueta de alguém" />
              </div>
              <Selecao
                nome="situacao"
                rotulo="Situação do cadastro"
                valor={filtros.situacao}
                opcoes={[
                  { valor: "ativas", rotulo: "Cadastros não excluídos" },
                  { valor: "excluidas", rotulo: "Só excluídos do quadro" },
                  { valor: "todas", rotulo: "Todos os cadastros" },
                ]}
              />
              <Selecao nome="ordem" rotulo="Ordem das etiquetas" valor={filtros.ordem} opcoes={ORDENS_ETIQUETA} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Etiqueta</CardTitle>
            <CardDescription>
              Escolha pelo código impresso na caixa da Pimaco — as séries do
              mesmo gabarito aparecem juntas.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="grid gap-1.5 sm:col-span-2">
                <Label htmlFor="f-modelo">Modelo Pimaco</Label>
                <select id="f-modelo" name="modelo" defaultValue={modelo.codigo} className={SELECT}>
                  {(["carta", "a4"] as const).map((folha) => (
                    <optgroup key={folha} label={`Folha ${FOLHAS[folha].rotulo}`}>
                      {MODELOS_PIMACO.filter((m) => m.folha === folha).map((m) => (
                        <option key={m.codigo} value={m.codigo}>
                          {codigosDoModelo(m)} — {medidasDoModelo(m)} — {porFolha(m)} por folha
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="f-inicio">Começar na etiqueta nº</Label>
                <Input
                  id="f-inicio"
                  name="inicio"
                  type="number"
                  min={1}
                  max={porFolha(modelo)}
                  defaultValue={opcoes.inicio}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="grid gap-1.5">
                  <Label htmlFor="f-ajusteX">Ajuste → (mm)</Label>
                  <Input id="f-ajusteX" name="ajusteX" type="number" step={0.5} min={-10} max={10} defaultValue={opcoes.ajusteX || ""} placeholder="0" />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="f-ajusteY">Ajuste ↓ (mm)</Label>
                  <Input id="f-ajusteY" name="ajusteY" type="number" step={0.5} min={-10} max={10} defaultValue={opcoes.ajusteY || ""} placeholder="0" />
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              <Marcador nome="caixaAlta" rotulo="Tudo em maiúsculas" marcado={opcoes.caixaAlta} />
              <Marcador nome="matricula" rotulo="Matrícula sindical no canto" marcado={opcoes.matricula} />
              <Marcador nome="contorno" rotulo="Imprimir o contorno das etiquetas" marcado={opcoes.contorno} />
            </div>
            <p className="text-muted-foreground text-xs">
              &quot;Começar na etiqueta nº&quot; aproveita uma folha já usada: conta da
              esquerda para a direita, de cima para baixo. O ajuste corrige
              impressora que puxa o papel torto — positivo move para a direita e
              para baixo.
            </p>
          </CardContent>
        </Card>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit">
            <Search />
            Aplicar
          </Button>
          {filtroAplicado && (
            <Button type="button" variant="ghost" asChild>
              <Link href="/painel/comunicacao/etiquetas">
                <X />
                Limpar
              </Link>
            </Button>
          )}
        </div>
      </form>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {n(comEndereco.length)} etiqueta(s) · {n(totalFolhas)} folha(s) da Pimaco {modelo.codigo}
          </CardTitle>
          <CardDescription>
            {n(selecao.noRecorte)} cadastro(s) no recorte
            {selecao.cpfsRepetidos > 0 && ` · ${n(selecao.cpfsRepetidos)} CPF(s) repetido(s) viraram uma etiqueta só`}
            {semEndereco.length > 0 && ` · ${n(semEndereco.length)} sem endereço completo ficaram de fora`}
            {" · "}apuração de {formatarDataHora(base.geradoEm)}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="grid content-start gap-4">
            {lotes.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nenhuma etiqueta neste recorte.</p>
            ) : (
              <div className="grid gap-2">
                <p className="text-sm font-medium">
                  {lotes.length === 1 ? "Baixar o PDF" : `Baixar em ${lotes.length} arquivos`}
                </p>
                <div className="flex flex-wrap gap-2">
                  {lotes.map((l) => (
                    <Button key={l.numero} asChild variant={l.numero === 1 ? "default" : "outline"}>
                      <a href={comConsulta("/painel/comunicacao/etiquetas/pdf", { lote: String(l.numero) })}>
                        <Download />
                        {lotes.length === 1
                          ? `PDF — ${n(l.folhas)} folha(s)`
                          : `Lote ${l.numero}: ${n(l.de)}–${n(l.ate)} (${n(l.folhas)} fl.)`}
                      </a>
                    </Button>
                  ))}
                  <Button asChild variant="outline">
                    <a href={comConsulta("/painel/comunicacao/etiquetas/csv")}>
                      <FileSpreadsheet />
                      Lista em CSV
                    </a>
                  </Button>
                </div>
                {lotes.length > 1 && (
                  <p className="text-muted-foreground text-xs">
                    Cada arquivo tem folhas inteiras; o lote seguinte continua de
                    onde o anterior parou.
                  </p>
                )}
              </div>
            )}

            <div className="bg-muted/40 grid gap-2 rounded-lg border p-4 text-sm">
              <p className="flex items-center gap-2 font-medium">
                <Printer className="size-4" />
                Para sair alinhado
              </p>
              <ol className="text-muted-foreground list-decimal space-y-1 pl-5 text-xs">
                <li>
                  Na impressão, escolha o papel <strong>{FOLHAS[modelo.folha].rotulo}</strong>, escala{" "}
                  <strong>100% / tamanho real</strong> e desmarque &quot;ajustar à página&quot;.
                </li>
                <li>
                  Antes da primeira tiragem, imprima a{" "}
                  <a className="text-foreground underline" href={`/painel/comunicacao/etiquetas/pdf?tipo=teste&${ajustes.toString()}`}>
                    folha de teste
                  </a>{" "}
                  em papel comum e sobreponha à folha de etiquetas contra a luz.
                </li>
                <li>
                  Se o contorno cair deslocado, meça quanto e informe no ajuste (→ e ↓) — ele vale para a
                  folha de teste também.
                </li>
                <li>
                  Alimente uma folha de etiquetas por vez se a impressora enrugar
                  ou puxar duas.
                </li>
              </ol>
            </div>

            {semEndereco.length > 0 && (
              <GrupoColapsavel
                titulo="Sem endereço completo"
                descricao="CEP, logradouro, cidade e UF são obrigatórios para a etiqueta — corrija no cadastro"
                resumo={<Badge variant="warning">{n(semEndereco.length)}</Badge>}
              >
                <ul className="divide-y text-sm">
                  {semEndereco.slice(0, SEM_ENDERECO_VISIVEIS).map((d) => (
                    <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5">
                      <Link href={`/painel/filiados/${d.id}`} className="font-medium hover:underline">
                        {d.endereco.nome ?? "(sem nome)"}
                      </Link>
                      <span className="text-muted-foreground text-xs">
                        {d.condicao ?? "sem condição"} · falta {d.faltas.join(", ")}
                      </span>
                    </li>
                  ))}
                </ul>
                {semEndereco.length > SEM_ENDERECO_VISIVEIS && (
                  <p className="text-muted-foreground mt-2 text-xs">
                    Mostrando {SEM_ENDERECO_VISIVEIS} de {n(semEndereco.length)}.
                  </p>
                )}
              </GrupoColapsavel>
            )}
          </div>

          {primeiraFolha && (
            <figure className="grid content-start gap-2">
              <PreviaFolha
                modelo={modelo}
                posicoes={primeiraFolha.posicoes}
                ajusteX={opcoes.ajusteX}
                ajusteY={opcoes.ajusteY}
                className="w-full rounded-sm border shadow-sm"
              />
              <figcaption className="text-muted-foreground text-center text-xs">
                Primeira folha — Pimaco {modelo.codigo}, {medidasDoModelo(modelo)}
              </figcaption>
            </figure>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Etiquetas de remetente</CardTitle>
            <CardDescription>
              Folhas inteiras com o endereço de uma sede, no mesmo modelo
              escolhido acima ({modelo.codigo}).
            </CardDescription>
          </CardHeader>
          <CardContent>
            {sedes.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Nenhuma sede cadastrada — cadastre o endereço em Institucional → Organização.
              </p>
            ) : (
              <form method="get" action="/painel/comunicacao/etiquetas/pdf" className="grid gap-3 sm:grid-cols-[1fr_6rem_auto] sm:items-end">
                <input type="hidden" name="tipo" value="remetente" />
                <input type="hidden" name="modelo" value={modelo.codigo} />
                {opcoes.caixaAlta && <input type="hidden" name="caixaAlta" value="1" />}
                {opcoes.ajusteX !== 0 && <input type="hidden" name="ajusteX" value={opcoes.ajusteX} />}
                {opcoes.ajusteY !== 0 && <input type="hidden" name="ajusteY" value={opcoes.ajusteY} />}
                <Selecao
                  nome="sede"
                  rotulo="Sede"
                  valor={sedes[0].id}
                  opcoes={sedes.map((s) => ({
                    valor: s.id,
                    rotulo: [s.nome, s.cidade].filter(Boolean).join(" — ") || "Sede",
                  }))}
                />
                <div className="grid gap-1.5">
                  <Label htmlFor="f-folhas">Folhas</Label>
                  <Input id="f-folhas" name="folhas" type="number" min={1} max={20} defaultValue={1} />
                </div>
                <Button type="submit" variant="outline">
                  <Download />
                  PDF
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Últimas emissões</CardTitle>
            <CardDescription>
              Endereço de filiado é dado pessoal: cada PDF e CSV baixado fica registrado.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {emissoes.linhas.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nenhuma emissão registrada ainda.</p>
            ) : (
              <ul className="divide-y text-sm">
                {emissoes.linhas.map((e) => (
                  <li key={e.id} className="grid gap-0.5 py-2">
                    <span className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">
                        {n(e.quantidade)} etiqueta(s) · {e.tipo === "csv" ? "CSV" : `PDF ${e.modelo ?? ""}`}
                        {e.lote ? ` · lote ${e.lote}` : ""}
                      </span>
                      <span className="text-muted-foreground text-xs whitespace-nowrap">
                        {formatarDataHora(e.created_at)}
                      </span>
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {e.usuarioNome ?? "—"}
                      {e.recorte ? ` · ${e.recorte}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Ruler className="size-4" />
            Qual etiqueta comprar
          </CardTitle>
          <CardDescription>
            Gabaritos Pimaco que comportam um endereço. Os códigos da mesma
            linha são a mesma etiqueta em pacotes diferentes — Carta: 60xx com
            10 folhas, 62xx com 25, 61xx com 100, 625xx com 250 e SL610xx com
            1.000; A4: A42xx com 25 e A43xx com 100. Todas servem para jato de
            tinta e laser.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>Códigos na caixa</TableHead>
                  <TableHead>Folha</TableHead>
                  <TableHead className="whitespace-nowrap">Etiqueta (alt. × larg.)</TableHead>
                  <TableHead className="text-right">Por folha</TableHead>
                  <TableHead className="hidden md:table-cell">Para quê</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {MODELOS_PIMACO.map((m) => (
                  <TableRow key={m.codigo} className={m.codigo === modelo.codigo ? "bg-primary/5" : undefined}>
                    <TableCell className="font-medium">
                      <Link href={comConsulta("/painel/comunicacao/etiquetas", { modelo: m.codigo, inicio: "1" })} className="hover:underline">
                        {codigosDoModelo(m)}
                      </Link>
                    </TableCell>
                    <TableCell>{FOLHAS[m.folha].rotulo}</TableCell>
                    <TableCell className="whitespace-nowrap tabular-nums">{medidasDoModelo(m)}</TableCell>
                    <TableCell className="text-right tabular-nums whitespace-nowrap">
                      {porFolha(m)} ({m.linhas} × {m.colunas})
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden md:table-cell">{m.indicacao}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <p className="text-muted-foreground mt-2 text-xs">
            Para a maioria das mensagens, a <strong>6180</strong> (Carta) ou a{" "}
            <strong>A4256</strong> (A4) resolvem. Endereço longo, com complemento
            de apartamento e bloco, fica mais legível numa etiqueta de 99–101,6 mm
            de largura (6181, A4254, A4262). Os modelos pequenos da Pimaco (6187,
            6089, A4251, A4248, A4249) não comportam um endereço e ficaram de fora.
          </p>
        </CardContent>
      </Card>
    </>
  )
}
