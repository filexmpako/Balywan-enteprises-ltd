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
      agent_targets: {
        Row: {
          achieved_value: number
          achievement_percentage: number
          extras: Json
          id: string
          imported_at: string
          location: string | null
          matched_till_msisdn: string | null
          monthly_target: number
          owner_id: string | null
          owner_name: string
          period: string
          raw_msisdn: string | null
        }
        Insert: {
          achieved_value?: number
          achievement_percentage?: number
          extras?: Json
          id?: string
          imported_at?: string
          location?: string | null
          matched_till_msisdn?: string | null
          monthly_target?: number
          owner_id?: string | null
          owner_name: string
          period: string
          raw_msisdn?: string | null
        }
        Update: {
          achieved_value?: number
          achievement_percentage?: number
          extras?: Json
          id?: string
          imported_at?: string
          location?: string | null
          matched_till_msisdn?: string | null
          monthly_target?: number
          owner_id?: string | null
          owner_name?: string
          period?: string
          raw_msisdn?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agent_targets_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "owners"
            referencedColumns: ["owner_id"]
          },
        ]
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action_taken: string
          actor_name: string
          impacted_entity: string
          ip_address: string
          log_id: number
          logged_at: string
          meta_details: Json | null
          new_value: Json | null
          old_value: Json | null
          user_id: string | null
        }
        Insert: {
          action_taken: string
          actor_name?: string
          impacted_entity?: string
          ip_address?: string
          log_id?: never
          logged_at?: string
          meta_details?: Json | null
          new_value?: Json | null
          old_value?: Json | null
          user_id?: string | null
        }
        Update: {
          action_taken?: string
          actor_name?: string
          impacted_entity?: string
          ip_address?: string
          log_id?: never
          logged_at?: string
          meta_details?: Json | null
          new_value?: Json | null
          old_value?: Json | null
          user_id?: string | null
        }
        Relationships: []
      }
      base_wakala_index: {
        Row: {
          alt_msisdn: string | null
          code: string | null
          creation_date: string | null
          district: string | null
          extras: Json
          full_name: string | null
          imported_at: string
          msisdn: string
          owner_id: string | null
          owner_name: string | null
          site_id: string | null
          site_ward: string | null
          wakala_code: string | null
          wakala_name: string | null
        }
        Insert: {
          alt_msisdn?: string | null
          code?: string | null
          creation_date?: string | null
          district?: string | null
          extras?: Json
          full_name?: string | null
          imported_at?: string
          msisdn: string
          owner_id?: string | null
          owner_name?: string | null
          site_id?: string | null
          site_ward?: string | null
          wakala_code?: string | null
          wakala_name?: string | null
        }
        Update: {
          alt_msisdn?: string | null
          code?: string | null
          creation_date?: string | null
          district?: string | null
          extras?: Json
          full_name?: string | null
          imported_at?: string
          msisdn?: string
          owner_id?: string | null
          owner_name?: string | null
          site_id?: string | null
          site_ward?: string | null
          wakala_code?: string | null
          wakala_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "base_wakala_index_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "owners"
            referencedColumns: ["owner_id"]
          },
        ]
      }
      classification_audit_records: {
        Row: {
          amount: number
          branch_msisdn: string | null
          bucket: string
          created_at: string
          dest_msisdn: string | null
          details: Json
          id: number
          matched_via: string | null
          owner_id: string | null
          owner_name: string | null
          reporting_period: string
          transaction_ref: string | null
          transaction_time: string | null
          upload_id: string | null
        }
        Insert: {
          amount?: number
          branch_msisdn?: string | null
          bucket: string
          created_at?: string
          dest_msisdn?: string | null
          details?: Json
          id?: never
          matched_via?: string | null
          owner_id?: string | null
          owner_name?: string | null
          reporting_period: string
          transaction_ref?: string | null
          transaction_time?: string | null
          upload_id?: string | null
        }
        Update: {
          amount?: number
          branch_msisdn?: string | null
          bucket?: string
          created_at?: string
          dest_msisdn?: string | null
          details?: Json
          id?: never
          matched_via?: string | null
          owner_id?: string | null
          owner_name?: string | null
          reporting_period?: string
          transaction_ref?: string | null
          transaction_time?: string | null
          upload_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "classification_audit_records_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: false
            referencedRelation: "file_upload_archives"
            referencedColumns: ["upload_id"]
          },
        ]
      }
      company_performance_snapshots: {
        Row: {
          active_owners: number
          active_wakalas: number
          attainment_rate: number
          company_snap_id: number
          created_at: string
          metrics: Json
          period_type: string
          reporting_period: string
          total_target: number
          total_volume: number
        }
        Insert: {
          active_owners?: number
          active_wakalas?: number
          attainment_rate?: number
          company_snap_id?: never
          created_at?: string
          metrics?: Json
          period_type: string
          reporting_period: string
          total_target?: number
          total_volume?: number
        }
        Update: {
          active_owners?: number
          active_wakalas?: number
          attainment_rate?: number
          company_snap_id?: never
          created_at?: string
          metrics?: Json
          period_type?: string
          reporting_period?: string
          total_target?: number
          total_volume?: number
        }
        Relationships: []
      }
      daily_kpi_snapshots: {
        Row: {
          active_wakalas: number
          attainment_rate: number
          created_at: string
          product_sellers: number
          reporting_date: string
          snapshot_id: number
          total_transactions: number
          total_volume: number
        }
        Insert: {
          active_wakalas?: number
          attainment_rate?: number
          created_at?: string
          product_sellers?: number
          reporting_date: string
          snapshot_id?: never
          total_transactions?: number
          total_volume?: number
        }
        Update: {
          active_wakalas?: number
          attainment_rate?: number
          created_at?: string
          product_sellers?: number
          reporting_date?: string
          snapshot_id?: never
          total_transactions?: number
          total_volume?: number
        }
        Relationships: []
      }
      daily_transaction_records: {
        Row: {
          amount: number
          attributed_owner_id: string | null
          attributed_owner_name: string | null
          branch_msisdn: string
          bucket: string | null
          cash_in: number
          cash_out: number
          commission: number
          created_at: string
          dest_msisdn: string | null
          is_active: boolean
          matched_via: string | null
          owner_id: string | null
          raw: Json
          record_id: number
          reporting_date: string
          reporting_period: string
          transaction_ref: string
          upload_id: string | null
          wakala_id: string | null
        }
        Insert: {
          amount?: number
          attributed_owner_id?: string | null
          attributed_owner_name?: string | null
          branch_msisdn: string
          bucket?: string | null
          cash_in?: number
          cash_out?: number
          commission?: number
          created_at?: string
          dest_msisdn?: string | null
          is_active?: boolean
          matched_via?: string | null
          owner_id?: string | null
          raw?: Json
          record_id?: never
          reporting_date: string
          reporting_period: string
          transaction_ref: string
          upload_id?: string | null
          wakala_id?: string | null
        }
        Update: {
          amount?: number
          attributed_owner_id?: string | null
          attributed_owner_name?: string | null
          branch_msisdn?: string
          bucket?: string | null
          cash_in?: number
          cash_out?: number
          commission?: number
          created_at?: string
          dest_msisdn?: string | null
          is_active?: boolean
          matched_via?: string | null
          owner_id?: string | null
          raw?: Json
          record_id?: never
          reporting_date?: string
          reporting_period?: string
          transaction_ref?: string
          upload_id?: string | null
          wakala_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_transaction_records_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "owners"
            referencedColumns: ["owner_id"]
          },
          {
            foreignKeyName: "daily_transaction_records_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: false
            referencedRelation: "file_upload_archives"
            referencedColumns: ["upload_id"]
          },
        ]
      }
      file_upload_archives: {
        Row: {
          created_at: string
          file_hash: string | null
          file_location: string | null
          file_name: string
          file_size: number
          import_summary: Json | null
          processing_time_ms: number | null
          report_type: string
          reporting_period: string | null
          status: string
          target_date: string | null
          upload_id: string
          uploaded_by: string | null
          uploaded_by_name: string
          validation_status: string
        }
        Insert: {
          created_at?: string
          file_hash?: string | null
          file_location?: string | null
          file_name: string
          file_size?: number
          import_summary?: Json | null
          processing_time_ms?: number | null
          report_type: string
          reporting_period?: string | null
          status?: string
          target_date?: string | null
          upload_id: string
          uploaded_by?: string | null
          uploaded_by_name?: string
          validation_status?: string
        }
        Update: {
          created_at?: string
          file_hash?: string | null
          file_location?: string | null
          file_name?: string
          file_size?: number
          import_summary?: Json | null
          processing_time_ms?: number | null
          report_type?: string
          reporting_period?: string | null
          status?: string
          target_date?: string | null
          upload_id?: string
          uploaded_by?: string | null
          uploaded_by_name?: string
          validation_status?: string
        }
        Relationships: []
      }
      float_requests: {
        Row: {
          confirmed_at: string | null
          confirmed_by_manager_id: string | null
          confirmed_by_manager_name: string | null
          extras: Json
          id: string
          loan_id: string | null
          owner_id: string
          rejected_at: string | null
          rejected_by_manager_id: string | null
          rejected_by_manager_name: string | null
          requested_amount: number
          requested_at: string
          returned_at: string | null
          shortfall_reason: string | null
          status: string
        }
        Insert: {
          confirmed_at?: string | null
          confirmed_by_manager_id?: string | null
          confirmed_by_manager_name?: string | null
          extras?: Json
          id: string
          loan_id?: string | null
          owner_id: string
          rejected_at?: string | null
          rejected_by_manager_id?: string | null
          rejected_by_manager_name?: string | null
          requested_amount: number
          requested_at?: string
          returned_at?: string | null
          shortfall_reason?: string | null
          status?: string
        }
        Update: {
          confirmed_at?: string | null
          confirmed_by_manager_id?: string | null
          confirmed_by_manager_name?: string | null
          extras?: Json
          id?: string
          loan_id?: string | null
          owner_id?: string
          rejected_at?: string | null
          rejected_by_manager_id?: string | null
          rejected_by_manager_name?: string | null
          requested_amount?: number
          requested_at?: string
          returned_at?: string | null
          shortfall_reason?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "float_requests_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "owners"
            referencedColumns: ["owner_id"]
          },
        ]
      }
      float_return_entries: {
        Row: {
          amount: number
          channel: string
          channel_other: string | null
          created_at: string
          extras: Json
          float_request_id: string
          id: string
          receipt_photo_id: string | null
        }
        Insert: {
          amount: number
          channel: string
          channel_other?: string | null
          created_at?: string
          extras?: Json
          float_request_id: string
          id: string
          receipt_photo_id?: string | null
        }
        Update: {
          amount?: number
          channel?: string
          channel_other?: string | null
          created_at?: string
          extras?: Json
          float_request_id?: string
          id?: string
          receipt_photo_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "float_return_entries_float_request_id_fkey"
            columns: ["float_request_id"]
            isOneToOne: false
            referencedRelation: "float_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      loan_records: {
        Row: {
          amount: number
          approved_by_manager_id: string | null
          approved_by_manager_name: string | null
          created_at: string
          extras: Json
          float_request_id: string | null
          id: string
          marked_paid_by_manager_id: string | null
          marked_paid_by_manager_name: string | null
          owner_id: string
          paid_at: string | null
          reason: string
          repaid_amount: number | null
          repayment_description: string | null
          repayment_submitted_at: string | null
          status: string
        }
        Insert: {
          amount: number
          approved_by_manager_id?: string | null
          approved_by_manager_name?: string | null
          created_at?: string
          extras?: Json
          float_request_id?: string | null
          id: string
          marked_paid_by_manager_id?: string | null
          marked_paid_by_manager_name?: string | null
          owner_id: string
          paid_at?: string | null
          reason?: string
          repaid_amount?: number | null
          repayment_description?: string | null
          repayment_submitted_at?: string | null
          status?: string
        }
        Update: {
          amount?: number
          approved_by_manager_id?: string | null
          approved_by_manager_name?: string | null
          created_at?: string
          extras?: Json
          float_request_id?: string | null
          id?: string
          marked_paid_by_manager_id?: string | null
          marked_paid_by_manager_name?: string | null
          owner_id?: string
          paid_at?: string | null
          reason?: string
          repaid_amount?: number | null
          repayment_description?: string | null
          repayment_submitted_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "loan_records_float_request_id_fkey"
            columns: ["float_request_id"]
            isOneToOne: false
            referencedRelation: "float_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_records_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "owners"
            referencedColumns: ["owner_id"]
          },
        ]
      }
      manual_owner_targets: {
        Row: {
          extras: Json
          id: string
          kpi1_base_target: number | null
          kpi1_iop_target: number | null
          kpi2_normal_percent: number | null
          kpi2_priority_percent: number | null
          owner_id: string
          period: string
          set_at: string
          set_by: string
        }
        Insert: {
          extras?: Json
          id?: string
          kpi1_base_target?: number | null
          kpi1_iop_target?: number | null
          kpi2_normal_percent?: number | null
          kpi2_priority_percent?: number | null
          owner_id: string
          period: string
          set_at?: string
          set_by?: string
        }
        Update: {
          extras?: Json
          id?: string
          kpi1_base_target?: number | null
          kpi1_iop_target?: number | null
          kpi2_normal_percent?: number | null
          kpi2_priority_percent?: number | null
          owner_id?: string
          period?: string
          set_at?: string
          set_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "manual_owner_targets_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "owners"
            referencedColumns: ["owner_id"]
          },
        ]
      }
      monthly_kpi_snapshots: {
        Row: {
          attainment_rate: number
          avg_active_wakalas: number
          created_at: string
          product_sellers: number
          reporting_month: string
          snapshot_id: number
          target_volume: number
          total_transactions: number
          total_volume: number
        }
        Insert: {
          attainment_rate?: number
          avg_active_wakalas?: number
          created_at?: string
          product_sellers?: number
          reporting_month: string
          snapshot_id?: never
          target_volume?: number
          total_transactions?: number
          total_volume?: number
        }
        Update: {
          attainment_rate?: number
          avg_active_wakalas?: number
          created_at?: string
          product_sellers?: number
          reporting_month?: string
          snapshot_id?: never
          target_volume?: number
          total_transactions?: number
          total_volume?: number
        }
        Relationships: []
      }
      monthly_kpi_targets: {
        Row: {
          active_stations: number
          comm_yield: number
          created_at: string
          owner_id: string
          reporting_month: string
          target_id: number
          uploaded_by: string | null
          volume_target: number
        }
        Insert: {
          active_stations?: number
          comm_yield?: number
          created_at?: string
          owner_id: string
          reporting_month: string
          target_id?: never
          uploaded_by?: string | null
          volume_target?: number
        }
        Update: {
          active_stations?: number
          comm_yield?: number
          created_at?: string
          owner_id?: string
          reporting_month?: string
          target_id?: never
          uploaded_by?: string | null
          volume_target?: number
        }
        Relationships: [
          {
            foreignKeyName: "monthly_kpi_targets_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "owners"
            referencedColumns: ["owner_id"]
          },
        ]
      }
      monthly_servicing_records: {
        Row: {
          created_at: string
          id: number
          msisdn: string
          owner_id: string | null
          owner_name: string | null
          raw: Json
          reporting_month: string
          servicing_txns: number
          servicing_val: number
          uploaded_by: string | null
          wakala_status: number | null
        }
        Insert: {
          created_at?: string
          id?: number
          msisdn: string
          owner_id?: string | null
          owner_name?: string | null
          raw?: Json
          reporting_month: string
          servicing_txns?: number
          servicing_val?: number
          uploaded_by?: string | null
          wakala_status?: number | null
        }
        Update: {
          created_at?: string
          id?: number
          msisdn?: string
          owner_id?: string | null
          owner_name?: string | null
          raw?: Json
          reporting_month?: string
          servicing_txns?: number
          servicing_val?: number
          uploaded_by?: string | null
          wakala_status?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "monthly_servicing_records_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "owners"
            referencedColumns: ["owner_id"]
          },
        ]
      }
      notifications: {
        Row: {
          alert_type: string
          created_at: string
          is_read: boolean
          message: string
          notification_id: number
          recipient_user_id: string
          title: string
        }
        Insert: {
          alert_type: string
          created_at?: string
          is_read?: boolean
          message?: string
          notification_id?: never
          recipient_user_id: string
          title: string
        }
        Update: {
          alert_type?: string
          created_at?: string
          is_read?: boolean
          message?: string
          notification_id?: never
          recipient_user_id?: string
          title?: string
        }
        Relationships: []
      }
      owner_performance_snapshots: {
        Row: {
          active_wakalas: number
          attainment_rate: number
          created_at: string
          owner_id: string
          owner_snap_id: number
          performance_status: string
          period_type: string
          product_sellers: number
          projected_actual: number
          projected_attainment: number
          rank_position: number | null
          remaining_target: number
          reporting_period: string
          volume_actual: number
          volume_target: number
        }
        Insert: {
          active_wakalas?: number
          attainment_rate?: number
          created_at?: string
          owner_id: string
          owner_snap_id?: never
          performance_status?: string
          period_type: string
          product_sellers?: number
          projected_actual?: number
          projected_attainment?: number
          rank_position?: number | null
          remaining_target?: number
          reporting_period: string
          volume_actual?: number
          volume_target?: number
        }
        Update: {
          active_wakalas?: number
          attainment_rate?: number
          created_at?: string
          owner_id?: string
          owner_snap_id?: never
          performance_status?: string
          period_type?: string
          product_sellers?: number
          projected_actual?: number
          projected_attainment?: number
          rank_position?: number | null
          remaining_target?: number
          reporting_period?: string
          volume_actual?: number
          volume_target?: number
        }
        Relationships: [
          {
            foreignKeyName: "owner_performance_snapshots_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "owners"
            referencedColumns: ["owner_id"]
          },
        ]
      }
      owner_reconciliation_records: {
        Row: {
          classification: string
          detected_changes: Json | null
          is_reviewed: boolean
          mapped_owner_id: string | null
          parsed_owner_code: string
          parsed_owner_name: string
          parsed_phone: string | null
          reco_record_id: number
          resolution_action: string
          reviewed_at: string | null
          reviewed_by: string | null
          upload_id: string
        }
        Insert: {
          classification?: string
          detected_changes?: Json | null
          is_reviewed?: boolean
          mapped_owner_id?: string | null
          parsed_owner_code: string
          parsed_owner_name: string
          parsed_phone?: string | null
          reco_record_id?: never
          resolution_action?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          upload_id: string
        }
        Update: {
          classification?: string
          detected_changes?: Json | null
          is_reviewed?: boolean
          mapped_owner_id?: string | null
          parsed_owner_code?: string
          parsed_owner_name?: string
          parsed_phone?: string | null
          reco_record_id?: never
          resolution_action?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          upload_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "owner_reconciliation_records_mapped_owner_id_fkey"
            columns: ["mapped_owner_id"]
            isOneToOne: false
            referencedRelation: "owners"
            referencedColumns: ["owner_id"]
          },
          {
            foreignKeyName: "owner_reconciliation_records_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: false
            referencedRelation: "file_upload_archives"
            referencedColumns: ["upload_id"]
          },
        ]
      }
      owners: {
        Row: {
          avatar: string | null
          avatar_photo_id: string | null
          created_at: string
          extras: Json
          master_agent_id: string
          member_since: string | null
          name: string
          name_aliases: string[]
          owner_id: string
          region: string
          status: string
          title: string | null
          updated_at: string
          user_id: string | null
          work_address: string | null
          work_lat: number | null
          work_lng: number | null
        }
        Insert: {
          avatar?: string | null
          avatar_photo_id?: string | null
          created_at?: string
          extras?: Json
          master_agent_id?: string
          member_since?: string | null
          name: string
          name_aliases?: string[]
          owner_id: string
          region?: string
          status?: string
          title?: string | null
          updated_at?: string
          user_id?: string | null
          work_address?: string | null
          work_lat?: number | null
          work_lng?: number | null
        }
        Update: {
          avatar?: string | null
          avatar_photo_id?: string | null
          created_at?: string
          extras?: Json
          master_agent_id?: string
          member_since?: string | null
          name?: string
          name_aliases?: string[]
          owner_id?: string
          region?: string
          status?: string
          title?: string | null
          updated_at?: string
          user_id?: string | null
          work_address?: string | null
          work_lat?: number | null
          work_lng?: number | null
        }
        Relationships: []
      }
      performance_summaries: {
        Row: {
          accum_comm: number
          attainment_rate: number
          avg_active: number
          base_volume: number
          iop_volume: number
          kpi1_status: string | null
          kpi2_status: string | null
          metrics: Json
          mtd_volume: number
          owner_id: string | null
          performance_status: string
          projected_achievement: number
          projected_attainment_rate: number
          rank_position: number | null
          recalculated_at: string
          remaining_target: number
          reporting_month: string
          summary_id: number
        }
        Insert: {
          accum_comm?: number
          attainment_rate?: number
          avg_active?: number
          base_volume?: number
          iop_volume?: number
          kpi1_status?: string | null
          kpi2_status?: string | null
          metrics?: Json
          mtd_volume?: number
          owner_id?: string | null
          performance_status?: string
          projected_achievement?: number
          projected_attainment_rate?: number
          rank_position?: number | null
          recalculated_at?: string
          remaining_target?: number
          reporting_month: string
          summary_id?: never
        }
        Update: {
          accum_comm?: number
          attainment_rate?: number
          avg_active?: number
          base_volume?: number
          iop_volume?: number
          kpi1_status?: string | null
          kpi2_status?: string | null
          metrics?: Json
          mtd_volume?: number
          owner_id?: string | null
          performance_status?: string
          projected_achievement?: number
          projected_attainment_rate?: number
          rank_position?: number | null
          recalculated_at?: string
          remaining_target?: number
          reporting_month?: string
          summary_id?: never
        }
        Relationships: [
          {
            foreignKeyName: "performance_summaries_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "owners"
            referencedColumns: ["owner_id"]
          },
        ]
      }
      personnel: {
        Row: {
          assigned_till: string | null
          avatar: string | null
          created_at: string
          extras: Json
          location: string
          member_since: string | null
          name: string
          owner_id: string | null
          personnel_id: string
          status: string
          title: string
          user_id: string | null
        }
        Insert: {
          assigned_till?: string | null
          avatar?: string | null
          created_at?: string
          extras?: Json
          location?: string
          member_since?: string | null
          name: string
          owner_id?: string | null
          personnel_id: string
          status?: string
          title?: string
          user_id?: string | null
        }
        Update: {
          assigned_till?: string | null
          avatar?: string | null
          created_at?: string
          extras?: Json
          location?: string
          member_since?: string | null
          name?: string
          owner_id?: string | null
          personnel_id?: string
          status?: string
          title?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "personnel_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "owners"
            referencedColumns: ["owner_id"]
          },
        ]
      }
      priority_wakalas: {
        Row: {
          extras: Json
          id: string
          imported_at: string
          msisdn: string
          owner_id: string | null
          owner_name: string | null
          period: string
          wakala_code: string | null
        }
        Insert: {
          extras?: Json
          id?: string
          imported_at?: string
          msisdn: string
          owner_id?: string | null
          owner_name?: string | null
          period: string
          wakala_code?: string | null
        }
        Update: {
          extras?: Json
          id?: string
          imported_at?: string
          msisdn?: string
          owner_id?: string | null
          owner_name?: string | null
          period?: string
          wakala_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "priority_wakalas_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "owners"
            referencedColumns: ["owner_id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar: string | null
          created_at: string
          email: string
          full_name: string | null
          user_id: string
          username: string | null
        }
        Insert: {
          avatar?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          user_id: string
          username?: string | null
        }
        Update: {
          avatar?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          user_id?: string
          username?: string | null
        }
        Relationships: []
      }
      sa_tills: {
        Row: {
          extras: Json
          id: string
          owner_id: string | null
          owner_name: string | null
          registered_at: string
          till_msisdn: string
        }
        Insert: {
          extras?: Json
          id?: string
          owner_id?: string | null
          owner_name?: string | null
          registered_at?: string
          till_msisdn: string
        }
        Update: {
          extras?: Json
          id?: string
          owner_id?: string | null
          owner_name?: string | null
          registered_at?: string
          till_msisdn?: string
        }
        Relationships: [
          {
            foreignKeyName: "sa_tills_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "owners"
            referencedColumns: ["owner_id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      wakala_issue_messages: {
        Row: {
          body: string
          created_at: string
          id: string
          issue_id: string
          sender_name: string
          sender_role: string
          sender_user_id: string | null
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          issue_id: string
          sender_name: string
          sender_role?: string
          sender_user_id?: string | null
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          issue_id?: string
          sender_name?: string
          sender_role?: string
          sender_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wakala_issue_messages_issue_id_fkey"
            columns: ["issue_id"]
            isOneToOne: false
            referencedRelation: "wakala_issues"
            referencedColumns: ["id"]
          },
        ]
      }
      wakala_issues: {
        Row: {
          category: string
          created_at: string
          created_by: string | null
          description: string
          id: string
          owner_id: string
          owner_name: string
          priority: string
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
          subject: string
          updated_at: string
          wakala_msisdn: string
          wakala_name: string | null
        }
        Insert: {
          category?: string
          created_at?: string
          created_by?: string | null
          description: string
          id?: string
          owner_id: string
          owner_name: string
          priority?: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          subject: string
          updated_at?: string
          wakala_msisdn: string
          wakala_name?: string | null
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          owner_id?: string
          owner_name?: string
          priority?: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          subject?: string
          updated_at?: string
          wakala_msisdn?: string
          wakala_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wakala_issues_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "owners"
            referencedColumns: ["owner_id"]
          },
        ]
      }
      wakala_status_history: {
        Row: {
          cash_in_txns: number
          cash_out_txns: number
          created_at: string
          evaluated_at: string
          id: number
          is_active: boolean
          is_served: boolean | null
          msisdn: string
          owner_id: string | null
          owner_name: string | null
          reporting_month: string | null
          reporting_week: string
          rule_mode: string
          threshold_used: number
          total_txns: number
          total_value: number
        }
        Insert: {
          cash_in_txns?: number
          cash_out_txns?: number
          created_at?: string
          evaluated_at?: string
          id?: number
          is_active?: boolean
          is_served?: boolean | null
          msisdn: string
          owner_id?: string | null
          owner_name?: string | null
          reporting_month?: string | null
          reporting_week: string
          rule_mode?: string
          threshold_used?: number
          total_txns?: number
          total_value?: number
        }
        Update: {
          cash_in_txns?: number
          cash_out_txns?: number
          created_at?: string
          evaluated_at?: string
          id?: number
          is_active?: boolean
          is_served?: boolean | null
          msisdn?: string
          owner_id?: string | null
          owner_name?: string | null
          reporting_month?: string | null
          reporting_week?: string
          rule_mode?: string
          threshold_used?: number
          total_txns?: number
          total_value?: number
        }
        Relationships: [
          {
            foreignKeyName: "wakala_status_history_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "owners"
            referencedColumns: ["owner_id"]
          },
        ]
      }
      wakalas: {
        Row: {
          alternate_number: string | null
          code: string | null
          created_at: string
          date_added: string | null
          district: string | null
          extras: Json
          kind: string
          lat: number | null
          lng: number | null
          location_accuracy: number | null
          location_address: string | null
          location_captured_at: string | null
          msisdn: string
          name: string
          owner_id: string | null
          owner_match_status: string | null
          photo_id: string | null
          region: string
          site_id: string | null
          site_ward: string | null
          source: string | null
          wakala_id: string
        }
        Insert: {
          alternate_number?: string | null
          code?: string | null
          created_at?: string
          date_added?: string | null
          district?: string | null
          extras?: Json
          kind?: string
          lat?: number | null
          lng?: number | null
          location_accuracy?: number | null
          location_address?: string | null
          location_captured_at?: string | null
          msisdn: string
          name: string
          owner_id?: string | null
          owner_match_status?: string | null
          photo_id?: string | null
          region?: string
          site_id?: string | null
          site_ward?: string | null
          source?: string | null
          wakala_id: string
        }
        Update: {
          alternate_number?: string | null
          code?: string | null
          created_at?: string
          date_added?: string | null
          district?: string | null
          extras?: Json
          kind?: string
          lat?: number | null
          lng?: number | null
          location_accuracy?: number | null
          location_address?: string | null
          location_captured_at?: string | null
          msisdn?: string
          name?: string
          owner_id?: string | null
          owner_match_status?: string | null
          photo_id?: string | null
          region?: string
          site_id?: string | null
          site_ward?: string | null
          source?: string | null
          wakala_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wakalas_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "owners"
            referencedColumns: ["owner_id"]
          },
        ]
      }
      weekly_servicing_records: {
        Row: {
          created_at: string
          id: number
          msisdn: string
          owner_id: string | null
          owner_name: string | null
          raw: Json
          reporting_month: string | null
          reporting_week: string
          servicing_txns: number
          servicing_val: number
          uploaded_by: string | null
          wakala_status: number | null
        }
        Insert: {
          created_at?: string
          id?: number
          msisdn: string
          owner_id?: string | null
          owner_name?: string | null
          raw?: Json
          reporting_month?: string | null
          reporting_week: string
          servicing_txns?: number
          servicing_val?: number
          uploaded_by?: string | null
          wakala_status?: number | null
        }
        Update: {
          created_at?: string
          id?: number
          msisdn?: string
          owner_id?: string | null
          owner_name?: string | null
          raw?: Json
          reporting_month?: string | null
          reporting_week?: string
          servicing_txns?: number
          servicing_val?: number
          uploaded_by?: string | null
          wakala_status?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "weekly_servicing_records_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "owners"
            referencedColumns: ["owner_id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_owner_id: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_staff: { Args: { _user_id: string }; Returns: boolean }
      owns_owner: { Args: { _owner_id: string }; Returns: boolean }
      resolve_login_email: { Args: { _username: string }; Returns: string }
    }
    Enums: {
      app_role: "admin" | "float_manager" | "owner"
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
      app_role: ["admin", "float_manager", "owner"],
    },
  },
} as const
