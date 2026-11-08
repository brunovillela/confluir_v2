import Link from "next/link"
import { ArrowRight, UserMinus, UserPlus } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { pendenciasDeDesconto } from "@/lib/db/desconto-comunicacoes"
import { contatosDaFolha, quadroRepasse, regrasRepasse, tiposControlados, unidadeRepasse } from "@/lib/db/repasse"
import { regraEfetiva, rotuloCurto, TIPOS_CONTRIBUICAO } from "@/lib/repasse"

import { ContatosFolha, RegraEmpresaForm } from "@/app/painel/filiados/receitas/controle/formularios"
import { CelulaSituacao } from "@/app/painel/filiados/receitas/controle/situacao"

/**
 * "Desconto em folha" na aba Arrecadação do empregador (08/11/2026): como a
 * empresa manda a relação (os últimos 12 meses), o prazo dela e os contatos
 * da folha. O trabalho do dia a dia fica em Filiação → Receitas → Controle de
 * envio.
 */
export async function DescontoEmFolha({ empresaId, nome }: { empresaId: string; nome: string }) {
  const [unidade, regras] = await Promise.all([unidadeRepasse(empresaId), regrasRepasse()])
  if (!regras.disponivel) return null

  // Empresa de grupo centralizado que não é a pagadora: tudo fica na pagadora.
  if (unidade && unidade.id !== empresaId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Desconto em folha</CardTitle>
          <CardDescription>
            {nome} faz parte do grupo {unidade.grupo?.nome}, que repassa as contribuições de forma centralizada. A relação, o
            prazo e os contatos da folha ficam na empresa pagadora,{" "}
            <Link href={`/painel/representacao/empregadores/${unidade.id}?aba=arrecadacao`} className="text-primary font-medium hover:underline">
              {unidade.nome}
            </Link>
            .
          </CardDescription>
        </CardHeader>
      </Card>
    )
  }

  const [quadro, contatos, pendencias] = await Promise.all([
    quadroRepasse({ tipo: "Associativa", empresaId }),
    contatosDaFolha(empresaId),
    pendenciasDeDesconto(empresaId),
  ])
  const celulas = quadro.linhas[0]?.celulas ?? []
  const daEmpresa = regras.porEmpresa.get(empresaId) ?? {}
  const controlados = tiposControlados(regras)
  const tipos = TIPOS_CONTRIBUICAO.filter((t) => controlados.includes(t) || daEmpresa[t] || t === "Associativa")
  const inc = pendencias.itens.filter((i) => i.acao === "inclusao").length
  const exc = pendencias.itens.length - inc
  const controle = `/painel/filiados/receitas/controle/${empresaId}`

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">Desconto em folha</CardTitle>
            <CardDescription>Envio da relação de descontos da contribuição associativa, nos últimos 12 meses.</CardDescription>
          </div>
          <Link href={controle} className="text-primary inline-flex items-center gap-1 text-sm font-medium hover:underline">
            Controle de envio
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </CardHeader>
      <CardContent className="grid gap-6">
        {celulas.length > 0 && (
          <div className="-mx-6 overflow-x-auto px-6">
            <div className="flex gap-1">
              {celulas.map((c) => (
                <div key={c.competencia} className="grid gap-1 text-center">
                  <span className="text-muted-foreground text-[11px]">{rotuloCurto(c.competencia)}</span>
                  <CelulaSituacao celula={c} href={`${controle}?c=${c.competencia}`} />
                </div>
              ))}
            </div>
          </div>
        )}
        {(inc > 0 || exc > 0) && (
          <p className="flex flex-wrap items-center gap-4 text-sm">
            <span className="font-medium">A comunicar ao RH:</span>
            {inc > 0 && (
              <span className="inline-flex items-center gap-1">
                <UserPlus className="text-success-fg size-4" /> {inc} inclusão(ões)
              </span>
            )}
            {exc > 0 && (
              <span className="inline-flex items-center gap-1">
                <UserMinus className="text-destructive size-4" /> {exc} exclusão(ões)
              </span>
            )}
            <Link href={`${controle}#inclusoes`} className="text-primary font-medium hover:underline">
              Enviar
            </Link>
          </p>
        )}
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="grid content-start gap-4">
            <h3 className="text-sm font-medium">Prazos</h3>
            {tipos.map((t) => (
              <div key={t} className="grid gap-2 rounded-lg border p-3">
                <p className="text-sm font-medium">Contribuição {t.toLowerCase()}</p>
                <RegraEmpresaForm
                  empresaId={empresaId}
                  tipo={t}
                  efetiva={regraEfetiva(t, regras.geral[t], daEmpresa[t])}
                  geral={regraEfetiva(t, regras.geral[t])}
                />
              </div>
            ))}
            <p className="text-muted-foreground text-xs">
              A regra geral fica em Filiação → Receitas → Controle de envio → Prazos e tipos.
            </p>
          </div>
          <div className="grid content-start gap-4">
            <h3 className="text-sm font-medium">Contatos da folha</h3>
            <ContatosFolha empresaId={empresaId} contatos={contatos} />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
