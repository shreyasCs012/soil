// API configuration and service functions
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";

// Store for JWT tokens
let accessToken: string | null = null;
let refreshToken: string | null = null;

if (typeof window !== "undefined" && typeof window.localStorage !== "undefined") {
  accessToken = window.localStorage.getItem("access_token");
  refreshToken = window.localStorage.getItem("refresh_token");
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

interface UserData {
  id: string;
  username: string;
  email: string;
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
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...options.headers,
  };

  // Add auth token if available
  if (accessToken) {
    headers["Authorization"] = `Bearer ${accessToken}`;
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    // Try to refresh token
    if (refreshToken) {
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        // Retry the original request
        return apiCall<T>(endpoint, options);
      }
    }
    throw new Error("Unauthorized - Please login again");
  }

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API Error: ${response.status} - ${error}`);
  }

  return response.json();
}

// Authentication endpoints
export async function register(credentials: RegisterCredentials): Promise<UserData> {
  const response = await apiCall<UserData>("/auth/register/", {
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

    accessToken = response.access;
    refreshToken = response.refresh;

    localStorage.setItem("access_token", response.access);
    localStorage.setItem("refresh_token", response.refresh);

    return true;
  } catch (error) {
    console.error("Login failed:", error);
    return false;
  }
}

export async function logout(): Promise<void> {
  accessToken = null;
  refreshToken = null;
  localStorage.removeItem("access_token");
  localStorage.removeItem("refresh_token");
}

export async function refreshAccessToken(): Promise<boolean> {
  if (!refreshToken) return false;

  try {
    const response = await fetch(`${API_BASE_URL}/auth/token/refresh/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh: refreshToken }),
    });

    if (!response.ok) return false;

    const data: TokenResponse = await response.json();
    accessToken = data.access;
    localStorage.setItem("access_token", data.access);

    return true;
  } catch (error) {
    console.error("Token refresh failed:", error);
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
  return !!accessToken;
}

// Helper to get current access token
export function getAccessToken(): string | null {
  return accessToken;
}

export default {
  // Auth
  register,
  login,
  logout,
  isAuthenticated,
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
};
