import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)

export const goldSentimentSupabase = createClient(
  import.meta.env.VITE_GOLD_SENTIMENT_SUPABASE_URL,
  import.meta.env.VITE_GOLD_SENTIMENT_SUPABASE_ANON_KEY
)
