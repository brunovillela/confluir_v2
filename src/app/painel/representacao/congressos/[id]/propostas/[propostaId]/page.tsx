import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { RotuloTrilha } from "@/components/layout/trilha-rotulos"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { ROTULO_APRECIACAO } from "@/lib/congressos/relatoria"
import { listarPrograma, obterCongresso } from "@/lib/db/congressos"
import {
  rastroDaProposta,
  ROTULO_APONTAMENTO,
  ROTULO_ORIGEM_PROPOSTA,
  ROTULO_SITUACAO_PROPOSTA,
} from "@/lib/db/congressos-relatoria"
import { formatarDataHora } from "@/lib/formato"

export const metadata: Metadata = { title: "Rastro da proposta — Confluir" }

const MOTIVO: Record<string, string> = {
  criada: "Texto inicial",
  grupo: "Alterada no grupo",
  consolidacao: "Consolidação",
  fusao: "Fusão",
  plenaria: "Plenária",
  correcao: "Correção",
  redacao_ia: "Redação sugerida pela IA e aceita",
}
const FORMA: Record<string, string> = { sem_oposicao: "sem oposição", visual: "crachá (contraste visual)", contagem: "contagem", urna: "urna" }

/** De onde veio cada proposta: versões, origens da fusão, apontamentos, apreciação nos grupos e votação. */
export default async function RastroPropostaPage({ params }: { params: Promise<{ id: string; propostaId: string }> }) {
  await requirePermissao("congressos", ["congressos_gestao", "congressos_relatoria"])
  const { id, propostaId } = await params
  const c = await obterCongresso(id)
  if (!c) notFound()
  const [r, programa] = await Promise.all([rastroDaProposta(c, propostaId), listarPrograma(id)])
  if (!r) notFound()
  const p = r.proposta
  const nomeGrupo = new Map(programa.grupos.map((g) => [g.id, g.nome]))
  const eixo = programa.eixos.find((e) => e.id === p.eixoId)
  const base = `/painel/representacao/congressos/${id}`

  return (
    <>
      <RotuloTrilha valores={{ congressos: "Congressos", [id]: c.nome, propostas: "Propostas", [propostaId]: `Proposta ${p.numero}` }} />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Proposta {p.numero}</h1>
        <p className="text-muted-foreground mt-1 flex flex-wrap items-center gap-2 text-xs">
          <Badge variant={p.situacao === "aprovada" ? "success" : p.situacao === "rejeitada" ? "destructive" : "secondary"}>
            {ROTULO_SITUACAO_PROPOSTA[p.situacao]}
          </Badge>
          <span>{p.origemDescricao ?? ROTULO_ORIGEM_PROPOSTA[p.origem]}</span>
          {p.grupoId && <span>· {nomeGrupo.get(p.grupoId)}</span>}
          {eixo && <span>· Eixo {eixo.nome}</span>}
          {p.abrangencia && <span>· {p.abrangencia}</span>}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Texto atual</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="whitespace-pre-wrap">{p.texto}</p>
          {r.fundidaEm && (
            <p className="mt-3 text-sm">
              Fundida na{" "}
              <Link className="underline" href={`${base}/propostas/${r.fundidaEm.id}`}>
                proposta {r.fundidaEm.numero}
              </Link>
              .
            </p>
          )}
        </CardContent>
      </Card>

      {r.origens.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Nasceu da fusão de</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            {r.origens.map((o) => (
              <div key={o.id} className="rounded-md border p-3 text-sm">
                <Link className="font-medium underline" href={`${base}/propostas/${o.id}`}>
                  Proposta {o.numero}
                </Link>
                <span className="text-muted-foreground">
                  {" "}
                  · {o.origemDescricao ?? ROTULO_ORIGEM_PROPOSTA[o.origem]}
                  {o.grupoId ? ` · ${nomeGrupo.get(o.grupoId)}` : ""}
                </span>
                <p className="mt-1 whitespace-pre-wrap">{o.texto}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {r.votacoes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Plenária</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-1 text-sm">
            {r.votacoes.map((v) => (
              <p key={v.id}>
                {v.resultado === "aprovada" ? "Aprovada" : v.resultado === "rejeitada" ? "Rejeitada" : "Empate"} por {FORMA[v.forma] ?? v.forma}
                {v.aFavor !== null ? ` (${v.aFavor} a favor, ${v.contra ?? 0} contra, ${v.abstencao ?? 0} abstenções)` : ""}
                {v.tipo === "bloco" ? `, em bloco com ${v.propostaIds.length - 1} outra(s)` : ""} · {formatarDataHora(v.createdAt)}
              </p>
            ))}
          </CardContent>
        </Card>
      )}

      {r.apreciacoes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Nos grupos</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-1 text-sm">
            {r.apreciacoes.map((a) => (
              <p key={a.id}>
                {nomeGrupo.get(a.grupoId) ?? "Grupo"}: {a.aFavor} a favor, {a.contra} contra, {a.abstencao} abstenções · {ROTULO_APRECIACAO[a.resultado]}
              </p>
            ))}
          </CardContent>
        </Card>
      )}

      {r.apontamentos.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Apontamentos</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2 text-sm">
              {r.apontamentos.map((a) => (
                <li key={a.id} className={a.retiradoEm ? "text-muted-foreground line-through" : ""}>
                  <Badge variant="outline" className="mr-2">
                    {ROTULO_APONTAMENTO[a.tipo]}
                  </Badge>
                  {a.texto}
                  <span className="text-muted-foreground text-xs">
                    {" "}
                    · {a.grupoId ? nomeGrupo.get(a.grupoId) : ""} · {formatarDataHora(a.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Versões do texto</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          {[...r.versoes].reverse().map((v) => (
            <div key={v.versao} className="rounded-md border p-3 text-sm">
              <div className="text-muted-foreground text-xs">
                Versão {v.versao} · {MOTIVO[v.motivo] ?? v.motivo}
                {v.autor ? ` · ${v.autor}` : ""} · {formatarDataHora(v.createdAt)}
              </div>
              <p className="mt-1 whitespace-pre-wrap">{v.texto}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </>
  )
}
