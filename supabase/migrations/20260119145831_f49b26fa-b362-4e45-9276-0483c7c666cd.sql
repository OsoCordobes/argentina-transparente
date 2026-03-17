-- Premium & Auth Tables

-- Profiles linked to auth.users
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
    email TEXT,
    full_name TEXT,
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_profiles_user ON public.profiles(user_id);

-- Stripe Customers mapping
CREATE TABLE public.stripe_customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
    stripe_customer_id TEXT NOT NULL UNIQUE,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_stripe_customers_user ON public.stripe_customers(user_id);
CREATE INDEX idx_stripe_customers_stripe ON public.stripe_customers(stripe_customer_id);

-- User Entitlements (premium status, query limits)
CREATE TABLE public.user_entitlements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
    is_premium BOOLEAN DEFAULT false,
    queries_today INTEGER DEFAULT 0,
    queries_limit INTEGER DEFAULT 50,
    last_query_date DATE DEFAULT CURRENT_DATE,
    subscription_id TEXT,
    subscription_status TEXT,
    subscription_end TIMESTAMPTZ,
    product_id TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_entitlements_user ON public.user_entitlements(user_id);
CREATE INDEX idx_entitlements_premium ON public.user_entitlements(is_premium);

-- Chat Messages for La Bestia
CREATE TABLE public.chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    evidence_ids UUID[],
    signal_ids UUID[],
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_chat_messages_user ON public.chat_messages(user_id);
CREATE INDEX idx_chat_messages_created ON public.chat_messages(created_at);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

-- RLS Policies for profiles
CREATE POLICY "Users can view own profile" ON public.profiles 
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.profiles 
    FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles 
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- RLS Policies for stripe_customers (read only for user)
CREATE POLICY "Users can view own stripe customer" ON public.stripe_customers 
    FOR SELECT USING (auth.uid() = user_id);

-- RLS Policies for user_entitlements
CREATE POLICY "Users can view own entitlements" ON public.user_entitlements 
    FOR SELECT USING (auth.uid() = user_id);

-- RLS Policies for chat_messages
CREATE POLICY "Users can view own messages" ON public.chat_messages 
    FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own messages" ON public.chat_messages 
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Function to create profile and entitlements on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- Create profile
    INSERT INTO public.profiles (user_id, email)
    VALUES (NEW.id, NEW.email);
    
    -- Create entitlements with free tier
    INSERT INTO public.user_entitlements (user_id, is_premium, queries_limit)
    VALUES (NEW.id, false, 50);
    
    RETURN NEW;
END;
$$;

-- Trigger on auth.users insert
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();