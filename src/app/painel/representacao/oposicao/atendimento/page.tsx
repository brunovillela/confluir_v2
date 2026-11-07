import type { Metadata } from "next"
import Link from "next/link"
import { AlertTriangle, ArrowLeft, CheckCircle2, Search, XCircle } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { mascararEmailMedio } from "@/lib/contas"
import { registrarEvento } from "@/lib/db/oposicao"
import { diagnosticarAcesso, type DiagnosticoEmail } from "@/lib/db/oposicao-diagnostico"
import { requireOposicao } from "@/lib/db/oposicao-regras"
import { formatarDataHora } from "@/lib/formato"
import { mascaraCpf } from "@/lib/mascaras"
import { ROTULO_SITUACAO_OPOSITOR, type SituacaoOpositor } from "@/lib/oposicao-constantes"

export const metadata: Metadata = { title: "Atendimento — Oposição — Confluir" }

const ICONE = { ok: CheckCircle2, atencao: AlertTriangle, problema: XCircle } as const
const COR = { ok: "text-success-fg", atencao: "text-warning-fg", problema: "text-destructive" } as const

/**
 * Atendimento da oposição (onda 2 das melhorias, 31/10/2026): "o código não
 * chegou", "registrei e não aparece". Por CPF ou e-mail, o que aconteceu com
 * cada endereço e a orientação pronta. Cada consulta fica na trilha.
 */
