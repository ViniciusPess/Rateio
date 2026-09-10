export async function POST() {
  return Response.json({ error: "Use o link pessoal do participante para informar o pagamento." }, { status: 403 });
}
