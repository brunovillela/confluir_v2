import { listarPrograma, type Congresso } from "@/lib/db/congressos"
import { listarResolucoes } from "@/lib/db/congressos-encerramento"

/** Resoluções não reservadas, por eixo (link pessoal e página pública). */
export async function ListaResolucoesPublica({ c, tenantId }: { c: Pick<Congresso, "id" | "nome" | "edicao">; tenantId: string }) {
  const [rs, programa] = await Promise.all([listarResolucoes(c as Congresso, { tenantId, publicas: true }), listarPrograma(c.id)])
  const nomeEixo = new Map(programa.eixos.map((e) => [e.id, e.nome]))
  const ordem = new Map(programa.eixos.map((e, i) => [e.id, i]))
  const grupos = new Map<string, typeof rs>()
  for (const r of rs) {
    const k = r.mocaoId ? "__mocoes" : (r.eixoId ?? "__sem")
    grupos.set(k, [...(grupos.get(k) ?? []), r])
  }
  const secoes = [...grupos.entries()].sort(
    ([a], [b]) => (a === "__mocoes" ? 1000 : (ordem.get(a) ?? 900)) - (b === "__mocoes" ? 1000 : (ordem.get(b) ?? 900))
  )
  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Resoluções</h1>
        <p className="text-muted-foreground text-sm">
          {c.edicao ? `${c.edicao}º ` : ""}
          {c.nome} · {rs.length} resolução(ões)
        </p>
      </div>
      {rs.length === 0 && <p className="text-sm">Nenhuma resolução publicada.</p>}
      {secoes.map(([k, itens]) => (
        <section key={k} className="grid gap-2">
          <h2 className="text-sm font-semibold">{k === "__mocoes" ? "Moções aprovadas" : k === "__sem" ? "Resoluções gerais" : (nomeEixo.get(k) ?? "Eixo")}</h2>
          <ol className="grid gap-2">
            {itens.map((r) => (
              <li key={r.id} className="rounded-lg border p-3 text-sm">
                <span className="font-semibold">{r.numero}. </span>
                {r.titulo && <span className="font-semibold">{r.titulo}. </span>}
                <span className="whitespace-pre-wrap">{r.texto}</span>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </div>
  )
}
