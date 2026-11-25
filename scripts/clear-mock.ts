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

const MOCK_USER_IDS = [
  9900000001, 9900000002, 9900000003, 9900000004, 9900000005, 9900000006,
];
const MOCK_CHAT_IDS = [-1009900000001, -1009900000002, -1009900000003];
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

  console.log('Mock data cleared cleanly.');
}

clearMockData().catch((err) => {
  console.error('Failed to clear mock data:', err);
  process.exit(1);
});
