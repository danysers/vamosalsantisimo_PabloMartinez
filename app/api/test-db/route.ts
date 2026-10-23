import { NextResponse } from 'next/server';

// Public diagnostics must not expose database addresses, account names, or rows.
export async function GET() {
  return NextResponse.json({ error: 'No disponible.' }, {
    status: 404,
    headers: { 'Cache-Control': 'no-store' },
  });
}
