
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
            "availability_slots": {
                  Row: {
                    "capacity": number,"created_at": string,"experience_id": string,"id": string,"seats_confirmed": number,"start_time": string | null,"starts_on": string,"status": Database["public"]['Enums']["availability_slot_status"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "capacity": number,"created_at"?: string,"experience_id": string,"id"?: string,"seats_confirmed"?: number,"start_time"?: string | null,"starts_on": string,"status"?: Database["public"]['Enums']["availability_slot_status"],"updated_at"?: string
                  }
                  Update: {
                    "capacity"?: number,"created_at"?: string,"experience_id"?: string,"id"?: string,"seats_confirmed"?: number,"start_time"?: string | null,"starts_on"?: string,"status"?: Database["public"]['Enums']["availability_slot_status"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "availability_slots_experience_id_fkey"
      columns: ["experience_id"]
isOneToOne: false
      referencedRelation: "experiences"
      referencedColumns: ["id"]
    }
                  ]
                },"booking_events": {
                  Row: {
                    "actor_id": string | null,"actor_role": Database["public"]['Enums']["booking_actor"],"booking_id": string,"created_at": string,"from_status": Database["public"]['Enums']["booking_status"] | null,"id": number,"note": string | null,"to_status": Database["public"]['Enums']["booking_status"]
                  }
                  ComputedFields: never
                  Insert: {
                    "actor_id"?: string | null,"actor_role": Database["public"]['Enums']["booking_actor"],"booking_id": string,"created_at"?: string,"from_status"?: Database["public"]['Enums']["booking_status"] | null,"id"?: never,"note"?: string | null,"to_status": Database["public"]['Enums']["booking_status"]
                  }
                  Update: {
                    "actor_id"?: string | null,"actor_role"?: Database["public"]['Enums']["booking_actor"],"booking_id"?: string,"created_at"?: string,"from_status"?: Database["public"]['Enums']["booking_status"] | null,"id"?: never,"note"?: string | null,"to_status"?: Database["public"]['Enums']["booking_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "booking_events_booking_id_fkey"
      columns: ["booking_id"]
isOneToOne: false
      referencedRelation: "bookings"
      referencedColumns: ["id"]
    }
                  ]
                },"bookings": {
                  Row: {
                    "adults": number,"cancellation_reason": string | null,"cancelled_by": Database["public"]['Enums']["booking_actor"] | null,"children": number,"confirmed_total_minor": number | null,"contact_phone": string,"created_at": string,"currency": string,"estimated_total_minor": number | null,"experience_id": string,"experience_title": string,"id": string,"idempotency_key": string,"party_size": number | null,"provider_id": string,"provider_note": string | null,"reference": string,"request_expires_at": string,"slot_id": string,"slot_start_time": string | null,"slot_starts_on": string,"status": Database["public"]['Enums']["booking_status"],"traveler_id": string,"traveler_name": string,"traveler_note": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "adults": number,"cancellation_reason"?: string | null,"cancelled_by"?: Database["public"]['Enums']["booking_actor"] | null,"children"?: number,"confirmed_total_minor"?: number | null,"contact_phone": string,"created_at"?: string,"currency"?: string,"estimated_total_minor"?: number | null,"experience_id": string,"experience_title": string,"id"?: string,"idempotency_key": string,"party_size"?: never,"provider_id": string,"provider_note"?: string | null,"reference": string,"request_expires_at": string,"slot_id": string,"slot_start_time"?: string | null,"slot_starts_on": string,"status"?: Database["public"]['Enums']["booking_status"],"traveler_id": string,"traveler_name": string,"traveler_note"?: string,"updated_at"?: string
                  }
                  Update: {
                    "adults"?: number,"cancellation_reason"?: string | null,"cancelled_by"?: Database["public"]['Enums']["booking_actor"] | null,"children"?: number,"confirmed_total_minor"?: number | null,"contact_phone"?: string,"created_at"?: string,"currency"?: string,"estimated_total_minor"?: number | null,"experience_id"?: string,"experience_title"?: string,"id"?: string,"idempotency_key"?: string,"party_size"?: never,"provider_id"?: string,"provider_note"?: string | null,"reference"?: string,"request_expires_at"?: string,"slot_id"?: string,"slot_start_time"?: string | null,"slot_starts_on"?: string,"status"?: Database["public"]['Enums']["booking_status"],"traveler_id"?: string,"traveler_name"?: string,"traveler_note"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "bookings_experience_id_fkey"
      columns: ["experience_id"]
isOneToOne: false
      referencedRelation: "experiences"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bookings_provider_id_fkey"
      columns: ["provider_id"]
isOneToOne: false
      referencedRelation: "providers"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "bookings_slot_id_fkey"
      columns: ["slot_id"]
isOneToOne: false
      referencedRelation: "availability_slots"
      referencedColumns: ["id"]
    }
                  ]
                },"destinations": {
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
                },"itineraries": {
                  Row: {
                    "created_at": string,"current_version_id": string | null,"id": string,"owner_id": string,"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"current_version_id"?: string | null,"id"?: string,"owner_id": string,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"current_version_id"?: string | null,"id"?: string,"owner_id"?: string,"title"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "itineraries_current_version_fk"
      columns: ["current_version_id","id"]
isOneToOne: false
      referencedRelation: "itinerary_versions"
      referencedColumns: ["id","itinerary_id"]
    }
                  ]
                },"itinerary_generations": {
                  Row: {
                    "created_at": string,"error_code": string | null,"id": number,"input_tokens": number | null,"itinerary_id": string | null,"latency_ms": number | null,"model": string | null,"outcome": Database["public"]['Enums']["itinerary_generation_outcome"],"output_tokens": number | null,"prompt_version": string | null,"user_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"error_code"?: string | null,"id"?: never,"input_tokens"?: number | null,"itinerary_id"?: string | null,"latency_ms"?: number | null,"model"?: string | null,"outcome": Database["public"]['Enums']["itinerary_generation_outcome"],"output_tokens"?: number | null,"prompt_version"?: string | null,"user_id": string
                  }
                  Update: {
                    "created_at"?: string,"error_code"?: string | null,"id"?: never,"input_tokens"?: number | null,"itinerary_id"?: string | null,"latency_ms"?: number | null,"model"?: string | null,"outcome"?: Database["public"]['Enums']["itinerary_generation_outcome"],"output_tokens"?: number | null,"prompt_version"?: string | null,"user_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "itinerary_generations_itinerary_id_fkey"
      columns: ["itinerary_id"]
isOneToOne: false
      referencedRelation: "itineraries"
      referencedColumns: ["id"]
    }
                  ]
                },"itinerary_items": {
                  Row: {
                    "day_number": number,"destination_id": string | null,"destination_name_snapshot": string,"duration_snapshot_minutes": number,"experience_id": string | null,"experience_title_snapshot": string,"id": string,"position": number,"price_snapshot_minor": number | null,"rationale": string,"time_of_day": Database["public"]['Enums']["itinerary_time_of_day"],"version_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "day_number": number,"destination_id"?: string | null,"destination_name_snapshot": string,"duration_snapshot_minutes": number,"experience_id"?: string | null,"experience_title_snapshot": string,"id"?: string,"position": number,"price_snapshot_minor"?: number | null,"rationale"?: string,"time_of_day": Database["public"]['Enums']["itinerary_time_of_day"],"version_id": string
                  }
                  Update: {
                    "day_number"?: number,"destination_id"?: string | null,"destination_name_snapshot"?: string,"duration_snapshot_minutes"?: number,"experience_id"?: string | null,"experience_title_snapshot"?: string,"id"?: string,"position"?: number,"price_snapshot_minor"?: number | null,"rationale"?: string,"time_of_day"?: Database["public"]['Enums']["itinerary_time_of_day"],"version_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "itinerary_items_destination_id_fkey"
      columns: ["destination_id"]
isOneToOne: false
      referencedRelation: "destinations"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "itinerary_items_experience_id_fkey"
      columns: ["experience_id"]
isOneToOne: false
      referencedRelation: "experiences"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "itinerary_items_version_id_fkey"
      columns: ["version_id"]
isOneToOne: false
      referencedRelation: "itinerary_versions"
      referencedColumns: ["id"]
    }
                  ]
                },"itinerary_versions": {
                  Row: {
                    "created_at": string,"currency": string,"estimated_total_minor": number,"id": string,"itinerary_id": string,"kind": Database["public"]['Enums']["itinerary_version_kind"],"model": string,"plan": NonNullable<Json>,"preferences": NonNullable<Json>,"prompt_version": string,"schema_version": string,"travelers": number,"unpriced_item_count": number,"version_number": number,"warnings": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"currency"?: string,"estimated_total_minor": number,"id"?: string,"itinerary_id": string,"kind": Database["public"]['Enums']["itinerary_version_kind"],"model": string,"plan": NonNullable<Json>,"preferences": NonNullable<Json>,"prompt_version": string,"schema_version": string,"travelers": number,"unpriced_item_count": number,"version_number": number,"warnings"?: NonNullable<Json>
                  }
                  Update: {
                    "created_at"?: string,"currency"?: string,"estimated_total_minor"?: number,"id"?: string,"itinerary_id"?: string,"kind"?: Database["public"]['Enums']["itinerary_version_kind"],"model"?: string,"plan"?: NonNullable<Json>,"preferences"?: NonNullable<Json>,"prompt_version"?: string,"schema_version"?: string,"travelers"?: number,"unpriced_item_count"?: number,"version_number"?: number,"warnings"?: NonNullable<Json>
                  }
                  Relationships: [
                    {
      foreignKeyName: "itinerary_versions_itinerary_id_fkey"
      columns: ["itinerary_id"]
isOneToOne: false
      referencedRelation: "itineraries"
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
            "cancel_booking":
{ Args: { "p_booking_id": string,"p_reason": string }; Returns: Database["public"]['Enums']["booking_status"]
                           },
"create_provider_application":
{ Args: { "p_contact_email": string,"p_contact_phone": string,"p_description": string,"p_display_name": string,"p_district": string,"p_legal_name": string,"p_slug": string }; Returns: string
                           },
"record_itinerary_generation":
{ Args: { "p_error_code": string,"p_input_tokens": number,"p_itinerary_id": string,"p_latency_ms": number,"p_model": string,"p_outcome": Database["public"]['Enums']["itinerary_generation_outcome"],"p_output_tokens": number,"p_prompt_version": string }; Returns: undefined
                           },
"request_booking":
{ Args: { "p_adults": number,"p_children": number,"p_contact_phone": string,"p_idempotency_key": string,"p_note": string,"p_slot_id": string }; Returns: {
              "booking_id": string,"booking_reference": string,"booking_status": Database["public"]['Enums']["booking_status"],"replayed": boolean
            }[]
                           },
"respond_to_booking":
{ Args: { "p_booking_id": string,"p_decision": Database["public"]['Enums']["booking_status"],"p_final_total_minor": number,"p_note": string }; Returns: Database["public"]['Enums']["booking_status"]
                           },
"review_provider":
{ Args: { "p_decision": Database["public"]['Enums']["provider_status"],"p_note"?: string,"p_provider_id": string }; Returns: Database["public"]['Enums']["provider_status"]
                           },
"save_itinerary_version":
{ Args: { "p_items": Json,"p_itinerary_id": string,"p_kind": Database["public"]['Enums']["itinerary_version_kind"],"p_model": string,"p_plan": Json,"p_preferences": Json,"p_prompt_version": string,"p_schema_version": string,"p_title": string,"p_travelers": number,"p_warnings": Json }; Returns: {
              "estimated_total_minor": number,"itinerary_id": string,"unpriced_item_count": number,"version_id": string,"version_number": number
            }[]
                           },
"submit_provider_application":
{ Args: { "p_provider_id": string }; Returns: Database["public"]['Enums']["provider_status"]
                           }
          }
          Enums: {
            "app_role": "admin","availability_slot_status": "open"|"closed","booking_actor": "traveler"|"provider"|"system","booking_status": "requested"|"confirmed"|"declined"|"cancelled"|"expired"|"completed","experience_category": "culture"|"nature"|"adventure"|"trekking"|"wildlife"|"food_and_drink"|"festivals"|"wellness"|"other","experience_status": "draft"|"published"|"archived","itinerary_generation_outcome": "succeeded"|"failed_validation"|"failed_upstream"|"failed_timeout"|"failed_save","itinerary_time_of_day": "morning"|"afternoon"|"evening"|"full_day","itinerary_version_kind": "generate"|"refine"|"regenerate","provider_member_role": "owner","provider_status": "draft"|"pending_review"|"verified"|"rejected"|"suspended"
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
            "app_role": ["admin"],"availability_slot_status": ["open", "closed"],"booking_actor": ["traveler", "provider", "system"],"booking_status": ["requested", "confirmed", "declined", "cancelled", "expired", "completed"],"experience_category": ["culture", "nature", "adventure", "trekking", "wildlife", "food_and_drink", "festivals", "wellness", "other"],"experience_status": ["draft", "published", "archived"],"itinerary_generation_outcome": ["succeeded", "failed_validation", "failed_upstream", "failed_timeout", "failed_save"],"itinerary_time_of_day": ["morning", "afternoon", "evening", "full_day"],"itinerary_version_kind": ["generate", "refine", "regenerate"],"provider_member_role": ["owner"],"provider_status": ["draft", "pending_review", "verified", "rejected", "suspended"]
          }
        }
} as const
