import type { Metadata } from "next"
import { TileIndicador } from "@/components/graficos/tile"
import { hojeSP } from "@/lib/db/comum"
import { hhmm } from "@/lib/horas"
import { Clock4 } from "lucide-react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { TabelaDocumentosPessoal } from "@/components/tabela-documentos-pessoal"
import { VoltarPerfil } from "@/components/voltar-perfil"
import { requireSessaoPainel } from "@/lib/auth"
import { exigirFuncionario } from "@/lib/db/perfil"
import { meusDocumentosPessoal } from "@/lib/db/pessoal"
import { faixasHoraExtra } from "@/lib/db/ponto-config"
import { meusAjustesDePonto } from "@/lib/db/ponto-marcacoes"
import { formatarDataHora } from "@/lib/formato"
import { descreverAjuste } from "@/lib/ponto-marcacoes-ajuste"
import { lerPaginacao } from "@/lib/paginacao"

export const metadata: Metadata = { title: "Meu controle de ponto — Confluir" }

/** Autosserviço: espelhos de ponto liberados para o próprio funcionário. */
export default async function MeuPontoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const sessao = await requireSessaoPainel()
  // Área de funcionário: diretor e demais usuários sem vínculo com o sindicato voltam ao perfil.
  await exigirFuncionario(sessao.usuario.id as string)
  const [{ pontos }, faixas, ajustes] = await Promise.all([
    meusDocumentosPessoal(sessao.usuario.id),
    faixasHoraExtra(),
    meusAjustesDePonto(String(sessao.usuario.id)),
  ])
  const params = await searchParams
  const paginacao = lerPaginacao(params, 10)

  // Indicadores (padrão de 3 níveis): horas extras e banco, só dos espelhos liberados.
  const anoAtual = hojeSP().slice(0, 4)
  const anoDe = (nome: string | null, criado: string | null) => /(20\d{2})/.exec(nome ?? "")?.[1] ?? (criado ?? "").slice(0, 4)
  const doAno = pontos.filter((p) => anoDe(p.remessaNome, p.created_at) === anoAtual)
  const heAno = doAno.reduce((s, p) => s + (p.horas?.he70 ?? 0) + (p.horas?.he100 ?? 0), 0)
  const he100Ano = doAno.reduce((s, p) => s + (p.horas?.he100 ?? 0), 0)
  const h = (v: number) => hhmm(v)
  return (
    <>
      <VoltarPerfil />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Meu controle de ponto
        </h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Espelhos de ponto liberados pelo departamento de pessoal.
        </p>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <TileIndicador rotulo={`Horas extras em ${anoAtual}`} valor={h(heAno)} nota={`${h(he100Ano)} a ${faixas["100"]}`} />
        <TileIndicador
          rotulo="Meses com horas extras"
          valor={`${doAno.filter((p) => (p.horas?.he70 ?? 0) + (p.horas?.he100 ?? 0) > 0).length} de ${doAno.length}`}
        />
        <TileIndicador
          rotulo="Saldo de horas extras"
          valor={h(pontos[0]?.horas?.saldo ?? 0)}
          nota={
            pontos[0]?.horas
              ? `${h(pontos[0].horas.saldo70)} a ${faixas["70"]} · ${h(pontos[0].horas.saldo100)} a ${faixas["100"]} · ${pontos[0].remessaNome ?? ""}`
              : undefined
          }
        />
      </section>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Espelhos de ponto</CardTitle>
            <Clock4 className="text-muted-foreground size-4" />
          </div>
          <CardDescription>
            {pontos.length} liberado{pontos.length === 1 ? "" : "s"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TabelaDocumentosPessoal
            documentos={pontos}
            vazio="Nenhum espelho de ponto liberado para você ainda."
            paginacao={paginacao}
            prefixo=""
            faixas={faixas}
          />
        </CardContent>
      </Card>

      {ajustes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ajustes nas suas marcações</CardTitle>
            <CardDescription>
              O departamento de pessoal corrigiu estas marcações lidas do seu espelho de ponto. Cada linha mostra como
              estava e como ficou; a marcação original continua guardada. Se discordar de algum ajuste, fale com o
              departamento de pessoal.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {ajustes.map((m) => (
              <section key={m.registroId} className="grid gap-2">
                <h3 className="text-sm font-semibold">{m.remessa}</h3>
                <ul className="grid gap-2 text-sm">
                  {m.ajustes.map((a, i) => (
                    <li key={i} className="rounded-md border px-3 py-2">
                      <span className="font-medium tabular-nums">{a.data.split("-").reverse().slice(0, 2).join("/")}</span>
                      {" · "}
                      {descreverAjuste(a)}
                      {a.motivo && <span className="block text-xs">Motivo: {a.motivo}</span>}
                      <span className="text-muted-foreground block text-xs">
                        {formatarDataHora(a.em)}
                        {a.porNome ? ` · ${a.porNome}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </CardContent>
        </Card>
      )}
    </>
  )
}
