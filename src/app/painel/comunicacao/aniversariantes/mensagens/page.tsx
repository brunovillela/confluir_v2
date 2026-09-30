import type { Metadata } from "next"
import Link from "next/link"
import { ArrowDown, ArrowLeft, ArrowUp, Pencil, Plus } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { descreverCriterios, rotuloHora } from "@/lib/comunicacao-mensagens-constantes"
import { requirePermissao } from "@/lib/auth"
import {
  AVISO_SQL_MENSAGENS,
  AVISO_SQL_MODELOS,
  listarModelos,
  obterConfigAniversario,
} from "@/lib/db/comunicacao-mensagens"
import { baseRelatorios } from "@/lib/db/filiacao-relatorios"
import { nomeEntidade } from "@/lib/db/organizacao"
import { formatarDataHora } from "@/lib/formato"

import { moverModeloAction } from "../actions"
import { EditorParabens, EnvioAutomaticoForm } from "../componentes"

export const metadata: Metadata = { title: "Mensagens de parabéns — Confluir" }

/**
 * Aniversariantes › Mensagens e envio: o envio automático (hora de início e
 * aviso à equipe), a mensagem padrão e as mensagens específicas — a primeira
 * da lista que a pessoa atender vale.
 */
export default async function MensagensParabensPage() {
  const sessao = await requirePermissao("comunicacao_mensagens")
  const [config, modelos, entidade, base] = await Promise.all([
    obterConfigAniversario(),
    listarModelos(),
    nomeEntidade(),
    baseRelatorios(),
  ])
  const exemploNome = String(sessao.usuario.nome_completo ?? "Maria da Silva")

  return (
    <>
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3">
          <Link href="/painel/comunicacao/aniversariantes">
            <ArrowLeft />
            Aniversariantes
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Mensagens e envio automático</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          O texto do parabéns — um padrão e, se quiser, mensagens específicas para quem atende critérios — e quando ele sai.
        </p>
      </div>

      {!config.disponivel && (
        <Alert variant="warning">
          <AlertDescription>{AVISO_SQL_MENSAGENS}</AlertDescription>
        </Alert>
      )}
      {config.disponivel && !config.completo && (
        <Alert variant="warning">
          <AlertDescription>{AVISO_SQL_MODELOS}</AlertDescription>
        </Alert>
      )}

      {config.disponivel && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Envio automático</CardTitle>
              <CardDescription>
                {config.ativo
                  ? `Ligado: o parabéns por e-mail sai todo dia a partir das ${rotuloHora(config.horaEnvio)}.`
                  : "Desligado: ninguém recebe o e-mail sozinho."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <EnvioAutomaticoForm
                config={{ ativo: config.ativo, horaEnvio: config.horaEnvio, avisoEquipeEmails: config.avisoEquipeEmails }}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-base">Mensagens específicas</CardTitle>
                  <CardDescription>
                    Para quem atende critérios — idade que completa, tempo de filiação, fonte, condição na fonte, lugar. Vale a
                    primeira da lista que a pessoa atender; quem não atender nenhuma recebe a mensagem padrão.
                  </CardDescription>
                </div>
                {config.completo && (
                  <Button asChild size="sm">
                    <Link href="/painel/comunicacao/aniversariantes/mensagens/nova">
                      <Plus />
                      Nova mensagem específica
                    </Link>
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {modelos.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  Nenhuma ainda. Exemplos: aposentados, quem completa 60 anos, idades redondas, filiados há mais de 20 anos,
                  quem faz o primeiro aniversário como filiado.
                </p>
              ) : (
                <ol className="grid gap-2">
                  {modelos.map((m, i) => (
                    <li key={m.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
                      <span className="text-muted-foreground w-5 text-center text-sm tabular-nums">{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                          {m.nome}
                          {!m.ativo && <Badge variant="outline" className="text-muted-foreground">Fora de uso</Badge>}
                        </p>
                        <p className="text-muted-foreground text-xs">{descreverCriterios(m.criterios, base.fontes)}</p>
                      </div>
                      <div className="flex items-center gap-1">
                        {i > 0 && (
                          <form action={moverModeloAction}>
                            <input type="hidden" name="id" value={m.id} />
                            <input type="hidden" name="direcao" value="subir" />
                            <Button type="submit" variant="ghost" size="icon" aria-label="Subir">
                              <ArrowUp />
                            </Button>
                          </form>
                        )}
                        {i < modelos.length - 1 && (
                          <form action={moverModeloAction}>
                            <input type="hidden" name="id" value={m.id} />
                            <input type="hidden" name="direcao" value="descer" />
                            <Button type="submit" variant="ghost" size="icon" aria-label="Descer">
                              <ArrowDown />
                            </Button>
                          </form>
                        )}
                        <Button asChild variant="outline" size="sm">
                          <Link href={`/painel/comunicacao/aniversariantes/mensagens/${m.id}`}>
                            <Pencil />
                            Editar
                          </Link>
                        </Button>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Mensagem padrão</CardTitle>
              <CardDescription>
                {config.atualizadoEm
                  ? `A de quem não se encaixa em nenhuma específica · alterada em ${formatarDataHora(config.atualizadoEm)}${config.atualizadoPorNome ? ` por ${config.atualizadoPorNome}` : ""}`
                  : "A de quem não se encaixa em nenhuma específica"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <EditorParabens
                modo="padrao"
                inicial={{ assunto: config.assunto, mensagem: config.mensagem, textoWhatsapp: config.textoWhatsapp }}
                fontes={base.fontes}
                exemploNome={exemploNome}
                entidade={entidade}
              />
            </CardContent>
          </Card>
        </>
      )}
    </>
  )
}
