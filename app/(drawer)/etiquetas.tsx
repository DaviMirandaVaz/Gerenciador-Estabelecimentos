import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Platform,
  Alert,
  KeyboardAvoidingView,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as Print from 'expo-print';

export default function Etiquetas() {
  const params = useLocalSearchParams();
  const initialized = useRef(false);

  // Estados dos campos
  const [barcodeText, setBarcodeText] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [productName, setProductName] = useState('');
  const [productPrice, setProductPrice] = useState('');
  
  const [isPrinting, setIsPrinting] = useState(false);

  const handleAutoPrint = async (code: string, name: string, price: string, qtyStr: string) => {
    const qty = Math.max(1, parseInt(qtyStr, 10) || 1);
    const codes = Array(qty).fill(code.trim());

    setIsPrinting(true);
    try {
      const makeCustomLabelHtml = (c: string) => {
        const url = `https://bwipjs-api.metafloor.com/?bcid=code128&text=${encodeURIComponent(c)}&scale=4&height=12&includetext=false&monochrome=true`;
        const nameHtml = name.trim() ? `<span class="product-name">${name.trim()}</span>` : '';
        const priceHtml = price.trim() ? `<span class="product-price">${price.trim()}</span>` : '';
        const topTextHtml = (nameHtml || priceHtml) ? `<div class="top-text">${nameHtml} ${priceHtml}</div>` : '';
        
        return `
          <div class="label">
            ${topTextHtml}
            <div class="barcode-wrap">
              <img class="barcode-img" src="${url}" alt="${c}" />
            </div>
            <div class="ref-number">${c}</div>
          </div>`;
      };

      let rows = '';
      for (let i = 0; i < codes.length; i += 2) {
        const left  = makeCustomLabelHtml(codes[i]);
        const right = i + 1 < codes.length
          ? makeCustomLabelHtml(codes[i + 1])
          : '<div class="label"></div>';
        rows += `<div class="label-row">${left}${right}</div>`;
      }
      const html = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <title>Imprimir Etiquetas</title>
    <style>${thermalCss}</style>
  </head>
  <body onload="window.print();">${rows}</body>
</html>`;

      if (Platform.OS === 'web') {
        const w = window.open('', '_blank');
        if (w) { w.document.write(html); w.document.close(); }
      } else {
        await Print.printAsync({ html });
      }
    } catch (e) {
      console.log('Erro ao imprimir automaticamente:', e);
    } finally {
      setIsPrinting(false);
    }
  };

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    // Preencher campos caso venha de outra tela (ex: nova-entrada)
    const code = params.codigoBarras ? String(params.codigoBarras) : '';
    const name = params.nome ? String(params.nome) : '';
    let price = '';
    if (params.precoVenda) {
      const preco = Number(params.precoVenda).toFixed(2).replace('.', ',');
      price = `R$ ${preco}`;
    }
    const qty = params.quantidade ? String(params.quantidade) : '1';

    if (code) setBarcodeText(code);
    if (name) setProductName(name);
    if (price) setProductPrice(price);
    if (qty) setQuantity(qty);

    if (params.autoPrint === 'true' && code) {
      const timer = setTimeout(() => {
        handleAutoPrint(code, name, price, qty);
      }, 400);
      return () => clearTimeout(timer);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // CSS térmico
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

  // Gera HTML de uma etiqueta com código
  const makeLabelHtml = (code: string) => {
    // include text=false in the barcode generator, we will print it manually below
    const url = `https://bwipjs-api.metafloor.com/?bcid=code128&text=${encodeURIComponent(code)}&scale=4&height=12&includetext=false&monochrome=true`;
    const nameHtml = productName.trim() ? `<span class="product-name">${productName.trim()}</span>` : '';
    const priceHtml = productPrice.trim() ? `<span class="product-price">${productPrice.trim()}</span>` : '';
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

  // Imprimir
  const handlePrint = async () => {
    if (!barcodeText.trim()) {
      Alert.alert('Atenção', 'Digite o código / referência da etiqueta.');
      return;
    }
    const qty = Math.max(1, parseInt(quantity, 10) || 1);
    const codes = Array(qty).fill(barcodeText.trim());

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
    } catch (e) {
      console.log('Erro ao imprimir:', e);
      Alert.alert('Erro', 'Não foi possível enviar para a impressora.');
    } finally {
      setIsPrinting(false);
    }
  };

  const total = Math.max(1, parseInt(quantity, 10) || 1);
  const canPrint = !!barcodeText.trim();

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color="#1F2024" />
        </TouchableOpacity>
        <Text style={styles.screenTitle}>Impressão de Etiquetas</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <View style={styles.iconWrapper}>
            <Ionicons name="print-outline" size={48} color="#1F2024" />
          </View>
          <Text style={styles.cardTitle}>Gerador de Etiquetas</Text>
          <Text style={styles.cardDescription}>
            Impressora térmica — 2 etiquetas de 36×25 mm (com 6mm de espaço).
          </Text>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Nome do Produto (Opcional)</Text>
            <TextInput
              style={styles.input}
              placeholder="Ex: Camiseta Azul"
              placeholderTextColor="#9CA3AF"
              value={productName}
              onChangeText={setProductName}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Preço (Opcional)</Text>
            <TextInput
              style={styles.input}
              placeholder="Ex: R$ 50,00"
              placeholderTextColor="#9CA3AF"
              value={productPrice}
              onChangeText={setProductPrice}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Código / Referência *</Text>
            <TextInput
              style={styles.input}
              placeholder="Ex: 7891020304050"
              placeholderTextColor="#9CA3AF"
              value={barcodeText}
              onChangeText={setBarcodeText}
              keyboardType="default"
              autoCapitalize="characters"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Quantidade de Cópias</Text>
            <View style={styles.quantityRow}>
              <TouchableOpacity
                style={styles.quantityBtn}
                onPress={() => setQuantity(q => String(Math.max(1, (parseInt(q, 10) || 1) - 1)))}
              >
                <Ionicons name="remove" size={20} color="#1F2024" />
              </TouchableOpacity>
              <TextInput
                style={[styles.input, styles.quantityInput]}
                placeholder="1"
                placeholderTextColor="#9CA3AF"
                value={quantity}
                onChangeText={v => setQuantity(v.replace(/[^0-9]/g, ''))}
                keyboardType="number-pad"
                textAlign="center"
              />
              <TouchableOpacity
                style={styles.quantityBtn}
                onPress={() => setQuantity(q => String((parseInt(q, 10) || 1) + 1))}
              >
                <Ionicons name="add" size={20} color="#1F2024" />
              </TouchableOpacity>
            </View>
            <Text style={styles.quantityHint}>Mesmo código, várias cópias — impressas 2 a 2</Text>
          </View>

          {barcodeText.length > 0 && (
            <View style={styles.previewContainer}>
              <Text style={styles.previewLabel}>Pré-visualização</Text>
              <View style={styles.previewBox}>
                {(productName.trim() || productPrice.trim()) && (
                  <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginBottom: 6 }}>
                    {productName.trim() && <Text style={styles.previewProductName} numberOfLines={1}>{productName}</Text>}
                    {productPrice.trim() && <Text style={styles.previewProductPrice} numberOfLines={1}> {productPrice}</Text>}
                  </View>
                )}
                <Ionicons name="barcode-outline" size={56} color="#111827" />
                <Text style={styles.previewBarcodeText}>{barcodeText}</Text>
              </View>
            </View>
          )}

        </View>
      </ScrollView>

      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={[styles.printBtn, (!canPrint || isPrinting) && styles.printBtnDisabled]}
          onPress={handlePrint}
          disabled={!canPrint || isPrinting}
        >
          <Ionicons name="print" size={20} color="#FFF" />
          <Text style={styles.printBtnText}>
            {isPrinting
              ? 'Enviando...'
              : `Imprimir ${total} Etiqueta${total > 1 ? 's' : ''}`}
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: Platform.OS === 'ios' ? 0 : 12,
    paddingBottom: 16, backgroundColor: '#FFF',
    borderBottomWidth: 1, borderBottomColor: '#E5E7EB',
  },
  backBtn: { padding: 4 },
  screenTitle: { fontSize: 18, fontWeight: '700', color: '#111827' },
  content: { padding: 16 },
  card: {
    backgroundColor: '#FFF', borderRadius: 16, padding: 24,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
  },
  iconWrapper: { alignItems: 'center', marginBottom: 16 },
  cardTitle: { fontSize: 20, fontWeight: '800', color: '#111827', textAlign: 'center', marginBottom: 8 },
  cardDescription: { fontSize: 14, color: '#6B7280', textAlign: 'center', marginBottom: 24, lineHeight: 20 },

  inputGroup: { marginBottom: 16 },
  label: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 8 },
  input: {
    backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#D1D5DB',
    borderRadius: 12, paddingHorizontal: 16, height: 52, fontSize: 16, color: '#111827',
  },

  // Quantidade
  quantityRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  quantityBtn: {
    width: 52, height: 52, borderRadius: 12, backgroundColor: '#F3F4F6',
    borderWidth: 1, borderColor: '#D1D5DB', alignItems: 'center', justifyContent: 'center',
  },
  quantityInput: { flex: 1, textAlign: 'center', paddingHorizontal: 8 },
  quantityHint: { fontSize: 12, color: '#9CA3AF', marginTop: 6, textAlign: 'center' },

  // Preview
  previewContainer: { marginTop: 24, borderTopWidth: 1, borderTopColor: '#E5E7EB', paddingTop: 24 },
  previewLabel: { fontSize: 14, fontWeight: '600', color: '#6B7280', marginBottom: 12, textAlign: 'center' },
  previewBox: {
    backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB',
    borderStyle: 'dashed', borderRadius: 12, padding: 24,
    alignItems: 'center', justifyContent: 'center',
  },
  previewProductName: { fontSize: 12, fontWeight: 'normal', color: '#111827' },
  previewProductPrice: { fontSize: 16, fontWeight: 'bold', color: '#111827' },
  previewBarcodeText: { fontSize: 14, fontWeight: '600', color: '#111827', letterSpacing: 2, marginTop: 6 },

  // Bottom
  bottomBar: {
    padding: 16, backgroundColor: '#FFF',
    borderTopWidth: 1, borderTopColor: '#E5E7EB',
  },
  printBtn: {
    flexDirection: 'row', backgroundColor: '#1F2024', height: 56,
    borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  printBtnDisabled: { backgroundColor: '#9CA3AF' },
  printBtnText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});
