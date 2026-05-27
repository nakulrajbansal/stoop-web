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
      otp_attempts: {
        Row: { id: string; phone_e164: string; ip_address: string | null; succeeded: boolean; created_at: string };
        Insert: { phone_e164: string; ip_address?: string | null; succeeded?: boolean };
        Update: { succeeded?: boolean };
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};