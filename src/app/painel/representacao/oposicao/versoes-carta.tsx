import Link from "next/link"
import { ArrowLeftRight, PencilLine } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { SelectNativo } from "@/components/ui/select-nativo"
import { compararTextos, resumoDaComparacao } from "@/lib/comparar-textos"
import type { VersaoCarta } from "@/lib/db/oposicao-carta"
import { formatarDataHora } from "@/lib/formato"
import { CARTA_PADRAO, separarTitulo, TITULO_PADRAO } from "@/lib/oposicao-carta"

/**
 * As versões salvas do texto da carta e a comparação de duas (15/11/2026).
 * Serve ao padrão da entidade e à campanha. Uma versão "voltou ao padrão"
 * (modelo nulo) mostra o texto que passou a valer: na entidade, o do sistema;
 * na campanha, o da entidade naquele momento.
 */

export type OpcaoVersao = {
  id: string
  rotulo: string
  /** O texto que valia (já resolvido o "voltou ao padrão"). */
  texto: string
  versao: VersaoCarta | null
  descricao: string
}

/** O texto da entidade que valia num momento (pelas versões da entidade). */
function entidadeEm(versoesEntidade: VersaoCarta[], em: string, atual: string | null): string {
  const v = versoesEntidade.find((x) => x.em <= em)
  if (v) return v.modelo ?? CARTA_PADRAO
  // Antes da primeira versão registrada: a mais antiga conhecida, senão o atual.
  const maisAntiga = versoesEntidade[versoesEntidade.length - 1]
  return maisAntiga ? (maisAntiga.modelo ?? CARTA_PADRAO) : (atual ?? CARTA_PADRAO)
}

export function opcoesDeVersao({
  campanha,
  versoes,
  versoesEntidade,
  entidadeAtual,
}: {
  campanha: boolean
  versoes: VersaoCarta[]
  versoesEntidade: VersaoCarta[]
  entidadeAtual: string | null
}): OpcaoVersao[] {
  const opcoes: OpcaoVersao[] = versoes.map((v, i) => {
    const texto =
      v.modelo ?? (campanha ? entidadeEm(versoesEntidade, v.em, entidadeAtual) : CARTA_PADRAO)
    const quando = formatarDataHora(v.em)
    return {
      id: v.id,
      rotulo: `${quando}${v.porNome ? ` — ${v.porNome}` : ""}${i === 0 ? " (atual)" : ""}`,
      texto,
      versao: v,
      descricao: v.modelo
        ? campanha
          ? "Texto próprio da campanha"
          : "Texto da entidade"
        : campanha
          ? "Voltou a seguir o texto da entidade"
          : "Voltou ao texto padrão do sistema",
    }
  })
  // A referência de cima vem primeiro: na campanha, o texto da entidade.
  if (campanha) {
    opcoes.push({
      id: "entidade",
      rotulo: "Texto da entidade (atual)",
      texto: entidadeAtual ?? CARTA_PADRAO,
      versao: null,
      descricao: "O padrão da entidade hoje",
    })
  }
  opcoes.push({
    id: "sistema",
    rotulo: "Texto padrão do sistema",
    texto: CARTA_PADRAO,
    versao: null,
    descricao: "O texto que vem com o Confluir",
  })
  return opcoes
}

/** O modelo como o jurídico lê: o título numa linha própria, depois o texto. */
function paraComparar(modelo: string): string {
  const { titulo, corpo } = separarTitulo(modelo)
  return `Título: ${titulo ?? TITULO_PADRAO}\n\n${corpo}`
}

