import { auth } from "@/auth";

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const isProtectedPool = ["/workspace", "/dashboard"].some((path) =>
    req.nextUrl.pathname.startsWith(path),
  );
  const isAuthPage = req.nextUrl.pathname.startsWith("/auth/signin");

  if (isProtectedPool && !isLoggedIn) {
    const newUrl = new URL("/auth/signin", req.nextUrl.origin);
    return Response.redirect(newUrl);
  }

  if (isAuthPage && isLoggedIn) {
    const newUrl = new URL("/dashboard", req.nextUrl.origin);
    return Response.redirect(newUrl);
  }
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
