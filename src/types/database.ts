
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
                    "adults": number,"cancellation_reason": string | null,"cancelled_by": Database["public"]['Enums']["booking_actor"] | null,"children": number,"confirmed_total_minor": number | null,"contact_phone": string,"created_at": string,"currency": string,"deposit_minor": number | null,"deposit_paid_at": string | null,"ends_on": string | null,"estimated_total_minor": number | null,"experience_id": string,"experience_title": string,"id": string,"idempotency_key": string,"party_size": number | null,"payment_due_at": string | null,"pickup_note": string,"provider_id": string,"provider_note": string | null,"reference": string,"request_expires_at": string,"slot_id": string | null,"slot_start_time": string | null,"slot_starts_on": string,"status": Database["public"]['Enums']["booking_status"],"traveler_id": string | null,"traveler_name": string,"traveler_note": string,"units": number,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "adults": number,"cancellation_reason"?: string | null,"cancelled_by"?: Database["public"]['Enums']["booking_actor"] | null,"children"?: number,"confirmed_total_minor"?: number | null,"contact_phone": string,"created_at"?: string,"currency"?: string,"deposit_minor"?: number | null,"deposit_paid_at"?: string | null,"ends_on"?: string | null,"estimated_total_minor"?: number | null,"experience_id": string,"experience_title": string,"id"?: string,"idempotency_key": string,"party_size"?: never,"payment_due_at"?: string | null,"pickup_note"?: string,"provider_id": string,"provider_note"?: string | null,"reference": string,"request_expires_at": string,"slot_id"?: string | null,"slot_start_time"?: string | null,"slot_starts_on": string,"status"?: Database["public"]['Enums']["booking_status"],"traveler_id"?: string | null,"traveler_name": string,"traveler_note"?: string,"units"?: number,"updated_at"?: string
                  }
                  Update: {
                    "adults"?: number,"cancellation_reason"?: string | null,"cancelled_by"?: Database["public"]['Enums']["booking_actor"] | null,"children"?: number,"confirmed_total_minor"?: number | null,"contact_phone"?: string,"created_at"?: string,"currency"?: string,"deposit_minor"?: number | null,"deposit_paid_at"?: string | null,"ends_on"?: string | null,"estimated_total_minor"?: number | null,"experience_id"?: string,"experience_title"?: string,"id"?: string,"idempotency_key"?: string,"party_size"?: never,"payment_due_at"?: string | null,"pickup_note"?: string,"provider_id"?: string,"provider_note"?: string | null,"reference"?: string,"request_expires_at"?: string,"slot_id"?: string | null,"slot_start_time"?: string | null,"slot_starts_on"?: string,"status"?: Database["public"]['Enums']["booking_status"],"traveler_id"?: string | null,"traveler_name"?: string,"traveler_note"?: string,"units"?: number,"updated_at"?: string
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
                    "accepts_bookings": boolean,"category": Database["public"]['Enums']["experience_category"],"created_at": string,"created_by": string | null,"currency": string,"daily_capacity": number | null,"description": string,"destination_id": string,"duration_minutes": number,"id": string,"languages": (string)[],"listing_type": Database["public"]['Enums']["listing_type"],"max_guests": number | null,"moderation_locked": boolean,"price_from_minor": number | null,"price_unit": Database["public"]['Enums']["price_unit"],"provider_id": string,"published_at": string | null,"route_to_destination_id": string | null,"search_vector": unknown,"slug": string,"status": Database["public"]['Enums']["experience_status"],"summary": string,"title": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "accepts_bookings"?: boolean,"category": Database["public"]['Enums']["experience_category"],"created_at"?: string,"created_by"?: string | null,"currency"?: string,"daily_capacity"?: number | null,"description"?: string,"destination_id": string,"duration_minutes": number,"id"?: string,"languages"?: (string)[],"listing_type"?: Database["public"]['Enums']["listing_type"],"max_guests"?: number | null,"moderation_locked"?: boolean,"price_from_minor"?: number | null,"price_unit"?: Database["public"]['Enums']["price_unit"],"provider_id": string,"published_at"?: string | null,"route_to_destination_id"?: string | null,"search_vector"?: never,"slug": string,"status"?: Database["public"]['Enums']["experience_status"],"summary"?: string,"title": string,"updated_at"?: string
                  }
                  Update: {
                    "accepts_bookings"?: boolean,"category"?: Database["public"]['Enums']["experience_category"],"created_at"?: string,"created_by"?: string | null,"currency"?: string,"daily_capacity"?: number | null,"description"?: string,"destination_id"?: string,"duration_minutes"?: number,"id"?: string,"languages"?: (string)[],"listing_type"?: Database["public"]['Enums']["listing_type"],"max_guests"?: number | null,"moderation_locked"?: boolean,"price_from_minor"?: number | null,"price_unit"?: Database["public"]['Enums']["price_unit"],"provider_id"?: string,"published_at"?: string | null,"route_to_destination_id"?: string | null,"search_vector"?: never,"slug"?: string,"status"?: Database["public"]['Enums']["experience_status"],"summary"?: string,"title"?: string,"updated_at"?: string
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
    },{
      foreignKeyName: "experiences_route_to_destination_id_fkey"
      columns: ["route_to_destination_id"]
isOneToOne: false
      referencedRelation: "destinations"
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
                    "day_number": number,"destination_id": string | null,"destination_name_snapshot": string,"duration_snapshot_minutes": number,"experience_id": string | null,"experience_title_snapshot": string,"id": string,"item_kind": Database["public"]['Enums']["itinerary_item_kind"],"position": number,"price_snapshot_minor": number | null,"rationale": string,"time_of_day": Database["public"]['Enums']["itinerary_time_of_day"],"units": number,"version_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "day_number": number,"destination_id"?: string | null,"destination_name_snapshot": string,"duration_snapshot_minutes": number,"experience_id"?: string | null,"experience_title_snapshot": string,"id"?: string,"item_kind"?: Database["public"]['Enums']["itinerary_item_kind"],"position": number,"price_snapshot_minor"?: number | null,"rationale"?: string,"time_of_day": Database["public"]['Enums']["itinerary_time_of_day"],"units"?: number,"version_id": string
                  }
                  Update: {
                    "day_number"?: number,"destination_id"?: string | null,"destination_name_snapshot"?: string,"duration_snapshot_minutes"?: number,"experience_id"?: string | null,"experience_title_snapshot"?: string,"id"?: string,"item_kind"?: Database["public"]['Enums']["itinerary_item_kind"],"position"?: number,"price_snapshot_minor"?: number | null,"rationale"?: string,"time_of_day"?: Database["public"]['Enums']["itinerary_time_of_day"],"units"?: number,"version_id"?: string
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
                },"partner_payouts": {
                  Row: {
                    "amount_minor": number,"created_at": string,"created_by": string | null,"id": string,"note": string,"provider_id": string,"reference": string
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_minor": number,"created_at"?: string,"created_by"?: string | null,"id"?: string,"note"?: string,"provider_id": string,"reference": string
                  }
                  Update: {
                    "amount_minor"?: number,"created_at"?: string,"created_by"?: string | null,"id"?: string,"note"?: string,"provider_id"?: string,"reference"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "partner_payouts_provider_id_fkey"
      columns: ["provider_id"]
isOneToOne: false
      referencedRelation: "providers"
      referencedColumns: ["id"]
    }
                  ]
                },"payment_events": {
                  Row: {
                    "event_id": string,"event_type": string,"id": number,"received_at": string,"result": string | null,"summary": NonNullable<Json>
                  }
                  ComputedFields: never
                  Insert: {
                    "event_id": string,"event_type": string,"id"?: never,"received_at"?: string,"result"?: string | null,"summary"?: NonNullable<Json>
                  }
                  Update: {
                    "event_id"?: string,"event_type"?: string,"id"?: never,"received_at"?: string,"result"?: string | null,"summary"?: NonNullable<Json>
                  }
                  Relationships: [
                    
                  ]
                },"payments": {
                  Row: {
                    "amount_minor": number,"booking_id": string,"captured_at": string | null,"created_at": string,"currency": string,"id": string,"provider_id": string,"razorpay_order_id": string,"razorpay_payment_id": string | null,"refunded_minor": number,"status": Database["public"]['Enums']["payment_status"]
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_minor": number,"booking_id": string,"captured_at"?: string | null,"created_at"?: string,"currency"?: string,"id"?: string,"provider_id": string,"razorpay_order_id": string,"razorpay_payment_id"?: string | null,"refunded_minor"?: number,"status"?: Database["public"]['Enums']["payment_status"]
                  }
                  Update: {
                    "amount_minor"?: number,"booking_id"?: string,"captured_at"?: string | null,"created_at"?: string,"currency"?: string,"id"?: string,"provider_id"?: string,"razorpay_order_id"?: string,"razorpay_payment_id"?: string | null,"refunded_minor"?: number,"status"?: Database["public"]['Enums']["payment_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "payments_booking_id_fkey"
      columns: ["booking_id"]
isOneToOne: false
      referencedRelation: "bookings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "payments_provider_id_fkey"
      columns: ["provider_id"]
isOneToOne: false
      referencedRelation: "providers"
      referencedColumns: ["id"]
    }
                  ]
                },"platform_settings": {
                  Row: {
                    "deposits_required": boolean,"id": boolean,"updated_at": string,"updated_by": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "deposits_required"?: boolean,"id"?: boolean,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Update: {
                    "deposits_required"?: boolean,"id"?: boolean,"updated_at"?: string,"updated_by"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"profiles": {
                  Row: {
                    "account_type": Database["public"]['Enums']["account_type"] | null,"bookings_seen_at": string,"created_at": string,"display_name": string,"id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "account_type"?: Database["public"]['Enums']["account_type"] | null,"bookings_seen_at"?: string,"created_at"?: string,"display_name": string,"id": string,"updated_at"?: string
                  }
                  Update: {
                    "account_type"?: Database["public"]['Enums']["account_type"] | null,"bookings_seen_at"?: string,"created_at"?: string,"display_name"?: string,"id"?: string,"updated_at"?: string
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
                },"refunds": {
                  Row: {
                    "amount_minor": number,"attempts": number,"booking_id": string,"claimed_until": string | null,"created_at": string,"id": string,"last_error": string | null,"payment_id": string,"processed_at": string | null,"razorpay_refund_id": string | null,"reason": string,"status": Database["public"]['Enums']["refund_status"]
                  }
                  ComputedFields: never
                  Insert: {
                    "amount_minor": number,"attempts"?: number,"booking_id": string,"claimed_until"?: string | null,"created_at"?: string,"id"?: string,"last_error"?: string | null,"payment_id": string,"processed_at"?: string | null,"razorpay_refund_id"?: string | null,"reason": string,"status"?: Database["public"]['Enums']["refund_status"]
                  }
                  Update: {
                    "amount_minor"?: number,"attempts"?: number,"booking_id"?: string,"claimed_until"?: string | null,"created_at"?: string,"id"?: string,"last_error"?: string | null,"payment_id"?: string,"processed_at"?: string | null,"razorpay_refund_id"?: string | null,"reason"?: string,"status"?: Database["public"]['Enums']["refund_status"]
                  }
                  Relationships: [
                    {
      foreignKeyName: "refunds_booking_id_fkey"
      columns: ["booking_id"]
isOneToOne: false
      referencedRelation: "bookings"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "refunds_payment_id_fkey"
      columns: ["payment_id"]
isOneToOne: true
      referencedRelation: "payments"
      referencedColumns: ["id"]
    }
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
            "admin_list_users":
{ Args: { "p_account_type"?: Database["public"]['Enums']["account_type"],"p_limit"?: number,"p_offset"?: number,"p_query"?: string }; Returns: {
              "account_type": Database["public"]['Enums']["account_type"],"business_names": string,"created_at": string,"display_name": string,"email": string,"email_confirmed": boolean,"id": string,"last_sign_in_at": string,"total_count": number,"two_step": boolean
            }[]
                           },
"admin_partner_balances":
{ Args: Record<PropertyKey, never>; Returns: {
              "collected_minor": number,"display_name": string,"held_minor": number,"owed_minor": number,"paid_out_minor": number,"pending_refunds_minor": number,"provider_id": string,"refunded_minor": number
            }[]
                           },
"ai_generations_today":
{ Args: Record<PropertyKey, never>; Returns: number
                           },
"attach_deposit_order":
{ Args: { "p_amount_minor": number,"p_booking_id": string,"p_order_id": string,"p_traveler_id": string }; Returns: undefined
                           },
"auth_attempt_allowed":
{ Args: { "p_kind": string }; Returns: boolean
                           },
"begin_itinerary_generation":
{ Args: { "p_global_daily_limit": number,"p_itinerary_id": string }; Returns: number
                           },
"cancel_booking":
{ Args: { "p_booking_id": string,"p_reason": string }; Returns: Database["public"]['Enums']["booking_status"]
                           },
"choose_account_type":
{ Args: { "p_type": Database["public"]['Enums']["account_type"] }; Returns: Database["public"]['Enums']["account_type"]
                           },
"claim_refunds":
{ Args: { "p_booking_id"?: string,"p_limit"?: number }; Returns: {
              "amount_minor": number,"booking_reference": string,"razorpay_payment_id": string,"refund_id": string
            }[]
                           },
"create_provider_application":
{ Args: { "p_contact_email": string,"p_contact_phone": string,"p_description": string,"p_display_name": string,"p_district": string,"p_legal_name": string,"p_slug": string }; Returns: string
                           },
"delete_my_account":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"deposit_checkout":
{ Args: { "p_booking_id": string }; Returns: {
              "amount_minor": number,"attempt": number,"booking_reference": string,"currency": string,"payment_due_at": string,"reusable_order_id": string
            }[]
                           },
"finish_itinerary_generation":
{ Args: { "p_error_code": string,"p_generation_id": number,"p_input_tokens": number,"p_latency_ms": number,"p_model": string,"p_outcome": Database["public"]['Enums']["itinerary_generation_outcome"],"p_output_tokens": number,"p_prompt_version": string }; Returns: undefined
                           },
"finish_payment_event":
{ Args: { "p_event_id": string,"p_result": string }; Returns: undefined
                           },
"log_payment_event":
{ Args: { "p_event_id": string,"p_event_type": string,"p_summary": Json }; Returns: boolean
                           },
"mark_bookings_seen":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           },
"my_booking_updates":
{ Args: Record<PropertyKey, never>; Returns: {
              "booking_id": string
            }[]
                           },
"partner_booking_alerts":
{ Args: Record<PropertyKey, never>; Returns: {
              "expiring_soon": number,"needs_response": number
            }[]
                           },
"partner_payment_summary":
{ Args: { "p_provider_id": string }; Returns: {
              "collected_minor": number,"held_minor": number,"owed_minor": number,"paid_out_minor": number,"pending_refunds_minor": number,"refunded_minor": number
            }[]
                           },
"payments_to_reconcile":
{ Args: { "p_limit"?: number }; Returns: {
              "razorpay_order_id": string
            }[]
                           },
"record_auth_failure":
{ Args: { "p_kind": string }; Returns: undefined
                           },
"record_partner_payout":
{ Args: { "p_amount_minor": number,"p_note": string,"p_provider_id": string,"p_reference": string }; Returns: string
                           },
"record_razorpay_payment":
{ Args: { "p_amount_minor": number,"p_currency": string,"p_order_id": string,"p_payment_id": string,"p_status": string }; Returns: string
                           },
"record_razorpay_refund":
{ Args: { "p_amount_minor"?: number,"p_error"?: string,"p_razorpay_payment_id"?: string,"p_razorpay_refund_id"?: string,"p_refund_uuid"?: string,"p_status": string }; Returns: string
                           },
"refunds_to_check":
{ Args: { "p_limit"?: number }; Returns: {
              "razorpay_refund_id": string,"refund_id": string
            }[]
                           },
"request_booking":
{ Args: { "p_adults": number,"p_children": number,"p_contact_phone": string,"p_idempotency_key": string,"p_note": string,"p_slot_id": string }; Returns: {
              "booking_id": string,"booking_reference": string,"booking_status": Database["public"]['Enums']["booking_status"],"replayed": boolean
            }[]
                           },
"request_booking_on_date":
{ Args: { "p_adults": number,"p_children": number,"p_contact_phone": string,"p_date": string,"p_experience_id": string,"p_idempotency_key": string,"p_note": string }; Returns: {
              "booking_id": string,"booking_reference": string,"booking_status": Database["public"]['Enums']["booking_status"],"replayed": boolean
            }[]
                           },
"request_itinerary_bookings":
{ Args: { "p_contact_phone": string,"p_idempotency_key": string,"p_note": string,"p_version_id": string }; Returns: {
              "booking_id": string,"booking_reference": string,"booking_status": Database["public"]['Enums']["booking_status"],"error_code": string,"error_message": string,"item_id": string,"replayed": boolean
            }[]
                           },
"request_listing_booking":
{ Args: { "p_adults": number,"p_children": number,"p_contact_phone": string,"p_ends_on": string,"p_experience_id": string,"p_idempotency_key": string,"p_note": string,"p_pickup_note": string,"p_starts_on": string,"p_units": number }; Returns: {
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
{ Args: { "p_generation_id": number,"p_items": Json,"p_itinerary_id": string,"p_kind": Database["public"]['Enums']["itinerary_version_kind"],"p_model": string,"p_plan": Json,"p_preferences": Json,"p_prompt_version": string,"p_schema_version": string,"p_title": string,"p_travelers": number,"p_warnings": Json }; Returns: {
              "estimated_total_minor": number,"itinerary_id": string,"unpriced_item_count": number,"version_id": string,"version_number": number
            }[]
                           },
"set_deposits_required":
{ Args: { "p_required": boolean }; Returns: boolean
                           },
"submit_provider_application":
{ Args: { "p_provider_id": string }; Returns: Database["public"]['Enums']["provider_status"]
                           }
          }
          Enums: {
            "account_type": "traveller"|"partner"|"admin","app_role": "admin","availability_slot_status": "open"|"closed","booking_actor": "traveler"|"provider"|"system","booking_status": "requested"|"confirmed"|"declined"|"cancelled"|"expired"|"completed","experience_category": "culture"|"nature"|"adventure"|"trekking"|"wildlife"|"food_and_drink"|"festivals"|"wellness"|"other","experience_status": "draft"|"published"|"archived","itinerary_generation_outcome": "pending"|"succeeded"|"failed_validation"|"failed_upstream"|"failed_timeout"|"failed_save","itinerary_item_kind": "activity"|"stay"|"transport","itinerary_time_of_day": "morning"|"afternoon"|"evening"|"full_day","itinerary_version_kind": "generate"|"refine"|"regenerate","listing_type": "experience"|"guide"|"stay"|"transport","payment_status": "created"|"captured"|"failed","price_unit": "per_person"|"per_group_day"|"per_person_day"|"per_room_night"|"per_vehicle_trip"|"per_vehicle_day","provider_member_role": "owner","provider_status": "draft"|"pending_review"|"verified"|"rejected"|"suspended","refund_status": "pending"|"processed"|"failed"
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
            "account_type": ["traveller", "partner", "admin"],"app_role": ["admin"],"availability_slot_status": ["open", "closed"],"booking_actor": ["traveler", "provider", "system"],"booking_status": ["requested", "confirmed", "declined", "cancelled", "expired", "completed"],"experience_category": ["culture", "nature", "adventure", "trekking", "wildlife", "food_and_drink", "festivals", "wellness", "other"],"experience_status": ["draft", "published", "archived"],"itinerary_generation_outcome": ["pending", "succeeded", "failed_validation", "failed_upstream", "failed_timeout", "failed_save"],"itinerary_item_kind": ["activity", "stay", "transport"],"itinerary_time_of_day": ["morning", "afternoon", "evening", "full_day"],"itinerary_version_kind": ["generate", "refine", "regenerate"],"listing_type": ["experience", "guide", "stay", "transport"],"payment_status": ["created", "captured", "failed"],"price_unit": ["per_person", "per_group_day", "per_person_day", "per_room_night", "per_vehicle_trip", "per_vehicle_day"],"provider_member_role": ["owner"],"provider_status": ["draft", "pending_review", "verified", "rejected", "suspended"],"refund_status": ["pending", "processed", "failed"]
          }
        }
} as const
