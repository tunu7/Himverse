
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "destinations": {
                  Row: {
                    "created_at": string,"description": string,"district": string,"id": string,"is_published": boolean,"name": string,"search_vector": unknown,"slug": string,"summary": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"description"?: string,"district": string,"id"?: string,"is_published"?: boolean,"name": string,"search_vector"?: never,"slug": string,"summary"?: string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"description"?: string,"district"?: string,"id"?: string,"is_published"?: boolean,"name"?: string,"search_vector"?: never,"slug"?: string,"summary"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"experiences": {
                  Row: {
                    "category": Database["public"]['Enums']["experience_category"],"created_at": string,"created_by": string | null,"currency": string,"description": string,"destination_id": string,"duration_minutes": number,"id": string,"moderation_locked": boolean,"price_from_minor": number | null,"provider_id": string,"published_at": string | null,"search_vector": unknown,"slug": string,"status": Database["public"]['Enums']["experience_status"],"summary": string,"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "category": Database["public"]['Enums']["experience_category"],"created_at"?: string,"created_by"?: string | null,"currency"?: string,"description"?: string,"destination_id": string,"duration_minutes": number,"id"?: string,"moderation_locked"?: boolean,"price_from_minor"?: number | null,"provider_id": string,"published_at"?: string | null,"search_vector"?: never,"slug": string,"status"?: Database["public"]['Enums']["experience_status"],"summary"?: string,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "category"?: Database["public"]['Enums']["experience_category"],"created_at"?: string,"created_by"?: string | null,"currency"?: string,"description"?: string,"destination_id"?: string,"duration_minutes"?: number,"id"?: string,"moderation_locked"?: boolean,"price_from_minor"?: number | null,"provider_id"?: string,"published_at"?: string | null,"search_vector"?: never,"slug"?: string,"status"?: Database["public"]['Enums']["experience_status"],"summary"?: string,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "experiences_destination_id_fkey"
      columns: ["destination_id"]
isOneToOne: false
      referencedRelation: "destinations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "experiences_provider_id_fkey"
      columns: ["provider_id"]
isOneToOne: false
      referencedRelation: "providers"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "created_at": string,"display_name": string,"id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"display_name": string,"id": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"display_name"?: string,"id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"provider_members": {
                  Row: {
                    "created_at": string,"member_role": Database["public"]['Enums']["provider_member_role"],"provider_id": string,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"member_role"?: Database["public"]['Enums']["provider_member_role"],"provider_id": string,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"member_role"?: Database["public"]['Enums']["provider_member_role"],"provider_id"?: string,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "provider_members_provider_id_fkey"
      columns: ["provider_id"]
isOneToOne: false
      referencedRelation: "providers"
      referencedColumns: ["id"]
    }
                  ]
                },"provider_private_details": {
                  Row: {
                    "contact_email": string,"contact_phone": string | null,"legal_name": string,"provider_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "contact_email": string,"contact_phone"?: string | null,"legal_name": string,"provider_id": string,"updated_at"?: string
                  }
                  Update: {
                    "contact_email"?: string,"contact_phone"?: string | null,"legal_name"?: string,"provider_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "provider_private_details_provider_id_fkey"
      columns: ["provider_id"]
isOneToOne: true
      referencedRelation: "providers"
      referencedColumns: ["id"]
    }
                  ]
                },"provider_status_events": {
                  Row: {
                    "actor_id": string | null,"created_at": string,"from_status": Database["public"]['Enums']["provider_status"] | null,"id": number,"note": string | null,"provider_id": string,"to_status": Database["public"]['Enums']["provider_status"]
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_id"?: string | null,"created_at"?: string,"from_status"?: Database["public"]['Enums']["provider_status"] | null,"id"?: never,"note"?: string | null,"provider_id": string,"to_status": Database["public"]['Enums']["provider_status"]
                  }
                  Update: {
                    "actor_id"?: string | null,"created_at"?: string,"from_status"?: Database["public"]['Enums']["provider_status"] | null,"id"?: never,"note"?: string | null,"provider_id"?: string,"to_status"?: Database["public"]['Enums']["provider_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "provider_status_events_provider_id_fkey"
      columns: ["provider_id"]
isOneToOne: false
      referencedRelation: "providers"
      referencedColumns: ["id"]
    }
                  ]
                },"providers": {
                  Row: {
                    "created_at": string,"created_by": string | null,"description": string,"display_name": string,"district": string | null,"id": string,"slug": string,"status": Database["public"]['Enums']["provider_status"],"updated_at": string,"verified_at": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"created_by"?: string | null,"description"?: string,"display_name": string,"district"?: string | null,"id"?: string,"slug": string,"status"?: Database["public"]['Enums']["provider_status"],"updated_at"?: string,"verified_at"?: string | null
                  }
                  Update: {
                    "created_at"?: string,"created_by"?: string | null,"description"?: string,"display_name"?: string,"district"?: string | null,"id"?: string,"slug"?: string,"status"?: Database["public"]['Enums']["provider_status"],"updated_at"?: string,"verified_at"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"user_roles": {
                  Row: {
                    "granted_at": string,"granted_by": string | null,"role": Database["public"]['Enums']["app_role"],"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "granted_at"?: string,"granted_by"?: string | null,"role": Database["public"]['Enums']["app_role"],"user_id": string
                  }
                  Update: {
                    "granted_at"?: string,"granted_by"?: string | null,"role"?: Database["public"]['Enums']["app_role"],"user_id"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "create_provider_application":
{ Args: { "p_contact_email": string,"p_contact_phone": string,"p_description": string,"p_display_name": string,"p_district": string,"p_legal_name": string,"p_slug": string }; Returns: string
                           },
"review_provider":
{ Args: { "p_decision": Database["public"]['Enums']["provider_status"],"p_note"?: string,"p_provider_id": string }; Returns: Database["public"]['Enums']["provider_status"]
                           },
"submit_provider_application":
{ Args: { "p_provider_id": string }; Returns: Database["public"]['Enums']["provider_status"]
                           }
          }
          Enums: {
            "app_role": "admin","experience_category": "culture"|"nature"|"adventure"|"trekking"|"wildlife"|"food_and_drink"|"festivals"|"wellness"|"other","experience_status": "draft"|"published"|"archived","provider_member_role": "owner","provider_status": "draft"|"pending_review"|"verified"|"rejected"|"suspended"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            "app_role": ["admin"],"experience_category": ["culture", "nature", "adventure", "trekking", "wildlife", "food_and_drink", "festivals", "wellness", "other"],"experience_status": ["draft", "published", "archived"],"provider_member_role": ["owner"],"provider_status": ["draft", "pending_review", "verified", "rejected", "suspended"]
          }
        }
} as const
