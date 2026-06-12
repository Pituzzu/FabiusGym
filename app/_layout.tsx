import { Stack, useRouter, useSegments } from 'expo-router';
import { onAuthStateChanged, User } from 'firebase/auth';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { auth } from './config/firebaseConfig'; // Assicurati che il percorso sia corretto

export default function RootLayout() {
  const [utente, setUtente] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    // Questo ascoltatore "sente" se c'è un utente loggato nel browser/app
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUtente(user);
      setLoading(false);
    });

    return unsubscribe; // Pulizia quando chiudi l'app
  }, []);

  useEffect(() => {
    if (loading) return; // Non fare nulla finché Firebase non ha risposto

    // Capisce in quale "gruppo" di pagine si trova l'utente
    const inAuthGroup = segments[0] === '(auth)';
    const inViewScreen = segments[0] === '(auth)' && segments[1] === 'view';

    if (!utente && (!inAuthGroup || inViewScreen)) {
      // 1. NON LOGGATO e cerca di entrare nell'app -> lo spediamo al LOGIN
      router.replace('/(auth)/login');
    } else if (utente && inAuthGroup && !inViewScreen) {
      // 2. GIÀ LOGGATO e si trova nella pagina di login -> lo spediamo ai TABS
      router.replace('/(tabs)');
    }
  }, [utente, segments, loading]);

  // Mentre Firebase controlla la sessione, mostriamo una schermata nera con rotellina
  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' }}>
        <ActivityIndicator size="large" color="#229753" />
      </View>
    );
  }

  // Se tutto è ok, mostra le pagine (senza header, come piace a noi)
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
    </Stack>
  );
}
