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
      services: {
        Row: {
          id: string;
          owner_id: string;
          title: string;
          description: string | null;
          kind: string;
          system: string | null;
          protocol: string;
          base_url: string;
          wsdl_url: string | null;
          datapower_domain: string | null;
          datapower_object: string | null;
          auth_type: string;
          auth_username: string | null;
          auth_secret: string | null;
          auth_notes: string | null;
          notes: string | null;
          operations: Json;
          soapui_file_path: string | null;
          soapui_file_name: string | null;
          soapui_file_size: number | null;
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
          kind?: string;
          system?: string | null;
          protocol?: string;
          base_url: string;
          wsdl_url?: string | null;
          datapower_domain?: string | null;
          datapower_object?: string | null;
          auth_type?: string;
          auth_username?: string | null;
          auth_secret?: string | null;
          auth_notes?: string | null;
          notes?: string | null;
          operations?: Json;
          soapui_file_path?: string | null;
          soapui_file_name?: string | null;
          soapui_file_size?: number | null;
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
          kind?: string;
          system?: string | null;
          protocol?: string;
          base_url?: string;
          wsdl_url?: string | null;
          datapower_domain?: string | null;
          datapower_object?: string | null;
          auth_type?: string;
          auth_username?: string | null;
          auth_secret?: string | null;
          auth_notes?: string | null;
          notes?: string | null;
          operations?: Json;
          soapui_file_path?: string | null;
          soapui_file_name?: string | null;
          soapui_file_size?: number | null;
          tags?: string[];
          visibility?: string;
          search_vector?: unknown | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'services_owner_id_fkey';
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
          service_id: string | null;
          database_id: string | null;
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
          service_id?: string | null;
          database_id?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          script_id?: string | null;
          lesson_id?: string | null;
          note_id?: string | null;
          manual_id?: string | null;
          service_id?: string | null;
          database_id?: string | null;
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
          {
            foreignKeyName: 'user_favorites_service_id_fkey';
            columns: ['service_id'];
            isOneToOne: false;
            referencedRelation: 'services';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'user_favorites_database_id_fkey';
            columns: ['database_id'];
            isOneToOne: false;
            referencedRelation: 'databases';
            referencedColumns: ['id'];
          },
        ];
      };
      databases: {
        Row: {
          id: string;
          owner_id: string;
          title: string;
          description: string | null;
          engine: string;
          environment: string;
          host: string | null;
          port: number | null;
          service_name: string | null;
          connection_string: string | null;
          username: string | null;
          password: string | null;
          notes: string | null;
          objects: Json;
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
          engine?: string;
          environment?: string;
          host?: string | null;
          port?: number | null;
          service_name?: string | null;
          connection_string?: string | null;
          username?: string | null;
          password?: string | null;
          notes?: string | null;
          objects?: Json;
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
          engine?: string;
          environment?: string;
          host?: string | null;
          port?: number | null;
          service_name?: string | null;
          connection_string?: string | null;
          username?: string | null;
          password?: string | null;
          notes?: string | null;
          objects?: Json;
          tags?: string[];
          visibility?: string;
          search_vector?: unknown | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'databases_owner_id_fkey';
            columns: ['owner_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      mdi_configs: {
        Row: {
          user_id: string;
          app: string;
          config: Json;
          updated_at: string;
        };
        Insert: {
          user_id?: string;
          app: string;
          config?: Json;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          app?: string;
          config?: Json;
          updated_at?: string;
        };
        Relationships: [];
      };
      mdi_templates: {
        Row: {
          user_id: string;
          app: string;
          file_path: string;
          file_name: string;
          updated_at: string;
        };
        Insert: {
          user_id?: string;
          app: string;
          file_path: string;
          file_name: string;
          updated_at?: string;
        };
        Update: {
          user_id?: string;
          app?: string;
          file_path?: string;
          file_name?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      mdi_history: {
        Row: {
          id: string;
          user_id: string;
          app: string;
          layer: string;
          source_branch: string;
          target_branch: string;
          proyecto: string;
          file_name: string;
          payload: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          app: string;
          layer: string;
          source_branch: string;
          target_branch: string;
          proyecto: string;
          file_name: string;
          payload: Json;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          app?: string;
          layer?: string;
          source_branch?: string;
          target_branch?: string;
          proyecto?: string;
          file_name?: string;
          payload?: Json;
          created_at?: string;
        };
        Relationships: [];
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
      services_catalog: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
      service_links: {
        Args: { p_service_id: string };
        Returns: Json;
      };
      databases_catalog: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
      database_used_by: {
        Args: { p_database_id: string };
        Returns: Json;
      };
      relations_graph: {
        Args: Record<PropertyKey, never>;
        Returns: Json;
      };
      bulk_import_apply: {
        Args: { p_databases: Json; p_services: Json };
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
