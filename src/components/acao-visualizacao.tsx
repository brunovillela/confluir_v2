import { Eye } from "lucide-react"

/**
 * Envelope para os controles do portal no modo "Ver como filiado".
 *
 * O botão CONTINUA NA TELA, desligado. Quem atende o filiado precisa enxergar
 * exatamente o que ele enxerga para poder dizer "clique no botão laranja, no
 * fim da página" — se o botão some da visualização, o atendente orienta às
 * cegas.
 *
 * A trava de verdade não está aqui: as actions do portal leem a sessão real,
 * então a gestão não escreve pelo filiado nem se burlar o `disabled`. Isto é
 * só a camada visual dessa mesma regra.
 */
export function AcaoVisualizacao({
  preview,
  children,
  nota = "Somente o próprio associado pode usar este botão.",
}: {
  preview: boolean
  children: React.ReactNode
  /** O que dizer embaixo do controle desligado. */
  nota?: string
}) {
  if (!preview) return <>{children}</>

  return (
    <div className="grid gap-1.5">
      {/* `inert` tira a árvore inteira do clique e do teclado — nem Enter
          dentro de um campo dispara o submit. O cinza diz o mesmo aos olhos, e
          `aria-disabled`, a quem usa leitor de tela. */}
      <div className="opacity-60 select-none" aria-disabled="true" inert>
        {children}
      </div>
      {/* Nota vazia: dentro de tabela ou lista, repetir o aviso em cada linha
          viraria ruído — o tarjão do topo já diz que é visualização. */}
      {nota && (
        <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
          <Eye className="size-3.5 shrink-0" />
          {nota}
        </p>
      )}
    </div>
  )
}
