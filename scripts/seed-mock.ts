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

const MOCK_USER_BASE = 9900000000;
const MOCK_USER_COUNT = 120;
const MOCK_CHAT_BASE = -1009900000000;
const MOCK_GROUP_COUNT = 12;
const MOCK_RULE_SET_KEY = 'mock_community_rules';

const FIRST_NAMES = [
  'Raka',
  'Nadia',
  'Dimas',
  'Sari',
  'Bima',
  'Arya',
  'Putri',
  'Fajar',
  'Dian',
  'Hendra',
  'Citra',
  'Gilang',
  'Tania',
  'Reza',
  'Ayu',
  'Bagas',
];
const LAST_NAMES = [
  'Pratama',
  'Kusuma',
  'Wijaya',
  'Rahmawati',
  'Santoso',
  'Nugroho',
  'Lestari',
  'Saputra',
  'Permata',
  'Gunawan',
  'Mahendra',
  'Wulandari',
];
const GROUP_NAMES = [
  'Komunitas Dev ID',
  'Forum Diskusi Utama',
  'Bursa Kerja Tech',
  'Belajar TypeScript ID',
  'Cloudflare Workers ID',
  'Open Source Nusantara',
  'Backend & Database ID',
  'UI/UX Indonesia',
  'Linux & Self-Host ID',
  'Keamanan Siber ID',
  'Karier Engineering ID',
  'Startup & Produk ID',
];
const BAN_REASONS = [
  'Mengirim tautan referral kripto ke beberapa thread setelah peringatan.',
  'Menyebarkan tautan phishing berkedok verifikasi akun.',
  'Spam promosi berulang tanpa izin moderator.',
  'Menggunakan kata-kata kasar dan menyerang anggota lain.',
  'Melakukan penipuan transaksi di pesan langsung anggota.',
  'Mengunggah konten terlarang berulang kali.',
];
const WARN_REASONS = [
  'Mengunggah lowongan tanpa mencantumkan kisaran gaji.',
  'Promosi di luar kanal yang telah ditentukan.',
  'Diskusi keluar topik (OOT) berulang setelah diingatkan.',
  'Mengirim pesan beruntun (flood) di ruang utama.',
];
const APPEAL_TEXTS = [
  'Akun saya sempat diretas lewat tautan phishing kemarin. Sekarang 2FA sudah aktif dan sesi lain sudah saya cabut.',
  'Saya mengakui kekhilafan saya saat membalas komentar dan berjanji mengikuti aturan komunitas.',
  'Tautan tersebut adalah dokumentasi resmi, bukan promosi komersial. Mohon ditinjau ulang.',
  'Saya sudah membaca ulang seluruh panduan kanal dan siap mematuhinya ke depan.',
];

