/**
 * Tests for consolidated roles module (src/lib/roles.ts)
 * Written BEFORE implementation per TDD requirement.
 */

// These imports will fail until src/lib/roles.ts is created
import {
  UserRole,
  Roles,
  ALL_ROLES,
  ROLE_HIERARCHY,
  hasRoleLevel,
  getRoleDisplayName,
  Permissions,
  rolePermissions,
  hasPermission,
  hasRole,
} from '../../src/lib/roles';

describe('roles consolidation — src/lib/roles', () => {
  describe('hasRoleLevel hierarchy', () => {
    it('owner >= owner', () => {
      expect(hasRoleLevel(UserRole.OWNER, UserRole.OWNER)).toBe(true);
    });

    it('owner >= maintainer', () => {
      expect(hasRoleLevel(UserRole.OWNER, UserRole.MAINTAINER)).toBe(true);
    });

    it('owner >= readonly', () => {
      expect(hasRoleLevel(UserRole.OWNER, UserRole.READONLY)).toBe(true);
    });

    it('maintainer >= readonly', () => {
      expect(hasRoleLevel(UserRole.MAINTAINER, UserRole.READONLY)).toBe(true);
    });

    it('maintainer >= maintainer', () => {
      expect(hasRoleLevel(UserRole.MAINTAINER, UserRole.MAINTAINER)).toBe(true);
    });

    it('maintainer NOT >= owner', () => {
      expect(hasRoleLevel(UserRole.MAINTAINER, UserRole.OWNER)).toBe(false);
    });

    it('readonly NOT >= maintainer', () => {
      expect(hasRoleLevel(UserRole.READONLY, UserRole.MAINTAINER)).toBe(false);
    });

    it('readonly NOT >= owner', () => {
      expect(hasRoleLevel(UserRole.READONLY, UserRole.OWNER)).toBe(false);
    });
  });

  describe('hasPermission', () => {
    it('readonly only has READ_CONTENT', () => {
      const user = { clientMetadata: { role: 'readonly' as const } };
      expect(hasPermission(user, Permissions.READ_CONTENT)).toBe(true);
      expect(hasPermission(user, Permissions.WRITE_CONTENT)).toBe(false);
      expect(hasPermission(user, Permissions.MANAGE_USERS)).toBe(false);
      expect(hasPermission(user, Permissions.ADMIN_ACCESS)).toBe(false);
    });

    it('maintainer has READ_CONTENT + WRITE_CONTENT', () => {
      const user = { clientMetadata: { role: 'maintainer' as const } };
      expect(hasPermission(user, Permissions.READ_CONTENT)).toBe(true);
      expect(hasPermission(user, Permissions.WRITE_CONTENT)).toBe(true);
      expect(hasPermission(user, Permissions.MANAGE_USERS)).toBe(false);
      expect(hasPermission(user, Permissions.ADMIN_ACCESS)).toBe(false);
    });

    it('owner has all permissions', () => {
      const user = { clientMetadata: { role: 'owner' as const } };
      expect(hasPermission(user, Permissions.READ_CONTENT)).toBe(true);
      expect(hasPermission(user, Permissions.WRITE_CONTENT)).toBe(true);
      expect(hasPermission(user, Permissions.MANAGE_USERS)).toBe(true);
      expect(hasPermission(user, Permissions.ADMIN_ACCESS)).toBe(true);
    });

    it('returns false for unknown role', () => {
      const user = { clientMetadata: { role: 'superadmin' as unknown as 'owner' } };
      expect(hasPermission(user, Permissions.READ_CONTENT)).toBe(false);
    });

    it('returns false for user with no role', () => {
      const user = {};
      expect(hasPermission(user, Permissions.READ_CONTENT)).toBe(false);
    });
  });

  describe('hasRole (hierarchical)', () => {
    it('owner passes readonly check', () => {
      const user = { role: 'owner' as const };
      expect(hasRole(user, 'readonly')).toBe(true);
    });

    it('owner passes maintainer check', () => {
      const user = { role: 'owner' as const };
      expect(hasRole(user, 'maintainer')).toBe(true);
    });

    it('owner passes owner check', () => {
      const user = { role: 'owner' as const };
      expect(hasRole(user, 'owner')).toBe(true);
    });

    it('maintainer passes readonly check', () => {
      const user = { role: 'maintainer' as const };
      expect(hasRole(user, 'readonly')).toBe(true);
    });

    it('maintainer does NOT pass owner check', () => {
      const user = { role: 'maintainer' as const };
      expect(hasRole(user, 'owner')).toBe(false);
    });

    it('readonly does NOT pass maintainer check', () => {
      const user = { role: 'readonly' as const };
      expect(hasRole(user, 'maintainer')).toBe(false);
    });
  });

  describe('getRoleDisplayName', () => {
    it('returns "Read Only" for readonly', () => {
      expect(getRoleDisplayName(UserRole.READONLY)).toBe('Read Only');
    });

    it('returns "Maintainer" for maintainer', () => {
      expect(getRoleDisplayName(UserRole.MAINTAINER)).toBe('Maintainer');
    });

    it('returns "Owner" for owner', () => {
      expect(getRoleDisplayName(UserRole.OWNER)).toBe('Owner');
    });
  });

  describe('ALL_ROLES', () => {
    it('contains exactly 3 roles', () => {
      expect(ALL_ROLES).toHaveLength(3);
    });

    it('contains readonly, maintainer, owner', () => {
      expect(ALL_ROLES).toContain('readonly');
      expect(ALL_ROLES).toContain('maintainer');
      expect(ALL_ROLES).toContain('owner');
    });
  });

  describe('re-exports from old locations', () => {
    it('Roles matches UserRole values', () => {
      expect(Roles.READONLY).toBe(UserRole.READONLY);
      expect(Roles.MAINTAINER).toBe(UserRole.MAINTAINER);
      expect(Roles.OWNER).toBe(UserRole.OWNER);
    });

    it('rolePermissions is defined and keyed by role', () => {
      expect(rolePermissions).toBeDefined();
      expect(rolePermissions['readonly']).toContain(Permissions.READ_CONTENT);
    });

    it('ROLE_HIERARCHY owner > maintainer > readonly', () => {
      expect(ROLE_HIERARCHY[UserRole.OWNER]).toBeGreaterThan(ROLE_HIERARCHY[UserRole.MAINTAINER]);
      expect(ROLE_HIERARCHY[UserRole.MAINTAINER]).toBeGreaterThan(
        ROLE_HIERARCHY[UserRole.READONLY]
      );
    });
  });
});
