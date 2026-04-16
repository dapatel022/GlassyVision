// Hand-written from supabase/migrations/*.sql
// Replace with `supabase gen types typescript` once cloud project is connected.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string;
          role: Database['public']['Enums']['user_role'];
          avatar_url: string | null;
          last_active_at: string | null;
          invitation_id: string | null;
          timezone: string | null;
          preferred_notification_channels: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name?: string;
          role?: Database['public']['Enums']['user_role'];
          avatar_url?: string | null;
          last_active_at?: string | null;
          invitation_id?: string | null;
          timezone?: string | null;
          preferred_notification_channels?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string;
          role?: Database['public']['Enums']['user_role'];
          avatar_url?: string | null;
          last_active_at?: string | null;
          invitation_id?: string | null;
          timezone?: string | null;
          preferred_notification_channels?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      customers: {
        Row: {
          id: string;
          shopify_customer_id: number | null;
          email: string;
          first_name: string | null;
          last_name: string | null;
          lifetime_value: number | null;
          total_orders: number | null;
          first_order_at: string | null;
          last_order_at: string | null;
          vip_tier: Database['public']['Enums']['vip_tier'];
          internal_notes: string | null;
          flags: Json | null;
          deletion_requested_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          shopify_customer_id?: number | null;
          email: string;
          first_name?: string | null;
          last_name?: string | null;
          lifetime_value?: number | null;
          total_orders?: number | null;
          first_order_at?: string | null;
          last_order_at?: string | null;
          vip_tier?: Database['public']['Enums']['vip_tier'];
          internal_notes?: string | null;
          flags?: Json | null;
          deletion_requested_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          shopify_customer_id?: number | null;
          email?: string;
          first_name?: string | null;
          last_name?: string | null;
          lifetime_value?: number | null;
          total_orders?: number | null;
          first_order_at?: string | null;
          last_order_at?: string | null;
          vip_tier?: Database['public']['Enums']['vip_tier'];
          internal_notes?: string | null;
          flags?: Json | null;
          deletion_requested_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      orders: {
        Row: {
          id: string;
          shopify_order_id: number;
          shopify_order_number: string;
          customer_id: string | null;
          customer_email: string;
          customer_name: string;
          shipping_address: Json | null;
          billing_country: string | null;
          currency: string;
          subtotal: number;
          total: number;
          tax: number;
          shipping_cost: number;
          discount_code_used: string | null;
          financial_status: Database['public']['Enums']['order_financial_status'];
          fulfillment_status: Database['public']['Enums']['order_fulfillment_status'];
          has_rx_items: boolean;
          rx_status: Database['public']['Enums']['rx_status'];
          drop_id: string | null;
          utm_source: string | null;
          utm_medium: string | null;
          utm_campaign: string | null;
          first_order_ever: boolean | null;
          notes_internal: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          shopify_order_id: number;
          shopify_order_number: string;
          customer_id?: string | null;
          customer_email: string;
          customer_name?: string;
          shipping_address?: Json | null;
          billing_country?: string | null;
          currency?: string;
          subtotal?: number;
          total?: number;
          tax?: number;
          shipping_cost?: number;
          discount_code_used?: string | null;
          financial_status?: Database['public']['Enums']['order_financial_status'];
          fulfillment_status?: Database['public']['Enums']['order_fulfillment_status'];
          has_rx_items?: boolean;
          rx_status?: Database['public']['Enums']['rx_status'];
          drop_id?: string | null;
          utm_source?: string | null;
          utm_medium?: string | null;
          utm_campaign?: string | null;
          first_order_ever?: boolean | null;
          notes_internal?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          shopify_order_id?: number;
          shopify_order_number?: string;
          customer_id?: string | null;
          customer_email?: string;
          customer_name?: string;
          shipping_address?: Json | null;
          billing_country?: string | null;
          currency?: string;
          subtotal?: number;
          total?: number;
          tax?: number;
          shipping_cost?: number;
          discount_code_used?: string | null;
          financial_status?: Database['public']['Enums']['order_financial_status'];
          fulfillment_status?: Database['public']['Enums']['order_fulfillment_status'];
          has_rx_items?: boolean;
          rx_status?: Database['public']['Enums']['rx_status'];
          drop_id?: string | null;
          utm_source?: string | null;
          utm_medium?: string | null;
          utm_campaign?: string | null;
          first_order_ever?: boolean | null;
          notes_internal?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          { foreignKeyName: 'orders_customer_id_fkey'; columns: ['customer_id']; referencedRelation: 'customers'; referencedColumns: ['id'] },
          { foreignKeyName: 'fk_orders_drop'; columns: ['drop_id']; referencedRelation: 'drops'; referencedColumns: ['id'] },
        ];
      };
      order_line_items: {
        Row: {
          id: string;
          order_id: string;
          shopify_line_item_id: number;
          product_id: number | null;
          variant_id: number | null;
          product_handle: string | null;
          product_title: string;
          variant_title: string | null;
          sku: string | null;
          quantity: number;
          unit_price: number;
          line_total: number;
          is_rx_required: boolean;
          frame_shape: string | null;
          frame_color: string | null;
          frame_size: string | null;
        };
        Insert: {
          id?: string;
          order_id: string;
          shopify_line_item_id: number;
          product_id?: number | null;
          variant_id?: number | null;
          product_handle?: string | null;
          product_title: string;
          variant_title?: string | null;
          sku?: string | null;
          quantity?: number;
          unit_price: number;
          line_total: number;
          is_rx_required?: boolean;
          frame_shape?: string | null;
          frame_color?: string | null;
          frame_size?: string | null;
        };
        Update: {
          id?: string;
          order_id?: string;
          shopify_line_item_id?: number;
          product_id?: number | null;
          variant_id?: number | null;
          product_handle?: string | null;
          product_title?: string;
          variant_title?: string | null;
          sku?: string | null;
          quantity?: number;
          unit_price?: number;
          line_total?: number;
          is_rx_required?: boolean;
          frame_shape?: string | null;
          frame_color?: string | null;
          frame_size?: string | null;
        };
        Relationships: [
          { foreignKeyName: 'order_line_items_order_id_fkey'; columns: ['order_id']; referencedRelation: 'orders'; referencedColumns: ['id'] },
        ];
      };
      rx_files: {
        Row: {
          id: string;
          order_id: string;
          line_item_id: string | null;
          customer_email: string;
          storage_path: string;
          original_filename: string;
          file_size: number;
          mime_type: string;
          typed_od_sphere: string | null;
          typed_od_cylinder: string | null;
          typed_od_axis: string | null;
          typed_od_add: string | null;
          typed_os_sphere: string | null;
          typed_os_cylinder: string | null;
          typed_os_axis: string | null;
          typed_os_add: string | null;
          typed_pd: string | null;
          typed_pd_type: Database['public']['Enums']['pd_type'] | null;
          rx_expiration_date: string | null;
          certification_checked: boolean;
          auto_check_results: Json | null;
          checksum_sha256: string | null;
          scan_quality_score: number | null;
          uploaded_at: string;
          uploaded_by_ip: string | null;
          uploaded_by_user_agent: string | null;
          deleted_at: string | null;
        };
        Insert: {
          id?: string;
          order_id: string;
          line_item_id?: string | null;
          customer_email: string;
          storage_path: string;
          original_filename: string;
          file_size: number;
          mime_type: string;
          typed_od_sphere?: string | null;
          typed_od_cylinder?: string | null;
          typed_od_axis?: string | null;
          typed_od_add?: string | null;
          typed_os_sphere?: string | null;
          typed_os_cylinder?: string | null;
          typed_os_axis?: string | null;
          typed_os_add?: string | null;
          typed_pd?: string | null;
          typed_pd_type?: Database['public']['Enums']['pd_type'] | null;
          rx_expiration_date?: string | null;
          certification_checked?: boolean;
          auto_check_results?: Json | null;
          checksum_sha256?: string | null;
          scan_quality_score?: number | null;
          uploaded_at?: string;
          uploaded_by_ip?: string | null;
          uploaded_by_user_agent?: string | null;
          deleted_at?: string | null;
        };
        Update: {
          id?: string;
          order_id?: string;
          line_item_id?: string | null;
          customer_email?: string;
          storage_path?: string;
          original_filename?: string;
          file_size?: number;
          mime_type?: string;
          typed_od_sphere?: string | null;
          typed_od_cylinder?: string | null;
          typed_od_axis?: string | null;
          typed_od_add?: string | null;
          typed_os_sphere?: string | null;
          typed_os_cylinder?: string | null;
          typed_os_axis?: string | null;
          typed_os_add?: string | null;
          typed_pd?: string | null;
          typed_pd_type?: Database['public']['Enums']['pd_type'] | null;
          rx_expiration_date?: string | null;
          certification_checked?: boolean;
          auto_check_results?: Json | null;
          checksum_sha256?: string | null;
          scan_quality_score?: number | null;
          uploaded_at?: string;
          uploaded_by_ip?: string | null;
          uploaded_by_user_agent?: string | null;
          deleted_at?: string | null;
        };
        Relationships: [
          { foreignKeyName: 'rx_files_order_id_fkey'; columns: ['order_id']; referencedRelation: 'orders'; referencedColumns: ['id'] },
          { foreignKeyName: 'rx_files_line_item_id_fkey'; columns: ['line_item_id']; referencedRelation: 'order_line_items'; referencedColumns: ['id'] },
        ];
      };
      rx_reviews: {
        Row: {
          id: string;
          rx_file_id: string;
          reviewer_user_id: string;
          decision: Database['public']['Enums']['rx_decision'];
          decision_reason: Database['public']['Enums']['rx_rejection_reason'];
          notes: string | null;
          reviewed_at: string;
        };
        Insert: {
          id?: string;
          rx_file_id: string;
          reviewer_user_id: string;
          decision: Database['public']['Enums']['rx_decision'];
          decision_reason: Database['public']['Enums']['rx_rejection_reason'];
          notes?: string | null;
          reviewed_at?: string;
        };
        Update: {
          id?: string;
          rx_file_id?: string;
          reviewer_user_id?: string;
          decision?: Database['public']['Enums']['rx_decision'];
          decision_reason?: Database['public']['Enums']['rx_rejection_reason'];
          notes?: string | null;
          reviewed_at?: string;
        };
        Relationships: [
          { foreignKeyName: 'rx_reviews_rx_file_id_fkey'; columns: ['rx_file_id']; referencedRelation: 'rx_files'; referencedColumns: ['id'] },
          { foreignKeyName: 'rx_reviews_reviewer_user_id_fkey'; columns: ['reviewer_user_id']; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        ];
      };
      work_orders: {
        Row: {
          id: string;
          order_id: string;
          line_item_id: string;
          rx_file_id: string | null;
          work_order_number: string;
          frame_sku: string;
          frame_shape: string | null;
          frame_color: string | null;
          frame_size: string | null;
          frame_eye_size: number | null;
          frame_bridge_size: number | null;
          frame_temple_length: number | null;
          lens_type: Database['public']['Enums']['lens_type'];
          lens_material: Database['public']['Enums']['lens_material'];
          coatings: Json | null;
          tint: string | null;
          monocular_pd_od: number | null;
          monocular_pd_os: number | null;
          fitting_height: number | null;
          decentration_h: number | null;
          decentration_v: number | null;
          base_curve: number | null;
          ed_effective_diameter: number | null;
          axis_double_entered: boolean | null;
          special_instructions: string | null;
          pdf_storage_path: string | null;
          version: number;
          parent_work_order_id: string | null;
          created_at: string;
          released_to_lab_at: string | null;
        };
        Insert: {
          id?: string;
          order_id: string;
          line_item_id: string;
          rx_file_id?: string | null;
          work_order_number: string;
          frame_sku: string;
          frame_shape?: string | null;
          frame_color?: string | null;
          frame_size?: string | null;
          frame_eye_size?: number | null;
          frame_bridge_size?: number | null;
          frame_temple_length?: number | null;
          lens_type: Database['public']['Enums']['lens_type'];
          lens_material?: Database['public']['Enums']['lens_material'];
          coatings?: Json | null;
          tint?: string | null;
          monocular_pd_od?: number | null;
          monocular_pd_os?: number | null;
          fitting_height?: number | null;
          decentration_h?: number | null;
          decentration_v?: number | null;
          base_curve?: number | null;
          ed_effective_diameter?: number | null;
          axis_double_entered?: boolean | null;
          special_instructions?: string | null;
          pdf_storage_path?: string | null;
          version?: number;
          parent_work_order_id?: string | null;
          created_at?: string;
          released_to_lab_at?: string | null;
        };
        Update: {
          id?: string;
          order_id?: string;
          line_item_id?: string;
          rx_file_id?: string | null;
          work_order_number?: string;
          frame_sku?: string;
          frame_shape?: string | null;
          frame_color?: string | null;
          frame_size?: string | null;
          frame_eye_size?: number | null;
          frame_bridge_size?: number | null;
          frame_temple_length?: number | null;
          lens_type?: Database['public']['Enums']['lens_type'];
          lens_material?: Database['public']['Enums']['lens_material'];
          coatings?: Json | null;
          tint?: string | null;
          monocular_pd_od?: number | null;
          monocular_pd_os?: number | null;
          fitting_height?: number | null;
          decentration_h?: number | null;
          decentration_v?: number | null;
          base_curve?: number | null;
          ed_effective_diameter?: number | null;
          axis_double_entered?: boolean | null;
          special_instructions?: string | null;
          pdf_storage_path?: string | null;
          version?: number;
          parent_work_order_id?: string | null;
          created_at?: string;
          released_to_lab_at?: string | null;
        };
        Relationships: [
          { foreignKeyName: 'work_orders_order_id_fkey'; columns: ['order_id']; referencedRelation: 'orders'; referencedColumns: ['id'] },
          { foreignKeyName: 'work_orders_line_item_id_fkey'; columns: ['line_item_id']; referencedRelation: 'order_line_items'; referencedColumns: ['id'] },
          { foreignKeyName: 'work_orders_rx_file_id_fkey'; columns: ['rx_file_id']; referencedRelation: 'rx_files'; referencedColumns: ['id'] },
          { foreignKeyName: 'work_orders_parent_work_order_id_fkey'; columns: ['parent_work_order_id']; referencedRelation: 'work_orders'; referencedColumns: ['id'] },
        ];
      };
      lab_jobs: {
        Row: {
          id: string;
          work_order_id: string;
          column: Database['public']['Enums']['kanban_column'];
          priority: number;
          assigned_to: string | null;
          physical_tray_qr: string | null;
          started_at: string | null;
          completed_at: string | null;
          qc_photos: Json | null;
          lensometer_readings: Json | null;
          shipment_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          work_order_id: string;
          column?: Database['public']['Enums']['kanban_column'];
          priority?: number;
          assigned_to?: string | null;
          physical_tray_qr?: string | null;
          started_at?: string | null;
          completed_at?: string | null;
          qc_photos?: Json | null;
          lensometer_readings?: Json | null;
          shipment_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          work_order_id?: string;
          column?: Database['public']['Enums']['kanban_column'];
          priority?: number;
          assigned_to?: string | null;
          physical_tray_qr?: string | null;
          started_at?: string | null;
          completed_at?: string | null;
          qc_photos?: Json | null;
          lensometer_readings?: Json | null;
          shipment_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          { foreignKeyName: 'lab_jobs_work_order_id_fkey'; columns: ['work_order_id']; referencedRelation: 'work_orders'; referencedColumns: ['id'] },
          { foreignKeyName: 'lab_jobs_assigned_to_fkey'; columns: ['assigned_to']; referencedRelation: 'profiles'; referencedColumns: ['id'] },
          { foreignKeyName: 'fk_lab_jobs_shipment'; columns: ['shipment_id']; referencedRelation: 'shipments'; referencedColumns: ['id'] },
        ];
      };
      inventory_pool: {
        Row: {
          id: string;
          shopify_product_id: number;
          shopify_variant_id: number;
          sku: string;
          frame_shape: string | null;
          color: string | null;
          size: string | null;
          pool_quantity: number;
          threshold_alert: number;
          last_updated_by: string | null;
          last_updated_at: string;
        };
        Insert: {
          id?: string;
          shopify_product_id: number;
          shopify_variant_id: number;
          sku: string;
          frame_shape?: string | null;
          color?: string | null;
          size?: string | null;
          pool_quantity?: number;
          threshold_alert?: number;
          last_updated_by?: string | null;
          last_updated_at?: string;
        };
        Update: {
          id?: string;
          shopify_product_id?: number;
          shopify_variant_id?: number;
          sku?: string;
          frame_shape?: string | null;
          color?: string | null;
          size?: string | null;
          pool_quantity?: number;
          threshold_alert?: number;
          last_updated_by?: string | null;
          last_updated_at?: string;
        };
        Relationships: [
          { foreignKeyName: 'inventory_pool_last_updated_by_fkey'; columns: ['last_updated_by']; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        ];
      };
      inventory_adjustments: {
        Row: {
          id: string;
          inventory_pool_id: string;
          delta: number;
          reason: Database['public']['Enums']['adjustment_reason'];
          reference_order_id: string | null;
          user_id: string;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          inventory_pool_id: string;
          delta: number;
          reason: Database['public']['Enums']['adjustment_reason'];
          reference_order_id?: string | null;
          user_id: string;
          notes?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          inventory_pool_id?: string;
          delta?: number;
          reason?: Database['public']['Enums']['adjustment_reason'];
          reference_order_id?: string | null;
          user_id?: string;
          notes?: string | null;
          created_at?: string;
        };
        Relationships: [
          { foreignKeyName: 'inventory_adjustments_inventory_pool_id_fkey'; columns: ['inventory_pool_id']; referencedRelation: 'inventory_pool'; referencedColumns: ['id'] },
          { foreignKeyName: 'inventory_adjustments_reference_order_id_fkey'; columns: ['reference_order_id']; referencedRelation: 'orders'; referencedColumns: ['id'] },
          { foreignKeyName: 'inventory_adjustments_user_id_fkey'; columns: ['user_id']; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        ];
      };
      returns: {
        Row: {
          id: string;
          order_id: string;
          line_item_id: string | null;
          customer_email: string;
          rma_number: string;
          request_type: Database['public']['Enums']['return_request_type'];
          reason: Database['public']['Enums']['return_reason'];
          reason_detail: string | null;
          photo_urls: Json | null;
          preferred_resolution: Database['public']['Enums']['return_resolution'] | null;
          admin_decision: Database['public']['Enums']['return_admin_decision'];
          admin_notes: string | null;
          shopify_refund_id: number | null;
          store_credit_amount: number | null;
          replacement_work_order_id: string | null;
          return_shipment_id: string | null;
          status: Database['public']['Enums']['return_status'];
          created_at: string;
          resolved_at: string | null;
        };
        Insert: {
          id?: string;
          order_id: string;
          line_item_id?: string | null;
          customer_email: string;
          rma_number: string;
          request_type: Database['public']['Enums']['return_request_type'];
          reason: Database['public']['Enums']['return_reason'];
          reason_detail?: string | null;
          photo_urls?: Json | null;
          preferred_resolution?: Database['public']['Enums']['return_resolution'] | null;
          admin_decision?: Database['public']['Enums']['return_admin_decision'];
          admin_notes?: string | null;
          shopify_refund_id?: number | null;
          store_credit_amount?: number | null;
          replacement_work_order_id?: string | null;
          return_shipment_id?: string | null;
          status?: Database['public']['Enums']['return_status'];
          created_at?: string;
          resolved_at?: string | null;
        };
        Update: {
          id?: string;
          order_id?: string;
          line_item_id?: string | null;
          customer_email?: string;
          rma_number?: string;
          request_type?: Database['public']['Enums']['return_request_type'];
          reason?: Database['public']['Enums']['return_reason'];
          reason_detail?: string | null;
          photo_urls?: Json | null;
          preferred_resolution?: Database['public']['Enums']['return_resolution'] | null;
          admin_decision?: Database['public']['Enums']['return_admin_decision'];
          admin_notes?: string | null;
          shopify_refund_id?: number | null;
          store_credit_amount?: number | null;
          replacement_work_order_id?: string | null;
          return_shipment_id?: string | null;
          status?: Database['public']['Enums']['return_status'];
          created_at?: string;
          resolved_at?: string | null;
        };
        Relationships: [
          { foreignKeyName: 'returns_order_id_fkey'; columns: ['order_id']; referencedRelation: 'orders'; referencedColumns: ['id'] },
          { foreignKeyName: 'returns_line_item_id_fkey'; columns: ['line_item_id']; referencedRelation: 'order_line_items'; referencedColumns: ['id'] },
          { foreignKeyName: 'returns_replacement_work_order_id_fkey'; columns: ['replacement_work_order_id']; referencedRelation: 'work_orders'; referencedColumns: ['id'] },
          { foreignKeyName: 'fk_returns_shipment'; columns: ['return_shipment_id']; referencedRelation: 'shipments'; referencedColumns: ['id'] },
        ];
      };
      communications: {
        Row: {
          id: string;
          order_id: string | null;
          customer_email: string;
          channel: Database['public']['Enums']['comm_channel'];
          direction: Database['public']['Enums']['comm_direction'];
          type: Database['public']['Enums']['comm_type'];
          provider: Database['public']['Enums']['comm_provider'];
          provider_message_id: string | null;
          subject: string | null;
          body_hash: string | null;
          status: Database['public']['Enums']['comm_status'];
          sent_at: string | null;
          delivered_at: string | null;
        };
        Insert: {
          id?: string;
          order_id?: string | null;
          customer_email: string;
          channel?: Database['public']['Enums']['comm_channel'];
          direction?: Database['public']['Enums']['comm_direction'];
          type: Database['public']['Enums']['comm_type'];
          provider?: Database['public']['Enums']['comm_provider'];
          provider_message_id?: string | null;
          subject?: string | null;
          body_hash?: string | null;
          status?: Database['public']['Enums']['comm_status'];
          sent_at?: string | null;
          delivered_at?: string | null;
        };
        Update: {
          id?: string;
          order_id?: string | null;
          customer_email?: string;
          channel?: Database['public']['Enums']['comm_channel'];
          direction?: Database['public']['Enums']['comm_direction'];
          type?: Database['public']['Enums']['comm_type'];
          provider?: Database['public']['Enums']['comm_provider'];
          provider_message_id?: string | null;
          subject?: string | null;
          body_hash?: string | null;
          status?: Database['public']['Enums']['comm_status'];
          sent_at?: string | null;
          delivered_at?: string | null;
        };
        Relationships: [
          { foreignKeyName: 'communications_order_id_fkey'; columns: ['order_id']; referencedRelation: 'orders'; referencedColumns: ['id'] },
        ];
      };
      webhook_events: {
        Row: {
          id: string;
          shopify_event_id: string;
          topic: string;
          payload: Json;
          received_at: string;
          processed_at: string | null;
          processing_error: string | null;
        };
        Insert: {
          id?: string;
          shopify_event_id: string;
          topic: string;
          payload: Json;
          received_at?: string;
          processed_at?: string | null;
          processing_error?: string | null;
        };
        Update: {
          id?: string;
          shopify_event_id?: string;
          topic?: string;
          payload?: Json;
          received_at?: string;
          processed_at?: string | null;
          processing_error?: string | null;
        };
        Relationships: [];
      };
      audit_log: {
        Row: {
          id: string;
          user_id: string | null;
          action: string;
          entity_type: string;
          entity_id: string | null;
          before_data: Json | null;
          after_data: Json | null;
          ip_address: string | null;
          user_agent: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          action: string;
          entity_type: string;
          entity_id?: string | null;
          before_data?: Json | null;
          after_data?: Json | null;
          ip_address?: string | null;
          user_agent?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          action?: string;
          entity_type?: string;
          entity_id?: string | null;
          before_data?: Json | null;
          after_data?: Json | null;
          ip_address?: string | null;
          user_agent?: string | null;
          created_at?: string;
        };
        Relationships: [
          { foreignKeyName: 'audit_log_user_id_fkey'; columns: ['user_id']; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        ];
      };
      drops: {
        Row: {
          id: string;
          slug: string;
          name: string;
          number: number;
          hero_headline: string | null;
          hero_copy: string | null;
          hero_image_url: string | null;
          starts_at: string;
          ends_at: string;
          state: Database['public']['Enums']['drop_state'];
          total_capacity: number | null;
          sold_count: number;
          revenue: number;
          marketing_notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          name: string;
          number: number;
          hero_headline?: string | null;
          hero_copy?: string | null;
          hero_image_url?: string | null;
          starts_at: string;
          ends_at: string;
          state?: Database['public']['Enums']['drop_state'];
          total_capacity?: number | null;
          sold_count?: number;
          revenue?: number;
          marketing_notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          slug?: string;
          name?: string;
          number?: number;
          hero_headline?: string | null;
          hero_copy?: string | null;
          hero_image_url?: string | null;
          starts_at?: string;
          ends_at?: string;
          state?: Database['public']['Enums']['drop_state'];
          total_capacity?: number | null;
          sold_count?: number;
          revenue?: number;
          marketing_notes?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      drop_products: {
        Row: {
          id: string;
          drop_id: string;
          shopify_product_id: number;
          display_order: number;
          feature_tier: Database['public']['Enums']['drop_feature_tier'];
        };
        Insert: {
          id?: string;
          drop_id: string;
          shopify_product_id: number;
          display_order?: number;
          feature_tier?: Database['public']['Enums']['drop_feature_tier'];
        };
        Update: {
          id?: string;
          drop_id?: string;
          shopify_product_id?: number;
          display_order?: number;
          feature_tier?: Database['public']['Enums']['drop_feature_tier'];
        };
        Relationships: [
          { foreignKeyName: 'drop_products_drop_id_fkey'; columns: ['drop_id']; referencedRelation: 'drops'; referencedColumns: ['id'] },
        ];
      };
      product_metadata: {
        Row: {
          id: string;
          shopify_product_id: number;
          shopify_variant_id: number;
          sku: string;
          frame_shape: string | null;
          frame_material: string | null;
          frame_eye_size: number | null;
          frame_bridge: number | null;
          frame_temple_length: number | null;
          frame_total_width: number | null;
          frame_weight_g: number | null;
          base_curve: number | null;
          lens_compatibility: Json | null;
          is_rx_capable: boolean;
          is_rx_sunglass_capable: boolean;
          max_prescription_power: number | null;
          last_synced_at: string;
        };
        Insert: {
          id?: string;
          shopify_product_id: number;
          shopify_variant_id: number;
          sku: string;
          frame_shape?: string | null;
          frame_material?: string | null;
          frame_eye_size?: number | null;
          frame_bridge?: number | null;
          frame_temple_length?: number | null;
          frame_total_width?: number | null;
          frame_weight_g?: number | null;
          base_curve?: number | null;
          lens_compatibility?: Json | null;
          is_rx_capable?: boolean;
          is_rx_sunglass_capable?: boolean;
          max_prescription_power?: number | null;
          last_synced_at?: string;
        };
        Update: {
          id?: string;
          shopify_product_id?: number;
          shopify_variant_id?: number;
          sku?: string;
          frame_shape?: string | null;
          frame_material?: string | null;
          frame_eye_size?: number | null;
          frame_bridge?: number | null;
          frame_temple_length?: number | null;
          frame_total_width?: number | null;
          frame_weight_g?: number | null;
          base_curve?: number | null;
          lens_compatibility?: Json | null;
          is_rx_capable?: boolean;
          is_rx_sunglass_capable?: boolean;
          max_prescription_power?: number | null;
          last_synced_at?: string;
        };
        Relationships: [];
      };
      user_invitations: {
        Row: {
          id: string;
          email: string;
          role: Database['public']['Enums']['user_role'];
          token: string;
          invited_by: string;
          invited_at: string;
          expires_at: string;
          accepted_at: string | null;
          accepted_profile_id: string | null;
        };
        Insert: {
          id?: string;
          email: string;
          role: Database['public']['Enums']['user_role'];
          token?: string;
          invited_by: string;
          invited_at?: string;
          expires_at?: string;
          accepted_at?: string | null;
          accepted_profile_id?: string | null;
        };
        Update: {
          id?: string;
          email?: string;
          role?: Database['public']['Enums']['user_role'];
          token?: string;
          invited_by?: string;
          invited_at?: string;
          expires_at?: string;
          accepted_at?: string | null;
          accepted_profile_id?: string | null;
        };
        Relationships: [
          { foreignKeyName: 'user_invitations_invited_by_fkey'; columns: ['invited_by']; referencedRelation: 'profiles'; referencedColumns: ['id'] },
          { foreignKeyName: 'user_invitations_accepted_profile_id_fkey'; columns: ['accepted_profile_id']; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        ];
      };
      shipments: {
        Row: {
          id: string;
          order_id: string;
          direction: Database['public']['Enums']['shipment_direction'];
          carrier: string | null;
          tracking_number: string | null;
          tracking_url: string | null;
          label_storage_path: string | null;
          weight_g: number | null;
          dimensions: Json | null;
          cost_usd: number | null;
          items: Json;
          status: Database['public']['Enums']['shipment_status'];
          shipped_at: string | null;
          delivered_at: string | null;
          commercial_invoice_path: string | null;
          hs_code: string | null;
          declared_value: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          order_id: string;
          direction?: Database['public']['Enums']['shipment_direction'];
          carrier?: string | null;
          tracking_number?: string | null;
          tracking_url?: string | null;
          label_storage_path?: string | null;
          weight_g?: number | null;
          dimensions?: Json | null;
          cost_usd?: number | null;
          items?: Json;
          status?: Database['public']['Enums']['shipment_status'];
          shipped_at?: string | null;
          delivered_at?: string | null;
          commercial_invoice_path?: string | null;
          hs_code?: string | null;
          declared_value?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          order_id?: string;
          direction?: Database['public']['Enums']['shipment_direction'];
          carrier?: string | null;
          tracking_number?: string | null;
          tracking_url?: string | null;
          label_storage_path?: string | null;
          weight_g?: number | null;
          dimensions?: Json | null;
          cost_usd?: number | null;
          items?: Json;
          status?: Database['public']['Enums']['shipment_status'];
          shipped_at?: string | null;
          delivered_at?: string | null;
          commercial_invoice_path?: string | null;
          hs_code?: string | null;
          declared_value?: number | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          { foreignKeyName: 'shipments_order_id_fkey'; columns: ['order_id']; referencedRelation: 'orders'; referencedColumns: ['id'] },
        ];
      };
      waitlist: {
        Row: {
          id: string;
          email: string;
          drop_id: string | null;
          shopify_product_id: number | null;
          notify_when: Database['public']['Enums']['notify_trigger'];
          created_at: string;
          notified_at: string | null;
        };
        Insert: {
          id?: string;
          email: string;
          drop_id?: string | null;
          shopify_product_id?: number | null;
          notify_when?: Database['public']['Enums']['notify_trigger'];
          created_at?: string;
          notified_at?: string | null;
        };
        Update: {
          id?: string;
          email?: string;
          drop_id?: string | null;
          shopify_product_id?: number | null;
          notify_when?: Database['public']['Enums']['notify_trigger'];
          created_at?: string;
          notified_at?: string | null;
        };
        Relationships: [
          { foreignKeyName: 'waitlist_drop_id_fkey'; columns: ['drop_id']; referencedRelation: 'drops'; referencedColumns: ['id'] },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      user_role: {
        Args: Record<string, never>;
        Returns: Database['public']['Enums']['user_role'];
      };
      has_role: {
        Args: { allowed_roles: Database['public']['Enums']['user_role'][] };
        Returns: boolean;
      };
    };
    Enums: {
      user_role: 'founder' | 'reviewer' | 'lab_admin' | 'lab_operator' | 'lab_qc' | 'lab_shipping';
      vip_tier: 'none' | 'returning' | 'vip';
      order_financial_status: 'paid' | 'refunded' | 'partial_refund' | 'pending';
      order_fulfillment_status: 'unfulfilled' | 'in_lab' | 'shipped' | 'delivered';
      rx_status: 'none' | 'awaiting_upload' | 'uploaded_pending_review' | 'approved' | 'rejected';
      pd_type: 'mono' | 'binocular';
      rx_decision: 'approved' | 'rejected' | 'needs_info';
      rx_rejection_reason: 'clean_approved' | 'matches_typed_values' | 'image_too_blurry' | 'mismatch_typed_vs_image' | 'expired_rx' | 'suspicious' | 'wrong_document_type' | 'other';
      lens_type: 'single_vision' | 'progressive' | 'reading' | 'non_prescription';
      lens_material: 'cr39' | 'polycarbonate' | 'high_index_1_67' | 'high_index_1_74';
      kanban_column: 'inbox' | 'ready_to_cut' | 'on_edger' | 'on_bench' | 'qc' | 'ship';
      adjustment_reason: 'initial_stock' | 'restock' | 'order_fulfilled' | 'walk_in_depletion' | 'manual_correction' | 'damaged' | 'return_restock';
      return_request_type: 'return' | 'replacement' | 'remake';
      return_reason: 'damaged' | 'defective' | 'wrong_size' | 'wrong_rx_typed' | 'wrong_rx_our_fault' | 'change_of_mind' | 'other';
      return_resolution: 'refund' | 'replacement' | 'store_credit';
      return_admin_decision: 'pending' | 'approved_refund' | 'approved_replacement' | 'approved_credit' | 'approved_remake' | 'rejected';
      return_status: 'pending' | 'in_progress' | 'completed' | 'rejected';
      drop_state: 'draft' | 'scheduled' | 'live' | 'sold_out' | 'closed';
      drop_feature_tier: 'hero' | 'supporting';
      comm_channel: 'email' | 'sms' | 'push' | 'webhook';
      comm_direction: 'outbound' | 'inbound';
      comm_type: 'rx_reminder' | 'rx_approved' | 'rx_rejected' | 'order_shipped' | 'return_approved' | 'return_shipped' | 'welcome' | 'drop_launch' | 'review_request' | 'rx_escalation' | 'waitlist_notify' | 'other';
      comm_provider: 'resend' | 'shopify' | 'twilio';
      comm_status: 'queued' | 'sent' | 'delivered' | 'bounced' | 'failed';
      shipment_direction: 'outbound' | 'return_inbound' | 'replacement_outbound';
      shipment_status: 'label_created' | 'in_transit' | 'delivered' | 'exception' | 'return_received';
      notify_trigger: 'launch' | 'back_in_stock' | 'next_drop';
    };
    CompositeTypes: Record<string, never>;
  };
};
