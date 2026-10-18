import Link from "next/link"
import { Ban, Home, PauseCircle, Settings2 } from "lucide-react"

import { EstadoVazio } from "@/components/portal/estado-vazio"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { configDaParte } from "@/lib/db/portal-partes"
import { definicaoDaParte, mensagemDaSituacao, type ChaveParte } from "@/lib/portal-partes-constantes"
import { getVisualizacaoPortal } from "@/lib/visualizacao-filiado"

/** Onde a gestão muda o estado das partes (Filiados › Área do associado). */
export const HREF_AREA_DO_ASSOCIADO = "/painel/filiados/area-do-associado"

/**
 * Linha só para quem está em "Ver como filiado": por que a tela está assim
 * e onde mudar. O associado nunca vê.
 */
function NotaDaGestao({ parte }: { parte: ChaveParte }) {
  return (
    <p className="text-muted-foreground flex flex-wrap items-center gap-1 text-xs">
      <Settings2 aria-hidden className="size-3.5" />
      Visível só para a gestão: o estado desta parte se muda em{" "}
      <Link href={`${HREF_AREA_DO_ASSOCIADO}#parte-${parte}`} className="underline underline-offset-2">
        Filiados › Área do associado
      </Link>
      .
    </p>
  )
}

/** Faixa no topo da parte suspensa: a mensagem da gestão e a volta prevista. */
export function AvisoParteSuspensa({
  parte,
  mensagem,
  preview = false,
}: {
  parte: ChaveParte
  mensagem: string
  preview?: boolean
}) {
  return (
    <div className="grid gap-2">
      <Alert variant="warning">
        <PauseCircle aria-hidden />
        {/* "Pausa em …": neutro para "Meu cadastro" e "Hospedagem" (gênero). */}
        <AlertTitle>Pausa em {definicaoDaParte(parte).titulo}</AlertTitle>
        <AlertDescription>{mensagem} O que você já tem aqui continua disponível para consulta.</AlertDescription>
      </Alert>
      {preview && <NotaDaGestao parte={parte} />}
    </div>
  )
}

/** A rota de uma parte desabilitada, dentro da casca: o motivo e a volta ao Início. */
export function ParteIndisponivel({
  parte,
  mensagem,
  preview = false,
}: {
  parte: ChaveParte
  mensagem: string
  preview?: boolean
}) {
  return (
    <div className="grid gap-2">
      <EstadoVazio
        cartao
        icone={Ban}
        titulo={`${definicaoDaParte(parte).titulo} não está disponível no portal`}
        descricao={mensagem}
        acao={
          <Button asChild variant="outline">
            <Link href="/portal/inicio">
              <Home />
              Voltar ao Início
            </Link>
          </Button>
        }
      />
      {preview && <NotaDaGestao parte={parte} />}
    </div>
  )
}

/**
 * Guarda de uma seção do portal (usada no layout.tsx de cada parte):
 * desabilitada → "indisponível" no lugar da página; suspensa → a faixa acima
 * dela. A trava das ações é outra (bloqueioDaParte em cada action): o layout
 * não re-renderiza ao navegar dentro da seção, então ele só informa — e cada
 * página da seção confere de novo (paginaIndisponivel, abaixo).
 *
 * "Ver como filiado" vê o mesmo que o associado, mais a nota da gestão.
 *
 * `desabilitadaNaPagina`: com a parte desabilitada, o layout não troca a
 * página pelo "indisponível" — cada página da seção já devolve o dela, e
 * logo abaixo o que ainda se cancela (Hospedagem e Eventos: cancelar evita a
 * falta e solta a vaga, e nunca é bloqueado).
 */
export async function GuardaParte({
  parte,
  desabilitadaNaPagina = false,
  children,
}: {
  parte: ChaveParte
  desabilitadaNaPagina?: boolean
  children: React.ReactNode
}) {
  const [cfg, vis] = await Promise.all([configDaParte(parte), getVisualizacaoPortal()])
  const preview = Boolean(vis?.preview)
  if (cfg.estado === "desabilitada") {
    if (desabilitadaNaPagina) return children
    return <ParteIndisponivel parte={parte} mensagem={mensagemDaSituacao(parte, cfg)} preview={preview} />
  }
  if (cfg.estado === "suspensa") {
    return (
      <>
        <AvisoParteSuspensa parte={parte} mensagem={mensagemDaSituacao(parte, cfg)} preview={preview} />
        {children}
      </>
    )
  }
  return children
}

/**
 * A mesma guarda, na PÁGINA da seção. No Next 16 layout e página renderizam
 * em paralelo, e o layout não se refaz ao navegar dentro da seção: o
 * "indisponível" do GuardaParte não impede a página de consultar, gravar,
 * redirecionar ou dar notFound, nem tira o conteúdo dela do RSC Payload. Por
 * isso a página de parte que pode ser desabilitada chama isto ANTES de tudo:
 *
 *   const indisponivel = await paginaIndisponivel("hospedagem")
 *   if (indisponivel) return indisponivel
 *
 * Desabilitada → o mesmo "indisponível" do layout (com a nota da gestão no
 * "Ver como filiado"); senão, null. Sem sessão também null: a página segue
 * para o requireVisualizacaoPortal() dela, que leva à entrada. Leitura que
 * falha → null (na dúvida, a parte vale). As duas leituras têm cache por
 * requisição: o layout e a página dividem.
 *
 * `complemento`: frase depois da mensagem, quando o layout da seção diz mais
 * que o padrão (a Saúde diz como pedir os dados).
 */
export async function paginaIndisponivel(
  parte: ChaveParte,
  { complemento }: { complemento?: string } = {}
): Promise<React.ReactElement | null> {
  const [cfg, vis] = await Promise.all([
    configDaParte(parte).catch(() => null),
    getVisualizacaoPortal().catch(() => null),
  ])
  if (cfg?.estado !== "desabilitada" || !vis) return null
  const mensagem = mensagemDaSituacao(parte, cfg)
  return (
    <ParteIndisponivel
      parte={parte}
      mensagem={complemento ? `${mensagem} ${complemento}` : mensagem}
      preview={vis.preview}
    />
  )
}
