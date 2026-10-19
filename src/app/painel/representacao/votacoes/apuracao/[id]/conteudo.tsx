import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { temVotoOnline } from "@/lib/assembleias-constantes"
import type { ApuracaoAssembleia } from "@/lib/db/assembleias"
import type { IntegridadeApuracao } from "@/lib/db/votacao-livro-apuracao"
import type { EmSeparadoLinha } from "@/lib/db/votacao-mesarios"
import { formatarDataHora } from "@/lib/formato"

import { ApuracaoForm } from "./apuracao-form"
import { EmSeparadoValidacao } from "./emseparado-validacao"
import { IntegridadeCard } from "./integridade-card"
import { RelatoriosApuracao } from "./relatorios"

/**
 * A apuração da assembleia: contagem por pergunta, votos em separado,
 * relatórios e o encerramento. É a aba "Apuração" da página da assembleia
 * (reorganização de 17/10/2026); a rota antiga /apuracao/<id> redireciona.
 */
export function ConteudoApuracao({
  dados,
  emSeparado,
  integridade = null,
}: {
  dados: ApuracaoAssembleia
  emSeparado: EmSeparadoLinha[]
  integridade?: IntegridadeApuracao | null
}) {
  return (
    <>
        {!dados.apuracaoDisponivel && (
          <Alert variant="warning">
            <AlertDescription>
              A apuração dos votos só fica disponível após o término da
              assembleia
              {dados.fimDaJanela ? (
                <> (em {formatarDataHora(dados.fimDaJanela)})</>
              ) : null}
              . Até lá, para preservar o sigilo, a contagem não é exibida — só o
              comparecimento acima.
            </AlertDescription>
          </Alert>
        )}

        {/* Contagem por pergunta: soma dos votos digitais/online + urnas físicas */}
        {dados.apuracaoDisponivel && dados.perguntas.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Contagem por pergunta</CardTitle>
              <CardDescription>
                Soma dos votos digitais/online e das urnas físicas (por opção, com
                branco e nulo).
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5">
              {dados.perguntas.map((p, i) => {
                const linhas = [
                  ...p.opcoes.map((o) => ({
                    chave: o.id,
                    rotulo: o.texto ?? "(opção)",
                    votos: o.votos,
                    destaque: true,
                  })),
                  { chave: "branco", rotulo: "Branco", votos: p.branco, destaque: false },
                  { chave: "nulo", rotulo: "Nulo", votos: p.nulo, destaque: false },
                ]
                return (
                  <div key={p.id} className="grid gap-2">
                    <p className="text-sm font-medium">
                      {i + 1}. {p.pergunta ?? "Pergunta"}
                      <span className="text-muted-foreground ml-2 text-xs font-normal">
                        {p.totalVotos.toLocaleString("pt-BR")} voto
                        {p.totalVotos === 1 ? "" : "s"}
                      </span>
                    </p>
                    <div className="grid gap-1.5">
                      {linhas.map((l) => {
                        const pct =
                          p.totalVotos > 0
                            ? Math.round((l.votos / p.totalVotos) * 100)
                            : 0
                        return (
                          <div key={l.chave} className="text-sm">
                            <div className="flex justify-between gap-2">
                              <span
                                className={
                                  l.destaque ? "truncate" : "text-muted-foreground truncate"
                                }
                              >
                                {l.rotulo}
                              </span>
                              <span className="text-muted-foreground tabular-nums">
                                {l.votos.toLocaleString("pt-BR")} · {pct}%
                              </span>
                            </div>
                            <div className="bg-muted mt-1 h-2 overflow-hidden rounded-full">
                              <div
                                className={
                                  l.destaque
                                    ? "bg-primary h-full rounded-full"
                                    : "bg-muted-foreground/40 h-full rounded-full"
                                }
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </CardContent>
          </Card>
        )}

        {/* Votos em separado — deferir/indeferir */}
        {emSeparado.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Votos em separado ({emSeparado.length})
              </CardTitle>
              <CardDescription>
                Defira os que têm direito (o voto entra na contagem) ou indefira
                (o voto é descartado). Nas urnas digitais, a contagem acima já
                respeita a decisão; nas físicas, some à contagem da urna as
                cédulas dos envelopes deferidos (o apurador os identifica pelo
                código do envelope, sem o nome). A apuração só se encerra com
                todos decididos e, ao encerrar, cada voto deixa de estar ligado
                ao eleitor: a decisão fica definitiva e os contatos do cadastro
                são apagados.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <EmSeparadoValidacao
                assembleiaId={dados.id}
                registros={emSeparado}
                encerrada={dados.apuracaoEncerrada}
              />
            </CardContent>
          </Card>
        )}

        {/* Relatórios da votação online (09/10/2026) — só depois do término. */}
        {dados.apuracaoDisponivel && temVotoOnline(dados.modalidade) && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Relatórios</CardTitle>
              <CardDescription>
                Em PDF.{" "}
                {dados.apuracaoEncerrada
                  ? "A apuração está encerrada: o resultado é o oficial."
                  : "Enquanto a apuração não for encerrada, o resultado sai como provisório."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <RelatoriosApuracao
                assembleiaId={dados.id}
                hibrida={dados.modalidade === "hibrida"}
              />
            </CardContent>
          </Card>
        )}

        {/* Hash, conferência e livro da apuração (dossiê C-2, C-3, C-5) */}
        {integridade && (
          <IntegridadeCard integridade={integridade} encerrada={dados.apuracaoEncerrada} />
        )}

        {/* Resultado agregado + encerrar/reabrir */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Resultado e fechamento</CardTitle>
            <CardDescription>
              O resultado final só aparece ao filiado depois de encerrada a
              apuração.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ApuracaoForm
              assembleiaId={dados.id}
              encerrada={dados.apuracaoEncerrada}
              disponivel={dados.apuracaoDisponivel}
            />
          </CardContent>
        </Card>
    </>
  )
}
