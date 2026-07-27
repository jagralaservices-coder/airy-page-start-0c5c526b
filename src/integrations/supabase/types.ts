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
      accounting_audit_log: {
        Row: {
          action: string
          actor_id: string | null
          after_json: Json | null
          before_json: Json | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          merchant_id: string
          reason: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          after_json?: Json | null
          before_json?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          merchant_id: string
          reason?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          after_json?: Json | null
          before_json?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          merchant_id?: string
          reason?: string | null
        }
        Relationships: []
      }
      accounting_periods: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          created_at: string
          end_date: string
          fiscal_year: number
          id: string
          merchant_id: string
          period_month: number
          start_date: string
          status: string
          updated_at: string
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          end_date: string
          fiscal_year: number
          id?: string
          merchant_id: string
          period_month: number
          start_date: string
          status?: string
          updated_at?: string
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          created_at?: string
          end_date?: string
          fiscal_year?: number
          id?: string
          merchant_id?: string
          period_month?: number
          start_date?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_item_verification_results: {
        Row: {
          confidence: number | null
          created_at: string
          detected_problems: Json | null
          id: string
          item_id: string
          model: string | null
          raw_response: Json | null
          reason: string | null
          status: string
          submission_id: string
          suggestions: string | null
        }
        Insert: {
          confidence?: number | null
          created_at?: string
          detected_problems?: Json | null
          id?: string
          item_id: string
          model?: string | null
          raw_response?: Json | null
          reason?: string | null
          status: string
          submission_id: string
          suggestions?: string | null
        }
        Update: {
          confidence?: number | null
          created_at?: string
          detected_problems?: Json | null
          id?: string
          item_id?: string
          model?: string | null
          raw_response?: Json | null
          reason?: string | null
          status?: string
          submission_id?: string
          suggestions?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_item_verification_results_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "checklist_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_item_verification_results_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "checklist_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_verification_results: {
        Row: {
          categories: Json
          created_at: string
          id: string
          model: string | null
          overall_score: number | null
          raw_response: Json | null
          reason: string | null
          result: string
          submission_id: string
        }
        Insert: {
          categories?: Json
          created_at?: string
          id?: string
          model?: string | null
          overall_score?: number | null
          raw_response?: Json | null
          reason?: string | null
          result?: string
          submission_id: string
        }
        Update: {
          categories?: Json
          created_at?: string
          id?: string
          model?: string | null
          overall_score?: number | null
          raw_response?: Json | null
          reason?: string | null
          result?: string
          submission_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_verification_results_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "checklist_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance: {
        Row: {
          clock_in: string
          clock_out: string | null
          created_at: string
          id: string
          notes: string | null
          staff_id: string
          total_hours: number | null
          updated_at: string
        }
        Insert: {
          clock_in?: string
          clock_out?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          staff_id: string
          total_hours?: number | null
          updated_at?: string
        }
        Update: {
          clock_in?: string
          clock_out?: string | null
          created_at?: string
          id?: string
          notes?: string | null
          staff_id?: string
          total_hours?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_email: string | null
          actor_id: string | null
          after_data: Json | null
          before_data: Json | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          ip_address: string | null
          metadata: Json | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          actor_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          actor_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
        }
        Relationships: []
      }
      bank_accounts: {
        Row: {
          account_id: string | null
          account_name: string
          account_number: string | null
          account_type: string | null
          bank_name: string
          branch: string | null
          created_at: string
          id: string
          ifsc_code: string | null
          is_active: boolean
          merchant_id: string
          metadata: Json
          opening_balance: number
          store_id: string | null
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          account_name: string
          account_number?: string | null
          account_type?: string | null
          bank_name: string
          branch?: string | null
          created_at?: string
          id?: string
          ifsc_code?: string | null
          is_active?: boolean
          merchant_id: string
          metadata?: Json
          opening_balance?: number
          store_id?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          account_name?: string
          account_number?: string | null
          account_type?: string | null
          bank_name?: string
          branch?: string | null
          created_at?: string
          id?: string
          ifsc_code?: string | null
          is_active?: boolean
          merchant_id?: string
          metadata?: Json
          opening_balance?: number
          store_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bank_accounts_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_transactions: {
        Row: {
          balance: number | null
          bank_account_id: string
          created_at: string
          credit: number
          debit: number
          description: string | null
          id: string
          match_status: string
          matched_journal_id: string | null
          matched_payment_id: string | null
          merchant_id: string
          metadata: Json | null
          notes: string | null
          reference: string | null
          store_id: string | null
          txn_date: string
          updated_at: string
        }
        Insert: {
          balance?: number | null
          bank_account_id: string
          created_at?: string
          credit?: number
          debit?: number
          description?: string | null
          id?: string
          match_status?: string
          matched_journal_id?: string | null
          matched_payment_id?: string | null
          merchant_id: string
          metadata?: Json | null
          notes?: string | null
          reference?: string | null
          store_id?: string | null
          txn_date: string
          updated_at?: string
        }
        Update: {
          balance?: number | null
          bank_account_id?: string
          created_at?: string
          credit?: number
          debit?: number
          description?: string | null
          id?: string
          match_status?: string
          matched_journal_id?: string | null
          matched_payment_id?: string | null
          merchant_id?: string
          metadata?: Json | null
          notes?: string | null
          reference?: string | null
          store_id?: string | null
          txn_date?: string
          updated_at?: string
        }
        Relationships: []
      }
      batch_master: {
        Row: {
          batch_number: string
          cost: number
          created_at: string
          expiry_date: string | null
          id: string
          item_id: string
          merchant_id: string
          metadata: Json
          mfg_date: string | null
          quantity: number
          remaining_qty: number
          status: Database["public"]["Enums"]["batch_status"]
          supplier_batch: string | null
          supplier_id: string | null
          updated_at: string
          warehouse_id: string | null
        }
        Insert: {
          batch_number: string
          cost?: number
          created_at?: string
          expiry_date?: string | null
          id?: string
          item_id: string
          merchant_id: string
          metadata?: Json
          mfg_date?: string | null
          quantity?: number
          remaining_qty?: number
          status?: Database["public"]["Enums"]["batch_status"]
          supplier_batch?: string | null
          supplier_id?: string | null
          updated_at?: string
          warehouse_id?: string | null
        }
        Update: {
          batch_number?: string
          cost?: number
          created_at?: string
          expiry_date?: string | null
          id?: string
          item_id?: string
          merchant_id?: string
          metadata?: Json
          mfg_date?: string | null
          quantity?: number
          remaining_qty?: number
          status?: Database["public"]["Enums"]["batch_status"]
          supplier_batch?: string | null
          supplier_id?: string | null
          updated_at?: string
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "batch_master_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_master_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_master_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batch_master_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      bin_locations: {
        Row: {
          bin: string
          capacity: number | null
          created_at: string
          id: string
          is_active: boolean
          metadata: Json
          rack: string | null
          shelf: string | null
          updated_at: string
          warehouse_id: string
          zone: string | null
        }
        Insert: {
          bin: string
          capacity?: number | null
          created_at?: string
          id?: string
          is_active?: boolean
          metadata?: Json
          rack?: string | null
          shelf?: string | null
          updated_at?: string
          warehouse_id: string
          zone?: string | null
        }
        Update: {
          bin?: string
          capacity?: number | null
          created_at?: string
          id?: string
          is_active?: boolean
          metadata?: Json
          rack?: string | null
          shelf?: string | null
          updated_at?: string
          warehouse_id?: string
          zone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bin_locations_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      brands: {
        Row: {
          brand_type: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          merchant_id: string | null
          metadata: Json
          name: string
          status: string
          store_id: string
          updated_at: string
        }
        Insert: {
          brand_type?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          merchant_id?: string | null
          metadata?: Json
          name: string
          status?: string
          store_id: string
          updated_at?: string
        }
        Update: {
          brand_type?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          merchant_id?: string | null
          metadata?: Json
          name?: string
          status?: string
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "brands_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "brands_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      budgets: {
        Row: {
          account_id: string | null
          alert_threshold_pct: number | null
          budget_amount: number
          cost_center_id: string | null
          created_at: string
          fiscal_year: number
          id: string
          merchant_id: string
          metadata: Json
          notes: string | null
          period_month: number | null
          store_id: string | null
          updated_at: string
        }
        Insert: {
          account_id?: string | null
          alert_threshold_pct?: number | null
          budget_amount?: number
          cost_center_id?: string | null
          created_at?: string
          fiscal_year: number
          id?: string
          merchant_id: string
          metadata?: Json
          notes?: string | null
          period_month?: number | null
          store_id?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string | null
          alert_threshold_pct?: number | null
          budget_amount?: number
          cost_center_id?: string | null
          created_at?: string
          fiscal_year?: number
          id?: string
          merchant_id?: string
          metadata?: Json
          notes?: string | null
          period_month?: number | null
          store_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "budgets_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "budgets_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_sessions: {
        Row: {
          closed_at: string | null
          closed_by: string | null
          closing_cash: number | null
          created_at: string
          expected_cash: number | null
          id: string
          notes: string | null
          opened_at: string
          opened_by: string
          opening_cash: number
          status: Database["public"]["Enums"]["cash_session_status"]
          store_id: string
          updated_at: string
        }
        Insert: {
          closed_at?: string | null
          closed_by?: string | null
          closing_cash?: number | null
          created_at?: string
          expected_cash?: number | null
          id?: string
          notes?: string | null
          opened_at?: string
          opened_by: string
          opening_cash?: number
          status?: Database["public"]["Enums"]["cash_session_status"]
          store_id: string
          updated_at?: string
        }
        Update: {
          closed_at?: string | null
          closed_by?: string | null
          closing_cash?: number | null
          created_at?: string
          expected_cash?: number | null
          id?: string
          notes?: string | null
          opened_at?: string
          opened_by?: string
          opening_cash?: number
          status?: Database["public"]["Enums"]["cash_session_status"]
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_sessions_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      cashier_audit_log: {
        Row: {
          cashier_id: string | null
          created_at: string
          event: string
          id: string
          payload: Json
          shift_id: string | null
          store_id: string
        }
        Insert: {
          cashier_id?: string | null
          created_at?: string
          event: string
          id?: string
          payload?: Json
          shift_id?: string | null
          store_id: string
        }
        Update: {
          cashier_id?: string | null
          created_at?: string
          event?: string
          id?: string
          payload?: Json
          shift_id?: string | null
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cashier_audit_log_cashier_id_fkey"
            columns: ["cashier_id"]
            isOneToOne: false
            referencedRelation: "cashiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cashier_audit_log_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "cashier_shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cashier_audit_log_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      cashier_shifts: {
        Row: {
          bills_created: number
          cancelled_bills: number
          card_collected: number
          cash_collected: number
          cashier_id: string
          closed_at: string | null
          created_at: string
          credit_sales: number
          device_name: string | null
          discount_given: number
          id: string
          opened_at: string
          refunds: number
          sales_amount: number
          store_id: string
          totals: Json
          updated_at: string
          upi_collected: number
        }
        Insert: {
          bills_created?: number
          cancelled_bills?: number
          card_collected?: number
          cash_collected?: number
          cashier_id: string
          closed_at?: string | null
          created_at?: string
          credit_sales?: number
          device_name?: string | null
          discount_given?: number
          id?: string
          opened_at?: string
          refunds?: number
          sales_amount?: number
          store_id: string
          totals?: Json
          updated_at?: string
          upi_collected?: number
        }
        Update: {
          bills_created?: number
          cancelled_bills?: number
          card_collected?: number
          cash_collected?: number
          cashier_id?: string
          closed_at?: string | null
          created_at?: string
          credit_sales?: number
          device_name?: string | null
          discount_given?: number
          id?: string
          opened_at?: string
          refunds?: number
          sales_amount?: number
          store_id?: string
          totals?: Json
          updated_at?: string
          upi_collected?: number
        }
        Relationships: [
          {
            foreignKeyName: "cashier_shifts_cashier_id_fkey"
            columns: ["cashier_id"]
            isOneToOne: false
            referencedRelation: "cashiers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cashier_shifts_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      cashiers: {
        Row: {
          cashier_code: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          merchant_id: string | null
          metadata: Json
          name: string
          permissions: Json
          photo_url: string | null
          pin_hash: string
          store_id: string
          updated_at: string
        }
        Insert: {
          cashier_code: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          merchant_id?: string | null
          metadata?: Json
          name: string
          permissions?: Json
          photo_url?: string | null
          pin_hash: string
          store_id: string
          updated_at?: string
        }
        Update: {
          cashier_code?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          merchant_id?: string | null
          metadata?: Json
          name?: string
          permissions?: Json
          photo_url?: string | null
          pin_hash?: string
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cashiers_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          color: string | null
          created_at: string
          id: string
          is_active: boolean
          merchant_id: string | null
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          merchant_id?: string | null
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          merchant_id?: string | null
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      chart_of_accounts: {
        Row: {
          account_type: string
          code: string
          created_at: string
          created_by: string | null
          currency: string
          description: string | null
          id: string
          is_active: boolean
          is_system: boolean
          merchant_id: string
          metadata: Json
          name: string
          opening_balance: number
          parent_id: string | null
          subtype: string | null
          updated_at: string
        }
        Insert: {
          account_type: string
          code: string
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          merchant_id: string
          metadata?: Json
          name: string
          opening_balance?: number
          parent_id?: string | null
          subtype?: string | null
          updated_at?: string
        }
        Update: {
          account_type?: string
          code?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_system?: boolean
          merchant_id?: string
          metadata?: Json
          name?: string
          opening_balance?: number
          parent_id?: string | null
          subtype?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chart_of_accounts_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_activity_logs: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          merchant_id: string | null
          meta: Json
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          merchant_id?: string | null
          meta?: Json
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          merchant_id?: string | null
          meta?: Json
        }
        Relationships: []
      }
      checklist_assignments: {
        Row: {
          assigned_role: string | null
          assigned_user_id: string | null
          checklist_id: string
          created_at: string
          id: string
          is_active: boolean
          store_id: string | null
          updated_at: string
        }
        Insert: {
          assigned_role?: string | null
          assigned_user_id?: string | null
          checklist_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          store_id?: string | null
          updated_at?: string
        }
        Update: {
          assigned_role?: string | null
          assigned_user_id?: string | null
          checklist_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          store_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_assignments_checklist_id_fkey"
            columns: ["checklist_id"]
            isOneToOne: false
            referencedRelation: "checklists"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_item_reference_images: {
        Row: {
          created_at: string
          id: string
          item_id: string
          label: string | null
          merchant_id: string
          storage_path: string
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          item_id: string
          label?: string | null
          merchant_id: string
          storage_path: string
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          item_id?: string
          label?: string | null
          merchant_id?: string
          storage_path?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "checklist_item_reference_images_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "checklist_items"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_items: {
        Row: {
          ai_verify: boolean
          answer_type: Database["public"]["Enums"]["checklist_answer_type"]
          checklist_id: string
          created_at: string
          description: string | null
          gps_required: boolean
          id: string
          input_type: Database["public"]["Enums"]["checklist_input_type"]
          order_index: number
          photo_required: boolean
          required: boolean
          time_required: boolean
          title: string
          updated_at: string
          video_required: boolean
        }
        Insert: {
          ai_verify?: boolean
          answer_type?: Database["public"]["Enums"]["checklist_answer_type"]
          checklist_id: string
          created_at?: string
          description?: string | null
          gps_required?: boolean
          id?: string
          input_type?: Database["public"]["Enums"]["checklist_input_type"]
          order_index?: number
          photo_required?: boolean
          required?: boolean
          time_required?: boolean
          title: string
          updated_at?: string
          video_required?: boolean
        }
        Update: {
          ai_verify?: boolean
          answer_type?: Database["public"]["Enums"]["checklist_answer_type"]
          checklist_id?: string
          created_at?: string
          description?: string | null
          gps_required?: boolean
          id?: string
          input_type?: Database["public"]["Enums"]["checklist_input_type"]
          order_index?: number
          photo_required?: boolean
          required?: boolean
          time_required?: boolean
          title?: string
          updated_at?: string
          video_required?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "checklist_items_checklist_id_fkey"
            columns: ["checklist_id"]
            isOneToOne: false
            referencedRelation: "checklists"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          kind: string
          merchant_id: string | null
          payload: Json
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          kind: string
          merchant_id?: string | null
          payload?: Json
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          kind?: string
          merchant_id?: string | null
          payload?: Json
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      checklist_submissions: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          checklist_id: string
          created_at: string
          gps_lat: number | null
          gps_lng: number | null
          id: string
          locked: boolean
          merchant_id: string
          overall_score: number | null
          parent_submission_id: string | null
          reupload_count: number
          reupload_item_ids: string[]
          reupload_requested_at: string | null
          reupload_requested_by: string | null
          review_notes: string | null
          shift: string | null
          staff_name: string | null
          staff_user_id: string
          status: Database["public"]["Enums"]["checklist_submission_status"]
          store_id: string | null
          submitted_at: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          checklist_id: string
          created_at?: string
          gps_lat?: number | null
          gps_lng?: number | null
          id?: string
          locked?: boolean
          merchant_id: string
          overall_score?: number | null
          parent_submission_id?: string | null
          reupload_count?: number
          reupload_item_ids?: string[]
          reupload_requested_at?: string | null
          reupload_requested_by?: string | null
          review_notes?: string | null
          shift?: string | null
          staff_name?: string | null
          staff_user_id: string
          status?: Database["public"]["Enums"]["checklist_submission_status"]
          store_id?: string | null
          submitted_at?: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          checklist_id?: string
          created_at?: string
          gps_lat?: number | null
          gps_lng?: number | null
          id?: string
          locked?: boolean
          merchant_id?: string
          overall_score?: number | null
          parent_submission_id?: string | null
          reupload_count?: number
          reupload_item_ids?: string[]
          reupload_requested_at?: string | null
          reupload_requested_by?: string | null
          review_notes?: string | null
          shift?: string | null
          staff_name?: string | null
          staff_user_id?: string
          status?: Database["public"]["Enums"]["checklist_submission_status"]
          store_id?: string | null
          submitted_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklist_submissions_checklist_id_fkey"
            columns: ["checklist_id"]
            isOneToOne: false
            referencedRelation: "checklists"
            referencedColumns: ["id"]
          },
        ]
      }
      checklist_templates: {
        Row: {
          ai_verify: boolean
          category: string | null
          created_at: string
          description: string | null
          id: string
          is_default: boolean
          photo_required: boolean
          suggested_answer_type: Database["public"]["Enums"]["checklist_answer_type"]
          title: string
        }
        Insert: {
          ai_verify?: boolean
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_default?: boolean
          photo_required?: boolean
          suggested_answer_type?: Database["public"]["Enums"]["checklist_answer_type"]
          title: string
        }
        Update: {
          ai_verify?: boolean
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_default?: boolean
          photo_required?: boolean
          suggested_answer_type?: Database["public"]["Enums"]["checklist_answer_type"]
          title?: string
        }
        Relationships: []
      }
      checklists: {
        Row: {
          ai_confidence_threshold: number
          category: string | null
          created_at: string
          created_by: string | null
          custom_cron: string | null
          department: string | null
          description: string | null
          frequency: Database["public"]["Enums"]["checklist_frequency"]
          id: string
          is_active: boolean
          merchant_id: string
          name: string
          shift_end_time: string | null
          shift_start_time: string | null
          shift_type: string | null
          store_id: string | null
          updated_at: string
        }
        Insert: {
          ai_confidence_threshold?: number
          category?: string | null
          created_at?: string
          created_by?: string | null
          custom_cron?: string | null
          department?: string | null
          description?: string | null
          frequency?: Database["public"]["Enums"]["checklist_frequency"]
          id?: string
          is_active?: boolean
          merchant_id: string
          name: string
          shift_end_time?: string | null
          shift_start_time?: string | null
          shift_type?: string | null
          store_id?: string | null
          updated_at?: string
        }
        Update: {
          ai_confidence_threshold?: number
          category?: string | null
          created_at?: string
          created_by?: string | null
          custom_cron?: string | null
          department?: string | null
          description?: string | null
          frequency?: Database["public"]["Enums"]["checklist_frequency"]
          id?: string
          is_active?: boolean
          merchant_id?: string
          name?: string
          shift_end_time?: string | null
          shift_start_time?: string | null
          shift_type?: string | null
          store_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      cost_centers: {
        Row: {
          center_type: string
          code: string | null
          created_at: string
          id: string
          is_active: boolean
          merchant_id: string
          metadata: Json
          name: string
          store_id: string | null
          updated_at: string
        }
        Insert: {
          center_type?: string
          code?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          merchant_id: string
          metadata?: Json
          name: string
          store_id?: string | null
          updated_at?: string
        }
        Update: {
          center_type?: string
          code?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          merchant_id?: string
          metadata?: Json
          name?: string
          store_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      coupon_usage: {
        Row: {
          coupon_id: string
          customer_id: string | null
          discount_given: number
          id: string
          merchant_id: string
          order_amount: number
          order_id: string | null
          store_id: string | null
          used_at: string
        }
        Insert: {
          coupon_id: string
          customer_id?: string | null
          discount_given: number
          id?: string
          merchant_id: string
          order_amount: number
          order_id?: string | null
          store_id?: string | null
          used_at?: string
        }
        Update: {
          coupon_id?: string
          customer_id?: string | null
          discount_given?: number
          id?: string
          merchant_id?: string
          order_amount?: number
          order_id?: string | null
          store_id?: string | null
          used_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coupon_usage_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_usage_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "pos_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_usage_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_usage_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_usage_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      coupons: {
        Row: {
          applicable_stores: string[] | null
          code: string
          created_at: string
          customer_usage_limit: number | null
          discount_type: string
          discount_value: number
          id: string
          is_active: boolean
          max_discount_amount: number | null
          merchant_id: string
          min_order_amount: number
          name: string
          updated_at: string
          usage_limit: number | null
          valid_from: string
          valid_to: string | null
        }
        Insert: {
          applicable_stores?: string[] | null
          code: string
          created_at?: string
          customer_usage_limit?: number | null
          discount_type: string
          discount_value?: number
          id?: string
          is_active?: boolean
          max_discount_amount?: number | null
          merchant_id: string
          min_order_amount?: number
          name: string
          updated_at?: string
          usage_limit?: number | null
          valid_from?: string
          valid_to?: string | null
        }
        Update: {
          applicable_stores?: string[] | null
          code?: string
          created_at?: string
          customer_usage_limit?: number | null
          discount_type?: string
          discount_value?: number
          id?: string
          is_active?: boolean
          max_discount_amount?: number | null
          merchant_id?: string
          min_order_amount?: number
          name?: string
          updated_at?: string
          usage_limit?: number | null
          valid_from?: string
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coupons_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_ledger: {
        Row: {
          created_at: string
          customer_id: string
          due_amount: number
          due_date: string | null
          id: string
          metadata: Json
          notes: string | null
          order_id: string | null
          paid_amount: number
          status: string
          store_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          due_amount: number
          due_date?: string | null
          id?: string
          metadata?: Json
          notes?: string | null
          order_id?: string | null
          paid_amount?: number
          status?: string
          store_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          due_amount?: number
          due_date?: string | null
          id?: string
          metadata?: Json
          notes?: string | null
          order_id?: string | null
          paid_amount?: number
          status?: string
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_ledger_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "pos_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_ledger_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_ledger_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_note_redemptions: {
        Row: {
          amount: number
          created_at: string
          credit_note_id: string
          id: string
          invoice_no: string | null
          metadata: Json
          order_id: string | null
          redeemed_by: string | null
          redeemed_by_name: string | null
          store_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          credit_note_id: string
          id?: string
          invoice_no?: string | null
          metadata?: Json
          order_id?: string | null
          redeemed_by?: string | null
          redeemed_by_name?: string | null
          store_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          credit_note_id?: string
          id?: string
          invoice_no?: string | null
          metadata?: Json
          order_id?: string | null
          redeemed_by?: string | null
          redeemed_by_name?: string | null
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_note_redemptions_credit_note_id_fkey"
            columns: ["credit_note_id"]
            isOneToOne: false
            referencedRelation: "credit_notes"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_notes: {
        Row: {
          balance_amount: number
          created_at: string
          customer_id: string | null
          customer_name: string | null
          customer_phone: string | null
          expiry_date: string | null
          id: string
          issued_amount: number
          issued_by: string | null
          issued_by_name: string | null
          merchant_id: string | null
          metadata: Json
          note_no: string
          original_invoice_no: string | null
          original_return_id: string | null
          redeemed_amount: number
          status: string
          store_id: string
          updated_at: string
        }
        Insert: {
          balance_amount?: number
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          expiry_date?: string | null
          id?: string
          issued_amount?: number
          issued_by?: string | null
          issued_by_name?: string | null
          merchant_id?: string | null
          metadata?: Json
          note_no: string
          original_invoice_no?: string | null
          original_return_id?: string | null
          redeemed_amount?: number
          status?: string
          store_id: string
          updated_at?: string
        }
        Update: {
          balance_amount?: number
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          expiry_date?: string | null
          id?: string
          issued_amount?: number
          issued_by?: string | null
          issued_by_name?: string | null
          merchant_id?: string | null
          metadata?: Json
          note_no?: string
          original_invoice_no?: string | null
          original_return_id?: string | null
          redeemed_amount?: number
          status?: string
          store_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      credit_payments: {
        Row: {
          amount: number
          created_at: string
          credit_ledger_id: string
          id: string
          metadata: Json
          payment_method: string
          reference: string | null
          store_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          credit_ledger_id: string
          id?: string
          metadata?: Json
          payment_method: string
          reference?: string | null
          store_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          credit_ledger_id?: string
          id?: string
          metadata?: Json
          payment_method?: string
          reference?: string | null
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_payments_credit_ledger_id_fkey"
            columns: ["credit_ledger_id"]
            isOneToOne: false
            referencedRelation: "credit_ledger"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_payments_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_csat_scores: {
        Row: {
          category: string | null
          comments: string | null
          created_at: string
          customer_id: string | null
          id: string
          merchant_id: string
          nps_category: string | null
          order_id: string | null
          rating_scale: number
          rating_value: number
          store_id: string
        }
        Insert: {
          category?: string | null
          comments?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          merchant_id: string
          nps_category?: string | null
          order_id?: string | null
          rating_scale: number
          rating_value: number
          store_id: string
        }
        Update: {
          category?: string | null
          comments?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          merchant_id?: string
          nps_category?: string | null
          order_id?: string | null
          rating_scale?: number
          rating_value?: number
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_csat_scores_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "pos_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_csat_scores_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_csat_scores_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_csat_scores_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_feedbacks: {
        Row: {
          assigned_to: string | null
          comments: string | null
          created_at: string
          customer_id: string | null
          id: string
          merchant_id: string
          order_id: string | null
          rating: number | null
          resolution_status: string | null
          resolution_time: string | null
          source: string
          status: string
          store_id: string
          type: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          comments?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          merchant_id: string
          order_id?: string | null
          rating?: number | null
          resolution_status?: string | null
          resolution_time?: string | null
          source: string
          status?: string
          store_id: string
          type: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          comments?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          merchant_id?: string
          order_id?: string | null
          rating?: number | null
          resolution_status?: string | null
          resolution_time?: string | null
          source?: string
          status?: string
          store_id?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_feedbacks_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "pos_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_feedbacks_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_feedbacks_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_feedbacks_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          address_line1: string | null
          approval_status: string | null
          approved_at: string | null
          approved_by: string | null
          business_name: string | null
          business_type: string | null
          city: string | null
          created_at: string
          credit_balance: number
          email: string | null
          email_verified: boolean | null
          enabled_addons: Json | null
          gov_id_url: string | null
          id: string
          is_active: boolean | null
          locality: string | null
          max_stores: number | null
          metadata: Json
          mobile_verified: boolean | null
          name: string
          notes: string | null
          outlet_limit: number | null
          owner_email: string | null
          owner_name: string | null
          owner_user_id: string | null
          phone: string | null
          pincode: string | null
          ref_code: string | null
          rejected_at: string | null
          rejection_reason: string | null
          staff_limit: number | null
          state: string | null
          subscription_end: string | null
          subscription_plan: string | null
          subscription_start: string | null
          subscription_tier: string | null
          suspended_at: string | null
          suspended_by: string | null
          suspension_reason: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          address_line1?: string | null
          approval_status?: string | null
          approved_at?: string | null
          approved_by?: string | null
          business_name?: string | null
          business_type?: string | null
          city?: string | null
          created_at?: string
          credit_balance?: number
          email?: string | null
          email_verified?: boolean | null
          enabled_addons?: Json | null
          gov_id_url?: string | null
          id?: string
          is_active?: boolean | null
          locality?: string | null
          max_stores?: number | null
          metadata?: Json
          mobile_verified?: boolean | null
          name: string
          notes?: string | null
          outlet_limit?: number | null
          owner_email?: string | null
          owner_name?: string | null
          owner_user_id?: string | null
          phone?: string | null
          pincode?: string | null
          ref_code?: string | null
          rejected_at?: string | null
          rejection_reason?: string | null
          staff_limit?: number | null
          state?: string | null
          subscription_end?: string | null
          subscription_plan?: string | null
          subscription_start?: string | null
          subscription_tier?: string | null
          suspended_at?: string | null
          suspended_by?: string | null
          suspension_reason?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          address_line1?: string | null
          approval_status?: string | null
          approved_at?: string | null
          approved_by?: string | null
          business_name?: string | null
          business_type?: string | null
          city?: string | null
          created_at?: string
          credit_balance?: number
          email?: string | null
          email_verified?: boolean | null
          enabled_addons?: Json | null
          gov_id_url?: string | null
          id?: string
          is_active?: boolean | null
          locality?: string | null
          max_stores?: number | null
          metadata?: Json
          mobile_verified?: boolean | null
          name?: string
          notes?: string | null
          outlet_limit?: number | null
          owner_email?: string | null
          owner_name?: string | null
          owner_user_id?: string | null
          phone?: string | null
          pincode?: string | null
          ref_code?: string | null
          rejected_at?: string | null
          rejection_reason?: string | null
          staff_limit?: number | null
          state?: string | null
          subscription_end?: string | null
          subscription_plan?: string | null
          subscription_start?: string | null
          subscription_tier?: string | null
          suspended_at?: string | null
          suspended_by?: string | null
          suspension_reason?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      cycle_counts: {
        Row: {
          counted_at: string | null
          counted_by: string | null
          counted_qty: number
          created_at: string
          frequency: Database["public"]["Enums"]["cycle_count_frequency"]
          id: string
          item_id: string | null
          merchant_id: string
          metadata: Json
          notes: string | null
          scheduled_date: string | null
          status: string
          system_qty: number
          updated_at: string
          variance: number
          variance_value: number
          warehouse_id: string | null
        }
        Insert: {
          counted_at?: string | null
          counted_by?: string | null
          counted_qty?: number
          created_at?: string
          frequency?: Database["public"]["Enums"]["cycle_count_frequency"]
          id?: string
          item_id?: string | null
          merchant_id: string
          metadata?: Json
          notes?: string | null
          scheduled_date?: string | null
          status?: string
          system_qty?: number
          updated_at?: string
          variance?: number
          variance_value?: number
          warehouse_id?: string | null
        }
        Update: {
          counted_at?: string | null
          counted_by?: string | null
          counted_qty?: number
          created_at?: string
          frequency?: Database["public"]["Enums"]["cycle_count_frequency"]
          id?: string
          item_id?: string | null
          merchant_id?: string
          metadata?: Json
          notes?: string | null
          scheduled_date?: string | null
          status?: string
          system_qty?: number
          updated_at?: string
          variance?: number
          variance_value?: number
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cycle_counts_counted_by_fkey"
            columns: ["counted_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cycle_counts_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cycle_counts_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cycle_counts_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      depreciation_entries: {
        Row: {
          amount: number
          asset_id: string
          book_value_after: number
          book_value_before: number
          created_at: string
          id: string
          journal_entry_id: string | null
          merchant_id: string
          method: string
          period_date: string
        }
        Insert: {
          amount: number
          asset_id: string
          book_value_after?: number
          book_value_before?: number
          created_at?: string
          id?: string
          journal_entry_id?: string | null
          merchant_id: string
          method?: string
          period_date: string
        }
        Update: {
          amount?: number
          asset_id?: string
          book_value_after?: number
          book_value_before?: number
          created_at?: string
          id?: string
          journal_entry_id?: string | null
          merchant_id?: string
          method?: string
          period_date?: string
        }
        Relationships: []
      }
      e_invoice_logs: {
        Row: {
          generated_at: string
          id: string
          invoice_number: string
          invoice_value: number | null
          irn: string | null
          merchant_id: string
          status: string | null
          store_id: string | null
        }
        Insert: {
          generated_at?: string
          id?: string
          invoice_number: string
          invoice_value?: number | null
          irn?: string | null
          merchant_id: string
          status?: string | null
          store_id?: string | null
        }
        Update: {
          generated_at?: string
          id?: string
          invoice_number?: string
          invoice_value?: number | null
          irn?: string | null
          merchant_id?: string
          status?: string | null
          store_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "e_invoice_logs_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "e_invoice_logs_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      e_way_bill_logs: {
        Row: {
          distance: number | null
          ewb_number: string
          generated_at: string
          id: string
          merchant_id: string
          status: string | null
          store_id: string | null
          valid_until: string | null
          vehicle_number: string | null
        }
        Insert: {
          distance?: number | null
          ewb_number: string
          generated_at?: string
          id?: string
          merchant_id: string
          status?: string | null
          store_id?: string | null
          valid_until?: string | null
          vehicle_number?: string | null
        }
        Update: {
          distance?: number | null
          ewb_number?: string
          generated_at?: string
          id?: string
          merchant_id?: string
          status?: string | null
          store_id?: string | null
          valid_until?: string | null
          vehicle_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "e_way_bill_logs_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "e_way_bill_logs_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          category: string
          created_at: string
          created_by: string
          id: string
          note: string | null
          paid_to: string | null
          session_id: string | null
          store_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          category: string
          created_at?: string
          created_by: string
          id?: string
          note?: string | null
          paid_to?: string | null
          session_id?: string | null
          store_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          created_by?: string
          id?: string
          note?: string | null
          paid_to?: string | null
          session_id?: string | null
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "cash_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_catalog: {
        Row: {
          category: string
          created_at: string
          feature_key: string
          included_in: string[]
          is_active: boolean
          label: string
          price_yearly: number
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          feature_key: string
          included_in?: string[]
          is_active?: boolean
          label: string
          price_yearly?: number
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          feature_key?: string
          included_in?: string[]
          is_active?: boolean
          label?: string
          price_yearly?: number
          updated_at?: string
        }
        Relationships: []
      }
      fixed_assets: {
        Row: {
          accumulated_depreciation: number
          asset_account_id: string | null
          asset_code: string | null
          category: string | null
          created_at: string
          depreciation_account_id: string | null
          depreciation_method: string
          disposal_date: string | null
          disposal_value: number | null
          id: string
          merchant_id: string
          metadata: Json
          name: string
          purchase_cost: number
          purchase_date: string
          salvage_value: number
          status: string
          store_id: string | null
          updated_at: string
          useful_life_months: number
          wdv_rate: number | null
        }
        Insert: {
          accumulated_depreciation?: number
          asset_account_id?: string | null
          asset_code?: string | null
          category?: string | null
          created_at?: string
          depreciation_account_id?: string | null
          depreciation_method?: string
          disposal_date?: string | null
          disposal_value?: number | null
          id?: string
          merchant_id: string
          metadata?: Json
          name: string
          purchase_cost: number
          purchase_date: string
          salvage_value?: number
          status?: string
          store_id?: string | null
          updated_at?: string
          useful_life_months?: number
          wdv_rate?: number | null
        }
        Update: {
          accumulated_depreciation?: number
          asset_account_id?: string | null
          asset_code?: string | null
          category?: string | null
          created_at?: string
          depreciation_account_id?: string | null
          depreciation_method?: string
          disposal_date?: string | null
          disposal_value?: number | null
          id?: string
          merchant_id?: string
          metadata?: Json
          name?: string
          purchase_cost?: number
          purchase_date?: string
          salvage_value?: number
          status?: string
          store_id?: string | null
          updated_at?: string
          useful_life_months?: number
          wdv_rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fixed_assets_asset_account_id_fkey"
            columns: ["asset_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fixed_assets_depreciation_account_id_fkey"
            columns: ["depreciation_account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      gateway_refunds: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          gateway_id: string
          gateway_refund_id: string | null
          id: string
          raw: Json | null
          reason: string | null
          refund_date: string | null
          status: string
          store_id: string
          transaction_id: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          gateway_id: string
          gateway_refund_id?: string | null
          id?: string
          raw?: Json | null
          reason?: string | null
          refund_date?: string | null
          status?: string
          store_id: string
          transaction_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          gateway_id?: string
          gateway_refund_id?: string | null
          id?: string
          raw?: Json | null
          reason?: string | null
          refund_date?: string | null
          status?: string
          store_id?: string
          transaction_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gateway_refunds_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gateway_refunds_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "gateway_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      gateway_settlements: {
        Row: {
          collected: number | null
          connection_id: string | null
          created_at: string
          fees: number | null
          gateway_id: string
          gateway_settlement_id: string | null
          id: string
          pending: number | null
          raw: Json | null
          settled: number | null
          settlement_date: string | null
          status: string | null
          store_id: string
        }
        Insert: {
          collected?: number | null
          connection_id?: string | null
          created_at?: string
          fees?: number | null
          gateway_id: string
          gateway_settlement_id?: string | null
          id?: string
          pending?: number | null
          raw?: Json | null
          settled?: number | null
          settlement_date?: string | null
          status?: string | null
          store_id: string
        }
        Update: {
          collected?: number | null
          connection_id?: string | null
          created_at?: string
          fees?: number | null
          gateway_id?: string
          gateway_settlement_id?: string | null
          id?: string
          pending?: number | null
          raw?: Json | null
          settled?: number | null
          settlement_date?: string | null
          status?: string | null
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gateway_settlements_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "merchant_gateway_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gateway_settlements_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      gateway_transactions: {
        Row: {
          amount: number
          connection_id: string | null
          created_at: string
          currency: string
          fees: number | null
          gateway_id: string
          gateway_reference: string | null
          gateway_txn_id: string | null
          gst_on_fees: number | null
          id: string
          net_amount: number | null
          order_id: string | null
          payment_method: string | null
          qr_payload: string | null
          raw: Json | null
          settlement_date: string | null
          settlement_id: string | null
          settlement_status: string | null
          status: string
          store_id: string
          updated_at: string
        }
        Insert: {
          amount?: number
          connection_id?: string | null
          created_at?: string
          currency?: string
          fees?: number | null
          gateway_id: string
          gateway_reference?: string | null
          gateway_txn_id?: string | null
          gst_on_fees?: number | null
          id?: string
          net_amount?: number | null
          order_id?: string | null
          payment_method?: string | null
          qr_payload?: string | null
          raw?: Json | null
          settlement_date?: string | null
          settlement_id?: string | null
          settlement_status?: string | null
          status?: string
          store_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          connection_id?: string | null
          created_at?: string
          currency?: string
          fees?: number | null
          gateway_id?: string
          gateway_reference?: string | null
          gateway_txn_id?: string | null
          gst_on_fees?: number | null
          id?: string
          net_amount?: number | null
          order_id?: string | null
          payment_method?: string | null
          qr_payload?: string | null
          raw?: Json | null
          settlement_date?: string | null
          settlement_id?: string | null
          settlement_status?: string | null
          status?: string
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "gateway_transactions_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "merchant_gateway_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gateway_transactions_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      gateway_webhook_events: {
        Row: {
          connection_id: string | null
          created_at: string
          error: string | null
          event_type: string | null
          gateway_id: string
          id: string
          payload: Json | null
          processed_at: string | null
          retry_count: number
          signature: string | null
          signature_valid: boolean | null
        }
        Insert: {
          connection_id?: string | null
          created_at?: string
          error?: string | null
          event_type?: string | null
          gateway_id: string
          id?: string
          payload?: Json | null
          processed_at?: string | null
          retry_count?: number
          signature?: string | null
          signature_valid?: boolean | null
        }
        Update: {
          connection_id?: string | null
          created_at?: string
          error?: string | null
          event_type?: string | null
          gateway_id?: string
          id?: string
          payload?: Json | null
          processed_at?: string | null
          retry_count?: number
          signature?: string | null
          signature_valid?: boolean | null
        }
        Relationships: []
      }
      goods_received_notes: {
        Row: {
          created_at: string
          grn_number: string | null
          id: string
          invoice_date: string | null
          invoice_number: string | null
          merchant_id: string
          metadata: Json
          notes: string | null
          purchase_order_id: string | null
          received_by: string | null
          received_date: string
          status: Database["public"]["Enums"]["grn_status"]
          subtotal: number
          supplier_id: string
          tax: number
          total: number
          updated_at: string
          warehouse_id: string | null
        }
        Insert: {
          created_at?: string
          grn_number?: string | null
          id?: string
          invoice_date?: string | null
          invoice_number?: string | null
          merchant_id: string
          metadata?: Json
          notes?: string | null
          purchase_order_id?: string | null
          received_by?: string | null
          received_date?: string
          status?: Database["public"]["Enums"]["grn_status"]
          subtotal?: number
          supplier_id: string
          tax?: number
          total?: number
          updated_at?: string
          warehouse_id?: string | null
        }
        Update: {
          created_at?: string
          grn_number?: string | null
          id?: string
          invoice_date?: string | null
          invoice_number?: string | null
          merchant_id?: string
          metadata?: Json
          notes?: string | null
          purchase_order_id?: string | null
          received_by?: string | null
          received_date?: string
          status?: Database["public"]["Enums"]["grn_status"]
          subtotal?: number
          supplier_id?: string
          tax?: number
          total?: number
          updated_at?: string
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "goods_received_notes_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_received_notes_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_received_notes_received_by_fkey"
            columns: ["received_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_received_notes_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_received_notes_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      grn_items: {
        Row: {
          batch_id: string | null
          created_at: string
          grn_id: string
          id: string
          item_id: string
          notes: string | null
          ordered_qty: number
          pending_qty: number
          received_qty: number
          rejected_qty: number
          tax: number
          total: number
          unit_cost: number
          updated_at: string
        }
        Insert: {
          batch_id?: string | null
          created_at?: string
          grn_id: string
          id?: string
          item_id: string
          notes?: string | null
          ordered_qty?: number
          pending_qty?: number
          received_qty?: number
          rejected_qty?: number
          tax?: number
          total?: number
          unit_cost?: number
          updated_at?: string
        }
        Update: {
          batch_id?: string | null
          created_at?: string
          grn_id?: string
          id?: string
          item_id?: string
          notes?: string | null
          ordered_qty?: number
          pending_qty?: number
          received_qty?: number
          rejected_qty?: number
          tax?: number
          total?: number
          unit_cost?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "grn_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batch_master"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grn_items_grn_id_fkey"
            columns: ["grn_id"]
            isOneToOne: false
            referencedRelation: "goods_received_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "grn_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      gst_registers: {
        Row: {
          created_at: string
          data: Json | null
          gstr_type: string | null
          id: string
          merchant_id: string
          month: number
          status: string | null
          store_id: string | null
          updated_at: string
          year: number
        }
        Insert: {
          created_at?: string
          data?: Json | null
          gstr_type?: string | null
          id?: string
          merchant_id: string
          month: number
          status?: string | null
          store_id?: string | null
          updated_at?: string
          year: number
        }
        Update: {
          created_at?: string
          data?: Json | null
          gstr_type?: string | null
          id?: string
          merchant_id?: string
          month?: number
          status?: string | null
          store_id?: string | null
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "gst_registers_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gst_registers_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      held_bills: {
        Row: {
          created_at: string
          customer_name: string | null
          held_at: string
          id: string
          items: Json
          store_id: string
          table_number: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_name?: string | null
          held_at?: string
          id: string
          items?: Json
          store_id: string
          table_number?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_name?: string | null
          held_at?: string
          id?: string
          items?: Json
          store_id?: string
          table_number?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "held_bills_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      hsn_sac_codes: {
        Row: {
          cess_rate: number | null
          cgst_rate: number | null
          code: string
          created_at: string
          description: string | null
          gst_rate: number | null
          id: string
          igst_rate: number | null
          sgst_rate: number | null
          type: string | null
          updated_at: string
        }
        Insert: {
          cess_rate?: number | null
          cgst_rate?: number | null
          code: string
          created_at?: string
          description?: string | null
          gst_rate?: number | null
          id?: string
          igst_rate?: number | null
          sgst_rate?: number | null
          type?: string | null
          updated_at?: string
        }
        Update: {
          cess_rate?: number | null
          cgst_rate?: number | null
          code?: string
          created_at?: string
          description?: string | null
          gst_rate?: number | null
          id?: string
          igst_rate?: number | null
          sgst_rate?: number | null
          type?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      inventory_items: {
        Row: {
          barcode: string | null
          batch_number: string | null
          cost_per_unit: number
          cost_unit: string | null
          created_at: string
          expiry_date: string | null
          gst_percentage: number
          hsn_code: string | null
          id: string
          metadata: Json
          min_stock: number
          name: string
          production_yield: number | null
          production_yield_unit: string | null
          quantity: number
          store_id: string
          unit: string
          updated_at: string
        }
        Insert: {
          barcode?: string | null
          batch_number?: string | null
          cost_per_unit?: number
          cost_unit?: string | null
          created_at?: string
          expiry_date?: string | null
          gst_percentage?: number
          hsn_code?: string | null
          id: string
          metadata?: Json
          min_stock?: number
          name: string
          production_yield?: number | null
          production_yield_unit?: string | null
          quantity?: number
          store_id: string
          unit?: string
          updated_at?: string
        }
        Update: {
          barcode?: string | null
          batch_number?: string | null
          cost_per_unit?: number
          cost_unit?: string | null
          created_at?: string
          expiry_date?: string | null
          gst_percentage?: number
          hsn_code?: string | null
          id?: string
          metadata?: Json
          min_stock?: number
          name?: string
          production_yield?: number | null
          production_yield_unit?: string | null
          quantity?: number
          store_id?: string
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_items_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_reservations: {
        Row: {
          batch_id: string | null
          created_at: string
          expires_at: string | null
          fulfilled_at: string | null
          id: string
          item_id: string
          merchant_id: string
          metadata: Json
          notes: string | null
          quantity: number
          reference_id: string | null
          reference_number: string | null
          released_at: string | null
          reservation_type: Database["public"]["Enums"]["reservation_type"]
          reserved_at: string
          reserved_by: string | null
          status: Database["public"]["Enums"]["reservation_status"]
          store_id: string | null
          updated_at: string
          warehouse_id: string | null
        }
        Insert: {
          batch_id?: string | null
          created_at?: string
          expires_at?: string | null
          fulfilled_at?: string | null
          id?: string
          item_id: string
          merchant_id: string
          metadata?: Json
          notes?: string | null
          quantity?: number
          reference_id?: string | null
          reference_number?: string | null
          released_at?: string | null
          reservation_type?: Database["public"]["Enums"]["reservation_type"]
          reserved_at?: string
          reserved_by?: string | null
          status?: Database["public"]["Enums"]["reservation_status"]
          store_id?: string | null
          updated_at?: string
          warehouse_id?: string | null
        }
        Update: {
          batch_id?: string | null
          created_at?: string
          expires_at?: string | null
          fulfilled_at?: string | null
          id?: string
          item_id?: string
          merchant_id?: string
          metadata?: Json
          notes?: string | null
          quantity?: number
          reference_id?: string | null
          reference_number?: string | null
          released_at?: string | null
          reservation_type?: Database["public"]["Enums"]["reservation_type"]
          reserved_at?: string
          reserved_by?: string | null
          status?: Database["public"]["Enums"]["reservation_status"]
          store_id?: string | null
          updated_at?: string
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_reservations_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batch_master"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_reservations_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_reservations_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_reservations_reserved_by_fkey"
            columns: ["reserved_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_reservations_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_reservations_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_transactions: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          inventory_item_id: string
          merchant_id: string | null
          notes: string | null
          order_id: string | null
          qty_after: number | null
          qty_before: number | null
          qty_delta: number
          reference: string | null
          source: string
          store_id: string | null
          unit: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          inventory_item_id: string
          merchant_id?: string | null
          notes?: string | null
          order_id?: string | null
          qty_after?: number | null
          qty_before?: number | null
          qty_delta: number
          reference?: string | null
          source: string
          store_id?: string | null
          unit?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          inventory_item_id?: string
          merchant_id?: string | null
          notes?: string | null
          order_id?: string | null
          qty_after?: number | null
          qty_before?: number | null
          qty_delta?: number
          reference?: string | null
          source?: string
          store_id?: string | null
          unit?: string | null
        }
        Relationships: []
      }
      journal_entries: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          created_by: string | null
          entry_date: string
          entry_no: string
          id: string
          idempotency_key: string | null
          merchant_id: string
          metadata: Json
          narration: string | null
          reversed_by_entry: string | null
          source_id: string | null
          source_type: string
          status: string
          store_id: string | null
          total_credit: number
          total_debit: number
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          entry_date?: string
          entry_no: string
          id?: string
          idempotency_key?: string | null
          merchant_id: string
          metadata?: Json
          narration?: string | null
          reversed_by_entry?: string | null
          source_id?: string | null
          source_type?: string
          status?: string
          store_id?: string | null
          total_credit?: number
          total_debit?: number
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          entry_date?: string
          entry_no?: string
          id?: string
          idempotency_key?: string | null
          merchant_id?: string
          metadata?: Json
          narration?: string | null
          reversed_by_entry?: string | null
          source_id?: string | null
          source_type?: string
          status?: string
          store_id?: string | null
          total_credit?: number
          total_debit?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_entries_reversed_by_entry_fkey"
            columns: ["reversed_by_entry"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_lines: {
        Row: {
          account_id: string
          cost_center_id: string | null
          created_at: string
          credit: number
          debit: number
          description: string | null
          entry_id: string
          id: string
          line_no: number
          merchant_id: string
          metadata: Json
          party_id: string | null
          party_type: string | null
          store_id: string | null
          tax_code: string | null
        }
        Insert: {
          account_id: string
          cost_center_id?: string | null
          created_at?: string
          credit?: number
          debit?: number
          description?: string | null
          entry_id: string
          id?: string
          line_no?: number
          merchant_id: string
          metadata?: Json
          party_id?: string | null
          party_type?: string | null
          store_id?: string | null
          tax_code?: string | null
        }
        Update: {
          account_id?: string
          cost_center_id?: string | null
          created_at?: string
          credit?: number
          debit?: number
          description?: string | null
          entry_id?: string
          id?: string
          line_no?: number
          merchant_id?: string
          metadata?: Json
          party_id?: string | null
          party_type?: string | null
          store_id?: string | null
          tax_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "journal_lines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "chart_of_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_lines_cost_center_id_fkey"
            columns: ["cost_center_id"]
            isOneToOne: false
            referencedRelation: "cost_centers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_lines_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      kot_items: {
        Row: {
          created_at: string
          id: string
          kot_id: string
          name: string
          notes: string | null
          product_id: string | null
          quantity: number
          status: Database["public"]["Enums"]["kot_status"]
        }
        Insert: {
          created_at?: string
          id?: string
          kot_id: string
          name: string
          notes?: string | null
          product_id?: string | null
          quantity?: number
          status?: Database["public"]["Enums"]["kot_status"]
        }
        Update: {
          created_at?: string
          id?: string
          kot_id?: string
          name?: string
          notes?: string | null
          product_id?: string | null
          quantity?: number
          status?: Database["public"]["Enums"]["kot_status"]
        }
        Relationships: [
          {
            foreignKeyName: "kot_items_kot_id_fkey"
            columns: ["kot_id"]
            isOneToOne: false
            referencedRelation: "kot_tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kot_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      kot_tickets: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          order_id: string
          station: Database["public"]["Enums"]["kot_station"]
          status: Database["public"]["Enums"]["kot_status"]
          table_id: string | null
          ticket_no: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          order_id: string
          station?: Database["public"]["Enums"]["kot_station"]
          status?: Database["public"]["Enums"]["kot_status"]
          table_id?: string | null
          ticket_no?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          order_id?: string
          station?: Database["public"]["Enums"]["kot_station"]
          status?: Database["public"]["Enums"]["kot_status"]
          table_id?: string | null
          ticket_no?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kot_tickets_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kot_tickets_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tables"
            referencedColumns: ["id"]
          },
        ]
      }
      landed_costs: {
        Row: {
          allocation: Json
          allocation_method: string
          created_at: string
          custom_duty: number
          freight: number
          grn_id: string | null
          handling: number
          id: string
          insurance: number
          merchant_id: string
          metadata: Json
          notes: string | null
          other_charges: number
          purchase_order_id: string | null
          total_landed: number
          updated_at: string
        }
        Insert: {
          allocation?: Json
          allocation_method?: string
          created_at?: string
          custom_duty?: number
          freight?: number
          grn_id?: string | null
          handling?: number
          id?: string
          insurance?: number
          merchant_id: string
          metadata?: Json
          notes?: string | null
          other_charges?: number
          purchase_order_id?: string | null
          total_landed?: number
          updated_at?: string
        }
        Update: {
          allocation?: Json
          allocation_method?: string
          created_at?: string
          custom_duty?: number
          freight?: number
          grn_id?: string | null
          handling?: number
          id?: string
          insurance?: number
          merchant_id?: string
          metadata?: Json
          notes?: string | null
          other_charges?: number
          purchase_order_id?: string | null
          total_landed?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "landed_costs_grn_id_fkey"
            columns: ["grn_id"]
            isOneToOne: false
            referencedRelation: "goods_received_notes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "landed_costs_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "landed_costs_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_points_ledger: {
        Row: {
          balance_after: number
          created_at: string
          created_by: string | null
          customer_id: string
          id: string
          merchant_id: string
          notes: string | null
          order_id: string | null
          points: number
          store_id: string | null
          transaction_type: string
        }
        Insert: {
          balance_after: number
          created_at?: string
          created_by?: string | null
          customer_id: string
          id?: string
          merchant_id: string
          notes?: string | null
          order_id?: string | null
          points: number
          store_id?: string | null
          transaction_type: string
        }
        Update: {
          balance_after?: number
          created_at?: string
          created_by?: string | null
          customer_id?: string
          id?: string
          merchant_id?: string
          notes?: string | null
          order_id?: string | null
          points?: number
          store_id?: string | null
          transaction_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_points_ledger_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "pos_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_points_ledger_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_points_ledger_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_points_ledger_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_settings: {
        Row: {
          birthday_bonus_points: number
          created_at: string
          currency_per_point: number
          id: string
          is_enabled: boolean
          max_redemption_percent: number
          merchant_id: string
          min_order_amount: number
          points_per_currency: number
          tier_bronze_min_spend: number
          tier_diamond_min_spend: number
          tier_gold_min_spend: number
          tier_platinum_min_spend: number
          tier_silver_min_spend: number
          updated_at: string
          validity_days: number
          welcome_bonus_points: number
        }
        Insert: {
          birthday_bonus_points?: number
          created_at?: string
          currency_per_point?: number
          id?: string
          is_enabled?: boolean
          max_redemption_percent?: number
          merchant_id: string
          min_order_amount?: number
          points_per_currency?: number
          tier_bronze_min_spend?: number
          tier_diamond_min_spend?: number
          tier_gold_min_spend?: number
          tier_platinum_min_spend?: number
          tier_silver_min_spend?: number
          updated_at?: string
          validity_days?: number
          welcome_bonus_points?: number
        }
        Update: {
          birthday_bonus_points?: number
          created_at?: string
          currency_per_point?: number
          id?: string
          is_enabled?: boolean
          max_redemption_percent?: number
          merchant_id?: string
          min_order_amount?: number
          points_per_currency?: number
          tier_bronze_min_spend?: number
          tier_diamond_min_spend?: number
          tier_gold_min_spend?: number
          tier_platinum_min_spend?: number
          tier_silver_min_spend?: number
          updated_at?: string
          validity_days?: number
          welcome_bonus_points?: number
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_settings_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: true
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_item_ingredients: {
        Row: {
          created_at: string
          id: string
          inventory_item_id: string
          menu_item_id: string
          quantity_required: number
          unit: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          inventory_item_id: string
          menu_item_id: string
          quantity_required?: number
          unit?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          inventory_item_id?: string
          menu_item_id?: string
          quantity_required?: number
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_item_ingredients_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_item_variations: {
        Row: {
          created_at: string
          id: string
          is_available: boolean
          menu_item_id: string
          name: string
          price: number
          sku: string | null
          sort_order: number
          stock: number | null
          unit: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_available?: boolean
          menu_item_id: string
          name: string
          price?: number
          sku?: string | null
          sort_order?: number
          stock?: number | null
          unit?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_available?: boolean
          menu_item_id?: string
          name?: string
          price?: number
          sku?: string | null
          sort_order?: number
          stock?: number | null
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_item_variations_menu_item_id_fkey"
            columns: ["menu_item_id"]
            isOneToOne: false
            referencedRelation: "menu_items"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_items: {
        Row: {
          barcode: string | null
          category: string
          created_at: string
          gramage_per_unit: number
          id: string
          image_url: string | null
          is_available: boolean
          linked_inventory_id: string | null
          metadata: Json
          name: string
          name_hindi: string | null
          preparation_time: number | null
          price: number
          sku: string | null
          stock: number | null
          store_id: string
          updated_at: string
        }
        Insert: {
          barcode?: string | null
          category?: string
          created_at?: string
          gramage_per_unit?: number
          id?: string
          image_url?: string | null
          is_available?: boolean
          linked_inventory_id?: string | null
          metadata?: Json
          name: string
          name_hindi?: string | null
          preparation_time?: number | null
          price?: number
          sku?: string | null
          stock?: number | null
          store_id: string
          updated_at?: string
        }
        Update: {
          barcode?: string | null
          category?: string
          created_at?: string
          gramage_per_unit?: number
          id?: string
          image_url?: string | null
          is_available?: boolean
          linked_inventory_id?: string | null
          metadata?: Json
          name?: string
          name_hindi?: string | null
          preparation_time?: number | null
          price?: number
          sku?: string | null
          stock?: number | null
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_items_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      merchant_addons: {
        Row: {
          created_at: string
          enabled: boolean
          expiry_date: string
          feature_key: string
          id: string
          merchant_id: string
          price_paid: number
          purchase_date: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          expiry_date?: string
          feature_key: string
          id?: string
          merchant_id: string
          price_paid?: number
          purchase_date?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          expiry_date?: string
          feature_key?: string
          id?: string
          merchant_id?: string
          price_paid?: number
          purchase_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "merchant_addons_feature_key_fkey"
            columns: ["feature_key"]
            isOneToOne: false
            referencedRelation: "feature_catalog"
            referencedColumns: ["feature_key"]
          },
          {
            foreignKeyName: "merchant_addons_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      merchant_custom_plan: {
        Row: {
          created_at: string
          features: string[]
          id: string
          is_active: boolean
          merchant_id: string
          total_price: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          features?: string[]
          id?: string
          is_active?: boolean
          merchant_id: string
          total_price?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          features?: string[]
          id?: string
          is_active?: boolean
          merchant_id?: string
          total_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "merchant_custom_plan_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: true
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      merchant_gateway_connections: {
        Row: {
          api_key: string | null
          created_at: string
          created_by: string | null
          display_name: string | null
          enabled: boolean
          environment: string
          extra: Json
          gateway_id: string
          id: string
          last_sync_at: string | null
          last_test_at: string | null
          last_test_result: Json | null
          merchant_account_id: string | null
          merchant_id: string | null
          secret_key_encrypted: string | null
          status: string
          store_id: string
          updated_at: string
          webhook_secret: string | null
          webhook_url: string | null
        }
        Insert: {
          api_key?: string | null
          created_at?: string
          created_by?: string | null
          display_name?: string | null
          enabled?: boolean
          environment?: string
          extra?: Json
          gateway_id: string
          id?: string
          last_sync_at?: string | null
          last_test_at?: string | null
          last_test_result?: Json | null
          merchant_account_id?: string | null
          merchant_id?: string | null
          secret_key_encrypted?: string | null
          status?: string
          store_id: string
          updated_at?: string
          webhook_secret?: string | null
          webhook_url?: string | null
        }
        Update: {
          api_key?: string | null
          created_at?: string
          created_by?: string | null
          display_name?: string | null
          enabled?: boolean
          environment?: string
          extra?: Json
          gateway_id?: string
          id?: string
          last_sync_at?: string | null
          last_test_at?: string | null
          last_test_result?: Json | null
          merchant_account_id?: string | null
          merchant_id?: string | null
          secret_key_encrypted?: string | null
          status?: string
          store_id?: string
          updated_at?: string
          webhook_secret?: string | null
          webhook_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "merchant_gateway_connections_gateway_id_fkey"
            columns: ["gateway_id"]
            isOneToOne: false
            referencedRelation: "payment_gateways"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "merchant_gateway_connections_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      merchant_subscription: {
        Row: {
          created_at: string
          expiry_date: string
          extra_outlets: number
          extra_staff: number
          id: string
          merchant_id: string
          outlet_limit: number
          plan_name: Database["public"]["Enums"]["merchant_plan"]
          staff_limit: number
          start_date: string
          status: Database["public"]["Enums"]["subscription_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          expiry_date?: string
          extra_outlets?: number
          extra_staff?: number
          id?: string
          merchant_id: string
          outlet_limit?: number
          plan_name?: Database["public"]["Enums"]["merchant_plan"]
          staff_limit?: number
          start_date?: string
          status?: Database["public"]["Enums"]["subscription_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          expiry_date?: string
          extra_outlets?: number
          extra_staff?: number
          id?: string
          merchant_id?: string
          outlet_limit?: number
          plan_name?: Database["public"]["Enums"]["merchant_plan"]
          staff_limit?: number
          start_date?: string
          status?: Database["public"]["Enums"]["subscription_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "merchant_subscription_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: true
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      merchants: {
        Row: {
          address: string | null
          address_line1: string | null
          approval_status: string
          business_name: string
          business_type: string | null
          city: string | null
          created_at: string
          email_verified: boolean
          gov_id_url: string | null
          id: string
          is_active: boolean
          locality: string | null
          max_stores: number | null
          mobile_verified: boolean
          owner_email: string
          owner_name: string
          owner_user_id: string | null
          phone: string | null
          phone_verified: boolean
          pincode: string | null
          state: string | null
          subscription_end: string | null
          subscription_plan: string | null
          subscription_tier: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          address_line1?: string | null
          approval_status?: string
          business_name: string
          business_type?: string | null
          city?: string | null
          created_at?: string
          email_verified?: boolean
          gov_id_url?: string | null
          id?: string
          is_active?: boolean
          locality?: string | null
          max_stores?: number | null
          mobile_verified?: boolean
          owner_email: string
          owner_name: string
          owner_user_id?: string | null
          phone?: string | null
          phone_verified?: boolean
          pincode?: string | null
          state?: string | null
          subscription_end?: string | null
          subscription_plan?: string | null
          subscription_tier?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          address_line1?: string | null
          approval_status?: string
          business_name?: string
          business_type?: string | null
          city?: string | null
          created_at?: string
          email_verified?: boolean
          gov_id_url?: string | null
          id?: string
          is_active?: boolean
          locality?: string | null
          max_stores?: number | null
          mobile_verified?: boolean
          owner_email?: string
          owner_name?: string
          owner_user_id?: string | null
          phone?: string | null
          phone_verified?: boolean
          pincode?: string | null
          state?: string | null
          subscription_end?: string | null
          subscription_plan?: string | null
          subscription_tier?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      order_items: {
        Row: {
          created_at: string
          discount: number
          id: string
          line_total: number
          name_snapshot: string
          order_id: string
          product_id: string | null
          quantity: number
          tax_rate: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          discount?: number
          id?: string
          line_total?: number
          name_snapshot: string
          order_id: string
          product_id?: string | null
          quantity?: number
          tax_rate?: number
          unit_price?: number
        }
        Update: {
          created_at?: string
          discount?: number
          id?: string
          line_total?: number
          name_snapshot?: string
          order_id?: string
          product_id?: string | null
          quantity?: number
          tax_rate?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          bill_number: string | null
          cancel_reason: string | null
          cancelled_at: string | null
          cash_session_id: string | null
          cashier_id: string | null
          cashier_name: string | null
          cashier_shift_id: string | null
          change_amount: number
          created_at: string
          customer_id: string | null
          customer_name: string | null
          customer_phone: string | null
          device_name: string | null
          discount: number
          id: string
          items: Json
          metadata: Json
          notes: string | null
          order_number: string
          order_type: Database["public"]["Enums"]["order_type"]
          paid_amount: number
          payment_breakdown: Json | null
          payment_details: Json | null
          payment_method: string | null
          status: Database["public"]["Enums"]["order_status"]
          store_id: string | null
          subtotal: number
          table_id: string | null
          table_number: string | null
          tax: number
          tax_total: number
          total: number
          updated_at: string
        }
        Insert: {
          bill_number?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          cash_session_id?: string | null
          cashier_id?: string | null
          cashier_name?: string | null
          cashier_shift_id?: string | null
          change_amount?: number
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          device_name?: string | null
          discount?: number
          id?: string
          items?: Json
          metadata?: Json
          notes?: string | null
          order_number?: string
          order_type?: Database["public"]["Enums"]["order_type"]
          paid_amount?: number
          payment_breakdown?: Json | null
          payment_details?: Json | null
          payment_method?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          store_id?: string | null
          subtotal?: number
          table_id?: string | null
          table_number?: string | null
          tax?: number
          tax_total?: number
          total?: number
          updated_at?: string
        }
        Update: {
          bill_number?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          cash_session_id?: string | null
          cashier_id?: string | null
          cashier_name?: string | null
          cashier_shift_id?: string | null
          change_amount?: number
          created_at?: string
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          device_name?: string | null
          discount?: number
          id?: string
          items?: Json
          metadata?: Json
          notes?: string | null
          order_number?: string
          order_type?: Database["public"]["Enums"]["order_type"]
          paid_amount?: number
          payment_breakdown?: Json | null
          payment_details?: Json | null
          payment_method?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          store_id?: string | null
          subtotal?: number
          table_id?: string | null
          table_number?: string | null
          tax?: number
          tax_total?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_cash_session_fk"
            columns: ["cash_session_id"]
            isOneToOne: false
            referencedRelation: "cash_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "restaurant_tables"
            referencedColumns: ["id"]
          },
        ]
      }
      owner_reviews: {
        Row: {
          created_at: string
          decision: string
          id: string
          notes: string | null
          reviewer_id: string | null
          submission_id: string
        }
        Insert: {
          created_at?: string
          decision: string
          id?: string
          notes?: string | null
          reviewer_id?: string | null
          submission_id: string
        }
        Update: {
          created_at?: string
          decision?: string
          id?: string
          notes?: string | null
          reviewer_id?: string | null
          submission_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "owner_reviews_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "checklist_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_gateways: {
        Row: {
          created_at: string
          description: string | null
          docs_url: string | null
          id: string
          logo_url: string | null
          name: string
          sort_order: number
          status: string
          supports_dynamic_qr: boolean
          supports_refunds: boolean
          supports_settlement: boolean
          supports_webhooks: boolean
        }
        Insert: {
          created_at?: string
          description?: string | null
          docs_url?: string | null
          id: string
          logo_url?: string | null
          name: string
          sort_order?: number
          status?: string
          supports_dynamic_qr?: boolean
          supports_refunds?: boolean
          supports_settlement?: boolean
          supports_webhooks?: boolean
        }
        Update: {
          created_at?: string
          description?: string | null
          docs_url?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          sort_order?: number
          status?: string
          supports_dynamic_qr?: boolean
          supports_refunds?: boolean
          supports_settlement?: boolean
          supports_webhooks?: boolean
        }
        Relationships: []
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          method: Database["public"]["Enums"]["payment_method"]
          order_id: string
          reference: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          method: Database["public"]["Enums"]["payment_method"]
          order_id: string
          reference?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          order_id?: string
          reference?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      pos_customers: {
        Row: {
          acquisition_source: string | null
          address: string | null
          anniversary_date: string | null
          city: string | null
          created_at: string
          credit_balance: number
          credit_limit: number
          date_of_birth: string | null
          email: string | null
          id: string
          loyalty_points: number | null
          loyalty_tier: string | null
          merchant_id: string | null
          metadata: Json
          name: string
          notes: string | null
          phone: string | null
          pincode: string | null
          state: string | null
          store_id: string
          updated_at: string
          wedding_anniversary: string | null
        }
        Insert: {
          acquisition_source?: string | null
          address?: string | null
          anniversary_date?: string | null
          city?: string | null
          created_at?: string
          credit_balance?: number
          credit_limit?: number
          date_of_birth?: string | null
          email?: string | null
          id?: string
          loyalty_points?: number | null
          loyalty_tier?: string | null
          merchant_id?: string | null
          metadata?: Json
          name: string
          notes?: string | null
          phone?: string | null
          pincode?: string | null
          state?: string | null
          store_id: string
          updated_at?: string
          wedding_anniversary?: string | null
        }
        Update: {
          acquisition_source?: string | null
          address?: string | null
          anniversary_date?: string | null
          city?: string | null
          created_at?: string
          credit_balance?: number
          credit_limit?: number
          date_of_birth?: string | null
          email?: string | null
          id?: string
          loyalty_points?: number | null
          loyalty_tier?: string | null
          merchant_id?: string | null
          metadata?: Json
          name?: string
          notes?: string | null
          phone?: string | null
          pincode?: string | null
          state?: string | null
          store_id?: string
          updated_at?: string
          wedding_anniversary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pos_customers_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          barcode: string | null
          brand_id: string | null
          brand_type: string | null
          category_id: string | null
          cost: number | null
          created_at: string
          id: string
          image_url: string | null
          is_active: boolean
          low_stock_threshold: number | null
          metadata: Json
          name: string
          price: number
          sku: string | null
          stock: number
          store_id: string
          tax_rate: number
          unit: string | null
          updated_at: string
        }
        Insert: {
          barcode?: string | null
          brand_id?: string | null
          brand_type?: string | null
          category_id?: string | null
          cost?: number | null
          created_at?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          low_stock_threshold?: number | null
          metadata?: Json
          name: string
          price?: number
          sku?: string | null
          stock?: number
          store_id: string
          tax_rate?: number
          unit?: string | null
          updated_at?: string
        }
        Update: {
          barcode?: string | null
          brand_id?: string | null
          brand_type?: string | null
          category_id?: string | null
          cost?: number | null
          created_at?: string
          id?: string
          image_url?: string | null
          is_active?: boolean
          low_stock_threshold?: number | null
          metadata?: Json
          name?: string
          price?: number
          sku?: string | null
          stock?: number
          store_id?: string
          tax_rate?: number
          unit?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          address_line1: string | null
          avatar_url: string | null
          city: string | null
          created_at: string
          email: string | null
          email_verified: boolean | null
          full_name: string | null
          id: string
          locality: string | null
          mobile_verified: boolean | null
          phone: string | null
          pincode: string | null
          state: string | null
          updated_at: string
        }
        Insert: {
          address_line1?: string | null
          avatar_url?: string | null
          city?: string | null
          created_at?: string
          email?: string | null
          email_verified?: boolean | null
          full_name?: string | null
          id: string
          locality?: string | null
          mobile_verified?: boolean | null
          phone?: string | null
          pincode?: string | null
          state?: string | null
          updated_at?: string
        }
        Update: {
          address_line1?: string | null
          avatar_url?: string | null
          city?: string | null
          created_at?: string
          email?: string | null
          email_verified?: boolean | null
          full_name?: string | null
          id?: string
          locality?: string | null
          mobile_verified?: boolean | null
          phone?: string | null
          pincode?: string | null
          state?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      purchase_budgets: {
        Row: {
          allocated_amount: number
          budget_period: string
          created_at: string
          department_id: string | null
          id: string
          merchant_id: string | null
          status: string
          store_id: string | null
          updated_at: string
          utilized_amount: number
          vendor_id: string | null
        }
        Insert: {
          allocated_amount?: number
          budget_period: string
          created_at?: string
          department_id?: string | null
          id?: string
          merchant_id?: string | null
          status?: string
          store_id?: string | null
          updated_at?: string
          utilized_amount?: number
          vendor_id?: string | null
        }
        Update: {
          allocated_amount?: number
          budget_period?: string
          created_at?: string
          department_id?: string | null
          id?: string
          merchant_id?: string | null
          status?: string
          store_id?: string | null
          updated_at?: string
          utilized_amount?: number
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_budgets_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_budgets_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_budgets_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_items: {
        Row: {
          created_at: string
          id: string
          product_id: string
          purchase_order_id: string
          quantity: number
          received_qty: number
          total: number
          unit_cost: number
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          purchase_order_id: string
          quantity: number
          received_qty?: number
          total: number
          unit_cost: number
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          purchase_order_id?: string
          quantity?: number
          received_qty?: number
          total?: number
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          approved_by: string | null
          created_at: string
          created_by: string | null
          expected_date: string | null
          finance_approved_by: string | null
          id: string
          merchant_id: string | null
          notes: string | null
          po_number: string
          received_date: string | null
          requested_by: string | null
          status: string
          store_id: string | null
          subtotal: number
          supplier_id: string | null
          tax: number
          total: number
          updated_at: string
        }
        Insert: {
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          expected_date?: string | null
          finance_approved_by?: string | null
          id?: string
          merchant_id?: string | null
          notes?: string | null
          po_number?: string
          received_date?: string | null
          requested_by?: string | null
          status?: string
          store_id?: string | null
          subtotal?: number
          supplier_id?: string | null
          tax?: number
          total?: number
          updated_at?: string
        }
        Update: {
          approved_by?: string | null
          created_at?: string
          created_by?: string | null
          expected_date?: string | null
          finance_approved_by?: string | null
          id?: string
          merchant_id?: string | null
          notes?: string | null
          po_number?: string
          received_date?: string | null
          requested_by?: string | null
          status?: string
          store_id?: string | null
          subtotal?: number
          supplier_id?: string | null
          tax?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_finance_approved_by_fkey"
            columns: ["finance_approved_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_return_items: {
        Row: {
          batch_id: string | null
          created_at: string
          id: string
          item_id: string
          purchase_return_id: string
          quantity: number
          reason: string | null
          tax: number
          total: number
          unit_cost: number
          updated_at: string
        }
        Insert: {
          batch_id?: string | null
          created_at?: string
          id?: string
          item_id: string
          purchase_return_id: string
          quantity?: number
          reason?: string | null
          tax?: number
          total?: number
          unit_cost?: number
          updated_at?: string
        }
        Update: {
          batch_id?: string | null
          created_at?: string
          id?: string
          item_id?: string
          purchase_return_id?: string
          quantity?: number
          reason?: string | null
          tax?: number
          total?: number
          unit_cost?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_return_items_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batch_master"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_return_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_return_items_purchase_return_id_fkey"
            columns: ["purchase_return_id"]
            isOneToOne: false
            referencedRelation: "purchase_returns"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_returns: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          merchant_id: string
          metadata: Json
          notes: string | null
          purchase_order_id: string | null
          reason: string | null
          return_date: string
          return_number: string | null
          status: Database["public"]["Enums"]["purchase_return_status"]
          subtotal: number
          supplier_id: string
          tax: number
          total: number
          updated_at: string
          warehouse_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          merchant_id: string
          metadata?: Json
          notes?: string | null
          purchase_order_id?: string | null
          reason?: string | null
          return_date?: string
          return_number?: string | null
          status?: Database["public"]["Enums"]["purchase_return_status"]
          subtotal?: number
          supplier_id: string
          tax?: number
          total?: number
          updated_at?: string
          warehouse_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          merchant_id?: string
          metadata?: Json
          notes?: string | null
          purchase_order_id?: string | null
          reason?: string | null
          return_date?: string
          return_number?: string | null
          status?: Database["public"]["Enums"]["purchase_return_status"]
          subtotal?: number
          supplier_id?: string
          tax?: number
          total?: number
          updated_at?: string
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_returns_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_returns_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_returns_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_returns_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_returns_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_suggestions: {
        Row: {
          created_at: string
          expected_delivery_date: string | null
          id: string
          item_id: string
          merchant_id: string | null
          reason: string | null
          recommended_vendor_id: string | null
          status: string
          store_id: string | null
          suggested_quantity: number
          updated_at: string
          warehouse_id: string | null
        }
        Insert: {
          created_at?: string
          expected_delivery_date?: string | null
          id?: string
          item_id: string
          merchant_id?: string | null
          reason?: string | null
          recommended_vendor_id?: string | null
          status?: string
          store_id?: string | null
          suggested_quantity?: number
          updated_at?: string
          warehouse_id?: string | null
        }
        Update: {
          created_at?: string
          expected_delivery_date?: string | null
          id?: string
          item_id?: string
          merchant_id?: string | null
          reason?: string | null
          recommended_vendor_id?: string | null
          status?: string
          store_id?: string | null
          suggested_quantity?: number
          updated_at?: string
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "purchase_suggestions_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_suggestions_recommended_vendor_id_fkey"
            columns: ["recommended_vendor_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_suggestions_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_suggestions_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      qr_orders: {
        Row: {
          created_at: string
          customer_name: string | null
          customer_phone: string | null
          id: string
          items: Json
          notes: string | null
          order_number: string
          status: string
          store_id: string
          subtotal: number
          table_number: string | null
          tax: number
          total: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_name?: string | null
          customer_phone?: string | null
          id?: string
          items?: Json
          notes?: string | null
          order_number: string
          status?: string
          store_id: string
          subtotal?: number
          table_number?: string | null
          tax?: number
          total?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_name?: string | null
          customer_phone?: string | null
          id?: string
          items?: Json
          notes?: string | null
          order_number?: string
          status?: string
          store_id?: string
          subtotal?: number
          table_number?: string | null
          tax?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "qr_orders_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      quotation_items: {
        Row: {
          created_at: string
          discount: number
          id: string
          notes: string | null
          price: number
          product_id: string | null
          product_name: string
          quantity: number
          quotation_id: string
          sku: string | null
          store_id: string
          tax_amount: number
          tax_rate: number
          total: number
        }
        Insert: {
          created_at?: string
          discount?: number
          id?: string
          notes?: string | null
          price?: number
          product_id?: string | null
          product_name: string
          quantity?: number
          quotation_id: string
          sku?: string | null
          store_id: string
          tax_amount?: number
          tax_rate?: number
          total?: number
        }
        Update: {
          created_at?: string
          discount?: number
          id?: string
          notes?: string | null
          price?: number
          product_id?: string | null
          product_name?: string
          quantity?: number
          quotation_id?: string
          sku?: string | null
          store_id?: string
          tax_amount?: number
          tax_rate?: number
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "quotation_items_quotation_id_fkey"
            columns: ["quotation_id"]
            isOneToOne: false
            referencedRelation: "quotations"
            referencedColumns: ["id"]
          },
        ]
      }
      quotations: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          converted_at: string | null
          converted_order_id: string | null
          created_at: string
          created_by: string | null
          customer_email: string | null
          customer_id: string | null
          customer_name: string | null
          customer_phone: string | null
          discount: number
          expiry_date: string | null
          grand_total: number
          id: string
          metadata: Json
          notes: string | null
          quotation_no: string
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          salesperson_id: string | null
          salesperson_name: string | null
          status: Database["public"]["Enums"]["quotation_status"]
          store_id: string
          subtotal: number
          tax: number
          terms: string | null
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          converted_at?: string | null
          converted_order_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          discount?: number
          expiry_date?: string | null
          grand_total?: number
          id?: string
          metadata?: Json
          notes?: string | null
          quotation_no: string
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          salesperson_id?: string | null
          salesperson_name?: string | null
          status?: Database["public"]["Enums"]["quotation_status"]
          store_id: string
          subtotal?: number
          tax?: number
          terms?: string | null
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          converted_at?: string | null
          converted_order_id?: string | null
          created_at?: string
          created_by?: string | null
          customer_email?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          discount?: number
          expiry_date?: string | null
          grand_total?: number
          id?: string
          metadata?: Json
          notes?: string | null
          quotation_no?: string
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          salesperson_id?: string | null
          salesperson_name?: string | null
          status?: Database["public"]["Enums"]["quotation_status"]
          store_id?: string
          subtotal?: number
          tax?: number
          terms?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      restaurant_tables: {
        Row: {
          capacity: number
          created_at: string
          current_order_id: string | null
          id: string
          name: string
          notes: string | null
          status: Database["public"]["Enums"]["table_status"]
          store_id: string
          updated_at: string
        }
        Insert: {
          capacity?: number
          created_at?: string
          current_order_id?: string | null
          id?: string
          name: string
          notes?: string | null
          status?: Database["public"]["Enums"]["table_status"]
          store_id: string
          updated_at?: string
        }
        Update: {
          capacity?: number
          created_at?: string
          current_order_id?: string | null
          id?: string
          name?: string
          notes?: string | null
          status?: Database["public"]["Enums"]["table_status"]
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_tables_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      rfq: {
        Row: {
          awarded_supplier_id: string | null
          created_at: string
          id: string
          issue_date: string | null
          merchant_id: string
          metadata: Json
          notes: string | null
          requested_by: string | null
          response_deadline: string | null
          rfq_number: string | null
          status: Database["public"]["Enums"]["rfq_status"]
          supplier_ids: string[]
          title: string | null
          updated_at: string
        }
        Insert: {
          awarded_supplier_id?: string | null
          created_at?: string
          id?: string
          issue_date?: string | null
          merchant_id: string
          metadata?: Json
          notes?: string | null
          requested_by?: string | null
          response_deadline?: string | null
          rfq_number?: string | null
          status?: Database["public"]["Enums"]["rfq_status"]
          supplier_ids?: string[]
          title?: string | null
          updated_at?: string
        }
        Update: {
          awarded_supplier_id?: string | null
          created_at?: string
          id?: string
          issue_date?: string | null
          merchant_id?: string
          metadata?: Json
          notes?: string | null
          requested_by?: string | null
          response_deadline?: string | null
          rfq_number?: string | null
          status?: Database["public"]["Enums"]["rfq_status"]
          supplier_ids?: string[]
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rfq_awarded_supplier_id_fkey"
            columns: ["awarded_supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfq_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfq_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      rfq_items: {
        Row: {
          awarded_price: number | null
          created_at: string
          id: string
          item_id: string
          notes: string | null
          quantity: number
          quoted_prices: Json
          rfq_id: string
          target_price: number | null
          updated_at: string
        }
        Insert: {
          awarded_price?: number | null
          created_at?: string
          id?: string
          item_id: string
          notes?: string | null
          quantity?: number
          quoted_prices?: Json
          rfq_id: string
          target_price?: number | null
          updated_at?: string
        }
        Update: {
          awarded_price?: number | null
          created_at?: string
          id?: string
          item_id?: string
          notes?: string | null
          quantity?: number
          quoted_prices?: Json
          rfq_id?: string
          target_price?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rfq_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rfq_items_rfq_id_fkey"
            columns: ["rfq_id"]
            isOneToOne: false
            referencedRelation: "rfq"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_return_items: {
        Row: {
          category: string | null
          created_at: string
          damaged: boolean
          id: string
          line_total: number
          product_id: string | null
          product_name: string
          quantity: number
          refund_amount: number
          restock: boolean
          return_id: string
          store_id: string
          unit_price: number
        }
        Insert: {
          category?: string | null
          created_at?: string
          damaged?: boolean
          id?: string
          line_total?: number
          product_id?: string | null
          product_name: string
          quantity?: number
          refund_amount?: number
          restock?: boolean
          return_id: string
          store_id: string
          unit_price?: number
        }
        Update: {
          category?: string | null
          created_at?: string
          damaged?: boolean
          id?: string
          line_total?: number
          product_id?: string | null
          product_name?: string
          quantity?: number
          refund_amount?: number
          restock?: boolean
          return_id?: string
          store_id?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "sales_return_items_return_id_fkey"
            columns: ["return_id"]
            isOneToOne: false
            referencedRelation: "sales_returns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_return_items_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_returns: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          cashier_id: string | null
          cashier_name: string | null
          created_at: string
          credit_note_amount: number
          credit_note_id: string | null
          customer_id: string | null
          customer_name: string | null
          customer_phone: string | null
          exchange_amount: number
          exchange_diff: number
          id: string
          merchant_id: string | null
          metadata: Json
          original_invoice_no: string | null
          original_order_id: string | null
          reason: string
          reason_notes: string | null
          refund_amount: number
          refund_method: string
          return_amount: number
          return_no: string
          return_type: string
          returned_at: string
          returned_by: string | null
          status: string
          store_id: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          cashier_id?: string | null
          cashier_name?: string | null
          created_at?: string
          credit_note_amount?: number
          credit_note_id?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          exchange_amount?: number
          exchange_diff?: number
          id?: string
          merchant_id?: string | null
          metadata?: Json
          original_invoice_no?: string | null
          original_order_id?: string | null
          reason?: string
          reason_notes?: string | null
          refund_amount?: number
          refund_method?: string
          return_amount?: number
          return_no: string
          return_type?: string
          returned_at?: string
          returned_by?: string | null
          status?: string
          store_id: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          cashier_id?: string | null
          cashier_name?: string | null
          created_at?: string
          credit_note_amount?: number
          credit_note_id?: string | null
          customer_id?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          exchange_amount?: number
          exchange_diff?: number
          id?: string
          merchant_id?: string | null
          metadata?: Json
          original_invoice_no?: string | null
          original_order_id?: string | null
          reason?: string
          reason_notes?: string | null
          refund_amount?: number
          refund_method?: string
          return_amount?: number
          return_no?: string
          return_type?: string
          returned_at?: string
          returned_by?: string | null
          status?: string
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_returns_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      serial_numbers: {
        Row: {
          batch_id: string | null
          created_at: string
          current_owner_id: string | null
          current_store_id: string | null
          current_warehouse_id: string | null
          history: Json
          id: string
          item_id: string
          merchant_id: string
          metadata: Json
          serial_number: string
          status: Database["public"]["Enums"]["serial_status"]
          updated_at: string
        }
        Insert: {
          batch_id?: string | null
          created_at?: string
          current_owner_id?: string | null
          current_store_id?: string | null
          current_warehouse_id?: string | null
          history?: Json
          id?: string
          item_id: string
          merchant_id: string
          metadata?: Json
          serial_number: string
          status?: Database["public"]["Enums"]["serial_status"]
          updated_at?: string
        }
        Update: {
          batch_id?: string | null
          created_at?: string
          current_owner_id?: string | null
          current_store_id?: string | null
          current_warehouse_id?: string | null
          history?: Json
          id?: string
          item_id?: string
          merchant_id?: string
          metadata?: Json
          serial_number?: string
          status?: Database["public"]["Enums"]["serial_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "serial_numbers_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batch_master"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "serial_numbers_current_owner_id_fkey"
            columns: ["current_owner_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "serial_numbers_current_store_id_fkey"
            columns: ["current_store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "serial_numbers_current_warehouse_id_fkey"
            columns: ["current_warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "serial_numbers_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "serial_numbers_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      staff: {
        Row: {
          active: boolean
          approval_status: string | null
          approved_at: string | null
          approved_by: string | null
          created_at: string
          customer_id: string | null
          employee_code: string | null
          hire_date: string | null
          hourly_rate: number | null
          id: string
          position: string | null
          profile_id: string
          rejected_at: string | null
          rejection_reason: string | null
          store_id: string | null
          suspended_at: string | null
          suspended_by: string | null
          suspension_reason: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          active?: boolean
          approval_status?: string | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          customer_id?: string | null
          employee_code?: string | null
          hire_date?: string | null
          hourly_rate?: number | null
          id?: string
          position?: string | null
          profile_id: string
          rejected_at?: string | null
          rejection_reason?: string | null
          store_id?: string | null
          suspended_at?: string | null
          suspended_by?: string | null
          suspension_reason?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          active?: boolean
          approval_status?: string | null
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          customer_id?: string | null
          employee_code?: string | null
          hire_date?: string | null
          hourly_rate?: number | null
          id?: string
          position?: string | null
          profile_id?: string
          rejected_at?: string | null
          rejection_reason?: string | null
          store_id?: string | null
          suspended_at?: string | null
          suspended_by?: string | null
          suspension_reason?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_attendance: {
        Row: {
          attendance_date: string
          check_in: string
          check_in_distance: number | null
          check_in_latitude: number | null
          check_in_longitude: number | null
          check_in_time: string | null
          check_out: string | null
          check_out_distance: number | null
          check_out_latitude: number | null
          check_out_longitude: number | null
          check_out_time: string | null
          created_at: string | null
          face_image: string | null
          id: string
          latitude: number | null
          longitude: number | null
          merchant_id: string | null
          organization_id: string | null
          staff_id: string | null
          status: string | null
          store_id: string | null
          updated_at: string | null
          user_id: string | null
          verification_method: string | null
          verification_type: string | null
          working_hours: number | null
          working_minutes: number | null
        }
        Insert: {
          attendance_date?: string
          check_in?: string
          check_in_distance?: number | null
          check_in_latitude?: number | null
          check_in_longitude?: number | null
          check_in_time?: string | null
          check_out?: string | null
          check_out_distance?: number | null
          check_out_latitude?: number | null
          check_out_longitude?: number | null
          check_out_time?: string | null
          created_at?: string | null
          face_image?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          merchant_id?: string | null
          organization_id?: string | null
          staff_id?: string | null
          status?: string | null
          store_id?: string | null
          updated_at?: string | null
          user_id?: string | null
          verification_method?: string | null
          verification_type?: string | null
          working_hours?: number | null
          working_minutes?: number | null
        }
        Update: {
          attendance_date?: string
          check_in?: string
          check_in_distance?: number | null
          check_in_latitude?: number | null
          check_in_longitude?: number | null
          check_in_time?: string | null
          check_out?: string | null
          check_out_distance?: number | null
          check_out_latitude?: number | null
          check_out_longitude?: number | null
          check_out_time?: string | null
          created_at?: string | null
          face_image?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          merchant_id?: string | null
          organization_id?: string | null
          staff_id?: string | null
          status?: string | null
          store_id?: string | null
          updated_at?: string | null
          user_id?: string | null
          verification_method?: string | null
          verification_type?: string | null
          working_hours?: number | null
          working_minutes?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_attendance_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_attendance_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_attendance_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      static_qr_assets: {
        Row: {
          created_at: string
          gateway_id: string | null
          id: string
          is_active: boolean
          merchant_name: string | null
          qr_image_url: string | null
          store_id: string
          updated_at: string
          upi_id: string | null
        }
        Insert: {
          created_at?: string
          gateway_id?: string | null
          id?: string
          is_active?: boolean
          merchant_name?: string | null
          qr_image_url?: string | null
          store_id: string
          updated_at?: string
          upi_id?: string | null
        }
        Update: {
          created_at?: string
          gateway_id?: string | null
          id?: string
          is_active?: boolean
          merchant_name?: string | null
          qr_image_url?: string | null
          store_id?: string
          updated_at?: string
          upi_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "static_qr_assets_gateway_id_fkey"
            columns: ["gateway_id"]
            isOneToOne: false
            referencedRelation: "payment_gateways"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "static_qr_assets_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_adjustments: {
        Row: {
          adjusted_by: string | null
          adjustment_type: string
          created_at: string
          id: string
          product_id: string
          quantity: number
          reason: string | null
          store_id: string
        }
        Insert: {
          adjusted_by?: string | null
          adjustment_type: string
          created_at?: string
          id?: string
          product_id: string
          quantity: number
          reason?: string | null
          store_id: string
        }
        Update: {
          adjusted_by?: string | null
          adjustment_type?: string
          created_at?: string
          id?: string
          product_id?: string
          quantity?: number
          reason?: string | null
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_adjustments_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_adjustments_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_take_items: {
        Row: {
          created_at: string
          id: string
          item_id: string
          notes: string | null
          physical_qty: number
          reason: string | null
          stock_take_id: string
          system_qty: number
          updated_at: string
          variance: number
          variance_value: number
        }
        Insert: {
          created_at?: string
          id?: string
          item_id: string
          notes?: string | null
          physical_qty?: number
          reason?: string | null
          stock_take_id: string
          system_qty?: number
          updated_at?: string
          variance?: number
          variance_value?: number
        }
        Update: {
          created_at?: string
          id?: string
          item_id?: string
          notes?: string | null
          physical_qty?: number
          reason?: string | null
          stock_take_id?: string
          system_qty?: number
          updated_at?: string
          variance?: number
          variance_value?: number
        }
        Relationships: [
          {
            foreignKeyName: "stock_take_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_take_items_stock_take_id_fkey"
            columns: ["stock_take_id"]
            isOneToOne: false
            referencedRelation: "stock_takes"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_takes: {
        Row: {
          completed_at: string | null
          conducted_by: string | null
          created_at: string
          id: string
          merchant_id: string
          metadata: Json
          notes: string | null
          reference: string | null
          scheduled_at: string | null
          started_at: string | null
          status: Database["public"]["Enums"]["stock_take_status"]
          store_id: string | null
          updated_at: string
          warehouse_id: string | null
        }
        Insert: {
          completed_at?: string | null
          conducted_by?: string | null
          created_at?: string
          id?: string
          merchant_id: string
          metadata?: Json
          notes?: string | null
          reference?: string | null
          scheduled_at?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["stock_take_status"]
          store_id?: string | null
          updated_at?: string
          warehouse_id?: string | null
        }
        Update: {
          completed_at?: string | null
          conducted_by?: string | null
          created_at?: string
          id?: string
          merchant_id?: string
          metadata?: Json
          notes?: string | null
          reference?: string | null
          scheduled_at?: string | null
          started_at?: string | null
          status?: Database["public"]["Enums"]["stock_take_status"]
          store_id?: string | null
          updated_at?: string
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_takes_conducted_by_fkey"
            columns: ["conducted_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_takes_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_takes_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_takes_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      store_categories: {
        Row: {
          category_id: string
          color: string | null
          created_at: string
          icon: string | null
          id: string
          name: string
          name_hindi: string | null
          sort_order: number
          store_id: string
          updated_at: string
        }
        Insert: {
          category_id: string
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          name: string
          name_hindi?: string | null
          sort_order?: number
          store_id: string
          updated_at?: string
        }
        Update: {
          category_id?: string
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          name?: string
          name_hindi?: string | null
          sort_order?: number
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_categories_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_settings: {
        Row: {
          created_at: string
          id: string
          setting_key: string
          setting_value: Json
          store_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          setting_key: string
          setting_value?: Json
          store_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          setting_key?: string
          setting_value?: Json
          store_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_settings_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      store_whatsapp_config: {
        Row: {
          api_key: string
          created_at: string
          id: string
          instance_id: string
          is_verified: boolean
          owner_id: string | null
          store_id: string
          updated_at: string
          whatsapp_number: string
        }
        Insert: {
          api_key?: string
          created_at?: string
          id?: string
          instance_id?: string
          is_verified?: boolean
          owner_id?: string | null
          store_id: string
          updated_at?: string
          whatsapp_number?: string
        }
        Update: {
          api_key?: string
          created_at?: string
          id?: string
          instance_id?: string
          is_verified?: boolean
          owner_id?: string | null
          store_id?: string
          updated_at?: string
          whatsapp_number?: string
        }
        Relationships: [
          {
            foreignKeyName: "store_whatsapp_config_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "store_whatsapp_config_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: true
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      stores: {
        Row: {
          address: string | null
          address_line1: string | null
          approval_status: string | null
          approved_at: string | null
          approved_by: string | null
          branch_code: string | null
          branch_name: string | null
          brand_type_default: string
          business_type: string | null
          cashier_billing_mode: boolean
          city: string | null
          country: string | null
          created_at: string
          created_by: string | null
          currency_code: string | null
          customer_id: string | null
          default_internal_brand: string | null
          email: string | null
          id: string
          is_active: boolean
          latitude: number | null
          locality: string | null
          longitude: number | null
          manager_name: string | null
          manager_user_id: string | null
          merchant_id: string
          name: string
          outlet_code: string | null
          owner_id: string | null
          phone: string | null
          pincode: string | null
          ref_code: string | null
          region: string | null
          rejected_at: string | null
          rejection_reason: string | null
          return_allow_credit_note: boolean
          return_allow_exchange: boolean
          return_refund_pin_threshold: number
          state: string | null
          suspended_at: string | null
          suspended_by: string | null
          suspension_reason: string | null
          tax_percentage: number | null
          tax_type: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          address_line1?: string | null
          approval_status?: string | null
          approved_at?: string | null
          approved_by?: string | null
          branch_code?: string | null
          branch_name?: string | null
          brand_type_default?: string
          business_type?: string | null
          cashier_billing_mode?: boolean
          city?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          currency_code?: string | null
          customer_id?: string | null
          default_internal_brand?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          latitude?: number | null
          locality?: string | null
          longitude?: number | null
          manager_name?: string | null
          manager_user_id?: string | null
          merchant_id: string
          name: string
          outlet_code?: string | null
          owner_id?: string | null
          phone?: string | null
          pincode?: string | null
          ref_code?: string | null
          region?: string | null
          rejected_at?: string | null
          rejection_reason?: string | null
          return_allow_credit_note?: boolean
          return_allow_exchange?: boolean
          return_refund_pin_threshold?: number
          state?: string | null
          suspended_at?: string | null
          suspended_by?: string | null
          suspension_reason?: string | null
          tax_percentage?: number | null
          tax_type?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          address_line1?: string | null
          approval_status?: string | null
          approved_at?: string | null
          approved_by?: string | null
          branch_code?: string | null
          branch_name?: string | null
          brand_type_default?: string
          business_type?: string | null
          cashier_billing_mode?: boolean
          city?: string | null
          country?: string | null
          created_at?: string
          created_by?: string | null
          currency_code?: string | null
          customer_id?: string | null
          default_internal_brand?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          latitude?: number | null
          locality?: string | null
          longitude?: number | null
          manager_name?: string | null
          manager_user_id?: string | null
          merchant_id?: string
          name?: string
          outlet_code?: string | null
          owner_id?: string | null
          phone?: string | null
          pincode?: string | null
          ref_code?: string | null
          region?: string | null
          rejected_at?: string | null
          rejection_reason?: string | null
          return_allow_credit_note?: boolean
          return_allow_exchange?: boolean
          return_refund_pin_threshold?: number
          state?: string | null
          suspended_at?: string | null
          suspended_by?: string | null
          suspension_reason?: string | null
          tax_percentage?: number | null
          tax_type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stores_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stores_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      submission_answers: {
        Row: {
          answer_json: Json
          created_at: string
          id: string
          item_id: string
          submission_id: string
        }
        Insert: {
          answer_json?: Json
          created_at?: string
          id?: string
          item_id: string
          submission_id: string
        }
        Update: {
          answer_json?: Json
          created_at?: string
          id?: string
          item_id?: string
          submission_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "submission_answers_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "checklist_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submission_answers_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "checklist_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      submission_images: {
        Row: {
          created_at: string
          gps_lat: number | null
          gps_lng: number | null
          id: string
          item_id: string | null
          kind: string
          storage_path: string
          submission_id: string
          taken_at: string
          thumb_path: string | null
        }
        Insert: {
          created_at?: string
          gps_lat?: number | null
          gps_lng?: number | null
          id?: string
          item_id?: string | null
          kind?: string
          storage_path: string
          submission_id: string
          taken_at?: string
          thumb_path?: string | null
        }
        Update: {
          created_at?: string
          gps_lat?: number | null
          gps_lng?: number | null
          id?: string
          item_id?: string | null
          kind?: string
          storage_path?: string
          submission_id?: string
          taken_at?: string
          thumb_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "submission_images_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "checklist_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "submission_images_submission_id_fkey"
            columns: ["submission_id"]
            isOneToOne: false
            referencedRelation: "checklist_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_requests: {
        Row: {
          admin_note: string | null
          created_at: string
          id: string
          merchant_id: string
          message: string | null
          quantity: number | null
          request_type: string
          requested_by: string
          requested_feature: string | null
          requested_plan: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          admin_note?: string | null
          created_at?: string
          id?: string
          merchant_id: string
          message?: string | null
          quantity?: number | null
          request_type: string
          requested_by: string
          requested_feature?: string | null
          requested_plan?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          admin_note?: string | null
          created_at?: string
          id?: string
          merchant_id?: string
          message?: string | null
          quantity?: number | null
          request_type?: string
          requested_by?: string
          requested_feature?: string | null
          requested_plan?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      supplier_invoices: {
        Row: {
          created_at: string
          created_by: string | null
          due_date: string | null
          id: string
          invoice_date: string
          invoice_number: string
          merchant_id: string
          metadata: Json | null
          notes: string | null
          paid_amount: number
          purchase_order_id: string | null
          status: string
          store_id: string | null
          subtotal: number
          supplier_id: string
          tax: number
          total: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          id?: string
          invoice_date?: string
          invoice_number: string
          merchant_id: string
          metadata?: Json | null
          notes?: string | null
          paid_amount?: number
          purchase_order_id?: string | null
          status?: string
          store_id?: string | null
          subtotal?: number
          supplier_id: string
          tax?: number
          total?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          due_date?: string | null
          id?: string
          invoice_date?: string
          invoice_number?: string
          merchant_id?: string
          metadata?: Json | null
          notes?: string | null
          paid_amount?: number
          purchase_order_id?: string | null
          status?: string
          store_id?: string | null
          subtotal?: number
          supplier_id?: string
          tax?: number
          total?: number
          updated_at?: string
        }
        Relationships: []
      }
      supplier_payments: {
        Row: {
          amount: number
          bank_account_id: string | null
          created_at: string
          created_by: string | null
          id: string
          invoice_id: string | null
          merchant_id: string
          metadata: Json | null
          method: string
          notes: string | null
          payment_date: string
          reference: string | null
          store_id: string | null
          supplier_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          bank_account_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_id?: string | null
          merchant_id: string
          metadata?: Json | null
          method?: string
          notes?: string | null
          payment_date?: string
          reference?: string | null
          store_id?: string | null
          supplier_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          bank_account_id?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_id?: string | null
          merchant_id?: string
          metadata?: Json | null
          method?: string
          notes?: string | null
          payment_date?: string
          reference?: string | null
          store_id?: string | null
          supplier_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      suppliers: {
        Row: {
          active: boolean
          address: string | null
          contact_person: string | null
          created_at: string
          email: string | null
          id: string
          merchant_id: string | null
          name: string
          notes: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          address?: string | null
          contact_person?: string | null
          created_at?: string
          email?: string | null
          id?: string
          merchant_id?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          address?: string | null
          contact_person?: string | null
          created_at?: string
          email?: string | null
          id?: string
          merchant_id?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      tax_compliance_calendar: {
        Row: {
          created_at: string
          due_date: string
          form_type: string
          id: string
          merchant_id: string
          status: string | null
          title: string
        }
        Insert: {
          created_at?: string
          due_date: string
          form_type: string
          id?: string
          merchant_id: string
          status?: string | null
          title: string
        }
        Update: {
          created_at?: string
          due_date?: string
          form_type?: string
          id?: string
          merchant_id?: string
          status?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "tax_compliance_calendar_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_ledgers: {
        Row: {
          cess: number | null
          cgst: number | null
          created_at: string
          customer_vendor_gstin: string | null
          customer_vendor_id: string | null
          id: string
          igst: number | null
          invoice_number: string | null
          merchant_id: string
          reference_id: string | null
          reference_type: string | null
          sgst: number | null
          store_id: string | null
          taxable_amount: number | null
          total_amount: number | null
          total_tax: number | null
          transaction_date: string
          transaction_type: string | null
        }
        Insert: {
          cess?: number | null
          cgst?: number | null
          created_at?: string
          customer_vendor_gstin?: string | null
          customer_vendor_id?: string | null
          id?: string
          igst?: number | null
          invoice_number?: string | null
          merchant_id: string
          reference_id?: string | null
          reference_type?: string | null
          sgst?: number | null
          store_id?: string | null
          taxable_amount?: number | null
          total_amount?: number | null
          total_tax?: number | null
          transaction_date: string
          transaction_type?: string | null
        }
        Update: {
          cess?: number | null
          cgst?: number | null
          created_at?: string
          customer_vendor_gstin?: string | null
          customer_vendor_id?: string | null
          id?: string
          igst?: number | null
          invoice_number?: string | null
          merchant_id?: string
          reference_id?: string | null
          reference_type?: string | null
          sgst?: number | null
          store_id?: string | null
          taxable_amount?: number | null
          total_amount?: number | null
          total_tax?: number | null
          transaction_date?: string
          transaction_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tax_ledgers_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tax_ledgers_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_settings: {
        Row: {
          business_name: string | null
          created_at: string
          default_gst_rate: number | null
          gst_number: string | null
          id: string
          is_tax_inclusive: boolean | null
          merchant_id: string
          pan_number: string | null
          state_code: string | null
          tax_type: string | null
          updated_at: string
        }
        Insert: {
          business_name?: string | null
          created_at?: string
          default_gst_rate?: number | null
          gst_number?: string | null
          id?: string
          is_tax_inclusive?: boolean | null
          merchant_id: string
          pan_number?: string | null
          state_code?: string | null
          tax_type?: string | null
          updated_at?: string
        }
        Update: {
          business_name?: string | null
          created_at?: string
          default_gst_rate?: number | null
          gst_number?: string | null
          id?: string
          is_tax_inclusive?: boolean | null
          merchant_id?: string
          pan_number?: string | null
          state_code?: string | null
          tax_type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tax_settings_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: true
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
        ]
      }
      uniform_reference_images: {
        Row: {
          created_at: string
          id: string
          is_current: boolean
          kind: Database["public"]["Enums"]["uniform_ref_kind"]
          merchant_id: string
          storage_path: string
          updated_at: string
          uploaded_by: string | null
          version: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_current?: boolean
          kind: Database["public"]["Enums"]["uniform_ref_kind"]
          merchant_id: string
          storage_path: string
          updated_at?: string
          uploaded_by?: string | null
          version?: number
        }
        Update: {
          created_at?: string
          id?: string
          is_current?: boolean
          kind?: Database["public"]["Enums"]["uniform_ref_kind"]
          merchant_id?: string
          storage_path?: string
          updated_at?: string
          uploaded_by?: string | null
          version?: number
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          address_line1: string | null
          city: string | null
          created_at: string
          customer_id: string | null
          face_photo_url: string | null
          fingerprint_enabled: boolean | null
          id: string
          is_active: boolean
          locality: string | null
          merchant_id: string | null
          password: string | null
          pin: string | null
          pincode: string | null
          ref_code: string | null
          role: Database["public"]["Enums"]["app_role"]
          salary: number | null
          staff_code: string | null
          state: string | null
          store_id: string | null
          suspended_at: string | null
          suspended_by: string | null
          suspension_reason: string | null
          user_id: string
          work_end_time: string | null
          work_start_time: string | null
        }
        Insert: {
          address_line1?: string | null
          city?: string | null
          created_at?: string
          customer_id?: string | null
          face_photo_url?: string | null
          fingerprint_enabled?: boolean | null
          id?: string
          is_active?: boolean
          locality?: string | null
          merchant_id?: string | null
          password?: string | null
          pin?: string | null
          pincode?: string | null
          ref_code?: string | null
          role: Database["public"]["Enums"]["app_role"]
          salary?: number | null
          staff_code?: string | null
          state?: string | null
          store_id?: string | null
          suspended_at?: string | null
          suspended_by?: string | null
          suspension_reason?: string | null
          user_id: string
          work_end_time?: string | null
          work_start_time?: string | null
        }
        Update: {
          address_line1?: string | null
          city?: string | null
          created_at?: string
          customer_id?: string | null
          face_photo_url?: string | null
          fingerprint_enabled?: boolean | null
          id?: string
          is_active?: boolean
          locality?: string | null
          merchant_id?: string | null
          password?: string | null
          pin?: string | null
          pincode?: string | null
          ref_code?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          salary?: number | null
          staff_code?: string | null
          state?: string | null
          store_id?: string | null
          suspended_at?: string | null
          suspended_by?: string | null
          suspension_reason?: string | null
          user_id?: string
          work_end_time?: string | null
          work_start_time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_roles_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_performance: {
        Row: {
          avg_lead_time_days: number
          created_at: string
          delivery_score: number
          id: string
          late_deliveries: number
          merchant_id: string
          metadata: Json
          notes: string | null
          on_time_deliveries: number
          period_end: string | null
          period_start: string | null
          quality_score: number
          rejection_percent: number
          supplier_id: string
          total_orders: number
          total_spend: number
          updated_at: string
        }
        Insert: {
          avg_lead_time_days?: number
          created_at?: string
          delivery_score?: number
          id?: string
          late_deliveries?: number
          merchant_id: string
          metadata?: Json
          notes?: string | null
          on_time_deliveries?: number
          period_end?: string | null
          period_start?: string | null
          quality_score?: number
          rejection_percent?: number
          supplier_id: string
          total_orders?: number
          total_spend?: number
          updated_at?: string
        }
        Update: {
          avg_lead_time_days?: number
          created_at?: string
          delivery_score?: number
          id?: string
          late_deliveries?: number
          merchant_id?: string
          metadata?: Json
          notes?: string | null
          on_time_deliveries?: number
          period_end?: string | null
          period_start?: string | null
          quality_score?: number
          rejection_percent?: number
          supplier_id?: string
          total_orders?: number
          total_spend?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendor_performance_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendor_performance_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouse_stock: {
        Row: {
          bin_location_id: string | null
          created_at: string
          id: string
          item_id: string
          max_stock: number | null
          metadata: Json
          min_stock: number
          quantity: number
          safety_stock: number
          updated_at: string
          value: number
          warehouse_id: string
        }
        Insert: {
          bin_location_id?: string | null
          created_at?: string
          id?: string
          item_id: string
          max_stock?: number | null
          metadata?: Json
          min_stock?: number
          quantity?: number
          safety_stock?: number
          updated_at?: string
          value?: number
          warehouse_id: string
        }
        Update: {
          bin_location_id?: string | null
          created_at?: string
          id?: string
          item_id?: string
          max_stock?: number | null
          metadata?: Json
          min_stock?: number
          quantity?: number
          safety_stock?: number
          updated_at?: string
          value?: number
          warehouse_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "warehouse_stock_bin_fk"
            columns: ["bin_location_id"]
            isOneToOne: false
            referencedRelation: "bin_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_stock_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_stock_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouse_transfer_items: {
        Row: {
          approved_qty: number
          created_at: string
          id: string
          item_id: string
          notes: string | null
          pending_qty: number
          received_qty: number
          requested_qty: number
          transfer_id: string
          transferred_qty: number
          unit_cost: number | null
          updated_at: string
        }
        Insert: {
          approved_qty?: number
          created_at?: string
          id?: string
          item_id: string
          notes?: string | null
          pending_qty?: number
          received_qty?: number
          requested_qty?: number
          transfer_id: string
          transferred_qty?: number
          unit_cost?: number | null
          updated_at?: string
        }
        Update: {
          approved_qty?: number
          created_at?: string
          id?: string
          item_id?: string
          notes?: string | null
          pending_qty?: number
          received_qty?: number
          requested_qty?: number
          transfer_id?: string
          transferred_qty?: number
          unit_cost?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "warehouse_transfer_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_transfer_items_transfer_id_fkey"
            columns: ["transfer_id"]
            isOneToOne: false
            referencedRelation: "warehouse_transfers"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouse_transfers: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          dest_warehouse_id: string
          dispatched_at: string | null
          dispatched_by: string | null
          id: string
          merchant_id: string
          metadata: Json
          notes: string | null
          received_at: string | null
          received_by: string | null
          requested_at: string | null
          requested_by: string | null
          source_warehouse_id: string
          status: Database["public"]["Enums"]["warehouse_transfer_status"]
          transfer_number: string | null
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          dest_warehouse_id: string
          dispatched_at?: string | null
          dispatched_by?: string | null
          id?: string
          merchant_id: string
          metadata?: Json
          notes?: string | null
          received_at?: string | null
          received_by?: string | null
          requested_at?: string | null
          requested_by?: string | null
          source_warehouse_id: string
          status?: Database["public"]["Enums"]["warehouse_transfer_status"]
          transfer_number?: string | null
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          dest_warehouse_id?: string
          dispatched_at?: string | null
          dispatched_by?: string | null
          id?: string
          merchant_id?: string
          metadata?: Json
          notes?: string | null
          received_at?: string | null
          received_by?: string | null
          requested_at?: string | null
          requested_by?: string | null
          source_warehouse_id?: string
          status?: Database["public"]["Enums"]["warehouse_transfer_status"]
          transfer_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "warehouse_transfers_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_transfers_dest_warehouse_id_fkey"
            columns: ["dest_warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_transfers_dispatched_by_fkey"
            columns: ["dispatched_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_transfers_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_transfers_received_by_fkey"
            columns: ["received_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_transfers_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouse_transfers_source_warehouse_id_fkey"
            columns: ["source_warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouses: {
        Row: {
          address: string | null
          capacity: number | null
          code: string | null
          created_at: string
          id: string
          is_active: boolean
          manager_id: string | null
          merchant_id: string
          metadata: Json
          name: string
          store_id: string | null
          type: Database["public"]["Enums"]["warehouse_type"]
          updated_at: string
        }
        Insert: {
          address?: string | null
          capacity?: number | null
          code?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          manager_id?: string | null
          merchant_id: string
          metadata?: Json
          name: string
          store_id?: string | null
          type?: Database["public"]["Enums"]["warehouse_type"]
          updated_at?: string
        }
        Update: {
          address?: string | null
          capacity?: number | null
          code?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          manager_id?: string | null
          merchant_id?: string
          metadata?: Json
          name?: string
          store_id?: string | null
          type?: Database["public"]["Enums"]["warehouse_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "warehouses_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouses_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "warehouses_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      wastage: {
        Row: {
          batch_id: string | null
          created_at: string
          id: string
          item_id: string
          merchant_id: string
          metadata: Json
          notes: string | null
          quantity: number
          reason: Database["public"]["Enums"]["wastage_reason"]
          reported_at: string
          reported_by: string | null
          updated_at: string
          value: number
          warehouse_id: string | null
        }
        Insert: {
          batch_id?: string | null
          created_at?: string
          id?: string
          item_id: string
          merchant_id: string
          metadata?: Json
          notes?: string | null
          quantity?: number
          reason?: Database["public"]["Enums"]["wastage_reason"]
          reported_at?: string
          reported_by?: string | null
          updated_at?: string
          value?: number
          warehouse_id?: string | null
        }
        Update: {
          batch_id?: string | null
          created_at?: string
          id?: string
          item_id?: string
          merchant_id?: string
          metadata?: Json
          notes?: string | null
          quantity?: number
          reason?: Database["public"]["Enums"]["wastage_reason"]
          reported_at?: string
          reported_by?: string | null
          updated_at?: string
          value?: number
          warehouse_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "wastage_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batch_master"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wastage_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wastage_merchant_id_fkey"
            columns: ["merchant_id"]
            isOneToOne: false
            referencedRelation: "merchants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wastage_reported_by_fkey"
            columns: ["reported_by"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wastage_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      calculate_inventory_optimization: {
        Args: { p_merchant_id: string }
        Returns: {
          category: string
          item_name: string
          recommended_action: string
          status: string
        }[]
      }
      calculate_supplier_scorecard: {
        Args: { p_merchant_id: string }
        Returns: {
          on_time_delivery_rate: number
          overall_score: number
          quality_rate: number
          supplier_id: string
          supplier_name: string
        }[]
      }
      can_access_staff_face: {
        Args: { _object_name: string }
        Returns: boolean
      }
      can_manage_store: { Args: { _store_id: string }; Returns: boolean }
      cashier_create: {
        Args: {
          _cashier_code: string
          _name: string
          _permissions?: Json
          _photo_url?: string
          _pin: string
          _store_id: string
        }
        Returns: string
      }
      cashier_set_pin: {
        Args: { _cashier_id: string; _pin: string }
        Returns: undefined
      }
      cashier_verify_pin: {
        Args: { _identifier: string; _pin: string; _store_id: string }
        Returns: {
          cashier_code: string
          id: string
          is_active: boolean
          name: string
          permissions: Json
          photo_url: string
          store_id: string
        }[]
      }
      checklist_submission_is_unlocked: {
        Args: { _sub_id: string }
        Returns: boolean
      }
      delete_store_cascade: { Args: { p_store_id: string }; Returns: undefined }
      expire_old_quotations: { Args: never; Returns: number }
      generate_demand_forecast: {
        Args: { days: number; p_merchant_id: string }
        Returns: {
          date: string
          predicted_demand: number
        }[]
      }
      generate_order_number: { Args: never; Returns: string }
      generate_po_number: { Args: never; Returns: string }
      get_abc_analysis_report: {
        Args: { p_merchant_id: string }
        Returns: {
          abc_class: string
          consumption_qty: number
          id: string
          inventory_value: number
          item_name: string
          profit: number
          revenue: number
        }[]
      }
      get_advanced_combo_performance_report: {
        Args: { p_end_date: string; p_start_date: string; p_store_id?: string }
        Returns: {
          avg_bill_impact: number
          best_performing_store: string
          combo_name: string
          items_included: number
          margin_percentage: number
          orders: number
          profit: number
          recommendation: string
          revenue: number
        }[]
      }
      get_ai_menu_recommendations: {
        Args: { p_end_date: string; p_start_date: string; p_store_id?: string }
        Returns: {
          ai_classification: string
          confidence_score: number
          current_metric: string
          expected_impact: string
          item_name: string
          recommendation_action: string
        }[]
      }
      get_ai_tax_intelligence: {
        Args: { p_merchant_id: string; p_store_id?: string }
        Returns: Json
      }
      get_audit_readiness_score: {
        Args: { p_merchant_id: string; p_store_id?: string }
        Returns: Json
      }
      get_bin_location_report: {
        Args: { p_merchant_id: string }
        Returns: {
          bin: string
          capacity_utilization: number
          id: string
          items_stored: number
          rack: string
          shelf: string
          warehouse_name: string
          zone: string
        }[]
      }
      get_closing_stock_report: {
        Args: { p_merchant_id: string }
        Returns: {
          average_cost: number
          closing_qty: number
          id: string
          inventory_value: number
          item_name: string
          store_name: string
          warehouse_name: string
        }[]
      }
      get_combo_sales_report: {
        Args: { p_end_date: string; p_start_date: string; p_store_id?: string }
        Returns: {
          avg_selling_price: number
          combo_name: string
          orders_count: number
          profit: number
          revenue: number
          store_name: string
          usage_count: number
        }[]
      }
      get_contribution_margin_report: {
        Args: { p_end_date: string; p_start_date: string; p_store_id?: string }
        Returns: {
          contribution: number
          contribution_percentage: number
          item_name: string
          net_profit: number
          rank: number
          revenue: number
          variable_cost: number
        }[]
      }
      get_coupon_usage_report: {
        Args: { p_merchant_id: string }
        Returns: {
          avg_order_value: number
          coupon_code: string
          coupon_id: string
          coupon_name: string
          created_date: string
          customers_used: number
          discount_given: number
          revenue_generated: number
          status: string
          times_used: number
          valid_from: string
          valid_to: string
        }[]
      }
      get_customer_acquisition_report: {
        Args: { p_merchant_id: string }
        Returns: {
          customer_id: string
          customer_name: string
          first_order_date: string
          first_order_value: number
          lifetime_value: number
          registration_date: string
          retention_status: string
          source: string
          total_orders: number
          total_profit: number
          total_revenue: number
        }[]
      }
      get_customer_birthday_report: {
        Args: { p_merchant_id: string }
        Returns: {
          age: number
          anniversary_date: string
          customer_id: string
          customer_name: string
          date_of_birth: string
          email: string
          last_visit: string
          lifetime_value: number
          phone: string
          store_id: string
          store_name: string
          upcoming_in_days: number
          wedding_anniversary: string
        }[]
      }
      get_customer_clv_report: {
        Args: { p_merchant_id: string }
        Returns: {
          avg_order_value: number
          cancelled_orders: number
          completed_orders: number
          credit_paid: number
          credit_used: number
          customer_id: string
          customer_name: string
          customer_since: string
          email: string
          estimated_clv: number
          last_order_date: string
          mobile: string
          outstanding_credit: number
          purchase_frequency: number
          total_orders: number
          total_profit: number
          total_revenue: number
        }[]
      }
      get_customer_credit_aging_report: {
        Args: { p_merchant_id: string }
        Returns: {
          credit_limit: number
          customer_id: string
          customer_name: string
          days_0_30: number
          days_180_plus: number
          days_31_60: number
          days_61_90: number
          days_91_180: number
          last_bill: string
          last_payment: string
          mobile: string
          outstanding: number
        }[]
      }
      get_customer_csat_report: {
        Args: { p_merchant_id: string }
        Returns: {
          category: string
          comments: string
          created_at: string
          customer_id: string
          customer_name: string
          id: string
          nps_category: string
          order_id: string
          order_number: string
          rating_scale: number
          rating_value: number
          store_id: string
          store_name: string
        }[]
      }
      get_customer_feedback_report: {
        Args: { p_merchant_id: string }
        Returns: {
          assigned_to: string
          comments: string
          created_at: string
          customer_id: string
          customer_name: string
          id: string
          order_id: string
          order_number: string
          rating: number
          resolution_status: string
          resolution_time: string
          source: string
          status: string
          store_id: string
          store_name: string
          type: string
        }[]
      }
      get_customer_loyalty_report: {
        Args: { p_merchant_id: string }
        Returns: {
          current_points: number
          customer_id: string
          customer_name: string
          earned_points: number
          expired_points: number
          last_visit: string
          membership_date: string
          redeemed_points: number
          tier: string
          total_orders: number
          total_revenue: number
        }[]
      }
      get_customer_profitability_report: {
        Args: { p_merchant_id: string }
        Returns: {
          avg_bill: number
          credit_balance: number
          customer_id: string
          customer_name: string
          discount_given: number
          gross_profit: number
          margin_percent: number
          net_profit: number
          orders: number
          ranking: number
          refund_amount: number
          revenue: number
        }[]
      }
      get_customer_segmentation_report: {
        Args: { p_merchant_id: string }
        Returns: {
          avg_spend: number
          credit_balance: number
          customer_id: string
          customer_name: string
          last_visit: string
          orders: number
          profit: number
          revenue: number
          segment: string
        }[]
      }
      get_cycle_count_report: {
        Args: { p_merchant_id: string }
        Returns: {
          assigned_user: string
          date: string
          id: string
          items_counted: number
          schedule_name: string
          status: string
          variance_value: number
          warehouse_name: string
        }[]
      }
      get_dead_stock_report: {
        Args: { p_merchant_id: string }
        Returns: {
          current_qty: number
          days_without_movement: number
          id: string
          inventory_value: number
          item_name: string
          last_movement: string
          last_purchase: string
          last_sale: string
          suggested_action: string
          warehouse_name: string
        }[]
      }
      get_einvoice_analytics: {
        Args: { p_merchant_id: string; p_store_id?: string }
        Returns: Json
      }
      get_expiry_report: {
        Args: { p_merchant_id: string }
        Returns: {
          batch_number: string
          days_remaining: number
          expiry_date: string
          id: string
          inventory_value: number
          item_name: string
          near_expiry_qty: number
          suggested_action: string
          warehouse_name: string
        }[]
      }
      get_food_cost_report: {
        Args: { p_merchant_id: string }
        Returns: {
          food_cost_percent: number
          id: string
          ingredient_cost: number
          margin_percent: number
          menu_item: string
          profit: number
          recipe_name: string
          selling_price: number
          trend_percent: number
        }[]
      }
      get_grn_report: {
        Args: { p_merchant_id: string }
        Returns: {
          grn_number: string
          id: string
          pending_qty: number
          po_number: string
          received_by: string
          received_qty: number
          rejected_qty: number
          short_qty: number
          status: string
          supplier_name: string
        }[]
      }
      get_gst_dashboard_kpis: {
        Args: {
          p_end_date: string
          p_merchant_id: string
          p_start_date: string
          p_store_id?: string
        }
        Returns: Json
      }
      get_gstr1_report: {
        Args: {
          p_end_date: string
          p_merchant_id: string
          p_start_date: string
          p_store_id?: string
        }
        Returns: {
          cess: number
          cgst: number
          customer_vendor_gstin: string
          igst: number
          invoice_number: string
          sgst: number
          taxable_amount: number
          total_amount: number
          transaction_date: string
          transaction_type: string
        }[]
      }
      get_gstr2b_report: {
        Args: {
          p_end_date: string
          p_merchant_id: string
          p_start_date: string
          p_store_id?: string
        }
        Returns: {
          cess: number
          cgst: number
          customer_vendor_gstin: string
          igst: number
          invoice_number: string
          sgst: number
          taxable_amount: number
          total_amount: number
          transaction_date: string
          transaction_type: string
        }[]
      }
      get_gstr3b_summary: {
        Args: {
          p_end_date: string
          p_merchant_id: string
          p_start_date: string
          p_store_id?: string
        }
        Returns: {
          inward_tax: number
          inward_taxable: number
          itc_available: number
          net_payable: number
          outward_tax: number
          outward_taxable: number
        }[]
      }
      get_high_margin_items_report: {
        Args: { p_end_date: string; p_start_date: string; p_store_id?: string }
        Returns: {
          category_name: string
          item_name: string
          margin_percentage: number
          profit: number
          quantity_sold: number
          rank: number
          recipe_cost: number
          recommendation: string
          revenue: number
          selling_price: number
          store_name: string
        }[]
      }
      get_high_value_customers_report: {
        Args: { p_merchant_id: string }
        Returns: {
          avg_bill: number
          customer_id: string
          customer_name: string
          last_visit: string
          lifetime_profit: number
          lifetime_revenue: number
          outstanding_credit: number
          ranking: number
          visits: number
        }[]
      }
      get_inactive_customers_report: {
        Args: { p_days_inactive?: number; p_merchant_id: string }
        Returns: {
          customer_id: string
          customer_name: string
          email: string
          inactive_days: number
          last_visit: string
          lifetime_value: number
          phone: string
          store_id: string
          store_name: string
          total_orders: number
        }[]
      }
      get_inventory_turnover_report: {
        Args: { p_merchant_id: string }
        Returns: {
          category: string
          id: string
          inventory_days: number
          inventory_value: number
          item_name: string
          rank: number
          turnover_ratio: number
          warehouse_name: string
        }[]
      }
      get_item_popularity_report: {
        Args: { p_end_date: string; p_start_date: string; p_store_id?: string }
        Returns: {
          category_name: string
          item_name: string
          orders: number
          popularity_score: number
          rank: number
          repeat_orders: number
          revenue: number
          store_name: string
        }[]
      }
      get_item_profitability_report: {
        Args: { p_end_date: string; p_start_date: string; p_store_id?: string }
        Returns: {
          gross_profit: number
          item_name: string
          margin_percentage: number
          orders_count: number
          recipe_cost: number
          selling_price: number
          store_name: string
          total_profit: number
          total_revenue: number
        }[]
      }
      get_landed_cost_report: {
        Args: { p_merchant_id: string }
        Returns: {
          cost_per_item: number
          duty: number
          freight: number
          grn_number: string
          id: string
          insurance: number
          loading: number
          other_charges: number
          total_landed_cost: number
          unloading: number
        }[]
      }
      get_lead_time_report: {
        Args: { p_merchant_id: string }
        Returns: {
          average_lead_time: number
          delayed_deliveries: number
          dispatch_date: string
          id: string
          lead_time_days: number
          on_time_percent: number
          po_date: string
          receive_date: string
          supplier_name: string
        }[]
      }
      get_least_selling_items_report: {
        Args: {
          p_category_id?: string
          p_end_date: string
          p_start_date: string
          p_store_id?: string
        }
        Returns: {
          category_name: string
          item_id: string
          last_sold: string
          name: string
          orders_count: number
          profit: number
          quantity_sold: number
          rank: number
          revenue: number
          store_name: string
        }[]
      }
      get_low_margin_items_report: {
        Args: { p_end_date: string; p_start_date: string; p_store_id?: string }
        Returns: {
          category_name: string
          food_cost_percentage: number
          item_name: string
          margin_percentage: number
          profit: number
          quantity_sold: number
          rank: number
          recipe_cost: number
          recommendation: string
          revenue: number
          selling_price: number
          store_name: string
        }[]
      }
      get_loyalty_points_ledger_report: {
        Args: { p_merchant_id: string }
        Returns: {
          balance_after: number
          customer_id: string
          customer_name: string
          order_number: string
          points: number
          reference: string
          store_name: string
          transaction_date: string
          transaction_id: string
          transaction_type: string
        }[]
      }
      get_menu_discount_analysis_report: {
        Args: { p_end_date: string; p_start_date: string; p_store_id?: string }
        Returns: {
          category_name: string
          coupon_used: number
          discount_given: number
          discount_percentage: number
          item_name: string
          manual_discount: number
          profit_impact: number
          revenue_after_discount: number
          revenue_before_discount: number
          store_name: string
        }[]
      }
      get_menu_engineering_report: {
        Args: { p_end_date: string; p_start_date: string; p_store_id?: string }
        Returns: {
          classification: string
          item_name: string
          popularity_score: number
          profitability_score: number
          recommendation: string
        }[]
      }
      get_menu_executive_stats: {
        Args: { p_store_id?: string }
        Returns: {
          contribution_percentage: number
          forecast_value: number
          growth_percentage: number
          menu_profit: number
          menu_revenue: number
          profit_percentage: number
          top_category: string
          top_combo: string
          top_item: string
          top_modifier: string
        }[]
      }
      get_menu_forecast_report: {
        Args: { p_end_date: string; p_start_date: string; p_store_id?: string }
        Returns: {
          actual_revenue: number
          ai_suggestion: string
          forecast_accuracy: number
          growth_percentage: number
          item_name: string
          period: string
          predicted_orders: number
          predicted_revenue: number
        }[]
      }
      get_menu_health_score: {
        Args: { p_store_id?: string }
        Returns: {
          business_score: number
          category_score: number
          forecast_accuracy: number
          growth_score: number
          health_score: number
          popularity_score: number
          profitability_score: number
          recipe_score: number
        }[]
      }
      get_menu_mix_report: {
        Args: { p_end_date: string; p_start_date: string; p_store_id?: string }
        Returns: {
          contribution_percentage: number
          item_mix_percentage: number
          item_name: string
          profit_percentage: number
          quantity_percentage: number
          revenue_percentage: number
        }[]
      }
      get_menu_performance_trend_report: {
        Args: { p_end_date: string; p_start_date: string; p_store_id?: string }
        Returns: {
          avg_selling_price: number
          growth_percentage: number
          orders: number
          period: string
          profit: number
          quantity: number
          revenue: number
        }[]
      }
      get_menu_profitability_report: {
        Args: { p_end_date: string; p_start_date: string; p_store_id?: string }
        Returns: {
          avg_margin: number
          category_name: string
          menu_profit: number
          profit_percentage: number
          total_cogs: number
          total_revenue: number
        }[]
      }
      get_menu_revenue_contribution_report: {
        Args: { p_end_date: string; p_start_date: string; p_store_id?: string }
        Returns: {
          category_name: string
          item_name: string
          orders: number
          profit: number
          profit_contribution_percentage: number
          rank: number
          revenue: number
          revenue_contribution_percentage: number
          store_name: string
        }[]
      }
      get_merchant_features: { Args: { _user_id: string }; Returns: string[] }
      get_merchant_plan: { Args: { _user_id: string }; Returns: string }
      get_modifier_profitability_report: {
        Args: { p_end_date: string; p_start_date: string; p_store_id?: string }
        Returns: {
          attachment_rate: number
          category_name: string
          margin_percentage: number
          modifier_name: string
          orders: number
          profit: number
          quantity: number
          recommendation: string
          revenue: number
          store_name: string
        }[]
      }
      get_modifier_sales_report: {
        Args: { p_end_date: string; p_start_date: string; p_store_id?: string }
        Returns: {
          category_name: string
          modifier_name: string
          orders_count: number
          profit: number
          quantity: number
          revenue: number
          store_name: string
          usage_percentage: number
        }[]
      }
      get_new_menu_performance_report: {
        Args: { p_end_date: string; p_start_date: string; p_store_id?: string }
        Returns: {
          avg_bill_impact: number
          customer_rating: number
          days_since_launch: number
          item_name: string
          launch_date: string
          orders: number
          profit: number
          recommendation: string
          repeat_orders: number
          revenue: number
        }[]
      }
      get_opening_stock_report: {
        Args: { p_merchant_id: string }
        Returns: {
          date: string
          id: string
          item_name: string
          opening_cost: number
          opening_qty: number
          opening_value: number
          store_name: string
          warehouse_name: string
        }[]
      }
      get_overstock_analysis_report: {
        Args: { p_merchant_id: string }
        Returns: {
          current_stock: number
          excess_qty: number
          holding_cost: number
          id: string
          ideal_stock: number
          inventory_value: number
          item_name: string
          suggested_action: string
          warehouse_name: string
        }[]
      }
      get_ppv_report: {
        Args: { p_merchant_id: string }
        Returns: {
          id: string
          item_name: string
          purchase_cost: number
          standard_cost: number
          supplier_name: string
          variance_percent: number
          variance_value: number
          warehouse_name: string
        }[]
      }
      get_production_report: {
        Args: { p_merchant_id: string }
        Returns: {
          consumed_qty: number
          date: string
          id: string
          produced_by: string
          produced_qty: number
          production_batch: string
          production_cost: number
          recipe_name: string
          yield_percent: number
        }[]
      }
      get_purchase_analysis_report: {
        Args: { p_merchant_id: string }
        Returns: {
          category: string
          id: string
          month: string
          monthly_purchase: number
          purchase_growth_percent: number
          store_name: string
          supplier_name: string
        }[]
      }
      get_purchase_comparison_report: {
        Args: { p_merchant_id: string }
        Returns: {
          brand: string
          category: string
          current_month_qty: number
          current_month_value: number
          growth_percent: number
          id: string
          previous_month_value: number
        }[]
      }
      get_purchase_cost_analysis_report: {
        Args: { p_merchant_id: string }
        Returns: {
          average_cost: number
          id: string
          item_name: string
          last_cost: number
          purchase_cost: number
          standard_cost: number
          supplier_name: string
          variance: number
        }[]
      }
      get_purchase_register: {
        Args: { p_merchant_id: string }
        Returns: {
          amount: number
          discount: number
          grn_number: string
          id: string
          invoice_number: string
          payment_status: string
          po_number: string
          purchase_date: string
          received_date: string
          supplier_name: string
          tax: number
        }[]
      }
      get_purchase_report_summary: {
        Args: { p_merchant_id: string }
        Returns: {
          average_purchase: number
          purchase_count: number
          top_category: string
          top_supplier: string
          total_purchase_value: number
        }[]
      }
      get_purchase_return_report: {
        Args: { p_merchant_id: string }
        Returns: {
          amount: number
          approval_status: string
          created_by: string
          id: string
          invoice_number: string
          items_count: number
          reason: string
          return_number: string
          supplier_name: string
          total_qty: number
        }[]
      }
      get_recipe_consumption_report: {
        Args: { p_merchant_id: string }
        Returns: {
          cost: number
          finished_product: string
          food_cost_percent: number
          gross_profit: number
          id: string
          ingredients_list: string
          raw_material_consumption: number
          recipe_name: string
          revenue: number
        }[]
      }
      get_recipe_cost_vs_price_report: {
        Args: { p_end_date: string; p_start_date: string; p_store_id?: string }
        Returns: {
          absolute_profit: number
          food_cost_percentage: number
          item_name: string
          margin_percentage: number
          recipe_cost: number
          selling_price: number
          variance: number
        }[]
      }
      get_rfq_analysis_report: {
        Args: { p_merchant_id: string }
        Returns: {
          approval_date: string
          comparison_notes: string
          id: string
          quoted_price: number
          rejected_supplier: string
          rfq_number: string
          savings: number
          selected_supplier: string
          supplier_name: string
        }[]
      }
      get_safety_stock_report: {
        Args: { p_merchant_id: string }
        Returns: {
          current_stock: number
          id: string
          item_name: string
          max_stock: number
          min_stock: number
          risk_level: string
          safety_stock: number
          suggested_purchase: number
          warehouse_name: string
        }[]
      }
      get_seasonal_item_performance_report: {
        Args: { p_end_date: string; p_start_date: string; p_store_id?: string }
        Returns: {
          category_name: string
          growth_vs_offseason: number
          item_name: string
          orders: number
          popularity_score: number
          profit: number
          recommendation: string
          revenue: number
          season: string
        }[]
      }
      get_shrinkage_report: {
        Args: { p_merchant_id: string }
        Returns: {
          difference: number
          difference_percent: number
          id: string
          item_name: string
          physical_stock: number
          reason: string
          shrinkage_value: number
          system_stock: number
          warehouse_name: string
        }[]
      }
      get_stock_adjustment_report: {
        Args: { p_merchant_id: string }
        Returns: {
          adjustment_number: string
          adjustment_type: string
          date: string
          difference: number
          id: string
          item_name: string
          new_stock: number
          previous_stock: number
          reason: string
          store_name: string
          user_name: string
        }[]
      }
      get_stock_aging_report: {
        Args: { p_merchant_id: string }
        Returns: {
          age_days: number
          batch_number: string
          bucket: string
          current_qty: number
          id: string
          inventory_value: number
          item_name: string
          last_movement: string
          warehouse_name: string
        }[]
      }
      get_stock_consumption_report: {
        Args: { p_merchant_id: string }
        Returns: {
          consumed_qty: number
          consumption_value: number
          date: string
          id: string
          item_name: string
          sku: string
          user_name: string
          warehouse_name: string
        }[]
      }
      get_stock_ledger_report: {
        Args: { p_merchant_id: string }
        Returns: {
          closing_qty: number
          date: string
          id: string
          in_qty: number
          item_name: string
          opening_qty: number
          out_qty: number
          reference: string
          sku: string
          store_name: string
          transaction_type: string
          user_name: string
          warehouse_name: string
        }[]
      }
      get_stock_reservation_report: {
        Args: { p_merchant_id: string }
        Returns: {
          customer_name: string
          id: string
          order_reference: string
          pending_qty: number
          released_qty: number
          reserved_qty: number
          status: string
          warehouse_name: string
        }[]
      }
      get_supplier_fill_rate_report: {
        Args: { p_merchant_id: string }
        Returns: {
          delivery_score: number
          fill_rate_percent: number
          id: string
          ordered_qty: number
          received_qty: number
          rejected_qty: number
          short_supply: number
          supplier_name: string
        }[]
      }
      get_tax_forecast: {
        Args: { p_merchant_id: string; p_store_id?: string }
        Returns: Json
      }
      get_tax_health_score: {
        Args: { p_merchant_id: string; p_store_id?: string }
        Returns: Json
      }
      get_user_customer_id: { Args: { _user_id: string }; Returns: string }
      get_user_merchant_id: { Args: { _user_id: string }; Returns: string }
      get_vendor_purchase_report: {
        Args: { p_merchant_id: string }
        Returns: {
          average_lead_time: number
          grn_number: string
          id: string
          invoice_number: string
          outstanding: number
          payments: number
          po_number: string
          returns: number
          supplier_name: string
        }[]
      }
      get_vendor_wise_purchase_report: {
        Args: { p_merchant_id: string }
        Returns: {
          average_purchase: number
          id: string
          outstanding_amount: number
          purchase_amount: number
          purchase_orders: number
          supplier_name: string
          supplier_rating: number
        }[]
      }
      get_wastage_report: {
        Args: { p_merchant_id: string }
        Returns: {
          approved_by: string
          category: string
          cost: number
          date: string
          id: string
          item_name: string
          qty: number
          reason: string
          warehouse_name: string
        }[]
      }
      get_xyz_analysis_report: {
        Args: { p_merchant_id: string }
        Returns: {
          demand: number
          forecast: number
          id: string
          item_name: string
          stock_level: number
          suggested_stock: number
          variance_percent: number
          xyz_class: string
        }[]
      }
      has_any_active_role: { Args: { _user_id: string }; Returns: boolean }
      has_any_role: {
        Args: {
          _roles: Database["public"]["Enums"]["app_role"][]
          _user_id: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_owner_or_admin: { Args: { _user: string }; Returns: boolean }
      run_gst_audit: {
        Args: {
          p_end_date: string
          p_merchant_id: string
          p_start_date: string
          p_store_id?: string
        }
        Returns: Json
      }
      run_gst_reconciliation: {
        Args: {
          p_end_date: string
          p_merchant_id: string
          p_start_date: string
          p_store_id?: string
        }
        Returns: Json
      }
      seed_default_coa: { Args: { _merchant_id: string }; Returns: undefined }
      user_in_merchant: {
        Args: { _merchant_id: string; _user_id: string }
        Returns: boolean
      }
      user_merchant_ids: {
        Args: { _user: string }
        Returns: {
          merchant_id: string
        }[]
      }
      user_role_names: {
        Args: { _user: string }
        Returns: {
          role: string
        }[]
      }
      verify_staff_pin: {
        Args: { p_pin: string; p_staff_code: string }
        Returns: {
          customer_id: string
          role: string
          store_id: string
          user_id: string
        }[]
      }
    }
    Enums: {
      app_role:
        | "super_admin"
        | "owner"
        | "manager"
        | "cashier"
        | "admin"
        | "store_manager"
        | "staff"
        | "merchant"
        | "accountant"
      batch_status: "ACTIVE" | "EXPIRED" | "QUARANTINE" | "DEPLETED"
      cash_session_status: "open" | "closed"
      checklist_answer_type:
        | "yes_no"
        | "text"
        | "number"
        | "photo"
        | "multi_photo"
        | "signature"
        | "video"
      checklist_frequency:
        | "daily"
        | "weekly"
        | "monthly"
        | "before_shift"
        | "after_shift"
        | "custom"
        | "once"
      checklist_input_type: "tick" | "image" | "tick_image" | "text" | "number"
      checklist_submission_status:
        | "pending"
        | "ai_pass"
        | "ai_fail"
        | "approved"
        | "rejected"
        | "review_required"
      cycle_count_frequency: "DAILY" | "WEEKLY" | "MONTHLY" | "QUARTERLY"
      grn_status: "DRAFT" | "PARTIAL" | "COMPLETED" | "CANCELLED"
      kot_station: "kitchen" | "bar" | "other"
      kot_status: "new" | "preparing" | "ready" | "served" | "cancelled"
      merchant_plan: "basic" | "gold" | "platinum"
      order_status: "open" | "completed" | "voided" | "refunded" | "cancelled"
      order_type: "dine_in" | "takeaway" | "delivery"
      payment_method: "cash" | "card" | "upi" | "credit" | "other"
      purchase_return_status:
        | "DRAFT"
        | "APPROVED"
        | "DISPATCHED"
        | "COMPLETED"
        | "CANCELLED"
      quotation_status:
        | "draft"
        | "pending"
        | "approved"
        | "rejected"
        | "expired"
        | "converted"
      reservation_status: "ACTIVE" | "FULFILLED" | "RELEASED" | "EXPIRED"
      reservation_type:
        | "CUSTOMER_ORDER"
        | "KITCHEN_ORDER"
        | "ONLINE_ORDER"
        | "TRANSFER"
        | "OTHER"
      rfq_status:
        | "DRAFT"
        | "SENT"
        | "RESPONDED"
        | "AWARDED"
        | "CLOSED"
        | "CANCELLED"
      serial_status:
        | "IN_STOCK"
        | "SOLD"
        | "RETURNED"
        | "DAMAGED"
        | "TRANSFERRED"
      stock_take_status: "DRAFT" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED"
      subscription_status: "active" | "expired" | "cancelled"
      table_status: "available" | "occupied" | "reserved" | "cleaning"
      uniform_ref_kind:
        | "front"
        | "back"
        | "side"
        | "cap"
        | "apron"
        | "shoes"
        | "gloves"
        | "other"
      warehouse_transfer_status:
        | "REQUESTED"
        | "APPROVED"
        | "DISPATCHED"
        | "RECEIVED"
        | "CANCELLED"
      warehouse_type:
        | "RAW_MATERIAL"
        | "FINISHED_GOODS"
        | "KITCHEN"
        | "CENTRAL"
        | "STORE"
      wastage_reason:
        | "DAMAGE"
        | "EXPIRED"
        | "SPILLAGE"
        | "THEFT"
        | "QUALITY"
        | "OTHER"
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
      app_role: [
        "super_admin",
        "owner",
        "manager",
        "cashier",
        "admin",
        "store_manager",
        "staff",
        "merchant",
        "accountant",
      ],
      batch_status: ["ACTIVE", "EXPIRED", "QUARANTINE", "DEPLETED"],
      cash_session_status: ["open", "closed"],
      checklist_answer_type: [
        "yes_no",
        "text",
        "number",
        "photo",
        "multi_photo",
        "signature",
        "video",
      ],
      checklist_frequency: [
        "daily",
        "weekly",
        "monthly",
        "before_shift",
        "after_shift",
        "custom",
        "once",
      ],
      checklist_input_type: ["tick", "image", "tick_image", "text", "number"],
      checklist_submission_status: [
        "pending",
        "ai_pass",
        "ai_fail",
        "approved",
        "rejected",
        "review_required",
      ],
      cycle_count_frequency: ["DAILY", "WEEKLY", "MONTHLY", "QUARTERLY"],
      grn_status: ["DRAFT", "PARTIAL", "COMPLETED", "CANCELLED"],
      kot_station: ["kitchen", "bar", "other"],
      kot_status: ["new", "preparing", "ready", "served", "cancelled"],
      merchant_plan: ["basic", "gold", "platinum"],
      order_status: ["open", "completed", "voided", "refunded", "cancelled"],
      order_type: ["dine_in", "takeaway", "delivery"],
      payment_method: ["cash", "card", "upi", "credit", "other"],
      purchase_return_status: [
        "DRAFT",
        "APPROVED",
        "DISPATCHED",
        "COMPLETED",
        "CANCELLED",
      ],
      quotation_status: [
        "draft",
        "pending",
        "approved",
        "rejected",
        "expired",
        "converted",
      ],
      reservation_status: ["ACTIVE", "FULFILLED", "RELEASED", "EXPIRED"],
      reservation_type: [
        "CUSTOMER_ORDER",
        "KITCHEN_ORDER",
        "ONLINE_ORDER",
        "TRANSFER",
        "OTHER",
      ],
      rfq_status: [
        "DRAFT",
        "SENT",
        "RESPONDED",
        "AWARDED",
        "CLOSED",
        "CANCELLED",
      ],
      serial_status: ["IN_STOCK", "SOLD", "RETURNED", "DAMAGED", "TRANSFERRED"],
      stock_take_status: ["DRAFT", "IN_PROGRESS", "COMPLETED", "CANCELLED"],
      subscription_status: ["active", "expired", "cancelled"],
      table_status: ["available", "occupied", "reserved", "cleaning"],
      uniform_ref_kind: [
        "front",
        "back",
        "side",
        "cap",
        "apron",
        "shoes",
        "gloves",
        "other",
      ],
      warehouse_transfer_status: [
        "REQUESTED",
        "APPROVED",
        "DISPATCHED",
        "RECEIVED",
        "CANCELLED",
      ],
      warehouse_type: [
        "RAW_MATERIAL",
        "FINISHED_GOODS",
        "KITCHEN",
        "CENTRAL",
        "STORE",
      ],
      wastage_reason: [
        "DAMAGE",
        "EXPIRED",
        "SPILLAGE",
        "THEFT",
        "QUALITY",
        "OTHER",
      ],
    },
  },
} as const
