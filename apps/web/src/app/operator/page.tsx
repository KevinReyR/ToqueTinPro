import { OperatorDashboard } from "@/components/operator-dashboard";

export default function OperatorPage() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return <main className="config-panel" id="contenido"><h1>Operación no configurada</h1><p>Define las variables públicas de Supabase para iniciar sesión. Puedes revisar el diseño en <a href="/preview/dashboard">la vista previa</a>.</p></main>;
  }
  return <OperatorDashboard />;
}
