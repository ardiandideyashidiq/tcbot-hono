import { b, code, fmt } from '@grammyjs/parse-mode';
import { Composer, InlineKeyboard } from 'grammy';
import type { RoleKey } from '../../db/types';
import type { BotContext } from '../context';
import {
  generateExternalRef,
  getUserRole,
  isAdminOrOwner,
  isStaffRole,
  ROLE_RANK,
  recordAuditEvent,
  resolveTargetUser,
} from '../db';
import { t } from '../i18n';
import { getCommandArgs, onCommand } from '../prefixes';

export const rbacComposer = new Composer<BotContext>();

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

async function listActiveStaff(ctx: BotContext) {
  if (!ctx.supabase) {
    return [] as Array<{ userId: number; roleKey: RoleKey; label: string }>;
  }

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
  return (rows ?? [])
    .map((r) => {
      const u = userMap.get(r.user_id);
      const label = u?.username
        ? `@${u.username}`
        : u?.first_name || String(r.user_id);
      return {
        userId: r.user_id,
        roleKey: r.role_key as RoleKey,
        label,
      };
    })
    .sort((a, b) => (ROLE_RANK[b.roleKey] ?? 0) - (ROLE_RANK[a.roleKey] ?? 0));
}

async function applyRoleAssignment(
  ctx: BotContext,
  targetUserId: number,
  nextRole: RoleKey | null,
  actorId: number,
): Promise<void> {
  if (!ctx.supabase) return;

  await ctx.supabase
    .from('telegram_users')
    .upsert(
      { user_id: targetUserId },
      { onConflict: 'user_id', ignoreDuplicates: true },
    );

  await ctx.supabase
    .from('role_assignments')
    .update({
      status: 'revoked',
      revoked_at: new Date().toISOString(),
      revoked_by_user_id: actorId,
    })
    .eq('user_id', targetUserId)
    .eq('status', 'active');

  if (nextRole) {
    await ctx.supabase.from('role_assignments').insert({
      user_id: targetUserId,
      role_key: nextRole,
      assigned_by_user_id: actorId,
      status: 'active',
    });
  }
}

onCommand(rbacComposer, ['admins', 'tcadmins'], async (ctx) => {
  const isId = ctx.locale === 'id-ID';

  if (!ctx.supabase) {
    const formatted = fmt`${b}${isId ? 'Daftar Staf Federasi' : 'Federation Staff'}${b}
• Owner: ${code}${ctx.appEnv.OWNER_ID || '-'}${code}`;
    await ctx.reply(formatted.text, { entities: formatted.entities });
    return;
  }

  const assignments = await listActiveStaff(ctx);
  if (assignments.length === 0) {
    await ctx.reply(isId ? 'Belum ada staf terdaftar.' : 'No staff found.');
    return;
  }

  const groups: Record<RoleKey, string[]> = {
    owner: [],
    admin: [],
    developer: [],
    moderator: [],
  };

  for (const s of assignments) {
    const line = `  • ${s.label} (${s.userId})`;
    if (groups[s.roleKey]) {
      groups[s.roleKey].push(line);
    }
  }

  const sections: string[] = [];
  if (groups.owner.length)
    sections.push(`👑 Owner\n${groups.owner.join('\n')}`);
  if (groups.admin.length) sections.push(`🛡️ Admin\n${groups.admin.join('\n')}`);
  if (groups.developer.length)
    sections.push(`⚙️ Developer\n${groups.developer.join('\n')}`);
  if (groups.moderator.length)
    sections.push(`⚖️ Moderator\n${groups.moderator.join('\n')}`);

  const formatted = fmt`${b}${isId ? 'Daftar Staf Federasi' : 'Federation Staff'}${b} (${code}${String(assignments.length)}${code})\n\n${sections.join('\n\n')}`;
  const keyboard = new InlineKeyboard()
    .text(isId ? '✖ Tutup' : '✖ Close', 'nav:close')
    .danger();

  await ctx.reply(formatted.text, {
    entities: formatted.entities,
    reply_markup: keyboard,
  });
});

