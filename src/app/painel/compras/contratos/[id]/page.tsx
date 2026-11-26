import { contasAbertasParaCompras } from "@/lib/db/caixa"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { CalendarRange, FilePen, FileText, LinkIcon, Pencil, Plus, ReceiptText } from "lucide-react"

import {
  TiposContratoBadges,
  VigenciaContratoBadge,
} from "@/components/compras"
import { SituacaoBadge } from "@/app/painel/financeiro/situacao-badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { VoltarLista } from "@/components/voltar-lista"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Paginacao } from "@/components/paginacao"
import { requirePermissao } from "@/lib/auth"
import {
  buscarContrato,
  carregarOpcoesContrato,
  ordemMexivelPeloContrato,
  type ContratoDetalhe,
  type ContratoLista,
} from "@/lib/db/contratos"
import { hojeLocalISO } from "@/lib/compras-constantes"
import {
  avulsosParecemParcelas,
  numerarParcelas,
  podeAnexarNotaPeloContrato,
  rotuloParcela,
  ultimoVencimentoEmVigor,
} from "@/lib/contratos-constantes"
import { contratoDoRpa, listarRpas } from "@/lib/db/compras-rpa"
import { rpasComLinkPendente } from "@/lib/db/rpa-assinatura"
import { AnexarRpaAssinadoBotao } from "../../rpa/rpa-forms"
import { listarMinutas } from "@/lib/db/contratos-minutas"
import {
  SITUACAO_AGUARDANDO_DOCUMENTO,
  SITUACOES_NAO_AUTORIZADAS,
} from "@/lib/db/ordens-ciclo"
import { TIPO_ORDEM_RPA } from "@/lib/rpa-calculo"
import { formatarData, formatarMoeda } from "@/lib/formato"
import { lerPaginacao, paginar } from "@/lib/paginacao"
import { podeAcessar } from "@/lib/permissoes"

import { nomesDosUsuarios } from "@/lib/db/comum"
import { comPessoasAtuais } from "@/lib/db/opcoes-pessoas"

import { BotaoExcluirContrato, ContratoForm } from "../contrato-forms"
import { AutorizarContrato } from "./autorizar-contrato"
import { GerarOrdensForm } from "../gerar-ordens-form"
import {
  AcoesLinhaOrdem,
  AnexarNotaOrdem,
  ExclusaoOrdensBarra,
  MarcarTodasOrdens,
  ClassificarOrdem,
  ReceberDocumentoForm,
} from "./ordens-contrato"

export const metadata: Metadata = { title: "Contrato — Confluir" }

function ListaAditivos({ aditivos }: { aditivos: ContratoLista[] }) {
  return (
    <ul className="grid gap-2">
      {aditivos.map((a) => (
        <li
          key={a.id}
          className="border-border flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm"
        >
          <div className="min-w-0">
            <Link
              href={`/painel/compras/contratos/${a.id}`}
              className="text-primary font-medium tabular-nums hover:underline"
            >
              {a.codigo ?? "(sem código)"}
            </Link>
            {a.objeto && (
              <span className="text-muted-foreground"> — {a.objeto}</span>
            )}
            <p className="text-muted-foreground mt-0.5 text-xs">
              Vigência {formatarData(a.vigencia_inicio)} –{" "}
              {a.vigencia_termino ? formatarData(a.vigencia_termino) : "sem termo"}
            </p>
          </div>
          <VigenciaContratoBadge vigencia={a.vigencia} />
        </li>
      ))}
    </ul>
  )
}

