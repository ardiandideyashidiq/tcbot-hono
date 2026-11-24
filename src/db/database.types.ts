export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type ChatType =
  | 'private'
  | 'group'
  | 'supergroup'
  | 'channel'
  | 'unknown';
export type ChatMemberStatus =
  | 'creator'
  | 'administrator'
  | 'member'
  | 'restricted'
  | 'left'
  | 'kicked';
export type RoleKey = 'owner' | 'admin' | 'developer' | 'moderator';
export type RoleAssignmentStatus = 'active' | 'revoked' | 'expired';
export type PromotionRequestStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'cancelled'
  | 'expired';
export type RuleSetScope = 'community' | 'chat';
export type RuleVersionStatus =
  | 'draft'
  | 'published'
  | 'superseded'
  | 'archived';
export type RuleContentFormat = 'plain_text' | 'markdown';
export type RuleAckMethod =
  | 'inline_button'
  | 'command'
  | 'join_gate'
  | 'admin_recorded'
  | 'api';
export type CaseSeverity = 'unknown' | 'low' | 'medium' | 'high' | 'critical';
export type CaseStatus =
  | 'open'
  | 'collecting_evidence'
  | 'evidence_failed'
  | 'under_review'
  | 'escalated'
  | 'resolved'
  | 'dismissed'
  | 'cancelled';
export type ActionType = 'warn' | 'mute' | 'ban' | 'kick';
export type ActionStatus =
  | 'active'
  | 'completed'
  | 'revoked'
  | 'expired'
  | 'superseded'
  | 'failed';
export type ActionOrigin = 'manual' | 'system' | 'automated' | 'ai';
export type AppealStatus = 'pending' | 'accepted' | 'rejected' | 'withdrawn';
export type ModerationMessageKind = 'log' | 'review' | 'appeal_log' | 'notice';

