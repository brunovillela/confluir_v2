import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, FileSpreadsheet, FileText } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { podeNaOposicao, regrasDaCampanha, requireOposicao } from "@/lib/db/oposicao-regras"
import { obterCampanha } from "@/lib/db/oposicao"
import { relacaoPorEmpregador } from "@/lib/db/oposicao-gestao"
import { formatarCnpjCpf, formatarData, formatarDataHora } from "@/lib/formato"
import { MEIOS_ENVIO } from "@/lib/oposicao-constantes"

import { RegistrarEnvio } from "../../gestao-forms"

export const metadata: Metadata = { title: "Relação por empregador — Oposição — Confluir" }

/**
 * Relação das oposições aprovadas por fonte pagadora (onda 2, C7): o PDF e a
 * planilha para mandar ao RH, o registro de cada envio e o que entrou (ou
 * saiu, por re-decisão) depois do último envio.
 */
export default async function EmpregadoresOposicaoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const sessao = await requireOposicao("consultar", id)
  const { efetivas } = await regrasDaCampanha(id)
  const podeConfigurar = podeNaOposicao(sessao.permissoes, "configurar", efetivas.segregacao)
  const [campanha, relacao] = await Promise.all([obterCampanha(id), relacaoPorEmpregador(id)])
  if (!campanha) notFound()
  const aqui = `/painel/representacao/oposicao/${id}`
  const rotuloMeio = (m: string) => MEIOS_ENVIO.find((x) => x.chave === m)?.rotulo ?? m
  const pendentes = campanha.contagem.nao_avaliada + campanha.contagem.aguardando_documento

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href={aqui}>
            <ArrowLeft />
            {campanha.nome ?? "Campanha"}
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Relação por empregador</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Oposições <strong>aprovadas</strong>, por fonte pagadora. Gere o PDF ou a planilha, mande ao RH e registre o
          envio: o sistema guarda quem constava e mostra quem entrou depois.
        </p>
        {pendentes > 0 && (
          <p className="text-warning-fg mt-2 text-sm">
            Ainda há {pendentes.toLocaleString("pt-BR")} oposição(ões) não avaliadas ou aguardando a carta — elas não
            entram na relação até serem aprovadas.
          </p>
        )}
      </div>

      {relacao.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground py-8 text-center text-sm">
            Nenhuma oposição aprovada nesta campanha ainda.
          </CardContent>
        </Card>
      ) : (
        relacao.map((r) => {
          const empresa = r.empresaId ?? "sem"
          const ultimo = r.envios[0]
          return (
            <Card key={empresa}>
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">{r.nome}</CardTitle>
                    <CardDescription>
                      {r.cnpj && <>CNPJ {formatarCnpjCpf(r.cnpj)} · </>}
                      {r.aprovadas.toLocaleString("pt-BR")} aprovada(s)
                    </CardDescription>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {ultimo ? (
                      r.novas > 0 ? (
                        <Badge variant="outline" className="border-warning/50 text-warning-fg">
                          {r.novas.toLocaleString("pt-BR")} nova(s) desde o último envio
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Relação enviada em dia</Badge>
                      )
                    ) : (
                      <Badge variant="outline" className="border-warning/50 text-warning-fg">
                        Nunca enviada
                      </Badge>
                    )}
                    {r.saidas > 0 && (
                      <Badge variant="outline" className="border-error/50 text-error-fg">
                        {r.saidas.toLocaleString("pt-BR")} enviada(s) que deixaram de estar aprovadas
                      </Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="grid gap-4">
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" asChild disabled={r.aprovadas === 0}>
                    <a href={`${aqui}/empregadores/relacao?empresa=${empresa}`} target="_blank" rel="noreferrer">
                      <FileText />
                      PDF da relação
                    </a>
                  </Button>
                  <Button variant="outline" size="sm" asChild disabled={r.aprovadas === 0}>
                    <a href={`${aqui}/empregadores/relacao?empresa=${empresa}&formato=xlsx`} download>
                      <FileSpreadsheet />
                      Planilha
                    </a>
                  </Button>
                </div>
                {podeConfigurar && (
                  <RegistrarEnvio campanhaId={id} empresaId={r.empresaId} quantidade={r.aprovadas} />
                )}
                {r.envios.length > 0 && (
                  <div>
                    <p className="text-muted-foreground mb-1 text-xs font-medium">Envios registrados</p>
                    <ul className="grid gap-1 text-sm">
                      {r.envios.map((e) => (
                        <li key={e.id} className="flex flex-wrap gap-x-2">
                          <span className="tabular-nums">{formatarDataHora(e.enviadoEm)}</span>
                          <span>· {rotuloMeio(e.meio)}</span>
                          {e.referencia && <span>· {e.referencia}</span>}
                          <span>· {e.quantidade.toLocaleString("pt-BR")} oposição(ões)</span>
                          {e.usuarioNome && <span className="text-muted-foreground">· por {e.usuarioNome}</span>}
                          {e.observacao && <span className="text-muted-foreground">· {e.observacao}</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })
      )}
      {campanha.prazo_fim && (
        <p className="text-muted-foreground text-xs">Prazo da campanha: até {formatarData(campanha.prazo_fim)}.</p>
      )}
    </>
  )
}
