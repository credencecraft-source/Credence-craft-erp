"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Account = {
  email: string;
  name: string;
  createdAt: string;
};

const ACCOUNTS_KEY = "credence-craft-accounts";
const SESSION_KEY = "credence-craft-session";

export default function Home() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "create">("login");
  const [form, setForm] = useState({ email: "", name: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const storedSession = localStorage.getItem(SESSION_KEY);
    if (storedSession) {
      router.replace("/workspace");
    }
  }, [router]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");

    const email = form.email.trim();
    const name = form.name.trim();

    if (!email || !name) {
      setError("Please enter both your email and your name.");
      return;
    }

    setLoading(true);

    const stored = localStorage.getItem(ACCOUNTS_KEY);
    const accounts: Account[] = stored ? JSON.parse(stored) : [];

    let account = accounts.find((item) => item.email.toLowerCase() === email.toLowerCase());

    if (mode === "create" && !account) {
      account = {
        email,
        name,
        createdAt: new Date().toISOString(),
      };
      accounts.push(account);
      localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
    }

    if (mode === "login" && !account) {
      setError("No account found for this email. Create one first and then sign in.");
      setLoading(false);
      return;
    }

    localStorage.setItem(SESSION_KEY, JSON.stringify({ email: account!.email, name: account!.name }));
    setLoading(false);
    router.push("/workspace");
  }

  return (
    <main >
      <div >
        <div >
          <div >
            <div>
              <div >
                Credence Craft
              </div>
              <h1 >
                Work smarter with your business workspace.
              </h1>
            </div>

            <div >
              <div >
                <p >Fast onboarding</p>
                <p >Create your account in seconds and land directly in your workspace.</p>
              </div>
              <div >
                <p >One place for work</p>
                <p >Track tasks, projects, and daily operations from a single dashboard.</p>
              </div>
            </div>
          </div>

          <div >
            <div >
              <div>
                <p >Access</p>
                <h2 >
                  {mode === "login" ? "Welcome back" : "Create account"}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setMode((prev) => (prev === "login" ? "create" : "login"))}
                
              >
                {mode === "login" ? "Need an account?" : "Have an account?"}
              </button>
            </div>

            <form onSubmit={handleSubmit} >
              <label >
                <span >Email address</span>
                <input
                  type="email"
                  value={form.email}
                  onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                  placeholder="name@example.com"
                  
                  required
                />
              </label>

              <label >
                <span >Full name</span>
                <input
                  type="text"
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Your name"
                  
                  required
                />
              </label>

              {error ? (
                <div >
                  {error}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={loading}
                
              >
                {loading ? "Please wait..." : mode === "login" ? "Login to workspace" : "Create account & login"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </main>
  );
}
