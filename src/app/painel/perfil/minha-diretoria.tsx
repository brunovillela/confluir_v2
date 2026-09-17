import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import type { AreaDoDiretor, DiretoriaDoUsuario } from "@/lib/db/perfil-diretor"
import {
  ROTULOS_SITUACAO_CUSTEIO,
  type SituacaoCusteio,
} from "@/lib/custeio-constantes"
import { formatarData, formatarMoeda, formatarTelefone } from "@/lib/formato"

function periodo(inicio: string | null, fim: string | null): string {
  if (inicio && fim) return `${formatarData(inicio)} a ${formatarData(fim)}`
  if (inicio) return `desde ${formatarData(inicio)}`
  if (fim) return `até ${formatarData(fim)}`
  return "sem período informado"
}

/** Mostra só o fim de um dado bancário (conta, chave Pix). */
function mascarar(v: string | null): string | null {
  if (!v) return null
  const limpo = v.trim()
  return limpo.length <= 4 ? limpo : `•••${limpo.slice(-4)}`
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string | null }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{rotulo}</dt>
      <dd className="mt-0.5 text-sm break-words">{valor || "—"}</dd>
    </div>
  )
}

/**
 * Meu perfil do DIRETOR: mandato e cargo, liberação sindical, instâncias,
 * custeios pagos em seu nome e o resumo da ficha de diretor. Só leitura — a
 * ficha é mantida pela secretaria em Institucional → Diretoria.
 */
export function MinhaDiretoria({
  diretoria,
  area,
}: {
  diretoria: DiretoriaDoUsuario
  area: AreaDoDiretor
}) {
  const { ficha, lotacoes } = area
  return (
    <div>
      <h2 className="text-lg font-semibold">Minha diretoria</h2>
      <p className="text-muted-foreground mt-0.5 text-xs">
        Seu mandato e o que a entidade registra de você como diretor(a)
      </p>

      <div className="mt-4 grid items-start gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Mandato</CardTitle>
            <CardDescription>{diretoria.mandatoNome ?? "Mandato vigente"}</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-3 sm:grid-cols-2">
              <Linha rotulo="Cargo" valor={diretoria.cargo} />
              <Linha rotulo="Grupo" valor={diretoria.grupoNome} />
              <Linha rotulo="Vigência" valor={periodo(diretoria.mandatoInicio, diretoria.mandatoTermino)} />
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Liberação sindical</CardTitle>
            <CardDescription>Dias em que a empresa de origem libera você para o sindicato</CardDescription>
          </CardHeader>
          <CardContent>
            {area.liberacoes.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nenhuma liberação registrada.</p>
            ) : (
              <ul className="grid gap-2 text-sm">
                {area.liberacoes.map((l) => (
                  <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2.5">
                    <span>
                      <span className="font-medium">{l.empresaNome ?? "Empresa não informada"}</span>
                      <span className="text-muted-foreground block text-xs">
                        {[l.tipo === "permanente" ? "Permanente" : l.tipo === "pontual" ? "Pontual" : l.tipo, periodo(l.inicio, l.fim)]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    {l.vigente ? (
                      <Badge variant="outline" className="border-success/40 text-success-fg">
                        em vigor
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground">
                        encerrada
                      </Badge>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Custeios em meu nome</CardTitle>
            <CardDescription>Ajudas de custo pagas pela entidade a você</CardDescription>
          </CardHeader>
          <CardContent>
            {area.custeios.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nenhum custeio em seu nome.</p>
            ) : (
              <ul className="grid gap-2 text-sm">
                {area.custeios.map((c) => (
                  <li key={c.id} className="grid gap-0.5 rounded-md border p-2.5">
                    <span className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">{c.descricao ?? c.codigo ?? "Custeio"}</span>
                      <Badge variant="outline" className="text-muted-foreground">
                        {ROTULOS_SITUACAO_CUSTEIO[c.situacao as SituacaoCusteio] ?? c.situacao}
                      </Badge>
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {c.valorParcela !== null
                        ? `${formatarMoeda(c.valorParcela)}${c.cadencia === "recorrente" ? ` × ${c.numParcelas} parcelas` : ""}`
                        : "valor não informado"}
                      {c.primeiroVencimento ? ` · a partir de ${formatarData(c.primeiroVencimento)}` : ""}
                      {c.ordensTotal > 0 ? ` · ${c.ordensPagas} de ${c.ordensTotal} pagas` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Instâncias</CardTitle>
            <CardDescription>Onde você representa a entidade</CardDescription>
          </CardHeader>
          <CardContent>
            {area.assentos.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nenhum assento em instância registrado.</p>
            ) : (
              <ul className="grid gap-2 text-sm">
                {area.assentos.map((a) => (
                  <li key={a.id} className="rounded-md border p-2.5">
                    <span className="font-medium">{a.instanciaNome ?? "Instância"}</span>
                    <span className="text-muted-foreground block text-xs">
                      {[a.cargo, periodo(a.inicio, a.fim)].filter(Boolean).join(" · ")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Minha ficha de diretor</CardTitle>
            <CardDescription>
              Usada nos custeios e nos contatos da entidade. Para corrigir, fale com a secretaria.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!ficha ? (
              <p className="text-muted-foreground text-sm">A ficha ainda não foi preenchida.</p>
            ) : (
              <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Linha rotulo="E-mail particular" valor={ficha.email_particular} />
                <Linha
                  rotulo="Telefone particular"
                  valor={ficha.telefone_particular ? formatarTelefone(ficha.telefone_particular) : null}
                />
                <Linha
                  rotulo="Contato de emergência"
                  valor={[ficha.contato_emergencia, ficha.telefone_emergencia && formatarTelefone(ficha.telefone_emergencia)]
                    .filter(Boolean)
                    .join(" · ")}
                />
                {/* Filiado: a lotação vem dos vínculos da filiação; sem filiação, a base da ficha. */}
                {lotacoes ? (
                  <Linha rotulo={lotacoes.length > 1 ? "Lotações" : "Lotação"} valor={lotacoes.join("; ") || null} />
                ) : (
                  <Linha rotulo="Base operacional" valor={ficha.base_operacional} />
                )}
                <Linha
                  rotulo="Conta para custeio"
                  valor={[ficha.banco, ficha.agencia && `ag. ${ficha.agencia}`, mascarar(ficha.conta_corrente)]
                    .filter(Boolean)
                    .join(" · ")}
                />
                <Linha rotulo="Chave Pix" valor={[ficha.tipo_chave_pix, mascarar(ficha.pix)].filter(Boolean).join(": ")} />
                <Linha rotulo="Tipo sanguíneo" valor={ficha.tipo_sanguineo} />
                <Linha rotulo="Tamanho de camisa" valor={ficha.tamanho_camisa} />
              </dl>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
