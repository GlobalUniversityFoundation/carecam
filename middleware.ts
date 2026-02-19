import { NextRequest, NextResponse } from "next/server";

function hasUsableToken(token: string | undefined) {
  if (!token) {
    return false;
  }

  const parts = token.split(".");
  if (parts.length !== 3) {
    return false;
  }

  try {
    const payloadSegment = parts[1];
    const base64 = payloadSegment.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    const payload = JSON.parse(
      atob(padded),
    ) as { exp?: number };

    if (!payload.exp) {
      return true;
    }

    return payload.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const userToken = request.cookies.get("carecam_token")?.value;
  const adminToken = request.cookies.get("carecam_admin_token")?.value;
  const isUserAuthenticated = hasUsableToken(userToken);
  const isAdminAuthenticated = hasUsableToken(adminToken);

  if (pathname === "/admin") {
    if (isAdminAuthenticated) {
      return NextResponse.redirect(new URL("/admin/dashboard", request.url));
    }
    return NextResponse.next();
  }

  if (pathname.startsWith("/admin/")) {
    if (!isAdminAuthenticated) {
      return NextResponse.redirect(new URL("/admin", request.url));
    }
    return NextResponse.next();
  }

  if (pathname === "/") {
    if (isUserAuthenticated) {
      return NextResponse.redirect(new URL("/home", request.url));
    }
    return NextResponse.next();
  }

  if (!isUserAuthenticated) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};

