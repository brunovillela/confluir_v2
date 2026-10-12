import { LembrarLista, VoltarLista } from "@/components/voltar-lista"

/** A mesma chave dos dois lados: a lista lembra, a subpágina volta. */
function chaveDaLista(base: string): string {
  return `portal:${base}`
}

/**
 * "Voltar" das subpáginas do portal (A173): a seta com o nome da seção, sobre
 * o VoltarLista de sempre — 32 px no mouse, 44 px no toque e o mesmo respiro
 * em todas. Antes cada página repetia o próprio botão (28 px, ora mb-2, ora
 * mb-3). Quando a lista de origem guardou um recorte (página, filtro, busca)
 * com LembrarListaPortal, o voltar abre a lista como estava.
 */
export function VoltarPortal({ base, rotulo }: { base: string; rotulo: string }) {
  return (
    <VoltarLista
      chave={chaveDaLista(base)}
      base={base}
      rotulo={rotulo}
      className="-ml-2 mb-3 min-h-8 pointer-coarse:min-h-11"
    />
  )
}

/** Na lista com recorte na URL: guarda o endereço para o VoltarPortal da subpágina. */
export function LembrarListaPortal({ base, url }: { base: string; url: string }) {
  return <LembrarLista chave={chaveDaLista(base)} url={url} />
}
