/**
 * REDUÇÃO DE FOTOS NO NAVEGADOR (26/11/2026).
 *
 * Foto de celular sai com 3–8 MB e 4000 px de lado; para documento,
 * comprovante ou retrato, 2560 px e JPEG 88 % não mostram diferença a olho e
 * ficam com uma fração do tamanho. Reduzir antes de enviar poupa o Storage e
 * evita o teto de 4 MB do envio das server actions (next.config.ts).
 *
 * Quem usa:
 * - `components/layout/reducao-arquivos.tsx`: reduz QUALQUER `<input
 *   type="file">` do sistema na hora em que o arquivo é escolhido e segura o
 *   envio do formulário até a redução terminar.
 * - `lib/arquivo-envio.ts` (`prepararArquivo`): espera a redução em curso do
 *   input antes de conferir tipo e teto.
 *
 * Só fotos (JPEG/WEBP; PNG só quando passaria do teto). PDF, planilha e vídeo
 * não são tocados aqui — o servidor cuida do que dá para reduzir sem perda
 * (lib/reducao-arquivo.ts), e nunca de documento com assinatura digital.
 * Para deixar um campo de fora: `data-manter-original` no input ou num ancestral.
 */

/** Acima disto a foto é reduzida. */
export const REDUZIR_FOTO_ACIMA = 1.5 * 1024 * 1024
/** PNG (pode ter transparência) só vira JPEG se passar disto. */
const PNG_ACIMA = 3.5 * 1024 * 1024
/** Lado maior da foto reduzida. */
export const LADO_MAXIMO = 2560
const QUALIDADE = 0.88

/** Arquivos que já saíram desta redução — não reduzir de novo. */
const reduzidos = new WeakSet<File>()

/** Redução em andamento por input (para quem precisa esperar por ela). */
const emCurso = new WeakMap<HTMLInputElement, Promise<void>>()

/** O arquivo bate com a lista do `accept`? (tipo exato, "image/*" ou extensão) */
export function aceitoPor(arquivo: { name: string; type: string }, aceita: string | null | undefined): boolean {
  if (!aceita?.trim()) return true
  const nome = arquivo.name.toLowerCase()
  const tipo = arquivo.type.toLowerCase()
  return aceita.split(",").some((item) => {
    const a = item.trim().toLowerCase()
    if (!a) return false
    if (a.startsWith(".")) return nome.endsWith(a)
    if (a.endsWith("/*")) return tipo.startsWith(a.slice(0, -1))
    return tipo === a
  })
}

/** Vale a pena tentar reduzir este arquivo? (sem abrir a imagem) */
export function candidatoAReducao(arquivo: File): boolean {
  if (reduzidos.has(arquivo)) return false
  const tipo = arquivo.type.toLowerCase()
  if (tipo === "image/jpeg" || tipo === "image/webp") return arquivo.size > REDUZIR_FOTO_ACIMA
  if (tipo === "image/png") return arquivo.size > PNG_ACIMA
  return false
}

/**
 * Reduz uma foto grande para JPEG (lado maior até 2560 px). Devolve o próprio
 * arquivo quando não há o que ganhar, quando o JPEG não é aceito pelo campo
 * ou quando o navegador não consegue abrir a imagem (HEIC, por exemplo).
 */
export async function reduzirFoto(arquivo: File, aceita?: string | null): Promise<File> {
  if (!candidatoAReducao(arquivo)) return arquivo
  const nome = arquivo.name.replace(/\.[^.]+$/, "") + ".jpg"
  if (!aceitoPor({ name: nome, type: "image/jpeg" }, aceita)) return arquivo
  try {
    const bitmap = await createImageBitmap(arquivo)
    const escala = Math.min(1, LADO_MAXIMO / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement("canvas")
    canvas.width = Math.round(bitmap.width * escala)
    canvas.height = Math.round(bitmap.height * escala)
    const ctx = canvas.getContext("2d")
    if (!ctx) return arquivo
    // JPEG não tem transparência: fundo branco (PNG de documento/assinatura).
    ctx.fillStyle = "#fff"
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close?.()
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", QUALIDADE))
    // Só troca se ganhou de verdade (≥ 10 %).
    if (!blob || blob.size > arquivo.size * 0.9) return arquivo
    const pronto = new File([blob], nome, { type: "image/jpeg", lastModified: arquivo.lastModified })
    reduzidos.add(pronto)
    return pronto
  } catch {
    return arquivo
  }
}

function mesmosArquivos(a: FileList | null, b: File[]): boolean {
  if (!a || a.length !== b.length) return false
  return b.every((f, i) => a[i] === f || (a[i].name === f.name && a[i].size === f.size && a[i].lastModified === f.lastModified))
}

/** Evento que o CampoArquivo escuta para redesenhar (components/ui/campo-arquivo). */
function avisarTroca(input: HTMLInputElement) {
  input.dispatchEvent(new Event("arquivo-trocado"))
}

/**
 * Reduz as fotos escolhidas num input e troca os arquivos do próprio input
 * (é ele que vai no envio do formulário). Não dispara "change" de novo — quem
 * envia ao escolher não pode enviar duas vezes. Registra a redução para que
 * `aguardarReducao()` e o envio do formulário esperem por ela.
 */
export function reduzirArquivosDoInput(input: HTMLInputElement): Promise<void> | null {
  if (input.closest("[data-manter-original]")) return null
  const originais = [...(input.files ?? [])]
  if (!originais.some(candidatoAReducao)) return null
  const aceita = input.getAttribute("accept")
  const tarefa = (async () => {
    const prontos = await Promise.all(originais.map((f) => reduzirFoto(f, aceita)))
    if (prontos.every((f, i) => f === originais[i])) return
    // Outro arquivo foi escolhido enquanto este era reduzido: vale o novo.
    if (!mesmosArquivos(input.files, originais)) return
    try {
      const dt = new DataTransfer()
      for (const f of prontos) dt.items.add(f)
      input.files = dt.files
      avisarTroca(input)
    } catch {
      // Navegador sem DataTransfer: segue o original (o servidor ainda reduz).
    }
  })()
  // Teto de espera: o envio nunca fica preso por uma redução travada.
  const limitada = Promise.race([tarefa, new Promise<void>((ok) => setTimeout(ok, 20_000))]).catch(() => undefined)
  emCurso.set(input, limitada)
  void limitada.finally(() => {
    if (emCurso.get(input) === limitada) emCurso.delete(input)
  })
  return limitada
}

/** Espera a redução em curso no input, se houver. */
export async function aguardarReducao(input: HTMLInputElement): Promise<void> {
  await emCurso.get(input)
}

/** Reduções ainda em curso nos campos de arquivo de um formulário. */
export function reducoesPendentes(form: HTMLFormElement): Promise<void>[] {
  const pendentes: Promise<void>[] = []
  for (const el of Array.from(form.elements)) {
    if (el instanceof HTMLInputElement && el.type === "file") {
      const p = emCurso.get(el)
      if (p) pendentes.push(p)
    }
  }
  return pendentes
}
