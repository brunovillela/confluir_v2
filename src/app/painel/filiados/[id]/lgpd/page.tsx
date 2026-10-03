import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, ShieldOff } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { requirePermissao } from "@/lib/auth"
import { solicitacoesDaFiliacao } from "@/lib/db/lgpd"
import { formatarCnpjCpf, formatarData, formatarDataHora } from "@/lib/formato"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

import { AnonimizarForm } from "./lgpd-form"

export const metadata: Metadata = { title: "LGPD — Confluir" }

const ROTULO_TIPO: Record<string, string> = {
  anonimizacao: "Anonimização",
  exclusao: "Exclusão",
  portabilidade: "Portabilidade",
  acesso: "Acesso",
  correcao: "Correção",
}

export default async function LgpdFiliadoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermissao("filiacao_lgpd", ["configuracoes"])
  const { id } = await params
  const admin = await createAdminClient()
  const { data: f } = await admin
    .from("filiacoes")
    .select("id, nome_completo, cpf, anonimizada_em")
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (!f) notFound()
  const solicitacoes = await solicitacoesDaFiliacao(id)
  const anonimizada = Boolean(f.anonimizada_em)

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href={`/painel/filiados/${id}`}>
            <ArrowLeft />
            Ficha do filiado
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <ShieldOff className="text-muted-foreground size-5" />
          <h1 className="text-2xl font-semibold tracking-tight">LGPD: direito ao esquecimento</h1>
        </div>
        <p className="text-muted-foreground mt-1 text-xs">
          {f.nome_completo ?? "(sem nome)"}
          {f.cpf ? ` · CPF ${formatarCnpjCpf(String(f.cpf))}` : ""}
        </p>
      </div>

      {anonimizada ? (
        <Alert variant="info">
          <AlertDescription>
            Este cadastro foi anonimizado em {formatarDataHora(String(f.anonimizada_em))}. Os
            identificadores foram destruídos e não há como reverter.
          </AlertDescription>
        </Alert>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">O que a anonimização faz</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <div>
              <p className="font-medium">É destruído, sem volta</p>
              <ul className="text-muted-foreground list-disc pl-5">
                <li>Nome, CPF, nascimento, sexo, e-mails, telefones e endereço — em todos os registros desta pessoa.</li>
                <li>Telefones, endereços, dados bancários e contatos de emergência cadastrados à parte.</li>
                <li>A conta de acesso ao portal e a identidade de votação.</li>
                <li>IP e navegador registrados nos aceites de termos.</li>
              </ul>
            </div>
            <div>
              <p className="font-medium">Fica retido, com base legal</p>
              <ul className="text-muted-foreground list-disc pl-5">
                <li>A linha da filiação sem identificadores (matrícula, estatística e integridade dos dados).</li>
                <li>Vínculos e histórico de contribuições, sem como ligar à pessoa.</li>
                <li>O acervo de saúde ocupacional, com nome e CPF cifrados e desvinculados do cadastro (NR-07: 20 ou 40 anos).</li>
                <li>O registro de que houve o pedido, no livro de solicitações, sem dados pessoais.</li>
              </ul>
            </div>
            <Alert variant="warning">
              <AlertDescription>
                Só execute com o pedido do titular documentado (e-mail, formulário ou protocolo) e
                depois de conferir que não há cobrança, ação judicial ou prestação em aberto que
                exija a identificação. A pessoa deixa de constar como filiada.
              </AlertDescription>
            </Alert>
            <AnonimizarForm filiacaoId={id} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Livro de solicitações desta pessoa</CardTitle>
        </CardHeader>
        <CardContent>
          {solicitacoes.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nenhuma solicitação registrada.</p>
          ) : (
            <ul className="divide-y text-sm">
              {solicitacoes.map((s) => (
                <li key={s.id} className="py-2 first:pt-0 last:pb-0">
                  <p>
                    <span className="font-medium">{ROTULO_TIPO[s.tipo] ?? s.tipo}</span>
                    <span className="text-muted-foreground"> · pedido em {formatarData(s.solicitadoEm)}</span>
                    {s.concluidoEm && (
                      <span className="text-muted-foreground"> · concluído em {formatarDataHora(s.concluidoEm)}</span>
                    )}
                  </p>
                  {s.registrosAnonimizados && (
                    <p className="text-muted-foreground text-xs">{s.registrosAnonimizados}</p>
                  )}
                  {s.observacao && <p className="text-muted-foreground text-xs">Motivo: {s.observacao}</p>}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  )
}