export interface Database {
  public: {
    Tables: {
      telegram_users: {
        Row: {
          user_id: number;
          username: string | null;
          first_name: string | null;
          last_name: string | null;
          language_code: string | null;
          is_bot: boolean;
          is_premium: boolean;
          first_seen_at: string;
          last_seen_at: string;
          created_at: string;
          updated_at: string;
          erased_at: string | null;
          erasure_reason: string | null;
        };
        Insert: {
          user_id: number;
          username?: string | null;
          first_name?: string | null;
          last_name?: string | null;
          language_code?: string | null;
          is_bot?: boolean;
          is_premium?: boolean;
          first_seen_at?: string;
          last_seen_at?: string;
          created_at?: string;
          updated_at?: string;
          erased_at?: string | null;
          erasure_reason?: string | null;
        };
        Update: {
          user_id?: number;
          username?: string | null;
          first_name?: string | null;
          last_name?: string | null;
          language_code?: string | null;
          is_bot?: boolean;
          is_premium?: boolean;
          first_seen_at?: string;
          last_seen_at?: string;
          created_at?: string;
          updated_at?: string;
          erased_at?: string | null;
          erasure_reason?: string | null;
        };
        Relationships: [];
      };
      telegram_chats: {
        Row: {
          chat_id: number;
          chat_type: ChatType;
          title: string | null;
          username: string | null;
          description: string | null;
          is_forum: boolean;
          linked_chat_id: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          chat_id: number;
          chat_type?: ChatType;
          title?: string | null;
          username?: string | null;
          description?: string | null;
          is_forum?: boolean;
          linked_chat_id?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          chat_id?: number;
          chat_type?: ChatType;
          title?: string | null;
          username?: string | null;
          description?: string | null;
          is_forum?: boolean;
          linked_chat_id?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      connected_chats: {
        Row: {
          chat_id: number;
          added_by_user_id: number | null;
          added_at: string;
          is_active: boolean;
        };
        Insert: {
          chat_id: number;
          added_by_user_id?: number | null;
          added_at?: string;
          is_active?: boolean;
        };
        Update: {
          chat_id?: number;
          added_by_user_id?: number | null;
          added_at?: string;
          is_active?: boolean;
        };
        Relationships: [];
      };
      chat_members: {
        Row: {
          chat_id: number;
          user_id: number;
          status: ChatMemberStatus;
          custom_title: string | null;
          joined_at: string | null;
          until_date: string | null;
          last_seen_at: string;
          updated_at: string;
        };
        Insert: {
          chat_id: number;
          user_id: number;
          status?: ChatMemberStatus;
          custom_title?: string | null;
          joined_at?: string | null;
          until_date?: string | null;
          last_seen_at?: string;
          updated_at?: string;
        };
        Update: {
          chat_id?: number;
          user_id?: number;
          status?: ChatMemberStatus;
          custom_title?: string | null;
          joined_at?: string | null;
          until_date?: string | null;
          last_seen_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      community_settings: {
        Row: {
          singleton_key: string;
          community: string;
          description: string | null;
          primary_chat_id: number | null;
          default_locale: string;
          timezone: string;
          settings: Json;
          updated_at: string;
        };
        Insert: {
          singleton_key?: string;
          community?: string;
          description?: string | null;
          primary_chat_id?: number | null;
          default_locale?: string;
          timezone?: string;
          settings?: Json;
          updated_at?: string;
        };
        Update: {
          singleton_key?: string;
          community?: string;
          description?: string | null;
          primary_chat_id?: number | null;
          default_locale?: string;
          timezone?: string;
          settings?: Json;
          updated_at?: string;
        };
        Relationships: [];
      };
      user_settings: {
        Row: {
          user_id: number;
          locale: string | null;
          timezone: string | null;
          preferences: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: number;
          locale?: string | null;
          timezone?: string | null;
          preferences?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          user_id?: number;
          locale?: string | null;
          timezone?: string | null;
          preferences?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      chat_settings: {
        Row: {
          chat_id: number;
          locale: string | null;
          timezone: string | null;
          settings: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          chat_id: number;
          locale?: string | null;
          timezone?: string | null;
          settings?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          chat_id?: number;
          locale?: string | null;
          timezone?: string | null;
          settings?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      role_definitions: {
        Row: {
          role_key: string;
          display_name: string;
          description: string | null;
          priority: number;
          is_system: boolean;
          created_at: string;
        };
        Insert: {
          role_key: string;
          display_name: string;
          description?: string | null;
          priority?: number;
          is_system?: boolean;
          created_at?: string;
        };
        Update: {
          role_key?: string;
          display_name?: string;
          description?: string | null;
          priority?: number;
          is_system?: boolean;
          created_at?: string;
        };
        Relationships: [];
      };
      permission_definitions: {
        Row: {
          permission_key: string;
          resource: string;
          description: string;
          created_at: string;
        };
        Insert: {
          permission_key: string;
          resource: string;
          description: string;
          created_at?: string;
        };
        Update: {
          permission_key?: string;
          resource?: string;
          description?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      role_permissions: {
        Row: {
          role_key: string;
          permission_key: string;
        };
        Insert: {
          role_key: string;
          permission_key: string;
        };
        Update: {
          role_key?: string;
          permission_key?: string;
        };
        Relationships: [];
      };
      role_assignments: {
        Row: {
          id: number;
          user_id: number;
          role_key: string;
          assigned_by_user_id: number | null;
          assigned_at: string;
          status: RoleAssignmentStatus;
          expires_at: string | null;
          revoked_at: string | null;
          revoked_by_user_id: number | null;
        };
        Insert: {
          id?: never;
          user_id: number;
          role_key: string;
          assigned_by_user_id?: number | null;
          assigned_at?: string;
          status?: RoleAssignmentStatus;
          expires_at?: string | null;
          revoked_at?: string | null;
          revoked_by_user_id?: number | null;
        };
        Update: {
          id?: never;
          user_id?: number;
          role_key?: string;
          assigned_by_user_id?: number | null;
          assigned_at?: string;
          status?: RoleAssignmentStatus;
          expires_at?: string | null;
          revoked_at?: string | null;
          revoked_by_user_id?: number | null;
        };
        Relationships: [];
      };
      promotion_requests: {
        Row: {
          id: number;
          request_id: string;
          target_user_id: number;
          requested_role_key: string;
          requested_by_user_id: number | null;
          status: PromotionRequestStatus;
          requested_at: string;
          expires_at: string | null;
          resolved_at: string | null;
          resolved_by_user_id: number | null;
          decision_note: string | null;
          metadata: Json;
        };
        Insert: {
          id?: never;
          request_id: string;
          target_user_id: number;
          requested_role_key: string;
          requested_by_user_id?: number | null;
          status?: PromotionRequestStatus;
          requested_at?: string;
          expires_at?: string | null;
          resolved_at?: string | null;
          resolved_by_user_id?: number | null;
          decision_note?: string | null;
          metadata?: Json;
        };
        Update: {
          id?: never;
          request_id?: string;
          target_user_id?: number;
          requested_role_key?: string;
          requested_by_user_id?: number | null;
          status?: PromotionRequestStatus;
          requested_at?: string;
          expires_at?: string | null;
          resolved_at?: string | null;
          resolved_by_user_id?: number | null;
          decision_note?: string | null;
          metadata?: Json;
        };
        Relationships: [];
      };
      rule_sets: {
        Row: {
          id: number;
          scope_type: RuleSetScope;
          chat_id: number | null;
          rule_set_key: string;
          name: string;
          description: string | null;
          is_active: boolean;
          requires_acknowledgement: boolean;
          created_by_user_id: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: never;
          scope_type: RuleSetScope;
          chat_id?: number | null;
          rule_set_key: string;
          name: string;
          description?: string | null;
          is_active?: boolean;
          requires_acknowledgement?: boolean;
          created_by_user_id?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: never;
          scope_type?: RuleSetScope;
          chat_id?: number | null;
          rule_set_key?: string;
          name?: string;
          description?: string | null;
          is_active?: boolean;
          requires_acknowledgement?: boolean;
          created_by_user_id?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      rule_set_versions: {
        Row: {
          id: number;
          rule_set_id: number;
          version_number: number;
          locale: string;
          status: RuleVersionStatus;
          change_summary: string | null;
          created_by_user_id: number | null;
          published_by_user_id: number | null;
          published_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: never;
          rule_set_id: number;
          version_number: number;
          locale?: string;
          status?: RuleVersionStatus;
          change_summary?: string | null;
          created_by_user_id?: number | null;
          published_by_user_id?: number | null;
          published_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: never;
          rule_set_id?: number;
          version_number?: number;
          locale?: string;
          status?: RuleVersionStatus;
          change_summary?: string | null;
          created_by_user_id?: number | null;
          published_by_user_id?: number | null;
          published_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      rule_categories: {
        Row: {
          id: number;
          rule_set_id: number;
          category_key: string;
          title: string;
          description: string | null;
          sort_order: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: never;
          rule_set_id: number;
          category_key: string;
          title: string;
          description?: string | null;
          sort_order?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: never;
          rule_set_id?: number;
          category_key?: string;
          title?: string;
          description?: string | null;
          sort_order?: number;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      rule_items: {
        Row: {
          id: number;
          rule_set_version_id: number;
          rule_key: string;
          category_key: string;
          title: string;
          body: string;
          content_format: RuleContentFormat;
          category_title: string | null;
          category_sort_order: number | null;
          sort_order: number;
          is_mandatory: boolean;
          reference_url: string | null;
          metadata: Json;
          created_at: string;
        };
        Insert: {
          id?: never;
          rule_set_version_id: number;
          rule_key: string;
          category_key: string;
          title: string;
          body: string;
          content_format?: RuleContentFormat;
          category_title?: string | null;
          category_sort_order?: number | null;
          sort_order?: number;
          is_mandatory?: boolean;
          reference_url?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Update: {
          id?: never;
          rule_set_version_id?: number;
          rule_key?: string;
          category_key?: string;
          title?: string;
          body?: string;
          content_format?: RuleContentFormat;
          category_title?: string | null;
          category_sort_order?: number | null;
          sort_order?: number;
          is_mandatory?: boolean;
          reference_url?: string | null;
          metadata?: Json;
          created_at?: string;
        };
        Relationships: [];
      };
      rule_acknowledgements: {
        Row: {
          id: number;
          rule_set_version_id: number;
          user_id: number;
          context_chat_id: number | null;
          acknowledgement_method: RuleAckMethod;
          telegram_message_id: number | null;
          acknowledged_at: string;
          metadata: Json;
        };
        Insert: {
          id?: never;
          rule_set_version_id: number;
          user_id: number;
          context_chat_id?: number | null;
          acknowledgement_method?: RuleAckMethod;
          telegram_message_id?: number | null;
          acknowledged_at?: string;
          metadata?: Json;
        };
        Update: {
          id?: never;
          rule_set_version_id?: number;
          user_id?: number;
          context_chat_id?: number | null;
          acknowledgement_method?: RuleAckMethod;
          telegram_message_id?: number | null;
          acknowledged_at?: string;
          metadata?: Json;
        };
        Relationships: [];
      };
      moderation_cases: {
        Row: {
          id: number;
          public_id: string;
          subject_user_id: number;
          case_type: string;
          title: string | null;
          summary: string | null;
          severity: CaseSeverity;
          status: CaseStatus;
          source: ActionOrigin;
          opened_by_user_id: number | null;
          assigned_to_user_id: number | null;
          closed_by_user_id: number | null;
          requires_evidence: boolean;
          metadata: Json;
          created_at: string;
          updated_at: string;
          resolved_at: string | null;
        };
        Insert: {
          id?: never;
          public_id?: string;
          subject_user_id: number;
          case_type?: string;
          title?: string | null;
          summary?: string | null;
          severity?: CaseSeverity;
          status?: CaseStatus;
          source?: ActionOrigin;
          opened_by_user_id?: number | null;
          assigned_to_user_id?: number | null;
          closed_by_user_id?: number | null;
          requires_evidence?: boolean;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
          resolved_at?: string | null;
        };
        Update: {
          id?: never;
          public_id?: string;
          subject_user_id?: number;
          case_type?: string;
          title?: string | null;
          summary?: string | null;
          severity?: CaseSeverity;
          status?: CaseStatus;
          source?: ActionOrigin;
          opened_by_user_id?: number | null;
          assigned_to_user_id?: number | null;
          closed_by_user_id?: number | null;
          requires_evidence?: boolean;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
          resolved_at?: string | null;
        };
        Relationships: [];
      };
      moderation_actions: {
        Row: {
          id: number;
          chat_id: number;
          action_type: ActionType;
          target_user_id: number;
          actor_user_id: number | null;
          reason: string | null;
          duration_seconds: number | null;
          created_at: string;
          expires_at: string | null;
          status: ActionStatus;
          revoked_at: string | null;
          revoked_by_user_id: number | null;
          external_ref: string;
          metadata: Json;
          case_id: number | null;
          supersedes_action_id: number | null;
          action_origin: ActionOrigin;
          scope_type: RuleSetScope;
          origin_chat_id: number | null;
        };
        Insert: {
          id?: never;
          chat_id: number;
          action_type: ActionType;
          target_user_id: number;
          actor_user_id?: number | null;
          reason?: string | null;
          duration_seconds?: number | null;
          created_at?: string;
          expires_at?: string | null;
          status?: ActionStatus;
          revoked_at?: string | null;
          revoked_by_user_id?: number | null;
          external_ref?: string;
          metadata?: Json;
          case_id?: number | null;
          supersedes_action_id?: number | null;
          action_origin?: ActionOrigin;
          scope_type?: RuleSetScope;
          origin_chat_id?: number | null;
        };
        Update: {
          id?: never;
          chat_id?: number;
          action_type?: ActionType;
          target_user_id?: number;
          actor_user_id?: number | null;
          reason?: string | null;
          duration_seconds?: number | null;
          created_at?: string;
          expires_at?: string | null;
          status?: ActionStatus;
          revoked_at?: string | null;
          revoked_by_user_id?: number | null;
          external_ref?: string;
          metadata?: Json;
          case_id?: number | null;
          supersedes_action_id?: number | null;
          action_origin?: ActionOrigin;
          scope_type?: RuleSetScope;
          origin_chat_id?: number | null;
        };
        Relationships: [];
      };
      moderation_appeals: {
        Row: {
          id: number;
          action_id: number;
          appellant_user_id: number;
          appeal_text: string;
          status: AppealStatus;
          submitted_at: string;
          resolved_at: string | null;
          reviewed_by_user_id: number | null;
          decision_note: string | null;
          metadata: Json;
        };
        Insert: {
          id?: never;
          action_id: number;
          appellant_user_id: number;
          appeal_text: string;
          status?: AppealStatus;
          submitted_at?: string;
          resolved_at?: string | null;
          reviewed_by_user_id?: number | null;
          decision_note?: string | null;
          metadata?: Json;
        };
        Update: {
          id?: never;
          action_id?: number;
          appellant_user_id?: number;
          appeal_text?: string;
          status?: AppealStatus;
          submitted_at?: string;
          resolved_at?: string | null;
          reviewed_by_user_id?: number | null;
          decision_note?: string | null;
          metadata?: Json;
        };
        Relationships: [];
      };
      moderation_messages: {
        Row: {
          id: number;
          action_id: number;
          chat_id: number;
          message_id: number;
          message_kind: ModerationMessageKind;
          recorded_by_user_id: number | null;
          created_at: string;
        };
        Insert: {
          id?: never;
          action_id: number;
          chat_id: number;
          message_id: number;
          message_kind: ModerationMessageKind;
          recorded_by_user_id?: number | null;
          created_at?: string;
        };
        Update: {
          id?: never;
          action_id?: number;
          chat_id?: number;
          message_id?: number;
          message_kind?: ModerationMessageKind;
          recorded_by_user_id?: number | null;
          created_at?: string;
        };
        Relationships: [];
      };
      audit_events: {
        Row: {
          id: number;
          actor_user_id: number | null;
          subject_user_id: number | null;
          event_key: string;
          entity_type: string;
          entity_id: string;
          payload: Json;
          occurred_at: string;
          case_id: number | null;
          action_id: number | null;
          correlation_id: string | null;
          operation_id: string | null;
        };
        Insert: {
          id?: never;
          actor_user_id?: number | null;
          subject_user_id?: number | null;
          event_key: string;
          entity_type: string;
          entity_id: string;
          payload?: Json;
          occurred_at?: string;
          case_id?: number | null;
          action_id?: number | null;
          correlation_id?: string | null;
          operation_id?: string | null;
        };
        Update: {
          id?: never;
          actor_user_id?: number | null;
          subject_user_id?: number | null;
          event_key?: string;
          entity_type?: string;
          entity_id?: string;
          payload?: Json;
          occurred_at?: string;
          case_id?: number | null;
          action_id?: number | null;
          correlation_id?: string | null;
          operation_id?: string | null;
        };
        Relationships: [];
      };
    };
    Views: {
      active_bans: {
        Row: {
          ban_action_id: number | null;
          ban_id: string | null;
          scope_type: RuleSetScope | null;
          chat_id: number | null;
          origin_chat_id: number | null;
          banned_user_id: number | null;
          admin_user_id: number | null;
          reason: string | null;
          timestamp: string | null;
          until_date: string | null;
          duration_seconds: number | null;
          metadata: Json | null;
        };
        Relationships: [];
      };
      active_mutes: {
        Row: {
          mute_action_id: number | null;
          mute_id: string | null;
          scope_type: RuleSetScope | null;
          chat_id: number | null;
          origin_chat_id: number | null;
          muted_user_id: number | null;
          admin_user_id: number | null;
          reason: string | null;
          timestamp: string | null;
          until_date: string | null;
          duration_seconds: number | null;
          metadata: Json | null;
        };
        Relationships: [];
      };
      warn_counts: {
        Row: {
          chat_id: number | null;
          target_user_id: number | null;
          active_warn_count: number | null;
        };
        Relationships: [];
      };
    };
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
