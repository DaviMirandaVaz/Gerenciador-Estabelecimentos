import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import * as Crypto from 'expo-crypto';
import React, { useEffect, useRef, useState } from 'react';
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
  precoCompra?: number;
  lucroPercentual?: number;
  quantidade: number;
  codigoBarras?: string;
  tipo?: string;
}

interface ItemCarrinho {
  produto: Produto;
  qtdVenda: number;
}

function ModalSelecionarProduto({
  visible,
  onClose,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (produto: Produto) => void;
}) {
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [busca, setBusca] = useState('');
  const [loading, setLoading] = useState(false);

  const db = useSQLiteContext();

  const carregarProdutos = async () => {
    setLoading(true);
    try {
      const lista = await db.getAllAsync<Produto>('SELECT * FROM produtos WHERE tipo != \'insumo\' ORDER BY nome ASC');
      setProdutos(lista);
    } catch (e) {
      console.log('Erro ao carregar produtos:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (visible) {
      setBusca('');
      carregarProdutos();
    }
  }, [visible]);

  const filtrados = produtos.filter((p) => {
    const termo = busca.toLowerCase().trim();
    const nomeMatch = p.nome.toLowerCase().includes(termo);
    const codigoMatch = p.codigoBarras ? p.codigoBarras.toLowerCase().includes(termo) : false;
    return nomeMatch || codigoMatch;
  });

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalSheet}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Selecionar Item / Produto</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color="#6B7280" />
            </TouchableOpacity>
          </View>

          <View style={styles.searchBox}>
            <Ionicons name="search" size={18} color="#9CA3AF" style={{ marginRight: 8 }} />
            <TextInput
              style={styles.searchInput}
              placeholder="Buscar por nome ou código de barras..."
              placeholderTextColor="#9CA3AF"
              value={busca}
              onChangeText={setBusca}
            />
          </View>

          {loading ? (
            <ActivityIndicator size="large" color="#1F2024" style={{ marginTop: 32 }} />
          ) : filtrados.length === 0 ? (
            <View style={styles.emptyModal}>
              <Text style={styles.emptyModalText}>
                {produtos.length === 0 ? 'Nenhum produto cadastrado no estoque' : 'Nenhum item encontrado'}
              </Text>
            </View>
          ) : (
            <FlatList
              data={filtrados}
              keyExtractor={(item) => item.id}
              showsVerticalScrollIndicator={false}
              renderItem={({ item }) => {
                const semEstoque = item.tipo !== 'produto_sem_estoque' && item.quantidade <= 0;
                return (
                  <TouchableOpacity
                    style={[styles.produtoRow, semEstoque && styles.produtoRowDisabled]}
                    onPress={() => {
                      if (!semEstoque) {
                        onSelect(item);
                        onClose();
                      }
                    }}
                    disabled={semEstoque}
                  >
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[styles.produtoNome, semEstoque && { color: '#9CA3AF' }]}
                        numberOfLines={1}
                      >
                        {item.nome}
                      </Text>
                      <Text style={styles.produtoPreco}>
                        R$ {item.preco.toFixed(2).replace('.', ',')}
                        {item.codigoBarras ? ` • Cód: ${item.codigoBarras}` : ''}
                      </Text>
                    </View>
                    <View style={[styles.estoqueTag, semEstoque && styles.estoqueTagZero]}>
                      <Text style={[styles.estoqueTagText, semEstoque && styles.estoqueTagTextZero]}>
                        {semEstoque ? 'Sem estoque' : `${item.quantidade} em estoque`}
                      </Text>
                    </View>
                    {!semEstoque && (
                      <Ionicons name="add-circle" size={28} color="#1F2024" style={{ marginLeft: 8 }} />
                    )}
                  </TouchableOpacity>
                );
              }}
            />
          )}
        </View>
      </View>
    </Modal>
  );
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

