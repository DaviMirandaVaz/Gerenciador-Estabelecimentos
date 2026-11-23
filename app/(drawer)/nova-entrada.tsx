import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import * as Crypto from 'expo-crypto';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
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

function formatCurrency(value: number) {
  return value.toFixed(2).replace('.', ',');
}

export default function NovaEntrada() {
  const db = useSQLiteContext();
  const [nome, setNome] = useState('');
  const [precoCompra, setPrecoCompra] = useState('');
  const [lucroPercentual, setLucroPercentual] = useState('0');
  const [quantidade, setQuantidade] = useState('');
  const [codigoBarras, setCodigoBarras] = useState('');
  const [tipoSelecionado, setTipoSelecionado] = useState<'produto' | 'produto_sem_estoque' | 'insumo'>('produto');
  const [loading, setLoading] = useState(false);
  const [successVisible, setSuccessVisible] = useState(false);
  const [scannerVisible, setScannerVisible] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const [lastCreatedProduct, setLastCreatedProduct] = useState<{
    nome: string;
    codigoBarras: string;
    precoVenda: number;
    quantidade: number;
  } | null>(null);
  const successTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const loadStoreConfig = async () => {
      try {
        const config = await db.getFirstAsync<{ lucroPercentual: number }>(
          "SELECT lucroPercentual FROM configuracoes WHERE id = '1'"
        );
        if (config && typeof config.lucroPercentual === 'number') {
          setLucroPercentual(String(config.lucroPercentual).replace('.', ','));
        }
      } catch (e) {
        console.log('Erro ao carregar taxa de lucro:', e);
      }
    };

    loadStoreConfig();

    return () => {
      if (successTimeoutRef.current) {
        clearTimeout(successTimeoutRef.current);
      }
    };
  }, [db]);

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

  const handleSalvar = async () => {
    if (!nome.trim()) {
      Alert.alert('Atenção', 'O nome do produto não pode ser vazio.');
      return;
    }

    const precoCompraNum = precoCompra.trim() ? parseDecimal(precoCompra) : 0;
    const lucroNum = lucroPercentual.trim() ? parseDecimal(lucroPercentual) : 0;
    const qtdNum = quantidade.trim() ? parseInt(quantidade, 10) : 0;
    const precoVendaNum = precoCompraNum * (1 + lucroNum / 100);

    if (tipoSelecionado !== 'insumo' && (isNaN(precoVendaNum) || precoVendaNum <= 0)) {
      Alert.alert('Atenção', 'O preço de venda deve ser maior que zero.');
      return;
    }

    if (tipoSelecionado === 'insumo' && (isNaN(precoCompraNum) || precoCompraNum <= 0)) {
      Alert.alert('Atenção', 'O preço de compra deve ser maior que zero para insumos.');
      return;
    }

    if ((tipoSelecionado === 'produto' || tipoSelecionado === 'insumo') && (isNaN(qtdNum) || qtdNum <= 0)) {
      Alert.alert('Atenção', 'A quantidade deve ser maior que zero.');
      return;
    }

    setLoading(true);
    try {
      await db.execAsync('BEGIN TRANSACTION');

      const valorCompraTotal = precoCompraNum * qtdNum;
      const produtoId = Crypto.randomUUID();
      const codigo = codigoBarras.trim() || String(Math.floor(100000000000 + Math.random() * 900000000000));

      setLastCreatedProduct({
        nome: nome.trim(),
        codigoBarras: codigo,
        precoVenda: tipoSelecionado === 'insumo' ? 0 : precoVendaNum,
        quantidade: tipoSelecionado === 'produto_sem_estoque' ? 0 : qtdNum,
      });

      // Salva produto no banco local
      await db.runAsync(
        'INSERT INTO produtos (id, codigoBarras, nome, preco, quantidade, criadoEm, precoCompra, lucroPercentual, codigoRef, tipo) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          produtoId,
          codigo,
          nome.trim(),
          tipoSelecionado === 'insumo' ? 0 : precoVendaNum,
          tipoSelecionado === 'produto_sem_estoque' ? 0 : qtdNum,
          Date.now(),
          precoCompraNum,
          tipoSelecionado === 'insumo' ? 0 : lucroNum,
          null,
          tipoSelecionado,
        ]
      );

      if (tipoSelecionado === 'insumo') {
        await db.runAsync(
          "INSERT INTO movimentacoes (id, tipo, origem, data, valorTotal, descricao, itens, formaPagamento, status) VALUES (?, 'saida', 'compra_insumo', ?, ?, ?, '[]', 'dinheiro', 'confirmado')",
          [
            Crypto.randomUUID(),
            Date.now(),
            valorCompraTotal,
            `Compra de insumo: ${nome.trim()}`
          ]
        );
      } else if (tipoSelecionado === 'produto') {
        const itensJson = JSON.stringify([
          {
            produtoId,
            produtoNome: nome.trim(),
            quantidade: qtdNum,
            precoCompra: precoCompraNum,
          },
        ]);

        // Registra saída financeira no banco local
        await db.runAsync(
          'INSERT INTO movimentacoes (id, tipo, origem, data, valorTotal, descricao, itens) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [
            Crypto.randomUUID(),
            'saida',
            'compra_estoque',
            Date.now(),
            valorCompraTotal,
            `Compra de estoque - ${nome.trim()}`,
            itensJson,
          ]
        );
      }

      await db.execAsync('COMMIT');

      setNome('');
      setPrecoCompra('');
      setQuantidade('');
      setCodigoBarras('');
      setSuccessVisible(true);

      // if (successTimeoutRef.current) {
      //   clearTimeout(successTimeoutRef.current);
      // }

      // successTimeoutRef.current = setTimeout(() => {
      //   setSuccessVisible(false);
      //   router.replace('/(drawer)/estoque-detalhe');
      // }, 1200);
    } catch (e: any) {
      await db.execAsync('ROLLBACK');
      console.log('Erro ao salvar produto no SQLite:', e);
      Alert.alert('Erro', 'Não foi possível salvar o produto.');
    } finally {
      setLoading(false);
    }
  };

  const precoCompraPreview = parseDecimal(precoCompra);
  const lucroPreview = parseDecimal(lucroPercentual);
  const precoVendaPreview =
    tipoSelecionado !== 'insumo' && !isNaN(precoCompraPreview) && !isNaN(lucroPreview)
      ? precoCompraPreview * (1 + lucroPreview / 100)
      : 0;
  const totalCompraPreview =
    tipoSelecionado !== 'produto_sem_estoque' && !isNaN(precoCompraPreview) && !isNaN(parseInt(quantidade, 10))
      ? precoCompraPreview * parseInt(quantidade, 10)
      : 0;

  return (
    <KeyboardAvoidingView
      style={styles.wrapper}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.innerContainer}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Adicionar Produto</Text>
            <Text style={styles.subtitle}>Preencha os dados do novo produto para o estoque</Text>
          </View>

          {/* Card do formulário */}
          <View style={styles.card}>
            {/* Type Selector */}
            <View style={styles.typeSelectorContainer}>
              <View style={styles.typeSelectorRow}>
                <TouchableOpacity
                  style={[styles.typeChip, tipoSelecionado === 'produto' && styles.typeChipSelected]}
                  onPress={() => setTipoSelecionado('produto')}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.typeChipText, tipoSelecionado === 'produto' && styles.typeChipTextSelected]}>
                    🏷️ Produto
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.typeChip, tipoSelecionado === 'produto_sem_estoque' && styles.typeChipSelected]}
                  onPress={() => setTipoSelecionado('produto_sem_estoque')}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.typeChipText, tipoSelecionado === 'produto_sem_estoque' && styles.typeChipTextSelected]}>
                    🍔 Sem Estoque
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.typeChip, tipoSelecionado === 'insumo' && styles.typeChipSelected]}
                  onPress={() => setTipoSelecionado('insumo')}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.typeChipText, tipoSelecionado === 'insumo' && styles.typeChipTextSelected]}>
                    🧅 Insumo
                  </Text>
                </TouchableOpacity>
              </View>
              <View style={styles.sectionDivider} />
            </View>

            {/* Nome */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Nome do Produto</Text>
              <TextInput
                style={styles.input}
                placeholder="Ex: Camiseta Azul"
                placeholderTextColor="#9CA3AF"
                value={nome}
                onChangeText={setNome}
                maxLength={80}
                editable={!loading && !successVisible}
              />
            </View>

            {/* Código de barras */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Código de Barras (Opcional)</Text>
              <View style={styles.barcodeInputContainer}>
                <TextInput
                  style={[styles.input, { flex: 1, borderTopRightRadius: 0, borderBottomRightRadius: 0 }]}
                  placeholder="Ex: 7891234567890"
                  placeholderTextColor="#9CA3AF"
                  value={codigoBarras}
                  onChangeText={setCodigoBarras}
                  keyboardType="numeric"
                  editable={!loading && !successVisible}
                />
                <TouchableOpacity style={styles.scanBtn} onPress={handleOpenScanner} disabled={loading || successVisible}>
                  <Ionicons name="barcode-outline" size={22} color="#FFF" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Preço de compra */}
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>Preço de Compra (R$)</Text>
              <TextInput
                style={styles.input}
                placeholder="Ex: 29,90"
                placeholderTextColor="#9CA3AF"
                value={precoCompra}
                onChangeText={setPrecoCompra}
                keyboardType="decimal-pad"
                editable={!loading && !successVisible}
              />
            </View>

            {/* Lucro */}
            {tipoSelecionado !== 'insumo' && (
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Lucro (%)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Ex: 30"
                  placeholderTextColor="#9CA3AF"
                  value={lucroPercentual}
                  onChangeText={setLucroPercentual}
                  keyboardType="decimal-pad"
                  editable={!loading && !successVisible}
                />
              </View>
            )}

            {/* Quantidade */}
            {tipoSelecionado !== 'produto_sem_estoque' && (
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Quantidade {tipoSelecionado === 'insumo' ? 'Comprada' : 'em Estoque'}</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Ex: 50"
                  placeholderTextColor="#9CA3AF"
                  value={quantidade}
                  onChangeText={setQuantidade}
                  keyboardType="numeric"
                  editable={!loading && !successVisible}
                />
              </View>
            )}

            <View style={styles.previewBox}>
              <View style={styles.previewItem}>
                <Text style={styles.previewLabel}>Preço de venda</Text>
                <Text style={styles.previewValue}>R$ {formatCurrency(precoVendaPreview)}</Text>
              </View>
              <View style={styles.previewDivider} />
              <View style={styles.previewItem}>
                <Text style={styles.previewLabel}>Saída no financeiro</Text>
                <Text style={styles.previewValue}>R$ {formatCurrency(totalCompraPreview)}</Text>
              </View>
            </View>
          </View>

          {/* Botões */}
          <View style={styles.buttonsRow}>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={() => router.back()}
              disabled={loading || successVisible}
            >
              <Text style={styles.cancelText}>Cancelar</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.saveBtn, (loading || successVisible) && styles.saveBtnDisabled]}
              onPress={handleSalvar}
              disabled={loading || successVisible}
            >
              {loading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.saveText}>Salvar Produto</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      <Modal visible={successVisible} transparent animationType="fade" statusBarTranslucent>
        <View style={styles.successOverlay}>
          <View style={styles.successCard}>
            <View style={styles.successIconWrap}>
              <Ionicons name="checkmark-circle" size={48} color="#16A34A" />
            </View>
            <Text style={styles.successTitle}>Produto adicionado!</Text>
            <Text style={styles.successMessage}>Compra registrada no financeiro.</Text>
            
            <View style={styles.successButtonsRow}>
              <TouchableOpacity
                style={styles.successBtnSecondary}
                onPress={() => {
                  setSuccessVisible(false);
                  router.replace('/(drawer)/estoque-detalhe');
                }}
              >
                <Text style={styles.successBtnSecondaryText}>Ir para Estoque</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.successBtnPrimary}
                onPress={() => {
                  setSuccessVisible(false);
                  if (lastCreatedProduct) {
                    router.push({
                      pathname: '/(drawer)/etiquetas',
                      params: {
                        nome: lastCreatedProduct.nome,
                        codigoBarras: lastCreatedProduct.codigoBarras,
                        precoVenda: lastCreatedProduct.precoVenda.toString(),
                        quantidade: lastCreatedProduct.quantidade.toString(),
                        autoPrint: 'true',
                      }
                    });
                  }
                }}
              >
                <Ionicons name="print-outline" size={18} color="#FFF" style={{ marginRight: 6 }} />
                <Text style={styles.successBtnPrimaryText}>Imprimir Etiquetas</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Scanner Modal */}
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
              style={styles.camera}
              facing="back"
              barcodeScannerSettings={{
                barcodeTypes: ['qr', 'ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39'],
              }}
              onBarcodeScanned={({ data }) => {
                setCodigoBarras(data);
                setScannerVisible(false);
              }}
            />
          )}
          <View style={styles.scannerOverlay}>
            <View style={styles.scannerTarget} />
            <Text style={styles.scannerTip}>Aponte a câmera para o código de barras ou QR Code</Text>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  container: {
    flexGrow: 1,
    alignItems: 'center',
    padding: 20,
    paddingTop: 32,
  },
  innerContainer: {
    width: '100%',
    maxWidth: 800,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: '#6B7280',
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    gap: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
    marginBottom: 28,
  },
  typeSelectorContainer: {
    marginBottom: 4,
  },
  typeSelectorRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  typeChip: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeChipSelected: {
    backgroundColor: '#DC2626',
    borderColor: '#DC2626',
  },
  typeChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#374151',
    textAlign: 'center',
  },
  typeChipTextSelected: {
    color: '#FFF',
  },
  sectionDivider: {
    height: 1,
    backgroundColor: '#F3F4F6',
    width: '100%',
  },
  fieldGroup: {
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#374151',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  input: {
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#111827',
  },
  previewBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 14,
    padding: 14,
    gap: 14,
  },
  previewItem: {
    flex: 1,
  },
  previewDivider: {
    width: 1,
    height: 42,
    backgroundColor: '#D1D5DB',
  },
  previewLabel: {
    fontSize: 11,
    color: '#6B7280',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  previewValue: {
    fontSize: 15,
    color: '#111827',
    fontWeight: '800',
  },
  buttonsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: '#D1D5DB',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF',
  },
  cancelText: {
    color: '#374151',
    fontWeight: '600',
    fontSize: 15,
  },
  saveBtn: {
    flex: 2,
    backgroundColor: '#1F2024',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 15,
  },
  successOverlay: {
    flex: 1,
    backgroundColor: 'rgba(17, 24, 39, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  successCard: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingVertical: 28,
    paddingHorizontal: 24,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 8,
  },
  successIconWrap: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#DCFCE7',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  successTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'center',
    marginBottom: 6,
  },
  successMessage: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
  },
  successButtonsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
    width: '100%',
  },
  successBtnSecondary: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: '#D1D5DB',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successBtnSecondaryText: {
    color: '#374151',
    fontWeight: '600',
    fontSize: 14,
    textAlign: 'center',
  },
  successBtnPrimary: {
    flex: 1,
    backgroundColor: '#1F2024',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successBtnPrimaryText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 14,
    textAlign: 'center',
  },
  barcodeInputContainer: {
    flexDirection: 'row',
  },
  scanBtn: {
    backgroundColor: '#1F2024',
    paddingHorizontal: 16,
    justifyContent: 'center',
    alignItems: 'center',
    borderTopRightRadius: 12,
    borderBottomRightRadius: 12,
  },
  scannerContainer: {
    flex: 1,
    backgroundColor: '#000',
  },
  scannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Platform.OS === 'ios' ? 50 : 20,
    paddingHorizontal: 20,
    paddingBottom: 20,
    backgroundColor: '#000',
    zIndex: 10,
  },
  scannerCloseBtn: {
    padding: 8,
  },
  scannerTitle: {
    color: '#FFF',
    fontSize: 18,
    fontWeight: '700',
  },
  camera: {
    flex: 1,
  },
  scannerOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    pointerEvents: 'none',
  },
  scannerTarget: {
    width: 250,
    height: 250,
    borderWidth: 2,
    borderColor: '#16A34A',
    backgroundColor: 'transparent',
    borderRadius: 20,
  },
  scannerTip: {
    color: '#FFF',
    fontSize: 14,
    marginTop: 20,
    fontWeight: '600',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
});
