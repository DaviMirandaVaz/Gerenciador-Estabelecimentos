/**
 * Suite de Testes Automatizados — Projeto 2026 - PDV
 * Valida SQLite real (via sql.js), migrações (banco novo e banco existente v4),
 * estoque, pesquisa por nome/código, vendas, pagamento combinado, pesquisa por
 * cliente no financeiro e recebimento parcial/total.
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const initSqlJs = require('sql.js');

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

let passed = 0;
let failed = 0;

async function runTest(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`${GREEN}✔ [PASSOU]${RESET} ${name}`);
  } catch (err) {
    failed++;
    console.log(`${RED}✖ [FALHOU]${RESET} ${name}`);
    console.error(`   Motivo: ${err.message}`);
  }
}

/**
 * Cria um adaptador com a mesma API do expo-sqlite (execAsync, runAsync, getFirstAsync, getAllAsync)
 * usando um banco SQLite real em memória (sql.js).
 */
function createExpoSQLiteAdapter(SQL) {
  const rawDb = new SQL.Database();
  return {
    rawDb,
    async execAsync(sql) {
      rawDb.run(sql);
    },
    async runAsync(sql, params = []) {
      const bindParams = Array.isArray(params) ? params : [params];
      rawDb.run(sql, bindParams);
    },
    async getFirstAsync(sql, params = []) {
      const rows = await this.getAllAsync(sql, params);
      return rows[0] || null;
    },
    async getAllAsync(sql, params = []) {
      const stmt = rawDb.prepare(sql);
      const bindParams = Array.isArray(params) ? params : [params];
      if (bindParams.length > 0) stmt.bind(bindParams);
      const results = [];
      while (stmt.step()) {
        results.push(stmt.getAsObject());
      }
      stmt.free();
      return results;
    },
  };
}

// Mesma lógica do app/database.ts
async function migrateDbIfNeeded(db) {
  const result = await db.getFirstAsync('PRAGMA user_version');
  let currentDbVersion = result?.user_version ?? 0;

  if (currentDbVersion >= 4) return;

  if (currentDbVersion === 0) {
    await db.execAsync(`
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
        tipo TEXT NOT NULL,
        origem TEXT,
        data INTEGER NOT NULL,
        valorTotal REAL NOT NULL,
        descricao TEXT,
        itens TEXT,
        formaPagamento TEXT DEFAULT 'dinheiro',
        dataVencimento INTEGER,
        status TEXT DEFAULT 'confirmado',
        clienteNome TEXT,
        clienteCelular TEXT
      );

      INSERT OR IGNORE INTO configuracoes (id, storeName, lucroPercentual) VALUES ('1', 'Nome do seu Comércio', 0);
    `);
    currentDbVersion = 1;
  }

  const safeAddColumn = async (sql) => {
    try {
      await db.execAsync(sql);
    } catch {
      // ignora coluna duplicada
    }
  };

  if (currentDbVersion === 1) {
    await safeAddColumn("ALTER TABLE movimentacoes ADD COLUMN formaPagamento TEXT DEFAULT 'dinheiro';");
    await safeAddColumn('ALTER TABLE movimentacoes ADD COLUMN dataVencimento INTEGER;');
    await safeAddColumn("ALTER TABLE movimentacoes ADD COLUMN status TEXT DEFAULT 'confirmado';");
    currentDbVersion = 2;
  }
  if (currentDbVersion === 2) {
    await safeAddColumn('ALTER TABLE movimentacoes ADD COLUMN clienteNome TEXT;');
    await safeAddColumn('ALTER TABLE movimentacoes ADD COLUMN clienteCelular TEXT;');
    currentDbVersion = 3;
  }
  if (currentDbVersion === 3) {
    await safeAddColumn('ALTER TABLE produtos ADD COLUMN codigoRef TEXT;');
    currentDbVersion = 4;
  }

  await db.execAsync('PRAGMA user_version = 4');
}

