import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, ArrowUpRight, CheckCircle2 } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { listarDivergencias, type Divergencia, type FichaDoCpf } from "@/lib/db/votacao-divergencias"
import { nomesConferem } from "@/lib/db/votacao-primeiro-acesso"
import { hojeSP } from "@/lib/db/comum"
import { formatarCnpjCpf, formatarData, formatarDataHora } from "@/lib/formato"
import { motivoNascimentoSuspeito } from "@/lib/saude-cadastros"
import { semAcento } from "@/lib/texto"

import { TratarDivergencia } from "./tratar-form"

export const metadata: Metadata = { title: "Divergências das votações — Confluir" }

/**
 * Fila do setor de filiação: votos liberados com divergência de cadastro
 * (o aviso "Possível divergência de cadastro" do sino abre aqui).
 */
export default async function DivergenciasVotacaoPage({
  searchParams,
}: {
  searchParams: Promise<{ ver?: string; apto?: string }>
}) {
  await requirePermissao("filiacao_filiados", ["filiacao_gestao"])
  const { ver, apto } = await searchParams
  const filtro = ver === "tratadas" ? "tratadas" : "abertas"
  const itens = await listarDivergencias(filtro)
  // O aviso do sino aponta um caso: ele vem primeiro.
  const ordenados = apto ? [...itens.filter((i) => i.aptoId === apto), ...itens.filter((i) => i.aptoId !== apto)] : itens

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/filiados/cadastros-pendentes">
            <ArrowLeft />
            Cadastros pendentes
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Divergências das votações</h1>
        <p className="text-muted-foreground mt-1 max-w-3xl text-sm">
          Votos liberados em que o cadastro não bateu: o nome da lista da empresa difere da ficha, a ficha
          inativa não confere com o que o eleitor declarou, o nascimento da ficha parece errado ou o eleitor
          avisou que o nome da lista está escrito errado. O voto já valeu; aqui se acerta a ficha com o que
          ele declarou, dizendo a fonte (a entidade não pede documento: vale a fonte mais forte que houver,
          e o prontuário guarda o antes, o depois e a fonte), ou se registra o que foi feito.
        </p>
      </div>

      <div className="flex gap-2">
        <Button asChild size="sm" variant={filtro === "abertas" ? "default" : "outline"}>
          <Link href="/painel/filiados/divergencias-votacao">Para tratar</Link>
        </Button>
        <Button asChild size="sm" variant={filtro === "tratadas" ? "default" : "outline"}>
          <Link href="/painel/filiados/divergencias-votacao?ver=tratadas">Tratadas</Link>
        </Button>
      </div>

      {ordenados.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground flex items-center gap-2 text-sm">
            <CheckCircle2 className="text-success-fg size-4" />
            {filtro === "abertas" ? "Nenhuma divergência para tratar." : "Nenhuma divergência tratada ainda."}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          <p className="text-muted-foreground text-xs">
            {ordenados.length.toLocaleString("pt-BR")} {ordenados.length === 1 ? "caso" : "casos"}
          </p>
          {ordenados.map((d) => (
            <CartaoDivergencia key={d.aptoId} d={d} destaque={d.aptoId === apto} />
          ))}
        </div>
      )}
    </>
  )
}