function ModalConfirmarBalcao({
  visible,
  total,
  desconto,
  setDesconto,
  itens,
  finalizando,
  onCancelar,
  onConfirmar,
}: {
  visible: boolean;
  total: number;
  desconto: string;
  setDesconto: (v: string) => void;
  itens: ItemCarrinho[];
  finalizando: boolean;
  onCancelar: () => void;
  onConfirmar: (forma: FormaPagamento, prazoTs: number | null, clienteNome?: string, clienteCelular?: string) => void;
}) {
  const descontoNum = parseDecimal(desconto);
  const descontoValido = !isNaN(descontoNum) && descontoNum >= 0 ? descontoNum : 0;
  const valorDesconto = (total * descontoValido) / 100;
  const totalComDesconto = Math.max(0, total - valorDesconto);

  const [forma, setForma] = useState<FormaPagamento>('dinheiro');
  const [prazoStr, setPrazoStr] = useState('');
  const [clienteNome, setClienteNome] = useState('');
  const [clienteCelular, setClienteCelular] = useState('');

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

  useEffect(() => {
    if (!visible) {
      setForma('dinheiro');
      setPrazoStr('');
      setClienteNome('');
      setClienteCelular('');
    }
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancelar}>
      <View style={styles.confirmOverlay}>
        <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24 }}>
          <View style={styles.confirmBox}>
            <Text style={styles.confirmTitle}>Confirmar Venda de Balcão</Text>

            <View style={styles.confirmList}>
              {itens.map((item) => (
                <View key={item.produto.id} style={styles.confirmItem}>
                  <Text style={styles.confirmItemNome} numberOfLines={1}>
                    {item.produto.nome}
                  </Text>
                  <Text style={styles.confirmItemQtd}>x{item.qtdVenda}</Text>
                  <Text style={styles.confirmItemVal}>
                    R$ {(item.produto.preco * item.qtdVenda).toFixed(2).replace('.', ',')}
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
              <Text style={styles.confirmTotalLabel}>Total a Pagar</Text>
              <Text style={styles.confirmTotalVal}>
                R$ {totalComDesconto.toFixed(2).replace('.', ',')}
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
                    <Ionicons name={fp.icon} size={22} color={selected ? fp.color : '#9CA3AF'} />
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
              <View style={styles.prazoContainer}>
                <Ionicons name="person-outline" size={18} color="#4B5563" />
                <TextInput
                  style={styles.prazoInput}
                  placeholder="Nome do Cliente (Opcional)"
                  placeholderTextColor="#9CA3AF"
                  value={clienteNome}
                  onChangeText={setClienteNome}
                />
              </View>
            </View>

            <View style={styles.confirmBtns}>
              <TouchableOpacity
                style={styles.confirmCancelBtn}
                onPress={onCancelar}
                disabled={finalizando}
              >
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
                  <Text style={styles.confirmOkText}>Finalizar Venda</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

export default function Balcao() {
  const [carrinho, setCarrinho] = useState<ItemCarrinho[]>([]);
  const [modalProduto, setModalProduto] = useState(false);
  const [modalConfirmar, setModalConfirmar] = useState(false);
  const [finalizando, setFinalizando] = useState(false);
  const [scannerVisible, setScannerVisible] = useState(false);
  const [codigoBarrasManual, setCodigoBarrasManual] = useState('');
  const [desconto, setDesconto] = useState('');
  const [permission, requestPermission] = useCameraPermissions();
  const isProcessingScan = useRef(false);

  const db = useSQLiteContext();

  const adicionarProduto = (produto: Produto) => {
    setCarrinho((prev) => {
      const existe = prev.find((i) => i.produto.id === produto.id);
      if (existe) {
        if (produto.tipo !== 'produto_sem_estoque' && existe.qtdVenda >= produto.quantidade) {
          Alert.alert('Atenção', `Estoque máximo disponível: ${produto.quantidade}`);
          return prev;
        }
        return prev.map((i) =>
          i.produto.id === produto.id ? { ...i, qtdVenda: i.qtdVenda + 1 } : i
        );
      }
      return [...prev, { produto, qtdVenda: 1 }];
    });
  };

  const alterarQtd = (id: string, delta: number) => {
    setCarrinho((prev) =>
      prev
        .map((i) => {
          if (i.produto.id !== id) return i;
          const nova = i.qtdVenda + delta;
          if (nova <= 0) return null as any;
          if (i.produto.tipo !== 'produto_sem_estoque' && nova > i.produto.quantidade) {
            Alert.alert('Atenção', `Estoque máximo disponível: ${i.produto.quantidade}`);
            return i;
          }
          return { ...i, qtdVenda: nova };
        })
        .filter(Boolean)
    );
  };

  const removerItem = (id: string) =>
    setCarrinho((prev) => prev.filter((i) => i.produto.id !== id));

  const totalVenda = carrinho.reduce((acc, i) => acc + i.produto.preco * i.qtdVenda, 0);

  const handleOpenScanner = async () => {
    if (!permission?.granted) {
      const response = await requestPermission();
      if (!response.granted) {
        Alert.alert('Atenção', 'Você precisa conceder permissão de câmera para usar o scanner.');
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
        Alert.alert('Não encontrado', 'Nenhum produto com este código foi encontrado no estoque.');
        setTimeout(() => { isProcessingScan.current = false; }, 2000);
      } else if (prod.tipo === 'insumo') {
        Alert.alert('Insumo registrado', 'Insumos são ingredientes/matéria-prima e não podem ser vendidos no balcão.');
        setTimeout(() => { isProcessingScan.current = false; }, 2000);
      } else {
        if (prod.tipo !== 'produto_sem_estoque' && prod.quantidade <= 0) {
           Alert.alert('Sem estoque', `O produto "${prod.nome}" está sem estoque.`);
           setTimeout(() => { isProcessingScan.current = false; }, 2000);
        } else {
           adicionarProduto(prod);
           setScannerVisible(false);
           setTimeout(() => { isProcessingScan.current = false; }, 500);
        }
      }
    } catch (e) {
      console.log('Erro ao buscar código de barras:', e);
      Alert.alert('Erro', 'Não foi possível buscar o produto escaneado.');
      setTimeout(() => { isProcessingScan.current = false; }, 2000);
    }
  };

  const handleManualBarcodeSubmit = () => {
    if (codigoBarrasManual.trim() === '') return;
    handleBarcodeScanned({ data: codigoBarrasManual.trim() });
    setCodigoBarrasManual('');
  };

  const executarVenda = async (forma: FormaPagamento, prazoTs: number | null, clienteNome?: string, clienteCelular?: string) => {
    setFinalizando(true);
    try {
      await db.execAsync('BEGIN TRANSACTION');

      const leituras: any[] = [];

      for (const item of carrinho) {
        const data = await db.getFirstAsync<{ quantidade: number, preco: number, tipo?: string }>('SELECT quantidade, preco, tipo FROM produtos WHERE id = ?', [item.produto.id]);

        if (!data) {
          throw new Error(`Produto "${item.produto.nome}" não encontrado no estoque.`);
        }

        const qtdAtual = data.quantidade;
        if (data.tipo !== 'produto_sem_estoque' && qtdAtual < item.qtdVenda) {
          throw new Error(`"${item.produto.nome}" tem apenas ${qtdAtual} unidade(s) disponível(is).`);
        }

        leituras.push({
          id: item.produto.id,
          qtdAtual,
          qtdVenda: item.qtdVenda,
          nome: item.produto.nome,
          precoVenda: data.preco,
          tipo: data.tipo
        });
      }

      const totalItensBruto = leituras.reduce(
        (acc, item) => acc + item.precoVenda * item.qtdVenda,
        0
      );
      const descNum = parseDecimal(desconto);
      const descValido = !isNaN(descNum) && descNum >= 0 ? descNum : 0;
      const valorDesconto = (totalItensBruto * descValido) / 100;
      const totalVendaConfirmada = Math.max(0, totalItensBruto - valorDesconto);

      for (const l of leituras) {
        if (l.tipo !== 'produto_sem_estoque') {
          await db.runAsync('UPDATE produtos SET quantidade = ? WHERE id = ?', [l.qtdAtual - l.qtdVenda, l.id]);
        }
      }

      const formaLabel: Record<FormaPagamento, string> = {
        dinheiro: 'Dinheiro',
        debito:   'Débito',
        credito:  'Crédito',
        a_prazo:  'A Prazo',
      };

      let descricao = leituras.length === 1
        ? `Balcão - ${leituras[0].nome}`
        : `Balcão - ${leituras.length} produtos`;

      if (descValido > 0) {
        descricao += ` (Desc. ${descValido}% = -R$ ${valorDesconto.toFixed(2).replace('.', ',')})`;
      }

      descricao += ` [${formaLabel[forma]}]`;

      const status = forma === 'a_prazo' ? 'pendente' : 'confirmado';

      const payloadItens = {
        descontoPercentual: descValido,
        valorDesconto: valorDesconto,
        totalBruto: totalItensBruto,
        formaPagamento: forma,
        dataVencimento: prazoTs,
        produtos: leituras.map((item) => ({
          produtoId: item.id,
          produtoNome: item.nome,
          quantidade: item.qtdVenda,
          precoVenda: item.precoVenda,
        })),
      };

      const itensJson = JSON.stringify(payloadItens);

      await db.runAsync(
        `INSERT INTO movimentacoes (id, tipo, origem, data, valorTotal, descricao, itens, formaPagamento, dataVencimento, status, clienteNome, clienteCelular)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          Crypto.randomUUID(),
          'entrada',
          'venda_balcao',
          Date.now(),
          totalVendaConfirmada,
          descricao,
          itensJson,
          forma,
          prazoTs,
          status,
          clienteNome || null,
          clienteCelular || null,
        ]
      );

      await db.execAsync('COMMIT');

      setModalConfirmar(false);
      setCarrinho([]);
      setDesconto('');

      Alert.alert(
        'Venda de Balcão Finalizada!',
        `Total: R$ ${totalVendaConfirmada.toFixed(2).replace('.', ',')}\n\nEstoque atualizado e venda lançada no Financeiro com sucesso.`,
        [{ text: 'OK', onPress: () => router.push('/(drawer)/home') }]
      );
    } catch (e: any) {
      await db.execAsync('ROLLBACK');
      console.log('Erro ao finalizar venda de balcão:', e);
      Alert.alert('Erro', e?.message ?? 'Não foi possível finalizar a venda.');
    } finally {
      setFinalizando(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.push('/(drawer)/home')} style={styles.backBtn}>
          <Ionicons name="arrow-back-circle-outline" size={30} color="#1F2024" />
        </TouchableOpacity>
        <Text style={styles.screenTitle}>Venda de Balcão</Text>
        <View style={{ width: 30 }} />
      </View>

      <View style={styles.barcodeInputContainer}>
        <Ionicons name="barcode-outline" size={20} color="#9CA3AF" style={{ marginRight: 8 }} />
        <TextInput
          style={styles.barcodeInput}
          placeholder="Use o leitor ou digite o código do produto..."
          placeholderTextColor="#9CA3AF"
          value={codigoBarrasManual}
          onChangeText={setCodigoBarrasManual}
          onSubmitEditing={handleManualBarcodeSubmit}
          returnKeyType="search"
        />
        {codigoBarrasManual.length > 0 && (
          <TouchableOpacity onPress={handleManualBarcodeSubmit} style={styles.barcodeInputBtn}>
            <Ionicons name="return-down-forward" size={20} color="#FFF" />
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {carrinho.length === 0 ? (
          <View style={styles.emptyCarrinho}>
            <Ionicons name="fast-food-outline" size={56} color="#9CA3AF" style={{ marginBottom: 12 }} />
            <Text style={styles.emptyCarrinhoText}>Pedido de balcão vazio</Text>
            <Text style={styles.emptyCarrinhoSub}>
              Adicione os itens do cliente para realizar o atendimento rápido
            </Text>
          </View>
        ) : (
          <>
            {carrinho.map((item) => (
              <View key={item.produto.id} style={styles.itemCard}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemNome} numberOfLines={1}>
                    {item.produto.nome}
                  </Text>
                  <Text style={styles.itemPrecoUnit}>
                    R$ {item.produto.preco.toFixed(2).replace('.', ',')} / unid.
                  </Text>
                </View>

                <View style={styles.qtyRow}>
                  <Pressable onPress={() => alterarQtd(item.produto.id, -1)} style={styles.qtyBtn}>
                    <Ionicons name="remove" size={18} color="#1F2024" />
                  </Pressable>
                  <Text style={styles.qtyNum}>{item.qtdVenda}</Text>
                  <Pressable onPress={() => alterarQtd(item.produto.id, +1)} style={styles.qtyBtn}>
                    <Ionicons name="add" size={18} color="#1F2024" />
                  </Pressable>
                </View>

                <Text style={styles.itemSubtotal}>
                  R$ {(item.produto.preco * item.qtdVenda).toFixed(2).replace('.', ',')}
                </Text>

                <Pressable onPress={() => removerItem(item.produto.id)} style={styles.removeBtn}>
                  <Ionicons name="trash-outline" size={18} color="#DC2626" />
                </Pressable>
              </View>
            ))}

            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total do Balcão</Text>
              <Text style={styles.totalValue}>
                R$ {totalVenda.toFixed(2).replace('.', ',')}
              </Text>
            </View>
          </>
        )}
      </ScrollView>

      <View style={styles.addSection}>
        <View style={styles.separator} />
        <TouchableOpacity
          style={styles.addManualBtn}
          onPress={() => setModalProduto(true)}
        >
          <Ionicons name="add-circle" size={26} color="#1F2024" />
          <Text style={styles.addManualText}>Adicionar item do cardápio</Text>
        </TouchableOpacity>
        <View style={styles.separator} />
      </View>

      <View style={styles.bottomButtons}>
        <TouchableOpacity
          style={[styles.bottomBtn, styles.scannerBtn]}
          onPress={handleOpenScanner}
        >
          <Ionicons name="barcode-outline" size={20} color="#1F2024" />
          <Text style={[styles.scannerText, { color: '#1F2024' }]}>Escanear</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.bottomBtn,
            styles.finalizarBtn,
            carrinho.length === 0 && styles.finalizarBtnDisabled,
          ]}
          onPress={() => {
            if (carrinho.length === 0) {
              Alert.alert('Atenção', 'Adicione ao menos um item ao pedido.');
              return;
            }
            setModalConfirmar(true);
          }}
          disabled={carrinho.length === 0}
        >
          <Ionicons name="checkmark-circle-outline" size={20} color="#FFF" />
          <Text style={styles.finalizarText}>Receber e Concluir</Text>
        </TouchableOpacity>
      </View>

      <ModalSelecionarProduto
        visible={modalProduto}
        onClose={() => setModalProduto(false)}
        onSelect={adicionarProduto}
      />

      <ModalConfirmarBalcao
        visible={modalConfirmar}
        total={totalVenda}
        desconto={desconto}
        setDesconto={setDesconto}
        itens={carrinho}
        finalizando={finalizando}
        onCancelar={() => { if (!finalizando) setModalConfirmar(false); }}
        onConfirmar={executarVenda}
      />

      <Modal visible={scannerVisible} animationType="slide" onRequestClose={() => setScannerVisible(false)}>
        <View style={styles.scannerContainer}>
          <View style={styles.scannerHeader}>
            <TouchableOpacity onPress={() => setScannerVisible(false)} style={styles.scannerCloseBtn}>
              <Ionicons name="close" size={24} color="#FFF" />
            </TouchableOpacity>
            <Text style={styles.scannerTitle}>Escanear Código</Text>
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 44 : 12,
    paddingBottom: 12,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  backBtn: { padding: 4 },
  screenTitle: { fontSize: 18, fontWeight: '700', color: '#1F2024' },
  barcodeInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    marginHorizontal: 16,
    marginTop: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    height: 48,
  },
  barcodeInput: { flex: 1, height: '100%', fontSize: 14, color: '#1F2024' },
  barcodeInputBtn: {
    backgroundColor: '#1F2024',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 24 },
  emptyCarrinho: { alignItems: 'center', justifyContent: 'center', paddingVertical: 48 },
  emptyCarrinhoText: { fontSize: 16, fontWeight: '700', color: '#374151', marginBottom: 4 },
  emptyCarrinhoSub: { fontSize: 13, color: '#9CA3AF', textAlign: 'center', paddingHorizontal: 24 },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  itemNome: { fontSize: 15, fontWeight: '600', color: '#1F2024', marginBottom: 2 },
  itemPrecoUnit: { fontSize: 12, color: '#6B7280' },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    marginHorizontal: 10,
    paddingHorizontal: 4,
  },
  qtyBtn: { padding: 6 },
  qtyNum: { fontSize: 14, fontWeight: '700', color: '#1F2024', minWidth: 22, textAlign: 'center' },
  itemSubtotal: { fontSize: 15, fontWeight: '700', color: '#1F2024', minWidth: 70, textAlign: 'right' },
  removeBtn: { padding: 6, marginLeft: 8 },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  totalLabel: { fontSize: 16, fontWeight: '600', color: '#374151' },
  totalValue: { fontSize: 20, fontWeight: '800', color: '#1F2024' },
  addSection: { paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#FFF' },
  separator: { height: 1, backgroundColor: '#F3F4F6' },
  addManualBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  addManualText: { fontSize: 15, fontWeight: '600', color: '#1F2024' },
  bottomButtons: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    backgroundColor: '#FFF',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  bottomBtn: {
    flex: 1,
    flexDirection: 'row',
    height: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  scannerBtn: { backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#D1D5DB' },
  scannerText: { fontSize: 15, fontWeight: '600' },
  finalizarBtn: { backgroundColor: '#16A34A' },
  finalizarBtnDisabled: { backgroundColor: '#9CA3AF', opacity: 0.7 },
  finalizarText: { fontSize: 15, fontWeight: '700', color: '#FFF' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '80%',
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  modalTitle: { fontSize: 17, fontWeight: '700', color: '#1F2024' },
  closeBtn: { padding: 4 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 42,
    marginBottom: 12,
  },
  searchInput: { flex: 1, fontSize: 14, color: '#1F2024' },
  emptyModal: { paddingVertical: 32, alignItems: 'center' },
  emptyModalText: { fontSize: 14, color: '#6B7280' },
  produtoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  produtoRowDisabled: { opacity: 0.5 },
  produtoNome: { fontSize: 15, fontWeight: '600', color: '#1F2024' },
  produtoPreco: { fontSize: 13, color: '#6B7280', marginTop: 2 },
  estoqueTag: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    marginLeft: 8,
  },
  estoqueTagZero: { backgroundColor: '#FEE2E2' },
  estoqueTagText: { fontSize: 11, fontWeight: '600', color: '#15803D' },
  estoqueTagTextZero: { color: '#B91C1C' },
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
