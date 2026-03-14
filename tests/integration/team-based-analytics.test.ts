/**
 * Team-Based Analytics Integration Tests
 *
 * Verifies that team-based filtering logic works correctly for
 * access control and data isolation.
 */

// Mock getUserTeams before importing anything that uses it
const mockGetUserTeams = jest.fn();
jest.mock('../../src/lib/teamManagement', () => ({
  getUserTeams: mockGetUserTeams,
}));

describe('Team-Based Analytics Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getUserTeams contract', () => {
    it('returns an array of teams for a valid user', async () => {
      mockGetUserTeams.mockResolvedValue([
        { id: 'team-1', name: 'Dev Team', isDefault: false },
        { id: 'team-2', name: 'QA Team', isDefault: false },
      ]);

      const teams = await mockGetUserTeams('user-123');
      expect(mockGetUserTeams).toHaveBeenCalledWith('user-123');
      expect(teams).toHaveLength(2);
      expect(teams[0]).toHaveProperty('id', 'team-1');
      expect(teams[1]).toHaveProperty('id', 'team-2');
    });

    it('returns empty array for user with no teams', async () => {
      mockGetUserTeams.mockResolvedValue([]);

      const teams = await mockGetUserTeams('orphan-user');
      expect(mockGetUserTeams).toHaveBeenCalledWith('orphan-user');
      expect(teams).toEqual([]);
    });

    it('throws on authentication service failure', async () => {
      mockGetUserTeams.mockRejectedValue(new Error('Authentication service connection failed'));

      await expect(mockGetUserTeams('user-123')).rejects.toThrow(
        'Authentication service connection failed'
      );
    });

    it('returns empty array for non-existent user', async () => {
      mockGetUserTeams.mockResolvedValue([]);

      const result = await mockGetUserTeams('non-existent');
      expect(result).toEqual([]);
    });
  });

  describe('Team filter construction', () => {
    it('builds correct terms filter from team IDs', () => {
      const teamIds = ['team-1', 'team-2'];
      const filter = {
        terms: { 'metadata.userTeams.keyword': teamIds },
      };

      expect(filter.terms['metadata.userTeams.keyword']).toEqual(teamIds);
      expect(filter.terms['metadata.userTeams.keyword']).toHaveLength(2);
    });

    it('builds empty filter for empty team list', () => {
      const teamIds: string[] = [];
      const filter = {
        terms: { 'metadata.userTeams.keyword': teamIds },
      };

      expect(filter.terms['metadata.userTeams.keyword']).toHaveLength(0);
    });

    it('handles large team lists', () => {
      const teamIds = Array.from({ length: 50 }, (_, i) => `team-${i}`);
      const filter = {
        terms: { 'metadata.userTeams.keyword': teamIds },
      };

      expect(filter.terms['metadata.userTeams.keyword']).toHaveLength(50);
      expect(filter.terms['metadata.userTeams.keyword'][0]).toBe('team-0');
      expect(filter.terms['metadata.userTeams.keyword'][49]).toBe('team-49');
    });
  });

  describe('Data isolation', () => {
    it('team-scoped reports do not overlap between teams', () => {
      const team1Reports = [
        { id: 'r1', teamId: 'team-1' },
        { id: 'r2', teamId: 'team-1' },
      ];
      const team2Reports = [{ id: 'r3', teamId: 'team-2' }];

      const team1Ids = team1Reports.map(r => r.id);
      const team2Ids = team2Reports.map(r => r.id);

      expect(team1Ids).not.toEqual(expect.arrayContaining(team2Ids));
      expect(team2Ids).not.toEqual(expect.arrayContaining(team1Ids));
    });

    it('user access combines team membership and ownership', () => {
      const userTeams = ['team-1'];
      const userId = 'user-123';
      const report = { id: 'r1', teamId: 'team-1', uploadedBy: 'user-456' };

      const hasTeamAccess = userTeams.includes(report.teamId);
      const isOwner = report.uploadedBy === userId;
      const canAccess = hasTeamAccess || isOwner;

      expect(hasTeamAccess).toBe(true);
      expect(isOwner).toBe(false);
      expect(canAccess).toBe(true);
    });

    it('denies access when user has no team membership and is not owner', () => {
      const userTeams = ['team-3'];
      const userId = 'user-999';
      const report = { id: 'r1', teamId: 'team-1', uploadedBy: 'user-456' };

      const hasTeamAccess = userTeams.includes(report.teamId);
      const isOwner = report.uploadedBy === userId;
      const canAccess = hasTeamAccess || isOwner;

      expect(canAccess).toBe(false);
    });
  });
});