onCommand(rbacComposer, ['tcpromote', 'tcp'], async (ctx) => {
  const isId = ctx.locale === 'id-ID';
  const actorId = ctx.from?.id ?? 0;
  const actorRole = await getUserRole(
    ctx.supabase,
    actorId,
    ctx.appEnv.OWNER_ID,
  );

  if (!isStaffRole(actorRole)) {
    await ctx.reply(t(ctx.locale, 'err.admin_only'));
    return;
  }

  const args = getCommandArgs(ctx);
  const target = await resolveTargetUser(
    ctx.supabase,
    args,
    ctx.message?.reply_to_message?.from,
  );
  if (!target) {
    await ctx.reply(t(ctx.locale, 'err.target_missing'));
    return;
  }

  const wantsRequest = target.remainingArgs.some(
    (a) => a.toLowerCase() === '--request' || a.toLowerCase() === '-r',
  );
  const roleArg = target.remainingArgs.find((a) => !a.startsWith('-'));
  const nextRole = parseAssignableRole(roleArg) ?? 'moderator';

  // Moderators/developers can submit promotion requests for admin/owner review
  if (!isAdminOrOwner(actorRole) || wantsRequest) {
    if (!ctx.supabase) {
      await ctx.reply(t(ctx.locale, 'err.db_unconfigured'));
      return;
    }

    const ttlDays = Math.max(
      1,
      Number(ctx.appEnv.PROMOTION_REQUEST_TTL_DAYS) || 7,
    );
    const expiresAt = new Date(
      Date.now() + ttlDays * 24 * 60 * 60 * 1000,
    ).toISOString();
    const requestId = generateExternalRef('PROMO');

    await ctx.supabase
      .from('telegram_users')
      .upsert(
        { user_id: target.userId },
        { onConflict: 'user_id', ignoreDuplicates: true },
      );

    const { data: inserted } = await ctx.supabase
      .from('promotion_requests')
      .insert({
        request_id: requestId,
        target_user_id: target.userId,
        requested_by_user_id: actorId,
        requested_role_key: nextRole,
        status: 'pending',
        expires_at: expiresAt,
      })
      .select('id, request_id')
      .single();

    await recordAuditEvent(ctx.supabase, {
      eventKey: 'rbac.promotion_requested',
      entityType: 'promotion_request',
      entityId: requestId,
      actorUserId: actorId,
      subjectUserId: target.userId,
      payload: { requestedRole: nextRole },
    });

    const formatted = fmt`${b}${isId ? '📨 Permintaan Promosi Dibuat' : '📨 Promotion Request Submitted'}${b}
${b}ID:${b} ${code}${inserted?.request_id ?? requestId}${code}
${b}Target:${b} ${target.label} (${code}${String(target.userId)}${code})
${b}Role:${b} ${code}${nextRole}${code}`;

    const keyboard = new InlineKeyboard()
      .text(
        isId ? '✅ Setujui' : '✅ Approve',
        `promo:approve:${inserted?.request_id ?? requestId}`,
      )
      .success()
      .text(
        isId ? '❌ Tolak' : '❌ Reject',
        `promo:reject:${inserted?.request_id ?? requestId}`,
      )
      .danger();

    await ctx.reply(formatted.text, {
      entities: formatted.entities,
      reply_markup: keyboard,
    });
    return;
  }

  if (target.userId === actorId) {
    await ctx.reply(t(ctx.locale, 'err.self_target'));
    return;
  }

  if (actorRole && ROLE_RANK[nextRole] >= ROLE_RANK[actorRole]) {
    await ctx.reply(
      isId
        ? 'Anda tidak dapat mempromosikan ke peran setara atau lebih tinggi dari peran Anda.'
        : 'You cannot promote a user to a role equal to or higher than yours.',
    );
    return;
  }

  await applyRoleAssignment(ctx, target.userId, nextRole, actorId);
  await recordAuditEvent(ctx.supabase, {
    eventKey: 'rbac.promoted',
    entityType: 'role_assignment',
    entityId: String(target.userId),
    actorUserId: actorId,
    subjectUserId: target.userId,
    payload: { role: nextRole },
  });

  const formatted = fmt`${b}${isId ? '✅ Promosi Staf' : '✅ Staff Promoted'}${b}
${b}Target:${b} ${target.label} (${code}${String(target.userId)}${code})
${b}${isId ? 'Peran baru' : 'New role'}:${b} ${code}${nextRole}${code}`;

  await ctx.reply(formatted.text, { entities: formatted.entities });
});

