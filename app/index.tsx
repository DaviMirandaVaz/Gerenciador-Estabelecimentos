import { useEffect } from 'react';
import { router } from 'expo-router';

export default function Index() {
  useEffect(() => {
    // Redireciona diretamente para a tela inicial (Sem Login / 100% Offline)
    router.replace('/(drawer)/home');
  }, []);

  return null;
}