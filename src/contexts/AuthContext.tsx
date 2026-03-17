import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

interface SubscriptionInfo {
  subscribed: boolean;
  subscription_end: string | null;
  product_id: string | null;
  queries_remaining: number | string;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isPremium: boolean;
  subscriptionInfo: SubscriptionInfo | null;
  signUp: (email: string, password: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  checkSubscription: () => Promise<void>;
}

const defaultSubscriptionInfo: SubscriptionInfo = {
  subscribed: false,
  subscription_end: null,
  product_id: null,
  queries_remaining: 50,
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [subscriptionInfo, setSubscriptionInfo] = useState<SubscriptionInfo | null>(null);

  const checkSubscription = useCallback(async () => {
    if (!session?.access_token) {
      setSubscriptionInfo(defaultSubscriptionInfo);
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke('check-subscription', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error) {
        console.error('Error checking subscription:', error);
        setSubscriptionInfo(defaultSubscriptionInfo);
        return;
      }

      setSubscriptionInfo({
        subscribed: data?.subscribed || false,
        subscription_end: data?.subscription_end || null,
        product_id: data?.product_id || null,
        queries_remaining: data?.queries_remaining ?? 50,
      });
    } catch (err) {
      console.error('Error checking subscription:', err);
      setSubscriptionInfo(defaultSubscriptionInfo);
    }
  }, [session?.access_token]);

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, newSession) => {
        setSession(newSession);
        setUser(newSession?.user ?? null);
        setLoading(false);

        // Check subscription on auth change
        if (newSession?.user) {
          setTimeout(() => {
            checkSubscription();
          }, 0);
        } else {
          setSubscriptionInfo(defaultSubscriptionInfo);
        }
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session: existingSession } }) => {
      setSession(existingSession);
      setUser(existingSession?.user ?? null);
      setLoading(false);
      
      if (existingSession?.user) {
        checkSubscription();
      }
    });

    return () => subscription.unsubscribe();
  }, [checkSubscription]);

  // Periodic subscription check
  useEffect(() => {
    if (!user) return;

    const interval = setInterval(() => {
      checkSubscription();
    }, 60000); // Check every 60 seconds

    return () => clearInterval(interval);
  }, [user, checkSubscription]);

  // Handle checkout success/cancelled from URL
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const checkoutStatus = params.get('checkout');

    if (checkoutStatus === 'success') {
      // Refresh subscription status
      checkSubscription();
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname);
    } else if (checkoutStatus === 'cancelled') {
      // Clean URL
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [checkSubscription]);

  const signUp = async (email: string, password: string) => {
    const redirectUrl = `${window.location.origin}/`;
    
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
      },
    });
    
    return { error: error ? new Error(error.message) : null };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    
    return { error: error ? new Error(error.message) : null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setSession(null);
    setSubscriptionInfo(defaultSubscriptionInfo);
  };

  // TEMP: All logged-in users are premium (payment will be re-enabled later)
  const isPremium = !!user;

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        isPremium,
        subscriptionInfo,
        signUp,
        signIn,
        signOut,
        checkSubscription,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
