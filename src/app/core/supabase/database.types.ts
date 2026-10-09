// Tipos del esquema `public` (Etapa 1), con el mismo formato que genera
// `supabase gen types typescript`. Si el esquema cambia, regenerar con:
//   npx supabase gen types typescript --project-id <ref> --schema public > src/app/core/supabase/database.types.ts
// Las columnas text con CHECK aparecen como `string`; los modelos de dominio
// (core/models) las restringen a uniones literales.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          username: string | null;
          full_name: string | null;
          avatar_url: string | null;
          bio: string | null;
          role: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          username?: string | null;
          full_name?: string | null;
          avatar_url?: string | null;
          bio?: string | null;
          role?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          username?: string | null;
          full_name?: string | null;
          avatar_url?: string | null;
          bio?: string | null;
          role?: string;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      scripts: {
        Row: {
          id: string;
          owner_id: string;
          title: string;
          description: string | null;
          content: string;
          category: string;
          language: string;
          is_template: boolean;
          tags: string[];
          visibility: string;
          search_vector: unknown | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id?: string;
          title: string;
          description?: string | null;
          content: string;
          category?: string;
          language?: string;
          is_template?: boolean;
          tags?: string[];
          visibility?: string;
          search_vector?: unknown | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          title?: string;
          description?: string | null;
          content?: string;
          category?: string;
          language?: string;
          is_template?: boolean;
          tags?: string[];
          visibility?: string;
          search_vector?: unknown | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'scripts_owner_id_fkey';
            columns: ['owner_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      lessons_learned: {
        Row: {
          id: string;
          owner_id: string;
          title: string;
          description: string | null;
          problem: string;
          root_cause: string | null;
          solution: string | null;
          conclusion: string | null;
          severity: string;
          technology: string | null;
          category: string;
          status: string;
          occurred_on: string | null;
          tags: string[];
          visibility: string;
          search_vector: unknown | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id?: string;
          title: string;
          description?: string | null;
          problem: string;
          root_cause?: string | null;
          solution?: string | null;
          conclusion?: string | null;
          severity?: string;
          technology?: string | null;
          category?: string;
          status?: string;
          occurred_on?: string | null;
          tags?: string[];
          visibility?: string;
          search_vector?: unknown | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          title?: string;
          description?: string | null;
          problem?: string;
          root_cause?: string | null;
          solution?: string | null;
          conclusion?: string | null;
          severity?: string;
          technology?: string | null;
          category?: string;
          status?: string;
          occurred_on?: string | null;
          tags?: string[];
          visibility?: string;
          search_vector?: unknown | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'lessons_learned_owner_id_fkey';
            columns: ['owner_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      notes: {
        Row: {
          id: string;
          owner_id: string;
          title: string;
          description: string | null;
          content: string;
          category: string;
          tags: string[];
          visibility: string;
          search_vector: unknown | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id?: string;
          title: string;
          description?: string | null;
          content: string;
          category?: string;
          tags?: string[];
          visibility?: string;
          search_vector?: unknown | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          title?: string;
          description?: string | null;
          content?: string;
          category?: string;
          tags?: string[];
          visibility?: string;
          search_vector?: unknown | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'notes_owner_id_fkey';
            columns: ['owner_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      manuals: {
        Row: {
          id: string;
          owner_id: string;
          title: string;
          description: string | null;
          category: string;
          version: string | null;
          file_path: string;
          file_name: string;
          mime_type: string;
          file_size: number;
          download_count: number;
          tags: string[];
          visibility: string;
          search_vector: unknown | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id?: string;
          title: string;
          description?: string | null;
          category?: string;
          version?: string | null;
          file_path: string;
          file_name: string;
          mime_type: string;
          file_size: number;
          download_count?: number;
          tags?: string[];
          visibility?: string;
          search_vector?: unknown | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          owner_id?: string;
          title?: string;
          description?: string | null;
          category?: string;
          version?: string | null;
          file_path?: string;
          file_name?: string;
          mime_type?: string;
          file_size?: number;
          download_count?: number;
          tags?: string[];
          visibility?: string;
          search_vector?: unknown | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'manuals_owner_id_fkey';
            columns: ['owner_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      user_favorites: {
        Row: {
          id: string;
          user_id: string;
          script_id: string | null;
          lesson_id: string | null;
          note_id: string | null;
          manual_id: string | null;
          resource_type: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          script_id?: string | null;
          lesson_id?: string | null;
          note_id?: string | null;
          manual_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          script_id?: string | null;
          lesson_id?: string | null;
          note_id?: string | null;
          manual_id?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'user_favorites_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_favorites_script_id_fkey';
            columns: ['script_id'];
            isOneToOne: false;
            referencedRelation: 'scripts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_favorites_lesson_id_fkey';
            columns: ['lesson_id'];
            isOneToOne: false;
            referencedRelation: 'lessons_learned';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_favorites_note_id_fkey';
            columns: ['note_id'];
            isOneToOne: false;
            referencedRelation: 'notes';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_favorites_manual_id_fkey';
            columns: ['manual_id'];
            isOneToOne: false;
            referencedRelation: 'manuals';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      search_resources: {
        Args: {
          p_query: string;
          p_types?: string[];
          p_limit?: number;
          p_offset?: number;
        };
        Returns: {
          resource_type: string;
          id: string;
          title: string;
          description: string | null;
          tags: string[];
          visibility: string;
          owner_id: string;
          updated_at: string;
          rank: number;
        }[];
      };
      register_manual_download: {
        Args: { p_manual_id: string };
        Returns: number;
      };
      dashboard_summary: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
