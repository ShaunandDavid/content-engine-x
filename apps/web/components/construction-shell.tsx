import Link from "next/link";
import { dashboardRoute } from "../lib/routes";

export const ConstructionShell = ({ moduleName }: { moduleName: string }) => {
  return (
    <div className="construction-layout" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#fdfdfc', fontFamily: 'system-ui, sans-serif' }}>
      <div className="construction-card" style={{ background: '#ffffff', border: '1px solid rgba(0,0,0,0.06)', borderRadius: '24px', padding: '48px', maxWidth: '480px', textAlign: 'center', boxShadow: '0 24px 64px rgba(0,0,0,0.04)' }}>
        <div className="lock-icon" style={{ width: '64px', height: '64px', background: 'rgba(0,0,0,0.03)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', fontSize: '24px', color: 'var(--ink)' }}>
          🔒
        </div>
        <span className="eyebrow" style={{ fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.15em', color: 'rgba(0,0,0,0.4)', display: 'block', marginBottom: '12px', textTransform: 'uppercase' }}>
          Module Offline
        </span>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 600, color: 'var(--ink)', marginBottom: '16px', letterSpacing: '-0.03em' }}>
          {moduleName} Assembly
        </h1>
        <p style={{ fontSize: '1rem', color: 'rgba(0,0,0,0.6)', lineHeight: 1.6, marginBottom: '32px' }}>
          This sub-system is currently inactive. The operator pipeline for <strong>{moduleName}</strong> is pending structural configuration.
        </p>
        <Link href={dashboardRoute} style={{ display: 'inline-block', background: 'var(--ink)', color: '#fff', textDecoration: 'none', padding: '12px 24px', borderRadius: '999px', fontSize: '0.9rem', fontWeight: 500, transition: 'opacity 0.2s', border: '1px solid rgba(0,0,0,0.1)' }}>
          Return to Console
        </Link>
      </div>
    </div>
  );
};
