import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  CamposItemViagem,
  SituacaoViagemBadge,
  TituloItemViagem,
} from "@/components/viagens"
import { requirePermissao } from "@/lib/auth"
import { listarFornecedores } from "@/lib/db/compras"
import { buscarViagem } from "@/lib/db/viagens"
import { urlVoucher } from "@/lib/db/viagens-atendimento"
import { formatarCnpjCpf, formatarData, formatarDataHora, formatarMoeda } from "@/lib/formato"
import { ROTULO_BENEFICIARIO } from "@/lib/viagens-constantes"

import { AcoesViagem, ItemAtendimento, ReservaItemForm } from "./atendimento"

export const metadata: Metadata = { title: "Viagem — Confluir" }

/** Uma viagem na gestão: os dados de quem viaja, a reserva de cada item e o fecho. */
export default async function ViagemGestaoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ salvo?: string }>
}) {
  await requirePermissao("viagens_gestao")
  const [{ id }, { salvo }] = await Promise.all([params, searchParams])
  const viagem = await buscarViagem(id)
  if (!viagem) notFound()

  const encerrada = viagem.situacao === "cancelada" || viagem.situacao === "recusada"
  const [fornecedores, vouchers] = await Promise.all([
    encerrada ? Promise.resolve([]) : listarFornecedores(),
    Promise.all(viagem.itens.map(async (i) => [i.id, await urlVoucher(i.voucher)] as const)),
  ])
  const urls = new Map(vouchers)
  const convidado = viagem.beneficiarioTipo === "convidado"
  const pendentes = viagem.itens.filter((i) => !i.reservado).length
  const total = viagem.itens.reduce((s, i) => s + (i.valor ?? 0), 0)

  return (
    <>
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2">
          <Link href="/painel/viagens">
            <ArrowLeft />
            Passagens e hospedagens
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            Viagem nº {viagem.numero ?? "—"}
          </h1>
          <SituacaoViagemBadge situacao={viagem.situacao} />
        </div>
        <p className="text-muted-foreground mt-1 text-xs">
          Pedida em {formatarDataHora(viagem.createdAt)}
          {viagem.solicitanteNome ? ` por ${viagem.solicitanteNome}` : ""}
          {viagem.atendidoEm &&
            ` · atendida em ${formatarDataHora(viagem.atendidoEm)}${viagem.atendidoPorNome ? ` por ${viagem.atendidoPorNome}` : ""}`}
          {!viagem.atendidoEm &&
            viagem.atendidoPorNome &&
            ` · com ${viagem.atendidoPorNome}`}
        </p>
      </div>

      {salvo === "1" && (
        <Alert variant="success">
          <AlertDescription>Viagem lançada.</AlertDescription>
        </Alert>
      )}
      {encerrada && viagem.motivoSituacao && (
        <Alert>
          <AlertDescription>
            {viagem.situacao === "recusada" ? "Recusada" : "Cancelada"}: {viagem.motivoSituacao}
          </AlertDescription>
        </Alert>
      )}

      <AcoesViagem id={viagem.id} situacao={viagem.situacao} pendentes={pendentes} />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Quem viaja</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <Campo
              rotulo="Nome"
              valor={`${viagem.beneficiarioNome} · ${ROTULO_BENEFICIARIO[viagem.beneficiarioTipo]}`}
            />
            {convidado && (
              <>
                <Campo
                  rotulo="CPF"
                  valor={viagem.convidadoCpf ? formatarCnpjCpf(viagem.convidadoCpf) : null}
                />
                <Campo
                  rotulo="Nascimento"
                  valor={
                    viagem.convidadoNascimento ? formatarData(viagem.convidadoNascimento) : null
                  }
                />
                <Campo rotulo="E-mail" valor={viagem.convidadoEmail} />
                <Campo rotulo="Telefone" valor={viagem.convidadoTelefone} />
              </>
            )}
            <Campo rotulo="Motivo" valor={viagem.motivo} />
            <Campo rotulo="Departamento que banca" valor={viagem.departamentoNome} />
            <Campo rotulo="Evento" valor={viagem.eventoTitulo} />
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <CardTitle className="text-base">Passagens e hospedagens</CardTitle>
            {total > 0 && (
              <span className="text-muted-foreground text-sm">
                Total reservado: <strong className="text-foreground">{formatarMoeda(total)}</strong>
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent className="grid gap-3">
          {viagem.itens.map((item, indice) => (
            <ItemAtendimento
              key={item.id}
              titulo={
                <>
                  <TituloItemViagem item={item} indice={indice} />
                  {item.faturaId && (
                    <Link
                      href={`/painel/viagens/faturas/${item.faturaId}`}
                      className="border-info/40 text-info-fg rounded-full border px-2 py-0.5 text-xs hover:underline"
                    >
                      Faturado
                    </Link>
                  )}
                </>
              }
              reservado={item.reservado}
              editavel={!encerrada && !item.faturaId}
              resumo={
                <CamposItemViagem item={item} voucherUrl={urls.get(item.id) ?? null} mostrarValor />
              }
            >
              <ReservaItemForm
                item={{
                  id: item.id,
                  fornecedorId: item.fornecedorId,
                  localizador: item.localizador,
                  reservaDescricao: item.reservaDescricao,
                  valor: item.valor,
                }}
                fornecedores={fornecedores.map((f) => ({
                  id: f.id,
                  nome: f.nome,
                  cnpj_cpf: f.cnpj_cpf,
                  bloqueado: f.bloqueado,
                }))}
                temVoucher={!!item.voucher}
                tipo={item.tipo}
              />
            </ItemAtendimento>
          ))}
        </CardContent>
      </Card>
    </>
  )
}

function Campo({ rotulo, valor }: { rotulo: string; valor: string | null }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{rotulo}</dt>
      <dd>{valor ?? "—"}</dd>
    </div>
  )
}
