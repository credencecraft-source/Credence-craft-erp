"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Session = {
  email: string;
  name: string;
};

const SESSION_KEY = "credence-craft-session";

const stats = [
  { label: "Active projects", value: "12" },
  { label: "Tasks due", value: "08" },
  { label: "Team members", value: "16" },
  { label: "Completion", value: "84%" },
];

const quickActions = [
  "New project",
  "Invite member",
  "Generate report",
  "Review timeline",
];

const activity = [
  { title: "Brand launch strategy", details: "Updated 2 hours ago • Marketing team" },
  { title: "Client onboarding", details: "Needs review • Operations" },
  { title: "Production schedule", details: "Published this morning • Supply chain" },
];

export default function WorkspacePage() {
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(SESSION_KEY);
    if (!stored) {
      router.replace("/");
      return;
    }

    setSession(JSON.parse(stored));
  }, [router]);

  const greeting = useMemo(() => {
    if (!session?.name) return "Welcome";
    const firstName = session.name.split(" ")[0];
    return `Welcome, ${firstName}`;
  }, [session]);

  function handleLogout() {
    localStorage.removeItem(SESSION_KEY);
    router.replace("/");
  }

  if (!session) {
    return null;
  }

  return (
    <main >
      <div >
        <header >
          <div>
            <p >Workspace dashboard</p>
            <h1 >{greeting}</h1>
          </div>

          <div >
            <div >
              <div >Signed in as</div>
              <div >{session.email}</div>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              
            >
              Logout
            </button>
          </div>
        </header>

        <section >
          {stats.map((stat) => (
            <div key={stat.label} >
              <div >{stat.label}</div>
              <div >{stat.value}</div>
            </div>
          ))}
        </section>

        <section >
          <div >
            <div >
              <h2 >Quick actions</h2>
              <span >
                Today
              </span>
            </div>

            <div >
              {quickActions.map((action) => (
                <button
                  key={action}
                  type="button"
                  
                >
                  {action}
                </button>
              ))}
            </div>
          </div>

          <div >
            <p >Overview</p>
            <h2 >Team momentum</h2>
            <div >
              <div>
                <div >
                  <span>Delivery velocity</span>
                  <span>86%</span>
                </div>
                <div >
                  <div  />
                </div>
              </div>
              <div>
                <div >
                  <span>Client satisfaction</span>
                  <span>92%</span>
                </div>
                <div >
                  <div  />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section >
          <div >
            <h2 >Recent activity</h2>
            <button type="button" >
              View all
            </button>
          </div>

          <div >
            {activity.map((item) => (
              <div key={item.title} >
                <div >{item.title}</div>
                <div >{item.details}</div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
