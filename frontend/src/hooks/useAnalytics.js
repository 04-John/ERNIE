import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  fetchSummary, fetchMonthlyVolume, fetchRegional, fetchTypeBreakdown,
  fetchChurnScores, fetchDistribution, fetchDormancy, fetchHighRisk,
  fetchActivityTrend, fetchWalletList, fetchStatus, refreshData,
  fetchWorkspace, connectBlockradar, disconnectBlockradar,
  fetchMembers, fetchInvites, createInvite, revokeInvite, changeRole, removeMember, fetchHistory,
  fetchChannels, addChannel, toggleChannel, removeChannel, testChannel, fetchAlertEvents,
} from '../api/client'

export const useSummary       = () => useQuery({ queryKey: ['summary'],        queryFn: fetchSummary })
export const useMonthlyVolume = () => useQuery({ queryKey: ['monthly'],        queryFn: fetchMonthlyVolume })
export const useRegional      = () => useQuery({ queryKey: ['regional'],       queryFn: fetchRegional })
export const useTypeBreakdown = () => useQuery({ queryKey: ['type-breakdown'], queryFn: fetchTypeBreakdown })
export const useChurnScores   = params => useQuery({ queryKey: ['churn-scores', params], queryFn: () => fetchChurnScores(params), placeholderData: prev => prev })
export const useDistribution  = () => useQuery({ queryKey: ['distribution'],   queryFn: fetchDistribution })
export const useDormancy      = () => useQuery({ queryKey: ['dormancy'],       queryFn: fetchDormancy })
export const useHighRisk      = () => useQuery({ queryKey: ['high-risk'],      queryFn: fetchHighRisk })
export const useActivityTrend = () => useQuery({ queryKey: ['activity-trend'], queryFn: fetchActivityTrend })
export const useWalletList    = params => useQuery({ queryKey: ['wallet-list', params], queryFn: () => fetchWalletList(params) })
// poll quickly while a sync is running so the UI flips to the real data as soon as it lands
export const useStatus        = () => useQuery({ queryKey: ['status'], queryFn: fetchStatus, refetchInterval: q => (q.state.data?.refreshing ? 3_000 : 60_000) })
export const useHistory       = days => useQuery({ queryKey: ['history', days], queryFn: () => fetchHistory(days) })

export const useRefresh = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: refreshData,
    // data changed server-side: drop every cached query so all views reload
    onSuccess: () => qc.invalidateQueries(),
  })
}

export const useWorkspace = () => useQuery({ queryKey: ['workspace'], queryFn: fetchWorkspace })

// connecting/disconnecting changes which dataset every view shows, so reload everything
export const useConnect = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ apiKey, walletId }) => connectBlockradar(apiKey, walletId),
    onSuccess: () => qc.invalidateQueries(),
  })
}
export const useDisconnect = () => {
  const qc = useQueryClient()
  return useMutation({ mutationFn: disconnectBlockradar, onSuccess: () => qc.invalidateQueries() })
}

// ── Team
export const useMembers = () => useQuery({ queryKey: ['members'], queryFn: fetchMembers })
export const useInvites = enabled => useQuery({ queryKey: ['invites'], queryFn: fetchInvites, enabled })

const teamMutation = fn => () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['members'] }); qc.invalidateQueries({ queryKey: ['invites'] }) },
  })
}
export const useCreateInvite = teamMutation(({ email, role, sendEmail }) => createInvite(email, role, sendEmail))
export const useRevokeInvite = teamMutation(revokeInvite)
export const useChangeRole   = teamMutation(({ id, role }) => changeRole(id, role))
export const useRemoveMember = teamMutation(removeMember)

// ── Alerts
export const useAlertEvents = () => useQuery({ queryKey: ['alert-events'], queryFn: fetchAlertEvents, refetchInterval: 60_000 })
export const useChannels = enabled => useQuery({ queryKey: ['channels'], queryFn: fetchChannels, enabled })

const channelMutation = fn => () => {
  const qc = useQueryClient()
  return useMutation({ mutationFn: fn, onSettled: () => qc.invalidateQueries({ queryKey: ['channels'] }) })
}
export const useAddChannel    = channelMutation(({ kind, target, label }) => addChannel(kind, target, label))
export const useToggleChannel = channelMutation(({ id, enabled }) => toggleChannel(id, enabled))
export const useRemoveChannel = channelMutation(removeChannel)
export const useTestChannel   = channelMutation(testChannel)
