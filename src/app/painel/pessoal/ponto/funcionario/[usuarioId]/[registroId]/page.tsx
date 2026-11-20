import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, ExternalLink, Pencil } from "lucide-react"

import { RotuloTrilha } from "@/components/layout/trilha-rotulos"
import { CabecalhoFuncionario } from "@/components/pessoal/cabecalho-funcionario"
import { NavegacaoRegistro } from "@/components/pessoal/navegacao-registro"
import { VoltarLista } from "@/components/voltar-lista"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { texto } from "@/lib/db/comum"
import { urlArquivoPessoal } from "@/lib/db/pessoal"
import { funcionarioDaArea } from "@/lib/db/pessoal-area"
import { carregarBasePonto, rotuloCompetenciaPonto } from "@/lib/db/ponto-analise"
import { detalharDias, type MarcacoesEspelho } from "@/lib/db/ponto-marcacoes"
import { alertasDeUsoNasMarcacoes } from "@/lib/db/uso-fora-expediente"
import { formatarData, formatarDataHora } from "@/lib/formato"
import { descreverAjuste, lidoOriginal, textoDiaMarcado } from "@/lib/ponto-marcacoes-ajuste"
import { createAdminClient } from "@/lib/supabase/admin"

import { horas } from "../../../analise/componentes"
import { DesfazerBotao, MarcacoesEdicao } from "./marcacoes-edicao"
import { RecalcularHoras } from "./recalcular-horas"

export const metadata: Metadata = { title: "Registro de ponto — Confluir" }


/**
 * Nível 3 do Ponto: o funcionário naquele mês — horas, espelho, marcações dia
 * a dia com os alertas, ausências do mês; anterior/próximo na remessa e na pessoa.
 */
export default async function RegistroPontoPage({
  params,
  searchParams,
}: {
  params: Promise<{ usuarioId: string; registroId: string }>
  searchParams: Promise<{ de?: string; ajustar?: string }>
}) {
  const sessao = await requirePermissao("pessoal_gestao")
  const { usuarioId, registroId } = await params
  const sp = await searchParams
  const deRemessa = sp.de === "remessa"
  const abrirDia = /^\d{4}-\d{2}-\d{2}$/.test(sp.ajustar ?? "") ? sp.ajustar : undefined
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
      .is("cancelado_em", null).gte("data_falta", inicioMes).lte("data_falta", fimMes),
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

  const marcacoes = (reg.marcacoes ?? null) as MarcacoesEspelho | null
  // Uso do sistema fora do horário sem marcação que cubra o uso (19/11/2026).
  const [usoDoMes] = await alertasDeUsoNasMarcacoes([{ funcionarioId: usuarioId, marcacoes }]).catch(() => [undefined])
  const dias = detalharDias(marcacoes, usoDoMes)
  const ajustes = [...(marcacoes?.ajustes ?? [])].reverse()
  // Dia retirado à mão: some da tabela, então o "voltar ao espelho" fica no histórico (no ajuste mais recente).
  const retirados = new Set(
    ajustes
      .map((a) => a.data)
      .filter((d) => !dias.some((x) => x.data === d) && lidoOriginal(marcacoes, d))
  )
  const ultimoDoDia = new Map<string, number>()
  ajustes.forEach((a, i) => {
    if (!ultimoDoDia.has(a.data)) ultimoDoDia.set(a.data, i)
  })
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
      {deRemessa ? (
        // Volta à remessa como estava (página e itens por página), na linha deste registro.
        <VoltarLista
          chave={`ponto-remessa:${remessaId}`}
          base={voltar.href}
          rotulo={voltar.rotulo}
          ancora={`registro-${registroId}`}
          className="-ml-2 mb-1 self-start"
        />
      ) : (
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-1 self-start">
          <Link href={voltar.href}>
            <ArrowLeft />
            {voltar.rotulo}
          </Link>
        </Button>
      )}
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
                  <Link href={`/painel/pessoal/ponto/${remessaId}?editar=${registroId}#registro-${registroId}`}>
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
            [`Realizadas a ${base.faixas["70"]}`, reg.horas_realizadas_70],
            [`Pagas a ${base.faixas["70"]}`, reg.horas_pagas_70],
            [`Realizadas a ${base.faixas["100"]}`, reg.horas_realizadas_100],
            [`Pagas a ${base.faixas["100"]}`, reg.horas_pagas_100],
            [`Banco anterior (${base.faixas["70"]} + ${base.faixas["100"]})`, Number(reg.saldo_remessa_anterior_70 ?? 0) + Number(reg.saldo_remessa_anterior_100 ?? 0)],
            ["Banco ao fim do mês", analise.saldo],
          ].map(([rotulo, v]) => (
            <div key={String(rotulo)} className="rounded-md border px-3 py-2">
              <p className="text-muted-foreground text-xs">{rotulo}</p>
              <p className="text-lg font-semibold tabular-nums">{horas(Number(v ?? 0))}</p>
            </div>
          ))}
          {dias.length > 0 && (
            <div className="sm:col-span-2 lg:col-span-4">
              <RecalcularHoras
                registroId={registroId}
                faixa1={base.faixas["70"]}
                faixa2={base.faixas["100"]}
                bloqueado={remessa?.finalizada === true}
              />
            </div>
          )}
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
            {dias.length === 0 && " Dá para incluir os dias à mão."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <MarcacoesEdicao
            registroId={registroId}
            competencia={comp}
            abrir={abrirDia}
            dias={dias.map((d) => {
              const original = d.ajustado ? lidoOriginal(marcacoes, d.data) : undefined
              return { ...d, original: original ? textoDiaMarcado(original) : null }
            })}
          />
        </CardContent>
      </Card>

      {ajustes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Ajustes nas marcações</CardTitle>
            <CardDescription>O que foi corrigido, incluído, retirado ou conferido à mão, com o que era antes. Mais recente primeiro.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2 text-sm">
              {ajustes.map((a, i) => (
                <li key={i} className="rounded-md border px-3 py-2">
                  <span className="font-medium tabular-nums">{formatarData(a.data).slice(0, 5)}</span>
                  {" · "}
                  {descreverAjuste(a)}
                  {a.motivo && <span className="block text-xs">Motivo: {a.motivo}</span>}
                  {retirados.has(a.data) && ultimoDoDia.get(a.data) === i && (
                    <DesfazerBotao registroId={registroId} data={a.data} incluido={false} rotulo="Voltar ao espelho" />
                  )}
                  <span className="text-muted-foreground block text-xs">
                    {formatarDataHora(a.em)}
                    {a.porNome ? ` · ${a.porNome}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </>
  )
}
