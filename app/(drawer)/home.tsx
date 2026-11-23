import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform, SafeAreaView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';

interface DashboardStats {
  vendasHoje: number;
  mesasAbertas: number;
  saldoHoje: number;
}

interface Alerta {
  id: string;
  mensagem: string;
  tipo: 'critico' | 'aviso' | 'info';
}

export default function Home() {
  const db = useSQLiteContext();
  const [storeName, setStoreName] = useState('🍔 Lanchonete');
  const [stats, setStats] = useState<DashboardStats>({
    vendasHoje: 0,
    mesasAbertas: 0,
    saldoHoje: 0,
  });
  const [alertas, setAlertas] = useState<Alerta[]>([]);

  const loadData = useCallback(async () => {
    try {
      // Configurações
      const configRes = await db.getAllAsync<{ storeName: string }>(
        `SELECT storeName FROM configuracoes WHERE id = '1'`
      );
      if (configRes && configRes.length > 0 && configRes[0].storeName) {
        setStoreName(configRes[0].storeName);
      }

      // Vendas Hoje e Saldo Hoje
      const vendasRes = await db.getAllAsync<{ entradas: number, saidas: number }>(`
        SELECT 
          COALESCE(SUM(CASE WHEN tipo = 'entrada' THEN valorTotal ELSE 0 END), 0) as entradas,
          COALESCE(SUM(CASE WHEN tipo = 'saida' THEN valorTotal ELSE 0 END), 0) as saidas
        FROM movimentacoes 
        WHERE date(data/1000, 'unixepoch', 'localtime') = date('now', 'localtime')
      `);
      
      const entradas = vendasRes[0]?.entradas || 0;
      const saidas = vendasRes[0]?.saidas || 0;

      // Mesas Abertas
      const mesasRes = await db.getAllAsync<{ count: number }>(`
        SELECT COUNT(*) as count FROM mesas WHERE status='ocupada'
      `);
      
      const mesasCount = mesasRes[0]?.count || 0;

      setStats({
        vendasHoje: entradas,
        mesasAbertas: mesasCount,
        saldoHoje: entradas - saidas,
      });

      // Alertas
      const newAlertas: Alerta[] = [];

      // Produtos sem estoque
      const produtosRes = await db.getAllAsync<{ id: string, nome: string }>(`
        SELECT id, nome FROM produtos WHERE tipo = 'produto' AND quantidade <= 0
      `);
      produtosRes.forEach(p => {
        newAlertas.push({
          id: `p-${p.id}`,
          mensagem: `⚠️ ${p.nome}: Estoque zerado!`,
          tipo: 'critico'
        });
      });

      // Insumos baixos
      const insumosRes = await db.getAllAsync<{ id: string, nome: string, quantidade: number }>(`
        SELECT id, nome, quantidade FROM produtos WHERE tipo = 'insumo' AND quantidade < 5
      `);
      insumosRes.forEach(i => {
        newAlertas.push({
          id: `i-${i.id}`,
          mensagem: `🧅 ${i.nome}: Apenas ${i.quantidade} un.`,
          tipo: 'aviso'
        });
      });

      // Contas a Pagar Pendentes
      const pagarRes = await db.getAllAsync<{ count: number, total: number }>(`
        SELECT COUNT(*) as count, COALESCE(SUM(valorTotal), 0) as total 
        FROM movimentacoes 
        WHERE status = 'pendente' AND tipo = 'saida'
      `);
      if (pagarRes[0] && pagarRes[0].count > 0) {
        const count = pagarRes[0].count;
        const total = pagarRes[0].total;
        newAlertas.push({
          id: 'pagar',
          mensagem: `🔴 ${count} ${count === 1 ? 'conta a pagar pendente' : 'contas a pagar pendentes'} (R$ ${total.toFixed(2).replace('.', ',')})`,
          tipo: 'critico'
        });
      }

      // Contas a Receber Pendentes
      const receberRes = await db.getAllAsync<{ count: number, total: number }>(`
        SELECT COUNT(*) as count, COALESCE(SUM(valorTotal), 0) as total 
        FROM movimentacoes 
        WHERE status = 'pendente' AND tipo = 'entrada'
      `);
      if (receberRes[0] && receberRes[0].count > 0) {
        const count = receberRes[0].count;
        const total = receberRes[0].total;
        newAlertas.push({
          id: 'receber',
          mensagem: `💳 ${count} ${count === 1 ? 'pagamento a receber' : 'pagamentos a receber'} (R$ ${total.toFixed(2).replace('.', ',')})`,
          tipo: 'info'
        });
      }

      setAlertas(newAlertas);

    } catch (error) {
      console.error("Erro ao carregar dados da Home:", error);
    }
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const dataAtual = new Intl.DateTimeFormat('pt-BR', { 
    weekday: 'long', 
    day: 'numeric', 
    month: 'long', 
    year: 'numeric' 
  }).format(new Date());

  const capitalizeData = (str: string) => {
    return str.charAt(0).toUpperCase() + str.slice(1);
  };

  const formatCurrency = (value: number) => {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {/* 1. Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{storeName}</Text>
          <Text style={styles.headerSubtitle}>{capitalizeData(dataAtual)}</Text>
        </View>

        {/* 2. Stats Cards Row */}
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Ionicons name="trending-up" size={24} color="#16A34A" />
            <Text style={[styles.statValue, { color: '#16A34A' }]} adjustsFontSizeToFit numberOfLines={1}>{formatCurrency(stats.vendasHoje)}</Text>
            <Text style={styles.statLabel}>Vendas Hoje</Text>
          </View>

          <View style={styles.statCard}>
            <Ionicons name="restaurant" size={24} color="#DC2626" />
            <Text style={[styles.statValue, { color: '#DC2626' }]} adjustsFontSizeToFit numberOfLines={1}>{stats.mesasAbertas}</Text>
            <Text style={styles.statLabel}>Mesas Abertas</Text>
          </View>

          <View style={styles.statCard}>
            <Ionicons name="wallet" size={24} color="#2563EB" />
            <Text style={[styles.statValue, { color: '#2563EB' }]} adjustsFontSizeToFit numberOfLines={1}>{formatCurrency(stats.saldoHoje)}</Text>
            <Text style={styles.statLabel}>Saldo Hoje</Text>
          </View>
        </View>

        {/* 3. Atendimento Section */}
        <Text style={styles.sectionTitle}>ATENDIMENTO</Text>
        <View style={styles.atendimentoRow}>
          <TouchableOpacity
            style={[styles.atendimentoCard, { borderLeftColor: '#DC2626' }]}
            onPress={() => router.push('/(drawer)/mesas')}
            activeOpacity={0.8}
          >
            <View style={[styles.iconCircle, { backgroundColor: '#FEE2E2' }]}>
              <Text style={{ fontSize: 24 }}>🍽️</Text>
            </View>
            <Text style={styles.atendimentoTitle}>Mesas</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.atendimentoCard, { borderLeftColor: '#16A34A' }]}
            onPress={() => router.push('/(drawer)/balcao')}
            activeOpacity={0.8}
          >
            <View style={[styles.iconCircle, { backgroundColor: '#DCFCE7' }]}>
              <Text style={{ fontSize: 24 }}>🛒</Text>
            </View>
            <Text style={styles.atendimentoTitle}>Balcão</Text>
          </TouchableOpacity>
        </View>

        {/* 4. Gestão Section */}
        <Text style={styles.sectionTitle}>GESTÃO</Text>
        <View style={styles.gestaoGrid}>
          <TouchableOpacity style={styles.gestaoCard} onPress={() => router.push('/(drawer)/dashboard')}>
            <Text style={styles.gestaoIcon}>📦</Text>
            <Text style={styles.gestaoTitle}>Estoque</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.gestaoCard} onPress={() => router.push('/(drawer)/estoque-detalhe?filtro=insumos')}>
            <Text style={styles.gestaoIcon}>🧅</Text>
            <Text style={styles.gestaoTitle}>Insumos</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.gestaoCard} onPress={() => router.push('/(drawer)/financeiro')}>
            <Text style={styles.gestaoIcon}>💰</Text>
            <Text style={styles.gestaoTitle}>Financeiro</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.gestaoCard} onPress={() => router.push('/(drawer)/etiquetas')}>
            <Text style={styles.gestaoIcon}>🏷️</Text>
            <Text style={styles.gestaoTitle}>Etiquetas</Text>
          </TouchableOpacity>
        </View>

        {/* 5. Alertas Section */}
        <Text style={styles.sectionTitle}>⚠️ ALERTAS</Text>
        <View style={styles.alertasContainer}>
          {alertas.length === 0 ? (
            <View style={[styles.alertaCard, { borderLeftColor: '#16A34A' }]}>
              <Text style={styles.alertaText}>✅ Tudo certo! Nenhum alerta no momento.</Text>
            </View>
          ) : (
            alertas.map(alerta => {
              let borderColor = '#3B82F6';
              if (alerta.tipo === 'critico') borderColor = '#DC2626';
              else if (alerta.tipo === 'aviso') borderColor = '#EAB308';
              
              return (
                <View key={alerta.id} style={[styles.alertaCard, { borderLeftColor: borderColor }]}>
                  <Text style={styles.alertaText}>{alerta.mensagem}</Text>
                </View>
              );
            })
          )}
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    paddingTop: Platform.OS === 'android' ? 24 : 0,
  },
  container: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    marginBottom: 24,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#111827',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#9CA3AF',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 12,
    marginTop: 24,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  statValue: {
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 8,
    marginBottom: 4,
    textAlign: 'center',
  },
  statLabel: {
    fontSize: 11,
    color: '#6B7280',
    fontWeight: '500',
    textAlign: 'center',
  },
  atendimentoRow: {
    flexDirection: 'row',
    gap: 16,
  },
  atendimentoCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    borderLeftWidth: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  atendimentoTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
  },
  gestaoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'space-between',
  },
  gestaoCard: {
    width: '48%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  gestaoIcon: {
    fontSize: 28,
    marginBottom: 8,
  },
  gestaoTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#374151',
  },
  alertasContainer: {
    gap: 10,
  },
  alertaCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  alertaText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
});
