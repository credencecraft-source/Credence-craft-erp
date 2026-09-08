import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { prisma } from '@/lib/database/prisma-client';

export const runtime = 'nodejs';

export async function middleware(request: NextRequest) {
  const url = request.nextUrl;
  const pathname = url.pathname;

  try {
    // 1. Fetch active plan restrictions dynamically from Prisma database
    // (You can optimize this with a short-lived cache if needed)
    const restrictions = await prisma.plan_restrictions.findMany({
      where: { restriction_type: 'block' }
    });

    // 2. Check if the current URL path matches any dynamic restriction rule path pattern
    for (const rule of restrictions) {
      if (!rule.master_module) continue;

      const master = rule.master_module.toLowerCase().replace(/\s+/g, '-');
      const main = rule.main_module ? rule.main_module.toLowerCase().replace(/\s+/g, '-') : '*';
      const sub = rule.sub_module ? rule.sub_module.toLowerCase().replace(/\s+/g, '-') : '*';

      // Build path segments to verify if current URL falls under this restriction
      const segments = pathname.toLowerCase().split('/').filter(Boolean);
      // Expected layout: ['dashboard', workspaceId, 'organizations', organizationId, master, main?, sub?]
      const orgIndex = segments.indexOf('organizations');
      
      if (orgIndex !== -1 && segments.length > orgIndex + 2) {
        const currentMaster = segments[orgIndex + 2];
        const currentMain = segments[orgIndex + 3];
        const currentSub = segments[orgIndex + 4];

        const masterMatch = master === '*' || master === currentMaster;
        const mainMatch = main === '*' || !main || main === currentMain;
        const subMatch = sub === '*' || !sub || sub === currentSub;

        if (masterMatch && mainMatch && subMatch) {
          const orgBase = pathname.substring(0, pathname.indexOf('/', pathname.indexOf('/organizations/') + 15) !== -1 
            ? pathname.indexOf('/', pathname.indexOf('/organizations/') + 15) 
            : pathname.length);
          
          const message = encodeURIComponent(rule.custom_message || 'Access to this module/feature is restricted by your current plan.');
          return NextResponse.redirect(new URL(`${orgBase}/access-blocked?message=${message}`, request.url));
        }
      }
    }
  } catch (err) {
    // Fail safely if database lookup fails temporarily
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-current-path", pathname);

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: ['/dashboard/:path*', '/api/:path*'],
};