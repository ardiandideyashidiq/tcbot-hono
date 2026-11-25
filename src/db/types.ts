export type RoleKey = 'owner' | 'admin' | 'developer' | 'moderator';
export type ActionType = 'warn' | 'mute' | 'ban' | 'kick';
export type ActionStatus =
  | 'active'
  | 'completed'
  | 'revoked'
  | 'expired'
  | 'superseded'
  | 'failed';
export type AppealStatus = 'pending' | 'accepted' | 'rejected' | 'withdrawn';
