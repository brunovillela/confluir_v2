import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, ExternalLink, Pencil } from "lucide-react"

import { RotuloTrilha } from "@/components/layout/trilha-rotulos"
import { CabecalhoFuncionario } from "@/components/pessoal/cabecalho-funcionario"
import { NavegacaoRegistro } from "@/components/pessoal/navegacao-registro"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { requirePermissao } from "@/lib/auth"
import { texto } from "@/lib/db/comum"
import { urlArquivoPessoal } from "@/lib/db/pessoal"
import { funcionarioDaArea } from "@/lib/db/pessoal-area"
import { carregarBasePonto, rotuloCompetenciaPonto } from "@/lib/db/ponto-analise"
import { detalharDias, type MarcacoesEspelho } from "@/lib/db/ponto-marcacoes"
import { formatarData } from "@/lib/formato"
import { createAdminClient } from "@/lib/supabase/admin"

import { horas } from "../../../analise/componentes"

export const metadata: Metadata = { title: "Registro de ponto — Confluir" }

const hm = (min: number) => `${Math.floor(min / 60)}h${String(min % 60).padStart(2, "0")}`

/**
 * Nível 3 do Ponto: o funcionário naquele mês — horas, espelho, marcações dia
 * a dia com os alertas, ausências do mês; anterior/próximo na remessa e na pessoa.
 */
