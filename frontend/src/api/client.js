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
export const registerUser = (email, password, name, company, invite_token) => api.post('/auth/register', { email, password, name, company, invite_token }).then(r => r.data)
export const googleAuth   = (access_token, invite_token) => api.post('/auth/google', { access_token, invite_token }).then(r => r.data)
export const previewInvite = token => api.get(`/auth/invite/${encodeURIComponent(token)}`).then(r => r.data)
export const getMe        = () => api.get('/auth/me').then(r => r.data)

// ── Analytics
export const fetchSummary       = () => api.get('/analytics/summary').then(r => r.data.data)
export const fetchMonthlyVolume = () => api.get('/analytics/monthly-volume').then(r => r.data.data)
export const fetchRegional      = () => api.get('/analytics/regional').then(r => r.data.data)
export const fetchTypeBreakdown = () => api.get('/analytics/type-breakdown').then(r => r.data.data)
export const fetchHistory       = (days = 90) => api.get('/analytics/history', { params: { days } }).then(r => r.data)
export const fetchStatus        = () => api.get('/analytics/status').then(r => r.data)
export const refreshData        = () => api.post('/analytics/refresh').then(r => r.data)

// ── Churn
export const fetchChurnScores  = (params = {}) => api.get('/churn/scores', { params }).then(r => r.data)
export const fetchHighRisk     = () => api.get('/churn/high-risk').then(r => r.data)
export const fetchDistribution = () => api.get('/churn/distribution').then(r => r.data.data)

// ── Workspace / Blockradar connection
export const fetchWorkspace      = () => api.get('/workspace').then(r => r.data)
export const connectBlockradar   = (api_key, wallet_id) => api.put('/workspace/connection', { api_key, wallet_id }).then(r => r.data)
export const disconnectBlockradar = () => api.delete('/workspace/connection').then(r => r.data)

// ── Team
export const fetchMembers  = () => api.get('/workspace/members').then(r => r.data.data)
export const fetchInvites  = () => api.get('/workspace/invites').then(r => r.data.data)
export const createInvite  = (email, role) => api.post('/workspace/invites', { email: email || null, role }).then(r => r.data)
export const revokeInvite  = id => api.delete(`/workspace/invites/${id}`).then(r => r.data)
export const changeRole    = (id, role) => api.patch(`/workspace/members/${id}`, { role }).then(r => r.data)
export const removeMember  = id => api.delete(`/workspace/members/${id}`).then(r => r.data)

// ── Wallets
export const fetchDormancy      = () => api.get('/wallets/dormancy').then(r => r.data.data)
export const fetchWalletList    = (params = {}) => api.get('/wallets/activity', { params }).then(r => r.data)
export const fetchActivityTrend = () => api.get('/wallets/activity-trend').then(r => r.data.data)
