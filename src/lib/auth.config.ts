import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe auth configuration — NO Prisma, NO bcrypt, no Node-only imports.
 *
 * Next.js middleware runs on the Edge runtime in production, where Prisma
 * Client cannot execute. The middleware therefore builds NextAuth from THIS
 * config only (JWT session checks + redirects), while the full configuration
 * in `auth.ts` adds the Prisma adapter and the Credentials provider for use in
 * Node runtime (API routes / server components).
 */
export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  trustHost: true,
  // Providers are added in auth.ts; middleware only needs to read the JWT.
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user) token.id = user.id;
      return token;
    },
    session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
