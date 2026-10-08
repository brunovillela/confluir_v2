import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ClipboardCheck,
  ClipboardList,
  ListChecks,
  PackageOpen,
  Plus,
  ScrollText,
  Truck,
} from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CartaoArea, GRADE_AREAS } from "@/components/cartao-area";
import { compacto, moeda, rotuloMes } from "@/components/graficos/base";
import { GraficoColunas } from "@/components/graficos/colunas";
import { BarraProporcao, GraficoRanking } from "@/components/graficos/ranking";
import { TileIndicador } from "@/components/graficos/tile";
import { requirePermissao } from "@/lib/auth";
import { listarDepartamentos, resumoCompras } from "@/lib/db/compras";
import { escopoComprasDoUsuario } from "@/lib/db/compras-acesso";
import {
  indicadoresCompras,
  PERIODOS_INDICADORES,
  type PeriodoIndicadores,
} from "@/lib/db/compras-indicadores";
import { resumoContratos } from "@/lib/db/contratos";
import { podeAcessar } from "@/lib/permissoes";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Aquisição — Confluir" };

type Params = {
  fora?: string;
  periodo?: string;
  atualizar?: string;
};

export default async function ComprasPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const sessao = await requirePermissao("aquisicoes_compras", [
    "aquisicoes_compras_edicao",
    "aquisicoes_compra_direta",
    "aquisicoes_avaliacoes",
    "aquisicoes_recebimentos",
    "aquisicoes_fornecedores",
    "aquisicoes_contratos",
  ]);
  const p = sessao.permissoes;

  const brutos = await searchParams;
  const periodo: PeriodoIndicadores =
    brutos.periodo && brutos.periodo in PERIODOS_INDICADORES
      ? (brutos.periodo as PeriodoIndicadores)
      : "12m";

  const escopo = await escopoComprasDoUsuario(sessao.usuario.id);
  const urlDoPeriodo = periodo === "12m" ? "/painel/compras" : `/painel/compras?periodo=${periodo}`;
  // "Atualizar agora": recalcula (o cache vale 10 min) e volta à URL limpa,
  // para um F5 depois não recalcular de novo.
  if (brutos.atualizar === "1") {
    await indicadoresCompras(escopo, periodo, true);
    redirect(urlDoPeriodo);
  }
  const [resumo, resumoContr, departamentos, { dados: ind, calculadoEm }] = await Promise.all([
    resumoCompras(escopo),
    resumoContratos(),
    escopo.todos ? Promise.resolve([]) : listarDepartamentos(),
    indicadoresCompras(escopo, periodo),
  ]);
  const nomesDosDepartamentos = departamentos
    .filter((d) => escopo.departamentoIds.includes(d.id))
    .map((d) => d.nome);

  // Criar exige escrita: "editar" (via Aquisição) ou a aquisição direta — a flag
  // base é só leitura e abria o botão para uma página sem acesso.
  const podeCriar = podeAcessar(p, "aquisicoes_compras_edicao", [
    "aquisicoes_compra_direta",
  ]);
  const veComprador = podeAcessar(p, "aquisicoes_comprador", [
    "aquisicoes_compras_edicao",
  ]);
  const veAvaliacoes = podeAcessar(p, "aquisicoes_avaliacoes");
  const veRecebimentos = podeAcessar(p, "aquisicoes_recebimentos", [
    "aquisicoes_compras_edicao",
  ]);
  const veFornecedores = podeAcessar(p, "aquisicoes_fornecedores", [
    "aquisicoes_compras_edicao",
  ]);
  const veContratos = podeAcessar(p, "aquisicoes_contratos", [
    "aquisicoes_contratos_edicao",
  ]);

  const processos = (q: Record<string, string>) =>
    `/painel/compras/processos?${new URLSearchParams(q).toString()}`;

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Aquisição</h1>
          <p className="text-muted-foreground mt-1 text-xs">
            Processos de aquisição: solicitação, cotação, compra, cobrança e
            recebimento
          </p>
        </div>
        {podeCriar && (
          <Button asChild>
            <Link href="/painel/compras/nova">
              <Plus />
              Nova compra
            </Link>
          </Button>
        )}
      </div>

      {brutos.fora && (
        <Alert variant="warning">
          <AlertDescription>
            Essa compra é de um departamento fora do seu alcance em Aquisição.
          </AlertDescription>
        </Alert>
      )}

      <div className={GRADE_AREAS}>
        <CartaoArea
          titulo="Processos de compra"
          descricao="Todas as compras que você vê, com filtros e exportação"
          href="/painel/compras/processos"
          icone={ListChecks}
        />
        {veComprador && (
          <CartaoArea
            titulo="Área do comprador"
            descricao="Processos Via Aquisição que aguardam sua ação"
            href="/painel/compras/comprador"
            icone={ClipboardList}
            indicador={
              resumo.emCotacao + resumo.aguardandoCompra > 0
                ? `${resumo.emCotacao + resumo.aguardandoCompra} a operar`
                : null
            }
          />
        )}
        {veAvaliacoes && (
          <CartaoArea
            titulo="Avaliações"
            descricao="Ordens de compra aguardando autorização por alçada"
            href="/painel/compras/avaliacoes"
            icone={ClipboardCheck}
            indicador={
              resumo.ordensEmAutorizacao > 0
                ? `${resumo.ordensEmAutorizacao} em autorização`
                : null
            }
          />
        )}
        {veRecebimentos && (
          <CartaoArea
            titulo="Recebimentos pendentes"
            descricao="Compras a receber — direta ou via Aquisição"
            href="/painel/compras/recebimentos"
            icone={PackageOpen}
            indicador={
              (resumo.aReceber ?? 0) > 0 ? `${resumo.aReceber} a receber` : null
            }
          />
        )}
        {veFornecedores && (
          <CartaoArea
            titulo="Fornecedores"
            descricao="Cadastro, contratos e dados dos fornecedores"
            href="/painel/compras/fornecedores"
            icone={Truck}
          />
        )}
        {veContratos && (
          <CartaoArea
            titulo="Contratos"
            descricao="Contratos vigentes e a geração de ordens"
            href="/painel/compras/contratos"
            icone={ScrollText}
            indicador={
              resumoContr.vencendo > 0 ? `${resumoContr.vencendo} vencendo` : null
            }
          />
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <CardResumo
          rotulo="Em cotação"
          valor={resumo.emCotacao}
          href={processos({ situacao: "em_cotacao" })}
        />
        <CardResumo
          rotulo="Cotadas (aguardando compra)"
          valor={resumo.aguardandoCompra}
          href={processos({ situacao: "cotada" })}
        />
        <CardResumo
          rotulo="Ordens em autorização"
          valor={resumo.ordensEmAutorizacao}
          href={veAvaliacoes ? "/painel/compras/avaliacoes" : undefined}
        />
        <CardResumo
          rotulo="Fornecimentos a receber"
          valor={resumo.aReceber ?? "—"}
          href={veRecebimentos ? "/painel/compras/recebimentos" : undefined}
        />
      </div>

      {resumo.aReceber === null && (
        <Alert variant="warning">
          <AlertDescription>
            Aquisição ainda não configurada por completo — rode{" "}
            <code>supabase/compras.sql</code> no SQL Editor do Supabase para
            habilitar cotações, fornecimentos e recebimentos.
          </AlertDescription>
        </Alert>
      )}

      {/* Indicadores analíticos: só o que a pessoa alcança (escopo). */}
      <section className="grid gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">
              Indicadores de compras
            </h2>
            <p className="text-muted-foreground text-xs">
              Compras efetivadas (sem as canceladas), pela data da compra
              {escopo.todos ? (
                " — toda a entidade"
              ) : (
                <>
                  {" "}
                  — de{" "}
                  <strong>
                    {nomesDosDepartamentos.join(", ") || "seus departamentos"}
                  </strong>{" "}
                  e as que você registrou
                </>
              )}
            </p>
            <p className="text-muted-foreground mt-0.5 text-xs">
              Números de{" "}
              {new Date(calculadoEm).toLocaleTimeString("pt-BR", {
                timeZone: "America/Sao_Paulo",
                hour: "2-digit",
                minute: "2-digit",
              })}{" "}
              (renovados a cada 10 min) ·{" "}
              <Link
                href={`${urlDoPeriodo}${urlDoPeriodo.includes("?") ? "&" : "?"}atualizar=1`}
                prefetch={false}
                scroll={false}
                className="text-primary hover:underline"
              >
                Atualizar agora
              </Link>
            </p>
          </div>
          <nav
            className="bg-muted inline-flex rounded-md p-0.5 text-sm"
            aria-label="Período"
          >
            {(Object.keys(PERIODOS_INDICADORES) as PeriodoIndicadores[]).map(
              (chave) => (
                <Link
                  key={chave}
                  href={chave === "12m" ? "/painel/compras" : `/painel/compras?periodo=${chave}`}
                  scroll={false}
                  aria-current={chave === periodo ? "page" : undefined}
                  className={cn(
                    "rounded px-3 py-1",
                    chave === periodo
                      ? "bg-background text-foreground font-medium shadow-xs"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {PERIODOS_INDICADORES[chave]}
                </Link>
              ),
            )}
          </nav>
        </div>

        {!ind ? (
          <Alert variant="warning">
            <AlertDescription>
              Indicadores indisponíveis — rode <code>supabase/compras.sql</code>.
            </AlertDescription>
          </Alert>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <TileIndicador
                rotulo="Total comprado"
                valor={compacto(ind.total, true)}
                sparkline={ind.porMes.map((m) => m.valor)}
                nota={moeda(ind.total)}
              />
              <TileIndicador
                rotulo="Compras"
                valor={ind.quantidade.toLocaleString("pt-BR")}
                sparkline={ind.porMes.map((m) => m.quantidade)}
              />
              <TileIndicador
                rotulo="Ticket médio"
                valor={moeda(ind.ticketMedio)}
              />
              <TileIndicador
                rotulo="Fornecedores"
                valor={ind.totalFornecedores.toLocaleString("pt-BR")}
                nota="distintos no período"
              />
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle className="text-base">Valor comprado por mês</CardTitle>
                  <CardDescription>
                    {PERIODOS_INDICADORES[periodo]} · passe o mouse para ver o
                    valor e a quantidade
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <GraficoColunas
                    titulo="Valor comprado por mês"
                    categorias={ind.porMes.map((m) => rotuloMes(m.mes))}
                    series={[
                      { nome: "Valor comprado", valores: ind.porMes.map((m) => m.valor) },
                    ]}
                    emMoeda
                  />
                </CardContent>
              </Card>

              <div className="grid content-start gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Por tipo</CardTitle>
                    <CardDescription>Bem / produto × prestação de serviço</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <BarraProporcao
                      titulo="Compras por tipo"
                      partes={[
                        ind.tipo.produto,
                        ind.tipo.servico,
                        { ...ind.tipo.semDado, outros: true },
                      ]}
                    />
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Por modalidade</CardTitle>
                    <CardDescription>Aquisição direta × via setor de compras</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <BarraProporcao
                      titulo="Compras por modalidade"
                      partes={[
                        ind.modalidade.direta,
                        ind.modalidade.via,
                        { ...ind.modalidade.semDado, outros: true },
                      ]}
                    />
                  </CardContent>
                </Card>
              </div>

            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Maiores fornecedores</CardTitle>
                  <CardDescription>Valor comprado · clique para ver as compras</CardDescription>
                </CardHeader>
                <CardContent>
                  <GraficoRanking
                    titulo="Maiores fornecedores"
                    itens={ind.fornecedores.map((f) => ({
                      ...f,
                      outros: f.chave === "outros",
                      href:
                        f.chave !== "outros" && f.chave !== "sem"
                          ? processos({ fornecedor: f.chave })
                          : undefined,
                    }))}
                  />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Por comprador</CardTitle>
                  <CardDescription>Quem efetivou a compra</CardDescription>
                </CardHeader>
                <CardContent>
                  <GraficoRanking
                    titulo="Compras por comprador"
                    itens={ind.compradores.map((f) => ({ ...f, outros: f.chave === "outros" }))}
                  />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Por departamento</CardTitle>
                  <CardDescription>Departamento solicitante</CardDescription>
                </CardHeader>
                <CardContent>
                  <GraficoRanking
                    titulo="Compras por departamento"
                    itens={ind.departamentos.map((f) => ({ ...f, outros: f.chave === "outros" }))}
                  />
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </section>
    </>
  );
}

function CardResumo({
  rotulo,
  valor,
  href,
}: {
  rotulo: string;
  valor: number | string;
  href?: string;
}) {
  const conteudo = (
    <CardContent>
      <p className="text-muted-foreground text-xs">{rotulo}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">
        {typeof valor === "number" ? valor.toLocaleString("pt-BR") : valor}
      </p>
    </CardContent>
  );
  if (!href) return <Card>{conteudo}</Card>;
  return (
    <Link href={href} className="group">
      <Card className="group-hover:border-primary/40 transition-colors">
        {conteudo}
      </Card>
    </Link>
  );
}
