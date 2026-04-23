import { describe, it, expect } from 'vitest';
import {
  validateTypedValues,
  type RxTypedValues,
} from '@/features/rx-intake/actions/auto-checks';

describe('Auto-checks', () => {
  describe('validateTypedValues', () => {
    it('returns no issues for valid values', () => {
      const values: RxTypedValues = {
        odSphere: '-2.00', odCylinder: '-0.75', odAxis: '180',
        osSphere: '-1.50', osCylinder: '-0.50', osAxis: '90',
        pd: '63', pdType: 'binocular',
      };
      const results = validateTypedValues(values);
      expect(results.every((r) => r.passed)).toBe(true);
    });

    it('warns on sphere out of range', () => {
      const values: RxTypedValues = {
        odSphere: '-25.00', odCylinder: '', odAxis: '',
        osSphere: '', osCylinder: '', osAxis: '',
        pd: '', pdType: 'binocular',
      };
      const results = validateTypedValues(values);
      const sphCheck = results.find((r) => r.field === 'odSphere');
      expect(sphCheck?.passed).toBe(false);
      expect(sphCheck?.type).toBe('warning');
    });

    it('warns on cylinder out of range', () => {
      const values: RxTypedValues = {
        odSphere: '', odCylinder: '-8.00', odAxis: '',
        osSphere: '', osCylinder: '', osAxis: '',
        pd: '', pdType: 'binocular',
      };
      const results = validateTypedValues(values);
      const cylCheck = results.find((r) => r.field === 'odCylinder');
      expect(cylCheck?.passed).toBe(false);
      expect(cylCheck?.type).toBe('warning');
    });

    it('warns on axis out of range', () => {
      const values: RxTypedValues = {
        odSphere: '', odCylinder: '', odAxis: '200',
        osSphere: '', osCylinder: '', osAxis: '',
        pd: '', pdType: 'binocular',
      };
      const results = validateTypedValues(values);
      const axisCheck = results.find((r) => r.field === 'odAxis');
      expect(axisCheck?.passed).toBe(false);
      expect(axisCheck?.type).toBe('warning');
    });

    it('warns on PD out of range', () => {
      const values: RxTypedValues = {
        odSphere: '', odCylinder: '', odAxis: '',
        osSphere: '', osCylinder: '', osAxis: '',
        pd: '40', pdType: 'binocular',
      };
      const results = validateTypedValues(values);
      const pdCheck = results.find((r) => r.field === 'pd');
      expect(pdCheck?.passed).toBe(false);
      expect(pdCheck?.type).toBe('warning');
    });

    it('skips empty fields without errors', () => {
      const values: RxTypedValues = {
        odSphere: '', odCylinder: '', odAxis: '',
        osSphere: '', osCylinder: '', osAxis: '',
        pd: '', pdType: 'binocular',
      };
      const results = validateTypedValues(values);
      expect(results).toHaveLength(0);
    });

    it('blocks on expired Rx date', () => {
      const results = validateTypedValues(
        {
          odSphere: '', odCylinder: '', odAxis: '',
          osSphere: '', osCylinder: '', osAxis: '',
          pd: '', pdType: 'binocular',
        },
        '2020-01-01',
      );
      const expCheck = results.find((r) => r.field === 'expirationDate');
      expect(expCheck?.passed).toBe(false);
      expect(expCheck?.type).toBe('error');
    });

    it('passes on future Rx date', () => {
      const future = new Date();
      future.setFullYear(future.getFullYear() + 1);
      const results = validateTypedValues(
        {
          odSphere: '-2.00', odCylinder: '', odAxis: '',
          osSphere: '', osCylinder: '', osAxis: '',
          pd: '63', pdType: 'binocular',
        },
        future.toISOString().split('T')[0],
      );
      const expCheck = results.find((r) => r.field === 'expirationDate');
      expect(expCheck?.passed).toBe(true);
    });
  });
});