export default async function RegistroPontoPage({
  params,
  searchParams,
}: {
  params: Promise<{ usuarioId: string; registroId: string }>
  searchParams: Promise<{ de?: string }>
}) {
  const sessao = await requirePermissao("pessoal_gestao")
  const { usuarioId, registroId } = await params
  const deRemessa = (await searchParams).de === "remessa"
  const admin = await createAdminClient()
  const [funcionario, base, { data: reg }] = await Promise.all([
    funcionarioDaArea(usuarioId),
    carregarBasePonto(),
    admin.from("pessoal_registro_ponto").select("*").eq("id", registroId).eq("funcionario_id", usuarioId).maybeSingle(),
  ])
  const analise = base.registros.find((r) => r.id === registroId)
  if (!funcionario || !reg || !analise) notFound()

  const remessaId = String(reg.remessa_id)
  const { data: remessa } = await admin
    .from("pessoal_registro_ponto_remessas")
    .select("id, nome_remessa, finalizada")
    .eq("id", remessaId)
    .maybeSingle()
  const comp = analise.competencia
  const [ano, mes] = comp.split("-").map(Number)
  const inicioMes = `${comp}-01`
  const fimMes = new Date(Date.UTC(ano, mes, 0)).toISOString().slice(0, 10)

  const [espelhoUrl, ats, aus, fjs] = await Promise.all([
    urlArquivoPessoal(texto(reg.arquivo)),
    admin.from("pes_atestados_medicos").select("id, inicio, termino, quantidade_dias").eq("funcionario_id", usuarioId)
      .lte("inicio", fimMes).gte("termino", inicioMes),
    admin.from("pessoal_ausencias").select("id, inicio, termino, motivo, observacao").eq("funcionario_id", usuarioId)
      .lte("inicio", fimMes).gte("termino", inicioMes),
    admin.from("pessoal_faltas_justificadas").select("id, data_falta, autorizado, recusado").eq("funcionario_id", usuarioId)
      .gte("data_falta", inicioMes).lte("data_falta", fimMes),
  ])
  const ausencias = [
    ...((ats.data ?? []) as Record<string, unknown>[]).map((a) => ({
      id: String(a.id),
      quando: `${formatarData(String(a.inicio))}${a.termino && a.termino !== a.inicio ? ` – ${formatarData(String(a.termino))}` : ""}`,
      oque: `Atestado médico${a.quantidade_dias ? ` (${a.quantidade_dias} dia(s))` : ""}`,
    })),
    ...((aus.data ?? []) as Record<string, unknown>[]).map((a) => ({
      id: String(a.id),
      quando: `${formatarData(String(a.inicio))}${a.termino && a.termino !== a.inicio ? ` – ${formatarData(String(a.termino))}` : ""}`,
      oque: `${texto(a.motivo) ?? "Ausência"}${texto(a.observacao) ? ` — ${a.observacao}` : ""}`,
    })),
    ...((fjs.data ?? []) as Record<string, unknown>[]).map((f) => ({
      id: String(f.id),
      quando: formatarData(String(f.data_falta)),
      oque: `Falta justificada${f.autorizado ? " (autorizada)" : f.recusado ? " (recusada)" : " (aguardando)"}`,
    })),
  ]

  const dias = detalharDias((reg.marcacoes ?? null) as MarcacoesEspelho | null)
  const comAlerta = dias.filter((d) => d.alertas.length).length

  // Navegação: na remessa (por nome) e na pessoa (por mês).
  const sufixo = deRemessa ? "?de=remessa" : ""
  const naRemessa = base.registros
    .filter((r) => r.remessaId === remessaId)
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
  const iR = naRemessa.findIndex((r) => r.id === registroId)
  const daPessoa = base.registros
    .filter((r) => r.funcionarioId === usuarioId)
    .sort((a, b) => a.competencia.localeCompare(b.competencia))
  const iP = daPessoa.findIndex((r) => r.id === registroId)
  const destino = (r: (typeof naRemessa)[number] | undefined, rotulo: string) =>
    r ? { href: `/painel/pessoal/ponto/funcionario/${r.funcionarioId}/${r.id}${sufixo}`, rotulo } : null

  const voltar = deRemessa
    ? { href: `/painel/pessoal/ponto/${remessaId}`, rotulo: remessa?.nome_remessa ?? "Remessa" }
    : { href: `/painel/pessoal/ponto/funcionario/${usuarioId}?ano=${comp.slice(0, 4)}`, rotulo: funcionario.nome }

  return (
    <>
      <RotuloTrilha valores={{ funcionario: "Funcionários", [usuarioId]: funcionario.nome, [registroId]: rotuloCompetenciaPonto(comp) }} />
      <Button variant="ghost" size="sm" asChild className="-ml-2 mb-1 self-start">
        <Link href={voltar.href}>
          <ArrowLeft />
          {voltar.rotulo}
        </Link>
      </Button>
      <CabecalhoFuncionario
        funcionario={funcionario}
        area="ponto"
        permissoes={sessao.permissoes}
        titulo={`${funcionario.nome} — ${rotuloCompetenciaPonto(comp)}`}
      />

      <NavegacaoRegistro
        eixos={[
          {
            titulo: `Na remessa (${iR + 1} de ${naRemessa.length})`,
            anterior: destino(naRemessa[iR - 1], naRemessa[iR - 1]?.nome ?? ""),
            proximo: destino(naRemessa[iR + 1], naRemessa[iR + 1]?.nome ?? ""),
          },
          {
            titulo: "Meses do funcionário",
            anterior: destino(daPessoa[iP - 1], daPessoa[iP - 1] ? rotuloCompetenciaPonto(daPessoa[iP - 1].competencia) : ""),
            proximo: destino(daPessoa[iP + 1], daPessoa[iP + 1] ? rotuloCompetenciaPonto(daPessoa[iP + 1].competencia) : ""),
          },
        ]}
      />

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">Horas do mês</CardTitle>
            <div className="flex flex-wrap gap-2">
              {espelhoUrl && (
                <Button variant="outline" size="sm" asChild>
                  <a href={espelhoUrl} target="_blank" rel="noreferrer">
                    <ExternalLink />
                    Espelho de ponto
                  </a>
                </Button>
              )}
              {remessa?.finalizada !== true && (
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/painel/pessoal/ponto/${remessaId}?editar=${registroId}`}>
                    <Pencil />
                    Editar
                  </Link>
                </Button>
              )}
            </div>
          </div>
          <CardDescription>
            Remessa{" "}
            <Link href={`/painel/pessoal/ponto/${remessaId}`} className="hover:underline">
              {remessa?.nome_remessa ?? rotuloCompetenciaPonto(comp)}
            </Link>
            {" · "}
            {reg.liberado === true ? "liberado ao funcionário" : "bloqueado (o funcionário ainda não vê)"}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Realizadas a 70%", reg.horas_realizadas_70],
            ["Pagas a 70%", reg.horas_pagas_70],
            ["Realizadas a 100%", reg.horas_realizadas_100],
            ["Pagas a 100%", reg.horas_pagas_100],
            ["Banco anterior (70% + 100%)", Number(reg.saldo_remessa_anterior_70 ?? 0) + Number(reg.saldo_remessa_anterior_100 ?? 0)],
            ["Banco ao fim do mês", analise.saldo],
          ].map(([rotulo, v]) => (
            <div key={String(rotulo)} className="rounded-md border px-3 py-2">
              <p className="text-muted-foreground text-xs">{rotulo}</p>
              <p className="text-lg font-semibold tabular-nums">{horas(Number(v ?? 0))}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      {ausencias.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ausências no mês</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-1 text-sm">
              {ausencias.map((a) => (
                <li key={a.id}>
                  <span className="text-muted-foreground tabular-nums">{a.quando}</span> · {a.oque}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Marcações dia a dia</CardTitle>
          <CardDescription>
            {dias.length
              ? `${dias.filter((d) => d.marcacoes.length >= 2).length} dia(s) trabalhado(s) · ${comAlerta} com alerta`
              : !analise.temEspelho
                ? "Sem espelho anexado."
                : analise.espelhoErro
                  ? analise.espelhoErro
                  : "Marcações ainda não lidas — use “Ler marcações dos espelhos” na aba Indicadores e resenha da remessa."}
          </CardDescription>
        </CardHeader>
        {dias.length > 0 && (
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Dia</TableHead>
                    <TableHead>Batidas</TableHead>
                    <TableHead className="text-right">Trabalhado</TableHead>
                    <TableHead className="text-right">Intervalo</TableHead>
                    <TableHead>Alertas</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dias.map((d) => (
                    <TableRow key={d.data} className={d.alertas.length ? "bg-warning/5" : d.marcacoes.length ? "" : "text-muted-foreground"}>
                      <TableCell className="whitespace-nowrap tabular-nums">
                        {formatarData(d.data).slice(0, 5)} {d.diaSemana}
                      </TableCell>
                      <TableCell className="tabular-nums">
                        {d.marcacoes.length ? d.marcacoes.join("  ") : (d.ocorrencia ?? "—")}
                        {d.marcacoes.length > 0 && d.ocorrencia && (
                          <span className="text-muted-foreground ml-2 text-xs">{d.ocorrencia}</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{d.trabalhadoMin ? hm(d.trabalhadoMin) : "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{d.intervaloMin !== null ? hm(d.intervaloMin) : "—"}</TableCell>
                      <TableCell className="whitespace-normal">
                        <div className="flex flex-wrap gap-1">
                          {d.alertas.map((a) => (
                            <Badge key={a} variant="warning">
                              {a}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        )}
      </Card>
    </>
  )
}
