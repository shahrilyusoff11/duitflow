"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth/client";

export function SignInButton({ available }: { available: boolean }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function signIn() {
    setError("");
    setPending(true);
    try {
      const result = await authClient.signIn.social({
        provider: "github", callbackURL: "/dashboard", errorCallbackURL: "/sign-in?error=oauth",
      });
      if (result.error) { setError("Log masuk tidak berjaya. Sila cuba lagi sebentar."); setPending(false); }
    } catch {
      setError("Sambungan terganggu. Sila cuba lagi.");
      setPending(false);
    }
  }

  return <>
    <button className="button auth-button" type="button" disabled={!available || pending} onClick={signIn}>
      {pending ? "Menyambung ke GitHub…" : "Teruskan dengan GitHub"}
    </button>
    <p className="form-feedback" role="status" aria-live="polite">{error}</p>
  </>;
}

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function signOut() {
    setPending(true);
    setError("");
    try {
      const result = await authClient.signOut();
      if (result.error) {
        setError("Log keluar tidak berjaya. Sila cuba lagi.");
        setPending(false);
        return;
      }
      router.replace("/sign-in");
      router.refresh();
    } catch {
      setError("Sambungan terganggu. Sila cuba lagi.");
      setPending(false);
    }
  }

  return <div className="signout-control">
    <button className="quiet-button" type="button" disabled={pending} onClick={signOut}>{pending ? "Sedang log keluar…" : "Log keluar"}</button>
    <p className="form-feedback" role="status" aria-live="polite">{error}</p>
  </div>;
}
