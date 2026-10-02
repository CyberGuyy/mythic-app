// Every request passes here first (lib/auth.js has the rules). Without
// MYTHIC_PASSWORD only this machine may open Mythic; with it, a request
// needs the session cookie the sign-in page sets. The token API, the sign-in
// page itself and static files are let through.
import { NextResponse } from 'next/server';
import { COOKIE, password, validSession, isLocalHost } from './lib/auth.js';

const OPEN = [/^\/api\/v1\//, /^\/login$/, /^\/api\/login$/, /^\/manifest\.webmanifest$/, /^\/favicon\.ico$/];

export function proxy(request) {
  const { pathname } = request.nextUrl;
  if (/^\/api\/v1\//.test(pathname)) return NextResponse.next();
  if (!password()) {
    if (isLocalHost(request.headers.get('host'))) return pathname === '/login' ? NextResponse.redirect(new URL('/dash', request.url)) : NextResponse.next();
    return new NextResponse('Mythic only answers on this machine. To open it from elsewhere, set MYTHIC_PASSWORD and restart it.', { status: 403, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
  if (OPEN.some(pattern => pattern.test(pathname))) return NextResponse.next();
  if (validSession(request.cookies.get(COOKIE)?.value)) return NextResponse.next();
  if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  const login = new URL('/login', request.url);
  if (pathname !== '/') login.searchParams.set('next', pathname);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image).*)'],
};