onCommand(rbacComposer, ['tcsetrole'], async (ctx) => {
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
    getCommandArgs(ctx),
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

  const rawRole = target.remainingArgs[0]?.toLowerCase();
  if (!rawRole) {
    await ctx.reply(
      isId
        ? 'Format: /tcsetrole <user> <admin|developer|moderator|none>'
        : 'Usage: /tcsetrole <user> <admin|developer|moderator|none>',
    );
    return;
  }

  const nextRole =
    rawRole === 'none' || rawRole === 'user' || rawRole === 'revoke'
      ? null
      : parseAssignableRole(rawRole);

  if (
    rawRole !== 'none' &&
    rawRole !== 'user' &&
    rawRole !== 'revoke' &&
    !nextRole
  ) {
    await ctx.reply(
      isId
        ? 'Peran tidak valid. Pilih: admin, developer, moderator, atau none.'
        : 'Invalid role. Choose: admin, developer, moderator, or none.',
    );
    return;
  }

  if (nextRole && actorRole && ROLE_RANK[nextRole] >= ROLE_RANK[actorRole]) {
    await ctx.reply(
      isId
        ? 'Anda tidak dapat menetapkan peran setara atau lebih tinggi dari peran Anda.'
        : 'You cannot assign a role equal to or higher than yours.',
    );
    return;
  }

  await applyRoleAssignment(ctx, target.userId, nextRole, actorId);
  await recordAuditEvent(ctx.supabase, {
    eventKey: nextRole ? 'rbac.role_set' : 'rbac.role_revoked',
    entityType: 'role_assignment',
    entityId: String(target.userId),
    actorUserId: actorId,
    subjectUserId: target.userId,
    payload: { role: nextRole ?? 'none' },
  });

  const formatted = fmt`${b}${isId ? '🛠️ Peran Diperbarui' : '🛠️ Role Updated'}${b}
${b}Target:${b} ${target.label} (${code}${String(target.userId)}${code})
${b}Role:${b} ${code}${nextRole ?? 'none'}${code}`;

  await ctx.reply(formatted.text, { entities: formatted.entities });
});

onCommand(rbacComposer, ['tcdemote', 'tcd'], async (ctx) => {
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
    getCommandArgs(ctx),
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

  const skipConfirm = target.remainingArgs.some(
    (a) => a === '--yes' || a === '-y',
  );
  if (!skipConfirm) {
    const prompt = fmt`${b}${isId ? '⚠️ Konfirmasi Penurunan Staf' : '⚠️ Confirm Staff Demotion'}${b}
${b}Target:${b} ${target.label} (${code}${String(target.userId)}${code})
${b}Role:${b} ${code}${targetRole}${code}`;
    const keyboard = new InlineKeyboard()
      .text(
        isId ? '✅ Ya, Turunkan' : '✅ Confirm Demote',
        `demote:confirm:${target.userId}:${actorId}`,
      )
      .danger()
      .text(
        isId ? '❌ Batal' : '❌ Cancel',
        `demote:cancel:${target.userId}:${actorId}`,
      )
      .primary();
    await ctx.reply(prompt.text, {
      entities: prompt.entities,
      reply_markup: keyboard,
    });
    return;
  }

  await applyRoleAssignment(ctx, target.userId, null, actorId);
  await recordAuditEvent(ctx.supabase, {
    eventKey: 'rbac.demoted',
    entityType: 'role_assignment',
    entityId: String(target.userId),
    actorUserId: actorId,
    subjectUserId: target.userId,
    payload: { previousRole: targetRole },
  });

  const formatted = fmt`${b}${isId ? '🔽 Penurunan Staf' : '🔽 Staff Demoted'}${b}
${b}Target:${b} ${target.label} (${code}${String(target.userId)}${code})`;

  await ctx.reply(formatted.text, { entities: formatted.entities });
});

