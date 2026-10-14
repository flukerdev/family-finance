// Flip palette: near-black dark mode, powder blue accent, greens for good news.
export const themes = {
  dark: {
    bg: '#0F1115',            // near-black
    cardBg: '#171A20',
    cardBgElevated: '#1F242C',
    border: '#2A3038',
    text: '#E8ECF1',
    textMuted: '#A3ADBA',
    textDimmed: '#6B7684',
    accent: '#8FB8DE',        // powder blue
    onAccent: '#0F1115',
    success: '#5FB58A',
    danger: '#E07A7A',
    warning: '#D9A75B',
    // Buckets
    // Buckets: five hues that read apart at a glance
    give: '#B4A7E5', save: '#6CC29A', live: '#8FB8DE',
    mat: '#3FB8AF', mara: '#E8A0B4',
    // Cards
    cardGold: '#E0B55A', cardBlue: '#4C8DF5', cardPink: '#F06DA8',
    dangerBg: 'rgba(224, 122, 122, 0.14)',
    successBg: 'rgba(95, 181, 138, 0.14)',
    accentBg: 'rgba(143, 184, 222, 0.14)',
    dangerLight: '#F0A3A3',
    successLight: '#9ADBB8',
  },
  light: {
    bg: '#F6F8FB',
    cardBg: '#FFFFFF',
    cardBgElevated: '#EEF2F7',
    border: '#DCE3EC',
    text: '#121820',
    textMuted: '#5B6673',
    textDimmed: '#98A3B1',
    accent: '#3F84CC',        // powder blue, deepened for contrast on white
    onAccent: '#FFFFFF',
    success: '#2E9E6B',
    danger: '#D2544F',
    warning: '#C58A1F',
    give: '#7C6BC9', save: '#2E9E6B', live: '#3F84CC',
    mat: '#15938A', mara: '#C4607F',
    cardGold: '#B8860B', cardBlue: '#2A6BD6', cardPink: '#D1458A',
    dangerBg: 'rgba(210, 84, 79, 0.10)',
    successBg: 'rgba(46, 158, 107, 0.10)',
    accentBg: 'rgba(63, 132, 204, 0.10)',
    dangerLight: '#B4443F',
    successLight: '#237D55',
  }
};

export const DEFAULT_FONTS = { body: 'Inter', heading: 'Inter', baseSize: 16, headingWeight: '700' };

// Color for a card by its id or label: gold, blue, pink, then a fallback.
export function cardColor(theme, card) {
  const key = `${card?.card_id || ''} ${card?.label || ''}`.toLowerCase();
  if (/gold|delta/.test(key)) return theme.cardGold;
  if (/blue/.test(key)) return theme.cardBlue;
  if (/discover|pink|mara/.test(key)) return theme.cardPink;
  return theme.accent;
}
