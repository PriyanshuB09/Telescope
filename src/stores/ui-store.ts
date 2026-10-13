import { create } from 'zustand'

type UiState = {
  activeRoute: string
  sidebarOpen: boolean
  selectedTeamId: string | null
  setActiveRoute: (route: string) => void
  setSidebarOpen: (open: boolean) => void
  selectTeam: (teamId: string | null) => void
}

export const useUiStore = create<UiState>((set) => ({
  activeRoute: '/',
  sidebarOpen: false,
  selectedTeamId: null,
  setActiveRoute: (activeRoute) => set({ activeRoute }),
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  selectTeam: (selectedTeamId) => set({ selectedTeamId }),
}))
