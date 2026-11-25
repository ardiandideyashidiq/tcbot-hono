import { b, code, fmt } from '@grammyjs/parse-mode';
import { Composer, InlineKeyboard } from 'grammy';
import type { RoleKey } from '../../db/types';
import type { BotContext } from '../context';
import { getUserRole, isAdminOrOwner, resolveTargetUser } from '../db';
import { t } from '../i18n';

export const rbacComposer = new Composer<BotContext>();

const ROLE_RANK: Record<RoleKey, number> = {
  owner: 4,
  admin: 3,
  developer: 2,
  moderator: 1,
};

function parseAssignableRole(raw?: string): Exclude<RoleKey, 'owner'> | null {
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (lower === 'admin' || lower === 'developer' || lower === 'moderator') {
    return lower;
  }
  if (lower === 'mod') return 'moderator';
  if (lower === 'dev') return 'developer';
  return null;
}

rbacComposer.command(['admins', 'tcadmins'], async (ctx) => {
  const isId = ctx.locale === 'id-ID';

  if (!ctx.supabase) {
    const formatted = fmt`${b}${isId ? 'Daftar Staf Federasi' : 'Federation Staff'}${b}
• Owner: ${code}${ctx.appEnv.OWNER_ID || '-'}${code}`;
    await ctx.reply(formatted.text, { entities: formatted.entities });
    return;
  }

  const { data: assignments } = await supabaseListStaff(ctx);
  if (assignments.length === 0) {
    await ctx.reply(isId ? 'Belum ada staf terdaftar.' : 'No staff found.');
    return;
  }

  const lines = assignments
    .map((s) => `• ${s.label} — ${s.roleKey} (${s.userId})`)
    .join('\n');
  const formatted = fmt`${b}${isId ? 'Daftar Staf Federasi' : 'Federation Staff'}${b}\n${lines}`;
  const keyboard = new InlineKeyboard().text(
    isId ? '✖ Tutup' : '✖ Close',
    'nav:close',
  );

  await ctx.reply(formatted.text, {
    entities: formatted.entities,
    reply_markup: keyboard,
  });
});

async function supabaseListStaff(ctx: BotContext) {
  if (!ctx.supabase)
    return {
      data: [] as Array<{ userId: number; roleKey: string; label: string }>,
    };

  const { data: rows } = await ctx.supabase
    .from('role_assignments')
    .select('user_id, role_key')
    .eq('status', 'active');

  const ids = (rows ?? []).map((r) => r.user_id);
  const { data: users } =
    ids.length > 0
      ? await ctx.supabase
          .from('telegram_users')
          .select('user_id, username, first_name')
          .in('user_id', ids)
      : { data: [] };

  const userMap = new Map((users ?? []).map((u) => [u.user_id, u]));
  const sorted = (rows ?? [])
    .map((r) => {
      const u = userMap.get(r.user_id);
      const label = u?.username
        ? `@${u.username}`
        : u?.first_name || String(r.user_id);
      return { userId: r.user_id, roleKey: r.role_key, label };
    })
    .sort(
      (a, b) =>
        (ROLE_RANK[b.roleKey as RoleKey] ?? 0) -
        (ROLE_RANK[a.roleKey as RoleKey] ?? 0),
    );

  return { data: sorted };
}

rbacComposer.command(['tcpromote', 'tcp'], async (ctx) => {
  const isId = ctx.locale === 'id-ID';
  const actorId = ctx.from?.id ?? 0;
  const actorRole = await getUserRole(
    ctx.supabase,
    actorId,
    ctx.appEnv.OWNER_ID,
  );

  if (!isAdminOrOwner(actorRole)) {
    await ctx.reply(t(ctx.locale, 'err.admin_only'));
    return;
  }

  const target = await resolveTargetUser(
    ctx.supabase,
    ctx.match ?? '',
    ctx.message?.reply_to_message?.from,
  );
  if (!target) {
    await ctx.reply(t(ctx.locale, 'err.target_missing'));
    return;
  }
  if (target.userId === actorId) {
    await ctx.reply(t(ctx.locale, 'err.self_target'));
    return;
  }

  const nextRole = parseAssignableRole(target.remainingArgs[0]) ?? 'moderator';
  if (actorRole && ROLE_RANK[nextRole] >= ROLE_RANK[actorRole]) {
    await ctx.reply(
      isId
        ? 'Anda tidak dapat mempromosikan ke peran setara atau lebih tinggi dari peran Anda.'
        : 'You cannot promote a user to a role equal to or higher than yours.',
    );
    return;
  }

  if (ctx.supabase) {
    await ctx.supabase
      .from('telegram_users')
      .upsert(
        { user_id: target.userId },
        { onConflict: 'user_id', ignoreDuplicates: true },
      );

    await ctx.supabase
      .from('role_assignments')
      .update({
        status: 'revoked',
        revoked_at: new Date().toISOString(),
        revoked_by_user_id: actorId,
      })
      .eq('user_id', target.userId)
      .eq('status', 'active');

    await ctx.supabase.from('role_assignments').insert({
      user_id: target.userId,
      role_key: nextRole,
      assigned_by_user_id: actorId,
      status: 'active',
    });
  }

  const formatted = fmt`${b}${isId ? '✅ Promosi Staf' : '✅ Staff Promoted'}${b}
${b}Target:${b} ${target.label} (${code}${String(target.userId)}${code})
${b}${isId ? 'Peran baru' : 'New role'}:${b} ${code}${nextRole}${code}`;

  await ctx.reply(formatted.text, { entities: formatted.entities });
});

rbacComposer.command(['tcdemote', 'tcd'], async (ctx) => {
  const isId = ctx.locale === 'id-ID';
  const actorId = ctx.from?.id ?? 0;
  const actorRole = await getUserRole(
    ctx.supabase,
    actorId,
    ctx.appEnv.OWNER_ID,
  );

  if (!isAdminOrOwner(actorRole)) {
    await ctx.reply(t(ctx.locale, 'err.admin_only'));
    return;
  }

  const target = await resolveTargetUser(
    ctx.supabase,
    ctx.match ?? '',
    ctx.message?.reply_to_message?.from,
  );
  if (!target) {
    await ctx.reply(t(ctx.locale, 'err.target_missing'));
    return;
  }
  if (target.userId === actorId) {
    await ctx.reply(t(ctx.locale, 'err.self_target'));
    return;
  }

  const targetRole = await getUserRole(
    ctx.supabase,
    target.userId,
    ctx.appEnv.OWNER_ID,
  );
  if (!targetRole) {
    await ctx.reply(
      isId
        ? 'Pengguna ini bukan staf aktif.'
        : 'User is not an active staff member.',
    );
    return;
  }
  if (actorRole && ROLE_RANK[targetRole] >= ROLE_RANK[actorRole]) {
    await ctx.reply(
      isId
        ? 'Anda tidak dapat menurunkan staf dengan peran setara atau lebih tinggi.'
        : 'You cannot demote a staff member of equal or higher rank.',
    );
    return;
  }

  if (ctx.supabase) {
    await ctx.supabase
      .from('role_assignments')
      .update({
        status: 'revoked',
        revoked_at: new Date().toISOString(),
        revoked_by_user_id: actorId,
      })
      .eq('user_id', target.userId)
      .eq('status', 'active');
  }

  const formatted = fmt`${b}${isId ? '🔽 Penurunan Staf' : '🔽 Staff Demoted'}${b}
${b}Target:${b} ${target.label} (${code}${String(target.userId)}${code})`;

  await ctx.reply(formatted.text, { entities: formatted.entities });
});
