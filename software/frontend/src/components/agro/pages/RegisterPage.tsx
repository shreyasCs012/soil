import {
  Building2, Eye, EyeOff, Leaf, Lock, Mail, MapPin, Phone, Sprout, User,
} from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { login, register } from "../../../services/api";
import { CropCombobox } from "../CropCombobox";

type Step = 1 | 2 | 3;

const STEPS = [
  { label: "Account", icon: User },
  { label: "Profile", icon: User },
  { label: "Farm", icon: Sprout },
];

export function RegisterPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>(1);
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    username: "",
    email: "",
    password: "",
    farmer_name: "",
    phone: "",
    address: "",
    farm_name: "",
    farm_location: "",
    farm_address: "",
    farm_area: "",
    crop_type: "",
    soil_type: "",
  });

  function set(field: keyof typeof form) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
  }

  function validateStep(): string | null {
    if (step === 1) {
      if (!form.username.trim()) return "Username is required.";
      if (form.username.length < 3) return "Username must be at least 3 characters.";
      if (!form.email.includes("@")) return "Please enter a valid email address.";
      if (form.password.length < 8) return "Password must be at least 8 characters.";
    }
    if (step === 2) {
      if (!form.farmer_name.trim()) return "Farmer name is required.";
    }
    if (step === 3) {
      if (!form.farm_name.trim()) return "Farm name is required.";
    }
    return null;
  }

  function nextStep() {
    const err = validateStep();
    if (err) { setError(err); return; }
    setError(null);
    setStep((s) => (s + 1) as Step);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const err = validateStep();
    if (err) { setError(err); return; }
    setError(null);
    setLoading(true);
    try {
      await register({
        username: form.username,
        email: form.email,
        password: form.password,
        farmer_name: form.farmer_name,
        phone: form.phone,
        address: form.address,
        farm_name: form.farm_name,
        farm_location: form.farm_location,
        farm_address: form.farm_address,
        farm_area: form.farm_area ? parseFloat(form.farm_area) : null,
        crop_type: form.crop_type,
        soil_type: form.soil_type,
      });
      await login({ username: form.username, password: form.password });
      navigate({ to: "/" });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const clean = msg.replace(/^API Error: \d+ - /, "");
      try {
        const parsed = JSON.parse(clean);
        const first = Object.values(parsed)[0];
        setError(Array.isArray(first) ? first[0] : String(first));
      } catch {
        setError(clean);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-shell">
      {/* ── Left panel ────────────────────────────────── */}
      <aside className="auth-panel">
        <div className="auth-panel-inner">
          <div className="auth-brand">
            <div className="auth-brand-icon">
              <Leaf className="h-7 w-7" />
            </div>
            <div>
              <p className="auth-brand-name">Smart Agro</p>
              <p className="auth-brand-tagline">Advisory System</p>
            </div>
          </div>

          <div className="auth-panel-body">
            <h2 className="auth-panel-heading">Start farming smarter today</h2>
            <p className="auth-panel-sub">
              Set up your farm profile and get instant AI-powered soil health insights, crop recommendations, and weather alerts.
            </p>

            {/* Step indicator on the side */}
            <div className="auth-steps">
              {STEPS.map((s, i) => {
                const num = (i + 1) as Step;
                const state = num < step ? "done" : num === step ? "active" : "pending";
                return (
                  <div key={s.label} className={`auth-step auth-step-${state}`}>
                    <div className="auth-step-dot">
                      {state === "done" ? "✓" : num}
                    </div>
                    <span className="auth-step-label">{s.label}</span>
                    {i < STEPS.length - 1 && <div className="auth-step-line" />}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="auth-panel-field-pattern" aria-hidden="true" />
        </div>
      </aside>

      {/* ── Right form panel ──────────────────────────── */}
      <main className="auth-form-panel">
        <div className="auth-form-box">
          <div className="auth-form-header">
            <h1 className="auth-form-title">
              {step === 1 && "Create your account"}
              {step === 2 && "Your farmer profile"}
              {step === 3 && "Your farm details"}
            </h1>
            <p className="auth-form-sub">Step {step} of 3</p>
          </div>

          <form onSubmit={step === 3 ? handleSubmit : (e) => { e.preventDefault(); nextStep(); }} className="auth-form" noValidate>

            {/* ── Step 1: Account ─────────────────────── */}
            {step === 1 && (
              <>
                <div className="auth-field">
                  <label className="auth-label" htmlFor="username">Username</label>
                  <div className="auth-input-wrap">
                    <User className="auth-input-icon" />
                    <input id="username" className="auth-input" type="text" placeholder="your_username" value={form.username} onChange={set("username")} autoComplete="username" required />
                  </div>
                </div>
                <div className="auth-field">
                  <label className="auth-label" htmlFor="email">Email address</label>
                  <div className="auth-input-wrap">
                    <Mail className="auth-input-icon" />
                    <input id="email" className="auth-input" type="email" placeholder="you@example.com" value={form.email} onChange={set("email")} autoComplete="email" required />
                  </div>
                </div>
                <div className="auth-field">
                  <label className="auth-label" htmlFor="password">Password</label>
                  <div className="auth-input-wrap">
                    <Lock className="auth-input-icon" />
                    <input id="password" className="auth-input" type={showPass ? "text" : "password"} placeholder="At least 8 characters" value={form.password} onChange={set("password")} autoComplete="new-password" required />
                    <button type="button" className="auth-input-toggle" onClick={() => setShowPass((v) => !v)} aria-label="Toggle password">
                      {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* ── Step 2: Farmer Profile ───────────────── */}
            {step === 2 && (
              <>
                <div className="auth-field">
                  <label className="auth-label" htmlFor="farmer_name">Full name</label>
                  <div className="auth-input-wrap">
                    <User className="auth-input-icon" />
                    <input id="farmer_name" className="auth-input" type="text" placeholder="e.g. Shreyas Kumar" value={form.farmer_name} onChange={set("farmer_name")} required />
                  </div>
                </div>
                <div className="auth-field">
                  <label className="auth-label" htmlFor="phone">Phone number</label>
                  <div className="auth-input-wrap">
                    <Phone className="auth-input-icon" />
                    <input id="phone" className="auth-input" type="tel" placeholder="+91 98765 43210" value={form.phone} onChange={set("phone")} />
                  </div>
                </div>
                <div className="auth-field">
                  <label className="auth-label" htmlFor="address">Home / village address</label>
                  <div className="auth-input-wrap">
                    <MapPin className="auth-input-icon" />
                    <input id="address" className="auth-input" type="text" placeholder="Village, District, State" value={form.address} onChange={set("address")} />
                  </div>
                </div>
              </>
            )}

            {/* ── Step 3: Farm Details ─────────────────── */}
            {step === 3 && (
              <>
                <div className="auth-field">
                  <label className="auth-label" htmlFor="farm_name">Farm name</label>
                  <div className="auth-input-wrap">
                    <Building2 className="auth-input-icon" />
                    <input id="farm_name" className="auth-input" type="text" placeholder="e.g. North Field Farm" value={form.farm_name} onChange={set("farm_name")} required />
                  </div>
                </div>
                <div className="auth-field-row">
                  <div className="auth-field">
                    <label className="auth-label" htmlFor="farm_location">District / Location</label>
                    <div className="auth-input-wrap">
                      <MapPin className="auth-input-icon" />
                      <input id="farm_location" className="auth-input" type="text" placeholder="Kolar, Karnataka" value={form.farm_location} onChange={set("farm_location")} />
                    </div>
                  </div>
                  <div className="auth-field">
                    <label className="auth-label" htmlFor="farm_area">Area (acres)</label>
                    <div className="auth-input-wrap">
                      <Sprout className="auth-input-icon" />
                      <input id="farm_area" className="auth-input" type="number" min="0.1" step="0.1" placeholder="12.5" value={form.farm_area} onChange={set("farm_area")} />
                    </div>
                  </div>
                </div>
                <div className="auth-field">
                  <label className="auth-label" htmlFor="farm_address">Full farm address</label>
                  <div className="auth-input-wrap">
                    <MapPin className="auth-input-icon" />
                    <input id="farm_address" className="auth-input" type="text" placeholder="Survey No., Village Road, District" value={form.farm_address} onChange={set("farm_address")} />
                  </div>
                </div>
                <div className="auth-field-row">
                  <div className="auth-field">
                    <label className="auth-label" htmlFor="crop_type">Crop type</label>
                    <CropCombobox
                      id="crop_type"
                      value={form.crop_type}
                      onChange={(v) => setForm((prev) => ({ ...prev, crop_type: v }))}
                    />
                  </div>
                  <div className="auth-field">
                    <label className="auth-label" htmlFor="soil_type">Soil type</label>
                    <div className="auth-input-wrap">
                      <Leaf className="auth-input-icon" />
                      <input id="soil_type" className="auth-input" type="text" placeholder="Red Laterite, Black…" value={form.soil_type} onChange={set("soil_type")} />
                    </div>
                  </div>
                </div>
              </>
            )}

            {error && <p className="auth-error" role="alert">{error}</p>}

            <div className="auth-actions">
              {step > 1 && (
                <button type="button" className="auth-back" onClick={() => { setError(null); setStep((s) => (s - 1) as Step); }}>
                  Back
                </button>
              )}
              <button type="submit" className="auth-submit" disabled={loading}>
                {loading && <span className="auth-spinner" />}
                {step < 3 ? "Continue →" : loading ? "Creating account…" : "Create account"}
              </button>
            </div>
          </form>

          {step === 1 && (
            <p className="auth-switch">
              Already have an account?{" "}
              <Link to="/login" className="auth-switch-link">Sign in</Link>
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
