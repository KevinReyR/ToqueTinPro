import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { TrackingExperience } from "@/components/tracking-experience";
import { TrackingBootstrap } from "@/components/tracking-bootstrap";
import { createAdminClient } from "@/lib/supabase/server";
import { publicTrackingSnapshotSchema } from "@/domain/order";
import { verifyTrackingToken } from "@/lib/tracking-token";

export const dynamic = "force-dynamic";

export default async function TrackingPage({ params }: { params: Promise<{ nonce: string }> }) {
  const { nonce } = await params;
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return <main className="config-panel" id="contenido"><h1>Seguimiento no configurado</h1><p>Define las variables de Supabase para consultar pedidos reales. La experiencia visual está disponible en <a href="/preview/tracking">la vista previa</a>.</p></main>;
  }
  const grant = (await cookies()).get("tt_tracking_grant")?.value;
  const secret = process.env.TRACKING_TOKEN_SECRET;
  const verified = grant && secret ? verifyTrackingToken(grant, secret) : null;
  if (!verified || verified.nonce !== nonce) return <TrackingBootstrap nonce={nonce} />;
  const client = createAdminClient();
  const { data, error } = await client.rpc("public_tracking_snapshot", { requested_nonce: nonce });
  if (error || !data) notFound();
  const parsed = publicTrackingSnapshotSchema.safeParse(data);
  if (!parsed.success) notFound();
  return <TrackingExperience snapshot={parsed.data} nonce={nonce} />;
}
