import axios from 'axios'

export const BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000').replace(/\/$/, '')

export const api = axios.create({
  baseURL: BASE_URL,
  timeout: 30_000,
  headers: { 'Content-Type': 'application/json' },
})

// ── Auto-attach JWT token to every request
api.interceptors.request.use(config => {
  const token = localStorage.getItem('br_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// ── Auth
export const loginUser     = (email, password) =>
  api.post('/auth/login',    { email, password }).then(r => r.data)

export const registerUser  = (email, password, name, company) =>
  api.post('/auth/register', { email, password, name, company }).then(r => r.data)

export const googleAuth    = (access_token) =>
  api.post('/auth/google',   { access_token }).then(r => r.data)

export const getMe         = () =>
  api.get('/auth/me').then(r => r.data)

// ── Analytics
export const fetchSummary       = () => api.get('/analytics/summary').then(r => r.data.data)
export const fetchMonthlyVolume = () => api.get('/analytics/monthly-volume').then(r => r.data.data)
export const fetchRegional      = () => api.get('/analytics/regional').then(r => r.data.data)
export const fetchTypeBreakdown = () => api.get('/analytics/type-breakdown').then(r => r.data.data)

// ── Churn
export const fetchChurnScores  = (params = {}) => api.get('/churn/scores', { params }).then(r => r.data)
export const fetchHighRisk     = () => api.get('/churn/high-risk').then(r => r.data)
export const fetchDistribution = () => api.get('/churn/distribution').then(r => r.data.data)

// ── Wallets
export const fetchDormancy = () => api.get('/wallets/dormancy').then(r => r.data.data)