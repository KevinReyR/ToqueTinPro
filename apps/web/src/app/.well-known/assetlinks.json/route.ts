import { NextResponse } from "next/server";

export function GET() {
  const packageName = process.env.ANDROID_PACKAGE_NAME;
  const fingerprint = process.env.ANDROID_SHA256_CERT_FINGERPRINT;
  if (!packageName || !fingerprint) {
    return NextResponse.json({ code: "ASSOCIATION_NOT_CONFIGURED" }, { status: 503 });
  }
  return NextResponse.json([{
    relation: ["delegate_permission/common.handle_all_urls"],
    target: { namespace: "android_app", package_name: packageName, sha256_cert_fingerprints: [fingerprint] },
  }], { headers: { "Cache-Control": "public, max-age=3600", "Content-Type": "application/json" } });
}
