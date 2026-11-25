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

export const MOCK_USER_IDS = [
  9900000001, 9900000002, 9900000003, 9900000004, 9900000005, 9900000006,
];

export const MOCK_CHAT_IDS = [-1009900000001, -1009900000002, -1009900000003];
export const MOCK_RULE_SET_KEY = 'mock_community_rules';

async function seedMockData() {
  const { error: usersErr } = await supabase.from('telegram_users').upsert(
    [
      {
        user_id: 9900000001,
        username: 'rakapratama',
        first_name: 'Raka',
        last_name: 'Pratama',
      },
      {
        user_id: 9900000002,
        username: 'nadiak',
        first_name: 'Nadia',
        last_name: 'Kusuma',
      },
      {
        user_id: 9900000003,
        username: 'dimasw',
        first_name: 'Dimas',
        last_name: 'Wijaya',
      },
      {
        user_id: 9900000004,
        username: 'admin_sari',
        first_name: 'Sari',
        last_name: 'Rahmawati',
      },
      {
        user_id: 9900000005,
        username: 'dev_bima',
        first_name: 'Bima',
        last_name: 'Santoso',
      },
      {
        user_id: 9900000006,
        username: 'mod_arya',
        first_name: 'Arya',
        last_name: 'Nugroho',
      },
    ],
    { onConflict: 'user_id' },
  );
  if (usersErr) throw usersErr;

  const { error: chatsErr } = await supabase.from('telegram_chats').upsert(
    [
      {
        chat_id: -1009900000001,
        chat_type: 'supergroup',
        title: 'Komunitas Dev ID',
      },
      {
        chat_id: -1009900000002,
        chat_type: 'supergroup',
        title: 'Forum Diskusi Utama',
      },
      {
        chat_id: -1009900000003,
        chat_type: 'supergroup',
        title: 'Bursa Kerja Tech',
      },
    ],
    { onConflict: 'chat_id' },
  );
  if (chatsErr) throw chatsErr;

  const { error: connErr } = await supabase.from('connected_chats').upsert(
    [
      {
        chat_id: -1009900000001,
        added_by_user_id: 9900000004,
        is_active: true,
      },
      {
        chat_id: -1009900000002,
        added_by_user_id: 9900000004,
        is_active: true,
      },
      {
        chat_id: -1009900000003,
        added_by_user_id: 9900000004,
        is_active: true,
      },
    ],
    { onConflict: 'chat_id' },
  );
  if (connErr) throw connErr;

  // Seed mock staff roles (skip if already assigned)
  const staffSeeds = [
    { user_id: 9900000004, role_key: 'admin' },
    { user_id: 9900000005, role_key: 'developer' },
    { user_id: 9900000006, role_key: 'moderator' },
  ];
  for (const s of staffSeeds) {
    const { data: existing } = await supabase
      .from('role_assignments')
      .select('id')
      .eq('user_id', s.user_id)
      .eq('status', 'active')
      .maybeSingle();
    if (!existing) {
      await supabase.from('role_assignments').insert({
        user_id: s.user_id,
        role_key: s.role_key,
        assigned_by_user_id: 9900000004,
        status: 'active',
      });
    }
  }

  // Seed mock bans & warns (idempotent by external_ref)
  const actionSeeds: Database['public']['Tables']['moderation_actions']['Insert'][] =
    [
      {
        chat_id: -1009900000001,
        origin_chat_id: -1009900000001,
        action_type: 'ban',
        target_user_id: 9900000001,
        actor_user_id: 9900000006,
        reason:
          'Mengirim tautan referral kripto ke 3 thread berbeda setelah 2x peringatan.',
        status: 'active',
        external_ref: 'mock_ban_9f2a41',
        scope_type: 'community',
      },
      {
        chat_id: -1009900000002,
        origin_chat_id: -1009900000002,
        action_type: 'ban',
        target_user_id: 9900000002,
        actor_user_id: 9900000004,
        reason: 'Menggunakan kata-kata kasar berulang saat diskusi teknis.',
        status: 'active',
        external_ref: 'mock_ban_8c117b',
        scope_type: 'community',
      },
      {
        chat_id: -1009900000003,
        origin_chat_id: -1009900000003,
        action_type: 'warn',
        target_user_id: 9900000003,
        actor_user_id: 9900000006,
        reason: 'Mengunggah lowongan tanpa mencantumkan kisaran gaji.',
        status: 'completed',
        external_ref: 'mock_wrn_7d04e9',
        scope_type: 'chat',
      },
      {
        chat_id: -1009900000001,
        origin_chat_id: -1009900000001,
        action_type: 'warn',
        target_user_id: 9900000003,
        actor_user_id: 9900000006,
        reason: 'Promosi di luar kanal yang ditentukan.',
        status: 'completed',
        external_ref: 'mock_wrn_4a12c3',
        scope_type: 'chat',
      },
    ];

  const actionIdsByRef = new Map<string, number>();
  for (const act of actionSeeds) {
    const { data: existing } = await supabase
      .from('moderation_actions')
      .select('id')
      .eq('external_ref', act.external_ref ?? '')
      .maybeSingle();

    if (existing) {
      actionIdsByRef.set(act.external_ref ?? '', existing.id);
    } else {
      const { data: inserted, error } = await supabase
        .from('moderation_actions')
        .insert(act)
        .select('id')
        .single();
      if (error) throw error;
      actionIdsByRef.set(act.external_ref ?? '', inserted.id);
    }
  }

  // Seed mock appeals
  const ban1Id = actionIdsByRef.get('mock_ban_9f2a41');
  const ban2Id = actionIdsByRef.get('mock_ban_8c117b');
  if (ban1Id) {
    const { data: existing } = await supabase
      .from('moderation_appeals')
      .select('id')
      .eq('action_id', ban1Id)
      .maybeSingle();
    if (!existing) {
      await supabase.from('moderation_appeals').insert({
        action_id: ban1Id,
        appellant_user_id: 9900000001,
        appeal_text:
          'Akun saya sempat diretas lewat tautan phishing kemarin malam. Sekarang 2FA sudah aktif dan sesi lain sudah saya cabut.',
        status: 'pending',
      });
    }
  }
  if (ban2Id) {
    const { data: existing } = await supabase
      .from('moderation_appeals')
      .select('id')
      .eq('action_id', ban2Id)
      .maybeSingle();
    if (!existing) {
      await supabase.from('moderation_appeals').insert({
        action_id: ban2Id,
        appellant_user_id: 9900000002,
        appeal_text:
          'Saya mengakui emosi saat membalas komentar tersebut dan sudah meminta maaf ke pihak terkait.',
        status: 'pending',
      });
    }
  }

  // Seed mock rules
  const { data: existingRuleSet } = await supabase
    .from('rule_sets')
    .select('id')
    .eq('rule_set_key', MOCK_RULE_SET_KEY)
    .maybeSingle();

  let ruleSetId = existingRuleSet?.id;
  if (!ruleSetId) {
    const { data: createdSet, error } = await supabase
      .from('rule_sets')
      .insert({
        scope_type: 'community',
        rule_set_key: MOCK_RULE_SET_KEY,
        name: 'Aturan Komunitas (Mock)',
        description: 'Data contoh aturan federasi',
        is_active: true,
        requires_acknowledgement: true,
      })
      .select('id')
      .single();
    if (error) throw error;
    ruleSetId = createdSet.id;
  }

  const { data: existingVersion } = await supabase
    .from('rule_set_versions')
    .select('id')
    .eq('rule_set_id', ruleSetId)
    .eq('locale', 'id-ID')
    .eq('version_number', 1)
    .maybeSingle();

  let versionId = existingVersion?.id;
  if (!versionId) {
    const { data: createdVer, error } = await supabase
      .from('rule_set_versions')
      .insert({
        rule_set_id: ruleSetId,
        version_number: 1,
        locale: 'id-ID',
        status: 'published',
        published_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (error) throw error;
    versionId = createdVer.id;
  }

  const { error: ruleItemsErr } = await supabase.from('rule_items').upsert(
    [
      {
        rule_set_version_id: versionId,
        rule_key: 'mock_rule_etika',
        category_key: 'umum',
        category_title: 'Umum & Etika',
        title: 'Jaga sopan santun dan hindari serangan personal',
        body: 'Diskusi teknis diperbolehkan berbeda pendapat tanpa merendahkan anggota lain.',
        sort_order: 10,
        is_mandatory: true,
      },
      {
        rule_set_version_id: versionId,
        rule_key: 'mock_rule_spam',
        category_key: 'keamanan',
        category_title: 'Keamanan & Anti-Spam',
        title: 'Dilarang mengirim tautan phishing, referral, atau spam',
        body: 'Tautan berulang tanpa konteks atau indikasi penipuan akan dikenai ban federasi.',
        sort_order: 20,
        is_mandatory: true,
      },
      {
        rule_set_version_id: versionId,
        rule_key: 'mock_rule_loker',
        category_key: 'bursa',
        category_title: 'Bursa Kerja',
        title: 'Cantumkan peran, lokasi/remote, dan kisaran kompensasi',
        body: 'Unggahan lowongan tanpa informasi dasar akan diberi peringatan terlebih dahulu.',
        sort_order: 30,
        is_mandatory: false,
      },
    ],
    { onConflict: 'rule_set_version_id,rule_key' },
  );
  if (ruleItemsErr) throw ruleItemsErr;

  console.log('Mock data seeded successfully.');
}

seedMockData().catch((err) => {
  console.error('Failed to seed mock data:', err);
  process.exit(1);
});
