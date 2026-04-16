import { describe, it, expect } from 'vitest';
import { isAdminRole, isLabRole, type UserRole } from '@/lib/auth/middleware';

describe('Auth role helpers', () => {
  describe('isAdminRole', () => {
    it('returns true for founder', () => {
      expect(isAdminRole('founder')).toBe(true);
    });

    it('returns true for reviewer', () => {
      expect(isAdminRole('reviewer')).toBe(true);
    });

    it('returns false for lab roles', () => {
      const labRoles: UserRole[] = ['lab_admin', 'lab_operator', 'lab_qc', 'lab_shipping'];
      for (const role of labRoles) {
        expect(isAdminRole(role)).toBe(false);
      }
    });
  });

  describe('isLabRole', () => {
    it('returns true for founder (founder has access to everything)', () => {
      expect(isLabRole('founder')).toBe(true);
    });

    it('returns true for all lab roles', () => {
      const labRoles: UserRole[] = ['lab_admin', 'lab_operator', 'lab_qc', 'lab_shipping'];
      for (const role of labRoles) {
        expect(isLabRole(role)).toBe(true);
      }
    });

    it('returns false for reviewer (reviewer is admin-only)', () => {
      expect(isLabRole('reviewer')).toBe(false);
    });
  });
});
