import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useSQLiteContext } from 'expo-sqlite';
import * as Crypto from 'expo-crypto';
import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

function parseDecimal(value: string) {
  const trimmed = value.trim();
  const normalized = trimmed.includes(',')
    ? trimmed.replace(/\./g, '').replace(',', '.')
    : trimmed;
  return parseFloat(normalized);
}

function parseDateBR(dateStr: string): Date | null {
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const year = parseInt(parts[2], 10);
    const d = new Date(year, month, day, 23, 59, 59, 999);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

type FormaPagamento = 'dinheiro' | 'debito' | 'credito' | 'a_prazo';

interface Produto {
  id: string;
  nome: string;
  preco: number;
  quantidade: number;
  codigoBarras?: string;
  tipo?: string;
}

interface ItemComanda {
  produtoId: string;
  produtoNome: string;
  quantidade: number;
  precoVenda: number;
}

interface MesaData {
  id: string;
  numero: string;
  nomeMesa?: string;
  clienteNome?: string;
  clienteCelular?: string;
  status: string; // 'ocupada'
  abertaEm: number;
  itens: string; // JSON string of ItemComanda[]
}

const FORMAS_PAGAMENTO: {
  key: FormaPagamento;
  label: string;
  icon: any;
  color: string;
  bg: string;
}[] = [
  { key: 'dinheiro', label: 'Dinheiro',  icon: 'cash-outline',        color: '#16A34A', bg: '#F0FDF4' },
  { key: 'debito',   label: 'Débito',    icon: 'card-outline',        color: '#2563EB', bg: '#EFF6FF' },
  { key: 'credito',  label: 'Crédito',   icon: 'card',                color: '#7C3AED', bg: '#F5F3FF' },
  { key: 'a_prazo',  label: 'A Prazo',   icon: 'calendar-outline',    color: '#D97706', bg: '#FFFBEB' },
];

export default function Mesas() {
  const db = useSQLiteContext();

  const [mesas, setMesas] = useState<MesaData[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal Abrir Nova Mesa
  const [modalNovaMesa, setModalNovaMesa] = useState(false);
  const [numeroMesaInput, setNumeroMesaInput] = useState('');
  const [clienteNomeInput, setClienteNomeInput] = useState('');
  const [clienteCelularInput, setClienteCelularInput] = useState('');
  const [criandoMesa, setCriandoMesa] = useState(false);

  // Mesa Selecionada / Comanda
  const [mesaAtiva, setMesaAtiva] = useState<MesaData | null>(null);
  const [modalComanda, setModalComanda] = useState(false);

  // Adicionar produto à comanda
  const [modalAddProduto, setModalAddProduto] = useState(false);
  const [produtosDisponiveis, setProdutosDisponiveis] = useState<Produto[]>([]);
  const [buscaProduto, setBuscaProduto] = useState('');
  const [loadingProdutos, setLoadingProdutos] = useState(false);

  // Modal Confirmar Fechamento
  const [modalFecharConta, setModalFecharConta] = useState(false);
  const [desconto, setDesconto] = useState('');
  const [finalizandoConta, setFinalizandoConta] = useState(false);

  // Scanner
  const [scannerVisible, setScannerVisible] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const isProcessingScan = useRef(false);

  // Ref para evitar re-criação de carregarMesas a cada mudança de mesaAtiva
  const mesaAtivaRef = useRef(mesaAtiva);
  mesaAtivaRef.current = mesaAtiva;

  // Carregar Mesas
  const carregarMesas = useCallback(async () => {
    setLoading(true);
    try {
      const lista = await db.getAllAsync<MesaData>(
        "SELECT * FROM mesas WHERE status = 'ocupada' ORDER BY abertaEm ASC"
      );
      setMesas(lista);
      const ativa = mesaAtivaRef.current;
      if (ativa) {
        const atualizada = lista.find((m) => m.id === ativa.id);
        if (atualizada) setMesaAtiva(atualizada);
      }
    } catch (e) {
      console.log('Erro ao carregar mesas:', e);
    } finally {
      setLoading(false);
    }
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      carregarMesas();
    }, [carregarMesas])
  );

  // Carregar Produtos para Seleção
  const carregarProdutos = async () => {
    setLoadingProdutos(true);
    try {
      const list = await db.getAllAsync<Produto>('SELECT * FROM produtos WHERE tipo != \'insumo\' ORDER BY nome ASC');
      setProdutosDisponiveis(list);
    } catch (e) {
      console.log('Erro ao carregar produtos:', e);
    } finally {
      setLoadingProdutos(false);
    }
  };

  // 1. Criar / Abrir Nova Mesa
  const handleCriarMesa = async () => {
    if (!numeroMesaInput.trim()) {
      Alert.alert('Atenção', 'Informe a identificação ou número da mesa.');
      return;
    }

    setCriandoMesa(true);
    try {
      const id = Crypto.randomUUID();
      const num = numeroMesaInput.trim();
      const cliente = clienteNomeInput.trim() || null;
      const cel = clienteCelularInput.trim() || null;
      const agora = Date.now();

      await db.runAsync(
        `INSERT INTO mesas (id, numero, nomeMesa, clienteNome, clienteCelular, status, abertaEm, itens)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, num, `Mesa ${num}`, cliente, cel, 'ocupada', agora, JSON.stringify([])]
      );

      setModalNovaMesa(false);
      setNumeroMesaInput('');
      setClienteNomeInput('');
      setClienteCelularInput('');

      await carregarMesas();
    } catch (e: any) {
      console.log('Erro ao criar mesa:', e);
      Alert.alert('Erro', 'Não foi possível abrir a mesa.');
    } finally {
      setCriandoMesa(false);
    }
  };

  // Helper: Itens da mesa ativa
  const getItensMesaAtiva = (): ItemComanda[] => {
    if (!mesaAtiva || !mesaAtiva.itens) return [];
    try {
      return JSON.parse(mesaAtiva.itens);
    } catch {
      return [];
    }
  };

  // 2. Adicionar Item à Comanda
  const handleAdicionarItem = async (prod: Produto) => {
    if (!mesaAtiva) return;

    if (prod.tipo !== 'produto_sem_estoque' && prod.quantidade <= 0) {
      Alert.alert('Sem estoque', `O produto "${prod.nome}" está sem estoque.`);
      return;
    }

    const itens = getItensMesaAtiva();
    const index = itens.findIndex((i) => i.produtoId === prod.id);

    if (index >= 0) {
      if (prod.tipo !== 'produto_sem_estoque' && itens[index].quantidade >= prod.quantidade) {
        Alert.alert('Atenção', `Estoque máximo disponível: ${prod.quantidade}`);
        return;
      }
      itens[index].quantidade += 1;
    } else {
      itens.push({
        produtoId: prod.id,
        produtoNome: prod.nome,
        quantidade: 1,
        precoVenda: prod.preco,
      });
    }

    const novoJson = JSON.stringify(itens);

    try {
      await db.runAsync('UPDATE mesas SET itens = ? WHERE id = ?', [novoJson, mesaAtiva.id]);
      setMesaAtiva({ ...mesaAtiva, itens: novoJson });
      await carregarMesas();
    } catch (e) {
      console.log('Erro ao salvar item na mesa:', e);
      Alert.alert('Erro', 'Falha ao adicionar item à mesa.');
    }
  };

  // 3. Alterar Quantidade na Comanda
  const handleAlterarQtdItem = async (produtoId: string, delta: number) => {
    if (!mesaAtiva) return;

    const itens = getItensMesaAtiva();
    const index = itens.findIndex((i) => i.produtoId === produtoId);
    if (index < 0) return;

    // Verificar estoque atual no DB
    if (delta > 0) {
      const prodDb = await db.getFirstAsync<{ quantidade: number, tipo?: string }>('SELECT quantidade, tipo FROM produtos WHERE id = ?', [produtoId]);
      if (prodDb && prodDb.tipo !== 'produto_sem_estoque' && itens[index].quantidade + delta > prodDb.quantidade) {
        Alert.alert('Atenção', `Estoque máximo disponível: ${prodDb.quantidade}`);
        return;
      }
    }

    itens[index].quantidade += delta;

    let novosItens = itens;
    if (itens[index].quantidade <= 0) {
      novosItens = itens.filter((i) => i.produtoId !== produtoId);
    }

    const novoJson = JSON.stringify(novosItens);

    try {
      await db.runAsync('UPDATE mesas SET itens = ? WHERE id = ?', [novoJson, mesaAtiva.id]);
      setMesaAtiva({ ...mesaAtiva, itens: novoJson });
      await carregarMesas();
    } catch (e) {
      console.log('Erro ao atualizar quantidade:', e);
    }
  };

  // 4. Remover Item da Comanda
  const handleRemoverItem = async (produtoId: string) => {
    if (!mesaAtiva) return;

    const itens = getItensMesaAtiva();
    const novosItens = itens.filter((i) => i.produtoId !== produtoId);
    const novoJson = JSON.stringify(novosItens);

    try {
      await db.runAsync('UPDATE mesas SET itens = ? WHERE id = ?', [novoJson, mesaAtiva.id]);
      setMesaAtiva({ ...mesaAtiva, itens: novoJson });
      await carregarMesas();
    } catch (e) {
      console.log('Erro ao remover item:', e);
    }
  };

  // Cancelar Mesa
  const handleCancelarMesa = () => {
    if (!mesaAtiva) return;

    Alert.alert(
      'Cancelar Mesa?',
      'Todos os itens serão removidos e nenhum valor será cobrado. Esta ação não pode ser desfeita.',
      [
        { text: 'Não', style: 'cancel' },
        {
          text: 'Sim, Cancelar',
          style: 'destructive',
          onPress: async () => {
            try {
              await db.runAsync('DELETE FROM mesas WHERE id = ?', [mesaAtiva.id]);
              setModalComanda(false);
              setMesaAtiva(null);
              await carregarMesas();
            } catch (e) {
              console.log('Erro ao cancelar mesa:', e);
              Alert.alert('Erro', 'Não foi possível cancelar a mesa.');
            }
          },
        },
      ]
    );
  };

  // 5. Finalizar / Fechar Conta da Mesa e Limpar
  const handleExecutarFechamento = async (
    forma: FormaPagamento,
    prazoTs: number | null,
    clienteNome?: string,
    clienteCelular?: string
  ) => {
    if (!mesaAtiva) return;

    const itens = getItensMesaAtiva();
    if (itens.length === 0) {
      Alert.alert('Atenção', 'A mesa não possui nenhum item consumido.');
      return;
    }

    setFinalizandoConta(true);

    try {
      await db.execAsync('BEGIN TRANSACTION');

      // Validar estoque atual
      for (const item of itens) {
        const pData = await db.getFirstAsync<{ quantidade: number; nome: string; tipo?: string }>(
          'SELECT quantidade, nome, tipo FROM produtos WHERE id = ?',
          [item.produtoId]
        );
        if (!pData) {
          throw new Error(`Produto "${item.produtoNome}" não encontrado no estoque.`);
        }
        if (pData.tipo !== 'produto_sem_estoque' && pData.quantidade < item.quantidade) {
          throw new Error(`"${pData.nome}" tem apenas ${pData.quantidade} unidade(s) disponível(is).`);
        }
      }

      // Baixa no estoque
      for (const item of itens) {
        const pData = await db.getFirstAsync<{ tipo?: string }>(
          'SELECT tipo FROM produtos WHERE id = ?',
          [item.produtoId]
        );
        if (pData?.tipo !== 'produto_sem_estoque') {
          await db.runAsync(
            'UPDATE produtos SET quantidade = quantidade - ? WHERE id = ?',
            [item.quantidade, item.produtoId]
          );
        }
      }

      // Calcular totais e descontos
      const totalBruto = itens.reduce((acc, i) => acc + i.precoVenda * i.quantidade, 0);
      const descNum = parseDecimal(desconto);
      const descValido = !isNaN(descNum) && descNum >= 0 ? descNum : 0;
      const valorDesconto = (totalBruto * descValido) / 100;
      const totalFinal = Math.max(0, totalBruto - valorDesconto);

      // Nome do Cliente final
      const nomeClienteFinal = clienteNome || mesaAtiva.clienteNome || undefined;
      const celClienteFinal = clienteCelular || mesaAtiva.clienteCelular || undefined;

      const formaLabel: Record<FormaPagamento, string> = {
        dinheiro: 'Dinheiro',
        debito:   'Débito',
        credito:  'Crédito',
        a_prazo:  'A Prazo',
      };

      let descText = `Venda Mesa ${mesaAtiva.numero}`;
      if (nomeClienteFinal) descText += ` (${nomeClienteFinal})`;
      if (descValido > 0) descText += ` [Desc. ${descValido}%]`;
      descText += ` [${formaLabel[forma]}]`;

      const status = forma === 'a_prazo' ? 'pendente' : 'confirmado';

      const payloadItens = {
        mesaNumero: mesaAtiva.numero,
        clienteNome: nomeClienteFinal,
        descontoPercentual: descValido,
        valorDesconto,
        totalBruto,
        formaPagamento: forma,
        dataVencimento: prazoTs,
        produtos: itens.map((i) => ({
          produtoId: i.produtoId,
          produtoNome: i.produtoNome,
          quantidade: i.quantidade,
          precoVenda: i.precoVenda,
        })),
      };

      // Inserir registro financeiro permanente
      await db.runAsync(
        `INSERT INTO movimentacoes (id, tipo, origem, data, valorTotal, descricao, itens, formaPagamento, dataVencimento, status, clienteNome, clienteCelular)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          Crypto.randomUUID(),
          'entrada',
          'venda_mesa',
          Date.now(),
          totalFinal,
          descText,
          JSON.stringify(payloadItens),
          forma,
          prazoTs,
          status,
          nomeClienteFinal || null,
          celClienteFinal || null,
        ]
      );

      // LIMPEZA DA MESA: Remove o registro da mesa aberta
      await db.runAsync('DELETE FROM mesas WHERE id = ?', [mesaAtiva.id]);

      await db.execAsync('COMMIT');

      setModalFecharConta(false);
      setModalComanda(false);
      setMesaAtiva(null);
      setDesconto('');

      await carregarMesas();

      Alert.alert(
        'Mesa Encerrada e Limpa! 🎉',
        `Mesa ${mesaAtiva.numero} foi fechada com sucesso.\nTotal: R$ ${totalFinal.toFixed(2).replace('.', ',')}\n\nA mesa está livre novamente e o lançamento foi gravado no Financeiro.`,
        [{ text: 'OK' }]
      );
    } catch (e: any) {
      await db.execAsync('ROLLBACK');
      console.log('Erro ao fechar conta da mesa:', e);
      Alert.alert('Erro', e?.message ?? 'Não foi possível fechar a mesa.');
    } finally {
      setFinalizandoConta(false);
    }
  };

  // Scanner de código de barras para comanda
  const handleOpenScanner = async () => {
    if (!permission?.granted) {
      const resp = await requestPermission();
      if (!resp.granted) {
        Alert.alert('Permissão necessária', 'Conceda acesso à câmera para usar o leitor de código de barras.');
        return;
      }
    }
    setScannerVisible(true);
  };

  const handleBarcodeScanned = async ({ data }: { data: string }) => {
    if (isProcessingScan.current) return;
    isProcessingScan.current = true;

    try {
      const prod = await db.getFirstAsync<Produto>(
        'SELECT * FROM produtos WHERE codigoBarras = ? LIMIT 1',
        [data]
      );

      if (!prod) {
        Alert.alert('Não encontrado', 'Nenhum produto cadastrado com este código.');
        setTimeout(() => { isProcessingScan.current = false; }, 2000);
      } else if (prod.tipo === 'insumo') {
        Alert.alert('Insumo registrado', 'Insumos são ingredientes/matéria-prima e não podem ser vendidos em comanda.');
        setTimeout(() => { isProcessingScan.current = false; }, 2000);
      } else {
        await handleAdicionarItem(prod);
        setScannerVisible(false);
        setTimeout(() => { isProcessingScan.current = false; }, 500);
      }
    } catch (e) {
      console.log('Erro scanner:', e);
      setTimeout(() => { isProcessingScan.current = false; }, 2000);
    }
  };

  // RENDERIZAÇÃO DAS MESAS — CARDS COMPACTOS COM ÍCONE
  const renderMesaCard = useCallback(({ item }: { item: MesaData }) => {
    let qtdItens = 0;
    try {
      const arr = JSON.parse(item.itens) as ItemComanda[];
      qtdItens = arr.reduce((acc, i) => acc + i.quantidade, 0);
    } catch {}

    return (
      <TouchableOpacity
        style={styles.mesaCard}
        onPress={() => {
          setMesaAtiva(item);
          setModalComanda(true);
        }}
        activeOpacity={0.7}
      >
        {/* Badge de itens */}
        {qtdItens > 0 && (
          <View style={styles.mesaBadge}>
            <Text style={styles.mesaBadgeText}>{qtdItens}</Text>
          </View>
        )}

        {/* Ícone */}
        <View style={styles.mesaIconCircle}>
          <Ionicons name="restaurant" size={18} color="#DC2626" />
        </View>

        {/* Número */}
        <Text style={styles.mesaNumero}>{item.numero}</Text>

        {/* Cliente (se houver) */}
        {item.clienteNome ? (
          <Text style={styles.mesaCliente} numberOfLines={1}>{item.clienteNome}</Text>
        ) : (
          <Text style={styles.mesaStatusText}>Aberta</Text>
        )}
      </TouchableOpacity>
    );
  }, []);

  const itensAtivos = useMemo(() => getItensMesaAtiva(), [mesaAtiva?.itens]);
  const totalMesaAtiva = useMemo(
    () => itensAtivos.reduce((acc, i) => acc + i.precoVenda * i.quantidade, 0),
    [itensAtivos]
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.topBar}>
        <View style={{ flex: 1 }}>
          <Text style={styles.topBarTitle}>🍽️ Mesas</Text>
          <Text style={styles.topBarSubtitle}>
            {mesas.length} {mesas.length === 1 ? 'mesa aberta' : 'mesas abertas'}
          </Text>
        </View>

        <TouchableOpacity
          style={styles.btnNovaMesa}
          onPress={() => setModalNovaMesa(true)}
        >
          <Ionicons name="add" size={20} color="#FFF" />
          <Text style={styles.btnNovaMesaText}>Nova Mesa</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#DC2626" />
        </View>
      ) : mesas.length === 0 ? (
        <View style={styles.emptyContainer}>
          <View style={styles.emptyIconCircle}>
            <Ionicons name="restaurant-outline" size={40} color="#DC2626" />
          </View>
          <Text style={styles.emptyTitle}>Nenhuma mesa aberta</Text>
          <Text style={styles.emptySub}>
            Toque no botão abaixo para iniciar{"\n"}o atendimento de um novo cliente
          </Text>
          <TouchableOpacity
            style={[styles.btnNovaMesa, { marginTop: 24, paddingHorizontal: 20, paddingVertical: 12 }]}
            onPress={() => setModalNovaMesa(true)}
          >
            <Ionicons name="add-circle-outline" size={20} color="#FFF" />
            <Text style={styles.btnNovaMesaText}>Abrir Nova Mesa</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          key="grid-4-col-mesas"
          data={mesas}
          keyExtractor={(item) => item.id}
          renderItem={renderMesaCard}
          numColumns={4}
          columnWrapperStyle={styles.gridColumnWrapper}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* ── Modal 1: Abrir Nova Mesa ── */}
      <Modal visible={modalNovaMesa} transparent animationType="fade" onRequestClose={() => setModalNovaMesa(false)}>
        <View style={styles.modalOverlayCenter}>
          <View style={styles.modalCardCenter}>
            <View style={styles.modalCardHeader}>
              <Ionicons name="restaurant-outline" size={22} color="#1F2024" />
              <Text style={styles.modalCardTitle}>Abrir Atendimento de Mesa</Text>
            </View>

            <Text style={styles.inputLabel}>Número ou Nome da Mesa *</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Ex: 1, 02, Mesa da Janela"
              placeholderTextColor="#9CA3AF"
              value={numeroMesaInput}
              onChangeText={setNumeroMesaInput}
              keyboardType="default"
              autoFocus
            />

            <Text style={styles.inputLabel}>Nome do Cliente (Opcional)</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Ex: Carlos Silva"
              placeholderTextColor="#9CA3AF"
              value={clienteNomeInput}
              onChangeText={setClienteNomeInput}
            />

            <Text style={styles.inputLabel}>Celular do Cliente (Opcional)</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Ex: (11) 99999-9999"
              placeholderTextColor="#9CA3AF"
              value={clienteCelularInput}
              onChangeText={setClienteCelularInput}
              keyboardType="phone-pad"
            />

            <View style={styles.modalCenterBtns}>
              <TouchableOpacity
                style={styles.btnSecondary}
                onPress={() => setModalNovaMesa(false)}
                disabled={criandoMesa}
              >
                <Text style={styles.btnSecondaryText}>Cancelar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.btnPrimary, criandoMesa && { opacity: 0.6 }]}
                onPress={handleCriarMesa}
                disabled={criandoMesa}
              >
                {criandoMesa ? (
                  <ActivityIndicator color="#FFF" size="small" />
                ) : (
                  <Text style={styles.btnPrimaryText}>Abrir Mesa</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Modal 2: Comanda da Mesa ── */}
      <Modal visible={modalComanda} animationType="slide" onRequestClose={() => setModalComanda(false)}>
        <View style={styles.fullScreenModal}>
          {/* Header */}
          <View style={styles.comandaHeader}>
            <TouchableOpacity onPress={() => setModalComanda(false)} style={styles.backBtn}>
              <Ionicons name="close-circle-outline" size={32} color="#1F2024" />
            </TouchableOpacity>
            <View style={{ alignItems: 'center' }}>
              <Text style={styles.comandaTitle}>Comanda - Mesa {mesaAtiva?.numero}</Text>
              {mesaAtiva?.clienteNome ? (
                <Text style={styles.comandaClienteSub}>Cliente: {mesaAtiva.clienteNome}</Text>
              ) : (
                <Text style={styles.comandaClienteSub}>Em consumo</Text>
              )}
            </View>
            <TouchableOpacity onPress={handleOpenScanner} style={styles.backBtn}>
              <Ionicons name="barcode-outline" size={26} color="#1F2024" />
            </TouchableOpacity>
          </View>

          {/* Lista de Itens consumidos */}
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
            {itensAtivos.length === 0 ? (
              <View style={styles.emptyComanda}>
                <Ionicons name="fast-food-outline" size={48} color="#9CA3AF" style={{ marginBottom: 8 }} />
                <Text style={styles.emptyComandaText}>Nenhum item adicionado ainda</Text>
                <Text style={styles.emptyComandaSub}>
                  Toque em + Adicionar Produto abaixo para registrar o pedido da mesa
                </Text>
              </View>
            ) : (
              <>
                {itensAtivos.map((item) => (
                  <View key={item.produtoId} style={styles.comandaCardItem}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.comandaItemNome}>{item.produtoNome}</Text>
                      <Text style={styles.comandaItemPreco}>
                        R$ {item.precoVenda.toFixed(2).replace('.', ',')} un.
                      </Text>
                    </View>

                    <View style={styles.qtyRow}>
                      <Pressable onPress={() => handleAlterarQtdItem(item.produtoId, -1)} style={styles.qtyBtn}>
                        <Ionicons name="remove" size={16} color="#1F2024" />
                      </Pressable>
                      <Text style={styles.qtyNum}>{item.quantidade}</Text>
                      <Pressable onPress={() => handleAlterarQtdItem(item.produtoId, +1)} style={styles.qtyBtn}>
                        <Ionicons name="add" size={16} color="#1F2024" />
                      </Pressable>
                    </View>

                    <Text style={styles.comandaItemSubtotal}>
                      R$ {(item.precoVenda * item.quantidade).toFixed(2).replace('.', ',')}
                    </Text>

                    <Pressable onPress={() => handleRemoverItem(item.produtoId)} style={{ padding: 6, marginLeft: 6 }}>
                      <Ionicons name="trash-outline" size={18} color="#DC2626" />
                    </Pressable>
                  </View>
                ))}

                <View style={styles.comandaTotalRow}>
                  <Text style={styles.comandaTotalLabel}>Subtotal Consumido</Text>
                  <Text style={styles.comandaTotalVal}>
                    R$ {totalMesaAtiva.toFixed(2).replace('.', ',')}
                  </Text>
                </View>
              </>
            )}
          </ScrollView>

          {/* Adicionar Produto Manual */}
          <View style={styles.addSection}>
            <TouchableOpacity
              style={styles.addManualBtn}
              onPress={() => {
                carregarProdutos();
                setModalAddProduto(true);
              }}
            >
              <Ionicons name="add-circle" size={26} color="#1F2024" />
              <Text style={styles.addManualText}>Adicionar produto à mesa</Text>
            </TouchableOpacity>
          </View>

          {/* Rodapé com botão Fechar Mesa */}
          <View style={styles.comandaFooter}>
            <TouchableOpacity
              style={[
                styles.btnFecharMesa,
                itensAtivos.length === 0 && { backgroundColor: '#9CA3AF', opacity: 0.7 },
              ]}
              onPress={() => {
                if (itensAtivos.length === 0) {
                  Alert.alert('Atenção', 'Adicione produtos antes de fechar a mesa.');
                  return;
                }
                setModalFecharConta(true);
              }}
              disabled={itensAtivos.length === 0}
            >
              <Ionicons name="checkmark-done-circle-outline" size={22} color="#FFF" />
              <Text style={styles.btnFecharMesaText}>Fechar Mesa / Receber</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.btnCancelarMesa}
              onPress={handleCancelarMesa}
            >
              <Ionicons name="close-circle-outline" size={22} color="#DC2626" />
              <Text style={styles.btnCancelarMesaText}>Cancelar Mesa</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Modal 3: Adicionar Produto à Comanda ── */}
      <Modal visible={modalAddProduto} animationType="slide" transparent onRequestClose={() => setModalAddProduto(false)}>
        <View style={styles.modalOverlaySheet}>
          <View style={styles.modalSheetContent}>
            <View style={styles.modalSheetHeader}>
              <Text style={styles.modalSheetTitle}>Adicionar ao Pedido da Mesa</Text>
              <TouchableOpacity onPress={() => setModalAddProduto(false)}>
                <Ionicons name="close" size={22} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <View style={styles.searchBox}>
              <Ionicons name="search" size={18} color="#9CA3AF" style={{ marginRight: 8 }} />
              <TextInput
                style={styles.searchInput}
                placeholder="Buscar item no cardápio..."
                placeholderTextColor="#9CA3AF"
                value={buscaProduto}
                onChangeText={setBuscaProduto}
              />
            </View>

            {loadingProdutos ? (
              <ActivityIndicator size="large" color="#1F2024" style={{ marginTop: 24 }} />
            ) : (
              <FlatList
                data={produtosDisponiveis.filter((p) =>
                  p.nome.toLowerCase().includes(buscaProduto.toLowerCase().trim())
                )}
                keyExtractor={(item) => item.id}
                showsVerticalScrollIndicator={false}
                renderItem={({ item }) => {
                  const semEstoque = item.tipo !== 'produto_sem_estoque' && item.quantidade <= 0;
                  return (
                    <TouchableOpacity
                      style={[styles.produtoRow, semEstoque && { opacity: 0.5 }]}
                      disabled={semEstoque}
                      onPress={() => {
                        handleAdicionarItem(item);
                        setModalAddProduto(false);
                      }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.produtoNome}>{item.nome}</Text>
                        <Text style={styles.produtoPreco}>
                          R$ {item.preco.toFixed(2).replace('.', ',')}
                        </Text>
                      </View>

                      <View style={[styles.tagEstoque, semEstoque && styles.tagEstoqueZero]}>
                        <Text style={[styles.tagEstoqueText, semEstoque && { color: '#DC2626' }]}>
                          {semEstoque ? 'Sem estoque' : `${item.quantidade} dispon.`}
                        </Text>
                      </View>

                      {!semEstoque && (
                        <Ionicons name="add-circle" size={26} color="#1F2024" style={{ marginLeft: 8 }} />
                      )}
                    </TouchableOpacity>
                  );
                }}
              />
            )}
          </View>
        </View>
      </Modal>

      {/* ── Modal 4: Confirmar Pagamento & Fechamento ── */}
      <ModalFecharMesaConta
        visible={modalFecharConta}
        mesaNumero={mesaAtiva?.numero ?? ''}
        itens={itensAtivos}
        total={totalMesaAtiva}
        desconto={desconto}
        setDesconto={setDesconto}
        finalizando={finalizandoConta}
        clienteNomePadrao={mesaAtiva?.clienteNome ?? ''}
        clienteCelularPadrao={mesaAtiva?.clienteCelular ?? ''}
        onCancelar={() => setModalFecharConta(false)}
        onConfirmar={handleExecutarFechamento}
      />

      {/* Scanner Modal */}
      <Modal visible={scannerVisible} animationType="slide" onRequestClose={() => setScannerVisible(false)}>
        <View style={styles.scannerContainer}>
          <View style={styles.scannerHeader}>
            <TouchableOpacity onPress={() => setScannerVisible(false)} style={styles.scannerCloseBtn}>
              <Ionicons name="close" size={24} color="#FFF" />
            </TouchableOpacity>
            <Text style={styles.scannerTitle}>Escanear Item para a Mesa</Text>
            <View style={{ width: 40 }} />
          </View>
          {scannerVisible && (
            <CameraView
              style={StyleSheet.absoluteFillObject}
              facing="back"
              onBarcodeScanned={handleBarcodeScanned}
              barcodeScannerSettings={{
                barcodeTypes: ['qr', 'ean13', 'ean8', 'code128', 'code39', 'upc_a', 'upc_e'],
              }}
            />
          )}
        </View>
      </Modal>
    </View>
  );
}

