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
          summary: string
          summary_through: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          context?: string
          created_at?: string
          id?: string
          session_key: string
          summary?: string
          summary_through?: string | null
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          context?: string
          created_at?: string
          id?: string
          session_key?: string
          summary?: string
          summary_through?: string | null
          title?: string
          updated_at?: string
          user_id?: string
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
          photos: string[]
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
          photos?: string[]
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
          photos?: string[]
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
          anchor_fee_lamports: number | null
          anchor_mode: string | null
          anchor_operation_id: string | null
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
          anchor_fee_lamports?: number | null
          anchor_mode?: string | null
          anchor_operation_id?: string | null
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
          anchor_fee_lamports?: number | null
          anchor_mode?: string | null
          anchor_operation_id?: string | null
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
            foreignKeyName: "attachments_anchor_operation_id_fkey"
            columns: ["anchor_operation_id"]
            isOneToOne: false
            referencedRelation: "file_anchor_operations"
            referencedColumns: ["id"]
          },
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
      auth_nonces: {
        Row: {
          address: string | null
          chain: string | null
          client_hash: string | null
          consumed_at: string | null
          expires_at: string
          issued_at: string
          nonce: string
          purpose: string
          user_id: string | null
        }
        Insert: {
          address?: string | null
          chain?: string | null
          client_hash?: string | null
          consumed_at?: string | null
          expires_at: string
          issued_at?: string
          nonce: string
          purpose: string
          user_id?: string | null
        }
        Update: {
          address?: string | null
          chain?: string | null
          client_hash?: string | null
          consumed_at?: string | null
          expires_at?: string
          issued_at?: string
          nonce?: string
          purpose?: string
          user_id?: string | null
        }
        Relationships: []
      }
      billing_operation_rates: {
        Row: {
          active: boolean
          credits: number
          estimated_cost: number
          operation: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          credits: number
          estimated_cost?: number
          operation: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          credits?: number
          estimated_cost?: number
          operation?: string
          updated_at?: string
        }
        Relationships: []
      }
      billing_packages: {
        Row: {
          active: boolean
          amount: number
          created_at: string
          credits: number | null
          currency_code: string
          description: string
          duration_days: number | null
          estimated_infrastructure_cost: number
          estimated_payment_fee: number
          id: string
          kind: string
          label: string
          sort_order: number
          storage_mb: number | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          amount: number
          created_at?: string
          credits?: number | null
          currency_code?: string
          description: string
          duration_days?: number | null
          estimated_infrastructure_cost?: number
          estimated_payment_fee?: number
          id: string
          kind: string
          label: string
          sort_order?: number
          storage_mb?: number | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          amount?: number
          created_at?: string
          credits?: number | null
          currency_code?: string
          description?: string
          duration_days?: number | null
          estimated_infrastructure_cost?: number
          estimated_payment_fee?: number
          id?: string
          kind?: string
          label?: string
          sort_order?: number
          storage_mb?: number | null
          updated_at?: string
        }
        Relationships: []
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
      custom_solana_wallets: {
        Row: {
          ciphertext: string
          created_at: string
          iv: string
          salt: string
          updated_at: string
          user_id: string
          wallet_address: string
        }
        Insert: {
          ciphertext: string
          created_at?: string
          iv: string
          salt: string
          updated_at?: string
          user_id: string
          wallet_address: string
        }
        Update: {
          ciphertext?: string
          created_at?: string
          iv?: string
          salt?: string
          updated_at?: string
          user_id?: string
          wallet_address?: string
        }
        Relationships: []
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
      file_anchor_chunks: {
        Row: {
          bucket_name: string
          chunk_index: number
          content_hash: string
          id: string
          operation_id: string
          size_bytes: number
          storage_path: string
          uploaded_at: string
          workspace_id: string
        }
        Insert: {
          bucket_name: string
          chunk_index: number
          content_hash: string
          id?: string
          operation_id: string
          size_bytes: number
          storage_path: string
          uploaded_at?: string
          workspace_id: string
        }
        Update: {
          bucket_name?: string
          chunk_index?: number
          content_hash?: string
          id?: string
          operation_id?: string
          size_bytes?: number
          storage_path?: string
          uploaded_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "file_anchor_chunks_operation_id_fkey"
            columns: ["operation_id"]
            isOneToOne: false
            referencedRelation: "file_anchor_operations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_anchor_chunks_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      file_anchor_operations: {
        Row: {
          attachment_id: string
          bucket_name: string
          chunk_count: number | null
          chunk_size: number | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          encryption: Json | null
          error_message: string | null
          fee_lamports: number | null
          file_hash: string | null
          file_name: string
          file_size_bytes: number
          id: string
          manifest: Json | null
          manifest_hash: string | null
          manifest_storage_path: string | null
          memo: string | null
          mime_type: string | null
          mode: string
          network: string
          status: string
          tx_signature: string | null
          tx_slot: number | null
          updated_at: string
          uploaded_chunks: number
          verification_status: string
          verified_at: string | null
          wallet_address: string | null
          workspace_id: string
        }
        Insert: {
          attachment_id: string
          bucket_name?: string
          chunk_count?: number | null
          chunk_size?: number | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          encryption?: Json | null
          error_message?: string | null
          fee_lamports?: number | null
          file_hash?: string | null
          file_name: string
          file_size_bytes?: number
          id?: string
          manifest?: Json | null
          manifest_hash?: string | null
          manifest_storage_path?: string | null
          memo?: string | null
          mime_type?: string | null
          mode: string
          network: string
          status?: string
          tx_signature?: string | null
          tx_slot?: number | null
          updated_at?: string
          uploaded_chunks?: number
          verification_status?: string
          verified_at?: string | null
          wallet_address?: string | null
          workspace_id: string
        }
        Update: {
          attachment_id?: string
          bucket_name?: string
          chunk_count?: number | null
          chunk_size?: number | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          encryption?: Json | null
          error_message?: string | null
          fee_lamports?: number | null
          file_hash?: string | null
          file_name?: string
          file_size_bytes?: number
          id?: string
          manifest?: Json | null
          manifest_hash?: string | null
          manifest_storage_path?: string | null
          memo?: string | null
          mime_type?: string | null
          mode?: string
          network?: string
          status?: string
          tx_signature?: string | null
          tx_slot?: number | null
          updated_at?: string
          uploaded_chunks?: number
          verification_status?: string
          verified_at?: string | null
          wallet_address?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "file_anchor_operations_attachment_id_fkey"
            columns: ["attachment_id"]
            isOneToOne: false
            referencedRelation: "attachments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_anchor_operations_workspace_id_fkey"
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
          pesepay_reference: string | null
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
          pesepay_reference?: string | null
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
          pesepay_reference?: string | null
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
      linked_wallets: {
        Row: {
          address: string
          chain: string
          created_at: string
          id: string
          last_used_at: string | null
          linked_at: string
          provider_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          address: string
          chain: string
          created_at?: string
          id?: string
          last_used_at?: string | null
          linked_at?: string
          provider_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string
          chain?: string
          created_at?: string
          id?: string
          last_used_at?: string | null
          linked_at?: string
          provider_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      market_events: {
        Row: {
          agenda: string[]
          capacity: number | null
          certification_body: string | null
          city: string | null
          country: string | null
          cpd_points: number | null
          created_at: string
          currency: string
          description: string | null
          ends_at: string | null
          id: string
          instructor: string | null
          is_remote: boolean
          kind: string
          latitude: number | null
          location: string
          longitude: number | null
          photo_path: string | null
          price: number
          provider: string
          registration_deadline: string | null
          registration_url: string | null
          seats_left: number | null
          starts_at: string
          timezone: string
          title: string
          updated_at: string
          venue_address: string | null
          workspace_id: string
        }
        Insert: {
          agenda?: string[]
          capacity?: number | null
          certification_body?: string | null
          city?: string | null
          country?: string | null
          cpd_points?: number | null
          created_at?: string
          currency?: string
          description?: string | null
          ends_at?: string | null
          id?: string
          instructor?: string | null
          is_remote?: boolean
          kind?: string
          latitude?: number | null
          location: string
          longitude?: number | null
          photo_path?: string | null
          price?: number
          provider: string
          registration_deadline?: string | null
          registration_url?: string | null
          seats_left?: number | null
          starts_at: string
          timezone?: string
          title: string
          updated_at?: string
          venue_address?: string | null
          workspace_id: string
        }
        Update: {
          agenda?: string[]
          capacity?: number | null
          certification_body?: string | null
          city?: string | null
          country?: string | null
          cpd_points?: number | null
          created_at?: string
          currency?: string
          description?: string | null
          ends_at?: string | null
          id?: string
          instructor?: string | null
          is_remote?: boolean
          kind?: string
          latitude?: number | null
          location?: string
          longitude?: number | null
          photo_path?: string | null
          price?: number
          provider?: string
          registration_deadline?: string | null
          registration_url?: string | null
          seats_left?: number | null
          starts_at?: string
          timezone?: string
          title?: string
          updated_at?: string
          venue_address?: string | null
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
      market_favorites: {
        Row: {
          created_at: string
          id: string
          market_id: string
          market_kind: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          market_id: string
          market_kind: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          market_id?: string
          market_kind?: string
          user_id?: string
        }
        Relationships: []
      }
      market_firms: {
        Row: {
          about: string | null
          accreditations: string[]
          city: string | null
          contact_email: string | null
          country: string | null
          created_at: string
          founded_year: number | null
          id: string
          is_global: boolean
          is_remote: boolean
          latitude: number | null
          location: string
          logo_path: string | null
          longitude: number | null
          name: string
          service_areas: string[]
          services: string[]
          staff_count: number | null
          updated_at: string
          verified: boolean
          website: string | null
          workspace_id: string
        }
        Insert: {
          about?: string | null
          accreditations?: string[]
          city?: string | null
          contact_email?: string | null
          country?: string | null
          created_at?: string
          founded_year?: number | null
          id?: string
          is_global?: boolean
          is_remote?: boolean
          latitude?: number | null
          location: string
          logo_path?: string | null
          longitude?: number | null
          name: string
          service_areas?: string[]
          services?: string[]
          staff_count?: number | null
          updated_at?: string
          verified?: boolean
          website?: string | null
          workspace_id: string
        }
        Update: {
          about?: string | null
          accreditations?: string[]
          city?: string | null
          contact_email?: string | null
          country?: string | null
          created_at?: string
          founded_year?: number | null
          id?: string
          is_global?: boolean
          is_remote?: boolean
          latitude?: number | null
          location?: string
          logo_path?: string | null
          longitude?: number | null
          name?: string
          service_areas?: string[]
          services?: string[]
          staff_count?: number | null
          updated_at?: string
          verified?: boolean
          website?: string | null
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
      market_inquiries: {
        Row: {
          created_at: string
          desired_start_date: string | null
          id: string
          intent: string
          item_id: string
          kind: string
          message: string | null
          requester_email: string | null
          requester_name: string | null
          requester_user_id: string
          requester_workspace_id: string | null
          responded_at: string | null
          seats: number | null
          status: string
        }
        Insert: {
          created_at?: string
          desired_start_date?: string | null
          id?: string
          intent?: string
          item_id: string
          kind: string
          message?: string | null
          requester_email?: string | null
          requester_name?: string | null
          requester_user_id: string
          requester_workspace_id?: string | null
          responded_at?: string | null
          seats?: number | null
          status?: string
        }
        Update: {
          created_at?: string
          desired_start_date?: string | null
          id?: string
          intent?: string
          item_id?: string
          kind?: string
          message?: string | null
          requester_email?: string | null
          requester_name?: string | null
          requester_user_id?: string
          requester_workspace_id?: string | null
          responded_at?: string | null
          seats?: number | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "market_inquiries_requester_workspace_id_fkey"
            columns: ["requester_workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      market_job_posts: {
        Row: {
          apply_url: string | null
          benefits: string[]
          city: string | null
          closes_at: string | null
          company: string | null
          country: string | null
          created_at: string
          currency: string
          description: string | null
          discipline: string
          employment_type: string
          id: string
          is_global: boolean
          is_remote: boolean
          latitude: number | null
          location: string
          longitude: number | null
          photo_path: string | null
          rate: number | null
          rate_per: string | null
          requirements: string[] | null
          seniority: string | null
          starts_on: string | null
          status: string
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          apply_url?: string | null
          benefits?: string[]
          city?: string | null
          closes_at?: string | null
          company?: string | null
          country?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          discipline: string
          employment_type?: string
          id?: string
          is_global?: boolean
          is_remote?: boolean
          latitude?: number | null
          location: string
          longitude?: number | null
          photo_path?: string | null
          rate?: number | null
          rate_per?: string | null
          requirements?: string[] | null
          seniority?: string | null
          starts_on?: string | null
          status?: string
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          apply_url?: string | null
          benefits?: string[]
          city?: string | null
          closes_at?: string | null
          company?: string | null
          country?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          discipline?: string
          employment_type?: string
          id?: string
          is_global?: boolean
          is_remote?: boolean
          latitude?: number | null
          location?: string
          longitude?: number | null
          photo_path?: string | null
          rate?: number | null
          rate_per?: string | null
          requirements?: string[] | null
          seniority?: string | null
          starts_on?: string | null
          status?: string
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
      market_reviews: {
        Row: {
          author_user_id: string
          body: string | null
          created_at: string
          id: string
          item_id: string
          kind: string
          rating: number
          updated_at: string
        }
        Insert: {
          author_user_id: string
          body?: string | null
          created_at?: string
          id?: string
          item_id: string
          kind: string
          rating: number
          updated_at?: string
        }
        Update: {
          author_user_id?: string
          body?: string | null
          created_at?: string
          id?: string
          item_id?: string
          kind?: string
          rating?: number
          updated_at?: string
        }
        Relationships: []
      }
      market_saved_searches: {
        Row: {
          created_at: string
          id: string
          listing_category: string
          query: string
          scope: string
          sort: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          listing_category?: string
          query?: string
          scope?: string
          sort?: string
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          listing_category?: string
          query?: string
          scope?: string
          sort?: string
          user_id?: string
        }
        Relationships: []
      }
      marketplace_listings: {
        Row: {
          asset_id: string | null
          available_from: string | null
          available_to: string | null
          category: string
          city: string | null
          condition: string
          country: string | null
          created_at: string
          currency: string
          delivery: string | null
          description: string | null
          expires_at: string | null
          id: string
          is_global: boolean
          is_remote: boolean
          is_verified: boolean
          latitude: number | null
          listing_type: string | null
          location: string
          longitude: number | null
          manufacture_year: number | null
          name: string
          negotiable: boolean
          price: number
          quantity: number
          seller: string
          seller_wallet_address: string | null
          serial_number: string | null
          specs: string[] | null
          status: string
          type: string
          updated_at: string
          warranty_months: number | null
          workspace_id: string
        }
        Insert: {
          asset_id?: string | null
          available_from?: string | null
          available_to?: string | null
          category?: string
          city?: string | null
          condition: string
          country?: string | null
          created_at?: string
          currency: string
          delivery?: string | null
          description?: string | null
          expires_at?: string | null
          id?: string
          is_global?: boolean
          is_remote?: boolean
          is_verified?: boolean
          latitude?: number | null
          listing_type?: string | null
          location: string
          longitude?: number | null
          manufacture_year?: number | null
          name: string
          negotiable?: boolean
          price: number
          quantity?: number
          seller: string
          seller_wallet_address?: string | null
          serial_number?: string | null
          specs?: string[] | null
          status?: string
          type: string
          updated_at?: string
          warranty_months?: number | null
          workspace_id: string
        }
        Update: {
          asset_id?: string | null
          available_from?: string | null
          available_to?: string | null
          category?: string
          city?: string | null
          condition?: string
          country?: string | null
          created_at?: string
          currency?: string
          delivery?: string | null
          description?: string | null
          expires_at?: string | null
          id?: string
          is_global?: boolean
          is_remote?: boolean
          is_verified?: boolean
          latitude?: number | null
          listing_type?: string | null
          location?: string
          longitude?: number | null
          manufacture_year?: number | null
          name?: string
          negotiable?: boolean
          price?: number
          quantity?: number
          seller?: string
          seller_wallet_address?: string | null
          serial_number?: string | null
          specs?: string[] | null
          status?: string
          type?: string
          updated_at?: string
          warranty_months?: number | null
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
          city: string | null
          country: string | null
          created_at: string
          credential_expires_on: string | null
          credential_issuer: string | null
          currency: string
          discipline: string
          experience: string
          id: string
          is_global: boolean
          is_remote: boolean
          is_verified: boolean
          languages: string[]
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
          travel_radius_km: number | null
          updated_at: string
          workspace_id: string
        }
        Insert: {
          availability: string
          avatar_path?: string | null
          banner_path?: string | null
          bio?: string | null
          certifications?: string[] | null
          city?: string | null
          country?: string | null
          created_at?: string
          credential_expires_on?: string | null
          credential_issuer?: string | null
          currency: string
          discipline: string
          experience: string
          id?: string
          is_global?: boolean
          is_remote?: boolean
          is_verified?: boolean
          languages?: string[]
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
          travel_radius_km?: number | null
          updated_at?: string
          workspace_id: string
        }
        Update: {
          availability?: string
          avatar_path?: string | null
          banner_path?: string | null
          bio?: string | null
          certifications?: string[] | null
          city?: string | null
          country?: string | null
          created_at?: string
          credential_expires_on?: string | null
          credential_issuer?: string | null
          currency?: string
          discipline?: string
          experience?: string
          id?: string
          is_global?: boolean
          is_remote?: boolean
          is_verified?: boolean
          languages?: string[]
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
          travel_radius_km?: number | null
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
      solana_market_cache: {
        Row: {
          id: number
          payload: Json
          updated_at: string
        }
        Insert: {
          id?: number
          payload: Json
          updated_at?: string
        }
        Update: {
          id?: number
          payload?: Json
          updated_at?: string
        }
        Relationships: []
      }
      survey_deliverables: {
        Row: {
          content_type: string
          created_at: string
          id: string
          kind: string
          run_id: string
          size_bytes: number | null
          storage_path: string
          workspace_id: string
        }
        Insert: {
          content_type: string
          created_at?: string
          id?: string
          kind: string
          run_id: string
          size_bytes?: number | null
          storage_path: string
          workspace_id: string
        }
        Update: {
          content_type?: string
          created_at?: string
          id?: string
          kind?: string
          run_id?: string
          size_bytes?: number | null
          storage_path?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "survey_deliverables_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "survey_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "survey_deliverables_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      survey_runs: {
        Row: {
          address: string | null
          categories: string[]
          claimed_at: string | null
          client_name: string
          completed_at: string | null
          composite: Json | null
          created_at: string
          created_by: string | null
          data_sources: Json | null
          estimated_minutes: number | null
          error_message: string | null
          half_deg: number
          id: string
          latitude: number
          longitude: number
          progress: number
          project_id: string | null
          result: Json | null
          stage: string | null
          status: string
          updated_at: string
          worker_id: string | null
          workspace_id: string
        }
        Insert: {
          address?: string | null
          categories?: string[]
          claimed_at?: string | null
          client_name?: string
          completed_at?: string | null
          composite?: Json | null
          created_at?: string
          created_by?: string | null
          data_sources?: Json | null
          estimated_minutes?: number | null
          error_message?: string | null
          half_deg?: number
          id?: string
          latitude: number
          longitude: number
          progress?: number
          project_id?: string | null
          result?: Json | null
          stage?: string | null
          status?: string
          updated_at?: string
          worker_id?: string | null
          workspace_id: string
        }
        Update: {
          address?: string | null
          categories?: string[]
          claimed_at?: string | null
          client_name?: string
          completed_at?: string | null
          composite?: Json | null
          created_at?: string
          created_by?: string | null
          data_sources?: Json | null
          estimated_minutes?: number | null
          error_message?: string | null
          half_deg?: number
          id?: string
          latitude?: number
          longitude?: number
          progress?: number
          project_id?: string | null
          result?: Json | null
          stage?: string | null
          status?: string
          updated_at?: string
          worker_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "survey_runs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      survey_targets: {
        Row: {
          category: string
          created_at: string
          distance_km: number | null
          id: string
          latitude: number
          longitude: number
          payload: Json | null
          rank: number
          readout: string | null
          run_id: string
          score: number | null
          workspace_id: string
        }
        Insert: {
          category: string
          created_at?: string
          distance_km?: number | null
          id?: string
          latitude: number
          longitude: number
          payload?: Json | null
          rank: number
          readout?: string | null
          run_id: string
          score?: number | null
          workspace_id: string
        }
        Update: {
          category?: string
          created_at?: string
          distance_km?: number | null
          id?: string
          latitude?: number
          longitude?: number
          payload?: Json | null
          rank?: number
          readout?: string | null
          run_id?: string
          score?: number | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "survey_targets_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "survey_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "survey_targets_workspace_id_fkey"
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
      transport_booking_events: {
        Row: {
          actor_id: string | null
          actor_kind: string
          at: string
          booking_id: string
          from_status: string | null
          id: string
          note: string | null
          to_status: string
        }
        Insert: {
          actor_id?: string | null
          actor_kind: string
          at?: string
          booking_id: string
          from_status?: string | null
          id?: string
          note?: string | null
          to_status: string
        }
        Update: {
          actor_id?: string | null
          actor_kind?: string
          at?: string
          booking_id?: string
          from_status?: string | null
          id?: string
          note?: string | null
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "transport_booking_events_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "transport_bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      transport_bookings: {
        Row: {
          cancel_reason: string | null
          capacity_released_at: string | null
          collected_at: string | null
          contents: string
          created_at: string
          currency: string
          delivered_at: string | null
          departure_id: string
          dropoff_city_id: string
          fee: number
          fee_status: string
          fulfilment: string
          id: string
          listing_id: string | null
          mode: string
          order_id: string | null
          payment_provider: string | null
          payment_reference: string | null
          pickup_city_id: string
          proof_path: string | null
          recipient_name: string
          recipient_phone: string | null
          slots: number
          status: string
          tracking_code: string
          updated_at: string
          weight_kg: number
          workspace_id: string
        }
        Insert: {
          cancel_reason?: string | null
          capacity_released_at?: string | null
          collected_at?: string | null
          contents: string
          created_at?: string
          currency?: string
          delivered_at?: string | null
          departure_id: string
          dropoff_city_id: string
          fee?: number
          fee_status?: string
          fulfilment?: string
          id?: string
          listing_id?: string | null
          mode?: string
          order_id?: string | null
          payment_provider?: string | null
          payment_reference?: string | null
          pickup_city_id: string
          proof_path?: string | null
          recipient_name: string
          recipient_phone?: string | null
          slots?: number
          status?: string
          tracking_code: string
          updated_at?: string
          weight_kg?: number
          workspace_id: string
        }
        Update: {
          cancel_reason?: string | null
          capacity_released_at?: string | null
          collected_at?: string | null
          contents?: string
          created_at?: string
          currency?: string
          delivered_at?: string | null
          departure_id?: string
          dropoff_city_id?: string
          fee?: number
          fee_status?: string
          fulfilment?: string
          id?: string
          listing_id?: string | null
          mode?: string
          order_id?: string | null
          payment_provider?: string | null
          payment_reference?: string | null
          pickup_city_id?: string
          proof_path?: string | null
          recipient_name?: string
          recipient_phone?: string | null
          slots?: number
          status?: string
          tracking_code?: string
          updated_at?: string
          weight_kg?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transport_bookings_departure_fkey"
            columns: ["departure_id"]
            isOneToOne: false
            referencedRelation: "public_transport_runs"
            referencedColumns: ["departure_id"]
          },
          {
            foreignKeyName: "transport_bookings_departure_fkey"
            columns: ["departure_id"]
            isOneToOne: false
            referencedRelation: "transport_departures"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_bookings_dropoff_city_id_fkey"
            columns: ["dropoff_city_id"]
            isOneToOne: false
            referencedRelation: "public_transport_corridors"
            referencedColumns: ["destination_city_id"]
          },
          {
            foreignKeyName: "transport_bookings_dropoff_city_id_fkey"
            columns: ["dropoff_city_id"]
            isOneToOne: false
            referencedRelation: "public_transport_corridors"
            referencedColumns: ["origin_city_id"]
          },
          {
            foreignKeyName: "transport_bookings_dropoff_city_id_fkey"
            columns: ["dropoff_city_id"]
            isOneToOne: false
            referencedRelation: "public_transport_stops"
            referencedColumns: ["city_id"]
          },
          {
            foreignKeyName: "transport_bookings_dropoff_city_id_fkey"
            columns: ["dropoff_city_id"]
            isOneToOne: false
            referencedRelation: "transport_cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_bookings_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "marketplace_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_bookings_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "public_market_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_bookings_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "marketplace_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_bookings_pickup_city_id_fkey"
            columns: ["pickup_city_id"]
            isOneToOne: false
            referencedRelation: "public_transport_corridors"
            referencedColumns: ["destination_city_id"]
          },
          {
            foreignKeyName: "transport_bookings_pickup_city_id_fkey"
            columns: ["pickup_city_id"]
            isOneToOne: false
            referencedRelation: "public_transport_corridors"
            referencedColumns: ["origin_city_id"]
          },
          {
            foreignKeyName: "transport_bookings_pickup_city_id_fkey"
            columns: ["pickup_city_id"]
            isOneToOne: false
            referencedRelation: "public_transport_stops"
            referencedColumns: ["city_id"]
          },
          {
            foreignKeyName: "transport_bookings_pickup_city_id_fkey"
            columns: ["pickup_city_id"]
            isOneToOne: false
            referencedRelation: "transport_cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_bookings_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      transport_checkpoints: {
        Row: {
          city_id: string
          departure_id: string
          id: string
          latitude: number
          longitude: number
          note: string | null
          reported_at: string
          reported_by: string
          sequence: number
        }
        Insert: {
          city_id: string
          departure_id: string
          id?: string
          latitude: number
          longitude: number
          note?: string | null
          reported_at?: string
          reported_by: string
          sequence: number
        }
        Update: {
          city_id?: string
          departure_id?: string
          id?: string
          latitude?: number
          longitude?: number
          note?: string | null
          reported_at?: string
          reported_by?: string
          sequence?: number
        }
        Relationships: [
          {
            foreignKeyName: "transport_checkpoints_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "public_transport_corridors"
            referencedColumns: ["destination_city_id"]
          },
          {
            foreignKeyName: "transport_checkpoints_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "public_transport_corridors"
            referencedColumns: ["origin_city_id"]
          },
          {
            foreignKeyName: "transport_checkpoints_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "public_transport_stops"
            referencedColumns: ["city_id"]
          },
          {
            foreignKeyName: "transport_checkpoints_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "transport_cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_checkpoints_departure_id_fkey"
            columns: ["departure_id"]
            isOneToOne: false
            referencedRelation: "public_transport_runs"
            referencedColumns: ["departure_id"]
          },
          {
            foreignKeyName: "transport_checkpoints_departure_id_fkey"
            columns: ["departure_id"]
            isOneToOne: false
            referencedRelation: "transport_departures"
            referencedColumns: ["id"]
          },
        ]
      }
      transport_cities: {
        Row: {
          active: boolean
          country: string
          created_at: string
          hub_address: string | null
          hub_hours: string | null
          id: string
          is_sample: boolean
          latitude: number
          longitude: number
          name: string
          timezone: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          country?: string
          created_at?: string
          hub_address?: string | null
          hub_hours?: string | null
          id?: string
          is_sample?: boolean
          latitude: number
          longitude: number
          name: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          country?: string
          created_at?: string
          hub_address?: string | null
          hub_hours?: string | null
          id?: string
          is_sample?: boolean
          latitude?: number
          longitude?: number
          name?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      transport_departures: {
        Row: {
          arrived_at: string | null
          backstop_at: string
          booked_kg: number
          booked_slots: number
          booking_cutoff_at: string
          cancel_reason: string | null
          capacity_kg: number
          capacity_slots: number
          created_at: string
          departed_at: string | null
          id: string
          is_sample: boolean
          planned_departure_at: string
          private_booking_id: string | null
          route_id: string
          status: string
          target_load_ratio: number
          updated_at: string
          vehicle_class_id: string | null
          vehicle_id: string | null
        }
        Insert: {
          arrived_at?: string | null
          backstop_at: string
          booked_kg?: number
          booked_slots?: number
          booking_cutoff_at: string
          cancel_reason?: string | null
          capacity_kg: number
          capacity_slots: number
          created_at?: string
          departed_at?: string | null
          id?: string
          is_sample?: boolean
          planned_departure_at: string
          private_booking_id?: string | null
          route_id: string
          status?: string
          target_load_ratio?: number
          updated_at?: string
          vehicle_class_id?: string | null
          vehicle_id?: string | null
        }
        Update: {
          arrived_at?: string | null
          backstop_at?: string
          booked_kg?: number
          booked_slots?: number
          booking_cutoff_at?: string
          cancel_reason?: string | null
          capacity_kg?: number
          capacity_slots?: number
          created_at?: string
          departed_at?: string | null
          id?: string
          is_sample?: boolean
          planned_departure_at?: string
          private_booking_id?: string | null
          route_id?: string
          status?: string
          target_load_ratio?: number
          updated_at?: string
          vehicle_class_id?: string | null
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transport_departures_private_booking_id_fkey"
            columns: ["private_booking_id"]
            isOneToOne: false
            referencedRelation: "transport_bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_departures_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "public_transport_corridors"
            referencedColumns: ["route_id"]
          },
          {
            foreignKeyName: "transport_departures_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "transport_routes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_departures_vehicle_class_id_fkey"
            columns: ["vehicle_class_id"]
            isOneToOne: false
            referencedRelation: "transport_vehicle_classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_departures_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "public_transport_fleet"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_departures_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "transport_vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      transport_route_stops: {
        Row: {
          city_id: string
          created_at: string
          dwell_minutes: number
          id: string
          route_id: string
          sequence: number
          stop_offset_km: number | null
        }
        Insert: {
          city_id: string
          created_at?: string
          dwell_minutes?: number
          id?: string
          route_id: string
          sequence: number
          stop_offset_km?: number | null
        }
        Update: {
          city_id?: string
          created_at?: string
          dwell_minutes?: number
          id?: string
          route_id?: string
          sequence?: number
          stop_offset_km?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "transport_route_stops_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "public_transport_corridors"
            referencedColumns: ["destination_city_id"]
          },
          {
            foreignKeyName: "transport_route_stops_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "public_transport_corridors"
            referencedColumns: ["origin_city_id"]
          },
          {
            foreignKeyName: "transport_route_stops_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "public_transport_stops"
            referencedColumns: ["city_id"]
          },
          {
            foreignKeyName: "transport_route_stops_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "transport_cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_route_stops_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "public_transport_corridors"
            referencedColumns: ["route_id"]
          },
          {
            foreignKeyName: "transport_route_stops_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "transport_routes"
            referencedColumns: ["id"]
          },
        ]
      }
      transport_routes: {
        Row: {
          code: string
          created_at: string
          currency: string
          destination_city_id: string
          direct_distance_km: number | null
          fare_final_mile: number
          fare_per_kg: number
          fare_per_slot: number
          id: string
          is_sample: boolean
          name: string
          origin_city_id: string
          status: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          currency?: string
          destination_city_id: string
          direct_distance_km?: number | null
          fare_final_mile?: number
          fare_per_kg?: number
          fare_per_slot?: number
          id?: string
          is_sample?: boolean
          name: string
          origin_city_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          currency?: string
          destination_city_id?: string
          direct_distance_km?: number | null
          fare_final_mile?: number
          fare_per_kg?: number
          fare_per_slot?: number
          id?: string
          is_sample?: boolean
          name?: string
          origin_city_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transport_routes_destination_city_id_fkey"
            columns: ["destination_city_id"]
            isOneToOne: false
            referencedRelation: "public_transport_corridors"
            referencedColumns: ["destination_city_id"]
          },
          {
            foreignKeyName: "transport_routes_destination_city_id_fkey"
            columns: ["destination_city_id"]
            isOneToOne: false
            referencedRelation: "public_transport_corridors"
            referencedColumns: ["origin_city_id"]
          },
          {
            foreignKeyName: "transport_routes_destination_city_id_fkey"
            columns: ["destination_city_id"]
            isOneToOne: false
            referencedRelation: "public_transport_stops"
            referencedColumns: ["city_id"]
          },
          {
            foreignKeyName: "transport_routes_destination_city_id_fkey"
            columns: ["destination_city_id"]
            isOneToOne: false
            referencedRelation: "transport_cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_routes_origin_city_id_fkey"
            columns: ["origin_city_id"]
            isOneToOne: false
            referencedRelation: "public_transport_corridors"
            referencedColumns: ["destination_city_id"]
          },
          {
            foreignKeyName: "transport_routes_origin_city_id_fkey"
            columns: ["origin_city_id"]
            isOneToOne: false
            referencedRelation: "public_transport_corridors"
            referencedColumns: ["origin_city_id"]
          },
          {
            foreignKeyName: "transport_routes_origin_city_id_fkey"
            columns: ["origin_city_id"]
            isOneToOne: false
            referencedRelation: "public_transport_stops"
            referencedColumns: ["city_id"]
          },
          {
            foreignKeyName: "transport_routes_origin_city_id_fkey"
            columns: ["origin_city_id"]
            isOneToOne: false
            referencedRelation: "transport_cities"
            referencedColumns: ["id"]
          },
        ]
      }
      transport_vehicle_classes: {
        Row: {
          active: boolean
          capacity_kg: number
          capacity_slots: number
          created_at: string
          default_backstop_days: number
          id: string
          label: string
          min_load_ratio: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          capacity_kg: number
          capacity_slots: number
          created_at?: string
          default_backstop_days?: number
          id?: string
          label: string
          min_load_ratio?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          capacity_kg?: number
          capacity_slots?: number
          created_at?: string
          default_backstop_days?: number
          id?: string
          label?: string
          min_load_ratio?: number
          updated_at?: string
        }
        Relationships: []
      }
      transport_vehicles: {
        Row: {
          active: boolean
          class_id: string
          created_at: string
          description: string | null
          id: string
          insurance_reference: string | null
          is_sample: boolean
          plate: string
          updated_at: string
          verification_status: string
          verified_at: string | null
          verified_by: string | null
          workspace_id: string | null
        }
        Insert: {
          active?: boolean
          class_id: string
          created_at?: string
          description?: string | null
          id?: string
          insurance_reference?: string | null
          is_sample?: boolean
          plate: string
          updated_at?: string
          verification_status?: string
          verified_at?: string | null
          verified_by?: string | null
          workspace_id?: string | null
        }
        Update: {
          active?: boolean
          class_id?: string
          created_at?: string
          description?: string | null
          id?: string
          insurance_reference?: string | null
          is_sample?: boolean
          plate?: string
          updated_at?: string
          verification_status?: string
          verified_at?: string | null
          verified_by?: string | null
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transport_vehicles_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "transport_vehicle_classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_vehicles_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_ai_credit_accounts: {
        Row: {
          balance: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          balance?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          balance?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_ai_credit_accounts_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: true
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_ai_credit_transactions: {
        Row: {
          actor_user_id: string | null
          balance_after: number
          created_at: string
          credits_delta: number
          description: string
          id: string
          kind: string
          operation_id: string
          related_id: string | null
          workspace_id: string
        }
        Insert: {
          actor_user_id?: string | null
          balance_after: number
          created_at?: string
          credits_delta: number
          description: string
          id?: string
          kind: string
          operation_id: string
          related_id?: string | null
          workspace_id: string
        }
        Update: {
          actor_user_id?: string | null
          balance_after?: number
          created_at?: string
          credits_delta?: number
          description?: string
          id?: string
          kind?: string
          operation_id?: string
          related_id?: string | null
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_ai_credit_transactions_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
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
      workspace_pesepay_transactions: {
        Row: {
          amount: number
          completed_at: string | null
          created_at: string
          credit_amount: number | null
          currency_code: string
          description: string
          duration_days: number | null
          estimated_infrastructure_cost: number
          estimated_payment_fee: number
          id: string
          kind: string
          package_id: string | null
          pesepay_reference: string | null
          provider_status: string | null
          refund_reason: string | null
          refunded_at: string | null
          refunded_by: string | null
          related_id: string | null
          status: string
          storage_mb: number | null
          user_id: string
          wallet_id: string
          workspace_id: string
        }
        Insert: {
          amount: number
          completed_at?: string | null
          created_at?: string
          credit_amount?: number | null
          currency_code?: string
          description: string
          duration_days?: number | null
          estimated_infrastructure_cost?: number
          estimated_payment_fee?: number
          id?: string
          kind: string
          package_id?: string | null
          pesepay_reference?: string | null
          provider_status?: string | null
          refund_reason?: string | null
          refunded_at?: string | null
          refunded_by?: string | null
          related_id?: string | null
          status?: string
          storage_mb?: number | null
          user_id: string
          wallet_id: string
          workspace_id: string
        }
        Update: {
          amount?: number
          completed_at?: string | null
          created_at?: string
          credit_amount?: number | null
          currency_code?: string
          description?: string
          duration_days?: number | null
          estimated_infrastructure_cost?: number
          estimated_payment_fee?: number
          id?: string
          kind?: string
          package_id?: string | null
          pesepay_reference?: string | null
          provider_status?: string | null
          refund_reason?: string | null
          refunded_at?: string | null
          refunded_by?: string | null
          related_id?: string | null
          status?: string
          storage_mb?: number | null
          user_id?: string
          wallet_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_pesepay_transaction_wallet_id_workspace_id_user__fkey"
            columns: ["wallet_id", "workspace_id", "user_id"]
            isOneToOne: false
            referencedRelation: "workspace_pesepay_wallets"
            referencedColumns: ["id", "workspace_id", "user_id"]
          },
          {
            foreignKeyName: "workspace_pesepay_transactions_package_id_fkey"
            columns: ["package_id"]
            isOneToOne: false
            referencedRelation: "billing_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_pesepay_transactions_refunded_by_fkey"
            columns: ["refunded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_pesepay_wallets: {
        Row: {
          balance: number
          created_at: string
          currency_code: string
          id: string
          updated_at: string
          user_id: string
          workspace_id: string
        }
        Insert: {
          balance?: number
          created_at?: string
          currency_code?: string
          id?: string
          updated_at?: string
          user_id: string
          workspace_id: string
        }
        Update: {
          balance?: number
          created_at?: string
          currency_code?: string
          id?: string
          updated_at?: string
          user_id?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_pesepay_wallets_workspace_id_fkey"
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
      workspace_storage_purchases: {
        Row: {
          amount: number
          created_at: string
          currency_code: string
          expires_at: string | null
          id: string
          included_in_base_quota: boolean
          paid_at: string
          payment_method: string
          plan_id: string
          purchased_by: string | null
          starts_at: string
          storage_mb: number
          workspace_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency_code: string
          expires_at?: string | null
          id?: string
          included_in_base_quota?: boolean
          paid_at?: string
          payment_method?: string
          plan_id: string
          purchased_by?: string | null
          starts_at?: string
          storage_mb: number
          workspace_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency_code?: string
          expires_at?: string | null
          id?: string
          included_in_base_quota?: boolean
          paid_at?: string
          payment_method?: string
          plan_id?: string
          purchased_by?: string | null
          starts_at?: string
          storage_mb?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_storage_purchases_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "billing_packages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workspace_storage_purchases_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
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
    }
    Views: {
      public_market_events: {
        Row: {
          agenda: string[] | null
          capacity: number | null
          certification_body: string | null
          city: string | null
          country: string | null
          cpd_points: number | null
          created_at: string | null
          currency: string | null
          description: string | null
          ends_at: string | null
          id: string | null
          instructor: string | null
          is_remote: boolean | null
          kind: string | null
          latitude: number | null
          location: string | null
          longitude: number | null
          photo_path: string | null
          price: number | null
          provider: string | null
          registration_deadline: string | null
          registration_url: string | null
          saves: number | null
          seats_left: number | null
          starts_at: string | null
          timezone: string | null
          title: string | null
          updated_at: string | null
          venue_address: string | null
        }
        Relationships: []
      }
      public_market_firms: {
        Row: {
          about: string | null
          accreditations: string[] | null
          city: string | null
          contact_email: string | null
          country: string | null
          created_at: string | null
          founded_year: number | null
          id: string | null
          is_remote: boolean | null
          latitude: number | null
          location: string | null
          logo_path: string | null
          longitude: number | null
          name: string | null
          rating: number | null
          reviews: number | null
          saves: number | null
          service_areas: string[] | null
          services: string[] | null
          staff_count: number | null
          updated_at: string | null
          verified: boolean | null
          website: string | null
        }
        Relationships: []
      }
      public_market_jobs: {
        Row: {
          apply_url: string | null
          benefits: string[] | null
          city: string | null
          closes_at: string | null
          company: string | null
          country: string | null
          created_at: string | null
          currency: string | null
          description: string | null
          discipline: string | null
          employment_type: string | null
          id: string | null
          is_remote: boolean | null
          latitude: number | null
          location: string | null
          longitude: number | null
          photo_path: string | null
          rate: number | null
          rate_per: string | null
          requirements: string[] | null
          saves: number | null
          seniority: string | null
          starts_on: string | null
          status: string | null
          title: string | null
          updated_at: string | null
        }
        Relationships: []
      }
      public_market_listings: {
        Row: {
          available_from: string | null
          available_to: string | null
          category: string | null
          city: string | null
          condition: string | null
          country: string | null
          created_at: string | null
          currency: string | null
          delivery: string | null
          description: string | null
          expires_at: string | null
          id: string | null
          is_remote: boolean | null
          is_verified: boolean | null
          latitude: number | null
          listing_type: string | null
          location: string | null
          longitude: number | null
          manufacture_year: number | null
          name: string | null
          negotiable: boolean | null
          photos: string[] | null
          price: number | null
          quantity: number | null
          saves: number | null
          seller: string | null
          serial_number: string | null
          specs: string[] | null
          status: string | null
          type: string | null
          updated_at: string | null
          warranty_months: number | null
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
          city: string | null
          country: string | null
          created_at: string | null
          credential_expires_on: string | null
          credential_issuer: string | null
          currency: string | null
          discipline: string | null
          experience: string | null
          id: string | null
          is_remote: boolean | null
          is_verified: boolean | null
          languages: string[] | null
          latitude: number | null
          location: string | null
          longitude: number | null
          name: string | null
          rate: number | null
          rate_per: string | null
          rating: number | null
          reviews: number | null
          saves: number | null
          skills: string[] | null
          title: string | null
          travel_radius_km: number | null
          updated_at: string | null
        }
        Relationships: []
      }
      public_market_reviews: {
        Row: {
          body: string | null
          created_at: string | null
          id: string | null
          item_id: string | null
          kind: string | null
          rating: number | null
        }
        Insert: {
          body?: string | null
          created_at?: string | null
          id?: string | null
          item_id?: string | null
          kind?: string | null
          rating?: number | null
        }
        Update: {
          body?: string | null
          created_at?: string | null
          id?: string | null
          item_id?: string | null
          kind?: string | null
          rating?: number | null
        }
        Relationships: []
      }
      public_transport_checkpoints: {
        Row: {
          city: string | null
          country: string | null
          departure_id: string | null
          latitude: number | null
          longitude: number | null
          note: string | null
          reported_at: string | null
          sequence: number | null
        }
        Relationships: [
          {
            foreignKeyName: "transport_checkpoints_departure_id_fkey"
            columns: ["departure_id"]
            isOneToOne: false
            referencedRelation: "public_transport_runs"
            referencedColumns: ["departure_id"]
          },
          {
            foreignKeyName: "transport_checkpoints_departure_id_fkey"
            columns: ["departure_id"]
            isOneToOne: false
            referencedRelation: "transport_departures"
            referencedColumns: ["id"]
          },
        ]
      }
      public_transport_corridors: {
        Row: {
          code: string | null
          currency: string | null
          destination_city: string | null
          destination_city_id: string | null
          destination_country: string | null
          destination_latitude: number | null
          destination_longitude: number | null
          direct_distance_km: number | null
          fare_final_mile: number | null
          fare_per_kg: number | null
          fare_per_slot: number | null
          is_sample: boolean | null
          live_runs: number | null
          name: string | null
          next_roll_at: string | null
          open_runs: number | null
          origin_city: string | null
          origin_city_id: string | null
          origin_country: string | null
          origin_latitude: number | null
          origin_longitude: number | null
          route_id: string | null
          route_status: string | null
        }
        Relationships: []
      }
      public_transport_fleet: {
        Row: {
          capacity_kg: number | null
          capacity_slots: number | null
          class_label: string | null
          description: string | null
          id: string | null
          plate: string | null
          target_percent: number | null
          verified_at: string | null
        }
        Relationships: []
      }
      public_transport_runs: {
        Row: {
          arrived_at: string | null
          backstop_at: string | null
          booked_kg: number | null
          booked_slots: number | null
          booking_cutoff_at: string | null
          capacity_kg: number | null
          capacity_slots: number | null
          currency: string | null
          departed_at: string | null
          departure_id: string | null
          destination_city: string | null
          fare_final_mile: number | null
          fare_per_kg: number | null
          fare_per_slot: number | null
          governing_dimension: string | null
          is_private_charter: boolean | null
          is_sample: boolean | null
          last_reported_at: string | null
          last_reported_city: string | null
          load_percent: number | null
          origin_city: string | null
          planned_departure_at: string | null
          route_code: string | null
          route_id: string | null
          route_name: string | null
          status: string | null
          target_percent: number | null
          vehicle_class: string | null
          vehicle_verification: string | null
        }
        Relationships: [
          {
            foreignKeyName: "transport_departures_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "public_transport_corridors"
            referencedColumns: ["route_id"]
          },
          {
            foreignKeyName: "transport_departures_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "transport_routes"
            referencedColumns: ["id"]
          },
        ]
      }
      public_transport_stops: {
        Row: {
          city: string | null
          city_id: string | null
          country: string | null
          dwell_minutes: number | null
          has_hub: boolean | null
          latitude: number | null
          longitude: number | null
          route_id: string | null
          sequence: number | null
          stop_offset_km: number | null
        }
        Relationships: [
          {
            foreignKeyName: "transport_route_stops_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "public_transport_corridors"
            referencedColumns: ["route_id"]
          },
          {
            foreignKeyName: "transport_route_stops_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "transport_routes"
            referencedColumns: ["id"]
          },
        ]
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
      cancel_survey_run: { Args: { p_run_id: string }; Returns: undefined }
      claim_next_survey_run: {
        Args: { p_worker_id: string }
        Returns: Json
      }
      create_business_workspace: {
        Args: { workspace_name: string; workspace_slug?: string }
        Returns: string
      }
      fail_survey_run: {
        Args: { p_error: string; p_run_id: string }
        Returns: undefined
      }
      fulfil_workspace_package_purchase: {
        Args: { p_transaction_id: string }
        Returns: string
      }
      get_database_size: { Args: never; Returns: number }
      get_platform_financial_overview: { Args: never; Returns: Json }
      get_tables_size: { Args: never; Returns: number }
      get_workspace_billing_overview: {
        Args: { p_workspace_id: string }
        Returns: Json
      }
      get_workspace_storage_usage: {
        Args: { p_workspace_id: string }
        Returns: Json
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
      link_email_identity: {
        Args: { p_email: string; p_user_id: string }
        Returns: undefined
      }
      link_web3_identity: {
        Args: {
          p_address: string
          p_chain: string
          p_identity_data?: Json
          p_user_id: string
        }
        Returns: undefined
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
      market_item_workspace: {
        Args: { p_item_id: string; p_kind: string }
        Returns: string
      }
      path_first_segment_uuid: { Args: { path: string }; Returns: string }
      pay_workspace_invoice_with_balance: {
        Args: {
          p_invoice_id: string
          p_request_id: string
          p_user_id: string
          p_workspace_id: string
        }
        Returns: {
          payment_id: string
          remaining_balance: number
        }[]
      }
      pay_workspace_package_with_balance: {
        Args: {
          p_package_id: string
          p_request_id: string
          p_user_id: string
          p_workspace_id: string
        }
        Returns: {
          purchase_id: string
          remaining_balance: number
        }[]
      }
      pay_workspace_storage_with_balance: {
        Args: {
          p_plan_id: string
          p_request_id: string
          p_user_id: string
          p_workspace_id: string
        }
        Returns: {
          purchase_id: string
          remaining_balance: number
        }[]
      }
      project_cad_metrics: {
        Args: { p_project_id: string }
        Returns: {
          linework: number
          points: number
          qa_flags: number
          surfaces: number
        }[]
      }
      prune_auth_nonces: { Args: never; Returns: undefined }
      publish_survey_run: {
        Args: {
          p_deliverables: Json
          p_result: Json
          p_run_id: string
          p_targets: Json
        }
        Returns: undefined
      }
      record_pesepay_transaction_refund: {
        Args: { p_reason: string; p_transaction_id: string }
        Returns: {
          balance_reclaimed: number
          credits_granted: number
          credits_reclaimed: number
          status: string
          storage_mb_revoked: number
        }[]
      }
      refund_workspace_ai_credits: {
        Args: {
          p_operation_id: string
          p_reason: string
          p_user_id: string
          p_workspace_id: string
        }
        Returns: {
          remaining_balance: number
          transaction_id: string
        }[]
      }
      remaining_signin_methods: {
        Args: { p_exclude_provider_id?: string; p_user_id: string }
        Returns: number
      }
      reverse_workspace_ai_credits: {
        Args: {
          p_reason: string
          p_transaction_id: string
          p_workspace_id: string
        }
        Returns: {
          credits_reversed: number
          remaining_balance: number
          transaction_id: string
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
      settle_workspace_package_purchase: {
        Args: { p_amount: number; p_currency_code: string; p_reference: string }
        Returns: string
      }
      settle_workspace_pesepay_deposit: {
        Args: { p_amount: number; p_currency_code: string; p_reference: string }
        Returns: undefined
      }
      shares_workspace_with_profile: {
        Args: { target_profile_id: string }
        Returns: boolean
      }
      slugify: { Args: { value: string }; Returns: string }
      spend_workspace_ai_credits: {
        Args: {
          p_description: string
          p_operation: string
          p_operation_id: string
          p_user_id: string
          p_workspace_id: string
        }
        Returns: {
          credits_charged: number
          remaining_balance: number
          transaction_id: string
        }[]
      }
      transport_advance_booking: {
        Args: { p_booking_id: string; p_note?: string; p_to_status: string }
        Returns: undefined
      }
      transport_advance_departure: {
        Args: { p_departure_id: string; p_to_status: string }
        Returns: undefined
      }
      transport_apply_quorum: {
        Args: { p_departure_id: string }
        Returns: undefined
      }
      transport_approve_load: {
        Args: { p_booking_id: string; p_note?: string }
        Returns: undefined
      }
      transport_cancel_booking: {
        Args: { p_booking_id: string; p_reason?: string }
        Returns: undefined
      }
      transport_cancel_departure: {
        Args: { p_departure_id: string; p_reason: string }
        Returns: number
      }
      transport_confirm_fee: {
        Args: { p_booking_id: string; p_provider: string; p_reference: string }
        Returns: undefined
      }
      transport_create_booking: {
        Args: {
          p_contents: string
          p_departure_id: string
          p_dropoff_city_id: string
          p_fulfilment?: string
          p_listing_id?: string
          p_mode: string
          p_order_id?: string
          p_pickup_city_id: string
          p_recipient_name: string
          p_recipient_phone?: string
          p_slots: number
          p_weight_kg: number
          p_workspace_id: string
        }
        Returns: {
          cancel_reason: string | null
          capacity_released_at: string | null
          collected_at: string | null
          contents: string
          created_at: string
          currency: string
          delivered_at: string | null
          departure_id: string
          dropoff_city_id: string
          fee: number
          fee_status: string
          fulfilment: string
          id: string
          listing_id: string | null
          mode: string
          order_id: string | null
          payment_provider: string | null
          payment_reference: string | null
          pickup_city_id: string
          proof_path: string | null
          recipient_name: string
          recipient_phone: string | null
          slots: number
          status: string
          tracking_code: string
          updated_at: string
          weight_kg: number
          workspace_id: string
        }
        SetofOptions: {
          from: "*"
          to: "transport_bookings"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      transport_direct_distance_km: {
        Args: {
          p_lat_a: number
          p_lat_b: number
          p_lng_a: number
          p_lng_b: number
        }
        Returns: number
      }
      transport_evaluate_departures: { Args: never; Returns: number }
      transport_governing_dimension: {
        Args: {
          p_departure: Database["public"]["Tables"]["transport_departures"]["Row"]
        }
        Returns: string
      }
      transport_load_ratio: {
        Args: {
          p_departure: Database["public"]["Tables"]["transport_departures"]["Row"]
        }
        Returns: number
      }
      transport_new_tracking_code: { Args: never; Returns: string }
      transport_offers_for_city: {
        Args: { p_destination_city_id: string }
        Returns: {
          booking_cutoff_at: string
          currency: string
          departure_id: string
          destination_city: string
          fare_per_kg: number
          fare_per_slot: number
          free_kg: number
          free_slots: number
          is_sample: boolean
          load_percent: number
          origin_city: string
          origin_city_id: string
          planned_departure_at: string
          route_code: string
          route_id: string
          route_name: string
          status: string
          target_percent: number
        }[]
      }
      transport_record_checkpoint: {
        Args: { p_city_id: string; p_departure_id: string; p_note?: string }
        Returns: undefined
      }
      transport_release_capacity: {
        Args: { p_booking_id: string }
        Returns: undefined
      }
      transport_stop_sequence: {
        Args: { p_city_id: string; p_route_id: string }
        Returns: number
      }
      unlink_email_signin: { Args: { p_user_id: string }; Returns: undefined }
      unlink_web3_identity: {
        Args: { p_address: string; p_chain: string; p_user_id: string }
        Returns: undefined
      }
      update_marketplace_wallet: {
        Args: { p_address: string; p_workspace_id: string }
        Returns: undefined
      }
      update_survey_run_progress: {
        Args: {
          p_progress: number
          p_run_id: string
          p_stage: string
          p_status?: string
        }
        Returns: undefined
      }
      workspace_storage_limit_bytes: {
        Args: { p_workspace_id: string }
        Returns: number
      }
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
