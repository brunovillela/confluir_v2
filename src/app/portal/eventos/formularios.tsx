"use client"

import { useActionState, useEffect, useRef, useState, useTransition } from "react"
import { Check, Loader2, UserPlus, X } from "lucide-react"
import { toast } from "sonner"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { confirmar } from "@/components/ui/confirmacao"
import { cn } from "@/lib/utils"

import {
  cancelarAction,
  inscreverAction,
  responderRsvpPortalAction,
} from "./actions"

function Recado({ erro, ok }: { erro?: string; ok?: string }) {
  if (!erro && !ok) return null
  return (
    <Alert variant={erro ? "destructive" : "success"}>
      <AlertDescription className="text-sm">{erro ?? ok}</AlertDescription>
    </Alert>
  )
}

/** Rola até o cartão do evento, onde quer que ele esteja agora. */
function irParaEvento(eventoId: string) {
  document
    .getElementById(`evento-${eventoId}`)
    ?.scrollIntoView({ behavior: "smooth", block: "start" })
}

/**
 * "Quero participar". A inscrição muda o evento de seção (de "Inscrições
 * abertas" para "Minhas inscrições") na mesma atualização em que a resposta
 * chega — e este componente some junto com o cartão antigo. Por isso a
 * confirmação vai num aviso flutuante (sonner, montado no layout raiz), que
 * sobrevive ao desmonte e aparece onde a pessoa está, com o atalho para o
 * cartão novo (A88). A action é chamada direto, não por useActionState: o
 * efeito que leria o estado nunca rodaria num componente já desmontado.
 */
export function Inscrever({ eventoId }: { eventoId: string }) {
  const [pendente, iniciar] = useTransition()
  const [erro, setErro] = useState<string | null>(null)

  function enviar(fd: FormData) {
    setErro(null)
    iniciar(async () => {
      const r = await inscreverAction({}, fd)
      if (r.erro) {
        setErro(r.erro)
        return
      }
      toast.success(r.ok ?? "Inscrição feita.", {
        duration: 10_000,
        action: { label: "Ver minha inscrição", onClick: () => irParaEvento(eventoId) },
      })
    })
  }

  return (
    <form action={enviar} className="grid gap-2">
      <input type="hidden" name="eventoId" value={eventoId} />
      {erro && <Recado erro={erro} />}
      <div>
        <Button type="submit" disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : <UserPlus />}
          Quero participar
        </Button>
        <p className="text-muted-foreground mt-2 text-xs">
          Seus dados já estão com o sindicato — basta um toque.
        </p>
      </div>
    </form>
  )
}

export function ResponderRsvp({
  token,
  resposta,
}: {
  token: string
  resposta: boolean | null
}) {
  const [estado, formAction, pendente] = useActionState(
    responderRsvpPortalAction,
    {}
  )

  return (
    <div className="grid gap-2">
      <Recado erro={estado.erro} ok={estado.ok} />
      {resposta !== null && !estado.ok && (
        <p className="text-muted-foreground text-sm">
          Você respondeu que <strong>{resposta ? "vai" : "não vai"}</strong>{" "}
          comparecer. Pode mudar abaixo.
        </p>
      )}
      {/* Tamanho padrão: 44 px no toque (A119). gap-y-3 para as áreas de toque
          não se sobreporem quando os dois quebram de linha no celular. */}
      <div className="flex flex-wrap gap-x-2 gap-y-3">
        <form action={formAction}>
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="vem" value="sim" />
          <Button type="submit" disabled={pendente}>
            <Check />
            Vou comparecer
          </Button>
        </form>
        <form action={formAction}>
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="vem" value="nao" />
          <Button type="submit" variant="outline" disabled={pendente}>
            <X />
            Não vou poder ir
          </Button>
        </form>
      </div>
      {/* A82: o "não vou" só registra a resposta — a inscrição continua
          confirmada e a vaga continua contando. Liberar a vaga de fato é
          cancelar a inscrição, logo abaixo. */}
      <p className="text-muted-foreground text-xs">
        Avisar que não vai não é falta — ajuda o sindicato a oferecer seu lugar
        a quem está na lista de espera. Se tiver certeza de que não vai, cancele
        a inscrição: aí a vaga fica livre na hora.
      </p>
    </div>
  )
}