export default async function AtendimentoOposicaoPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const sessao = await requireOposicao("consultar")
  const q = ((await searchParams).q ?? "").trim()
  const resultado = q ? await diagnosticarAcesso(q) : null
  if (resultado && !("erro" in resultado)) {
    const alvo =
      resultado.busca.tipo === "cpf"
        ? `CPF ***.${resultado.busca.valor.slice(3, 6)}.${resultado.busca.valor.slice(6, 9)}-**`
        : `e-mail ${mascararEmailMedio(resultado.busca.valor)}`
    await registrarEvento(null, "diagnostico_acesso_consultado", `Consulta de acesso por ${alvo}.`, null, null, {
      usuarioId: sessao.usuario.id,
    })
  }

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/representacao/oposicao">
            <ArrowLeft />
            Oposição
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Atendimento</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          “O código não chegou”, “registrei e não aparece”: busque pelo CPF ou pelo e-mail da pessoa e veja o que
          aconteceu com cada endereço, com a orientação pronta.
        </p>
      </div>

      <form method="get" className="flex flex-wrap items-end gap-2">
        <div className="grid min-w-64 flex-1 gap-1.5">
          <label htmlFor="q" className="text-sm font-medium">
            CPF ou e-mail
          </label>
          <Input id="q" name="q" defaultValue={q} placeholder="000.000.000-00 ou nome@exemplo.com" autoComplete="off" />
        </div>
        <Button type="submit">
          <Search />
          Consultar
        </Button>
      </form>

      {resultado && "erro" in resultado && (
        <Alert variant="destructive">
          <AlertDescription>{resultado.erro}</AlertDescription>
        </Alert>
      )}

      {resultado && !("erro" in resultado) && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {resultado.pessoa?.nome ??
                  (resultado.busca.tipo === "cpf" ? mascaraCpf(resultado.busca.valor) : resultado.busca.valor)}
              </CardTitle>
              <CardDescription className="flex flex-wrap gap-2">
                {!resultado.pessoa ? (
                  <span>Nenhum cadastro encontrado para esta busca.</span>
                ) : (
                  <>
                    {resultado.pessoa.filiado && (
                      <Badge variant="outline">{resultado.pessoa.ativo ? "Filiado ativo" : "Desfiliado"}</Badge>
                    )}
                    {resultado.pessoa.naoFiliado && <Badge variant="outline">Cadastro de não filiado</Badge>}
                  </>
                )}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm">
              {resultado.conta ? (
                <p>
                  Conta de acesso: <strong>{resultado.conta.email ?? "—"}</strong>
                  {resultado.conta.ultimoAcesso
                    ? ` · último acesso em ${formatarDataHora(resultado.conta.ultimoAcesso)}`
                    : " · nunca entrou"}
                  .
                </p>
              ) : (
                resultado.pessoa && <p className="text-muted-foreground">Ainda não entrou com código.</p>
              )}
              {resultado.pessoa?.filiado && !resultado.emails.some((e) => e.origens.includes("cadastro de filiado")) && (
                <Alert variant="warning">
                  <AlertDescription>
                    O cadastro de filiado não tem e-mail: o código não tem para onde ir. Atualize o e-mail na ficha do
                    filiado e peça para ele tentar de novo.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          {resultado.brevoIndisponivel && (
            <Alert variant="warning">
              <AlertDescription>
                Não deu para consultar a Brevo ({resultado.brevoIndisponivel}): o que aconteceu com os envios fica de
                fora.
              </AlertDescription>
            </Alert>
          )}

          {resultado.emails.map((e) => (
            <CartaoEmail key={e.email} e={e} />
          ))}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Oposições deste CPF</CardTitle>
            </CardHeader>
            <CardContent>
              {resultado.oposicoes.length === 0 ? (
                <p className="text-muted-foreground text-sm">Nenhuma oposição registrada.</p>
              ) : (
                <ul className="grid gap-2 text-sm">
                  {resultado.oposicoes.map((o) => (
                    <li key={o.id} className="flex flex-wrap items-center gap-2">
                      {o.campanhaId ? (
                        <Link
                          href={`/painel/representacao/oposicao/${o.campanhaId}/opositor/${o.id}`}
                          className="font-medium underline underline-offset-4"
                        >
                          {o.campanha}
                        </Link>
                      ) : (
                        <span className="font-medium">{o.campanha}</span>
                      )}
                      <Badge variant="outline">
                        {ROTULO_SITUACAO_OPOSITOR[o.situacao as SituacaoOpositor] ?? o.situacao}
                      </Badge>
                      <span className="text-muted-foreground">
                        protocolo {o.protocolo ?? "—"}
                        {o.em ? ` · ${formatarDataHora(o.em)}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </>
  )
}

function CartaoEmail({ e }: { e: DiagnosticoEmail }) {
  const Icone = ICONE[e.orientacao.nivel]
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base break-all">{e.email}</CardTitle>
        <CardDescription>{e.origens.join(" · ")}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 text-sm">
        <p className="flex items-start gap-2">
          <Icone aria-hidden className={`mt-0.5 size-4 shrink-0 ${COR[e.orientacao.nivel]}`} />
          <span>{e.orientacao.texto}</span>
        </p>
        <dl className="grid gap-2 sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground text-xs">Código pendente (não usado)</dt>
            <dd>{e.codigoPendenteDesde ? `pedido em ${formatarDataHora(e.codigoPendenteDesde)}` : "nenhum"}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">Pedido pela oposição, ainda não conferido</dt>
            <dd>
              {e.pedidoOposicao
                ? `${e.pedidoOposicao.tipo === "filiado" ? "como filiado" : "como não filiado"}, em ${formatarDataHora(e.pedidoOposicao.em)}`
                : "nenhum"}
            </dd>
          </div>
        </dl>
        {e.eventos && (
          <div className="grid gap-1">
            <p className="text-muted-foreground text-xs">E-mails para este endereço nos últimos 30 dias (Brevo)</p>
            {e.eventos.length === 0 ? (
              <p className="text-muted-foreground">Nenhum.</p>
            ) : (
              <ul className="grid gap-1">
                {e.eventos.slice(0, 12).map((ev, i) => (
                  <li key={i} className="flex flex-wrap gap-x-2">
                    <span className="text-muted-foreground tabular-nums">{formatarDataHora(ev.quando)}</span>
                    <span className="font-medium">{ev.evento}</span>
                    {ev.assunto && <span className="text-muted-foreground">— {ev.assunto}</span>}
                    {ev.motivo && <span className="text-muted-foreground">({ev.motivo})</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
