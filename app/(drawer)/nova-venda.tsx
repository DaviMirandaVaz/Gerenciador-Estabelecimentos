import { useEffect } from 'react';
import { router } from 'expo-router';

export default function NovaVendaRedirect() {
  useEffect(() => {
    router.replace('/(drawer)/balcao');
  }, []);

  return null;
}
