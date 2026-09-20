import { NextResponse } from "next/server";

export function GET() {
  const teamId = process.env.APPLE_TEAM_ID;
  const appBundle = process.env.APPLE_APP_BUNDLE_ID;
  const clipBundle = process.env.APPLE_APP_CLIP_BUNDLE_ID;
  if (!teamId || !appBundle) {
    return NextResponse.json({ code: "ASSOCIATION_NOT_CONFIGURED" }, { status: 503 });
  }

  const appIDs = [`${teamId}.${appBundle}`];
  if (clipBundle) appIDs.push(`${teamId}.${clipBundle}`);

  return NextResponse.json({
    ...(clipBundle ? { appclips: { apps: [`${teamId}.${clipBundle}`] } } : {}),
    applinks: {
      apps: [],
      details: [{ appIDs, components: [{ "/": "/tracking/*" }] }],
    },
  }, { headers: { "Cache-Control": "public, max-age=3600", "Content-Type": "application/json" } });
}
