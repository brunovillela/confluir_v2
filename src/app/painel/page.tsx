import type { Metadata } from "next"
import { cookies } from "next/headers"
import Link from "next/link"
import { Suspense } from "react"
import { Car, Plane } from "lucide-react"

import { CaixaDeEntrada } from "@/components/layout/caixa-entrada"
import { AbasPainel, COOKIE_ABA, type ChaveAba } from "@/components/painel/abas-painel"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { requireSessaoPainel } from "@/lib/auth"
import { departamentosCoordenados } from "@/lib/db/coordenador"
import { quadroParaDiaria } from "@/lib/db/diarias-diretoria"
import { ehDiretor, temDecisoes } from "@/lib/db/diretor-home"
import { pendenciasDoUsuario } from "@/lib/db/pendencias"
import { buscarCondutorDoUsuario } from "@/lib/db/veiculos"
import { podeAcessar } from "@/lib/permissoes"

import { AbaCoordenacao } from "./_painel/aba-coordenacao"
import { AbaDia } from "./_painel/aba-dia"
import { AbaGestao } from "./_painel/aba-gestao"
import { CHAVES_INDICADORES, type VistaIndicadores } from "./_painel/aba-indicadores"

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

  const [pendencias, diretor, coordena, condutor, quadroViagem, jar] = await Promise.all([
    pendenciasDoUsuario(sessao),
    ehDiretor(sessao).catch(() => false),
    departamentosCoordenados(uid).catch(() => []),
    buscarCondutorDoUsuario(uid).catch(() => null),
    quadroParaDiaria(uid).catch(() => null),
    cookies(),
  ])
  const veIndicadores = podeAcessar(sessao.permissoes, "configuracoes", CHAVES_INDICADORES)

  const contagem = (aba: ChaveAba) =>
    pendencias.filter((p) => PENDENCIAS_DA_ABA[aba]?.includes(p.chave)).reduce((s, p) => s + p.quantidade, 0)
  const abas: { chave: ChaveAba; rotulo: string; contagem?: number }[] = [{ chave: "dia", rotulo: "Meu dia" }]
  if (coordena.length > 0) abas.push({ chave: "coordenacao", rotulo: "Coordenação", contagem: contagem("coordenacao") })
  // Gestão: quem é do mandato, quem decide (alçada, diárias) ou quem lê indicadores.
  if (diretor || temDecisoes(sessao) || veIndicadores) abas.push({ chave: "gestao", rotulo: "Gestão", contagem: contagem("gestao") })

  const disponivel = (c: string | undefined): c is ChaveAba => abas.some((a) => a.chave === c)
  const normalizar = (c: string | undefined) => (c && ABA_ANTIGA[c]) || c
  const pedida = normalizar(sp.aba)
  const lembrada = normalizar(jar.get(COOKIE_ABA)?.value)
  // Padrão por papel: quem coordena abre na coordenação; diretor, na gestão.
  const padrao: ChaveAba = disponivel("coordenacao") ? "coordenacao" : diretor && disponivel("gestao") ? "gestao" : "dia"
  const ativa: ChaveAba = disponivel(pedida) ? pedida : disponivel(lembrada) ? lembrada : padrao

  return (
    <div className="hud-fundo grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="hud-rotulo">{hojeExtenso()}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            {saudacao()}
            {nome ? `, ${nome}` : ""}
          </h1>
        </div>
        {(condutor || quadroViagem) && (
          <div className="flex flex-wrap gap-2">
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
          </div>
        )}
      </div>

      {sp.salvo && ativa === "dia" && (
        <Alert variant="success">
          <AlertDescription>Registro salvo.</AlertDescription>
        </Alert>
      )}

      <CaixaDeEntrada pendencias={pendencias} />

      <AbasPainel abas={abas} ativa={ativa} />

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
