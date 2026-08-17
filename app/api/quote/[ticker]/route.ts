import { NextResponse } from "next/server";
import { fetchYahooQuote } from "@/lib/data/yahoo";

export const dynamic = "force-dynamic";

/**
 * Live quote endpoint used by the "refresh price" button.
 * Always fetches fresh from Yahoo (no-store), independent of the
 * page-level 60s revalidation.
 */
export async function GET(
  _req: Request,
  { params }: { params: { ticker: string } },
) {
  const quote = await fetchYahooQuote(params.ticker, true);
  if (!quote) {
    return NextResponse.json({ ok: false, quote: null });
  }
  return NextResponse.json({ ok: true, quote });
}