async function main() {
  console.log(`\n${CYAN}================================================================${RESET}`);
  console.log(`${CYAN}   SUITE DE TESTES AUTOMATIZADOS — PROJETO 2026 - PDV${RESET}`);
  console.log(`${CYAN}================================================================${RESET}\n`);

  const SQL = await initSqlJs();
  const db = createExpoSQLiteAdapter(SQL);

  // 1. Migração de banco novo (v0 -> v4)
  await runTest('1. Inicialização de banco SQLite novo (v0 -> v4) sem erro de coluna duplicada', async () => {
    await migrateDbIfNeeded(db);
    const v = await db.getFirstAsync('PRAGMA user_version');
    assert.strictEqual(v.user_version, 4);
    const cfg = await db.getFirstAsync("SELECT * FROM configuracoes WHERE id = '1'");
    assert.strictEqual(cfg.storeName, 'Nome do seu Comércio');
  });

  // 2. Proteção do banco já existente (ex: PC da prima em v4)
  await runTest('2. Segurança de atualização: banco existente (v4) mantém 100% dos dados intactos', async () => {
    const dbPrima = createExpoSQLiteAdapter(SQL);
    await migrateDbIfNeeded(dbPrima);
    await dbPrima.runAsync(
      "UPDATE configuracoes SET storeName = 'Loja da Prima' WHERE id = '1'"
    );
    await dbPrima.runAsync(
      'INSERT INTO produtos (id, codigoBarras, nome, preco, quantidade, criadoEm, precoCompra, lucroPercentual) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      ['p-prima-1', '7890001112223', 'Vestido Floral', 120.0, 15, Date.now(), 60.0, 100]
    );

    // Simula abrir a versão atualizada do programa em cima do banco v4 existente
    await migrateDbIfNeeded(dbPrima);

    const cfg = await dbPrima.getFirstAsync("SELECT storeName FROM configuracoes WHERE id = '1'");
    const prods = await dbPrima.getAllAsync('SELECT * FROM produtos');
    assert.strictEqual(cfg.storeName, 'Loja da Prima');
    assert.strictEqual(prods.length, 1);
    assert.strictEqual(prods[0].nome, 'Vestido Floral');
    assert.strictEqual(prods[0].quantidade, 15);
  });

  // 3. Cadastro de produtos (Nova Entrada)
  await runTest('3. Cadastro de produtos e lançamento automático de saída no financeiro', async () => {
    const produtos = [
      { id: 'p1', cod: '7891111222233', nome: 'Camisa Polo Azul', compra: 40, lucro: 100, venda: 80, qtd: 20 },
      { id: 'p2', cod: '7894444555566', nome: 'Calça Sarja Bege', compra: 70, lucro: 100, venda: 140, qtd: 10 },
      { id: 'p3', cod: 'REF-9988', nome: 'Boné Esportivo Preto', compra: 20, lucro: 100, venda: 40, qtd: 4 },
    ];

    for (const p of produtos) {
      await db.runAsync(
        'INSERT INTO produtos (id, codigoBarras, nome, preco, quantidade, criadoEm, precoCompra, lucroPercentual, codigoRef) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [p.id, p.cod, p.nome, p.venda, p.qtd, Date.now(), p.compra, p.lucro, p.cod]
      );
      await db.runAsync(
        'INSERT INTO movimentacoes (id, tipo, origem, data, valorTotal, descricao, itens) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [
          `mov-${p.id}`,
          'saida',
          'compra_estoque',
          Date.now(),
          p.compra * p.qtd,
          `Compra de estoque - ${p.nome}`,
          JSON.stringify([{ produtoId: p.id, produtoNome: p.nome, quantidade: p.qtd, precoCompra: p.compra }]),
        ]
      );
    }

    const todos = await db.getAllAsync('SELECT * FROM produtos ORDER BY nome ASC');
    assert.strictEqual(todos.length, 3);
  });

  // 4. Pesquisa de Estoque Detalhado por Nome ou Código
  await runTest('4. Pesquisa no Estoque Detalhado por Nome e por Código de Barras/Referência', async () => {
    const todos = await db.getAllAsync('SELECT * FROM produtos ORDER BY nome ASC');
    const filtrarEstoque = (busca) => {
      const termo = busca.trim().toLowerCase();
      return todos.filter(
        (p) =>
          p.nome.toLowerCase().includes(termo) ||
          (p.codigoBarras ?? '').toLowerCase().includes(termo) ||
          (p.codigoRef ?? '').toLowerCase().includes(termo)
      );
    };

    const porNome = filtrarEstoque('sarja');
    assert.strictEqual(porNome.length, 1);
    assert.strictEqual(porNome[0].nome, 'Calça Sarja Bege');

    const porCodigoBarras = filtrarEstoque('7891111');
    assert.strictEqual(porCodigoBarras.length, 1);
    assert.strictEqual(porCodigoBarras[0].nome, 'Camisa Polo Azul');

    const porCodigoRef = filtrarEstoque('ref-9988');
    assert.strictEqual(porCodigoRef.length, 1);
    assert.strictEqual(porCodigoRef[0].nome, 'Boné Esportivo Preto');
  });

  // 5. Venda com Pagamento Combinado (Dinheiro + Crédito + Pendente A Prazo)
  await runTest('5. Nova Venda com Pagamento Combinado (Dinheiro + Crédito + Pendente A Prazo)', async () => {
    // Venda de 1 Camisa Polo (R$ 80) + 1 Calça Sarja (R$ 140) = R$ 220,00
    // Combinado: R$ 50,00 Dinheiro + R$ 70,00 Crédito (= R$ 120,00 Pago) + R$ 100,00 Pendente (A Prazo)
    const pagoAgora = 50 + 70;
    const pendentePrazo = 100;
    const vencimento = Date.now() + 7 * 86400000;

    await db.runAsync('UPDATE produtos SET quantidade = quantidade - 1 WHERE id = ?', ['p1']);
    await db.runAsync('UPDATE produtos SET quantidade = quantidade - 1 WHERE id = ?', ['p2']);

    // Parte paga na hora
    await db.runAsync(
      `INSERT INTO movimentacoes (id, tipo, origem, data, valorTotal, descricao, itens, formaPagamento, dataVencimento, status, clienteNome, clienteCelular)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'venda-comb-paga',
        'entrada',
        'venda',
        Date.now(),
        pagoAgora,
        'Venda - 2 produtos [Pago: Dinheiro: R$ 50,00 + Crédito: R$ 70,00]',
        JSON.stringify({
          produtos: [
            { produtoId: 'p1', produtoNome: 'Camisa Polo Azul', quantidade: 1, precoVenda: 80 },
            { produtoId: 'p2', produtoNome: 'Calça Sarja Bege', quantidade: 1, precoVenda: 140 },
          ],
        }),
        'combinado',
        null,
        'confirmado',
        'Fernanda Oliveira',
        '(31) 98888-7777',
      ]
    );

    // Parte pendente a prazo
    await db.runAsync(
      `INSERT INTO movimentacoes (id, tipo, origem, data, valorTotal, descricao, itens, formaPagamento, dataVencimento, status, clienteNome, clienteCelular)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'venda-comb-pendente',
        'entrada',
        'venda',
        Date.now() + 1,
        pendentePrazo,
        'Venda - 2 produtos [Restante A Prazo: R$ 100,00]',
        JSON.stringify({
          produtos: [
            { produtoId: 'p1', produtoNome: 'Camisa Polo Azul', quantidade: 1, precoVenda: 80 },
            { produtoId: 'p2', produtoNome: 'Calça Sarja Bege', quantidade: 1, precoVenda: 140 },
          ],
        }),
        'a_prazo',
        vencimento,
        'pendente',
        'Fernanda Oliveira',
        '(31) 98888-7777',
      ]
    );

    const p1 = await db.getFirstAsync("SELECT quantidade FROM produtos WHERE id = 'p1'");
    const p2 = await db.getFirstAsync("SELECT quantidade FROM produtos WHERE id = 'p2'");
    assert.strictEqual(p1.quantidade, 19);
    assert.strictEqual(p2.quantidade, 9);
  });

  // 6. Pesquisa de compras por Nome do Cliente no Financeiro
  await runTest('6. Pesquisa no Financeiro pelo Nome do Cliente ("Fernanda")', async () => {
    const movs = await db.getAllAsync('SELECT * FROM movimentacoes ORDER BY data DESC');
    const termo = 'fernanda';
    const comprasCliente = movs.filter(
      (m) =>
        (m.clienteNome ?? '').toLowerCase().includes(termo) ||
        (m.clienteCelular ?? '').toLowerCase().includes(termo) ||
        (m.descricao ?? '').toLowerCase().includes(termo)
    );
    assert.strictEqual(comprasCliente.length, 2);
    const totalConfirmadoCliente = comprasCliente
      .filter((m) => m.status === 'confirmado')
      .reduce((acc, m) => acc + m.valorTotal, 0);
    const totalPendenteCliente = comprasCliente
      .filter((m) => m.status === 'pendente')
      .reduce((acc, m) => acc + m.valorTotal, 0);

    assert.strictEqual(totalConfirmadoCliente, 120);
    assert.strictEqual(totalPendenteCliente, 100);
  });

  // 7. Recebimento Parcial (Fração) de lançamento pendente
  await runTest('7. Recebimento Parcial (quitar R$ 40,00 de R$ 100,00 pendentes e manter R$ 60,00)', async () => {
    const itemPendente = await db.getFirstAsync(
      "SELECT * FROM movimentacoes WHERE id = 'venda-comb-pendente'"
    );
    assert.strictEqual(itemPendente.valorTotal, 100);

    const valorRecebido = 40;
    const saldoRestante = itemPendente.valorTotal - valorRecebido;
    const descLimpa = itemPendente.descricao.replace(/\s*\[.*\]$/, '');

    // Lança a fração recebida como confirmada
    await db.runAsync(
      `INSERT INTO movimentacoes (id, tipo, origem, data, valorTotal, descricao, itens, formaPagamento, dataVencimento, status, clienteNome, clienteCelular)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        'rec-parcial-1',
        itemPendente.tipo,
        itemPendente.origem,
        Date.now(),
        valorRecebido,
        `Recebimento parcial - ${descLimpa} [Dinheiro]`,
        itemPendente.itens,
        'dinheiro',
        null,
        'confirmado',
        itemPendente.clienteNome,
        itemPendente.clienteCelular,
      ]
    );

    // Atualiza o restante pendente
    await db.runAsync('UPDATE movimentacoes SET valorTotal = ?, descricao = ? WHERE id = ?', [
      saldoRestante,
      `${descLimpa} [Restante A Prazo: R$ 60,00]`,
      itemPendente.id,
    ]);

    const atualizado = await db.getFirstAsync(
      "SELECT * FROM movimentacoes WHERE id = 'venda-comb-pendente'"
    );
    assert.strictEqual(atualizado.valorTotal, 60);
    assert.strictEqual(atualizado.status, 'pendente');

    const movs = await db.getAllAsync("SELECT * FROM movimentacoes WHERE clienteNome = 'Fernanda Oliveira'");
    const totalEntradasConfirmadas = movs
      .filter((m) => m.status === 'confirmado')
      .reduce((acc, m) => acc + m.valorTotal, 0);
    assert.strictEqual(totalEntradasConfirmadas, 160); // 120 iniciais + 40 parciais
  });

  // 8. Quitação Total do saldo restante
  await runTest('8. Quitação Total do saldo restante (R$ 60,00 -> status Confirmado)', async () => {
    await db.runAsync(
      "UPDATE movimentacoes SET status = 'confirmado', formaPagamento = 'debito' WHERE id = 'venda-comb-pendente'"
    );
    const pendentes = await db.getAllAsync(
      "SELECT * FROM movimentacoes WHERE status = 'pendente'"
    );
    assert.strictEqual(pendentes.length, 0);
  });

  // 9. Edição de quantidade em estoque gerando Compra (adição) ou Devolução (retirada) pelo preço de compra
  await runTest('9. Edição de estoque: adicionar itens gera Compra e retirar itens gera Devolução pelo preço de compra', async () => {
    // Produto p3 (Boné Esportivo Preto): qtd atual = 4, precoCompra = 20
    const pAntes = await db.getFirstAsync("SELECT * FROM produtos WHERE id = 'p3'");
    assert.strictEqual(pAntes.quantidade, 4);
    assert.strictEqual(pAntes.precoCompra, 20);

    // Caso A: Editou quantidade de 4 para 9 (+5 un.) -> Compra de estoque de 5 * 20 = R$ 100,00 (saída)
    const novaQtdCompra = 9;
    const diffCompra = novaQtdCompra - pAntes.quantidade;
    await db.runAsync('UPDATE produtos SET quantidade = ? WHERE id = ?', [novaQtdCompra, 'p3']);
    await db.runAsync(
      'INSERT INTO movimentacoes (id, tipo, origem, data, valorTotal, descricao, itens, formaPagamento, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        'mov-edit-compra',
        'saida',
        'compra_estoque',
        Date.now(),
        diffCompra * pAntes.precoCompra,
        `Compra de estoque - ${pAntes.nome} (+${diffCompra} un.)`,
        JSON.stringify([{ produtoId: 'p3', produtoNome: pAntes.nome, quantidade: diffCompra, precoCompra: pAntes.precoCompra }]),
        'dinheiro',
        'confirmado',
      ]
    );

    const movCompra = await db.getFirstAsync("SELECT * FROM movimentacoes WHERE id = 'mov-edit-compra'");
    assert.strictEqual(movCompra.tipo, 'saida');
    assert.strictEqual(movCompra.valorTotal, 100);

    // Caso B: Editou quantidade de 9 para 6 (-3 un.) -> Devolução de estoque de 3 * 20 = R$ 60,00 (entrada)
    const novaQtdDevolucao = 6;
    const qtdRetirada = novaQtdCompra - novaQtdDevolucao;
    await db.runAsync('UPDATE produtos SET quantidade = ? WHERE id = ?', [novaQtdDevolucao, 'p3']);
    await db.runAsync(
      'INSERT INTO movimentacoes (id, tipo, origem, data, valorTotal, descricao, itens, formaPagamento, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        'mov-edit-devolucao',
        'entrada',
        'devolucao_estoque',
        Date.now(),
        qtdRetirada * pAntes.precoCompra,
        `Devolução de estoque - ${pAntes.nome} (-${qtdRetirada} un.)`,
        JSON.stringify([{ produtoId: 'p3', produtoNome: pAntes.nome, quantidade: qtdRetirada, precoCompra: pAntes.precoCompra }]),
        'dinheiro',
        'confirmado',
      ]
    );

    const movDev = await db.getFirstAsync("SELECT * FROM movimentacoes WHERE id = 'mov-edit-devolucao'");
    assert.strictEqual(movDev.tipo, 'entrada');
    assert.strictEqual(movDev.origem, 'devolucao_estoque');
    assert.strictEqual(movDev.valorTotal, 60);
  });

  // 10. Verificação dos artefatos de build, ausência de BOM (EF BB BF) e pacotes ZIP
  await runTest('10. Verificação do package.json sem UTF-8 BOM (0x7B) e pacotes .zip', async () => {
    const stagePkg = 'D:/GM/recovery-tools/asar_stage/package.json';
    if (fs.existsSync(stagePkg)) {
      const buf = fs.readFileSync(stagePkg);
      assert.strictEqual(
        buf[0],
        0x7b,
        `package.json dentro do app.asar contém BOM (primeiro byte 0x${buf[0].toString(16)})!`
      );
    }
    const requiredPaths = [
      'D:/GM/Projeto2026-src/dist/index.html',
      'D:/GM/Projeto2026-Portable-x64/Projeto2026.exe',
      'D:/GM/Projeto2026-Portable-x64/resources/app.asar',
      'D:/GM/Projeto2026-Portable-x64.zip',
      'D:/GM/Projeto2026-Atualizacao-Rapida-asar.zip',
    ];
    for (const p of requiredPaths) {
      assert.ok(fs.existsSync(p), `Arquivo não encontrado: ${p}`);
      const stat = fs.statSync(p);
      assert.ok(stat.size > 1000, `Arquivo vazio ou corrompido: ${p}`);
    }
  });

  console.log(`\n${CYAN}----------------------------------------------------------------${RESET}`);
  if (failed === 0) {
    console.log(`${GREEN}RESULTADO FINAL: ${passed}/${passed} TESTES PASSARAM COM SUCESSO!${RESET}`);
  } else {
    console.log(`${YELLOW}RESULTADO FINAL: ${passed} passaram, ${RED}${failed} falharam.${RESET}`);
    process.exitCode = 1;
  }
  console.log(`${CYAN}----------------------------------------------------------------${RESET}\n`);
}

main();
