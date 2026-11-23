import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  TextInput,
  Platform,
  Alert,
  Modal,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

type TipoMovimentacao = 'entrada' | 'saida';
type FormaPagamento = 'dinheiro' | 'debito' | 'credito' | 'a_prazo';

interface ItemFinanceiro {
  produtoId: string;
  produtoNome: string;
  quantidade: number;
  precoVenda?: number;
  precoCompra?: number;
}

interface MovimentacaoFinanceira {
  id: string;
  tipo: TipoMovimentacao;
  origem?: string;
  descricao: string;
  valorTotal: number;
  data: number;
  itens?: string;
  formaPagamento?: FormaPagamento;
  dataVencimento?: number | null;
  status?: string; // 'confirmado' | 'pendente'
  clienteNome?: string;
  clienteCelular?: string;
}

const PAGAMENTO_ICON: Record<FormaPagamento, any> = {
  dinheiro: 'cash-outline',
  debito:   'card-outline',
  credito:  'card',
  a_prazo:  'calendar-outline',
};
const PAGAMENTO_COR: Record<FormaPagamento, string> = {
  dinheiro: '#16A34A',
  debito:   '#2563EB',
  credito:  '#7C3AED',
  a_prazo:  '#D97706',
};

type FilterType = 'hoje' | '7dias' | 'mes' | 'custom';

function formatCurrency(value: number) {
  return `R$ ${value.toFixed(2).replace('.', ',')}`;
}

