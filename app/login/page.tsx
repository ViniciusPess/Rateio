import { redirect } from "next/navigation";
import { LoginForm } from "@/app/login/login-form";
import { getAdminContext } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await getAdminContext()) redirect("/");

  return (
    <main className="auth-page">
      <section className="auth-copy">
        <div className="brand"><span className="brand-mark">R</span><span>Rateio</span></div>
        <p className="eyebrow">Assinaturas compartilhadas</p>
        <h1>Organize cobranças sem transformar amizade em planilha.</h1>
        <p>Você administra tudo em uma conta privada. Cada participante recebe um link pessoal, sem cadastro e sem senha.</p>
        <ul>
          <li>Dados separados para cada administrador</li>
          <li>Confirmação de ciência e pagamento pelo participante</li>
          <li>Cobrança pelo WhatsApp com o link correto</li>
        </ul>
      </section>
      <LoginForm />
    </main>
  );
}
