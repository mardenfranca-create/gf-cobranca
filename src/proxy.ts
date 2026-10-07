import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { supabaseEnv } from "@/lib/config/supabase-env";
const PUBLIC = ["/login", "/auth"];

/** Renova a sessão do Supabase a cada request e protege as rotas da mesa e do portal.
 *  A autorização fina (admin/operador/cliente) acontece no servidor, em cada página e ação. */
export async function proxy(request: NextRequest) {
  // Rotas sem sessão: diagnóstico e webhooks (o Asaas autentica por token próprio na rota).
  if (request.nextUrl.pathname === "/diagnostico" || request.nextUrl.pathname.startsWith("/api/asaas/")) return NextResponse.next({ request });
  if (!supabaseEnv().ok) {
    return new NextResponse(
      "Configuração incompleta ou inválida das variáveis do Supabase. Abra /diagnostico para ver o que está errado.",
      { status: 500, headers: { "content-type": "text/plain; charset=utf-8" } },
    );
  }
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    supabaseEnv().url,
    supabaseEnv().anon,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // getUser() valida o token no servidor do Supabase; getSession() não.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC.some((p) => path.startsWith(p));
  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }
  if (user && path === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
