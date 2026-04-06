import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign In",
  description: "Sign in to Project Enoch inside Content Engine X."
};

export default function LoginPage() {
  return (
    <main className="auth-shell">
      <section className="panel-card auth-card">
        <div className="panel-card__header">
          <p className="eyebrow">Content Engine X</p>
          <h1>Sign in to Project Enoch</h1>
          <p>Authentication wiring lands here next.</p>
        </div>
        <div className="stack">
          <div className="field">
            <label htmlFor="email">Work email</label>
            <input id="email" type="email" placeholder="team@company.com" />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input id="password" type="password" placeholder="Enter your password" />
          </div>
          <div className="button-row">
            <button className="button" type="button">
              Sign In
            </button>
            <button className="button button--secondary" type="button">
              Request Access
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
