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
      ai_query_cache: {
        Row: {
          cache_key: string
          created_at: string
          expires_at: string
          filters: Json
          hits: number
          id: string
          model_used: string | null
          question: string
          response: Json
        }
        Insert: {
          cache_key: string
          created_at?: string
          expires_at?: string
          filters?: Json
          hits?: number
          id?: string
          model_used?: string | null
          question: string
          response: Json
        }
        Update: {
          cache_key?: string
          created_at?: string
          expires_at?: string
          filters?: Json
          hits?: number
          id?: string
          model_used?: string | null
          question?: string
          response?: Json
        }
        Relationships: []
      }
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
      auditoria_ingestao: {
        Row: {
          contratos_sem_licitacao: number
          created_at: string
          duration_ms: number | null
          executed_at: string
          homologadas_sem_itens: number
          homologadas_sem_vencedores: number
          id: string
          inconsistencias: Json
          itens_sem_vencedores: number
          pct_cobertura_homologadas: number
          pct_cobertura_vencedores: number
          severity: string
          total_com_itens: number
          total_com_vencedores: number
          total_contratos: number
          total_homologadas: number
          total_licitacoes: number
          total_vencedores: number
        }
        Insert: {
          contratos_sem_licitacao?: number
          created_at?: string
          duration_ms?: number | null
          executed_at?: string
          homologadas_sem_itens?: number
          homologadas_sem_vencedores?: number
          id?: string
          inconsistencias?: Json
          itens_sem_vencedores?: number
          pct_cobertura_homologadas?: number
          pct_cobertura_vencedores?: number
          severity?: string
          total_com_itens?: number
          total_com_vencedores?: number
          total_contratos?: number
          total_homologadas?: number
          total_licitacoes?: number
          total_vencedores?: number
        }
        Update: {
          contratos_sem_licitacao?: number
          created_at?: string
          duration_ms?: number | null
          executed_at?: string
          homologadas_sem_itens?: number
          homologadas_sem_vencedores?: number
          id?: string
          inconsistencias?: Json
          itens_sem_vencedores?: number
          pct_cobertura_homologadas?: number
          pct_cobertura_vencedores?: number
          severity?: string
          total_com_itens?: number
          total_com_vencedores?: number
          total_contratos?: number
          total_homologadas?: number
          total_licitacoes?: number
          total_vencedores?: number
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
      dashboard_validation_runs: {
        Row: {
          actual: number | null
          date_from: string | null
          date_to: string | null
          detail: string | null
          diff: number | null
          executed_at: string
          expected: number | null
          id: string
          metric: string
          periodo: string
          run_id: string
          status: string
        }
        Insert: {
          actual?: number | null
          date_from?: string | null
          date_to?: string | null
          detail?: string | null
          diff?: number | null
          executed_at?: string
          expected?: number | null
          id?: string
          metric: string
          periodo: string
          run_id: string
          status: string
        }
        Update: {
          actual?: number | null
          date_from?: string | null
          date_to?: string | null
          detail?: string | null
          diff?: number | null
          executed_at?: string
          expected?: number | null
          id?: string
          metric?: string
          periodo?: string
          run_id?: string
          status?: string
        }
        Relationships: []
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
      ingestion_jobs: {
        Row: {
          created_at: string
          created_by: string | null
          current_phase: string | null
          error_message: string | null
          finished_at: string | null
          id: string
          last_tick_at: string | null
          phase_label: string | null
          phase_progress_current: number
          phase_progress_total: number
          phases_completed: number
          phases_total: number
          started_at: string | null
          state: Json
          status: string
          total_records_processed: number
          updated_at: string
          watchdog_last_check_at: string | null
          watchdog_last_phase: string | null
          watchdog_last_progress: number | null
          watchdog_parent_job: string | null
          watchdog_restart_count: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          current_phase?: string | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          last_tick_at?: string | null
          phase_label?: string | null
          phase_progress_current?: number
          phase_progress_total?: number
          phases_completed?: number
          phases_total?: number
          started_at?: string | null
          state?: Json
          status?: string
          total_records_processed?: number
          updated_at?: string
          watchdog_last_check_at?: string | null
          watchdog_last_phase?: string | null
          watchdog_last_progress?: number | null
          watchdog_parent_job?: string | null
          watchdog_restart_count?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          current_phase?: string | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          last_tick_at?: string | null
          phase_label?: string | null
          phase_progress_current?: number
          phase_progress_total?: number
          phases_completed?: number
          phases_total?: number
          started_at?: string | null
          state?: Json
          status?: string
          total_records_processed?: number
          updated_at?: string
          watchdog_last_check_at?: string | null
          watchdog_last_phase?: string | null
          watchdog_last_progress?: number | null
          watchdog_parent_job?: string | null
          watchdog_restart_count?: number
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
      mv_refresh_state: {
        Row: {
          last_duration_ms: number | null
          last_refresh_at: string
          last_seen_max: string | null
          mv_name: string
          refresh_count: number
        }
        Insert: {
          last_duration_ms?: number | null
          last_refresh_at?: string
          last_seen_max?: string | null
          mv_name: string
          refresh_count?: number
        }
        Update: {
          last_duration_ms?: number | null
          last_refresh_at?: string
          last_seen_max?: string | null
          mv_name?: string
          refresh_count?: number
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
      orgao_siafi_cache: {
        Row: {
          cnpj: string
          codigo_siafi: string | null
          created_at: string
          found: boolean
          last_checked_at: string
          lookup_count: number
        }
        Insert: {
          cnpj: string
          codigo_siafi?: string | null
          created_at?: string
          found?: boolean
          last_checked_at?: string
          lookup_count?: number
        }
        Update: {
          cnpj?: string
          codigo_siafi?: string | null
          created_at?: string
          found?: boolean
          last_checked_at?: string
          lookup_count?: number
        }
        Relationships: []
      }
      orgaos_score: {
        Row: {
          ano_referencia: number
          atraso_medio_dias: number | null
          calculado_em: string
          cnpj_orgao: string
          created_at: string
          divida_consolidada_liquida: number | null
          fontes_utilizadas: string[] | null
          id: string
          nome_orgao: string
          observacoes: string | null
          pct_contratos_em_dia: number | null
          pct_divida_rcl: number | null
          pct_pago_sobre_empenhado: number | null
          qtd_contratos_analisados: number | null
          qtd_pagamentos: number | null
          receita_corrente_liquida: number | null
          score_classificacao: string
          score_execucao: number | null
          score_fiscal: number | null
          score_numerico: number
          score_pagamento: number | null
          total_empenhado: number | null
          total_liquidado: number | null
          total_pago: number | null
          uf: string | null
          updated_at: string
        }
        Insert: {
          ano_referencia?: number
          atraso_medio_dias?: number | null
          calculado_em?: string
          cnpj_orgao: string
          created_at?: string
          divida_consolidada_liquida?: number | null
          fontes_utilizadas?: string[] | null
          id?: string
          nome_orgao: string
          observacoes?: string | null
          pct_contratos_em_dia?: number | null
          pct_divida_rcl?: number | null
          pct_pago_sobre_empenhado?: number | null
          qtd_contratos_analisados?: number | null
          qtd_pagamentos?: number | null
          receita_corrente_liquida?: number | null
          score_classificacao?: string
          score_execucao?: number | null
          score_fiscal?: number | null
          score_numerico?: number
          score_pagamento?: number | null
          total_empenhado?: number | null
          total_liquidado?: number | null
          total_pago?: number | null
          uf?: string | null
          updated_at?: string
        }
        Update: {
          ano_referencia?: number
          atraso_medio_dias?: number | null
          calculado_em?: string
          cnpj_orgao?: string
          created_at?: string
          divida_consolidada_liquida?: number | null
          fontes_utilizadas?: string[] | null
          id?: string
          nome_orgao?: string
          observacoes?: string | null
          pct_contratos_em_dia?: number | null
          pct_divida_rcl?: number | null
          pct_pago_sobre_empenhado?: number | null
          qtd_contratos_analisados?: number | null
          qtd_pagamentos?: number | null
          receita_corrente_liquida?: number | null
          score_classificacao?: string
          score_execucao?: number | null
          score_fiscal?: number | null
          score_numerico?: number
          score_pagamento?: number | null
          total_empenhado?: number | null
          total_liquidado?: number | null
          total_pago?: number | null
          uf?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      pncp_raw: {
        Row: {
          chave_origem: string
          coletado_em: string
          id: string
          payload: Json
          processado: boolean
          tipo: string
        }
        Insert: {
          chave_origem: string
          coletado_em?: string
          id?: string
          payload: Json
          processado?: boolean
          tipo: string
        }
        Update: {
          chave_origem?: string
          coletado_em?: string
          id?: string
          payload?: Json
          processado?: boolean
          tipo?: string
        }
        Relationships: []
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
      claim_winners_batch: {
        Args: { p_limit?: number }
        Returns: {
          created_at: string
          id: string
          numero_controle_pncp: string
          raw_json: Json
        }[]
      }
      cleanup_ai_query_cache: { Args: never; Returns: number }
      contratos_por_dia: {
        Args: { p_days?: number }
        Returns: {
          dia: string
          total: number
        }[]
      }
      contratos_stats: {
        Args: never
        Returns: {
          total: number
          total_30d: number
          total_7d: number
          total_hoje: number
        }[]
      }
      contratos_top_orgaos: {
        Args: { p_days?: number; p_limit?: number }
        Returns: {
          cnpj_orgao: string
          orgao_nome: string
          total: number
          valor_total: number
        }[]
      }
      get_dashboard_validation_summary: {
        Args: never
        Returns: {
          divergences: Json
          divergent_count: number
          error_count: number
          executed_at: string
          ok_count: number
          run_id: string
          total: number
        }[]
      }
      get_distinct_situacoes: {
        Args: never
        Returns: {
          count: number
          situacao: string
        }[]
      }
      get_orfaos_dadosabertos: {
        Args: { p_limit?: number }
        Returns: {
          compra_key: string
        }[]
      }
      get_orgao_score: {
        Args: { p_cnpj: string }
        Returns: {
          atraso_medio_dias: number
          calculado_em: string
          cnpj_orgao: string
          fontes_utilizadas: string[]
          nome_orgao: string
          pct_contratos_em_dia: number
          pct_divida_rcl: number
          pct_pago_sobre_empenhado: number
          qtd_contratos_analisados: number
          score_classificacao: string
          score_execucao: number
          score_fiscal: number
          score_numerico: number
          score_pagamento: number
          uf: string
        }[]
      }
      get_winners_backlog_cursor: { Args: never; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_siafi_cache_hit: {
        Args: { p_cnpj: string }
        Returns: undefined
      }
      ingestion_watchdog: { Args: never; Returns: Json }
      licitacoes_pendentes_winners_count: {
        Args: { p_max?: number }
        Returns: number
      }
      licitacoes_sem_itens: {
        Args: { after_created_at?: string; lim?: number }
        Returns: {
          created_at: string
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
      list_top_orgaos_score: {
        Args: {
          p_limit?: number
          p_nome?: string
          p_offset?: number
          p_trust?: string
          p_uf?: string
        }
        Returns: {
          cnpj_orgao: string
          nome_orgao: string
          qtd_contratos_analisados: number
          score_classificacao: string
          score_numerico: number
          total_count: number
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
      pncp_dadosabertos_backfill_fast_tick: { Args: never; Returns: Json }
      pncp_dadosabertos_backfill_tick: { Args: never; Returns: Json }
      refresh_all_mvs: { Args: never; Returns: undefined }
      refresh_summary_mvs_if_dirty: { Args: never; Returns: Json }
      run_ingestion_audit: { Args: never; Returns: string }
      schedule_auto_ingestion: { Args: { p_force?: boolean }; Returns: Json }
      search_licitacoes: {
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
      set_winners_backlog_cursor: {
        Args: { p_cursor: string; p_processed?: number }
        Returns: undefined
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      validate_dashboard_metrics: { Args: never; Returns: string }
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
