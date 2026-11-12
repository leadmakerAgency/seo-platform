export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      activity_log: {
        Row: {
          action: string
          actor_id: string | null
          client_id: string | null
          created_at: string
          id: number
          meta: Json
          request_id: string | null
          task_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          client_id?: string | null
          created_at?: string
          id?: never
          meta?: Json
          request_id?: string | null
          task_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          client_id?: string | null
          created_at?: string
          id?: never
          meta?: Json
          request_id?: string | null
          task_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_log_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_log_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "client_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_log_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "task_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_log_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      alerts: {
        Row: {
          action_href: string | null
          action_label: string | null
          client_id: string
          created_at: string
          detail: string | null
          id: string
          resolved_at: string | null
          severity: Database["public"]["Enums"]["alert_severity"]
          source_key: string | null
          title: string
        }
        Insert: {
          action_href?: string | null
          action_label?: string | null
          client_id: string
          created_at?: string
          detail?: string | null
          id?: string
          resolved_at?: string | null
          severity: Database["public"]["Enums"]["alert_severity"]
          source_key?: string | null
          title: string
        }
        Update: {
          action_href?: string | null
          action_label?: string | null
          client_id?: string
          created_at?: string
          detail?: string | null
          id?: string
          resolved_at?: string | null
          severity?: Database["public"]["Enums"]["alert_severity"]
          source_key?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "alerts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      client_business_profiles: {
        Row: {
          business_name: string | null
          city: string | null
          client_id: string
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          contact_role: string | null
          country_code: string | null
          description: string | null
          hours: Json | null
          legal_name: string | null
          other_categories: string[]
          phone: string | null
          postal_code: string | null
          preferred_contact: string | null
          primary_category: string | null
          public_email: string | null
          region: string | null
          service_area_business: boolean
          service_areas: string[]
          services: string[]
          street: string | null
          updated_at: string
          updated_by: string | null
          website: string | null
          year_founded: number | null
        }
        Insert: {
          business_name?: string | null
          city?: string | null
          client_id: string
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          contact_role?: string | null
          country_code?: string | null
          description?: string | null
          hours?: Json | null
          legal_name?: string | null
          other_categories?: string[]
          phone?: string | null
          postal_code?: string | null
          preferred_contact?: string | null
          primary_category?: string | null
          public_email?: string | null
          region?: string | null
          service_area_business?: boolean
          service_areas?: string[]
          services?: string[]
          street?: string | null
          updated_at?: string
          updated_by?: string | null
          website?: string | null
          year_founded?: number | null
        }
        Update: {
          business_name?: string | null
          city?: string | null
          client_id?: string
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          contact_role?: string | null
          country_code?: string | null
          description?: string | null
          hours?: Json | null
          legal_name?: string | null
          other_categories?: string[]
          phone?: string | null
          postal_code?: string | null
          preferred_contact?: string | null
          primary_category?: string | null
          public_email?: string | null
          region?: string | null
          service_area_business?: boolean
          service_areas?: string[]
          services?: string[]
          street?: string | null
          updated_at?: string
          updated_by?: string | null
          website?: string | null
          year_founded?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "client_business_profiles_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_business_profiles_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      client_logins: {
        Row: {
          client_id: string
          created_at: string
          created_by: string | null
          has_2fa: boolean
          id: string
          last_viewed_at: string | null
          last_viewed_by: string | null
          notes: string | null
          secret_id: string
          site_name: string
          site_url: string | null
          source: Database["public"]["Enums"]["login_source"]
          username: string
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          has_2fa?: boolean
          id?: string
          last_viewed_at?: string | null
          last_viewed_by?: string | null
          notes?: string | null
          secret_id: string
          site_name: string
          site_url?: string | null
          source: Database["public"]["Enums"]["login_source"]
          username: string
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          has_2fa?: boolean
          id?: string
          last_viewed_at?: string | null
          last_viewed_by?: string | null
          notes?: string | null
          secret_id?: string
          site_name?: string
          site_url?: string | null
          source?: Database["public"]["Enums"]["login_source"]
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_logins_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_logins_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_logins_last_viewed_by_fkey"
            columns: ["last_viewed_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      client_onboarding: {
        Row: {
          business_status: Database["public"]["Enums"]["onboarding_step_status"]
          client_id: string
          google_access_status: Database["public"]["Enums"]["onboarding_step_status"]
          logins_skipped: boolean
          logins_status: Database["public"]["Enums"]["onboarding_step_status"]
          reviewed_at: string | null
          reviewed_by: string | null
          social_status: Database["public"]["Enums"]["onboarding_step_status"]
          started_at: string | null
          status: Database["public"]["Enums"]["onboarding_status"]
          submitted_at: string | null
          updated_at: string
          website_status: Database["public"]["Enums"]["onboarding_step_status"]
        }
        Insert: {
          business_status?: Database["public"]["Enums"]["onboarding_step_status"]
          client_id: string
          google_access_status?: Database["public"]["Enums"]["onboarding_step_status"]
          logins_skipped?: boolean
          logins_status?: Database["public"]["Enums"]["onboarding_step_status"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          social_status?: Database["public"]["Enums"]["onboarding_step_status"]
          started_at?: string | null
          status?: Database["public"]["Enums"]["onboarding_status"]
          submitted_at?: string | null
          updated_at?: string
          website_status?: Database["public"]["Enums"]["onboarding_step_status"]
        }
        Update: {
          business_status?: Database["public"]["Enums"]["onboarding_step_status"]
          client_id?: string
          google_access_status?: Database["public"]["Enums"]["onboarding_step_status"]
          logins_skipped?: boolean
          logins_status?: Database["public"]["Enums"]["onboarding_step_status"]
          reviewed_at?: string | null
          reviewed_by?: string | null
          social_status?: Database["public"]["Enums"]["onboarding_step_status"]
          started_at?: string | null
          status?: Database["public"]["Enums"]["onboarding_status"]
          submitted_at?: string | null
          updated_at?: string
          website_status?: Database["public"]["Enums"]["onboarding_step_status"]
        }
        Relationships: [
          {
            foreignKeyName: "client_onboarding_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_onboarding_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      client_portal_links: {
        Row: {
          client_id: string
          created_at: string
          created_by: string | null
          last_opened_at: string | null
          token: string
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          last_opened_at?: string | null
          token: string
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          last_opened_at?: string | null
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_portal_links_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_portal_links_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      client_request_files: {
        Row: {
          client_id: string
          created_at: string
          file_name: string
          id: string
          mime_type: string | null
          request_id: string
          size_bytes: number | null
          storage_path: string
        }
        Insert: {
          client_id: string
          created_at?: string
          file_name: string
          id?: string
          mime_type?: string | null
          request_id: string
          size_bytes?: number | null
          storage_path: string
        }
        Update: {
          client_id?: string
          created_at?: string
          file_name?: string
          id?: string
          mime_type?: string | null
          request_id?: string
          size_bytes?: number | null
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_request_files_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_request_files_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "client_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      client_requests: {
        Row: {
          ask_again_note: string | null
          auto_complete: boolean
          client_id: string
          completed_at: string | null
          completed_by: string | null
          created_at: string
          created_by: string | null
          decision: Database["public"]["Enums"]["request_decision"] | null
          due_on: string | null
          id: string
          instructions: string | null
          internal_note: string | null
          kind: Database["public"]["Enums"]["request_kind"]
          number: number
          options: Json
          owner_id: string | null
          reopen_count: number
          responded_at: string | null
          responder_name: string | null
          response_text: string | null
          status: Database["public"]["Enums"]["request_status"]
          task_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          ask_again_note?: string | null
          auto_complete?: boolean
          client_id: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          decision?: Database["public"]["Enums"]["request_decision"] | null
          due_on?: string | null
          id?: string
          instructions?: string | null
          internal_note?: string | null
          kind: Database["public"]["Enums"]["request_kind"]
          number?: never
          options?: Json
          owner_id?: string | null
          reopen_count?: number
          responded_at?: string | null
          responder_name?: string | null
          response_text?: string | null
          status?: Database["public"]["Enums"]["request_status"]
          task_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          ask_again_note?: string | null
          auto_complete?: boolean
          client_id?: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          created_by?: string | null
          decision?: Database["public"]["Enums"]["request_decision"] | null
          due_on?: string | null
          id?: string
          instructions?: string | null
          internal_note?: string | null
          kind?: Database["public"]["Enums"]["request_kind"]
          number?: never
          options?: Json
          owner_id?: string | null
          reopen_count?: number
          responded_at?: string | null
          responder_name?: string | null
          response_text?: string | null
          status?: Database["public"]["Enums"]["request_status"]
          task_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_requests_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_requests_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_requests_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_requests_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_requests_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "task_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_requests_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          articles_target: number
          backlinks_target: number
          city: string | null
          country_code: string
          created_at: string
          created_by: string | null
          health: Database["public"]["Enums"]["client_health"]
          id: string
          industry: string | null
          keywords_target: number
          name: string
          owner_id: string | null
          region: string | null
          slug: string
          stage: Database["public"]["Enums"]["client_stage"]
          started_on: string
          updated_at: string
          website: string | null
        }
        Insert: {
          articles_target?: number
          backlinks_target?: number
          city?: string | null
          country_code?: string
          created_at?: string
          created_by?: string | null
          health?: Database["public"]["Enums"]["client_health"]
          id?: string
          industry?: string | null
          keywords_target?: number
          name: string
          owner_id?: string | null
          region?: string | null
          slug: string
          stage?: Database["public"]["Enums"]["client_stage"]
          started_on?: string
          updated_at?: string
          website?: string | null
        }
        Update: {
          articles_target?: number
          backlinks_target?: number
          city?: string | null
          country_code?: string
          created_at?: string
          created_by?: string | null
          health?: Database["public"]["Enums"]["client_health"]
          id?: string
          industry?: string | null
          keywords_target?: number
          name?: string
          owner_id?: string | null
          region?: string | null
          slug?: string
          stage?: Database["public"]["Enums"]["client_stage"]
          started_on?: string
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clients_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          actor_id: string | null
          client_id: string | null
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["notification_kind"]
          read_at: string | null
          recipient_id: string
          request_id: string | null
          social_account_id: string | null
          task_id: string | null
        }
        Insert: {
          actor_id?: string | null
          client_id?: string | null
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["notification_kind"]
          read_at?: string | null
          recipient_id: string
          request_id?: string | null
          social_account_id?: string | null
          task_id?: string | null
        }
        Update: {
          actor_id?: string | null
          client_id?: string | null
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["notification_kind"]
          read_at?: string | null
          recipient_id?: string
          request_id?: string | null
          social_account_id?: string | null
          task_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "client_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_social_account_id_fkey"
            columns: ["social_account_id"]
            isOneToOne: false
            referencedRelation: "social_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "task_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_business_details: {
        Row: {
          applied_at: string | null
          applied_by: string | null
          business_name: string | null
          city: string | null
          client_id: string
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          contact_role: string | null
          country_code: string | null
          description: string | null
          hours: Json | null
          legal_name: string | null
          notes: string | null
          other_categories: string[]
          phone: string | null
          postal_code: string | null
          preferred_contact: string | null
          primary_category: string | null
          public_email: string | null
          region: string | null
          service_area_business: boolean
          service_areas: string[]
          services: string[]
          street: string | null
          updated_at: string
          website: string | null
          year_founded: number | null
        }
        Insert: {
          applied_at?: string | null
          applied_by?: string | null
          business_name?: string | null
          city?: string | null
          client_id: string
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          contact_role?: string | null
          country_code?: string | null
          description?: string | null
          hours?: Json | null
          legal_name?: string | null
          notes?: string | null
          other_categories?: string[]
          phone?: string | null
          postal_code?: string | null
          preferred_contact?: string | null
          primary_category?: string | null
          public_email?: string | null
          region?: string | null
          service_area_business?: boolean
          service_areas?: string[]
          services?: string[]
          street?: string | null
          updated_at?: string
          website?: string | null
          year_founded?: number | null
        }
        Update: {
          applied_at?: string | null
          applied_by?: string | null
          business_name?: string | null
          city?: string | null
          client_id?: string
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          contact_role?: string | null
          country_code?: string | null
          description?: string | null
          hours?: Json | null
          legal_name?: string | null
          notes?: string | null
          other_categories?: string[]
          phone?: string | null
          postal_code?: string | null
          preferred_contact?: string | null
          primary_category?: string | null
          public_email?: string | null
          region?: string | null
          service_area_business?: boolean
          service_areas?: string[]
          services?: string[]
          street?: string | null
          updated_at?: string
          website?: string | null
          year_founded?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_business_details_applied_by_fkey"
            columns: ["applied_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_business_details_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_google_access: {
        Row: {
          client_id: string
          ga4_property: string | null
          ga4_status: Database["public"]["Enums"]["google_access_status"]
          ga4_verified_at: string | null
          notes: string | null
          sc_property: string | null
          sc_status: Database["public"]["Enums"]["google_access_status"]
          sc_verified_at: string | null
          updated_at: string
          verified_by: string | null
        }
        Insert: {
          client_id: string
          ga4_property?: string | null
          ga4_status?: Database["public"]["Enums"]["google_access_status"]
          ga4_verified_at?: string | null
          notes?: string | null
          sc_property?: string | null
          sc_status?: Database["public"]["Enums"]["google_access_status"]
          sc_verified_at?: string | null
          updated_at?: string
          verified_by?: string | null
        }
        Update: {
          client_id?: string
          ga4_property?: string | null
          ga4_status?: Database["public"]["Enums"]["google_access_status"]
          ga4_verified_at?: string | null
          notes?: string | null
          sc_property?: string | null
          sc_status?: Database["public"]["Enums"]["google_access_status"]
          sc_verified_at?: string | null
          updated_at?: string
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_google_access_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_google_access_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_links: {
        Row: {
          client_id: string
          created_at: string
          created_by: string | null
          expires_at: string
          first_opened_at: string | null
          id: string
          last_opened_at: string | null
          revoked_at: string | null
          status: Database["public"]["Enums"]["onboarding_link_status"]
          token: string
          writes_count: number
          writes_window_start: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          expires_at?: string
          first_opened_at?: string | null
          id?: string
          last_opened_at?: string | null
          revoked_at?: string | null
          status?: Database["public"]["Enums"]["onboarding_link_status"]
          token: string
          writes_count?: number
          writes_window_start?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string
          first_opened_at?: string | null
          id?: string
          last_opened_at?: string | null
          revoked_at?: string | null
          status?: Database["public"]["Enums"]["onboarding_link_status"]
          token?: string
          writes_count?: number
          writes_window_start?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_links_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_links_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_social_choices: {
        Row: {
          client_id: string
          platform: Database["public"]["Enums"]["social_platform"]
          updated_at: string
        }
        Insert: {
          client_id: string
          platform: Database["public"]["Enums"]["social_platform"]
          updated_at?: string
        }
        Update: {
          client_id?: string
          platform?: Database["public"]["Enums"]["social_platform"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_social_choices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_website: {
        Row: {
          access_status: Database["public"]["Enums"]["website_access_status"]
          client_id: string
          developer_email: string | null
          developer_name: string | null
          managed_by: Database["public"]["Enums"]["website_manager"] | null
          notes: string | null
          platform: Database["public"]["Enums"]["website_platform"] | null
          updated_at: string
          url: string | null
        }
        Insert: {
          access_status?: Database["public"]["Enums"]["website_access_status"]
          client_id: string
          developer_email?: string | null
          developer_name?: string | null
          managed_by?: Database["public"]["Enums"]["website_manager"] | null
          notes?: string | null
          platform?: Database["public"]["Enums"]["website_platform"] | null
          updated_at?: string
          url?: string | null
        }
        Update: {
          access_status?: Database["public"]["Enums"]["website_access_status"]
          client_id?: string
          developer_email?: string | null
          developer_name?: string | null
          managed_by?: Database["public"]["Enums"]["website_manager"] | null
          notes?: string | null
          platform?: Database["public"]["Enums"]["website_platform"] | null
          updated_at?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_website_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      social_accounts: {
        Row: {
          avatar_url: string | null
          can_fetch_analytics: boolean | null
          can_post: boolean | null
          client_id: string
          connected_at: string
          connected_by: string | null
          created_at: string
          disconnect_reason: string | null
          display_name: string | null
          id: string
          issues: string[]
          last_checked_at: string | null
          location_id: string | null
          location_name: string | null
          platform: Database["public"]["Enums"]["social_platform"]
          platform_user_id: string | null
          profile_url: string | null
          removal_grace_ends_at: string | null
          removed_at: string | null
          status: Database["public"]["Enums"]["social_account_status"]
          token_expires_at: string | null
          unhealthy_since: string | null
          updated_at: string
          username: string | null
          zernio_account_id: string
          zernio_profile_id: string
        }
        Insert: {
          avatar_url?: string | null
          can_fetch_analytics?: boolean | null
          can_post?: boolean | null
          client_id: string
          connected_at?: string
          connected_by?: string | null
          created_at?: string
          disconnect_reason?: string | null
          display_name?: string | null
          id?: string
          issues?: string[]
          last_checked_at?: string | null
          location_id?: string | null
          location_name?: string | null
          platform: Database["public"]["Enums"]["social_platform"]
          platform_user_id?: string | null
          profile_url?: string | null
          removal_grace_ends_at?: string | null
          removed_at?: string | null
          status?: Database["public"]["Enums"]["social_account_status"]
          token_expires_at?: string | null
          unhealthy_since?: string | null
          updated_at?: string
          username?: string | null
          zernio_account_id: string
          zernio_profile_id: string
        }
        Update: {
          avatar_url?: string | null
          can_fetch_analytics?: boolean | null
          can_post?: boolean | null
          client_id?: string
          connected_at?: string
          connected_by?: string | null
          created_at?: string
          disconnect_reason?: string | null
          display_name?: string | null
          id?: string
          issues?: string[]
          last_checked_at?: string | null
          location_id?: string | null
          location_name?: string | null
          platform?: Database["public"]["Enums"]["social_platform"]
          platform_user_id?: string | null
          profile_url?: string | null
          removal_grace_ends_at?: string | null
          removed_at?: string | null
          status?: Database["public"]["Enums"]["social_account_status"]
          token_expires_at?: string | null
          unhealthy_since?: string | null
          updated_at?: string
          username?: string | null
          zernio_account_id?: string
          zernio_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_accounts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_accounts_client_id_zernio_profile_id_fkey"
            columns: ["client_id", "zernio_profile_id"]
            isOneToOne: false
            referencedRelation: "zernio_profiles"
            referencedColumns: ["client_id", "zernio_profile_id"]
          },
          {
            foreignKeyName: "social_accounts_connected_by_fkey"
            columns: ["connected_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      social_connect_attempts: {
        Row: {
          callback_key_hash: string | null
          client_id: string
          completed_at: string | null
          created_at: string
          created_by: string | null
          error_code: string | null
          error_message: string | null
          expires_at: string
          id: string
          invite_url: string | null
          method: Database["public"]["Enums"]["connect_method"]
          platform: Database["public"]["Enums"]["social_platform"]
          reconnect_account_id: string | null
          result_account_id: string | null
          source: Database["public"]["Enums"]["connect_source"]
          status: Database["public"]["Enums"]["connect_attempt_status"]
          zernio_request_id: string | null
        }
        Insert: {
          callback_key_hash?: string | null
          client_id: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          error_code?: string | null
          error_message?: string | null
          expires_at: string
          id?: string
          invite_url?: string | null
          method: Database["public"]["Enums"]["connect_method"]
          platform: Database["public"]["Enums"]["social_platform"]
          reconnect_account_id?: string | null
          result_account_id?: string | null
          source?: Database["public"]["Enums"]["connect_source"]
          status?: Database["public"]["Enums"]["connect_attempt_status"]
          zernio_request_id?: string | null
        }
        Update: {
          callback_key_hash?: string | null
          client_id?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          error_code?: string | null
          error_message?: string | null
          expires_at?: string
          id?: string
          invite_url?: string | null
          method?: Database["public"]["Enums"]["connect_method"]
          platform?: Database["public"]["Enums"]["social_platform"]
          reconnect_account_id?: string | null
          result_account_id?: string | null
          source?: Database["public"]["Enums"]["connect_source"]
          status?: Database["public"]["Enums"]["connect_attempt_status"]
          zernio_request_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "social_connect_attempts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_connect_attempts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_connect_attempts_reconnect_account_id_fkey"
            columns: ["reconnect_account_id"]
            isOneToOne: false
            referencedRelation: "social_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_connect_attempts_result_account_id_fkey"
            columns: ["result_account_id"]
            isOneToOne: false
            referencedRelation: "social_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      task_clients: {
        Row: {
          client_id: string
          created_at: string
          done_at: string | null
          done_by: string | null
          task_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          done_at?: string | null
          done_by?: string | null
          task_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          done_at?: string | null
          done_by?: string | null
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_clients_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_clients_done_by_fkey"
            columns: ["done_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_clients_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "task_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_clients_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_comments: {
        Row: {
          author_id: string | null
          body: string
          created_at: string
          id: string
          mentions: string[]
          task_id: string
        }
        Insert: {
          author_id?: string | null
          body: string
          created_at?: string
          id?: string
          mentions?: string[]
          task_id: string
        }
        Update: {
          author_id?: string | null
          body?: string
          created_at?: string
          id?: string
          mentions?: string[]
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "task_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assignee_id: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_on: string | null
          id: string
          number: number
          previous_task_id: string | null
          priority: Database["public"]["Enums"]["task_priority"]
          repeat: Database["public"]["Enums"]["task_repeat"]
          status: Database["public"]["Enums"]["task_status"]
          steps: string[]
          title: string
          type: Database["public"]["Enums"]["task_type"]
          updated_at: string
        }
        Insert: {
          assignee_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_on?: string | null
          id?: string
          number?: never
          previous_task_id?: string | null
          priority?: Database["public"]["Enums"]["task_priority"]
          repeat?: Database["public"]["Enums"]["task_repeat"]
          status?: Database["public"]["Enums"]["task_status"]
          steps?: string[]
          title: string
          type?: Database["public"]["Enums"]["task_type"]
          updated_at?: string
        }
        Update: {
          assignee_id?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_on?: string | null
          id?: string
          number?: never
          previous_task_id?: string | null
          priority?: Database["public"]["Enums"]["task_priority"]
          repeat?: Database["public"]["Enums"]["task_repeat"]
          status?: Database["public"]["Enums"]["task_status"]
          steps?: string[]
          title?: string
          type?: Database["public"]["Enums"]["task_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_previous_task_id_fkey"
            columns: ["previous_task_id"]
            isOneToOne: true
            referencedRelation: "task_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_previous_task_id_fkey"
            columns: ["previous_task_id"]
            isOneToOne: true
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          created_at: string
          email: string
          full_name: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          status: Database["public"]["Enums"]["member_status"]
        }
        Insert: {
          created_at?: string
          email: string
          full_name?: string
          id: string
          role?: Database["public"]["Enums"]["app_role"]
          status?: Database["public"]["Enums"]["member_status"]
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          status?: Database["public"]["Enums"]["member_status"]
        }
        Relationships: []
      }
      zernio_profiles: {
        Row: {
          client_id: string
          created_at: string
          created_by: string | null
          zernio_profile_id: string
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          zernio_profile_id: string
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          zernio_profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "zernio_profiles_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "zernio_profiles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      zernio_webhook_events: {
        Row: {
          attempts: number
          client_id: string | null
          event: string
          id: string
          last_error: string | null
          payload: Json
          processed_at: string | null
          received_at: string
          zernio_account_id: string | null
          zernio_profile_id: string | null
        }
        Insert: {
          attempts?: number
          client_id?: string | null
          event: string
          id: string
          last_error?: string | null
          payload: Json
          processed_at?: string | null
          received_at?: string
          zernio_account_id?: string | null
          zernio_profile_id?: string | null
        }
        Update: {
          attempts?: number
          client_id?: string | null
          event?: string
          id?: string
          last_error?: string | null
          payload?: Json
          processed_at?: string | null
          received_at?: string
          zernio_account_id?: string | null
          zernio_profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "zernio_webhook_events_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      task_list: {
        Row: {
          assignee_id: string | null
          assignee_name: string | null
          client_preview: string[] | null
          client_search: string | null
          clients_done: number | null
          clients_total: number | null
          completed_at: string | null
          created_at: string | null
          due_on: string | null
          id: string | null
          number: number | null
          priority: Database["public"]["Enums"]["task_priority"] | null
          repeat: Database["public"]["Enums"]["task_repeat"] | null
          status: Database["public"]["Enums"]["task_status"] | null
          title: string | null
          type: Database["public"]["Enums"]["task_type"] | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      add_client_login: {
        Args: {
          p_client_id: string
          p_has_2fa: boolean
          p_notes: string
          p_password: string
          p_site_name: string
          p_site_url: string
          p_username: string
        }
        Returns: string
      }
      apply_onboarding_profile: {
        Args: { p_client_id: string; p_fields: string[] }
        Returns: undefined
      }
      client_health_counts: {
        Args: never
        Returns: {
          health: Database["public"]["Enums"]["client_health"]
          total: number
        }[]
      }
      configure_zernio_cron: {
        Args: { p_base_url: string }
        Returns: undefined
      }
      onboarding_add_login: {
        Args: {
          p_has_2fa: boolean
          p_notes: string
          p_password: string
          p_site_name: string
          p_site_url: string
          p_token: string
          p_username: string
        }
        Returns: Json
      }
      onboarding_get: { Args: { p_token: string }; Returns: Json }
      onboarding_mark_reviewed: {
        Args: { p_activate: boolean; p_client_id: string }
        Returns: undefined
      }
      onboarding_mark_verified: {
        Args: { p_client_id: string; p_verified: boolean; p_which: string }
        Returns: undefined
      }
      onboarding_remove_login: {
        Args: { p_login_id: string; p_token: string }
        Returns: Json
      }
      onboarding_reopen: { Args: { p_client_id: string }; Returns: undefined }
      onboarding_save_business: {
        Args: { p_data: Json; p_token: string }
        Returns: Json
      }
      onboarding_save_google_access: {
        Args: { p_data: Json; p_token: string }
        Returns: Json
      }
      onboarding_save_website: {
        Args: { p_data: Json; p_token: string }
        Returns: Json
      }
      onboarding_set_not_using: {
        Args: {
          p_not_using: boolean
          p_platforms: Database["public"]["Enums"]["social_platform"][]
          p_token: string
        }
        Returns: Json
      }
      onboarding_skip_logins: {
        Args: { p_skip: boolean; p_token: string }
        Returns: Json
      }
      onboarding_submit: { Args: { p_token: string }; Returns: Json }
      portal_attach_file: {
        Args: {
          p_mime: string
          p_name: string
          p_path: string
          p_request_id: string
          p_size: number
          p_token: string
        }
        Returns: string
      }
      portal_get: { Args: { p_token: string }; Returns: Json }
      portal_remove_file: {
        Args: { p_file_id: string; p_token: string }
        Returns: undefined
      }
      portal_respond: {
        Args: {
          p_decision: Database["public"]["Enums"]["request_decision"]
          p_name: string
          p_request_id: string
          p_text: string
          p_token: string
        }
        Returns: Database["public"]["Enums"]["request_status"]
      }
      remove_client_login: { Args: { p_login_id: string }; Returns: undefined }
      reveal_client_login: { Args: { p_login_id: string }; Returns: string }
      setup_required: { Args: never; Returns: boolean }
      task_counts: {
        Args: { p_mine?: boolean }
        Returns: {
          done: number
          due_this_week: number
          due_today: number
          mine_open: number
          my_attention: number
          overdue: number
          team_open: number
          waiting: number
        }[]
      }
      verify_zernio_cron_token: { Args: { p_token: string }; Returns: boolean }
      zernio_cron_status: { Args: never; Returns: Json }
    }
    Enums: {
      alert_severity: "needs_look" | "action_needed"
      app_role: "admin" | "manager" | "va" | "writer" | "viewer"
      client_health: "on_track" | "needs_look" | "action_needed"
      client_stage: "onboarding" | "active" | "paused" | "churned"
      connect_attempt_status:
        | "pending"
        | "connected"
        | "failed"
        | "expired"
        | "cancelled"
      connect_method: "oauth" | "invite"
      connect_source: "team" | "onboarding"
      google_access_status:
        | "todo"
        | "added"
        | "no_access"
        | "not_using"
        | "help"
      login_source: "onboarding" | "team"
      member_status: "active" | "invited" | "disabled"
      notification_kind:
        | "task_assigned"
        | "task_mentioned"
        | "task_commented"
        | "request_answered"
        | "connection_lost"
        | "onboarding_opened"
        | "onboarding_submitted"
      onboarding_link_status: "active" | "revoked" | "expired"
      onboarding_status:
        | "not_started"
        | "in_progress"
        | "submitted"
        | "reviewed"
      onboarding_step_status: "todo" | "in_progress" | "done" | "skipped"
      request_decision: "approved" | "changes_requested"
      request_kind: "question" | "code" | "files" | "approval" | "action"
      request_status: "open" | "answered" | "done" | "cancelled"
      social_account_status: "connected" | "needs_reconnect" | "removed"
      social_platform:
        | "googlebusiness"
        | "facebook"
        | "instagram"
        | "linkedin"
        | "youtube"
        | "twitter"
        | "tiktok"
        | "pinterest"
        | "threads"
      task_priority: "low" | "normal" | "high"
      task_repeat: "none" | "weekdays" | "weekly" | "monthly"
      task_status: "todo" | "in_progress" | "waiting_on_client" | "done"
      task_type:
        | "backlinks"
        | "google_profile"
        | "content"
        | "reviews"
        | "connections"
        | "reports"
        | "client_follow_up"
        | "other"
      website_access_status: "todo" | "invited_us" | "login_in_vault" | "later"
      website_manager: "self" | "developer" | "agency" | "unknown"
      website_platform:
        | "wordpress"
        | "webflow"
        | "shopify"
        | "wix"
        | "squarespace"
        | "godaddy"
        | "other"
        | "none"
        | "unknown"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      alert_severity: ["needs_look", "action_needed"],
      app_role: ["admin", "manager", "va", "writer", "viewer"],
      client_health: ["on_track", "needs_look", "action_needed"],
      client_stage: ["onboarding", "active", "paused", "churned"],
      connect_attempt_status: [
        "pending",
        "connected",
        "failed",
        "expired",
        "cancelled",
      ],
      connect_method: ["oauth", "invite"],
      connect_source: ["team", "onboarding"],
      google_access_status: ["todo", "added", "no_access", "not_using", "help"],
      login_source: ["onboarding", "team"],
      member_status: ["active", "invited", "disabled"],
      notification_kind: [
        "task_assigned",
        "task_mentioned",
        "task_commented",
        "request_answered",
        "connection_lost",
        "onboarding_opened",
        "onboarding_submitted",
      ],
      onboarding_link_status: ["active", "revoked", "expired"],
      onboarding_status: [
        "not_started",
        "in_progress",
        "submitted",
        "reviewed",
      ],
      onboarding_step_status: ["todo", "in_progress", "done", "skipped"],
      request_decision: ["approved", "changes_requested"],
      request_kind: ["question", "code", "files", "approval", "action"],
      request_status: ["open", "answered", "done", "cancelled"],
      social_account_status: ["connected", "needs_reconnect", "removed"],
      social_platform: [
        "googlebusiness",
        "facebook",
        "instagram",
        "linkedin",
        "youtube",
        "twitter",
        "tiktok",
        "pinterest",
        "threads",
      ],
      task_priority: ["low", "normal", "high"],
      task_repeat: ["none", "weekdays", "weekly", "monthly"],
      task_status: ["todo", "in_progress", "waiting_on_client", "done"],
      task_type: [
        "backlinks",
        "google_profile",
        "content",
        "reviews",
        "connections",
        "reports",
        "client_follow_up",
        "other",
      ],
      website_access_status: ["todo", "invited_us", "login_in_vault", "later"],
      website_manager: ["self", "developer", "agency", "unknown"],
      website_platform: [
        "wordpress",
        "webflow",
        "shopify",
        "wix",
        "squarespace",
        "godaddy",
        "other",
        "none",
        "unknown",
      ],
    },
  },
} as const
