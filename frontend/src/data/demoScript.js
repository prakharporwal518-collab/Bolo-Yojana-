/**
 * Scripted stage demo — "Sunita from a village near Vidisha".
 * Runs fully offline (no API keys, no internet, no microphone): each line is fed
 * through the REAL pipeline (dialect normalisation → language detection → RAG →
 * eligibility engine), so the demo shows genuine behaviour, just with fixed input.
 */
export const SUNITA = {
  name: 'सुनीता',
  place: 'विदिशा के पास का गाँव',
  avatar: '👩🏽‍🌾',
};

export const DEMO_STEPS = [
  { say: 'राम राम भैया। म्हारो नाम सुनीता है। हूँ विदिशा के पास गाँव में रउं। लाड़ली बहना को पइसो म्हने मिलेगो कि नी?' },
  { say: 'महिला' },
  { say: 'हओ, मध्य प्रदेश में' },
  { say: 'चौंतीस साल' },
  { say: 'हओ, शादीशुदा हूँ' },
  { say: 'डेढ़ लाख' },
  { say: 'नी' },
  { say: 'कोनी' },
  { say: 'नी, दो एकड़ है' },
  { say: 'कोनी, बस ट्रैक्टर है' },
  { say: 'पइसो नी आयो तो कई करनो?' },
];
