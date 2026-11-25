import { createClient } from '@supabase/supabase-js';
import type { Database } from '../src/db/database.types';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !supabaseSecretKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SECRET_KEY in environment.');
  process.exit(1);
}

const supabase = createClient<Database>(supabaseUrl, supabaseSecretKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

const MOCK_USER_IDS = Array.from({ length: 120 }, (_, i) => 9900000001 + i);
const MOCK_CHAT_IDS = Array.from({ length: 12 }, (_, i) => -1009900000001 - i);
const MOCK_RULE_SET_KEY = 'mock_community_rules';

async function clearMockData() {
  await supabase
    .from('moderation_appeals')
    .delete()
    .in('appellant_user_id', MOCK_USER_IDS);

  await supabase
    .from('moderation_actions')
    .delete()
    .like('external_ref', 'mock_%');

  await supabase.from('role_assignments').delete().in('user_id', MOCK_USER_IDS);

  await supabase
    .from('rule_sets')
    .delete()
    .eq('rule_set_key', MOCK_RULE_SET_KEY);

  await supabase.from('connected_chats').delete().in('chat_id', MOCK_CHAT_IDS);
  await supabase.from('telegram_chats').delete().in('chat_id', MOCK_CHAT_IDS);
  await supabase.from('telegram_users').delete().in('user_id', MOCK_USER_IDS);

  console.log('All mock data cleared cleanly.');
}

clearMockData().catch((err) => {
  console.error('Failed to clear mock data:', err);
  process.exit(1);
});
