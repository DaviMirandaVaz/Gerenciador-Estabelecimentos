import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import * as Crypto from 'expo-crypto';
import React, { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import * as Print from 'expo-print';
import {
  ActivityIndicator,
  Alert,
  FlatList,
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

interface Produto {
  id: string;
  nome: string;
  preco: number; // Preço de venda
  precoCompra?: number; // Preço de custo/compra
  quantidade: number;
  codigoBarras?: string; // Código de barras / referência (usado no scan e etiqueta)
  tipo?: string; // 'produto' | 'produto_sem_estoque' | 'insumo'
}

// ─── Barra de confirmação de exclusão ────────────────────────────────────────

function ConfirmDeleteBar({
  nomeProduto,
  onConfirm,
  saving,
}: {
  nomeProduto: string;
  onConfirm: () => void;
  saving: boolean;
}) {
  const [confirmando, setConfirmando] = useState(false);

  if (confirmando) {
    return (
      <View style={styles.confirmBar}>
        <Text style={styles.confirmText} numberOfLines={2}>
          Excluir "{nomeProduto}" e saída financeira?
        </Text>
        <View style={styles.confirmBtns}>
          <TouchableOpacity
            style={styles.confirmCancelBtn}
            onPress={() => setConfirmando(false)}
            disabled={saving}
          >
            <Text style={styles.confirmCancelText}>Não</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.confirmDeleteBtn}
            onPress={() => { setConfirmando(false); onConfirm(); }}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#FFF" size="small" />
            ) : (
              <Text style={styles.confirmDeleteText}>Sim, excluir</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <TouchableOpacity
      style={styles.deleteBarBtn}
      onPress={() => setConfirmando(true)}
      disabled={saving}
    >
      <Ionicons name="trash-outline" size={18} color="#DC2626" />
      <Text style={styles.deleteBarText}>Excluir produto</Text>
    </TouchableOpacity>
  );
}

// ─── Modal de edição ──────────────────────────────────────────────────────────

function EditModal({
  produto,
  onClose,
  onSave,
  onDelete,
}: {
  produto: Produto | null;
  onClose: () => void;
  onSave: (
    id: string,
    nome: string,
    precoVenda: number,
    precoCompra: number,
    quantidade: number,
    codigoBarras: string,
    registrarGasto?: boolean
  ) => Promise<void>;
  onDelete: (id: string, nome: string) => Promise<void>;
}) {
  const [nome, setNome] = useState('');
  const [precoCompra, setPrecoCompra] = useState('');
  const [precoVenda, setPrecoVenda] = useState('');
  const [quantidade, setQuantidade] = useState('');
  const [codigoBarras, setCodigoBarras] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);

  useEffect(() => {
    if (produto) {
      setNome(produto.nome);
      setPrecoVenda(produto.preco.toFixed(2).replace('.', ','));
      setPrecoCompra(
        produto.precoCompra ? produto.precoCompra.toFixed(2).replace('.', ',') : ''
      );
      setQuantidade(String(produto.quantidade));
      setCodigoBarras(produto.codigoBarras ?? '');
    }
  }, [produto]);

  const handleSalvar = async () => {
    if (!produto) return;

    if (!nome.trim() || !precoVenda.trim() || !quantidade.trim()) {
      Alert.alert('Atenção', 'Preencha os campos obrigatórios.');
      return;
    }

    const precoVendaNum = parseFloat(precoVenda.replace(',', '.'));
    const precoCompraNum = precoCompra.trim()
      ? parseFloat(precoCompra.replace(',', '.'))
      : 0;
    const qtdNum = parseInt(quantidade, 10);

    if (isNaN(precoVendaNum) || precoVendaNum < 0) {
      Alert.alert('Atenção', 'Insira um preço de venda válido.');
      return;
    }
    if (isNaN(precoCompraNum) || precoCompraNum < 0) {
      Alert.alert('Atenção', 'Insira um preço de compra válido.');
      return;
    }
    if (isNaN(qtdNum) || qtdNum < 0) {
      Alert.alert('Atenção', 'Insira uma quantidade válida.');
      return;
    }

    const saveAction = async (registrarGasto = false) => {
      setSaving(true);
      try {
        await onSave(produto.id, nome.trim(), precoVendaNum, precoCompraNum, qtdNum, codigoBarras.trim(), registrarGasto);
        onClose();
      } catch (e: any) {
        Alert.alert('Erro', e?.message || 'Falha ao salvar produto.');
      } finally {
        setSaving(false);
      }
    };

    if (produto.tipo === 'insumo' && qtdNum > produto.quantidade) {
      Alert.alert(
        'Registrar Gasto',
        `Você está adicionando ${qtdNum - produto.quantidade} unidades. Deseja registrar este reabastecimento como um gasto com insumo no financeiro?`,
        [
          { text: 'Não', onPress: () => saveAction(false) },
          { text: 'Sim', onPress: () => saveAction(true) }
        ]
      );
    } else {
      saveAction(false);
    }
  };

  const handleExcluir = async () => {
    if (!produto) return;
    setSaving(true);
    try {
      await onDelete(produto.id, produto.nome);
      onClose();
    } catch (e: any) {
      Alert.alert('Erro', e?.message || 'Falha ao excluir produto.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={!!produto} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.modalContainer}>
          {/* Cabeçalho */}
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Editar Produto</Text>
            <TouchableOpacity onPress={onClose} style={styles.modalCloseBtn} disabled={saving}>
              <Ionicons name="close" size={22} color="#6B7280" />
            </TouchableOpacity>
          </View>

          {/* Campos */}
          <View style={styles.modalBody}>
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Nome do Produto</Text>
              <TextInput
                style={styles.input}
                value={nome}
                onChangeText={setNome}
                placeholder="Ex: Camiseta Azul"
                placeholderTextColor="#9CA3AF"
                maxLength={80}
                editable={!saving}
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Preço de Compra / Custo (R$)</Text>
              <TextInput
                style={styles.input}
                value={precoCompra}
                onChangeText={setPrecoCompra}
                placeholder="Ex: 15,00"
                placeholderTextColor="#9CA3AF"
                keyboardType="decimal-pad"
                editable={!saving}
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Preço de Venda (R$)</Text>
              <TextInput
                style={styles.input}
                value={precoVenda}
                onChangeText={setPrecoVenda}
                placeholder="Ex: 29,90"
                placeholderTextColor="#9CA3AF"
                keyboardType="decimal-pad"
                editable={!saving}
              />
            </View>

            {produto?.tipo !== 'produto_sem_estoque' && (
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Quantidade em Estoque</Text>
                <TextInput
                  style={styles.input}
                  value={quantidade}
                  onChangeText={setQuantidade}
                  placeholder="Ex: 50"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="numeric"
                  editable={!saving}
                />
              </View>
            )}

            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Código de Referência / Barras</Text>
              <TextInput
                style={styles.input}
                value={codigoBarras}
                onChangeText={setCodigoBarras}
                placeholder="Ex: 7891020304050"
                placeholderTextColor="#9CA3AF"
                autoCapitalize="characters"
                editable={!saving}
              />
            </View>
          </View>

          {/* Barra de confirmação de exclusão */}
          <ConfirmDeleteBar
            nomeProduto={produto?.nome ?? ''}
            onConfirm={handleExcluir}
            saving={saving}
          />

          {/* Botões */}
          <View style={styles.modalButtons}>
            <TouchableOpacity
              style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
              onPress={handleSalvar}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color="#FFF" size="small" />
              ) : (
                <Text style={styles.saveText}>Salvar</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Modal de Impressão de Etiqueta ──────────────────────────────────────────

const thermalCss = `
    @page { size: 78mm 25mm; margin: 0mm; }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      color-adjust: exact;
    }
    html, body {
      margin: 0; padding: 0;
      width: 78mm;
      background-color: #ffffff;
      font-family: Arial, Helvetica, sans-serif;
    }
    .label-row {
      display: flex; flex-direction: row;
      width: 78mm; height: 25mm;
      gap: 6mm;
      page-break-after: always; break-after: page;
      background-color: #ffffff;
    }
    .label-row:last-child { page-break-after: avoid; break-after: avoid; }
    .label {
      width: 36mm; height: 25mm;
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      overflow: hidden; padding: 1mm 0mm;
      background-color: #ffffff;
    }
    .top-text {
      text-align: center; word-break: break-word;
      max-width: 34mm; color: #000000; line-height: 1.1;
      margin-bottom: 0.5mm;
    }
    .product-name {
      font-size: 5pt; font-weight: normal;
    }
    .product-price {
      font-size: 7pt; font-weight: bold;
      margin-left: 2px;
    }
    .barcode-wrap {
      width: 100%; display: flex;
      justify-content: center; align-items: center;
    }
    .barcode-img {
      width: 34mm; height: 11mm; display: block;
      image-rendering: crisp-edges;
      image-rendering: -webkit-optimize-contrast;
      image-rendering: pixelated;
    }
    .ref-number {
      font-size: 6pt; font-weight: bold;
      text-align: center; color: #000000;
      margin-top: 0.5mm;
    }
  `;

function PrintLabelModal({
  produto,
  onClose,
}: {
  produto: Produto | null;
  onClose: () => void;
}) {
  const [labelNome, setLabelNome] = useState('');
  const [labelPreco, setLabelPreco] = useState('');
  const [labelCodigo, setLabelCodigo] = useState('');
  const [labelQtd, setLabelQtd] = useState('1');
  const [isPrinting, setIsPrinting] = useState(false);

  useEffect(() => {
    if (produto) {
      setLabelNome(produto.nome);
      setLabelPreco(`R$ ${produto.preco.toFixed(2).replace('.', ',')}`);
      // Usa o codigoBarras do produto se existir, senão usa os primeiros 13 chars do ID
      setLabelCodigo(produto.codigoBarras ? produto.codigoBarras : produto.id.slice(0, 13).toUpperCase());
      setLabelQtd('1');
    }
  }, [produto]);

  // Gera HTML de uma etiqueta com código
  const makeLabelHtml = (code: string) => {
    const url = `https://bwipjs-api.metafloor.com/?bcid=code128&text=${encodeURIComponent(code)}&scale=4&height=12&includetext=false&monochrome=true`;
    const nameHtml = labelNome.trim() ? `<span class="product-name">${labelNome.trim()}</span>` : '';
    const priceHtml = labelPreco.trim() ? `<span class="product-price">${labelPreco.trim()}</span>` : '';
    const topTextHtml = (nameHtml || priceHtml) ? `<div class="top-text">${nameHtml} ${priceHtml}</div>` : '';
    
    return `
      <div class="label">
        ${topTextHtml}
        <div class="barcode-wrap">
          <img class="barcode-img" src="${url}" alt="${code}" />
        </div>
        <div class="ref-number">${code}</div>
      </div>`;
  };

  // Gera HTML a partir de lista de códigos, dois a dois
  const buildHtml = (codes: string[]) => {
    let rows = '';
    for (let i = 0; i < codes.length; i += 2) {
      const left  = makeLabelHtml(codes[i]);
      const right = i + 1 < codes.length
        ? makeLabelHtml(codes[i + 1])
        : '<div class="label"></div>';
      rows += `<div class="label-row">${left}${right}</div>`;
    }
    return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title>Imprimir Etiquetas</title>
    <style>${thermalCss}</style>
  </head>
  <body onload="window.print();">${rows}</body>
</html>`;
  };

  const handlePrint = async () => {
    if (!labelCodigo.trim()) {
      Alert.alert('Atenção', 'O código / referência é obrigatório.');
      return;
    }
    const qty = Math.max(1, parseInt(labelQtd, 10) || 1);
    const codes = Array(qty).fill(labelCodigo.trim());
    setIsPrinting(true);
    try {
      const html = buildHtml(codes);
      if (Platform.OS === 'web') {
        const w = window.open('', '_blank');
        if (w) { w.document.write(html); w.document.close(); }
        else Alert.alert('Erro', 'Pop-up bloqueado. Permita pop-ups para este site.');
      } else {
        await Print.printAsync({ html });
      }
      onClose();
    } catch (e) {
      console.log('Erro ao imprimir etiqueta:', e);
      Alert.alert('Erro', 'Não foi possível enviar para a impressora.');
    } finally {
      setIsPrinting(false);
    }
  };

  const total = Math.max(1, parseInt(labelQtd, 10) || 1);
  const canPrint = !!labelCodigo.trim();

  return (
    <Modal visible={!!produto} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.modalOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.printModalContainer}>
          {/* Cabeçalho */}
          <View style={styles.modalHeader}>
            <View style={styles.printModalTitleRow}>
              <Ionicons name="print-outline" size={20} color="#1F2024" />
              <Text style={styles.modalTitle}>Imprimir Etiqueta</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.modalCloseBtn} disabled={isPrinting}>
              <Ionicons name="close" size={22} color="#6B7280" />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <View style={styles.modalBody}>
              {/* Nome */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Nome do Produto</Text>
                <TextInput
                  style={styles.input}
                  value={labelNome}
                  onChangeText={setLabelNome}
                  placeholder="Ex: Camiseta Azul"
                  placeholderTextColor="#9CA3AF"
                  editable={!isPrinting}
                />
              </View>

              {/* Preço */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Preço (exibido na etiqueta)</Text>
                <TextInput
                  style={styles.input}
                  value={labelPreco}
                  onChangeText={setLabelPreco}
                  placeholder="Ex: R$ 29,90"
                  placeholderTextColor="#9CA3AF"
                  editable={!isPrinting}
                />
              </View>

              {/* Código */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Código / Referência *</Text>
                <TextInput
                  style={styles.input}
                  value={labelCodigo}
                  onChangeText={setLabelCodigo}
                  placeholder="Ex: 7891020304050"
                  placeholderTextColor="#9CA3AF"
                  autoCapitalize="characters"
                  editable={!isPrinting}
                />
              </View>

              {/* Quantidade de cópias */}
              <View style={styles.fieldGroup}>
                <Text style={styles.fieldLabel}>Quantidade de Cópias</Text>
                <View style={styles.printQtyRow}>
                  <TouchableOpacity
                    style={styles.printQtyBtn}
                    onPress={() => setLabelQtd(q => String(Math.max(1, (parseInt(q, 10) || 1) - 1)))}
                    disabled={isPrinting}
                  >
                    <Ionicons name="remove" size={20} color="#1F2024" />
                  </TouchableOpacity>
                  <TextInput
                    style={[styles.input, styles.printQtyInput]}
                    value={labelQtd}
                    onChangeText={v => setLabelQtd(v.replace(/[^0-9]/g, ''))}
                    keyboardType="number-pad"
                    textAlign="center"
                    editable={!isPrinting}
                  />
                  <TouchableOpacity
                    style={styles.printQtyBtn}
                    onPress={() => setLabelQtd(q => String((parseInt(q, 10) || 1) + 1))}
                    disabled={isPrinting}
                  >
                    <Ionicons name="add" size={20} color="#1F2024" />
                  </TouchableOpacity>
                </View>
                <Text style={styles.printQtyHint}>Mesmo código, várias cópias — 2 por linha</Text>
              </View>

              {/* Pré-visualização */}
              {labelCodigo.trim().length > 0 && (
                <View style={styles.printPreviewContainer}>
                  <Text style={styles.printPreviewLabel}>Pré-visualização</Text>
                  <View style={styles.printPreviewBox}>
                    {(labelNome.trim() || labelPreco.trim()) && (
                      <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginBottom: 4 }}>
                        {labelNome.trim() && <Text style={styles.printPreviewNome} numberOfLines={1}>{labelNome}</Text>}
                        {labelPreco.trim() && <Text style={styles.printPreviewPreco} numberOfLines={1}> {labelPreco}</Text>}
                      </View>
                    )}
                    <Ionicons name="barcode-outline" size={48} color="#111827" />
                    <Text style={styles.printPreviewCodigo}>{labelCodigo}</Text>
                  </View>
                </View>
              )}
            </View>
          </ScrollView>

          {/* Botões */}
          <View style={styles.modalButtons}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onClose} disabled={isPrinting}>
              <Text style={styles.cancelText}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.printActionBtn, (!canPrint || isPrinting) && styles.saveBtnDisabled]}
              onPress={handlePrint}
              disabled={!canPrint || isPrinting}
            >
              {isPrinting ? (
                <ActivityIndicator color="#FFF" size="small" />
              ) : (
                <>
                  <Ionicons name="print" size={16} color="#FFF" />
                  <Text style={styles.saveText}> Imprimir {total} Etiqueta{total > 1 ? 's' : ''}</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Card de produto ──────────────────────────────────────────────────────────

function ProdutoCard({
  produto,
  index,
  onEdit,
  onPrintLabel,
}: {
  produto: Produto;
  index: number;
  onEdit: (p: Produto) => void;
  onPrintLabel: (p: Produto) => void;
}) {
  const isLow = produto.quantidade <= 5 && produto.tipo !== 'produto_sem_estoque';

  return (
    <View style={styles.card}>
      <View style={styles.cardIndex}>
        <Text style={styles.cardIndexText}>{String(index + 1).padStart(2, '0')}</Text>
      </View>

      <View style={styles.cardInfo}>
        <Text style={styles.cardNome} numberOfLines={1}>{produto.nome}</Text>
        <Text style={styles.cardPreco}>
          Venda: R$ {produto.preco.toFixed(2).replace('.', ',')}
          {typeof produto.precoCompra === 'number' && produto.precoCompra > 0
            ? ` · Custo: R$ ${produto.precoCompra.toFixed(2).replace('.', ',')}`
            : ''}
        </Text>
        <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
          {produto.tipo === 'produto_sem_estoque' && (
            <View style={[styles.typeBadge, { backgroundColor: '#DBEAFE' }]}>
               <Text style={[styles.typeBadgeText, { color: '#1E3A8A' }]}>Sem Estoque</Text>
            </View>
          )}
          {produto.tipo === 'insumo' && (
            <View style={[styles.typeBadge, { backgroundColor: '#FEF3C7' }]}>
               <Text style={[styles.typeBadgeText, { color: '#92400E' }]}>Insumo</Text>
            </View>
          )}
        </View>
      </View>

      {produto.tipo !== 'produto_sem_estoque' ? (
        <View style={[styles.badge, isLow && styles.badgeLow]}>
          <Text style={[styles.badgeQtd, isLow && styles.badgeQtdLow]}>
            {produto.quantidade}
          </Text>
          <Text style={[styles.badgeLabel, isLow && styles.badgeLabelLow]}>
            {produto.quantidade === 1 ? 'item' : 'itens'}
          </Text>
        </View>
      ) : <View style={{ width: 44 }} />}

      <TouchableOpacity style={styles.printBtn} onPress={() => onPrintLabel(produto)}>
        <Ionicons name="print-outline" size={16} color="#4F46E5" />
      </TouchableOpacity>

      <TouchableOpacity style={styles.editBtn} onPress={() => onEdit(produto)}>
        <Ionicons name="pencil" size={16} color="#6B7280" />
      </TouchableOpacity>
    </View>
  );
}

// ─── Tela principal ───────────────────────────────────────────────────────────

export default function EstoqueDetalhe() {
  const db = useSQLiteContext();
  const params = useLocalSearchParams<{ filtro?: string }>();
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [loading, setLoading] = useState(true);
  const [editando, setEditando] = useState<Produto | null>(null);
  const [imprimindo, setImprimindo] = useState<Produto | null>(null);
  const [filtroTipo, setFiltroTipo] = useState<'todos' | 'produtos' | 'insumos'>('todos');

  useEffect(() => {
    if (params?.filtro === 'insumo' || params?.filtro === 'insumos') {
      setFiltroTipo('insumos');
    }
  }, [params?.filtro]);

  const carregarProdutos = useCallback(async () => {
    setLoading(true);
    try {
      const lista = await db.getAllAsync<Produto>('SELECT * FROM produtos ORDER BY nome ASC');
      setProdutos(lista);
    } catch (e) {
      console.log('Erro ao carregar estoque detalhado:', e);
    } finally {
      setLoading(false);
    }
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      carregarProdutos();
    }, [carregarProdutos])
  );

  const handleSalvarEdicao = async (
    id: string,
    nome: string,
    precoVenda: number,
    precoCompra: number,
    quantidade: number,
    codigoBarras: string,
    registrarGasto?: boolean
  ) => {
    try {
      await db.execAsync('BEGIN TRANSACTION');

      if (registrarGasto && editando) {
        const qtdAdicionada = quantidade - editando.quantidade;
        if (qtdAdicionada > 0) {
          const valorTotalCompra = precoCompra * qtdAdicionada;
          const itensJson = JSON.stringify([{ produtoId: id, produtoNome: nome, quantidade: qtdAdicionada, precoCompra }]);
          await db.runAsync(
            "INSERT INTO movimentacoes (id, tipo, origem, data, valorTotal, descricao, itens) VALUES (?, 'saida', 'compra_insumo', ?, ?, ?, ?)",
            [Crypto.randomUUID(), Date.now(), valorTotalCompra, `Reabastecimento Insumo - ${nome}`, itensJson]
          );
        }
      }

      // 1. Atualiza produto no estoque
      // codigoBarras e codigoRef recebem o mesmo valor para manter scan e etiqueta sincronizados
      await db.runAsync(
        'UPDATE produtos SET nome = ?, preco = ?, precoCompra = ?, quantidade = ?, codigoBarras = ?, codigoRef = ? WHERE id = ?',
        [nome, precoVenda, precoCompra, quantidade, codigoBarras || null, codigoBarras || null, id]
      );

      // 2. Atualiza a saída no financeiro correspondente
      const movimentacoes = await db.getAllAsync<{ id: string; itens?: string }>(
        "SELECT id, itens FROM movimentacoes WHERE tipo = 'saida' AND (itens LIKE ? OR descricao LIKE ?)",
        [`%${id}%`, `%${nome}%`]
      );

      for (const mov of movimentacoes) {
        let itensArr: any[] = [];
        if (mov.itens) {
          try {
            itensArr = JSON.parse(mov.itens);
          } catch (e) {
            itensArr = [];
          }
        }

        const novoValorTotal = precoCompra * quantidade;
        const novosItensJson = JSON.stringify([
          {
            produtoId: id,
            produtoNome: nome,
            quantidade: quantidade,
            precoCompra: precoCompra,
          },
        ]);

        await db.runAsync(
          'UPDATE movimentacoes SET valorTotal = ?, descricao = ?, itens = ? WHERE id = ?',
          [novoValorTotal, `Compra de estoque - ${nome}`, novosItensJson, mov.id]
        );
      }

      await db.execAsync('COMMIT');
      carregarProdutos();
    } catch (e) {
      await db.execAsync('ROLLBACK');
      console.log('Erro ao salvar edição de produto/financeiro:', e);
      throw e;
    }
  };

  const handleExcluirProduto = async (id: string, nome: string) => {
    try {
      await db.execAsync('BEGIN TRANSACTION');

      // 1. Exclui produto do estoque
      await db.runAsync('DELETE FROM produtos WHERE id = ?', [id]);

      // 2. Exclui saída correspondente no financeiro
      await db.runAsync(
        "DELETE FROM movimentacoes WHERE tipo = 'saida' AND (itens LIKE ? OR descricao LIKE ?)",
        [`%${id}%`, `%${nome}%`]
      );

      await db.execAsync('COMMIT');
      carregarProdutos();
    } catch (e) {
      await db.execAsync('ROLLBACK');
      console.log('Erro ao excluir produto/financeiro:', e);
      throw e;
    }
  };

  const produtosFiltrados = produtos.filter((p) => {
    const tipo = p.tipo || 'produto';
    if (filtroTipo === 'produtos') return tipo === 'produto' || tipo === 'produto_sem_estoque';
    if (filtroTipo === 'insumos') return tipo === 'insumo';
    return true;
  });

  const totalItens = produtosFiltrados.reduce((acc, p) => acc + (p.tipo !== 'produto_sem_estoque' ? p.quantidade : 0), 0);
  const valorTotal = produtosFiltrados.reduce((acc, p) => {
    const preco = p.tipo === 'insumo' ? (p.precoCompra || 0) : p.preco;
    const qtd = p.tipo === 'produto_sem_estoque' ? 1 : p.quantidade;
    return acc + preco * qtd;
  }, 0);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1F2024" />
      </View>
    );
  }

  return (
    <View style={styles.outerContainer}>
      <View style={styles.container}>
        <View style={styles.filterTabsHeader}>
          <TouchableOpacity
            style={[styles.filterTabHeader, filtroTipo === 'todos' && styles.filterTabHeaderActive]}
            onPress={() => setFiltroTipo('todos')}
          >
            <Text style={[styles.filterTabTextHeader, filtroTipo === 'todos' && styles.filterTabTextHeaderActive]}>Todos</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterTabHeader, filtroTipo === 'produtos' && styles.filterTabHeaderActive]}
            onPress={() => setFiltroTipo('produtos')}
          >
            <Text style={[styles.filterTabTextHeader, filtroTipo === 'produtos' && styles.filterTabTextHeaderActive]}>Produtos</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterTabHeader, filtroTipo === 'insumos' && styles.filterTabHeaderActive]}
            onPress={() => setFiltroTipo('insumos')}
          >
            <Text style={[styles.filterTabTextHeader, filtroTipo === 'insumos' && styles.filterTabTextHeaderActive]}>Insumos</Text>
          </TouchableOpacity>
        </View>

        {/* Resumo escuro */}
        <View style={styles.summaryRow}>
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>{produtosFiltrados.length}</Text>
            <Text style={styles.summaryLabel}>Produtos</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>{totalItens}</Text>
            <Text style={styles.summaryLabel}>Itens totais</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.summaryItem}>
            <Text style={styles.summaryValue}>
              R$ {valorTotal.toFixed(2).replace('.', ',')}
            </Text>
            <Text style={styles.summaryLabel}>Valor total</Text>
          </View>
        </View>

        {/* Lista */}
        {produtosFiltrados.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="cube-outline" size={56} color="#9CA3AF" style={{ marginBottom: 12 }} />
            <Text style={styles.emptyTitle}>Nenhum produto encontrado</Text>
            <Text style={styles.emptySubtitle}>
              Adicione produtos ou altere os filtros
            </Text>
            <TouchableOpacity
              style={styles.addBtn}
              onPress={() => router.push('/(drawer)/nova-entrada')}
            >
              <Text style={styles.addBtnText}>+ Adicionar Produto</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <FlatList
            data={produtosFiltrados}
            keyExtractor={(item) => item.id}
            renderItem={({ item, index }) => (
              <ProdutoCard
                produto={item}
                index={index}
                onEdit={setEditando}
                onPrintLabel={setImprimindo}
              />
            )}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            ListHeaderComponent={
              <Text style={styles.listHeader}>
                {produtosFiltrados.length}{' '}
                {produtosFiltrados.length === 1 ? 'produto encontrado' : 'produtos encontrados'}
              </Text>
            }
          />
        )}

        {/* Modal de edição */}
        <EditModal
          produto={editando}
          onClose={() => setEditando(null)}
          onSave={handleSalvarEdicao}
          onDelete={handleExcluirProduto}
        />

        {/* Modal de impressão de etiqueta */}
        <PrintLabelModal
          produto={imprimindo}
          onClose={() => setImprimindo(null)}
        />
      </View>
    </View>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────────

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
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
  },

  // Resumo
  summaryRow: {
    flexDirection: 'row',
    backgroundColor: '#1F2024',
    paddingVertical: 20,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'space-around',
    borderRadius: 14,
    marginTop: 12,
    marginHorizontal: 16,
  },
  summaryItem: { alignItems: 'center' },
  summaryValue: { fontSize: 18, fontWeight: '700', color: '#FFFFFF' },
  summaryLabel: { fontSize: 11, color: '#9CA3AF', marginTop: 2 },
  divider: { width: 1, height: 36, backgroundColor: '#374151' },

  // Lista
  list: { padding: 16, paddingBottom: 40 },
  listHeader: {
    fontSize: 12,
    color: '#9CA3AF',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontWeight: '600',
    marginBottom: 12,
  },

  // Card
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
    gap: 10,
  },
  cardIndex: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardIndexText: { fontSize: 12, fontWeight: '700', color: '#6B7280' },
  cardInfo: { flex: 1 },
  cardNome: { fontSize: 15, fontWeight: '600', color: '#111827', marginBottom: 2 },
  cardPreco: { fontSize: 13, color: '#6B7280' },
  typeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  typeBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  filterTabsHeader: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
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

  // Badge quantidade
  badge: {
    backgroundColor: '#EFF6FF',
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 10,
    alignItems: 'center',
    minWidth: 52,
  },
  badgeLow: { backgroundColor: '#FEF2F2' },
  badgeQtd: { fontSize: 16, fontWeight: '700', color: '#1D4ED8' },
  badgeQtdLow: { color: '#DC2626' },
  badgeLabel: { fontSize: 10, color: '#93C5FD', fontWeight: '500' },
  badgeLabelLow: { color: '#FCA5A5' },

  // Botão imprimir etiqueta
  printBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#EEF2FF',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Botão editar
  editBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // Estado vazio
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyIcon: { fontSize: 56, marginBottom: 16 },
  emptyTitle: { fontSize: 20, fontWeight: '700', color: '#1F2024', marginBottom: 8, textAlign: 'center' },
  emptySubtitle: { fontSize: 14, color: '#9CA3AF', textAlign: 'center', marginBottom: 24, lineHeight: 20 },
  addBtn: { backgroundColor: '#1F2024', paddingVertical: 14, paddingHorizontal: 28, borderRadius: 14 },
  addBtnText: { color: '#FFF', fontWeight: '700', fontSize: 15 },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  modalContainer: {
    backgroundColor: '#FFF',
    width: '100%',
    maxWidth: 500,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 28,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  modalCloseBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBody: { gap: 14, marginBottom: 24 },
  fieldGroup: { gap: 6 },
  fieldLabel: {
    fontSize: 12,
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
    paddingVertical: 12,
    fontSize: 16,
    color: '#111827',
  },
  modalButtons: { flexDirection: 'row', gap: 10 },
  deleteBtn: {
    width: 48,
    height: 48,
    borderWidth: 1.5,
    borderColor: '#FEE2E2',
    backgroundColor: '#FEF2F2',
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: '#D1D5DB',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF',
  },
  cancelText: { color: '#374151', fontWeight: '600', fontSize: 15 },
  saveBtn: {
    flex: 1.5,
    backgroundColor: '#1F2024',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnDisabled: { opacity: 0.6 },
  deleteBarBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 4,
    marginBottom: 12,
  },
  deleteBarText: {
    color: '#DC2626',
    fontWeight: '600',
    fontSize: 14,
  },
  confirmBar: {
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FECACA',
    padding: 14,
    marginBottom: 12,
    gap: 10,
  },
  confirmText: {
    fontSize: 13,
    color: '#991B1B',
    fontWeight: '600',
  },
  confirmBtns: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'flex-end',
  },
  confirmCancelBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#FFF',
  },
  confirmCancelText: {
    color: '#374151',
    fontWeight: '600',
    fontSize: 13,
  },
  confirmDeleteBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#DC2626',
    minWidth: 90,
    alignItems: 'center',
  },
  confirmDeleteText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 13,
  },
  saveText: { color: '#FFF', fontWeight: '700', fontSize: 15 },

  // Modal de impressão
  printModalContainer: {
    backgroundColor: '#FFF',
    width: '100%',
    maxWidth: 500,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 28,
    maxHeight: '85%',
  },
  printModalTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  printQtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  printQtyBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  printQtyInput: {
    flex: 1,
    minWidth: 60,
    textAlign: 'center',
  },
  printQtyHint: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 4,
  },
  printPreviewContainer: {
    marginTop: 8,
  },
  printPreviewLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  printPreviewBox: {
    backgroundColor: '#FFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  printPreviewNome: {
    fontSize: 11,
    color: '#6B7280',
  },
  printPreviewPreco: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  printPreviewCodigo: {
    fontSize: 12,
    fontWeight: '600',
    color: '#374151',
    marginTop: 4,
    letterSpacing: 1,
  },
  printActionBtn: {
    flex: 1.5,
    backgroundColor: '#4F46E5',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
});
