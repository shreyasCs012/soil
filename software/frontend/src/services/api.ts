// API configuration and service functions
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";

const ACCESS_TOKEN_KEY = "access_token";
const REFRESH_TOKEN_KEY = "refresh_token";

// In-memory cache (SSR has no localStorage; client must sync on read)
let accessToken: string | null = null;
let refreshToken: string | null = null;

function syncTokensFromStorage(): void {
  if (typeof window === "undefined") return;
  accessToken = window.localStorage.getItem(ACCESS_TOKEN_KEY);
  refreshToken = window.localStorage.getItem(REFRESH_TOKEN_KEY);
}

function persistTokens(access: string, refresh: string): void {
  accessToken = access;
  refreshToken = refresh;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(ACCESS_TOKEN_KEY, access);
    window.localStorage.setItem(REFRESH_TOKEN_KEY, refresh);
  }
}

function clearStoredTokens(): void {
  accessToken = null;
  refreshToken = null;
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(ACCESS_TOKEN_KEY);
    window.localStorage.removeItem(REFRESH_TOKEN_KEY);
  }
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function isJwtExpired(token: string, leewaySeconds = 30): boolean {
  const payload = decodeJwtPayload(token);
  if (!payload || typeof payload.exp !== "number") return false;
  return Date.now() / 1000 >= payload.exp - leewaySeconds;
}

/** Debug logging for stored JWT state (requested for troubleshooting). */
export function logTokenState(context: string): void {
  syncTokensFromStorage();
  console.group(`[auth] ${context}`);
  console.log("access in localStorage:", !!accessToken);
  console.log("refresh in localStorage:", !!refreshToken);
  if (accessToken) {
    console.log("access_token:", accessToken);
    const accessClaims = decodeJwtPayload(accessToken);
    if (accessClaims) {
      console.log("access claims:", accessClaims);
      console.log("access expired:", isJwtExpired(accessToken));
    }
  }
  if (refreshToken) {
    console.log("refresh_token:", refreshToken);
    const refreshClaims = decodeJwtPayload(refreshToken);
    if (refreshClaims) {
      console.log("refresh claims:", refreshClaims);
      console.log("refresh expired:", isJwtExpired(refreshToken));
    }
  }
  console.groupEnd();
}

// Auth types
interface LoginCredentials {
  username: string;
  password: string;
}

interface RegisterCredentials extends LoginCredentials {
  email: string;
}

interface TokenResponse {
  access: string;
  refresh: string;
}

interface RegisterResponse {
  detail: string;
}

type FarmRef =
  | string
  | number
  | {
      id?: string | number;
      name?: string;
    };

export interface DashboardMetric {
  key: "moisture" | "ph" | "nitrogen" | "phosphorus" | "potassium";
  label: string;
  value: number;
  unit: string;
  status?: "low" | "normal" | "warning";
  hint?: string;
}

export interface TrendPoint {
  time: string;
  moisture: number;
  ph: number;
  nitrogen: number;
  phosphorus: number;
  potassium: number;
}

export interface DashboardData {
  metrics: DashboardMetric[];
  trend: TrendPoint[];
}

export interface AlertData {
  id: string;
  priority: "High" | "Medium" | "Low";
  time: string;
  title: string;
  detail: string;
  action: string;
  zone: string;
}

// Sensor data types
export interface SensorDataPoint {
  id?: string;
  farm: FarmRef;
  temperature: number;
  humidity: number;
  soil_moisture: number;
  ph: number;
  nitrogen: number;
  phosphorus: number;
  potassium: number;
  timestamp?: string;
}

export interface CropRecommendation {
  id: number | null;
  farm: string | number;
  recommended_crop: string;
  confidence_score: number;
  reason: string;
  created_at: string | null;
}

export interface PesticideRecommendation {
  id: number | null;
  farm: string | number;
  crop_name: string;
  condition: string;
  pesticide_name: string;
  dosage: string;
  reason: string;
  created_at: string | null;
}