export function VersoesCarta({
  opcoes,
  a,
  b,
  aqui,
  editorHref,
  podeEditar,
}: {
  opcoes: OpcaoVersao[]
  a: string | undefined
  b: string | undefined
  /** Esta página (o formulário de comparação volta para ela). */
  aqui: string
  /** O editor; "?versao=<id>" abre aquela versão nele. */
  editorHref: string
  podeEditar: boolean
}) {
  const salvas = opcoes.filter((o) => o.versao)
  // Padrão: a atual contra a anterior (ou contra o padrão, se só há uma).
  const depois = opcoes.find((o) => o.id === b) ?? salvas[0] ?? opcoes[0]
  const antes =
    opcoes.find((o) => o.id === a) ??
    salvas[salvas.indexOf(depois) + 1] ??
    opcoes.find((o) => !o.versao && o.id !== depois.id) ??
    opcoes[0]
  const trechos = compararTextos(paraComparar(antes.texto), paraComparar(depois.texto))
  const { incluidas, removidas } = resumoDaComparacao(trechos)
  const iguais = incluidas === 0 && removidas === 0

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Comparar duas versões</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          <form action={aqui} className="grid items-end gap-3 sm:grid-cols-[1fr_1fr_auto]">
            <div className="grid gap-1.5">
              <Label htmlFor="versao-a">Antes</Label>
              <SelectNativo id="versao-a" name="a" defaultValue={antes.id}>
                {opcoes.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.rotulo}
                  </option>
                ))}
              </SelectNativo>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="versao-b">Depois</Label>
              <SelectNativo id="versao-b" name="b" defaultValue={depois.id}>
                {opcoes.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.rotulo}
                  </option>
                ))}
              </SelectNativo>
            </div>
            <Button type="submit" variant="outline">
              <ArrowLeftRight />
              Comparar
            </Button>
          </form>

          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">
              De <strong className="text-foreground">{antes.rotulo}</strong> para{" "}
              <strong className="text-foreground">{depois.rotulo}</strong>:
            </span>
            {iguais ? (
              <Badge variant="secondary">Os textos são iguais</Badge>
            ) : (
              <>
                <Badge variant="success">
                  +{incluidas} {incluidas === 1 ? "palavra" : "palavras"}
                </Badge>
                <Badge variant="destructive">
                  −{removidas} {removidas === 1 ? "palavra" : "palavras"}
                </Badge>
              </>
            )}
          </div>

          <div
            className="bg-background rounded-md border p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap"
            aria-label="Comparação dos textos"
          >
            {trechos.map((t, i) =>
              t.tipo === "igual" ? (
                <span key={i}>{t.texto}</span>
              ) : t.tipo === "incluido" ? (
                <ins key={i} className="bg-success/20 text-success-fg mx-0.5 rounded-sm px-0.5 no-underline" title="Entrou">
                  {t.texto}
                </ins>
              ) : (
                <del key={i} className="bg-destructive/15 text-destructive mx-0.5 rounded-sm px-0.5" title="Saiu">
                  {t.texto}
                </del>
              )
            )}
          </div>
          <p className="text-muted-foreground text-xs">
            Em verde, o que entrou; riscado em vermelho, o que saiu. As referências aparecem como estão no modelo
            ([NOME_COMPLETO]…).
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Versões salvas</CardTitle>
        </CardHeader>
        <CardContent>
          {salvas.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Nenhuma versão salva ainda: vale o texto padrão. Cada vez que alguém salvar o texto, uma versão nova
              entra aqui.
            </p>
          ) : (
            <ol className="divide-y">
              {salvas.map((o, i) => {
                const anterior = salvas[i + 1] ?? opcoes.find((x) => !x.versao && x.id !== o.id)
                return (
                  <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div className="grid gap-0.5">
                      <p className="text-sm font-medium">
                        {formatarDataHora(o.versao!.em)}
                        {i === 0 && (
                          <Badge variant="secondary" className="ml-2">
                            Atual
                          </Badge>
                        )}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {o.descricao}
                        {o.versao!.porNome ? ` · por ${o.versao!.porNome}` : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {anterior && (
                        <Button variant="outline" size="sm" asChild>
                          <Link href={`${aqui}?a=${anterior.id}&b=${o.id}`}>
                            <ArrowLeftRight />
                            {salvas[i + 1] ? "Comparar com a anterior" : `Comparar com o ${anterior.rotulo.toLowerCase()}`}
                          </Link>
                        </Button>
                      )}
                      {podeEditar && i > 0 && (
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`${editorHref}?versao=${o.id}`}>
                            <PencilLine />
                            Abrir no editor
                          </Link>
                        </Button>
                      )}
                    </div>
                  </li>
                )
              })}
            </ol>
          )}
          <p className="text-muted-foreground mt-3 text-xs">
            As versões são guardadas desde 15/11/2026; de antes, só o texto que estava salvo naquele dia. Versão
            registrada não se apaga. Cada oposição guarda o texto com que foi registrada, qualquer que seja a versão
            de hoje.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
