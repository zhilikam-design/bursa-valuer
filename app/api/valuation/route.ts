// ===========================================================================
// Automated Bursa Malaysia valuation API (thin HTTP layer).
//   GET /api/valuation?ticker=1155 | MAYBANK | 1155.KL
// Core computation lives in lib/valuation/valuation-api.ts.
// ===========================================================================

import { NextResponse } from "next/server";
import { computeValuation } from "@/lib/valuation/valuation-api";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const input = searchParams.get("ticker");
  if (!input) {
    return NextResponse.json({ error: "Missing ticker parameter" }, { status: 400 });
  }

  try {
    const result = await computeValuation(input);
    if ("error" in result) {
      return NextResponse.json(result, { status: 404 });
    }
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message ?? "Unknown error" }, { status: 500 });
  }
}
