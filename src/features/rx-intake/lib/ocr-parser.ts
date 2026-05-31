import type { RxTypedValues } from '../actions/auto-checks';

export function parseRxText(text: string): RxTypedValues {
  const result: RxTypedValues = {
    odSphere: '', odCylinder: '', odAxis: '', odAdd: '',
    osSphere: '', osCylinder: '', osAxis: '', osAdd: '',
    pd: '', pdType: 'binocular', pdOd: '', pdOs: '',
  };

  const lines = text.split('\n').map(l => l.trim().toLowerCase());

  // Helper to extract numbers from a line
  const extractNumbers = (line: string): string[] => {
    const cleaned = line
      .replace(/\b(sph(?:ere)?|cyl(?:inder)?|ax(?:is)?|add(?:ition)?|od|o\.d\.|os|o\.s\.|pd|p\.d\.|eye|right|left)\s*:/g, '')
      .replace(/\b(sph(?:ere)?|cyl(?:inder)?|ax(?:is)?|add(?:ition)?|od|o\.d\.|os|o\.s\.|pd|p\.d\.|eye|right|left)\b/g, '');

    const matches = cleaned.match(/([+-]\d+\.\d+|plano|pl\b|ds\b|sph\b|\b\d{1,3}\b)/g) || [];
    return matches.map(m => {
      if (m === 'plano' || m === 'pl' || m === 'ds' || m === 'sph') return '0.00';
      return m;
    });
  };

  // Find PD (e.g. PD 63, PD: 64, PD = 62.5, PD 31.5/31.0, P.D. R: 31.5 L: 31.0)
  for (const line of lines) {
    if (line.includes('pd') || line.includes('p.d.') || line.includes('pupillary')) {
      // First check for mono PD like: R: 31.5 L: 31.0 or OD: 32 OS: 31
      const monoMatch = line.match(/(?:pd|p\.d\.|pupillary\s+distance).*?(?:r|od|right)\s*[:.-]?\s*(\d{2}(?:\.\d+)?).*?(?:l|os|left)\s*[:.-]?\s*(\d{2}(?:\.\d+)?)/i);
      if (monoMatch) {
        result.pdType = 'mono';
        result.pdOd = monoMatch[1];
        result.pdOs = monoMatch[2];
        result.pd = (parseFloat(monoMatch[1]) + parseFloat(monoMatch[2])).toString();
        break;
      }

      // Check for mono separated by slash: 31.5/32.0
      const slashMatch = line.match(/(?:pd|p\.d\.|pupillary\s+distance)\s*(?::|=)?\s*(\d{2}(?:\.\d+)?)\s*\/\s*(\d{2}(?:\.\d+)?)/i);
      if (slashMatch) {
        result.pdType = 'mono';
        result.pdOd = slashMatch[1];
        result.pdOs = slashMatch[2];
        result.pd = (parseFloat(slashMatch[1]) + parseFloat(slashMatch[2])).toString();
        break;
      }

      // Check for standard binocular PD
      const binocularMatch = line.match(/(?:pd|p\.d\.|pupillary\s+distance)\s*(?::|=)?\s*(\d{2}(?:\.\d+)?)/i);
      if (binocularMatch) {
        result.pdType = 'binocular';
        result.pd = binocularMatch[1];
        break;
      }
    }
  }

  // Parse OD and OS lines
  let odLineIndex = -1;
  let osLineIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Standalone matching for OD (allowing dots and brackets)
    const hasOd = /(?:^|[\s(])(od|o\.d\.|right)(?:[\s:.)-]|$)/.test(line);
    if (hasOd && odLineIndex === -1) {
      const currentNums = extractNumbers(line);
      const nextNums = extractNumbers(lines[i + 1] || '');
      const hasActualNums = currentNums.some(n => n !== '0.00') || nextNums.some(n => n !== '0.00');
      if (hasActualNums) {
        odLineIndex = i;
      }
    }

    // Standalone matching for OS
    const hasOs = /(?:^|[\s(])(os|o\.s\.|left)(?:[\s:.)-]|$)/.test(line);
    if (hasOs && osLineIndex === -1) {
      const currentNums = extractNumbers(line);
      const nextNums = extractNumbers(lines[i + 1] || '');
      const hasActualNums = currentNums.some(n => n !== '0.00') || nextNums.some(n => n !== '0.00');
      if (hasActualNums) {
        osLineIndex = i;
      }
    }
  }

  if (odLineIndex !== -1) {
    const nums = extractNumbers(lines[odLineIndex]);
    if (nums.length >= 1) {
      result.odSphere = formatPower(nums[0]);
      if (nums.length >= 2) result.odCylinder = formatPower(nums[1]);
      if (nums.length >= 3) result.odAxis = nums[2];
      if (nums.length >= 4) result.odAdd = formatPower(nums[3]);
    } else {
      const nextNums = extractNumbers(lines[odLineIndex + 1] || '');
      if (nextNums.length >= 1) {
        result.odSphere = formatPower(nextNums[0]);
        if (nextNums.length >= 2) result.odCylinder = formatPower(nextNums[1]);
        if (nextNums.length >= 3) result.odAxis = nextNums[2];
        if (nextNums.length >= 4) result.odAdd = formatPower(nextNums[3]);
      }
    }
  }

  if (osLineIndex !== -1) {
    const nums = extractNumbers(lines[osLineIndex]);
    if (nums.length >= 1) {
      result.osSphere = formatPower(nums[0]);
      if (nums.length >= 2) result.osCylinder = formatPower(nums[1]);
      if (nums.length >= 3) result.osAxis = nums[2];
      if (nums.length >= 4) result.osAdd = formatPower(nums[3]);
    } else {
      const nextNums = extractNumbers(lines[osLineIndex + 1] || '');
      if (nextNums.length >= 1) {
        result.osSphere = formatPower(nextNums[0]);
        if (nextNums.length >= 2) result.osCylinder = formatPower(nextNums[1]);
        if (nextNums.length >= 3) result.osAxis = nextNums[2];
        if (nextNums.length >= 4) result.osAdd = formatPower(nextNums[3]);
      }
    }
  }

  return result;
}

function formatPower(val: string): string {
  if (!val) return '';
  if (val === '0.00' || val === '0') return '0.00';
  const num = parseFloat(val);
  if (isNaN(num)) return '';
  const formatted = num.toFixed(2);
  return num > 0 ? `+${formatted}` : formatted;
}
