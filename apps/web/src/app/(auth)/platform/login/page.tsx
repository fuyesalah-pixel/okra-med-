"use client";
import { useState } from "react";
export default function PlatformLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch("/api/platform-auth/sign-in/email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
    if (res.ok) window.location.href = "/platform/dashboard";
    else setError("Invalid credentials");
  };
  return (
    <form onSubmit={submit} className="mx-auto mt-20 max-w-sm space-y-4">
      <h1 className="text-2xl font-bold">Platform Login</h1>
      {error && <p className="text-red-500">{error}</p>}
      <input className="w-full rounded border p-2" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
      <input className="w-full rounded border p-2" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
      <button className="w-full rounded bg-slate-900 p-2 text-white">Login</button>
    </form>
  );
}
