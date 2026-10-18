import { ExternalLink, Globe, Mail, MapPin, Phone } from "lucide-react"

import { Indisponivel } from "@/components/portal/inicio/indisponivel"
import type { CanaisDoSindicato } from "@/lib/db/sindicato-portal"

/** Link que leva a uma linha inteira de texto: 44 px no toque (DESIGN.md). */
const LINK =
  "text-foreground font-medium underline-offset-4 hover:underline rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50 pointer-coarse:inline-flex pointer-coarse:min-h-11 pointer-coarse:items-center"

/**
 * Os canais oficiais da entidade numa lista compacta — e-mail, site e, de
 * cada sede, endereço e telefones (canaisDoSindicato: Configurações ›
 * Organização e as sedes). É o caminho do associado quando o portal está
 * fora do ar (tela de entrada e página de manutenção): sem Atendimento, é por
 * aqui que ele exerce um direito ou tira uma dúvida. Não inventa canal: o que
 * a entidade não cadastrou não aparece.
 */
export function CanaisDaEntidade({ canais }: { canais: CanaisDoSindicato | null }) {
  if (!canais) {
    return <Indisponivel>Não foi possível carregar os contatos do sindicato agora. Tente de novo daqui a pouco.</Indisponivel>
  }
  if (!canais.email && !canais.site && canais.sedes.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        A entidade ainda não publicou telefone, endereço ou e-mail por aqui. Procure a secretaria do sindicato.
      </p>
    )
  }

  return (
    <div className="grid gap-3 text-left text-sm">
      {(canais.email || canais.site) && (
        <ul className="grid gap-2">
          {canais.email && (
            <li className="flex items-center gap-2">
              <Mail className="text-muted-foreground size-4 shrink-0" aria-hidden />
              <span className="sr-only">E-mail: </span>
              <a href={`mailto:${canais.email}`} className={`${LINK} break-all`}>
                {canais.email}
              </a>
            </li>
          )}
          {canais.site && (
            <li className="flex items-center gap-2">
              <Globe className="text-muted-foreground size-4 shrink-0" aria-hidden />
              <span className="sr-only">Site: </span>
              <a href={canais.site} target="_blank" rel="noreferrer" className={`${LINK} break-all`}>
                {canais.siteRotulo}
                <span className="sr-only"> (abre em outra aba)</span>
              </a>
            </li>
          )}
        </ul>
      )}

      {canais.sedes.length > 0 && (
        <ul className="grid gap-3">
          {canais.sedes.map((s) => (
            <li key={s.id} className="grid content-start gap-1.5 rounded-lg border p-3">
              <p className="font-medium">{s.nome ?? "Sede"}</p>
              {s.endereco && (
                <p className="text-muted-foreground flex items-start gap-2">
                  <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span>
                    {s.endereco}
                    {s.mapa && (
                      <>
                        {" · "}
                        <a href={s.mapa} target="_blank" rel="noreferrer" className={LINK}>
                          Ver no mapa
                          <ExternalLink className="ml-1 inline size-3.5 align-[-2px]" aria-hidden />
                          <span className="sr-only"> (abre em outra aba)</span>
                        </a>
                      </>
                    )}
                  </span>
                </p>
              )}
              {s.telefones.length > 0 && (
                <p className="text-muted-foreground flex items-start gap-2">
                  <Phone className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span className="sr-only">Telefones: </span>
                  <span className="flex flex-wrap gap-x-3">
                    {s.telefones.map((t, i) =>
                      t.tel ? (
                        <a key={i} href={t.tel} className={`${LINK} tabular-nums`}>
                          {t.texto}
                        </a>
                      ) : (
                        <span key={i} className="text-foreground tabular-nums">
                          {t.texto}
                        </span>
                      )
                    )}
                  </span>
                </p>
              )}
            </li>
          ))}
        </ul>
      )}

      {canais.incompleto && (
        <Indisponivel className="text-xs">Parte dos canais não carregou agora — pode faltar algum.</Indisponivel>
      )}
    </div>
  )
}
