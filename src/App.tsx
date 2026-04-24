import React, { useState, useEffect, Suspense } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from './firebase';
import { UserProfile } from './types';

// Lazy-load all pages so their heavy dependencies are never downloaded until needed.
// Renderer is lazy so its bundle (framer-motion, canvas-confetti, DOMPurify, etc.)
// is only fetched when a visitor actually lands on a public funnel route.
const Renderer = React.lazy(() => import('./pages/Renderer').then(m => ({ default: m.Renderer })));
const Dashboard = React.lazy(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })));
const Builder = React.lazy(() => import('./pages/Builder').then(m => ({ default: m.Builder })));
const Login = React.lazy(() => import('./pages/Login').then(m => ({ default: m.Login })));

function PageSpinner() {
  return (
    <div className="flex h-screen items-center justify-center bg-slate-50">
      <div className="h-12 w-12 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
    </div>
  );
}

export default function App() {
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  // For public funnel routes we bypass auth entirely, so start in a non-loading state.
  const [loading, setLoading] = useState(() => !window.location.hash.startsWith('#/f/'));
  // Read the initial hash synchronously so public routes render without any delay.
  const [view, setView] = useState<{ type: 'dashboard' | 'builder' | 'renderer'; id?: string }>(() => {
    const hash = window.location.hash;
    if (hash.startsWith('#/f/')) return { type: 'renderer', id: hash.replace('#/f/', '') };
    return { type: 'dashboard' };
  });

  useEffect(() => {
    // Public funnel routes don't require authentication — skip the auth round-trip
    // so the quiz renders immediately without waiting for Firebase Auth to respond.
    if (window.location.hash.startsWith('#/f/')) return;

    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      if (u) {
        // Fetch user profile from Firestore
        const userRef = doc(db, 'users', u.uid);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          setUserProfile({ ...userSnap.data() } as UserProfile);
        } else {
          // Profile might still be creating in Login.tsx
          setUserProfile(null);
        }
      } else {
        setUserProfile(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  // Simple routing based on URL hash for public funnels
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash;
      if (hash.startsWith('#/f/')) {
        const slug = hash.replace('#/f/', '');
        setView({ type: 'renderer', id: slug });
      } else if (hash === '#/dashboard') {
        setView({ type: 'dashboard' });
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    handleHashChange();
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  if (loading) {
    return <PageSpinner />;
  }

  // Public funnel route: render Renderer immediately, bypassing auth entirely.
  if (view.type === 'renderer') {
    return (
      <Suspense fallback={<PageSpinner />}>
        <Renderer slug={view.id!} />
      </Suspense>
    );
  }

  if (!userProfile) {
    return (
      <Suspense fallback={<PageSpinner />}>
        <Login />
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<PageSpinner />}>
      <div className="min-h-screen bg-slate-50">
        {view.type === 'dashboard' ? (
          <Dashboard onEdit={(id) => setView({ type: 'builder', id })} />
        ) : (
          <Builder funnelId={view.id!} onBack={() => setView({ type: 'dashboard' })} />
        )}
      </div>
    </Suspense>
  );
}
