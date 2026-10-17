import Link from "next/link"
import { BarChart3 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { EntregaAssembleia } from "@/lib/db/votacao-entrega"

const n = (v: number) => v.toLocaleString("pt-BR")
const pct = (v: number, total: number) => (total > 0 ? `${Math.round((v / total) * 100)}%` : "—")

/**
 * Entrega da votação pela internet (fase 4 do plano de 16/10/2026): link
 * pessoal, canal de acesso de quem votou e códigos por e-mail. Sem tocar no
 * voto — tudo sai da participação.
 */
export function EntregaCard({ e }: { e: EntregaAssembleia }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="grid gap-1">
            <CardTitle className="text-base">Entrega da votação pela internet</CardTitle>
            <CardDescription>
              Quem recebeu o link pessoal, por onde quem votou entrou e quantos códigos por e-mail os aptos pediram.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href="/painel/representacao/votacoes/entrega">
              <BarChart3 />
              Comparar assembleias
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="@container grid gap-4">
        <div className="grid grid-cols-2 gap-2 @2xl:grid-cols-4">
          <Numero
            rotulo="Receberam o link pessoal"
            valor={`${n(e.link.enviados)} de ${n(e.aptos)}`}
            dica={
              e.link.antesDaAbertura !== null
                ? `${n(e.link.antesDaAbertura)} antes da abertura`
                : `${pct(e.link.enviados, e.aptos)} dos aptos`
            }
          />
          <Numero
            rotulo="Votaram sem código"
            valor={n(e.semCodigo)}
            dica={
              e.semRegistro === e.votaram && e.votaram > 0
                ? "canal não registrado nestes votos"
                : `${pct(e.semCodigo, e.votaram - e.semRegistro)} de quem votou`
            }
          />
          <Numero
            rotulo="Códigos pedidos por aptos"
            valor={n(e.codigos.enviados)}
            dica={`para ${n(e.codigos.emails)} e-mail(s)`}
          />
          <Numero
            rotulo="Pediram código e não votaram"
            valor={n(e.codigos.pediramENaoVotaram)}
            destaque={e.codigos.pediramENaoVotaram > 0}
          />
        </div>

        <div className="grid gap-4 @2xl:grid-cols-2">
          <div className="grid content-start gap-1.5">
            <p className="text-sm font-medium">Por onde quem votou entrou</p>
            {e.porCanal.length === 0 ? (
              <p className="text-muted-foreground text-xs">Ninguém votou ainda.</p>
            ) : (
              e.porCanal.map((c) => (
                <Barra key={c.canal} rotulo={c.rotulo} valor={c.votos} total={e.votaram} />
              ))
            )}
            {e.semRegistro > 0 && (
              <p className="text-muted-foreground text-xs">
                &ldquo;Não registrado&rdquo;: votos de antes de 17/10/2026, quando o canal ainda não era gravado.
              </p>
            )}
          </div>
          <div className="grid content-start gap-1.5">
            <p className="text-sm font-medium">Códigos por domínio de e-mail</p>
            {e.codigos.porDominio.length === 0 ? (
              <p className="text-muted-foreground text-xs">Nenhum código pedido por aptos no período.</p>
            ) : (
              e.codigos.porDominio
                .slice(0, 6)
                .map((d) => <Barra key={d.dominio} rotulo={d.dominio} valor={d.codigos} total={e.codigos.enviados} />)
            )}
            <p className="text-muted-foreground text-xs">
              Muitos códigos para o domínio da empresa indicam firewall: reforce o link pessoal.
              {e.link.semEmail + e.link.falhas > 0 &&
                ` ${n(e.link.semEmail)} apto(s) sem e-mail e ${n(e.link.falhas)} falha(s) de envio.`}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function Numero({
  rotulo,
  valor,
  dica,
  destaque,
}: {
  rotulo: string
  valor: string
  dica?: string
  destaque?: boolean
}) {
  return (
    <div className="rounded-md border p-2.5">
      <p className="text-muted-foreground text-xs">{rotulo}</p>
      <p className={destaque ? "text-warning-fg text-xl font-semibold" : "text-xl font-semibold"}>{valor}</p>
      {dica && <p className="text-muted-foreground text-xs">{dica}</p>}
    </div>
  )
}

function Barra({ rotulo, valor, total }: { rotulo: string; valor: number; total: number }) {
  const p = total > 0 ? Math.round((valor / total) * 100) : 0
  return (
    <div className="grid gap-0.5">
      <div className="flex justify-between gap-2 text-xs">
        <span className="truncate">{rotulo}</span>
        <span className="text-muted-foreground tabular-nums">
          {n(valor)} · {p}%
        </span>
      </div>
      <div className="bg-muted h-1.5 overflow-hidden rounded-full">
        <div className="bg-primary h-full rounded-full" style={{ width: `${p}%` }} />
      </div>
    </div>
  )
}
