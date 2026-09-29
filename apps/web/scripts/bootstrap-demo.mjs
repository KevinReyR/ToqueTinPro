import { createClient } from "@supabase/supabase-js";

const DEFAULT_EMAIL = "operator.demo@example.com";
const ORGANIZATION_NAME = "ToqueTin Demo";
const RESTAURANT_NAME = "Restaurante Demo";

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function config() {
  const password = required("DEMO_OPERATOR_PASSWORD");
  if (password.length < 16) {
    throw new Error("DEMO_OPERATOR_PASSWORD must contain at least 16 characters");
  }

  const supabaseUrl = required("NEXT_PUBLIC_SUPABASE_URL");
  new URL(supabaseUrl);

  return {
    email: process.env.DEMO_OPERATOR_EMAIL?.trim() || DEFAULT_EMAIL,
    password,
    serviceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),
    supabaseUrl,
  };
}

async function findUserByEmail(client, email) {
  for (let page = 1; ; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw new Error(`Unable to list demo users: ${error.message}`);
    const user = data.users.find(
      (candidate) => candidate.email?.toLowerCase() === email.toLowerCase(),
    );
    if (user || data.users.length < 100) return user ?? null;
  }
}

async function ensureOperator(client, settings) {
  const existing = await findUserByEmail(client, settings.email);
  const attributes = {
    email: settings.email,
    email_confirm: true,
    password: settings.password,
    user_metadata: { purpose: "toquetin-demo" },
  };

  if (existing) {
    const { data, error } = await client.auth.admin.updateUserById(existing.id, attributes);
    if (error) throw new Error(`Unable to update demo operator: ${error.message}`);
    return data.user;
  }

  const { data, error } = await client.auth.admin.createUser(attributes);
  if (error) throw new Error(`Unable to create demo operator: ${error.message}`);
  return data.user;
}

async function ensureOrganization(client) {
  const existing = await client
    .from("organizations")
    .select("id")
    .eq("name", ORGANIZATION_NAME)
    .order("id")
    .limit(1)
    .maybeSingle();
  if (existing.error) throw new Error(`Unable to read demo organization: ${existing.error.message}`);
  if (existing.data) return existing.data.id;

  const created = await client
    .from("organizations")
    .insert({ name: ORGANIZATION_NAME })
    .select("id")
    .single();
  if (created.error) throw new Error(`Unable to create demo organization: ${created.error.message}`);
  return created.data.id;
}

async function ensureRestaurant(client, organizationId) {
  const existing = await client
    .from("restaurants")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("name", RESTAURANT_NAME)
    .order("id")
    .limit(1)
    .maybeSingle();
  if (existing.error) throw new Error(`Unable to read demo restaurant: ${existing.error.message}`);
  if (existing.data) return existing.data.id;

  const created = await client
    .from("restaurants")
    .insert({
      name: RESTAURANT_NAME,
      operational_cutoff: "00:00",
      organization_id: organizationId,
      timezone: "America/Bogota",
    })
    .select("id")
    .single();
  if (created.error) throw new Error(`Unable to create demo restaurant: ${created.error.message}`);
  return created.data.id;
}

async function main() {
  const settings = config();
  const client = createClient(settings.supabaseUrl, settings.serviceRoleKey, {
    auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
  });
  const user = await ensureOperator(client, settings);
  const organizationId = await ensureOrganization(client);
  const restaurantId = await ensureRestaurant(client, organizationId);
  const membership = await client.from("restaurant_users").upsert(
    { active: true, auth_user_id: user.id, restaurant_id: restaurantId },
    { onConflict: "restaurant_id,auth_user_id" },
  );
  if (membership.error) throw new Error(`Unable to create demo membership: ${membership.error.message}`);

  console.info("Demo environment is ready", {
    email: settings.email,
    organizationId,
    restaurantId,
    userId: user.id,
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Demo bootstrap failed");
  process.exitCode = 1;
});
