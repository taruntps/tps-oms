export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: { PostgrestVersion: "14.5" }
  public: {
    Tables: {
      audit_log: {
        Row: { action: string; created_at: string; id: string; ip_address: string | null; new_data: Json | null; old_data: Json | null; record_id: string | null; table_name: string | null; user_id: string | null }
        Insert: { action: string; created_at?: string; id?: string; ip_address?: string | null; new_data?: Json | null; old_data?: Json | null; record_id?: string | null; table_name?: string | null; user_id?: string | null }
        Update: { action?: string; created_at?: string; id?: string; ip_address?: string | null; new_data?: Json | null; old_data?: Json | null; record_id?: string | null; table_name?: string | null; user_id?: string | null }
        Relationships: [{ foreignKeyName: "audit_log_user_id_fkey"; columns: ["user_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }]
      }
      block_requests: {
        Row: { approved: boolean | null; block_type: Database["public"]["Enums"]["block_type"]; id: string; project_id: string; reason: string; rejection_note: string | null; requested_at: string; requested_by: string; reviewed_at: string | null; reviewed_by: string | null }
        Insert: { approved?: boolean | null; block_type: Database["public"]["Enums"]["block_type"]; id?: string; project_id: string; reason: string; rejection_note?: string | null; requested_at?: string; requested_by: string; reviewed_at?: string | null; reviewed_by?: string | null }
        Update: { approved?: boolean | null; block_type?: Database["public"]["Enums"]["block_type"]; id?: string; project_id?: string; reason?: string; rejection_note?: string | null; requested_at?: string; requested_by?: string; reviewed_at?: string | null; reviewed_by?: string | null }
        Relationships: [{ foreignKeyName: "block_requests_project_id_fkey"; columns: ["project_id"]; isOneToOne: false; referencedRelation: "projects"; referencedColumns: ["id"] }, { foreignKeyName: "block_requests_requested_by_fkey"; columns: ["requested_by"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }, { foreignKeyName: "block_requests_reviewed_by_fkey"; columns: ["reviewed_by"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }]
      }
      clients: {
        Row: { address: string | null; city: string | null; company_name: string; contact_email: string | null; contact_person: string; contact_phone: string; created_at: string; created_by: string | null; fssai_central_ref: string | null; gstin: string | null; id: string; is_active: boolean; notes: string | null; pan: string | null; state: string; trade_name: string | null; updated_at: string }
        Insert: { address?: string | null; city?: string | null; company_name: string; contact_email?: string | null; contact_person: string; contact_phone: string; created_at?: string; created_by?: string | null; fssai_central_ref?: string | null; gstin?: string | null; id?: string; is_active?: boolean; notes?: string | null; pan?: string | null; state?: string; trade_name?: string | null; updated_at?: string }
        Update: { address?: string | null; city?: string | null; company_name?: string; contact_email?: string | null; contact_person?: string; contact_phone?: string; created_at?: string; created_by?: string | null; fssai_central_ref?: string | null; gstin?: string | null; id?: string; is_active?: boolean; notes?: string | null; pan?: string | null; state?: string; trade_name?: string | null; updated_at?: string }
        Relationships: [{ foreignKeyName: "clients_created_by_fkey"; columns: ["created_by"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }]
      }
      credential_access_log: {
        Row: { accessed_at: string; accessed_by: string; id: string; ip_address: string | null; license_id: string; reason: string | null }
        Insert: { accessed_at?: string; accessed_by: string; id?: string; ip_address?: string | null; license_id: string; reason?: string | null }
        Update: { accessed_at?: string; accessed_by?: string; id?: string; ip_address?: string | null; license_id?: string; reason?: string | null }
        Relationships: [{ foreignKeyName: "credential_access_log_accessed_by_fkey"; columns: ["accessed_by"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }, { foreignKeyName: "credential_access_log_license_id_fkey"; columns: ["license_id"]; isOneToOne: false; referencedRelation: "licenses"; referencedColumns: ["id"] }]
      }
      documents: {
        Row: { client_id: string; created_at: string; doc_type: Database["public"]["Enums"]["document_type"]; file_name: string; file_size_bytes: number | null; id: string; is_latest: boolean; mime_type: string | null; project_id: string; storage_path: string; uploaded_by: string | null; version: number }
        Insert: { client_id: string; created_at?: string; doc_type: Database["public"]["Enums"]["document_type"]; file_name: string; file_size_bytes?: number | null; id?: string; is_latest?: boolean; mime_type?: string | null; project_id: string; storage_path: string; uploaded_by?: string | null; version?: number }
        Update: { client_id?: string; created_at?: string; doc_type?: Database["public"]["Enums"]["document_type"]; file_name?: string; file_size_bytes?: number | null; id?: string; is_latest?: boolean; mime_type?: string | null; project_id?: string; storage_path?: string; uploaded_by?: string | null; version?: number }
        Relationships: [{ foreignKeyName: "documents_client_id_fkey"; columns: ["client_id"]; isOneToOne: false; referencedRelation: "clients"; referencedColumns: ["id"] }, { foreignKeyName: "documents_project_id_fkey"; columns: ["project_id"]; isOneToOne: false; referencedRelation: "projects"; referencedColumns: ["id"] }, { foreignKeyName: "documents_uploaded_by_fkey"; columns: ["uploaded_by"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }]
      }
      authority_queries: {
        Row: { created_at: string; created_by: string | null; description: string | null; id: string; project_id: string; query_type: Database["public"]["Enums"]["query_type"]; received_date: string; responded_at: string | null; responded_by: string | null; response_due: string | null; response_note: string | null; subject: string }
        Insert: { created_at?: string; created_by?: string | null; description?: string | null; id?: string; project_id: string; query_type: Database["public"]["Enums"]["query_type"]; received_date: string; responded_at?: string | null; responded_by?: string | null; response_due?: string | null; response_note?: string | null; subject: string }
        Update: { created_at?: string; created_by?: string | null; description?: string | null; id?: string; project_id?: string; query_type?: Database["public"]["Enums"]["query_type"]; received_date?: string; responded_at?: string | null; responded_by?: string | null; response_due?: string | null; response_note?: string | null; subject?: string }
        Relationships: [{ foreignKeyName: "authority_queries_created_by_fkey"; columns: ["created_by"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }, { foreignKeyName: "authority_queries_project_id_fkey"; columns: ["project_id"]; isOneToOne: false; referencedRelation: "projects"; referencedColumns: ["id"] }, { foreignKeyName: "authority_queries_responded_by_fkey"; columns: ["responded_by"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }]
      }
      knowledge_base: {
        Row: { category: string; content: string; created_at: string; created_by: string | null; id: string; is_published: boolean; tags: string[] | null; title: string; updated_at: string }
        Insert: { category: string; content: string; created_at?: string; created_by?: string | null; id?: string; is_published?: boolean; tags?: string[] | null; title: string; updated_at?: string }
        Update: { category?: string; content?: string; created_at?: string; created_by?: string | null; id?: string; is_published?: boolean; tags?: string[] | null; title?: string; updated_at?: string }
        Relationships: [{ foreignKeyName: "knowledge_base_created_by_fkey"; columns: ["created_by"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }]
      }
      licenses: {
        Row: { authority_office: string | null; category: string | null; client_id: string; created_at: string; created_by: string | null; credential_username: string | null; expiry_date: string | null; id: string; is_active: boolean; issue_date: string | null; last_credential_accessed_at: string | null; last_credential_accessed_by: string | null; license_number: string | null; license_type: string; notes: string | null; state_code: string | null; updated_at: string; vault_credential_id: string | null }
        Insert: { authority_office?: string | null; category?: string | null; client_id: string; created_at?: string; created_by?: string | null; credential_username?: string | null; expiry_date?: string | null; id?: string; is_active?: boolean; issue_date?: string | null; last_credential_accessed_at?: string | null; last_credential_accessed_by?: string | null; license_number?: string | null; license_type: string; notes?: string | null; state_code?: string | null; updated_at?: string; vault_credential_id?: string | null }
        Update: { authority_office?: string | null; category?: string | null; client_id?: string; created_at?: string; created_by?: string | null; credential_username?: string | null; expiry_date?: string | null; id?: string; is_active?: boolean; issue_date?: string | null; last_credential_accessed_at?: string | null; last_credential_accessed_by?: string | null; license_number?: string | null; license_type?: string; notes?: string | null; state_code?: string | null; updated_at?: string; vault_credential_id?: string | null }
        Relationships: [{ foreignKeyName: "licenses_client_id_fkey"; columns: ["client_id"]; isOneToOne: false; referencedRelation: "clients"; referencedColumns: ["id"] }, { foreignKeyName: "licenses_created_by_fkey"; columns: ["created_by"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }, { foreignKeyName: "licenses_last_credential_accessed_by_fkey"; columns: ["last_credential_accessed_by"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }]
      }
      notifications: {
        Row: { body: string | null; created_at: string; id: string; is_read: boolean; reference_id: string | null; reference_type: string | null; title: string; type: Database["public"]["Enums"]["notification_type"]; user_id: string; whatsapp_sent_at: string | null }
        Insert: { body?: string | null; created_at?: string; id?: string; is_read?: boolean; reference_id?: string | null; reference_type?: string | null; title: string; type: Database["public"]["Enums"]["notification_type"]; user_id: string; whatsapp_sent_at?: string | null }
        Update: { body?: string | null; created_at?: string; id?: string; is_read?: boolean; reference_id?: string | null; reference_type?: string | null; title?: string; type?: Database["public"]["Enums"]["notification_type"]; user_id?: string; whatsapp_sent_at?: string | null }
        Relationships: [{ foreignKeyName: "notifications_user_id_fkey"; columns: ["user_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }]
      }
      app_settings: {
        Row: { key: string; value: string | null; description: string | null; is_secret: boolean; updated_at: string; updated_by: string | null }
        Insert: { key: string; value?: string | null; description?: string | null; is_secret?: boolean; updated_at?: string; updated_by?: string | null }
        Update: { key?: string; value?: string | null; description?: string | null; is_secret?: boolean; updated_at?: string; updated_by?: string | null }
        Relationships: [{ foreignKeyName: "app_settings_updated_by_fkey"; columns: ["updated_by"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }]
      }
      whatsapp_log: {
        Row: { id: string; phone: string; template: string; params: string[] | null; ref_id: string | null; bsp: string | null; status: string | null; response: Json | null; created_at: string }
        Insert: { id?: string; phone: string; template: string; params?: string[] | null; ref_id?: string | null; bsp?: string | null; status?: string | null; response?: Json | null; created_at?: string }
        Update: { id?: string; phone?: string; template?: string; params?: string[] | null; ref_id?: string | null; bsp?: string | null; status?: string | null; response?: Json | null; created_at?: string }
        Relationships: []
      }
      payments: {
        Row: { amount: number; client_id: string; created_at: string; id: string; invoice_no: string | null; notes: string | null; payment_date: string; payment_mode: string; project_id: string; recorded_by: string | null; reference_no: string | null }
        Insert: { amount: number; client_id: string; created_at?: string; id?: string; invoice_no?: string | null; notes?: string | null; payment_date: string; payment_mode: string; project_id: string; recorded_by?: string | null; reference_no?: string | null }
        Update: { amount?: number; client_id?: string; created_at?: string; id?: string; invoice_no?: string | null; notes?: string | null; payment_date?: string; payment_mode?: string; project_id?: string; recorded_by?: string | null; reference_no?: string | null }
        Relationships: [{ foreignKeyName: "payments_client_id_fkey"; columns: ["client_id"]; isOneToOne: false; referencedRelation: "clients"; referencedColumns: ["id"] }, { foreignKeyName: "payments_project_id_fkey"; columns: ["project_id"]; isOneToOne: false; referencedRelation: "projects"; referencedColumns: ["id"] }, { foreignKeyName: "payments_recorded_by_fkey"; columns: ["recorded_by"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }]
      }
      performance_reports: {
        Row: { avg_closure_days: number | null; created_at: string; generated_by: string | null; id: string; on_time_rate: number | null; projects_closed: number; report_data: Json | null; report_period: string; revenue_paise: number; user_id: string | null }
        Insert: { avg_closure_days?: number | null; created_at?: string; generated_by?: string | null; id?: string; on_time_rate?: number | null; projects_closed?: number; report_data?: Json | null; report_period: string; revenue_paise?: number; user_id?: string | null }
        Update: { avg_closure_days?: number | null; created_at?: string; generated_by?: string | null; id?: string; on_time_rate?: number | null; projects_closed?: number; report_data?: Json | null; report_period?: string; revenue_paise?: number; user_id?: string | null }
        Relationships: [{ foreignKeyName: "performance_reports_generated_by_fkey"; columns: ["generated_by"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }, { foreignKeyName: "performance_reports_user_id_fkey"; columns: ["user_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }]
      }
      profiles: {
        Row: { avatar_url: string | null; created_at: string; email: string; id: string; is_active: boolean; name: string; phone: string | null; whatsapp_number: string | null; role: Database["public"]["Enums"]["user_role"]; updated_at: string }
        Insert: { avatar_url?: string | null; created_at?: string; email: string; id: string; is_active?: boolean; name: string; phone?: string | null; whatsapp_number?: string | null; role?: Database["public"]["Enums"]["user_role"]; updated_at?: string }
        Update: { avatar_url?: string | null; created_at?: string; email?: string; id?: string; is_active?: boolean; name?: string; phone?: string | null; whatsapp_number?: string | null; role?: Database["public"]["Enums"]["user_role"]; updated_at?: string }
        Relationships: []
      }
      projects: {
        Row: { active_clock: Database["public"]["Enums"]["clock_type"]; assigned_to: string | null; block_expires_at: string | null; block_reason: string | null; block_started_at: string | null; block_type: Database["public"]["Enums"]["block_type"] | null; client_id: string; clock_switched_at: string; completed_date: string | null; created_at: string; created_by: string | null; id: string; is_blocked: boolean; license_id: string | null; manager_id: string | null; notes: string | null; paid_amount: number; payment_status: Database["public"]["Enums"]["payment_status"]; project_code: string; project_name: string; quoted_amount: number; service_type: string; start_date: string; status: Database["public"]["Enums"]["project_status"]; target_date: string | null; updated_at: string }
        Insert: { active_clock?: Database["public"]["Enums"]["clock_type"]; assigned_to?: string | null; block_expires_at?: string | null; block_reason?: string | null; block_started_at?: string | null; block_type?: Database["public"]["Enums"]["block_type"] | null; client_id: string; clock_switched_at?: string; completed_date?: string | null; created_at?: string; created_by?: string | null; id?: string; is_blocked?: boolean; license_id?: string | null; manager_id?: string | null; notes?: string | null; paid_amount?: number; payment_status?: Database["public"]["Enums"]["payment_status"]; project_code?: string; project_name: string; quoted_amount?: number; service_type: string; start_date?: string; status?: Database["public"]["Enums"]["project_status"]; target_date?: string | null; updated_at?: string }
        Update: { active_clock?: Database["public"]["Enums"]["clock_type"]; assigned_to?: string | null; block_expires_at?: string | null; block_reason?: string | null; block_started_at?: string | null; block_type?: Database["public"]["Enums"]["block_type"] | null; client_id?: string; clock_switched_at?: string; completed_date?: string | null; created_at?: string; created_by?: string | null; id?: string; is_blocked?: boolean; license_id?: string | null; manager_id?: string | null; notes?: string | null; paid_amount?: number; payment_status?: Database["public"]["Enums"]["payment_status"]; project_code?: string; project_name?: string; quoted_amount?: number; service_type?: string; start_date?: string; status?: Database["public"]["Enums"]["project_status"]; target_date?: string | null; updated_at?: string }
        Relationships: [{ foreignKeyName: "projects_assigned_to_fkey"; columns: ["assigned_to"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }, { foreignKeyName: "projects_client_id_fkey"; columns: ["client_id"]; isOneToOne: false; referencedRelation: "clients"; referencedColumns: ["id"] }, { foreignKeyName: "projects_created_by_fkey"; columns: ["created_by"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }, { foreignKeyName: "projects_license_id_fkey"; columns: ["license_id"]; isOneToOne: false; referencedRelation: "licenses"; referencedColumns: ["id"] }, { foreignKeyName: "projects_manager_id_fkey"; columns: ["manager_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }]
      }
      soi_archive: {
        Row: { client_id: string; created_at: string; created_by: string | null; description: string | null; id: string; product_category: string | null; project_id: string | null; soi_date: string; storage_path: string | null }
        Insert: { client_id: string; created_at?: string; created_by?: string | null; description?: string | null; id?: string; product_category?: string | null; project_id?: string | null; soi_date: string; storage_path?: string | null }
        Update: { client_id?: string; created_at?: string; created_by?: string | null; description?: string | null; id?: string; product_category?: string | null; project_id?: string | null; soi_date?: string; storage_path?: string | null }
        Relationships: [{ foreignKeyName: "soi_archive_client_id_fkey"; columns: ["client_id"]; isOneToOne: false; referencedRelation: "clients"; referencedColumns: ["id"] }, { foreignKeyName: "soi_archive_created_by_fkey"; columns: ["created_by"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }, { foreignKeyName: "soi_archive_project_id_fkey"; columns: ["project_id"]; isOneToOne: false; referencedRelation: "projects"; referencedColumns: ["id"] }]
      }
      stage_templates: {
        Row: { default_days: number | null; id: string; service_type: string; stage_code: string; stage_name: string; stage_order: number }
        Insert: { default_days?: number | null; id?: string; service_type: string; stage_code: string; stage_name: string; stage_order: number }
        Update: { default_days?: number | null; id?: string; service_type?: string; stage_code?: string; stage_name?: string; stage_order?: number }
        Relationships: []
      }
      stage_timeline: {
        Row: { clock_type: Database["public"]["Enums"]["clock_type"]; created_by: string | null; duration_min: number | null; ended_at: string | null; id: string; note: string | null; project_id: string; stage_id: string | null; started_at: string }
        Insert: { clock_type: Database["public"]["Enums"]["clock_type"]; created_by?: string | null; duration_min?: number | null; ended_at?: string | null; id?: string; note?: string | null; project_id: string; stage_id?: string | null; started_at?: string }
        Update: { clock_type?: Database["public"]["Enums"]["clock_type"]; created_by?: string | null; duration_min?: number | null; ended_at?: string | null; id?: string; note?: string | null; project_id?: string; stage_id?: string | null; started_at?: string }
        Relationships: [{ foreignKeyName: "stage_timeline_created_by_fkey"; columns: ["created_by"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }, { foreignKeyName: "stage_timeline_project_id_fkey"; columns: ["project_id"]; isOneToOne: false; referencedRelation: "projects"; referencedColumns: ["id"] }, { foreignKeyName: "stage_timeline_stage_id_fkey"; columns: ["stage_id"]; isOneToOne: false; referencedRelation: "stages"; referencedColumns: ["id"] }]
      }
      stages: {
        Row: { assigned_to: string | null; completed_at: string | null; created_at: string; due_date: string | null; id: string; notes: string | null; project_id: string; stage_code: string | null; stage_name: string; stage_order: number; started_at: string | null; status: Database["public"]["Enums"]["stage_status"]; updated_at: string }
        Insert: { assigned_to?: string | null; completed_at?: string | null; created_at?: string; due_date?: string | null; id?: string; notes?: string | null; project_id: string; stage_code?: string | null; stage_name: string; stage_order: number; started_at?: string | null; status?: Database["public"]["Enums"]["stage_status"]; updated_at?: string }
        Update: { assigned_to?: string | null; completed_at?: string | null; created_at?: string; due_date?: string | null; id?: string; notes?: string | null; project_id?: string; stage_code?: string | null; stage_name?: string; stage_order?: number; started_at?: string | null; status?: Database["public"]["Enums"]["stage_status"]; updated_at?: string }
        Relationships: [{ foreignKeyName: "stages_assigned_to_fkey"; columns: ["assigned_to"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] }, { foreignKeyName: "stages_project_id_fkey"; columns: ["project_id"]; isOneToOne: false; referencedRelation: "projects"; referencedColumns: ["id"] }]
      }
    }
    Views: { [_ in never]: never }
    Functions: {
      approve_block_request: { Args: { p_approved: boolean; p_note?: string; p_request_id: string }; Returns: undefined }
      auth_role: { Args: never; Returns: Database["public"]["Enums"]["user_role"] }
      has_role: { Args: { roles: Database["public"]["Enums"]["user_role"][] }; Returns: boolean }
      reveal_fssai_credential: { Args: { p_license_id: string; p_reason?: string }; Returns: string }
      store_fssai_credential: { Args: { p_license_id: string; p_password: string; p_reason?: string; p_username: string }; Returns: undefined }
      unblock_project: { Args: { p_project_id: string }; Returns: undefined }
    }
    Enums: {
      block_type: "document_pending" | "client_unresponsive" | "authority_delay" | "payment_pending" | "internal_review" | "other"
      clock_type: "employee" | "client" | "authority"
      document_type: "client_upload" | "tps_prepared" | "authority_issued" | "soi" | "invoice" | "other"
      notification_type: "stage_overdue" | "expiry_warning" | "block_request" | "block_approved" | "payment_overdue" | "query_received" | "license_expiring" | "project_assigned"
      payment_status: "pending" | "partial" | "paid" | "overdue" | "refunded"
      project_status: "active" | "on_hold" | "completed" | "cancelled" | "archived"
      query_type: "deficiency_letter" | "additional_info" | "inspection_notice" | "show_cause" | "other"
      stage_status: "pending" | "in_progress" | "blocked" | "completed" | "skipped"
      user_role: "super_admin" | "director" | "manager" | "executive" | "accounts" | "hr" | "auditor"
    }
    CompositeTypes: { [_ in never]: never }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">
type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<T extends keyof DefaultSchema["Tables"]> = DefaultSchema["Tables"][T]["Row"]
export type TablesInsert<T extends keyof DefaultSchema["Tables"]> = DefaultSchema["Tables"][T]["Insert"]
export type TablesUpdate<T extends keyof DefaultSchema["Tables"]> = DefaultSchema["Tables"][T]["Update"]
export type Enums<T extends keyof DefaultSchema["Enums"]> = DefaultSchema["Enums"][T]

export const Constants = {
  public: {
    Enums: {
      block_type: ["document_pending","client_unresponsive","authority_delay","payment_pending","internal_review","other"],
      clock_type: ["employee","client","authority"],
      document_type: ["client_upload","tps_prepared","authority_issued","soi","invoice","other"],
      notification_type: ["stage_overdue","expiry_warning","block_request","block_approved","payment_overdue","query_received","license_expiring","project_assigned"],
      payment_status: ["pending","partial","paid","overdue","refunded"],
      project_status: ["active","on_hold","completed","cancelled","archived"],
      query_type: ["deficiency_letter","additional_info","inspection_notice","show_cause","other"],
      stage_status: ["pending","in_progress","blocked","completed","skipped"],
      user_role: ["super_admin","director","manager","executive","accounts","hr","auditor"],
    },
  },
} as const
