import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import React, { useCallback, useMemo, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { LineChart } from 'react-native-chart-kit';

type TipoMovimentacao = 'entrada' | 'saida';
type FormaPagamento = 'dinheiro' | 'debito' | 'credito' | 'a_prazo';

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

interface DiaFinanceiro {
  key: string;
  label: string;
  timestamp: number;
  entradas: number;
  saidas: number;
}

function parseDecimal(value: string) {
  const trimmed = value.trim();
  const normalized = trimmed.includes(',')
    ? trimmed.replace(/\./g, '').replace(',', '.')
    : trimmed;

  return parseFloat(normalized);
}

function formatCurrency(value: number) {
  return `R$ ${value.toFixed(2).replace('.', ',')}`;
}

function getDayKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function formatShortDate(date: Date) {
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function formatDateTime(date: Date) {
  if (date.getTime() === 0) {
    return 'Agora';
  }

  return `${formatShortDate(date)} às ${String(date.getHours()).padStart(2, '0')}:${String(
    date.getMinutes()
  ).padStart(2, '0')}`;
}

function buildCumulativeChartData(movimentacoes: MovimentacaoFinanceira[]) {
  const sorted = [...movimentacoes].sort((a, b) => a.data - b.data);
  const daysMap = new Map<string, { label: string; timestamp: number; dayEntradas: number; daySaidas: number }>();

  sorted.forEach((item) => {
    if (item.status && item.status !== 'confirmado') return;

    const date = new Date(item.data);
    const key = getDayKey(date);
    const current = daysMap.get(key) ?? {
      label: formatShortDate(date),
      timestamp: date.getTime(),
      dayEntradas: 0,
      daySaidas: 0,
    };

    if (item.tipo === 'entrada') {
      current.dayEntradas += item.valorTotal;
    } else {
      current.daySaidas += item.valorTotal;
    }

    daysMap.set(key, current);
  });

  const sortedDays = Array.from(daysMap.values()).sort((a, b) => a.timestamp - b.timestamp);

  let runningInvested = 0;
  let runningSales = 0;

  const labels: string[] = [];
  const investedPoints: number[] = [];
  const salesPoints: number[] = [];

  sortedDays.forEach((day) => {
    runningInvested += day.daySaidas;
    runningSales += day.dayEntradas;

    labels.push(day.label);
    investedPoints.push(runningInvested);
    salesPoints.push(runningSales);
  });

  if (labels.length === 0) {
    return {
      labels: ['Hoje'],
      legend: ['Investido (Compras)', 'Vendas (Faturamento)'],
      datasets: [
        {
          data: [0],
          color: (opacity = 1) => `rgba(220, 38, 38, ${opacity})`,
          strokeWidth: 3,
        },
        {
          data: [0],
          color: (opacity = 1) => `rgba(22, 163, 74, ${opacity})`,
          strokeWidth: 3,
        },
      ],
    };
  }

  const sliceIndex = Math.max(0, labels.length - 6);

  return {
    labels: labels.slice(sliceIndex),
    legend: ['Investido (Compras)', 'Vendas (Faturamento)'],
    datasets: [
      {
        data: investedPoints.slice(sliceIndex),
        color: (opacity = 1) => `rgba(220, 38, 38, ${opacity})`,
        strokeWidth: 3,
      },
      {
        data: salesPoints.slice(sliceIndex),
        color: (opacity = 1) => `rgba(22, 163, 74, ${opacity})`,
        strokeWidth: 3,
      },
    ],
  };
}

export default function Financeiro() {
  const db = useSQLiteContext();
  const screenWidth = Math.min(Dimensions.get('window').width, 1000);
  const [movimentacoes, setMovimentacoes] = useState<MovimentacaoFinanceira[]>([]);
  const [loading, setLoading] = useState(true);
  const [lucroPadrao, setLucroPadrao] = useState(0);
  const [gastosInsumos, setGastosInsumos] = useState(0);
  const [lucroInput, setLucroInput] = useState('0');
  const [lucroModalVisible, setLucroModalVisible] = useState(false);
  const [savingLucro, setSavingLucro] = useState(false);

  const [modalLancamento, setModalLancamento] = useState(false);
  const [editandoItem, setEditandoItem] = useState<MovimentacaoFinanceira | null>(null);
  const [lancTipo, setLancTipo] = useState<'entrada' | 'saida'>('saida');
  const [lancDescricao, setLancDescricao] = useState('');
  const [lancValor, setLancValor] = useState('');
  const [lancForma, setLancForma] = useState<FormaPagamento>('dinheiro');
  const [lancVencimento, setLancVencimento] = useState('');
  const [lancStatus, setLancStatus] = useState<'confirmado' | 'pendente'>('confirmado');
  const [lancCliente, setLancCliente] = useState('');
  const [lancCelular, setLancCelular] = useState('');

  const carregarDadosFinanceiros = useCallback(async () => {
    setLoading(true);
    try {
      const list = await db.getAllAsync<MovimentacaoFinanceira>(
        'SELECT * FROM movimentacoes ORDER BY data DESC'
      );
      setMovimentacoes(list);

      const config = await db.getFirstAsync<{ lucroPercentual: number }>(
        "SELECT lucroPercentual FROM configuracoes WHERE id = '1'"
      );
      const lucro = typeof config?.lucroPercentual === 'number' ? config.lucroPercentual : 0;
      setLucroPadrao(lucro);
      setLucroInput(String(lucro).replace('.', ','));

      const insumosRes = await db.getFirstAsync<{ total: number }>(
        "SELECT COALESCE(SUM(valorTotal), 0) as total FROM movimentacoes WHERE tipo='saida' AND origem='compra_insumo'"
      );
      setGastosInsumos(insumosRes?.total || 0);
    } catch (e) {
      console.log('Erro ao carregar financeiro SQLite:', e);
    } finally {
      setLoading(false);
    }
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      carregarDadosFinanceiros();
    }, [carregarDadosFinanceiros])
  );

  const resumo = useMemo(() => {
    // Só conta movimentações confirmadas no saldo real
    const confirmadas = movimentacoes.filter(
      (m) => !m.status || m.status === 'confirmado'
    );
    const entradas = confirmadas.reduce(
      (acc, item) => acc + (item.tipo === 'entrada' ? item.valorTotal : 0),
      0
    );
    const saidas = confirmadas.reduce(
      (acc, item) => acc + (item.tipo === 'saida' ? item.valorTotal : 0),
      0
    );
    // Valores pendentes (a prazo não recebido)
    const aReceber = movimentacoes.reduce(
      (acc, item) =>
        acc + (item.status === 'pendente' && item.tipo === 'entrada' ? item.valorTotal : 0),
      0
    );
    const aPagar = movimentacoes.reduce(
      (acc, item) =>
        acc + (item.status === 'pendente' && item.tipo === 'saida' ? item.valorTotal : 0),
      0
    );

    return { entradas, saidas, saldo: entradas - saidas, aReceber, aPagar };
  }, [movimentacoes]);

  const chartData = useMemo(() => buildCumulativeChartData(movimentacoes), [movimentacoes]);
  const listaDetalhes = movimentacoes.slice(0, 4);

  const abrirModalLucro = () => {
    setLucroInput(String(lucroPadrao).replace('.', ','));
    setLucroModalVisible(true);
  };

  const abrirModalNovo = () => {
    setEditandoItem(null);
    setLancTipo('saida');
    setLancDescricao('');
    setLancValor('');
    setLancForma('dinheiro');
    setLancVencimento('');
    setLancStatus('confirmado');
    setLancCliente('');
    setLancCelular('');
    setModalLancamento(true);
  };

  const abrirModalEditar = (item: MovimentacaoFinanceira) => {
    setEditandoItem(item);
    setLancTipo(item.tipo);
    setLancDescricao(item.descricao);
    setLancValor(String(item.valorTotal).replace('.', ','));
    setLancForma(item.formaPagamento || 'dinheiro');
    setLancVencimento(item.dataVencimento ? new Date(item.dataVencimento).toLocaleDateString('pt-BR') : '');
    setLancStatus((item.status as 'confirmado' | 'pendente') || 'confirmado');
    setLancCliente(item.clienteNome || '');
    setLancCelular(item.clienteCelular || '');
    setModalLancamento(true);
  };

  const parseDataBR = (dataStr: string) => {
    const parts = dataStr.split('/');
    if (parts.length === 3) {
      return new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0])).getTime();
    }
    return null;
  };

  const salvarLancamento = async () => {
    if (!lancDescricao.trim()) {
      Alert.alert('Atenção', 'A descrição é obrigatória.');
      return;
    }
    const valor = parseDecimal(lancValor);
    if (isNaN(valor) || valor <= 0) {
      Alert.alert('Atenção', 'O valor deve ser maior que zero.');
      return;
    }
    let vencimentoTimestamp: number | null = null;
    if (lancForma === 'a_prazo' && lancVencimento) {
      vencimentoTimestamp = parseDataBR(lancVencimento);
      if (!vencimentoTimestamp) {
        Alert.alert('Atenção', 'Data de vencimento inválida.');
        return;
      }
    }

    try {
      if (editandoItem) {
        await db.runAsync(
          'UPDATE movimentacoes SET tipo=?, origem=?, descricao=?, valorTotal=?, formaPagamento=?, dataVencimento=?, status=?, clienteNome=?, clienteCelular=? WHERE id=?',
          [lancTipo, editandoItem.origem || 'manual', lancDescricao.trim(), valor, lancForma, vencimentoTimestamp, lancStatus, lancCliente.trim(), lancCelular.trim(), editandoItem.id]
        );
      } else {
        const novoId = Math.random().toString(36).substring(2, 9);
        await db.runAsync(
          'INSERT INTO movimentacoes (id, tipo, origem, data, valorTotal, descricao, itens, formaPagamento, dataVencimento, status, clienteNome, clienteCelular) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [novoId, lancTipo, 'manual', Date.now(), valor, lancDescricao.trim(), '[]', lancForma, vencimentoTimestamp, lancStatus, lancCliente.trim(), lancCelular.trim()]
        );
      }
      setModalLancamento(false);
      carregarDadosFinanceiros();
    } catch (e) {
      console.log('Erro ao salvar lancamento:', e);
      Alert.alert('Erro', 'Não foi possível salvar o lançamento.');
    }
  };

  const excluirLancamento = () => {
    if (!editandoItem) return;
    Alert.alert('Excluir Lançamento', 'Tem certeza que deseja excluir este lançamento?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          try {
            await db.runAsync('DELETE FROM movimentacoes WHERE id=?', [editandoItem.id]);
            setModalLancamento(false);
            carregarDadosFinanceiros();
          } catch (e) {
            console.log('Erro ao excluir:', e);
          }
        }
      }
    ]);
  };

  const salvarLucroPadrao = async () => {
    const lucro = parseDecimal(lucroInput);

    if (isNaN(lucro) || lucro < 0) {
      Alert.alert('Atenção', 'Insira uma porcentagem de lucro válida.');
      return;
    }

    setSavingLucro(true);
    try {
      await db.execAsync('BEGIN TRANSACTION');

      await db.runAsync("UPDATE configuracoes SET lucroPercentual = ? WHERE id = '1'", [lucro]);

      const produtos = await db.getAllAsync<{ id: string; precoCompra?: number }>(
        'SELECT id, precoCompra FROM produtos'
      );

      for (const p of produtos) {
        const pc = typeof p.precoCompra === 'number' ? p.precoCompra : 0;
        if (pc > 0) {
          const novoPreco = pc * (1 + lucro / 100);
          await db.runAsync('UPDATE produtos SET preco = ?, lucroPercentual = ? WHERE id = ?', [
            novoPreco,
            lucro,
            p.id,
          ]);
        }
      }

      await db.execAsync('COMMIT');

      setLucroPadrao(lucro);
      setLucroModalVisible(false);
      Alert.alert('Sucesso', 'Lucro ajustado e preços recalculados com sucesso!');
      carregarDadosFinanceiros();
    } catch (e: any) {
      await db.execAsync('ROLLBACK');
      console.log('Erro ao salvar lucro no SQLite:', e);
      Alert.alert('Erro', 'Não foi possível salvar a porcentagem de lucro.');
    } finally {
      setSavingLucro(false);
    }
  };

  const renderMovimentacao = ({ item }: { item: MovimentacaoFinanceira }) => {
    const isEntrada = item.tipo === 'entrada';
    const isPendente = item.status === 'pendente';
    const date = new Date(item.data);
    const fp = item.formaPagamento as FormaPagamento | undefined;
    const vencimento = item.dataVencimento ? new Date(item.dataVencimento) : null;

    return (
      <View style={[styles.movementCard, isPendente && styles.movementCardPendente]}>
        <View style={[styles.movementIcon, isEntrada ? styles.entradaIcon : styles.saidaIcon]}>
          <Ionicons
            name={isEntrada ? 'arrow-down-circle' : 'arrow-up-circle'}
            size={22}
            color={isEntrada ? '#16A34A' : '#DC2626'}
          />
        </View>

        <View style={styles.movementInfo}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <Text style={styles.movementTitle} numberOfLines={1}>
              {item.descricao}
            </Text>
            {isPendente && (
              <View style={styles.pendenteBadge}>
                <Ionicons name="time-outline" size={10} color="#D97706" />
                <Text style={styles.pendenteBadgeText}>
                  Pendente{vencimento ? ` – vence ${vencimento.toLocaleDateString('pt-BR')}` : ''}
                </Text>
              </View>
            )}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
            {fp && (
              <Ionicons name={PAGAMENTO_ICON[fp]} size={12} color={PAGAMENTO_COR[fp]} />
            )}
            <Text style={styles.movementDate}>
              {formatDateTime(date)}
              {item.clienteNome ? ` • ${item.clienteNome}` : ''}
            </Text>
          </View>
        </View>

        <View style={{ alignItems: 'flex-end', gap: 6 }}>
          <Text style={[styles.movementValue, isPendente ? styles.pendenteText : isEntrada ? styles.entradaText : styles.saidaText]}>
            {isEntrada ? '+' : '-'} {formatCurrency(item.valorTotal)}
          </Text>
          <TouchableOpacity onPress={() => abrirModalEditar(item)}>
            <Ionicons name="pencil" size={16} color="#6B7280" />
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.outerContainer}>
      <View style={styles.container}>
        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color="#1F2024" />
          </View>
        ) : (
          <FlatList
            data={listaDetalhes}
            keyExtractor={(item) => item.id}
            renderItem={renderMovimentacao}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
            ListHeaderComponent={
              <>
                <View style={styles.summaryGrid}>
                  <View style={styles.summaryCard}>
                    <Text style={styles.summaryLabel}>Entradas</Text>
                    <Text style={[styles.summaryValue, styles.entradaText]}>
                      {formatCurrency(resumo.entradas)}
                    </Text>
                  </View>
                  <View style={styles.summaryCard}>
                    <Text style={styles.summaryLabel}>Saídas</Text>
                    <Text style={[styles.summaryValue, styles.saidaText]}>
                      {formatCurrency(resumo.saidas)}
                    </Text>
                  </View>
                  <View style={styles.summaryCard}>
                    <Text style={styles.summaryLabel}>Saldo</Text>
                    <Text
                      style={[
                        styles.summaryValue,
                        resumo.saldo >= 0 ? styles.entradaText : styles.saidaText,
                      ]}
                    >
                      {formatCurrency(resumo.saldo)}
                    </Text>
                  </View>
                  <View style={styles.summaryCard}>
                    <Text style={styles.summaryLabel}>Lucro padrão</Text>
                    <Text style={styles.summaryValue}>{String(lucroPadrao).replace('.', ',')}%</Text>
                  </View>
                  <View style={[styles.summaryCard, { backgroundColor: '#FFFBEB', borderColor: '#FDE68A', borderWidth: 1.5 }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 }}>
                      <Text style={{ fontSize: 14 }}>🧅</Text>
                      <Text style={[styles.summaryLabel, { marginBottom: 0, color: '#D97706' }]}>Insumos</Text>
                    </View>
                    <Text style={[styles.summaryValue, { color: '#B45309' }]}>
                      {formatCurrency(gastosInsumos)}
                    </Text>
                  </View>
                  {resumo.aReceber > 0 && (
                    <View style={[styles.summaryCard, styles.summaryCardPendente]}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Ionicons name="time-outline" size={11} color="#D97706" />
                        <Text style={[styles.summaryLabel, { color: '#D97706' }]}>A Receber</Text>
                      </View>
                      <Text style={[styles.summaryValue, styles.pendenteText]}>
                        {formatCurrency(resumo.aReceber)}
                      </Text>
                    </View>
                  )}
                  {resumo.aPagar > 0 && (
                    <View style={[styles.summaryCard, styles.summaryCardPendentePagar]}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Ionicons name="warning-outline" size={11} color="#DC2626" />
                        <Text style={[styles.summaryLabel, { color: '#DC2626' }]}>A Pagar</Text>
                      </View>
                      <Text style={[styles.summaryValue, styles.saidaText]}>
                        {formatCurrency(resumo.aPagar)}
                      </Text>
                    </View>
                  )}
                </View>

                <View style={styles.chartContainer}>
                  <View style={styles.sectionHeader}>
                    <View>
                      <Text style={styles.sectionTitle}>Investimento vs Vendas</Text>
                      <Text style={styles.sectionSubtitle}>Investido (Vermelho) e Vendas (Verde)</Text>
                    </View>
                  </View>

                  {movimentacoes.length === 0 ? (
                    <View style={styles.emptyChart}>
                      <Ionicons name="stats-chart-outline" size={42} color="#9CA3AF" />
                      <Text style={styles.emptyTitle}>Sem movimentações</Text>
                      <Text style={styles.emptySubtitle}>
                        Compras e vendas aparecerão aqui automaticamente
                      </Text>
                    </View>
                  ) : (
                    <LineChart
                      data={chartData}
                      width={Math.min(screenWidth - 72, 850)}
                      height={240}
                      yAxisLabel="R$ "
                      yAxisSuffix=""
                      withInnerLines
                      withOuterLines={false}
                      withVerticalLines={false}
                      bezier
                      chartConfig={{
                        backgroundColor: '#FFFFFF',
                        backgroundGradientFrom: '#FFFFFF',
                        backgroundGradientTo: '#FFFFFF',
                        decimalPlaces: 0,
                        color: (opacity = 1) => `rgba(107, 114, 128, ${opacity})`,
                        labelColor: (opacity = 1) => `rgba(55, 65, 81, ${opacity})`,
                        propsForDots: {
                          r: '4',
                          strokeWidth: '2',
                          stroke: '#FFFFFF',
                        },
                      }}
                      style={styles.chart}
                    />
                  )}
                </View>

                <View style={styles.actionsRow}>
                  <TouchableOpacity style={styles.actionButton} onPress={abrirModalLucro}>
                    <Ionicons name="trending-up-outline" size={20} color="#FFFFFF" />
                    <Text style={styles.actionButtonText}>Ajustar lucro</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.actionButton,
                      styles.secondaryActionButton,
                      movimentacoes.length === 0 && styles.disabledLightButton,
                    ]}
                    onPress={() => router.push('/(drawer)/historico-financeiro')}
                    disabled={movimentacoes.length === 0}
                  >
                    <Ionicons name="list-outline" size={20} color="#1F2024" />
                    <Text style={styles.secondaryActionText}>
                      Ver histórico completo
                    </Text>
                  </TouchableOpacity>
                </View>

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <Text style={[styles.listTitle, { marginBottom: 0 }]}>Movimentações Recentes</Text>
                  <TouchableOpacity style={styles.novoBtn} onPress={abrirModalNovo}>
                    <Ionicons name="add-circle-outline" size={18} color="#FFF" />
                    <Text style={styles.novoBtnText}>Novo Lançamento</Text>
                  </TouchableOpacity>
                </View>
              </>
            }
            ListEmptyComponent={
              <View style={styles.emptyList}>
                <Text style={styles.emptyListText}>Nenhuma entrada ou saída registrada.</Text>
              </View>
            }
          />
        )}

        <Modal visible={lucroModalVisible} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Porcentagem de lucro</Text>
              <Text style={styles.modalDescription}>
                Esse percentual atualizará o preço de venda de todos os produtos do estoque atual com base em seus preços de compra.
              </Text>

              <View style={styles.inputWrap}>
                <TextInput
                  style={styles.input}
                  value={lucroInput}
                  onChangeText={setLucroInput}
                  keyboardType="decimal-pad"
                  placeholder="Ex: 30"
                  placeholderTextColor="#9CA3AF"
                  editable={!savingLucro}
                />
                <Text style={styles.percentSymbol}>%</Text>
              </View>

              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => setLucroModalVisible(false)}
                  disabled={savingLucro}
                >
                  <Text style={styles.cancelText}>Cancelar</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.saveButton, savingLucro && styles.disabledButton]}
                  onPress={salvarLucroPadrao}
                  disabled={savingLucro}
                >
                  {savingLucro ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Text style={styles.saveText}>Salvar</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        <Modal visible={modalLancamento} transparent animationType="fade">
          <View style={styles.modalOverlay}>
            <View style={[styles.modalContent, { maxWidth: 400 }]}>
              <Text style={styles.modalTitle}>{editandoItem ? 'Editar Lançamento' : 'Novo Lançamento'}</Text>
              
              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
                <TouchableOpacity style={[styles.toggleBtn, lancTipo === 'entrada' && styles.toggleBtnEntrada]} onPress={() => setLancTipo('entrada')}>
                  <Text style={[styles.toggleBtnText, lancTipo === 'entrada' && styles.toggleBtnTextActive]}>🟢 Receita</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.toggleBtn, lancTipo === 'saida' && styles.toggleBtnSaida]} onPress={() => setLancTipo('saida')}>
                  <Text style={[styles.toggleBtnText, lancTipo === 'saida' && styles.toggleBtnTextActive]}>🔴 Despesa</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.chipsContainer}>
                {(lancTipo === 'saida' ? ['Aluguel', 'Energia', 'Água/Esgoto', 'Gás', 'Salários', 'Fornecedor', 'Manutenção', 'Impostos'] : ['Venda Avulsa', 'Serviço', 'Aporte', 'Troco Inicial', 'Outra Receita']).map(chip => (
                  <TouchableOpacity key={chip} style={styles.chip} onPress={() => setLancDescricao(chip)}>
                    <Text style={styles.chipText}>{chip}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.inputWrap}>
                <TextInput style={styles.input} value={lancDescricao} onChangeText={setLancDescricao} placeholder="Descrição" placeholderTextColor="#9CA3AF" />
              </View>

              <View style={styles.inputWrap}>
                <TextInput style={styles.input} value={lancValor} onChangeText={setLancValor} keyboardType="decimal-pad" placeholder="Valor (R$)" placeholderTextColor="#9CA3AF" />
              </View>

              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
                {(['dinheiro', 'debito', 'credito', 'a_prazo'] as FormaPagamento[]).map(fp => (
                  <TouchableOpacity key={fp} style={[styles.chip, lancForma === fp && styles.chipActive]} onPress={() => setLancForma(fp)}>
                    <Text style={[styles.chipText, lancForma === fp && styles.chipTextActive]}>{fp === 'a_prazo' ? 'A Prazo' : fp.charAt(0).toUpperCase() + fp.slice(1)}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {lancForma === 'a_prazo' && (
                <View style={styles.inputWrap}>
                  <TextInput style={styles.input} value={lancVencimento} onChangeText={setLancVencimento} placeholder="Vencimento (DD/MM/AAAA)" placeholderTextColor="#9CA3AF" />
                </View>
              )}

              <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
                <TouchableOpacity style={[styles.toggleBtn, lancStatus === 'confirmado' && styles.toggleBtnActive]} onPress={() => setLancStatus('confirmado')}>
                  <Text style={[styles.toggleBtnText, lancStatus === 'confirmado' && styles.toggleBtnTextActive]}>Confirmado</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.toggleBtn, lancStatus === 'pendente' && styles.toggleBtnPendente]} onPress={() => setLancStatus('pendente')}>
                  <Text style={[styles.toggleBtnText, lancStatus === 'pendente' && styles.toggleBtnTextPendente]}>Pendente</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.inputWrap}>
                <TextInput style={styles.input} value={lancCliente} onChangeText={setLancCliente} placeholder="Cliente/Fornecedor (Opcional)" placeholderTextColor="#9CA3AF" />
              </View>
              <View style={styles.inputWrap}>
                <TextInput style={styles.input} value={lancCelular} onChangeText={setLancCelular} keyboardType="phone-pad" placeholder="Celular (Opcional)" placeholderTextColor="#9CA3AF" />
              </View>

              <View style={styles.modalButtons}>
                <TouchableOpacity style={styles.cancelButton} onPress={() => setModalLancamento(false)}>
                  <Text style={styles.cancelText}>Cancelar</Text>
                </TouchableOpacity>
                {editandoItem && (
                  <TouchableOpacity style={[styles.saveButton, { backgroundColor: '#DC2626', flex: 0.5 }]} onPress={excluirLancamento}>
                    <Ionicons name="trash" size={20} color="#FFF" />
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={styles.saveButton} onPress={salvarLancamento}>
                  <Text style={styles.saveText}>Salvar</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </View>
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
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listContent: {
    padding: 16,
    paddingBottom: 32,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 14,
  },
  summaryCard: {
    flex: 1,
    minWidth: 140,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  summaryLabel: {
    fontSize: 11,
    color: '#6B7280',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 6,
  },
  summaryValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  entradaText: {
    color: '#16A34A',
  },
  saidaText: {
    color: '#DC2626',
  },
  chartContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111827',
  },
  sectionSubtitle: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  chart: {
    borderRadius: 12,
    marginTop: 4,
  },
  emptyChart: {
    alignItems: 'center',
    paddingVertical: 28,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#111827',
    marginTop: 10,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 4,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 18,
  },
  actionButton: {
    flex: 1,
    minHeight: 52,
    borderRadius: 12,
    backgroundColor: '#1F2024',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 12,
  },
  secondaryActionButton: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
  },
  disabledLightButton: {
    opacity: 0.5,
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  secondaryActionText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1F2024',
  },
  listTitle: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 10,
  },
  movementCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  movementIcon: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  entradaIcon: {
    backgroundColor: '#DCFCE7',
  },
  saidaIcon: {
    backgroundColor: '#FEE2E2',
  },
  movementInfo: {
    flex: 1,
  },
  movementTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 2,
  },
  movementDate: {
    fontSize: 12,
    color: '#6B7280',
  },
  movementValue: {
    minWidth: 96,
    textAlign: 'right',
    fontSize: 13,
    fontWeight: '800',
  },
  emptyList: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 18,
    alignItems: 'center',
  },
  emptyListText: {
    fontSize: 13,
    color: '#6B7280',
  },
  movementCardPendente: {
    borderLeftWidth: 3,
    borderLeftColor: '#D97706',
  },
  summaryCardPendentePagar: {
    borderWidth: 1.5,
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
  },
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
    fontSize: 13,
    fontWeight: '700',
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 10,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    alignItems: 'center',
  },
  toggleBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#6B7280',
  },
  toggleBtnEntrada: {
    borderColor: '#16A34A',
    backgroundColor: '#DCFCE7',
  },
  toggleBtnSaida: {
    borderColor: '#DC2626',
    backgroundColor: '#FEE2E2',
  },
  toggleBtnTextActive: {
    color: '#111827',
  },
  toggleBtnActive: {
    borderColor: '#111827',
    backgroundColor: '#F3F4F6',
  },
  toggleBtnPendente: {
    borderColor: '#D97706',
    backgroundColor: '#FFFBEB',
  },
  toggleBtnTextPendente: {
    color: '#D97706',
  },
  chipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 14,
  },
  chip: {
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  chipText: {
    fontSize: 12,
    color: '#4B5563',
  },
  chipActive: {
    backgroundColor: '#111827',
    borderColor: '#111827',
  },
  chipTextActive: {
    color: '#FFF',
  },
  summaryCardPendente: {
    borderWidth: 1.5,
    borderColor: '#FDE68A',
    backgroundColor: '#FFFBEB',
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
  pendenteText: {
    color: '#D97706',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(17, 24, 39, 0.48)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 22,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 8,
  },
  modalTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 6,
  },
  modalDescription: {
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 19,
    marginBottom: 18,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    paddingRight: 14,
    marginBottom: 20,
  },
  input: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 17,
    color: '#111827',
  },
  percentSymbol: {
    fontSize: 17,
    fontWeight: '800',
    color: '#6B7280',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  cancelButton: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveButton: {
    flex: 1.4,
    backgroundColor: '#1F2024',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  disabledButton: {
    opacity: 0.6,
  },
  cancelText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#374151',
  },
  saveText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
