"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { EntryScreen } from "@/components/dashboard";
import type { EntryField, EntryStage } from "@/components/dashboard";

type AuthUser = { id: string; email: string; name: string };

export default function LoginPage() {
  const router = useRouter();
  const [stage, setStage] = useState<Exclude<EntryStage, "editor">>("login");
  const [fields, setFields] = useState<Record<EntryField, string>>({
    email: "",
    password: "",
    organizationName: "",
    ownerName: "",
    ownerEmail: "",
    ownerPassword: "",
    confirmOwnerPassword: "",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/auth/me", { cache: "no-store" })
      .then((response) => {
        if (response.ok) router.replace("/");
      })
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setCheckingSession(false);
      });
    return () => { cancelled = true; };
  }, [router]);

  const updateField = (field: EntryField, value: string) => {
    setFields((current) => ({ ...current, [field]: value }));
  };

  const completeAuthentication = (user?: AuthUser) => {
    if (!user) return;
    router.replace("/");
    router.refresh();
  };

  const login = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: fields.email, password: fields.password }),
      });
      const data = await response.json() as { user?: AuthUser; error?: string };
      if (!response.ok || !data.user) throw new Error(data.error ?? "Sign-in failed.");
      completeAuthentication(data.user);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sign-in failed.");
    } finally {
      setBusy(false);
    }
  };

  const createOrganization = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/organizations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: fields.organizationName,
          ownerName: fields.ownerName,
          ownerEmail: fields.ownerEmail,
          ownerPassword: fields.ownerPassword,
          confirmPassword: fields.confirmOwnerPassword,
        }),
      });
      const data = await response.json() as { owner?: AuthUser; error?: string };
      if (!response.ok || !data.owner) throw new Error(data.error ?? "Could not create organization.");
      completeAuthentication(data.owner);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create organization.");
    } finally {
      setBusy(false);
    }
  };

  if (checkingSession) {
    return <main className="entry-shell" aria-busy="true" />;
  }

  return (
    <EntryScreen
      stage={stage}
      fields={fields}
      onField={updateField}
      error={error}
      busy={busy}
      onLogin={login}
      onCreateOrganization={createOrganization}
      onStartOrganization={() => { setStage("organization"); setError(""); }}
      onBackToLogin={() => { setStage("login"); setError(""); }}
    />
  );
}