async function seedMockData() {
  const users: Database['public']['Tables']['telegram_users']['Insert'][] =
    Array.from({ length: MOCK_USER_COUNT }, (_, idx) => {
      const n = idx + 1;
      const first = FIRST_NAMES[idx % FIRST_NAMES.length] ?? 'User';
      const last = LAST_NAMES[idx % LAST_NAMES.length] ?? 'Mock';
      return {
        user_id: MOCK_USER_BASE + n,
        username: `${first.toLowerCase()}_${last.toLowerCase()}_${n}`,
        first_name: first,
        last_name: last,
      };
    });

  const { error: usersErr } = await supabase
    .from('telegram_users')
    .upsert(users, { onConflict: 'user_id' });
  if (usersErr) throw usersErr;

  const chats: Database['public']['Tables']['telegram_chats']['Insert'][] =
    Array.from({ length: MOCK_GROUP_COUNT }, (_, idx) => {
      const n = idx + 1;
      return {
        chat_id: MOCK_CHAT_BASE - n,
        chat_type: 'supergroup',
        title: GROUP_NAMES[idx % GROUP_NAMES.length] ?? `Grup Mock ${n}`,
      };
    });

  const { error: chatsErr } = await supabase
    .from('telegram_chats')
    .upsert(chats, { onConflict: 'chat_id' });
  if (chatsErr) throw chatsErr;

  const connected: Database['public']['Tables']['connected_chats']['Insert'][] =
    chats.map((ch, idx) => ({
      chat_id: ch.chat_id,
      added_by_user_id: MOCK_USER_BASE + 101,
      is_active: idx < 10,
    }));

  const { error: connErr } = await supabase
    .from('connected_chats')
    .upsert(connected, { onConflict: 'chat_id' });
  if (connErr) throw connErr;

  // Seed 10 mock staff (users 101..110)
  const staffRoles = [
    'admin',
    'admin',
    'developer',
    'developer',
    'moderator',
    'moderator',
    'moderator',
    'moderator',
    'moderator',
    'moderator',
  ];
  for (let i = 0; i < staffRoles.length; i += 1) {
    const uid = MOCK_USER_BASE + 101 + i;
    const { data: existing } = await supabase
      .from('role_assignments')
      .select('id')
      .eq('user_id', uid)
      .eq('status', 'active')
      .maybeSingle();
    if (!existing) {
      await supabase.from('role_assignments').insert({
        user_id: uid,
        role_key: staffRoles[i] ?? 'moderator',
        assigned_by_user_id: MOCK_USER_BASE + 101,
        status: 'active',
      });
    }
  }

  // Clean existing mock actions/appeals first so re-running seed:mock is idempotent and fast
  const mockUserIds = users.map((u) => u.user_id);
  await supabase
    .from('moderation_appeals')
    .delete()
    .in('appellant_user_id', mockUserIds);
  await supabase
    .from('moderation_actions')
    .delete()
    .like('external_ref', 'mock_%');

  // Insert 120 bans (one per mock user: 90 active, 30 revoked) + 120 warns
  const now = Date.now();
  const banRows: Database['public']['Tables']['moderation_actions']['Insert'][] =
    Array.from({ length: MOCK_USER_COUNT }, (_, idx) => {
      const n = idx + 1;
      const uid = MOCK_USER_BASE + n;
      const cid = MOCK_CHAT_BASE - ((idx % MOCK_GROUP_COUNT) + 1);
      const staffUid = MOCK_USER_BASE + 101 + (idx % 10);
      const isRevoked = idx >= 90;
      return {
        chat_id: cid,
        origin_chat_id: cid,
        action_type: 'ban',
        target_user_id: uid,
        actor_user_id: staffUid,
        reason: BAN_REASONS[idx % BAN_REASONS.length],
        status: isRevoked ? 'revoked' : 'active',
        revoked_at: isRevoked
          ? new Date(now - idx * 3600_000).toISOString()
          : null,
        created_at: new Date(now - idx * 7200_000).toISOString(),
        external_ref: `mock_ban_${String(n).padStart(4, '0')}`,
        scope_type: 'community',
      };
    });

  const warnRows: Database['public']['Tables']['moderation_actions']['Insert'][] =
    Array.from({ length: 120 }, (_, idx) => {
      const n = idx + 1;
      const uid = MOCK_USER_BASE + ((idx % 100) + 1);
      const cid = MOCK_CHAT_BASE - ((idx % MOCK_GROUP_COUNT) + 1);
      const staffUid = MOCK_USER_BASE + 101 + (idx % 10);
      return {
        chat_id: cid,
        origin_chat_id: cid,
        action_type: 'warn',
        target_user_id: uid,
        actor_user_id: staffUid,
        reason: WARN_REASONS[idx % WARN_REASONS.length],
        status: 'completed',
        created_at: new Date(now - idx * 5400_000).toISOString(),
        external_ref: `mock_wrn_${String(n).padStart(4, '0')}`,
        scope_type: 'chat',
      };
    });

  const { data: insertedBans, error: banErr } = await supabase
    .from('moderation_actions')
    .insert(banRows)
    .select('id, target_user_id');
  if (banErr) throw banErr;

  const { error: warnErr } = await supabase
    .from('moderation_actions')
    .insert(warnRows);
  if (warnErr) throw warnErr;

  // Insert 100 appeals linked to the first 100 bans
  const appealRows: Database['public']['Tables']['moderation_appeals']['Insert'][] =
    (insertedBans ?? []).slice(0, 100).map((ban, idx) => {
      const status = idx < 60 ? 'pending' : idx < 80 ? 'accepted' : 'rejected';
      return {
        action_id: ban.id,
        appellant_user_id: ban.target_user_id,
        appeal_text:
          APPEAL_TEXTS[idx % APPEAL_TEXTS.length] ?? 'Mohon ditinjau ulang.',
        status,
        submitted_at: new Date(now - idx * 3600_000).toISOString(),
        resolved_at:
          status === 'pending'
            ? null
            : new Date(now - idx * 1800_000).toISOString(),
      };
    });

  const { error: appealErr } = await supabase
    .from('moderation_appeals')
    .insert(appealRows);
  if (appealErr) throw appealErr;

  // Seed 24 rules in mock rule set
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

  const ruleCategories = [
    { key: 'umum', title: 'Umum & Etika' },
    { key: 'keamanan', title: 'Keamanan & Anti-Spam' },
    { key: 'bursa', title: 'Bursa Kerja' },
    { key: 'teknis', title: 'Diskusi Teknis' },
  ];

  const ruleItems: Database['public']['Tables']['rule_items']['Insert'][] =
    Array.from({ length: 24 }, (_, idx) => {
      const n = idx + 1;
      const cat =
        ruleCategories[idx % ruleCategories.length] ?? ruleCategories[0];
      return {
        rule_set_version_id: versionId,
        rule_key: `mock_rule_${String(n).padStart(2, '0')}`,
        category_key: cat.key,
        category_title: cat.title,
        title: `Pasal ${n}: Ketentuan ${cat.title.toLowerCase()} #${n}`,
        body: `Penjelasan singkat mengenai standar perilaku dan kepatuhan untuk pasal ${n} pada kategori ${cat.title}.`,
        sort_order: n * 10,
        is_mandatory: idx % 3 !== 0,
      };
    });

  const { error: ruleItemsErr } = await supabase
    .from('rule_items')
    .upsert(ruleItems, { onConflict: 'rule_set_version_id,rule_key' });
  if (ruleItemsErr) throw ruleItemsErr;

  console.log(
    `Seeded ${users.length} users, ${chats.length} groups, 10 staff, ${banRows.length} bans, ${warnRows.length} warns, ${appealRows.length} appeals, and ${ruleItems.length} rules.`,
  );
}

seedMockData().catch((err) => {
  console.error('Failed to seed mock data:', err);
  process.exit(1);
});
