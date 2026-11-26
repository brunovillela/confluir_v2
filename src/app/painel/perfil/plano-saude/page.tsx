import type { Metadata } from "next"
import Link from "next/link"
import { AlertTriangle, ArrowLeft, HeartHandshake } from "lucide-react"

import { RotuloTrilha } from "@/components/layout/trilha-rotulos"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { requireSessaoPainel } from "@/lib/auth"
import { hojeSP } from "@/lib/db/comum"
import { meuPlanoDeSaude, type MesContrato } from "@/lib/db/plano-saude"
import { FAIXAS_ANS, moeda } from "@/lib/plano-saude"

export const metadata: Metadata = { title: "Meu plano de saúde — Confluir" }

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"]
const rotulo = (c: string) => `${MESES[Number(c.slice(5, 7)) - 1]} de ${c.slice(0, 4)}`

/**
 * MEU PLANO DE SAÚDE (25/11/2026): o titular vê o próprio plano — quem está
 * nele, a faixa etária e a mensalidade de cada um, quanto a entidade paga e
 * quanto é descontado no contracheque, neste mês e no seguinte (com o que
 * vai mudar). Só leitura e sempre da sessão: o usuário nunca vem da URL.
 */
export default async function MeuPlanoSaudePage() {
  const { usuario } = await requireSessaoPainel()
  const hoje = hojeSP()
  const planos = await meuPlanoDeSaude(String(usuario.id), hoje).catch(() => [])

  return (
    <>
      <RotuloTrilha valores={{ "plano-saude": "Meu plano de saúde" }} />
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/perfil">
            <ArrowLeft />
            Meu perfil
          </Link>
        </Button>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Meu plano de saúde</h1>
          <HeartHandshake className="text-muted-foreground size-5" />
        </div>
        <p className="text-muted-foreground mt-1 text-sm">
          Quem está no seu plano, a mensalidade de cada um pela faixa etária, quanto a entidade paga e quanto é descontado no seu
          contracheque. Dúvidas ou mudanças (incluir ou tirar alguém): fale com o departamento de pessoal.
        </p>
      </div>

      {planos.length === 0 && (
        <Alert>
          <AlertDescription>Você não está em nenhum plano de saúde da entidade.</AlertDescription>
        </Alert>
      )}

      {planos.map(({ atual, proximo }) => (
        <div key={atual.contrato.id} className="grid gap-4">
          <Mes titulo={`Neste mês — ${rotulo(hoje.slice(0, 7))}`} mes={atual} />
          <Proximo mes={proximo} />
        </div>
      ))}
    </>
  )
}

/** Só os alertas que dizem respeito ao titular (os de configuração ficam com o departamento de pessoal). */
const doTitular = (alertas: string[]) => alertas.filter((a) => a.startsWith("Perdeu o direito") || a.startsWith("Comprovante de estudante"))

function Mes({ titulo, mes }: { titulo: string; mes: MesContrato }) {
  const g = mes.grupos[0]
  return (
    <Card>
      <CardHeader>
        <CardTitle>{mes.contrato.nome}</CardTitle>
        <CardDescription>
          {mes.contrato.operadora} · {titulo}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {!g ? (
          <p className="text-muted-foreground text-sm">Ninguém no plano neste mês.</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-muted-foreground text-left text-xs">
                  <tr>
                    <th className="py-1.5 pr-3 font-medium">Quem</th>
                    <th className="py-1.5 pr-3 font-medium">Idade · faixa</th>
                    <th className="py-1.5 pr-3 text-right font-medium">Mensalidade</th>
                    <th className="py-1.5 pr-3 text-right font-medium">A entidade paga</th>
                    <th className="py-1.5 text-right font-medium">Você paga</th>
                  </tr>
                </thead>
                <tbody>
                  {g.linhas.map((l) => (
                    <tr key={l.beneficiario.id} className="border-t align-top">
                      <td className="py-1.5 pr-3">
                        {l.beneficiario.nome}
                        <span className="text-muted-foreground"> · {l.beneficiario.tipo === "titular" ? "você" : l.beneficiario.grau}</span>
                      </td>
                      <td className="py-1.5 pr-3 tabular-nums">
                        {l.idade === null ? "—" : `${l.idade} · ${l.faixa === null ? "—" : FAIXAS_ANS[l.faixa].rotulo}`}
                      </td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{moeda(l.mensalidade)}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{moeda(l.entidade)}</td>
                      <td className="py-1.5 text-right tabular-nums">{moeda(l.funcionario)}</td>
                    </tr>
                  ))}
                  {g.coparticipacao > 0 && (
                    <tr className="border-t">
                      <td className="py-1.5 pr-3" colSpan={2}>
                        Coparticipação do mês
                      </td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{moeda(g.coparticipacao)}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{moeda(g.entidadeCopart)}</td>
                      <td className="py-1.5 text-right tabular-nums">{moeda(g.descontoCopart)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="text-sm">
              Desconto no contracheque: <span className="font-semibold">{moeda(g.desconto)}</span>
            </p>
            {doTitular(g.alertas).length > 0 && (
              <Alert>
                <AlertTriangle />
                <AlertDescription>
                  {doTitular(g.alertas).join(" ")} O departamento de pessoal já vê este aviso; fale com ele se precisar.
                </AlertDescription>
              </Alert>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

function Proximo({ mes }: { mes: MesContrato }) {
  const g = mes.grupos[0]
  const mudou = [...mes.mudancas.values()].flat()
  if (!g && !mudou.length) return null
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">No mês que vem</CardTitle>
        <CardDescription>
          {mudou.length ? "O que muda pela faixa etária, pela tabela ou por entrada e saída do plano." : "Nada muda em relação a este mês."}
        </CardDescription>
      </CardHeader>
      {(mudou.length > 0 || g) && (
        <CardContent className="grid gap-2 text-sm">
          {mudou.length > 0 && (
            <ul className="list-disc pl-5">
              {mudou.map((m, i) => (
                <li key={i}>
                  {m.nome}: {m.texto}
                </li>
              ))}
            </ul>
          )}
          {g && (
            <p>
              Desconto previsto: <span className="font-semibold">{moeda(g.funcionario)}</span>
              <span className="text-muted-foreground"> (sem a coparticipação, que só se sabe com a fatura)</span>
            </p>
          )}
        </CardContent>
      )}
    </Card>
  )
}
