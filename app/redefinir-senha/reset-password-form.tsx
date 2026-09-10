"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function ResetPasswordForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") ?? "");
    const confirmation = String(form.get("confirmation") ?? "");

    try {
      if (password.length < 8) throw new Error("A senha precisa ter pelo menos 8 caracteres.");
      if (password !== confirmation) throw new Error("As senhas não são iguais.");

      const supabase = createClient();
      const { data: claimsData } = await supabase.auth.getClaims();
      if (!claimsData?.claims) throw new Error("Este link expirou ou já foi usado. Solicite outro link na tela de entrada.");

      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      router.replace("/");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível alterar a senha.");
      setLoading(false);
    }
  }

  return (
    <form className="form-stack" onSubmit={submit}>
      <label>Nova senha<input name="password" type="password" autoComplete="new-password" minLength={8} required /></label>
      <label>Confirme a nova senha<input name="confirmation" type="password" autoComplete="new-password" minLength={8} required /></label>
      {error && <p className="form-message error" role="alert">{error}</p>}
      <button className="auth-submit" type="submit" disabled={loading}>
        {loading && <Loader2 className="spinner-inline" />}
        Salvar nova senha
      </button>
    </form>
  );
}
