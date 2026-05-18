import { AlertTriangle, CheckCircle2 } from "lucide-react";
import React, { useEffect, useState } from "react";
import { getAlerts } from "../../../services/api";

export function AlertsPage() {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    getAlerts()
      .then((data) => {
        if (!mounted) return;
        setAlerts(data || []);
      })
      .catch((err) => {
        if (err instanceof Error) {
          setError(err.message);
        } else {
          setError(String(err));
        }
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <div className="page-stack">
      <section className="page-header">
        <p className="eyebrow">Smart alerts</p>
        <h1>Prioritized field actions</h1>
        <p>Clear recommendations ranked by urgency so farmers can act quickly.</p>
      </section>

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading alerts...</div>
      ) : error ? (
        <div className="message message-error">{error}</div>
      ) : alerts.length === 0 ? (
        <div className="text-sm text-muted-foreground">No alerts are active right now.</div>
      ) : (
        <section className="alert-list">
          {alerts.map((alert) => (
            <article key={alert.id} className={`agro-card alert-card priority-${alert.priority}`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className="metric-icon"><AlertTriangle className="h-5 w-5" /></div>
                  <div>
                    <p className="alert-priority">{alert.priority} priority · {alert.time}</p>
                    <h2 className="mt-1 text-xl font-black text-foreground">{alert.title}</h2>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{alert.detail}</p>
                  </div>
                </div>
                <span className="sync-pill">{alert.zone}</span>
              </div>
              <div className="alert-action"><CheckCircle2 className="h-5 w-5" /> {alert.action}</div>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
