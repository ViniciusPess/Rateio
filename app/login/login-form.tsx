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

  async function signInWithGoogle() {
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const supabase = createClient();
      const { error: googleError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=/`,
        },
      });
      if (googleError) throw googleError;
    } catch (cause) {
      setError(authErrorMessage(cause));
      setLoading(false);
    }
  }

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
      {mode !== "recovery" && <>
        <button className="google-auth-button" type="button" onClick={() => void signInWithGoogle()} disabled={loading}>
          {loading ? <Loader2 className="spinner-inline" /> : <GoogleMark />}
          Continuar com Google
        </button>
        <div className="auth-divider"><span>ou use seu e-mail</span></div>
      </>}
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

function GoogleMark() {
  return (
    <svg className="google-mark" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285f4" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.9h5.4a4.6 4.6 0 0 1-2 3v2.5h3.3c1.9-1.8 2.9-4.4 2.9-7.4Z" />
      <path fill="#34a853" d="M12 22c2.7 0 5-.9 6.7-2.4l-3.3-2.5c-.9.6-2.1 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3v2.6A10 10 0 0 0 12 22Z" />
      <path fill="#fbbc05" d="M6.4 14a6 6 0 0 1 0-3.9V7.4H3a10 10 0 0 0 0 9.2L6.4 14Z" />
      <path fill="#ea4335" d="M12 5.9c1.5 0 2.9.5 3.9 1.5l2.9-2.8A9.8 9.8 0 0 0 3 7.4l3.4 2.7C7.2 7.7 9.4 6 12 6Z" />
    </svg>
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
