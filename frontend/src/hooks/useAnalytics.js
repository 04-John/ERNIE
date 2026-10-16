import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  fetchSummary, fetchMonthlyVolume, fetchRegional, fetchTypeBreakdown,
  fetchChurnScores, fetchDistribution, fetchDormancy, fetchHighRisk,
  fetchActivityTrend, fetchWalletList, fetchStatus, refreshData,
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
export const useStatus        = () => useQuery({ queryKey: ['status'], queryFn: fetchStatus, refetchInterval: 60_000 })

export const useRefresh = () => {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: refreshData,
    // data changed server-side: drop every cached query so all views reload
    onSuccess: () => qc.invalidateQueries(),
  })
}
