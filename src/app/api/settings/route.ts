import { NextResponse } from "next/server";
import { readLocalSettings, toPublicSettings, writeLocalSettings } from "@/lib/local-file-store";

export async function GET() {
  const settings = await readLocalSettings();
  return NextResponse.json(toPublicSettings(settings));
}

export async function PUT(request: Request) {
  const body = await request.json();
  const current = await readLocalSettings();
  const apiKey = typeof body.apiKey === "string" && body.apiKey.trim() ? body.apiKey.trim() : current.apiKey;
  const baseUrl = typeof body.baseUrl === "string" && body.baseUrl.trim() ? body.baseUrl.trim() : current.baseUrl;
  const model = typeof body.model === "string" && body.model.trim() ? body.model.trim() : current.model;
  const publicSettings = await writeLocalSettings({ apiKey, baseUrl, model });

  return NextResponse.json(publicSettings);
}