/**
 * Cancelar (confirmada) ou desistir (aguardando avaliação ou na lista de
 * espera) — A81. Sempre com a confirmação do sistema, dizendo o que acontece
 * e como voltar (A132): cancelada reabre o evento para a pessoa, se ainda
 * houver vaga e prazo. O sucesso vai pelo aviso flutuante pelo mesmo motivo
 * do `Inscrever`: o cartão muda de seção e este componente some.
 */
export function CancelarInscricao({
  inscricaoId,
  situacao,
}: {
  inscricaoId: string
  situacao: string | null
}) {
  const [pendente, iniciar] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  const confirmada = situacao === "confirmada"
  const volta = "Para voltar, é preciso se inscrever de novo — se ainda houver vaga e prazo."

  async function cancelar() {
    setErro(null)
    const ok = await confirmar(
      confirmada
        ? {
            titulo: "Cancelar sua inscrição?",
            descricao: `Você perde a vaga, que fica livre para outra pessoa. ${volta}`,
            confirmar: "Cancelar inscrição",
            cancelar: "Manter inscrição",
            destrutivo: true,
          }
        : situacao === "lista_espera"
          ? {
              titulo: "Desistir da lista de espera?",
              descricao: `Você sai da fila e o lugar passa para a próxima pessoa. ${volta}`,
              confirmar: "Desistir",
              cancelar: "Continuar na fila",
              destrutivo: true,
            }
          : {
              titulo: "Desistir da inscrição?",
              descricao: `Ela sai da avaliação do sindicato. ${volta}`,
              confirmar: "Desistir",
              cancelar: "Manter inscrição",
              destrutivo: true,
            }
    )
    if (!ok) return
    const fd = new FormData()
    fd.set("inscricaoId", inscricaoId)
    iniciar(async () => {
      const r = await cancelarAction({}, fd)
      if (r.erro) setErro(r.erro)
      else toast.success(r.ok ?? "Inscrição cancelada.", { duration: 8_000 })
    })
  }

  return (
    <div className="grid gap-2">
      {erro && <Recado erro={erro} />}
      <div>
        <Button type="button" variant="outline" onClick={cancelar} disabled={pendente}>
          {pendente ? <Loader2 className="animate-spin" /> : null}
          {confirmada ? "Cancelar minha inscrição" : "Desistir da inscrição"}
        </Button>
      </div>
    </div>
  )
}

/**
 * Âncora dentro da seção recolhida ("Eventos anteriores"): o aviso antigo do
 * sino leva a #inscricao-<id>, que fica num <details> fechado. A navegação
 * do Next só rola até o elemento — que, recolhido, nem tem onde estar —, e o
 * navegador só abre a seção sozinho quando a página carrega do zero. Aqui a
 * seção abre e a página rola até a inscrição.
 */
export function AbrirAncoraRecolhida() {
  useEffect(() => {
    function abrir() {
      // Os ids daqui são uuid: o hash não precisa de decodificação.
      const id = window.location.hash.slice(1)
      if (!id) return
      const alvo = document.getElementById(id)
      const secao = alvo?.closest("details")
      if (!alvo || !secao || secao.open) return
      secao.open = true
      alvo.scrollIntoView({ block: "start" })
    }
    abrir()
    window.addEventListener("hashchange", abrir)
    return () => window.removeEventListener("hashchange", abrir)
  }, [])
  return null
}

/**
 * Descrição do evento em três linhas, com "Ver mais" quando o texto passa
 * disso (A83) — antes era um corte seco, sem como ler o resto. A medida é do
 * navegador: só ele sabe quantas linhas o texto ocupa naquela largura.
 */
export function DescricaoEvento({ texto }: { texto: string }) {
  const ref = useRef<HTMLParagraphElement>(null)
  const [aberta, setAberta] = useState(false)
  const [corta, setCorta] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el || aberta) return
    // O observador mede na primeira vez e a cada mudança de largura.
    const obs = new ResizeObserver(() => setCorta(el.scrollHeight > el.clientHeight + 1))
    obs.observe(el)
    return () => obs.disconnect()
  }, [aberta])

  return (
    <div className="grid justify-items-start gap-1">
      <p ref={ref} className={cn("text-sm whitespace-pre-line", !aberta && "line-clamp-3")}>
        {texto}
      </p>
      {(corta || aberta) && (
        <Button
          type="button"
          variant="link"
          className="h-auto px-0 pointer-coarse:min-h-11"
          aria-expanded={aberta}
          onClick={() => setAberta((v) => !v)}
        >
          {aberta ? "Ver menos" : "Ver mais"}
        </Button>
      )}
    </div>
  )
}
