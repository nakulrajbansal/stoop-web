/**
 * The Supabase schema, as the running product actually has it.
 *
 * This file used to describe only the columns someone remembered to add, and
 * left `Relationships` and `Functions` empty. supabase-js resolves an embedded
 * select (`poster:profiles!plans_user_id_fkey(...)`) through `Relationships`
 * and an `.rpc()` through `Functions`, so with both empty every such query
 * collapsed to `never` and roughly 140 "Property 'x' does not exist on type
 * 'never'" errors piled up across the app. The fix is the schema, not casts.
 *
 * Keep this in step with `supabase/migrations/`. `database-contract.test.ts`
 * checks the parts a test can check without a live database.
 */

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type PlanStatus = 'open' | 'full' | 'expired' | 'removed';
export type ConversationStatus = 'pending' | 'confirmed' | 'declined';
export type ReportStatus = 'open' | 'reviewed' | 'actioned' | 'dismissed';
export type PlanCategory = 'coffee' | 'outdoors' | 'arts' | 'food' | 'books' | 'music' | 'sports';

export type Database = {
  public: {
    Tables: {
      cities: {
        Row: { id: string; slug: string; name: string; state: string; active: boolean; created_at: string };
        Insert: { id?: string; slug: string; name: string; state: string; active?: boolean; created_at?: string };
        Update: { id?: string; slug?: string; name?: string; state?: string; active?: boolean };
        Relationships: [];
      };
      neighborhoods: {
        Row: { id: string; city_id: string; slug: string; name: string; active: boolean };
        Insert: { id?: string; city_id: string; slug: string; name: string; active?: boolean };
        Update: { id?: string; city_id?: string; slug?: string; name?: string; active?: boolean };
        Relationships: [
          {
            foreignKeyName: 'neighborhoods_city_id_fkey';
            columns: ['city_id'];
            isOneToOne: false;
            referencedRelation: 'cities';
            referencedColumns: ['id'];
          }
        ];
      };
      profiles: {
        Row: {
          id: string;
          name: string;
          phone_e164: string;
          phone_verified_at: string | null;
          city_id: string;
          neighborhood_id: string | null;
          about: string | null;
          /** Private. Revoked from anon/authenticated in 0003; admin client only. */
          notify_email: string | null;
          avatar_bg: string;
          avatar_fg: string;
          initials: string | null;
          is_founding_member: boolean;
          /** Set by an admin Suspend. Private, admin client only. */
          blocked_at: string | null;
          /** Set by an admin Warn. Private, admin client only. */
          warned_at: string | null;
          digest_opt_out_at: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          name: string;
          phone_e164: string;
          phone_verified_at?: string | null;
          city_id: string;
          neighborhood_id?: string | null;
          about?: string | null;
          notify_email?: string | null;
          avatar_bg?: string;
          avatar_fg?: string;
          initials?: string | null;
          is_founding_member?: boolean;
          blocked_at?: string | null;
          warned_at?: string | null;
          digest_opt_out_at?: string | null;
          created_at?: string;
        };
        Update: {
          name?: string;
          phone_e164?: string;
          phone_verified_at?: string | null;
          city_id?: string;
          neighborhood_id?: string | null;
          about?: string | null;
          notify_email?: string | null;
          avatar_bg?: string;
          avatar_fg?: string;
          initials?: string | null;
          is_founding_member?: boolean;
          blocked_at?: string | null;
          warned_at?: string | null;
          digest_opt_out_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'profiles_city_id_fkey';
            columns: ['city_id'];
            isOneToOne: false;
            referencedRelation: 'cities';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'profiles_neighborhood_id_fkey';
            columns: ['neighborhood_id'];
            isOneToOne: false;
            referencedRelation: 'neighborhoods';
            referencedColumns: ['id'];
          }
        ];
      };
      plans: {
        Row: {
          id: string;
          slug: string;
          user_id: string;
          city_id: string;
          neighborhood_id: string;
          text: string;
          category: PlanCategory;
          spot: string | null;
          when_day: string;
          when_date: string | null;
          when_time: string | null;
          when_time_specific: string | null;
          spots_total: number;
          spots_left: number;
          intent_tags: string[];
          status: PlanStatus;
          expires_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          user_id: string;
          city_id: string;
          neighborhood_id: string;
          text: string;
          category: PlanCategory;
          spot?: string | null;
          when_day: string;
          when_date?: string | null;
          when_time?: string | null;
          when_time_specific?: string | null;
          spots_total: number;
          spots_left: number;
          intent_tags?: string[];
          status?: PlanStatus;
          expires_at: string;
          created_at?: string;
        };
        Update: {
          slug?: string;
          text?: string;
          category?: PlanCategory;
          spot?: string | null;
          when_day?: string;
          when_date?: string | null;
          when_time?: string | null;
          when_time_specific?: string | null;
          spots_total?: number;
          spots_left?: number;
          intent_tags?: string[];
          status?: PlanStatus;
          expires_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'plans_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'plans_city_id_fkey';
            columns: ['city_id'];
            isOneToOne: false;
            referencedRelation: 'cities';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'plans_neighborhood_id_fkey';
            columns: ['neighborhood_id'];
            isOneToOne: false;
            referencedRelation: 'neighborhoods';
            referencedColumns: ['id'];
          }
        ];
      };
      conversations: {
        Row: {
          id: string;
          plan_id: string;
          poster_id: string;
          joiner_id: string;
          status: ConversationStatus;
          followup_sent_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          plan_id: string;
          poster_id: string;
          joiner_id: string;
          status?: ConversationStatus;
          followup_sent_at?: string | null;
          created_at?: string;
        };
        Update: { status?: ConversationStatus; followup_sent_at?: string | null };
        Relationships: [
          {
            foreignKeyName: 'conversations_plan_id_fkey';
            columns: ['plan_id'];
            isOneToOne: false;
            referencedRelation: 'plans';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'conversations_poster_id_fkey';
            columns: ['poster_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'conversations_joiner_id_fkey';
            columns: ['joiner_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          }
        ];
      };
      messages: {
        Row: { id: string; conversation_id: string; from_user_id: string; text: string; created_at: string };
        Insert: { id?: string; conversation_id: string; from_user_id: string; text: string; created_at?: string };
        Update: { text?: string };
        Relationships: [
          {
            foreignKeyName: 'messages_conversation_id_fkey';
            columns: ['conversation_id'];
            isOneToOne: false;
            referencedRelation: 'conversations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'messages_from_user_id_fkey';
            columns: ['from_user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          }
        ];
      };
      /** Migration 0008. Written by the API through the service role. */
      blocks: {
        Row: { id: string; blocker_id: string; blocked_id: string; created_at: string };
        Insert: { id?: string; blocker_id: string; blocked_id: string; created_at?: string };
        Update: { blocker_id?: string; blocked_id?: string };
        Relationships: [
          {
            foreignKeyName: 'blocks_blocker_id_fkey';
            columns: ['blocker_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'blocks_blocked_id_fkey';
            columns: ['blocked_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          }
        ];
      };
      /** Migration 0008. One row per member per conversation. */
      conversation_reads: {
        Row: { user_id: string; conversation_id: string; last_seen_at: string };
        Insert: { user_id: string; conversation_id: string; last_seen_at?: string };
        Update: { last_seen_at?: string };
        Relationships: [
          {
            foreignKeyName: 'conversation_reads_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'conversation_reads_conversation_id_fkey';
            columns: ['conversation_id'];
            isOneToOne: false;
            referencedRelation: 'conversations';
            referencedColumns: ['id'];
          }
        ];
      };
      reports: {
        Row: {
          id: string;
          reporter_id: string;
          reported_user_id: string;
          conversation_id: string | null;
          reason: string;
          details: string | null;
          status: ReportStatus;
          resolved_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          reporter_id: string;
          reported_user_id: string;
          conversation_id?: string | null;
          reason: string;
          details?: string | null;
          status?: ReportStatus;
          resolved_at?: string | null;
          created_at?: string;
        };
        Update: { status?: ReportStatus; resolved_at?: string | null };
        Relationships: [
          {
            foreignKeyName: 'reports_reporter_id_fkey';
            columns: ['reporter_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'reports_reported_user_id_fkey';
            columns: ['reported_user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'reports_conversation_id_fkey';
            columns: ['conversation_id'];
            isOneToOne: false;
            referencedRelation: 'conversations';
            referencedColumns: ['id'];
          }
        ];
      };
      /** Migration 0005. Service role only. */
      plan_feedback: {
        Row: {
          id: string;
          conversation_id: string;
          plan_id: string | null;
          responder_id: string;
          rating: 'great' | 'fine' | 'noshow';
          created_at: string;
        };
        Insert: {
          id?: string;
          conversation_id: string;
          plan_id?: string | null;
          responder_id: string;
          rating: 'great' | 'fine' | 'noshow';
          created_at?: string;
        };
        Update: { rating?: 'great' | 'fine' | 'noshow' };
        Relationships: [
          {
            foreignKeyName: 'plan_feedback_conversation_id_fkey';
            columns: ['conversation_id'];
            isOneToOne: false;
            referencedRelation: 'conversations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'plan_feedback_plan_id_fkey';
            columns: ['plan_id'];
            isOneToOne: false;
            referencedRelation: 'plans';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'plan_feedback_responder_id_fkey';
            columns: ['responder_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          }
        ];
      };
      ops_items: {
        Row: {
          id: string;
          kind: 'task' | 'approval';
          title: string;
          summary: string | null;
          status: 'backlog' | 'in_progress' | 'blocked' | 'pending_approval' | 'approved' | 'rejected' | 'completed';
          owner: 'user' | 'curio' | 'shared';
          priority: 'low' | 'medium' | 'high' | 'urgent';
          due_at: string | null;
          next_action: string | null;
          approval_question: string | null;
          decision_notes: string | null;
          source_url: string | null;
          sort_order: number;
          created_at: string;
          updated_at: string;
          completed_at: string | null;
        };
        Insert: {
          id?: string;
          kind: 'task' | 'approval';
          title: string;
          summary?: string | null;
          status: 'backlog' | 'in_progress' | 'blocked' | 'pending_approval' | 'approved' | 'rejected' | 'completed';
          owner: 'user' | 'curio' | 'shared';
          priority?: 'low' | 'medium' | 'high' | 'urgent';
          due_at?: string | null;
          next_action?: string | null;
          approval_question?: string | null;
          decision_notes?: string | null;
          source_url?: string | null;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
          completed_at?: string | null;
        };
        Update: {
          title?: string;
          summary?: string | null;
          status?: 'backlog' | 'in_progress' | 'blocked' | 'pending_approval' | 'approved' | 'rejected' | 'completed';
          owner?: 'user' | 'curio' | 'shared';
          priority?: 'low' | 'medium' | 'high' | 'urgent';
          due_at?: string | null;
          next_action?: string | null;
          approval_question?: string | null;
          decision_notes?: string | null;
          source_url?: string | null;
          sort_order?: number;
          updated_at?: string;
          completed_at?: string | null;
        };
        Relationships: [];
      };
      otp_attempts: {
        Row: { id: string; phone_e164: string; ip_address: string | null; succeeded: boolean; created_at: string };
        Insert: { id?: string; phone_e164: string; ip_address?: string | null; succeeded?: boolean; created_at?: string };
        Update: { succeeded?: boolean };
        Relationships: [];
      };
      /**
       * Native push tokens (0007). Service-role only: not granted to the anon
       * or authenticated API roles, and registration goes through
       * `register_push_token` so ownership is checked in one transaction.
       */
      push_tokens: {
        Row: {
          id: string;
          user_id: string;
          expo_push_token: string;
          platform: 'ios' | 'android';
          installation_id: string;
          app_version: string | null;
          created_at: string;
          updated_at: string;
          last_used_at: string | null;
          revoked_at: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          expo_push_token: string;
          platform: 'ios' | 'android';
          installation_id: string;
          app_version?: string | null;
          created_at?: string;
          updated_at?: string;
          last_used_at?: string | null;
          revoked_at?: string | null;
        };
        Update: {
          user_id?: string;
          expo_push_token?: string;
          platform?: 'ios' | 'android';
          installation_id?: string;
          app_version?: string | null;
          updated_at?: string;
          last_used_at?: string | null;
          revoked_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'push_tokens_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          }
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      /** 0008. Both directions of a block relationship. */
      blocked_user_ids: {
        Args: { for_user: string };
        Returns: { other_id: string }[];
      };
      /** 0008. RLS predicate; exposed for completeness, not called from code. */
      is_blocked_with: {
        Args: { other: string };
        Returns: boolean;
      };
      /** 0008. Atomic, ownership-checked push registration. */
      register_push_token: {
        Args: {
          p_user_id: string;
          p_token: string;
          p_platform: string;
          p_installation_id: string;
          p_app_version: string | null;
        };
        Returns: string;
      };
      /** 0008. Atomic pending -> confirmed/declined transition. */
      resolve_conversation: {
        Args: { p_conversation_id: string; p_poster_id: string; p_status: string };
        Returns: string;
      };
      /** 0008. The objectionable-language blocklist, as the triggers see it. */
      contains_blocked_language: {
        Args: { input: string };
        Returns: boolean;
      };
      moderation_normalize: {
        Args: { input: string };
        Returns: string;
      };
      moderation_squash: {
        Args: { input: string };
        Returns: string;
      };
      /** 0001. Run by the daily cron. */
      expire_old_plans: {
        Args: Record<PropertyKey, never>;
        Returns: undefined;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

/** Row shorthand: `Tables<'plans'>`. */
export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];
export type TablesInsert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert'];
export type TablesUpdate<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update'];
