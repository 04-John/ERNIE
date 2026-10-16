import axios from 'axios'

export const BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000').replace(/\/$/, '')
export const TOKEN_KEY = 'ernie_token'

export const api = axios.create({
  baseURL: BASE_URL,
  timeout: 30_000,
  headers: { 'Content-Type': 'application/json' },
})

// Attach the JWT to every request
api.interceptors.request.use(config => {
  const token = localStorage.getItem(TOKEN_KEY)
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// An expired/invalid token anywhere sends the user back to login (not for the login calls themselves)
api.interceptors.response.use(
  r => r,
  err => {
    const url = err.config?.url || ''
    if (err.response?.status === 401 && !url.startsWith('/auth/') && localStorage.getItem(TOKEN_KEY)) {
      localStorage.removeItem(TOKEN_KEY)
      window.dispatchEvent(new Event('ernie:logout'))
    }
    return Promise.reject(err)
  },
)

// ── Auth
export const loginUser    = (email, password) => api.post('/auth/login', { email, password }).then(r => r.data)
export const registerUser = (email, password, name, company) => api.post('/auth/register', { email, password, name, company }).then(r => r.data)
export const googleAuth   = access_token => api.post('/auth/google', { access_token }).then(r => r.data)
export const getMe        = () => api.get('/auth/me').then(r => r.data)

// ── Analytics
export const fetchSummary       = () => api.get('/analytics/summary').then(r => r.data.data)
export const fetchMonthlyVolume = () => api.get('/analytics/monthly-volume').then(r => r.data.data)
export const fetchRegional      = () => api.get('/analytics/regional').then(r => r.data.data)
export const fetchTypeBreakdown = () => api.get('/analytics/type-breakdown').then(r => r.data.data)
export const fetchStatus        = () => api.get('/analytics/status').then(r => r.data)
export const refreshData        = () => api.post('/analytics/refresh').then(r => r.data)

// ── Churn
export const fetchChurnScores  = (params = {}) => api.get('/churn/scores', { params }).then(r => r.data)
export const fetchHighRisk     = () => api.get('/churn/high-risk').then(r => r.data)
export const fetchDistribution = () => api.get('/churn/distribution').then(r => r.data.data)

// ── Wallets
export const fetchDormancy      = () => api.get('/wallets/dormancy').then(r => r.data.data)
export const fetchWalletList    = (params = {}) => api.get('/wallets/activity', { params }).then(r => r.data)
export const fetchActivityTrend = () => api.get('/wallets/activity-trend').then(r => r.data.data)