// Modal Component de Fechamento da Mesa
function ModalFecharMesaConta({
  visible,
  mesaNumero,
  itens,
  total,
  desconto,
  setDesconto,
  finalizando,
  clienteNomePadrao,
  clienteCelularPadrao,
  onCancelar,
  onConfirmar,
}: {
  visible: boolean;
  mesaNumero: string;
  itens: ItemComanda[];
  total: number;
  desconto: string;
  setDesconto: (v: string) => void;
  finalizando: boolean;
  clienteNomePadrao: string;
  clienteCelularPadrao: string;
  onCancelar: () => void;
  onConfirmar: (forma: FormaPagamento, prazoTs: number | null, clienteNome?: string, clienteCelular?: string) => void;
}) {
  const descontoNum = parseDecimal(desconto);
  const descontoValido = !isNaN(descontoNum) && descontoNum >= 0 ? descontoNum : 0;
  const valorDesconto = (total * descontoValido) / 100;
  const totalFinal = Math.max(0, total - valorDesconto);

  const [forma, setForma] = useState<FormaPagamento>('dinheiro');
  const [prazoStr, setPrazoStr] = useState('');
  const [clienteNome, setClienteNome] = useState(clienteNomePadrao);
  const [clienteCelular, setClienteCelular] = useState(clienteCelularPadrao);

  useEffect(() => {
    if (visible) {
      setClienteNome(clienteNomePadrao);
      setClienteCelular(clienteCelularPadrao);
    } else {
      setForma('dinheiro');
      setPrazoStr('');
    }
  }, [visible, clienteNomePadrao, clienteCelularPadrao]);

  const handleConfirmar = () => {
    let prazoTs: number | null = null;
    if (forma === 'a_prazo') {
      if (!prazoStr.trim()) {
        Alert.alert('Atenção', 'Informe a data de vencimento (DD/MM/AAAA).');
        return;
      }
      const d = parseDateBR(prazoStr);
      if (!d) {
        Alert.alert('Atenção', 'Data inválida. Use o formato DD/MM/AAAA.');
        return;
      }
      prazoTs = d.getTime();
    }
    onConfirmar(forma, prazoTs, clienteNome.trim() || undefined, clienteCelular.trim() || undefined);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancelar}>
      <View style={styles.confirmOverlay}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}>
          <View style={styles.confirmBox}>
            <Text style={styles.confirmTitle}>Encerrar Mesa {mesaNumero}</Text>

            <View style={styles.confirmList}>
              {itens.map((item) => (
                <View key={item.produtoId} style={styles.confirmItem}>
                  <Text style={styles.confirmItemNome} numberOfLines={1}>
                    {item.produtoNome}
                  </Text>
                  <Text style={styles.confirmItemQtd}>x{item.quantidade}</Text>
                  <Text style={styles.confirmItemVal}>
                    R$ {(item.precoVenda * item.quantidade).toFixed(2).replace('.', ',')}
                  </Text>
                </View>
              ))}
            </View>

            <View style={styles.confirmDescontoRow}>
              <Text style={styles.confirmTotalLabel}>Desconto (%)</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                {valorDesconto > 0 && (
                  <Text style={styles.confirmDescontoVal}>
                    - R$ {valorDesconto.toFixed(2).replace('.', ',')}
                  </Text>
                )}
                <TextInput
                  style={styles.confirmDescontoInput}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  value={desconto}
                  onChangeText={setDesconto}
                />
              </View>
            </View>

            <View style={styles.confirmTotalRow}>
              <Text style={styles.confirmTotalLabel}>Total da Conta</Text>
              <Text style={styles.confirmTotalVal}>
                R$ {totalFinal.toFixed(2).replace('.', ',')}
              </Text>
            </View>

            <Text style={styles.pagamentoLabel}>Forma de Pagamento</Text>
            <View style={styles.pagamentoGrid}>
              {FORMAS_PAGAMENTO.map((fp) => {
                const selected = forma === fp.key;
                return (
                  <TouchableOpacity
                    key={fp.key}
                    style={[
                      styles.pagamentoBtn,
                      { borderColor: selected ? fp.color : '#E5E7EB', backgroundColor: selected ? fp.bg : '#F9FAFB' },
                    ]}
                    onPress={() => setForma(fp.key)}
                  >
                    <Ionicons name={fp.icon} size={20} color={selected ? fp.color : '#9CA3AF'} />
                    <Text style={[styles.pagamentoBtnText, { color: selected ? fp.color : '#6B7280' }]}>
                      {fp.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {forma === 'a_prazo' && (
              <View style={styles.prazoContainer}>
                <Ionicons name="calendar-outline" size={18} color="#D97706" />
                <TextInput
                  style={styles.prazoInput}
                  placeholder="Vencimento DD/MM/AAAA"
                  placeholderTextColor="#9CA3AF"
                  value={prazoStr}
                  onChangeText={(v) => {
                    const digits = v.replace(/\D/g, '');
                    let formatted = digits;
                    if (digits.length > 2) formatted = digits.slice(0, 2) + '/' + digits.slice(2);
                    if (digits.length > 4) formatted = digits.slice(0, 2) + '/' + digits.slice(2, 4) + '/' + digits.slice(4, 8);
                    setPrazoStr(formatted);
                  }}
                  keyboardType="numeric"
                  maxLength={10}
                />
              </View>
            )}

            <View style={{ marginTop: 12, gap: 10 }}>
              <View style={styles.clienteInputContainer}>
                <Ionicons name="person-outline" size={18} color="#4B5563" />
                <TextInput
                  style={styles.clienteInputField}
                  placeholder="Nome do Cliente (gravado no financeiro)"
                  placeholderTextColor="#9CA3AF"
                  value={clienteNome}
                  onChangeText={setClienteNome}
                />
              </View>
              <View style={styles.clienteInputContainer}>
                <Ionicons name="call-outline" size={18} color="#4B5563" />
                <TextInput
                  style={styles.clienteInputField}
                  placeholder="Celular do Cliente (Opcional)"
                  placeholderTextColor="#9CA3AF"
                  value={clienteCelular}
                  onChangeText={setClienteCelular}
                  keyboardType="phone-pad"
                />
              </View>
            </View>

            <View style={styles.confirmBtns}>
              <TouchableOpacity style={styles.confirmCancelBtn} onPress={onCancelar} disabled={finalizando}>
                <Text style={styles.confirmCancelText}>Cancelar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.confirmOkBtn, finalizando && { opacity: 0.6 }]}
                onPress={handleConfirmar}
                disabled={finalizando}
              >
                {finalizando ? (
                  <ActivityIndicator color="#FFF" size="small" />
                ) : (
                  <Text style={styles.confirmOkText}>Receber e Limpar Mesa</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 44 : 16,
    paddingBottom: 16,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  topBarTitle: { fontSize: 22, fontWeight: '800', color: '#1F2024' },
  topBarSubtitle: { fontSize: 13, color: '#9CA3AF', marginTop: 2, fontWeight: '500' },
  btnNovaMesa: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DC2626',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
    gap: 5,
    shadowColor: '#DC2626',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  btnNovaMesaText: { color: '#FFF', fontWeight: '700', fontSize: 13 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#374151', marginBottom: 6 },
  emptySub: { fontSize: 13, color: '#9CA3AF', textAlign: 'center', lineHeight: 20 },
  listContent: { padding: 12, paddingTop: 16 },
  gridColumnWrapper: { gap: 8, marginBottom: 8 },
  mesaCard: {
    flex: 1,
    maxWidth: '23%',
    backgroundColor: '#FFF',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#F3F4F6',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  mesaIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FEF2F2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  mesaNumero: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1F2024',
    marginBottom: 2,
  },
  mesaCliente: {
    fontSize: 9,
    color: '#6B7280',
    fontWeight: '500',
    maxWidth: '100%',
  },
  mesaStatusText: {
    fontSize: 9,
    color: '#16A34A',
    fontWeight: '700',
  },
  mesaBadge: {
    position: 'absolute',
    top: -4,
    right: -4,
    backgroundColor: '#DC2626',
    borderRadius: 9,
    minWidth: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    zIndex: 10,
  },
  mesaBadgeText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '800',
  },
  metaLabel: { fontSize: 11, color: '#6B7280', fontWeight: '600', textTransform: 'uppercase' },
  modalOverlayCenter: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalCardCenter: { backgroundColor: '#FFF', borderRadius: 16, padding: 20, width: '100%', maxWidth: 400 },
  modalCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 },
  modalCardTitle: { fontSize: 17, fontWeight: '700', color: '#1F2024' },
  inputLabel: { fontSize: 12, fontWeight: '700', color: '#4B5563', textTransform: 'uppercase', marginBottom: 6, marginTop: 10 },
  modalInput: { borderWidth: 1, borderColor: '#D1D5DB', backgroundColor: '#F9FAFB', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: '#1F2024' },
  modalCenterBtns: { flexDirection: 'row', gap: 10, marginTop: 20 },
  btnSecondary: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: '#D1D5DB', alignItems: 'center' },
  btnSecondaryText: { color: '#374151', fontWeight: '600', fontSize: 14 },
  btnPrimary: { flex: 1, backgroundColor: '#DC2626', paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  btnPrimaryText: { color: '#FFF', fontWeight: '700', fontSize: 14 },
  fullScreenModal: { flex: 1, backgroundColor: '#F9FAFB' },
  comandaHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 44 : 12, paddingBottom: 12, backgroundColor: '#FFF', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  backBtn: { padding: 4 },
  comandaTitle: { fontSize: 17, fontWeight: '800', color: '#1F2024' },
  comandaClienteSub: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  emptyComanda: { alignItems: 'center', justifyContent: 'center', paddingVertical: 48 },
  emptyComandaText: { fontSize: 16, fontWeight: '700', color: '#374151', marginBottom: 4 },
  emptyComandaSub: { fontSize: 13, color: '#9CA3AF', textAlign: 'center', paddingHorizontal: 24 },
  comandaCardItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#E5E7EB' },
  comandaItemNome: { fontSize: 15, fontWeight: '600', color: '#1F2024' },
  comandaItemPreco: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  qtyRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F3F4F6', borderRadius: 8, marginHorizontal: 8, paddingHorizontal: 4 },
  qtyBtn: { padding: 6 },
  qtyNum: { fontSize: 14, fontWeight: '700', color: '#1F2024', minWidth: 20, textAlign: 'center' },
  comandaItemSubtotal: { fontSize: 14, fontWeight: '700', color: '#1F2024', minWidth: 64, textAlign: 'right' },
  comandaTotalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#FFF', borderRadius: 12, padding: 16, marginTop: 8, borderWidth: 1, borderColor: '#E5E7EB' },
  comandaTotalLabel: { fontSize: 15, fontWeight: '700', color: '#374151' },
  comandaTotalVal: { fontSize: 20, fontWeight: '800', color: '#16A34A' },
  addSection: { paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#FFF', borderTopWidth: 1, borderTopColor: '#E5E7EB' },
  addManualBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 8 },
  addManualText: { fontSize: 15, fontWeight: '600', color: '#1F2024' },
  comandaFooter: { padding: 16, backgroundColor: '#FFF', borderTopWidth: 1, borderTopColor: '#E5E7EB' },
  btnFecharMesa: { backgroundColor: '#16A34A', flexDirection: 'row', height: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 8 },
  btnFecharMesaText: { color: '#FFF', fontWeight: '700', fontSize: 16 },
  btnCancelarMesa: { flexDirection: 'row', height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 12, borderWidth: 1, borderColor: '#DC2626' },
  btnCancelarMesaText: { color: '#DC2626', fontWeight: '700', fontSize: 15 },
  modalOverlaySheet: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalSheetContent: { backgroundColor: '#FFF', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '80%' },
  modalSheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  modalSheetTitle: { fontSize: 17, fontWeight: '700', color: '#1F2024' },
  searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F3F4F6', borderRadius: 10, paddingHorizontal: 12, height: 42, marginBottom: 12 },
  searchInput: { flex: 1, fontSize: 14, color: '#1F2024' },
  produtoRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  produtoNome: { fontSize: 15, fontWeight: '600', color: '#1F2024' },
  produtoPreco: { fontSize: 13, color: '#6B7280', marginTop: 2 },
  tagEstoque: { backgroundColor: '#DCFCE7', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  tagEstoqueZero: { backgroundColor: '#FEE2E2' },
  tagEstoqueText: { fontSize: 11, fontWeight: '600', color: '#15803D' },
  confirmOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center' },
  confirmBox: { backgroundColor: '#FFF', borderRadius: 16, padding: 20 },
  confirmTitle: { fontSize: 18, fontWeight: '700', color: '#1F2024', marginBottom: 14 },
  confirmList: { maxHeight: 150, marginBottom: 12 },
  confirmItem: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  confirmItemNome: { flex: 1, fontSize: 14, color: '#374151' },
  confirmItemQtd: { fontSize: 14, fontWeight: '600', color: '#6B7280', marginHorizontal: 8 },
  confirmItemVal: { fontSize: 14, fontWeight: '600', color: '#1F2024' },
  confirmDescontoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 8 },
  confirmDescontoVal: { fontSize: 13, color: '#DC2626', fontWeight: '600' },
  confirmDescontoInput: { borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, width: 60, textAlign: 'center', fontSize: 14 },
  confirmTotalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#E5E7EB', paddingTop: 10, marginTop: 6 },
  confirmTotalLabel: { fontSize: 15, fontWeight: '700', color: '#1F2024' },
  confirmTotalVal: { fontSize: 18, fontWeight: '800', color: '#16A34A' },
  pagamentoLabel: { fontSize: 13, fontWeight: '700', color: '#6B7280', marginTop: 14, marginBottom: 8, textTransform: 'uppercase' },
  pagamentoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pagamentoBtn: { width: '48%', flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 10, borderWidth: 1.5 },
  pagamentoBtnText: { fontSize: 13, fontWeight: '600' },
  prazoContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FCD34D', borderRadius: 10, paddingHorizontal: 12, height: 44, marginTop: 10, gap: 8 },
  prazoInput: { flex: 1, fontSize: 14, color: '#1F2024' },
  clienteInputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 10, paddingHorizontal: 12, height: 44, gap: 8 },
  clienteInputField: { flex: 1, fontSize: 14, color: '#1F2024' },
  confirmBtns: { flexDirection: 'row', gap: 10, marginTop: 20 },
  confirmCancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: '#D1D5DB', alignItems: 'center' },
  confirmCancelText: { fontSize: 14, fontWeight: '600', color: '#374151' },
  confirmOkBtn: { flex: 1, backgroundColor: '#16A34A', paddingVertical: 12, borderRadius: 10, alignItems: 'center' },
  confirmOkText: { fontSize: 14, fontWeight: '700', color: '#FFF' },
  scannerContainer: { flex: 1, backgroundColor: '#000' },
  scannerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 50, paddingHorizontal: 20, zIndex: 10 },
  scannerCloseBtn: { padding: 8, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20 },
  scannerTitle: { fontSize: 18, fontWeight: '700', color: '#FFF' },
});
