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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      api_keys: {
        Row: {
          api_key: string
          client_name: string
          created_at: string
          id: string
          is_active: boolean
          last_used_at: string | null
          updated_at: string
        }
        Insert: {
          api_key?: string
          client_name: string
          created_at?: string
          id?: string
          is_active?: boolean
          last_used_at?: string | null
          updated_at?: string
        }
        Update: {
          api_key?: string
          client_name?: string
          created_at?: string
          id?: string
          is_active?: boolean
          last_used_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      contratos: {
        Row: {
          categoria: string | null
          cnpj_orgao: string
          created_at: string
          data_assinatura: string | null
          data_publicacao: string | null
          data_vigencia_fim: string | null
          data_vigencia_inicio: string | null
          fonte: string
          fornecedor_cnpj: string | null
          fornecedor_nome: string | null
          id: string
          licitacao_id: string | null
          modalidade_compra: string | null
          numero_contrato: string
          numero_licitacao: string | null
          objeto: string | null
          orgao_codigo: string | null
          orgao_nome: string | null
          raw_json: Json | null
          situacao: string | null
          updated_at: string
          valor_final: number | null
          valor_inicial: number | null
        }
        Insert: {
          categoria?: string | null
          cnpj_orgao: string
          created_at?: string
          data_assinatura?: string | null
          data_publicacao?: string | null
          data_vigencia_fim?: string | null
          data_vigencia_inicio?: string | null
          fonte?: string
          fornecedor_cnpj?: string | null
          fornecedor_nome?: string | null
          id?: string
          licitacao_id?: string | null
          modalidade_compra?: string | null
          numero_contrato: string
          numero_licitacao?: string | null
          objeto?: string | null
          orgao_codigo?: string | null
          orgao_nome?: string | null
          raw_json?: Json | null
          situacao?: string | null
          updated_at?: string
          valor_final?: number | null
          valor_inicial?: number | null
        }
        Update: {
          categoria?: string | null
          cnpj_orgao?: string
          created_at?: string
          data_assinatura?: string | null
          data_publicacao?: string | null
          data_vigencia_fim?: string | null
          data_vigencia_inicio?: string | null
          fonte?: string
          fornecedor_cnpj?: string | null
          fornecedor_nome?: string | null
          id?: string
          licitacao_id?: string | null
          modalidade_compra?: string | null
          numero_contrato?: string
          numero_licitacao?: string | null
          objeto?: string | null
          orgao_codigo?: string | null
          orgao_nome?: string | null
          raw_json?: Json | null
          situacao?: string | null
          updated_at?: string
          valor_final?: number | null
          valor_inicial?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "contratos_licitacao_id_fkey"
            columns: ["licitacao_id"]
            isOneToOne: false
            referencedRelation: "licitacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      diarios_oficiais: {
        Row: {
          created_at: string
          excerpt: string | null
          fonte: string
          id: string
          is_extra_edition: boolean | null
          publication_date: string
          query_matched: string | null
          raw_json: Json | null
          state_code: string | null
          territory_id: string
          territory_name: string | null
          txt_url: string | null
          url: string | null
        }
        Insert: {
          created_at?: string
          excerpt?: string | null
          fonte?: string
          id?: string
          is_extra_edition?: boolean | null
          publication_date: string
          query_matched?: string | null
          raw_json?: Json | null
          state_code?: string | null
          territory_id: string
          territory_name?: string | null
          txt_url?: string | null
          url?: string | null
        }
        Update: {
          created_at?: string
          excerpt?: string | null
          fonte?: string
          id?: string
          is_extra_edition?: boolean | null
          publication_date?: string
          query_matched?: string | null
          raw_json?: Json | null
          state_code?: string | null
          territory_id?: string
          territory_name?: string | null
          txt_url?: string | null
          url?: string | null
        }
        Relationships: []
      }
      empresas_clientes: {
        Row: {
          cnpj: string | null
          created_at: string
          descricao_atividade: string | null
          id: string
          nome: string
          palavras_chave: string[] | null
          prompt_personalizado: string | null
          segmentos: string[] | null
          updated_at: string
        }
        Insert: {
          cnpj?: string | null
          created_at?: string
          descricao_atividade?: string | null
          id?: string
          nome: string
          palavras_chave?: string[] | null
          prompt_personalizado?: string | null
          segmentos?: string[] | null
          updated_at?: string
        }
        Update: {
          cnpj?: string | null
          created_at?: string
          descricao_atividade?: string | null
          id?: string
          nome?: string
          palavras_chave?: string[] | null
          prompt_personalizado?: string | null
          segmentos?: string[] | null
          updated_at?: string
        }
        Relationships: []
      }
      empresas_sancionadas: {
        Row: {
          cnpj_cpf: string | null
          created_at: string
          data_fim: string | null
          data_inicio: string | null
          fonte: string
          fundamentacao_legal: string | null
          id: string
          id_origem: string
          nome: string
          orgao_sancionador: string | null
          raw_json: Json | null
          tipo_cadastro: string
          tipo_sancao: string | null
          uf_orgao: string | null
          updated_at: string
        }
        Insert: {
          cnpj_cpf?: string | null
          created_at?: string
          data_fim?: string | null
          data_inicio?: string | null
          fonte?: string
          fundamentacao_legal?: string | null
          id?: string
          id_origem: string
          nome: string
          orgao_sancionador?: string | null
          raw_json?: Json | null
          tipo_cadastro: string
          tipo_sancao?: string | null
          uf_orgao?: string | null
          updated_at?: string
        }
        Update: {
          cnpj_cpf?: string | null
          created_at?: string
          data_fim?: string | null
          data_inicio?: string | null
          fonte?: string
          fundamentacao_legal?: string | null
          id?: string
          id_origem?: string
          nome?: string
          orgao_sancionador?: string | null
          raw_json?: Json | null
          tipo_cadastro?: string
          tipo_sancao?: string | null
          uf_orgao?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      ingestao_logs: {
        Row: {
          created_at: string
          data_fim: string | null
          data_inicio: string | null
          endpoint: string
          erro: string | null
          fonte: string
          id: string
          registros_processados: number | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          data_fim?: string | null
          data_inicio?: string | null
          endpoint: string
          erro?: string | null
          fonte: string
          id?: string
          registros_processados?: number | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          data_fim?: string | null
          data_inicio?: string | null
          endpoint?: string
          erro?: string | null
          fonte?: string
          id?: string
          registros_processados?: number | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      licitacao_itens: {
        Row: {
          created_at: string
          descricao: string
          id: string
          licitacao_id: string
          numero_item: number | null
          quantidade: number | null
          unidade: string | null
          valor_unitario_estimado: number | null
          valor_unitario_final: number | null
        }
        Insert: {
          created_at?: string
          descricao: string
          id?: string
          licitacao_id: string
          numero_item?: number | null
          quantidade?: number | null
          unidade?: string | null
          valor_unitario_estimado?: number | null
          valor_unitario_final?: number | null
        }
        Update: {
          created_at?: string
          descricao?: string
          id?: string
          licitacao_id?: string
          numero_item?: number | null
          quantidade?: number | null
          unidade?: string | null
          valor_unitario_estimado?: number | null
          valor_unitario_final?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "licitacao_itens_licitacao_id_fkey"
            columns: ["licitacao_id"]
            isOneToOne: false
            referencedRelation: "licitacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      licitacao_vencedores: {
        Row: {
          cnpj: string | null
          created_at: string
          id: string
          item_id: string
          percentual_desconto: number | null
          razao_social: string | null
          valor_final: number | null
        }
        Insert: {
          cnpj?: string | null
          created_at?: string
          id?: string
          item_id: string
          percentual_desconto?: number | null
          razao_social?: string | null
          valor_final?: number | null
        }
        Update: {
          cnpj?: string | null
          created_at?: string
          id?: string
          item_id?: string
          percentual_desconto?: number | null
          razao_social?: string | null
          valor_final?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "licitacao_vencedores_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "licitacao_itens"
            referencedColumns: ["id"]
          },
        ]
      }
      licitacoes: {
        Row: {
          created_at: string
          data_publicacao: string | null
          data_resultado: string | null
          fonte: string
          id: string
          id_origem: string
          modalidade: string | null
          municipio: string | null
          numero_controle_pncp: string | null
          objeto: string
          orgao: string
          raw_json: Json | null
          situacao: string | null
          uf: string | null
          updated_at: string
          valor_estimado: number | null
          valor_homologado: number | null
        }
        Insert: {
          created_at?: string
          data_publicacao?: string | null
          data_resultado?: string | null
          fonte?: string
          id?: string
          id_origem: string
          modalidade?: string | null
          municipio?: string | null
          numero_controle_pncp?: string | null
          objeto: string
          orgao: string
          raw_json?: Json | null
          situacao?: string | null
          uf?: string | null
          updated_at?: string
          valor_estimado?: number | null
          valor_homologado?: number | null
        }
        Update: {
          created_at?: string
          data_publicacao?: string | null
          data_resultado?: string | null
          fonte?: string
          id?: string
          id_origem?: string
          modalidade?: string | null
          municipio?: string | null
          numero_controle_pncp?: string | null
          objeto?: string
          orgao?: string
          raw_json?: Json | null
          situacao?: string | null
          uf?: string | null
          updated_at?: string
          valor_estimado?: number | null
          valor_homologado?: number | null
        }
        Relationships: []
      }
      oportunidades: {
        Row: {
          created_at: string
          empresa_id: string
          id: string
          justificativa_tecnica: string | null
          licitacao_id: string
          motivo_recomendacao: string | null
          nivel_risco: string | null
          score_aderencia: number
          tipo_oportunidade: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          empresa_id: string
          id?: string
          justificativa_tecnica?: string | null
          licitacao_id: string
          motivo_recomendacao?: string | null
          nivel_risco?: string | null
          score_aderencia?: number
          tipo_oportunidade?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          empresa_id?: string
          id?: string
          justificativa_tecnica?: string | null
          licitacao_id?: string
          motivo_recomendacao?: string | null
          nivel_risco?: string | null
          score_aderencia?: number
          tipo_oportunidade?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "oportunidades_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas_clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "oportunidades_licitacao_id_fkey"
            columns: ["licitacao_id"]
            isOneToOne: false
            referencedRelation: "licitacoes"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      sync_status: {
        Row: {
          api_source: string
          id: string
          last_date_processed: string
          modalidade: number
          total_synced: number | null
          updated_at: string
        }
        Insert: {
          api_source?: string
          id?: string
          last_date_processed: string
          modalidade: number
          total_synced?: number | null
          updated_at?: string
        }
        Update: {
          api_source?: string
          id?: string
          last_date_processed?: string
          modalidade?: number
          total_synced?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          empresa_id: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          empresa_id?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          empresa_id?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_user_roles_empresa"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas_clientes"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      mv_empresas_vencedoras: {
        Row: {
          cnpj: string | null
          municipio: string | null
          razao_social: string | null
          total_valor: number | null
          total_vitorias: number | null
          uf: string | null
        }
        Relationships: []
      }
      mv_orgaos: {
        Row: {
          municipio: string | null
          orgao: string | null
          total_licitacoes: number | null
          total_valor: number | null
          uf: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      analytics_daily_by_status: {
        Args: { p_date_from?: string; p_date_to?: string }
        Returns: {
          count: number
          pub_date: string
          situacao: string
        }[]
      }
      analytics_monthly_sales: {
        Args: { p_date_from?: string; p_date_to?: string }
        Returns: {
          contract_count: number
          month: string
          total_valor: number
        }[]
      }
      analytics_sales_totals: {
        Args: { p_date_from?: string; p_date_to?: string }
        Returns: {
          total_contracts: number
          total_sales: number
        }[]
      }
      analytics_top_buyers: {
        Args: { p_date_from?: string; p_date_to?: string; p_limit?: number }
        Returns: {
          orgao: string
          purchases: number
          total_valor: number
        }[]
      }
      analytics_top_winners: {
        Args: { p_date_from?: string; p_date_to?: string; p_limit?: number }
        Returns: {
          cnpj: string
          razao_social: string
          total_valor: number
          wins: number
        }[]
      }
      analytics_totals: {
        Args: { p_date_from?: string; p_date_to?: string }
        Returns: {
          total_empresas: number
          total_orgaos: number
        }[]
      }
      check_vencedores_sancionados: {
        Args: { p_limit?: number }
        Returns: {
          cnpj: string
          data_fim: string
          data_inicio: string
          orgao_sancionador: string
          razao_social: string
          tipo_cadastro: string
          tipo_sancao: string
          total_valor: number
          total_vitorias: number
        }[]
      }
      get_distinct_situacoes: {
        Args: never
        Returns: {
          count: number
          situacao: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      licitacoes_sem_itens: {
        Args: { lim?: number }
        Returns: {
          id: string
          numero_controle_pncp: string
          raw_json: Json
        }[]
      }
      link_contratos_licitacoes: { Args: never; Returns: number }
      list_empresas_vencedoras:
        | {
            Args: {
              p_limit?: number
              p_offset?: number
              p_search?: string
              p_uf?: string
            }
            Returns: {
              cnpj: string
              municipio: string
              razao_social: string
              total_count: number
              total_vitorias: number
              uf: string
            }[]
          }
        | {
            Args: {
              p_limit?: number
              p_offset?: number
              p_order_by?: string
              p_search?: string
              p_uf?: string
            }
            Returns: {
              cnpj: string
              municipio: string
              razao_social: string
              total_count: number
              total_valor: number
              total_vitorias: number
              uf: string
            }[]
          }
      list_orgaos:
        | {
            Args: {
              p_limit?: number
              p_offset?: number
              p_search?: string
              p_uf?: string
            }
            Returns: {
              municipio: string
              orgao: string
              total_count: number
              total_licitacoes: number
              uf: string
            }[]
          }
        | {
            Args: {
              p_limit?: number
              p_offset?: number
              p_order_by?: string
              p_search?: string
              p_uf?: string
            }
            Returns: {
              municipio: string
              orgao: string
              total_count: number
              total_licitacoes: number
              total_valor: number
              uf: string
            }[]
          }
      match_licitacoes_por_keywords: {
        Args: { p_empresa_id: string; p_limit?: number }
        Returns: {
          keywords_matched: string[]
          licitacao_id: string
          match_count: number
          modalidade: string
          objeto: string
          orgao: string
          situacao: string
          uf: string
          valor_estimado: number
        }[]
      }
      refresh_all_mvs: { Args: never; Returns: undefined }
      search_licitacoes:
        | {
            Args: {
              p_com_vencedor?: boolean
              p_date_from?: string
              p_date_to?: string
              p_limit?: number
              p_modalidade?: string
              p_offset?: number
              p_orgao?: string
              p_search?: string
              p_sem_resultado?: boolean
              p_situacao?: string
              p_uf?: string
              p_vencedor?: string
            }
            Returns: {
              data_publicacao: string
              id: string
              modalidade: string
              municipio: string
              numero_controle_pncp: string
              objeto: string
              orgao: string
              situacao: string
              total_count: number
              uf: string
              valor_estimado: number
              valor_homologado: number
              vencedor_nome: string
            }[]
          }
        | {
            Args: {
              p_com_vencedor?: boolean
              p_date_from?: string
              p_date_to?: string
              p_limit?: number
              p_modalidade?: string
              p_offset?: number
              p_orgao?: string
              p_search?: string
              p_sem_resultado?: boolean
              p_situacao?: string
              p_uf?: string
              p_vencedor?: string
            }
            Returns: {
              data_publicacao: string
              id: string
              modalidade: string
              municipio: string
              numero_controle_pncp: string
              objeto: string
              orgao: string
              situacao: string
              total_count: number
              uf: string
              valor_estimado: number
              valor_homologado: number
              vencedor_nome: string
            }[]
          }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
    }
    Enums: {
      app_role: "admin_central" | "admin_empresa" | "usuario_empresa"
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
      app_role: ["admin_central", "admin_empresa", "usuario_empresa"],
    },
  },
} as const
