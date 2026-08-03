import { createServerClient } from "@supabase/ssr"
import { createClient as createServiceClient } from "@supabase/supabase-js"
import { NextResponse, type NextRequest } from "next/server"

import { EMP_PROPRIETARIA_ID, SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/env"
import {
  moduloDaRota,
  PERMISSOES_USUARIO_FK,
  podeAcessarModulo,
} from "@/lib/permissoes"
import { subdominioDoHost } from "@/lib/tenant-host"

/**
 * Proxy (ex-middleware) — responsável por:
 * 1. Renovar o token de sessão do Supabase a cada request (cookies).
 * 2. Bloquear /painel para quem não está autenticado ou não é funcionário.
 * 3. Aplicar o mapa rota → permissão (tabela `permissoes`) no /painel.
 * 4. Bloquear a área logada do /portal para quem não está autenticado.
 *
 * As páginas repetem as checagens via requireSessaoPainel/requirePermissao
 * (defesa em profundidade) — o proxy é a primeira barreira, não a única.
 *
 * RLS está habilitado com deny-all para anon/authenticated, então as
 * consultas a `usuarios`/`permissoes` usam o service role (server-side).
 */
export async function proxy(request: NextRequest) {
  // ── Resolução do tenant ───────────────────────────────────────────────
  // O tenant vem do subdomínio (<slug>.<APP_DOMAIN>). SEM subdomínio de tenant
  // (localhost, apex, admin…) cai no tenant do .env — mantém dev e o deploy
  // atual funcionando. COM subdomínio, a resolução é ESTRITA: subdomínio
  // desconhecido → /tenant-inexistente; tenant suspenso → /tenant-suspenso;
  // ativo → injeta `x-tenant-id`, lido por `tenantAtual()` no servidor.
  const paginaStatusTenant =
    request.nextUrl.pathname.startsWith("/tenant-inexistente") ||
    request.nextUrl.pathname.startsWith("/tenant-suspenso")

  let tenantId = EMP_PROPRIETARIA_ID
  const sub = subdominioDoHost(request.headers.get("host"))
  if (sub && !paginaStatusTenant) {
    const admin = createServiceClient(
      SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    const { data: tenant } = await admin
      .from("tenants")
      .select("empresa_id, status")
      .eq("slug", sub)
      .maybeSingle()

    if (!tenant) {
      const url = request.nextUrl.clone()
      url.pathname = "/tenant-inexistente"
      url.search = ""
      return NextResponse.rewrite(url)
    }
    if (tenant.status === "suspenso") {
      const url = request.nextUrl.clone()
      url.pathname = "/tenant-suspenso"
      url.search = ""
      return NextResponse.rewrite(url)
    }
    tenantId = tenant.empresa_id as string
  }

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set("x-tenant-id", tenantId)

  let response = NextResponse.next({ request: { headers: requestHeaders } })

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        )
        response = NextResponse.next({ request: { headers: requestHeaders } })
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        )
      },
    },
  })

  // Não executar nada entre a criação do client e o getUser() — o refresh
  // do token acontece aqui e precisa dos cookies intactos.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  const redirecionar = (destino: string, params?: Record<string, string>) => {
    const url = request.nextUrl.clone()
    url.pathname = destino
    url.search = ""
    if (params) {
      Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
    }
    const redirect = NextResponse.redirect(url)
    // Preserva cookies de sessão renovados pelo Supabase.
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie))
    return redirect
  }

  // ── Controlador da plataforma (super-admin, fora dos tenants) ─────────
  if (pathname.startsWith("/admin")) {
    if (!user) return redirecionar("/login", { next: pathname })
    const admin = createServiceClient(
      SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    const { data: sa } = await admin
      .from("plataforma_admins")
      .select("id")
      .eq("auth_user_id", user.id)
      .maybeSingle()
    if (!sa) return redirecionar("/login", { erro: "sem_acesso_admin" })
    return response
  }

  // ── Painel interno (funcionários) ─────────────────────────────────────
  if (pathname.startsWith("/painel")) {
    if (!user) {
      return redirecionar("/login", { next: pathname })
    }

    const admin = createServiceClient(
      SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { data: usuario } = await admin
      .from("usuarios")
      .select("id, inativo, deletado")
      .eq("auth_user_id", user.id)
      .eq("emp_proprietaria_id", tenantId)
      .maybeSingle()

    if (!usuario || usuario.inativo === true || usuario.deletado === true) {
      // Autenticado mas sem registro ativo de funcionário — pode ser um filiado.
      return redirecionar("/login", { erro: "sem_vinculo" })
    }

    // `usuarios` veio da tabela única de contas do Bubble (11,5k pessoas).
    // Quem define funcionário do sistema é o registro em `permissoes`.
    const { data: permissoes } = await admin
      .from("permissoes")
      .select("*")
      .eq(PERMISSOES_USUARIO_FK, usuario.id)
      .maybeSingle()

    if (!permissoes) {
      return redirecionar("/login", { erro: "sem_vinculo" })
    }

    const modulo = moduloDaRota(pathname)
    if (
      modulo?.chave &&
      pathname !== "/painel/sem-acesso" &&
      !podeAcessarModulo(permissoes, modulo)
    ) {
      return redirecionar("/painel/sem-acesso")
    }
  }

  // ── Portal do filiado (área logada; /portal é a tela de login) ────────
  // Exceção: /portal/oposicao é aberto ao público (trabalhador filiado OU
  // não-filiado) — tem autocadastro/login próprios; as sub-páginas do fluxo
  // exigem sessão via requireSessaoTrabalhador.
  if (
    pathname.startsWith("/portal/") &&
    !pathname.startsWith("/portal/oposicao") &&
    !user
  ) {
    return redirecionar("/portal")
  }

  // ── Interface do hotel (área logada; /hotel é a tela de login) ────────
  // O vínculo com o hotel é verificado por requireSessaoHotel nas páginas.
  if (pathname.startsWith("/hotel/") && !user) {
    return redirecionar("/hotel")
  }

  // ── Definição de senha (pós-convite/recuperação) exige sessão ─────────
  if (pathname.startsWith("/definir-senha") && !user) {
    return redirecionar("/login")
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Todas as rotas exceto estáticos — o refresh de sessão precisa rodar
     * em toda navegação, não só nas rotas protegidas.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
}
