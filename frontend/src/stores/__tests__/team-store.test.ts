import { useTeamStore } from '../team-store';

describe('useTeamStore', () => {
  beforeEach(() => {
    useTeamStore.setState({ currentTeam: null, teams: [] });
  });

  it('starts with null currentTeam and empty teams', () => {
    const state = useTeamStore.getState();
    expect(state.currentTeam).toBeNull();
    expect(state.teams).toEqual([]);
  });

  describe('setCurrentTeam', () => {
    it('sets the current team', () => {
      useTeamStore.getState().setCurrentTeam({ id: 't-1', name: 'Alpha' });
      expect(useTeamStore.getState().currentTeam).toEqual({ id: 't-1', name: 'Alpha' });
    });

    it('replaces the current team', () => {
      useTeamStore.getState().setCurrentTeam({ id: 't-1', name: 'Alpha' });
      useTeamStore.getState().setCurrentTeam({ id: 't-2', name: 'Beta' });
      expect(useTeamStore.getState().currentTeam?.id).toBe('t-2');
    });
  });

  describe('setTeams', () => {
    it('sets the teams list', () => {
      const teams = [
        { id: 't-1', name: 'Alpha' },
        { id: 't-2', name: 'Beta' },
      ];
      useTeamStore.getState().setTeams(teams);
      expect(useTeamStore.getState().teams).toEqual(teams);
      expect(useTeamStore.getState().teams).toHaveLength(2);
    });

    it('replaces existing teams', () => {
      useTeamStore.getState().setTeams([{ id: 't-1', name: 'Old' }]);
      useTeamStore.getState().setTeams([{ id: 't-2', name: 'New' }]);
      expect(useTeamStore.getState().teams).toHaveLength(1);
      expect(useTeamStore.getState().teams[0].name).toBe('New');
    });

    it('can set empty teams list', () => {
      useTeamStore.getState().setTeams([{ id: 't-1', name: 'Alpha' }]);
      useTeamStore.getState().setTeams([]);
      expect(useTeamStore.getState().teams).toEqual([]);
    });
  });

  it('setCurrentTeam does not affect teams list', () => {
    const teams = [
      { id: 't-1', name: 'Alpha' },
      { id: 't-2', name: 'Beta' },
    ];
    useTeamStore.getState().setTeams(teams);
    useTeamStore.getState().setCurrentTeam({ id: 't-1', name: 'Alpha' });

    expect(useTeamStore.getState().teams).toHaveLength(2);
    expect(useTeamStore.getState().currentTeam?.id).toBe('t-1');
  });
});
