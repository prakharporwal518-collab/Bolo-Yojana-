import { lazy, Suspense, useEffect } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import Landing from './pages/Landing.jsx';
import { stopSpeaking } from './services/adapters/tts.js';

// Pages are code-split so low-end phones on 2G only download what they open.
const Assistant = lazy(() => import('./pages/Assistant.jsx'));
const Schemes = lazy(() => import('./pages/Schemes.jsx'));
const Eligibility = lazy(() => import('./pages/Eligibility.jsx'));
const FormFill = lazy(() => import('./pages/FormFill.jsx'));
const Scanner = lazy(() => import('./pages/Scanner.jsx'));
const Conversation = lazy(() => import('./pages/Conversation.jsx'));
const Impact = lazy(() => import('./pages/Impact.jsx'));
const WhatsApp = lazy(() => import('./pages/WhatsApp.jsx'));

function Loading() {
  return (
    <div className="grid min-h-[40vh] place-items-center text-center" role="status">
      <div>
        <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-saffron-200 border-t-saffron-500" />
        <p className="mt-3 font-semibold">लोड हो रहा है… · Loading…</p>
      </div>
    </div>
  );
}

export default function App() {
  const { pathname } = useLocation();
  // Stop any speech and scroll to top on page change.
  useEffect(() => { stopSpeaking(); window.scrollTo(0, 0); }, [pathname]);

  return (
    <Layout>
      <ErrorBoundary key={pathname}>
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/assistant" element={<Assistant />} />
            <Route path="/schemes" element={<Schemes />} />
            <Route path="/eligibility" element={<Eligibility />} />
            <Route path="/eligibility/:schemeId" element={<Eligibility />} />
            <Route path="/apply/:schemeId" element={<FormFill />} />
            <Route path="/scanner" element={<Scanner />} />
            <Route path="/conversation" element={<Conversation />} />
            <Route path="/impact" element={<Impact />} />
            <Route path="/whatsapp" element={<WhatsApp />} />
            <Route path="*" element={<Landing />} />
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </Layout>
  );
}