// Helper function to make API calls
async function apiCall<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  syncTokensFromStorage();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (options.headers) {
    const extra =
      options.headers instanceof Headers
        ? Object.fromEntries(options.headers.entries())
        : Array.isArray(options.headers)
          ? Object.fromEntries(options.headers)
          : options.headers;
    Object.assign(headers, extra);
  }

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  // Basic retry logic for transient network errors
  let attempts = 0;
  const maxAttempts = 2;
  let lastErr: unknown = null;

  while (attempts <= maxAttempts) {
    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        headers,
      });

      if (response.status === 401) {
        // Try to refresh token
        if (refreshToken) {
          const refreshed = await refreshAccessToken();
          if (refreshed) {
            // Retry the original request once more
            attempts++;
            continue;
          }
        }
        throw new Error("Unauthorized - Please login again");
      }

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`API Error: ${response.status} - ${error}`);
      }

      return response.json();
    } catch (err) {
      lastErr = err;
      // If it's a network error retry once
      attempts++;
      if (attempts > maxAttempts) break;
      await new Promise((r) => setTimeout(r, 300 * attempts));
    }
  }

  throw lastErr;
}

// Authentication endpoints
export async function register(credentials: RegisterCredentials): Promise<RegisterResponse> {
  const response = await apiCall<RegisterResponse>("/auth/register/", {
    method: "POST",
    body: JSON.stringify(credentials),
  });
  return response;
}

export async function login(credentials: LoginCredentials): Promise<boolean> {
  try {
    const response = await apiCall<TokenResponse>("/auth/token/", {
      method: "POST",
      body: JSON.stringify(credentials),
    });

    persistTokens(response.access, response.refresh);
    logTokenState("login-success");

    return true;
  } catch (error) {
    console.error("Login failed:", error);
    return false;
  }
}

export async function logout(): Promise<void> {
  clearStoredTokens();
}

