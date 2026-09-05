import { createClient } from '@supabase/supabase-js'

const VITE_SUPABASE_URL='https://eegfeeckeeqexytbslnv.supabase.co'
const VITE_SUPABASE_PUBLISHABLE_KEY='sb_publishable_zSCYvrUkTz571En9qj00LA_wMT50gdW'

export const supabase = createClient(
  VITE_SUPABASE_URL,
  VITE_SUPABASE_PUBLISHABLE_KEY
)