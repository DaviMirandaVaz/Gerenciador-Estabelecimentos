import BlackButton from '@/Components/BlackButton';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import * as Crypto from 'expo-crypto';
import React, { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { LineChart } from 'react-native-chart-kit';

interface Produto {
  id: string;
  nome: string;
  preco: number;
  quantidade: number;
  precoCompra?: number;
  lucroPercentual?: number;
  tipo?: string;
}

export default function Dashboard() {
  const db = useSQLiteContext();
  const screenWidth = Math.min(Dimensions.get('window').width, 1000);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [movimentacoes, setMovimentacoes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // States para os modais
  const [actionModalVisible, setActionModalVisible] = useState(false);
  const [selectProductModalVisible, setSelectProductModalVisible] = useState(false);
  const [addStockModalVisible, setAddStockModalVisible] = useState(false);

  const [selectedProduct, setSelectedProduct] = useState<Produto | null>(null);
  const [quantidadeAdicionar, setQuantidadeAdicionar] = useState('');
  const [precoCompraUnidade, setPrecoCompraUnidade] = useState('');
  const [savingStock, setSavingStock] = useState(false);

  const carregarProdutos = useCallback(async () => {
    setLoading(true);
    try {
      const lista = await db.getAllAsync<Produto>('SELECT * FROM produtos ORDER BY nome ASC');
      setProdutos(lista);
      const movs = await db.getAllAsync<any>('SELECT id, tipo, origem, data, itens FROM movimentacoes ORDER BY data ASC');
      setMovimentacoes(movs);
    } catch (e) {
      console.log('Erro ao carregar estoque do SQLite:', e);
    } finally {
      setLoading(false);
    }
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      carregarProdutos();
    }, [carregarProdutos])
  );

  const handleSelecionarProduto = (produto: Produto) => {
    setSelectedProduct(produto);
    setSelectProductModalVisible(false);
    setQuantidadeAdicionar('');
    setPrecoCompraUnidade(
      produto.precoCompra ? produto.precoCompra.toFixed(2).replace('.', ',') : ''
    );
    setTimeout(() => {
      setAddStockModalVisible(true);
    }, 400);
  };

  const handleSalvarEstoqueExistente = async () => {
    if (!selectedProduct) return;

    if (!quantidadeAdicionar.trim() || !precoCompraUnidade.trim()) {
      Alert.alert('Atenção', 'Preencha todos os campos.');
      return;
    }

    const qtdNum = parseInt(quantidadeAdicionar, 10);
    const precoCompraNum = parseFloat(precoCompraUnidade.replace(',', '.'));

    if (isNaN(qtdNum) || qtdNum <= 0) {
      Alert.alert('Atenção', 'Insira uma quantidade válida.');
      return;
    }
    if (isNaN(precoCompraNum) || precoCompraNum < 0) {
      Alert.alert('Atenção', 'Insira um preço de compra válido.');
      return;
    }

    setSavingStock(true);
    try {
      await db.execAsync('BEGIN TRANSACTION');

      const lucroAtual =
        typeof selectedProduct.lucroPercentual === 'number' ? selectedProduct.lucroPercentual : 0;
      const novoPreco = precoCompraNum * (1 + lucroAtual / 100);
      const novaQtd = selectedProduct.quantidade + qtdNum;
      const valorTotalCompra = precoCompraNum * qtdNum;

      await db.runAsync(
        'UPDATE produtos SET quantidade = ?, precoCompra = ?, preco = ? WHERE id = ?',
        [novaQtd, precoCompraNum, novoPreco, selectedProduct.id]
      );

      const itensJson = JSON.stringify([
        {
          produtoId: selectedProduct.id,
          produtoNome: selectedProduct.nome,
          quantidade: qtdNum,
          precoCompra: precoCompraNum,
        },
      ]);

      await db.runAsync(
        'INSERT INTO movimentacoes (id, tipo, origem, data, valorTotal, descricao, itens) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [
          Crypto.randomUUID(),
          'saida',
          'compra_estoque',
          Date.now(),
          valorTotalCompra,
          `Compra de estoque (Adição) - ${selectedProduct.nome}`,
          itensJson,
        ]
      );

      await db.execAsync('COMMIT');

      setAddStockModalVisible(false);
      Alert.alert('Sucesso', 'Estoque adicionado e saída financeira registrada!');
      carregarProdutos();
    } catch (error: any) {
      await db.execAsync('ROLLBACK');
      console.log('Erro ao adicionar estoque:', error);
      Alert.alert('Erro', 'Não foi possível salvar o estoque.');
    } finally {
      setSavingStock(false);
    }
  };

  const totalProdutos = produtos.filter(p => p.tipo !== 'insumo').length;
  const totalInsumos = produtos.filter(p => p.tipo === 'insumo').length;
  const totalItens = produtos.reduce((acc, p) => acc + (p.tipo !== 'produto_sem_estoque' && p.tipo !== 'insumo' ? p.quantidade : 0), 0);
  const insumosEmBaixa = produtos.filter(p => p.tipo === 'insumo' && p.quantidade < 5);

  const stockChartData = React.useMemo(() => {
    if (movimentacoes.length === 0) {
      return {
        labels: ['Hoje'],
        datasets: [{ data: [totalItens], color: (opacity = 1) => `rgba(31, 32, 36, ${opacity})`, strokeWidth: 3 }],
      };
    }

    const daysMap = new Map<string, { label: string; timestamp: number; netQuantity: number }>();

    movimentacoes.forEach((m) => {
      const date = new Date(m.data);
      const dayKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      const dayLabel = `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`;

      let qtyChange = 0;
      if (m.itens) {
        try {
          const parsed = JSON.parse(m.itens);
          if (Array.isArray(parsed)) {
            qtyChange = parsed.reduce((acc: number, item: any) => acc + (Number(item.quantidade) || 0), 0);
          }
        } catch (e) {
          qtyChange = 1;
        }
      } else {
        qtyChange = 1;
      }

      const delta = m.tipo === 'saida' ? qtyChange : -qtyChange;
      const current = daysMap.get(dayKey) ?? { label: dayLabel, timestamp: date.getTime(), netQuantity: 0 };
      current.netQuantity += delta;
      daysMap.set(dayKey, current);
    });

    const sortedDays = Array.from(daysMap.values()).sort((a, b) => a.timestamp - b.timestamp);
    const totalNetChange = sortedDays.reduce((acc, d) => acc + d.netQuantity, 0);
    const daysToUse = sortedDays.slice(-6);

    const labels: string[] = [];
    const points: number[] = [];
    let baseline = Math.max(0, totalItens - totalNetChange);

    for (const day of sortedDays) {
      baseline += day.netQuantity;
      if (daysToUse.includes(day)) {
        labels.push(day.label);
        points.push(Math.max(0, baseline));
      }
    }

    if (labels.length === 0) {
      labels.push('Hoje');
      points.push(totalItens);
    }

    return {
      labels,
      datasets: [
        {
          data: points,
          color: (opacity = 1) => `rgba(31, 32, 36, ${opacity})`,
          strokeWidth: 3,
        },
      ],
    };
  }, [movimentacoes, totalItens]);

  return (
    <View style={styles.outerContainer}>
      <View style={styles.container}>
        {/* Resumo rápido */}
        {!loading && (
          <>
            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{totalProdutos}</Text>
                <Text style={styles.statLabel}>Produtos</Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statValue}>{totalInsumos}</Text>
                <Text style={styles.statLabel}>Insumos</Text>
              </View>
            </View>

            {insumosEmBaixa.length > 0 && (
              <View style={styles.alertCard}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <Ionicons name="warning" size={20} color="#92400E" />
                  <Text style={styles.alertCardTitle}>Insumos em baixa</Text>
                </View>
                {insumosEmBaixa.map(ins => (
                  <Text key={ins.id} style={styles.alertCardText}>
                    • {ins.nome}: {ins.quantidade} restante{ins.quantidade === 1 ? '' : 's'}
                  </Text>
                ))}
              </View>
            )}
          </>
        )}

        {/* Gráfico */}
        <View style={styles.chartContainer}>
          {loading ? (
            <ActivityIndicator size="large" color="#1F2024" style={{ marginTop: 40 }} />
          ) : produtos.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="cube-outline" size={56} color="#9CA3AF" style={{ marginBottom: 12 }} />
              <Text style={styles.emptyTitle}>Estoque vazio</Text>
              <Text style={styles.emptySubtitle}>
                Adicione produtos para visualizar o gráfico
              </Text>
            </View>
          ) : (
            <>
              <Text style={styles.chartTitle}>Evolução de Itens em Estoque</Text>
              <LineChart
                data={stockChartData}
                width={Math.min(screenWidth - 80, 800)}
                height={240}
                yAxisLabel=""
                yAxisSuffix=" un"
                fromZero
                chartConfig={{
                  backgroundColor: '#ffffff',
                  backgroundGradientFrom: '#ffffff',
                  backgroundGradientTo: '#ffffff',
                  decimalPlaces: 0,
                  color: (opacity = 1) => `rgba(31, 32, 36, ${opacity})`,
                  labelColor: (opacity = 1) => `rgba(80, 80, 80, ${opacity})`,
                  propsForDots: { r: '5', strokeWidth: '2', stroke: '#1F2024' },
                  style: { borderRadius: 16 },
                }}
                bezier
                style={{ marginVertical: 8, borderRadius: 16 }}
              />
            </>
          )}
        </View>

        <View style={styles.spacer} />

        {/* Botões */}
        <View style={styles.bottomButtons}>
          <BlackButton
            label={`Adicionar\nProdutos`}
            style={styles.bottomBtn}
            pill={false}
            onPress={() => setActionModalVisible(true)}
          />
          <BlackButton
            label={`Ver\ndetalhadamente`}
            style={styles.bottomBtn}
            pill={false}
            onPress={() => router.push('/(drawer)/estoque-detalhe')}
          />
        </View>
      </View>

      {/* Modais */}
      {/* 1. Modal de Ação */}
      <Modal visible={actionModalVisible} transparent animationType="fade" onRequestClose={() => setActionModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.actionModalContainer}>
            <Text style={styles.modalTitle}>Adicionar Produtos</Text>
            <Text style={styles.modalSubtitle}>O que você deseja fazer?</Text>

            <TouchableOpacity style={styles.actionOptionBtn} onPress={() => {
              setActionModalVisible(false);
              router.push('/(drawer)/nova-entrada');
            }}>
              <Ionicons name="add-circle-outline" size={24} color="#1F2024" />
              <Text style={styles.actionOptionText}>Cadastrar Novo Produto</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.actionOptionBtn} onPress={() => {
              setActionModalVisible(false);
              setSelectProductModalVisible(true);
            }}>
              <Ionicons name="cube-outline" size={24} color="#1F2024" />
              <Text style={styles.actionOptionText}>Adicionar Estoque a Produto Existente</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.cancelActionBtn} onPress={() => setActionModalVisible(false)}>
              <Text style={styles.cancelActionText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 2. Modal de Selecionar Produto Existente */}
      <Modal visible={selectProductModalVisible} transparent animationType="slide" onRequestClose={() => setSelectProductModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.selectProductContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Selecionar Produto</Text>
              <TouchableOpacity onPress={() => setSelectProductModalVisible(false)} style={styles.closeModalBtn}>
                <Ionicons name="close" size={20} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <FlatList
              data={produtos}
              keyExtractor={(item) => item.id}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.produtoItem} onPress={() => handleSelecionarProduto(item)}>
                  <View>
                    <Text style={styles.produtoItemNome}>{item.nome}</Text>
                    <Text style={styles.produtoItemPreco}>Estoque atual: {item.quantidade}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <Text style={styles.emptyListText}>Nenhum produto cadastrado.</Text>
              }
            />
          </View>
        </View>
      </Modal>

      {/* 3. Modal de Inserir Estoque e Preço */}
      <Modal visible={addStockModalVisible} transparent animationType="slide" onRequestClose={() => setAddStockModalVisible(false)}>
        <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.addStockContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Adicionar Estoque</Text>
              <TouchableOpacity onPress={() => setAddStockModalVisible(false)} style={styles.closeModalBtn}>
                <Ionicons name="close" size={20} color="#6B7280" />
              </TouchableOpacity>
            </View>

            {selectedProduct && (
              <View style={styles.addStockForm}>
                <Text style={styles.selectedProductText}>Produto: {selectedProduct.nome}</Text>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Quantidade a Adicionar</Text>
                  <TextInput
                    style={styles.input}
                    value={quantidadeAdicionar}
                    onChangeText={setQuantidadeAdicionar}
                    placeholder="Ex: 10"
                    keyboardType="numeric"
                  />
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.fieldLabel}>Preço de Compra (Unidade)</Text>
                  <TextInput
                    style={styles.input}
                    value={precoCompraUnidade}
                    onChangeText={setPrecoCompraUnidade}
                    placeholder="Ex: 15,50"
                    keyboardType="decimal-pad"
                  />
                </View>

                <View style={styles.modalButtons}>
                  <TouchableOpacity style={styles.cancelBtn} onPress={() => setAddStockModalVisible(false)}>
                    <Text style={styles.cancelText}>Cancelar</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={[styles.saveBtn, savingStock && styles.saveBtnDisabled]} onPress={handleSalvarEstoqueExistente} disabled={savingStock}>
                    {savingStock ? (
                      <ActivityIndicator color="#FFF" size="small" />
                    ) : (
                      <Text style={styles.saveText}>Salvar e Registrar</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  outerContainer: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
  },
  container: {
    flex: 1,
    width: '100%',
    maxWidth: 1000,
    padding: 20,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
    marginTop: 8,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#FFF',
    borderRadius: 14,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  statValue: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1F2024',
  },
  statLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
    textAlign: 'center',
  },
  alertCard: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
  },
  alertCardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#92400E',
  },
  alertCardText: {
    fontSize: 13,
    color: '#78350F',
    marginBottom: 2,
  },
  chartContainer: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
    minHeight: 200,
    justifyContent: 'center',
  },
  chartTitle: {
    alignSelf: 'flex-start',
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  moreHint: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 4,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2024',
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
  },
  spacer: {
    flex: 1,
  },
  bottomButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 20,
    marginBottom: 40,
  },
  bottomBtn: {
    flex: 1,
    height: 140,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  actionModalContainer: {
    backgroundColor: '#FFF',
    width: '100%',
    maxWidth: 500,
    padding: 24,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderBottomLeftRadius: Platform.OS === 'web' ? 20 : 0,
    borderBottomRightRadius: Platform.OS === 'web' ? 20 : 0,
    alignItems: 'center',
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 8,
  },
  modalSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 20,
  },
  actionOptionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    width: '100%',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    gap: 12,
  },
  actionOptionText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1F2024',
  },
  cancelActionBtn: {
    marginTop: 8,
    padding: 12,
  },
  cancelActionText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#DC2626',
  },
  selectProductContainer: {
    backgroundColor: '#FFF',
    width: '100%',
    maxWidth: 500,
    height: '65%',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  closeModalBtn: {
    padding: 6,
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
  },
  produtoItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  produtoItemNome: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 4,
  },
  produtoItemPreco: {
    fontSize: 13,
    color: '#6B7280',
  },
  emptyListText: {
    textAlign: 'center',
    color: '#9CA3AF',
    marginTop: 20,
  },
  addStockContainer: {
    backgroundColor: '#FFF',
    width: '100%',
    maxWidth: 500,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: Platform.OS === 'ios' ? 40 : 24,
  },
  addStockForm: {
    gap: 16,
  },
  selectedProductText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  fieldGroup: {
    gap: 6,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
    textTransform: 'uppercase',
  },
  input: {
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: '#111827',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 10,
  },
  cancelBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: '#D1D5DB',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    color: '#374151',
    fontWeight: '600',
    fontSize: 15,
  },
  saveBtn: {
    flex: 1.5,
    backgroundColor: '#1F2024',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 14,
  },
});
