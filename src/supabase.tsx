import { createClient } from '@supabase/supabase-js'

// Production values are the fallback so a missing .env file can never break the live site.
// Both are public (the publishable key is meant for the browser); never put a service-role key here.
const PROD_SUPABASE_URL = 'https://eegfeeckeeqexytbslnv.supabase.co'
const PROD_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_zSCYvrUkTz571En9qj00LA_wMT50gdW'

export const SUPABASE_URL: string = import.meta.env.VITE_SUPABASE_URL || PROD_SUPABASE_URL
export const SUPABASE_PUBLISHABLE_KEY: string =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || PROD_SUPABASE_PUBLISHABLE_KEY

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)
