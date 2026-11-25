export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '14.18';
  };
  public: {
    Tables: {
      admin_accounts: {
        Row: {
          created_at: string;
          created_by_admin_id: number | null;
          display_name: string;
          id: number;
          is_active: boolean;
          last_login_at: string | null;
          password_hash: string;
          role: string;
          telegram_user_id: number | null;
          token_version: number;
          updated_at: string;
          username: string;
        };
        Insert: {
          created_at?: string;
          created_by_admin_id?: number | null;
          display_name: string;
          id?: never;
          is_active?: boolean;
          last_login_at?: string | null;
          password_hash: string;
          role?: string;
          telegram_user_id?: number | null;
          token_version?: number;
          updated_at?: string;
          username: string;
        };
        Update: {
          created_at?: string;
          created_by_admin_id?: number | null;
          display_name?: string;
          id?: never;
          is_active?: boolean;
          last_login_at?: string | null;
          password_hash?: string;
          role?: string;
          telegram_user_id?: number | null;
          token_version?: number;
          updated_at?: string;
          username?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'admin_accounts_created_by_admin_id_fkey';
            columns: ['created_by_admin_id'];
            isOneToOne: false;
            referencedRelation: 'admin_accounts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'admin_accounts_telegram_user_id_fkey';
            columns: ['telegram_user_id'];
            isOneToOne: false;
            referencedRelation: 'telegram_users';
            referencedColumns: ['user_id'];
          },
        ];
      };
      audit_events: {
        Row: {
          action_id: number | null;
          actor_user_id: number | null;
          case_id: number | null;
          correlation_id: string | null;
          entity_id: string;
          entity_type: string;
          event_key: string;
          id: number;
          occurred_at: string;
          operation_id: string | null;
          payload: Json;
          subject_user_id: number | null;
        };
        Insert: {
          action_id?: number | null;
          actor_user_id?: number | null;
          case_id?: number | null;
          correlation_id?: string | null;
          entity_id: string;
          entity_type: string;
          event_key: string;
          id?: never;
          occurred_at?: string;
          operation_id?: string | null;
          payload?: Json;
          subject_user_id?: number | null;
        };
        Update: {
          action_id?: number | null;
          actor_user_id?: number | null;
          case_id?: number | null;
          correlation_id?: string | null;
          entity_id?: string;
          entity_type?: string;
          event_key?: string;
          id?: never;
          occurred_at?: string;
          operation_id?: string | null;
          payload?: Json;
          subject_user_id?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'audit_events_action_id_fkey';
            columns: ['action_id'];
            isOneToOne: false;
            referencedRelation: 'active_bans';
            referencedColumns: ['ban_action_id'];
          },
          {
            foreignKeyName: 'audit_events_action_id_fkey';
            columns: ['action_id'];
            isOneToOne: false;
            referencedRelation: 'active_mutes';
            referencedColumns: ['mute_action_id'];
          },
          {
            foreignKeyName: 'audit_events_action_id_fkey';
            columns: ['action_id'];
            isOneToOne: false;
            referencedRelation: 'moderation_actions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'audit_events_actor_user_id_fkey';
            columns: ['actor_user_id'];
            isOneToOne: false;
            referencedRelation: 'telegram_users';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'audit_events_case_id_fkey';
            columns: ['case_id'];
            isOneToOne: false;
            referencedRelation: 'moderation_cases';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'audit_events_subject_user_id_fkey';
            columns: ['subject_user_id'];
            isOneToOne: false;
            referencedRelation: 'telegram_users';
            referencedColumns: ['user_id'];
          },
        ];
      };
      broadcast_attempts: {
        Row: {
          attempt_number: number;
          attempted_at: string;
          error_code: string | null;
          error_detail: string | null;
          error_kind: string | null;
          id: number;
          outcome: string;
          response_metadata: Json;
          target_id: number;
          telegram_message_id: number | null;
        };
        Insert: {
          attempt_number: number;
          attempted_at?: string;
          error_code?: string | null;
          error_detail?: string | null;
          error_kind?: string | null;
          id?: never;
          outcome: string;
          response_metadata?: Json;
          target_id: number;
          telegram_message_id?: number | null;
        };
        Update: {
          attempt_number?: number;
          attempted_at?: string;
          error_code?: string | null;
          error_detail?: string | null;
          error_kind?: string | null;
          id?: never;
          outcome?: string;
          response_metadata?: Json;
          target_id?: number;
          telegram_message_id?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'broadcast_attempts_target_id_fkey';
            columns: ['target_id'];
            isOneToOne: false;
            referencedRelation: 'broadcast_targets';
            referencedColumns: ['id'];
          },
        ];
      };
      broadcast_campaigns: {
        Row: {
          audience_filter: Json;
          created_at: string;
          failed_count: number;
          finished_at: string | null;
          id: number;
          idempotency_key: string | null;
          message_payload: Json;
          message_text: string;
          metadata: Json;
          parse_mode: string | null;
          public_id: string;
          requested_by_user_id: number | null;
          scheduled_at: string | null;
          skipped_count: number;
          started_at: string | null;
          status: string;
          succeeded_count: number;
          target_count: number;
          title: string | null;
          updated_at: string;
        };
        Insert: {
          audience_filter?: Json;
          created_at?: string;
          failed_count?: number;
          finished_at?: string | null;
          id?: never;
          idempotency_key?: string | null;
          message_payload?: Json;
          message_text: string;
          metadata?: Json;
          parse_mode?: string | null;
          public_id?: string;
          requested_by_user_id?: number | null;
          scheduled_at?: string | null;
          skipped_count?: number;
          started_at?: string | null;
          status?: string;
          succeeded_count?: number;
          target_count?: number;
          title?: string | null;
          updated_at?: string;
        };
        Update: {
          audience_filter?: Json;
          created_at?: string;
          failed_count?: number;
          finished_at?: string | null;
          id?: never;
          idempotency_key?: string | null;
          message_payload?: Json;
          message_text?: string;
          metadata?: Json;
          parse_mode?: string | null;
          public_id?: string;
          requested_by_user_id?: number | null;
          scheduled_at?: string | null;
          skipped_count?: number;
          started_at?: string | null;
          status?: string;
          succeeded_count?: number;
          target_count?: number;
          title?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'broadcast_campaigns_requested_by_user_id_fkey';
            columns: ['requested_by_user_id'];
            isOneToOne: false;
            referencedRelation: 'telegram_users';
            referencedColumns: ['user_id'];
          },
        ];
      };
      broadcast_targets: {
        Row: {
          attempt_count: number;
          campaign_id: number;
          chat_id: number;
          completed_at: string | null;
          created_at: string;
          first_attempt_at: string | null;
          id: number;
          last_attempt_at: string | null;
          last_error_code: string | null;
          last_error_detail: string | null;
          last_error_kind: string | null;
          next_retry_at: string | null;
          response_metadata: Json;
          status: string;
          telegram_message_id: number | null;
          updated_at: string;
        };
        Insert: {
          attempt_count?: number;
          campaign_id: number;
          chat_id: number;
          completed_at?: string | null;
          created_at?: string;
          first_attempt_at?: string | null;
          id?: never;
          last_attempt_at?: string | null;
          last_error_code?: string | null;
          last_error_detail?: string | null;
          last_error_kind?: string | null;
          next_retry_at?: string | null;
          response_metadata?: Json;
          status?: string;
          telegram_message_id?: number | null;
          updated_at?: string;
        };
        Update: {
          attempt_count?: number;
          campaign_id?: number;
          chat_id?: number;
          completed_at?: string | null;
          created_at?: string;
          first_attempt_at?: string | null;
          id?: never;
          last_attempt_at?: string | null;
          last_error_code?: string | null;
          last_error_detail?: string | null;
          last_error_kind?: string | null;
          next_retry_at?: string | null;
          response_metadata?: Json;
          status?: string;
          telegram_message_id?: number | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'broadcast_targets_campaign_id_fkey';
            columns: ['campaign_id'];
            isOneToOne: false;
            referencedRelation: 'broadcast_campaigns';
            referencedColumns: ['id'];
          },
        ];
      };
      chat_members: {
        Row: {
          chat_id: number;
          custom_title: string | null;
          joined_at: string | null;
          last_seen_at: string;
          status: string;
          until_date: string | null;
          updated_at: string;
          user_id: number;
        };
        Insert: {
          chat_id: number;
          custom_title?: string | null;
          joined_at?: string | null;
          last_seen_at?: string;
          status?: string;
          until_date?: string | null;
          updated_at?: string;
          user_id: number;
        };
        Update: {
          chat_id?: number;
          custom_title?: string | null;
          joined_at?: string | null;
          last_seen_at?: string;
          status?: string;
          until_date?: string | null;
          updated_at?: string;
          user_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'chat_members_chat_id_fkey';
            columns: ['chat_id'];
            isOneToOne: false;
            referencedRelation: 'telegram_chats';
            referencedColumns: ['chat_id'];
          },
          {
            foreignKeyName: 'chat_members_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'telegram_users';
            referencedColumns: ['user_id'];
          },
        ];
      };
      chat_settings: {
        Row: {
          chat_id: number;
          created_at: string;
          locale: string | null;
          settings: Json;
          timezone: string | null;
          updated_at: string;
        };
        Insert: {
          chat_id: number;
          created_at?: string;
          locale?: string | null;
          settings?: Json;
          timezone?: string | null;
          updated_at?: string;
        };
        Update: {
          chat_id?: number;
          created_at?: string;
          locale?: string | null;
          settings?: Json;
          timezone?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'chat_settings_chat_id_fkey';
            columns: ['chat_id'];
            isOneToOne: true;
            referencedRelation: 'telegram_chats';
            referencedColumns: ['chat_id'];
          },
        ];
      };
      community_settings: {
        Row: {
          community: string;
          default_locale: string;
          description: string | null;
          primary_chat_id: number | null;
          settings: Json;
          singleton_key: string;
          timezone: string;
          updated_at: string;
        };
        Insert: {
          community?: string;
          default_locale?: string;
          description?: string | null;
          primary_chat_id?: number | null;
          settings?: Json;
          singleton_key?: string;
          timezone?: string;
          updated_at?: string;
        };
        Update: {
          community?: string;
          default_locale?: string;
          description?: string | null;
          primary_chat_id?: number | null;
          settings?: Json;
          singleton_key?: string;
          timezone?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      connected_chats: {
        Row: {
          added_at: string;
          added_by_user_id: number | null;
          chat_id: number;
          is_active: boolean;
        };
        Insert: {
          added_at?: string;
          added_by_user_id?: number | null;
          chat_id: number;
          is_active?: boolean;
        };
        Update: {
          added_at?: string;
          added_by_user_id?: number | null;
          chat_id?: number;
          is_active?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: 'connected_chats_added_by_user_id_fkey';
            columns: ['added_by_user_id'];
            isOneToOne: false;
            referencedRelation: 'telegram_users';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'connected_chats_chat_id_fkey';
            columns: ['chat_id'];
            isOneToOne: true;
            referencedRelation: 'telegram_chats';
            referencedColumns: ['chat_id'];
          },
        ];
      };
      join_requests: {
        Row: {
          chat_id: number;
          decision_note: string | null;
          id: number;
          metadata: Json;
          owner_user_id: number;
          request_message_id: number | null;
          requested_at: string;
          resolved_at: string | null;
          resolved_by_user_id: number | null;
          status: string;
        };
        Insert: {
          chat_id: number;
          decision_note?: string | null;
          id?: never;
          metadata?: Json;
          owner_user_id: number;
          request_message_id?: number | null;
          requested_at?: string;
          resolved_at?: string | null;
          resolved_by_user_id?: number | null;
          status?: string;
        };
        Update: {
          chat_id?: number;
          decision_note?: string | null;
          id?: never;
          metadata?: Json;
          owner_user_id?: number;
          request_message_id?: number | null;
          requested_at?: string;
          resolved_at?: string | null;
          resolved_by_user_id?: number | null;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'join_requests_chat_id_fkey';
            columns: ['chat_id'];
            isOneToOne: false;
            referencedRelation: 'telegram_chats';
            referencedColumns: ['chat_id'];
          },
          {
            foreignKeyName: 'join_requests_owner_user_id_fkey';
            columns: ['owner_user_id'];
            isOneToOne: false;
            referencedRelation: 'telegram_users';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'join_requests_resolved_by_user_id_fkey';
            columns: ['resolved_by_user_id'];
            isOneToOne: false;
            referencedRelation: 'telegram_users';
            referencedColumns: ['user_id'];
          },
        ];
      };
      moderation_actions: {
        Row: {
          action_origin: string;
          action_type: string;
          actor_user_id: number | null;
          case_id: number | null;
          chat_id: number;
          created_at: string;
          duration_seconds: number | null;
          expires_at: string | null;
          external_ref: string;
          id: number;
          metadata: Json;
          origin_chat_id: number | null;
          reason: string | null;
          revoked_at: string | null;
          revoked_by_user_id: number | null;
          scope_type: string;
          status: string;
          supersedes_action_id: number | null;
          target_user_id: number;
        };
        Insert: {
          action_origin?: string;
          action_type: string;
          actor_user_id?: number | null;
          case_id?: number | null;
          chat_id: number;
          created_at?: string;
          duration_seconds?: number | null;
          expires_at?: string | null;
          external_ref?: string;
          id?: never;
          metadata?: Json;
          origin_chat_id?: number | null;
          reason?: string | null;
          revoked_at?: string | null;
          revoked_by_user_id?: number | null;
          scope_type?: string;
          status?: string;
          supersedes_action_id?: number | null;
          target_user_id: number;
        };
        Update: {
          action_origin?: string;
          action_type?: string;
          actor_user_id?: number | null;
          case_id?: number | null;
          chat_id?: number;
          created_at?: string;
          duration_seconds?: number | null;
          expires_at?: string | null;
          external_ref?: string;
          id?: never;
          metadata?: Json;
          origin_chat_id?: number | null;
          reason?: string | null;
          revoked_at?: string | null;
          revoked_by_user_id?: number | null;
          scope_type?: string;
          status?: string;
          supersedes_action_id?: number | null;
          target_user_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'moderation_actions_actor_user_id_fkey';
            columns: ['actor_user_id'];
            isOneToOne: false;
            referencedRelation: 'telegram_users';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'moderation_actions_case_id_fkey';
            columns: ['case_id'];
            isOneToOne: false;
            referencedRelation: 'moderation_cases';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'moderation_actions_chat_id_fkey';
            columns: ['chat_id'];
            isOneToOne: false;
            referencedRelation: 'telegram_chats';
            referencedColumns: ['chat_id'];
          },
          {
            foreignKeyName: 'moderation_actions_revoked_by_user_id_fkey';
            columns: ['revoked_by_user_id'];
            isOneToOne: false;
            referencedRelation: 'telegram_users';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'moderation_actions_supersedes_action_id_fkey';
            columns: ['supersedes_action_id'];
            isOneToOne: false;
            referencedRelation: 'active_bans';
            referencedColumns: ['ban_action_id'];
          },
          {
            foreignKeyName: 'moderation_actions_supersedes_action_id_fkey';
            columns: ['supersedes_action_id'];
            isOneToOne: false;
            referencedRelation: 'active_mutes';
            referencedColumns: ['mute_action_id'];
          },
          {
            foreignKeyName: 'moderation_actions_supersedes_action_id_fkey';
            columns: ['supersedes_action_id'];
            isOneToOne: false;
            referencedRelation: 'moderation_actions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'moderation_actions_target_user_id_fkey';
            columns: ['target_user_id'];
            isOneToOne: false;
            referencedRelation: 'telegram_users';
            referencedColumns: ['user_id'];
          },
        ];
      };
      moderation_appeals: {
        Row: {
          action_id: number;
          appeal_text: string;
          appellant_user_id: number;
          decision_note: string | null;
          id: number;
          metadata: Json;
          resolved_at: string | null;
          reviewed_by_user_id: number | null;
          status: string;
          submitted_at: string;
        };
        Insert: {
          action_id: number;
          appeal_text: string;
          appellant_user_id: number;
          decision_note?: string | null;
          id?: never;
          metadata?: Json;
          resolved_at?: string | null;
          reviewed_by_user_id?: number | null;
          status?: string;
          submitted_at?: string;
        };
        Update: {
          action_id?: number;
          appeal_text?: string;
          appellant_user_id?: number;
          decision_note?: string | null;
          id?: never;
          metadata?: Json;
          resolved_at?: string | null;
          reviewed_by_user_id?: number | null;
          status?: string;
          submitted_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'moderation_appeals_action_id_fkey';
            columns: ['action_id'];
            isOneToOne: false;
            referencedRelation: 'active_bans';
            referencedColumns: ['ban_action_id'];
          },
          {
            foreignKeyName: 'moderation_appeals_action_id_fkey';
            columns: ['action_id'];
            isOneToOne: false;
            referencedRelation: 'active_mutes';
            referencedColumns: ['mute_action_id'];
          },
          {
            foreignKeyName: 'moderation_appeals_action_id_fkey';
            columns: ['action_id'];
            isOneToOne: false;
            referencedRelation: 'moderation_actions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'moderation_appeals_appellant_user_id_fkey';
            columns: ['appellant_user_id'];
            isOneToOne: false;
            referencedRelation: 'telegram_users';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'moderation_appeals_reviewed_by_user_id_fkey';
            columns: ['reviewed_by_user_id'];
            isOneToOne: false;
            referencedRelation: 'telegram_users';
            referencedColumns: ['user_id'];
          },
        ];
      };
      moderation_case_rules: {
        Row: {
          attribution_source: string;
          case_id: number;
          context_chat_id: number | null;
          created_at: string;
          linked_by_user_id: number | null;
          note: string | null;
          rule_item_id: number;
        };
        Insert: {
          attribution_source?: string;
          case_id: number;
          context_chat_id?: number | null;
          created_at?: string;
          linked_by_user_id?: number | null;
          note?: string | null;
          rule_item_id: number;
        };
        Update: {
          attribution_source?: string;
          case_id?: number;
          context_chat_id?: number | null;
          created_at?: string;
          linked_by_user_id?: number | null;
          note?: string | null;
          rule_item_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'moderation_case_rules_case_id_fkey';
            columns: ['case_id'];
            isOneToOne: false;
            referencedRelation: 'moderation_cases';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'moderation_case_rules_linked_by_user_id_fkey';
            columns: ['linked_by_user_id'];
            isOneToOne: false;
            referencedRelation: 'telegram_users';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'moderation_case_rules_rule_item_id_fkey';
            columns: ['rule_item_id'];
            isOneToOne: false;
            referencedRelation: 'rule_items';
            referencedColumns: ['id'];
          },
        ];
      };
      moderation_cases: {
        Row: {
          assigned_to_user_id: number | null;
          case_type: string;
          closed_by_user_id: number | null;
          created_at: string;
          id: number;
          metadata: Json;
          opened_by_user_id: number | null;
          public_id: string;
          requires_evidence: boolean;
          resolved_at: string | null;
          severity: string;
          source: string;
          status: string;
          subject_user_id: number;
          summary: string | null;
          title: string | null;
          updated_at: string;
        };
        Insert: {
          assigned_to_user_id?: number | null;
          case_type?: string;
          closed_by_user_id?: number | null;
          created_at?: string;
          id?: never;
          metadata?: Json;
          opened_by_user_id?: number | null;
          public_id?: string;
          requires_evidence?: boolean;
          resolved_at?: string | null;
          severity?: string;
          source?: string;
          status?: string;
          subject_user_id: number;
          summary?: string | null;
          title?: string | null;
          updated_at?: string;
        };
        Update: {
          assigned_to_user_id?: number | null;
          case_type?: string;
          closed_by_user_id?: number | null;
          created_at?: string;
          id?: never;
          metadata?: Json;
          opened_by_user_id?: number | null;
          public_id?: string;
          requires_evidence?: boolean;
          resolved_at?: string | null;
          severity?: string;
          source?: string;
          status?: string;
          subject_user_id?: number;
          summary?: string | null;
          title?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'moderation_cases_assigned_to_user_id_fkey';
            columns: ['assigned_to_user_id'];
            isOneToOne: false;
            referencedRelation: 'telegram_users';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'moderation_cases_closed_by_user_id_fkey';
            columns: ['closed_by_user_id'];
            isOneToOne: false;
            referencedRelation: 'telegram_users';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'moderation_cases_opened_by_user_id_fkey';
            columns: ['opened_by_user_id'];
            isOneToOne: false;
            referencedRelation: 'telegram_users';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'moderation_cases_subject_user_id_fkey';
            columns: ['subject_user_id'];
            isOneToOne: false;
            referencedRelation: 'telegram_users';
            referencedColumns: ['user_id'];
          },
        ];
      };
      moderation_enforcement_attempts: {
        Row: {
          attempt_number: number;
          attempted_at: string;
          error_code: string | null;
          error_detail: string | null;
          error_kind: string | null;
          id: number;
          outcome: string;
          response_metadata: Json;
          target_id: number;
        };
        Insert: {
          attempt_number: number;
          attempted_at?: string;
          error_code?: string | null;
          error_detail?: string | null;
          error_kind?: string | null;
          id?: never;
          outcome: string;
          response_metadata?: Json;
          target_id: number;
        };
        Update: {
          attempt_number?: number;
          attempted_at?: string;
          error_code?: string | null;
          error_detail?: string | null;
          error_kind?: string | null;
          id?: never;
          outcome?: string;
          response_metadata?: Json;
          target_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'moderation_enforcement_attempts_target_id_fkey';
            columns: ['target_id'];
            isOneToOne: false;
            referencedRelation: 'moderation_enforcement_targets';
            referencedColumns: ['id'];
          },
        ];
      };
      moderation_enforcement_runs: {
        Row: {
          action_id: number;
          created_at: string;
          failed_count: number;
          finished_at: string | null;
          id: number;
          idempotency_key: string | null;
          metadata: Json;
          operation: string;
          requested_by_user_id: number | null;
          skipped_count: number;
          started_at: string | null;
          status: string;
          succeeded_count: number;
          target_count: number;
          updated_at: string;
        };
        Insert: {
          action_id: number;
          created_at?: string;
          failed_count?: number;
          finished_at?: string | null;
          id?: never;
          idempotency_key?: string | null;
          metadata?: Json;
          operation: string;
          requested_by_user_id?: number | null;
          skipped_count?: number;
          started_at?: string | null;
          status?: string;
          succeeded_count?: number;
          target_count?: number;
          updated_at?: string;
        };
        Update: {
          action_id?: number;
          created_at?: string;
          failed_count?: number;
          finished_at?: string | null;
          id?: never;
          idempotency_key?: string | null;
          metadata?: Json;
          operation?: string;
          requested_by_user_id?: number | null;
          skipped_count?: number;
          started_at?: string | null;
          status?: string;
          succeeded_count?: number;
          target_count?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'moderation_enforcement_runs_action_id_fkey';
            columns: ['action_id'];
            isOneToOne: false;
            referencedRelation: 'active_bans';
            referencedColumns: ['ban_action_id'];
          },
          {
            foreignKeyName: 'moderation_enforcement_runs_action_id_fkey';
            columns: ['action_id'];
            isOneToOne: false;
            referencedRelation: 'active_mutes';
            referencedColumns: ['mute_action_id'];
          },
          {
            foreignKeyName: 'moderation_enforcement_runs_action_id_fkey';
            columns: ['action_id'];
            isOneToOne: false;
            referencedRelation: 'moderation_actions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'moderation_enforcement_runs_requested_by_user_id_fkey';
            columns: ['requested_by_user_id'];
            isOneToOne: false;
            referencedRelation: 'telegram_users';
            referencedColumns: ['user_id'];
          },
        ];
      };
      moderation_enforcement_targets: {
        Row: {
          attempt_count: number;
          chat_id: number;
          completed_at: string | null;
          created_at: string;
          first_attempt_at: string | null;
          id: number;
          last_attempt_at: string | null;
          last_error_code: string | null;
          last_error_detail: string | null;
          last_error_kind: string | null;
          next_retry_at: string | null;
          response_metadata: Json;
          run_id: number;
          status: string;
          updated_at: string;
        };
        Insert: {
          attempt_count?: number;
          chat_id: number;
          completed_at?: string | null;
          created_at?: string;
          first_attempt_at?: string | null;
          id?: never;
          last_attempt_at?: string | null;
          last_error_code?: string | null;
          last_error_detail?: string | null;
          last_error_kind?: string | null;
          next_retry_at?: string | null;
          response_metadata?: Json;
          run_id: number;
          status?: string;
          updated_at?: string;
        };
        Update: {
          attempt_count?: number;
          chat_id?: number;
          completed_at?: string | null;
          created_at?: string;
          first_attempt_at?: string | null;
          id?: never;
          last_attempt_at?: string | null;
          last_error_code?: string | null;
          last_error_detail?: string | null;
          last_error_kind?: string | null;
          next_retry_at?: string | null;
          response_metadata?: Json;
          run_id?: number;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'moderation_enforcement_targets_run_id_fkey';
            columns: ['run_id'];
            isOneToOne: false;
            referencedRelation: 'moderation_enforcement_runs';
            referencedColumns: ['id'];
          },
        ];
      };
      moderation_evidence_items: {
        Row: {
          archive_message_id: number;
          archive_message_url: string | null;
          caption_text: string | null;
          created_at: string;
          destination_chat_id: number;
          duration_seconds: number | null;
          file_name: string | null;
          file_size_bytes: number | null;
          file_unique_id: string | null;
          height: number | null;
          id: number;
          item_order: number;
          media_group_id: string | null;
          media_type: string;
          metadata: Json;
          mime_type: string | null;
          sha256_hex: string | null;
          source_chat_id: number | null;
          source_message_id: number | null;
          upload_id: number;
          width: number | null;
        };
        Insert: {
          archive_message_id: number;
          archive_message_url?: string | null;
          caption_text?: string | null;
          created_at?: string;
          destination_chat_id: number;
          duration_seconds?: number | null;
          file_name?: string | null;
          file_size_bytes?: number | null;
          file_unique_id?: string | null;
          height?: number | null;
          id?: never;
          item_order?: number;
          media_group_id?: string | null;
          media_type: string;
          metadata?: Json;
          mime_type?: string | null;
          sha256_hex?: string | null;
          source_chat_id?: number | null;
          source_message_id?: number | null;
          upload_id: number;
          width?: number | null;
        };
        Update: {
          archive_message_id?: number;
          archive_message_url?: string | null;
          caption_text?: string | null;
          created_at?: string;
          destination_chat_id?: number;
          duration_seconds?: number | null;
          file_name?: string | null;
          file_size_bytes?: number | null;
          file_unique_id?: string | null;
          height?: number | null;
          id?: never;
          item_order?: number;
          media_group_id?: string | null;
          media_type?: string;
          metadata?: Json;
          mime_type?: string | null;
          sha256_hex?: string | null;
          source_chat_id?: number | null;
          source_message_id?: number | null;
          upload_id?: number;
          width?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'moderation_evidence_items_upload_id_fkey';
            columns: ['upload_id'];
            isOneToOne: false;
            referencedRelation: 'moderation_evidence_uploads';
            referencedColumns: ['id'];
          },
        ];
      };
      moderation_evidence_uploads: {
        Row: {
          case_id: number;
          created_at: string;
          destination_chat_id: number;
          destination_thread_id: number | null;
          expected_item_count: number | null;
          failure_code: string | null;
          failure_detail: string | null;
          finished_at: string | null;
          id: number;
          idempotency_key: string | null;
          is_required: boolean;
          metadata: Json;
          primary_message_id: number | null;
          started_at: string | null;
          status: string;
          updated_at: string;
          uploaded_by_user_id: number | null;
        };
        Insert: {
          case_id: number;
          created_at?: string;
          destination_chat_id: number;
          destination_thread_id?: number | null;
          expected_item_count?: number | null;
          failure_code?: string | null;
          failure_detail?: string | null;
          finished_at?: string | null;
          id?: never;
          idempotency_key?: string | null;
          is_required?: boolean;
          metadata?: Json;
          primary_message_id?: number | null;
          started_at?: string | null;
          status?: string;
          updated_at?: string;
          uploaded_by_user_id?: number | null;
        };
        Update: {
          case_id?: number;
          created_at?: string;
          destination_chat_id?: number;
          destination_thread_id?: number | null;
          expected_item_count?: number | null;
          failure_code?: string | null;
          failure_detail?: string | null;
          finished_at?: string | null;
          id?: never;
          idempotency_key?: string | null;
          is_required?: boolean;
          metadata?: Json;
          primary_message_id?: number | null;
          started_at?: string | null;
          status?: string;
          updated_at?: string;
          uploaded_by_user_id?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'moderation_evidence_uploads_case_id_fkey';
            columns: ['case_id'];
            isOneToOne: false;
            referencedRelation: 'moderation_cases';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'moderation_evidence_uploads_uploaded_by_user_id_fkey';
            columns: ['uploaded_by_user_id'];
            isOneToOne: false;
            referencedRelation: 'telegram_users';
            referencedColumns: ['user_id'];
          },
        ];
      };
      moderation_messages: {
        Row: {
          action_id: number;
          chat_id: number;
          created_at: string;
          id: number;
          message_id: number;
          message_kind: string;
          recorded_by_user_id: number | null;
        };
        Insert: {
          action_id: number;
          chat_id: number;
          created_at?: string;
          id?: never;
          message_id: number;
          message_kind: string;
          recorded_by_user_id?: number | null;
        };
        Update: {
          action_id?: number;
          chat_id?: number;
          created_at?: string;
          id?: never;
          message_id?: number;
          message_kind?: string;
          recorded_by_user_id?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'moderation_messages_action_id_fkey';
            columns: ['action_id'];
            isOneToOne: false;
            referencedRelation: 'active_bans';
            referencedColumns: ['ban_action_id'];
          },
          {
            foreignKeyName: 'moderation_messages_action_id_fkey';
            columns: ['action_id'];
            isOneToOne: false;
            referencedRelation: 'active_mutes';
            referencedColumns: ['mute_action_id'];
          },
          {
            foreignKeyName: 'moderation_messages_action_id_fkey';
            columns: ['action_id'];
            isOneToOne: false;
            referencedRelation: 'moderation_actions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'moderation_messages_recorded_by_user_id_fkey';
            columns: ['recorded_by_user_id'];
            isOneToOne: false;
            referencedRelation: 'telegram_users';
            referencedColumns: ['user_id'];
          },
        ];
      };
      moderation_notification_tasks: {
        Row: {
          action_id: number;
          attempts: number;
          chat_id: number;
          created_at: string;
          id: number;
          kind: string;
          last_error: string | null;
          message_id: number;
          next_retry_at: string;
          state: string;
          updated_at: string;
        };
        Insert: {
          action_id: number;
          attempts?: number;
          chat_id: number;
          created_at?: string;
          id?: never;
          kind?: string;
          last_error?: string | null;
          message_id: number;
          next_retry_at?: string;
          state?: string;
          updated_at?: string;
        };
        Update: {
          action_id?: number;
          attempts?: number;
          chat_id?: number;
          created_at?: string;
          id?: never;
          kind?: string;
          last_error?: string | null;
          message_id?: number;
          next_retry_at?: string;
          state?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'moderation_notification_tasks_action_id_fkey';
            columns: ['action_id'];
            isOneToOne: false;
            referencedRelation: 'active_bans';
            referencedColumns: ['ban_action_id'];
          },
          {
            foreignKeyName: 'moderation_notification_tasks_action_id_fkey';
            columns: ['action_id'];
            isOneToOne: false;
            referencedRelation: 'active_mutes';
            referencedColumns: ['mute_action_id'];
          },
          {
            foreignKeyName: 'moderation_notification_tasks_action_id_fkey';
            columns: ['action_id'];
            isOneToOne: false;
            referencedRelation: 'moderation_actions';
            referencedColumns: ['id'];
          },
        ];
      };
      permission_definitions: {
        Row: {
          created_at: string;
          description: string;
          permission_key: string;
          resource: string;
        };
        Insert: {
          created_at?: string;
          description: string;
          permission_key: string;
          resource: string;
        };
        Update: {
          created_at?: string;
          description?: string;
          permission_key?: string;
          resource?: string;
        };
        Relationships: [];
      };
      promotion_requests: {
        Row: {
          decision_note: string | null;
          expires_at: string | null;
          id: number;
          metadata: Json;
          request_id: string;
          requested_at: string;
          requested_by_user_id: number | null;
          requested_role_key: string;
          resolved_at: string | null;
          resolved_by_user_id: number | null;
          status: string;
          target_user_id: number;
        };
        Insert: {
          decision_note?: string | null;
          expires_at?: string | null;
          id?: never;
          metadata?: Json;
          request_id: string;
          requested_at?: string;
          requested_by_user_id?: number | null;
          requested_role_key: string;
          resolved_at?: string | null;
          resolved_by_user_id?: number | null;
          status?: string;
          target_user_id: number;
        };
        Update: {
          decision_note?: string | null;
          expires_at?: string | null;
          id?: never;
          metadata?: Json;
          request_id?: string;
          requested_at?: string;
          requested_by_user_id?: number | null;
          requested_role_key?: string;
          resolved_at?: string | null;
          resolved_by_user_id?: number | null;
          status?: string;
          target_user_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'promotion_requests_requested_by_user_id_fkey';
            columns: ['requested_by_user_id'];
            isOneToOne: false;
            referencedRelation: 'telegram_users';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'promotion_requests_requested_role_key_fkey';
            columns: ['requested_role_key'];
            isOneToOne: false;
            referencedRelation: 'role_definitions';
            referencedColumns: ['role_key'];
          },
          {
            foreignKeyName: 'promotion_requests_requested_role_key_fkey';
            columns: ['requested_role_key'];
            isOneToOne: false;
            referencedRelation: 'role_permission_matrix';
            referencedColumns: ['role_key'];
          },
          {
            foreignKeyName: 'promotion_requests_resolved_by_user_id_fkey';
            columns: ['resolved_by_user_id'];
            isOneToOne: false;
            referencedRelation: 'telegram_users';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'promotion_requests_target_user_id_fkey';
            columns: ['target_user_id'];
            isOneToOne: false;
            referencedRelation: 'telegram_users';
            referencedColumns: ['user_id'];
          },
        ];
      };
      role_assignments: {
        Row: {
          assigned_at: string;
          assigned_by_user_id: number | null;
          expires_at: string | null;
          id: number;
          revoked_at: string | null;
          revoked_by_user_id: number | null;
          role_key: string;
          status: string;
          user_id: number;
        };
        Insert: {
          assigned_at?: string;
          assigned_by_user_id?: number | null;
          expires_at?: string | null;
          id?: never;
          revoked_at?: string | null;
          revoked_by_user_id?: number | null;
          role_key: string;
          status?: string;
          user_id: number;
        };
        Update: {
          assigned_at?: string;
          assigned_by_user_id?: number | null;
          expires_at?: string | null;
          id?: never;
          revoked_at?: string | null;
          revoked_by_user_id?: number | null;
          role_key?: string;
          status?: string;
          user_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'role_assignments_assigned_by_user_id_fkey';
            columns: ['assigned_by_user_id'];
            isOneToOne: false;
            referencedRelation: 'telegram_users';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'role_assignments_revoked_by_user_id_fkey';
            columns: ['revoked_by_user_id'];
            isOneToOne: false;
            referencedRelation: 'telegram_users';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'role_assignments_role_key_fkey';
            columns: ['role_key'];
            isOneToOne: false;
            referencedRelation: 'role_definitions';
            referencedColumns: ['role_key'];
          },
          {
            foreignKeyName: 'role_assignments_role_key_fkey';
            columns: ['role_key'];
            isOneToOne: false;
            referencedRelation: 'role_permission_matrix';
            referencedColumns: ['role_key'];
          },
          {
            foreignKeyName: 'role_assignments_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'telegram_users';
            referencedColumns: ['user_id'];
          },
        ];
      };
      role_definitions: {
        Row: {
          created_at: string;
          description: string | null;
          display_name: string;
          is_system: boolean;
          priority: number;
          role_key: string;
        };
        Insert: {
          created_at?: string;
          description?: string | null;
          display_name: string;
          is_system?: boolean;
          priority?: number;
          role_key: string;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          display_name?: string;
          is_system?: boolean;
          priority?: number;
          role_key?: string;
        };
        Relationships: [];
      };
      role_permissions: {
        Row: {
          permission_key: string;
          role_key: string;
        };
        Insert: {
          permission_key: string;
          role_key: string;
        };
        Update: {
          permission_key?: string;
          role_key?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'role_permissions_permission_key_fkey';
            columns: ['permission_key'];
            isOneToOne: false;
            referencedRelation: 'permission_definitions';
            referencedColumns: ['permission_key'];
          },
          {
            foreignKeyName: 'role_permissions_role_key_fkey';
            columns: ['role_key'];
            isOneToOne: false;
            referencedRelation: 'role_definitions';
            referencedColumns: ['role_key'];
          },
          {
            foreignKeyName: 'role_permissions_role_key_fkey';
            columns: ['role_key'];
            isOneToOne: false;
            referencedRelation: 'role_permission_matrix';
            referencedColumns: ['role_key'];
          },
        ];
      };
      rule_acknowledgements: {
        Row: {
          acknowledged_at: string;
          acknowledgement_method: string;
          context_chat_id: number | null;
          id: number;
          metadata: Json;
          rule_set_version_id: number;
          telegram_message_id: number | null;
          user_id: number;
        };
        Insert: {
          acknowledged_at?: string;
          acknowledgement_method?: string;
          context_chat_id?: number | null;
          id?: never;
          metadata?: Json;
          rule_set_version_id: number;
          telegram_message_id?: number | null;
          user_id: number;
        };
        Update: {
          acknowledged_at?: string;
          acknowledgement_method?: string;
          context_chat_id?: number | null;
          id?: never;
          metadata?: Json;
          rule_set_version_id?: number;
          telegram_message_id?: number | null;
          user_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'rule_acknowledgements_rule_set_version_id_fkey';
            columns: ['rule_set_version_id'];
            isOneToOne: false;
            referencedRelation: 'rule_set_versions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rule_acknowledgements_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'telegram_users';
            referencedColumns: ['user_id'];
          },
        ];
      };
      rule_categories: {
        Row: {
          category_key: string;
          created_at: string;
          description: string | null;
          id: number;
          is_active: boolean;
          rule_set_id: number;
          sort_order: number;
          title: string;
          updated_at: string;
        };
        Insert: {
          category_key: string;
          created_at?: string;
          description?: string | null;
          id?: never;
          is_active?: boolean;
          rule_set_id: number;
          sort_order?: number;
          title: string;
          updated_at?: string;
        };
        Update: {
          category_key?: string;
          created_at?: string;
          description?: string | null;
          id?: never;
          is_active?: boolean;
          rule_set_id?: number;
          sort_order?: number;
          title?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'rule_categories_rule_set_id_fkey';
            columns: ['rule_set_id'];
            isOneToOne: false;
            referencedRelation: 'rule_sets';
            referencedColumns: ['id'];
          },
        ];
      };
      rule_category_content: {
        Row: {
          category_key: string;
          created_at: string;
          description: string | null;
          id: number;
          label: string;
          locale: string;
          rule_set_id: number;
          updated_at: string;
        };
        Insert: {
          category_key: string;
          created_at?: string;
          description?: string | null;
          id?: never;
          label: string;
          locale: string;
          rule_set_id: number;
          updated_at?: string;
        };
        Update: {
          category_key?: string;
          created_at?: string;
          description?: string | null;
          id?: never;
          label?: string;
          locale?: string;
          rule_set_id?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'rule_category_content_rule_set_id_fkey';
            columns: ['rule_set_id'];
            isOneToOne: false;
            referencedRelation: 'rule_sets';
            referencedColumns: ['id'];
          },
        ];
      };
      rule_items: {
        Row: {
          body: string;
          category_key: string;
          category_sort_order: number | null;
          category_title: string | null;
          content_format: string;
          created_at: string;
          id: number;
          is_mandatory: boolean;
          metadata: Json;
          reference_url: string | null;
          rule_key: string;
          rule_set_version_id: number;
          sort_order: number;
          title: string;
        };
        Insert: {
          body: string;
          category_key: string;
          category_sort_order?: number | null;
          category_title?: string | null;
          content_format?: string;
          created_at?: string;
          id?: never;
          is_mandatory?: boolean;
          metadata?: Json;
          reference_url?: string | null;
          rule_key: string;
          rule_set_version_id: number;
          sort_order?: number;
          title: string;
        };
        Update: {
          body?: string;
          category_key?: string;
          category_sort_order?: number | null;
          category_title?: string | null;
          content_format?: string;
          created_at?: string;
          id?: never;
          is_mandatory?: boolean;
          metadata?: Json;
          reference_url?: string | null;
          rule_key?: string;
          rule_set_version_id?: number;
          sort_order?: number;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'rule_items_rule_set_version_id_fkey';
            columns: ['rule_set_version_id'];
            isOneToOne: false;
            referencedRelation: 'rule_set_versions';
            referencedColumns: ['id'];
          },
        ];
      };
      rule_publication_runs: {
        Row: {
          chat_id: number;
          created_at: string;
          error: string | null;
          finished_at: string | null;
          id: number;
          lease_expires_at: string | null;
          rule_set_id: number;
          rule_set_version_id: number;
          started_at: string;
          status: string;
        };
        Insert: {
          chat_id: number;
          created_at?: string;
          error?: string | null;
          finished_at?: string | null;
          id?: never;
          lease_expires_at?: string | null;
          rule_set_id: number;
          rule_set_version_id: number;
          started_at?: string;
          status?: string;
        };
        Update: {
          chat_id?: number;
          created_at?: string;
          error?: string | null;
          finished_at?: string | null;
          id?: never;
          lease_expires_at?: string | null;
          rule_set_id?: number;
          rule_set_version_id?: number;
          started_at?: string;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'rule_publication_runs_rule_set_id_fkey';
            columns: ['rule_set_id'];
            isOneToOne: false;
            referencedRelation: 'rule_sets';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rule_publication_runs_rule_set_version_id_fkey';
            columns: ['rule_set_version_id'];
            isOneToOne: false;
            referencedRelation: 'rule_set_versions';
            referencedColumns: ['id'];
          },
        ];
      };
      rule_publications: {
        Row: {
          category_key: string;
          chat_id: number;
          content_hash: string | null;
          created_at: string;
          id: number;
          last_error: string | null;
          last_synced_at: string | null;
          locale: string;
          message_id: number | null;
          message_thread_id: number | null;
          part_index: number;
          rule_set_id: number;
          rule_set_version_id: number;
          run_id: number | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          category_key: string;
          chat_id: number;
          content_hash?: string | null;
          created_at?: string;
          id?: never;
          last_error?: string | null;
          last_synced_at?: string | null;
          locale?: string;
          message_id?: number | null;
          message_thread_id?: number | null;
          part_index?: number;
          rule_set_id: number;
          rule_set_version_id: number;
          run_id?: number | null;
          status?: string;
          updated_at?: string;
        };
        Update: {
          category_key?: string;
          chat_id?: number;
          content_hash?: string | null;
          created_at?: string;
          id?: never;
          last_error?: string | null;
          last_synced_at?: string | null;
          locale?: string;
          message_id?: number | null;
          message_thread_id?: number | null;
          part_index?: number;
          rule_set_id?: number;
          rule_set_version_id?: number;
          run_id?: number | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'rule_publications_rule_set_id_fkey';
            columns: ['rule_set_id'];
            isOneToOne: false;
            referencedRelation: 'rule_sets';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rule_publications_rule_set_version_id_fkey';
            columns: ['rule_set_version_id'];
            isOneToOne: false;
            referencedRelation: 'rule_set_versions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'rule_publications_run_id_fkey';
            columns: ['run_id'];
            isOneToOne: false;
            referencedRelation: 'rule_publication_runs';
            referencedColumns: ['id'];
          },
        ];
      };
      rule_set_versions: {
        Row: {
          change_summary: string | null;
          created_at: string;
          created_by_user_id: number | null;
          id: number;
          locale: string;
          published_at: string | null;
          published_by_user_id: number | null;
          rule_set_id: number;
          status: string;
          updated_at: string;
          version_number: number;
        };
        Insert: {
          change_summary?: string | null;
          created_at?: string;
          created_by_user_id?: number | null;
          id?: never;
          locale?: string;
          published_at?: string | null;
          published_by_user_id?: number | null;
          rule_set_id: number;
          status?: string;
          updated_at?: string;
          version_number: number;
        };
        Update: {
          change_summary?: string | null;
          created_at?: string;
          created_by_user_id?: number | null;
          id?: never;
          locale?: string;
          published_at?: string | null;
          published_by_user_id?: number | null;
          rule_set_id?: number;
          status?: string;
          updated_at?: string;
          version_number?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'rule_set_versions_created_by_user_id_fkey';
            columns: ['created_by_user_id'];
            isOneToOne: false;
            referencedRelation: 'telegram_users';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'rule_set_versions_published_by_user_id_fkey';
            columns: ['published_by_user_id'];
            isOneToOne: false;
            referencedRelation: 'telegram_users';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'rule_set_versions_rule_set_id_fkey';
            columns: ['rule_set_id'];
            isOneToOne: false;
            referencedRelation: 'rule_sets';
            referencedColumns: ['id'];
          },
        ];
      };
      rule_sets: {
        Row: {
          chat_id: number | null;
          created_at: string;
          created_by_user_id: number | null;
          description: string | null;
          id: number;
          is_active: boolean;
          name: string;
          requires_acknowledgement: boolean;
          rule_set_key: string;
          scope_type: string;
          updated_at: string;
        };
        Insert: {
          chat_id?: number | null;
          created_at?: string;
          created_by_user_id?: number | null;
          description?: string | null;
          id?: never;
          is_active?: boolean;
          name: string;
          requires_acknowledgement?: boolean;
          rule_set_key: string;
          scope_type: string;
          updated_at?: string;
        };
        Update: {
          chat_id?: number | null;
          created_at?: string;
          created_by_user_id?: number | null;
          description?: string | null;
          id?: never;
          is_active?: boolean;
          name?: string;
          requires_acknowledgement?: boolean;
          rule_set_key?: string;
          scope_type?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'rule_sets_chat_id_fkey';
            columns: ['chat_id'];
            isOneToOne: false;
            referencedRelation: 'connected_chats';
            referencedColumns: ['chat_id'];
          },
          {
            foreignKeyName: 'rule_sets_chat_id_fkey';
            columns: ['chat_id'];
            isOneToOne: false;
            referencedRelation: 'effective_chat_settings';
            referencedColumns: ['chat_id'];
          },
          {
            foreignKeyName: 'rule_sets_created_by_user_id_fkey';
            columns: ['created_by_user_id'];
            isOneToOne: false;
            referencedRelation: 'telegram_users';
            referencedColumns: ['user_id'];
          },
        ];
      };
      scheduled_job_runs: {
        Row: {
          affected_count: number | null;
          duration_ms: number | null;
          error_detail: string | null;
          error_kind: string | null;
          finished_at: string | null;
          id: number;
          job_key: string;
          payload: Json;
          run_key: string;
          started_at: string;
          status: string;
          triggered_by: string;
        };
        Insert: {
          affected_count?: number | null;
          duration_ms?: number | null;
          error_detail?: string | null;
          error_kind?: string | null;
          finished_at?: string | null;
          id?: never;
          job_key: string;
          payload?: Json;
          run_key: string;
          started_at?: string;
          status?: string;
          triggered_by?: string;
        };
        Update: {
          affected_count?: number | null;
          duration_ms?: number | null;
          error_detail?: string | null;
          error_kind?: string | null;
          finished_at?: string | null;
          id?: never;
          job_key?: string;
          payload?: Json;
          run_key?: string;
          started_at?: string;
          status?: string;
          triggered_by?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'scheduled_job_runs_job_key_fkey';
            columns: ['job_key'];
            isOneToOne: false;
            referencedRelation: 'scheduled_jobs';
            referencedColumns: ['job_key'];
          },
        ];
      };
      scheduled_jobs: {
        Row: {
          consecutive_failures: number;
          created_at: string;
          description: string | null;
          idempotency_scope: string | null;
          is_enabled: boolean;
          job_key: string;
          job_kind: string;
          job_owner: string;
          last_duration_ms: number | null;
          last_error: string | null;
          last_started_at: string | null;
          last_status: string;
          last_success_at: string | null;
          schedule_spec: string | null;
          timeout_seconds: number;
          updated_at: string;
          updated_by_user_id: number | null;
        };
        Insert: {
          consecutive_failures?: number;
          created_at?: string;
          description?: string | null;
          idempotency_scope?: string | null;
          is_enabled?: boolean;
          job_key: string;
          job_kind?: string;
          job_owner?: string;
          last_duration_ms?: number | null;
          last_error?: string | null;
          last_started_at?: string | null;
          last_status?: string;
          last_success_at?: string | null;
          schedule_spec?: string | null;
          timeout_seconds?: number;
          updated_at?: string;
          updated_by_user_id?: number | null;
        };
        Update: {
          consecutive_failures?: number;
          created_at?: string;
          description?: string | null;
          idempotency_scope?: string | null;
          is_enabled?: boolean;
          job_key?: string;
          job_kind?: string;
          job_owner?: string;
          last_duration_ms?: number | null;
          last_error?: string | null;
          last_started_at?: string | null;
          last_status?: string;
          last_success_at?: string | null;
          schedule_spec?: string | null;
          timeout_seconds?: number;
          updated_at?: string;
          updated_by_user_id?: number | null;
        };
        Relationships: [];
      };
      telegram_chats: {
        Row: {
          chat_id: number;
          chat_type: string;
          created_at: string;
          description: string | null;
          is_forum: boolean;
          linked_chat_id: number | null;
          title: string | null;
          updated_at: string;
          username: string | null;
        };
        Insert: {
          chat_id: number;
          chat_type?: string;
          created_at?: string;
          description?: string | null;
          is_forum?: boolean;
          linked_chat_id?: number | null;
          title?: string | null;
          updated_at?: string;
          username?: string | null;
        };
        Update: {
          chat_id?: number;
          chat_type?: string;
          created_at?: string;
          description?: string | null;
          is_forum?: boolean;
          linked_chat_id?: number | null;
          title?: string | null;
          updated_at?: string;
          username?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'telegram_chats_linked_chat_id_fkey';
            columns: ['linked_chat_id'];
            isOneToOne: false;
            referencedRelation: 'telegram_chats';
            referencedColumns: ['chat_id'];
          },
        ];
      };
      telegram_user_erasures: {
        Row: {
          affected: Json;
          id: number;
          notes: string | null;
          processed_at: string | null;
          processed_by_user_id: number | null;
          reason: string | null;
          requested_at: string;
          source: string;
          status: string;
          user_id: number;
        };
        Insert: {
          affected?: Json;
          id?: never;
          notes?: string | null;
          processed_at?: string | null;
          processed_by_user_id?: number | null;
          reason?: string | null;
          requested_at?: string;
          source?: string;
          status?: string;
          user_id: number;
        };
        Update: {
          affected?: Json;
          id?: never;
          notes?: string | null;
          processed_at?: string | null;
          processed_by_user_id?: number | null;
          reason?: string | null;
          requested_at?: string;
          source?: string;
          status?: string;
          user_id?: number;
        };
        Relationships: [];
      };
      telegram_users: {
        Row: {
          created_at: string;
          erased_at: string | null;
          erasure_reason: string | null;
          first_name: string | null;
          first_seen_at: string;
          is_bot: boolean;
          is_premium: boolean;
          language_code: string | null;
          last_name: string | null;
          last_seen_at: string;
          updated_at: string;
          user_id: number;
          username: string | null;
        };
        Insert: {
          created_at?: string;
          erased_at?: string | null;
          erasure_reason?: string | null;
          first_name?: string | null;
          first_seen_at?: string;
          is_bot?: boolean;
          is_premium?: boolean;
          language_code?: string | null;
          last_name?: string | null;
          last_seen_at?: string;
          updated_at?: string;
          user_id: number;
          username?: string | null;
        };
        Update: {
          created_at?: string;
          erased_at?: string | null;
          erasure_reason?: string | null;
          first_name?: string | null;
          first_seen_at?: string;
          is_bot?: boolean;
          is_premium?: boolean;
          language_code?: string | null;
          last_name?: string | null;
          last_seen_at?: string;
          updated_at?: string;
          user_id?: number;
          username?: string | null;
        };
        Relationships: [];
      };
      user_settings: {
        Row: {
          created_at: string;
          locale: string | null;
          preferences: Json;
          timezone: string | null;
          updated_at: string;
          user_id: number;
        };
        Insert: {
          created_at?: string;
          locale?: string | null;
          preferences?: Json;
          timezone?: string | null;
          updated_at?: string;
          user_id: number;
        };
        Update: {
          created_at?: string;
          locale?: string | null;
          preferences?: Json;
          timezone?: string | null;
          updated_at?: string;
          user_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: 'user_settings_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: true;
            referencedRelation: 'telegram_users';
            referencedColumns: ['user_id'];
          },
        ];
      };
    };
    Views: {
      active_bans: {
        Row: {
          admin_user_id: number | null;
          ban_action_id: number | null;
          ban_id: string | null;
          banned_user_id: number | null;
          chat_id: number | null;
          duration_seconds: number | null;
          metadata: Json | null;
          origin_chat_id: number | null;
          reason: string | null;
          scope_type: string | null;
          timestamp: string | null;
          until_date: string | null;
        };
        Insert: {
          admin_user_id?: number | null;
          ban_action_id?: number | null;
          ban_id?: string | null;
          banned_user_id?: number | null;
          chat_id?: number | null;
          duration_seconds?: number | null;
          metadata?: Json | null;
          origin_chat_id?: number | null;
          reason?: string | null;
          scope_type?: string | null;
          timestamp?: string | null;
          until_date?: string | null;
        };
        Update: {
          admin_user_id?: number | null;
          ban_action_id?: number | null;
          ban_id?: string | null;
          banned_user_id?: number | null;
          chat_id?: number | null;
          duration_seconds?: number | null;
          metadata?: Json | null;
          origin_chat_id?: number | null;
          reason?: string | null;
          scope_type?: string | null;
          timestamp?: string | null;
          until_date?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'moderation_actions_actor_user_id_fkey';
            columns: ['admin_user_id'];
            isOneToOne: false;
            referencedRelation: 'telegram_users';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'moderation_actions_chat_id_fkey';
            columns: ['chat_id'];
            isOneToOne: false;
            referencedRelation: 'telegram_chats';
            referencedColumns: ['chat_id'];
          },
          {
            foreignKeyName: 'moderation_actions_target_user_id_fkey';
            columns: ['banned_user_id'];
            isOneToOne: false;
            referencedRelation: 'telegram_users';
            referencedColumns: ['user_id'];
          },
        ];
      };
      active_mutes: {
        Row: {
          admin_user_id: number | null;
          chat_id: number | null;
          duration_seconds: number | null;
          metadata: Json | null;
          mute_action_id: number | null;
          mute_id: string | null;
          muted_user_id: number | null;
          origin_chat_id: number | null;
          reason: string | null;
          scope_type: string | null;
          timestamp: string | null;
          until_date: string | null;
        };
        Insert: {
          admin_user_id?: number | null;
          chat_id?: number | null;
          duration_seconds?: number | null;
          metadata?: Json | null;
          mute_action_id?: number | null;
          mute_id?: string | null;
          muted_user_id?: number | null;
          origin_chat_id?: number | null;
          reason?: string | null;
          scope_type?: string | null;
          timestamp?: string | null;
          until_date?: string | null;
        };
        Update: {
          admin_user_id?: number | null;
          chat_id?: number | null;
          duration_seconds?: number | null;
          metadata?: Json | null;
          mute_action_id?: number | null;
          mute_id?: string | null;
          muted_user_id?: number | null;
          origin_chat_id?: number | null;
          reason?: string | null;
          scope_type?: string | null;
          timestamp?: string | null;
          until_date?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'moderation_actions_actor_user_id_fkey';
            columns: ['admin_user_id'];
            isOneToOne: false;
            referencedRelation: 'telegram_users';
            referencedColumns: ['user_id'];
          },
          {
            foreignKeyName: 'moderation_actions_chat_id_fkey';
            columns: ['chat_id'];
            isOneToOne: false;
            referencedRelation: 'telegram_chats';
            referencedColumns: ['chat_id'];
          },
          {
            foreignKeyName: 'moderation_actions_target_user_id_fkey';
            columns: ['muted_user_id'];
            isOneToOne: false;
            referencedRelation: 'telegram_users';
            referencedColumns: ['user_id'];
          },
        ];
      };
      community_member_stats: {
        Row: {
          active_connected_chats: number | null;
          active_memberships: number | null;
          unique_members: number | null;
        };
        Relationships: [];
      };
      effective_chat_settings: {
        Row: {
          chat_id: number | null;
          chat_type: string | null;
          locale: string | null;
          settings: Json | null;
          timezone: string | null;
          title: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'connected_chats_chat_id_fkey';
            columns: ['chat_id'];
            isOneToOne: true;
            referencedRelation: 'telegram_chats';
            referencedColumns: ['chat_id'];
          },
        ];
      };
      role_permission_matrix: {
        Row: {
          display_name: string | null;
          permission_count: number | null;
          permissions: string[] | null;
          priority: number | null;
          role_key: string | null;
        };
        Relationships: [];
      };
      warn_counts: {
        Row: {
          active_warn_count: number | null;
          chat_id: number | null;
          target_user_id: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'moderation_actions_chat_id_fkey';
            columns: ['chat_id'];
            isOneToOne: false;
            referencedRelation: 'telegram_chats';
            referencedColumns: ['chat_id'];
          },
          {
            foreignKeyName: 'moderation_actions_target_user_id_fkey';
            columns: ['target_user_id'];
            isOneToOne: false;
            referencedRelation: 'telegram_users';
            referencedColumns: ['user_id'];
          },
        ];
      };
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  'public'
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] &
        DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] &
        DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema['Enums']
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
