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
      ai_conversations: {
        Row: {
          context: string
          created_at: string
          id: string
          session_key: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          context?: string
          created_at?: string
          id?: string
          session_key: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          context?: string
          created_at?: string
          id?: string
          session_key?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          role: string
          user_id: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_run_logs: {
        Row: {
          context: string
          conversation_id: string | null
          error: string | null
          events: Json
          final_text: string | null
          finished_at: string | null
          id: string
          model: string
          outcome: string
          project_id: string | null
          rounds: number
          started_at: string
          tool_calls: Json
          user_id: string | null
          workspace_id: string | null
        }
        Insert: {
          context?: string
          conversation_id?: string | null
          error?: string | null
          events?: Json
          final_text?: string | null
          finished_at?: string | null
          id?: string
          model: string
          outcome?: string
          project_id?: string | null
          rounds?: number
          started_at?: string
          tool_calls?: Json
          user_id?: string | null
          workspace_id?: string | null
        }
        Update: {
          context?: string
          conversation_id?: string | null
          error?: string | null
          events?: Json
          final_text?: string | null
          finished_at?: string | null
          id?: string
          model?: string
          outcome?: string
          project_id?: string | null
          rounds?: number
          started_at?: string
          tool_calls?: Json
          user_id?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_run_logs_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_skills: {
        Row: {
          active: boolean
          body: string
          description: string
          examples: Json
          id: string
          key: string
          title: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          body: string
          description: string
          examples?: Json
          id?: string
          key: string
          title: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          body?: string
          description?: string
          examples?: Json
          id?: string
          key?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_memory: {
        Row: {
          conversation_id: string
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          conversation_id: string
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          conversation_id?: string
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "ai_memory_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "ai_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_calibrations: {
        Row: {
          _deleted: boolean
          asset_id: string
          calibration_date: string
          calibration_status: Database["public"]["Enums"]["calibration_status"]
          certificate_number: string | null
          certificate_path: string | null
          created_at: string
          created_by: string | null
          id: string
          next_calibration_date: string | null
          notes: string | null
          provider_name: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          _deleted?: boolean
          asset_id: string
          calibration_date: string
          calibration_status?: Database["public"]["Enums"]["calibration_status"]
          certificate_number?: string | null
          certificate_path?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          next_calibration_date?: string | null
          notes?: string | null
          provider_name?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          _deleted?: boolean
          asset_id?: string
          calibration_date?: string
          calibration_status?: Database["public"]["Enums"]["calibration_status"]
          certificate_number?: string | null
          certificate_path?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          next_calibration_date?: string | null
          notes?: string | null
          provider_name?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "asset_calibrations_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_calibrations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      asset_maintenance_events: {
        Row: {
          _deleted: boolean
          asset_id: string
          cost: number
          created_at: string
          created_by: string | null
          description: string
          id: string
          provider_name: string | null
          serviced_on: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          _deleted?: boolean
          asset_id: string
          cost?: number
          created_at?: string
          created_by?: string | null
          description: string
          id?: string
          provider_name?: string | null
          serviced_on: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          _deleted?: boolean
          asset_id?: string
          cost?: number
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          provider_name?: string | null
          serviced_on?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "asset_maintenance_events_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "asset_maintenance_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      assets: {
        Row: {
          _deleted: boolean
          archived_at: string | null
          asset_code: string | null
          category: string | null
          created_at: string
          created_by: string | null
          current_value: number | null
          id: string
          kind: Database["public"]["Enums"]["asset_kind"]
          make: string | null
          metadata: Json
          model: string | null
          name: string
          purchase_cost: number | null
          purchase_date: string | null
          serial_number: string | null
          status: Database["public"]["Enums"]["asset_status"]
          updated_at: string
          workspace_id: string
        }
        Insert: {
          _deleted?: boolean
          archived_at?: string | null
          asset_code?: string | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          current_value?: number | null
          id?: string
          kind?: Database["public"]["Enums"]["asset_kind"]
          make?: string | null
          metadata?: Json
          model?: string | null
          name: string
          purchase_cost?: number | null
          purchase_date?: string | null
          serial_number?: string | null
          status?: Database["public"]["Enums"]["asset_status"]
          updated_at?: string
          workspace_id: string
        }
        Update: {
          _deleted?: boolean
          archived_at?: string | null
          asset_code?: string | null
          category?: string | null
          created_at?: string
          created_by?: string | null
          current_value?: number | null
          id?: string
          kind?: Database["public"]["Enums"]["asset_kind"]
          make?: string | null
          metadata?: Json
          model?: string | null
          name?: string
          purchase_cost?: number | null
          purchase_date?: string | null
          serial_number?: string | null
          status?: Database["public"]["Enums"]["asset_status"]
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assets_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      attachment_tags: {
        Row: {
          attachment_id: string
          created_at: string
          tag_id: string
        }
        Insert: {
          attachment_id: string
          created_at?: string
          tag_id: string
        }
        Update: {
          attachment_id?: string
          created_at?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attachment_tags_attachment_id_fkey"
            columns: ["attachment_id"]
            isOneToOne: false
            referencedRelation: "attachments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attachment_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
        ]
      }
      attachment_versions: {
        Row: {
          attachment_id: string
          content_hash: string | null
          created_at: string
          created_by: string | null
          id: string
          size_bytes: number | null
          storage_path: string
          workspace_id: string
        }
        Insert: {
          attachment_id: string
          content_hash?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          size_bytes?: number | null
          storage_path: string
          workspace_id: string
        }
        Update: {
          attachment_id?: string
          content_hash?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          size_bytes?: number | null
          storage_path?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attachment_versions_attachment_id_fkey"
            columns: ["attachment_id"]
            isOneToOne: false
            referencedRelation: "attachments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attachment_versions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      attachments: {
        Row: {
          anchored_at: string | null
          bucket_name: string
          chain_network: string | null
          chain_program_address: string | null
          chain_status: Database["public"]["Enums"]["attachment_chain_status"]
          chain_tx_signature: string | null
          content_hash: string | null
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          entity_id: string
          entity_table: string
          folder_id: string | null
          id: string
          mime_type: string | null
          size_bytes: number | null
          storage_path: string
          storage_tier: Database["public"]["Enums"]["attachment_storage_tier"]
          updated_at: string
          uploaded_by: string | null
          visibility: Database["public"]["Enums"]["attachment_visibility"]
          workspace_id: string
        }
        Insert: {
          anchored_at?: string | null
          bucket_name: string
          chain_network?: string | null
          chain_program_address?: string | null
          chain_status?: Database["public"]["Enums"]["attachment_chain_status"]
          chain_tx_signature?: string | null
          content_hash?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          entity_id: string
          entity_table: string
          folder_id?: string | null
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          storage_path: string
          storage_tier?: Database["public"]["Enums"]["attachment_storage_tier"]
          updated_at?: string
          uploaded_by?: string | null
          visibility?: Database["public"]["Enums"]["attachment_visibility"]
          workspace_id: string
        }
        Update: {
          anchored_at?: string | null
          bucket_name?: string
          chain_network?: string | null
          chain_program_address?: string | null
          chain_status?: Database["public"]["Enums"]["attachment_chain_status"]
          chain_tx_signature?: string | null
          content_hash?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          entity_id?: string
          entity_table?: string
          folder_id?: string | null
          id?: string
          mime_type?: string | null
          size_bytes?: number | null
          storage_path?: string
          storage_tier?: Database["public"]["Enums"]["attachment_storage_tier"]
          updated_at?: string
          uploaded_by?: string | null
          visibility?: Database["public"]["Enums"]["attachment_visibility"]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attachments_folder_id_fkey"
            columns: ["folder_id"]
            isOneToOne: false
            referencedRelation: "folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attachments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          content: string
          created_at: string
          edited_at: string | null
          id: string
          user_id: string | null
          workspace_id: string
        }
        Insert: {
          content: string
          created_at?: string
          edited_at?: string | null
          id?: string
          user_id?: string | null
          workspace_id: string
        }
        Update: {
          content?: string
          created_at?: string
          edited_at?: string | null
          id?: string
          user_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          _deleted: boolean
          archived_at: string | null
          contact_type: string | null
          created_at: string
          created_by: string | null
          email: string | null
          full_name: string
          id: string
          last_contact_at: string | null
          notes: string | null
          organization_id: string | null
          phone: string | null
          title: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          _deleted?: boolean
          archived_at?: string | null
          contact_type?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          full_name: string
          id?: string
          last_contact_at?: string | null
          notes?: string | null
          organization_id?: string | null
          phone?: string | null
          title?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          _deleted?: boolean
          archived_at?: string | null
          contact_type?: string | null
          created_at?: string
          created_by?: string | null
          email?: string | null
          full_name?: string
          id?: string
          last_contact_at?: string | null
          notes?: string | null
          organization_id?: string | null
          phone?: string | null
          title?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contacts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      embedded_solana_wallets: {
        Row: {
          created_at: string
          encrypted_key: string
          encrypted_mnemonic: string | null
          iv: string
          mnemonic_iv: string | null
          salt: string
          updated_at: string
          user_id: string
          wallet_address: string
        }
        Insert: {
          created_at?: string
          encrypted_key: string
          encrypted_mnemonic?: string | null
          iv: string
          mnemonic_iv?: string | null
          salt: string
          updated_at?: string
          user_id: string
          wallet_address: string
        }
        Update: {
          created_at?: string
          encrypted_key?: string
          encrypted_mnemonic?: string | null
          iv?: string
          mnemonic_iv?: string | null
          salt?: string
          updated_at?: string
          user_id?: string
          wallet_address?: string
        }
        Relationships: []
      }
      expense_entries: {
        Row: {
          _deleted: boolean
          amount: number
          category: string
          created_at: string
          entry_date: string
          id: string
          notes: string | null
          project_id: string | null
          reimbursable: boolean
          updated_at: string
          user_id: string
          vendor: string | null
          workspace_id: string
        }
        Insert: {
          _deleted?: boolean
          amount: number
          category: string
          created_at?: string
          entry_date: string
          id?: string
          notes?: string | null
          project_id?: string | null
          reimbursable?: boolean
          updated_at?: string
          user_id: string
          vendor?: string | null
          workspace_id: string
        }
        Update: {
          _deleted?: boolean
          amount?: number
          category?: string
          created_at?: string
          entry_date?: string
          id?: string
          notes?: string | null
          project_id?: string | null
          reimbursable?: boolean
          updated_at?: string
          user_id?: string
          vendor?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_entries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_entries_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      folders: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
          parent_id: string | null
          path: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          parent_id?: string | null
          path?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          parent_id?: string | null
          path?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "folders_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "folders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "folders_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_items: {
        Row: {
          created_at: string
          description: string
          id: string
          invoice_id: string
          line_number: number
          qty: number
          rate: number
          unit: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          invoice_id: string
          line_number?: number
          qty?: number
          rate?: number
          unit?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          invoice_id?: string
          line_number?: number
          qty?: number
          rate?: number
          unit?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          contact_id: string | null
          created_at: string
          created_by: string | null
          currency_code: string
          due_date: string | null
          id: string
          invoice_number: string
          issue_date: string
          notes: string | null
          organization_id: string | null
          paid_at: string | null
          project_id: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          subtotal: number
          tax_total: number
          total: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          currency_code?: string
          due_date?: string | null
          id?: string
          invoice_number: string
          issue_date?: string
          notes?: string | null
          organization_id?: string | null
          paid_at?: string | null
          project_id?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal?: number
          tax_total?: number
          total?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          currency_code?: string
          due_date?: string | null
          id?: string
          invoice_number?: string
          issue_date?: string
          notes?: string | null
          organization_id?: string | null
          paid_at?: string | null
          project_id?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          subtotal?: number
          tax_total?: number
          total?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      job_assignment_assets: {
        Row: {
          _deleted: boolean
          asset_id: string
          assignment_id: string
          created_at: string
          id: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          _deleted?: boolean
          asset_id: string
          assignment_id: string
          created_at?: string
          id?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          _deleted?: boolean
          asset_id?: string
          assignment_id?: string
          created_at?: string
          id?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_assignment_assets_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_assignment_assets_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "job_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_assignment_assets_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      job_assignment_members: {
        Row: {
          _deleted: boolean
          assignment_id: string
          assignment_role: string | null
          created_at: string
          id: string
          updated_at: string
          workspace_id: string
          workspace_member_id: string
        }
        Insert: {
          _deleted?: boolean
          assignment_id: string
          assignment_role?: string | null
          created_at?: string
          id?: string
          updated_at?: string
          workspace_id: string
          workspace_member_id: string
        }
        Update: {
          _deleted?: boolean
          assignment_id?: string
          assignment_role?: string | null
          created_at?: string
          id?: string
          updated_at?: string
          workspace_id?: string
          workspace_member_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_assignment_members_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "job_assignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_assignment_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_assignment_members_workspace_member_id_fkey"
            columns: ["workspace_member_id"]
            isOneToOne: false
            referencedRelation: "workspace_members"
            referencedColumns: ["id"]
          },
        ]
      }
      job_assignments: {
        Row: {
          _deleted: boolean
          assignment_date: string
          created_at: string
          created_by: string | null
          id: string
          job_id: string | null
          notes: string | null
          project_id: string | null
          status: Database["public"]["Enums"]["assignment_status"]
          updated_at: string
          workspace_id: string
        }
        Insert: {
          _deleted?: boolean
          assignment_date: string
          created_at?: string
          created_by?: string | null
          id?: string
          job_id?: string | null
          notes?: string | null
          project_id?: string | null
          status?: Database["public"]["Enums"]["assignment_status"]
          updated_at?: string
          workspace_id: string
        }
        Update: {
          _deleted?: boolean
          assignment_date?: string
          created_at?: string
          created_by?: string | null
          id?: string
          job_id?: string | null
          notes?: string | null
          project_id?: string | null
          status?: Database["public"]["Enums"]["assignment_status"]
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_assignments_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_assignments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_assignments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      job_events: {
        Row: {
          _deleted: boolean
          created_at: string
          created_by: string | null
          end_time: string | null
          event_date: string
          event_type: string
          id: string
          job_id: string | null
          location: string | null
          notes: string | null
          project_id: string | null
          start_time: string | null
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          _deleted?: boolean
          created_at?: string
          created_by?: string | null
          end_time?: string | null
          event_date: string
          event_type?: string
          id?: string
          job_id?: string | null
          location?: string | null
          notes?: string | null
          project_id?: string | null
          start_time?: string | null
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          _deleted?: boolean
          created_at?: string
          created_by?: string | null
          end_time?: string | null
          event_date?: string
          event_type?: string
          id?: string
          job_id?: string | null
          location?: string | null
          notes?: string | null
          project_id?: string | null
          start_time?: string | null
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_events_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          _deleted: boolean
          archived_at: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          job_type: string | null
          location: string | null
          project_id: string | null
          scheduled_end: string | null
          scheduled_start: string | null
          status: Database["public"]["Enums"]["job_status"]
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          _deleted?: boolean
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          job_type?: string | null
          location?: string | null
          project_id?: string | null
          scheduled_end?: string | null
          scheduled_start?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          _deleted?: boolean
          archived_at?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          job_type?: string | null
          location?: string | null
          project_id?: string | null
          scheduled_end?: string | null
          scheduled_start?: string | null
          status?: Database["public"]["Enums"]["job_status"]
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "jobs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      market_events: {
        Row: {
          certification_body: string | null
          created_at: string
          currency: string
          description: string | null
          ends_at: string | null
          id: string
          kind: string
          latitude: number | null
          location: string
          longitude: number | null
          price: number
          provider: string
          seats_left: number | null
          starts_at: string
          title: string
          workspace_id: string
        }
        Insert: {
          certification_body?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          ends_at?: string | null
          id?: string
          kind?: string
          latitude?: number | null
          location: string
          longitude?: number | null
          price?: number
          provider: string
          seats_left?: number | null
          starts_at: string
          title: string
          workspace_id: string
        }
        Update: {
          certification_body?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          ends_at?: string | null
          id?: string
          kind?: string
          latitude?: number | null
          location?: string
          longitude?: number | null
          price?: number
          provider?: string
          seats_left?: number | null
          starts_at?: string
          title?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "market_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      market_firms: {
        Row: {
          about: string | null
          created_at: string
          founded_year: number | null
          id: string
          is_global: boolean
          latitude: number | null
          location: string
          longitude: number | null
          name: string
          services: string[]
          staff_count: number | null
          verified: boolean
          workspace_id: string
        }
        Insert: {
          about?: string | null
          created_at?: string
          founded_year?: number | null
          id?: string
          is_global?: boolean
          latitude?: number | null
          location: string
          longitude?: number | null
          name: string
          services?: string[]
          staff_count?: number | null
          verified?: boolean
          workspace_id: string
        }
        Update: {
          about?: string | null
          created_at?: string
          founded_year?: number | null
          id?: string
          is_global?: boolean
          latitude?: number | null
          location?: string
          longitude?: number | null
          name?: string
          services?: string[]
          staff_count?: number | null
          verified?: boolean
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "market_firms_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      market_job_posts: {
        Row: {
          created_at: string
          currency: string
          description: string | null
          discipline: string
          employment_type: string
          id: string
          is_global: boolean
          latitude: number | null
          location: string
          longitude: number | null
          rate: number | null
          rate_per: string | null
          requirements: string[] | null
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          currency?: string
          description?: string | null
          discipline: string
          employment_type?: string
          id?: string
          is_global?: boolean
          latitude?: number | null
          location: string
          longitude?: number | null
          rate?: number | null
          rate_per?: string | null
          requirements?: string[] | null
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          currency?: string
          description?: string | null
          discipline?: string
          employment_type?: string
          id?: string
          is_global?: boolean
          latitude?: number | null
          location?: string
          longitude?: number | null
          rate?: number | null
          rate_per?: string | null
          requirements?: string[] | null
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "market_job_posts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_listings: {
        Row: {
          asset_id: string | null
          category: string
          condition: string
          created_at: string
          currency: string
          description: string | null
          id: string
          is_global: boolean
          latitude: number | null
          listing_type: string | null
          location: string
          longitude: number | null
          name: string
          price: number
          seller: string
          seller_wallet_address: string | null
          specs: string[] | null
          type: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          asset_id?: string | null
          category?: string
          condition: string
          created_at?: string
          currency: string
          description?: string | null
          id?: string
          is_global?: boolean
          latitude?: number | null
          listing_type?: string | null
          location: string
          longitude?: number | null
          name: string
          price: number
          seller: string
          seller_wallet_address?: string | null
          specs?: string[] | null
          type: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          asset_id?: string | null
          category?: string
          condition?: string
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          is_global?: boolean
          latitude?: number | null
          listing_type?: string | null
          location?: string
          longitude?: number | null
          name?: string
          price?: number
          seller?: string
          seller_wallet_address?: string | null
          specs?: string[] | null
          type?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_listings_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_listings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_orders: {
        Row: {
          amount: number
          buyer_workspace_id: string
          created_at: string
          currency: string
          external_payment_ref: string | null
          id: string
          listing_id: string
          listing_workspace_id: string
          metadata: Json
          payment_status: string
          platform_fee_amount: number
          provider: string
          updated_at: string
        }
        Insert: {
          amount: number
          buyer_workspace_id: string
          created_at?: string
          currency: string
          external_payment_ref?: string | null
          id?: string
          listing_id: string
          listing_workspace_id: string
          metadata?: Json
          payment_status?: string
          platform_fee_amount?: number
          provider?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          buyer_workspace_id?: string
          created_at?: string
          currency?: string
          external_payment_ref?: string | null
          id?: string
          listing_id?: string
          listing_workspace_id?: string
          metadata?: Json
          payment_status?: string
          platform_fee_amount?: number
          provider?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_orders_buyer_workspace_id_fkey"
            columns: ["buyer_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_orders_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "marketplace_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_orders_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "public_market_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_orders_listing_workspace_id_fkey"
            columns: ["listing_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_requests: {
        Row: {
          created_at: string
          desired_end_date: string | null
          desired_start_date: string | null
          id: string
          listing_id: string
          message: string | null
          requester_user_id: string
          requester_workspace_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          desired_end_date?: string | null
          desired_start_date?: string | null
          id?: string
          listing_id: string
          message?: string | null
          requester_user_id: string
          requester_workspace_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          desired_end_date?: string | null
          desired_start_date?: string | null
          id?: string
          listing_id?: string
          message?: string | null
          requester_user_id?: string
          requester_workspace_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_requests_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "marketplace_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_requests_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "public_market_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_requests_requester_workspace_id_fkey"
            columns: ["requester_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          metadata: Json
          read_at: string | null
          status: Database["public"]["Enums"]["notification_status"]
          title: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          read_at?: string | null
          status?: Database["public"]["Enums"]["notification_status"]
          title: string
          user_id: string
          workspace_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          read_at?: string | null
          status?: Database["public"]["Enums"]["notification_status"]
          title?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          _deleted: boolean
          address: string | null
          archived_at: string | null
          city: string | null
          country_code: string
          created_at: string
          created_by: string | null
          email: string | null
          id: string
          name: string
          notes: string | null
          organization_type: Database["public"]["Enums"]["organization_type"]
          phone: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          _deleted?: boolean
          address?: string | null
          archived_at?: string | null
          city?: string | null
          country_code?: string
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          organization_type?: Database["public"]["Enums"]["organization_type"]
          phone?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          _deleted?: boolean
          address?: string | null
          archived_at?: string | null
          city?: string | null
          country_code?: string
          created_at?: string
          created_by?: string | null
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          organization_type?: Database["public"]["Enums"]["organization_type"]
          phone?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organizations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_methods: {
        Row: {
          created_at: string
          created_by: string | null
          detail: string
          expiry: string | null
          holder: string | null
          id: string
          is_default: boolean
          label: string
          type: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          detail: string
          expiry?: string | null
          holder?: string | null
          id?: string
          is_default?: boolean
          label: string
          type: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          detail?: string
          expiry?: string | null
          holder?: string | null
          id?: string
          is_default?: boolean
          label?: string
          type?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_methods_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          chain: string | null
          created_at: string
          created_by: string | null
          id: string
          invoice_id: string
          notes: string | null
          paid_on: string
          payment_method: string | null
          reference: string | null
          token_mint: string | null
          tx_signature: string | null
          updated_at: string
          wallet_address: string | null
          workspace_id: string
        }
        Insert: {
          amount: number
          chain?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_id: string
          notes?: string | null
          paid_on?: string
          payment_method?: string | null
          reference?: string | null
          token_mint?: string | null
          tx_signature?: string | null
          updated_at?: string
          wallet_address?: string | null
          workspace_id: string
        }
        Update: {
          amount?: number
          chain?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          invoice_id?: string
          notes?: string | null
          paid_on?: string
          payment_method?: string | null
          reference?: string | null
          token_mint?: string | null
          tx_signature?: string | null
          updated_at?: string
          wallet_address?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      portfolio_items: {
        Row: {
          created_at: string
          description: string | null
          id: string
          image_path: string | null
          professional_id: string
          sort_order: number
          title: string
          workspace_id: string
          year: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          image_path?: string | null
          professional_id: string
          sort_order?: number
          title: string
          workspace_id: string
          year?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          image_path?: string | null
          professional_id?: string
          sort_order?: number
          title?: string
          workspace_id?: string
          year?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "portfolio_items_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portfolio_items_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "public_market_professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portfolio_items_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      professionals: {
        Row: {
          availability: string
          avatar_path: string | null
          banner_path: string | null
          bio: string | null
          certifications: string[] | null
          created_at: string
          currency: string
          discipline: string
          experience: string
          id: string
          is_global: boolean
          is_verified: boolean
          latitude: number | null
          location: string
          longitude: number | null
          name: string
          rate: number
          rate_per: string
          rating: number | null
          reviews: number | null
          skills: string[] | null
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          availability: string
          avatar_path?: string | null
          banner_path?: string | null
          bio?: string | null
          certifications?: string[] | null
          created_at?: string
          currency: string
          discipline: string
          experience: string
          id?: string
          is_global?: boolean
          is_verified?: boolean
          latitude?: number | null
          location: string
          longitude?: number | null
          name: string
          rate: number
          rate_per: string
          rating?: number | null
          reviews?: number | null
          skills?: string[] | null
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          availability?: string
          avatar_path?: string | null
          banner_path?: string | null
          bio?: string | null
          certifications?: string[] | null
          created_at?: string
          currency?: string
          discipline?: string
          experience?: string
          id?: string
          is_global?: boolean
          is_verified?: boolean
          latitude?: number | null
          location?: string
          longitude?: number | null
          name?: string
          rate?: number
          rate_per?: string
          rating?: number | null
          reviews?: number | null
          skills?: string[] | null
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "professionals_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          auth_signup_account_type: string | null
          avatar_path: string | null
          bio: string | null
          city: string | null
          company_name: string | null
          country_code: string | null
          created_at: string
          default_workspace_id: string | null
          deleted_at: string | null
          deletion_requested_at: string | null
          email: string | null
          email_notifications: boolean
          full_name: string | null
          id: string
          is_platform_admin: boolean
          linkedin: string | null
          onboarding_complete: boolean
          phone: string | null
          professional_title: string | null
          promo_code: string | null
          registration_no: string | null
          specializations: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          auth_signup_account_type?: string | null
          avatar_path?: string | null
          bio?: string | null
          city?: string | null
          company_name?: string | null
          country_code?: string | null
          created_at?: string
          default_workspace_id?: string | null
          deleted_at?: string | null
          deletion_requested_at?: string | null
          email?: string | null
          email_notifications?: boolean
          full_name?: string | null
          id: string
          is_platform_admin?: boolean
          linkedin?: string | null
          onboarding_complete?: boolean
          phone?: string | null
          professional_title?: string | null
          promo_code?: string | null
          registration_no?: string | null
          specializations?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          auth_signup_account_type?: string | null
          avatar_path?: string | null
          bio?: string | null
          city?: string | null
          company_name?: string | null
          country_code?: string | null
          created_at?: string
          default_workspace_id?: string | null
          deleted_at?: string | null
          deletion_requested_at?: string | null
          email?: string | null
          email_notifications?: boolean
          full_name?: string | null
          id?: string
          is_platform_admin?: boolean
          linkedin?: string | null
          onboarding_complete?: boolean
          phone?: string | null
          professional_title?: string | null
          promo_code?: string | null
          registration_no?: string | null
          specializations?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_default_workspace_id_fkey"
            columns: ["default_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      project_activities: {
        Row: {
          activity_type: string
          content: string
          created_at: string
          id: string
          project_id: string
          user_id: string | null
        }
        Insert: {
          activity_type?: string
          content: string
          created_at?: string
          id?: string
          project_id: string
          user_id?: string | null
        }
        Update: {
          activity_type?: string
          content?: string
          created_at?: string
          id?: string
          project_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_activities_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_cad_drawings: {
        Row: {
          created_at: string
          model: Json
          project_id: string
          updated_at: string
          updated_by: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          model?: Json
          project_id: string
          updated_at?: string
          updated_by?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          model?: Json
          project_id?: string
          updated_at?: string
          updated_by?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_cad_drawings_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_cad_drawings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      project_contacts: {
        Row: {
          contact_id: string
          created_at: string
          id: string
          project_id: string
          relation: string | null
          workspace_id: string
        }
        Insert: {
          contact_id: string
          created_at?: string
          id?: string
          project_id: string
          relation?: string | null
          workspace_id: string
        }
        Update: {
          contact_id?: string
          created_at?: string
          id?: string
          project_id?: string
          relation?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_contacts_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_contacts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_contacts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      project_members: {
        Row: {
          created_at: string
          id: string
          project_id: string
          role: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          project_id: string
          role?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          project_id?: string
          role?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_members_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          _deleted: boolean
          angle_entry: string
          archived_at: string | null
          axis_convention: string
          bearing_format: string
          code: string | null
          coord_decimals: number
          created_at: string
          created_by: string | null
          crs_epsg: string | null
          crs_type: string
          datum: string | null
          description: string | null
          ends_on: string | null
          id: string
          local_origin_e: number
          local_origin_n: number
          name: string
          organization_id: string | null
          phase: string | null
          points: number
          progress: number
          starts_on: string | null
          status: Database["public"]["Enums"]["project_status"]
          updated_at: string
          workspace_id: string
        }
        Insert: {
          _deleted?: boolean
          angle_entry?: string
          archived_at?: string | null
          axis_convention?: string
          bearing_format?: string
          code?: string | null
          coord_decimals?: number
          created_at?: string
          created_by?: string | null
          crs_epsg?: string | null
          crs_type?: string
          datum?: string | null
          description?: string | null
          ends_on?: string | null
          id?: string
          local_origin_e?: number
          local_origin_n?: number
          name: string
          organization_id?: string | null
          phase?: string | null
          points?: number
          progress?: number
          starts_on?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          updated_at?: string
          workspace_id: string
        }
        Update: {
          _deleted?: boolean
          angle_entry?: string
          archived_at?: string | null
          axis_convention?: string
          bearing_format?: string
          code?: string | null
          coord_decimals?: number
          created_at?: string
          created_by?: string | null
          crs_epsg?: string | null
          crs_type?: string
          datum?: string | null
          description?: string | null
          ends_on?: string | null
          id?: string
          local_origin_e?: number
          local_origin_n?: number
          name?: string
          organization_id?: string | null
          phase?: string | null
          points?: number
          progress?: number
          starts_on?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_items: {
        Row: {
          created_at: string
          description: string
          id: string
          line_number: number
          qty: number
          quote_id: string
          rate: number
          unit: string | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          line_number?: number
          qty?: number
          quote_id: string
          rate?: number
          unit?: string | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          line_number?: number
          qty?: number
          quote_id?: string
          rate?: number
          unit?: string | null
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quote_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_items_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          accepted_at: string | null
          contact_id: string | null
          created_at: string
          created_by: string | null
          currency_code: string
          expires_on: string | null
          id: string
          issue_date: string
          notes: string | null
          organization_id: string | null
          project_id: string | null
          quote_number: string
          status: Database["public"]["Enums"]["quote_status"]
          subtotal: number
          tax_total: number
          total: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          accepted_at?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          currency_code?: string
          expires_on?: string | null
          id?: string
          issue_date?: string
          notes?: string | null
          organization_id?: string | null
          project_id?: string | null
          quote_number: string
          status?: Database["public"]["Enums"]["quote_status"]
          subtotal?: number
          tax_total?: number
          total?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          accepted_at?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          currency_code?: string
          expires_on?: string | null
          id?: string
          issue_date?: string
          notes?: string | null
          organization_id?: string | null
          project_id?: string | null
          quote_number?: string
          status?: Database["public"]["Enums"]["quote_status"]
          subtotal?: number
          tax_total?: number
          total?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quotes_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          color: string | null
          created_at: string
          created_by: string | null
          id: string
          name: string
          workspace_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          workspace_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tags_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      time_entries: {
        Row: {
          _deleted: boolean
          billable: boolean
          created_at: string
          entry_date: string
          hours: number
          id: string
          notes: string | null
          project_id: string | null
          task: string
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          _deleted?: boolean
          billable?: boolean
          created_at?: string
          entry_date: string
          hours: number
          id?: string
          notes?: string | null
          project_id?: string | null
          task: string
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          _deleted?: boolean
          billable?: boolean
          created_at?: string
          entry_date?: string
          hours?: number
          id?: string
          notes?: string | null
          project_id?: string | null
          task?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_entries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invitation_token: string
          invited_by: string | null
          role: Database["public"]["Enums"]["workspace_member_role"]
          workspace_id: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invitation_token?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["workspace_member_role"]
          workspace_id: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invitation_token?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["workspace_member_role"]
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_invitations_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_members: {
        Row: {
          created_at: string
          id: string
          invited_at: string | null
          joined_at: string | null
          role: Database["public"]["Enums"]["workspace_member_role"]
          status: Database["public"]["Enums"]["workspace_member_status"]
          title: string | null
          updated_at: string
          user_id: string
          work_email: string | null
          work_phone: string | null
          workspace_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invited_at?: string | null
          joined_at?: string | null
          role?: Database["public"]["Enums"]["workspace_member_role"]
          status?: Database["public"]["Enums"]["workspace_member_status"]
          title?: string | null
          updated_at?: string
          user_id: string
          work_email?: string | null
          work_phone?: string | null
          workspace_id: string
        }
        Update: {
          created_at?: string
          id?: string
          invited_at?: string | null
          joined_at?: string | null
          role?: Database["public"]["Enums"]["workspace_member_role"]
          status?: Database["public"]["Enums"]["workspace_member_status"]
          title?: string | null
          updated_at?: string
          user_id?: string
          work_email?: string | null
          work_phone?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_members_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_settings: {
        Row: {
          country_code: string
          created_at: string
          default_currency: string
          settings: Json
          timezone: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          country_code?: string
          created_at?: string
          default_currency?: string
          settings?: Json
          timezone?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          country_code?: string
          created_at?: string
          default_currency?: string
          settings?: Json
          timezone?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_settings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          archived_at: string | null
          billing_email: string | null
          country_code: string
          created_at: string
          currency_code: string
          id: string
          marketplace_wallet_address: string | null
          name: string
          owner_user_id: string
          slug: string | null
          storage_limit_mb: number
          timezone: string
          type: Database["public"]["Enums"]["workspace_type"]
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          billing_email?: string | null
          country_code?: string
          created_at?: string
          currency_code?: string
          id?: string
          marketplace_wallet_address?: string | null
          name: string
          owner_user_id: string
          slug?: string | null
          storage_limit_mb?: number
          timezone?: string
          type: Database["public"]["Enums"]["workspace_type"]
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          billing_email?: string | null
          country_code?: string
          created_at?: string
          currency_code?: string
          id?: string
          marketplace_wallet_address?: string | null
          name?: string
          owner_user_id?: string
          slug?: string | null
          storage_limit_mb?: number
          timezone?: string
          type?: Database["public"]["Enums"]["workspace_type"]
          updated_at?: string
        }
        Relationships: []
      }
      workspace_ai_providers: {
        Row: {
          api_key: string | null
          api_key_secret_id: string | null
          base_url: string
          created_at: string
          default_model: string | null
          enabled: boolean
          id: string
          label: string
          sort_order: number
          tag: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          api_key?: string | null
          api_key_secret_id?: string | null
          base_url: string
          created_at?: string
          default_model?: string | null
          enabled?: boolean
          id?: string
          label: string
          sort_order?: number
          tag: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          api_key?: string | null
          api_key_secret_id?: string | null
          base_url?: string
          created_at?: string
          default_model?: string | null
          enabled?: boolean
          id?: string
          label?: string
          sort_order?: number
          tag?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_ai_providers_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      public_market_events: {
        Row: {
          certification_body: string | null
          created_at: string | null
          currency: string | null
          description: string | null
          ends_at: string | null
          id: string | null
          kind: string | null
          latitude: number | null
          location: string | null
          longitude: number | null
          price: number | null
          provider: string | null
          seats_left: number | null
          starts_at: string | null
          title: string | null
        }
        Insert: {
          certification_body?: string | null
          created_at?: string | null
          currency?: string | null
          description?: string | null
          ends_at?: string | null
          id?: string | null
          kind?: string | null
          latitude?: number | null
          location?: string | null
          longitude?: number | null
          price?: number | null
          provider?: string | null
          seats_left?: number | null
          starts_at?: string | null
          title?: string | null
        }
        Update: {
          certification_body?: string | null
          created_at?: string | null
          currency?: string | null
          description?: string | null
          ends_at?: string | null
          id?: string | null
          kind?: string | null
          latitude?: number | null
          location?: string | null
          longitude?: number | null
          price?: number | null
          provider?: string | null
          seats_left?: number | null
          starts_at?: string | null
          title?: string | null
        }
        Relationships: []
      }
      public_market_firms: {
        Row: {
          about: string | null
          created_at: string | null
          founded_year: number | null
          id: string | null
          latitude: number | null
          location: string | null
          longitude: number | null
          name: string | null
          services: string[] | null
          staff_count: number | null
          verified: boolean | null
        }
        Insert: {
          about?: string | null
          created_at?: string | null
          founded_year?: number | null
          id?: string | null
          latitude?: number | null
          location?: string | null
          longitude?: number | null
          name?: string | null
          services?: string[] | null
          staff_count?: number | null
          verified?: boolean | null
        }
        Update: {
          about?: string | null
          created_at?: string | null
          founded_year?: number | null
          id?: string | null
          latitude?: number | null
          location?: string | null
          longitude?: number | null
          name?: string | null
          services?: string[] | null
          staff_count?: number | null
          verified?: boolean | null
        }
        Relationships: []
      }
      public_market_jobs: {
        Row: {
          created_at: string | null
          currency: string | null
          description: string | null
          discipline: string | null
          employment_type: string | null
          id: string | null
          latitude: number | null
          location: string | null
          longitude: number | null
          rate: number | null
          rate_per: string | null
          requirements: string[] | null
          title: string | null
        }
        Insert: {
          created_at?: string | null
          currency?: string | null
          description?: string | null
          discipline?: string | null
          employment_type?: string | null
          id?: string | null
          latitude?: number | null
          location?: string | null
          longitude?: number | null
          rate?: number | null
          rate_per?: string | null
          requirements?: string[] | null
          title?: string | null
        }
        Update: {
          created_at?: string | null
          currency?: string | null
          description?: string | null
          discipline?: string | null
          employment_type?: string | null
          id?: string | null
          latitude?: number | null
          location?: string | null
          longitude?: number | null
          rate?: number | null
          rate_per?: string | null
          requirements?: string[] | null
          title?: string | null
        }
        Relationships: []
      }
      public_market_listings: {
        Row: {
          category: string | null
          condition: string | null
          created_at: string | null
          currency: string | null
          description: string | null
          id: string | null
          latitude: number | null
          listing_type: string | null
          location: string | null
          longitude: number | null
          name: string | null
          price: number | null
          seller: string | null
          specs: string[] | null
          type: string | null
        }
        Insert: {
          category?: string | null
          condition?: string | null
          created_at?: string | null
          currency?: string | null
          description?: string | null
          id?: string | null
          latitude?: number | null
          listing_type?: string | null
          location?: string | null
          longitude?: number | null
          name?: string | null
          price?: number | null
          seller?: string | null
          specs?: string[] | null
          type?: string | null
        }
        Update: {
          category?: string | null
          condition?: string | null
          created_at?: string | null
          currency?: string | null
          description?: string | null
          id?: string | null
          latitude?: number | null
          listing_type?: string | null
          location?: string | null
          longitude?: number | null
          name?: string | null
          price?: number | null
          seller?: string | null
          specs?: string[] | null
          type?: string | null
        }
        Relationships: []
      }
      public_market_portfolio_items: {
        Row: {
          created_at: string | null
          description: string | null
          id: string | null
          image_path: string | null
          professional_id: string | null
          sort_order: number | null
          title: string | null
          year: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string | null
          image_path?: string | null
          professional_id?: string | null
          sort_order?: number | null
          title?: string | null
          year?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string | null
          image_path?: string | null
          professional_id?: string | null
          sort_order?: number | null
          title?: string | null
          year?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "portfolio_items_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "professionals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "portfolio_items_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "public_market_professionals"
            referencedColumns: ["id"]
          },
        ]
      }
      public_market_professionals: {
        Row: {
          availability: string | null
          avatar_path: string | null
          banner_path: string | null
          bio: string | null
          certifications: string[] | null
          created_at: string | null
          currency: string | null
          discipline: string | null
          experience: string | null
          id: string | null
          is_verified: boolean | null
          latitude: number | null
          location: string | null
          longitude: number | null
          name: string | null
          rate: number | null
          rate_per: string | null
          rating: number | null
          reviews: number | null
          skills: string[] | null
          title: string | null
        }
        Insert: {
          availability?: string | null
          avatar_path?: string | null
          banner_path?: string | null
          bio?: string | null
          certifications?: string[] | null
          created_at?: string | null
          currency?: string | null
          discipline?: string | null
          experience?: string | null
          id?: string | null
          is_verified?: boolean | null
          latitude?: number | null
          location?: string | null
          longitude?: number | null
          name?: string | null
          rate?: number | null
          rate_per?: string | null
          rating?: number | null
          reviews?: number | null
          skills?: string[] | null
          title?: string | null
        }
        Update: {
          availability?: string | null
          avatar_path?: string | null
          banner_path?: string | null
          bio?: string | null
          certifications?: string[] | null
          created_at?: string | null
          currency?: string | null
          discipline?: string | null
          experience?: string | null
          id?: string | null
          is_verified?: boolean | null
          latitude?: number | null
          location?: string | null
          longitude?: number | null
          name?: string | null
          rate?: number | null
          rate_per?: string | null
          rating?: number | null
          reviews?: number | null
          skills?: string[] | null
          title?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      accept_workspace_invitation: {
        Args: { target_invitation_token: string }
        Returns: string
      }
      admin_list_audit_log: {
        Args: {
          p_action?: string
          p_limit?: number
          p_offset?: number
          p_workspace_id?: string
        }
        Returns: {
          action: string
          actor_user_id: string
          created_at: string
          details: Json
          entity_id: string
          entity_table: string
          id: number
          workspace_id: string
        }[]
      }
      admin_workspace_summary: {
        Args: { p_workspace_id: string }
        Returns: Json
      }
      can_manage_assets: {
        Args: { target_workspace_id: string }
        Returns: boolean
      }
      can_manage_business_operations: {
        Args: { target_workspace_id: string }
        Returns: boolean
      }
      can_manage_business_workspace: {
        Args: { target_workspace_id: string }
        Returns: boolean
      }
      can_manage_documents: {
        Args: { target_workspace_id: string }
        Returns: boolean
      }
      can_manage_finance: {
        Args: { target_workspace_id: string }
        Returns: boolean
      }
      can_manage_operations: {
        Args: { target_workspace_id: string }
        Returns: boolean
      }
      can_manage_sales: {
        Args: { target_workspace_id: string }
        Returns: boolean
      }
      can_manage_workspace: {
        Args: { target_workspace_id: string }
        Returns: boolean
      }
      create_business_workspace: {
        Args: { workspace_name: string; workspace_slug?: string }
        Returns: string
      }
      get_workspace_storage_usage: {
        Args: { p_workspace_id: string }
        Returns: {
          file_count: number
          limit_mb: number
          percent: number
          used_bytes: number
          used_mb: number
        }[]
      }
      has_workspace_role: {
        Args: {
          allowed_roles: Database["public"]["Enums"]["workspace_member_role"][]
          target_workspace_id: string
        }
        Returns: boolean
      }
      is_business_workspace: {
        Args: { target_workspace_id: string }
        Returns: boolean
      }
      is_platform_admin: { Args: never; Returns: boolean }
      is_workspace_member: {
        Args: { target_workspace_id: string }
        Returns: boolean
      }
      list_workspace_activity_log: {
        Args: { p_limit?: number; p_offset?: number; p_workspace_id: string }
        Returns: {
          action: string
          actor_user_id: string
          created_at: string
          details: Json
          entity_id: string
          entity_table: string
          id: number
          workspace_id: string
        }[]
      }
      log_activity: {
        Args: {
          p_action: string
          p_details?: Json
          p_entity_id: string
          p_entity_table: string
          p_workspace_id: string
        }
        Returns: undefined
      }
      path_first_segment_uuid: { Args: { path: string }; Returns: string }
      project_cad_metrics: {
        Args: { p_project_id: string }
        Returns: {
          linework: number
          points: number
          qa_flags: number
          surfaces: number
        }[]
      }
      set_default_payment_method: {
        Args: { p_method_id: string; p_workspace_id: string }
        Returns: undefined
      }
      set_default_workspace: {
        Args: { target_workspace_id: string }
        Returns: boolean
      }
      shares_workspace_with_profile: {
        Args: { target_profile_id: string }
        Returns: boolean
      }
      slugify: { Args: { value: string }; Returns: string }
    }
    Enums: {
      asset_kind: "instrument" | "vehicle" | "equipment" | "other"
      asset_status: "available" | "deployed" | "maintenance" | "retired"
      assignment_status:
        | "draft"
        | "confirmed"
        | "in_progress"
        | "completed"
        | "cancelled"
      attachment_chain_status: "none" | "pending" | "anchored" | "failed"
      attachment_storage_tier: "off_chain" | "on_chain"
      attachment_visibility: "private" | "workspace" | "public"
      calibration_status: "scheduled" | "passed" | "failed" | "expired"
      invoice_status: "draft" | "sent" | "paid" | "overdue" | "cancelled"
      job_status:
        | "planned"
        | "scheduled"
        | "in_progress"
        | "completed"
        | "cancelled"
      notification_status: "unread" | "read" | "archived"
      organization_type:
        | "client"
        | "vendor"
        | "government"
        | "partner"
        | "lead"
        | "subcontractor"
      project_status: "draft" | "active" | "completed" | "on_hold" | "archived"
      quote_status: "draft" | "sent" | "accepted" | "rejected" | "expired"
      workspace_member_role:
        | "owner"
        | "admin"
        | "ops_manager"
        | "finance"
        | "sales"
        | "technician"
        | "viewer"
      workspace_member_status: "active" | "invited" | "suspended"
      workspace_type: "personal" | "business"
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
      asset_kind: ["instrument", "vehicle", "equipment", "other"],
      asset_status: ["available", "deployed", "maintenance", "retired"],
      assignment_status: [
        "draft",
        "confirmed",
        "in_progress",
        "completed",
        "cancelled",
      ],
      attachment_chain_status: ["none", "pending", "anchored", "failed"],
      attachment_storage_tier: ["off_chain", "on_chain"],
      attachment_visibility: ["private", "workspace", "public"],
      calibration_status: ["scheduled", "passed", "failed", "expired"],
      invoice_status: ["draft", "sent", "paid", "overdue", "cancelled"],
      job_status: [
        "planned",
        "scheduled",
        "in_progress",
        "completed",
        "cancelled",
      ],
      notification_status: ["unread", "read", "archived"],
      organization_type: [
        "client",
        "vendor",
        "government",
        "partner",
        "lead",
        "subcontractor",
      ],
      project_status: ["draft", "active", "completed", "on_hold", "archived"],
      quote_status: ["draft", "sent", "accepted", "rejected", "expired"],
      workspace_member_role: [
        "owner",
        "admin",
        "ops_manager",
        "finance",
        "sales",
        "technician",
        "viewer",
      ],
      workspace_member_status: ["active", "invited", "suspended"],
      workspace_type: ["personal", "business"],
    },
  },
} as const
