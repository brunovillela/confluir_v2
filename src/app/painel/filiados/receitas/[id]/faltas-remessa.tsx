"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { BellRing, Loader2, SearchCheck, UserX } from "lucide-react"

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
import { confirmar } from "@/components/ui/confirmacao"

import {
  avisarFaltas,
  type AvisoNaTela,
  conferirFaltas,
  type ConferenciaNaTela,
  type FaltaNaTela,
} from "./faltas-actions"

const MOTIVO: Record<NonNullable<FaltaNaTela["semAviso"]>, string> = {
  ja_avisado: "Já avisado",
  sem_cpf: "Sem CPF",
  suspensao: "Efeito suspensivo",
}

function plural(n: number, um: string, varios: string): string {
  return `${n.toLocaleString("pt-BR")} ${n === 1 ? um : varios}`
}

/**
 * Contribuições não localizadas na remessa (onda 2, A20): 1) conferir quem
 * não veio — contagem e lista curta; 2) avisar, com confirmação. Nada sai
 * sozinho na importação: a gestão confere antes, porque uma relação ainda
 * incompleta avisaria gente em dia.
 */
export function FaltasDaRemessa({ remessaId }: { remessaId: string }) {
  const [conferencia, setConferencia] = useState<ConferenciaNaTela | null>(null)
  const [aviso, setAviso] = useState<AvisoNaTela | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [acao, setAcao] = useState<"conferir" | "avisar" | null>(null)
  const [pendente, iniciar] = useTransition()

  function conferir() {
    setErro(null)
    setAviso(null)
    setAcao("conferir")
    iniciar(async () => {
      const r = await conferirFaltas(remessaId)
      if ("erro" in r) setErro(r.erro)
      else setConferencia(r.conferencia)
    })
  }

  async function avisar() {
    if (!conferencia || conferencia.aAvisar === 0) return
    const n = conferencia.aAvisar
    const ok = await confirmar({
      titulo: `Avisar ${plural(n, "filiado", "filiados")}?`,
      descricao:
        `Cada um recebe no portal — e por e-mail, se não desligou os avisos de contribuição — que a contribuição de ${conferencia.competencia} não foi encontrada na remessa da fonte pagadora, com a orientação de procurar o sindicato se o desconto apareceu no contracheque. ` +
        "Quem já foi avisado desta competência não recebe de novo." +
        (n > conferencia.porVez
          ? ` Saem ${conferencia.porVez.toLocaleString("pt-BR")} agora; clique de novo para continuar.`
          : ""),
      confirmar: "Avisar",
    })
    if (!ok) return
    setErro(null)
    setAviso(null)
    setAcao("avisar")
    iniciar(async () => {
      const r = await avisarFaltas(remessaId)
      if ("erro" in r) {
        setErro(r.erro)
        return
      }
      setConferencia(r.conferencia)
      setAviso(r.aviso)
    })
  }

  const c = conferencia
  const conferindo = pendente && acao === "conferir"
  const avisando = pendente && acao === "avisar"

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <UserX className="size-4" />
          Contribuições não localizadas
        </CardTitle>
        <CardDescription>
          Filiados ativos com vínculo aberto numa fonte que mandou esta remessa
          e que não constam nela nem em outra remessa associativa do mesmo
          mês. Confira antes de avisar: se a relação de alguma fonte ainda
          está incompleta, complete-a primeiro.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {erro && (
          <Alert variant="error">
            <AlertDescription>{erro}</AlertDescription>
          </Alert>
        )}

        {c?.naoSeAplica && (
          <Alert variant="info">
            <AlertDescription>{c.naoSeAplica}</AlertDescription>
          </Alert>
        )}

        {c && !c.naoSeAplica && c.total === 0 && (
          <Alert variant="success">
            <AlertDescription>
              Ninguém em falta em {c.competencia}: todos os filiados ativos com
              vínculo {c.fontesConferidas === 1 ? "na fonte" : `nas ${c.fontesConferidas} fontes`}{" "}
              desta remessa constam nela.
            </AlertDescription>
          </Alert>
        )}

        {c && !c.naoSeAplica && c.total > 0 && (
          <div className="grid gap-3">
            <p className="text-sm">
              <strong>{plural(c.total, "filiado", "filiados")}</strong> sem
              contribuição em {c.competencia}, entre os vínculos{" "}
              {c.fontesConferidas === 1
                ? "da fonte conferida"
                : `das ${c.fontesConferidas} fontes conferidas`}
              .
            </p>
            <div className="flex flex-wrap gap-2">
              <Badge variant={c.aAvisar > 0 ? "warning" : "outline"}>
                {plural(c.aAvisar, "a avisar", "a avisar")}
              </Badge>
              {c.jaAvisados > 0 && (
                <Badge variant="outline">
                  {plural(c.jaAvisados, "já avisado", "já avisados")}
                </Badge>
              )}
              {c.semCpf > 0 && (
                <Badge variant="outline">
                  {plural(c.semCpf, "sem CPF válido", "sem CPF válido")}
                </Badge>
              )}
              {c.comSuspensao > 0 && (
                <Badge variant="outline">
                  {plural(c.comSuspensao, "com efeito suspensivo", "com efeito suspensivo")}
                </Badge>
              )}
            </div>

            <ul className="divide-y rounded-lg border">
              {c.lista.map((f) => (
                <li
                  key={f.filiacaoId}
                  className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-2"
                >
                  <span className="grid min-w-0 gap-0.5">
                    <Link
                      href={`/painel/filiados/${f.filiacaoId}`}
                      className="truncate text-sm font-medium hover:underline pointer-coarse:py-3"
                    >
                      {f.nome ?? "(sem nome)"}
                    </Link>
                    <span className="text-muted-foreground text-xs">
                      {[f.matricula ? `Matrícula ${f.matricula}` : null, f.fontes.join(", ")]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  {f.semAviso && (
                    <Badge variant="outline" className="text-muted-foreground">
                      {MOTIVO[f.semAviso]}
                    </Badge>
                  )}
                </li>
              ))}
            </ul>
            {c.total > c.lista.length && (
              <p className="text-muted-foreground text-sm">
                e mais {plural(c.total - c.lista.length, "filiado", "filiados")}{" "}
                — os que vão receber o aviso aparecem primeiro.
              </p>
            )}
            {c.porPix > 0 && (
              <p className="text-muted-foreground text-sm">
                {plural(c.porPix, "filiado paga", "filiados pagam")} por Pix e
                {c.porPix === 1 ? " ficou" : " ficaram"} fora: para eles, a
                falta é a cobrança vencida.
              </p>
            )}
          </div>
        )}

        {aviso && (
          <Alert variant={aviso.falhas > 0 ? "warning" : "success"}>
            <AlertDescription>
              {aviso.avisados > 0
                ? `${plural(aviso.avisados, "filiado avisado", "filiados avisados")} no portal${aviso.porEmail > 0 ? `; ${plural(aviso.porEmail, "recebeu", "receberam")} também por e-mail` : ""}.`
                : "Nenhum aviso novo saiu."}
              {aviso.falhas > 0 &&
                ` ${plural(aviso.falhas, "aviso não foi gravado", "avisos não foram gravados")} — tente de novo mais tarde.`}
              {aviso.restantes > 0 &&
                ` Faltam ${aviso.restantes.toLocaleString("pt-BR")}: clique em Avisar de novo para continuar.`}
            </AlertDescription>
          </Alert>
        )}

        <div className="flex flex-wrap gap-2">
          {c && !c.naoSeAplica && c.aAvisar > 0 && (
            <Button onClick={avisar} disabled={pendente}>
              {avisando ? <Loader2 className="animate-spin" /> : <BellRing />}
              {avisando
                ? "Avisando…"
                : `Avisar ${plural(c.aAvisar, "filiado", "filiados")}`}
            </Button>
          )}
          <Button variant="outline" onClick={conferir} disabled={pendente}>
            {conferindo ? <Loader2 className="animate-spin" /> : <SearchCheck />}
            {conferindo
              ? "Conferindo…"
              : c
                ? "Conferir de novo"
                : "Conferir quem não veio"}
          </Button>
        </div>
        {conferindo && (
          <p className="text-muted-foreground text-sm" role="status">
            A conferência passa por todos os cadastros e pode levar alguns
            segundos.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