rbacComposer.callbackQuery(
  /^demote:(confirm|cancel):(\d+):(\d+)$/,
  async (ctx) => {
    const decision = ctx.match[1];
    const targetId = Number(ctx.match[2]);
    const expectedActorId = Number(ctx.match[3]);
    const actorId = ctx.from.id;
    const isId = ctx.locale === 'id-ID';

    if (actorId !== expectedActorId) {
      await ctx.answerCallbackQuery({
        text: isId
          ? 'Hanya pemrakarsa perintah yang dapat mengonfirmasi.'
          : 'Only the command initiator can confirm.',
        show_alert: true,
      });
      return;
    }

    if (decision === 'cancel') {
      await ctx.answerCallbackQuery({
        text: isId ? 'Dibatalkan.' : 'Cancelled.',
      });
      await ctx
        .editMessageText(
          isId ? '❌ Penurunan staf dibatalkan.' : '❌ Demotion cancelled.',
          { reply_markup: new InlineKeyboard() },
        )
        .catch(() => {});
      return;
    }

    const actorRole = await getUserRole(
      ctx.supabase,
      actorId,
      ctx.appEnv.OWNER_ID,
    );
    const targetRole = await getUserRole(
      ctx.supabase,
      targetId,
      ctx.appEnv.OWNER_ID,
    );
    if (
      !isAdminOrOwner(actorRole) ||
      !targetRole ||
      (actorRole && ROLE_RANK[targetRole] >= ROLE_RANK[actorRole])
    ) {
      await ctx.answerCallbackQuery({
        text: t(ctx.locale, 'err.admin_only'),
        show_alert: true,
      });
      return;
    }

    await applyRoleAssignment(ctx, targetId, null, actorId);
    await recordAuditEvent(ctx.supabase, {
      eventKey: 'rbac.demoted',
      entityType: 'role_assignment',
      entityId: String(targetId),
      actorUserId: actorId,
      subjectUserId: targetId,
      payload: { previousRole: targetRole },
    });

    await ctx.answerCallbackQuery({
      text: isId ? 'Staf diturunkan.' : 'Staff demoted.',
    });
    const done = fmt`${b}${isId ? '🔽 Penurunan Staf Selesai' : '🔽 Staff Demoted'}${b}
${b}Target:${b} ${code}${String(targetId)}${code}`;
    await ctx
      .editMessageText(done.text, {
        entities: done.entities,
        reply_markup: new InlineKeyboard(),
      })
      .catch(() => {});
  },
);

