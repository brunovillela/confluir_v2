import Link from "next/link"
import { Ban, Home, MessagesSquare, PauseCircle, Settings2 } from "lucide-react"

import { EstadoVazio } from "@/components/portal/estado-vazio"
import { AtualizarCascaSePendente } from "@/components/portal/guarda-primeiro-acesso"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { configDaParte } from "@/lib/db/portal-partes"
import { primeiroAcessoDaSessao } from "@/lib/db/portal-primeiro-acesso"
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

/** O texto padrão de parte desabilitada (mensagemDaSituacao): repetiria o título. */
const PADRAO_INDISPONIVEL = "Esta parte do portal não está disponível."

/**
 * Para onde vai quem precisa do que a parte fazia (a carteirinha, o extrato):
 * o Atendimento, quando ele recebe pedidos (habilitado, portal habilitado e
 * sem primeiro acesso pendente); senão, os canais de O sindicato. Com o
 * portal fora do ar (Hospedagem e Eventos seguem abertos para cancelar), os
 * dois levariam à manutenção: nenhum. Nunca a própria parte indisponível.
 */
async function canalComOSindicato(parte: ChaveParte): Promise<{ href: string; rotulo: string } | null> {
  const [portal, atendimento, sindicato, primeiroAcesso] = await Promise.all([
    configDaParte("portal").catch(() => null),
    configDaParte("atendimento").catch(() => null),
    configDaParte("sindicato").catch(() => null),
    primeiroAcessoDaSessao(),
  ])
  if (portal?.estado === "desabilitada") return null
  const atendimentoRecebe =
    (atendimento?.estado ?? "habilitada") === "habilitada" &&
    (portal?.estado ?? "habilitada") === "habilitada" &&
    !primeiroAcesso.pendente
  if (parte !== "atendimento" && atendimentoRecebe) {
    return { href: "/portal/atendimento?nova=1", rotulo: "Falar com o sindicato" }
  }
  if (parte !== "sindicato" && sindicato?.estado !== "desabilitada") {
    return { href: "/portal/sindicato", rotulo: "Falar com o sindicato" }
  }
  return null
}

/**
 * A rota de uma parte desabilitada, dentro da casca: o motivo, o caminho até o
 * sindicato e a volta ao Início. O título é o h1 da página. Sem mensagem
 * própria da gestão, o texto padrão repetiria o título: fica a orientação.
 */
export async function ParteIndisponivel({
  parte,
  mensagem,
  preview = false,
}: {
  parte: ChaveParte
  mensagem: string
  preview?: boolean
}) {
  const canal = await canalComOSindicato(parte).catch(() => null)
  // Sem mensagem própria da gestão: o resto (a previsão de volta, o
  // complemento da página) vem primeiro, e a orientação só quando o resto não
  // já diz com quem falar (a Saúde diz como pedir a cópia dos dados).
  let descricao = mensagem
  if (mensagem.startsWith(PADRAO_INDISPONIVEL)) {
    const resto = mensagem.slice(PADRAO_INDISPONIVEL.length).trim()
    const orientacao = /fale com/i.test(resto)
      ? ""
      : canal
        ? "Se precisar de algo desta parte, fale com o sindicato."
        : "Se precisar de algo desta parte, fale com a secretaria da entidade."
    descricao = [resto, orientacao].filter(Boolean).join(" ")
  }
  return (
    <div className="grid gap-2">
      <EstadoVazio
        cartao
        icone={Ban}
        tituloComo="h1"
        titulo={`${definicaoDaParte(parte).titulo} não está disponível no portal`}
        descricao={descricao}
        acao={
          <>
            {canal && (
              <Button asChild>
                <Link href={canal.href}>
                  <MessagesSquare />
                  {canal.rotulo}
                </Link>
              </Button>
            )}
            <Button asChild variant="outline">
              <Link href="/portal/inicio">
                <Home />
                Voltar ao Início
              </Link>
            </Button>
          </>
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
 *
 * Primeiro acesso pendente que a casca não conhece (o portal estava aberto
 * quando ele passou a valer): este layout se refaz ao entrar na seção, vê a
 * pendência e põe o AtualizarCascaSePendente, que atualiza a casca uma vez —
 * e o portão aparece, em vez de "pausas" sem motivo.
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
  const [cfg, vis, primeiroAcesso] = await Promise.all([
    configDaParte(parte),
    getVisualizacaoPortal(),
    primeiroAcessoDaSessao(),
  ])
  const preview = Boolean(vis?.preview)
  const atualizar = primeiroAcesso.pendente ? <AtualizarCascaSePendente /> : null
  if (cfg.estado === "desabilitada") {
    if (desabilitadaNaPagina) return children
    return <ParteIndisponivel parte={parte} mensagem={mensagemDaSituacao(parte, cfg)} preview={preview} />
  }
  if (cfg.estado === "suspensa") {
    return (
      <>
        {atualizar}
        <AvisoParteSuspensa parte={parte} mensagem={mensagemDaSituacao(parte, cfg)} preview={preview} />
        {children}
      </>
    )
  }
  return (
    <>
      {atualizar}
      {children}
    </>
  )
}

/**
 * A atualização da casca do primeiro acesso (ver GuardaParte) nas páginas
 * fora de um GuardaParte — Início e Avisos — e onde se navega dentro da mesma
 * seção (Atendimento: a lista e a solicitação). Leitura com cache por
 * requisição; sem pendência, nada.
 */
export async function CascaDoPrimeiroAcesso() {
  const p = await primeiroAcessoDaSessao()
  return p.pendente ? <AtualizarCascaSePendente /> : null
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
