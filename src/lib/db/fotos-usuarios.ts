import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"

/**
 * FOTOS DE QUEM TEM ACESSO AO SISTEMA (`usuarios.foto`). A foto fica no
 * bucket privado `usuarios` (ou é URL externa, legado do Bubble) e chega à
 * tela por URL assinada. Aqui ficam o cache das URLs e as versões em lote,
 * para listas com avatar (ausências, aniversariantes, equipe…) não fazerem
 * uma ida ao Storage por pessoa. Ver [[confluir-fase-3a]].
 */

const BUCKET = "usuarios"

export const ehUrlExterna = (caminho: string) => /^(https?:)?\/\//.test(caminho)

const externa = (caminho: string) => (caminho.startsWith("//") ? `https:${caminho}` : caminho)

// A foto aparece na sidebar de TODA página do painel: a URL assinada é
// guardada e reaproveitada, em vez de uma ida ao Storage por navegação. O
// caminho muda a cada troca de foto, então o cache nunca serve foto velha.
// O caminho começa pelo tenant, então o cache não mistura entidades.
const VALIDADE_URL_S = 24 * 60 * 60
/** Renova com uma hora de folga antes de a URL expirar. */
const FOLGA_MS = 3600 * 1000
const urlsAssinadas = new Map<string, { url: string; expira: number }>()

function guardar(caminho: string, url: string) {
  if (urlsAssinadas.size > 5000) urlsAssinadas.clear()
  urlsAssinadas.set(caminho, { url, expira: Date.now() + VALIDADE_URL_S * 1000 - FOLGA_MS })
}

/** Esquece a URL de uma foto apagada. */
export function esquecerUrlFoto(caminho: string) {
  urlsAssinadas.delete(caminho)
}

export async function urlFoto(caminho: string | null): Promise<string | null> {
  if (!caminho) return null
  return (await urlsDasFotos([caminho])).get(caminho) ?? null
}

/** URLs de várias fotos de uma vez: cache primeiro, o resto num pedido só. */
export async function urlsDasFotos(caminhos: string[]): Promise<Map<string, string>> {
  const urls = new Map<string, string>()
  const faltam: string[] = []
  for (const c of new Set(caminhos.filter(Boolean))) {
    if (ehUrlExterna(c)) {
      urls.set(c, externa(c))
      continue
    }
    const guardada = urlsAssinadas.get(c)
    if (guardada && guardada.expira > Date.now()) urls.set(c, guardada.url)
    else faltam.push(c)
  }
  if (faltam.length === 0) return urls

  const admin = await createAdminClient()
  for (let de = 0; de < faltam.length; de += 100) {
    const { data } = await admin.storage.from(BUCKET).createSignedUrls(faltam.slice(de, de + 100), VALIDADE_URL_S)
    for (const item of data ?? []) {
      if (!item.path || !item.signedUrl) continue
      guardar(item.path, item.signedUrl)
      urls.set(item.path, item.signedUrl)
    }
  }
  return urls
}

/**
 * Foto (URL pronta) de cada usuário, por id. Quem não tem foto fica de fora
 * do mapa — a tela mostra as iniciais. Em fatias de 200 ids, como
 * `nomesDosUsuarios`; falha não derruba a tela, só tira as fotos.
 */
export async function fotosDosUsuarios(ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const fotos = new Map<string, string>()
  const unicos = [...new Set(ids.filter((v): v is string => !!v))]
  if (unicos.length === 0) return fotos
  try {
    const admin = await createAdminClient()
    const caminhoDe = new Map<string, string>()
    for (let de = 0; de < unicos.length; de += 200) {
      const { data } = await admin.from("usuarios").select("id, foto").in("id", unicos.slice(de, de + 200))
      for (const u of data ?? []) {
        const foto = typeof u.foto === "string" ? u.foto.trim() : ""
        if (foto) caminhoDe.set(u.id as string, foto)
      }
    }
    const urls = await urlsDasFotos([...caminhoDe.values()])
    for (const [id, caminho] of caminhoDe) {
      const url = urls.get(caminho)
      if (url) fotos.set(id, url)
    }
  } catch {
    // sem fotos: a tela cai nas iniciais
  }
  return fotos
}
