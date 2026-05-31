import { describe, it, expect } from 'vitest';
import { parseRxText } from '@/features/rx-intake/lib/ocr-parser';

describe('OCR Prescription Parsing', () => {
  it('correctly parses standard prescription format with binocular PD', () => {
    const rawText = `
      DR. JOHN SMITH, O.D.
      SPHERE  CYLINDER  AXIS  ADD
      OD (Right) -2.50   -0.75     180   +1.50
      OS (Left)  -2.00   -1.25     170   +1.50
      PD 63
    `;

    const parsed = parseRxText(rawText);

    expect(parsed.odSphere).toBe('-2.50');
    expect(parsed.odCylinder).toBe('-0.75');
    expect(parsed.odAxis).toBe('180');
    expect(parsed.odAdd).toBe('+1.50');

    expect(parsed.osSphere).toBe('-2.00');
    expect(parsed.osCylinder).toBe('-1.25');
    expect(parsed.osAxis).toBe('170');
    expect(parsed.osAdd).toBe('+1.50');

    expect(parsed.pdType).toBe('binocular');
    expect(parsed.pd).toBe('63');
  });

  it('correctly parses tabular layout with mono (per-eye) PD', () => {
    const rawText = `
      EYE CLINIC OF SYRACUSE
      O.D. SPH: -1.75 CYL: Plano Axis: 0
      O.S. SPH: +0.50 CYL: -1.00 Axis: 95
      P.D. R: 31.5 L: 31.0
    `;

    const parsed = parseRxText(rawText);

    expect(parsed.odSphere).toBe('-1.75');
    expect(parsed.odCylinder).toBe('0.00'); // Plano mapped to 0.00
    expect(parsed.osSphere).toBe('+0.50');
    expect(parsed.osCylinder).toBe('-1.00');
    expect(parsed.osAxis).toBe('95');

    expect(parsed.pdType).toBe('mono');
    expect(parsed.pdOd).toBe('31.5');
    expect(parsed.pdOs).toBe('31.0');
    expect(parsed.pd).toBe('62.5'); // summed PD
  });

  it('handles empty or unrecognized formats gracefully', () => {
    const rawText = `Some random text that has no rx values`;
    const parsed = parseRxText(rawText);

    expect(parsed.odSphere).toBe('');
    expect(parsed.osSphere).toBe('');
    expect(parsed.pd).toBe('');
  });
});