function CartaoDivergencia({ d, destaque }: { d: Divergencia; destaque: boolean }) {
  const titulo = d.nomeInformado ?? d.nomeLista ?? "(sem nome)"
  return (
    <Card id={d.aptoId} className={destaque ? "border-primary/60" : undefined}>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">{titulo}</CardTitle>
            <CardDescription>
              {d.cpf ? `CPF ${formatarCnpjCpf(d.cpf)} · ` : ""}
              {d.rodada ?? d.votacao ?? "Votação"}
              {d.conflitoEm ? ` · ${formatarDataHora(d.conflitoEm)}` : ""}
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{d.votou ? "Votou" : "Ainda não votou"}</Badge>
            {d.rodadaId && (
              <Link
                href={`/painel/representacao/votacoes/rodadas/${d.rodadaId}`}
                className="text-primary inline-flex items-center gap-1 text-xs font-medium underline-offset-4 hover:underline"
              >
                Rodada
                <ArrowUpRight className="size-3.5" />
              </Link>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 text-sm">
        <p className="bg-warning/10 text-warning-fg rounded-md px-3 py-2">{d.motivo}</p>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="grid gap-1">
            <p className="text-muted-foreground text-xs font-medium">Na votação</p>
            <Linha rotulo="Nome na lista da empresa" valor={d.nomeLista} />
            <Linha rotulo="Nome declarado pelo eleitor" valor={d.nomeInformado} />
            <Linha rotulo="Nascimento declarado" valor={d.nascimentoInformado ? formatarData(d.nascimentoInformado) : null} />
            <Linha rotulo="E-mail" valor={d.email} />
          </div>
          <div className="grid gap-1">
            <p className="text-muted-foreground text-xs font-medium">
              {d.fichas.length === 0 ? "Sem ficha de filiado com este CPF" : d.fichas.length === 1 ? "Ficha do CPF" : "Fichas do CPF"}
            </p>
            {d.fichas.map((f) => (
              <FichaResumo key={f.id} f={f} d={d} />
            ))}
          </div>
        </div>
        {d.aberta ? (
          <TratarDivergencia
            aptoId={d.aptoId}
            nomeInformado={d.nomeInformado}
            nascimentoInformado={d.nascimentoInformado}
            sugestao={sugestaoDe(d)}
            fichas={d.fichas.map((f) => ({
              id: f.id,
              rotulo: `${f.nome ?? "(sem nome)"} — ${f.condicao ?? "?"}${f.nascimento ? `, ${formatarData(f.nascimento)}` : ""}`,
              nomeDifere: Boolean(d.nomeInformado) && !mesmoNome(d.nomeInformado, f.nome),
              nascimentoDifere: Boolean(d.nascimentoInformado) && d.nascimentoInformado !== f.nascimento,
            }))}
          />
        ) : (
          <p className="text-muted-foreground border-t pt-3 text-xs">
            Tratada em {formatarDataHora(d.tratadaEm)}
            {d.tratadaPor ? ` por ${d.tratadaPor}` : ""}: {d.tratamento}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * O que a fila sugere (só com UMA ficha, para não escolher por ninguém):
 * nome declarado = nome da lista da empresa (duas fontes) e nascimento da
 * ficha impossível trocado pelo declarado.
 */
function sugestaoDe(d: Divergencia): {
  nome: boolean
  nascimento: boolean
  fonte: "lista_empresa" | "autodeclarado" | null
  texto: string | null
} {
  const f = d.fichas.length === 1 ? d.fichas[0] : null
  if (!f) return { nome: false, nascimento: false, fonte: null, texto: null }
  const nomeDifere = Boolean(d.nomeInformado) && !mesmoNome(d.nomeInformado, f.nome)
  const nomeNaLista = Boolean(d.nomeInformado && d.nomeLista) && nomesConferem(d.nomeInformado, d.nomeLista)
  const nascImpossivel =
    Boolean(d.nascimentoInformado) &&
    d.nascimentoInformado !== f.nascimento &&
    Boolean(f.nascimento) &&
    motivoNascimentoSuspeito(f.nascimento, [], hojeSP()) !== null
  const nome = nomeDifere && nomeNaLista
  const textos = [
    nome ? "o nome declarado confere com o da lista da empresa" : null,
    nascImpossivel ? "o nascimento da ficha é impossível" : null,
  ].filter(Boolean)
  return {
    nome,
    nascimento: nascImpossivel,
    // Com o nascimento, a lista da empresa não serve (não traz nascimento).
    fonte: nascImpossivel ? "autodeclarado" : nome ? "lista_empresa" : null,
    texto: textos.length ? `Sugerido: ${textos.join(" e ")}.` : null,
  }
}

function FichaResumo({ f, d }: { f: FichaDoCpf; d: Divergencia }) {
  const nomeDifere = Boolean(d.nomeInformado) && !mesmoNome(d.nomeInformado, f.nome)
  const nascDifere = Boolean(d.nascimentoInformado && f.nascimento) && d.nascimentoInformado !== f.nascimento
  return (
    <div className="grid gap-0.5 rounded-md border px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href={`/painel/filiados/${f.id}`} className="text-primary font-medium underline-offset-4 hover:underline">
          {f.nome ?? "(sem nome)"}
        </Link>
        <Badge variant="secondary">{f.condicao ?? "—"}</Badge>
      </div>
      <span className={nomeDifere ? "text-destructive text-xs" : "text-muted-foreground text-xs"}>
        {nomeDifere ? "Nome difere do declarado" : "Nome confere com o declarado"}
      </span>
      <span className={nascDifere ? "text-destructive text-xs" : "text-muted-foreground text-xs"}>
        Nascimento na ficha: {f.nascimento ? formatarData(f.nascimento) : "não informado"}
        {nascDifere ? " (difere do declarado)" : ""}
      </span>
    </div>
  )
}

/**
 * Nome igual de verdade (sem acento, maiúscula ou espaço a mais). A régua da
 * votação (nomesConferem) aceita nome de casada etc. — aqui, o que a ficha
 * deixaria de mostrar conta como diferença.
 */
function mesmoNome(a: string | null, b: string | null): boolean {
  const n = (x: string | null) => semAcento(x ?? "").replace(/\s+/g, " ").trim()
  return n(a) === n(b)
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string | null }) {
  return (
    <p>
      <span className="text-muted-foreground">{rotulo}: </span>
      {valor ?? "—"}
    </p>
  )
}
