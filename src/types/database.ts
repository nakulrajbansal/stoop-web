/**
 * Hand-maintained mirror of the live Postgres schema.
 *
 * Two things about the shape, both required by @supabase/supabase-js:
 *
 *  - Every table needs a `Relationships` member. Without it the schema fails
 *    the SDK's GenericSchema constraint, the client's Schema parameter silently
 *    resolves to `never`, and every single row read comes back as `never`. The
 *    lists are empty because nothing here relies on typed embedded joins; the
 *    real foreign keys live in supabase/migrations.
 *  - The table and column set has to keep up with the migrations, or reads of
 *    a missing column resolve to SelectQueryError and writes to a missing table
 *    resolve to `never[]`.
 *
 * Columns added after the initial schema are marked with the migration that
 * introduced them. `blocks` and `conversation_reads` have no migration in this
 * repo; their shape is taken from the queries that use them
 * (src/app/api/block/route.ts and src/app/api/unread/*). Editing this file
 * changes types only. It does not create, alter, or migrate anything.
 */
export type Database = {
  public: {
    Tables: {
      cities: {
        Row: { id: string; slug: string; name: string; state: string; active: boolean; created_at: string };
        Insert: { id?: string; slug: string; name: string; state: string; active?: boolean };
        Update: { id?: string; slug?: string; name?: string; state?: string; active?: boolean };
        Relationships: [];
      };
      neighborhoods: {
        Row: { id: string; city_id: string; slug: string; name: string; active: boolean };
        Insert: { id?: string; city_id: string; slug: string; name: string; active?: boolean };
        Update: { id?: string; city_id?: string; slug?: string; name?: string; active?: boolean };
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string; name: string; phone_e164: string;
          phone_verified_at: string | null; city_id: string;
          neighborhood_id: string | null; about: string | null;
          avatar_bg: string; avatar_fg: string; initials: string | null;
          is_founding_member: boolean; blocked_at: string | null; created_at: string;
          // Private columns. Readable through the admin client only; migration
          // 0003 revokes them from the anon and authenticated roles.
          notify_email: string | null;
          warned_at: string | null; // 0002
          digest_opt_out_at: string | null; // 0004
        };
        Insert: {
          id: string; name: string; phone_e164: string;
          phone_verified_at?: string | null; city_id: string;
          neighborhood_id?: string | null; about?: string | null;
          avatar_bg?: string; avatar_fg?: string; initials?: string | null;
          is_founding_member?: boolean;
          notify_email?: string | null;
          warned_at?: string | null;
          digest_opt_out_at?: string | null;
        };
        Update: {
          name?: string; phone_e164?: string;
          phone_verified_at?: string | null; city_id?: string;
          neighborhood_id?: string | null; about?: string | null;
          avatar_bg?: string; avatar_fg?: string; initials?: string | null;
          is_founding_member?: boolean; blocked_at?: string | null;
          notify_email?: string | null;
          warned_at?: string | null;
          digest_opt_out_at?: string | null;
        };
        Relationships: [];
      };
      plans: {
        Row: {
          id: string; slug: string; user_id: string; city_id: string; neighborhood_id: string;
          text: string; category: string; spot: string | null;
          when_day: string; when_date: string | null; when_time: string | null; when_time_specific: string | null;
          spots_total: number; spots_left: number;
          intent_tags: string[];
          // 20260805210000. NULL on plans that predate the clarity contract.
          cost_expectation: 'free' | 'pay-own-way' | 'ticket-required' | null;
          status: 'open' | 'full' | 'expired' | 'removed';
          expires_at: string; created_at: string;
        };
        Insert: {
          id?: string; slug: string; user_id: string; city_id: string; neighborhood_id: string;
          text: string; category: string; spot?: string | null;
          when_day: string; when_date?: string | null; when_time?: string | null; when_time_specific?: string | null;
          spots_total: number; spots_left: number;
          intent_tags?: string[];
          cost_expectation?: 'free' | 'pay-own-way' | 'ticket-required' | null;
          status?: 'open' | 'full' | 'expired' | 'removed';
          expires_at: string;
        };
        Update: {
          text?: string; category?: string; spot?: string | null;
          when_day?: string; when_date?: string | null; when_time?: string | null; when_time_specific?: string | null;
          spots_total?: number; spots_left?: number;
          intent_tags?: string[];
          cost_expectation?: 'free' | 'pay-own-way' | 'ticket-required' | null;
          status?: 'open' | 'full' | 'expired' | 'removed';
          expires_at?: string;
        };
        Relationships: [];
      };
      conversations: {
        Row: {
          id: string; plan_id: string; poster_id: string; joiner_id: string;
          status: 'pending' | 'confirmed' | 'declined' | 'withdrawn'; created_at: string;
          followup_sent_at: string | null; // 0005
          withdrawn_at: string | null; // 20260805211500
        };
        Insert: { id?: string; plan_id: string; poster_id: string; joiner_id: string; status?: 'pending' | 'confirmed' | 'declined' | 'withdrawn' };
        Update: {
          status?: 'pending' | 'confirmed' | 'declined' | 'withdrawn';
          followup_sent_at?: string | null;
          withdrawn_at?: string | null;
        };
        Relationships: [];
      };
      messages: {
        Row: { id: string; conversation_id: string; from_user_id: string; text: string; created_at: string };
        Insert: { id?: string; conversation_id: string; from_user_id: string; text: string };
        Update: { text?: string };
        Relationships: [];
      };
      reports: {
        Row: {
          id: string; reporter_id: string; reported_user_id: string; reason: string;
          details: string | null; status: 'open' | 'reviewed' | 'actioned' | 'dismissed';
          created_at: string;
          conversation_id: string | null; // 0002
          resolved_at: string | null; // 0002
        };
        Insert: {
          reporter_id: string; reported_user_id: string; reason: string;
          details?: string | null; conversation_id?: string | null;
        };
        Update: {
          status?: 'open' | 'reviewed' | 'actioned' | 'dismissed';
          resolved_at?: string | null;
        };
        Relationships: [];
      };
      ops_items: {
        Row: {
          id: string; kind: 'task' | 'approval'; title: string; summary: string | null;
          status: 'backlog' | 'in_progress' | 'blocked' | 'pending_approval' | 'approved' | 'rejected' | 'completed';
          owner: 'user' | 'curio' | 'shared'; priority: 'low' | 'medium' | 'high' | 'urgent';
          due_at: string | null; next_action: string | null; approval_question: string | null;
          decision_notes: string | null; source_url: string | null; sort_order: number;
          created_at: string; updated_at: string; completed_at: string | null;
        };
        Insert: {
          id?: string; kind: 'task' | 'approval'; title: string; summary?: string | null;
          status: 'backlog' | 'in_progress' | 'blocked' | 'pending_approval' | 'approved' | 'rejected' | 'completed';
          owner: 'user' | 'curio' | 'shared'; priority?: 'low' | 'medium' | 'high' | 'urgent';
          due_at?: string | null; next_action?: string | null; approval_question?: string | null;
          decision_notes?: string | null; source_url?: string | null; sort_order?: number;
          completed_at?: string | null;
        };
        Update: {
          title?: string; summary?: string | null;
          status?: 'backlog' | 'in_progress' | 'blocked' | 'pending_approval' | 'approved' | 'rejected' | 'completed';
          owner?: 'user' | 'curio' | 'shared'; priority?: 'low' | 'medium' | 'high' | 'urgent';
          due_at?: string | null; next_action?: string | null; approval_question?: string | null;
          decision_notes?: string | null; source_url?: string | null; sort_order?: number;
          completed_at?: string | null;
        };
        Relationships: [];
      };
      plan_feedback: {
        Row: {
          id: string; conversation_id: string; plan_id: string | null;
          responder_id: string; rating: 'great' | 'fine' | 'noshow'; created_at: string;
        };
        Insert: {
          id?: string; conversation_id: string; plan_id?: string | null;
          responder_id: string; rating: 'great' | 'fine' | 'noshow';
        };
        Update: { rating?: 'great' | 'fine' | 'noshow' };
        Relationships: [];
      };
      blocks: {
        Row: { blocker_id: string; blocked_id: string; created_at: string };
        Insert: { blocker_id: string; blocked_id: string };
        Update: { blocker_id?: string; blocked_id?: string };
        Relationships: [];
      };
      conversation_reads: {
        Row: { user_id: string; conversation_id: string; last_seen_at: string };
        Insert: { user_id: string; conversation_id: string; last_seen_at?: string };
        Update: { last_seen_at?: string };
        Relationships: [];
      };
      otp_attempts: {
        Row: { id: string; phone_e164: string; ip_address: string | null; succeeded: boolean; created_at: string };
        Insert: { phone_e164: string; ip_address?: string | null; succeeded?: boolean };
        Update: { succeeded?: boolean };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};