import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, FileText, ShieldOff } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { GrupoColapsavel } from "@/components/grupo-colapsavel"
import { requirePermissao } from "@/lib/auth"
import {
  lerCarencias,
  lerRegrasInadimplencia,
  listarSuspensoes,
} from "@/lib/db/filiacao-direitos"
import { listarFontesPagadoras } from "@/lib/db/fontes"
import {
  lerCondicoesHospedagem,
  listarBeneficiariosHospedagem,
} from "@/lib/db/hospedagem-condicoes"
import { BENEFICIOS } from "@/lib/filiacao-direitos-constantes"
import { contarCondicoesAtivas } from "@/lib/hospedagem-condicoes-constantes"
import { formatarCnpjCpf, formatarData } from "@/lib/formato"

import {
  CondicoesHospedagemForm,
  IncluirBeneficiarioHospedagem,
  RemoverBeneficiarioHospedagem,
} from "./condicoes-hospedagem"
import {
  CarenciaForm,
  ConcederSuspensao,
  RegraForm,
  RevogarSuspensao,
} from "./formularios"

export const metadata: Metadata = {
  title: "Configurações de filiação — Confluir",
}

export default async function DireitosPage() {
  await requirePermissao("filiacao_gestao")

  const [
    carencias,
    regras,
    suspensoes,
    condicoesHospedagem,
    beneficiarios,
    fontes,
  ] = await Promise.all([
    lerCarencias(),
    lerRegrasInadimplencia(),
    listarSuspensoes(),
    lerCondicoesHospedagem(),
    listarBeneficiariosHospedagem(),
    listarFontesPagadoras(),
  ])
  const opcoesFontes = fontes
    .map((f) => ({
      id: f.id,
      nome: f.nome_fantasia ?? f.nome_razao ?? "(sem nome)",
      detalhe:
        [f.fundo_pensao ? "fundo de pensão" : null, f.inativa ? "inativa" : null]
          .filter(Boolean)
          .join(" · ") || null,
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
  const condicoesLigadas = contarCondicoesAtivas(condicoesHospedagem)

  // O "hoje" sai daqui e vai pronto para o cliente — ver PreviaDaData.
  const hojeIso = new Date().toISOString()
  const comCarencia = carencias.filter((c) => c.ativo)
  const regrasAtivas = regras.filter((r) => r.ativo)

  return (
    <>
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3">
          <Link href="/painel/filiados">
            <ArrowLeft />
            Filiados
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">
          Configurações de filiação
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Carência por direito, condições da hospedagem, regra de
          inadimplência e os termos legais aceitos na filiação.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Termos legais</CardTitle>
          <CardDescription>
            Textos de LGPD e de autorização de desconto que o filiado aceita
            na ficha — versões, vigência e edição.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link href="/painel/filiados/termos">
              <FileText />
              Abrir termos legais
            </Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Carência por direito</CardTitle>
          <CardDescription>
            Contada da <strong>filiação mais recente</strong> — é o que dá
            sentido à regra, feita para conter filiação em massa às vésperas de
            uma eleição. {comCarencia.length === 0
              ? "Nenhum direito tem carência hoje."
              : `${comCarencia.length} de ${carencias.length} direitos com carência.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {carencias.map((c) => (
            <CarenciaForm key={c.beneficio} carencia={c} hojeIso={hojeIso} />
          ))}
        </CardContent>
      </Card>

      <Alert variant="info">
        <AlertDescription>
          A carência de <strong>votação</strong> alcança apenas os pleitos
          marcados como <em>somente filiados</em> — eleição de diretoria,
          consulta interna. Assembleia da categoria é de toda a base,
          independentemente de filiação, e nenhuma dessas regras a atinge.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>Condições da hospedagem</CardTitle>
          <CardDescription>
            Quem pode solicitar cupom, além de ter a filiação ativa. Valem no
            portal do associado e na emissão pelo painel, e aparecem para o
            associado em Hospedagem, nas regras de utilização.{" "}
            {condicoesLigadas === 0
              ? "Nenhuma condição ligada hoje."
              : `${condicoesLigadas} condição(ões) ligada(s).`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CondicoesHospedagemForm
            condicoes={condicoesHospedagem}
            fontes={opcoesFontes}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Lista de beneficiários da hospedagem
          </CardTitle>
          <CardDescription>
            {condicoesHospedagem.somenteBeneficiarios
              ? "Em uso: só estas pessoas podem solicitar cupom."
              : "Fora de uso: ligue “Somente a lista de beneficiários” nas condições acima para restringir a ela."}{" "}
            {beneficiarios.length === 1
              ? "1 pessoa na lista."
              : `${beneficiarios.length} pessoas na lista.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <IncluirBeneficiarioHospedagem />
          {beneficiarios.length > 0 && (
            <div className="grid gap-2">
              {beneficiarios.map((b) => (
                <div
                  key={b.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2"
                >
                  <div className="min-w-0">
                    <span className="font-medium">{b.nome ?? "—"}</span>{" "}
                    <span className="text-muted-foreground text-sm tabular-nums">
                      {formatarCnpjCpf(b.cpf)}
                    </span>
                    {b.observacao && (
                      <p className="text-muted-foreground text-xs">
                        {b.observacao}
                      </p>
                    )}
                  </div>
                  <RemoverBeneficiarioHospedagem id={b.id} />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Inadimplência por tipo de contribuição</CardTitle>
          <CardDescription>
            {regras.length === 0
              ? "Nenhuma remessa cadastrada ainda — as regras aparecem aqui quando houver."
              : regrasAtivas.length === 0
                ? "Nenhuma regra ligada: ninguém é considerado inadimplente."
                : `${regrasAtivas.length} regra(s) valendo.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {regras.map((r) => (
            <RegraForm key={r.tipo} regra={r} />
          ))}
        </CardContent>
      </Card>

      {regrasAtivas.length > 0 && (
        <Alert variant="warning">
          <AlertDescription>
            O sistema <strong>não muda a condição de ninguém sozinho</strong>.
            Uma remessa que o empregador atrasou tiraria direitos de gente em
            dia. Veja quem está na condição em{" "}
            <Link href="/painel/filiados/inadimplentes" className="underline">
              Inadimplentes
            </Link>{" "}
            e decida caso a caso.
          </AlertDescription>
        </Alert>
      )}

      <GrupoColapsavel
        titulo="Conceder efeito suspensivo"
        descricao="Tira uma pessoa da regra, com justificativa registrada."
      >
        <ConcederSuspensao
          alvos={{
            carencia: BENEFICIOS.map((b) => ({
              valor: b.chave,
              rotulo: b.rotulo,
            })),
            inadimplencia: regras.map((r) => ({
              valor: r.tipo,
              rotulo: r.tipo,
            })),
          }}
        />
      </GrupoColapsavel>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Efeitos suspensivos em vigor
          </CardTitle>
          <CardDescription>
            {suspensoes.length === 0
              ? "Nenhum. Toda regra vale para todos."
              : `${suspensoes.length} pessoa(s) fora de alguma regra.`}
          </CardDescription>
        </CardHeader>
        {suspensoes.length > 0 && (
          <CardContent className="grid gap-3">
            {suspensoes.map((s) => (
              <div
                key={s.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-lg border p-3"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <ShieldOff className="size-4 shrink-0" />
                    <span className="font-medium">{s.nome ?? "—"}</span>
                    <span className="text-muted-foreground text-sm tabular-nums">
                      {formatarCnpjCpf(s.cpf)}
                    </span>
                    <Badge variant="secondary">
                      {s.escopo === "carencia" ? "carência" : "inadimplência"}
                      {s.alvo ? ` · ${s.alvo}` : " · tudo"}
                    </Badge>
                    {s.vigenciaAte && (
                      <Badge variant="outline">
                        até {formatarData(s.vigenciaAte)}
                      </Badge>
                    )}
                  </div>
                  {s.motivo && (
                    <p className="text-muted-foreground mt-1 text-sm">
                      {s.motivo}
                    </p>
                  )}
                  <p className="text-muted-foreground mt-1 text-xs">
                    Concedido em {formatarData(s.criadaEm)}
                    {s.concedidaPorNome ? ` por ${s.concedidaPorNome}` : ""}.
                  </p>
                </div>
                <RevogarSuspensao id={s.id} />
              </div>
            ))}
          </CardContent>
        )}
      </Card>
    </>
  )
}
