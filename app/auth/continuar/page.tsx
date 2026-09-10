"use client";

import { useEffect } from "react";

export default function ContinuarAuthPage() {
  useEffect(() => {
    window.location.replace("/");
  }, []);

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <p>Entrando no Rateio...</p>
    </main>
  );
}
