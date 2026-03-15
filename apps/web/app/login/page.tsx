export default function LoginPage() {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: "24px" }}>
      <section className="panel-card" style={{ width: "min(480px, 100%)" }}>
        <div className="panel-card__header">
          <p className="eyebrow">Operator Access</p>
          <h1>Sign in to the dashboard</h1>
          <p>Supabase auth will plug into this screen in phase 2.</p>
        </div>
        <div className="stack">
          <div className="field">
            <label htmlFor="email">Work email</label>
            <input id="email" type="email" placeholder="operator@company.com" />
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