onCommand(rbacComposer, ['transferowner', 'tfowner'], async (ctx) => {
  const isId = ctx.locale === 'id-ID';
  const actorId = ctx.from?.id ?? 0;
  const actorRole = await getUserRole(
    ctx.supabase,
    actorId,
    ctx.appEnv.OWNER_ID,
  );

  if (actorRole !== 'owner') {
    await ctx.reply(t(ctx.locale, 'err.owner_only'));
    return;
  }

  const target = await resolveTargetUser(
    ctx.supabase,
    getCommandArgs(ctx),
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

  const prompt = fmt`${b}${isId ? '⚠️ Konfirmasi Transfer Owner' : '⚠️ Confirm Ownership Transfer'}${b}
${isId ? 'Anda akan menyerahkan hak Owner kepada:' : 'You are about to transfer Owner rights to:'}
${target.label} (${code}${String(target.userId)}${code})

${isId ? 'Peran Anda akan diturunkan menjadi admin.' : 'Your role will be downgraded to admin.'}`;

  const keyboard = new InlineKeyboard()
    .text(
      isId ? '👑 Ya, Transfer Owner' : '👑 Confirm Transfer',
      `transfer:confirm:${target.userId}:${actorId}`,
    )
    .danger()
    .text(
      isId ? '❌ Batal' : '❌ Cancel',
      `transfer:cancel:${target.userId}:${actorId}`,
    )
    .primary();

  await ctx.reply(prompt.text, {
    entities: prompt.entities,
    reply_markup: keyboard,
  });
});

rbacComposer.callbackQuery(
  /^transfer:(confirm|cancel):(\d+):(\d+)$/,
  async (ctx) => {
    const decision = ctx.match[1];
    const targetId = Number(ctx.match[2]);
    const expectedActorId = Number(ctx.match[3]);
    const actorId = ctx.from.id;
    const isId = ctx.locale === 'id-ID';

    if (actorId !== expectedActorId) {
      await ctx.answerCallbackQuery({
        text: isId
          ? 'Hanya owner pemrakarsa yang dapat mengonfirmasi.'
          : 'Only the initiating owner can confirm.',
        show_alert: true,
      });
      return;
    }

    if (decision === 'cancel') {
      await ctx.answerCallbackQuery({
        text: isId ? 'Dibatalkan.' : 'Cancelled.',
      });
      await ctx
        .editMessageText(
          isId
            ? '❌ Transfer kepemilikan dibatalkan.'
            : '❌ Ownership transfer cancelled.',
          { reply_markup: new InlineKeyboard() },
        )
        .catch(() => {});
      return;
    }

    const actorRole = await getUserRole(
      ctx.supabase,
      actorId,
      ctx.appEnv.OWNER_ID,
    );
    if (actorRole !== 'owner') {
      await ctx.answerCallbackQuery({
        text: t(ctx.locale, 'err.owner_only'),
        show_alert: true,
      });
      return;
    }

    await applyRoleAssignment(ctx, actorId, 'admin', actorId);
    await applyRoleAssignment(ctx, targetId, 'owner', actorId);
    await recordAuditEvent(ctx.supabase, {
      eventKey: 'rbac.ownership_transferred',
      entityType: 'role_assignment',
      entityId: String(targetId),
      actorUserId: actorId,
      subjectUserId: targetId,
    });

    await ctx.answerCallbackQuery({
      text: isId ? 'Kepemilikan dipindahkan.' : 'Ownership transferred.',
    });
    const done = fmt`${b}${isId ? '👑 Transfer Owner Selesai' : '👑 Ownership Transferred'}${b}
${b}Owner Baru:${b} ${code}${String(targetId)}${code}`;
    await ctx
      .editMessageText(done.text, {
        entities: done.entities,
        reply_markup: new InlineKeyboard(),
      })
      .catch(() => {});
  },
);

onCommand(
  rbacComposer,
  ['tcpromoterequests', 'pmtreqs', 'tcpromotelist', 'pmtlist'],
  async (ctx) => {
    const isId = ctx.locale === 'id-ID';
    const actorRole = await getUserRole(
      ctx.supabase,
      ctx.from?.id ?? 0,
      ctx.appEnv.OWNER_ID,
    );
    if (!isAdminOrOwner(actorRole)) {
      await ctx.reply(t(ctx.locale, 'err.admin_only'));
      return;
    }
    if (!ctx.supabase) {
      await ctx.reply(t(ctx.locale, 'err.db_unconfigured'));
      return;
    }

    const { data: requests } = await ctx.supabase
      .from('promotion_requests')
      .select('request_id, target_user_id, requested_role_key, requested_at')
      .eq('status', 'pending')
      .order('requested_at', { ascending: false })
      .limit(10);

    if (!requests || requests.length === 0) {
      await ctx.reply(
        isId
          ? 'Tidak ada permintaan promosi yang menunggu.'
          : 'No pending promotion requests.',
      );
      return;
    }

    const lines = requests
      .map(
        (r, i) =>
          `${i + 1}. ${r.request_id} — User ${r.target_user_id} → ${r.requested_role_key}`,
      )
      .join('\n');

    const keyboard = new InlineKeyboard();
    for (const r of requests.slice(0, 5)) {
      keyboard
        .text(`✅ ${r.request_id}`, `promo:approve:${r.request_id}`)
        .success()
        .text(`❌ ${r.request_id}`, `promo:reject:${r.request_id}`)
        .danger()
        .row();
    }
    keyboard.text(isId ? '✖ Tutup' : '✖ Close', 'nav:close').danger();

    const formatted = fmt`${b}${isId ? '📋 Antrean Permintaan Promosi' : '📋 Pending Promotion Requests'}${b}\n\n${lines}`;
    await ctx.reply(formatted.text, {
      entities: formatted.entities,
      reply_markup: keyboard,
    });
  },
);

rbacComposer.callbackQuery(
  /^promo:(approve|reject):([A-Za-z0-9_-]+)$/,
  async (ctx) => {
    const decision = ctx.match[1] as 'approve' | 'reject';
    const requestId = ctx.match[2];
    const actorId = ctx.from.id;
    const isId = ctx.locale === 'id-ID';

    const actorRole = await getUserRole(
      ctx.supabase,
      actorId,
      ctx.appEnv.OWNER_ID,
    );
    if (!isAdminOrOwner(actorRole)) {
      await ctx.answerCallbackQuery({
        text: t(ctx.locale, 'err.admin_only'),
        show_alert: true,
      });
      return;
    }
    if (!ctx.supabase) {
      await ctx.answerCallbackQuery({
        text: t(ctx.locale, 'err.db_unconfigured'),
        show_alert: true,
      });
      return;
    }

    const { data: req } = await ctx.supabase
      .from('promotion_requests')
      .select('id, target_user_id, requested_role_key, status')
      .eq('request_id', requestId)
      .maybeSingle();

    if (req?.status !== 'pending') {
      await ctx.answerCallbackQuery({
        text: isId
          ? 'Permintaan tidak ditemukan atau sudah diproses.'
          : 'Request not found or already resolved.',
        show_alert: true,
      });
      return;
    }

    const nextStatus = decision === 'approve' ? 'approved' : 'rejected';
    await ctx.supabase
      .from('promotion_requests')
      .update({
        status: nextStatus,
        resolved_at: new Date().toISOString(),
        resolved_by_user_id: actorId,
      })
      .eq('id', req.id);

    if (decision === 'approve') {
      await applyRoleAssignment(
        ctx,
        req.target_user_id,
        req.requested_role_key as RoleKey,
        actorId,
      );
    }

    await recordAuditEvent(ctx.supabase, {
      eventKey: `rbac.promotion_${nextStatus}`,
      entityType: 'promotion_request',
      entityId: requestId,
      actorUserId: actorId,
      subjectUserId: req.target_user_id,
      payload: { role: req.requested_role_key },
    });

    await ctx.answerCallbackQuery({
      text:
        decision === 'approve'
          ? isId
            ? 'Promosi disetujui.'
            : 'Promotion approved.'
          : isId
            ? 'Promosi ditolak.'
            : 'Promotion rejected.',
    });

    const msg = fmt`${b}📨 ${requestId} — ${
      decision === 'approve'
        ? isId
          ? 'DISETUJUI'
          : 'APPROVED'
        : isId
          ? 'DITOLAK'
          : 'REJECTED'
    }${b}
${b}Target:${b} ${code}${String(req.target_user_id)}${code}
${b}Role:${b} ${code}${req.requested_role_key}${code}`;

    await ctx
      .editMessageText(msg.text, {
        entities: msg.entities,
        reply_markup: new InlineKeyboard(),
      })
      .catch(() => {});
  },
);
