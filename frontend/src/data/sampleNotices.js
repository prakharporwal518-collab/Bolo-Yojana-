/**
 * Two sample notices for the stage demo (images in /public/samples).
 * `groundTruth` is the exact printed text: used only as a fallback when OCR cannot run
 * (offline before the OCR engine was cached, or Demo Mode) — clearly labelled in the UI.
 */
export const SAMPLE_NOTICES = [
  {
    id: 'pmkisan-ekyc',
    src: '/samples/notice-pmkisan-ekyc.png',
    title: { hi: 'पीएम-किसान e-KYC सूचना (तहसील)', en: 'PM-Kisan e-KYC notice (Tehsil, Hindi)' },
    lang: 'hi',
    groundTruth:
      'कार्यालय तहसीलदार\nतहसील विदिशा, जिला विदिशा (म.प्र.)\nक्रमांक: 2026/किसान/418 दिनांक: 05/10/2026\nसूचना\nप्रधानमंत्री किसान सम्मान निधि योजना के अंतर्गत समस्त पंजीकृत कृषकों को सूचित किया जाता है कि आगामी किस्त प्राप्त करने हेतु ई-केवाईसी एवं भूमि सीडिंग अनिवार्य है।\nजिन लाभार्थियों का ई-केवाईसी लंबित है, वे दिनांक 31/10/2026 तक निकटतम CSC अथवा ग्राम पंचायत कार्यालय में उपस्थित होकर आधार द्वारा सत्यापन सुनिश्चित करें।\nनिर्धारित तिथि के पश्चात ई-केवाईसी न कराने की स्थिति में किस्त का भुगतान रोका जा सकता है। हेल्पलाइन: 155261\nतहसीलदार, तहसील विदिशा',
  },
  {
    id: 'ayushman-camp',
    src: '/samples/notice-ayushman-camp.png',
    title: { hi: 'आयुष्मान कार्ड कैंप सूचना (अंग्रेज़ी)', en: 'Ayushman card camp notice (Panchayat, English)' },
    lang: 'en',
    groundTruth:
      'GRAM PANCHAYAT KHAJURI\nJanpad Panchayat Vidisha (M.P.)\nNo. GP/KH/2026/77 Date: 08/10/2026\nNOTICE\nAll eligible beneficiaries are hereby informed that a special camp for Ayushman card e-KYC shall be organised at the Panchayat Bhawan on 15/10/2026 from 10:00 AM to 4:00 PM.\nBeneficiaries are required to furnish Aadhaar card, Samagra ID and ration card. Senior citizens aged 70 years and above shall also be enrolled for the Ayushman Vay Vandana card irrespective of income.\nHelpline: 14555\nSarpanch / Secretary, Gram Panchayat Khajuri',
  },
];
