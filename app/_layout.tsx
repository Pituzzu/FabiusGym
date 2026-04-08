import { Stack } from 'expo-router';

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false, // Nasconde l'header per tutto il gruppo auth
      }}
    />
  );
}