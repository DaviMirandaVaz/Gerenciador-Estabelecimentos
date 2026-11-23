import { SQLiteDatabase } from 'expo-sqlite';

export async function migrateDbIfNeeded(db: SQLiteDatabase) {
  const DATABASE_VERSION = 6;
  
  // Use PRAGMA user_version to track migration state
  let result = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let currentDbVersion = result?.user_version ?? 0;
  
  if (currentDbVersion >= DATABASE_VERSION) {
    return;
  }

  if (currentDbVersion === 0) {
    await db.execAsync(`
      PRAGMA journal_mode = 'wal';

      CREATE TABLE IF NOT EXISTS produtos (
        id TEXT PRIMARY KEY NOT NULL,
        codigoBarras TEXT NOT NULL,
        nome TEXT NOT NULL,
        preco REAL NOT NULL,
        quantidade INTEGER NOT NULL,
        criadoEm INTEGER NOT NULL,
        precoCompra REAL,
        lucroPercentual REAL,
        codigoRef TEXT
      );

      CREATE TABLE IF NOT EXISTS configuracoes (
        id TEXT PRIMARY KEY NOT NULL,
        storeName TEXT NOT NULL,
        lucroPercentual REAL
      );

      CREATE TABLE IF NOT EXISTS movimentacoes (
        id TEXT PRIMARY KEY NOT NULL,
        tipo TEXT NOT NULL, -- 'entrada' ou 'saida'
        origem TEXT, -- 'venda', 'venda_mesa', 'venda_balcao', 'compra_estoque', 'manual', etc.
        data INTEGER NOT NULL,
        valorTotal REAL NOT NULL,
        descricao TEXT,
        itens TEXT, -- JSON string array of items
        formaPagamento TEXT DEFAULT 'dinheiro', -- 'dinheiro', 'debito', 'credito', 'a_prazo'
        dataVencimento INTEGER,                  -- timestamp ms (apenas para a_prazo)
        status TEXT DEFAULT 'confirmado',        -- 'confirmado' ou 'pendente'
        clienteNome TEXT,
        clienteCelular TEXT
      );

      CREATE TABLE IF NOT EXISTS mesas (
        id TEXT PRIMARY KEY NOT NULL,
        numero TEXT NOT NULL,
        nomeMesa TEXT,
        clienteNome TEXT,
        clienteCelular TEXT,
        status TEXT DEFAULT 'ocupada',
        abertaEm INTEGER NOT NULL,
        itens TEXT
      );
      
      -- Insert default config
      INSERT OR IGNORE INTO configuracoes (id, storeName, lucroPercentual) VALUES ('1', 'Lanchonete', 0);
    `);
    currentDbVersion = 1;
  }

  // Migração v1 → v2: adiciona colunas de pagamento em bancos existentes
  if (currentDbVersion === 1) {
    await db.execAsync(`
      ALTER TABLE movimentacoes ADD COLUMN formaPagamento TEXT DEFAULT 'dinheiro';
      ALTER TABLE movimentacoes ADD COLUMN dataVencimento INTEGER;
      ALTER TABLE movimentacoes ADD COLUMN status TEXT DEFAULT 'confirmado';
    `);
    currentDbVersion = 2;
  }

  // Migração v2 → v3: adiciona colunas de cliente
  if (currentDbVersion === 2) {
    await db.execAsync(`
      ALTER TABLE movimentacoes ADD COLUMN clienteNome TEXT;
      ALTER TABLE movimentacoes ADD COLUMN clienteCelular TEXT;
    `);
    currentDbVersion = 3;
  }

  // Migração v3 → v4: adiciona campo codigoRef nos produtos
  if (currentDbVersion === 3) {
    await db.execAsync(`
      ALTER TABLE produtos ADD COLUMN codigoRef TEXT;
    `);
    currentDbVersion = 4;
  }

  // Migração v4 → v5: adiciona tabela de mesas para lanchonete
  if (currentDbVersion === 4) {
    await db.execAsync(`
      CREATE TABLE IF NOT EXISTS mesas (
        id TEXT PRIMARY KEY NOT NULL,
        numero TEXT NOT NULL,
        nomeMesa TEXT,
        clienteNome TEXT,
        clienteCelular TEXT,
        status TEXT DEFAULT 'ocupada',
        abertaEm INTEGER NOT NULL,
        itens TEXT
      );
      UPDATE configuracoes SET storeName = 'Lanchonete' WHERE storeName = 'Nome do seu Comércio';
    `);
    currentDbVersion = 5;
  }

  // Migração v5 → v6: adiciona tipo de produto (produto, produto_sem_estoque, insumo)
  if (currentDbVersion === 5) {
    await db.execAsync(`
      ALTER TABLE produtos ADD COLUMN tipo TEXT DEFAULT 'produto';
      UPDATE produtos SET tipo = 'produto' WHERE tipo IS NULL;
    `);
    currentDbVersion = 6;
  }
  
  await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`);
}
