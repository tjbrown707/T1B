import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  // Bootstrap the session and subscribe to auth changes.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Load the customer's profile row whenever the logged-in user changes.
  const userId = session?.user?.id ?? null;
  useEffect(() => {
    // Sync the profile to the current auth user (an external system).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!userId) { setProfile(null); return; }
    let active = true;
    supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single()
      .then(({ data }) => { if (active) setProfile(data); });
    return () => { active = false; };
  }, [userId]);

  async function refreshProfile() {
    if (!userId) return null;
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();
    setProfile(data);
    return data;
  }

  const value = {
    session,
    user: session?.user ?? null,
    profile,
    loading,
    isLoggedIn: !!session?.user,
    signUp: (email, password, meta) =>
      supabase.auth.signUp({ email, password, options: { data: meta } }),
    signIn: (email, password) =>
      supabase.auth.signInWithPassword({ email, password }),
    signOut: () => supabase.auth.signOut(),
    resetPassword: (email) =>
      supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/account`,
      }),
    refreshProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
