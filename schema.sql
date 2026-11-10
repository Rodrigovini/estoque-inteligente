CREATE TABLE IF NOT EXISTS usuarios (
  id bigserial PRIMARY KEY,
  nome varchar(120) NOT NULL,
  email varchar(160) NOT NULL UNIQUE,
  senha_hash varchar(255) NOT NULL,
  perfil varchar(10) NOT NULL DEFAULT 'operador' CHECK (perfil IN ('admin','operador')),
  ativo boolean NOT NULL DEFAULT TRUE,
  criado_em timestamptz(0) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS categorias (
  id bigserial PRIMARY KEY,
  nome varchar(60) NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS fornecedores (
  id bigserial PRIMARY KEY,
  nome varchar(120) NOT NULL,
  descricao varchar(255),
  telefone varchar(20),
  ativo boolean NOT NULL DEFAULT TRUE
);
CREATE TABLE IF NOT EXISTS produtos (
  id bigserial PRIMARY KEY,
  nome varchar(120) NOT NULL,
  categoria_id bigint REFERENCES categorias(id),
  unidade varchar(3) NOT NULL DEFAULT 'UN',
  estoque_minimo decimal(12,3) NOT NULL DEFAULT 0,
  dias_alerta_validade integer,
  preco_custo decimal(12,2) NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT TRUE,
  criado_em timestamptz(0) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS lotes_estoque (
  id bigserial PRIMARY KEY,
  produto_id bigint NOT NULL REFERENCES produtos(id),
  codigo_lote varchar(30) NOT NULL DEFAULT 'SEM-LOTE',
  data_validade date,
  quantidade decimal(12,3) NOT NULL CHECK (quantidade >= 0),
  criado_em timestamptz(0) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em timestamptz(0) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS lotes_unico ON lotes_estoque (produto_id, codigo_lote, (COALESCE(data_validade, '9999-12-31'::date)));
CREATE TABLE IF NOT EXISTS movimentacoes_estoque (
  id bigserial PRIMARY KEY,
  lote_id bigint NOT NULL REFERENCES lotes_estoque(id),
  produto_id bigint NOT NULL REFERENCES produtos(id),
  usuario_id bigint REFERENCES usuarios(id),
  fornecedor_id bigint REFERENCES fornecedores(id),
  tipo varchar(15) NOT NULL CHECK (tipo IN ('entrada','saida','perda')),
  quantidade decimal(12,3) NOT NULL CHECK (quantidade > 0),
  custo_unitario decimal(12,2),
  referencia varchar(255),
  criado_em timestamptz(0) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS mov_criado ON movimentacoes_estoque (criado_em);
CREATE INDEX IF NOT EXISTS mov_produto ON movimentacoes_estoque (produto_id);
