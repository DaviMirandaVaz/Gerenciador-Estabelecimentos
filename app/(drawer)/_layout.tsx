import { Ionicons } from '@expo/vector-icons';
import { DrawerActions, useNavigation } from '@react-navigation/native';
import { DrawerContentScrollView, DrawerItemList } from '@react-navigation/drawer';
import { Drawer } from 'expo-router/drawer';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';

function DrawerMenuButton() {
  const navigation = useNavigation();
  return (
    <TouchableOpacity
      onPress={() => navigation.dispatch(DrawerActions.toggleDrawer())}
      style={{ paddingHorizontal: 16, paddingVertical: 8 }}
    >
      <Ionicons name="menu" size={26} color="#fff" />
    </TouchableOpacity>
  );
}

function CustomDrawerContent(props: any) {
  return (
    <View style={{ flex: 1 }}>
      <DrawerContentScrollView {...props}>
        <DrawerItemList {...props} />
      </DrawerContentScrollView>
      <View style={{ padding: 20, paddingBottom: 40, borderTopWidth: 1, borderTopColor: '#374151', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <View style={{ flex: 1 }} />
        <TouchableOpacity
          onPress={props.onOpenSettings}
          style={{ padding: 10 }}
        >
          <Ionicons name="settings-outline" size={24} color="#B8BDC9" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const SENHA_LIMPEZA = '20132013';

export default function DrawerLayout() {
  const db = useSQLiteContext();
  const [storeName, setStoreName] = useState('Nome do seu Comércio');
  const [isModalVisible, setModalVisible] = useState(false);
  const [tempName, setTempName] = useState('');

  // Estados para limpeza do banco
  const [confirmandoLimpeza, setConfirmandoLimpeza] = useState(false);
  const [limpando, setLimpando] = useState(false);
  const [senhaDigitada, setSenhaDigitada] = useState('');
  const [senhaErrada, setSenhaErrada] = useState(false);
  const shakeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const config = await db.getFirstAsync<{ storeName: string }>("SELECT storeName FROM configuracoes WHERE id = '1'");
        if (config?.storeName) {
          setStoreName(config.storeName);
        }
      } catch (e) {
        console.log('Error loading store name:', e);
      }
    };
    loadConfig();
  }, [db]);

  const saveStoreName = async () => {
    if (tempName.trim() !== '') {
      try {
        await db.runAsync("UPDATE configuracoes SET storeName = ? WHERE id = '1'", tempName.trim());
        setStoreName(tempName.trim());
      } catch (e) {
        console.log('Error saving store name:', e);
      }
    }
    setModalVisible(false);
  };

  const handleLimparDados = async () => {
    setLimpando(true);
    try {
      await db.execAsync('BEGIN TRANSACTION');
      await db.execAsync('DELETE FROM produtos');
      await db.execAsync('DELETE FROM movimentacoes');
      await db.execAsync('DELETE FROM mesas');
      await db.runAsync("UPDATE configuracoes SET storeName = 'Lanchonete' WHERE id = '1'");
      await db.execAsync('COMMIT');
      setStoreName('Lanchonete');
      setConfirmandoLimpeza(false);
      setSenhaDigitada('');
      setSenhaErrada(false);
      setModalVisible(false);
    } catch (e) {
      await db.execAsync('ROLLBACK');
      console.log('Erro ao limpar dados:', e);
    } finally {
      setLimpando(false);
    }
  };

  const triggerShake = () => {
    shakeAnim.setValue(0);
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 6, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -6, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
    ]).start();
  };

  const handleConfirmarSenha = () => {
    if (senhaDigitada === SENHA_LIMPEZA) {
      setSenhaErrada(false);
      handleLimparDados();
    } else {
      setSenhaErrada(true);
      setSenhaDigitada('');
      triggerShake();
    }
  };

  const handleFecharModal = () => {
    setModalVisible(false);
    setConfirmandoLimpeza(false);
    setSenhaDigitada('');
    setSenhaErrada(false);
  };

  return (
    <>
      <Drawer
        drawerContent={(props) => <CustomDrawerContent {...props} onOpenSettings={() => {
          setTempName(storeName);
          setConfirmandoLimpeza(false);
          setModalVisible(true);
        }} />}
        screenOptions={{
          headerLeft: () => <DrawerMenuButton />,
          headerStyle: {
            backgroundColor: '#000',
          },
          headerTintColor: '#fff',
          headerTitle: storeName,
          headerTitleAlign: 'center',
          headerTitleStyle: {
            fontWeight: 'bold',
            fontSize: 18,
          },
          drawerStyle: {
            backgroundColor: '#1F2937',
          },
          drawerActiveTintColor: '#FFF',
          drawerInactiveTintColor: '#B8BDC9',
        }}
      >
        <Drawer.Screen
          name="home"
          options={{
            drawerLabel: 'Início',
            drawerIcon: ({ color, size }) => <Ionicons name="home-outline" size={size} color={color} />
          }}
        />
        <Drawer.Screen
          name="mesas"
          options={{
            drawerLabel: 'Mesas',
            title: 'Gerenciar Mesas',
            drawerIcon: ({ color, size }) => <Ionicons name="restaurant-outline" size={size} color={color} />
          }}
        />
        <Drawer.Screen
          name="balcao"
          options={{
            drawerLabel: 'Venda de Balcão',
            title: 'Venda de Balcão',
            drawerIcon: ({ color, size }) => <Ionicons name="fast-food-outline" size={size} color={color} />
          }}
        />
        <Drawer.Screen name="nova-venda" options={{ drawerLabel: 'Nova Venda', drawerItemStyle: { display: 'none' } }} />
        <Drawer.Screen
          name="dashboard"
          options={{
            drawerLabel: 'Estoque',
            drawerIcon: ({ color, size }) => <Ionicons name="cube-outline" size={size} color={color} />
          }}
        />
        <Drawer.Screen
          name="estoque-detalhe"
          options={{
            drawerLabel: 'Insumos',
            title: 'Estoque Detalhado',
            drawerIcon: ({ color, size }) => <Ionicons name="nutrition-outline" size={size} color={color} />
          }}
        />
        <Drawer.Screen
          name="financeiro"
          options={{
            drawerLabel: 'Financeiro',
            drawerIcon: ({ color, size }) => <Ionicons name="cash-outline" size={size} color={color} />
          }}
        />
        <Drawer.Screen
          name="etiquetas"
          options={{
            drawerLabel: 'Etiquetas',
            drawerIcon: ({ color, size }) => <Ionicons name="barcode-outline" size={size} color={color} />
          }}
        />
        <Drawer.Screen name="nova-entrada" options={{ drawerLabel: 'Nova Entrada', drawerItemStyle: { display: 'none' } }} />
        <Drawer.Screen name="historico-financeiro" options={{ drawerLabel: 'Histórico Financeiro', drawerItemStyle: { display: 'none' }, title: 'Histórico Financeiro' }} />
      </Drawer>

      <Modal visible={isModalVisible} transparent={true} animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>

            {/* Título */}
            <View style={styles.modalHeader}>
              <Ionicons name="settings-outline" size={22} color="#1F2024" />
              <Text style={styles.modalTitle}>Configurações</Text>
            </View>

            {/* Nome do comércio */}
            <Text style={styles.sectionLabel}>Nome do Comércio</Text>
            <TextInput
              style={styles.modalInput}
              value={tempName}
              onChangeText={setTempName}
              placeholder="Digite o novo nome"
              placeholderTextColor="#8A8F9E"
              editable={!limpando}
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={handleFecharModal}
                disabled={limpando}
              >
                <Text style={styles.cancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.saveButton, limpando && { opacity: 0.6 }]}
                onPress={saveStoreName}
                disabled={limpando}
              >
                <Text style={styles.saveText}>Salvar</Text>
              </TouchableOpacity>
            </View>

            {/* Divisor */}
            <View style={styles.divider} />

            {/* Seção Limpar dados */}
            <Text style={styles.sectionLabel}>Zona de Perigo</Text>

            {!confirmandoLimpeza ? (
              <TouchableOpacity
                style={styles.dangerBtn}
                onPress={() => {
                  setConfirmandoLimpeza(true);
                  setSenhaDigitada('');
                  setSenhaErrada(false);
                }}
                disabled={limpando}
              >
                <Ionicons name="trash-outline" size={18} color="#DC2626" />
                <Text style={styles.dangerBtnText}>Limpar todos os dados</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.confirmBox}>
                {/* Ícone + aviso */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Ionicons name="warning-outline" size={20} color="#92400E" />
                  <Text style={[styles.confirmBoxText, { flex: 1 }]}>
                    Ação irreversível! Todos os produtos, vendas e movimentações serão apagados permanentemente.
                  </Text>
                </View>

                {/* Campo de senha */}
                <Text style={styles.senhaLabel}>Digite a senha para confirmar:</Text>
                <Animated.View style={{ transform: [{ translateX: shakeAnim }] }}>
                  <TextInput
                    style={[
                      styles.senhaInput,
                      senhaErrada && styles.senhaInputErrada,
                    ]}
                    value={senhaDigitada}
                    onChangeText={(t) => {
                      setSenhaDigitada(t);
                      if (senhaErrada) setSenhaErrada(false);
                    }}
                    placeholder="••••••••"
                    placeholderTextColor="#9CA3AF"
                    secureTextEntry
                    keyboardType="numeric"
                    editable={!limpando}
                    maxLength={20}
                  />
                </Animated.View>

                {/* Mensagem de erro */}
                {senhaErrada && (
                  <View style={styles.erroContainer}>
                    <Ionicons name="close-circle" size={14} color="#DC2626" />
                    <Text style={styles.erroText}>Senha incorreta. Tente novamente.</Text>
                  </View>
                )}

                {/* Botões */}
                <View style={styles.confirmBoxBtns}>
                  <TouchableOpacity
                    style={styles.confirmCancelBtn}
                    onPress={() => {
                      setConfirmandoLimpeza(false);
                      setSenhaDigitada('');
                      setSenhaErrada(false);
                    }}
                    disabled={limpando}
                  >
                    <Text style={styles.confirmCancelText}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.confirmDeleteBtn, limpando && { opacity: 0.6 }]}
                    onPress={handleConfirmarSenha}
                    disabled={limpando}
                  >
                    {limpando ? (
                      <ActivityIndicator color="#FFF" size="small" />
                    ) : (
                      <Text style={styles.confirmDeleteText}>Confirmar</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            )}

          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center'
  },
  modalContent: {
    width: '85%',
    maxWidth: 420,
    backgroundColor: '#FFF',
    padding: 24,
    borderRadius: 20,
    elevation: 10,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 }
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#000'
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
    color: '#000',
    fontSize: 16
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginBottom: 4,
  },
  modalButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10
  },
  cancelButton: {
    backgroundColor: '#F3F4F6'
  },
  saveButton: {
    backgroundColor: '#1E1E1E'
  },
  cancelText: {
    color: '#374151',
    fontWeight: 'bold',
    fontSize: 15
  },
  saveText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 15
  },
  divider: {
    height: 1,
    backgroundColor: '#F3F4F6',
    marginVertical: 20,
  },
  dangerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1.5,
    borderColor: '#FECACA',
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
    padding: 14,
  },
  dangerBtnText: {
    color: '#DC2626',
    fontWeight: '600',
    fontSize: 15,
  },
  confirmBox: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1.5,
    borderColor: '#FCD34D',
    borderRadius: 12,
    padding: 14,
    gap: 10,
  },
  confirmBoxText: {
    fontSize: 13,
    color: '#78350F',
    lineHeight: 18,
  },
  confirmBoxBtns: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'flex-end',
  },
  confirmCancelBtn: {
    paddingVertical: 9,
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
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#DC2626',
    minWidth: 110,
    alignItems: 'center',
  },
  confirmDeleteText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 13,
  },
  senhaLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#78350F',
    marginTop: 4,
    marginBottom: 6,
  },
  senhaInput: {
    borderWidth: 1.5,
    borderColor: '#D1D5DB',
    backgroundColor: '#FFF',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
    color: '#1F2937',
    letterSpacing: 4,
  },
  senhaInputErrada: {
    borderColor: '#DC2626',
    backgroundColor: '#FEF2F2',
  },
  erroContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 4,
  },
  erroText: {
    fontSize: 12,
    color: '#DC2626',
    fontWeight: '500',
  },
});
