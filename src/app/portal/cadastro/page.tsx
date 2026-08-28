import type { Metadata } from "next"

import { CondicaoBadge } from "@/app/painel/filiados/condicao-badge"
import { TrilhaEtapas } from "@/components/trilha-etapas"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { requireVisualizacaoPortal } from "@/lib/visualizacao-filiado"
import { formatarCpf } from "@/lib/cpf"
import { cadastroDoFiliado } from "@/lib/db/filiado-portal"
import { marcosDaTrilha } from "@/lib/filiacao"
import { formatarData } from "@/lib/formato"

import { PortalShell } from "../portal-shell"
import { CadastroForm } from "./cadastro-form"

export const metadata: Metadata = { title: "Meu cadastro — Confluir" }

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{rotulo}</dt>
      <dd className="mt-0.5 text-sm">{children ?? "—"}</dd>
    </div>
  )
}

export default async function CadastroPage({
  searchParams,
}: {
  searchParams: Promise<{ salvo?: string }>
}) {
  const { filiado, preview, gestorNome } = await requireVisualizacaoPortal()
  const { salvo } = await searchParams
  const cadastro = await cadastroDoFiliado(filiado.cpf)

  // Trilha de etapas (só quando há filiação/desfiliação em andamento).
  const trilha = cadastro
    ? marcosDaTrilha(cadastro.filiacao_condicao, {
        created_at: cadastro.created_at,
        ficha_assinada_em: cadastro.ficha_assinada_em,
        filiacao_informada_fonte_em: cadastro.filiacao_informada_fonte_em,
        ativo_em: cadastro.ativo_em,
        desfiliacao_informada_fonte_em: cadastro.desfiliacao_informada_fonte_em,
        inativo_em: cadastro.inativo_em,
      })
    : null

  return (
    <PortalShell preview={preview ? { filiadoNome: filiado.nome_completo, gestorNome } : undefined}>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Meu cadastro</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Você pode atualizar telefones, emails e endereço. Os demais dados são
          alterados pela equipe de filiação do sindicato.
        </p>
      </div>

      {salvo === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Cadastro atualizado com sucesso.</AlertDescription>
        </Alert>
      )}

      {!cadastro ? (
        <Alert variant="destructive">
          <AlertDescription>
            Não foi possível carregar seu cadastro — fale com o sindicato.
          </AlertDescription>
        </Alert>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Identificação</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
                <Campo rotulo="Nome completo">{cadastro.nome_completo}</Campo>
                <Campo rotulo="CPF">
                  {cadastro.cpf ? formatarCpf(cadastro.cpf) : "—"}
                </Campo>
                <Campo rotulo="Matrícula sindical">
                  {cadastro.matricula_sindical}
                </Campo>
                <Campo rotulo="Condição da filiação">
                  <CondicaoBadge condicao={cadastro.filiacao_condicao} />
                </Campo>
                <Campo rotulo="Nascimento">
                  {formatarData(cadastro.nascimento_data)}
                </Campo>
                <Campo rotulo="Sexo">{cadastro.sexo}</Campo>
              </dl>
            </CardContent>
          </Card>

          {trilha && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  {trilha.processo === "filiacao"
                    ? "Andamento da sua filiação"
                    : "Andamento da sua desfiliação"}
                </CardTitle>
                <CardDescription>
                  Acompanhe em que etapa está o seu processo.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-1">
                <TrilhaEtapas marcos={trilha.marcos} />
              </CardContent>
            </Card>
          )}

          <CadastroForm
            somenteLeitura={preview}
            contato={{
              email_pessoal: cadastro.email_pessoal,
              email_corporativo: cadastro.email_corporativo,
              telefone_1: cadastro.telefone_1,
              telefone_1_whatsapp: cadastro.telefone_1_whatsapp,
              telefone_2: cadastro.telefone_2,
              telefone_2_whatsapp: cadastro.telefone_2_whatsapp,
              endereco_cep: cadastro.endereco_cep,
              endereco_logradouro: cadastro.endereco_logradouro,
              endereco_numero: cadastro.endereco_numero,
              endereco_complemento: cadastro.endereco_complemento,
              endereco_bairro: cadastro.endereco_bairro,
              endereco_cidade: cadastro.endereco_cidade,
              endereco_estado: cadastro.endereco_estado,
            }}
          />
        </>
      )}
    </PortalShell>
  )
}
