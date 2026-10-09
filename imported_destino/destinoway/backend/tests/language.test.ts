import { describe, it, expect } from 'vitest';
import { resolveLanguage } from '../src/orchestrator/languageResolver';

const L = (t: string) => resolveLanguage(t).language;
describe('languageResolver (9 supported languages + Hinglish)', () => {
  it.each([
    ['I want a hotel in Jaipur', 'en'],
    ['Find me the cheapest flight to Dubai', 'en'],
    ['Mujhe Jaipur mein hotel chahiye', 'hinglish'],
    ['Jaipur se Dubai ki sasti flight dikhao', 'hinglish'],
    ['kal ki flight dikhao', 'hinglish'],
    ['मुझे जयपुर में होटल चाहिए', 'hi'],
    ['मला जयपूरला जायचे आहे', 'mr'],
    ['எனக்கு ஜெய்ப்பூரில் ஹோட்டல் வேண்டும்', 'ta'],
    ['నాకు జైపూర్‌లో హోటల్ కావాలి', 'te'],
    ['আমার জয়পুরে হোটেল দরকার', 'bn'],
    ['મને જયપુરમાં હોટેલ જોઈએ છે', 'gu'],
    ['ನನಗೆ ಜೈಪುರದಲ್ಲಿ ಹೋಟೆಲ್ ಬೇಕು', 'kn'],
    ['എനിക്ക് ജയ്പൂരിൽ ഹോട്ടൽ വേണം', 'ml'],
  ])('%s → %s', (t, lang) => expect(L(t)).toBe(lang));
  it('handles empty/emoji-only/unsupported scripts safely', () => {
    expect(L('')).toBe('en'); expect(L('✈️🌴')).toBe('en'); expect(L('我想去迪拜')).toBe('other');
  });
});
