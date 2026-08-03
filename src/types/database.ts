export type Database = {
  public: {
    Tables: {
      cities: {
        Row: { id: string; slug: string; name: string; state: string; active: boolean; created_at: string };
        Insert: { id?: string; slug: string; name: string; state: string; active?: boolean };
        Update: { id?: string; slug?: string; name?: string; state?: string; active?: boolean };
      };
      neighborhoods: {
        Row: { id: string; city_id: string; slug: string; name: string; active: boolean };
        Insert: { id?: string; city_id: string; slug: string; name: string; active?: boolean };
        Update: { id?: string; city_id?: string; slug?: string; name?: string; active?: boolean };
      };
      profiles: {
        Row: {
          id: string; name: string; phone_e164: string;
          phone_verified_at: string | null; city_id: string;
          neighborhood_id: string | null; about: string | null;
          avatar_bg: string; avatar_fg: string; initials: string | null;
          is_founding_member: boolean; blocked_at: string | null; created_at: string;
        };
        Insert: {
          id: string; name: string; phone_e164: string;
          phone_verified_at?: string | null; city_id: string;
          neighborhood_id?: string | null; about?: string | null;
          avatar_bg?: string; avatar_fg?: string; initials?: string | null;
          is_founding_member?: boolean;
        };
        Update: {
          name?: string; phone_e164?: string;
          phone_verified_at?: string | null; city_id?: string;
          neighborhood_id?: string | null; about?: string | null;
          avatar_bg?: string; avatar_fg?: string; initials?: string | null;
          is_founding_member?: boolean; blocked_at?: string | null;
        };
      };
      plans: {
        Row: {
          id: string; slug: string; user_id: string; city_id: string; neighborhood_id: string;
          text: string; category: string; spot: string | null;
          when_day: string; when_date: string | null; when_time: string | null; when_time_specific: string | null;
          spots_total: number; spots_left: number;
          intent_tags: string[];
          status: 'open' | 'full' | 'expired' | 'removed';
          expires_at: string; created_at: string;
        };
        Insert: {
          id?: string; slug: string; user_id: string; city_id: string; neighborhood_id: string;
          text: string; category: string; spot?: string | null;
          when_day: string; when_date?: string | null; when_time?: string | null; when_time_specific?: string | null;
          spots_total: number; spots_left: number;
          intent_tags?: string[];
          status?: 'open' | 'full' | 'expired' | 'removed';
          expires_at: string;
        };
        Update: {
          text?: string; category?: string; spot?: string | null;
          when_day?: string; when_date?: string | null; when_time?: string | null; when_time_specific?: string | null;
          spots_total?: number; spots_left?: number;
          intent_tags?: string[];
          status?: 'open' | 'full' | 'expired' | 'removed';
          expires_at?: string;
        };
      };
      conversations: {
        Row: { id: string; plan_id: string; poster_id: string; joiner_id: string; status: 'pending' | 'confirmed' | 'declined'; created_at: string };
        Insert: { id?: string; plan_id: string; poster_id: string; joiner_id: string; status?: 'pending' | 'confirmed' | 'declined' };
        Update: { status?: 'pending' | 'confirmed' | 'declined' };
      };
      messages: {
        Row: { id: string; conversation_id: string; from_user_id: string; text: string; created_at: string };
        Insert: { id?: string; conversation_id: string; from_user_id: string; text: string };
        Update: { text?: string };
      };
      reports: {
        Row: { id: string; reporter_id: string; reported_user_id: string; reason: string; details: string | null; status: 'open' | 'reviewed' | 'actioned' | 'dismissed'; created_at: string };
        Insert: { reporter_id: string; reported_user_id: string; reason: string; details?: string | null };
        Update: { status?: 'open' | 'reviewed' | 'actioned' | 'dismissed' };
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
      };
      otp_attempts: {
        Row: { id: string; phone_e164: string; ip_address: string | null; succeeded: boolean; created_at: string };
        Insert: { phone_e164: string; ip_address?: string | null; succeeded?: boolean };
        Update: { succeeded?: boolean };
      };
      // Native push tokens (migration 0007). Service-role only: not granted to
      // the anon or authenticated API roles.
      push_tokens: {
        Row: {
          id: string; user_id: string; expo_push_token: string;
          platform: 'ios' | 'android'; installation_id: string; app_version: string | null;
          created_at: string; updated_at: string;
          last_used_at: string | null; revoked_at: string | null;
        };
        Insert: {
          id?: string; user_id: string; expo_push_token: string;
          platform: 'ios' | 'android'; installation_id: string; app_version?: string | null;
          created_at?: string; updated_at?: string;
          last_used_at?: string | null; revoked_at?: string | null;
        };
        Update: {
          user_id?: string; expo_push_token?: string;
          platform?: 'ios' | 'android'; installation_id?: string; app_version?: string | null;
          updated_at?: string; last_used_at?: string | null; revoked_at?: string | null;
        };
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};