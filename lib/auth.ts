import "server-only";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AdminContext = {
  authUserId: string;
  email: string;
  name: string;
  workspaceId: string;
  workspaceName: string;
  participantId: string;
};

export async function getAdminContext(): Promise<AdminContext | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const subject = data?.claims?.sub;
  if (error || typeof subject !== "string") return null;

  const [{ data: profile, error: profileError }, { data: workspace, error: workspaceError }] = await Promise.all([
    supabase.from("profiles").select("display_name").eq("id", subject).single(),
    supabase.from("workspaces").select("id,name").eq("owner_id", subject).single(),
  ]);
  if (profileError || workspaceError || !profile || !workspace) {
    throw new Error("Sua conta existe, mas o espaço do Rateio não pôde ser carregado.");
  }

  const { data: participant, error: participantError } = await supabase
    .from("participants")
    .select("id,email")
    .eq("workspace_id", workspace.id)
    .eq("auth_user_id", subject)
    .single();
  if (participantError || !participant) {
    throw new Error("O perfil administrador do Rateio não pôde ser carregado.");
  }

  const claimEmail = data?.claims?.email;
  return {
    authUserId: subject,
    email: typeof claimEmail === "string" ? claimEmail : participant.email ?? "",
    name: profile.display_name,
    workspaceId: workspace.id,
    workspaceName: workspace.name,
    participantId: participant.id,
  };
}

export async function requireAdminContext(): Promise<AdminContext> {
  const context = await getAdminContext();
  if (!context) redirect("/login");
  return context;
}