export default async function ContratoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{
    salvo?: string
    editar?: string
    geradas?: string
    puladas?: string
    tipoGerado?: string
    rpaExcluido?: string
    novaOrdem?: string
    ordemExcluida?: string
    autorizado?: string
    pagina?: string
    porPagina?: string
  }>
}) {
  const sessao = await requirePermissao("aquisicoes_contratos", [
    "aquisicoes_contratos_edicao",
  ])
  const podeEditar = podeAcessar(sessao.permissoes, "aquisicoes_contratos_edicao")
  const podeAutorizar = podeAcessar(sessao.permissoes, "aquisicoes_contratos_autorizacao")

  const { id } = await params
  const brutos = await searchParams

  const detalhe = await buscarContrato(id, podeEditar)
  // Ajudas institucionais vivem no módulo Institucional, não em Aquisição.
  if (!detalhe || detalhe.contrato.apoio_institucional) notFound()
  const { contrato: c } = detalhe

  const editando = brutos.editar === "1" && podeEditar
  const aqui = `/painel/compras/contratos/${c.id}`

  const opcoesBase = editando ? await carregarOpcoesContrato() : null
  // Responsável que saiu da lista continua selecionado (lib/db/opcoes-pessoas).
  const opcoes = opcoesBase
    ? { ...opcoesBase, usuarios: await comPessoasAtuais(opcoesBase.usuarios, [c.responsavel_id]) }
    : null
  // Minutas ficam com quem edita contratos (podem citar dados de categoria sigilosa).
  const minutas = podeEditar ? (await listarMinutas({ contratoId: c.id })).minutas : []
  // O RPA é a forma de pagamento do contrato com autônomo (fornecedor pessoa física).
  const [{ ativo: rpaAtivo, linhas: rpas }, paraRpa] = await Promise.all([
    listarRpas({ contratoId: c.id }),
    contratoDoRpa(c.id),
  ])
  const aceitaRpa = Boolean(paraRpa?.fornecedorId && !paraRpa.fornecedorPessoaJuridica)
  const rpaComLink = await rpasComLinkPendente(rpas.filter((r) => !r.arquivoAssinado).map((r) => r.id))
  const mostrarRpa = aceitaRpa || rpas.length > 0

  // Parcelas × pagamentos avulsos (26/11/2026): cada um no seu quadro, a
  // parcela com o número no contrato ("parcela 3 de 12").
  const { numeros: numeroParcela, total: totalParcelas } = numerarParcelas(detalhe.ordens)
  const porVencimento = (a: { vencimento: string | null }, b: { vencimento: string | null }) =>
    (a.vencimento ?? "9999").localeCompare(b.vencimento ?? "9999")
  const parcelas = detalhe.ordens.filter((o) => o.natureza === "parcela").sort(porVencimento)
  const avulsos = detalhe.ordens.filter((o) => o.natureza === "avulso").sort(porVencimento)
  const anteriores = detalhe.ordens.filter((o) => o.natureza === "anterior").sort(porVencimento)
  const parcelasPagas = parcelas.filter(
    (o) => o.situacao !== "Cancelada" && (Boolean(o.data_pagamento) || o.situacao === "Paga")
  ).length
  // Mensalidade gerada como pagamento extraordinário: o sinal que motivou a separação.
  const avulsosRepetidos = c.sob_demanda ? 0 : avulsosParecemParcelas(avulsos)
  const paginacao = lerPaginacao(brutos, 10)
  const pagOrdens = paginar(parcelas, paginacao)
  // Base da data sugerida ao gerar parcelas: a última parcela (ou ordem do
  // sistema anterior) em vigor — o pagamento avulso não entra na sequência.
  const ultimoVencimento = ultimoVencimentoEmVigor(detalhe.ordens.filter((o) => o.natureza !== "avulso"))
  // Parcelas recorrentes que esperam a nota da competência (ficam no contrato).
  const aguardandoDocumento = detalhe.ordens
    .filter((o) => o.situacao === SITUACAO_AGUARDANDO_DOCUMENTO)
    .sort((a, b) => (a.vencimento ?? "").localeCompare(b.vencimento ?? ""))
  // Exclusão em massa: só o que ainda não foi autorizado e é do próprio
  // contrato (RPA e compra têm dono próprio).
  const excluivel = (o: (typeof detalhe.ordens)[number]) =>
    podeEditar &&
    SITUACOES_NAO_AUTORIZADAS.includes(o.situacao ?? "") &&
    o.tipo !== TIPO_ORDEM_RPA &&
    !o.processo_compra_id &&
    !o.data_pagamento
  const visiveis = [...pagOrdens.linhas, ...avulsos, ...anteriores]
  const temExcluivel = visiveis.some(excluivel)
  // Parcela ↔ avulso: quem edita contratos corrige (RPA e compra têm dono próprio).
  const reclassificavel = (o: (typeof detalhe.ordens)[number]) =>
    podeEditar && o.tipo !== TIPO_ORDEM_RPA && !o.processo_compra_id
  // Editar/excluir UMA ordem: qualquer uma ainda não paga nem em processamento.
  const mexivel = (o: (typeof detalhe.ordens)[number]) => podeEditar && ordemMexivelPeloContrato(o)
  // "Gerar parcelas" e "Pagamento avulso" abrem o gerador no cartão das ordens.
  const novaOrdem: "parcelas" | "avulso" | null = !podeEditar
    ? null
    : brutos.novaOrdem === "avulso"
      ? "avulso"
      : brutos.novaOrdem === "parcelas" || brutos.novaOrdem === "1"
        ? "parcelas"
        : null
  const FORM_EXCLUSAO = "excluir-ordens-contrato"
  // Aditivo é de um contrato principal — um aditivo não recebe outro aditivo.
  const podeTerAditivo = !detalhe.principal
  // Nota fiscal pela linha da ordem: quem edita contratos anexa a que falta.
  const anexavel = (o: (typeof detalhe.ordens)[number]) => podeEditar && podeAnexarNotaPeloContrato(o)

  const autorizadorNome = c.autorizadorId
    ? ((await nomesDosUsuarios([c.autorizadorId])).get(c.autorizadorId) ?? null)
    : null

  // Contas de caixa abertas: opção da forma "Dinheiro" ao gerar ordens.
  const caixas = podeEditar ? await contasAbertasParaCompras() : []

  return (
    <>
      <div>
        <VoltarLista chave="contratos" base="/painel/compras/contratos" rotulo="Contratos" />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight tabular-nums">
              {c.codigo ?? "(sem código)"}
            </h1>
            <VigenciaContratoBadge vigencia={c.vigencia} />
            <TiposContratoBadges
              aditivo={c.aditivo}
              sob_demanda={c.sob_demanda}
              apoio_institucional={c.apoio_institucional}
            />
          </div>
          {podeEditar && (
            <div className="flex flex-wrap gap-2">
              {/* Minuta e aditivo nascem daqui (um caminho só); os cartões deles
                  só aparecem quando há o que mostrar. */}
              <Button variant="outline" size="sm" asChild>
                <Link href={`/painel/compras/contratos/minutas/nova?contrato=${c.id}`}>
                  <FilePen />
                  Redigir minuta
                </Link>
              </Button>
              {podeTerAditivo && (
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/painel/compras/contratos/novo?principal=${c.id}`}>
                    <Plus />
                    Adicionar aditivo
                  </Link>
                </Button>
              )}
              <BotaoExcluirContrato contratoId={c.id} />
            </div>
          )}
        </div>
        <p className="text-muted-foreground mt-1 text-xs">
          {detalhe.fornecedorNome ?? "Sem fornecedor"}
          {c.created_at && <> · cadastrado em {formatarData(c.created_at)}</>}
        </p>
      </div>

      {brutos.salvo === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Alteração salva.</AlertDescription>
        </Alert>
      )}

      {brutos.geradas !== undefined && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>
            {Number(brutos.geradas) > 0
              ? brutos.tipoGerado === "avulso"
                ? "Pagamento avulso registrado — segue para a autorização pontual."
                : brutos.tipoGerado === "parcelas"
                  ? `${brutos.geradas} parcela(s) gerada(s) — já autorizadas pela autorização do contrato, aguardando a nota de cada competência.`
                  : `${brutos.geradas} ordem(ns) gerada(s) — as recorrentes já autorizadas, aguardando o documento fiscal; a única (extraordinária) segue para autorização.`
              : "Nenhuma ordem nova gerada."}
            {Number(brutos.puladas) > 0 &&
              ` ${brutos.puladas} vencimento(s) já tinham parcela e foram pulados.`}
          </AlertDescription>
        </Alert>
      )}

      {brutos.rpaExcluido === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>RPA excluído, junto com a ordem de pagamento dele.</AlertDescription>
        </Alert>
      )}

      {brutos.autorizado !== undefined && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>
            Contrato autorizado — as parcelas recorrentes passam a nascer autorizadas
            {Number(brutos.autorizado) > 0 ? `; ${brutos.autorizado} parcela(s) que já esperavam a nota foram autorizadas` : ""}.
          </AlertDescription>
        </Alert>
      )}

      {!detalhe.contrato.apoio_institucional && (
        // Legado do Bubble sem autorização registrada: aviso neutro, sem o
        // alerta (os de vigência continuam).
        <Alert
          variant={c.autorizado || c.legado ? "default" : "warning"}
          className={c.autorizado ? "border-success/40" : undefined}
        >
          <AlertDescription>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>
                {c.autorizado ? (
                  <>
                    <span className="font-medium">Contrato autorizado</span>
                    {autorizadorNome ? ` por ${autorizadorNome}` : ""}
                    {c.autorizadoEm ? ` em ${formatarData(c.autorizadoEm)}` : ""} — as parcelas recorrentes nascem
                    autorizadas e esperam só o documento fiscal. Pagamento extraordinário passa pela autorização pontual.
                  </>
                ) : c.legado ? (
                  <span className="text-muted-foreground">
                    Contrato do sistema anterior, sem autorização registrada. Para gerar parcelas recorrentes por
                    aqui, autorize-o; pagamento extraordinário passa pela autorização pontual.
                  </span>
                ) : (
                  <>
                    <span className="font-medium">Contrato ainda não autorizado.</span> Parcelas recorrentes só são
                    geradas depois da autorização; pagamento extraordinário pode ser gerado e passa pela autorização
                    pontual.
                  </>
                )}
              </span>
              {!c.autorizado && podeAutorizar && <AutorizarContrato contratoId={c.id} />}
            </div>
          </AlertDescription>
        </Alert>
      )}

      {brutos.ordemExcluida === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Ordem excluída — saiu do contrato e do Financeiro; a exclusão ficou no histórico dela.</AlertDescription>
        </Alert>
      )}

      {detalhe.aditivoOrfao && (
        <Alert variant="warning">
          <AlertDescription>
            Marcado como aditivo, mas sem contrato principal vinculado — vínculo
            não migrou do Bubble. Trata-se como contrato comum até a re-ligação
            na virada.
          </AlertDescription>
        </Alert>
      )}

      {detalhe.principal && (
        <Alert className="border-info/40 text-info-fg">
          <AlertDescription className="flex items-center gap-1.5">
            <LinkIcon className="size-3.5" />
            Aditivo do contrato{" "}
            <Link
              href={`/painel/compras/contratos/${detalhe.principal.id}`}
              className="font-medium tabular-nums underline"
            >
              {detalhe.principal.codigo ?? "(sem código)"}
            </Link>
            {detalhe.principal.objeto && ` — ${detalhe.principal.objeto}`}.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">Dados do contrato</CardTitle>
            {!editando && podeEditar && (
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" asChild>
                  <Link href={`${aqui}?editar=1`}>
                    <Pencil />
                    Editar
                  </Link>
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {editando && opcoes ? (
            <ContratoForm
              contrato={c}
              fornecedores={opcoes.fornecedores}
              departamentos={opcoes.departamentos}
              centrosCusto={opcoes.centrosCusto}
              usuarios={opcoes.usuarios}
              categorias={opcoes.categorias}
              aoCancelarHref={aqui}
            />
          ) : (
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="sm:col-span-2 lg:col-span-3">
                <dt className="text-muted-foreground text-xs">Objeto</dt>
                <dd className="mt-0.5 text-sm">{c.objeto ?? "—"}</dd>
              </div>
              <Campo rotulo="Fornecedor" valor={detalhe.fornecedorNome} />
              <Campo rotulo="Valor" valor={formatarMoeda(c.valor)} />
              <Campo
                rotulo="Vigência"
                valor={`${formatarData(c.vigencia_inicio)} – ${
                  c.vigencia_termino ? formatarData(c.vigencia_termino) : "sem termo"
                }`}
              />
              <Campo rotulo="Departamento" valor={detalhe.departamentoNome} />
              <Campo rotulo="Centro de custo" valor={detalhe.centroCustoNome} />
              <Campo rotulo="Responsável" valor={detalhe.responsavelNome} />
              <div>
                <dt className="text-muted-foreground text-xs">Categoria</dt>
                <dd className="mt-0.5 flex items-center gap-2 text-sm">
                  {detalhe.categoriaNome ?? "—"}
                  {detalhe.categoriaSigiloso && (
                    <Badge
                      variant="outline"
                      className="border-warning/40 text-warning-fg"
                    >
                      Sigilosa
                    </Badge>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">Arquivo</dt>
                <dd className="mt-0.5 text-sm">
                  {detalhe.arquivoUrl ? (
                    <Button variant="ghost" size="sm" asChild className="-ml-2">
                      <a
                        href={detalhe.arquivoUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <FileText />
                        Abrir PDF
                      </a>
                    </Button>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
            </dl>
          )}
        </CardContent>
      </Card>

      {podeEditar && minutas.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base">Minuta — o instrumento do contrato</CardTitle>
                <CardDescription>
                  O texto do contrato, redigido com a IA, revisado e assinado pelas partes
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
              <ul className="grid gap-1.5 text-sm">
                {minutas.map((m) => (
                  <li key={m.id} className="flex flex-wrap items-center gap-2">
                    <Link href={`/painel/compras/contratos/minutas/${m.id}`} className="font-medium hover:underline">
                      {m.titulo ?? m.tipo ?? "Minuta"}
                    </Link>
                    <span className="text-muted-foreground text-xs">
                      {m.finalizada ? "finalizada" : `rascunho · v${m.versao}`}
                      {m.pendencias > 0 ? ` · ${m.pendencias} a preencher` : ""}
                    </span>
                  </li>
                ))}
              </ul>
          </CardContent>
        </Card>
      )}

      {mostrarRpa && (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base">RPA — pagamento a autônomo</CardTitle>
                <CardDescription>
                  Emita o recibo do prestador (gera a ordem do líquido) e anexe aqui o RPA assinado no
                  papel ou pelo gov.br. O envio do link por e-mail e a trilha ficam na{" "}
                  <Link href="/painel/compras/rpa" className="text-primary hover:underline">
                    área RPA
                  </Link>
                  .
                </CardDescription>
              </div>
              {podeEditar && aceitaRpa && (
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/painel/compras/rpa/novo?contrato=${c.id}`}>
                    <ReceiptText />
                    Emitir RPA
                  </Link>
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {!rpaAtivo ? (
              <p className="text-warning-fg text-sm">
                Rode supabase/contratos-rpa.sql para ligar os RPAs aos contratos.
              </p>
            ) : rpas.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nenhum RPA emitido para este contrato.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nº</TableHead>
                    <TableHead>Serviço em</TableHead>
                    <TableHead className="text-right">Bruto</TableHead>
                    <TableHead className="text-right">Líquido</TableHead>
                    <TableHead>Ordem</TableHead>
                    <TableHead>Recibo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rpas.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="tabular-nums">
                        <Link
                          href={`/painel/compras/rpa/${r.id}`}
                          className="text-primary font-medium hover:underline"
                        >
                          {r.numero ?? "—"}
                        </Link>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {r.data_servico ? formatarData(r.data_servico) : "—"}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap tabular-nums">
                        {formatarMoeda(r.valor_bruto)}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap tabular-nums">
                        {formatarMoeda(r.valor_liquido)}
                      </TableCell>
                      <TableCell>
                        {r.ordemId ? <SituacaoBadge situacao={r.ordemSituacao} /> : "—"}
                      </TableCell>
                      <TableCell>
                        {r.arquivoAssinado ? (
                          <span className="text-success-fg text-sm">Assinado</span>
                        ) : podeEditar ? (
                          <AnexarRpaAssinadoBotao id={r.id} numero={r.numero} linkPendente={rpaComLink.has(r.id)} />
                        ) : (
                          <span className="text-muted-foreground text-sm">
                            {rpaComLink.has(r.id) ? "Link enviado" : "A assinar"}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {detalhe.aditivos.length > 0 && (
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base">Aditivos</CardTitle>
              <CardDescription>
                {detalhe.aditivos.length} aditivo(s) vinculado(s)
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ListaAditivos aditivos={detalhe.aditivos} />
        </CardContent>
      </Card>
      )}

      {/* Gerar ordens: um caminho só, "Nova ordem de pagamento" no cartão das ordens. */}
      {aguardandoDocumento.length > 0 && (
        <Card className="border-warning/40">
          <CardHeader>
            <CardTitle className="text-base">
              Aguardando documento fiscal
              <span className="text-muted-foreground ml-2 text-sm font-normal">
                {aguardandoDocumento.length}
              </span>
            </CardTitle>
            <CardDescription>
              Parcelas recorrentes ficam aqui, no contrato, até a nota da competência chegar.
              Com a nota, seguem para autorização — ou direto para pagamento, quando são a parcela
              fixa do contrato. Se a nota veio com outro valor, corrija antes de enviar.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vencimento</TableHead>
                  <TableHead>Parcela</TableHead>
                  <TableHead>Ordem</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  {podeEditar && <TableHead>Nota fiscal</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {aguardandoDocumento.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="whitespace-nowrap">{formatarData(o.vencimento)}</TableCell>
                    <TableCell className="font-medium whitespace-nowrap">
                      {o.natureza === "parcela" ? rotuloParcela(numeroParcela.get(o.id), totalParcelas) : "Avulso"}
                    </TableCell>
                    <TableCell className="max-w-72">
                      <Link
                        href={`/painel/financeiro/ordens/${o.id}`}
                        className="text-primary tabular-nums hover:underline"
                      >
                        {o.codigo ?? "(sem código)"}
                      </Link>
                      <span className="text-muted-foreground line-clamp-1 text-xs">{o.descricao}</span>
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap tabular-nums">
                      {formatarMoeda(o.valor)}
                    </TableCell>
                    {podeEditar && (
                      <TableCell>
                        <ReceberDocumentoForm contratoId={c.id} ordemId={o.id} valor={o.valor} />
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card id="ordens">
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <CardTitle className="text-base">Pagamentos do contrato</CardTitle>
              <CardDescription>
                {c.sob_demanda
                  ? "Contrato sob demanda: cada pagamento é avulso, conforme o serviço é pedido. Parcelas só se houver um valor fixo previsto."
                  : "Parcelas são os pagamentos previstos no contrato (1, 2, 3…). Pagamento avulso é o que fica fora delas: extraordinário ou sob demanda."}
              </CardDescription>
            </div>
            {podeEditar && !novaOrdem && (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant={c.sob_demanda ? "outline" : "default"} asChild>
                  <Link href={`${aqui}?novaOrdem=parcelas#ordens`}>
                    <CalendarRange />
                    Gerar parcelas
                  </Link>
                </Button>
                <Button size="sm" variant={c.sob_demanda ? "default" : "outline"} asChild>
                  <Link href={`${aqui}?novaOrdem=avulso#ordens`}>
                    <Plus />
                    {c.sob_demanda ? "Pagamento sob demanda" : "Pagamento avulso"}
                  </Link>
                </Button>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="grid gap-6">
          {novaOrdem && (
            <div className="rounded-lg border p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">
                    {novaOrdem === "parcelas" ? "Gerar parcelas" : c.sob_demanda ? "Pagamento sob demanda" : "Pagamento avulso"}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {novaOrdem === "parcelas"
                      ? "Os pagamentos previstos no contrato, numerados na sequência das parcelas que já existem."
                      : "Um pagamento fora das parcelas: diga o que ele paga."}
                  </p>
                </div>
                <Button variant="ghost" size="sm" asChild>
                  <Link href={`${aqui}#ordens`}>Fechar</Link>
                </Button>
              </div>
              <GerarOrdensForm
                key={novaOrdem}
                modo={novaOrdem}
                parcelasExistentes={totalParcelas}
                contratoId={c.id}
                valorPadrao={c.valor}
                vigenciaInicio={c.vigencia_inicio}
                vigenciaTermino={c.vigencia_termino}
                hoje={hojeLocalISO()}
                ultimoVencimento={ultimoVencimento}
                temFornecedor={Boolean(c.fornecedor_id)}
                fornecedorId={c.fornecedor_id}
                caixas={caixas}
              />
            </div>
          )}

          {detalhe.ordens.length > 0 && (
            <div className="grid grid-cols-3 gap-3">
              <ResumoOrdens rotulo="Previsto" valor={detalhe.ordensResumo.previsto} />
              <ResumoOrdens rotulo="Pago" valor={detalhe.ordensResumo.pago} className="text-success-fg" />
              <ResumoOrdens rotulo="Em aberto" valor={detalhe.ordensResumo.aberto} className="text-warning-fg" />
            </div>
          )}

          {avulsosRepetidos >= 2 && podeEditar && (
            <Alert variant="warning">
              <AlertDescription>
                Há {avulsosRepetidos} pagamentos avulsos do mesmo valor em meses diferentes. Se são as mensalidades
                do contrato, eles são <strong>parcelas</strong>: use <strong>É parcela</strong> na linha de cada um e,
                daqui para frente, <strong>Gerar parcelas</strong> — elas nascem autorizadas pelo contrato e esperam só
                a nota de cada mês.
              </AlertDescription>
            </Alert>
          )}

          {temExcluivel && <ExclusaoOrdensBarra formId={FORM_EXCLUSAO} contratoId={c.id} />}

          <section className="grid gap-2" aria-labelledby="titulo-parcelas">
            <h3 id="titulo-parcelas" className="text-sm font-semibold">
              Parcelas
              <span className="text-muted-foreground ml-2 font-normal">
                {totalParcelas === 0
                  ? "nenhuma"
                  : `${totalParcelas} · ${parcelasPagas} paga${parcelasPagas === 1 ? "" : "s"} · ${totalParcelas - parcelasPagas} a pagar`}
              </span>
            </h3>
            {parcelas.length === 0 ? (
              <p className="text-muted-foreground rounded-md border border-dashed px-3 py-4 text-center text-sm">
                {c.sob_demanda
                  ? "Contrato sob demanda: sem parcelas fixas."
                  : podeEditar
                    ? "Nenhuma parcela gerada. Use “Gerar parcelas” para lançar os pagamentos previstos no contrato."
                    : "Nenhuma parcela gerada."}
              </p>
            ) : (
              <>
                <TabelaOrdens
                  linhas={pagOrdens.linhas.map((o) => ({
                    o,
                    rotulo:
                      o.situacao === "Cancelada" ? "Cancelada" : rotuloParcela(numeroParcela.get(o.id), totalParcelas),
                    excluivel: excluivel(o),
                    mexivel: mexivel(o),
                    anexavel: anexavel(o),
                    trocarPara: reclassificavel(o) ? "avulso" : null,
                  }))}
                  colunaRotulo="Parcela"
                  objeto={c.objeto}
                  contratoId={c.id}
                  formExclusao={FORM_EXCLUSAO}
                  comMarcacao={temExcluivel}
                  comAcoes={podeEditar}
                />
                <Paginacao
                  total={pagOrdens.total}
                  pagina={pagOrdens.pagina}
                  totalPaginas={pagOrdens.totalPaginas}
                  porPagina={paginacao.porPagina}
                  padrao={10}
                />
              </>
            )}
          </section>

          <section className="grid gap-2" aria-labelledby="titulo-avulsos">
            <h3 id="titulo-avulsos" className="text-sm font-semibold">
              Pagamentos avulsos
              <span className="text-muted-foreground ml-2 font-normal">
                {avulsos.length === 0
                  ? "nenhum"
                  : `${avulsos.length} · fora das parcelas (extraordinário, sob demanda, RPA)`}
              </span>
            </h3>
            {avulsos.length === 0 ? (
              <p className="text-muted-foreground rounded-md border border-dashed px-3 py-4 text-center text-sm">
                Nenhum pagamento avulso.
              </p>
            ) : (
              <TabelaOrdens
                linhas={avulsos.map((o) => ({
                  o,
                  rotulo: o.tipo === TIPO_ORDEM_RPA ? "RPA" : o.processo_compra_id ? "Compra" : "Avulso",
                  excluivel: excluivel(o),
                  mexivel: mexivel(o),
                  anexavel: anexavel(o),
                  trocarPara: reclassificavel(o) ? "parcela" : null,
                }))}
                colunaRotulo="Tipo"
                objeto={c.objeto}
                contratoId={c.id}
                formExclusao={FORM_EXCLUSAO}
                comMarcacao={temExcluivel}
                comAcoes={podeEditar}
              />
            )}
          </section>

          {anteriores.length > 0 && (
            <details>
              <summary className="cursor-pointer text-sm font-semibold">
                Do sistema anterior
                <span className="text-muted-foreground ml-2 font-normal">
                  {anteriores.length} ordem(ns) sem a informação de parcela ou avulso
                  {podeEditar ? " — classifique na linha, se precisar" : ""}
                </span>
              </summary>
              <div className="mt-2">
                <TabelaOrdens
                  linhas={anteriores.map((o) => ({
                    o,
                    rotulo: "—",
                    excluivel: excluivel(o),
                    mexivel: mexivel(o),
                    anexavel: anexavel(o),
                    trocarPara: reclassificavel(o) ? "ambos" : null,
                  }))}
                  colunaRotulo="Tipo"
                  objeto={c.objeto}
                  contratoId={c.id}
                  formExclusao={FORM_EXCLUSAO}
                  comMarcacao={temExcluivel}
                  comAcoes={podeEditar}
                />
              </div>
            </details>
          )}
        </CardContent>
      </Card>
    </>
  )
}

function Campo({ rotulo, valor }: { rotulo: string; valor: string | null }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{rotulo}</dt>
      <dd className="mt-0.5 text-sm">{valor ?? "—"}</dd>
    </div>
  )
}

function ResumoOrdens({
  rotulo,
  valor,
  className,
}: {
  rotulo: string
  valor: number
  className?: string
}) {
  return (
    <div className="border-border rounded-md border p-3">
      <p className="text-muted-foreground text-xs">{rotulo}</p>
      <p className={`mt-0.5 text-lg font-semibold tabular-nums ${className ?? ""}`}>
        {formatarMoeda(valor)}
      </p>
    </div>
  )
}

type LinhaTabelaOrdem = {
  o: ContratoDetalhe["ordens"][number]
  /** "Parcela 3 de 12", "Avulso", "RPA"… */
  rotulo: string
  excluivel: boolean
  mexivel: boolean
  anexavel: boolean
  /** Reclassificar: para parcela, para avulso, ou os dois (ordem do sistema anterior). */
  trocarPara: "parcela" | "avulso" | "ambos" | null
}

/** Uma tabela de ordens do contrato — a de parcelas, a de avulsos, a do sistema anterior. */
/**
 * O que diferencia a ordem na tabela: sem o objeto do contrato (igual em todas),
 * sem "parcela X/N" (a coluna Parcela é quem numera — a descrição antiga contava
 * por geração) e sem o vencimento (tem coluna própria).
 */
function descricaoCurta(descricao: string | null, objeto: string | null): string | null {
  if (!descricao) return null
  let d = descricao
  if (objeto && d.startsWith(objeto)) d = d.slice(objeto.length)
  d = d
    .replace(/\s*—?\s*parcela \d+(\/\d+)?/i, "")
    .replace(/,?\s*venc\. \d{2}\/\d{2}\/\d{4}/i, "")
    .replace(/^\s*[—,:-]\s*/, "")
    .replace(/^pagamento avulso:?\s*/i, "")
    .trim()
  return d || null
}

function TabelaOrdens({
  linhas,
  colunaRotulo,
  objeto,
  contratoId,
  formExclusao,
  comMarcacao,
  comAcoes,
}: {
  linhas: LinhaTabelaOrdem[]
  colunaRotulo: string
  /** Objeto do contrato — tirado da descrição de cada linha. */
  objeto: string | null
  contratoId: string
  formExclusao: string
  comMarcacao: boolean
  comAcoes: boolean
}) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            {comMarcacao && (
              <TableHead className="w-8">
                <MarcarTodasOrdens formId={formExclusao} />
              </TableHead>
            )}
            <TableHead>{colunaRotulo}</TableHead>
            <TableHead>Vencimento</TableHead>
            <TableHead className="text-right">Valor</TableHead>
            <TableHead>Situação</TableHead>
            <TableHead>Ordem / descrição</TableHead>
            <TableHead>Nota</TableHead>
            {comAcoes && <TableHead className="text-right">Ações</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {linhas.map(({ o, rotulo, excluivel, mexivel, anexavel, trocarPara }) => (
            <TableRow key={o.id} className={o.situacao === "Cancelada" ? "opacity-60" : undefined}>
              {comMarcacao && (
                <TableCell>
                  {excluivel && (
                    <input
                      type="checkbox"
                      name="ordem_ids"
                      value={o.id}
                      form={formExclusao}
                      aria-label={`Marcar a ordem ${o.codigo ?? ""} para excluir`}
                      className="size-4 align-middle"
                    />
                  )}
                </TableCell>
              )}
              <TableCell className="whitespace-nowrap">
                {/^Parcela \d+ de \d+$/.test(rotulo) ? (
                  <span className="whitespace-nowrap">
                    <span className="font-semibold">{rotulo.replace(/ de \d+$/, "")}</span>
                    <span className="text-muted-foreground text-xs"> de {rotulo.replace(/^.* de /, "")}</span>
                  </span>
                ) : (
                  <span className="font-medium">{rotulo}</span>
                )}
              </TableCell>
              <TableCell className="whitespace-nowrap">
                {o.data_pagamento ? (
                  <>
                    {formatarData(o.vencimento)}
                    <span className="text-muted-foreground block text-xs">paga em {formatarData(o.data_pagamento)}</span>
                  </>
                ) : (
                  formatarData(o.vencimento)
                )}
              </TableCell>
              <TableCell className="text-right whitespace-nowrap tabular-nums">{formatarMoeda(o.valor)}</TableCell>
              <TableCell>
                <SituacaoBadge situacao={o.situacao} />
              </TableCell>
              <TableCell className="max-w-80">
                <Link
                  href={`/painel/financeiro/ordens/${o.id}`}
                  className="text-primary text-xs whitespace-nowrap tabular-nums hover:underline"
                >
                  {o.codigo ?? "(sem código)"}
                </Link>
                {o.processo_compra_id ? (
                  <Link
                    href={`/painel/compras/${o.processo_compra_id}`}
                    className="text-muted-foreground block text-xs hover:underline"
                  >
                    compra {o.processoCodigo ?? ""}
                  </Link>
                ) : (
                  descricaoCurta(o.descricao, objeto) && (
                    <span className="text-muted-foreground line-clamp-1 text-xs" title={o.descricao ?? undefined}>
                      {descricaoCurta(o.descricao, objeto)}
                    </span>
                  )
                )}
              </TableCell>
              <TableCell className="whitespace-nowrap">
                {o.temNota ? (
                  <Link
                    href={`/painel/financeiro/ordens/${o.id}`}
                    className="text-success-fg inline-flex items-center gap-1 text-xs hover:underline"
                    title="A nota está na ordem — abrir"
                  >
                    <FileText className="size-3.5" />
                    Anexada
                  </Link>
                ) : anexavel ? (
                  <AnexarNotaOrdem contratoId={contratoId} ordem={{ id: o.id, codigo: o.codigo }} />
                ) : (
                  <span className="text-muted-foreground text-xs">
                    {o.situacao === "Aguardando documento fiscal" ? "no quadro acima" : "—"}
                  </span>
                )}
              </TableCell>
              {comAcoes && (
                <TableCell>
                  <div className="flex flex-wrap items-center justify-end gap-1">
                    {(trocarPara === "parcela" || trocarPara === "ambos") && o.situacao !== "Cancelada" && (
                      <ClassificarOrdem contratoId={contratoId} ordem={{ id: o.id, codigo: o.codigo }} para="parcela" />
                    )}
                    {(trocarPara === "avulso" || trocarPara === "ambos") && o.situacao !== "Cancelada" && (
                      <ClassificarOrdem contratoId={contratoId} ordem={{ id: o.id, codigo: o.codigo }} para="avulso" />
                    )}
                    {mexivel && (
                      <AcoesLinhaOrdem
                        contratoId={contratoId}
                        ordem={{
                          id: o.id,
                          codigo: o.codigo,
                          descricao: o.descricao,
                          valor: o.valor,
                          vencimento: o.vencimento,
                          situacao: o.situacao,
                        }}
                      />
                    )}
                  </div>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
