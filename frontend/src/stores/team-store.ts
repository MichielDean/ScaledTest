import { create } from 'zustand';

interface Team {
  id: string;
  name: string;
}

interface TeamState {
  currentTeam: Team | null;
  teams: Team[];
  setCurrentTeam: (team: Team) => void;
  setTeams: (teams: Team[]) => void;
}

export const useTeamStore = create<TeamState>(set => ({
  currentTeam: null,
  teams: [],
  setCurrentTeam: team => set({ currentTeam: team }),
  setTeams: teams => set({ teams }),
}));
