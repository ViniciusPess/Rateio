import { ResetPasswordForm } from "@/app/redefinir-senha/reset-password-form";
import Image from "next/image";

export const dynamic = "force-dynamic";

export default function ResetPasswordPage() {
  return (
    <main className="auth-page auth-page-centered">
      <section className="auth-card" aria-labelledby="reset-title">
        <Image className="auth-wordmark reset-wordmark" src="/rateio-logo.png" alt="Rateio" width={228} height={64} sizes="200px" priority />
        <h1 id="reset-title">Crie uma nova senha</h1>
        <p>Use pelo menos 8 caracteres. Depois da alteração, você volta para a sua área administrativa.</p>
        <ResetPasswordForm />
      </section>
    </main>
  );
}
