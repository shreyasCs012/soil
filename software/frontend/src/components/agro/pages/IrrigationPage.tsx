import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Droplets,
  FlaskConical,
  Leaf,
  Loader2,
  Save,
  Sprout,
  Zap,
  Play,
  X,
} from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import {
  getCompartments,
  saveCompartments,
  computeMix,
  getIrrigationTrendAlerts,
  triggerIrrigation,
  getMe,
  type FertilizerCompartment,
  type MixResult,
  type TrendAlert,
} from "../../../services/api";

const FERTILIZER_TYPES = [
  { value: "nitrogen",     label: "Nitrogen source"     },
  { value: "phosphorus",   label: "Phosphorus source"   },
  { value: "potassium",    label: "Potassium source"    },
  { value: "ph_corrector", label: "pH corrector"        },
  { value: "water",        label: "Plain water"         },
];

const PH_EFFECTS = [
  { value: "neutral", label: "No pH effect" },
  { value: "raise",   label: "Raises pH (e.g. lime)"     },
  { value: "lower",   label: "Lowers pH (e.g. acid)"     },
];

const SLOT_COLORS: Record<string, string> = {
  A: "#4ade80",
  B: "#60a5fa",
  C: "#f59e0b",
  D: "#f472b6",
};

const PARAMETER_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  ph:         FlaskConical,
  nitrogen:   Leaf,
  phosphorus: Sprout,
  potassium:  Zap,
  moisture:   Droplets,
};

function UrgencyBadge({ urgency }: { urgency: string }) {
  const map: Record<string, { bg: string; label: string }> = {
    good:     { bg: "#4ade80", label: "Good"     },
    info:     { bg: "#60a5fa", label: "Info"     },
    warning:  { bg: "#f59e0b", label: "Warning"  },
    critical: { bg: "#ef4444", label: "Critical" },
  };
  const { bg, label } = map[urgency] ?? map.info;
  return (
    <span
      style={{
        background: bg,
        color: "#fff",
        borderRadius: "0.375rem",
        padding: "0.15rem 0.6rem",
        fontSize: "0.7rem",
        fontWeight: 700,
        letterSpacing: "0.05em",
        textTransform: "uppercase",
      }}
    >
      {label}
    </span>
  );
}

interface ConfirmModalProps {
  mix: MixResult;
  onConfirm: () => void;
  onCancel: () => void;
  loading: boolean;
  triggered: boolean;
  triggerMessage: string;
}