function formatDateTime(date: Date) {
  if (date.getTime() === 0) return 'Agora';
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${day}/${month} às ${hours}:${minutes}`;
}

function parseDateInput(dateString: string): Date | null {
  const parts = dateString.split('/');
  if (parts.length === 3) {
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const year = parseInt(parts[2], 10);
    const date = new Date(year, month, day);
    if (!isNaN(date.getTime())) return date;
  }
  return null;
}

export default function HistoricoFinanceiro() {
  const db = useSQLiteContext();
  const [movimentacoes, setMovimentacoes] = useState<MovimentacaoFinanceira[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>('mes');
  const [filterOrigem, setFilterOrigem] = useState<'todos' | 'vendas' | 'insumos' | 'manuais'>('todos');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null);

  // Datas customizadas (DD/MM/YYYY)
  const [dataInicioStr, setDataInicioStr] = useState('');
  const [dataFimStr, setDataFimStr] = useState('');

  // Modal State
  const [modalVisivel, setModalVisivel] = useState(false);
  const [editandoItem, setEditandoItem] = useState<MovimentacaoFinanceira | null>(null);
  const [modalTipo, setModalTipo] = useState<TipoMovimentacao>('entrada');
  const [modalDescricao, setModalDescricao] = useState('');
  const [modalValor, setModalValor] = useState('');
  const [modalFormaPag, setModalFormaPag] = useState<FormaPagamento>('dinheiro');
  const [modalDataVenc, setModalDataVenc] = useState('');
  const [modalStatus, setModalStatus] = useState<'confirmado' | 'pendente'>('confirmado');
  const [modalCliente, setModalCliente] = useState('');
  const [modalCelular, setModalCelular] = useState('');

  const chipsDescricao = ["Aluguel", "Energia", "Água", "Gás", "Salários", "Fornecedor", "Manutenção", "Impostos", "Venda Avulsa", "Serviço", "Aporte"];

  const fetchHistorico = useCallback(async () => {
    setLoading(true);
    try {
      let startDate = new Date();
      startDate.setHours(0, 0, 0, 0);
      let endDate = new Date();
      endDate.setHours(23, 59, 59, 999);

      if (filter === 'hoje') {
        // startDate is today 00:00:00
      } else if (filter === '7dias') {
        startDate.setDate(startDate.getDate() - 7);
      } else if (filter === 'mes') {
        startDate.setDate(startDate.getDate() - 30);
      } else if (filter === 'custom') {
        const customStart = parseDateInput(dataInicioStr);
        const customEnd = parseDateInput(dataFimStr);

        if (!customStart || !customEnd) {
          setLoading(false);
          return;
        }
        startDate = customStart;
        startDate.setHours(0, 0, 0, 0);
        endDate = customEnd;
        endDate.setHours(23, 59, 59, 999);
      }

      const startTs = startDate.getTime();
      const endTs = endDate.getTime();

      const items = await db.getAllAsync<MovimentacaoFinanceira>(
        'SELECT * FROM movimentacoes WHERE data >= ? AND data <= ? ORDER BY data DESC',
        [startTs, endTs]
      );

      setMovimentacoes(items);
    } catch (e) {
      console.log('Erro ao buscar histórico no SQLite:', e);
      Alert.alert('Erro', 'Não foi possível carregar o histórico.');
    } finally {
      setLoading(false);
    }
  }, [db, filter, dataInicioStr, dataFimStr]);

  useEffect(() => {
    if (filter !== 'custom') {
      fetchHistorico();
    }
  }, [filter, fetchHistorico]);

  useFocusEffect(
    useCallback(() => {
      fetchHistorico();
    }, [fetchHistorico])
  );

  const handleCustomSearch = () => {
    if (!dataInicioStr || !dataFimStr) {
      Alert.alert('Atenção', 'Preencha ambas as datas no formato DD/MM/AAAA');
      return;
    }
    fetchHistorico();
  };

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const abrirModal = (item: MovimentacaoFinanceira | null) => {
    if (item) {
      setEditandoItem(item);
      setModalTipo(item.tipo);
      setModalDescricao(item.descricao);
      setModalValor(item.valorTotal.toString());
      setModalFormaPag(item.formaPagamento || 'dinheiro');
      if (item.dataVencimento) {
        const d = new Date(item.dataVencimento);
        setModalDataVenc(`${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`);
      } else {
        setModalDataVenc('');
      }
      setModalStatus((item.status as 'confirmado' | 'pendente') || 'confirmado');
      setModalCliente(item.clienteNome || '');
      setModalCelular(item.clienteCelular || '');
    } else {
      setEditandoItem(null);
      setModalTipo('entrada');
      setModalDescricao('');
      setModalValor('');
      setModalFormaPag('dinheiro');
      setModalDataVenc('');
      setModalStatus('confirmado');
      setModalCliente('');
      setModalCelular('');
    }
    setModalVisivel(true);
  };

  const salvarModal = async () => {
    if (!modalDescricao.trim()) {
      Alert.alert('Atenção', 'A descrição é obrigatória.');
      return;
    }
    const valStr = modalValor.replace(',', '.');
    const valorNum = parseFloat(valStr);
    if (isNaN(valorNum) || valorNum <= 0) {
      Alert.alert('Atenção', 'Digite um valor válido.');
      return;
    }
    let dataVencTs: number | null = null;
    if (modalFormaPag === 'a_prazo') {
      const d = parseDateInput(modalDataVenc);
      if (d) {
        dataVencTs = d.getTime();
      } else {
        Alert.alert('Atenção', 'Data de vencimento inválida.');
        return;
      }
    }

    try {
      if (editandoItem) {
        await db.runAsync(
          `UPDATE movimentacoes SET tipo = ?, descricao = ?, valorTotal = ?, formaPagamento = ?, dataVencimento = ?, status = ?, clienteNome = ?, clienteCelular = ? WHERE id = ?`,
          [modalTipo, modalDescricao.trim(), valorNum, modalFormaPag, dataVencTs, modalStatus, modalCliente.trim(), modalCelular.trim(), editandoItem.id]
        );
      } else {
        const id = Date.now().toString() + Math.floor(Math.random() * 1000);
        await db.runAsync(
          `INSERT INTO movimentacoes (id, tipo, origem, descricao, valorTotal, data, formaPagamento, dataVencimento, status, clienteNome, clienteCelular) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, modalTipo, 'manual', modalDescricao.trim(), valorNum, Date.now(), modalFormaPag, dataVencTs, modalStatus, modalCliente.trim(), modalCelular.trim()]
        );
      }
      setModalVisivel(false);
      fetchHistorico();
    } catch (e) {
      Alert.alert('Erro', 'Não foi possível salvar o lançamento.');
    }
  };

  const excluirModal = () => {
    if (!editandoItem) return;
    Alert.alert('Excluir Lançamento', 'Tem certeza que deseja excluir esta movimentação?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Excluir', style: 'destructive', onPress: async () => {
        try {
          await db.runAsync(`DELETE FROM movimentacoes WHERE id = ?`, [editandoItem.id]);
          setModalVisivel(false);
          fetchHistorico();
        } catch (e) {
          Alert.alert('Erro', 'Não foi possível excluir.');
        }
      }}
    ]);
  };

  const marcarComoRecebido = async (id: string) => {
    setConfirmandoId(id);
    try {
      await db.runAsync(
        "UPDATE movimentacoes SET status = 'confirmado' WHERE id = ?",
        [id]
      );
      setMovimentacoes((prev) =>
        prev.map((m) => (m.id === id ? { ...m, status: 'confirmado' } : m))
      );
    } catch (e) {
      Alert.alert('Erro', 'Não foi possível confirmar o recebimento.');
    } finally {
      setConfirmandoId(null);
    }
  };

  const filteredMovimentacoes = useMemo(() => {
    return movimentacoes.filter((m) => {
      if (filterOrigem === 'vendas') return m.origem?.includes('venda');
      if (filterOrigem === 'insumos') return m.origem === 'compra_insumo';
      if (filterOrigem === 'manuais') return m.origem === 'manual' || m.origem === 'despesa_fixa' || !m.origem;
      return true;
    });
  }, [movimentacoes, filterOrigem]);

  const renderItem = ({ item }: { item: MovimentacaoFinanceira }) => {
    const isEntrada = item.tipo === 'entrada';
    const isPendente = item.status === 'pendente';
    const isInsumo = item.origem === 'compra_insumo';
    const isVenda = item.origem?.includes('venda');
    const date = new Date(item.data);
    const isExpanded = expandedIds.has(item.id);
    const fp = item.formaPagamento as FormaPagamento | undefined;
    const vencimento = item.dataVencimento ? new Date(item.dataVencimento) : null;

    let parsedItens: ItemFinanceiro[] = [];
    let infoDesconto: { descontoPercentual?: number; valorDesconto?: number; totalBruto?: number } = {};

    if (item.itens) {
      try {
        const raw = JSON.parse(item.itens);
        if (Array.isArray(raw)) {
          parsedItens = raw;
        } else if (raw && typeof raw === 'object') {
          parsedItens = raw.produtos || [];
          infoDesconto = {
            descontoPercentual: raw.descontoPercentual,
            valorDesconto: raw.valorDesconto,
            totalBruto: raw.totalBruto,
          };
        }
      } catch (e) {
        parsedItens = [];
      }
    }
    const hasItems = parsedItens.length > 0;
    const temDesconto = (infoDesconto.descontoPercentual ?? 0) > 0 || item.descricao.includes('Desc.');

    return (
      <TouchableOpacity
        style={[styles.card, isPendente && styles.cardPendente]}
        onPress={() => toggleExpand(item.id)}
        activeOpacity={0.8}
      >
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderLeft}>
            <View style={[styles.iconContainer, isEntrada ? styles.entradaBg : styles.saidaBg, isInsumo && { backgroundColor: '#FEF3C7' }]}>
              <Ionicons
                name={isInsumo ? 'nutrition-outline' : isVenda ? 'cart-outline' : isEntrada ? 'arrow-down' : 'arrow-up'}
                size={18}
                color={isInsumo ? '#D97706' : isEntrada ? '#16A34A' : '#DC2626'}
              />
            </View>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <Text style={styles.cardTitle}>{item.descricao}</Text>
                {temDesconto && (
                  <View style={styles.discountBadge}>
                    <Text style={styles.discountBadgeText}>Desconto</Text>
                  </View>
                )}
                {isPendente && (
                  <View style={styles.pendenteBadge}>
                    <Ionicons name="time-outline" size={10} color="#D97706" />
                    <Text style={styles.pendenteBadgeText}>Pendente</Text>
                  </View>
                )}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                {fp && (
                  <Ionicons name={PAGAMENTO_ICON[fp]} size={11} color={PAGAMENTO_COR[fp]} />
                )}
                <Text style={styles.cardDate}>
                  {formatDateTime(date)}
                  {isPendente && vencimento
                    ? ` • vence ${vencimento.toLocaleDateString('pt-BR')}`
                    : ''}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.cardHeaderRight}>
            <TouchableOpacity onPress={() => abrirModal(item)} style={{ marginRight: 8, padding: 4 }}>
              <Ionicons name="create-outline" size={20} color="#6B7280" />
            </TouchableOpacity>
            <Text style={[styles.cardValue, isPendente ? styles.pendenteText : isEntrada ? styles.entradaText : styles.saidaText]}>
              {isEntrada ? '+' : '-'} {formatCurrency(item.valorTotal)}
            </Text>
            <Ionicons
              name={isExpanded ? 'chevron-up' : 'chevron-down'}
              size={18}
              color="#9CA3AF"
              style={{ marginLeft: 8 }}
            />
          </View>
        </View>

        {isExpanded && (
          <View style={styles.expandedContent}>
            <View style={styles.divider} />

            {/* Dados do Cliente (A Prazo) */}
            {(item.clienteNome || item.clienteCelular) && (
              <View style={styles.clienteInfoContainer}>
                <Text style={styles.detailSectionTitle}>Dados do Cliente</Text>
                {item.clienteNome && (
                  <Text style={styles.clienteInfoText}>
                    <Ionicons name="person-outline" size={12} /> {item.clienteNome}
                  </Text>
                )}
                {item.clienteCelular && (
                  <Text style={styles.clienteInfoText}>
                    <Ionicons name="call-outline" size={12} /> {item.clienteCelular}
                  </Text>
                )}
                <View style={styles.divider} />
              </View>
            )}

            {/* Botão Marcar como Recebido */}
            {isPendente && (
              <TouchableOpacity
                style={styles.receberBtn}
                onPress={() => marcarComoRecebido(item.id)}
                disabled={confirmandoId === item.id}
              >
                {confirmandoId === item.id ? (
                  <ActivityIndicator size="small" color="#FFF" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle-outline" size={16} color="#FFF" />
                    <Text style={styles.receberBtnText}>Marcar como Recebido</Text>
                  </>
                )}
              </TouchableOpacity>
            )}

            {hasItems ? (
              <>
                <Text style={styles.detailSectionTitle}>Itens Registrados</Text>
                {parsedItens.map((prod, idx) => (
                  <View key={idx} style={styles.itemRow}>
                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <Text style={styles.itemName} numberOfLines={1}>{prod.produtoNome}</Text>
                      <Text style={styles.itemQtd}>
                        {prod.quantidade}x ({formatCurrency(prod.precoVenda ?? prod.precoCompra ?? 0)})
                      </Text>
                    </View>
                    <Text style={styles.itemPrice}>
                      {formatCurrency((prod.precoVenda ?? prod.precoCompra ?? 0) * prod.quantidade)}
                    </Text>
                  </View>
                ))}

                {(infoDesconto.descontoPercentual ?? 0) > 0 && (
                  <View style={styles.discountContainer}>
                    <View style={styles.discountRow}>
                      <Text style={styles.discountLabel}>Total Bruto dos Produtos:</Text>
                      <Text style={styles.discountValueStr}>{formatCurrency(infoDesconto.totalBruto ?? 0)}</Text>
                    </View>
                    <View style={styles.discountRow}>
                      <Text style={styles.discountLabel}>Desconto Concedido ({infoDesconto.descontoPercentual}%):</Text>
                      <Text style={styles.discountHighlight}>-{formatCurrency(infoDesconto.valorDesconto ?? 0)}</Text>
                    </View>
                    <View style={[styles.discountRow, { marginTop: 4, paddingTop: 4, borderTopWidth: 1, borderTopColor: '#E5E7EB' }]}>
                      <Text style={[styles.discountLabel, { fontWeight: '700', color: '#111827' }]}>Total Final da Venda:</Text>
                      <Text style={[styles.discountValueStr, { fontWeight: '800', color: '#16A34A' }]}>{formatCurrency(item.valorTotal)}</Text>
                    </View>
                  </View>
                )}
              </>
            ) : (
              <View style={styles.singleItemRow}>
                <Text style={styles.detailSectionTitle}>Detalhe da Transação</Text>
                <Text style={styles.itemInfoText}>Descrição: {item.descricao}</Text>
              </View>
            )}
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const totalFiltered = useMemo(() => {
    // Apenas movimentações confirmadas entram no balanço
    return filteredMovimentacoes
      .filter((m) => !m.status || m.status === 'confirmado')
      .reduce(
        (acc, item) => acc + (item.tipo === 'entrada' ? item.valorTotal : -item.valorTotal),
        0
      );
  }, [filteredMovimentacoes]);

  const aReceberFiltered = useMemo(() => {
    return filteredMovimentacoes
      .filter((m) => m.status === 'pendente' && m.tipo === 'entrada')
      .reduce((acc, m) => acc + m.valorTotal, 0);
  }, [filteredMovimentacoes]);

  return (
    <View style={styles.outerContainer}>
      <View style={styles.container}>
        {/* Top Bar */}
        <View style={styles.topBar}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
              <Ionicons name="arrow-back" size={24} color="#1F2024" />
            </TouchableOpacity>
            <Text style={styles.screenTitle}>Histórico Financeiro</Text>
          </View>
          <TouchableOpacity onPress={() => abrirModal(null)} style={styles.novoBtn}>
            <Ionicons name="add-circle-outline" size={20} color="#FFF" />
            <Text style={styles.novoBtnText}>Novo</Text>
          </TouchableOpacity>
        </View>

        {/* Filters */}
        <View style={styles.filterSection}>
          <View style={styles.filterTabs}>
            <TouchableOpacity
              style={[styles.filterTab, filter === 'hoje' && styles.filterTabActive]}
              onPress={() => setFilter('hoje')}
            >
              <Text style={[styles.filterTabText, filter === 'hoje' && styles.filterTabTextActive]}>Hoje</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.filterTab, filter === '7dias' && styles.filterTabActive]}
              onPress={() => setFilter('7dias')}
            >
              <Text style={[styles.filterTabText, filter === '7dias' && styles.filterTabTextActive]}>7 Dias</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.filterTab, filter === 'mes' && styles.filterTabActive]}
              onPress={() => setFilter('mes')}
            >
              <Text style={[styles.filterTabText, filter === 'mes' && styles.filterTabTextActive]}>30 Dias</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.filterTab, filter === 'custom' && styles.filterTabActive]}
              onPress={() => setFilter('custom')}
            >
              <Text style={[styles.filterTabText, filter === 'custom' && styles.filterTabTextActive]}>Outro</Text>
            </TouchableOpacity>
          </View>

          {filter === 'custom' && (
            <View style={styles.customDateContainer}>
              <View style={styles.dateInputWrapper}>
                <Text style={styles.dateLabel}>Data Inicial</Text>
                <TextInput
                  style={styles.dateInput}
                  placeholder="DD/MM/AAAA"
                  value={dataInicioStr}
                  onChangeText={setDataInicioStr}
                  keyboardType="numbers-and-punctuation"
                  maxLength={10}
                />
              </View>
              <View style={styles.dateInputWrapper}>
                <Text style={styles.dateLabel}>Data Final</Text>
                <TextInput
                  style={styles.dateInput}
                  placeholder="DD/MM/AAAA"
                  value={dataFimStr}
                  onChangeText={setDataFimStr}
                  keyboardType="numbers-and-punctuation"
                  maxLength={10}
                />
              </View>
              <TouchableOpacity style={styles.searchBtn} onPress={handleCustomSearch}>
                <Ionicons name="search" size={20} color="#FFF" />
              </TouchableOpacity>
            </View>
          )}

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
            <TouchableOpacity
              style={[styles.filterTabHeader, filterOrigem === 'todos' && styles.filterTabHeaderActive]}
              onPress={() => setFilterOrigem('todos')}
            >
              <Text style={[styles.filterTabTextHeader, filterOrigem === 'todos' && styles.filterTabTextHeaderActive]}>Todos</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.filterTabHeader, filterOrigem === 'vendas' && styles.filterTabHeaderActive]}
              onPress={() => setFilterOrigem('vendas')}
            >
              <Text style={[styles.filterTabTextHeader, filterOrigem === 'vendas' && styles.filterTabTextHeaderActive]}>Vendas</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.filterTabHeader, filterOrigem === 'insumos' && styles.filterTabHeaderActive]}
              onPress={() => setFilterOrigem('insumos')}
            >
              <Text style={[styles.filterTabTextHeader, filterOrigem === 'insumos' && styles.filterTabTextHeaderActive]}>Insumos</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.filterTabHeader, filterOrigem === 'manuais' && styles.filterTabHeaderActive]}
              onPress={() => setFilterOrigem('manuais')}
            >
              <Text style={[styles.filterTabTextHeader, filterOrigem === 'manuais' && styles.filterTabTextHeaderActive]}>Manuais</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Total do Período */}
        {!loading && (
          <View style={styles.totalPeriodContainer}>
            <View>
              <Text style={styles.totalPeriodLabel}>Balanço do período</Text>
              {aReceberFiltered > 0 && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                  <Ionicons name="time-outline" size={11} color="#D97706" />
                  <Text style={styles.aReceberLabel}>A receber: {formatCurrency(aReceberFiltered)}</Text>
                </View>
              )}
            </View>
            <Text style={[styles.totalPeriodValue, totalFiltered >= 0 ? styles.entradaText : styles.saidaText]}>
              {totalFiltered >= 0 ? '+' : ''}{formatCurrency(totalFiltered)}
            </Text>
          </View>
        )}

        {/* List */}
        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color="#1F2024" />
          </View>
        ) : (
          <FlatList
            data={filteredMovimentacoes}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons name="document-text-outline" size={48} color="#D1D5DB" />
                <Text style={styles.emptyText}>Nenhuma movimentação encontrada.</Text>
              </View>
            }
          />
        )}
      </View>

      <Modal visible={modalVisivel} transparent animationType="slide" onRequestClose={() => setModalVisivel(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editandoItem ? 'Editar Lançamento' : 'Novo Lançamento'}</Text>
              <TouchableOpacity onPress={() => setModalVisivel(false)}>
                <Ionicons name="close" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalContent}>
              <View style={styles.tipoContainer}>
                <TouchableOpacity
                  style={[styles.tipoBtn, modalTipo === 'entrada' && styles.tipoBtnEntrada]}
                  onPress={() => setModalTipo('entrada')}
                >
                  <Ionicons name="arrow-up" size={16} color={modalTipo === 'entrada' ? '#FFF' : '#16A34A'} />
                  <Text style={[styles.tipoBtnText, modalTipo === 'entrada' && { color: '#FFF' }]}>Entrada</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.tipoBtn, modalTipo === 'saida' && styles.tipoBtnSaida]}
                  onPress={() => setModalTipo('saida')}
                >
                  <Ionicons name="arrow-down" size={16} color={modalTipo === 'saida' ? '#FFF' : '#DC2626'} />
                  <Text style={[styles.tipoBtnText, modalTipo === 'saida' && { color: '#FFF' }]}>Saída</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.inputLabel}>Sugestões</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll}>
                {chipsDescricao.map(chip => (
                  <TouchableOpacity key={chip} style={styles.chip} onPress={() => setModalDescricao(chip)}>
                    <Text style={styles.chipText}>{chip}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={styles.inputLabel}>Descrição *</Text>
              <TextInput
                style={styles.modalInput}
                value={modalDescricao}
                onChangeText={setModalDescricao}
                placeholder="Ex: Pagamento de Luz"
              />

              <Text style={styles.inputLabel}>Valor Total (R$) *</Text>
              <TextInput
                style={styles.modalInput}
                value={modalValor}
                onChangeText={setModalValor}
                placeholder="0,00"
                keyboardType="numeric"
              />

              <Text style={styles.inputLabel}>Forma de Pagamento</Text>
              <View style={styles.formaPagContainer}>
                {(['dinheiro', 'debito', 'credito', 'a_prazo'] as FormaPagamento[]).map((fp) => (
                  <TouchableOpacity
                    key={fp}
                    style={[styles.formaPagBtn, modalFormaPag === fp && styles.formaPagBtnActive]}
                    onPress={() => setModalFormaPag(fp)}
                  >
                    <Text style={[styles.formaPagBtnText, modalFormaPag === fp && styles.formaPagBtnTextActive]}>
                      {fp.replace('_', ' ').toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {modalFormaPag === 'a_prazo' && (
                <>
                  <Text style={styles.inputLabel}>Data de Vencimento</Text>
                  <TextInput
                    style={styles.modalInput}
                    value={modalDataVenc}
                    onChangeText={setModalDataVenc}
                    placeholder="DD/MM/AAAA"
                    keyboardType="numbers-and-punctuation"
                  />
                </>
              )}

              <Text style={styles.inputLabel}>Status</Text>
              <View style={styles.statusContainer}>
                <TouchableOpacity
                  style={[styles.statusBtn, modalStatus === 'confirmado' && styles.statusBtnActive]}
                  onPress={() => setModalStatus('confirmado')}
                >
                  <Text style={[styles.statusBtnText, modalStatus === 'confirmado' && styles.statusBtnTextActive]}>Confirmado</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.statusBtn, modalStatus === 'pendente' && styles.statusBtnPendenteActive]}
                  onPress={() => setModalStatus('pendente')}
                >
                  <Text style={[styles.statusBtnText, modalStatus === 'pendente' && styles.statusBtnTextActive]}>Pendente</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.inputLabel}>Cliente / Fornecedor (Opcional)</Text>
              <TextInput
                style={styles.modalInput}
                value={modalCliente}
                onChangeText={setModalCliente}
                placeholder="Nome"
              />

              <Text style={styles.inputLabel}>Celular / Contato (Opcional)</Text>
              <TextInput
                style={styles.modalInput}
                value={modalCelular}
                onChangeText={setModalCelular}
                placeholder="(00) 00000-0000"
                keyboardType="phone-pad"
              />

            </ScrollView>

            <View style={styles.modalFooter}>
              {editandoItem && (
                <TouchableOpacity style={styles.btnExcluir} onPress={excluirModal}>
                  <Ionicons name="trash-outline" size={20} color="#DC2626" />
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.btnSalvar} onPress={salvarModal}>
                <Text style={styles.btnSalvarText}>Salvar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  novoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#16A34A',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
  },
  novoBtnText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    height: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  modalContent: {
    padding: 16,
    paddingBottom: 40,
  },
  tipoContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  tipoBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    gap: 6,
  },
  tipoBtnEntrada: {
    backgroundColor: '#16A34A',
    borderColor: '#16A34A',
  },
  tipoBtnSaida: {
    backgroundColor: '#DC2626',
    borderColor: '#DC2626',
  },
  tipoBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
    marginTop: 12,
    marginBottom: 6,
  },
  modalInput: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 48,
    fontSize: 16,
    color: '#111827',
  },
  chipsScroll: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  chip: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  chipText: {
    fontSize: 13,
    color: '#374151',
  },
  formaPagContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  formaPagBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#FFF',
  },
  formaPagBtnActive: {
    backgroundColor: '#1F2024',
    borderColor: '#1F2024',
  },
  formaPagBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
  },
  formaPagBtnTextActive: {
    color: '#FFF',
  },
  statusContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  statusBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  statusBtnActive: {
    backgroundColor: '#16A34A',
    borderColor: '#16A34A',
  },
  statusBtnPendenteActive: {
    backgroundColor: '#D97706',
    borderColor: '#D97706',
  },
  statusBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  statusBtnTextActive: {
    color: '#FFF',
  },
  modalFooter: {
    flexDirection: 'row',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    gap: 12,
  },
  btnExcluir: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#DC2626',
    borderRadius: 8,
  },
  btnSalvar: {
    flex: 1,
    backgroundColor: '#1F2024',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 8,
  },
  btnSalvarText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
  outerContainer: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
  },
  container: {
    flex: 1,
    width: '100%',
    maxWidth: 1000,
    backgroundColor: '#F3F4F6',
  },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 0 : 12,
    paddingBottom: 16,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backBtn: { padding: 4 },
  screenTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },

  filterSection: {
    backgroundColor: '#FFF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  filterTabs: {
    flexDirection: 'row',
    gap: 8,
  },
  filterTab: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
  },
  filterTabActive: {
    backgroundColor: '#1F2024',
  },
  filterTabText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6B7280',
  },
  filterTabTextActive: {
    color: '#FFF',
  },

  filterTabHeader: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  filterTabHeaderActive: {
    backgroundColor: '#1F2024',
    borderColor: '#1F2024',
  },
  filterTabTextHeader: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
  },
  filterTabTextHeaderActive: {
    color: '#FFF',
  },

  customDateContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginTop: 12,
    gap: 8,
  },
  dateInputWrapper: {
    flex: 1,
  },
  dateLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 4,
    fontWeight: '500',
  },
  dateInput: {
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 40,
    fontSize: 14,
    color: '#111827',
  },
  searchBtn: {
    height: 40,
    width: 44,
    backgroundColor: '#1F2024',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },

  totalPeriodContainer: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalPeriodLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  totalPeriodValue: {
    fontSize: 16,
    fontWeight: '800',
  },

  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },

  card: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  cardPendente: {
    borderLeftWidth: 3,
    borderLeftColor: '#D97706',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingRight: 10,
  },
  iconContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  entradaBg: { backgroundColor: '#ECFDF5' },
  saidaBg: { backgroundColor: '#FEF2F2' },
  cardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  discountBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  discountBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#D97706',
  },
  cardDate: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  pendenteBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  pendenteBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#D97706',
  },
  pendenteText: { color: '#D97706' },
  receberBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#16A34A',
    borderRadius: 10,
    paddingVertical: 10,
    marginBottom: 12,
  },
  receberBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFF',
  },
  aReceberLabel: {
    fontSize: 12,
    color: '#D97706',
    fontWeight: '600',
  },
  cardHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardValue: {
    fontSize: 15,
    fontWeight: '700',
  },
  entradaText: { color: '#16A34A' },
  saidaText: { color: '#DC2626' },

  expandedContent: {
    marginTop: 12,
  },
  divider: {
    height: 1,
    backgroundColor: '#F3F4F6',
    marginBottom: 12,
  },
  detailSectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  itemName: {
    fontSize: 14,
    color: '#111827',
  },
  itemQtd: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  itemPrice: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  discountContainer: {
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    padding: 12,
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#F3F4F6',
    gap: 4,
  },
  discountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  discountLabel: {
    fontSize: 12,
    color: '#6B7280',
  },
  discountValueStr: {
    fontSize: 12,
    fontWeight: '600',
    color: '#111827',
  },
  discountHighlight: {
    fontSize: 12,
    fontWeight: '700',
    color: '#D97706',
  },
  singleItemRow: {
    paddingVertical: 4,
  },
  itemInfoText: {
    fontSize: 14,
    color: '#4B5563',
    marginBottom: 4,
  },
  clienteInfoContainer: {
    marginBottom: 12,
  },
  clienteInfoText: {
    fontSize: 14,
    color: '#374151',
    marginBottom: 4,
  },

  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 15,
    color: '#6B7280',
    marginTop: 12,
  },
});
