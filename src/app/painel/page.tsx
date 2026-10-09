import type { Metadata } from "next"
import { cookies } from "next/headers"
import Link from "next/link"
import { Suspense } from "react"
import { Car, IdCard, Plane } from "lucide-react"

import { CaixaDeEntrada } from "@/components/layout/caixa-entrada"
import { AbasPainel, COOKIE_ABA, type ChaveAba } from "@/components/painel/abas-painel"
import { ClimaSedes } from "@/components/painel/clima"
import { CartaoHud } from "@/components/painel/hud"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { requireSessaoPainel } from "@/lib/auth"
import { climaDasSedes } from "@/lib/db/clima"
import { departamentosCoordenados } from "@/lib/db/coordenador"
import { quadroParaDiaria } from "@/lib/db/diarias-diretoria"
import { ehDiretor, temDecisoes } from "@/lib/db/diretor-home"
import { pendenciasCarimbadas } from "@/lib/db/pendencias-carimbadas"
import { buscarCondutorDoUsuario } from "@/lib/db/veiculos"
import { podeAcessar } from "@/lib/permissoes"

import { AbaCoordenacao } from "./_painel/aba-coordenacao"
import { AbaDia } from "./_painel/aba-dia"
import { AbaGestao } from "./_painel/aba-gestao"
import { CHAVES_INDICADORES, type VistaIndicadores } from "./_painel/aba-indicadores"
import { ConsultaFiliacao } from "./consulta-filiacao-widget"

export const metadata: Metadata = { title: "Painel — Confluir" }

function saudacao(): string {
  const hora = Number(
    new Intl.DateTimeFormat("pt-BR", { hour: "numeric", hour12: false, timeZone: "America/Sao_Paulo" }).format(new Date())
  )
  if (hora < 12) return "Bom dia"
  if (hora < 18) return "Boa tarde"
  return "Boa noite"
}

function hojeExtenso(): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "numeric", month: "long" }).format(new Date())
}

/** Chaves da caixa de entrada que contam no selo de cada aba. */
const PENDENCIAS_DA_ABA: Partial<Record<ChaveAba, string[]>> = {
  gestao: ["ordens", "assinaturas", "diarias", "diarias_diretoria"],
  coordenacao: ["coord_ferias", "coord_faltas", "coord_diarias"],
}

/** Endereços de antes da aba única (Diretor e Indicadores viraram Gestão). */
const ABA_ANTIGA: Record<string, ChaveAba> = { diretor: "gestao", indicadores: "gestao" }

/**
 * PAINEL UNIFICADO (06/10/2026): a home, a área do diretor, a da coordenação
 * e os indicadores numa página só. No topo, a caixa de entrada (o que espera
 * a pessoa agir); abaixo, as abas que o perfil dela tem — Meu dia para todos,
 * Coordenação para quem coordena e Gestão (decisões, a semana do mandato e
 * os indicadores, cada parte conforme a função e as permissões). Só a aba
 * aberta é carregada; a última escolhida fica num cookie.
 */