function ConfirmModal({ mix, onConfirm, onCancel, loading, triggered, triggerMessage }: ConfirmModalProps) {
  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 50,
        background: "rgba(0,0,0,0.55)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "1rem",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div
        className="agro-card"
        style={{ width: "100%", maxWidth: "480px", position: "relative" }}
      >
        <button
          onClick={onCancel}
          style={{
            position: "absolute", top: "1rem", right: "1rem",
            background: "none", border: "none", cursor: "pointer",
            color: "var(--muted-foreground)",
          }}
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>

        <div style={{ marginBottom: "1rem" }}>
          <p className="eyebrow">Confirm before triggering hardware</p>
          <h2 style={{ fontSize: "1.1rem", fontWeight: 800, marginTop: "0.25rem" }}>
            Review irrigation plan
          </h2>
        </div>

        <div
          style={{
            background: "var(--muted)",
            borderRadius: "0.5rem",
            padding: "1rem",
            marginBottom: "1rem",
          }}
        >
          <p style={{ fontSize: "0.85rem", color: "var(--muted-foreground)", marginBottom: "0.75rem" }}>
            {mix.summary}
          </p>
          <div style={{ display: "flex", gap: "1.5rem", marginBottom: "0.75rem" }}>
            <div>
              <p style={{ fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", color: "var(--muted-foreground)" }}>Water</p>
              <p style={{ fontSize: "1.25rem", fontWeight: 900 }}>{mix.water_litres} L</p>
            </div>
            <div>
              <p style={{ fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", color: "var(--muted-foreground)" }}>Duration</p>
              <p style={{ fontSize: "1.25rem", fontWeight: 900 }}>{mix.duration_minutes} min</p>
            </div>
          </div>

          {mix.doses.length > 0 && (
            <div>
              <p style={{ fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", color: "var(--muted-foreground)", marginBottom: "0.4rem" }}>
                Fertilizer doses
              </p>
              {mix.doses.map((d) => (
                <div
                  key={d.slot}
                  style={{
                    display: "flex", alignItems: "center", gap: "0.75rem",
                    padding: "0.35rem 0",
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  <span
                    style={{
                      width: "1.5rem", height: "1.5rem", borderRadius: "0.25rem",
                      background: SLOT_COLORS[d.slot] ?? "#ccc",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontWeight: 900, fontSize: "0.75rem", color: "#fff", flexShrink: 0,
                    }}
                  >
                    {d.slot}
                  </span>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontWeight: 700, fontSize: "0.85rem" }}>{d.name}</span>
                    <span style={{ color: "var(--muted-foreground)", fontSize: "0.78rem", marginLeft: "0.5rem" }}>
                      {d.amount_g} g
                    </span>
                    <p style={{ fontSize: "0.72rem", color: "var(--muted-foreground)", margin: 0 }}>{d.reason}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {triggered ? (
          <div className="message" style={{ background: "#dcfce7", color: "#166534", borderRadius: "0.5rem", padding: "0.75rem 1rem", fontSize: "0.88rem", fontWeight: 600 }}>
            <CheckCircle2 className="h-4 w-4" style={{ display: "inline", marginRight: "0.4rem" }} />
            {triggerMessage}
          </div>
        ) : (
          <div style={{ display: "flex", gap: "0.75rem" }}>
            <button
              className="farm-save-btn"
              onClick={onConfirm}
              disabled={loading}
              style={{ flex: 1, background: "#16a34a" }}
            >
              {loading ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Triggering…</>
              ) : (
                <><Play className="h-4 w-4" /> Confirm & Trigger</>
              )}
            </button>
            <button
              className="farm-save-btn"
              onClick={onCancel}
              style={{ background: "var(--muted)", color: "var(--foreground)" }}
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function IrrigationPage() {
  const [farmId, setFarmId] = useState<number | null>(null);
  const [compartments, setCompartments] = useState<FertilizerCompartment[]>([]);
  const [compSaving, setCompSaving] = useState(false);
  const [compSaved, setCompSaved] = useState(false);
  const [compError, setCompError] = useState<string | null>(null);
  const compSavedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [trendAlerts, setTrendAlerts] = useState<TrendAlert[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(true);

  const [mix, setMix] = useState<MixResult | null>(null);
  const [mixLoading, setMixLoading] = useState(false);
  const [mixError, setMixError] = useState<string | null>(null);

  const [showConfirm, setShowConfirm] = useState(false);
  const [triggering, setTriggering] = useState(false);
  const [triggered, setTriggered] = useState(false);
  const [triggerMessage, setTriggerMessage] = useState("");

  useEffect(() => {
    let mounted = true;

    getMe()
      .then((user) => {
        if (!mounted) return;
        const farm = user.farms?.[0];
        const fid = farm?.id ?? null;
        setFarmId(fid);
        return getCompartments();
      })
      .then((data) => {
        if (!mounted || !data) return;
        setCompartments(data.compartments);
      })
      .catch(() => {});

    getIrrigationTrendAlerts()
      .then((data) => {
        if (!mounted) return;
        setTrendAlerts(data || []);
      })
      .catch(() => {})
      .finally(() => { if (mounted) setAlertsLoading(false); });

    return () => { mounted = false; };
  }, []);

  function updateCompartment(idx: number, field: keyof FertilizerCompartment, value: string | number) {
    setCompartments((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  }

  async function handleSaveCompartments() {
    setCompSaving(true);
    setCompError(null);
    try {
      await saveCompartments(compartments);
      setCompSaved(true);
      if (compSavedTimer.current) clearTimeout(compSavedTimer.current);
      compSavedTimer.current = setTimeout(() => setCompSaved(false), 3000);
    } catch (e) {
      setCompError(e instanceof Error ? e.message : "Save failed.");
    } finally {
      setCompSaving(false);
    }
  }

  async function handleComputeMix() {
    setMixLoading(true);
    setMixError(null);
    setMix(null);
    setTriggered(false);
    try {
      const result = await computeMix(farmId, compartments);
      setMix(result);
    } catch (e) {
      setMixError(e instanceof Error ? e.message : "Failed to compute mix.");
    } finally {
      setMixLoading(false);
    }
  }

  async function handleTrigger() {
    if (!mix) return;
    setTriggering(true);
    try {
      const res = await triggerIrrigation(mix);
      setTriggered(true);
      setTriggerMessage(res.message);
    } catch (e) {
      setTriggerMessage(e instanceof Error ? e.message : "Trigger failed.");
      setTriggered(true);
    } finally {
      setTriggering(false);
    }
  }

  const filledCompartments = compartments.filter((c) => c.name.trim());

  return (
    <div className="page-stack">
      {/* Hero */}
      <section className="hero-band">
        <div>
          <p className="eyebrow">Smart fertigation</p>
          <h1>Irrigation &amp; Fertilizer Control</h1>
          <p className="hero-copy">
            Set up your fertilizer compartments, let AI compute the optimal mix from soil trends,
            then confirm before triggering the hardware.
          </p>
        </div>
        <div className="hero-status">
          <Droplets className="h-5 w-5" />
          <span>Confirm-before-trigger enabled</span>
        </div>
      </section>

      {/* ── Compartment Setup ── */}
      <section>
        <div className="section-heading" style={{ marginBottom: "1rem" }}>
          <div>
            <p className="eyebrow">Hardware setup</p>
            <h2>Fertilizer compartments</h2>
          </div>
          <span className="sync-pill">4 slots (A–D)</span>
        </div>
        <p style={{ fontSize: "0.85rem", color: "var(--muted-foreground)", marginBottom: "1.25rem" }}>
          Enter what fertilizer or chemical is loaded in each dosing pump compartment.
          The AI uses these to compute the exact grams to dispense.
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
            gap: "1rem",
            marginBottom: "1rem",
          }}
        >
          {compartments.map((c, idx) => (
            <div
              key={c.slot}
              className="agro-card"
              style={{ borderTop: `3px solid ${SLOT_COLORS[c.slot] ?? "#ccc"}`, padding: "1rem" }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
                <span
                  style={{
                    width: "1.75rem", height: "1.75rem", borderRadius: "0.35rem",
                    background: SLOT_COLORS[c.slot] ?? "#ccc",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontWeight: 900, fontSize: "0.85rem", color: "#fff",
                  }}
                >
                  {c.slot}
                </span>
                <span style={{ fontWeight: 700, fontSize: "0.95rem" }}>Compartment {c.slot}</span>
              </div>

              <div className="farm-profile-field">
                <label className="farm-profile-label">Fertilizer name</label>
                <input
                  className="farm-profile-input"
                  placeholder="e.g. Urea, DAP, Lime"
                  value={c.name}
                  onChange={(e) => updateCompartment(idx, "name", e.target.value)}
                />
              </div>

              <div className="farm-profile-field">
                <label className="farm-profile-label">Type</label>
                <select
                  className="farm-profile-input"
                  value={c.type}
                  onChange={(e) => updateCompartment(idx, "type", e.target.value as FertilizerCompartment["type"])}
                  style={{ cursor: "pointer" }}
                >
                  {FERTILIZER_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.5rem" }}>
                {(["n_pct", "p_pct", "k_pct"] as const).map((field) => (
                  <div className="farm-profile-field" key={field}>
                    <label className="farm-profile-label">
                      {field === "n_pct" ? "N %" : field === "p_pct" ? "P %" : "K %"}
                    </label>
                    <input
                      className="farm-profile-input"
                      type="number"
                      min={0}
                      max={100}
                      value={c[field]}
                      onChange={(e) => updateCompartment(idx, field, Number(e.target.value))}
                    />
                  </div>
                ))}
              </div>

              <div className="farm-profile-field">
                <label className="farm-profile-label">pH effect</label>
                <select
                  className="farm-profile-input"
                  value={c.ph_effect}
                  onChange={(e) => updateCompartment(idx, "ph_effect", e.target.value as FertilizerCompartment["ph_effect"])}
                  style={{ cursor: "pointer" }}
                >
                  {PH_EFFECTS.map((p) => (
                    <option key={p.value} value={p.value}>{p.label}</option>
                  ))}
                </select>
              </div>
            </div>
          ))}
        </div>

        {compError && (
          <p className="auth-error" role="alert" style={{ marginBottom: "0.75rem" }}>{compError}</p>
        )}
        <button className="farm-save-btn" onClick={handleSaveCompartments} disabled={compSaving}>
          {compSaved
            ? <><CheckCircle2 className="h-4 w-4" /> Compartments saved!</>
            : compSaving
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>
              : <><Save className="h-4 w-4" /> Save compartments</>
          }
        </button>
      </section>

      {/* ── Trend Alerts ── */}
      <section>
        <div className="section-heading" style={{ marginBottom: "1rem" }}>
          <div>
            <p className="eyebrow">Historical analysis</p>
            <h2>Trend-based irrigation alerts</h2>
          </div>
        </div>

        {alertsLoading ? (
          <div className="text-sm text-muted-foreground">Analysing sensor trends…</div>
        ) : trendAlerts.length === 0 ? (
          <div
            className="agro-card"
            style={{ display: "flex", alignItems: "center", gap: "0.75rem", color: "var(--muted-foreground)" }}
          >
            <CheckCircle2 className="h-5 w-5" style={{ color: "#4ade80" }} />
            <span>No trend alerts — all parameters are stable. No irrigation action needed right now.</span>
          </div>
        ) : (
          <div className="alert-list">
            {trendAlerts.map((alert) => {
              const Icon = PARAMETER_ICONS[alert.parameter] ?? AlertTriangle;
              return (
                <article key={alert.id} className={`agro-card alert-card priority-${alert.priority}`}>
                  <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: "1rem" }}>
                      <div className="metric-icon">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="alert-priority">
                          {alert.priority} priority · {alert.time} · {alert.trend} trend
                        </p>
                        <h3 style={{ marginTop: "0.25rem", fontSize: "1rem", fontWeight: 800 }}>
                          {alert.title}
                        </h3>
                        <p style={{ marginTop: "0.35rem", fontSize: "0.83rem", color: "var(--muted-foreground)", lineHeight: 1.6 }}>
                          {alert.detail}
                        </p>
                      </div>
                    </div>
                    <span className="sync-pill" style={{ flexShrink: 0 }}>
                      {alert.current_value.toFixed(alert.parameter === "ph" ? 2 : 1)}
                      {alert.parameter === "moisture" ? "%" : alert.parameter === "ph" ? "" : " ppm"}
                    </span>
                  </div>
                  <div className="alert-action">
                    <AlertTriangle className="h-4 w-4" /> {alert.action}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* ── AI Mix Panel ── */}
      <section>
        <div className="section-heading" style={{ marginBottom: "1rem" }}>
          <div>
            <p className="eyebrow">AI fertigation engine</p>
            <h2>Compute optimal mix</h2>
          </div>
        </div>

        {filledCompartments.length === 0 ? (
          <div className="agro-card" style={{ color: "var(--muted-foreground)", fontSize: "0.88rem" }}>
            Fill in at least one compartment above before computing a mix.
          </div>
        ) : (
          <>
            <p style={{ fontSize: "0.85rem", color: "var(--muted-foreground)", marginBottom: "1rem" }}>
              The AI analyses current pH, NPK, moisture readings and your compartment contents to compute
              exact water volume and fertilizer doses needed to reach optimal soil conditions.
            </p>
            <button
              className="farm-save-btn"
              onClick={handleComputeMix}
              disabled={mixLoading}
              style={{ marginBottom: "1.25rem" }}
            >
              {mixLoading
                ? <><Loader2 className="h-4 w-4 animate-spin" /> Computing mix…</>
                : <><FlaskConical className="h-4 w-4" /> Compute AI fertigation mix</>
              }
            </button>

            {mixError && (
              <p className="auth-error" role="alert" style={{ marginBottom: "0.75rem" }}>{mixError}</p>
            )}

            {mix && (
              <div className="agro-card" style={{ marginTop: "0.5rem" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
                  <h3 style={{ fontWeight: 800, fontSize: "1rem" }}>AI mix result</h3>
                  <UrgencyBadge urgency={mix.urgency} />
                </div>

                <p style={{ fontSize: "0.85rem", color: "var(--muted-foreground)", marginBottom: "1rem" }}>
                  {mix.summary}
                </p>

                <div style={{ display: "flex", gap: "2rem", marginBottom: "1rem" }}>
                  <div>
                    <p style={{ fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", color: "var(--muted-foreground)" }}>Water volume</p>
                    <p style={{ fontSize: "1.5rem", fontWeight: 900 }}>{mix.water_litres} <span style={{ fontSize: "0.9rem" }}>L</span></p>
                  </div>
                  <div>
                    <p style={{ fontSize: "0.7rem", fontWeight: 700, textTransform: "uppercase", color: "var(--muted-foreground)" }}>Duration</p>
                    <p style={{ fontSize: "1.5rem", fontWeight: 900 }}>{mix.duration_minutes} <span style={{ fontSize: "0.9rem" }}>min</span></p>
                  </div>
                </div>

                {mix.doses.length > 0 ? (
                  <div style={{ marginBottom: "1.25rem" }}>
                    <p style={{ fontSize: "0.75rem", fontWeight: 700, textTransform: "uppercase", color: "var(--muted-foreground)", marginBottom: "0.5rem" }}>
                      Fertilizer doses
                    </p>
                    {mix.doses.map((d) => (
                      <div
                        key={d.slot}
                        style={{
                          display: "flex", alignItems: "center", gap: "0.75rem",
                          padding: "0.5rem 0",
                          borderBottom: "1px solid var(--border)",
                        }}
                      >
                        <span
                          style={{
                            width: "2rem", height: "2rem", borderRadius: "0.35rem",
                            background: SLOT_COLORS[d.slot] ?? "#ccc",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontWeight: 900, fontSize: "0.8rem", color: "#fff", flexShrink: 0,
                          }}
                        >
                          {d.slot}
                        </span>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", gap: "0.5rem", alignItems: "baseline" }}>
                            <span style={{ fontWeight: 700 }}>{d.name}</span>
                            <span style={{ fontSize: "1.1rem", fontWeight: 900, color: "var(--primary)" }}>{d.amount_g}g</span>
                          </div>
                          <p style={{ fontSize: "0.75rem", color: "var(--muted-foreground)", margin: 0 }}>{d.reason}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ fontSize: "0.85rem", color: "var(--muted-foreground)", marginBottom: "1rem" }}>
                    No fertilizer doses needed — only water irrigation required.
                  </p>
                )}

                <button
                  className="farm-save-btn"
                  onClick={() => { setShowConfirm(true); setTriggered(false); }}
                  style={{ background: "#16a34a", width: "100%" }}
                >
                  <Play className="h-4 w-4" /> Review &amp; Trigger Irrigation
                </button>
              </div>
            )}
          </>
        )}
      </section>

      {/* ── Confirm Modal ── */}
      {showConfirm && mix && (
        <ConfirmModal
          mix={mix}
          onConfirm={handleTrigger}
          onCancel={() => { if (!triggering) setShowConfirm(false); }}
          loading={triggering}
          triggered={triggered}
          triggerMessage={triggerMessage}
        />
      )}
    </div>
  );
}
