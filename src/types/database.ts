// Auto-generate from Supabase later with:
// npx supabase gen types typescript --project-id <ID> > src/types/database.ts
// This is a hand-written subset for the MVP.

export type Database = {
  public: {
    Tables: {
      cities: {
        Row: { id: string; slug: string; name: string; state: string; active: boolean; created_at: string };
        Insert: { id?: string; slug: string; name: string; state: string; active?: boolean };
        Update: Partial<Database['public']['Tables']['cities']['Insert']>;
      };
      neighborhoods: {
        Row: { id: string; city_id: string; slug: string; name: string; active: boolean };
        Insert: { id?: string; city_id: string; slug: string; name: string; active?: boolean };
        Update: Partial<Database['public']['Tables']['neighborhoods']['Insert']>;
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
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>;
      };
      plans: {
        Row: {
          id: string; user_id: string; city_id: string; neighborhood_id: string;
          text: string; category: string; spot: string | null;
          when_day: string; when_time: string | null;
          spots_total: number; spots_left: number;
          status: 'open' | 'full' | 'expired' | 'removed';
          expires_at: string; created_at: string;
        };
        Insert: {
          id?: string; user_id: string; city_id: string; neighborhood_id: string;
          text: string; category: string; spot?: string | null;
          when_day: string; when_time?: string | null;
          spots_total: number; spots_left: number;
          status?: 'open' | 'full' | 'expired' | 'removed';
          expires_at: string;
        };
        Update: Partial<Database['public']['Tables']['plans']['Insert']>;
      };
      conversations: {
        Row: {
          id: string; plan_id: string; poster_id: string; joiner_id: string;
          status: 'pending' | 'confirmed' | 'declined'; created_at: string;
        };
        Insert: {
          id?: string; plan_id: string; poster_id: string; joiner_id: string;
          status?: 'pending' | 'confirmed' | 'declined';
        };
        Update: Partial<Database['public']['Tables']['conversations']['Insert']>;
      };
      messages: {
        Row: { id: string; conversation_id: string; from_user_id: string; text: string; created_at: string };
        Insert: { id?: string; conversation_id: string; from_user_id: string; text: string };
        Update: Partial<Database['public']['Tables']['messages']['Insert']>;
      };
      reports: {
        Row: {
          id: string; reporter_id: string; reported_user_id: string;
          reason: string; details: string | null;
          status: 'open' | 'reviewed' | 'actioned' | 'dismissed'; created_at: string;
        };
        Insert: {
          reporter_id: string; reported_user_id: string;
          reason: string; details?: string | null;
        };
        Update: Partial<Database['public']['Tables']['reports']['Insert']>;
      };
      otp_attempts: {
        Row: { id: string; phone_e164: string; ip_address: string | null; succeeded: boolean; created_at: string };
        Insert: { phone_e164: string; ip_address?: string | null; succeeded?: boolean };
        Update: Partial<Database['public']['Tables']['otp_attempts']['Insert']>;
      };
    };
  };
};
