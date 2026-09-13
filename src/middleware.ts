import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/lib/auth.config";

// Build NextAuth from the EDGE-SAFE config only. Importing `@/lib/auth` here
// would pull Prisma into the Edge runtime and crash every matched route in
// production with a server-side exception.
const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const isAuthed = !!req.auth?.user;
  const { pathname } = req.nextUrl;

  const isAuthPage = pathname === "/login" || pathname === "/register";
  const isApp = pathname.startsWith("/dashboard");

  if (isApp && !isAuthed) {
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }
  if (isAuthPage && isAuthed) {
    return NextResponse.redirect(new URL("/dashboard", req.nextUrl));
  }
  return NextResponse.next();
});

export const config = {
  matcher: ["/dashboard/:path*", "/login", "/register"],
};
