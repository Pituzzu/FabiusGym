import { Redirect } from 'expo-router';

export default function Index() {
  // In futuro, qui controlleremo se l'utente esiste nel DB
  const isAuthenticated = false; 

  if (!isAuthenticated) {
    // Se non è autenticato, lo mandiamo al gruppo (auth)
    return <Redirect href="/(auth)/login" />;
  }

  // Se è autenticato, lo mandiamo alla dashboard
  return <Redirect href="/(tabs)" />;
}