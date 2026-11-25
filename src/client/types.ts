export type LedgerSection =
  | 'appeals'
  | 'bans'
  | 'warns'
  | 'groups'
  | 'rules'
  | 'staff'
  | 'admins';

export type CaseStatus = 'pending' | 'locked' | 'approved' | 'rejected';
export type RuleTier = 'Ringan' | 'Sedang' | 'Berat' | 'Sangat berat';

export interface LedgerCase {
  id: string;
  externalRef: string;
  userId: number;
  displayName: string;
  username: string;
  originGroup: string;
  ruleTier: RuleTier;
  ruleTitle: string;
  reason: string;
  appealText: string;
  status: CaseStatus;
  lockedBy: string | null;
  lockExpiresIn: string | null;
  submittedAt: string;
  proofCount: number;
}