export async function refreshAccessToken(): Promise<boolean> {
  syncTokensFromStorage();
  if (!refreshToken) return false;

  try {
    const response = await fetch(`${API_BASE_URL}/auth/token/refresh/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh: refreshToken }),
    });

    if (!response.ok) {
      console.warn("[auth] refresh failed:", response.status, await response.text());
      return false;
    }

    const data: TokenResponse = await response.json();
    accessToken = data.access;
    if (typeof window !== "undefined") {
      window.localStorage.setItem(ACCESS_TOKEN_KEY, data.access);
    }
    logTokenState("refresh-success");

    return true;
  } catch (error) {
    console.error("[auth] Token refresh failed:", error);
    return false;
  }
}

// Sensor data endpoints
export async function getSensorData(): Promise<SensorDataPoint[]> {
  return getSensorHistory();
}

export async function getSensorMetrics(): Promise<DashboardData> {
  return apiCall<DashboardData>(`/dashboard/`);
}

export async function getLatestSensorData(): Promise<SensorDataPoint[]> {
  return apiCall<SensorDataPoint[]>("/sensor-data/latest/");
}

export async function getSensorHistory(
  farmId?: string,
  days: number = 7,
): Promise<SensorDataPoint[]> {
  const params = new URLSearchParams();
  if (farmId) params.append("farm_id", farmId);
  params.append("days", days.toString());

  return apiCall<SensorDataPoint[]>(`/sensor-data/history/?${params.toString()}`);
}

export async function createSensorData(data: SensorDataPoint): Promise<SensorDataPoint> {
  return apiCall<SensorDataPoint>("/sensor-data/", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// Recommendation endpoints
export async function getCropRecommendations(farmId: string | number): Promise<CropRecommendation> {
  const params = new URLSearchParams();
  params.append("farm_id", String(farmId));

  return apiCall<CropRecommendation>(`/recommend/crop/?${params.toString()}`);
}

export async function getPesticideRecommendations(
  farmId: string | number,
  crop: string,
): Promise<PesticideRecommendation> {
  const params = new URLSearchParams();
  params.append("farm_id", String(farmId));
  params.append("crop", crop);

  return apiCall<PesticideRecommendation>(`/recommend/pesticide/?${params.toString()}`);
}

export interface FarmData {
  id: number;
  name: string;
  location: string;
  address: string;
  area_acres: string | null;
  crop_type: string;
  soil_type: string;
  latitude?: number | null;
  longitude?: number | null;
  created_at: string;
}

// Farm endpoints
export async function getFarms(): Promise<FarmData[]> {
  return apiCall<FarmData[]>("/farms/");
}

export async function createFarm(name: string): Promise<FarmData> {
  return apiCall<FarmData>("/farms/", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export async function updateFarm(
  farmId: number,
  data: Partial<Pick<FarmData, 'crop_type' | 'soil_type' | 'location' | 'latitude' | 'longitude' | 'name'>>,
): Promise<FarmData> {
  return apiCall<FarmData>(`/farms/${farmId}/`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
}

// Weather endpoint
export interface WeatherData {
  city: string;
  temperature: number;
  humidity: number;
  description: string;
  wind_speed: number;
  icon_url: string;
  timestamp: string;
}

export async function getWeather(city: string): Promise<WeatherData> {
  const params = new URLSearchParams();
  params.append("city", city.trim());
  return apiCall<WeatherData>(`/weather/?${params.toString()}`);
}

export async function getWeatherByCoords(lat: number, lon: number): Promise<WeatherData> {
  const params = new URLSearchParams();
  params.append("lat", lat.toString());
  params.append("lon", lon.toString());
  return apiCall<WeatherData>(`/weather/?${params.toString()}`);
}

// Dashboard endpoint (metrics + trend)
export async function getDashboard(): Promise<DashboardData> {
  return apiCall<DashboardData>(`/dashboard/`);
}

export async function getAlerts(): Promise<AlertData[]> {
  return apiCall<AlertData[]>(`/alerts/`);
}

export interface SoilPrediction {
  predicted_ph: number;
  predicted_nitrogen: number;
  predicted_phosphorus: number;
  predicted_potassium: number;
  ph_trend: 'rising' | 'falling' | 'stable';
  npk_trend: 'rising' | 'falling' | 'stable';
  confidence: number;
  analysis: string;
  horizon_days: number;
}

export async function getSoilPrediction(farmId?: string | number): Promise<SoilPrediction> {
  const params = new URLSearchParams();
  if (farmId) params.append('farm_id', String(farmId));
  const qs = params.toString();
  return apiCall<SoilPrediction>(`/predict/soil/${qs ? `?${qs}` : ''}`);
}

export interface CropSoilRecommendation {
  crop: string;
  summary: string;
  recommendations: string[];
  urgency: 'good' | 'info' | 'warning' | 'critical';
}

export async function getCropSoilRecommendation(
  farmId?: string | number,
  crop?: string,
): Promise<CropSoilRecommendation> {
  const params = new URLSearchParams();
  if (farmId) params.append('farm_id', String(farmId));
  if (crop) params.append('crop', crop);
  return apiCall<CropSoilRecommendation>(`/recommend/soil-for-crop/?${params.toString()}`);
}

export interface UserData {
  id: number;
  username: string;
  email: string;
  farmer_name: string;
  phone: string;
  profile_address: string;
  farms: Array<{
    id: number;
    name: string;
    location: string;
    address: string;
    area_acres: string | null;
    crop_type: string;
    soil_type: string;
    created_at: string;
  }>;
}

export async function getMe(): Promise<UserData> {
  return apiCall<UserData>('/auth/me/');
}

// Helper to check if user is authenticated
export function isAuthenticated(): boolean {
  syncTokensFromStorage();
  return !!accessToken;
}

/**
 * If JWTs exist in localStorage, validate them with /auth/me/ (refresh first if expired).
 * Returns user profile when the session is valid, otherwise null.
 */
export async function tryRestoreSession(): Promise<UserData | null> {
  syncTokensFromStorage();
  logTokenState("restore-start");

  if (!accessToken && !refreshToken) {
    console.log("[auth] No stored tokens — user must sign in");
    return null;
  }

  if (!accessToken && refreshToken) {
    console.log("[auth] Missing access token, refreshing…");
    if (!(await refreshAccessToken())) {
      console.warn("[auth] Refresh failed — clearing tokens");
      clearStoredTokens();
      return null;
    }
  } else if (accessToken && isJwtExpired(accessToken)) {
    console.log("[auth] Access token expired, refreshing…");
    if (refreshToken) {
      if (!(await refreshAccessToken())) {
        console.warn("[auth] Could not refresh expired access token");
        clearStoredTokens();
        return null;
      }
    } else {
      console.warn("[auth] Access expired and no refresh token");
      clearStoredTokens();
      return null;
    }
  }

  try {
    const user = await getMe();
    console.log("[auth] Stored JWT is valid — session restored for", user.username);
    logTokenState("restore-success");
    return user;
  } catch (err) {
    console.warn("[auth] getMe failed with stored access token:", err);

    if (!refreshToken) {
      clearStoredTokens();
      return null;
    }

    console.log("[auth] Retrying after refresh…");
    if (!(await refreshAccessToken())) {
      console.warn("[auth] Refresh token invalid — clearing tokens");
      clearStoredTokens();
      return null;
    }

    try {
      const user = await getMe();
      console.log("[auth] Session restored via refresh for", user.username);
      logTokenState("restore-after-refresh");
      return user;
    } catch (retryErr) {
      console.error("[auth] Session restore failed after refresh:", retryErr);
      clearStoredTokens();
      return null;
    }
  }
}

// Helper to get current access token
export function getAccessToken(): string | null {
  syncTokensFromStorage();
  return accessToken;
}

// ── Irrigation / Fertigation ──────────────────────────────────────────────────

export interface FertilizerCompartment {
  slot: 'A' | 'B' | 'C' | 'D';
  name: string;
  type: 'nitrogen' | 'phosphorus' | 'potassium' | 'ph_corrector' | 'water';
  n_pct: number;
  p_pct: number;
  k_pct: number;
  ph_effect: 'raise' | 'lower' | 'neutral';
}

export interface CompartmentsData {
  compartments: FertilizerCompartment[];
  farm_id: number | null;
}

export interface FertigationDose {
  slot: string;
  name: string;
  amount_g: number;
  reason: string;
}

export interface MixResult {
  water_litres: number;
  duration_minutes: number;
  doses: FertigationDose[];
  summary: string;
  urgency: 'good' | 'info' | 'warning' | 'critical';
}

export interface TrendAlert {
  id: string;
  priority: 'High' | 'Medium' | 'Low';
  time: string;
  title: string;
  detail: string;
  action: string;
  parameter: 'ph' | 'nitrogen' | 'phosphorus' | 'potassium' | 'moisture';
  trend: 'rising' | 'falling' | 'stable';
  requires_irrigation: boolean;
  current_value: number;
}

export interface TriggerResult {
  status: 'queued';
  command_id: string | null;
  message: string;
}

export async function getCompartments(): Promise<CompartmentsData> {
  return apiCall<CompartmentsData>('/irrigation/compartments/');
}

export async function saveCompartments(compartments: FertilizerCompartment[]): Promise<CompartmentsData> {
  return apiCall<CompartmentsData>('/irrigation/compartments/', {
    method: 'POST',
    body: JSON.stringify({ compartments }),
  });
}

export async function computeMix(farmId: number | null, compartments: FertilizerCompartment[]): Promise<MixResult> {
  return apiCall<MixResult>('/irrigation/compute-mix/', {
    method: 'POST',
    body: JSON.stringify({ farm_id: farmId, compartments }),
  });
}

export async function getIrrigationTrendAlerts(farmId?: number | null): Promise<TrendAlert[]> {
  const params = new URLSearchParams();
  if (farmId) params.append('farm_id', String(farmId));
  const qs = params.toString();
  return apiCall<TrendAlert[]>(`/irrigation/trend-alerts/${qs ? `?${qs}` : ''}`);
}

export async function triggerIrrigation(mix: MixResult): Promise<TriggerResult> {
  return apiCall<TriggerResult>('/irrigation/trigger/', {
    method: 'POST',
    body: JSON.stringify(mix),
  });
}

export default {
  // Auth
  register,
  login,
  logout,
  isAuthenticated,
  tryRestoreSession,
  logTokenState,
  getAccessToken,

  // Sensors
  getSensorData,
  getLatestSensorData,
  getSensorHistory,
  createSensorData,

  // Recommendations
  getCropRecommendations,
  getPesticideRecommendations,

  // Farms
  getFarms,
  createFarm,

  // Weather
  getWeather,

  // Dashboard
  getDashboard,
  getAlerts,

  // Irrigation
  getCompartments,
  saveCompartments,
  computeMix,
  getIrrigationTrendAlerts,
  triggerIrrigation,
};
