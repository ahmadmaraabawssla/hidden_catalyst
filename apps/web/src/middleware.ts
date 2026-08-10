import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const ADMIN_SECRET = process.env.ADMIN_SECRET || 'dev-admin-secret';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Protect admin routes
  if (pathname.startsWith('/admin')) {
    const token = request.cookies.get('admin_token')?.value;

    if (token !== ADMIN_SECRET) {
      // For dev convenience: if no secret set, allow access
      if (!process.env.ADMIN_SECRET) {
        return NextResponse.next();
      }
      const url = new URL('/', request.url);
      return NextResponse.redirect(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*'],
};
