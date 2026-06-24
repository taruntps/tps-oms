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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      app_settings: {
        Row: {
          description: string | null
          is_secret: boolean | null
          key: string
          updated_at: string | null
          updated_by: string | null
          value: string | null
        }
        Insert: {
          description?: string | null
          is_secret?: boolean | null
          key: string
          updated_at?: string | null
          updated_by?: string | null
          value?: string | null
        }
        Update: {
          description?: string | null
          is_secret?: boolean | null
          key?: string
          updated_at?: string | null
          updated_by?: string | null
          value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "app_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          created_at: string
          id: string
          ip_address: string | null
          new_data: Json | null
          old_data: Json | null
          record_id: string | null
          table_name: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          ip_address?: string | null
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          ip_address?: string | null
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          table_name?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      authority_queries: {
        Row: {
          client_response_pending: boolean
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          project_id: string
          query_code: string | null
          query_type: Database["public"]["Enums"]["query_type"]
          received_date: string
          responded_at: string | null
          responded_by: string | null
          response_days: number | null
          response_due: string | null
          response_note: string | null
          subject: string
          submitted_at: string | null
          submitted_by: string | null
        }
        Insert: {
          client_response_pending?: boolean
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          project_id: string
          query_code?: string | null
          query_type: Database["public"]["Enums"]["query_type"]
          received_date: string
          responded_at?: string | null
          responded_by?: string | null
          response_days?: number | null
          response_due?: string | null
          response_note?: string | null
          subject: string
          submitted_at?: string | null
          submitted_by?: string | null
        }
        Update: {
          client_response_pending?: boolean
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          project_id?: string
          query_code?: string | null
          query_type?: Database["public"]["Enums"]["query_type"]
          received_date?: string
          responded_at?: string | null
          responded_by?: string | null
          response_days?: number | null
          response_due?: string | null
          response_note?: string | null
          subject?: string
          submitted_at?: string | null
          submitted_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "authority_queries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "authority_queries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "authority_queries_responded_by_fkey"
            columns: ["responded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      block_requests: {
        Row: {
          approved: boolean | null
          block_type: Database["public"]["Enums"]["block_type"]
          id: string
          project_id: string
          reason: string
          rejection_note: string | null
          requested_at: string
          requested_by: string
          reviewed_at: string | null
          reviewed_by: string | null
        }
        Insert: {
          approved?: boolean | null
          block_type: Database["public"]["Enums"]["block_type"]
          id?: string
          project_id: string
          reason: string
          rejection_note?: string | null
          requested_at?: string
          requested_by: string
          reviewed_at?: string | null
          reviewed_by?: string | null
        }
        Update: {
          approved?: boolean | null
          block_type?: Database["public"]["Enums"]["block_type"]
          id?: string
          project_id?: string
          reason?: string
          rejection_note?: string | null
          requested_at?: string
          requested_by?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "block_requests_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "block_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "block_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cancel_requests: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          id: string
          project_id: string
          reason: string
          requested_by: string
          status: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          id?: string
          project_id: string
          reason: string
          requested_by: string
          status?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          id?: string
          project_id?: string
          reason?: string
          requested_by?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "cancel_requests_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      client_documents: {
        Row: {
          category: Database["public"]["Enums"]["client_document_category"]
          client_id: string
          created_at: string
          file_name: string
          file_size_bytes: number | null
          id: string
          mime_type: string | null
          storage_path: string
          uploaded_by: string | null
        }
        Insert: {
          category: Database["public"]["Enums"]["client_document_category"]
          client_id: string
          created_at?: string
          file_name: string
          file_size_bytes?: number | null
          id?: string
          mime_type?: string | null
          storage_path: string
          uploaded_by?: string | null
        }
        Update: {
          category?: Database["public"]["Enums"]["client_document_category"]
          client_id?: string
          created_at?: string
          file_name?: string
          file_size_bytes?: number | null
          id?: string
          mime_type?: string | null
          storage_path?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_documents_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          address: string | null
          city: string | null
          client_code: string | null
          company_name: string
          contact_email: string | null
          contact_person: string
          contact_phone: string
          created_at: string
          created_by: string | null
          fssai_central_ref: string | null
          gstin: string | null
          gstin_is_placeholder: boolean
          id: string
          is_active: boolean
          notes: string | null
          pan: string | null
          state: string
          trade_name: string | null
          updated_at: string
          whatsapp_number: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          client_code?: string | null
          company_name: string
          contact_email?: string | null
          contact_person: string
          contact_phone: string
          created_at?: string
          created_by?: string | null
          fssai_central_ref?: string | null
          gstin?: string | null
          gstin_is_placeholder?: boolean
          id?: string
          is_active?: boolean
          notes?: string | null
          pan?: string | null
          state?: string
          trade_name?: string | null
          updated_at?: string
          whatsapp_number?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          client_code?: string | null
          company_name?: string
          contact_email?: string | null
          contact_person?: string
          contact_phone?: string
          created_at?: string
          created_by?: string | null
          fssai_central_ref?: string | null
          gstin?: string | null
          gstin_is_placeholder?: boolean
          id?: string
          is_active?: boolean
          notes?: string | null
          pan?: string | null
          state?: string
          trade_name?: string | null
          updated_at?: string
          whatsapp_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clients_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      code_counters: {
        Row: {
          last_value: number
          scope: string
        }
        Insert: {
          last_value?: number
          scope: string
        }
        Update: {
          last_value?: number
          scope?: string
        }
        Relationships: []
      }
      credential_access_log: {
        Row: {
          accessed_at: string
          accessed_by: string
          id: string
          ip_address: string | null
          license_id: string
          reason: string | null
        }
        Insert: {
          accessed_at?: string
          accessed_by: string
          id?: string
          ip_address?: string | null
          license_id: string
          reason?: string | null
        }
        Update: {
          accessed_at?: string
          accessed_by?: string
          id?: string
          ip_address?: string | null
          license_id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "credential_access_log_accessed_by_fkey"
            columns: ["accessed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credential_access_log_license_id_fkey"
            columns: ["license_id"]
            isOneToOne: false
            referencedRelation: "licenses"
            referencedColumns: ["id"]
          },
        ]
      }
      delete_requests: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          id: string
          reason: string
          record_id: string
          record_label: string | null
          requested_by: string
          status: string
          table_name: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          id?: string
          reason: string
          record_id: string
          record_label?: string | null
          requested_by: string
          status?: string
          table_name: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          id?: string
          reason?: string
          record_id?: string
          record_label?: string | null
          requested_by?: string
          status?: string
          table_name?: string
        }
        Relationships: []
      }
      documents: {
        Row: {
          client_id: string
          created_at: string
          doc_type: Database["public"]["Enums"]["document_type"]
          file_name: string
          file_size_bytes: number | null
          id: string
          is_latest: boolean
          mime_type: string | null
          project_id: string
          storage_path: string
          uploaded_by: string | null
          version: number
        }
        Insert: {
          client_id: string
          created_at?: string
          doc_type: Database["public"]["Enums"]["document_type"]
          file_name: string
          file_size_bytes?: number | null
          id?: string
          is_latest?: boolean
          mime_type?: string | null
          project_id: string
          storage_path: string
          uploaded_by?: string | null
          version?: number
        }
        Update: {
          client_id?: string
          created_at?: string
          doc_type?: Database["public"]["Enums"]["document_type"]
          file_name?: string
          file_size_bytes?: number | null
          id?: string
          is_latest?: boolean
          mime_type?: string | null
          project_id?: string
          storage_path?: string
          uploaded_by?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "documents_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_base: {
        Row: {
          category: string
          content: string
          created_at: string
          created_by: string | null
          id: string
          is_published: boolean
          tags: string[] | null
          title: string
          updated_at: string
        }
        Insert: {
          category: string
          content: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_published?: boolean
          tags?: string[] | null
          title: string
          updated_at?: string
        }
        Update: {
          category?: string
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_published?: boolean
          tags?: string[] | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_base_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      licenses: {
        Row: {
          authorised_premises: string | null
          authority_office: string | null
          categories: string[] | null
          category: string | null
          city: string | null
          client_id: string
          created_at: string
          created_by: string | null
          credential_username: string | null
          expiry_date: string | null
          id: string
          is_active: boolean
          issue_date: string | null
          last_credential_accessed_at: string | null
          last_credential_accessed_by: string | null
          license_number: string | null
          license_type: string
          notes: string | null
          state_code: string | null
          state_name: string | null
          status: string
          updated_at: string
          vault_credential_id: string | null
        }
        Insert: {
          authorised_premises?: string | null
          authority_office?: string | null
          categories?: string[] | null
          category?: string | null
          city?: string | null
          client_id: string
          created_at?: string
          created_by?: string | null
          credential_username?: string | null
          expiry_date?: string | null
          id?: string
          is_active?: boolean
          issue_date?: string | null
          last_credential_accessed_at?: string | null
          last_credential_accessed_by?: string | null
          license_number?: string | null
          license_type: string
          notes?: string | null
          state_code?: string | null
          state_name?: string | null
          status?: string
          updated_at?: string
          vault_credential_id?: string | null
        }
        Update: {
          authorised_premises?: string | null
          authority_office?: string | null
          categories?: string[] | null
          category?: string | null
          city?: string | null
          client_id?: string
          created_at?: string
          created_by?: string | null
          credential_username?: string | null
          expiry_date?: string | null
          id?: string
          is_active?: boolean
          issue_date?: string | null
          last_credential_accessed_at?: string | null
          last_credential_accessed_by?: string | null
          license_number?: string | null
          license_type?: string
          notes?: string | null
          state_code?: string | null
          state_name?: string | null
          status?: string
          updated_at?: string
          vault_credential_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "licenses_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "licenses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "licenses_last_credential_accessed_by_fkey"
            columns: ["last_credential_accessed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          is_read: boolean
          reference_id: string | null
          reference_type: string | null
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
          whatsapp_sent_at: string | null
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          reference_id?: string | null
          reference_type?: string | null
          title: string
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
          whatsapp_sent_at?: string | null
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          reference_id?: string | null
          reference_type?: string | null
          title?: string
          type?: Database["public"]["Enums"]["notification_type"]
          user_id?: string
          whatsapp_sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          client_id: string
          created_at: string
          id: string
          invoice_no: string | null
          notes: string | null
          payment_date: string
          payment_mode: string
          project_id: string
          recorded_by: string | null
          reference_no: string | null
        }
        Insert: {
          amount: number
          client_id: string
          created_at?: string
          id?: string
          invoice_no?: string | null
          notes?: string | null
          payment_date: string
          payment_mode: string
          project_id: string
          recorded_by?: string | null
          reference_no?: string | null
        }
        Update: {
          amount?: number
          client_id?: string
          created_at?: string
          id?: string
          invoice_no?: string | null
          notes?: string | null
          payment_date?: string
          payment_mode?: string
          project_id?: string
          recorded_by?: string | null
          reference_no?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      performance_reports: {
        Row: {
          avg_closure_days: number | null
          created_at: string
          generated_by: string | null
          id: string
          on_time_rate: number | null
          projects_closed: number
          report_data: Json | null
          report_period: string
          revenue_paise: number
          user_id: string | null
        }
        Insert: {
          avg_closure_days?: number | null
          created_at?: string
          generated_by?: string | null
          id?: string
          on_time_rate?: number | null
          projects_closed?: number
          report_data?: Json | null
          report_period: string
          revenue_paise?: number
          user_id?: string | null
        }
        Update: {
          avg_closure_days?: number | null
          created_at?: string
          generated_by?: string | null
          id?: string
          on_time_rate?: number | null
          projects_closed?: number
          report_data?: Json | null
          report_period?: string
          revenue_paise?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "performance_reports_generated_by_fkey"
            columns: ["generated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performance_reports_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          can_assign: boolean
          can_be_assigned: boolean
          can_edit_clients: boolean
          can_view_all_projects: boolean
          created_at: string
          email: string
          id: string
          is_active: boolean
          name: string
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
          whatsapp_number: string | null
        }
        Insert: {
          avatar_url?: string | null
          can_assign?: boolean
          can_be_assigned?: boolean
          can_edit_clients?: boolean
          can_view_all_projects?: boolean
          created_at?: string
          email: string
          id: string
          is_active?: boolean
          name: string
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
          whatsapp_number?: string | null
        }
        Update: {
          avatar_url?: string | null
          can_assign?: boolean
          can_be_assigned?: boolean
          can_edit_clients?: boolean
          can_view_all_projects?: boolean
          created_at?: string
          email?: string
          id?: string
          is_active?: boolean
          name?: string
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
          whatsapp_number?: string | null
        }
        Relationships: []
      }
      project_transfers: {
        Row: {
          created_at: string
          forced: boolean
          from_user: string | null
          id: string
          initiated_by: string
          project_id: string
          reason: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: Database["public"]["Enums"]["project_transfer_status"]
          to_user: string
        }
        Insert: {
          created_at?: string
          forced?: boolean
          from_user?: string | null
          id?: string
          initiated_by: string
          project_id: string
          reason?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["project_transfer_status"]
          to_user: string
        }
        Update: {
          created_at?: string
          forced?: boolean
          from_user?: string | null
          id?: string
          initiated_by?: string
          project_id?: string
          reason?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: Database["public"]["Enums"]["project_transfer_status"]
          to_user?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_transfers_from_user_fkey"
            columns: ["from_user"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_transfers_initiated_by_fkey"
            columns: ["initiated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_transfers_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_transfers_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_transfers_to_user_fkey"
            columns: ["to_user"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          active_clock: Database["public"]["Enums"]["clock_type"]
          app_ref_no: string | null
          assigned_to: string | null
          awaiting_client_flag: boolean
          block_expires_at: string | null
          block_reason: string | null
          block_started_at: string | null
          block_type: Database["public"]["Enums"]["block_type"] | null
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          client_id: string
          clock_switched_at: string
          completed_date: string | null
          created_at: string
          created_by: string | null
          id: string
          is_blocked: boolean
          license_id: string | null
          manager_id: string | null
          notes: string | null
          paid_amount: number
          payment_status: Database["public"]["Enums"]["payment_status"]
          project_code: string
          project_name: string
          quoted_amount: number
          service_type: string
          start_date: string
          status: Database["public"]["Enums"]["project_status"]
          target_date: string | null
          updated_at: string
        }
        Insert: {
          active_clock?: Database["public"]["Enums"]["clock_type"]
          app_ref_no?: string | null
          assigned_to?: string | null
          awaiting_client_flag?: boolean
          block_expires_at?: string | null
          block_reason?: string | null
          block_started_at?: string | null
          block_type?: Database["public"]["Enums"]["block_type"] | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          client_id: string
          clock_switched_at?: string
          completed_date?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_blocked?: boolean
          license_id?: string | null
          manager_id?: string | null
          notes?: string | null
          paid_amount?: number
          payment_status?: Database["public"]["Enums"]["payment_status"]
          project_code?: string
          project_name: string
          quoted_amount?: number
          service_type: string
          start_date?: string
          status?: Database["public"]["Enums"]["project_status"]
          target_date?: string | null
          updated_at?: string
        }
        Update: {
          active_clock?: Database["public"]["Enums"]["clock_type"]
          app_ref_no?: string | null
          assigned_to?: string | null
          awaiting_client_flag?: boolean
          block_expires_at?: string | null
          block_reason?: string | null
          block_started_at?: string | null
          block_type?: Database["public"]["Enums"]["block_type"] | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          client_id?: string
          clock_switched_at?: string
          completed_date?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_blocked?: boolean
          license_id?: string | null
          manager_id?: string | null
          notes?: string | null
          paid_amount?: number
          payment_status?: Database["public"]["Enums"]["payment_status"]
          project_code?: string
          project_name?: string
          quoted_amount?: number
          service_type?: string
          start_date?: string
          status?: Database["public"]["Enums"]["project_status"]
          target_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_license_id_fkey"
            columns: ["license_id"]
            isOneToOne: false
            referencedRelation: "licenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      query_points: {
        Row: {
          created_at: string
          description: string
          id: string
          point_order: number
          query_id: string
          responded_at: string | null
          responded_by: string | null
          response: string | null
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          point_order?: number
          query_id: string
          responded_at?: string | null
          responded_by?: string | null
          response?: string | null
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          point_order?: number
          query_id?: string
          responded_at?: string | null
          responded_by?: string | null
          response?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "query_points_query_id_fkey"
            columns: ["query_id"]
            isOneToOne: false
            referencedRelation: "authority_queries"
            referencedColumns: ["id"]
          },
        ]
      }
      soi_archive: {
        Row: {
          client_id: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          product_category: string | null
          project_id: string | null
          soi_date: string
          storage_path: string | null
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          product_category?: string | null
          project_id?: string | null
          soi_date: string
          storage_path?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          product_category?: string | null
          project_id?: string | null
          soi_date?: string
          storage_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "soi_archive_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "soi_archive_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "soi_archive_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      soi_products: {
        Row: {
          client_id: string
          created_at: string
          created_by: string | null
          id: string
          product_name: string
          product_type: string | null
          project_id: string | null
          sr_no: number | null
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          product_name: string
          product_type?: string | null
          project_id?: string | null
          sr_no?: number | null
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          product_name?: string
          product_type?: string | null
          project_id?: string | null
          sr_no?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "soi_products_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "soi_products_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      stage_templates: {
        Row: {
          clock_action: string | null
          default_days: number | null
          id: string
          is_skippable: boolean
          service_type: string
          stage_code: string
          stage_name: string
          stage_order: number
        }
        Insert: {
          clock_action?: string | null
          default_days?: number | null
          id?: string
          is_skippable?: boolean
          service_type: string
          stage_code: string
          stage_name: string
          stage_order: number
        }
        Update: {
          clock_action?: string | null
          default_days?: number | null
          id?: string
          is_skippable?: boolean
          service_type?: string
          stage_code?: string
          stage_name?: string
          stage_order?: number
        }
        Relationships: []
      }
      stage_timeline: {
        Row: {
          clock_type: Database["public"]["Enums"]["clock_type"]
          created_by: string | null
          duration_min: number | null
          ended_at: string | null
          id: string
          note: string | null
          project_id: string
          stage_id: string | null
          started_at: string
        }
        Insert: {
          clock_type: Database["public"]["Enums"]["clock_type"]
          created_by?: string | null
          duration_min?: number | null
          ended_at?: string | null
          id?: string
          note?: string | null
          project_id: string
          stage_id?: string | null
          started_at?: string
        }
        Update: {
          clock_type?: Database["public"]["Enums"]["clock_type"]
          created_by?: string | null
          duration_min?: number | null
          ended_at?: string | null
          id?: string
          note?: string | null
          project_id?: string
          stage_id?: string | null
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stage_timeline_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stage_timeline_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stage_timeline_stage_id_fkey"
            columns: ["stage_id"]
            isOneToOne: false
            referencedRelation: "stages"
            referencedColumns: ["id"]
          },
        ]
      }
      stages: {
        Row: {
          assigned_to: string | null
          awaiting_client_flag: boolean
          clock_action: string | null
          completed_at: string | null
          created_at: string
          due_date: string | null
          id: string
          is_skippable: boolean
          notes: string | null
          project_id: string
          skip_reason: string | null
          skipped_at: string | null
          stage_code: string | null
          stage_name: string
          stage_order: number
          started_at: string | null
          status: Database["public"]["Enums"]["stage_status"]
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          awaiting_client_flag?: boolean
          clock_action?: string | null
          completed_at?: string | null
          created_at?: string
          due_date?: string | null
          id?: string
          is_skippable?: boolean
          notes?: string | null
          project_id: string
          skip_reason?: string | null
          skipped_at?: string | null
          stage_code?: string | null
          stage_name: string
          stage_order: number
          started_at?: string | null
          status?: Database["public"]["Enums"]["stage_status"]
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          awaiting_client_flag?: boolean
          clock_action?: string | null
          completed_at?: string | null
          created_at?: string
          due_date?: string | null
          id?: string
          is_skippable?: boolean
          notes?: string | null
          project_id?: string
          skip_reason?: string | null
          skipped_at?: string | null
          stage_code?: string | null
          stage_name?: string
          stage_order?: number
          started_at?: string | null
          status?: Database["public"]["Enums"]["stage_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stages_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stages_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      whatsapp_log: {
        Row: {
          bsp: string | null
          created_at: string | null
          id: string
          params: string[] | null
          phone: string
          ref_id: string | null
          response: Json | null
          status: string | null
          template: string
        }
        Insert: {
          bsp?: string | null
          created_at?: string | null
          id?: string
          params?: string[] | null
          phone: string
          ref_id?: string | null
          response?: Json | null
          status?: string | null
          template: string
        }
        Update: {
          bsp?: string | null
          created_at?: string | null
          id?: string
          params?: string[] | null
          phone?: string
          ref_id?: string | null
          response?: Json | null
          status?: string | null
          template?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      approve_block_request: {
        Args: { p_approved: boolean; p_note?: string; p_request_id: string }
        Returns: undefined
      }
      auth_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      cancel_project_transfer: {
        Args: { p_transfer_id: string }
        Returns: undefined
      }
      fn_can_assign: { Args: never; Returns: boolean }
      fn_can_edit_clients: { Args: never; Returns: boolean }
      fn_can_view_all_projects: { Args: never; Returns: boolean }
      has_role: {
        Args: { roles: Database["public"]["Enums"]["user_role"][] }
        Returns: boolean
      }
      initiate_project_transfer: {
        Args: { p_project_id: string; p_reason?: string; p_to_user: string }
        Returns: string
      }
      respond_project_transfer: {
        Args: { p_accept: boolean; p_transfer_id: string }
        Returns: string
      }
      reveal_fssai_credential: {
        Args: { p_license_id: string; p_reason?: string }
        Returns: string
      }
      store_fssai_credential: {
        Args: {
          p_license_id: string
          p_password: string
          p_reason?: string
          p_username: string
        }
        Returns: undefined
      }
      unblock_project: { Args: { p_project_id: string }; Returns: undefined }
    }
    Enums: {
      block_type:
        | "document_pending"
        | "client_unresponsive"
        | "authority_delay"
        | "payment_pending"
        | "internal_review"
        | "other"
      client_document_category: "gst" | "pan" | "fssai" | "other"
      clock_type: "employee" | "client" | "authority"
      document_type:
        | "client_upload"
        | "tps_prepared"
        | "authority_issued"
        | "soi"
        | "invoice"
        | "other"
      notification_type:
        | "stage_overdue"
        | "expiry_warning"
        | "block_request"
        | "block_approved"
        | "payment_overdue"
        | "query_received"
        | "license_expiring"
        | "project_assigned"
      payment_status: "pending" | "partial" | "paid" | "overdue" | "refunded"
      project_status:
        | "active"
        | "on_hold"
        | "completed"
        | "cancelled"
        | "archived"
      project_transfer_status: "pending" | "accepted" | "rejected" | "cancelled"
      query_type:
        | "deficiency_letter"
        | "additional_info"
        | "inspection_notice"
        | "show_cause"
        | "other"
      stage_status:
        | "pending"
        | "in_progress"
        | "blocked"
        | "completed"
        | "skipped"
      user_role:
        | "super_admin"
        | "director"
        | "manager"
        | "executive"
        | "accounts"
        | "hr"
        | "auditor"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      block_type: [
        "document_pending",
        "client_unresponsive",
        "authority_delay",
        "payment_pending",
        "internal_review",
        "other",
      ],
      client_document_category: ["gst", "pan", "fssai", "other"],
      clock_type: ["employee", "client", "authority"],
      document_type: [
        "client_upload",
        "tps_prepared",
        "authority_issued",
        "soi",
        "invoice",
        "other",
      ],
      notification_type: [
        "stage_overdue",
        "expiry_warning",
        "block_request",
        "block_approved",
        "payment_overdue",
        "query_received",
        "license_expiring",
        "project_assigned",
      ],
      payment_status: ["pending", "partial", "paid", "overdue", "refunded"],
      project_status: [
        "active",
        "on_hold",
        "completed",
        "cancelled",
        "archived",
      ],
      project_transfer_status: ["pending", "accepted", "rejected", "cancelled"],
      query_type: [
        "deficiency_letter",
        "additional_info",
        "inspection_notice",
        "show_cause",
        "other",
      ],
      stage_status: [
        "pending",
        "in_progress",
        "blocked",
        "completed",
        "skipped",
      ],
      user_role: [
        "super_admin",
        "director",
        "manager",
        "executive",
        "accounts",
        "hr",
        "auditor",
      ],
    },
  },
} as const
