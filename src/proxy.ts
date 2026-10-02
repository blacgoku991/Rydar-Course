import { NextResponse, type NextRequest } from "next/server";

const LOCALES = ["fr", "en"];

function preferredLocale(req: NextRequest) {
  const header = req.headers.get("accept-language");
  if (!header) return "fr";
  const first = header
    .split(",")
    .map((part) => {
      const [tag, q] = part.trim().split(";q=");
      return { tag: tag.toLowerCase(), q: q ? Number(q) : 1 };
    })
    .sort((a, b) => b.q - a.q)[0];
  return first?.tag.startsWith("fr") ? "fr" : "en";
}

/** Redirige les adresses sans langue (/ , /quelque-chose) vers /fr/… ou /en/… */
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const first = pathname.split("/")[1] ?? "";
  if (LOCALES.includes(first)) return;
  const url = req.nextUrl.clone();
  url.pathname = `/${pathname === "/" ? preferredLocale(req) : "fr"}${pathname === "/" ? "" : pathname}`;
  return NextResponse.redirect(url, pathname === "/" ? 307 : 308);
}

export const config = {
  matcher: ["/((?!api|setup|_next|.*\\..*).*)"],
};
