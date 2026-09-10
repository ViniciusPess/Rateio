import { ResetPasswordForm } from "@/app/redefinir-senha/reset-password-form";

export const dynamic = "force-dynamic";

export default function ResetPasswordPage() {
  return (
    <main className="auth-page auth-page-centered">
      <section className="auth-card" aria-labelledby="reset-title">
        <div className="brand auth-brand"><span className="brand-mark">R</span><span>Rateio</span></div>
        <h1 id="reset-title">Crie uma nova senha</h1>
        <p>Use pelo menos 8 caracteres. Depois da alteração, você volta para a sua área administrativa.</p>
        <ResetPasswordForm />
      </section>
    </main>
  );
}
