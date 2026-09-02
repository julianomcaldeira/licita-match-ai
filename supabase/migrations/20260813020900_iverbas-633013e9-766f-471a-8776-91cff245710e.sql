
-- Create reference table mapping organs to their parent ministry
CREATE TABLE public.orgao_ministerio_map (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  orgao_nome text NOT NULL,
  ministerio text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.orgao_ministerio_map ENABLE ROW LEVEL SECURITY;

-- Public read access
CREATE POLICY "Anyone can read ministry mapping"
ON public.orgao_ministerio_map
FOR SELECT
USING (true);

-- Create index for fast lookups
CREATE INDEX idx_orgao_ministerio_orgao ON public.orgao_ministerio_map (orgao_nome);

-- Populate with known federal agency -> ministry mappings
INSERT INTO public.orgao_ministerio_map (orgao_nome, ministerio) VALUES
-- Presidência
('PRESIDENCIA DA REPUBLICA', 'Presidência da República'),
('CASA CIVIL DA PRESIDENCIA DA REPUBLICA', 'Presidência da República'),
('CONTROLADORIA-GERAL DA UNIAO', 'Presidência da República'),
('GABINETE DE SEGURANCA INSTITUCIONAL DA PRESIDENCIA DA REPUBLICA', 'Presidência da República'),
('SECRETARIA-GERAL DA PRESIDENCIA DA REPUBLICA', 'Presidência da República'),
('SECRETARIA DE COMUNICACAO SOCIAL', 'Presidência da República'),
('ADVOCACIA GERAL DA UNIAO', 'Advocacia-Geral da União'),
('ADVOCACIA-GERAL DA UNIAO', 'Advocacia-Geral da União'),
-- Defesa
('MINISTERIO DA DEFESA', 'Ministério da Defesa'),
('COMANDO DO EXERCITO', 'Ministério da Defesa'),
('COMANDO DA MARINHA', 'Ministério da Defesa'),
('COMANDO DA AERONAUTICA', 'Ministério da Defesa'),
('HOSPITAL DAS FORCAS ARMADAS', 'Ministério da Defesa'),
-- Saúde
('MINISTERIO DA SAUDE', 'Ministério da Saúde'),
('AGENCIA NACIONAL DE VIGILANCIA SANITARIA', 'Ministério da Saúde'),
('AGENCIA NACIONAL DE SAUDE SUPLEMENTAR', 'Ministério da Saúde'),
('FUNDACAO OSWALDO CRUZ', 'Ministério da Saúde'),
('FUNDACAO NACIONAL DE SAUDE', 'Ministério da Saúde'),
-- Educação
('MINISTERIO DA EDUCACAO', 'Ministério da Educação'),
('FUNDACAO UNIVERSIDADE FEDERAL DE MATO GROSSO DO SUL', 'Ministério da Educação'),
('FUNDACAO UNIVERSIDADE FEDERAL DE SERGIPE', 'Ministério da Educação'),
('FUNDACAO UNIVERSIDADE DE BRASILIA', 'Ministério da Educação'),
('FUNDACAO COORDENACAO DE APERFEICOAMENTO DE PESSOAL DE NIVEL SUPERIOR', 'Ministério da Educação'),
('FUNDO NACIONAL DE DESENVOLVIMENTO DA EDUCACAO', 'Ministério da Educação'),
('INSTITUTO NACIONAL DE ESTUDOS E PESQUISAS EDUCACIONAIS ANISIO TEIXEIRA', 'Ministério da Educação'),
-- Fazenda
('MINISTERIO DA FAZENDA', 'Ministério da Fazenda'),
('RECEITA FEDERAL DO BRASIL', 'Ministério da Fazenda'),
('BANCO CENTRAL DO BRASIL', 'Ministério da Fazenda'),
-- Justiça
('MINISTERIO DA JUSTICA E SEGURANCA PUBLICA', 'Ministério da Justiça e Segurança Pública'),
('POLICIA FEDERAL', 'Ministério da Justiça e Segurança Pública'),
('POLICIA RODOVIARIA FEDERAL', 'Ministério da Justiça e Segurança Pública'),
('DEPARTAMENTO PENITENCIARIO NACIONAL', 'Ministério da Justiça e Segurança Pública'),
-- Transportes
('MINISTERIO DOS TRANSPORTES', 'Ministério dos Transportes'),
('AGENCIA NACIONAL DE TRANSPORTES TERRESTRES - ANTT', 'Ministério dos Transportes'),
('AGENCIA NACIONAL DE TRANSPORTES AQUAVIARIOS', 'Ministério dos Transportes'),
('DEPARTAMENTO NACIONAL DE INFRAESTRUTURA DE TRANSPORTES', 'Ministério dos Transportes'),
-- Ciência e Tecnologia
('MINISTERIO DA CIENCIA, TECNOLOGIA E INOVACAO', 'Ministério da Ciência, Tecnologia e Inovação'),
('CONSELHO NACIONAL DE DESENVOLVIMENTO CIENTIFICO E TECNOLOGICO', 'Ministério da Ciência, Tecnologia e Inovação'),
('AGENCIA ESPACIAL BRASILEIRA', 'Ministério da Ciência, Tecnologia e Inovação'),
-- Comunicações
('MINISTERIO DAS COMUNICACOES', 'Ministério das Comunicações'),
('AGENCIA NACIONAL DE TELECOMUNICACOES', 'Ministério das Comunicações'),
-- Meio Ambiente
('MINISTERIO DO MEIO AMBIENTE E MUDANCA DO CLIMA', 'Ministério do Meio Ambiente'),
('INSTITUTO BRASILEIRO DO MEIO AMBIENTE E DOS RECURSOS NATURAIS RENOVAVEIS', 'Ministério do Meio Ambiente'),
('INSTITUTO CHICO MENDES DE CONSERVACAO DA BIODIVERSIDADE', 'Ministério do Meio Ambiente'),
-- Minas e Energia
('MINISTERIO DE MINAS E ENERGIA', 'Ministério de Minas e Energia'),
('AGENCIA NACIONAL DO PETROLEO, GAS NATURAL E BIOCOMBUSTIVEIS', 'Ministério de Minas e Energia'),
('AGENCIA NACIONAL DE ENERGIA ELETRICA', 'Ministério de Minas e Energia'),
-- Agricultura
('MINISTERIO DA AGRICULTURA E PECUARIA', 'Ministério da Agricultura e Pecuária'),
-- Trabalho
('MINISTERIO DO TRABALHO E EMPREGO', 'Ministério do Trabalho e Emprego'),
-- Relações Exteriores
('MINISTERIO DAS RELACOES EXTERIORES', 'Ministério das Relações Exteriores'),
-- Aviação Civil / Portos
('AGENCIA NACIONAL DE AVIACAO CIVIL - ANAC', 'Ministério de Portos e Aeroportos'),
-- Desenvolvimento
('MINISTERIO DO DESENVOLVIMENTO, INDUSTRIA, COMERCIO E SERVICOS', 'Ministério do Desenvolvimento, Indústria, Comércio e Serviços'),
-- Desenvolvimento Social
('MINISTERIO DO DESENVOLVIMENTO E ASSISTENCIA SOCIAL, FAMILIA E COMBATE A FOME', 'Ministério do Desenvolvimento e Assistência Social'),
-- Cidades
('MINISTERIO DAS CIDADES', 'Ministério das Cidades'),
-- Integração
('MINISTERIO DA INTEGRACAO E DO DESENVOLVIMENTO REGIONAL', 'Ministério da Integração e do Desenvolvimento Regional'),
-- Cultura
('MINISTERIO DA CULTURA', 'Ministério da Cultura'),
-- Esporte
('MINISTERIO DO ESPORTE', 'Ministério do Esporte'),
-- Judiciário
('SUPREMO TRIBUNAL FEDERAL', 'Poder Judiciário'),
('SUPERIOR TRIBUNAL DE JUSTICA', 'Poder Judiciário'),
('TRIBUNAL SUPERIOR DO TRABALHO', 'Poder Judiciário'),
('CONSELHO NACIONAL DE JUSTICA', 'Poder Judiciário'),
('TRIBUNAL SUPERIOR ELEITORAL', 'Poder Judiciário'),
-- Legislativo
('SENADO FEDERAL', 'Poder Legislativo'),
('CAMARA DOS DEPUTADOS', 'Poder Legislativo'),
('TRIBUNAL DE CONTAS DA UNIAO', 'Poder Legislativo'),
-- MPU
('MINISTERIO PUBLICO DA UNIAO', 'Ministério Público da União'),
('MINISTERIO PUBLICO FEDERAL', 'Ministério Público da União'),
('MINISTERIO PUBLICO DO TRABALHO', 'Ministério Público da União'),
-- Direitos Humanos
('MINISTERIO DOS DIREITOS HUMANOS E CIDADANIA', 'Ministério dos Direitos Humanos e Cidadania');