export default async function PainelPage({
  searchParams,
}: {
  searchParams: Promise<{ aba?: string; ver?: string; depto?: string; salvo?: string; atualizado?: string; erro?: string }>
}) {
  const sessao = await requireSessaoPainel()
  const sp = await searchParams
  const uid = sessao.usuario.id as string
  const nome = String(sessao.usuario.nome_guerra ?? sessao.usuario.nome_completo ?? "").split(" ")[0]

  // Pendências carimbadas: a caixa e os selos das abas comparam com as do
  // ContadoresProvider (layout e consulta periódica) e mostram a mais nova.
  const [pendencias, diretor, coordena, condutor, quadroViagem, clima, jar] = await Promise.all([
    pendenciasCarimbadas(sessao),
    ehDiretor(sessao).catch(() => false),
    departamentosCoordenados(uid).catch(() => []),
    buscarCondutorDoUsuario(uid).catch(() => null),
    quadroParaDiaria(uid).catch(() => null),
    climaDasSedes().catch(() => []),
    cookies(),
  ])
  const veIndicadores = podeAcessar(sessao.permissoes, "configuracoes", CHAVES_INDICADORES)

  const abas: { chave: ChaveAba; rotulo: string; pendencias?: string[] }[] = [{ chave: "dia", rotulo: "Meu dia" }]
  if (coordena.length > 0) abas.push({ chave: "coordenacao", rotulo: "Coordenação", pendencias: PENDENCIAS_DA_ABA.coordenacao })
  // Gestão: quem é do mandato, quem decide (alçada, diárias) ou quem lê indicadores.
  if (diretor || temDecisoes(sessao) || veIndicadores) abas.push({ chave: "gestao", rotulo: "Gestão", pendencias: PENDENCIAS_DA_ABA.gestao })

  const disponivel = (c: string | undefined): c is ChaveAba => abas.some((a) => a.chave === c)
  const normalizar = (c: string | undefined) => (c && ABA_ANTIGA[c]) || c
  const pedida = normalizar(sp.aba)
  const lembrada = normalizar(jar.get(COOKIE_ABA)?.value)
  // Padrão por papel: quem coordena abre na coordenação; diretor, na gestão.
  const padrao: ChaveAba = disponivel("coordenacao") ? "coordenacao" : diretor && disponivel("gestao") ? "gestao" : "dia"
  const ativa: ChaveAba = disponivel(pedida) ? pedida : disponivel(lembrada) ? lembrada : padrao

  return (
    <div className="hud-fundo grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="hud-rotulo">{hojeExtenso()}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            {saudacao()}
            {nome ? `, ${nome}` : ""}
          </h1>
        </div>
        {/* À direita, na linha do nome: os atalhos de pedido e o tempo nas sedes. */}
        <div className="flex flex-wrap items-center justify-end gap-2">
          {quadroViagem && (
            <Button asChild variant={condutor ? "outline" : "default"}>
              <Link href="/painel/perfil/viagens?novo=1">
                <Plane />
                Solicitar viagem
              </Link>
            </Button>
          )}
          {condutor && (
            <Button asChild>
              <Link href="/painel/solicitar-veiculo">
                <Car />
                Solicitar veículo
              </Link>
            </Button>
          )}
          <ClimaSedes cidades={clima} />
        </div>
      </div>

      {sp.salvo && ativa === "dia" && (
        <Alert variant="success">
          <AlertDescription>Registro salvo.</AlertDescription>
        </Alert>
      )}

      {ativa === "dia" ? (
        // No Meu dia, a consulta de filiação divide a linha com a caixa (3/4 + 1/4).
        <div className="grid gap-4 lg:grid-cols-4">
          <CaixaDeEntrada pendencias={pendencias} estreita className="lg:col-span-3" />
          <CartaoHud titulo="Consulta de filiação" descricao="Informa só a condição — não abre o cadastro" icone={IdCard}>
            <ConsultaFiliacao />
          </CartaoHud>
        </div>
      ) : (
        <CaixaDeEntrada pendencias={pendencias} />
      )}

      <AbasPainel abas={abas} ativa={ativa} pendencias={pendencias} />

      <Suspense key={`${ativa}-${sp.ver ?? ""}-${sp.depto ?? ""}`} fallback={<EsqueletoAba />}>
        {ativa === "coordenacao" ? (
          <AbaCoordenacao sessao={sessao} depto={sp.depto} salvo={sp.salvo} />
        ) : ativa === "gestao" ? (
          <AbaGestao
            sessao={sessao}
            veIndicadores={veIndicadores}
            vista={(sp.ver as VistaIndicadores) ?? "geral"}
            atualizado={sp.atualizado}
            erro={sp.erro}
          />
        ) : (
          <AbaDia sessao={sessao} />
        )}
      </Suspense>
    </div>
  )
}

function EsqueletoAba() {
  return (
    <div className="grid gap-4" aria-busy="true" aria-label="Carregando">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-48 rounded-xl" />
        ))}
      </div>
    </div>
  )
}
