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
      ai_answers: {
        Row: {
          check_id: string
          cited_url: string | null
          client_id: string
          keyword_id: string
          mentioned: boolean
          position: number | null
          run_no: number
          tool: Database["public"]["Enums"]["ai_tool"]
        }
        Insert: {
          check_id: string
          cited_url?: string | null
          client_id: string
          keyword_id: string
          mentioned: boolean
          position?: number | null
          run_no: number
          tool: Database["public"]["Enums"]["ai_tool"]
        }
        Update: {
          check_id?: string
          cited_url?: string | null
          client_id?: string
          keyword_id?: string
          mentioned?: boolean
          position?: number | null
          run_no?: number
          tool?: Database["public"]["Enums"]["ai_tool"]
        }
        Relationships: [
          {
            foreignKeyName: "ai_answers_check_id_client_id_fkey"
            columns: ["check_id", "client_id"]
            isOneToOne: false
            referencedRelation: "ai_checks"
            referencedColumns: ["id", "client_id"]
          },
          {
            foreignKeyName: "ai_answers_keyword_id_client_id_fkey"
            columns: ["keyword_id", "client_id"]
            isOneToOne: false
            referencedRelation: "keywords"
            referencedColumns: ["id", "client_id"]
          },
        ]
      }
      ai_calls: {
        Row: {
          cache_read_tokens: number
          cache_write_tokens: number
          client_id: string | null
          cost_usd: number
          created_at: string
          error: string | null
          feature: string
          id: number
          input_tokens: number
          model: string
          ms: number | null
          ok: boolean
          output_tokens: number
          ref: string | null
          stage: string | null
          task_id: string | null
          web_searches: number
        }
        Insert: {
          cache_read_tokens?: number
          cache_write_tokens?: number
          client_id?: string | null
          cost_usd?: number
          created_at?: string
          error?: string | null
          feature: string
          id?: never
          input_tokens?: number
          model: string
          ms?: number | null
          ok?: boolean
          output_tokens?: number
          ref?: string | null
          stage?: string | null
          task_id?: string | null
          web_searches?: number
        }
        Update: {
          cache_read_tokens?: number
          cache_write_tokens?: number
          client_id?: string | null
          cost_usd?: number
          created_at?: string
          error?: string | null
          feature?: string
          id?: never
          input_tokens?: number
          model?: string
          ms?: number | null
          ok?: boolean
          output_tokens?: number
          ref?: string | null
          stage?: string | null
          task_id?: string | null
          web_searches?: number
        }
        Relationships: [
          {
            foreignKeyName: "ai_calls_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_checks: {
        Row: {
          checked_at: string | null
          client_id: string
          cost_usd: number | null
          error: string | null
          id: string
          runs: number
          source: string
          started_at: string
          status: Database["public"]["Enums"]["check_status"]
        }
        Insert: {
          checked_at?: string | null
          client_id: string
          cost_usd?: number | null
          error?: string | null
          id?: string
          runs?: number
          source?: string
          started_at?: string
          status?: Database["public"]["Enums"]["check_status"]
        }
        Update: {
          checked_at?: string | null
          client_id?: string
          cost_usd?: number | null
          error?: string | null
          id?: string
          runs?: number
          source?: string
          started_at?: string
          status?: Database["public"]["Enums"]["check_status"]
        }
        Relationships: [
          {
            foreignKeyName: "ai_checks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_client_dossiers: {
        Row: {
          brief_version: number | null
          client_id: string
          competitors: Json
          dossier: Json
          ranking_map: Json
          run_id: string | null
          updated_at: string
        }
        Insert: {
          brief_version?: number | null
          client_id: string
          competitors?: Json
          dossier?: Json
          ranking_map?: Json
          run_id?: string | null
          updated_at?: string
        }
        Update: {
          brief_version?: number | null
          client_id?: string
          competitors?: Json
          dossier?: Json
          ranking_map?: Json
          run_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_client_dossiers_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_client_dossiers_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "ai_search_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_link_prospects: {
        Row: {
          action: string | null
          authority: number | null
          category: string
          client_id: string
          competitor_links: Json
          cost_type: string | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          directory_id: string
          effort: string | null
          evidence: Json
          filter_reason: string | null
          first_run_id: string | null
          fit: number | null
          found_by: string[]
          id: string
          last_run_id: string | null
          link_kind: string | null
          link_type: string | null
          notes: string | null
          page_title: string | null
          page_url: string | null
          reason: string | null
          reject_note: string | null
          reject_reason:
            | Database["public"]["Enums"]["backlink_reject_reason"]
            | null
          replicability: string | null
          scores: Json
          shared_count: number | null
          shortlist_rank: number | null
          status: Database["public"]["Enums"]["opportunity_status"]
          target_ids: string[]
          updated_at: string
          verdict: string | null
          verification: Json
        }
        Insert: {
          action?: string | null
          authority?: number | null
          category?: string
          client_id: string
          competitor_links?: Json
          cost_type?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          directory_id: string
          effort?: string | null
          evidence?: Json
          filter_reason?: string | null
          first_run_id?: string | null
          fit?: number | null
          found_by?: string[]
          id?: string
          last_run_id?: string | null
          link_kind?: string | null
          link_type?: string | null
          notes?: string | null
          page_title?: string | null
          page_url?: string | null
          reason?: string | null
          reject_note?: string | null
          reject_reason?:
            | Database["public"]["Enums"]["backlink_reject_reason"]
            | null
          replicability?: string | null
          scores?: Json
          shared_count?: number | null
          shortlist_rank?: number | null
          status?: Database["public"]["Enums"]["opportunity_status"]
          target_ids?: string[]
          updated_at?: string
          verdict?: string | null
          verification?: Json
        }
        Update: {
          action?: string | null
          authority?: number | null
          category?: string
          client_id?: string
          competitor_links?: Json
          cost_type?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          directory_id?: string
          effort?: string | null
          evidence?: Json
          filter_reason?: string | null
          first_run_id?: string | null
          fit?: number | null
          found_by?: string[]
          id?: string
          last_run_id?: string | null
          link_kind?: string | null
          link_type?: string | null
          notes?: string | null
          page_title?: string | null
          page_url?: string | null
          reason?: string | null
          reject_note?: string | null
          reject_reason?:
            | Database["public"]["Enums"]["backlink_reject_reason"]
            | null
          replicability?: string | null
          scores?: Json
          shared_count?: number | null
          shortlist_rank?: number | null
          status?: Database["public"]["Enums"]["opportunity_status"]
          target_ids?: string[]
          updated_at?: string
          verdict?: string | null
          verification?: Json
        }
        Relationships: [
          {
            foreignKeyName: "ai_link_prospects_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_link_prospects_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_link_prospects_directory_id_fkey"
            columns: ["directory_id"]
            isOneToOne: false
            referencedRelation: "directories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_link_prospects_first_run_id_fkey"
            columns: ["first_run_id"]
            isOneToOne: false
            referencedRelation: "ai_search_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_link_prospects_last_run_id_fkey"
            columns: ["last_run_id"]
            isOneToOne: false
            referencedRelation: "ai_search_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_search_runs: {
        Row: {
          attempts: number
          brief_version: number | null
          client_id: string
          competitors: string[]
          cost_usd: number
          counts: Json
          created_at: string
          created_by: string | null
          error: string | null
          estimate_usd: number
          finished_at: string | null
          heartbeat_at: string | null
          id: string
          kind: string
          params: Json
          released_at: string | null
          stage: number
          started_at: string | null
          status: Database["public"]["Enums"]["backlink_run_status"]
          target_ids: string[]
          web_searches: number
        }
        Insert: {
          attempts?: number
          brief_version?: number | null
          client_id: string
          competitors?: string[]
          cost_usd?: number
          counts?: Json
          created_at?: string
          created_by?: string | null
          error?: string | null
          estimate_usd?: number
          finished_at?: string | null
          heartbeat_at?: string | null
          id?: string
          kind?: string
          params?: Json
          released_at?: string | null
          stage?: number
          started_at?: string | null
          status?: Database["public"]["Enums"]["backlink_run_status"]
          target_ids?: string[]
          web_searches?: number
        }
        Update: {
          attempts?: number
          brief_version?: number | null
          client_id?: string
          competitors?: string[]
          cost_usd?: number
          counts?: Json
          created_at?: string
          created_by?: string | null
          error?: string | null
          estimate_usd?: number
          finished_at?: string | null
          heartbeat_at?: string | null
          id?: string
          kind?: string
          params?: Json
          released_at?: string | null
          stage?: number
          started_at?: string | null
          status?: Database["public"]["Enums"]["backlink_run_status"]
          target_ids?: string[]
          web_searches?: number
        }
        Relationships: [
          {
            foreignKeyName: "ai_search_runs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_search_runs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_search_tasks: {
        Row: {
          attempts: number
          client_id: string
          cost_usd: number
          created_at: string
          error: string | null
          finished_at: string | null
          id: string
          input: Json
          key: string
          kind: string
          model: string | null
          output: Json | null
          prompt_version: string | null
          run_id: string
          stage: number
          started_at: string | null
          status: string
          tokens_in: number
          tokens_out: number
          web_searches: number
        }
        Insert: {
          attempts?: number
          client_id: string
          cost_usd?: number
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          input?: Json
          key: string
          kind: string
          model?: string | null
          output?: Json | null
          prompt_version?: string | null
          run_id: string
          stage: number
          started_at?: string | null
          status?: string
          tokens_in?: number
          tokens_out?: number
          web_searches?: number
        }
        Update: {
          attempts?: number
          client_id?: string
          cost_usd?: number
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          input?: Json
          key?: string
          kind?: string
          model?: string | null
          output?: Json | null
          prompt_version?: string | null
          run_id?: string
          stage?: number
          started_at?: string | null
          status?: string
          tokens_in?: number
          tokens_out?: number
          web_searches?: number
        }
        Relationships: [
          {
            foreignKeyName: "ai_search_tasks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_search_tasks_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "ai_search_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      aiv_actions: {
        Row: {
          client_id: string
          created_at: string
          created_by: string | null
          created_run_id: string | null
          detail: string | null
          domain: string | null
          done_at: string | null
          done_by: string | null
          evidence: Json
          group: string
          id: string
          impact: string
          opportunity_id: string | null
          source: string
          status: string
          title: string
          updated_at: string
          url: string | null
          work_item_id: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          created_run_id?: string | null
          detail?: string | null
          domain?: string | null
          done_at?: string | null
          done_by?: string | null
          evidence?: Json
          group: string
          id?: string
          impact?: string
          opportunity_id?: string | null
          source?: string
          status?: string
          title: string
          updated_at?: string
          url?: string | null
          work_item_id?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          created_run_id?: string | null
          detail?: string | null
          domain?: string | null
          done_at?: string | null
          done_by?: string | null
          evidence?: Json
          group?: string
          id?: string
          impact?: string
          opportunity_id?: string | null
          source?: string
          status?: string
          title?: string
          updated_at?: string
          url?: string | null
          work_item_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "aiv_actions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aiv_actions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aiv_actions_created_run_id_fkey"
            columns: ["created_run_id"]
            isOneToOne: false
            referencedRelation: "aiv_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aiv_actions_done_by_fkey"
            columns: ["done_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aiv_actions_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "backlink_opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aiv_actions_work_item_id_fkey"
            columns: ["work_item_id"]
            isOneToOne: false
            referencedRelation: "work_items"
            referencedColumns: ["id"]
          },
        ]
      }
      aiv_ads: {
        Row: {
          advertiser: string | null
          chat_id: string
          client_id: string
          domain: string | null
          id: number
          run_date: string
          title: string | null
          url: string | null
        }
        Insert: {
          advertiser?: string | null
          chat_id: string
          client_id: string
          domain?: string | null
          id?: never
          run_date: string
          title?: string | null
          url?: string | null
        }
        Update: {
          advertiser?: string | null
          chat_id?: string
          client_id?: string
          domain?: string | null
          id?: never
          run_date?: string
          title?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "aiv_ads_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "aiv_chats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aiv_ads_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      aiv_brands: {
        Row: {
          active: boolean
          client_id: string
          color_slot: number
          created_at: string
          created_by: string | null
          display_name: string
          domains: string[]
          id: string
          is_own: boolean
          pattern: string | null
          source: string
          tracked_names: string[]
          updated_at: string
        }
        Insert: {
          active?: boolean
          client_id: string
          color_slot?: number
          created_at?: string
          created_by?: string | null
          display_name: string
          domains?: string[]
          id?: string
          is_own?: boolean
          pattern?: string | null
          source?: string
          tracked_names: string[]
          updated_at?: string
        }
        Update: {
          active?: boolean
          client_id?: string
          color_slot?: number
          created_at?: string
          created_by?: string | null
          display_name?: string
          domains?: string[]
          id?: string
          is_own?: boolean
          pattern?: string | null
          source?: string
          tracked_names?: string[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "aiv_brands_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aiv_brands_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      aiv_chats: {
        Row: {
          analysis_version: string | null
          analyzed_at: string | null
          answer: string | null
          brand_hints: string[]
          check_url: string | null
          client_id: string
          country: string
          country_fallback: boolean
          created_at: string
          error: string | null
          fan_out: string[]
          fetched_at: string
          has_ads: boolean
          id: string
          model: Database["public"]["Enums"]["aiv_model"]
          model_version: string | null
          prompt_id: string
          run_date: string
          run_id: string
          status: string
          task_id: string | null
        }
        Insert: {
          analysis_version?: string | null
          analyzed_at?: string | null
          answer?: string | null
          brand_hints?: string[]
          check_url?: string | null
          client_id: string
          country: string
          country_fallback?: boolean
          created_at?: string
          error?: string | null
          fan_out?: string[]
          fetched_at?: string
          has_ads?: boolean
          id?: string
          model: Database["public"]["Enums"]["aiv_model"]
          model_version?: string | null
          prompt_id: string
          run_date: string
          run_id: string
          status: string
          task_id?: string | null
        }
        Update: {
          analysis_version?: string | null
          analyzed_at?: string | null
          answer?: string | null
          brand_hints?: string[]
          check_url?: string | null
          client_id?: string
          country?: string
          country_fallback?: boolean
          created_at?: string
          error?: string | null
          fan_out?: string[]
          fetched_at?: string
          has_ads?: boolean
          id?: string
          model?: Database["public"]["Enums"]["aiv_model"]
          model_version?: string | null
          prompt_id?: string
          run_date?: string
          run_id?: string
          status?: string
          task_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "aiv_chats_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aiv_chats_prompt_id_fkey"
            columns: ["prompt_id"]
            isOneToOne: false
            referencedRelation: "aiv_prompts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aiv_chats_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "aiv_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aiv_chats_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: true
            referencedRelation: "aiv_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      aiv_domains: {
        Row: {
          by: string
          classified_at: string
          domain: string
          type: string
        }
        Insert: {
          by: string
          classified_at?: string
          domain: string
          type: string
        }
        Update: {
          by?: string
          classified_at?: string
          domain?: string
          type?: string
        }
        Relationships: []
      }
      aiv_locations: {
        Row: {
          country_iso: string
          family: string
          location_code: number
          synced_at: string
        }
        Insert: {
          country_iso: string
          family: string
          location_code: number
          synced_at?: string
        }
        Update: {
          country_iso?: string
          family?: string
          location_code?: number
          synced_at?: string
        }
        Relationships: []
      }
      aiv_mentions: {
        Row: {
          brand_id: string | null
          chat_id: string
          client_id: string
          id: number
          model: Database["public"]["Enums"]["aiv_model"]
          name: string
          name_key: string
          position: number
          quote: string | null
          run_date: string
          sentiment: number | null
        }
        Insert: {
          brand_id?: string | null
          chat_id: string
          client_id: string
          id?: never
          model: Database["public"]["Enums"]["aiv_model"]
          name: string
          name_key: string
          position: number
          quote?: string | null
          run_date: string
          sentiment?: number | null
        }
        Update: {
          brand_id?: string | null
          chat_id?: string
          client_id?: string
          id?: never
          model?: Database["public"]["Enums"]["aiv_model"]
          name?: string
          name_key?: string
          position?: number
          quote?: string | null
          run_date?: string
          sentiment?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "aiv_mentions_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "aiv_brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aiv_mentions_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "aiv_chats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aiv_mentions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      aiv_projects: {
        Row: {
          brand_identity: string[]
          brand_name: string
          client_id: string
          countries: string[]
          created_at: string
          description: string | null
          frequency: string
          industry: string | null
          language: string
          models: Database["public"]["Enums"]["aiv_model"][]
          next_run_at: string | null
          paused: boolean
          personas: string[]
          run_weekday: number
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          brand_identity?: string[]
          brand_name: string
          client_id: string
          countries?: string[]
          created_at?: string
          description?: string | null
          frequency?: string
          industry?: string | null
          language?: string
          models?: Database["public"]["Enums"]["aiv_model"][]
          next_run_at?: string | null
          paused?: boolean
          personas?: string[]
          run_weekday?: number
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          brand_identity?: string[]
          brand_name?: string
          client_id?: string
          countries?: string[]
          created_at?: string
          description?: string | null
          frequency?: string
          industry?: string | null
          language?: string
          models?: Database["public"]["Enums"]["aiv_model"][]
          next_run_at?: string | null
          paused?: boolean
          personas?: string[]
          run_weekday?: number
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "aiv_projects_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aiv_projects_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      aiv_prompts: {
        Row: {
          archived_at: string | null
          branded: boolean
          client_id: string
          country: string
          created_at: string
          created_by: string | null
          head_phrase: string | null
          id: string
          intent: Database["public"]["Enums"]["aiv_intent"] | null
          language: string
          persona: string | null
          source: string
          status: string
          tags: string[]
          text: string
          topic_id: string | null
          volume: number | null
          volume_at: string | null
          volume_raw: number | null
        }
        Insert: {
          archived_at?: string | null
          branded?: boolean
          client_id: string
          country: string
          created_at?: string
          created_by?: string | null
          head_phrase?: string | null
          id?: string
          intent?: Database["public"]["Enums"]["aiv_intent"] | null
          language?: string
          persona?: string | null
          source?: string
          status?: string
          tags?: string[]
          text: string
          topic_id?: string | null
          volume?: number | null
          volume_at?: string | null
          volume_raw?: number | null
        }
        Update: {
          archived_at?: string | null
          branded?: boolean
          client_id?: string
          country?: string
          created_at?: string
          created_by?: string | null
          head_phrase?: string | null
          id?: string
          intent?: Database["public"]["Enums"]["aiv_intent"] | null
          language?: string
          persona?: string | null
          source?: string
          status?: string
          tags?: string[]
          text?: string
          topic_id?: string | null
          volume?: number | null
          volume_at?: string | null
          volume_raw?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "aiv_prompts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aiv_prompts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aiv_prompts_topic_id_fkey"
            columns: ["topic_id"]
            isOneToOne: false
            referencedRelation: "aiv_topics"
            referencedColumns: ["id"]
          },
        ]
      }
      aiv_runs: {
        Row: {
          attempts: number
          client_id: string
          cost_usd: number
          counts: Json
          created_at: string
          created_by: string | null
          error: string | null
          estimate_usd: number
          finished_at: string | null
          heartbeat_at: string | null
          id: string
          params: Json
          released_at: string | null
          stage: number
          started_at: string | null
          status: Database["public"]["Enums"]["backlink_run_status"]
          trigger: string
        }
        Insert: {
          attempts?: number
          client_id: string
          cost_usd?: number
          counts?: Json
          created_at?: string
          created_by?: string | null
          error?: string | null
          estimate_usd?: number
          finished_at?: string | null
          heartbeat_at?: string | null
          id?: string
          params?: Json
          released_at?: string | null
          stage?: number
          started_at?: string | null
          status?: Database["public"]["Enums"]["backlink_run_status"]
          trigger: string
        }
        Update: {
          attempts?: number
          client_id?: string
          cost_usd?: number
          counts?: Json
          created_at?: string
          created_by?: string | null
          error?: string | null
          estimate_usd?: number
          finished_at?: string | null
          heartbeat_at?: string | null
          id?: string
          params?: Json
          released_at?: string | null
          stage?: number
          started_at?: string | null
          status?: Database["public"]["Enums"]["backlink_run_status"]
          trigger?: string
        }
        Relationships: [
          {
            foreignKeyName: "aiv_runs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aiv_runs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      aiv_sources: {
        Row: {
          chat_id: string
          cite_rank: number | null
          cited: boolean
          client_id: string
          domain: string
          id: number
          model: Database["public"]["Enums"]["aiv_model"]
          retrieved: boolean
          run_date: string
          title: string | null
          url: string
        }
        Insert: {
          chat_id: string
          cite_rank?: number | null
          cited?: boolean
          client_id: string
          domain: string
          id?: never
          model: Database["public"]["Enums"]["aiv_model"]
          retrieved?: boolean
          run_date: string
          title?: string | null
          url: string
        }
        Update: {
          chat_id?: string
          cite_rank?: number | null
          cited?: boolean
          client_id?: string
          domain?: string
          id?: never
          model?: Database["public"]["Enums"]["aiv_model"]
          retrieved?: boolean
          run_date?: string
          title?: string | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "aiv_sources_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "aiv_chats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aiv_sources_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      aiv_suggestions: {
        Row: {
          client_id: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          id: string
          key: string
          kind: string
          mentions: number
          payload: Json
          reason: string | null
          status: string
        }
        Insert: {
          client_id: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          key: string
          kind: string
          mentions?: number
          payload?: Json
          reason?: string | null
          status?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          id?: string
          key?: string
          kind?: string
          mentions?: number
          payload?: Json
          reason?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "aiv_suggestions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aiv_suggestions_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      aiv_tasks: {
        Row: {
          attempts: number
          client_id: string
          collected_at: string | null
          cost_usd: number
          country: string
          dfs_task_id: string | null
          error: string | null
          id: string
          key: string
          model: Database["public"]["Enums"]["aiv_model"]
          posted_at: string | null
          prompt_id: string
          run_id: string
          status: string
        }
        Insert: {
          attempts?: number
          client_id: string
          collected_at?: string | null
          cost_usd?: number
          country: string
          dfs_task_id?: string | null
          error?: string | null
          id?: string
          key: string
          model: Database["public"]["Enums"]["aiv_model"]
          posted_at?: string | null
          prompt_id: string
          run_id: string
          status?: string
        }
        Update: {
          attempts?: number
          client_id?: string
          collected_at?: string | null
          cost_usd?: number
          country?: string
          dfs_task_id?: string | null
          error?: string | null
          id?: string
          key?: string
          model?: Database["public"]["Enums"]["aiv_model"]
          posted_at?: string | null
          prompt_id?: string
          run_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "aiv_tasks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aiv_tasks_prompt_id_fkey"
            columns: ["prompt_id"]
            isOneToOne: false
            referencedRelation: "aiv_prompts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aiv_tasks_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "aiv_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      aiv_topics: {
        Row: {
          client_id: string
          created_at: string
          id: string
          name: string
          sort: number
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          name: string
          sort?: number
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          name?: string
          sort?: number
        }
        Relationships: [
          {
            foreignKeyName: "aiv_topics_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
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
      backlink_briefs: {
        Row: {
          adjacent_topics: string[]
          audience: string | null
          buyer: string[]
          client_id: string
          competitors: string[]
          core_topics: string[]
          created_at: string
          exclude_terms: string[]
          notes: string | null
          offering: string[]
          reach: string[]
          site_types: string[]
          trusted_sites: string[]
          updated_at: string
          updated_by: string | null
          version: number
        }
        Insert: {
          adjacent_topics?: string[]
          audience?: string | null
          buyer: string[]
          client_id: string
          competitors?: string[]
          core_topics: string[]
          created_at?: string
          exclude_terms?: string[]
          notes?: string | null
          offering: string[]
          reach: string[]
          site_types?: string[]
          trusted_sites?: string[]
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Update: {
          adjacent_topics?: string[]
          audience?: string | null
          buyer?: string[]
          client_id?: string
          competitors?: string[]
          core_topics?: string[]
          created_at?: string
          exclude_terms?: string[]
          notes?: string | null
          offering?: string[]
          reach?: string[]
          site_types?: string[]
          trusted_sites?: string[]
          updated_at?: string
          updated_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "backlink_briefs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "backlink_briefs_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      backlink_catalog: {
        Row: {
          active: boolean
          benefits: string[]
          buyer: string[]
          category: Database["public"]["Enums"]["catalog_category"]
          countries: string[]
          created_at: string
          created_by: string | null
          directory_id: string
          home_url: string | null
          how_to: string | null
          id: string
          industries: string[]
          kind: Database["public"]["Enums"]["catalog_kind"]
          name: string
          needs: string[]
          notes: string | null
          offering: string[]
          price_note: string | null
          pricing: Database["public"]["Enums"]["catalog_pricing"]
          priority: number
          problem_at: string | null
          problem_by: string | null
          problem_note: string | null
          reach: string[]
          sort: number
          submit_url: string | null
          suggested_by: string | null
          suggested_client_id: string | null
          suggestion_status: string | null
          typical_link: Database["public"]["Enums"]["link_kind"]
          updated_at: string
          updated_by: string | null
          verified_at: string | null
          verified_by: string | null
          warnings: string | null
        }
        Insert: {
          active?: boolean
          benefits?: string[]
          buyer?: string[]
          category: Database["public"]["Enums"]["catalog_category"]
          countries?: string[]
          created_at?: string
          created_by?: string | null
          directory_id: string
          home_url?: string | null
          how_to?: string | null
          id?: string
          industries?: string[]
          kind?: Database["public"]["Enums"]["catalog_kind"]
          name: string
          needs?: string[]
          notes?: string | null
          offering?: string[]
          price_note?: string | null
          pricing?: Database["public"]["Enums"]["catalog_pricing"]
          priority?: number
          problem_at?: string | null
          problem_by?: string | null
          problem_note?: string | null
          reach?: string[]
          sort?: number
          submit_url?: string | null
          suggested_by?: string | null
          suggested_client_id?: string | null
          suggestion_status?: string | null
          typical_link?: Database["public"]["Enums"]["link_kind"]
          updated_at?: string
          updated_by?: string | null
          verified_at?: string | null
          verified_by?: string | null
          warnings?: string | null
        }
        Update: {
          active?: boolean
          benefits?: string[]
          buyer?: string[]
          category?: Database["public"]["Enums"]["catalog_category"]
          countries?: string[]
          created_at?: string
          created_by?: string | null
          directory_id?: string
          home_url?: string | null
          how_to?: string | null
          id?: string
          industries?: string[]
          kind?: Database["public"]["Enums"]["catalog_kind"]
          name?: string
          needs?: string[]
          notes?: string | null
          offering?: string[]
          price_note?: string | null
          pricing?: Database["public"]["Enums"]["catalog_pricing"]
          priority?: number
          problem_at?: string | null
          problem_by?: string | null
          problem_note?: string | null
          reach?: string[]
          sort?: number
          submit_url?: string | null
          suggested_by?: string | null
          suggested_client_id?: string | null
          suggestion_status?: string | null
          typical_link?: Database["public"]["Enums"]["link_kind"]
          updated_at?: string
          updated_by?: string | null
          verified_at?: string | null
          verified_by?: string | null
          warnings?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "backlink_catalog_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "backlink_catalog_directory_id_fkey"
            columns: ["directory_id"]
            isOneToOne: true
            referencedRelation: "directories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "backlink_catalog_problem_by_fkey"
            columns: ["problem_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "backlink_catalog_suggested_by_fkey"
            columns: ["suggested_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "backlink_catalog_suggested_client_id_fkey"
            columns: ["suggested_client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "backlink_catalog_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "backlink_catalog_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      backlink_footprints: {
        Row: {
          active: boolean
          buyer: string[]
          id: string
          note: string | null
          offering: string[]
          priority: number
          reach: string[]
          scope: Database["public"]["Enums"]["footprint_scope"]
          site_type: string | null
          sort: number
          template: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          buyer?: string[]
          id?: string
          note?: string | null
          offering?: string[]
          priority?: number
          reach?: string[]
          scope: Database["public"]["Enums"]["footprint_scope"]
          site_type?: string | null
          sort?: number
          template: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          buyer?: string[]
          id?: string
          note?: string | null
          offering?: string[]
          priority?: number
          reach?: string[]
          scope?: Database["public"]["Enums"]["footprint_scope"]
          site_type?: string | null
          sort?: number
          template?: string
          updated_at?: string
        }
        Relationships: []
      }
      backlink_gap_cache: {
        Row: {
          client_domain: string | null
          client_id: string | null
          competitors: string[]
          cost_usd: number
          fetched_at: string
          id: string
          intersection: Json
          key: string
          pages: Json
          rows: number
        }
        Insert: {
          client_domain?: string | null
          client_id?: string | null
          competitors: string[]
          cost_usd?: number
          fetched_at?: string
          id?: string
          intersection?: Json
          key: string
          pages?: Json
          rows?: number
        }
        Update: {
          client_domain?: string | null
          client_id?: string | null
          competitors?: string[]
          cost_usd?: number
          fetched_at?: string
          id?: string
          intersection?: Json
          key?: string
          pages?: Json
          rows?: number
        }
        Relationships: [
          {
            foreignKeyName: "backlink_gap_cache_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      backlink_opportunities: {
        Row: {
          ai_fit: number | null
          ai_reason: string | null
          ai_verdict: string | null
          best_position: number | null
          client_id: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          directory_id: string
          filter_reason: string | null
          first_run_id: string | null
          found_snippet: string | null
          found_title: string | null
          found_url: string | null
          id: string
          is_core: boolean
          is_local: boolean
          last_run_id: string | null
          matched_topic: string | null
          notes: string | null
          reject_note: string | null
          reject_reason:
            | Database["public"]["Enums"]["backlink_reject_reason"]
            | null
          relevance: number
          rule_score: number | null
          shortlist_rank: number | null
          source: string
          status: Database["public"]["Enums"]["opportunity_status"]
          target_ids: string[]
          topic_fit: number | null
          updated_at: string
        }
        Insert: {
          ai_fit?: number | null
          ai_reason?: string | null
          ai_verdict?: string | null
          best_position?: number | null
          client_id: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          directory_id: string
          filter_reason?: string | null
          first_run_id?: string | null
          found_snippet?: string | null
          found_title?: string | null
          found_url?: string | null
          id?: string
          is_core?: boolean
          is_local?: boolean
          last_run_id?: string | null
          matched_topic?: string | null
          notes?: string | null
          reject_note?: string | null
          reject_reason?:
            | Database["public"]["Enums"]["backlink_reject_reason"]
            | null
          relevance?: number
          rule_score?: number | null
          shortlist_rank?: number | null
          source?: string
          status?: Database["public"]["Enums"]["opportunity_status"]
          target_ids?: string[]
          topic_fit?: number | null
          updated_at?: string
        }
        Update: {
          ai_fit?: number | null
          ai_reason?: string | null
          ai_verdict?: string | null
          best_position?: number | null
          client_id?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          directory_id?: string
          filter_reason?: string | null
          first_run_id?: string | null
          found_snippet?: string | null
          found_title?: string | null
          found_url?: string | null
          id?: string
          is_core?: boolean
          is_local?: boolean
          last_run_id?: string | null
          matched_topic?: string | null
          notes?: string | null
          reject_note?: string | null
          reject_reason?:
            | Database["public"]["Enums"]["backlink_reject_reason"]
            | null
          relevance?: number
          rule_score?: number | null
          shortlist_rank?: number | null
          source?: string
          status?: Database["public"]["Enums"]["opportunity_status"]
          target_ids?: string[]
          topic_fit?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "backlink_opportunities_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "backlink_opportunities_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "backlink_opportunities_directory_id_fkey"
            columns: ["directory_id"]
            isOneToOne: false
            referencedRelation: "directories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "backlink_opportunities_first_run_id_fkey"
            columns: ["first_run_id"]
            isOneToOne: false
            referencedRelation: "backlink_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "backlink_opportunities_last_run_id_fkey"
            columns: ["last_run_id"]
            isOneToOne: false
            referencedRelation: "backlink_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      backlink_opportunity_hits: {
        Row: {
          client_id: string
          created_at: string
          footprint_id: string | null
          id: number
          opportunity_id: string
          position: number | null
          query: string
          query_id: string
          url: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          footprint_id?: string | null
          id?: never
          opportunity_id: string
          position?: number | null
          query: string
          query_id: string
          url?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          footprint_id?: string | null
          id?: never
          opportunity_id?: string
          position?: number | null
          query?: string
          query_id?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "backlink_opportunity_hits_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "backlink_opportunity_hits_footprint_id_fkey"
            columns: ["footprint_id"]
            isOneToOne: false
            referencedRelation: "backlink_footprints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "backlink_opportunity_hits_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "backlink_opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "backlink_opportunity_hits_query_id_fkey"
            columns: ["query_id"]
            isOneToOne: false
            referencedRelation: "backlink_run_queries"
            referencedColumns: ["id"]
          },
        ]
      }
      backlink_run_queries: {
        Row: {
          cache_id: string | null
          client_id: string
          cost_usd: number
          done_at: string | null
          error: string | null
          footprint_id: string | null
          id: string
          items_count: number
          query: string
          query_norm: string
          run_id: string
          scope: Database["public"]["Enums"]["footprint_scope"]
          status: Database["public"]["Enums"]["discovery_query_status"]
          target_id: string | null
        }
        Insert: {
          cache_id?: string | null
          client_id: string
          cost_usd?: number
          done_at?: string | null
          error?: string | null
          footprint_id?: string | null
          id?: string
          items_count?: number
          query: string
          query_norm: string
          run_id: string
          scope: Database["public"]["Enums"]["footprint_scope"]
          status?: Database["public"]["Enums"]["discovery_query_status"]
          target_id?: string | null
        }
        Update: {
          cache_id?: string | null
          client_id?: string
          cost_usd?: number
          done_at?: string | null
          error?: string | null
          footprint_id?: string | null
          id?: string
          items_count?: number
          query?: string
          query_norm?: string
          run_id?: string
          scope?: Database["public"]["Enums"]["footprint_scope"]
          status?: Database["public"]["Enums"]["discovery_query_status"]
          target_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "backlink_run_queries_cache_id_fkey"
            columns: ["cache_id"]
            isOneToOne: false
            referencedRelation: "serp_result_cache"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "backlink_run_queries_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "backlink_run_queries_footprint_id_fkey"
            columns: ["footprint_id"]
            isOneToOne: false
            referencedRelation: "backlink_footprints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "backlink_run_queries_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "backlink_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "backlink_run_queries_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "backlink_targets"
            referencedColumns: ["id"]
          },
        ]
      }
      backlink_runs: {
        Row: {
          attempts: number
          brief_version: number | null
          client_id: string
          cost_usd: number
          counts: Json
          created_at: string
          created_by: string | null
          error: string | null
          finished_at: string | null
          heartbeat_at: string | null
          id: string
          kind: string
          params: Json
          queries_done: number
          queries_total: number
          started_at: string | null
          status: Database["public"]["Enums"]["backlink_run_status"]
          step: number
          target_ids: string[]
        }
        Insert: {
          attempts?: number
          brief_version?: number | null
          client_id: string
          cost_usd?: number
          counts?: Json
          created_at?: string
          created_by?: string | null
          error?: string | null
          finished_at?: string | null
          heartbeat_at?: string | null
          id?: string
          kind?: string
          params?: Json
          queries_done?: number
          queries_total?: number
          started_at?: string | null
          status?: Database["public"]["Enums"]["backlink_run_status"]
          step?: number
          target_ids?: string[]
        }
        Update: {
          attempts?: number
          brief_version?: number | null
          client_id?: string
          cost_usd?: number
          counts?: Json
          created_at?: string
          created_by?: string | null
          error?: string | null
          finished_at?: string | null
          heartbeat_at?: string | null
          id?: string
          kind?: string
          params?: Json
          queries_done?: number
          queries_total?: number
          started_at?: string | null
          status?: Database["public"]["Enums"]["backlink_run_status"]
          step?: number
          target_ids?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "backlink_runs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "backlink_runs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      backlink_strength_checks: {
        Row: {
          client_id: string
          cost_usd: number
          created_at: string
          created_by: string | null
          domains: number
          error: string | null
          finished_at: string | null
          forced: boolean
          id: string
          run_id: string | null
          status: Database["public"]["Enums"]["strength_check_status"]
          targets: string[]
        }
        Insert: {
          client_id: string
          cost_usd?: number
          created_at?: string
          created_by?: string | null
          domains?: number
          error?: string | null
          finished_at?: string | null
          forced?: boolean
          id?: string
          run_id?: string | null
          status?: Database["public"]["Enums"]["strength_check_status"]
          targets?: string[]
        }
        Update: {
          client_id?: string
          cost_usd?: number
          created_at?: string
          created_by?: string | null
          domains?: number
          error?: string | null
          finished_at?: string | null
          forced?: boolean
          id?: string
          run_id?: string | null
          status?: Database["public"]["Enums"]["strength_check_status"]
          targets?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "backlink_strength_checks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "backlink_strength_checks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "backlink_strength_checks_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "backlink_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      backlink_submission_events: {
        Row: {
          actor_id: string | null
          at: string
          change: Json
          client_id: string
          from_status: Database["public"]["Enums"]["submission_status"] | null
          id: number
          note: string | null
          submission_id: string
          to_status: Database["public"]["Enums"]["submission_status"] | null
        }
        Insert: {
          actor_id?: string | null
          at?: string
          change?: Json
          client_id: string
          from_status?: Database["public"]["Enums"]["submission_status"] | null
          id?: never
          note?: string | null
          submission_id: string
          to_status?: Database["public"]["Enums"]["submission_status"] | null
        }
        Update: {
          actor_id?: string | null
          at?: string
          change?: Json
          client_id?: string
          from_status?: Database["public"]["Enums"]["submission_status"] | null
          id?: never
          note?: string | null
          submission_id?: string
          to_status?: Database["public"]["Enums"]["submission_status"] | null
        }
        Relationships: [
          {
            foreignKeyName: "backlink_submission_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "backlink_submission_events_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "backlink_submission_events_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "backlink_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      backlink_submissions: {
        Row: {
          assigned_to: string | null
          block_note: string | null
          block_reason: Database["public"]["Enums"]["submission_block"] | null
          catalog_id: string | null
          client_id: string
          cost_note: string | null
          cost_usd: number | null
          created_at: string
          created_by: string | null
          directory_id: string
          follow_up_on: string | null
          id: string
          link_kind: Database["public"]["Enums"]["link_kind"] | null
          listing_url: string | null
          live_on: string | null
          login_id: string | null
          notes: string | null
          opportunity_id: string
          status: Database["public"]["Enums"]["submission_status"]
          submitted_on: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          assigned_to?: string | null
          block_note?: string | null
          block_reason?: Database["public"]["Enums"]["submission_block"] | null
          catalog_id?: string | null
          client_id: string
          cost_note?: string | null
          cost_usd?: number | null
          created_at?: string
          created_by?: string | null
          directory_id: string
          follow_up_on?: string | null
          id?: string
          link_kind?: Database["public"]["Enums"]["link_kind"] | null
          listing_url?: string | null
          live_on?: string | null
          login_id?: string | null
          notes?: string | null
          opportunity_id: string
          status?: Database["public"]["Enums"]["submission_status"]
          submitted_on?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          assigned_to?: string | null
          block_note?: string | null
          block_reason?: Database["public"]["Enums"]["submission_block"] | null
          catalog_id?: string | null
          client_id?: string
          cost_note?: string | null
          cost_usd?: number | null
          created_at?: string
          created_by?: string | null
          directory_id?: string
          follow_up_on?: string | null
          id?: string
          link_kind?: Database["public"]["Enums"]["link_kind"] | null
          listing_url?: string | null
          live_on?: string | null
          login_id?: string | null
          notes?: string | null
          opportunity_id?: string
          status?: Database["public"]["Enums"]["submission_status"]
          submitted_on?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "backlink_submissions_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "backlink_submissions_catalog_id_fkey"
            columns: ["catalog_id"]
            isOneToOne: false
            referencedRelation: "backlink_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "backlink_submissions_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "backlink_submissions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "backlink_submissions_directory_id_fkey"
            columns: ["directory_id"]
            isOneToOne: false
            referencedRelation: "directories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "backlink_submissions_login_id_fkey"
            columns: ["login_id"]
            isOneToOne: false
            referencedRelation: "client_logins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "backlink_submissions_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: true
            referencedRelation: "backlink_opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "backlink_submissions_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      backlink_targets: {
        Row: {
          active: boolean
          city: string | null
          client_id: string
          country_iso: string
          created_at: string
          created_by: string | null
          id: string
          kind: string
          label: string
          location_code: number
          location_name: string
          region_code: string | null
          region_name: string | null
          search_name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          city?: string | null
          client_id: string
          country_iso: string
          created_at?: string
          created_by?: string | null
          id?: string
          kind: string
          label: string
          location_code: number
          location_name: string
          region_code?: string | null
          region_name?: string | null
          search_name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          city?: string | null
          client_id?: string
          country_iso?: string
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          label?: string
          location_code?: number
          location_name?: string
          region_code?: string | null
          region_name?: string | null
          search_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "backlink_targets_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "backlink_targets_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_members"
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
      client_competitors: {
        Row: {
          active: boolean
          added_by: string | null
          client_id: string
          created_at: string
          domain: string
          evidence: Json
          id: string
          name: string | null
          source: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          added_by?: string | null
          client_id: string
          created_at?: string
          domain: string
          evidence?: Json
          id?: string
          name?: string | null
          source?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          added_by?: string | null
          client_id?: string
          created_at?: string
          domain?: string
          evidence?: Json
          id?: string
          name?: string | null
          source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_competitors_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_competitors_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
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
      client_month_plans: {
        Row: {
          client_id: string
          created_at: string
          kind: Database["public"]["Enums"]["deliverable_kind"]
          month: string
          prorated: boolean
          target: number
        }
        Insert: {
          client_id: string
          created_at?: string
          kind: Database["public"]["Enums"]["deliverable_kind"]
          month: string
          prorated?: boolean
          target: number
        }
        Update: {
          client_id?: string
          created_at?: string
          kind?: Database["public"]["Enums"]["deliverable_kind"]
          month?: string
          prorated?: boolean
          target?: number
        }
        Relationships: [
          {
            foreignKeyName: "client_month_plans_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
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
          ai_fixes_target: number
          articles_target: number
          backlinks_target: number
          city: string | null
          country_code: string
          created_at: string
          created_by: string | null
          gbp_posts_target: number
          health: Database["public"]["Enums"]["client_health"]
          health_changed_at: string | null
          health_reason: string | null
          id: string
          industry: string | null
          keywords_target: number
          name: string
          owner_id: string | null
          package: Database["public"]["Enums"]["package_kind"]
          region: string | null
          review_requests_target: number
          slug: string
          stage: Database["public"]["Enums"]["client_stage"]
          started_on: string
          updated_at: string
          website: string | null
        }
        Insert: {
          ai_fixes_target?: number
          articles_target?: number
          backlinks_target?: number
          city?: string | null
          country_code?: string
          created_at?: string
          created_by?: string | null
          gbp_posts_target?: number
          health?: Database["public"]["Enums"]["client_health"]
          health_changed_at?: string | null
          health_reason?: string | null
          id?: string
          industry?: string | null
          keywords_target?: number
          name: string
          owner_id?: string | null
          package?: Database["public"]["Enums"]["package_kind"]
          region?: string | null
          review_requests_target?: number
          slug: string
          stage?: Database["public"]["Enums"]["client_stage"]
          started_on?: string
          updated_at?: string
          website?: string | null
        }
        Update: {
          ai_fixes_target?: number
          articles_target?: number
          backlinks_target?: number
          city?: string | null
          country_code?: string
          created_at?: string
          created_by?: string | null
          gbp_posts_target?: number
          health?: Database["public"]["Enums"]["client_health"]
          health_changed_at?: string | null
          health_reason?: string | null
          id?: string
          industry?: string | null
          keywords_target?: number
          name?: string
          owner_id?: string | null
          package?: Database["public"]["Enums"]["package_kind"]
          region?: string | null
          review_requests_target?: number
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
      content_articles: {
        Row: {
          author: string | null
          author_name: string | null
          body_html: string
          client_id: string
          created_at: string
          created_by: string | null
          excerpt: string | null
          featured_media_id: string | null
          focus_keyword: string | null
          git_blob_sha: string | null
          git_commit_sha: string | null
          git_committed_at: string | null
          git_connection_id: string | null
          git_deploy_checked_at: string | null
          git_deploy_error: string | null
          git_deploy_state: Database["public"]["Enums"]["git_deploy_state"]
          git_deploy_url: string | null
          git_media: string[]
          git_path: string | null
          id: string
          keyword_id: string | null
          last_error: string | null
          last_synced_at: string | null
          live_url: string | null
          meta_description: string | null
          publish_at: string | null
          published_at: string | null
          sending_at: string | null
          sent_version: number | null
          seo_pasted_at: string | null
          seo_title: string | null
          site_kind: Database["public"]["Enums"]["content_site_kind"]
          slug: string | null
          status: Database["public"]["Enums"]["content_status"]
          tags: string[]
          title: string
          topic: string | null
          updated_at: string
          updated_by: string | null
          version: number
          word_count: number
          wp_account_id: string | null
          wp_article_id: string | null
          wp_blog_id: string | null
          wp_status: string | null
          wp_url: string | null
        }
        Insert: {
          author?: string | null
          author_name?: string | null
          body_html?: string
          client_id: string
          created_at?: string
          created_by?: string | null
          excerpt?: string | null
          featured_media_id?: string | null
          focus_keyword?: string | null
          git_blob_sha?: string | null
          git_commit_sha?: string | null
          git_committed_at?: string | null
          git_connection_id?: string | null
          git_deploy_checked_at?: string | null
          git_deploy_error?: string | null
          git_deploy_state?: Database["public"]["Enums"]["git_deploy_state"]
          git_deploy_url?: string | null
          git_media?: string[]
          git_path?: string | null
          id?: string
          keyword_id?: string | null
          last_error?: string | null
          last_synced_at?: string | null
          live_url?: string | null
          meta_description?: string | null
          publish_at?: string | null
          published_at?: string | null
          sending_at?: string | null
          sent_version?: number | null
          seo_pasted_at?: string | null
          seo_title?: string | null
          site_kind?: Database["public"]["Enums"]["content_site_kind"]
          slug?: string | null
          status?: Database["public"]["Enums"]["content_status"]
          tags?: string[]
          title?: string
          topic?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
          word_count?: number
          wp_account_id?: string | null
          wp_article_id?: string | null
          wp_blog_id?: string | null
          wp_status?: string | null
          wp_url?: string | null
        }
        Update: {
          author?: string | null
          author_name?: string | null
          body_html?: string
          client_id?: string
          created_at?: string
          created_by?: string | null
          excerpt?: string | null
          featured_media_id?: string | null
          focus_keyword?: string | null
          git_blob_sha?: string | null
          git_commit_sha?: string | null
          git_committed_at?: string | null
          git_connection_id?: string | null
          git_deploy_checked_at?: string | null
          git_deploy_error?: string | null
          git_deploy_state?: Database["public"]["Enums"]["git_deploy_state"]
          git_deploy_url?: string | null
          git_media?: string[]
          git_path?: string | null
          id?: string
          keyword_id?: string | null
          last_error?: string | null
          last_synced_at?: string | null
          live_url?: string | null
          meta_description?: string | null
          publish_at?: string | null
          published_at?: string | null
          sending_at?: string | null
          sent_version?: number | null
          seo_pasted_at?: string | null
          seo_title?: string | null
          site_kind?: Database["public"]["Enums"]["content_site_kind"]
          slug?: string | null
          status?: Database["public"]["Enums"]["content_status"]
          tags?: string[]
          title?: string
          topic?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
          word_count?: number
          wp_account_id?: string | null
          wp_article_id?: string | null
          wp_blog_id?: string | null
          wp_status?: string | null
          wp_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_articles_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_articles_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_articles_featured_media_id_fkey"
            columns: ["featured_media_id"]
            isOneToOne: false
            referencedRelation: "content_media"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_articles_git_connection_id_fkey"
            columns: ["git_connection_id"]
            isOneToOne: false
            referencedRelation: "git_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_articles_keyword_id_fkey"
            columns: ["keyword_id"]
            isOneToOne: false
            referencedRelation: "keywords"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_articles_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_articles_wp_account_id_fkey"
            columns: ["wp_account_id"]
            isOneToOne: false
            referencedRelation: "social_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      content_events: {
        Row: {
          actor_id: string | null
          article_id: string | null
          at: string
          client_id: string
          detail: Json
          id: number
          kind: string
          post_id: string | null
        }
        Insert: {
          actor_id?: string | null
          article_id?: string | null
          at?: string
          client_id: string
          detail?: Json
          id?: never
          kind: string
          post_id?: string | null
        }
        Update: {
          actor_id?: string | null
          article_id?: string | null
          at?: string
          client_id?: string
          detail?: Json
          id?: never
          kind?: string
          post_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_events_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "content_articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_events_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_events_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "content_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      content_media: {
        Row: {
          alt_text: string | null
          bytes: number
          client_id: string
          created_at: string
          created_by: string | null
          duration_s: number | null
          file_name: string
          height: number | null
          id: string
          kind: Database["public"]["Enums"]["content_media_kind"]
          mime: string
          storage_path: string
          thumb_path: string | null
          title: string | null
          width: number | null
          zernio_uploaded_at: string | null
          zernio_url: string | null
        }
        Insert: {
          alt_text?: string | null
          bytes: number
          client_id: string
          created_at?: string
          created_by?: string | null
          duration_s?: number | null
          file_name: string
          height?: number | null
          id?: string
          kind: Database["public"]["Enums"]["content_media_kind"]
          mime: string
          storage_path: string
          thumb_path?: string | null
          title?: string | null
          width?: number | null
          zernio_uploaded_at?: string | null
          zernio_url?: string | null
        }
        Update: {
          alt_text?: string | null
          bytes?: number
          client_id?: string
          created_at?: string
          created_by?: string | null
          duration_s?: number | null
          file_name?: string
          height?: number | null
          id?: string
          kind?: Database["public"]["Enums"]["content_media_kind"]
          mime?: string
          storage_path?: string
          thumb_path?: string | null
          title?: string | null
          width?: number | null
          zernio_uploaded_at?: string | null
          zernio_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_media_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_media_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      content_post_targets: {
        Row: {
          account_name: string | null
          client_id: string
          custom_content: string | null
          custom_media_ids: string[] | null
          error_category: string | null
          error_message: string | null
          error_source: string | null
          id: string
          platform: Database["public"]["Enums"]["social_platform"]
          platform_post_id: string | null
          platform_post_url: string | null
          post_id: string
          published_at: string | null
          settings: Json
          social_account_id: string | null
          status: Database["public"]["Enums"]["content_target_status"]
          updated_at: string
          zernio_account_id: string
        }
        Insert: {
          account_name?: string | null
          client_id: string
          custom_content?: string | null
          custom_media_ids?: string[] | null
          error_category?: string | null
          error_message?: string | null
          error_source?: string | null
          id?: string
          platform: Database["public"]["Enums"]["social_platform"]
          platform_post_id?: string | null
          platform_post_url?: string | null
          post_id: string
          published_at?: string | null
          settings?: Json
          social_account_id?: string | null
          status?: Database["public"]["Enums"]["content_target_status"]
          updated_at?: string
          zernio_account_id: string
        }
        Update: {
          account_name?: string | null
          client_id?: string
          custom_content?: string | null
          custom_media_ids?: string[] | null
          error_category?: string | null
          error_message?: string | null
          error_source?: string | null
          id?: string
          platform?: Database["public"]["Enums"]["social_platform"]
          platform_post_id?: string | null
          platform_post_url?: string | null
          post_id?: string
          published_at?: string | null
          settings?: Json
          social_account_id?: string | null
          status?: Database["public"]["Enums"]["content_target_status"]
          updated_at?: string
          zernio_account_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_post_targets_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_post_targets_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "content_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_post_targets_social_account_id_fkey"
            columns: ["social_account_id"]
            isOneToOne: false
            referencedRelation: "social_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      content_posts: {
        Row: {
          client_id: string
          content: string
          created_at: string
          created_by: string | null
          id: string
          last_error: string | null
          last_event_at: string | null
          last_synced_at: string | null
          media_ids: string[]
          published_at: string | null
          scheduled_for: string | null
          sending_at: string | null
          sent_version: number | null
          status: Database["public"]["Enums"]["content_status"]
          timezone: string | null
          title: string | null
          updated_at: string
          updated_by: string | null
          version: number
          zernio_post_id: string | null
        }
        Insert: {
          client_id: string
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          last_error?: string | null
          last_event_at?: string | null
          last_synced_at?: string | null
          media_ids?: string[]
          published_at?: string | null
          scheduled_for?: string | null
          sending_at?: string | null
          sent_version?: number | null
          status?: Database["public"]["Enums"]["content_status"]
          timezone?: string | null
          title?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
          zernio_post_id?: string | null
        }
        Update: {
          client_id?: string
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          last_error?: string | null
          last_event_at?: string | null
          last_synced_at?: string | null
          media_ids?: string[]
          published_at?: string | null
          scheduled_for?: string | null
          sending_at?: string | null
          sent_version?: number | null
          status?: Database["public"]["Enums"]["content_status"]
          timezone?: string | null
          title?: string | null
          updated_at?: string
          updated_by?: string | null
          version?: number
          zernio_post_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_posts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_posts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_posts_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      content_settings: {
        Row: {
          client_id: string
          default_cta_url: string | null
          git_connection_id: string | null
          git_default_author: string | null
          git_default_tags: string[]
          signature: string | null
          site_kind: Database["public"]["Enums"]["content_site_kind"]
          timezone: string
          updated_at: string
          updated_by: string | null
          wp_account_id: string | null
          wp_blog_id: string | null
          wp_blog_name: string | null
          wp_default_author: string | null
          wp_default_tags: string[]
          wp_site_url: string | null
        }
        Insert: {
          client_id: string
          default_cta_url?: string | null
          git_connection_id?: string | null
          git_default_author?: string | null
          git_default_tags?: string[]
          signature?: string | null
          site_kind?: Database["public"]["Enums"]["content_site_kind"]
          timezone?: string
          updated_at?: string
          updated_by?: string | null
          wp_account_id?: string | null
          wp_blog_id?: string | null
          wp_blog_name?: string | null
          wp_default_author?: string | null
          wp_default_tags?: string[]
          wp_site_url?: string | null
        }
        Update: {
          client_id?: string
          default_cta_url?: string | null
          git_connection_id?: string | null
          git_default_author?: string | null
          git_default_tags?: string[]
          signature?: string | null
          site_kind?: Database["public"]["Enums"]["content_site_kind"]
          timezone?: string
          updated_at?: string
          updated_by?: string | null
          wp_account_id?: string | null
          wp_blog_id?: string | null
          wp_blog_name?: string | null
          wp_default_author?: string | null
          wp_default_tags?: string[]
          wp_site_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_settings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_settings_git_connection_id_fkey"
            columns: ["git_connection_id"]
            isOneToOne: false
            referencedRelation: "git_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_settings_wp_account_id_fkey"
            columns: ["wp_account_id"]
            isOneToOne: false
            referencedRelation: "social_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      dfs_calls: {
        Row: {
          api: Database["public"]["Enums"]["dfs_api"]
          client_id: string | null
          cost_usd: number
          created_at: string
          endpoint: string
          error: string | null
          http_status: number | null
          id: number
          items: number
          ms: number | null
          ref: string | null
          status_code: number | null
          tasks: number
        }
        Insert: {
          api: Database["public"]["Enums"]["dfs_api"]
          client_id?: string | null
          cost_usd?: number
          created_at?: string
          endpoint: string
          error?: string | null
          http_status?: number | null
          id?: never
          items?: number
          ms?: number | null
          ref?: string | null
          status_code?: number | null
          tasks?: number
        }
        Update: {
          api?: Database["public"]["Enums"]["dfs_api"]
          client_id?: string | null
          cost_usd?: number
          created_at?: string
          endpoint?: string
          error?: string | null
          http_status?: number | null
          id?: never
          items?: number
          ms?: number | null
          ref?: string | null
          status_code?: number | null
          tasks?: number
        }
        Relationships: [
          {
            foreignKeyName: "dfs_calls_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      dfs_locations: {
        Row: {
          code: number
          country_iso: string | null
          name: string
          parent_code: number | null
          source: string
          synced_at: string
          type: string | null
        }
        Insert: {
          code: number
          country_iso?: string | null
          name: string
          parent_code?: number | null
          source: string
          synced_at?: string
          type?: string | null
        }
        Update: {
          code?: number
          country_iso?: string | null
          name?: string
          parent_code?: number | null
          source?: string
          synced_at?: string
          type?: string | null
        }
        Relationships: []
      }
      dfs_settings: {
        Row: {
          ai_gap_max_sites: number
          ai_gap_min_shared: number
          ai_gap_runs_per_client_month: number
          ai_monthly_budget_usd: number
          ai_search_max_run_usd: number
          ai_search_max_web_searches: number
          ai_search_monthly_budget_usd: number
          ai_search_runs_per_client_month: number
          aiv_access: string
          aiv_access_checked_at: string | null
          aiv_answer_retention_days: number
          aiv_claude_model: string | null
          aiv_last_cleanup_at: string | null
          aiv_manual_runs_per_client_month: number
          aiv_max_run_usd: number
          aiv_monthly_budget_usd: number
          aiv_perplexity_model: string | null
          aiv_prompts_per_client: number
          anthropic_credit_at: string | null
          anthropic_credit_usd: number | null
          backlink_runs_per_client_month: number
          backlinks_access: string
          backlinks_access_checked_at: string | null
          backlinks_budget_usd: number
          id: boolean
          last_balance_at: string | null
          last_balance_usd: number | null
          last_locations_sync_at: string | null
          low_balance_usd: number
          monthly_budget_usd: number
          rank_scans_per_client_month: number
          research_runs_per_client_month: number
          updated_at: string
          updated_by: string | null
          web_search_price_usd: number
        }
        Insert: {
          ai_gap_max_sites?: number
          ai_gap_min_shared?: number
          ai_gap_runs_per_client_month?: number
          ai_monthly_budget_usd?: number
          ai_search_max_run_usd?: number
          ai_search_max_web_searches?: number
          ai_search_monthly_budget_usd?: number
          ai_search_runs_per_client_month?: number
          aiv_access?: string
          aiv_access_checked_at?: string | null
          aiv_answer_retention_days?: number
          aiv_claude_model?: string | null
          aiv_last_cleanup_at?: string | null
          aiv_manual_runs_per_client_month?: number
          aiv_max_run_usd?: number
          aiv_monthly_budget_usd?: number
          aiv_perplexity_model?: string | null
          aiv_prompts_per_client?: number
          anthropic_credit_at?: string | null
          anthropic_credit_usd?: number | null
          backlink_runs_per_client_month?: number
          backlinks_access?: string
          backlinks_access_checked_at?: string | null
          backlinks_budget_usd?: number
          id?: boolean
          last_balance_at?: string | null
          last_balance_usd?: number | null
          last_locations_sync_at?: string | null
          low_balance_usd?: number
          monthly_budget_usd?: number
          rank_scans_per_client_month?: number
          research_runs_per_client_month?: number
          updated_at?: string
          updated_by?: string | null
          web_search_price_usd?: number
        }
        Update: {
          ai_gap_max_sites?: number
          ai_gap_min_shared?: number
          ai_gap_runs_per_client_month?: number
          ai_monthly_budget_usd?: number
          ai_search_max_run_usd?: number
          ai_search_max_web_searches?: number
          ai_search_monthly_budget_usd?: number
          ai_search_runs_per_client_month?: number
          aiv_access?: string
          aiv_access_checked_at?: string | null
          aiv_answer_retention_days?: number
          aiv_claude_model?: string | null
          aiv_last_cleanup_at?: string | null
          aiv_manual_runs_per_client_month?: number
          aiv_max_run_usd?: number
          aiv_monthly_budget_usd?: number
          aiv_perplexity_model?: string | null
          aiv_prompts_per_client?: number
          anthropic_credit_at?: string | null
          anthropic_credit_usd?: number | null
          backlink_runs_per_client_month?: number
          backlinks_access?: string
          backlinks_access_checked_at?: string | null
          backlinks_budget_usd?: number
          id?: boolean
          last_balance_at?: string | null
          last_balance_usd?: number | null
          last_locations_sync_at?: string | null
          low_balance_usd?: number
          monthly_budget_usd?: number
          rank_scans_per_client_month?: number
          research_runs_per_client_month?: number
          updated_at?: string
          updated_by?: string | null
          web_search_price_usd?: number
        }
        Relationships: [
          {
            foreignKeyName: "dfs_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      directories: {
        Row: {
          authority: number | null
          authority_checked_at: string | null
          authority_raw: number | null
          authority_source: string | null
          authority_status: string | null
          blocked_at: string | null
          blocked_by: string | null
          blocked_reason: string | null
          city: string | null
          core_buyer: string[]
          core_countries: string[]
          core_industries: string[]
          core_offering: string[]
          core_reach: string[]
          cost_type: string
          country_code: string | null
          domain: string
          first_seen_at: string
          geo_scope: string
          id: string
          industries: string[]
          is_core: boolean
          last_seen_at: string
          name: string
          notes: string | null
          rank_target: string
          region: string | null
          site_key: string
          spam_score: number | null
          status: Database["public"]["Enums"]["directory_status"]
          submit_url: string | null
          type: Database["public"]["Enums"]["directory_type"]
          type_source: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          authority?: number | null
          authority_checked_at?: string | null
          authority_raw?: number | null
          authority_source?: string | null
          authority_status?: string | null
          blocked_at?: string | null
          blocked_by?: string | null
          blocked_reason?: string | null
          city?: string | null
          core_buyer?: string[]
          core_countries?: string[]
          core_industries?: string[]
          core_offering?: string[]
          core_reach?: string[]
          cost_type?: string
          country_code?: string | null
          domain: string
          first_seen_at?: string
          geo_scope?: string
          id?: string
          industries?: string[]
          is_core?: boolean
          last_seen_at?: string
          name: string
          notes?: string | null
          rank_target: string
          region?: string | null
          site_key: string
          spam_score?: number | null
          status?: Database["public"]["Enums"]["directory_status"]
          submit_url?: string | null
          type?: Database["public"]["Enums"]["directory_type"]
          type_source?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          authority?: number | null
          authority_checked_at?: string | null
          authority_raw?: number | null
          authority_source?: string | null
          authority_status?: string | null
          blocked_at?: string | null
          blocked_by?: string | null
          blocked_reason?: string | null
          city?: string | null
          core_buyer?: string[]
          core_countries?: string[]
          core_industries?: string[]
          core_offering?: string[]
          core_reach?: string[]
          cost_type?: string
          country_code?: string | null
          domain?: string
          first_seen_at?: string
          geo_scope?: string
          id?: string
          industries?: string[]
          is_core?: boolean
          last_seen_at?: string
          name?: string
          notes?: string | null
          rank_target?: string
          region?: string | null
          site_key?: string
          spam_score?: number | null
          status?: Database["public"]["Enums"]["directory_status"]
          submit_url?: string | null
          type?: Database["public"]["Enums"]["directory_type"]
          type_source?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "directories_blocked_by_fkey"
            columns: ["blocked_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "directories_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      git_connect_attempts: {
        Row: {
          client_id: string
          connection_id: string | null
          created_at: string
          created_by: string | null
          expires_at: string
          id: string
          installation_id: number | null
          key_hash: string
          onboarding_link_id: string | null
          origin: string
          used_at: string | null
        }
        Insert: {
          client_id: string
          connection_id?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          installation_id?: number | null
          key_hash: string
          onboarding_link_id?: string | null
          origin: string
          used_at?: string | null
        }
        Update: {
          client_id?: string
          connection_id?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          installation_id?: number | null
          key_hash?: string
          onboarding_link_id?: string | null
          origin?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "git_connect_attempts_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "git_connect_attempts_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "git_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "git_connect_attempts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "git_connect_attempts_onboarding_link_id_fkey"
            columns: ["onboarding_link_id"]
            isOneToOne: false
            referencedRelation: "onboarding_links"
            referencedColumns: ["id"]
          },
        ]
      }
      git_connection_secrets: {
        Row: {
          connection_id: string
          deploy_hook_secret_id: string | null
          token_secret_id: string | null
          updated_at: string
        }
        Insert: {
          connection_id: string
          deploy_hook_secret_id?: string | null
          token_secret_id?: string | null
          updated_at?: string
        }
        Update: {
          connection_id?: string
          deploy_hook_secret_id?: string | null
          token_secret_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "git_connection_secrets_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: true
            referencedRelation: "git_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      git_connections: {
        Row: {
          auth_method: Database["public"]["Enums"]["git_auth_method"]
          branch: string
          client_id: string
          collection: string | null
          commit_email: string | null
          commit_name: string | null
          config_path: string | null
          created_at: string
          created_by: string | null
          date_format: string | null
          detected: Json
          extension: string
          field_map: Json
          folder: string | null
          format: string
          id: string
          installation_id: number | null
          last_checked_at: string | null
          last_error: string | null
          media_folder: string | null
          owner: string
          public_folder: string | null
          repo: string
          repo_id: number | null
          site_url: string | null
          slug_template: string
          status: Database["public"]["Enums"]["git_connection_status"]
          token_expires_at: string | null
          updated_at: string
          url_pattern: string | null
        }
        Insert: {
          auth_method: Database["public"]["Enums"]["git_auth_method"]
          branch?: string
          client_id: string
          collection?: string | null
          commit_email?: string | null
          commit_name?: string | null
          config_path?: string | null
          created_at?: string
          created_by?: string | null
          date_format?: string | null
          detected?: Json
          extension?: string
          field_map?: Json
          folder?: string | null
          format?: string
          id?: string
          installation_id?: number | null
          last_checked_at?: string | null
          last_error?: string | null
          media_folder?: string | null
          owner: string
          public_folder?: string | null
          repo: string
          repo_id?: number | null
          site_url?: string | null
          slug_template?: string
          status?: Database["public"]["Enums"]["git_connection_status"]
          token_expires_at?: string | null
          updated_at?: string
          url_pattern?: string | null
        }
        Update: {
          auth_method?: Database["public"]["Enums"]["git_auth_method"]
          branch?: string
          client_id?: string
          collection?: string | null
          commit_email?: string | null
          commit_name?: string | null
          config_path?: string | null
          created_at?: string
          created_by?: string | null
          date_format?: string | null
          detected?: Json
          extension?: string
          field_map?: Json
          folder?: string | null
          format?: string
          id?: string
          installation_id?: number | null
          last_checked_at?: string | null
          last_error?: string | null
          media_folder?: string | null
          owner?: string
          public_folder?: string | null
          repo?: string
          repo_id?: number | null
          site_url?: string | null
          slug_template?: string
          status?: Database["public"]["Enums"]["git_connection_status"]
          token_expires_at?: string | null
          updated_at?: string
          url_pattern?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "git_connections_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "git_connections_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      keyword_candidates: {
        Row: {
          client_id: string
          competition: number | null
          competitor_domains: string[]
          core_keyword: string | null
          cpc: number | null
          decided_at: string | null
          decided_by: string | null
          difficulty: number | null
          dismiss_reason: string | null
          first_seen_run: string | null
          intent: string | null
          keyword_norm: string
          last_seen_run: string | null
          local_volume: number | null
          national_volume: number | null
          phrase: string
          ranked_position: number | null
          ranked_url: string | null
          score: number
          score_parts: Json
          sources: string[]
          status: Database["public"]["Enums"]["candidate_status"]
          topic: string | null
          trend_yearly: number | null
          updated_at: string
        }
        Insert: {
          client_id: string
          competition?: number | null
          competitor_domains?: string[]
          core_keyword?: string | null
          cpc?: number | null
          decided_at?: string | null
          decided_by?: string | null
          difficulty?: number | null
          dismiss_reason?: string | null
          first_seen_run?: string | null
          intent?: string | null
          keyword_norm: string
          last_seen_run?: string | null
          local_volume?: number | null
          national_volume?: number | null
          phrase: string
          ranked_position?: number | null
          ranked_url?: string | null
          score?: number
          score_parts?: Json
          sources?: string[]
          status?: Database["public"]["Enums"]["candidate_status"]
          topic?: string | null
          trend_yearly?: number | null
          updated_at?: string
        }
        Update: {
          client_id?: string
          competition?: number | null
          competitor_domains?: string[]
          core_keyword?: string | null
          cpc?: number | null
          decided_at?: string | null
          decided_by?: string | null
          difficulty?: number | null
          dismiss_reason?: string | null
          first_seen_run?: string | null
          intent?: string | null
          keyword_norm?: string
          last_seen_run?: string | null
          local_volume?: number | null
          national_volume?: number | null
          phrase?: string
          ranked_position?: number | null
          ranked_url?: string | null
          score?: number
          score_parts?: Json
          sources?: string[]
          status?: Database["public"]["Enums"]["candidate_status"]
          topic?: string | null
          trend_yearly?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "keyword_candidates_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "keyword_candidates_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "keyword_candidates_first_seen_run_fkey"
            columns: ["first_seen_run"]
            isOneToOne: false
            referencedRelation: "keyword_research_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "keyword_candidates_last_seen_run_fkey"
            columns: ["last_seen_run"]
            isOneToOne: false
            referencedRelation: "keyword_research_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      keyword_metrics: {
        Row: {
          competition: number | null
          competition_level: string | null
          core_keyword: string | null
          cpc: number | null
          fetched_at: string
          keyword_difficulty: number | null
          keyword_norm: string
          language_code: string
          location_code: number
          main_intent: string | null
          monthly_searches: Json | null
          search_volume: number | null
          source: string
          trend_yearly: number | null
        }
        Insert: {
          competition?: number | null
          competition_level?: string | null
          core_keyword?: string | null
          cpc?: number | null
          fetched_at?: string
          keyword_difficulty?: number | null
          keyword_norm: string
          language_code: string
          location_code: number
          main_intent?: string | null
          monthly_searches?: Json | null
          search_volume?: number | null
          source: string
          trend_yearly?: number | null
        }
        Update: {
          competition?: number | null
          competition_level?: string | null
          core_keyword?: string | null
          cpc?: number | null
          fetched_at?: string
          keyword_difficulty?: number | null
          keyword_norm?: string
          language_code?: string
          location_code?: number
          main_intent?: string | null
          monthly_searches?: Json | null
          search_volume?: number | null
          source?: string
          trend_yearly?: number | null
        }
        Relationships: []
      }
      keyword_ranks: {
        Row: {
          check_id: string
          check_url: string | null
          client_id: string
          engine: Database["public"]["Enums"]["rank_engine"]
          in_ai_overview: boolean
          keyword_id: string
          local_pack_position: number | null
          maps_rating: number | null
          maps_reviews: number | null
          matched_domain: string | null
          position: number | null
          rank_absolute: number | null
          serp_features: string[]
          title: string | null
          url: string | null
        }
        Insert: {
          check_id: string
          check_url?: string | null
          client_id: string
          engine: Database["public"]["Enums"]["rank_engine"]
          in_ai_overview?: boolean
          keyword_id: string
          local_pack_position?: number | null
          maps_rating?: number | null
          maps_reviews?: number | null
          matched_domain?: string | null
          position?: number | null
          rank_absolute?: number | null
          serp_features?: string[]
          title?: string | null
          url?: string | null
        }
        Update: {
          check_id?: string
          check_url?: string | null
          client_id?: string
          engine?: Database["public"]["Enums"]["rank_engine"]
          in_ai_overview?: boolean
          keyword_id?: string
          local_pack_position?: number | null
          maps_rating?: number | null
          maps_reviews?: number | null
          matched_domain?: string | null
          position?: number | null
          rank_absolute?: number | null
          serp_features?: string[]
          title?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "keyword_ranks_check_id_client_id_engine_fkey"
            columns: ["check_id", "client_id", "engine"]
            isOneToOne: false
            referencedRelation: "rank_checks"
            referencedColumns: ["id", "client_id", "engine"]
          },
          {
            foreignKeyName: "keyword_ranks_keyword_id_client_id_fkey"
            columns: ["keyword_id", "client_id"]
            isOneToOne: false
            referencedRelation: "keywords"
            referencedColumns: ["id", "client_id"]
          },
        ]
      }
      keyword_research_runs: {
        Row: {
          attempts: number
          client_id: string
          cost_usd: number
          counts: Json
          created_at: string
          created_by: string | null
          error: string | null
          finished_at: string | null
          heartbeat_at: string | null
          id: string
          params: Json
          started_at: string | null
          status: Database["public"]["Enums"]["research_status"]
          step: number
          trigger: Database["public"]["Enums"]["research_trigger"]
        }
        Insert: {
          attempts?: number
          client_id: string
          cost_usd?: number
          counts?: Json
          created_at?: string
          created_by?: string | null
          error?: string | null
          finished_at?: string | null
          heartbeat_at?: string | null
          id?: string
          params?: Json
          started_at?: string | null
          status?: Database["public"]["Enums"]["research_status"]
          step?: number
          trigger?: Database["public"]["Enums"]["research_trigger"]
        }
        Update: {
          attempts?: number
          client_id?: string
          cost_usd?: number
          counts?: Json
          created_at?: string
          created_by?: string | null
          error?: string | null
          finished_at?: string | null
          heartbeat_at?: string | null
          id?: string
          params?: Json
          started_at?: string | null
          status?: Database["public"]["Enums"]["research_status"]
          step?: number
          trigger?: Database["public"]["Enums"]["research_trigger"]
        }
        Relationships: [
          {
            foreignKeyName: "keyword_research_runs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "keyword_research_runs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      keywords: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          archived_reason: string | null
          client_id: string
          created_at: string
          created_by: string | null
          first_checked_at: string | null
          id: string
          notes: string | null
          phrase: string
          replaced_by: string | null
          source: Database["public"]["Enums"]["keyword_source"]
          topic: string | null
          tracked: boolean
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          archived_reason?: string | null
          client_id: string
          created_at?: string
          created_by?: string | null
          first_checked_at?: string | null
          id?: string
          notes?: string | null
          phrase: string
          replaced_by?: string | null
          source?: Database["public"]["Enums"]["keyword_source"]
          topic?: string | null
          tracked?: boolean
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          archived_reason?: string | null
          client_id?: string
          created_at?: string
          created_by?: string | null
          first_checked_at?: string | null
          id?: string
          notes?: string | null
          phrase?: string
          replaced_by?: string | null
          source?: Database["public"]["Enums"]["keyword_source"]
          topic?: string | null
          tracked?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "keywords_archived_by_fkey"
            columns: ["archived_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "keywords_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "keywords_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "keywords_replaced_by_fkey"
            columns: ["replaced_by"]
            isOneToOne: false
            referencedRelation: "keywords"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          actor_id: string | null
          client_id: string | null
          content_article_id: string | null
          content_post_id: string | null
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
          content_article_id?: string | null
          content_post_id?: string | null
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
          content_article_id?: string | null
          content_post_id?: string | null
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
            foreignKeyName: "notifications_content_article_id_fkey"
            columns: ["content_article_id"]
            isOneToOne: false
            referencedRelation: "content_articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_content_post_id_fkey"
            columns: ["content_post_id"]
            isOneToOne: false
            referencedRelation: "content_posts"
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
      rank_checks: {
        Row: {
          checked_at: string | null
          client_id: string
          cost_usd: number | null
          device: string | null
          engine: Database["public"]["Enums"]["rank_engine"]
          error: string | null
          id: string
          location: string | null
          run_id: string | null
          scope: Database["public"]["Enums"]["check_scope"]
          source: string
          started_at: string
          status: Database["public"]["Enums"]["check_status"]
          summary: Json | null
          tasks_done: number
          tasks_failed: number
          tasks_total: number
        }
        Insert: {
          checked_at?: string | null
          client_id: string
          cost_usd?: number | null
          device?: string | null
          engine: Database["public"]["Enums"]["rank_engine"]
          error?: string | null
          id?: string
          location?: string | null
          run_id?: string | null
          scope?: Database["public"]["Enums"]["check_scope"]
          source?: string
          started_at?: string
          status?: Database["public"]["Enums"]["check_status"]
          summary?: Json | null
          tasks_done?: number
          tasks_failed?: number
          tasks_total?: number
        }
        Update: {
          checked_at?: string | null
          client_id?: string
          cost_usd?: number | null
          device?: string | null
          engine?: Database["public"]["Enums"]["rank_engine"]
          error?: string | null
          id?: string
          location?: string | null
          run_id?: string | null
          scope?: Database["public"]["Enums"]["check_scope"]
          source?: string
          started_at?: string
          status?: Database["public"]["Enums"]["check_status"]
          summary?: Json | null
          tasks_done?: number
          tasks_failed?: number
          tasks_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "rank_checks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rank_checks_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "rank_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      rank_runs: {
        Row: {
          client_id: string
          cost_usd: number
          created_at: string
          created_by: string | null
          error: string | null
          finished_at: string | null
          id: string
          keyword_ids: string[] | null
          keywords_count: number
          scope: Database["public"]["Enums"]["check_scope"]
          started_at: string | null
          status: Database["public"]["Enums"]["rank_run_status"]
          trigger: Database["public"]["Enums"]["rank_run_trigger"]
        }
        Insert: {
          client_id: string
          cost_usd?: number
          created_at?: string
          created_by?: string | null
          error?: string | null
          finished_at?: string | null
          id?: string
          keyword_ids?: string[] | null
          keywords_count?: number
          scope: Database["public"]["Enums"]["check_scope"]
          started_at?: string | null
          status?: Database["public"]["Enums"]["rank_run_status"]
          trigger: Database["public"]["Enums"]["rank_run_trigger"]
        }
        Update: {
          client_id?: string
          cost_usd?: number
          created_at?: string
          created_by?: string | null
          error?: string | null
          finished_at?: string | null
          id?: string
          keyword_ids?: string[] | null
          keywords_count?: number
          scope?: Database["public"]["Enums"]["check_scope"]
          started_at?: string | null
          status?: Database["public"]["Enums"]["rank_run_status"]
          trigger?: Database["public"]["Enums"]["rank_run_trigger"]
        }
        Relationships: [
          {
            foreignKeyName: "rank_runs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rank_runs_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      rank_scan_keywords: {
        Row: {
          city_volume: number | null
          client_id: string
          cpc: number | null
          dfs_check_url: string | null
          dfs_etv: number | null
          dfs_position: number | null
          dfs_previous_position: number | null
          dfs_type: string | null
          dfs_updated_at: string | null
          dfs_url: string | null
          dfs_volume: number | null
          difficulty: number | null
          gbp_below_threshold: boolean
          gbp_reach: number | null
          gsc_clicks: number | null
          gsc_ctr: number | null
          gsc_impressions: number | null
          gsc_page: string | null
          gsc_position: number | null
          intent: string | null
          is_brand: boolean
          keyword_norm: string
          low_ctr: boolean
          national_volume: number | null
          other_language: boolean
          phrase: string
          position: number | null
          reasons: string[]
          scan_id: string
          score: number | null
          sources: Database["public"]["Enums"]["rank_scan_source"][]
          topic: string | null
          verdict: Database["public"]["Enums"]["rank_verdict"] | null
        }
        Insert: {
          city_volume?: number | null
          client_id: string
          cpc?: number | null
          dfs_check_url?: string | null
          dfs_etv?: number | null
          dfs_position?: number | null
          dfs_previous_position?: number | null
          dfs_type?: string | null
          dfs_updated_at?: string | null
          dfs_url?: string | null
          dfs_volume?: number | null
          difficulty?: number | null
          gbp_below_threshold?: boolean
          gbp_reach?: number | null
          gsc_clicks?: number | null
          gsc_ctr?: number | null
          gsc_impressions?: number | null
          gsc_page?: string | null
          gsc_position?: number | null
          intent?: string | null
          is_brand?: boolean
          keyword_norm: string
          low_ctr?: boolean
          national_volume?: number | null
          other_language?: boolean
          phrase: string
          position?: number | null
          reasons?: string[]
          scan_id: string
          score?: number | null
          sources?: Database["public"]["Enums"]["rank_scan_source"][]
          topic?: string | null
          verdict?: Database["public"]["Enums"]["rank_verdict"] | null
        }
        Update: {
          city_volume?: number | null
          client_id?: string
          cpc?: number | null
          dfs_check_url?: string | null
          dfs_etv?: number | null
          dfs_position?: number | null
          dfs_previous_position?: number | null
          dfs_type?: string | null
          dfs_updated_at?: string | null
          dfs_url?: string | null
          dfs_volume?: number | null
          difficulty?: number | null
          gbp_below_threshold?: boolean
          gbp_reach?: number | null
          gsc_clicks?: number | null
          gsc_ctr?: number | null
          gsc_impressions?: number | null
          gsc_page?: string | null
          gsc_position?: number | null
          intent?: string | null
          is_brand?: boolean
          keyword_norm?: string
          low_ctr?: boolean
          national_volume?: number | null
          other_language?: boolean
          phrase?: string
          position?: number | null
          reasons?: string[]
          scan_id?: string
          score?: number | null
          sources?: Database["public"]["Enums"]["rank_scan_source"][]
          topic?: string | null
          verdict?: Database["public"]["Enums"]["rank_verdict"] | null
        }
        Relationships: [
          {
            foreignKeyName: "rank_scan_keywords_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rank_scan_keywords_scan_id_fkey"
            columns: ["scan_id"]
            isOneToOne: false
            referencedRelation: "rank_scans"
            referencedColumns: ["id"]
          },
        ]
      }
      rank_scans: {
        Row: {
          attempts: number
          client_id: string
          cost_usd: number
          counts: Json
          created_at: string
          created_by: string | null
          error: string | null
          finished_at: string | null
          heartbeat_at: string | null
          id: string
          params: Json
          sources: Json
          started_at: string | null
          status: Database["public"]["Enums"]["rank_scan_status"]
          step: number
          trigger: Database["public"]["Enums"]["rank_scan_trigger"]
        }
        Insert: {
          attempts?: number
          client_id: string
          cost_usd?: number
          counts?: Json
          created_at?: string
          created_by?: string | null
          error?: string | null
          finished_at?: string | null
          heartbeat_at?: string | null
          id?: string
          params?: Json
          sources?: Json
          started_at?: string | null
          status?: Database["public"]["Enums"]["rank_scan_status"]
          step?: number
          trigger?: Database["public"]["Enums"]["rank_scan_trigger"]
        }
        Update: {
          attempts?: number
          client_id?: string
          cost_usd?: number
          counts?: Json
          created_at?: string
          created_by?: string | null
          error?: string | null
          finished_at?: string | null
          heartbeat_at?: string | null
          id?: string
          params?: Json
          sources?: Json
          started_at?: string | null
          status?: Database["public"]["Enums"]["rank_scan_status"]
          step?: number
          trigger?: Database["public"]["Enums"]["rank_scan_trigger"]
        }
        Relationships: [
          {
            foreignKeyName: "rank_scans_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rank_scans_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      rank_settings: {
        Row: {
          bing_location_code: number | null
          brand_terms: string[]
          check_weekday: number
          client_id: string
          country_location_code: number | null
          created_at: string
          depth: number
          device: string
          engines: Database["public"]["Enums"]["rank_engine"][]
          gsc_account_id: string | null
          gsc_country_only: boolean
          language_code: string
          last_scan_id: string | null
          location_code: number | null
          location_name: string | null
          maps_cid: string | null
          maps_name: string | null
          maps_place_id: string | null
          negative_terms: string[]
          next_run_at: string | null
          paused: boolean
          scan_auto: boolean
          scan_next_at: string | null
          topic_terms: string[]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          bing_location_code?: number | null
          brand_terms?: string[]
          check_weekday?: number
          client_id: string
          country_location_code?: number | null
          created_at?: string
          depth?: number
          device?: string
          engines?: Database["public"]["Enums"]["rank_engine"][]
          gsc_account_id?: string | null
          gsc_country_only?: boolean
          language_code?: string
          last_scan_id?: string | null
          location_code?: number | null
          location_name?: string | null
          maps_cid?: string | null
          maps_name?: string | null
          maps_place_id?: string | null
          negative_terms?: string[]
          next_run_at?: string | null
          paused?: boolean
          scan_auto?: boolean
          scan_next_at?: string | null
          topic_terms?: string[]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          bing_location_code?: number | null
          brand_terms?: string[]
          check_weekday?: number
          client_id?: string
          country_location_code?: number | null
          created_at?: string
          depth?: number
          device?: string
          engines?: Database["public"]["Enums"]["rank_engine"][]
          gsc_account_id?: string | null
          gsc_country_only?: boolean
          language_code?: string
          last_scan_id?: string | null
          location_code?: number | null
          location_name?: string | null
          maps_cid?: string | null
          maps_name?: string | null
          maps_place_id?: string | null
          negative_terms?: string[]
          next_run_at?: string | null
          paused?: boolean
          scan_auto?: boolean
          scan_next_at?: string | null
          topic_terms?: string[]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rank_settings_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: true
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rank_settings_gsc_account_id_fkey"
            columns: ["gsc_account_id"]
            isOneToOne: false
            referencedRelation: "social_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rank_settings_last_scan_id_fkey"
            columns: ["last_scan_id"]
            isOneToOne: false
            referencedRelation: "rank_scans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rank_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
        ]
      }
      serp_result_cache: {
        Row: {
          competitors: string[]
          cost_usd: number
          depth: number
          device: string
          engine: string
          fetched_at: string
          id: string
          items: Json
          items_count: number
          language_code: string
          location_code: number
          query_norm: string
        }
        Insert: {
          competitors?: string[]
          cost_usd?: number
          depth: number
          device: string
          engine: string
          fetched_at?: string
          id?: string
          items?: Json
          items_count?: number
          language_code: string
          location_code: number
          query_norm: string
        }
        Update: {
          competitors?: string[]
          cost_usd?: number
          depth?: number
          device?: string
          engine?: string
          fetched_at?: string
          id?: string
          items?: Json
          items_count?: number
          language_code?: string
          location_code?: number
          query_norm?: string
        }
        Relationships: []
      }
      serp_tasks: {
        Row: {
          attempts: number
          check_id: string
          client_id: string
          completed_at: string | null
          cost_usd: number | null
          engine: Database["public"]["Enums"]["rank_engine"]
          error_code: number | null
          error_message: string | null
          id: string
          keyword_id: string
          posted_at: string
          status: Database["public"]["Enums"]["serp_task_status"]
        }
        Insert: {
          attempts?: number
          check_id: string
          client_id: string
          completed_at?: string | null
          cost_usd?: number | null
          engine: Database["public"]["Enums"]["rank_engine"]
          error_code?: number | null
          error_message?: string | null
          id: string
          keyword_id: string
          posted_at?: string
          status?: Database["public"]["Enums"]["serp_task_status"]
        }
        Update: {
          attempts?: number
          check_id?: string
          client_id?: string
          completed_at?: string | null
          cost_usd?: number | null
          engine?: Database["public"]["Enums"]["rank_engine"]
          error_code?: number | null
          error_message?: string | null
          id?: string
          keyword_id?: string
          posted_at?: string
          status?: Database["public"]["Enums"]["serp_task_status"]
        }
        Relationships: [
          {
            foreignKeyName: "serp_tasks_check_id_fkey"
            columns: ["check_id"]
            isOneToOne: false
            referencedRelation: "rank_checks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "serp_tasks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "serp_tasks_keyword_id_fkey"
            columns: ["keyword_id"]
            isOneToOne: false
            referencedRelation: "keywords"
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
          counts_as: Database["public"]["Enums"]["deliverable_kind"] | null
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
          units: number
          updated_at: string
        }
        Insert: {
          assignee_id?: string | null
          completed_at?: string | null
          counts_as?: Database["public"]["Enums"]["deliverable_kind"] | null
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
          units?: number
          updated_at?: string
        }
        Update: {
          assignee_id?: string | null
          completed_at?: string | null
          counts_as?: Database["public"]["Enums"]["deliverable_kind"] | null
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
          units?: number
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
      work_items: {
        Row: {
          client_id: string
          created_at: string
          created_by: string | null
          delivered_on: string
          id: string
          kind: Database["public"]["Enums"]["deliverable_kind"]
          month: string | null
          note: string | null
          quantity: number
          source: Database["public"]["Enums"]["work_source"]
          source_id: string | null
          task_id: string | null
          title: string
          url: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          delivered_on: string
          id?: string
          kind: Database["public"]["Enums"]["deliverable_kind"]
          month?: string | null
          note?: string | null
          quantity?: number
          source: Database["public"]["Enums"]["work_source"]
          source_id?: string | null
          task_id?: string | null
          title: string
          url?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          delivered_on?: string
          id?: string
          kind?: Database["public"]["Enums"]["deliverable_kind"]
          month?: string | null
          note?: string | null
          quantity?: number
          source?: Database["public"]["Enums"]["work_source"]
          source_id?: string | null
          task_id?: string | null
          title?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "work_items_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_items_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "team_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_items_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "task_list"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_items_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
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
      account_balances: { Args: never; Returns: Json }
      add_aiv_action: {
        Args: { p: Json; p_client_id: string }
        Returns: string
      }
      add_backlink_login: {
        Args: {
          p_has_2fa: boolean
          p_password: string
          p_site_name: string
          p_site_url: string
          p_submission_id: string
          p_username: string
        }
        Returns: string
      }
      add_backlink_target: {
        Args: {
          p_client_id: string
          p_label: string
          p_location_code: number
          p_region_code?: string
          p_search_name: string
        }
        Returns: string
      }
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
      add_keywords: {
        Args: {
          p_client_id: string
          p_phrases: string[]
          p_source?: Database["public"]["Enums"]["keyword_source"]
          p_topic?: string
        }
        Returns: Json
      }
      add_manual_site: { Args: { p: Json; p_client_id: string }; Returns: Json }
      ai_search_quota: { Args: { p_client_id: string }; Returns: Json }
      aiv_brand_insight: {
        Args: {
          f: Json
          p_brand_id: string
          p_bucket: string
          p_client_id: string
        }
        Returns: Json
      }
      aiv_budget_problem: { Args: never; Returns: string }
      aiv_chat: { Args: { p_chat_id: string }; Returns: Json }
      aiv_chats_page: {
        Args: {
          f: Json
          p_brand?: string
          p_client_id: string
          p_limit?: number
          p_offset?: number
          p_q?: string
        }
        Returns: Json
      }
      aiv_cleanup: { Args: never; Returns: undefined }
      aiv_gap: {
        Args: { f: Json; p_client_id: string; p_limit?: number }
        Returns: Json
      }
      aiv_matrix: {
        Args: { f: Json; p_client_id: string; p_cols: string; p_rows: string }
        Returns: {
          answers: number
          avg_position: number
          col_key: string
          mentioned: number
          row_key: string
          sentiment: number
          visibility: number
          win_rate: number
        }[]
      }
      aiv_overview: { Args: { f: Json; p_client_id: string }; Returns: Json }
      aiv_prompt_detail: { Args: { p_prompt_id: string }; Returns: Json }
      aiv_prompt_table: {
        Args: { f: Json; p_client_id: string }
        Returns: {
          answers: number
          avg_position: number
          last_date: string
          mentioned: number
          prompt_id: string
          sentiment: number
          visibility: number
        }[]
      }
      aiv_quota: { Args: { p_client_id: string }; Returns: Json }
      aiv_run_history: {
        Args: { p_client_id: string; p_limit?: number }
        Returns: Json
      }
      aiv_source_detail: {
        Args: { f: Json; p_client_id: string; p_domain: string }
        Returns: Json
      }
      aiv_sources_domains: {
        Args: {
          f: Json
          p_client_id: string
          p_limit?: number
          p_offset?: number
          p_type?: string
        }
        Returns: Json
      }
      aiv_sources_urls: {
        Args: {
          f: Json
          p_client_id: string
          p_domain?: string
          p_limit?: number
          p_offset?: number
        }
        Returns: Json
      }
      aiv_trend: {
        Args: { f: Json; p_bucket: string; p_client_id: string }
        Returns: {
          answers: number
          avg_position: number
          brand_id: string
          brand_total: number
          bucket: string
          mentioned: number
          named: number
          sentiment: number
          wins: number
        }[]
      }
      apply_onboarding_profile: {
        Args: { p_client_id: string; p_fields: string[] }
        Returns: undefined
      }
      archive_keyword: {
        Args: { p_keyword_id: string; p_reason?: string }
        Returns: undefined
      }
      backlink_quota: { Args: { p_client_id: string }; Returns: Json }
      backlink_run_history: {
        Args: { p_client_id: string; p_limit?: number }
        Returns: Json
      }
      backlink_setup: { Args: { p_client_id: string }; Returns: Json }
      block_directory: {
        Args: { p_id: string; p_reason: string }
        Returns: number
      }
      bulk_update_submissions: {
        Args: { p: Json; p_ids: string[] }
        Returns: number
      }
      client_activity: {
        Args: { p_before?: number; p_client_id: string; p_limit?: number }
        Returns: {
          action: string
          actor_name: string
          created_at: string
          id: number
          meta: Json
        }[]
      }
      client_health_counts: {
        Args: never
        Returns: {
          health: Database["public"]["Enums"]["client_health"]
          total: number
        }[]
      }
      client_month_progress: {
        Args: { p_client_id: string; p_month?: string }
        Returns: {
          done: number
          expected: number
          kind: Database["public"]["Enums"]["deliverable_kind"]
          prorated: boolean
          status: string
          target: number
        }[]
      }
      client_visibility: { Args: { p_client_id: string }; Returns: Json }
      configure_zernio_cron: {
        Args: { p_base_url: string }
        Returns: undefined
      }
      content_claim_send: {
        Args: { p_id: string; p_kind: string }
        Returns: Json
      }
      create_client: {
        Args: { p: Json; p_link_token?: string; p_slug: string }
        Returns: Json
      }
      delete_content_article: { Args: { p_id: string }; Returns: undefined }
      delete_content_media: { Args: { p_id: string }; Returns: string[] }
      delete_content_post: { Args: { p_id: string }; Returns: undefined }
      dfs_ai_budget_problem: { Args: never; Returns: string }
      dfs_ai_search_budget_problem: { Args: never; Returns: string }
      dfs_apply_ai_shortlist: {
        Args: { p_items: Json; p_run_id: string }
        Returns: Json
      }
      dfs_apply_shortlist: {
        Args: { p_items: Json; p_run_id: string }
        Returns: Json
      }
      dfs_backlinks_budget_problem: { Args: never; Returns: string }
      dfs_backlinks_cleanup: { Args: never; Returns: Json }
      dfs_budget_status: { Args: never; Returns: Json }
      dfs_claim_ai_search_run: {
        Args: never
        Returns: {
          attempts: number
          brief_version: number | null
          client_id: string
          competitors: string[]
          cost_usd: number
          counts: Json
          created_at: string
          created_by: string | null
          error: string | null
          estimate_usd: number
          finished_at: string | null
          heartbeat_at: string | null
          id: string
          kind: string
          params: Json
          released_at: string | null
          stage: number
          started_at: string | null
          status: Database["public"]["Enums"]["backlink_run_status"]
          target_ids: string[]
          web_searches: number
        }[]
        SetofOptions: {
          from: "*"
          to: "ai_search_runs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      dfs_claim_aiv_run: {
        Args: never
        Returns: {
          attempts: number
          client_id: string
          cost_usd: number
          counts: Json
          created_at: string
          created_by: string | null
          error: string | null
          estimate_usd: number
          finished_at: string | null
          heartbeat_at: string | null
          id: string
          params: Json
          released_at: string | null
          stage: number
          started_at: string | null
          status: Database["public"]["Enums"]["backlink_run_status"]
          trigger: string
        }[]
        SetofOptions: {
          from: "*"
          to: "aiv_runs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      dfs_claim_backlink_run: {
        Args: never
        Returns: {
          attempts: number
          brief_version: number | null
          client_id: string
          cost_usd: number
          counts: Json
          created_at: string
          created_by: string | null
          error: string | null
          finished_at: string | null
          heartbeat_at: string | null
          id: string
          kind: string
          params: Json
          queries_done: number
          queries_total: number
          started_at: string | null
          status: Database["public"]["Enums"]["backlink_run_status"]
          step: number
          target_ids: string[]
        }[]
        SetofOptions: {
          from: "*"
          to: "backlink_runs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      dfs_claim_rank_run: {
        Args: never
        Returns: {
          client_id: string
          cost_usd: number
          created_at: string
          created_by: string | null
          error: string | null
          finished_at: string | null
          id: string
          keyword_ids: string[] | null
          keywords_count: number
          scope: Database["public"]["Enums"]["check_scope"]
          started_at: string | null
          status: Database["public"]["Enums"]["rank_run_status"]
          trigger: Database["public"]["Enums"]["rank_run_trigger"]
        }[]
        SetofOptions: {
          from: "*"
          to: "rank_runs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      dfs_claim_rank_scan: {
        Args: never
        Returns: {
          attempts: number
          client_id: string
          cost_usd: number
          counts: Json
          created_at: string
          created_by: string | null
          error: string | null
          finished_at: string | null
          heartbeat_at: string | null
          id: string
          params: Json
          sources: Json
          started_at: string | null
          status: Database["public"]["Enums"]["rank_scan_status"]
          step: number
          trigger: Database["public"]["Enums"]["rank_scan_trigger"]
        }[]
        SetofOptions: {
          from: "*"
          to: "rank_scans"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      dfs_claim_research_run: {
        Args: never
        Returns: {
          attempts: number
          client_id: string
          cost_usd: number
          counts: Json
          created_at: string
          created_by: string | null
          error: string | null
          finished_at: string | null
          heartbeat_at: string | null
          id: string
          params: Json
          started_at: string | null
          status: Database["public"]["Enums"]["research_status"]
          step: number
          trigger: Database["public"]["Enums"]["research_trigger"]
        }[]
        SetofOptions: {
          from: "*"
          to: "keyword_research_runs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      dfs_fail_task: {
        Args: {
          p_code: number
          p_message: string
          p_status: Database["public"]["Enums"]["serp_task_status"]
          p_task_id: string
        }
        Returns: string
      }
      dfs_finalize_runs: { Args: never; Returns: string[] }
      dfs_postback_config: { Args: never; Returns: Json }
      dfs_queue_aiv_runs: { Args: { p_limit?: number }; Returns: string[] }
      dfs_queue_due_runs: { Args: { p_limit?: number }; Returns: number }
      dfs_queue_monthly_scans: { Args: { p_limit?: number }; Returns: number }
      dfs_release_ai_search_run: {
        Args: { p_run_id: string }
        Returns: undefined
      }
      dfs_release_aiv_run: { Args: { p_run_id: string }; Returns: undefined }
      dfs_save_found_competitors: {
        Args: { p_client_id: string; p_items: Json; p_source: string }
        Returns: number
      }
      dfs_store_ai_prospects: {
        Args: { p_items: Json; p_run_id: string }
        Returns: Json
      }
      dfs_store_aiv_actions: {
        Args: { p: Json; p_client_id: string; p_run_id: string }
        Returns: number
      }
      dfs_store_aiv_analysis: {
        Args: { p: Json; p_chat_id: string }
        Returns: undefined
      }
      dfs_store_aiv_chat: {
        Args: { p: Json; p_task_id: string }
        Returns: string
      }
      dfs_store_aiv_suggestions: {
        Args: { p: Json; p_client_id: string }
        Returns: number
      }
      dfs_store_backlink_candidates: {
        Args: { p_items: Json; p_run_id: string }
        Returns: Json
      }
      dfs_store_rank: {
        Args: { p_cost?: number; p_rank: Json; p_task_id: string }
        Returns: string
      }
      dfs_store_site_strength: {
        Args: { p_ranks: Json; p_spam: Json }
        Returns: number
      }
      dfs_store_strength: {
        Args: {
          p_check_id: string
          p_cost?: number
          p_error?: string
          p_ranks: Json
          p_spam: Json
        }
        Returns: undefined
      }
      finish_rank_scan: {
        Args: { p: Json; p_scan_id: string }
        Returns: undefined
      }
      git_attempt_set_installation: {
        Args: { p_attempt_id: string; p_installation_id: number; p_key: string }
        Returns: boolean
      }
      git_check_connect_attempt: {
        Args: { p_attempt_id: string; p_key: string }
        Returns: Json
      }
      git_connection_secret: {
        Args: { p_id: string; p_kind: string }
        Returns: string
      }
      git_finish_connect: {
        Args: { p: Json; p_attempt_id: string; p_key: string }
        Returns: Json
      }
      git_set_connection_status: {
        Args: {
          p?: Json
          p_error: string
          p_id: string
          p_status: Database["public"]["Enums"]["git_connection_status"]
        }
        Returns: undefined
      }
      git_store_article_result: {
        Args: { p: Json; p_article_id: string }
        Returns: Json
      }
      keyword_first_ranks: {
        Args: { p_client_id: string }
        Returns: {
          checked_at: string
          engine: Database["public"]["Enums"]["rank_engine"]
          first_position: number
          keyword_id: string
        }[]
      }
      month_progress_summary: {
        Args: { p_client_ids: string[] }
        Returns: {
          client_id: string
          done: number
          kind: Database["public"]["Enums"]["deliverable_kind"]
          status: string
          target: number
        }[]
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
      onboarding_git_status: { Args: { p_token: string }; Returns: Json }
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
      onboarding_save_git_token: {
        Args: {
          p_owner: string
          p_repo: string
          p_token: string
          p_value: string
        }
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
      onboarding_start_git_connect: { Args: { p_token: string }; Returns: Json }
      onboarding_submit: { Args: { p_token: string }; Returns: Json }
      pick_catalog_sites: {
        Args: { p_catalog_ids: string[]; p_client_id: string }
        Returns: Json
      }
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
      rank_scan_lost: {
        Args: { p_client_id: string; p_scan_id: string }
        Returns: Json
      }
      rank_scan_page: {
        Args: {
          p_client_id: string
          p_limit?: number
          p_offset?: number
          p_q?: string
          p_scan_id: string
          p_source?: string
          p_untracked?: boolean
          p_verdict?: Database["public"]["Enums"]["rank_verdict"]
        }
        Returns: Json
      }
      rank_scan_previous: {
        Args: { p_client_id: string; p_scan_id: string }
        Returns: string
      }
      rankings_cron_status: { Args: never; Returns: Json }
      remove_backlink_target: { Args: { p_id: string }; Returns: undefined }
      remove_client_login: { Args: { p_login_id: string }; Returns: undefined }
      remove_git_connection: { Args: { p_id: string }; Returns: undefined }
      replace_keyword: {
        Args: { p_keyword_id: string; p_new_phrase: string }
        Returns: Json
      }
      report_catalog_problem: {
        Args: { p_id: string; p_note: string }
        Returns: undefined
      }
      request_ai_search:
        | {
            Args: {
              p_brief_version: number
              p_client_id: string
              p_estimate: number
              p_options: Json
              p_target_ids: string[]
            }
            Returns: string
          }
        | {
            Args: {
              p_brief_version: number
              p_client_id: string
              p_competitors: string[]
              p_estimate: number
              p_kind: string
              p_options: Json
              p_target_ids: string[]
            }
            Returns: string
          }
      request_aiv_run: {
        Args: {
          p_client_id: string
          p_estimate: number
          p_prompt_ids?: string[]
        }
        Returns: string
      }
      request_backlink_discovery:
        | {
            Args: { p_client_id: string; p_target_ids: string[] }
            Returns: string
          }
        | {
            Args: {
              p_brief_version: number
              p_client_id: string
              p_queries: Json
              p_target_ids: string[]
            }
            Returns: string
          }
      request_keyword_research: {
        Args: {
          p_client_id: string
          p_trigger?: Database["public"]["Enums"]["research_trigger"]
        }
        Returns: string
      }
      request_rank_check: { Args: { p_client_id: string }; Returns: string }
      request_rank_scan: { Args: { p_client_id: string }; Returns: string }
      request_strength_check: {
        Args: { p_client_id: string; p_force?: boolean; p_ids?: string[] }
        Returns: Json
      }
      rerank_backlinks: { Args: { p_client_id: string }; Returns: string }
      research_quota: { Args: { p_client_id: string }; Returns: Json }
      reveal_client_login: { Args: { p_login_id: string }; Returns: string }
      review_ai_prospects: {
        Args: {
          p_decision: string
          p_ids: string[]
          p_note?: string
          p_reason?: Database["public"]["Enums"]["backlink_reject_reason"]
        }
        Returns: number
      }
      review_aiv_suggestion: {
        Args: { p_accept: boolean; p_id: string }
        Returns: Json
      }
      review_backlink_opportunities: {
        Args: {
          p_decision: string
          p_ids: string[]
          p_note?: string
          p_reason?: Database["public"]["Enums"]["backlink_reject_reason"]
        }
        Returns: number
      }
      review_catalog_suggestion: {
        Args: { p_accept: boolean; p_id: string }
        Returns: undefined
      }
      save_aiv_brand: {
        Args: { p: Json; p_client_id: string }
        Returns: string
      }
      save_aiv_project: {
        Args: { p: Json; p_client_id: string }
        Returns: Json
      }
      save_aiv_prompts: {
        Args: { p_client_id: string; p_items: Json }
        Returns: Json
      }
      save_aiv_topic: {
        Args: { p: Json; p_client_id: string }
        Returns: string
      }
      save_backlink_brief: {
        Args: { p: Json; p_client_id: string }
        Returns: number
      }
      save_catalog_site: { Args: { p: Json }; Returns: string }
      save_client_competitors: {
        Args: { p_client_id: string; p_items: Json }
        Returns: number
      }
      save_content_article: {
        Args: { p: Json; p_client_id: string }
        Returns: Json
      }
      save_content_media: {
        Args: { p: Json; p_client_id: string }
        Returns: string
      }
      save_content_post: {
        Args: { p: Json; p_client_id: string }
        Returns: Json
      }
      save_content_settings: {
        Args: { p: Json; p_client_id: string }
        Returns: undefined
      }
      save_git_connection: {
        Args: { p: Json; p_id: string }
        Returns: undefined
      }
      save_git_deploy_hook: {
        Args: { p_id: string; p_url: string }
        Returns: undefined
      }
      save_git_token: {
        Args: {
          p_client_id: string
          p_connection_id: string
          p_owner: string
          p_repo: string
          p_token: string
        }
        Returns: string
      }
      save_rank_scan_settings: {
        Args: { p: Json; p_client_id: string }
        Returns: undefined
      }
      seed_aiv_from_setup: { Args: { p_client_id: string }; Returns: boolean }
      send_aiv_source_to_backlinks: {
        Args: { p: Json; p_client_id: string }
        Returns: Json
      }
      set_anthropic_credit: { Args: { p_amount: number }; Returns: undefined }
      set_candidate_status: {
        Args: {
          p_client_id: string
          p_dismiss: boolean
          p_keyword_norm: string
          p_reason?: string
        }
        Returns: undefined
      }
      set_content_article_seo: {
        Args: { p_done: boolean; p_id: string }
        Returns: undefined
      }
      set_directory: {
        Args: {
          p_cost_type: string
          p_id: string
          p_notes: string
          p_submit_url: string
          p_type: Database["public"]["Enums"]["directory_type"]
        }
        Returns: undefined
      }
      setup_required: { Args: never; Returns: boolean }
      start_git_connect: { Args: { p_client_id: string }; Returns: Json }
      store_rank_scan_rows: {
        Args: { p_rows: Json; p_scan_id: string }
        Returns: number
      }
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
      track_candidate: {
        Args: { p_client_id: string; p_keyword_norm: string }
        Returns: Json
      }
      unblock_directory: { Args: { p_id: string }; Returns: number }
      update_aiv_action: { Args: { p: Json; p_id: string }; Returns: undefined }
      update_aiv_prompts: {
        Args: { p: Json; p_ids: string[] }
        Returns: number
      }
      update_aiv_settings: { Args: { p: Json }; Returns: undefined }
      update_backlink_target: {
        Args: { p_active: boolean; p_id: string; p_search_name: string }
        Returns: undefined
      }
      update_rank_settings: {
        Args: { p_client_id: string; p_data: Json }
        Returns: undefined
      }
      update_submission: { Args: { p: Json; p_id: string }; Returns: undefined }
      verify_aiv_token: { Args: { p_token: string }; Returns: boolean }
      verify_backlinks_token: { Args: { p_token: string }; Returns: boolean }
      verify_catalog_site: { Args: { p_id: string }; Returns: undefined }
      verify_content_cron_token: { Args: { p_token: string }; Returns: boolean }
      verify_rankings_token: {
        Args: { p_kind: string; p_token: string }
        Returns: boolean
      }
      verify_zernio_cron_token: { Args: { p_token: string }; Returns: boolean }
      zernio_cron_status: { Args: never; Returns: Json }
      zernio_store_article_result: {
        Args: { p: Json; p_article_id: string }
        Returns: Json
      }
      zernio_store_post_result: {
        Args: { p: Json; p_post_id: string }
        Returns: Json
      }
    }
    Enums: {
      ai_tool: "chatgpt" | "perplexity" | "gemini" | "ai_overviews" | "claude"
      aiv_intent:
        | "informational"
        | "commercial"
        | "transactional"
        | "navigational"
      aiv_model:
        | "chatgpt"
        | "gemini"
        | "ai_overview"
        | "ai_mode"
        | "claude"
        | "perplexity"
      alert_severity: "needs_look" | "action_needed"
      app_role: "admin" | "manager" | "va" | "writer" | "viewer"
      backlink_reject_reason:
        | "not_relevant"
        | "competitor"
        | "paid_only"
        | "not_accepting"
        | "duplicate"
        | "spam"
        | "broken"
        | "other"
      backlink_run_status: "queued" | "running" | "done" | "failed"
      candidate_status: "new" | "tracked" | "dismissed"
      catalog_category:
        | "maps_core"
        | "citation"
        | "local_country"
        | "home_services"
        | "professional"
        | "b2b_reviews"
        | "software"
        | "company_profile"
        | "social_profile"
        | "publishing"
        | "journalist_requests"
        | "press_release"
        | "podcast"
        | "local_play"
        | "community"
        | "ecommerce"
        | "marketplace_paid"
      catalog_kind: "site" | "play"
      catalog_pricing:
        | "free"
        | "freemium"
        | "trial"
        | "paid"
        | "lead_fees"
        | "membership"
        | "selection"
        | "retired"
      check_scope: "full" | "partial"
      check_status: "running" | "done" | "failed"
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
      content_media_kind: "image" | "video" | "document"
      content_site_kind: "wordpress" | "git"
      content_status:
        | "draft"
        | "scheduled"
        | "publishing"
        | "published"
        | "partial"
        | "failed"
        | "cancelled"
      content_target_status:
        | "pending"
        | "publishing"
        | "published"
        | "failed"
        | "cancelled"
        | "deleted"
      deliverable_kind:
        | "backlinks"
        | "articles"
        | "gbp_posts"
        | "review_requests"
        | "ai_fixes"
      dfs_api:
        | "serp_google"
        | "serp_maps"
        | "serp_bing"
        | "labs"
        | "google_ads"
        | "appendix"
        | "backlinks"
        | "ai_optimization"
      directory_status: "active" | "blocked"
      directory_type:
        | "business_directory"
        | "industry_directory"
        | "maps"
        | "chamber"
        | "association"
        | "review_site"
        | "news_blog"
        | "guest_post"
        | "social"
        | "government"
        | "aggregator"
        | "other"
        | "marketplace"
        | "podcast"
        | "community"
        | "sponsorship"
        | "resource_page"
      discovery_query_status: "queued" | "done" | "cached" | "failed"
      footprint_scope: "geo" | "service" | "industry" | "topic" | "buyer"
      git_auth_method: "github_app" | "token"
      git_connection_status: "connected" | "needs_attention" | "removed"
      git_deploy_state: "none" | "waiting" | "building" | "live" | "failed"
      google_access_status:
        | "todo"
        | "added"
        | "no_access"
        | "not_using"
        | "help"
      keyword_source: "manual" | "research" | "onboarding" | "ranked"
      link_kind: "follow" | "nofollow" | "mixed" | "varies" | "none" | "unknown"
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
        | "research_finished"
        | "dfs_low_balance"
        | "backlinks_found"
        | "backlinks_failed"
        | "backlink_follow_up"
        | "ai_visibility_ready"
        | "ai_visibility_failed"
        | "content_failed"
        | "content_published"
        | "rank_scan_finished"
        | "site_connection_problem"
      onboarding_link_status: "active" | "revoked" | "expired"
      onboarding_status:
        | "not_started"
        | "in_progress"
        | "submitted"
        | "reviewed"
      onboarding_step_status: "todo" | "in_progress" | "done" | "skipped"
      opportunity_status:
        | "pending_review"
        | "approved"
        | "rejected"
        | "filtered"
        | "reserve"
      package_kind: "seo" | "geo" | "seo_geo" | "custom"
      rank_engine: "google" | "bing" | "google_maps"
      rank_run_status: "queued" | "running" | "done" | "partial" | "failed"
      rank_run_trigger: "schedule" | "manual" | "new_keywords"
      rank_scan_source: "dataforseo" | "search_console" | "google_business"
      rank_scan_status: "queued" | "running" | "done" | "partial" | "failed"
      rank_scan_trigger: "manual" | "monthly" | "connected"
      rank_verdict: "keep" | "quick_win" | "brand" | "watch" | "skip"
      request_decision: "approved" | "changes_requested"
      request_kind: "question" | "code" | "files" | "approval" | "action"
      request_status: "open" | "answered" | "done" | "cancelled"
      research_status: "queued" | "running" | "done" | "failed"
      research_trigger: "manual" | "setup" | "monthly"
      serp_task_status: "posted" | "done" | "failed" | "expired"
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
        | "wordpress"
        | "googlesearchconsole"
      strength_check_status: "running" | "done" | "failed"
      submission_block:
        | "verification"
        | "needs_client_info"
        | "needs_payment"
        | "site_rejected"
        | "site_broken"
        | "duplicate_found"
        | "other"
      submission_status:
        | "todo"
        | "doing"
        | "submitted"
        | "live"
        | "blocked"
        | "skipped"
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
      website_access_status:
        | "todo"
        | "invited_us"
        | "login_in_vault"
        | "later"
        | "connected"
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
        | "git_cms"
      work_source:
        | "task"
        | "manual"
        | "backlink"
        | "article"
        | "gbp_post"
        | "review_request"
        | "ai_fix"
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
      ai_tool: ["chatgpt", "perplexity", "gemini", "ai_overviews", "claude"],
      aiv_intent: [
        "informational",
        "commercial",
        "transactional",
        "navigational",
      ],
      aiv_model: [
        "chatgpt",
        "gemini",
        "ai_overview",
        "ai_mode",
        "claude",
        "perplexity",
      ],
      alert_severity: ["needs_look", "action_needed"],
      app_role: ["admin", "manager", "va", "writer", "viewer"],
      backlink_reject_reason: [
        "not_relevant",
        "competitor",
        "paid_only",
        "not_accepting",
        "duplicate",
        "spam",
        "broken",
        "other",
      ],
      backlink_run_status: ["queued", "running", "done", "failed"],
      candidate_status: ["new", "tracked", "dismissed"],
      catalog_category: [
        "maps_core",
        "citation",
        "local_country",
        "home_services",
        "professional",
        "b2b_reviews",
        "software",
        "company_profile",
        "social_profile",
        "publishing",
        "journalist_requests",
        "press_release",
        "podcast",
        "local_play",
        "community",
        "ecommerce",
        "marketplace_paid",
      ],
      catalog_kind: ["site", "play"],
      catalog_pricing: [
        "free",
        "freemium",
        "trial",
        "paid",
        "lead_fees",
        "membership",
        "selection",
        "retired",
      ],
      check_scope: ["full", "partial"],
      check_status: ["running", "done", "failed"],
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
      content_media_kind: ["image", "video", "document"],
      content_site_kind: ["wordpress", "git"],
      content_status: [
        "draft",
        "scheduled",
        "publishing",
        "published",
        "partial",
        "failed",
        "cancelled",
      ],
      content_target_status: [
        "pending",
        "publishing",
        "published",
        "failed",
        "cancelled",
        "deleted",
      ],
      deliverable_kind: [
        "backlinks",
        "articles",
        "gbp_posts",
        "review_requests",
        "ai_fixes",
      ],
      dfs_api: [
        "serp_google",
        "serp_maps",
        "serp_bing",
        "labs",
        "google_ads",
        "appendix",
        "backlinks",
        "ai_optimization",
      ],
      directory_status: ["active", "blocked"],
      directory_type: [
        "business_directory",
        "industry_directory",
        "maps",
        "chamber",
        "association",
        "review_site",
        "news_blog",
        "guest_post",
        "social",
        "government",
        "aggregator",
        "other",
        "marketplace",
        "podcast",
        "community",
        "sponsorship",
        "resource_page",
      ],
      discovery_query_status: ["queued", "done", "cached", "failed"],
      footprint_scope: ["geo", "service", "industry", "topic", "buyer"],
      git_auth_method: ["github_app", "token"],
      git_connection_status: ["connected", "needs_attention", "removed"],
      git_deploy_state: ["none", "waiting", "building", "live", "failed"],
      google_access_status: ["todo", "added", "no_access", "not_using", "help"],
      keyword_source: ["manual", "research", "onboarding", "ranked"],
      link_kind: ["follow", "nofollow", "mixed", "varies", "none", "unknown"],
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
        "research_finished",
        "dfs_low_balance",
        "backlinks_found",
        "backlinks_failed",
        "backlink_follow_up",
        "ai_visibility_ready",
        "ai_visibility_failed",
        "content_failed",
        "content_published",
        "rank_scan_finished",
        "site_connection_problem",
      ],
      onboarding_link_status: ["active", "revoked", "expired"],
      onboarding_status: [
        "not_started",
        "in_progress",
        "submitted",
        "reviewed",
      ],
      onboarding_step_status: ["todo", "in_progress", "done", "skipped"],
      opportunity_status: [
        "pending_review",
        "approved",
        "rejected",
        "filtered",
        "reserve",
      ],
      package_kind: ["seo", "geo", "seo_geo", "custom"],
      rank_engine: ["google", "bing", "google_maps"],
      rank_run_status: ["queued", "running", "done", "partial", "failed"],
      rank_run_trigger: ["schedule", "manual", "new_keywords"],
      rank_scan_source: ["dataforseo", "search_console", "google_business"],
      rank_scan_status: ["queued", "running", "done", "partial", "failed"],
      rank_scan_trigger: ["manual", "monthly", "connected"],
      rank_verdict: ["keep", "quick_win", "brand", "watch", "skip"],
      request_decision: ["approved", "changes_requested"],
      request_kind: ["question", "code", "files", "approval", "action"],
      request_status: ["open", "answered", "done", "cancelled"],
      research_status: ["queued", "running", "done", "failed"],
      research_trigger: ["manual", "setup", "monthly"],
      serp_task_status: ["posted", "done", "failed", "expired"],
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
        "wordpress",
        "googlesearchconsole",
      ],
      strength_check_status: ["running", "done", "failed"],
      submission_block: [
        "verification",
        "needs_client_info",
        "needs_payment",
        "site_rejected",
        "site_broken",
        "duplicate_found",
        "other",
      ],
      submission_status: [
        "todo",
        "doing",
        "submitted",
        "live",
        "blocked",
        "skipped",
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
      website_access_status: [
        "todo",
        "invited_us",
        "login_in_vault",
        "later",
        "connected",
      ],
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
        "git_cms",
      ],
      work_source: [
        "task",
        "manual",
        "backlink",
        "article",
        "gbp_post",
        "review_request",
        "ai_fix",
      ],
    },
  },
} as const
