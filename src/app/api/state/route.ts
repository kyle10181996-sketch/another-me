import { NextResponse } from "next/server";
import { readLocalState, writeLocalState } from "@/lib/local-file-store";

export async function GET() {
  const state = await readLocalState();
  return NextResponse.json(state);
}

export async function PUT(request: Request) {
  const state = await request.json();
  await writeLocalState(state);
  return NextResponse.json({ ok: true });
}
