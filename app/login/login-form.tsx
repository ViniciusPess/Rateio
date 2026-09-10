"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function LoginForm() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup" | "recovery">("login");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim().toLowerCase();
    const password = String(form.get("password") ?? "");
    const name = String(form.get("name") ?? "").trim();
    const supabase = createClient();

    try {
      if (mode === "recovery") {
        const { error: recoveryError } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth/callback?next=/redefinir-senha`,
        });
        if (recoveryError) throw recoveryError;
        setMessage("Se houver uma conta com esse e-mail, enviaremos as instruções para redefinir a senha.");
      } else if (mode === "signup") {
        if (name.length < 2 || name.length > 80) throw new Error("Informe seu nome com até 80 caracteres.");
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: name },
            emailRedirectTo: `${window.location.origin}/auth/callback?next=/`,
          },
        });
        if (signUpError) throw signUpError;
        if (data.session) {
          router.replace("/");
          router.refresh();
        }
        else setMessage("Conta criada. Confira seu e-mail para confirmar o acesso.");
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) throw signInError;
        router.replace("/");
        router.refresh();
      }
    } catch (cause) {
      setError(authErrorMessage(cause));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="auth-card" aria-labelledby="auth-title">
      <div className="auth-tabs" role="tablist" aria-label="Tipo de acesso">
        <button type="button" className={mode === "login" ? "active" : ""} onClick={() => { setMode("login"); setError(null); setMessage(null); }}>Entrar</button>
        <button type="button" className={mode === "signup" ? "active" : ""} onClick={() => { setMode("signup"); setError(null); setMessage(null); }}>Criar conta</button>
      </div>
      <h2 id="auth-title">{mode === "login" ? "Bem-vindo de volta" : mode === "signup" ? "Crie seu Rateio" : "Recupere seu acesso"}</h2>
      <p>{mode === "login" ? "Entre com seu e-mail e senha." : mode === "signup" ? "Sua conta já nasce com um espaço de dados isolado." : "Enviaremos um link seguro para o seu e-mail."}</p>
      <form className="form-stack" onSubmit={submit}>
        {mode === "signup" && <label>Seu nome<input name="name" autoComplete="name" required minLength={2} maxLength={80} /></label>}
        <label>E-mail<input name="email" type="email" autoComplete="email" required /></label>
        {mode !== "recovery" && <label>Senha<input name="password" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={8} required /></label>}
        {mode === "login" && <button className="auth-secondary-link" type="button" onClick={() => { setMode("recovery"); setError(null); setMessage(null); }}>Esqueci minha senha</button>}
        {error && <p className="form-message error" role="alert">{error}</p>}
        {message && <p className="form-message success" role="status">{message}</p>}
        <button className="auth-submit" type="submit" disabled={loading}>
          {loading && <Loader2 className="spinner-inline" />}
          {mode === "login" ? "Entrar no Rateio" : mode === "signup" ? "Criar minha conta" : "Enviar link de recuperação"}
        </button>
        {mode === "recovery" && <button className="auth-secondary-link centered" type="button" onClick={() => { setMode("login"); setError(null); setMessage(null); }}>Voltar para entrar</button>}
      </form>
      <small>Participantes não precisam criar conta. Eles entram somente pelo link pessoal enviado pelo administrador.</small>
    </section>
  );
}

function authErrorMessage(cause: unknown) {
  const message = cause instanceof Error ? cause.message : "";
  const normalized = message.toLowerCase();
  if (normalized.includes("invalid login credentials")) return "E-mail ou senha incorretos.";
  if (normalized.includes("email not confirmed")) return "Confirme seu e-mail antes de entrar.";
  if (normalized.includes("password should be")) return "A senha precisa ter pelo menos 8 caracteres.";
  if (normalized.includes("user already registered")) return "Já existe uma conta com esse e-mail.";
  if (normalized.includes("rate limit")) return "Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.";
  return message || "Não foi possível concluir o acesso.";
}
