import type { Metadata } from "next"
import { Suspense } from "react"

import {
  CartaoAgenda,
  CartaoInscricoesAbertas,
  CartaoNoticias,
  CartaoVotacoes,
  EsqueletoCartao,
} from "@/components/portal/inicio/blocos-agenda"
import { EsqueletoMinhaSituacao, MinhaSituacao } from "@/components/portal/inicio/minha-situacao"
import { EsqueletoNovidades, Novidades } from "@/components/portal/inicio/novidades"
import { PendenciasInicio } from "@/components/portal/inicio/pendencias-inicio"
import { ServicosInicio } from "@/components/portal/inicio/servicos-inicio"
import { nomeEntidade } from "@/lib/db/organizacao"
import { requireVisualizacaoPortal } from "@/lib/visualizacao-filiado"

export const metadata: Metadata = {
  title: "Portal do Associado — Confluir",
}

/**
 * Início do portal do associado (onda 2 da avaliação de 11/10/2026). A ordem
 * é a do que pede atenção: saudação → pendências que pedem ação (votação,
 * oposição, avaliação da hospedagem, filiação coletiva e, no topo da faixa
 * seguinte, a contribuição com problema) → Minha situação (A2) → Novidades
 * (A33, A96) → serviços → notícias e agenda.
 *
 * Cada bloco carrega no seu próprio Suspense e trata a própria falha (A69):
 * a saudação e os atalhos aparecem na hora, e uma consulta que cai ou demora
 * some sozinha em vez de levar a página para a tela de erro. No "Ver como
 * filiado" nada grava — nem as avaliações pendentes, nem a leitura dos avisos.
 */
export default async function PortalInicioPage() {
  const { filiado, preview } = await requireVisualizacaoPortal()
  const nome = filiado.nome_completo ?? "Associado(a)"
  // A saudação nunca depende de consulta que possa falhar.
  const entidade = await nomeEntidade().catch(() => null)

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Olá, {nome.split(" ")[0]}</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          {entidade ? `Bem-vindo(a) ao portal do associado — ${entidade}.` : "Bem-vindo(a) ao portal do associado."}
        </p>
      </div>

      {/* Sem pendência é o caso comum: nada a reservar enquanto carrega. */}
      <Suspense fallback={null}>
        <PendenciasInicio filiado={filiado} preview={preview} />
      </Suspense>

      <Suspense fallback={<EsqueletoMinhaSituacao />}>
        <MinhaSituacao filiado={filiado} />
      </Suspense>

      <Suspense fallback={<EsqueletoNovidades />}>
        <Novidades filiado={filiado} />
      </Suspense>

      <ServicosInicio />

      <div className="grid items-start gap-4 md:grid-cols-2">
        <Suspense fallback={<EsqueletoCartao />}>
          <CartaoNoticias />
        </Suspense>
        <Suspense fallback={null}>
          <CartaoInscricoesAbertas cpf={filiado.cpf} />
        </Suspense>
        <Suspense fallback={null}>
          <CartaoVotacoes cpf={filiado.cpf} />
        </Suspense>
        <Suspense fallback={null}>
          <CartaoAgenda />
        </Suspense>
      </div>
    </>
  )
}
